import { NextResponse } from "next/server";
import { db } from "@/db";
import { boundaryProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * Maps interview answers to boundary profile technology keys.
 * Step 1: where employees work
 * Step 2: file storage (multi)
 * Step 3: identity (multi)
 * Step 4: computers
 * Step 5: security tools (multi)
 * Step 6: cloud provider (multi)
 */
function mapInterviewToKeys(answers: {
  step1?: string;
  step2?: string | string[];
  step3?: string | string[];
  step4?: string;
  step5?: string[];
  step6?: string | string[];
}): string[] {
  const keys: string[] = [];

  // Step 1: Where do your employees typically work?
  const s1 = answers.step1;
  if (s1 === "office") keys.push("on_prem_network");
  if (s1 === "remote") keys.push("remote_workforce");
  if (s1 === "both") {
    keys.push("on_prem_network", "remote_workforce");
  }

  // Step 2: How do you store and share files? (multi)
  const s2 = Array.isArray(answers.step2) ? answers.step2 : answers.step2 ? [answers.step2] : [];
  if (s2.includes("m365")) keys.push("m365");
  if (s2.includes("google_workspace")) keys.push("google_workspace");
  if (s2.includes("server_office")) keys.push("on_prem_ad");
  if (s2.includes("other_cloud")) keys.push("other_cloud");

  // Step 3: How do you manage user accounts and passwords? (multi)
  const s3 = Array.isArray(answers.step3) ? answers.step3 : answers.step3 ? [answers.step3] : [];
  if (s3.includes("entra_id")) keys.push("entra_id");
  if (s3.includes("google_workspace")) keys.push("google_workspace");
  if (s3.includes("on_prem_ad")) keys.push("on_prem_ad");
  if (s3.includes("okta")) keys.push("okta");

  // Step 4: What kind of computers?
  const s4 = answers.step4;
  if (s4 === "windows") keys.push("windows_workstation");
  if (s4 === "macs") keys.push("macos");
  if (s4 === "both") {
    keys.push("windows_workstation", "macos");
  }

  // Step 5: Security tools (multi)
  const s5 = answers.step5 ?? [];
  if (s5.includes("defender")) keys.push("defender");
  if (s5.includes("crowdstrike")) keys.push("crowdstrike");
  if (s5.includes("sentinelone")) keys.push("sentinelone");
  if (s5.includes("intune")) keys.push("intune");
  if (s5.includes("jamf")) keys.push("jamf");
  if (s5.includes("tenable")) keys.push("tenable");
  if (s5.includes("splunk")) keys.push("splunk");

  // Step 6: Cloud provider (multi)
  const s6 = Array.isArray(answers.step6) ? answers.step6 : answers.step6 ? [answers.step6] : [];
  if (s6.includes("azure_commercial")) keys.push("azure_commercial");
  if (s6.includes("azure_gov")) keys.push("azure_gov");
  if (s6.includes("aws")) keys.push("aws");
  if (s6.includes("gcp")) keys.push("gcp");

  return [...new Set(keys)];
}

/**
 * POST /api/boundary/profile-from-interview
 * Body: { step1?, step2?, step3?, step4?, step5?, step6? } (interview answers)
 * Maps answers to technology keys and saves to boundaryProfiles.selectedTechnologies.
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json().catch(() => ({}));
    const selectedTechnologies = mapInterviewToKeys({
      step1: body.step1,
      step2: body.step2,
      step3: body.step3,
      step4: body.step4,
      step5: body.step5,
      step6: body.step6,
    });

    const [existing] = await db
      .select({ id: boundaryProfiles.id })
      .from(boundaryProfiles)
      .where(eq(boundaryProfiles.organizationId, orgId))
      .limit(1);

    const now = new Date();
    if (existing) {
      await db
        .update(boundaryProfiles)
        .set({ selectedTechnologies, updatedAt: now })
        .where(eq(boundaryProfiles.id, existing.id));
    } else {
      await db.insert(boundaryProfiles).values({
        organizationId: orgId,
        selectedTechnologies,
      });
    }

    return NextResponse.json({ selectedTechnologies });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save boundary profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
