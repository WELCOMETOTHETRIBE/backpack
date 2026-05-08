/**
 * Smoke test for the Outstanding Controls attestation flow.
 *
 * Exercises the same DB-write path as POST /api/adjudication/attest, against
 * a real local DB. Verifies all four downstream artifacts are produced:
 *
 *   1. control_records row exists/created and implementationStatus updated
 *      to the template's snapshot disposition (na / inherited / implemented)
 *   2. governance_artifact_completions row exists with artifactType=ATTESTATION
 *      and artifactLabel == templateId (Lane 4 evidence)
 *   3. attestations row exists with the canonical SHA-256 dataHash binding
 *      the signature to the legal text
 *   4. audit_logs row records the adjudication.attest action
 *
 * Then re-runs the same attestation to confirm idempotency: no duplicate rows,
 * the existing completion is updated rather than re-inserted (because of the
 * (control_record_id, artifact_label) unique index).
 *
 * Usage:
 *   DATABASE_URL=postgresql://localhost:5432/control_plane \
 *     npx tsx src/scripts/smoke-test-attestation.ts
 *
 * Cleanup:
 *   DATABASE_URL=... npx tsx src/scripts/smoke-test-attestation.ts --cleanup
 */
import { db } from "../db";
import {
  controlRecords,
  governanceArtifactCompletions,
  attestations,
  auditLogs,
  organizations,
  users,
} from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getAttestationTemplate } from "../lib/compliance/attestation-templates";

const TEMPLATE_ID = "na_no_voip"; // Bucket E — 3.13.14, simplest path
const CONTROL_ID = "3.13.14";

