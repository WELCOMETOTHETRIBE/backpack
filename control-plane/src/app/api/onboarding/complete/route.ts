import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import {
  controlImplementations,
  controls,
  sspSections,
  controlRecords,
  boundaryProfiles,
  organizations,
  boundaries,
  governanceRegisters,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { getInheritedControls } from "@/lib/compliance";
// syncOrgAzureInheritedControls + syncInheritedControls intentionally NOT
// imported here — onboarding doesn't pre-flip inherited controls anymore.
// They run via /api/boundary/sync-inherited-controls (manual button) or
// when cloud evidence is ingested.
import { computeAndPersistSprsScore } from "@/lib/sprs";
import { REGISTER_DEFINITIONS } from "@/lib/governance/seed-data";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { generateClientRequiredPoams } from "@/lib/onboarding/generate-client-poams";

// Defense-in-depth: every optional field is .nullish() so a null sent by a
// caller (e.g. wizard passing through a stored null cageCode) is treated as
// "not provided" instead of failing Zod validation with an opaque "Invalid
// request". The wizard now strips nulls client-side too, but accepting them
// here means future callers can't trip on this same edge.
const requestSchema = z.object({
  name: z.string().nullish(),
  cageCode: z.string().max(10).nullish(),
  primaryAddress: z.string().nullish(),
  primaryContactName: z.string().max(255).nullish(),
  primaryContactEmail: z.string().max(255).nullish(),
  organizationType: z.string().nullish(),
  cmmcTargetLevel: z.string().nullish(),
  cuiBoundary: z.string().nullish(),
  systemScope: z.string().nullish(),
  teamMembers: z.array(z.string()).nullish(),
  selectedTechnologies: z.array(z.string()).nullish(),
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmails(emails: string[]): string[] {
  return emails.filter((e) => e.trim() && EMAIL_REGEX.test(e.trim()));
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const actor = await requireRole(["Admin"]);

    const body = await requestSchema.parseAsync(await req.json());

    // Persist organization profile (from welcome questionnaire or wizard)
    const orgUpdates: Record<string, string | null> = {
      organizationType: body.organizationType ?? null,
      cmmcTargetLevel: body.cmmcTargetLevel ?? null,
    };
    // Schema accepts null | undefined | string for these fields. Treat null
    // and undefined identically: "not provided, leave existing value alone".
    if (body.name != null && body.name.trim()) orgUpdates.name = body.name.trim();
    if (body.cageCode != null) orgUpdates.cageCode = body.cageCode.slice(0, 10);
    if (body.primaryAddress != null) orgUpdates.primaryAddress = body.primaryAddress;
    if (body.primaryContactName != null) orgUpdates.primaryContactName = body.primaryContactName.slice(0, 255);
    if (body.primaryContactEmail != null) orgUpdates.primaryContactEmail = body.primaryContactEmail.slice(0, 255);
    await db
      .update(organizations)
      .set(orgUpdates)
      .where(eq(organizations.id, orgId));

    // Ensure all 110 controlRecords exist for the org. Earlier phases of the
    // wizard (boundary confirmation, etc.) hit /api/onboarding/adjudicate-controls
    // which creates a SUBSET of records as a side effect — so a `limit(1)`
    // existence check would return true after partial creation and cause /complete
    // to skip the full backfill. Bug observed in prod: orgs ended up with 4
    // records (the strict-inherited 3.10 family) instead of 110, breaking the
    // Outstanding Controls Wizard. Fix: backfill any missing IDs unconditionally,
    // leaving existing records untouched.
    const existingRecords = await db
      .select({ controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));
    const existingIds = new Set(existingRecords.map((r) => r.controlId));
    const missing = ALL_CONTROL_IDS.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      await db.insert(controlRecords).values(
        missing.map((controlId) => ({ organizationId: orgId, controlId }))
      );
    }

    // If boundary profile provided, save it and set inherited controls
    const selectedTechnologies = body.selectedTechnologies ?? [];
    if (selectedTechnologies.length > 0) {
      const [existingProfile] = await db
        .select({ id: boundaryProfiles.id })
        .from(boundaryProfiles)
        .where(eq(boundaryProfiles.organizationId, orgId))
        .limit(1);
      const deduped = [...new Set(selectedTechnologies)];
      if (existingProfile) {
        await db
          .update(boundaryProfiles)
          .set({ selectedTechnologies: deduped, updatedAt: new Date() })
          .where(eq(boundaryProfiles.id, existingProfile.id));
      } else {
        await db.insert(boundaryProfiles).values({
          organizationId: orgId,
          selectedTechnologies: deduped,
        });
      }
      const inherited = getInheritedControls(deduped);
      for (const { controlId, inheritedFrom } of inherited) {
        await db
          .update(controlRecords)
          .set({
            implementationStatus: "inherited",
            inheritedFrom,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(controlRecords.organizationId, orgId),
              eq(controlRecords.controlId, controlId)
            )
          );
      }
    }

    // ── Create CUI boundary if none exists ──────────────────────────────────
    // The evidence engine, registers, and OS baselines all require a boundary row.
    const [existingBoundary] = await db
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId))
      .limit(1);

    if (!existingBoundary) {
      // MacTech Vault is the only supported enclave. Every org gets exactly
      // one boundary, created silently — no user input needed. It runs on
      // Azure Government, so we record cloudProvider/azureEnvironment up
      // front — that's what enables the 3.10.x physical-protection inheritance
      // sync immediately below.
      await db.insert(boundaries).values({
        organizationId: orgId,
        name: "MacTech CUI Vault",
        description:
          "Primary CUI processing boundary. Runs on MacTech's Azure Government / FedRAMP High enclave; managed by MacTech.",
        scopeComponents: ["mactech_vault_azure_gov"],
        boundaryType: "cui_enclave",
        cloudProvider: "azure",
        azureEnvironment: "gov",
      });
    } else {
      // Backfill cloudProvider/azureEnvironment if they're missing so the
      // Azure sync below can correctly mark 3.10.1–3.10.5 inherited.
      await db
        .update(boundaries)
        .set({ cloudProvider: "azure", azureEnvironment: "gov", updatedAt: new Date() })
        .where(
          and(
            eq(boundaries.organizationId, orgId),
            eq(boundaries.id, existingBoundary.id),
            sql`(${boundaries.cloudProvider} IS NULL OR ${boundaries.azureEnvironment} IS NULL)`
          )
        );
    }

    // INTENTIONALLY DO NOT auto-flip inherited controls during onboarding.
    //
    // Earlier versions called syncOrgAzureInheritedControls + syncInheritedControls
    // here, which flipped 3.10.1, .2, .4, .5 to status='inherited' the moment
    // onboarding completed. That made the dashboard show "4/110 adjudicated"
    // before the customer had actually uploaded any evidence — misleading.
    //
    // Correct architecture: adjudication progresses with EVIDENCE, not with
    // signup. The 4 strict-inherited controls flip to 'inherited' when the
    // customer's cloud evidence run (validate_azure_entra.py output) is
    // ingested — that report is what proves the boundary is on Azure Gov
    // FedRAMP High in the first place. Until then they stay un-adjudicated.
    //
    // External-service-provider inheritance (additional providers the
    // customer declared) is similarly deferred — it'll be applied via the
    // "Re-sync inherited controls" button on /dashboard/boundary or the
    // evidence-upload flow, not during onboarding.

    // ── Seed governance registers eagerly ────────────────────────────────────
    // Registers are needed for dashboard health metrics, evidence engine, and control status.
    const existingRegs = await db
      .select({ id: governanceRegisters.id })
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId))
      .limit(1);

    if (existingRegs.length === 0) {
      // Build control-to-register mapping from intelligence data
      const registerControlMap = new Map<string, string[]>();
      for (const intel of CONTROL_INTELLIGENCE) {
        if (intel.registerRequired && intel.registerSchemaId) {
          const existing = registerControlMap.get(intel.registerSchemaId) ?? [];
          existing.push(intel.controlId);
          registerControlMap.set(intel.registerSchemaId, existing);
        }
      }

      // Ensure global templates exist
      let templates = await db
        .select()
        .from(governanceRegisters)
        .where(sql`${governanceRegisters.organizationId} IS NULL`);

      if (templates.length === 0) {
        for (const def of REGISTER_DEFINITIONS) {
          await db.insert(governanceRegisters).values({
            organizationId: null,
            projectId: null,
            registerKey: def.registerKey,
            name: def.name,
            description: def.description ?? null,
            requiredColumns: def.requiredColumns,
            retainForDays: def.retainForDays ?? null,
          });
        }
        templates = await db
          .select()
          .from(governanceRegisters)
          .where(sql`${governanceRegisters.organizationId} IS NULL`);
      }

      // Copy templates to org with controlIds mapping
      for (const t of templates) {
        const controlIds = registerControlMap.get(t.registerKey) ?? [];
        await db.insert(governanceRegisters).values({
          organizationId: orgId,
          projectId: null,
          registerKey: t.registerKey,
          name: t.name,
          description: t.description,
          requiredColumns: t.requiredColumns,
          retainForDays: t.retainForDays,
          controlIds: controlIds.length > 0 ? controlIds : null,
        });
      }
    }

    // Initialize all controls to "Not Started" if not already initialized (legacy controlImplementations)
    const existingImpls = await db
      .select()
      .from(controlImplementations)
      .where(eq(controlImplementations.organizationId, orgId))
      .limit(1);

    if (existingImpls.length === 0) {
      // Get all controls
      const allControls = await db.select().from(controls);

      // Create implementations for all controls
      await db.insert(controlImplementations).values(
        allControls.map((control) => ({
          organizationId: orgId,
          controlId: control.id,
          status: "Not Started" as const,
        }))
      );
    }

    // Save system description to SSP if provided
    if (body.systemScope) {
      const existingSection = await db
        .select()
        .from(sspSections)
        .where(
          and(
            eq(sspSections.organizationId, orgId),
            eq(sspSections.sectionKey, "system_description")
          )
        )
        .limit(1);

      if (existingSection.length === 0) {
        await db.insert(sspSections).values({
          organizationId: orgId,
          documentCode: "SSP",
          sectionKey: "system_description",
          title: "System Description",
          content: body.systemScope,
          orderIndex: 1,
        });
      } else {
        // Update existing section
        await db
          .update(sspSections)
          .set({ content: body.systemScope })
          .where(eq(sspSections.id, existingSection[0].id));
      }
    }

    // Save CUI boundary if provided
    if (body.cuiBoundary) {
      const existingSection = await db
        .select()
        .from(sspSections)
        .where(
          and(
            eq(sspSections.organizationId, orgId),
            eq(sspSections.sectionKey, "cui_boundary")
          )
        )
        .limit(1);

      if (existingSection.length === 0) {
        await db.insert(sspSections).values({
          organizationId: orgId,
          documentCode: "SSP",
          sectionKey: "cui_boundary",
          title: "CUI Boundary",
          content: body.cuiBoundary,
          orderIndex: 2,
        });
      }
    }

    // Recompute SPRS so dashboard shows score (including inherited controls)
    const sprsScore = await computeAndPersistSprsScore(orgId);

    // Auto-generate open POA&Ms for every control with client-required
    // artifacts (training certs, IR tabletop AAR, rosters, scans, etc.).
    // MacTech delivers the technical + policy evidence; these POAMs give the
    // client a concrete worklist of what they must still produce themselves.
    const poamGeneration = await generateClientRequiredPoams(orgId);

    // Use only valid email addresses for future team-invite feature
    const _validTeamEmails = validEmails(body.teamMembers ?? []);
    // TODO: Send team member invitations via Resend using _validTeamEmails

    await writeAuditLog({
      organizationId: orgId,
      action: "onboarding.complete",
      resourceType: "organization",
      resourceId: orgId,
      details: {
        organizationType: body.organizationType,
        cmmcTargetLevel: body.cmmcTargetLevel,
        poamsCreated: poamGeneration.created,
        poamMilestonesCreated: poamGeneration.totalMilestones,
        placeholderArtifactsCreated: poamGeneration.placeholdersCreated,
      },
    });

    return NextResponse.json({
      success: true,
      sprsScore,
      poamsCreated: poamGeneration.created,
      poamMilestonesCreated: poamGeneration.totalMilestones,
      placeholderArtifactsCreated: poamGeneration.placeholdersCreated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
