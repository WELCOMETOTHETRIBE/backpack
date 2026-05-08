import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  controlRecords,
} from "@/db/schema";
import { evidenceRuns } from "../../../../../../drizzle/schema.evidence";
import { eq, and, desc, sql } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { calculateControlStatus } from "@/lib/control-status";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { createHash } from "crypto";

/**
 * POST /api/registers/identity-inventory/snapshot
 *
 * EnclaveWatch's azure_identity_inventory collector POSTs one snapshot
 * per weekly cadence cycle. Each snapshot is a full point-in-time
 * inventory of every user, service principal/managed identity, and
 * device with vault scope. The codex stores it as a register entry
 * (status=final), computes a diff vs the prior snapshot, and writes
 * an evidenceRuns row so the cadence freshness pill stays green.
 *
 * Idempotent on (vault_id, collected_at): re-uploading the same
 * cadence run replaces the prior matching row instead of creating a
 * duplicate.
 *
 * After the upsert, recomputes 3.5.1 + 3.5.6 + 3.1.5 + 3.1.6 status
 * so adjudication reflects the new evidence.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 */

type Identity = Record<string, unknown>;

type Body = {
  source?: string; // "azure_identity_inventory"
  collected_at?: string;
  vault_id?: string;
  scope?: {
    subscription_id?: string;
    resource_group?: string;
    tenant_id?: string;
  };
  users?: Identity[];
  service_principals?: Identity[];
  devices?: Identity[];
  graph_api_roles_granted?: string[];
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
 * Build a stable ID set for diffing two snapshots. Uses object_id for
 * users + SPs, vm_id for devices.
 */
function idSet(items: Identity[] | undefined, idField: string): Set<string> {
  if (!Array.isArray(items)) return new Set();
  const set = new Set<string>();
  for (const it of items) {
    const id = it?.[idField];
    if (typeof id === "string" && id) set.add(id);
  }
  return set;
}

function diffSets(prev: Set<string>, next: Set<string>) {
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of next) if (!prev.has(id)) added.push(id);
  for (const id of prev) if (!next.has(id)) removed.push(id);
  return { added, removed };
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

  // Defense-in-depth: scrub any forbidden raw-payload keys (tokens, secrets,
  // raw event payloads) before the body lands in entryData.
  const forbidden = findForbiddenKey(body);
  if (forbidden) {
    return NextResponse.json(
      {
        error: `Payload contains forbidden key at "${forbidden}"`,
        code: "FORBIDDEN_KEY_REJECTED",
      },
      { status: 400 },
    );
  }

  if (!body.source || !body.collected_at || !body.vault_id) {
    return NextResponse.json(
      { error: "source, collected_at, vault_id are required" },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(body.users) ||
    !Array.isArray(body.service_principals) ||
    !Array.isArray(body.devices)
  ) {
    return NextResponse.json(
      { error: "users, service_principals, devices must each be arrays (empty is fine)" },
      { status: 400 },
    );
  }

  // Resolve the org's primary boundary + the identity_inventory register.
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) return NextResponse.json({ error: "No boundary for org" }, { status: 400 });

  const candidates = resolveRegisterKeyCandidates("identity_inventory");
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
      { error: "identity_inventory register not provisioned for org" },
      { status: 400 },
    );
  }

  // Pull the most recent prior snapshot to compute deltas.
  const [prior] = await db
    .select({ entryData: governanceRegisterEntries.entryData })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        eq(governanceRegisterEntries.entryType, "inventory_snapshot"),
      ),
    )
    .orderBy(desc(governanceRegisterEntries.finalizedAt))
    .limit(1);

  const priorData = (prior?.entryData ?? {}) as Record<string, unknown>;
  const priorUsers = idSet(priorData.users as Identity[] | undefined, "object_id");
  const priorSps = idSet(priorData.service_principals as Identity[] | undefined, "object_id");
  const priorDevices = idSet(priorData.devices as Identity[] | undefined, "vm_id");

  const nextUsers = idSet(body.users, "object_id");
  const nextSps = idSet(body.service_principals, "object_id");
  const nextDevices = idSet(body.devices, "vm_id");

  const userDiff = diffSets(priorUsers, nextUsers);
  const spDiff = diffSets(priorSps, nextSps);
  const deviceDiff = diffSets(priorDevices, nextDevices);
  const hasPrior = !!prior;

  // Stable snapshot id for idempotency: hash of (vault_id, collected_at).
  const snapshotId = `INV-${body.collected_at.slice(0, 10).replace(/-/g, "")}-${(body.vault_id ?? "unknown").slice(0, 24)}`;
  const fingerprint = createHash("sha256")
    .update(
      `azure_identity_inventory|${body.vault_id ?? ""}|${body.collected_at ?? ""}`,
    )
    .digest("hex");

  const totals = {
    user_count: body.users.length,
    service_principal_count: body.service_principals.length,
    device_count: body.devices.length,
  };

  const entryData: Record<string, unknown> = {
    snapshot_id: snapshotId,
    source: body.source,
    collected_at: body.collected_at,
    vault_id: body.vault_id,
    scope: body.scope ?? null,
    users: body.users,
    service_principals: body.service_principals,
    devices: body.devices,
    totals,
    diff_from_previous: hasPrior
      ? {
          users_added: userDiff.added,
          users_removed: userDiff.removed,
          service_principals_added: spDiff.added,
          service_principals_removed: spDiff.removed,
          devices_added: deviceDiff.added,
          devices_removed: deviceDiff.removed,
        }
      : null,
    graph_api_roles_granted: body.graph_api_roles_granted ?? [],
    collector_version: body.collector_version ?? null,
  };

  // Idempotent: same (vault_id, collected_at) overwrites instead of duplicating.
  // Match on the snapshot_id we just computed.
  const [existingMatch] = await db
    .select({ id: governanceRegisterEntries.id })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        eq(governanceRegisterEntries.entryType, "inventory_snapshot"),
        sql`${governanceRegisterEntries.entryData} ->> 'snapshot_id' = ${snapshotId}`,
      ),
    )
    .limit(1);

  const now = new Date();
  let entryId: string;
  if (existingMatch) {
    await db
      .update(governanceRegisterEntries)
      .set({
        entryData,
        status: "final",
        finalizedAt: now,
        updatedAt: now,
      })
      .where(eq(governanceRegisterEntries.id, existingMatch.id));
    entryId = existingMatch.id;
  } else {
    const inserted = await db
      .insert(governanceRegisterEntries)
      .values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryData,
        entryType: "inventory_snapshot",
        status: "final",
        finalizedAt: now,
      })
      .returning({ id: governanceRegisterEntries.id });
    entryId = inserted[0].id;
  }

  // Cadence evidence run: one row per snapshot, regardless of diff size.
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
    runId: snapshotId,
    collectedAt: new Date(body.collected_at),
    collectorName: "azure_identity_inventory",
    collectorVersion: body.collector_version ?? "azure_identity_inventory",
    bundleRoot: `azure_identity_inventory://${body.vault_id ?? ""}`,
    manifest: {
      vault_id: body.vault_id,
      scope: body.scope ?? null,
      totals,
      diff_summary: hasPrior
        ? {
            users_changed: userDiff.added.length + userDiff.removed.length,
            sps_changed: spDiff.added.length + spDiff.removed.length,
            devices_changed: deviceDiff.added.length + deviceDiff.removed.length,
          }
        : null,
      graph_api_roles_granted: body.graph_api_roles_granted ?? [],
      collector_version: body.collector_version ?? null,
    } as Record<string, unknown>,
    hashAlgorithm: "sha256",
    source: "azure_identity_inventory",
    boundaryId: boundary.id,
    runFingerprint: fingerprint,
  });

  // Recompute control status for the controls this register backs.
  let recomputed = 0;
  for (const cid of ["3.5.1", "3.5.6", "3.1.5", "3.1.6"]) {
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
      event: "identity_inventory_snapshot_ingested",
      orgId,
      vaultId: body.vault_id,
      collectedAt: body.collected_at,
      totals,
      diff: hasPrior
        ? {
            users: userDiff.added.length + userDiff.removed.length,
            sps: spDiff.added.length + spDiff.removed.length,
            devices: deviceDiff.added.length + deviceDiff.removed.length,
          }
        : "first_snapshot",
      recomputed,
    }),
  );

  return NextResponse.json({
    ok: true,
    register_id: register.id,
    entry_id: entryId,
    snapshot_id: snapshotId,
    fingerprint,
    totals,
    diff: entryData.diff_from_previous,
    recomputed_controls: recomputed,
  });
}
