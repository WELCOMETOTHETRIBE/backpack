import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { controlAdjudications, onboardingWizardState, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { VAULT_CONTROL_MAP } from "@/data/vault-control-map";
import { createHash } from "crypto";

/**
 * POST /api/onboarding/generate-ssp
 *
 * Generates an SSP document for the authenticated organization.
 * Pulls all controlAdjudications and wizard phaseData, builds the SSP content,
 * and stores it (as JSON for now; PDF generation extension point noted below).
 *
 * The SSP includes:
 * - Cover page (org name, system name, CAGE code, date, version)
 * - System description + CUI category narrative
 * - Authorization boundary statement
 * - All 110 controls with: status, tier, narrative, evidence references, responsible party
 * - Appendix A: Inherited controls (Azure Gov)
 * - Appendix B: MacTech Trust Codex document index
 * - Appendix C: POA&M (controls in "planned" status)
 *
 * NOTE: Full PDF rendering requires a PDF library (pdfkit, puppeteer, etc.)
 * This route returns a structured JSON SSP + SHA-256 hash.
 * A PDF rendering layer can be added by calling a PDF service and storing the output blob.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();

    // Pull org profile
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Pull wizard state for profile data
    const [wizardState] = await db
      .select()
      .from(onboardingWizardState)
      .where(eq(onboardingWizardState.organizationId, orgId))
      .limit(1);

    const phaseData = (wizardState?.phaseData as Record<string, Record<string, unknown>>) ?? {};

    // Pull all adjudications
    const adjudications = await db
      .select()
      .from(controlAdjudications)
      .where(eq(controlAdjudications.organizationId, orgId));

    const adjMap = new Map(adjudications.map((a) => [a.controlId, a]));

    // Build SSP structure
    const phase1Data = phaseData["1"] ?? {};
    const phase2Data = phaseData["2"] ?? {};

    const ssp = {
      coverPage: {
        organizationName: org.name,
        systemName: (phase1Data.systemName as string | undefined) ?? `${org.name} CUI Vault`,
        systemDescription: phase1Data.systemDescription as string | undefined,
        cageCode: org.cageCode ?? (phase1Data.cageCode as string | undefined) ?? "PENDING",
        generatedAt: new Date().toISOString(),
        version: "1.0",
        classificationLevel: "CUI",
        assessmentLevel: "CMMC Level 2 / NIST SP 800-171 Rev 2",
      },
      systemProfile: {
        systemOwner: phase1Data.systemOwner ?? {},
        isso: phase1Data.isso ?? {},
        authorizingOfficial: phase1Data.authorizingOfficial ?? {},
        cuiBoundaryStatement:
          "The authorization boundary consists of a single Windows Server 2025 Datacenter VM hosted in Microsoft Azure Government, " +
          "hardened and managed by MacTech Solutions LLC under the MacTech CUI Vault MSP agreement. " +
          "Azure Government (FedRAMP High authorized) provides the underlying cloud platform controls.",
        scopeComponents: ["windows_server_vm", "azure_cloud"],
      },
      cuiCategories: {
        categories: phase2Data.categories ?? [],
        narrative: phase2Data.narrative ?? "",
      },
      controls: VAULT_CONTROL_MAP.map((ctrl) => {
        const adj = adjMap.get(ctrl.controlId);
        return {
          controlId: ctrl.controlId,
          family: ctrl.family,
          familyName: ctrl.familyName,
          title: ctrl.title,
          sprsWeight: ctrl.sprsWeight,
          tier: ctrl.tier,
          status: adj?.status ?? "not_started",
          narrative: adj?.narrative ?? deriveDefaultNarrative(ctrl, adj?.status),
          responsibleParty: deriveResponsibleParty(ctrl),
          evidenceFiles: ctrl.evidenceFiles ?? [],
          evidenceBlobKeys: adj?.evidenceBlobKeys ?? [],
          naJustification: ctrl.naJustification,
          poamTargetDate: adj?.poamTargetDate ?? null,
          poamNotes: adj?.poamNotes ?? null,
          needsReview: ctrl.needsReview || adj?.needsReview,
          attestedAt: adj?.attestedAt?.toISOString() ?? null,
        };
      }),
      appendixA: {
        title: "Inherited Controls — Microsoft Azure Government",
        statement:
          "The following controls are inherited from Microsoft Azure Government, which holds FedRAMP High authorization. " +
          "Azure Government's P-ATO package includes the full Physical Protection (PE) family and platform-level capabilities " +
          "referenced throughout this SSP. Customers may obtain Azure Government inherited control documentation directly from " +
          "Microsoft's Service Trust Portal.",
        controls: VAULT_CONTROL_MAP.filter((c) => c.tier === "azure_inherited").map((c) => ({
          controlId: c.controlId,
          title: c.title,
          azureProvides: c.azureProvides,
        })),
      },
      appendixB: {
        title: "MacTech Trust Codex — Policy and SOP Document Index",
        documents: [
          "MAC-POL-210 — Access Control Policy",
          "MAC-POL-211 — Identification and Authentication Policy",
          "MAC-POL-214 — System Integrity Policy",
          "MAC-POL-215 — Incident Response Policy",
          "MAC-POL-218 — Audit and Accountability Policy",
          "MAC-POL-219 — Awareness and Training Policy",
          "MAC-POL-220 — Configuration Management Policy",
          "MAC-POL-221 — Maintenance Policy",
          "MAC-POL-222 — Personnel Security Policy",
          "MAC-POL-223 — Risk Assessment Policy",
          "MAC-POL-224 — Security Assessment Policy",
          "MAC-POL-228 — Authentication Feedback Obscure Policy",
          "MAC-SOP-221 — User Account Provisioning and Deprovisioning Procedure",
          "MAC-SOP-224 — Physical Environment and Remote Work Controls",
          "MAC-SOP-225 — Configuration Change Awareness Procedure",
          "MAC-SOP-226 — Audit Log Review Procedure",
          "MAC-SOP-227 — Security Awareness Training Procedure",
          "MAC-SOP-232 — Incident Response Testing Procedure",
          "MAC-SOP-233 — Personnel Screening Procedure",
          "MAC-SOP-239 — System Monitoring Procedure",
          "MAC-SOP-240 — Session/Connection Termination Procedure",
          "MAC-CMP-001 — Configuration Management Plan",
        ],
      },
      appendixC: {
        title: "Plan of Action and Milestones (POA&M)",
        entries: adjudications
          .filter((a) => a.status === "planned")
          .map((a) => {
            const ctrl = VAULT_CONTROL_MAP.find((c) => c.controlId === a.controlId);
            return {
              controlId: a.controlId,
              title: ctrl?.title ?? a.controlId,
              sprsWeight: ctrl?.sprsWeight ?? 0,
              poamTargetDate: a.poamTargetDate,
              poamNotes: a.poamNotes,
            };
          }),
      },
    };

    // Compute SHA-256 hash of SSP content for immutability record
    const sspJson = JSON.stringify(ssp);
    const sha256 = createHash("sha256").update(sspJson).digest("hex");

    // Mark wizard as complete (Phase 8 generates SSP)
    await db
      .update(onboardingWizardState)
      .set({
        phaseData: {
          ...(wizardState?.phaseData as Record<string, unknown> ?? {}),
          "8": { sspSha256: sha256, generatedAt: new Date().toISOString() },
        },
        updatedAt: new Date(),
      })
      .where(eq(onboardingWizardState.organizationId, orgId));

    return NextResponse.json({
      sha256,
      generatedAt: new Date().toISOString(),
      ssp,
      // blobKey would be populated after uploading to Azure Gov Blob Storage
      // This requires an AzureGovStorageService implementation
      blobKey: null,
      downloadUrl: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function deriveDefaultNarrative(
  ctrl: typeof VAULT_CONTROL_MAP[0],
  status: string | undefined
): string {
  if (ctrl.tier === "not_applicable") {
    return ctrl.naJustification ?? "Not applicable to this boundary.";
  }
  if (ctrl.tier === "azure_inherited") {
    return (
      "This control is inherited from Microsoft Azure Government. " +
      (ctrl.azureProvides?.join("; ") ?? "") +
      " MacTech Solutions LLC documents the inherited control boundary and maintains evidence references to Azure's FedRAMP package."
    );
  }
  if (status === "inherited") {
    return `Control inherited from Azure Government platform capabilities. ${ctrl.azureProvides?.join("; ") ?? ""}`;
  }
  return "";
}

function deriveResponsibleParty(ctrl: typeof VAULT_CONTROL_MAP[0]): string {
  switch (ctrl.tier) {
    case "azure_inherited":
      return "Microsoft Azure Government (FedRAMP inherited)";
    case "customer_managed":
      return "Customer Organization";
    case "not_applicable":
      return "N/A — Architecturally excluded";
    case "shared":
      return "Shared: MacTech Solutions LLC (platform) + Customer Organization (operational)";
    default:
      return "MacTech Solutions LLC";
  }
}
