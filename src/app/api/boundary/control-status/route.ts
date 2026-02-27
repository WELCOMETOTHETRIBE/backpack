import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, boundarySnapshots, evidenceRuns, evidenceFindings } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  synthesizeControlStatus,
  type AllocationSummary,
  type EvidenceFindingSummary,
} from "@/lib/evidence/controlStatus";
import fs from "fs";
import path from "path";

function loadControlsRegistry(): { control_id: string; family?: string; layer?: string | null }[] {
  const registryPath = path.join(
    process.cwd(),
    "src",
    "boundary-engine",
    "data",
    "controls",
    "controls_registry.json"
  );
  if (!fs.existsSync(registryPath)) return [];
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  const arr = Array.isArray(raw) ? raw : (raw as { controls?: unknown[] }).controls ?? [];
  return arr.map(
    (c: { control_id?: string; family?: string; layer?: string }) => ({
      control_id: c.control_id ?? "",
      family: c.family,
      layer: c.layer ?? null,
    })
  );
}

function allocationsFromSnapshot(snapshotJson: unknown): Map<string, AllocationSummary> {
  const map = new Map<string, AllocationSummary>();
  const allocations = (snapshotJson as { allocations?: Array<{ control_id?: string; status?: string; layer?: string; rationale?: { layer?: string } }> })?.allocations ?? [];
  for (const a of allocations) {
    if (!a?.control_id) continue;
    map.set(a.control_id, {
      control_id: a.control_id,
      status: (a.status as AllocationSummary["status"]) ?? "Customer",
      layer: a.layer ?? (a.rationale as { layer?: string } | undefined)?.layer ?? null,
    });
  }
  return map;
}

export async function GET() {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [boundaryRow] = await db
      .select()
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundaryRow) {
      return NextResponse.json({ error: "NO_BOUNDARY_CONFIGURED" }, { status: 400 });
    }

    const [latestSnapshot] = await db
      .select()
      .from(boundarySnapshots)
      .where(eq(boundarySnapshots.accountId, accountId))
      .orderBy(desc(boundarySnapshots.createdAt))
      .limit(1);

    const allocationMap = latestSnapshot?.snapshotJson
      ? allocationsFromSnapshot(latestSnapshot.snapshotJson)
      : new Map<string, AllocationSummary>();

    const runs = await db
      .select({
        id: evidenceRuns.id,
        source: evidenceRuns.source,
        runFingerprint: evidenceRuns.runFingerprint,
        collectedAt: evidenceRuns.collectedAt,
      })
      .from(evidenceRuns)
      .where(
        and(
          eq(evidenceRuns.boundaryId, boundaryRow.boundaryId),
          eq(evidenceRuns.organizationId, accountId)
        )
      )
      .orderBy(desc(evidenceRuns.collectedAt));

    const latestRunBySource = new Map<
      string,
      { id: string; runFingerprint: string; createdAt: string }
    >();
    for (const r of runs) {
      if (!latestRunBySource.has(r.source)) {
        latestRunBySource.set(r.source, {
          id: r.id,
          runFingerprint: r.runFingerprint,
          createdAt:
            r.collectedAt instanceof Date ? r.collectedAt.toISOString() : String(r.collectedAt),
        });
      }
    }

    const runIds = runs.map((r) => r.id);
    const evidenceMap = new Map<string, EvidenceFindingSummary>();

    if (runIds.length > 0) {
      const findingsWithRuns = await db
        .select({
          controlId: evidenceFindings.controlId,
          pass: evidenceFindings.pass,
          layer: evidenceFindings.layer,
          collectedAt: evidenceRuns.collectedAt,
        })
        .from(evidenceFindings)
        .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
        .where(
          and(
            eq(evidenceRuns.boundaryId, boundaryRow.boundaryId),
            eq(evidenceRuns.organizationId, accountId)
          )
        )
        .orderBy(desc(evidenceRuns.collectedAt));

      for (const f of findingsWithRuns) {
        if (evidenceMap.has(f.controlId)) continue;
        evidenceMap.set(f.controlId, {
          control_id: f.controlId,
          status: f.pass ? "pass" : "fail",
          layer: f.layer ?? null,
          created_at:
            f.collectedAt instanceof Date ? f.collectedAt.toISOString() : String(f.collectedAt),
        });
      }
    }

    const registry = loadControlsRegistry();
    const controlIds = registry.length
      ? registry.map((r) => r.control_id)
      : Array.from(new Set([...allocationMap.keys(), ...evidenceMap.keys()]));

    const rows = controlIds.map((controlId) => {
      const allocation = allocationMap.get(controlId) ?? null;
      const registryEntry = registry.find((r) => r.control_id === controlId);
      const evidence =
        evidenceMap.get(controlId) ??
        (registryEntry?.family
          ? evidenceMap.get(`${registryEntry.family}.L2-${controlId}`)
          : null);

      const allocationWithLayer =
        allocation ??
        (registryEntry?.layer
          ? {
              control_id: controlId,
              status: "Customer" as const,
              layer: registryEntry.layer,
            }
          : null);

      return synthesizeControlStatus({
        controlId,
        allocation: allocationWithLayer,
        evidence: evidence ?? null,
      });
    });

    return NextResponse.json({
      boundary_id: boundaryRow.boundaryId,
      allocation_hash_current: boundaryRow.allocationHashCurrent,
      latest_snapshot_created_at: latestSnapshot?.createdAt ?? null,
      latest_evidence_runs: Array.from(latestRunBySource.entries()).map(([source, v]) => ({
        source,
        run_id: v.id,
        run_fingerprint: v.runFingerprint,
        created_at: v.createdAt,
      })),
      rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get control status";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
