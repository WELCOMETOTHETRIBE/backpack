import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceManifestRuns,
  governanceDocumentControlLinks,
  governanceDocuments,
  controlRecords,
} from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { PURE_GOVERNANCE_IDS } from "@/lib/compliance/control-bins";

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
// Used for legacy schema docs; ALSO supplements v1 docs whose controls_mapped
// is incomplete (QMS CLI does not always emit every control a doc satisfies).
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
      docs: docs.map((d) => {
        // v1 embeds controls_mapped — use as primary source, then
        // supplement with static mapping entries the QMS CLI may have omitted.
        const embedded = new Set<string>(d.controls_mapped ?? []);
        const staticEntries = staticMap.get(d.document_number) ?? [];
        for (const cm of staticEntries) {
          embedded.add(cm.control_id);
        }
        return {
          code: d.document_number,
          title: d.document_name,
          kind: d.document_type,
          status: statusMap[d.status?.toLowerCase() ?? ""] ?? "DRAFT",
          sha256: d.sha256 ?? null,
          controls: [...embedded],
        };
      }),
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

    // Load static map — supplements both v1 and legacy manifests
    const staticMap = await loadStaticControlMap();

    const normalised = normaliseManifest(schema, manifest, staticMap);
    let runId = normalised.runId || bodyRunId;
    if (!runId) {
      return NextResponse.json({ error: "run_id required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (normalised.docs.length === 0) {
      return NextResponse.json({ error: "manifest contains no documents", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // ── Upsert manifest run record (one record per bundle, updated on re-ingest) ─
    const existingRun = await db
      .select({ id: governanceManifestRuns.id })
      .from(governanceManifestRuns)
      .where(and(
        eq(governanceManifestRuns.organizationId, orgId),
        eq(governanceManifestRuns.runId, runId),
      ))
      .limit(1);

    let manifestRunId: string;
    if (existingRun.length > 0) {
      // Update the existing run record (keeps history clean, no duplicate rows)
      await db
        .update(governanceManifestRuns)
        .set({
          ingestedBy: user?.id ?? null,
          docCount: normalised.docs.length,
          ingestedAt: new Date(),
        })
        .where(eq(governanceManifestRuns.id, existingRun[0]!.id));
      manifestRunId = existingRun[0]!.id;
    } else {
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
      manifestRunId = runRow.id;
    }

    // ── Upsert docs + rebuild control links ──────────────────────────────────
    // Docs: upsert by (organizationId, docId) — update title/type/status on re-ingest
    // Links: delete all existing links for this org then re-insert from current manifest
    //        so stale mappings are never left around from old runs.
    const allControlsCovered = new Set<string>();

    // Delete all existing control links for this org (will re-create fresh below)
    await db
      .delete(governanceDocumentControlLinks)
      .where(eq(governanceDocumentControlLinks.organizationId, orgId));

    for (const doc of normalised.docs) {
      if (!doc.code || !doc.title) continue;

      const docStatus = (["APPROVED","SUBMITTED","DRAFT"].includes(doc.status) ? doc.status : "DRAFT") as
        "APPROVED" | "SUBMITTED" | "DRAFT";

      const now = new Date();
      const nowIso = now.toISOString().slice(0, 10);
      const oneYearOut = new Date(now);
      oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      const oneYearOutIso = oneYearOut.toISOString().slice(0, 10);
      const approvedDates =
        docStatus === "APPROVED"
          ? { approvalDate: nowIso, nextReviewDate: oneYearOutIso }
          : {};

      // Upsert: update on conflict with the unique index (org_id, doc_id)
      await db
        .insert(governanceDocuments)
        .values({
          organizationId: orgId,
          docId: doc.code,
          title: doc.title,
          type: toDocType(doc.kind),
          status: docStatus,
          updatedAt: now,
          ...approvedDates,
        })
        .onConflictDoUpdate({
          target: [governanceDocuments.organizationId, governanceDocuments.docId],
          set: {
            title: doc.title,
            type: toDocType(doc.kind),
            status: docStatus,
            updatedAt: now,
            // Only auto-fill dates when promoting to APPROVED; don't overwrite
            // an existing signature/review date on re-ingest.
            ...(docStatus === "APPROVED"
              ? {
                  approvalDate: sql`COALESCE(${governanceDocuments.approvalDate}, ${nowIso})`,
                  nextReviewDate: sql`COALESCE(${governanceDocuments.nextReviewDate}, ${oneYearOutIso})`,
                }
              : {}),
          },
        });

      for (const controlId of doc.controls) {
        if (!controlId) continue;
        // Insert with conflict guard (unique index on org+doc+control)
        await db
          .insert(governanceDocumentControlLinks)
          .values({
            organizationId: orgId,
            manifestRunId,
            docCode: doc.code,
            controlId,
            satisfactionType: "primary",
          })
          .onConflictDoUpdate({
            target: [
              governanceDocumentControlLinks.organizationId,
              governanceDocumentControlLinks.docCode,
              governanceDocumentControlLinks.controlId,
            ],
            set: { manifestRunId, satisfactionType: "primary" },
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

    // ── Promote implementationStatus based on governance coverage ─────────────
    //
    // Pure governance controls: docs alone are sufficient → "implemented"
    // Hybrid controls: docs + OS evidence both required → promote only when
    //   technical_status is already "satisfied" (OS ingest already ran)
    //
    // Statuses assessed / inherited / not_applicable are never overwritten.
    const PROTECTED_STATUSES = ["assessed", "inherited", "not_applicable"];
    const PURE_GOV_SET = new Set(PURE_GOVERNANCE_IDS);
    let implementedPromotedCount = 0;

    if (nonDraftCoveredControls.size > 0) {
      // Fetch all affected control records in one query
      const affectedRecords = await db
        .select({
          id: controlRecords.id,
          controlId: controlRecords.controlId,
          implementationStatus: controlRecords.implementationStatus,
          technicalStatus: controlRecords.technicalStatus,
        })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            inArray(controlRecords.controlId, [...nonDraftCoveredControls])
          )
        );

      const toPromote: string[] = [];
      for (const r of affectedRecords) {
        // Never overwrite terminal statuses
        if (PROTECTED_STATUSES.includes(r.implementationStatus)) continue;
        // Already implemented — nothing to do
        if (r.implementationStatus === "implemented") continue;

        if (PURE_GOV_SET.has(r.controlId)) {
          // Pure governance: docs alone close the control
          toPromote.push(r.id);
        } else {
          // Hybrid: only promote if OS/technical lane is already satisfied
          if (r.technicalStatus === "satisfied") {
            toPromote.push(r.id);
          }
        }
      }

      if (toPromote.length > 0) {
        await db
          .update(controlRecords)
          .set({ implementationStatus: "implemented", updatedAt: new Date() })
          .where(
            and(
              eq(controlRecords.organizationId, orgId),
              inArray(controlRecords.id, toPromote)
            )
          );
        implementedPromotedCount = toPromote.length;
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
      implementedPromoted: implementedPromotedCount,
    }));

    return NextResponse.json({
      run_id: runId,
      schema,
      doc_count: normalised.docs.length,
      linked_controls: allControlsCovered.size,
      policy_satisfied_count: policySatisfiedCount,
      implemented_promoted: implementedPromotedCount,
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
