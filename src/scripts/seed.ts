/**
 * Seed script: control families, 110 controls from TRUST_CODEX manual-data.json,
 * optional default org and user.
 * Run: npm run seed (or npx tsx src/scripts/seed.ts)
 */
import { db } from "../db";
import {
  controlFamilies,
  controls,
  controlImplementations,
  organizations,
  users,
} from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const FAMILY_NAMES: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CM: "Configuration Management",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PE: "Physical and Environmental Protection",
  PL: "Planning",
  PS: "Personnel Security",
  RA: "Risk Assessment",
  SA: "System and Services Acquisition",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
};

async function seed() {
  console.log("Seeding control families...");
  const familyIds: Record<string, string> = {};
  for (const [code, name] of Object.entries(FAMILY_NAMES)) {
    const [existing] = await db.select().from(controlFamilies).where(eq(controlFamilies.code, code));
    if (existing) {
      familyIds[code] = existing.id;
    } else {
      const [row] = await db
        .insert(controlFamilies)
        .values({ code, name, description: `NIST SP 800-171 Rev 2 - ${name}` })
        .returning({ id: controlFamilies.id });
      if (row) familyIds[code] = row.id;
    }
  }

  const manualPath = path.join(
    process.cwd(),
    "..",
    "TRUST_CODEX",
    "manual_app",
    "manual-data.json"
  );
  if (!fs.existsSync(manualPath)) {
    console.warn("manual-data.json not found at", manualPath, "- skipping control seed");
  } else {
    const manual = JSON.parse(fs.readFileSync(manualPath, "utf-8")) as {
      controls: Array<{
        control_id: string;
        family: string;
        nist_req_id: string;
        title: string;
        nist_exact_text?: string;
        nist_discussion_guidance?: string;
        classification?: string;
        pilot_status?: string;
        pilot_status_basis?: string;
        evidence?: { evidence_type?: string; artifact_name?: string; location?: string; regeneration_method?: string };
        policy_sop_refs?: string;
        implementation_summary?: string;
      }>;
    };
    console.log("Seeding", manual.controls.length, "controls...");
    for (const c of manual.controls) {
      const familyId = familyIds[c.family];
      if (!familyId) continue;
      const codexMetadata =
        c.classification || c.pilot_status_basis || c.evidence || c.policy_sop_refs
          ? {
              classification: c.classification ?? null,
              pilot_status: c.pilot_status ?? null,
              pilot_status_basis: c.pilot_status_basis ?? null,
              evidence: c.evidence ?? null,
              policy_sop_refs: c.policy_sop_refs ?? null,
              implementation_summary: c.implementation_summary ?? null,
            }
          : null;
      await db
        .insert(controls)
        .values({
          controlFamilyId: familyId,
          controlId: c.control_id,
          nistReqId: c.nist_req_id,
          title: c.title,
          nistExactText: c.nist_exact_text ?? null,
          nistDiscussionGuidance: c.nist_discussion_guidance ?? null,
          codexMetadata,
        })
        .onConflictDoUpdate({
          target: controls.controlId,
          set: {
            title: c.title,
            nistExactText: c.nist_exact_text ?? null,
            nistDiscussionGuidance: c.nist_discussion_guidance ?? null,
            codexMetadata: codexMetadata ?? undefined,
          },
        });
    }
  }

  const defaultOrgSlug = process.env.SEED_ORG_SLUG ?? "default";
  let orgId: string;
  const [existingOrg] = await db.select().from(organizations).where(eq(organizations.slug, defaultOrgSlug));
  if (existingOrg) {
    orgId = existingOrg.id;
    console.log("Using existing organization:", existingOrg.name);
  } else {
    const [newOrg] = await db
      .insert(organizations)
      .values({ name: "Default Organization", slug: defaultOrgSlug })
      .returning({ id: organizations.id });
    orgId = newOrg!.id;
    console.log("Created organization:", orgId);
  }

  const defaultEmail = process.env.SEED_USER_EMAIL ?? "admin@example.com";
  const defaultPassword = process.env.SEED_USER_PASSWORD ?? "changeme";
  const [existingUser] = await db.select().from(users).where(eq(users.email, defaultEmail));
  if (existingUser) {
    console.log("User already exists:", defaultEmail);
  } else {
    const hash = await bcrypt.hash(defaultPassword, 10);
    await db.insert(users).values({
      organizationId: orgId,
      email: defaultEmail,
      passwordHash: hash,
      name: "Admin",
      role: "Admin",
    });
    console.log("Created user:", defaultEmail);
  }

  const allControls = await db.select().from(controls);
  const existingImpls = await db
    .select({ controlId: controlImplementations.controlId })
    .from(controlImplementations)
    .where(eq(controlImplementations.organizationId, orgId));
  const existingSet = new Set(existingImpls.map((r) => r.controlId));
  let created = 0;
  for (const c of allControls) {
    if (existingSet.has(c.id)) continue;
    await db.insert(controlImplementations).values({
      organizationId: orgId,
      controlId: c.id,
      status: "Not Started",
    });
    created++;
  }
  console.log("Created", created, "control implementations for default org.");
  console.log("Seed done.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
