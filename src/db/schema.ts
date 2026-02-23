import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  integer,
  jsonb,
  uniqueIndex,
  primaryKey,
  varchar,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============== Enums ==============
export const userRoleEnum = pgEnum("user_role", ["Admin", "Compliance", "Assessor"]);
export const controlStatusEnum = pgEnum("control_status", [
  "Not Started",
  "Implemented",
  "Partial",
  "POA&M",
  "Inherited",
  "Not Applicable",
]);
export const monitoringCadenceEnum = pgEnum("monitoring_cadence", [
  "Quarterly",
  "Monthly",
  "Annual",
]);
export const poamStatusEnum = pgEnum("poam_status", [
  "Open",
  "In Progress",
  "Pending Closure",
  "Closed",
]);
export const riskSeverityEnum = pgEnum("risk_severity", [
  "Low",
  "Medium",
  "High",
  "Critical",
]);
export const evidenceValidationStatusEnum = pgEnum("evidence_validation_status", [
  "Valid",
  "Expired",
]);
export const attestationTypeEnum = pgEnum("attestation_type", [
  "control_attestation",
  "evidence_review",
  "poam_closure",
  "document_approval",
]);
export const documentTypeEnum = pgEnum("document_type", [
  "ssp",
  "policy",
  "asset",
  "data_flow",
]);

