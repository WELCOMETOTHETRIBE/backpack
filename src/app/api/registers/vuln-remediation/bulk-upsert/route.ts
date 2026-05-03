import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  controlRecords,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { calculateControlStatus } from "@/lib/control-status";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * POST /api/registers/vuln-remediation/bulk-upsert
 *
 * EnclaveWatch-facing endpoint for pushing Microsoft Defender Vulnerability
 * Management (MDVM) findings into the vuln_remediation register on every
 * weekly cadence. Each finding becomes (or updates) a register entry.
 *
 * Idempotent on (cve_id, machine_id) -- re-uploading the same MDVM
 * snapshot updates existing entries rather than duplicating. Resolved-on-
 * Defender CVEs land as status="final" with a remediation date; still-open
 * CVEs land as status="draft" so they show up in the open-findings count.
 *
 * After the upsert, the endpoint recomputes control status for 3.11.2 and
 * 3.11.3 so the dashboard immediately reflects the new evidence.
 *
 * Body shape (matches what EnclaveWatch's MDVM collector emits):
 *   {
 *     "source": "mdvm" | "azure_update_manager" | "defender_for_cloud",
 *     "collected_at": "2026-05-03T10:00:00Z",
 *     "vault_id": "VAULT-001",          // for traceability
 *     "machine_id": "cui-win-pilot-01", // host the scan ran on
 *     "findings": [
 *       {
 *         "cve_id": "CVE-2024-12345",
 *         "severity": "critical" | "high" | "medium" | "low",
 *         "description": "OS-level CVE in component X",
 *         "affected_component": "Windows Defender",
 *         "first_detected_utc": "2026-04-01T...",
 *         "fixed_utc": "2026-05-03T..." | null,
 *         "remediation_status": "open" | "in_progress" | "resolved" | "deferred",
 *         "remediation_action": "Apply KB5012345; reboot scheduled",
 *         "responsible_role": "infrastructure_owner",
 *         "target_resolution_date": "2026-05-15"
 *       }
 *     ]
 *   }
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 */

type Finding = {
  cve_id: string;
  severity?: string;
  description?: string;
  affected_component?: string;
  first_detected_utc?: string;
  fixed_utc?: string | null;
  remediation_status?: "open" | "in_progress" | "resolved" | "deferred";
  remediation_action?: string;
  responsible_role?: string;
  target_resolution_date?: string;
};

type Body = {
  source?: string;
  collected_at?: string;
  vault_id?: string;
  machine_id?: string;
  findings?: Finding[];
};

const FORBIDDEN_RAW_KEYS = ["raw_event_xml", "raw_event_body", "command_line", "raw_command_line"];

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

  // Defense-in-depth: reject raw audit payloads.
  const forbidden = findForbiddenKey(body);
  if (forbidden) {
    return NextResponse.json(
      { error: `Payload contains forbidden raw-log key at "${forbidden}"`, code: "RAW_LOG_LEAK_REJECTED" },
      { status: 400 },
    );
  }

  if (!body.source || !body.collected_at || !body.machine_id || !Array.isArray(body.findings)) {
    return NextResponse.json(
      { error: "source, collected_at, machine_id, findings are required" },
      { status: 400 },
    );
  }

  // Resolve the org's primary boundary + the vuln_remediation register
  // (vendor name "vuln_remediation" lives in the alias table; the seed
  // table name is the same in this case).
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) return NextResponse.json({ error: "No boundary for org" }, { status: 400 });

  const candidates = resolveRegisterKeyCandidates("vuln_remediation");
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
      { error: "vuln_remediation register not provisioned for org" },
      { status: 400 },
    );
  }

  // Pull existing entries for this register so we can dedupe by
  // (machine_id, cve_id) instead of inserting duplicates per cadence run.
  const existing = await db
    .select({ id: governanceRegisterEntries.id, entryData: governanceRegisterEntries.entryData })
    .from(governanceRegisterEntries)
    .where(eq(governanceRegisterEntries.registerId, register.id));
  const byKey = new Map<string, string>();
  for (const e of existing) {
    const d = (e.entryData ?? {}) as Record<string, unknown>;
    const key = `${d.machine_id ?? ""}|${d.cve_id ?? ""}`;
    if (key !== "|") byKey.set(key, e.id);
  }

  const now = new Date();
  let inserted = 0;
  let updated = 0;
  for (const f of body.findings) {
    if (!f.cve_id) continue;
    const key = `${body.machine_id}|${f.cve_id}`;
    const isResolved = f.remediation_status === "resolved" || Boolean(f.fixed_utc);
    const status: "draft" | "final" = isResolved ? "final" : "draft";
    const entryData: Record<string, unknown> = {
      source: body.source,
      machine_id: body.machine_id,
      vault_id: body.vault_id ?? null,
      cve_id: f.cve_id,
      severity: f.severity ?? "unknown",
      description: f.description ?? null,
      affected_component: f.affected_component ?? null,
      first_detected_utc: f.first_detected_utc ?? body.collected_at,
      fixed_utc: f.fixed_utc ?? null,
      remediation_status: f.remediation_status ?? (isResolved ? "resolved" : "open"),
      remediation_action: f.remediation_action ?? null,
      responsible_role: f.responsible_role ?? null,
      target_resolution_date: f.target_resolution_date ?? null,
      last_seen_utc: body.collected_at,
    };

    const existingId = byKey.get(key);
    if (existingId) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          status,
          finalizedAt: status === "final" ? now : null,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existingId));
      updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryData,
        entryType: "vuln_finding",
        status,
        finalizedAt: status === "final" ? now : null,
      });
      inserted++;
    }
  }

  // Recompute 3.11.2 + 3.11.3 status so the new evidence flows through.
  let recomputed = 0;
  for (const cid of ["3.11.2", "3.11.3"]) {
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
      event: "vuln_remediation_bulk_upsert",
      orgId,
      source: body.source,
      machineId: body.machine_id,
      findings: body.findings.length,
      inserted,
      updated,
      recomputed,
    }),
  );

  return NextResponse.json({
    ok: true,
    register_id: register.id,
    inserted,
    updated,
    total_findings: body.findings.length,
    recomputed_controls: recomputed,
  });
}
