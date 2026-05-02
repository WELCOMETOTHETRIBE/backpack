/**
 * Issue (or rotate) an EnclaveWatch bearer token for an organization.
 *
 * Usage:
 *   npx tsx src/scripts/issue-enclavewatch-token.ts --org-id <uuid>
 *   npx tsx src/scripts/issue-enclavewatch-token.ts --org-slug mactech-solutions-llc
 *
 *   --rotate   force a new token even if one already exists (revokes the old one)
 *   --reveal   print the existing token without rotating (read-only)
 *
 * The token is a 256-bit random value, base64url-encoded (43 chars), prefixed
 * with `ew_` so it's identifiable in logs / leak scanners. Store it securely;
 * EnclaveWatch reads it from appsettings (`Codex:ApiToken`) on the vault.
 *
 * The token authorizes EnclaveWatch's three ingest endpoints:
 *   POST /api/evidence/v2/ingest                  (OS bundle + validator)
 *   POST /api/os-baselines/boundaries/{id}/evidence-runs/import-report  (Azure validator)
 *   POST /api/enclavewatch/weekly-review/ingest   (signed weekly acknowledgement)
 *
 * The org is resolved server-side from the token -- EnclaveWatch never has
 * to know the orgId or boundaryId (the latter is auto-resolved via the
 * org's primary boundary).
 */
import { db } from "../db";
import { organizations } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function parseArgs(argv: string[]) {
  const out: { orgId?: string; orgSlug?: string; rotate: boolean; reveal: boolean } = {
    rotate: false,
    reveal: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org-id") out.orgId = argv[++i];
    else if (a === "--org-slug") out.orgSlug = argv[++i];
    else if (a === "--rotate") out.rotate = true;
    else if (a === "--reveal") out.reveal = true;
  }
  return out;
}

function generateToken(): string {
  // 256-bit random, base64url (43 chars), `ew_` prefix for identification.
  return "ew_" + randomBytes(32).toString("base64url");
}

async function resolveOrgId(args: ReturnType<typeof parseArgs>): Promise<string> {
  if (args.orgId) return args.orgId;
  if (!args.orgSlug) throw new Error("Need --org-id or --org-slug");
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, args.orgSlug))
    .limit(1);
  if (!org) throw new Error(`Org with slug "${args.orgSlug}" not found`);
  return org.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = await resolveOrgId(args);

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      existing: organizations.enclavewatchApiToken,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new Error(`Org ${orgId} not found`);

  console.log("─".repeat(70));
  console.log(`Org:    ${org.name}  [${org.slug}]`);
  console.log(`Org ID: ${org.id}`);

  if (args.reveal) {
    if (!org.existing) {
      console.log("No token issued yet. Re-run without --reveal to generate one.");
      process.exit(0);
    }
    console.log(`\nExisting token (DO NOT SHARE BEYOND THE VAULT OPERATOR):\n  ${org.existing}\n`);
    process.exit(0);
  }

  if (org.existing && !args.rotate) {
    console.log(
      "\nA token already exists for this org. Re-run with --rotate to revoke + replace it,",
    );
    console.log("or with --reveal to print the existing token.");
    process.exit(1);
  }

  const token = generateToken();
  await db
    .update(organizations)
    .set({ enclavewatchApiToken: token })
    .where(eq(organizations.id, orgId));

  console.log(`\n✓ Token ${args.rotate ? "rotated" : "issued"}.`);
  console.log("\nGive this to the vault operator (one-time display):");
  console.log("─".repeat(70));
  console.log(`  ${token}`);
  console.log("─".repeat(70));
  console.log("\nVault operator: paste into appsettings.Production.json:");
  console.log(`  "Codex": { "ApiToken": "${token}", "BaseUrl": "https://codex.mactechsolutionsllc.com" }`);
  console.log("\nEnclaveWatch will use this token in the Authorization: Bearer header on all ingest pushes.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
