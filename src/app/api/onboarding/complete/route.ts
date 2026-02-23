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
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { getInheritedControls } from "@/lib/compliance";

const requestSchema = z.object({
  organizationType: z.string().optional(),
  cmmcTargetLevel: z.string().optional(),
  cuiBoundary: z.string().optional(),
  systemScope: z.string().optional(),
  teamMembers: z.array(z.string().email()).optional(),
  selectedTechnologies: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const body = await requestSchema.parseAsync(await req.json());

    // Ensure all 110 controlRecords exist for the org
    const existingRecords = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId))
      .limit(1);
    if (existingRecords.length === 0) {
      await db.insert(controlRecords).values(
        ALL_CONTROL_IDS.map((controlId) => ({ organizationId: orgId, controlId }))
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

    // TODO: Send team member invitations via Resend

    await writeAuditLog({
      organizationId: orgId,
      action: "onboarding.complete",
      resourceType: "organization",
      resourceId: orgId,
      details: { organizationType: body.organizationType, cmmcTargetLevel: body.cmmcTargetLevel },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
