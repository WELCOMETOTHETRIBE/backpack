import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, boundarySnapshots, boundaryEvents, evidenceRuns } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { computeSnapshotSignature } from "@/lib/attestation/computeSnapshotSignature";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  validateSingleProviderBoundary,
  exportAllocationSnapshot,
  detectBoundaryDrift,
  getNormalizedProviderKey,
  loadControlsRegistry,
  getProviderCapabilityMatrix,
  loadLayersOntology,
  loadGateChecklist,
  resolveProfileAndCatalog,
  validateOntology,
} from "@/boundary-engine";
import type { BoundaryInput } from "@/boundary-engine";

const ENGINE_VERSION = "1.0.0";

function normalizeEnvironmentKey(environment: string | undefined): "government" | "commercial" {
  const env = (environment ?? "").toLowerCase();
  if (env.includes("gov") || env.includes("government")) return "government";
  return "commercial";
}

function normalizeHostingModel(value: unknown): string {
  const s = typeof value === "string" ? value.toLowerCase() : "iaas";
  const allowed = ["iaas", "paas", "saas", "on_prem"];
  return allowed.includes(s) ? s : "iaas";
}

/**
 * GET /api/boundary
 * Returns current boundary and latest snapshot summary (no full allocations).
 */
export async function GET() {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [row] = await db
      .select()
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!row) {
      return NextResponse.json({
        current_boundary: null,
        boundary_id: null,
        allocation_hash_current: null,
        latest_snapshot: null,
        provider_capability_matrix: null,
      });
    }

    const [latestSnapshot] = await db
      .select()
      .from(boundarySnapshots)
      .where(eq(boundarySnapshots.accountId, accountId))
      .orderBy(desc(boundarySnapshots.createdAt))
      .limit(1);

    const latest_snapshot = latestSnapshot
      ? {
          created_at: latestSnapshot.createdAt,
          allocation_hash: latestSnapshot.allocationHash,
          counts: (latestSnapshot.snapshotJson as { counts?: unknown })?.counts ?? null,
          assurance_context:
            (latestSnapshot.snapshotJson as { assurance_context?: unknown })?.assurance_context ??
            null,
          warnings: {
            sensitivity_warnings:
              (latestSnapshot.snapshotJson as { sensitivity_warnings?: unknown })
                ?.sensitivity_warnings ?? [],
            secondary_layer_warnings:
              (latestSnapshot.snapshotJson as { secondary_layer_warnings?: unknown })
                ?.secondary_layer_warnings ?? [],
          },
        }
      : null;

    let provider_capability_matrix: {
      inherited_layer_count: number;
      services_for_shared: Array<{
        service_key: string;
        display_name: string;
        required_gate_count: number;
        optional_gate_count: number;
        coverage_layer_count: number;
      }>;
      configured_but_not_creditable_risks?: Array<{
        service_key: string;
        display_name?: string;
        missing_required_gates: string[];
      }>;
    } | null = null;
    try {
      const gateChecklist = loadGateChecklist();
      const { providerProfile, serviceCatalog } = resolveProfileAndCatalog(
        row.boundaryInputJson as unknown as BoundaryInput
      );
      const matrix = getProviderCapabilityMatrix({
        providerProfile,
        serviceCatalog,
        gateChecklist,
        boundaryInput: row.boundaryInputJson as unknown as BoundaryInput,
      });
      provider_capability_matrix = {
        inherited_layer_count: matrix.inherited_layer_count,
        services_for_shared: matrix.services_for_shared,
        configured_but_not_creditable_risks: matrix.configured_but_not_creditable_risks,
      };
    } catch {
      // ignore
    }

    return NextResponse.json({
      current_boundary: row.boundaryInputJson,
      boundary_id: row.boundaryId,
      allocation_hash_current: row.allocationHashCurrent,
      latest_snapshot,
      provider_capability_matrix,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get boundary";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/boundary
 * Body: { boundary: BoundaryInput, registry_version?: string }
 * Upserts account_boundary and appends a boundary_snapshots row.
 */
export async function PUT(req: Request) {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json();
    const boundary = body.boundary as unknown;
    const registry_version = typeof body.registry_version === "string" ? body.registry_version : "";

    if (!boundary || typeof boundary !== "object") {
      return NextResponse.json(
        { error: "Request body must include boundary object" },
        { status: 400 }
      );
    }

    validateSingleProviderBoundary(boundary);

    const controls_registry = loadControlsRegistry();

    const [existing] = await db
      .select({ boundaryId: accountBoundary.boundaryId, allocationHashCurrent: accountBoundary.allocationHashCurrent })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    const boundary_id = existing?.boundaryId ?? crypto.randomUUID();

    const { snapshot_metadata, snapshot_json, allocation_hash } =
      await exportAllocationSnapshot({
        account_id: accountId,
        boundary_id,
        boundary_input: boundary as BoundaryInput,
        controls_registry,
        registry_version,
        engine_version: ENGINE_VERSION,
      });

    const drift = detectBoundaryDrift(existing?.allocationHashCurrent ?? null, allocation_hash);

    if (drift.drifted && existing?.allocationHashCurrent != null) {
      await db.insert(boundaryEvents).values({
        accountId,
        boundaryId: boundary_id,
        eventType: "allocation_hash_change",
        payload: {
          previous_hash: existing.allocationHashCurrent,
          new_hash: allocation_hash,
        },
      });
    }

    const provider_key = getNormalizedProviderKey((boundary as { provider?: string }).provider ?? "");
    const environment_key = normalizeEnvironmentKey((boundary as { environment?: string }).environment);
    const hosting_model = normalizeHostingModel((boundary as { hosting_model?: unknown }).hosting_model);

    if (provider_key === null) {
      return NextResponse.json(
        { error: "Provider could not be normalized; use a supported provider (e.g. Azure)." },
        { status: 400 }
      );
    }

    const now = new Date();

    await db
      .insert(accountBoundary)
      .values({
        accountId,
        boundaryId: boundary_id,
        providerKey: provider_key,
        environmentKey: environment_key,
        hostingModel: hosting_model,
        boundaryInputJson: boundary as Record<string, unknown>,
        allocationHashCurrent: allocation_hash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: accountBoundary.accountId,
        set: {
          boundaryId: boundary_id,
          providerKey: provider_key,
          environmentKey: environment_key,
          hostingModel: hosting_model,
          boundaryInputJson: boundary as Record<string, unknown>,
          allocationHashCurrent: allocation_hash,
          updatedAt: now,
        },
      });

    const runs = await db
      .select({ runFingerprint: evidenceRuns.runFingerprint, source: evidenceRuns.source })
      .from(evidenceRuns)
      .where(
        and(
          eq(evidenceRuns.boundaryId, boundary_id),
          eq(evidenceRuns.organizationId, accountId)
        )
      )
      .orderBy(desc(evidenceRuns.collectedAt));

    const seenSources = new Set<string>();
    const evidenceRunFingerprints: string[] = [];
    for (const r of runs) {
      if (!seenSources.has(r.source)) {
        seenSources.add(r.source);
        evidenceRunFingerprints.push(r.runFingerprint);
      }
    }
    evidenceRunFingerprints.sort();

    const snapshot_signature = computeSnapshotSignature({
      boundaryId: boundary_id,
      allocationHash: allocation_hash,
      registryVersion: registry_version,
      providerProfileId: (snapshot_metadata as { provider_profile_id?: string }).provider_profile_id ?? "",
      catalogId: (snapshot_metadata as { catalog_id?: string }).catalog_id ?? "",
      evidenceRunFingerprints,
    });

    await db.insert(boundarySnapshots).values({
      snapshotId: crypto.randomUUID(),
      accountId,
      boundaryId: boundary_id,
      allocationHash: allocation_hash,
      registryVersion: registry_version,
      snapshotMetadataJson: snapshot_metadata as unknown as Record<string, unknown>,
      snapshotJson: snapshot_json as unknown as Record<string, unknown>,
      snapshotSignature: snapshot_signature,
      evidenceRunFingerprints,
    });

    const configured_but_not_creditable_risks = (() => {
      try {
        const gateChecklist = loadGateChecklist();
        const { providerProfile, serviceCatalog } = resolveProfileAndCatalog(boundary as BoundaryInput);
        const matrix = getProviderCapabilityMatrix({
          providerProfile,
          serviceCatalog,
          gateChecklist,
          boundaryInput: boundary as BoundaryInput,
        });
        return matrix.configured_but_not_creditable_risks ?? [];
      } catch {
        return [];
      }
    })();

    return NextResponse.json({
      boundary_id,
      allocation_hash,
      assurance_context: snapshot_json.assurance_context,
      counts: snapshot_json.counts,
      sensitivity_warnings: snapshot_json.sensitivity_warnings ?? [],
      secondary_layer_warnings: snapshot_json.secondary_layer_warnings ?? [],
      configured_but_not_creditable_risks,
      drift: { drifted: drift.drifted, reason: drift.reason },
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const message = err?.message ?? "Failed to save boundary";
    const status =
      message === "Unauthorized" || message === "Forbidden"
        ? 401
        : err?.code === "INVALID_BOUNDARY_PROVIDER" ||
            err?.code === "MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
