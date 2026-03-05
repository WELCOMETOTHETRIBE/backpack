/**
 * Load control responsibilities for an org (from DB; fallback to template artifact if not seeded).
 */
import { db } from "@/db";
import { governanceControlResponsibilities } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getControlResponsibilityTemplates, getResponsibilityByControlId } from "@/data/cmmc";

export type ResponsibilityInfo = {
  responsibilityModel: string;
  azureInherited: string[];
  mactechProvided: string[];
  customerRequired: string[];
  notes: string[];
};

/** Keyed by control_id. */
export type ResponsibilitiesMap = Map<string, ResponsibilityInfo>;

export async function getResponsibilitiesForOrg(orgId: string, boundaryId: string | null = null): Promise<ResponsibilitiesMap> {
  const rows = await db
    .select({
      controlId: governanceControlResponsibilities.controlId,
      responsibilityModel: governanceControlResponsibilities.responsibilityModel,
      azureInheritedJson: governanceControlResponsibilities.azureInheritedJson,
      mactechProvidedJson: governanceControlResponsibilities.mactechProvidedJson,
      customerRequiredJson: governanceControlResponsibilities.customerRequiredJson,
      notesJson: governanceControlResponsibilities.notesJson,
    })
    .from(governanceControlResponsibilities)
    .where(
      boundaryId === null
        ? and(eq(governanceControlResponsibilities.orgId, orgId), sql`${governanceControlResponsibilities.boundaryId} IS NULL`)
        : and(eq(governanceControlResponsibilities.orgId, orgId), eq(governanceControlResponsibilities.boundaryId, boundaryId))
    );

  if (rows.length > 0) {
    const map = new Map<string, ResponsibilityInfo>();
    for (const r of rows) {
      map.set(r.controlId, {
        responsibilityModel: r.responsibilityModel,
        azureInherited: (r.azureInheritedJson ?? []) as string[],
        mactechProvided: (r.mactechProvidedJson ?? []) as string[],
        customerRequired: (r.customerRequiredJson ?? []) as string[],
        notes: (r.notesJson ?? []) as string[],
      });
    }
    return map;
  }

  const templates = getControlResponsibilityTemplates();
  const map = new Map<string, ResponsibilityInfo>();
  for (const c of templates.controls) {
    map.set(c.control_id, {
      responsibilityModel: c.responsibility_model,
      azureInherited: c.azure_inherited ?? [],
      mactechProvided: c.mactech_provided ?? [],
      customerRequired: c.customer_required ?? [],
      notes: c.notes ?? [],
    });
  }
  return map;
}

/**
 * Get responsibility for a single control (DB or template).
 * Lookup order: 1) (org_id, boundary_id, control_id) 2) (org_id, boundary_id = null, control_id).
 */
export async function getResponsibilityForControl(orgId: string, controlId: string, boundaryId: string | null = null): Promise<ResponsibilityInfo | null> {
  if (boundaryId != null && boundaryId !== "") {
    const byBoundary = await getResponsibilitiesForOrg(orgId, boundaryId);
    const fromBoundary = byBoundary.get(controlId);
    if (fromBoundary) return fromBoundary;
  }
  const byOrg = await getResponsibilitiesForOrg(orgId, null);
  const fromDb = byOrg.get(controlId);
  if (fromDb) return fromDb;
  const template = getResponsibilityByControlId(controlId);
  if (!template) return null;
  return {
    responsibilityModel: template.responsibility_model,
    azureInherited: template.azure_inherited ?? [],
    mactechProvided: template.mactech_provided ?? [],
    customerRequired: template.customer_required ?? [],
    notes: template.notes ?? [],
  };
}
