import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeControlMappings, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  createIntakeAuditArtifact,
  rescoreForIntakeEvidence,
  transitionIntakeStatus,
} from "@/lib/intake/service";

const BASE_CONTROL_MAPPINGS = [
  { family: "AC", controlId: "3.1.1", intent: "Authorized access for intake scope" },
  { family: "IA", controlId: "3.5.3", intent: "Sender identity assurance" },
  { family: "AU", controlId: "3.3.1", intent: "Intake audit event generation" },
  { family: "CM", controlId: "3.4.1", intent: "Intake configuration and baseline enforcement" },
  { family: "IR", controlId: "3.6.1", intent: "Intake exception and incident handling path" },
  { family: "RA", controlId: "3.11.1", intent: "Risk-informed intake acceptance and exception decisions" },
  { family: "CA", controlId: "3.12.1", intent: "Assessment-ready evidence reconstruction by transaction id" },
  { family: "SI", controlId: "3.14.5", intent: "Malware scan outcome handling" },
  { family: "SC", controlId: "3.13.16", intent: "Protected transfer channel" },
  { family: "MP", controlId: "3.8.9", intent: "Controlled handling and disposition" },
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["Access Revoked", "Evidence Package Generated", "Exception"].includes(request.status)) {
      return NextResponse.json(
        {
          error:
            "Evidence package generation requires access revocation or documented exception",
        },
        { status: 409 },
      );
    }

    const artifact = await createIntakeAuditArtifact({
      actor: { orgId, userId: user.id ?? null },
      intakeRequestId: request.id,
      artifactType: "evidence_package",
      artifactName: "Intake Evidence Package",
      artifactPath:
        (body.packagePath as string | undefined) ??
        `vault://evidence/intake/${request.intakeTransactionId}/package.json`,
      retentionRequirement: "retain_per_ssp_retention_policy",
      controlFamily: "AU",
      controlId: "3.3.2",
      boundaryLocation: "codex_metadata_only",
      immutableFlag: true,
      status: "supporting_evidence",
    });

    const existing = await db
      .select({ id: intakeControlMappings.id })
      .from(intakeControlMappings)
      .where(eq(intakeControlMappings.intakeRequestId, request.id))
      .limit(1);

    if (!existing.length) {
      await db.insert(intakeControlMappings).values(
        BASE_CONTROL_MAPPINGS.map((mapping) => ({
          intakeRequestId: request.id,
          controlFamily: mapping.family,
          controlId: mapping.controlId,
          controlIntent: mapping.intent,
          evidenceArtifactId: artifact.id,
          owner: "Compliance Lead",
          cadence: "Per intake event",
          sourceOfTruth: "codex_intake_registry",
          implementationNature: "Technical+Procedural",
          implementationRisk: "Supporting evidence only; not automatic control satisfaction",
          c3paoPrompt:
            "Show intake transaction reconstruction, artifact provenance, and reviewer attestations as supporting evidence.",
        })),
      );
    }

    await rescoreForIntakeEvidence({
      orgId,
      intakeRequestId: request.id,
      intakeTransactionId: request.intakeTransactionId,
      evidenceArtifactId: artifact.id,
      artifactPath: artifact.artifactPath,
      artifactHash: artifact.artifactHash,
      triggeredByUserId: user.id ?? null,
    });

    if (request.status !== "Exception") {
      await transitionIntakeStatus({
        intakeRequestId: request.id,
        orgId,
        actorUserId: user.id ?? null,
        nextStatus: "Evidence Package Generated",
        details: {
          evidenceArtifactId: artifact.id,
          supportingEvidenceOnly: true,
        },
      });
    }

    return NextResponse.json({ artifact, controlMappingsSeeded: !existing.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
