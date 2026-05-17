import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  controlRecords,
} from "@/db/schema";
import { evidenceRuns } from "../../../../../../drizzle/schema.evidence";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { calculateControlStatus } from "@/lib/control-status";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { createHash } from "crypto";

/**
 * POST /api/registers/maintenance-log/bastion-session
 *
 * EnclaveWatch's azure_bastion collector POSTs completed Bastion sessions
 * for automatic maintenance_log entries. Each session becomes one
 * remote_maintenance_session register entry, satisfying CMMC 3.7.5
 * (non-local maintenance supervised/authenticated).
 *
 * Idempotent on session_id: re-uploading the same session after a retry
 * upserts the existing entry instead of creating a duplicate.
 *
 * Body shape:
 *   {
 *     "source": "azure_bastion",
 *     "collected_at": "2026-05-17T10:00:00Z",
 *     "vault_id": "VAULT-001",
 *     "sessions": [
 *       {
 *         "session_id": "bastion-12345",          // Azure Activity Log correlationId
 *         "start_utc": "2026-05-17T09:00:00Z",
 *         "end_utc":   "2026-05-17T09:45:00Z",
 *         "target_machine": "cui-win-pilot-01",   // hostName from Bastion diagnostics
 *         "user_principal": "alice@contoso.com",  // Azure AD UPN
 *         "session_type": "RDP" | "SSH",          // optional
 *         "purpose": "Patch KB5012345"            // optional annotation
 *       }
 *     ],
 *     "collector_version": "0.1.0"
 *   }
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 */

type BastionSession = {
  session_id: string;
  start_utc: string;
  end_utc?: string | null;
  target_machine: string;
  user_principal: string;
  session_type?: string;
  purpose?: string;
};

type Body = {
  source?: string;
  collected_at?: string;
  vault_id?: string;
  sessions?: BastionSession[];
  collector_version?: string;
};

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

  if (!body.collected_at || !body.vault_id) {
    return NextResponse.json(
      { error: "collected_at, vault_id are required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.sessions) || body.sessions.length === 0) {
    return NextResponse.json(
      { error: "sessions must be a non-empty array" },
      { status: 400 },
    );
  }

  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) return NextResponse.json({ error: "No boundary for org" }, { status: 400 });

  // Resolve maintenance_log register (org row preferred over template).
  const candidates = resolveRegisterKeyCandidates("maintenance_log");
  const allRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey, organizationId: governanceRegisters.organizationId })
    .from(governanceRegisters)
    .where(
      and(
        sql`${governanceRegisters.registerKey} IN (${sql.join(candidates.map((k) => sql`${k}`), sql`, `)})`,
        or(eq(governanceRegisters.organizationId, orgId), isNull(governanceRegisters.organizationId))
      )
    );

  let register: { id: string } | undefined;
  for (const k of candidates) {
    const orgHit = allRegisters.find((r) => r.registerKey === k && r.organizationId !== null);
    const tplHit = allRegisters.find((r) => r.registerKey === k && r.organizationId === null);
    if (orgHit) { register = orgHit; break; }
    if (tplHit && !register) register = tplHit;
  }
  if (!register) {
    return NextResponse.json(
      { error: "maintenance_log register not provisioned for org" },
      { status: 400 },
    );
  }

  const collectedAt = new Date(body.collected_at);
  const results: { session_id: string; action: "created" | "updated" }[] = [];

  for (const session of body.sessions) {
    if (!session.session_id || !session.start_utc || !session.target_machine || !session.user_principal) {
      continue;
    }

    const entryData = {
      lifecycle_state: "auto_recorded",
      source: body.source ?? "azure_bastion",
      vault_id: body.vault_id,
      session_id: session.session_id,
      system: session.target_machine,
      session_start: session.start_utc,
      session_end: session.end_utc ?? null,
      technician: session.user_principal,
      access_method: "bastion",
      supervised_by: "azure_bastion_enforced",
      session_type: session.session_type ?? null,
      purpose: session.purpose ?? null,
      collector_version: body.collector_version ?? null,
      note: `Azure Bastion session by ${session.user_principal} on ${session.target_machine}${session.purpose ? ` — ${session.purpose}` : ""}`,
    };

    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, register.id),
          sql`${governanceRegisterEntries.entryData}->>'session_id' = ${session.session_id}`
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({ entryData, updatedAt: new Date() })
        .where(eq(governanceRegisterEntries.id, existing.id));
      results.push({ session_id: session.session_id, action: "updated" });
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryType: "remote_maintenance_session",
        status: "final",
        finalizedAt: new Date(session.start_utc),
        exportable: true,
        entryData,
      });
      results.push({ session_id: session.session_id, action: "created" });
    }
  }

  // Evidence run for cadence freshness tracking.
  const batchFingerprint = createHash("sha256")
    .update(`azure_bastion|${body.vault_id}|${body.collected_at}`)
    .digest("hex");

  await db
    .delete(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.runFingerprint, batchFingerprint)
      )
    );
  await db.insert(evidenceRuns).values({
    organizationId: orgId,
    systemId: boundary.id,
    runId: `BASTION-${body.collected_at.slice(0, 10).replace(/-/g, "")}-${body.vault_id}`,
    collectedAt,
    collectorName: "azure_bastion",
    collectorVersion: body.collector_version ?? "azure_bastion",
    bundleRoot: `azure_bastion://${body.vault_id}`,
    manifest: {
      vault_id: body.vault_id,
      session_count: body.sessions.length,
      collector_version: body.collector_version ?? null,
    } as Record<string, unknown>,
    hashAlgorithm: "sha256",
    source: "azure_bastion",
    boundaryId: boundary.id,
    runFingerprint: batchFingerprint,
  });

  // Recompute 3.7.5 (non-local maintenance authentication/supervision).
  const [controlRec] = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, "3.7.5")))
    .limit(1);
  if (controlRec) await calculateControlStatus(controlRec.id).catch(() => null);

  console.log(
    JSON.stringify({
      event: "bastion_sessions_ingested",
      orgId,
      vaultId: body.vault_id,
      collectedAt: body.collected_at,
      sessions_total: body.sessions.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
    })
  );

  return NextResponse.json({
    ok: true,
    register_id: register.id,
    sessions_total: body.sessions.length,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    results,
  });
}
