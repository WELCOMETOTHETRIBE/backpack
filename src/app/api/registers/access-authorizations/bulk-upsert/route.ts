import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  controlRecords,
} from "@/db/schema";
import { evidenceRuns } from "../../../../../../drizzle/schema.evidence";
import { eq, and, sql } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { calculateControlStatus } from "@/lib/control-status";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { createHash } from "crypto";

/**
 * POST /api/registers/access-authorizations/bulk-upsert
 *
 * EnclaveWatch's azure_role_assignment_events collector posts batches
 * of Azure Activity Log role-assignment events filtered to the vault's
 * resource group scope. Each event becomes a register entry on
 * access_authorization:
 *   operation="grant"  -> entry_type="grant_access"
 *   operation="revoke" -> entry_type="remove_access"
 *
 * Idempotent on event_id (Azure Activity Log eventDataId): re-uploading
 * the same event after a crash/retry replaces, doesn't duplicate.
 *
 * After the upsert, recomputes 3.5.1 + 3.1.5 + 3.1.6 status. With the
 * inventory snapshot AND the per-event grant/revoke history both
 * populated, the codex's adjudication helper promotes these from
 * in_progress to implemented.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 */

type AzureRoleEvent = {
  event_id: string;
  operation: "grant" | "revoke";
  occurred_at: string;
  principal: {
    id: string;
    type?: "User" | "ServicePrincipal" | "Group";
    display_name?: string;
  };
  role: {
    id?: string;
    name?: string;
  };
  scope?: string;
  scope_display?: string;
  actor?: {
    id?: string;
    type?: "User" | "ServicePrincipal";
    display_name?: string;
  };
  raw_correlation_id?: string;
};

type Body = {
  source?: string;
  collected_at?: string;
  vault_id?: string;
  scope?: {
    subscription_id?: string;
    resource_group?: string;
    tenant_id?: string;
  };
  events?: AzureRoleEvent[];
  collector_version?: string;
};

const FORBIDDEN_RAW_KEYS = [
  "raw_event_xml",
  "raw_event_body",
  "command_line",
  "raw_command_line",
  "password",
  "secret",
  "private_key",
];

function findForbiddenKey(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenKey(value[i], [...path, `[${i}]`]);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_RAW_KEYS.includes(k.toLowerCase())) {
      return [...path, k].join(".");
    }
    const found = findForbiddenKey(obj[k], [...path, k]);
    if (found) return found;
  }
  return null;
}

/**
 * Map an Azure role name to the schema's `requested_role` enum. Schema
 * enum is application-level abstractions (viewer/standard_user/etc),
 * Azure ships canonical names like Reader/Owner/Contributor. We map
 * approximately and store the verbatim Azure role name alongside as
 * `azure_role_name` so no information is lost.
 */
function mapAzureRoleToSchemaEnum(azureRoleName: string | undefined): string {
  if (!azureRoleName) return "custom";
  const lower = azureRoleName.toLowerCase();
  if (lower === "reader") return "viewer";
  if (lower === "owner" || lower === "contributor" || lower === "user access administrator") {
    return "privileged_admin";
  }
  if (lower === "logic app contributor" || lower === "monitoring reader") return "viewer";
  return "custom";
}

