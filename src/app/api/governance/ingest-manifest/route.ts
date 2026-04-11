import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceManifestRuns,
  governanceDocumentControlLinks,
  governanceDocuments,
  controlRecords,
} from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

// ─── Supported schemas ────────────────────────────────────────────────────────
const SCHEMA_V1 = "mactech-governance-manifest.v1";       // QMS CLI output (51 docs)
const SCHEMA_LEGACY = "mactech.codex.manual.governance_manifest"; // old manual manifest

// ─── Types ────────────────────────────────────────────────────────────────────

/** v1 QMS CLI document (fields from governance-manifest-cmmc20.json) */
interface V1Doc {
  document_number: string;
  document_name: string;
  document_type: string;
  version?: string;
  status?: string; // "in_review" | "draft" | "approved"
  sha256?: string;
  file_size_bytes?: number;
  controls_mapped?: string[]; // NIST IDs already in 3.x.y format
}

/** Legacy manual manifest document */
interface LegacyDoc {
  id?: string;
  code: string;
  kind: string;
  title: string;
  sha256?: string;
}

/** Normalised shape we work with internally */
interface NormalisedDoc {
  code: string;
  title: string;
  kind: string;
  status: string;
  sha256: string | null;
  controls: string[]; // NIST control IDs
}

interface ControlMapping {
  control_id: string;
  satisfaction_type: string;
}

interface MappingFile {
  mappings: Array<{ doc_code: string; controls: ControlMapping[] }>;
}

// ─── Load static fallback control map ────────────────────────────────────────
// Used for legacy schema docs that don't embed controls_mapped.
async function loadStaticControlMap(): Promise<Map<string, ControlMapping[]>> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("@/../docs/Governance-Document-to-NIST-Control-Manifest.json") as MappingFile;
  const map = new Map<string, ControlMapping[]>();
  for (const entry of raw.mappings) {
    map.set(entry.doc_code, entry.controls);
  }
  return map;
}

// ─── Normalise manifest → unified doc list ────────────────────────────────────
function normaliseManifest(
  schema: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>,
  staticMap: Map<string, ControlMapping[]>
): { runId: string; bundleSource: string | null; schemaVersion: number; docs: NormalisedDoc[] } {
  if (schema === SCHEMA_V1) {
    const docs: V1Doc[] = raw.documents ?? [];
    const runId: string = raw.run_id ?? `GOV-${Date.now()}`;
    const bundleSource: string | null = raw.source ?? null;

    const statusMap: Record<string, string> = {
      approved: "APPROVED",
      in_review: "SUBMITTED",
      draft: "DRAFT",
    };

    return {
      runId,
      bundleSource,
      schemaVersion: 1,
      docs: docs.map((d) => ({
        code: d.document_number,
        title: d.document_name,
        kind: d.document_type,
        status: statusMap[d.status?.toLowerCase() ?? ""] ?? "DRAFT",
        sha256: d.sha256 ?? null,
        // v1 embeds controls_mapped directly — use as primary source
        controls: d.controls_mapped ?? [],
      })),
    };
  }

  // Legacy schema
  const docs: LegacyDoc[] = raw.docs ?? [];
  return {
    runId: raw.run_id ?? `GOV-${Date.now()}`,
    bundleSource: raw.source?.bundle ?? null,
    schemaVersion: raw.version ?? 3,
    docs: docs.map((d) => ({
      code: d.code,
      title: d.title,
      kind: d.kind,
      status: "SUBMITTED",
      sha256: d.sha256 ?? null,
      // Legacy has no embedded mapping — fall back to static JSON
      controls: (staticMap.get(d.code) ?? []).map((cm) => cm.control_id),
    })),
  };
}

// ─── Kind → governanceDocTypeEnum ────────────────────────────────────────────
function toDocType(kind: string): "POLICY" | "SOP" | "PLAN" | "STANDARD" | "CHARTER" | "PROCEDURE" | "TEMPLATE" {
  const m: Record<string, "POLICY" | "SOP" | "PLAN" | "STANDARD" | "CHARTER" | "PROCEDURE" | "TEMPLATE"> = {
    policy: "POLICY",
    procedure: "PROCEDURE",
    sop: "SOP",
    plan: "PLAN",
    form: "TEMPLATE",
    standard: "STANDARD",
    charter: "CHARTER",
    guideline: "TEMPLATE",
    template: "TEMPLATE",
    ssp: "PLAN",
    security_guide: "STANDARD",
  };
  return m[kind?.toLowerCase() ?? ""] ?? "POLICY";
}

