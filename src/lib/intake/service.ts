import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlEvidenceLinks,
  controlRecords,
  contracts,
  intakeAccessGrants,
  intakeControlMappings,
  intakeEvidenceArtifacts,
  intakeExceptions,
  intakeFiles,
  intakeMetadataEvents,
  intakeManifests,
  intakeRequests,
  intakeReviewActions,
  organizations,
  projects,
  users,
} from "@/db/schema";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";
import { writeAuditLog } from "@/lib/audit";
import { buildManifestWithHash, sha256Hex } from "@/lib/intake/manifest";
import { canTransitionIntakeStatus, type IntakeStatus } from "@/lib/intake/status";
import { buildIntakeTransactionId } from "@/lib/intake/transaction-id";

type Actor = { userId: string | null; orgId: string };

function redactBlobUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/\?.*$/, "?REDACTED");
}

function redactSensitiveString(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input;
  value = value.replace(/([?&](sig|signature|token|se|sp|sr|skoid|sktid|skt|ske)=)[^&]+/gi, "$1REDACTED");
  value = value.replace(/(sas|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=REDACTED");
  return value;
}

export function buildTokenizedObjectAlias(input: {
  intakeTransactionId: string;
  originalFilename: string;
}): {
  objectAlias: string;
  originalFilenameHash: string;
} {
  const originalFilenameHash = sha256Hex(input.originalFilename);
  const txSuffix = input.intakeTransactionId.split("-").slice(-2).join("");
  const objectAlias = `INTAKEOBJ-${txSuffix}-${originalFilenameHash.slice(0, 12)}`;
  return { objectAlias, originalFilenameHash };
}

export async function validateIntakeForeignKeys(input: {
  orgId: string;
  clientId?: string | null;
  projectId?: string | null;
  contractId?: string | null;
  assignedReviewerUserId?: string | null;
}): Promise<void> {
  if (input.clientId) {
    const [client] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.clientId))
      .limit(1);
    if (!client) throw new Error("Invalid clientId");
  }

  if (input.projectId) {
    const [project] = await db
      .select({ id: projects.id, orgId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!project || project.orgId !== input.orgId) {
      throw new Error("projectId is not authorized for this organization");
    }
  }

  if (input.contractId) {
    const [contract] = await db
      .select({
        id: contracts.id,
        primeOrgId: contracts.primeOrganizationId,
        subOrgId: contracts.subOrganizationId,
      })
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .limit(1);
    const contractAuthorized =
      contract &&
      (contract.primeOrgId === input.orgId || contract.subOrgId === input.orgId);
    if (!contractAuthorized) {
      throw new Error("contractId is not authorized for this organization");
    }
  }

  if (input.assignedReviewerUserId) {
    const [reviewer] = await db
      .select({ id: users.id, orgId: users.organizationId })
      .from(users)
      .where(eq(users.id, input.assignedReviewerUserId))
      .limit(1);
    if (!reviewer || reviewer.orgId !== input.orgId) {
      throw new Error("assignedReviewerUserId is not authorized for this organization");
    }
  }
}

export async function nextIntakeTransactionId(input: {
  organizationId: string;
  clientCode: string;
  projectCode: string;
}): Promise<string> {
  const today = new Date();
  const ymd = `${today.getUTCFullYear()}${`${today.getUTCMonth() + 1}`.padStart(
    2,
    "0",
  )}${`${today.getUTCDate()}`.padStart(2, "0")}`;
  const prefix = `INTAKE-${input.clientCode
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")}-${input.projectCode
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")}-${ymd}-`;

  const rows = await db
    .select({ tx: intakeRequests.intakeTransactionId })
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.organizationId, input.organizationId),
        sql`${intakeRequests.intakeTransactionId} like ${`${prefix}%`}`,
      ),
    )
    .orderBy(desc(intakeRequests.createdAt))
    .limit(1);

  let sequence = 1;
  const latest = rows[0]?.tx;
  if (latest) {
    const parsed = Number.parseInt(latest.split("-").at(-1) ?? "0", 10);
    if (Number.isFinite(parsed) && parsed > 0) sequence = parsed + 1;
  }
  return buildIntakeTransactionId({
    clientCode: input.clientCode,
    projectCode: input.projectCode,
    sequence,
    now: today,
  });
}

