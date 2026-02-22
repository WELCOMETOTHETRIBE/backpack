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

// ============== Multi-tenancy & Auth (Module 6) ==============
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
  },
  (t) => [uniqueIndex("controls_control_id_idx").on(t.controlId)]
);

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

// ============== Relations ==============
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  controlImplementations: many(controlImplementations),
  poamItems: many(poamItems),
  evidenceMetadata: many(evidenceMetadata),
  sspSections: many(sspSections),
  assets: many(assets),
  dataFlows: many(dataFlows),
  policies: many(policies),
  auditLogs: many(auditLogs),
  attestations: many(attestations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations),
  controlImplementationsOwned: many(controlImplementations),
  controlHistory: many(controlHistory),
  poamItemsResponsible: many(poamItems),
  poamClosureApprovals: many(poamClosureApprovals),
  evidenceGenerated: many(evidenceMetadata),
  attestations: many(attestations),
}));

export const controlsRelations = relations(controls, ({ one, many }) => ({
  controlFamily: one(controlFamilies),
  implementations: many(controlImplementations),
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