// ─── Route ───────────────────────────────────────────────────────────────────
/**
 * POST /api/governance/ingest-manifest
 *
 * Accepts either:
 *   - mactech-governance-manifest.v1  (QMS CLI — 51 docs, controls_mapped embedded)
 *   - mactech.codex.manual.governance_manifest  (legacy — 39 docs, static mapping)
 *
 * Body (v1):  { manifest: <full v1 JSON> }           (run_id taken from manifest)
 * Body (leg): { manifest: <legacy JSON>, run_id: string }
 *
 * Returns { run_id, doc_count, linked_controls, policy_satisfied_count }
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { organizationId?: string; id?: string } | undefined;
    const orgId = user?.organizationId;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body", code: "PARSE_ERROR" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { manifest, run_id: bodyRunId } = body as { manifest?: any; run_id?: string };
    if (!manifest || typeof manifest !== "object") {
      return NextResponse.json({ error: "manifest required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const schema: string = manifest.schema ?? "";
    if (schema !== SCHEMA_V1 && schema !== SCHEMA_LEGACY) {
      return NextResponse.json({
        error: `Unsupported manifest schema "${schema}". Expected "${SCHEMA_V1}" or "${SCHEMA_LEGACY}".`,
        code: "SCHEMA_MISMATCH",
        supported: [SCHEMA_V1, SCHEMA_LEGACY],
      }, { status: 400 });
    }

    // Load static map (needed for legacy; ignored for v1 which embeds controls_mapped)
    const staticMap = await loadStaticControlMap();

    const normalised = normaliseManifest(schema, manifest, staticMap);
    const runId = normalised.runId || bodyRunId;
    if (!runId) {
      return NextResponse.json({ error: "run_id required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (normalised.docs.length === 0) {
      return NextResponse.json({ error: "manifest contains no documents", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // ── Duplicate run protection ──────────────────────────────────────────────
    const existingRun = await db
      .select({ id: governanceManifestRuns.id })
      .from(governanceManifestRuns)
      .where(and(
        eq(governanceManifestRuns.organizationId, orgId),
        eq(governanceManifestRuns.runId, runId),
      ))
      .limit(1);

    if (existingRun.length > 0) {
      return NextResponse.json({
        error: `run_id "${runId}" has already been ingested for this organization`,
        code: "DUPLICATE_RUN",
        run_id: runId,
      }, { status: 409 });
    }

    // ── Create manifest run record ────────────────────────────────────────────
    const [runRow] = await db
      .insert(governanceManifestRuns)
      .values({
        organizationId: orgId,
        runId,
        schemaVersion: normalised.schemaVersion,
        bundleSource: normalised.bundleSource,
        ingestedBy: user?.id ?? null,
        docCount: normalised.docs.length,
      })
      .returning({ id: governanceManifestRuns.id });

    const manifestRunId = runRow.id;

    // ── Upsert docs + build control links ────────────────────────────────────
    const allControlsCovered = new Set<string>();

    for (const doc of normalised.docs) {
      if (!doc.code || !doc.title) continue;

      await db
        .insert(governanceDocuments)
        .values({
          organizationId: orgId,
          docId: doc.code,
          title: doc.title,
          type: toDocType(doc.kind),
          status: (["APPROVED","SUBMITTED","DRAFT"].includes(doc.status) ? doc.status : "DRAFT") as
            "APPROVED" | "SUBMITTED" | "DRAFT",
        })
        .onConflictDoNothing();

      for (const controlId of doc.controls) {
        if (!controlId) continue;
        await db
          .insert(governanceDocumentControlLinks)
          .values({
            organizationId: orgId,
            manifestRunId,
            docCode: doc.code,
            controlId,
            satisfactionType: "primary",
          });
        allControlsCovered.add(controlId);
      }
    }

    // ── Satisfy policy lanes on dual-evidence controls ────────────────────────
    // Any control with policy_doc_required=true that is now covered by a
    // non-draft document gets policy_status = 'satisfied'.
    const nonDraftCoveredControls = new Set<string>();
    for (const doc of normalised.docs) {
      if (doc.status === "DRAFT") continue; // drafts don't count as satisfied
      for (const c of doc.controls) {
        nonDraftCoveredControls.add(c);
      }
    }

    let policySatisfiedCount = 0;
    if (nonDraftCoveredControls.size > 0) {
      const recordsToSatisfy = await db
        .select({ id: controlRecords.id })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            eq(controlRecords.policyDocRequired, true),
            inArray(controlRecords.controlId, [...nonDraftCoveredControls])
          )
        );

      if (recordsToSatisfy.length > 0) {
        await db
          .update(controlRecords)
          .set({
            policyStatus: "satisfied",
            policyDocLinkedAt: new Date(),
            policyDocNarrative: `Satisfied by governance bundle manifest run: ${runId}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(controlRecords.organizationId, orgId),
              inArray(controlRecords.id, recordsToSatisfy.map((r) => r.id))
            )
          );
        policySatisfiedCount = recordsToSatisfy.length;
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "governance_manifest_ingested",
      orgId,
      runId,
      schema,
      bundleSource: normalised.bundleSource,
      docCount: normalised.docs.length,
      linkedControls: allControlsCovered.size,
      policySatisfied: policySatisfiedCount,
    }));

    return NextResponse.json({
      run_id: runId,
      schema,
      doc_count: normalised.docs.length,
      linked_controls: allControlsCovered.size,
      policy_satisfied_count: policySatisfiedCount,
      manifest_run_id: manifestRunId,
    }, { status: 201 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// ─── GET — list runs ──────────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { organizationId?: string } | undefined;
    const orgId = user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const runs = await db
      .select({
        id: governanceManifestRuns.id,
        runId: governanceManifestRuns.runId,
        bundleSource: governanceManifestRuns.bundleSource,
        ingestedAt: governanceManifestRuns.ingestedAt,
        docCount: governanceManifestRuns.docCount,
        schemaVersion: governanceManifestRuns.schemaVersion,
      })
      .from(governanceManifestRuns)
      .where(eq(governanceManifestRuns.organizationId, orgId))
      .orderBy(desc(governanceManifestRuns.ingestedAt));

    return NextResponse.json(runs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
