import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  controlFamilies,
  governanceControlMetadata,
  roles,
} from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { getControlFamilyPrefix } from "@/components/governance-wizard/constants";
import {
  PURE_GOVERNANCE_IDS,
  HYBRID_GOVERNANCE_IDS,
  PURE_TECHNICAL_IDS,
  HYBRID_TECHNICAL_IDS,
  getControlBin,
} from "@/lib/compliance/control-bins";

const FAMILY_PREFIX: Record<string, string> = {
  AC: "3.1", AT: "3.2", AU: "3.3", CM: "3.4", IA: "3.5", IR: "3.6",
  MA: "3.7", MP: "3.8", PS: "3.9", PE: "3.10", RA: "3.11", CA: "3.12",
  SC: "3.13", SI: "3.14",
};

/**
 * GET /api/governance/controls?classification=PURE_GOV|HYBRID_GOV|HYBRID_TECHNICAL|TECHNICAL&status=...&domain=AC&page=1&limit=20
 * List governance controls for org; only controls that have governance_control_metadata.
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const classification = searchParams.get("classification") as
      | "PURE_GOV"
      | "HYBRID_GOV"
      | "HYBRID_GOV_CENTRIC"
      | "HYBRID_GOVERNANCE"
      | "HYBRID_TECHNICAL"
      | "TECHNICAL"
      | null;
    const status = searchParams.get("status");
    const domain = searchParams.get("domain");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const metaQuery = db
      .select({
        controlId: governanceControlMetadata.controlId,
        classification: governanceControlMetadata.classification,
        controlStatement: governanceControlMetadata.controlStatement,
        requiredDocuments: governanceControlMetadata.requiredDocuments,
        requiredRegisters: governanceControlMetadata.requiredRegisters,
      })
      .from(governanceControlMetadata);
    const metaList =
      classification &&
      classification !== "HYBRID_TECHNICAL" &&
      classification !== "HYBRID_GOV_CENTRIC" &&
      classification !== "HYBRID_GOVERNANCE" &&
      classification !== "TECHNICAL"
        ? await metaQuery.where(eq(governanceControlMetadata.classification, classification))
        : await metaQuery;

    let controlIds = metaList.map((m) => m.controlId);
    if (
      controlIds.length === 0 ||
      classification === "HYBRID_TECHNICAL" ||
      classification === "HYBRID_GOV_CENTRIC" ||
      classification === "HYBRID_GOVERNANCE" ||
      classification === "TECHNICAL" ||
      classification === "PURE_GOV"
    ) {
      if (classification === "PURE_GOV") controlIds = [...PURE_GOVERNANCE_IDS];
      else if (classification === "HYBRID_GOVERNANCE" || classification === "HYBRID_GOV_CENTRIC")
        controlIds = [...HYBRID_GOVERNANCE_IDS];
      else if (classification === "HYBRID_GOV")
        controlIds = [...HYBRID_TECHNICAL_IDS, ...HYBRID_GOVERNANCE_IDS];
      else if (classification === "HYBRID_TECHNICAL") controlIds = [...HYBRID_TECHNICAL_IDS];
      else if (classification === "TECHNICAL") controlIds = [...PURE_TECHNICAL_IDS];
      else controlIds = [...ALL_CONTROL_IDS];
    }
    if (domain && FAMILY_PREFIX[domain]) {
      const prefix = FAMILY_PREFIX[domain];
      controlIds = controlIds.filter((id) => getControlFamilyPrefix(id) === prefix);
    }
    if (controlIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, limit });
    }

    let conditions = and(
      eq(controlRecords.organizationId, orgId),
      inArray(controlRecords.controlId, controlIds)
    );
    const validStatuses = ["not_started", "in_progress", "implemented", "assessed", "inherited", "not_applicable"] as const;
    if (status && validStatuses.includes(status as (typeof validStatuses)[number])) {
      conditions = and(conditions, eq(controlRecords.implementationStatus, status as (typeof validStatuses)[number]));
    }

    const records = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        roleName: roles.name,
      })
      .from(controlRecords)
      .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
      .where(conditions)
      .orderBy(controlRecords.controlId)
      .limit(limit + 1)
      .offset(offset);

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(controlRecords)
      .where(conditions);

    const metaByControl = Object.fromEntries(metaList.map((m) => [m.controlId, m]));
    function fallbackClassification(
      controlId: string
    ): "PURE_GOV" | "HYBRID_GOV" | "HYBRID_GOVERNANCE" | "HYBRID_TECHNICAL" | "TECHNICAL" {
      const bin = getControlBin(controlId);
      if (bin === "pure_governance") return "PURE_GOV";
      if (bin === "hybrid_governance") return "HYBRID_GOVERNANCE";
      if (bin === "hybrid_technical") return "HYBRID_TECHNICAL";
      return "TECHNICAL";
    }
    const controlIdsToFetch = [...new Set(records.map((r) => r.controlId))];
    const controlRows = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        familyCode: controlFamilies.code,
      })
      .from(controls)
      .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
      .where(inArray(controls.controlId, controlIdsToFetch));

    const controlByKey = Object.fromEntries(controlRows.map((c) => [c.controlId, c]));
    const items = records.slice(0, limit).map((r) => {
      const meta = metaByControl[r.controlId];
      const ctrl = controlByKey[r.controlId];
      return {
        id: r.id,
        controlId: r.controlId,
        cmmcRef: ctrl?.familyCode ? `${ctrl.familyCode}.L2-${r.controlId}` : r.controlId,
        title: ctrl?.title ?? r.controlId,
        classification: meta?.classification ?? fallbackClassification(r.controlId),
        controlStatement: meta?.controlStatement ?? null,
        status: r.implementationStatus,
        governanceNarrative: r.governanceNarrative,
        roleName: r.roleName,
        requiredDocuments: meta?.requiredDocuments ?? [],
        requiredRegisters: meta?.requiredRegisters ?? [],
      };
    });

    return NextResponse.json({
      items,
      total: total[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list governance controls";
    return NextResponse.json({ error: msg }, { status: e instanceof Error && e.message === "Unauthorized" ? 401 : 500 });
  }
}
