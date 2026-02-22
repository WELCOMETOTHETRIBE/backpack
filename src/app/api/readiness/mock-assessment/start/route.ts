import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { controlImplementations, controls, controlFamilies, evidenceMetadata, evidenceControlLinks } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

const requestSchema = z.object({
  scope: z.enum(["full", "focused"]),
});

// Sample test cases and interview questions for different control types
const getTestCase = (controlId: string, title: string): string => {
  if (controlId.startsWith("AC.")) {
    return `Test access controls: Attempt to access a restricted resource and verify access is denied. Verify that access logs are generated.`;
  }
  if (controlId.startsWith("IA.")) {
    return `Test authentication: Attempt to authenticate without proper credentials. Verify MFA is enforced where required.`;
  }
  if (controlId.startsWith("AU.")) {
    return `Test audit logging: Perform an action and verify it is logged. Check that audit logs are protected from modification.`;
  }
  return `Execute a test procedure to verify the control is functioning as intended. Document the test results.`;
};

const getInterviewQuestions = (controlId: string, title: string): string[] => {
  return [
    `Describe how ${title} is implemented in your organization.`,
    `Who is responsible for maintaining this control?`,
    `How often is this control reviewed or validated?`,
    `What evidence demonstrates that this control is effective?`,
  ];
};

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const body = await requestSchema.parseAsync(await req.json());
    const { scope } = body;

    // Fetch controls based on scope
    let controlIds: string[] = [];
    if (scope === "full") {
      const allControls = await db.select({ id: controls.id }).from(controls);
      controlIds = allControls.map((c) => c.id);
    } else {
      // Focused: AC and IA families
      const focusedFamilies = await db
        .select({ id: controlFamilies.id })
        .from(controlFamilies)
        .where(inArray(controlFamilies.code, ["AC", "IA"]));
      
      const familyIds = focusedFamilies.map((f) => f.id);
      const focusedControls = await db
        .select({ id: controls.id })
        .from(controls)
        .where(inArray(controls.controlFamilyId, familyIds));
      
      controlIds = focusedControls.map((c) => c.id);
    }

    // Sample a representative subset (max 20 controls for focused assessment)
    const sampleSize = scope === "full" ? Math.min(30, controlIds.length) : Math.min(20, controlIds.length);
    const sampledIds = controlIds.sort(() => 0.5 - Math.random()).slice(0, sampleSize);

    // Fetch control details
    const controlDetails = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        id: controls.id,
      })
      .from(controls)
      .where(inArray(controls.id, sampledIds));

    // For each control, fetch linked evidence
    const controlsWithEvidence = await Promise.all(
      controlDetails.map(async (control) => {
        const impl = await db
          .select({ id: controlImplementations.id })
          .from(controlImplementations)
          .where(
            and(
              eq(controlImplementations.organizationId, orgId),
              eq(controlImplementations.controlId, control.id)
            )
          )
          .limit(1);

        let evidence: string[] = [];
        if (impl.length > 0) {
          const evidenceLinks = await db
            .select({
              evidenceId: evidenceMetadata.evidenceId,
              artifactFilename: evidenceMetadata.artifactFilename,
            })
            .from(evidenceControlLinks)
            .innerJoin(evidenceMetadata, eq(evidenceControlLinks.evidenceMetadataId, evidenceMetadata.id))
            .where(eq(evidenceControlLinks.controlImplementationId, impl[0].id))
            .limit(5);

          evidence = evidenceLinks.map((e) => `${e.evidenceId}: ${e.artifactFilename}`);
        }

        return {
          controlId: control.controlId,
          title: control.title,
          examineEvidence: evidence.length > 0 ? evidence : ["No evidence currently linked"],
          testCase: getTestCase(control.controlId, control.title),
          interviewQuestions: getInterviewQuestions(control.controlId, control.title),
        };
      })
    );

    return NextResponse.json({ controls: controlsWithEvidence });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