export async function transitionIntakeStatus(params: {
  intakeRequestId: string;
  orgId: string;
  actorUserId: string | null;
  nextStatus: IntakeStatus;
  details?: Record<string, unknown>;
}) {
  const existing = await db
    .select()
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.id, params.intakeRequestId),
        eq(intakeRequests.organizationId, params.orgId),
      ),
    )
    .limit(1);
  const row = existing[0];
  if (!row) throw new Error("Intake request not found");

  if (!canTransitionIntakeStatus(row.status as IntakeStatus, params.nextStatus)) {
    throw new Error(`Invalid status transition: ${row.status} -> ${params.nextStatus}`);
  }

  const update: Partial<typeof intakeRequests.$inferInsert> = {
    status: params.nextStatus,
    updatedAt: new Date(),
  };
  if (params.nextStatus === "Closed") update.closedAt = new Date();

  await db
    .update(intakeRequests)
    .set(update)
    .where(eq(intakeRequests.id, row.id));

  await writeAuditLog({
    organizationId: params.orgId,
    userId: params.actorUserId,
    action: "intake.status.transitioned",
    resourceType: "intake_request",
    resourceId: row.id,
    details: {
      from: row.status,
      to: params.nextStatus,
      intakeTransactionId: row.intakeTransactionId,
      ...(params.details ?? {}),
    },
  });
}

export async function createIntakeAuditArtifact(params: {
  actor: Actor;
  intakeRequestId: string;
  artifactType: string;
  artifactName: string;
  artifactPath: string | null;
  retentionRequirement: string | null;
  controlFamily: string | null;
  controlId: string | null;
  boundaryLocation: string | null;
  immutableFlag?: boolean;
  sourceOfTruth?: string | null;
  status?: string;
  reviewerActionId?: string | null;
  exceptionId?: string | null;
  poamReference?: string | null;
}) {
  const redactedPath = redactSensitiveString(params.artifactPath);
  const artifactHash = redactedPath ? sha256Hex(redactedPath) : null;
  const [artifact] = await db
    .insert(intakeEvidenceArtifacts)
    .values({
      intakeRequestId: params.intakeRequestId,
      artifactType: params.artifactType,
      artifactName: params.artifactName,
      artifactPath: redactedPath,
      artifactHash,
      generatedAt: new Date(),
      generatedBy: params.actor.userId,
      boundaryLocation: params.boundaryLocation,
      sourceOfTruth: params.sourceOfTruth ?? "codex_metadata_registry",
      immutableFlag: params.immutableFlag ?? false,
      retentionRequirement: params.retentionRequirement,
      relatedControlFamily: params.controlFamily,
      relatedControlId: params.controlId,
      status: params.status ?? "generated",
      reviewerActionId: params.reviewerActionId ?? null,
      exceptionId: params.exceptionId ?? null,
      poamReference: params.poamReference ?? null,
    })
    .returning();
  return artifact;
}

async function syncSupportingControlEvidence(params: {
  orgId: string;
  intakeRequestId: string;
  intakeTransactionId: string;
  evidenceArtifactId: string;
  artifactPath: string | null;
  artifactHash: string | null;
  controlMappings: Array<{ controlId: string | null; controlFamily: string }>;
  triggeredByUserId: string | null;
}) {
  const mappedControlIds = params.controlMappings
    .map((m) => m.controlId)
    .filter((id): id is string => Boolean(id));
  if (!mappedControlIds.length) return;

  const records = await db
    .select({ id: controlRecords.id, controlId: controlRecords.controlId })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, params.orgId),
        inArray(controlRecords.controlId, mappedControlIds),
      ),
    );
  if (!records.length) return;

  for (const record of records) {
    await db.insert(controlEvidenceLinks).values({
      organizationId: params.orgId,
      controlRecordId: record.id,
      runId: params.intakeTransactionId,
      filePath: params.artifactPath ?? `intake://${params.intakeRequestId}`,
      sha256Hash:
        params.artifactHash ??
        sha256Hex(`${params.intakeTransactionId}|${params.evidenceArtifactId}|${record.controlId}`),
      description: `Supporting intake evidence for ${record.controlId}`,
      source: "cui_intake_registry_supporting_evidence",
      linkedBy: params.triggeredByUserId,
    });
  }

  await scoreControlsAffectedBy({
    organizationId: params.orgId,
    triggerSource: "intake_evidence_updated",
    controlIds: records.map((r) => r.controlId),
    triggeredByUserId: params.triggeredByUserId,
  });
}