export async function POST(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = ctx.orgId;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const forbidden = findForbiddenKey(body);
  if (forbidden) {
    return NextResponse.json(
      { error: `Payload contains forbidden key at "${forbidden}"`, code: "FORBIDDEN_KEY_REJECTED" },
      { status: 400 },
    );
  }

  if (!body.source || !body.collected_at || !body.vault_id) {
    return NextResponse.json(
      { error: "source, collected_at, vault_id are required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.events)) {
    return NextResponse.json(
      { error: "events must be an array (empty is fine for cadence-only runs)" },
      { status: 400 },
    );
  }

  // Resolve org's primary boundary + access_authorization register.
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) return NextResponse.json({ error: "No boundary for org" }, { status: 400 });

  const candidates = resolveRegisterKeyCandidates("access_authorization");
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (!register) {
    return NextResponse.json(
      { error: "access_authorization register not provisioned for org" },
      { status: 400 },
    );
  }

  // Pull existing entries that came from Azure events so we can dedupe
  // by event_id. Hand-entered grant/remove rows (no event_id) are left
  // alone — only Azure-sourced entries are replaceable.
  const existing = await db
    .select({
      id: governanceRegisterEntries.id,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        sql`${governanceRegisterEntries.entryData} ? 'event_id'`,
      ),
    );
  const byEventId = new Map<string, string>();
  for (const e of existing) {
    const d = (e.entryData ?? {}) as Record<string, unknown>;
    if (typeof d.event_id === "string" && d.event_id) byEventId.set(d.event_id, e.id);
  }

  const now = new Date();
  let inserted = 0;
  let updated = 0;
  let granted = 0;
  let revoked = 0;

  for (const ev of body.events) {
    if (!ev.event_id || !ev.occurred_at) continue;
    if (ev.operation !== "grant" && ev.operation !== "revoke") continue;

    const principalDisplay = ev.principal?.display_name ?? ev.principal?.id ?? "(unknown)";
    const actorDisplay = ev.actor?.display_name ?? ev.actor?.id ?? "(unknown)";
    const systemDisplay = ev.scope_display ?? ev.scope ?? "(unknown scope)";
    const azureRoleName = ev.role?.name ?? "(unknown role)";
    const schemaRole = mapAzureRoleToSchemaEnum(ev.role?.name);

    let entryType: "grant_access" | "remove_access";
    let entryData: Record<string, unknown>;

    if (ev.operation === "grant") {
      entryType = "grant_access";
      entryData = {
        // Schema-required fields for grant_access
        subject_user: principalDisplay,
        system: systemDisplay,
        requested_role: schemaRole,
        approver: actorDisplay,
        approved_at: ev.occurred_at,
        justification:
          "Recorded automatically from Azure Activity Log role assignment write event. Justification not captured in the event itself; check the originating ticket or PIM activation if present.",
        // Schema-optional fields
        access_method: "entra_id",
        // Azure-specific extension fields (preserved for audit traceability)
        event_id: ev.event_id,
        operation: "grant",
        azure_role_name: azureRoleName,
        azure_role_id: ev.role?.id ?? null,
        principal_id: ev.principal?.id ?? null,
        principal_type: ev.principal?.type ?? null,
        actor_id: ev.actor?.id ?? null,
        actor_type: ev.actor?.type ?? null,
        scope_arm: ev.scope ?? null,
        raw_correlation_id: ev.raw_correlation_id ?? null,
        source: body.source,
        vault_id: body.vault_id,
      };
      granted++;
    } else {
      entryType = "remove_access";
      entryData = {
        // Schema-required fields for remove_access
        subject_user: principalDisplay,
        system: systemDisplay,
        removed_at: ev.occurred_at,
        removed_by: actorDisplay,
        reason: "role_change",
        // Schema-optional
        notes: `Azure Activity Log role assignment delete; role=${azureRoleName}`,
        // Azure-specific extension fields
        event_id: ev.event_id,
        operation: "revoke",
        azure_role_name: azureRoleName,
        azure_role_id: ev.role?.id ?? null,
        principal_id: ev.principal?.id ?? null,
        principal_type: ev.principal?.type ?? null,
        actor_id: ev.actor?.id ?? null,
        actor_type: ev.actor?.type ?? null,
        scope_arm: ev.scope ?? null,
        raw_correlation_id: ev.raw_correlation_id ?? null,
        source: body.source,
        vault_id: body.vault_id,
      };
      revoked++;
    }

    const existingId = byEventId.get(ev.event_id);
    if (existingId) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          status: "final",
          finalizedAt: now,
          entryType,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existingId));
      updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryData,
        entryType,
        status: "final",
        finalizedAt: now,
      });
      inserted++;
    }
  }

  // Cadence evidence run — one row per batch, regardless of event count.
  // A 0-event batch IS evidence: it proves the collector ran and there
  // were no role changes that cycle.
  const fingerprint = createHash("sha256")
    .update(
      `azure_role_assignment_events|${body.vault_id ?? ""}|${body.collected_at ?? ""}`,
    )
    .digest("hex");
  const runId = `RoleEvents-${(body.collected_at ?? new Date().toISOString()).slice(0, 10)}-${(body.vault_id ?? "unknown").slice(0, 24)}`;

  await db
    .delete(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.runFingerprint, fingerprint),
      ),
    );
  await db.insert(evidenceRuns).values({
    organizationId: orgId,
    systemId: boundary.id,
    runId,
    collectedAt: new Date(body.collected_at ?? new Date().toISOString()),
    collectorName: "azure_role_assignment_events",
    collectorVersion: body.collector_version ?? "azure_role_assignment_events",
    bundleRoot: `azure_role_events://${body.vault_id ?? ""}`,
    manifest: {
      vault_id: body.vault_id,
      scope: body.scope ?? null,
      event_count: body.events.length,
      grants: granted,
      revokes: revoked,
      inserted,
      updated,
      collector_version: body.collector_version ?? null,
    } as Record<string, unknown>,
    hashAlgorithm: "sha256",
    source: "azure_role_assignment_events",
    boundaryId: boundary.id,
    runFingerprint: fingerprint,
  });

  // Recompute the three controls this register backs.
  let recomputed = 0;
  for (const cid of ["3.5.1", "3.1.5", "3.1.6"]) {
    const [rec] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, cid)))
      .limit(1);
    if (rec) {
      await calculateControlStatus(rec.id).catch(() => null);
      recomputed++;
    }
  }

  console.log(
    JSON.stringify({
      event: "access_authorizations_bulk_upsert",
      orgId,
      vaultId: body.vault_id,
      collectedAt: body.collected_at,
      events: body.events.length,
      granted,
      revoked,
      inserted,
      updated,
      recomputed,
    }),
  );

  return NextResponse.json({
    ok: true,
    register_id: register.id,
    fingerprint,
    events_processed: body.events.length,
    granted,
    revoked,
    inserted,
    updated,
    recomputed_controls: recomputed,
  });
}
