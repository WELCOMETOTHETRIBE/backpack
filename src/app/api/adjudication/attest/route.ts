import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  governanceArtifactCompletions,
  attestations,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getAttestationTemplate } from "@/lib/compliance/attestation-templates";
import { createHash } from "node:crypto";

/**
 * POST /api/adjudication/attest
 *
 * Body:
 *   {
 *     templateId: string,           // from attestation_templates.v1.json
 *     controlId: string,            // NIST 800-171 control ID this attestation closes
 *     signatoryName: string,
 *     signatoryTitle: string,
 *     acceptedConditions: string[], // exact `conditions` from the template the user is affirming
 *     comment?: string
 *   }
 *
 * What it does:
 *   1. Resolves the attestation template (canonical source for the legal statement).
 *   2. Validates that the customer is affirming every condition (not partial).
 *   3. Resolves the org's control_record for `controlId` (creates it lazy if needed).
 *   4. Inserts a `governance_artifact_completions` row (artifactType=ATTESTATION) with
 *      the templateId as the unique label so the same control can't be attested twice.
 *   5. Inserts a structured `attestations` row with the SHA-256 hash of the canonical
 *      attestation statement so the signature is bound to specific legal text.
 *   6. Updates `control_records.implementationStatus` to the template's snapshot
 *      disposition (inherited / not_applicable / implemented) and stamps lastValidationDate.
 *   7. Writes an audit-log entry.
 *
 * Returns: { ok: true, controlRecordId, completionId, attestationId, dataHash }
 *
 * If the customer cannot affirm every condition, the API returns 400 with the
 * fallbackIfConditionFails action so the wizard can surface "you need to switch
 * to the register-based path instead" guidance.
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      templateId,
      controlId,
      signatoryName,
      signatoryTitle,
      acceptedConditions,
      comment,
    } = body as {
      templateId?: string;
      controlId?: string;
      signatoryName?: string;
      signatoryTitle?: string;
      acceptedConditions?: string[];
      comment?: string;
    };

    if (!templateId || !controlId || !signatoryName || !signatoryTitle) {
      return NextResponse.json(
        {
          error:
            "templateId, controlId, signatoryName, signatoryTitle are required.",
        },
        { status: 400 }
      );
    }

    const template = getAttestationTemplate(templateId);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown attestationTemplateId: ${templateId}` },
        { status: 404 }
      );
    }

    if (!template.linkedControlIds.includes(controlId)) {
      return NextResponse.json(
        {
          error: `Template ${templateId} does not apply to control ${controlId}`,
        },
        { status: 400 }
      );
    }

    // The customer must affirm EVERY condition. If they can't, the control falls
    // back to the register path and the wizard should redirect them there.
    const accepted = new Set(acceptedConditions ?? []);
    const missing = template.conditions.filter((c) => !accepted.has(c));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "All template conditions must be explicitly accepted.",
          missingConditions: missing,
          fallback: template.fallbackIfConditionFails,
        },
        { status: 400 }
      );
    }

    // Resolve or lazy-create the control_record for this org+control.
    let [record] = await db
      .select()
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      )
      .limit(1);

    if (!record) {
      [record] = await db
        .insert(controlRecords)
        .values({
          organizationId: orgId,
          controlId,
        })
        .returning();
    }

    // Compute SHA-256 of the canonical attestation statement so the signature
    // is bound to the exact legal text the user saw.
    const dataHash = createHash("sha256")
      .update(
        [
          template.templateId,
          template.attestationStatement,
          template.conditions.join("|"),
          controlId,
          signatoryName,
          signatoryTitle,
          new Date().toISOString().slice(0, 10),
        ].join("\n")
      )
      .digest("hex");

    // 1) Write governance_artifact_completion (Lane 4 evidence).
    const [completion] = await db
      .insert(governanceArtifactCompletions)
      .values({
        organizationId: orgId,
        controlRecordId: record.id,
        artifactLabel: templateId,
        artifactType: "ATTESTATION",
        valueText: template.attestationStatement,
        attestedBy: user.id!,
        attestedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [governanceArtifactCompletions.controlRecordId, governanceArtifactCompletions.artifactLabel],
        set: {
          valueText: template.attestationStatement,
          attestedBy: user.id!,
          attestedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    // 2) Write the structured attestations row (separate from artifact completion;
    //    binds the signature to the data hash).
    const [attestation] = await db
      .insert(attestations)
      .values({
        organizationId: orgId,
        attestationType: "control_attestation" as const,
        resourceType: "control_record",
        resourceId: record.id,
        signatoryId: user.id!,
        dataHash,
        comment:
          (typeof comment === "string" && comment.length > 0
            ? comment + "\n\n"
            : "") +
          `Signed by ${signatoryName} (${signatoryTitle}) using template ${templateId} (kind=${template.kind}).`,
      })
      .returning();

    // 3) Update control_records implementationStatus to the snapshot disposition.
    //    The template's `kind` and `fallbackIfConditionFails` define this:
    //      - na_attestation              → not_applicable
    //      - customer_attested_inherited → inherited
    //      - implemented_attestation     → implemented
    let newStatus: "implemented" | "inherited" | "not_applicable";
    let inheritedFrom: string | null = null;
    if (template.kind === "na_attestation") {
      newStatus = "not_applicable";
    } else if (template.kind === "customer_attested_inherited") {
      newStatus = "inherited";
      inheritedFrom = "Azure Government FedRAMP High + customer attestation";
    } else {
      newStatus = "implemented";
    }

    await db
      .update(controlRecords)
      .set({
        implementationStatus: newStatus,
        ...(inheritedFrom ? { inheritedFrom } : {}),
        lastValidationDate: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(controlRecords.id, record.id),
          eq(controlRecords.organizationId, orgId)
        )
      );

    // 4) Audit log.
    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "adjudication.attest",
      resourceType: "control_record",
      resourceId: record.id,
      details: {
        templateId,
        controlId,
        templateKind: template.kind,
        newStatus,
        signatoryName,
        signatoryTitle,
        dataHash,
        completionId: completion?.id,
        attestationId: attestation?.id,
      },
    });

    return NextResponse.json({
      ok: true,
      controlRecordId: record.id,
      completionId: completion?.id,
      attestationId: attestation?.id,
      newStatus,
      dataHash,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status =
      message === "Unauthorized" || message.startsWith("Unauthorized:")
        ? 401
        : message === "Forbidden"
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