export async function buildIntakeReconstructionByTransactionId(input: {
  orgId: string;
  intakeTransactionId: string;
}) {
  const [request] = await db
    .select()
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.organizationId, input.orgId),
        eq(intakeRequests.intakeTransactionId, input.intakeTransactionId),
      ),
    )
    .limit(1);
  if (!request) return null;

  const [files, accessGrants, reviewActions, exceptions, manifests, artifacts, controlMappings, metadataEvents] =
    await Promise.all([
      db.select().from(intakeFiles).where(eq(intakeFiles.intakeRequestId, request.id)),
      db.select().from(intakeAccessGrants).where(eq(intakeAccessGrants.intakeRequestId, request.id)),
      db.select().from(intakeReviewActions).where(eq(intakeReviewActions.intakeRequestId, request.id)),
      db.select().from(intakeExceptions).where(eq(intakeExceptions.intakeRequestId, request.id)),
      db.select().from(intakeManifests).where(eq(intakeManifests.intakeRequestId, request.id)),
      db.select().from(intakeEvidenceArtifacts).where(eq(intakeEvidenceArtifacts.intakeRequestId, request.id)),
      db.select().from(intakeControlMappings).where(eq(intakeControlMappings.intakeRequestId, request.id)),
      db.select().from(intakeMetadataEvents).where(eq(intakeMetadataEvents.intakeRequestId, request.id)),
    ]);

  const sanitizedGrants = accessGrants.map((grant) => ({
    id: grant.id,
    accessMethod: grant.accessMethod,
    accessScope: redactSensitiveString(grant.accessScope),
    authorizationBasis: grant.authorizationBasis,
    accessGrantedAt: grant.accessGrantedAt,
    accessExpiresAt: grant.accessExpiresAt,
    accessRevokedAt: grant.accessRevokedAt,
    tokenReferenceHash: grant.tokenReferenceHash,
    notes: redactSensitiveString(grant.notes),
  }));

  const sanitizedFiles = files.map((file) => ({
    id: file.id,
    intakeRequestId: file.intakeRequestId,
    intakeObjectAlias: file.originalFilename,
    originalFilenameHash: file.originalFilenameHash,
    sensitiveFilenameRetained: file.sensitiveFilenameRetained,
    storageAccount: file.storageAccount,
    containerName: file.containerName,
    blobPathReference: redactSensitiveString(file.blobPath),
    blobPathHash: file.blobPathHash,
    blobUrlRedacted: redactBlobUrl(file.blobUrlRedacted),
    contentType: file.contentType,
    fileSize: file.fileSize,
    uploadTimestamp: file.uploadTimestamp,
    uploadedByIdentity: file.uploadedByIdentity,
    malwareScanStatus: file.malwareScanStatus,
    malwareScanTimestamp: file.malwareScanTimestamp,
    malwareScanResultReference: file.malwareScanResultReference,
    sha256Hash: file.sha256Hash,
    hashGeneratedBy: file.hashGeneratedBy,
    hashGeneratedAt: file.hashGeneratedAt,
    vaultImportStatus: file.vaultImportStatus,
    vaultDestinationPathReference: redactSensitiveString(file.vaultDestinationPath),
    vaultDestinationPathHash: file.vaultDestinationPathHash,
    vaultImportTimestamp: file.vaultImportTimestamp,
    importedByIdentity: file.importedByIdentity,
    classificationStatus: file.classificationStatus,
    disposition: file.disposition,
    dispositionTimestamp: file.dispositionTimestamp,
    exceptionFlag: file.exceptionFlag,
    exceptionReason: file.exceptionReason,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  }));

  const finalDisposition = sanitizedFiles.map((file) => ({
    fileId: file.id,
    disposition: file.disposition,
    dispositionTimestamp: file.dispositionTimestamp,
    vaultImportStatus: file.vaultImportStatus,
  }));

  return {
    intakeTransactionId: request.intakeTransactionId,
    intakeRequest: request,
    correlation: {
      organizationId: request.organizationId,
      clientId: request.clientId,
      projectId: request.projectId,
      contractId: request.contractId,
      opportunityId: request.opportunityId,
    },
    senderIdentity: {
      senderName: request.senderName,
      senderEmail: request.senderEmail,
      senderOrganization: request.senderOrganization,
      senderDomain: request.senderDomain,
      identityVerificationMethod: request.identityVerificationMethod,
      entraGuestObjectId: request.entraGuestObjectId,
    },
    authorizationBasis: request.authorizationBasis,
    uploadScope: sanitizedGrants.map((grant) => grant.accessScope),
    accessGrants: sanitizedGrants,
    uploadedFiles: sanitizedFiles,
    metadataSensitivity: {
      classification: "sensitive_metadata",
      warning:
        "File aliases, hash references, and path references are sensitive metadata and are redacted/tokenized in Codex by default.",
    },
    malwareScanStatus: sanitizedFiles.map((file) => ({
      fileId: file.id,
      malwareScanStatus: file.malwareScanStatus,
      malwareScanTimestamp: file.malwareScanTimestamp,
      malwareScanResultReference: file.malwareScanResultReference,
    })),
    hashes: sanitizedFiles.map((file) => ({
      fileId: file.id,
      sha256Hash: file.sha256Hash,
      hashGeneratedBy: file.hashGeneratedBy,
      hashGeneratedAt: file.hashGeneratedAt,
    })),
    vaultImport: sanitizedFiles.map((file) => ({
      fileId: file.id,
      vaultImportStatus: file.vaultImportStatus,
      vaultDestinationPath: file.vaultDestinationPath,
      vaultImportTimestamp: file.vaultImportTimestamp,
      importedByIdentity: file.importedByIdentity,
    })),
    reviewerActions: reviewActions,
    metadataEvents: metadataEvents,
    exceptionRecords: exceptions,
    accessRevocation: sanitizedGrants.map((grant) => ({
      grantId: grant.id,
      accessRevokedAt: grant.accessRevokedAt,
    })),
    generatedManifest: manifests,
    evidenceArtifacts: artifacts,
    controlMappings,
    finalDisposition,
    closure: {
      status: request.status,
      closedAt: request.closedAt,
      manifestHash: request.manifestHash,
      manifestGeneratedAt: request.manifestGeneratedAt,
    },
  };
}

