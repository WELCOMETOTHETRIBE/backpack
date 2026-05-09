import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
import { runAttestationGuard } from "@/lib/risk-assessment/attestation-guard";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";
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

    // Per-template factual guard. For most templates this is a no-op
    // (affirmation alone is enough). For a small set (currently
    // `risk_assessment_program`) the guard verifies that the customer's
    // claim has a backing fact in the system — e.g., a finalized
    // risk_assessments row in the past 365 days. This is the structural
    // fix for 2026-05-04: customer cannot click "we operate an annual
    // risk-assessment program" without one actually existing.
    const guardResult = await runAttestationGuard(templateId, orgId, body);
    if (!guardResult.ok) {
      await writeAuditLog({
        organizationId: orgId,
        userId: user.id,
        action: "risk_assessment.attestation_blocked",
        resourceType: "attestation_template",
        resourceId: templateId,
        details: {
          controlId,
          reason: guardResult.reason,
          evidenceLookedFor: guardResult.evidenceLookedFor,
          ...(guardResult.detail ?? {}),
        },
      });
      return NextResponse.json(
        {
          error: guardResult.reason,
          evidenceLookedFor: guardResult.evidenceLookedFor,
          remediation: guardResult.remediation,
          detail: guardResult.detail,
        },
        { status: 412 }, // 412 Precondition Failed — customer's claim isn't backed by system state
      );
    }

    // Compute SHA-256 of the canonical attestation. The hash binds the
    // signature to: the template version, the verbatim statement, the
    // conditions accepted, the FULL linked-control set, the signatory,
    // and the date. Using the full linkedControlIds set (not just the
    // single requested controlId) means the same signature legally
    // covers every control the template applies to -- a customer signing
    // "MFA in path" once attests to 3.5.3 + 3.5.4 + 3.5.5 + 3.5.6 + 3.7.5
    // simultaneously, which mirrors how a C3PAO reads the declaration.
    const linkedIds = [...template.linkedControlIds].sort();
    const dataHash = createHash("sha256")
      .update(
        [
          template.templateId,
          template.attestationStatement,
          template.conditions.join("|"),
          linkedIds.join(","),
          signatoryName,
          signatoryTitle,
          new Date().toISOString().slice(0, 10),
        ].join("\n")
      )
      .digest("hex");

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

    // Fan out the signature across every control the template legally
    // covers. Each gets its own governance_artifact_completion (so the
    // attestation lane is satisfied per-control by hasOperationalEvidence)
    // plus its own attestations row (so the per-control receipt has a
    // navigable record). All share the same dataHash -- one signature,
    // many adjudications.
    const now = new Date();
    let primaryRecordId: string | null = null;
    let primaryCompletionId: string | null = null;
    let primaryAttestationId: string | null = null;
    for (const cid of linkedIds) {
      let [rec] = await db
        .select()
        .from(controlRecords)
        .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, cid)))
        .limit(1);
      if (!rec) {
        [rec] = await db
          .insert(controlRecords)
          .values({ organizationId: orgId, controlId: cid })
          .returning();
      }
      if (!rec) continue;

      const [completion] = await db
        .insert(governanceArtifactCompletions)
        .values({
          organizationId: orgId,
          controlRecordId: rec.id,
          artifactLabel: templateId,
          artifactType: "ATTESTATION",
          valueText: template.attestationStatement,
          attestedBy: user.id!,
          attestedAt: now,
        })
        .onConflictDoUpdate({
          target: [governanceArtifactCompletions.controlRecordId, governanceArtifactCompletions.artifactLabel],
          set: {
            valueText: template.attestationStatement,
            attestedBy: user.id!,
            attestedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      const [att] = await db
        .insert(attestations)
        .values({
          organizationId: orgId,
          attestationType: "control_attestation" as const,
          resourceType: "control_record",
          resourceId: rec.id,
          signatoryId: user.id!,
          attestedAt: now,
          dataHash,
          comment:
            (typeof comment === "string" && comment.length > 0
              ? comment + "\n\n"
              : "") +
            `Signed by ${signatoryName} (${signatoryTitle}) using template ${templateId} (kind=${template.kind}). Covers controls: ${linkedIds.join(", ")}.`,
        })
        .returning();

      await db
        .update(controlRecords)
        .set({
          implementationStatus: newStatus,
          ...(inheritedFrom ? { inheritedFrom } : {}),
          lastValidationDate: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(controlRecords.id, rec.id),
            eq(controlRecords.organizationId, orgId)
          )
        );

      // Track the requested controlId's record for the response payload --
      // the wizard expects that one back to update its UI.
      if (cid === controlId) {
        primaryRecordId = rec.id;
        primaryCompletionId = completion?.id ?? null;
        primaryAttestationId = att?.id ?? null;
      }
    }

    // The values the response/audit log reference. Fall back to the first
    // linked control if the requested controlId somehow wasn't in the
    // linked set (validated above, but defensive).
    if (!primaryRecordId) {
      const [r] = await db
        .select({ id: controlRecords.id })
        .from(controlRecords)
        .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, linkedIds[0])))
        .limit(1);
      primaryRecordId = r?.id ?? null;
    }
    const record = { id: primaryRecordId } as { id: string };
    const completion = primaryCompletionId ? { id: primaryCompletionId } : undefined;
    const attestation = primaryAttestationId ? { id: primaryAttestationId } : undefined;

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

    // Phase B trigger: rescore the canonical snapshot for every control
    // this attestation covers. Best-effort; the helper swallows errors
    // so a scoring blip doesn't roll back the attestation insert that
    // already committed above.
    await scoreControlsAffectedBy({
      organizationId: orgId,
      triggerSource: "attestation_signed",
      controlIds: linkedIds,
      triggeredByUserId: user.id,
    });

    // Invalidate every cached route that displays adjudication state. The
    // wizard itself was already force-dynamic, but the dashboard rollup,
    // readiness checklist, and SCTM views all read from the same control
    // records and were happily serving stale renders post-sign. Calling
    // revalidatePath here means the customer's next navigation rebuilds
    // those pages from fresh DB state — counts move, SPRS shifts, the
    // PathTo110 widget decrements outstanding.
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/readiness");
    revalidatePath("/dashboard/readiness/outstanding");
    revalidatePath("/dashboard/controls");
    for (const cid of linkedIds) {
      revalidatePath(`/dashboard/controls/${cid}`);
    }

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
