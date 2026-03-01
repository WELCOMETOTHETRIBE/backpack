/**
 * Seed OS Baselines: one baseline_profile (Windows Server 2025 Member Server) plus
 * baseline_control and baseline_check rows from windows-server-2025.member-server.v1.json.
 * Run: npx tsx src/scripts/seed-baseline-windows-server-2025.ts
 */
import { db } from "../db";
import { osBaselineProfiles, baselineControls, baselineChecks } from "../db/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

type BaselineControlApplicability = "required" | "conditional" | "na_by_default";

type BaselineJson = {
  schema: string;
  profile: {
    name: string;
    version: string;
    os_family: string;
    os_version: string;
    role: string;
    description?: string;
  };
  controls: Array<{
    control_id: string;
    applicability: BaselineControlApplicability;
    rationale?: string;
  }>;
  checks: Array<{
    check_id: string;
    control_id: string;
    expected_setting: string;
    evidence_required_files: string[];
    validation?: unknown;
    remediation_guidance?: string;
    manual_commands?: string[];
  }>;
};

async function seedBaseline() {
  const jsonPath = path.join(
    __dirname,
    "../data/baselines/windows-server-2025.member-server.v1.json"
  );
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw) as BaselineJson;

  const { profile, controls, checks } = data;
  const osFamily = profile.os_family as "windows_server" | "windows_client" | "linux";
  const role = profile.role as "member_server" | "domain_controller" | "workstation";

  const [existing] = await db
    .select()
    .from(osBaselineProfiles)
    .where(
      and(
        eq(osBaselineProfiles.name, profile.name),
        eq(osBaselineProfiles.version, profile.version),
        eq(osBaselineProfiles.osFamily, osFamily),
        eq(osBaselineProfiles.role, role)
      )
    );

  let profileId: string;
  if (existing) {
    console.log("Baseline profile already exists:", existing.id, profile.name);
    profileId = existing.id;
  } else {
    const [inserted] = await db
      .insert(osBaselineProfiles)
      .values({
        name: profile.name,
        version: profile.version,
        osFamily,
        osVersion: profile.os_version,
        role,
        description: profile.description ?? null,
      })
      .returning({ id: osBaselineProfiles.id });
    if (!inserted) throw new Error("Failed to insert baseline profile");
    profileId = inserted.id;
    console.log("Inserted baseline profile:", profileId, profile.name);
  }

  console.log("Seeding baseline_control...");
  for (const c of controls) {
    const [existingControl] = await db
      .select()
      .from(baselineControls)
      .where(
        and(
          eq(baselineControls.baselineProfileId, profileId),
          eq(baselineControls.controlId, c.control_id)
        )
      );
    if (existingControl) {
      console.log("  Skip (exists):", c.control_id);
      continue;
    }
    await db.insert(baselineControls).values({
      baselineProfileId: profileId,
      controlId: c.control_id,
      applicability: c.applicability,
      rationale: c.rationale ?? null,
    });
    console.log("  Inserted:", c.control_id);
  }

  console.log("Seeding baseline_check...");
  for (const ch of checks) {
    const [existingCheck] = await db
      .select()
      .from(baselineChecks)
      .where(
        and(
          eq(baselineChecks.baselineProfileId, profileId),
          eq(baselineChecks.checkId, ch.check_id)
        )
      );
    if (existingCheck) {
      console.log("  Skip (exists):", ch.check_id);
      continue;
    }
    await db.insert(baselineChecks).values({
      baselineProfileId: profileId,
      checkId: ch.check_id,
      controlId: ch.control_id,
      expectedSetting: ch.expected_setting,
      evidenceRequiredFiles: ch.evidence_required_files ?? [],
      validation: ch.validation ? (ch.validation as Record<string, unknown>) : null,
      remediationGuidance: ch.remediation_guidance ?? null,
      manualCommands: ch.manual_commands ?? null,
    });
    console.log("  Inserted:", ch.check_id);
  }

  console.log("OS Baselines seed done.");
}

seedBaseline().catch((err) => {
  console.error(err);
  process.exit(1);
});