export async function evaluateIntakeClosureReadiness(input: {
  orgId: string;
  intakeRequestId: string;
}) {
  const [request] = await db
    .select()
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.id, input.intakeRequestId),
        eq(intakeRequests.organizationId, input.orgId),
      ),
    )
    .limit(1);
  if (!request) throw new Error("Intake request not found");

  const [files, grants, reviews, manifests, artifacts, exceptions] = await Promise.all([
    db.select().from(intakeFiles).where(eq(intakeFiles.intakeRequestId, request.id)),
    db.select().from(intakeAccessGrants).where(eq(intakeAccessGrants.intakeRequestId, request.id)),
    db.select().from(intakeReviewActions).where(eq(intakeReviewActions.intakeRequestId, request.id)),
    db.select().from(intakeManifests).where(eq(intakeManifests.intakeRequestId, request.id)),
    db.select().from(intakeEvidenceArtifacts).where(eq(intakeEvidenceArtifacts.intakeRequestId, request.id)),
    db.select().from(intakeExceptions).where(eq(intakeExceptions.intakeRequestId, request.id)),
  ]);

  const missing: string[] = [];

  if (!files.length && request.status !== "Rejected") {
    missing.push("file_upload_or_rejection");
  }

  const scanMissing = files.some((f) => !f.malwareScanStatus || f.malwareScanStatus === "unknown");
  if (scanMissing && request.status !== "Rejected") missing.push("malware_scan_status_recorded");

  const hashMissing = files.some((f) => !f.sha256Hash);
  if (hashMissing && request.status !== "Rejected") missing.push("hash_generated");

  const importMissing = files.some((f) =>
    f.disposition !== "rejected" &&
    !["imported", "failed"].includes(f.vaultImportStatus),
  );
  if (importMissing && request.status !== "Rejected") missing.push("vault_import_status_recorded");

  if (!reviews.length) missing.push("reviewer_action_recorded");

  const hasRevokedOrExpiredGrant = grants.every((g) => {
    const expired = g.accessExpiresAt ? g.accessExpiresAt.getTime() <= Date.now() : false;
    return Boolean(g.accessRevokedAt || expired);
  });
  if (!grants.length || !hasRevokedOrExpiredGrant) missing.push("access_revoked_or_expired");

  if (!manifests.length) missing.push("manifest_generated");
  if (!artifacts.some((a) => a.artifactType === "evidence_package")) {
    missing.push("evidence_package_generated");
  }

  const dispositionMissing = files.some((f) => !f.disposition);
  if (dispositionMissing && request.status !== "Rejected") missing.push("disposition_recorded");

  const openExceptions = exceptions.filter((e) => e.status === "open");
  const closeable = missing.length === 0 || openExceptions.length > 0;

  return {
    closeable,
    requiresException: missing.length > 0,
    missingRequirements: missing,
    openExceptions,
  };
}