// ============== Unified Control Record (CMMC Governance Wizard) ==============
export const implementationStatusEnum = pgEnum("implementation_status", [
  "not_started",
  "in_progress",
  "implemented",
  "assessed",
  "inherited",
]);
export const evidenceTypeEnum = pgEnum("evidence_type", [
  "screenshot",
  "config_file",
  "scan_result",
  "log_file",
]);
export const poamEntryStatusEnum = pgEnum("poam_entry_status", ["open", "closed"]);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const controlRecords = pgTable(
  "control_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    controlId: varchar("control_id", { length: 20 }).notNull(),
    implementationStatus: implementationStatusEnum("implementation_status")
      .notNull()
      .default("not_started"),
    governanceNarrative: text("governance_narrative"),
    technicalNarrative: text("technical_narrative"),
    responsibleRoleId: uuid("responsible_role_id").references(() => roles.id),
    inheritedFrom: varchar("inherited_from", { length: 255 }),
    assessorId: uuid("assessor_id").references(() => users.id),
    assessorFindings: text("assessor_findings"),
    assessmentDate: date("assessment_date"),
    /** For control 3.13.11 only: no_crypto = 5 pt deduction, non_fips = 3 pt deduction. */
    sprs31311Condition: varchar("sprs_31311_condition", { length: 20 }),
    /** ConMon: when this control was last validated. */
    lastValidationDate: timestamp("last_validation_date", { withTimezone: true }),
    /** ConMon: review cadence for "due for review" (Quarterly = 90d, Monthly = 30d, Annual = 365d). */
    monitoringCadence: monitoringCadenceEnum("monitoring_cadence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("control_records_org_control_idx").on(t.organizationId, t.controlId)]
);

/** Read-only change history for control records (assessor view). */
export const controlRecordHistory = pgTable("control_record_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  controlRecordId: uuid("control_record_id")
    .references(() => controlRecords.id, { onDelete: "cascade" })
    .notNull(),
  changedById: uuid("changed_by_id").references(() => users.id).notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  controlRecordId: uuid("control_record_id").references(() => controlRecords.id).notNull(),
  artifactLabel: varchar("artifact_label", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  /** Storage provider's key/id for getDownloadUrl and delete (e.g. S3 key, blob name). */
  storageKey: text("storage_key"),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  version: varchar("version", { length: 50 }),
  approvalDate: date("approval_date"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  vaultDocumentId: varchar("vault_document_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const technicalEvidence = pgTable("technical_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  controlRecordId: uuid("control_record_id").references(() => controlRecords.id).notNull(),
  /** Links to EvidenceRequirement.id from technical_evidence_requirements (e.g. 3.1.1-win-local-users). */
  requirementId: varchar("requirement_id", { length: 80 }),
  evidenceType: evidenceTypeEnum("evidence_type").notNull(),
  description: text("description"),
  fileUrl: text("file_url"),
  sourceUrl: text("source_url"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const poamEntries = pgTable("poam_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  controlRecordId: uuid("control_record_id").references(() => controlRecords.id).notNull(),
  status: poamEntryStatusEnum("status").notNull().default("open"),
  weaknessDescription: text("weakness_description"),
  remediationPlan: text("remediation_plan"),
  scheduledCompletionDate: date("scheduled_completion_date"),
  responsibleRoleId: uuid("responsible_role_id").references(() => roles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const poamEntryMilestones = pgTable("poam_entry_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  poamEntryId: uuid("poam_entry_id").references(() => poamEntries.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  orderIndex: integer("order_index").default(0).notNull(),
});

export const poamEntryClosureApprovals = pgTable("poam_entry_closure_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  poamEntryId: uuid("poam_entry_id").references(() => poamEntries.id, { onDelete: "cascade" }).notNull(),
  approverId: uuid("approver_id").references(() => users.id).notNull(),
  approvalOrder: integer("approval_order").notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============== Multi-tenancy & Auth (Module 6) ==============
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** SPRS score (110 to negative). Recomputed on every control status change. */
  sprsScore: integer("sprs_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One per org: selected technology stack for evidence requirements (keys from technical_evidence_requirements). */
export const boundaryProfiles = pgTable(
  "boundary_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    selectedTechnologies: jsonb("selected_technologies").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  role: userRoleEnum("role").notNull().default("Compliance"),
  mfaEnabled: integer("mfa_enabled").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============== Module 1: Control Management Engine ==============
export const controlFamilies = pgTable("control_families", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const controls = pgTable(
  "controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    controlFamilyId: uuid("control_family_id").references(() => controlFamilies.id).notNull(),
    controlId: text("control_id").notNull().unique(),
    nistReqId: text("nist_req_id").notNull(),
    title: text("title").notNull(),
    nistExactText: text("nist_exact_text"),
    nistDiscussionGuidance: text("nist_discussion_guidance"),
    /** Trust Codex: classification, evidence location/regeneration, status basis (from manual-data.json) */
    codexMetadata: jsonb("codex_metadata"),
  },
  (t) => [uniqueIndex("controls_control_id_idx").on(t.controlId)]
);

export const reviewFrequencyEnum = pgEnum("review_frequency", [
  "Monthly",
  "Quarterly",
  "Semiannual",
  "Annual",
]);

export const controlImplementations = pgTable("control_implementations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  controlId: uuid("control_id").references(() => controls.id).notNull(),
  status: controlStatusEnum("status").notNull().default("Not Started"),
  implementationNarrative: text("implementation_narrative"),
  responsibleOwnerId: uuid("responsible_owner_id").references(() => users.id),
  monitoringCadence: monitoringCadenceEnum("monitoring_cadence"),
  lastValidationDate: timestamp("last_validation_date", { withTimezone: true }),
  policySopRefs: text("policy_sop_refs"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  reviewFrequency: reviewFrequencyEnum("review_frequency"),
  nextReviewDue: timestamp("next_review_due", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const controlHistory = pgTable("control_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  controlImplementationId: uuid("control_implementation_id")
    .references(() => controlImplementations.id)
    .notNull(),
  changedById: uuid("changed_by_id").references(() => users.id).notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============== Module 2: POA&M ==============
export const poamItems = pgTable("poam_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  controlImplementationId: uuid("control_implementation_id").references(
    () => controlImplementations.id
  ).notNull(),
  poamId: text("poam_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  rootCause: text("root_cause"),
  riskSeverity: riskSeverityEnum("risk_severity").default("Medium"),
  status: poamStatusEnum("status").notNull().default("Open"),
  targetCompletionDate: timestamp("target_completion_date", { withTimezone: true }).notNull(),
  responsiblePartyId: uuid("responsible_party_id").references(() => users.id),
  evidenceMetadataRef: text("evidence_metadata_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const poamMilestones = pgTable("poam_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  poamItemId: uuid("poam_item_id").references(() => poamItems.id).notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  orderIndex: integer("order_index").default(0).notNull(),
});

export const poamRiskAssessments = pgTable("poam_risk_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  poamItemId: uuid("poam_item_id").references(() => poamItems.id).notNull(),
  assessedById: uuid("assessed_by_id").references(() => users.id).notNull(),
  severity: riskSeverityEnum("severity").notNull(),
  rationale: text("rationale"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const poamClosureApprovals = pgTable("poam_closure_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  poamItemId: uuid("poam_item_id").references(() => poamItems.id).notNull(),
  approverId: uuid("approver_id").references(() => users.id).notNull(),
  approvalOrder: integer("approval_order").notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true }).defaultNow().notNull(),
  signatureHash: text("signature_hash"),
});

// ============== Module 3: Evidence Metadata Registry ==============
export const evidenceMetadata = pgTable(
  "evidence_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    evidenceId: text("evidence_id").notNull(),
    runId: text("run_id").notNull(),
    artifactFilename: text("artifact_filename").notNull(),
    storageLocation: text("storage_location").notNull(),
    sha256Hash: text("sha256_hash"),
    generatedDate: timestamp("generated_date", { withTimezone: true }).notNull(),
    generatedById: uuid("generated_by_id").references(() => users.id),
    validationStatus: evidenceValidationStatusEnum("validation_status").default("Valid"),
    retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull(),
    regenerationInstructions: text("regeneration_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("evidence_metadata_evidence_id_org_idx").on(t.organizationId, t.evidenceId)]
);

export const evidenceControlLinks = pgTable(
  "evidence_control_links",
  {
    evidenceMetadataId: uuid("evidence_metadata_id").references(() => evidenceMetadata.id).notNull(),
    controlImplementationId: uuid("control_implementation_id").references(
      () => controlImplementations.id
    ).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.evidenceMetadataId, t.controlImplementationId] }),
  ]
);

// ============== Module 4: SSP & Governance ==============
export const sspSections = pgTable("ssp_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  documentCode: text("document_code").notNull(),
  sectionKey: text("section_key").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  orderIndex: integer("order_index").default(0).notNull(),
  version: integer("version").default(1).notNull(),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  type: text("type"),
  description: text("description"),
  locationReference: text("location_reference"),
});

export const dataFlows = pgTable("data_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  diagramReference: text("diagram_reference"),
});

export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  version: integer("version").default(1).notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
});

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  documentId: uuid("document_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  contentSnapshot: text("content_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdById: uuid("created_by_id").references(() => users.id),
});

// ============== Module 7: Attestation ==============
export const attestations = pgTable("attestations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  attestationType: attestationTypeEnum("attestation_type").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  signatoryId: uuid("signatory_id").references(() => users.id).notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true }).defaultNow().notNull(),
  dataHash: text("data_hash"),
  signatureCrypto: text("signature_crypto"),
});

// ============== Module 8: Supply Chain Portal ==============
export const subcontractorRelationshipStatusEnum = pgEnum("subcontractor_relationship_status", [
  "Pending",
  "Active",
  "Suspended",
]);

export const cmmcLevelEnum = pgEnum("cmmc_level", ["Level1", "Level2", "Level3"]);

export const subcontractorRelationships = pgTable("subcontractor_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  primeOrganizationId: uuid("prime_organization_id").references(() => organizations.id).notNull(),
  subOrganizationId: uuid("sub_organization_id").references(() => organizations.id),
  status: subcontractorRelationshipStatusEnum("status").notNull().default("Pending"),
  inviteEmail: text("invite_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  primeOrganizationId: uuid("prime_organization_id").references(() => organizations.id).notNull(),
  subOrganizationId: uuid("sub_organization_id").references(() => organizations.id).notNull(),
  contractName: text("contract_name").notNull(),
  contractNumber: text("contract_number"),
  cmmcLevelRequired: cmmcLevelEnum("cmmc_level_required").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const flowdownRequirements = pgTable("flowdown_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id").references(() => contracts.id).notNull(),
  controlId: uuid("control_id").references(() => controls.id).notNull(),
  isRequired: integer("is_required").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============== Mock Assessment Simulator (V2) ==============
export const mockAssessmentStatusEnum = pgEnum("mock_assessment_status", [
  "in_progress",
  "completed",
]);
export const mockAssessmentScoreEnum = pgEnum("mock_assessment_score", [
  "Met",
  "Partially Met",
  "Not Met",
]);

export const mockAssessments = pgTable("mock_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  status: mockAssessmentStatusEnum("status").notNull().default("in_progress"),
  scope: varchar("scope", { length: 20 }).notNull().default("full"),
  /** Stored control IDs (e.g. ["3.13.2", "AC.L1-3.1.1"]) for this run so GET returns same set. */
  controlIds: jsonb("control_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const mockAssessmentResponses = pgTable("mock_assessment_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  mockAssessmentId: uuid("mock_assessment_id")
    .references(() => mockAssessments.id, { onDelete: "cascade" })
    .notNull(),
  controlId: varchar("control_id", { length: 20 }).notNull(),
  questionText: text("question_text").notNull(),
  userResponse: text("user_response").notNull(),
  llmEvaluation: text("llm_evaluation").notNull(),
  score: mockAssessmentScoreEnum("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============== Supply Chain Portal V2: Flow-down response ==============
export const flowdownResponseTypeEnum = pgEnum("flowdown_response_type", [
  "linked_workspace",
  "manual_attestation",
]);

export const subcontractorFlowdownResponses = pgTable(
  "subcontractor_flowdown_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subcontractorRelationshipId: uuid("subcontractor_relationship_id")
      .references(() => subcontractorRelationships.id, { onDelete: "cascade" })
      .notNull(),
    token: varchar("token", { length: 64 }).notNull().unique(),
    responseType: flowdownResponseTypeEnum("response_type"),
    linkedOrganizationId: uuid("linked_organization_id").references(() => organizations.id),
    attestationData: jsonb("attestation_data").$type<Record<string, unknown>>(),
    sspDocumentUrl: text("ssp_document_url"),
    poamDocumentUrl: text("poam_document_url"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

// ============== Relations ==============
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  boundaryProfile: one(boundaryProfiles),
  users: many(users),
  roles: many(roles),
  controlRecords: many(controlRecords),
  controlImplementations: many(controlImplementations),
  poamItems: many(poamItems),
  poamEntries: many(poamEntries),
  evidenceMetadata: many(evidenceMetadata),
  sspSections: many(sspSections),
  assets: many(assets),
  dataFlows: many(dataFlows),
  policies: many(policies),
  auditLogs: many(auditLogs),
  attestations: many(attestations),
  primeRelationships: many(subcontractorRelationships, { relationName: "primeRelationships" }),
  subRelationships: many(subcontractorRelationships, { relationName: "subRelationships" }),
  primeContracts: many(contracts, { relationName: "primeContracts" }),
  subContracts: many(contracts, { relationName: "subContracts" }),
  mockAssessments: many(mockAssessments),
}));

export const boundaryProfilesRelations = relations(boundaryProfiles, ({ one }) => ({
  organization: one(organizations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations),
  controlRecordsAssessed: many(controlRecords),
  controlImplementationsOwned: many(controlImplementations),
  controlHistory: many(controlHistory),
  poamItemsResponsible: many(poamItems),
  poamClosureApprovals: many(poamClosureApprovals),
  evidenceGenerated: many(evidenceMetadata),
  artifactsUploaded: many(artifacts),
  technicalEvidenceUploaded: many(technicalEvidence),
  attestations: many(attestations),
}));

export const controlsRelations = relations(controls, ({ one, many }) => ({
  controlFamily: one(controlFamilies),
  implementations: many(controlImplementations),
  flowdownRequirements: many(flowdownRequirements),
}));

export const controlImplementationsRelations = relations(controlImplementations, ({ one, many }) => ({
  organization: one(organizations),
  control: one(controls),
  responsibleOwner: one(users),
  history: many(controlHistory),
  poamItems: many(poamItems),
  evidenceLinks: many(evidenceControlLinks),
}));

export const evidenceMetadataRelations = relations(evidenceMetadata, ({ one, many }) => ({
  organization: one(organizations),
  controlLinks: many(evidenceControlLinks),
}));

export const evidenceControlLinksRelations = relations(evidenceControlLinks, ({ one }) => ({
  evidenceMetadata: one(evidenceMetadata),
  controlImplementation: one(controlImplementations),
}));

export const poamItemsRelations = relations(poamItems, ({ one, many }) => ({
  organization: one(organizations),
  controlImplementation: one(controlImplementations),
  responsibleParty: one(users),
  milestones: many(poamMilestones),
  riskAssessments: many(poamRiskAssessments),
  closureApprovals: many(poamClosureApprovals),
}));

export const subcontractorRelationshipsRelations = relations(subcontractorRelationships, ({ one, many }) => ({
  primeOrganization: one(organizations, {
    fields: [subcontractorRelationships.primeOrganizationId],
    references: [organizations.id],
    relationName: "primeRelationships",
  }),
  subOrganization: one(organizations, {
    fields: [subcontractorRelationships.subOrganizationId],
    references: [organizations.id],
    relationName: "subRelationships",
  }),
  flowdownResponses: many(subcontractorFlowdownResponses),
}));

export const subcontractorFlowdownResponsesRelations = relations(
  subcontractorFlowdownResponses,
  ({ one }) => ({
    subcontractorRelationship: one(subcontractorRelationships),
    linkedOrganization: one(organizations, {
      fields: [subcontractorFlowdownResponses.linkedOrganizationId],
      references: [organizations.id],
    }),
  })
);

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  primeOrganization: one(organizations, {
    fields: [contracts.primeOrganizationId],
    references: [organizations.id],
    relationName: "primeContracts",
  }),
  subOrganization: one(organizations, {
    fields: [contracts.subOrganizationId],
    references: [organizations.id],
    relationName: "subContracts",
  }),
  flowdownRequirements: many(flowdownRequirements),
}));

export const flowdownRequirementsRelations = relations(flowdownRequirements, ({ one }) => ({
  contract: one(contracts),
  control: one(controls),
}));

export const mockAssessmentsRelations = relations(mockAssessments, ({ one, many }) => ({
  organization: one(organizations),
  responses: many(mockAssessmentResponses),
}));

export const mockAssessmentResponsesRelations = relations(mockAssessmentResponses, ({ one }) => ({
  mockAssessment: one(mockAssessments),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations),
  controlRecords: many(controlRecords),
  poamEntries: many(poamEntries),
}));

export const controlRecordHistoryRelations = relations(controlRecordHistory, ({ one }) => ({
  controlRecord: one(controlRecords),
  changedBy: one(users),
}));

export const controlRecordsRelations = relations(controlRecords, ({ one, many }) => ({
  organization: one(organizations),
  responsibleRole: one(roles),
  assessor: one(users),
  artifacts: many(artifacts),
  technicalEvidence: many(technicalEvidence),
  poamEntries: many(poamEntries),
  history: many(controlRecordHistory),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  organization: one(organizations),
  controlRecord: one(controlRecords),
  uploadedByUser: one(users),
}));

export const technicalEvidenceRelations = relations(technicalEvidence, ({ one }) => ({
  organization: one(organizations),
  controlRecord: one(controlRecords),
  uploadedByUser: one(users),
}));

export const poamEntryMilestonesRelations = relations(poamEntryMilestones, ({ one }) => ({
  poamEntry: one(poamEntries),
}));

export const poamEntryClosureApprovalsRelations = relations(poamEntryClosureApprovals, ({ one }) => ({
  poamEntry: one(poamEntries),
  approver: one(users),
}));

export const poamEntriesRelations = relations(poamEntries, ({ one, many }) => ({
  organization: one(organizations),
  controlRecord: one(controlRecords),
  responsibleRole: one(roles),
  milestones: many(poamEntryMilestones),
  closureApprovals: many(poamEntryClosureApprovals),
}));