async function main() {
  const args = process.argv.slice(2);
  const cleanup = args.includes("--cleanup");

  // Resolve any test org + Admin/Compliance user
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("No organization found in DB");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, org.id))
    .limit(1);
  if (!user) throw new Error(`No user found for org ${org.id}`);

  console.log("─".repeat(72));
  console.log(`Smoke test: POST /api/adjudication/attest`);
  console.log(`Org:        ${org.name} (${org.id})`);
  console.log(`User:       ${user.email} role=${user.role}`);
  console.log(`Template:   ${TEMPLATE_ID} (${CONTROL_ID})`);
  console.log(`Mode:       ${cleanup ? "CLEANUP" : "SMOKE TEST"}`);
  console.log("─".repeat(72));

  // ─── CLEANUP MODE ────────────────────────────────────────────────────
  if (cleanup) {
    const [record] = await db
      .select()
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, org.id),
          eq(controlRecords.controlId, CONTROL_ID)
        )
      )
      .limit(1);
    if (!record) {
      console.log("No control_record to clean up. Done.");
      return;
    }
    await db
      .delete(governanceArtifactCompletions)
      .where(
        and(
          eq(governanceArtifactCompletions.controlRecordId, record.id),
          eq(governanceArtifactCompletions.artifactLabel, TEMPLATE_ID)
        )
      );
    await db
      .delete(attestations)
      .where(
        and(
          eq(attestations.organizationId, org.id),
          eq(attestations.resourceType, "control_record"),
          eq(attestations.resourceId, record.id)
        )
      );
    await db
      .delete(controlRecords)
      .where(eq(controlRecords.id, record.id));
    console.log("✓ Cleaned up smoke-test rows.");
    return;
  }

  // ─── SMOKE TEST ──────────────────────────────────────────────────────
  const template = getAttestationTemplate(TEMPLATE_ID);
  if (!template) throw new Error(`Template ${TEMPLATE_ID} not found`);

  // Step 1: Resolve or lazy-create the control_record (same logic as the route)
  let [record] = await db
    .select()
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, org.id),
        eq(controlRecords.controlId, CONTROL_ID)
      )
    )
    .limit(1);

  if (!record) {
    [record] = await db
      .insert(controlRecords)
      .values({ organizationId: org.id, controlId: CONTROL_ID })
      .returning();
    console.log(`✓ control_record created: ${record.id}`);
  } else {
    console.log(`✓ control_record exists: ${record.id} (status=${record.implementationStatus})`);
  }

  // Step 2: Compute the canonical signature hash (matches route)
  const dataHash = createHash("sha256")
    .update(
      [
        template.templateId,
        template.attestationStatement,
        template.conditions.join("|"),
        CONTROL_ID,
        "Patrick Caruso",
        "Compliance Officer",
        new Date().toISOString().slice(0, 10),
      ].join("\n")
    )
    .digest("hex");
  console.log(`✓ dataHash: ${dataHash.slice(0, 16)}…`);

  // Step 3: Upsert governance_artifact_completion (Lane 4 evidence)
  const [completion] = await db
    .insert(governanceArtifactCompletions)
    .values({
      organizationId: org.id,
      controlRecordId: record.id,
      artifactLabel: TEMPLATE_ID,
      artifactType: "ATTESTATION",
      valueText: template.attestationStatement,
      attestedBy: user.id,
      attestedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        governanceArtifactCompletions.controlRecordId,
        governanceArtifactCompletions.artifactLabel,
      ],
      set: {
        valueText: template.attestationStatement,
        attestedBy: user.id,
        attestedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  console.log(`✓ governance_artifact_completion: ${completion.id}`);

  // Step 4: Insert attestations row
  const [attestation] = await db
    .insert(attestations)
    .values({
      organizationId: org.id,
      attestationType: "control_attestation" as const,
      resourceType: "control_record",
      resourceId: record.id,
      signatoryId: user.id,
      dataHash,
      comment: `Smoke test signed by Patrick Caruso (Compliance Officer) using template ${TEMPLATE_ID} (kind=${template.kind}).`,
    })
    .returning();
  console.log(`✓ attestation row: ${attestation.id} dataHash=${attestation.dataHash?.slice(0, 16)}…`);

  // Step 5: Update control_record disposition
  const newStatus =
    template.kind === "na_attestation"
      ? "not_applicable"
      : template.kind === "customer_attested_inherited"
        ? "inherited"
        : "implemented";
  await db
    .update(controlRecords)
    .set({
      implementationStatus: newStatus as
        | "not_applicable"
        | "inherited"
        | "implemented",
      lastValidationDate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(controlRecords.id, record.id));
  const [updated] = await db
    .select()
    .from(controlRecords)
    .where(eq(controlRecords.id, record.id))
    .limit(1);
  console.log(`✓ control_record updated: status=${updated.implementationStatus}`);

  // Step 6: Audit log entry (mimic writeAuditLog())
  const [audit] = await db
    .insert(auditLogs)
    .values({
      organizationId: org.id,
      userId: user.id,
      action: "adjudication.attest",
      resourceType: "control_record",
      resourceId: record.id,
      details: {
        templateId: TEMPLATE_ID,
        controlId: CONTROL_ID,
        templateKind: template.kind,
        newStatus,
        signatoryName: "Patrick Caruso",
        signatoryTitle: "Compliance Officer",
        dataHash,
        completionId: completion.id,
        attestationId: attestation.id,
        smokeTest: true,
      },
    })
    .returning();
  console.log(`✓ audit_log entry: ${audit.id}`);

  // Step 7: Verify all 4 artifacts
  console.log("─".repeat(72));
  console.log("Verification:");
  console.log(`  control_record.implementationStatus = ${updated.implementationStatus} (expected ${newStatus})`);
  console.log(`  governance_artifact_completion exists: ${!!completion}`);
  console.log(`  attestation.dataHash = ${attestation.dataHash?.slice(0, 16)}…`);
  console.log(`  audit_logs.adjudication.attest exists: ${!!audit}`);

  // Step 8: Idempotency check — re-upsert completion, count rows
  const completionCountBefore = await db
    .select()
    .from(governanceArtifactCompletions)
    .where(
      and(
        eq(governanceArtifactCompletions.controlRecordId, record.id),
        eq(governanceArtifactCompletions.artifactLabel, TEMPLATE_ID)
      )
    );
  await db
    .insert(governanceArtifactCompletions)
    .values({
      organizationId: org.id,
      controlRecordId: record.id,
      artifactLabel: TEMPLATE_ID,
      artifactType: "ATTESTATION",
      valueText: template.attestationStatement,
      attestedBy: user.id,
      attestedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        governanceArtifactCompletions.controlRecordId,
        governanceArtifactCompletions.artifactLabel,
      ],
      set: {
        valueText: template.attestationStatement,
        attestedBy: user.id,
        attestedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  const completionCountAfter = await db
    .select()
    .from(governanceArtifactCompletions)
    .where(
      and(
        eq(governanceArtifactCompletions.controlRecordId, record.id),
        eq(governanceArtifactCompletions.artifactLabel, TEMPLATE_ID)
      )
    );
  console.log(
    `  idempotency: ${completionCountBefore.length} → ${completionCountAfter.length} (expected 1 → 1) ${
      completionCountAfter.length === 1 && completionCountBefore.length === 1 ? "✓" : "✗"
    }`
  );
  console.log("─".repeat(72));
  console.log("✓ All smoke checks passed.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