export async function buildAndPersistManifest(params: {
  actor: Actor;
  intakeRequestId: string;
  storageLocation: string;
  sourceOfTruth: string;
}) {
  const [request] = await db
    .select()
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.id, params.intakeRequestId),
        eq(intakeRequests.organizationId, params.actor.orgId),
      ),
    )
    .limit(1);
  if (!request) throw new Error("Intake request not found");

  const files = await db
    .select()
    .from(intakeFiles)
    .where(eq(intakeFiles.intakeRequestId, request.id));
  const grants = await db
    .select()
    .from(intakeAccessGrants)
    .where(eq(intakeAccessGrants.intakeRequestId, request.id));
  const reviews = await db
    .select()
    .from(intakeReviewActions)
    .where(eq(intakeReviewActions.intakeRequestId, request.id));
  const artifacts = await db
    .select()
    .from(intakeEvidenceArtifacts)
    .where(eq(intakeEvidenceArtifacts.intakeRequestId, request.id));

  const exceptions = await db
    .select()
    .from(intakeExceptions)
    .where(eq(intakeExceptions.intakeRequestId, request.id));

  const manifestPayload: Record<string, unknown> = {
    intake_transaction_id: request.intakeTransactionId,
    organization_id: request.organizationId,
    client_id: request.clientId,
    project_id: request.projectId,
    contract_id: request.contractId,
    opportunity_id: request.opportunityId,
    sender: {
      sender_name: request.senderName,
      sender_email: request.senderEmail,
      sender_organization: request.senderOrganization,
      sender_domain: request.senderDomain,
      identity_verification_method: request.identityVerificationMethod,
      entra_guest_object_id: request.entraGuestObjectId,
    },
    authorization_basis: request.authorizationBasis,
    expected_classification: request.expectedClassification,
    upload_method: request.uploadMethod,
    files: files.map((f) => ({
      intake_object_alias: f.originalFilename,
      original_filename_hash: f.originalFilenameHash,
      sensitive_filename_retained: f.sensitiveFilenameRetained,
      storage_account: f.storageAccount,
      container_name: f.containerName,
      blob_path_reference: redactSensitiveString(f.blobPath),
      blob_path_hash: f.blobPathHash,
      blob_url_redacted: redactBlobUrl(f.blobUrlRedacted),
      content_type: f.contentType,
      file_size: f.fileSize,
      upload_timestamp: f.uploadTimestamp?.toISOString() ?? null,
      uploaded_by_identity: f.uploadedByIdentity,
      malware_scan_status: f.malwareScanStatus,
      malware_scan_timestamp: f.malwareScanTimestamp?.toISOString() ?? null,
      malware_scan_result_reference: f.malwareScanResultReference,
      sha256_hash: f.sha256Hash,
      hash_generated_at: f.hashGeneratedAt?.toISOString() ?? null,
      vault_import_status: f.vaultImportStatus,
      vault_destination_path_reference: redactSensitiveString(f.vaultDestinationPath),
      vault_destination_path_hash: f.vaultDestinationPathHash,
      vault_import_timestamp: f.vaultImportTimestamp?.toISOString() ?? null,
      imported_by_identity: f.importedByIdentity,
      classification_status: f.classificationStatus,
      disposition: f.disposition,
      disposition_timestamp: f.dispositionTimestamp?.toISOString() ?? null,
      exception_flag: f.exceptionFlag,
      exception_reason: f.exceptionReason,
    })),
    access_grants: grants.map((g) => ({
      access_method: g.accessMethod,
      access_scope: redactSensitiveString(g.accessScope),
      access_granted_at: g.accessGrantedAt?.toISOString() ?? null,
      access_expires_at: g.accessExpiresAt?.toISOString() ?? null,
      access_revoked_at: g.accessRevokedAt?.toISOString() ?? null,
      authorization_basis: g.authorizationBasis,
    })),
    reviewer_actions: reviews.map((r) => ({
      action_type: r.actionType,
      action_notes: redactSensitiveString(r.actionNotes),
      performed_by: r.performedByIdentity,
      performed_at: r.performedAt?.toISOString() ?? null,
    })),
    evidence_artifacts: artifacts.map((a) => ({
      artifact_type: a.artifactType,
      artifact_name: a.artifactName,
      artifact_path: redactSensitiveString(a.artifactPath),
      artifact_hash: a.artifactHash,
      generated_at: a.generatedAt?.toISOString() ?? null,
      boundary_location: a.boundaryLocation,
      source_of_truth: a.sourceOfTruth,
      status: a.status,
    })),
    exceptions: exceptions.map((e) => ({
      exception_type: e.exceptionType,
      reason: redactSensitiveString(e.reason),
      severity: e.severity,
      affected_control_family: e.affectedControlFamily,
      affected_control_id: e.affectedControlId,
      compensating_action: redactSensitiveString(e.compensatingAction),
      owner: e.owner,
      due_date: e.dueDate,
      status: e.status,
      poam_reference: e.poamReference,
    })),
    closure_status: request.status,
    closure_timestamp: request.closedAt?.toISOString() ?? null,
    generated_timestamp: new Date().toISOString(),
  };

  const { canonicalJson, manifestHash } = buildManifestWithHash(manifestPayload);

  const [manifest] = await db
    .insert(intakeManifests)
    .values({
      intakeRequestId: request.id,
      manifestJson: canonicalJson,
      manifestHash,
      signedBy: params.actor.userId,
      signedAt: new Date(),
      generatedAt: new Date(),
      storageLocation: params.storageLocation,
      sourceOfTruth: params.sourceOfTruth,
    })
    .returning();

  await db
    .update(intakeRequests)
    .set({
      manifestHash,
      manifestGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(intakeRequests.id, request.id));

  await writeAuditLog({
    organizationId: params.actor.orgId,
    userId: params.actor.userId,
    action: "intake.manifest.generated",
    resourceType: "intake_request",
    resourceId: request.id,
    details: {
      intakeTransactionId: request.intakeTransactionId,
      manifestHash,
      storageLocation: params.storageLocation,
    },
  });

  return manifest;
}

export async function rescoreForIntakeEvidence(params: {
  orgId: string;
  intakeRequestId: string;
  intakeTransactionId: string;
  evidenceArtifactId: string;
  artifactPath: string | null;
  artifactHash: string | null;
  triggeredByUserId: string | null;
}) {
  const mappings = await db
    .select({
      controlId: intakeControlMappings.controlId,
      controlFamily: intakeControlMappings.controlFamily,
    })
    .from(intakeControlMappings)
    .where(eq(intakeControlMappings.intakeRequestId, params.intakeRequestId));

  await syncSupportingControlEvidence({
    orgId: params.orgId,
    intakeRequestId: params.intakeRequestId,
    intakeTransactionId: params.intakeTransactionId,
    evidenceArtifactId: params.evidenceArtifactId,
    artifactPath: params.artifactPath,
    artifactHash: params.artifactHash,
    controlMappings: mappings,
    triggeredByUserId: params.triggeredByUserId,
  });
}
