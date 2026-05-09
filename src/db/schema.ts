import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  integer,
  bigserial,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  varchar,
  date,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============== Enums ==============
export const userRoleEnum = pgEnum("user_role", ["Admin", "Compliance", "Assessor"]);
/**
 * CUI vault access level — orthogonal to userRoleEnum (which is the Codex
 * platform role). 'privileged' = sysadmin / elevated access in the actual
 * CUI environment; drives which AT.L2-3.2.x training is required. See
 * migration 0064 for full rationale.
 */
export const cuiAccessLevelEnum = pgEnum("cui_access_level", ["general", "privileged"]);
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
export const artifactStatusEnum = pgEnum("artifact_status", [
  "awaiting_upload",
  "uploaded",
  "approved",
  "superseded",
  "expired",
]);
export const artifactLinkTypeEnum = pgEnum("artifact_link_type", [
  "control",
  "register_entry",
  "poam_entry",
  "poam_milestone",
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
  "not_applicable",
]);
export const evidenceTypeEnum = pgEnum("evidence_type", [
  "screenshot",
  "config_file",
  "scan_result",
  "log_file",
]);
export const poamEntryStatusEnum = pgEnum("poam_entry_status", [
  // Legacy values kept for back-compat with existing rows. New code
  // writes 'draft' or 'active' for the auto-POA&M flow added in
  // Phase A0+.
  "open",
  "closed",
  // Phase A0 additions (see drizzle/0068_canonical_adjudication.sql):
  "draft",
  "active",
]);

// ============== Governance Portal ==============
export const governanceControlClassificationEnum = pgEnum("governance_control_classification", [
  "PURE_GOV",
  "HYBRID_GOV",
  "TECHNICAL",
]);
export const governanceDocTypeEnum = pgEnum("governance_doc_type", [
  "POLICY",
  "SOP",
  "PLAN",
  "STANDARD",
  "CHARTER",
  "PROCEDURE",
  "TEMPLATE",
]);
export const governanceDocStatusEnum = pgEnum("governance_doc_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "RETIRED",
]);
export const governanceEvidenceTypeEnum = pgEnum("governance_evidence_type", [
  "screenshot",
  "export_file",
  "log_snippet",
  "config_baseline",
  "policy_export",
  "ticket",
  "training_record",
  "incident_report",
  "risk_report",
  "attestation",
  "other",
]);
export const governanceControlLinkTypeEnum = pgEnum("governance_control_link_type", [
  "document",
  "register_entry",
  "evidence",
]);
/** Evidence Engine: register entry lifecycle (draft → final → void). */
export const registerEntryStatusEnum = pgEnum("register_entry_status", ["draft", "final", "void"]);

// ============== OS Baselines (technical implementation plane) ==============
export const osFamilyEnum = pgEnum("os_family", [
  "windows_server",
  "windows_client",
  "linux",
]);
export const osAssetRoleEnum = pgEnum("os_asset_role", [
  "member_server",
  "domain_controller",
  "workstation",
]);
export const baselineControlApplicabilityEnum = pgEnum("baseline_control_applicability", [
  "required",
  "conditional",
  "na_by_default",
]);

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
    /** Hybrid controls: user-modifiable satisfaction of the two criteria (technical/OS + governance). */
    hybridSatisfaction: jsonb("hybrid_satisfaction").$type<{ technical?: boolean; governance?: boolean }>(),
    /** How this control was validated: examine | interview | test | combination */
    validationMethod: text("validation_method"),
    // ── Dual-evidence adjudication lanes ──────────────────────────────────────
    /** Technical evidence lane. Values: not_started | satisfied | failed | not_applicable */
    technicalStatus: text("technical_status").notNull().default("not_started"),
    /** True for the ~18 controls that require BOTH a technical evidence AND a policy document. */
    policyDocRequired: boolean("policy_doc_required").notNull().default(false),
    /** Policy document lane. Values: not_required | required | missing | satisfied */
    policyStatus: text("policy_status").notNull().default("not_required"),
    /** Which document satisfies the policy lane (doc number, version, SHA-256 reference). */
    policyDocNarrative: text("policy_doc_narrative"),
    /** When policy lane was last marked satisfied. */
    policyDocLinkedAt: timestamp("policy_doc_linked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("control_records_org_control_idx").on(t.organizationId, t.controlId)]
);

/**
 * Enclave evidence metadata links — RunId + file path + SHA-256 only.
 * CUI never leaves the enclave; this table stores only the reference metadata.
 */
export const controlEvidenceLinks = pgTable(
  "control_evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
    controlRecordId: uuid("control_record_id").references(() => controlRecords.id, { onDelete: "cascade" }).notNull(),
    runId: text("run_id").notNull(),
    filePath: text("file_path").notNull(),
    sha256Hash: text("sha256_hash").notNull(),
    description: text("description"),
    /** Source identifier — e.g. collector name, provider name */
    source: text("source"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    linkedBy: uuid("linked_by").references(() => users.id),
  },
  (t) => [index("cel_org_control_idx").on(t.organizationId, t.controlRecordId)]
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
  /** Nullable to allow placeholder rows in "awaiting_upload" status before a file exists. */
  fileName: varchar("file_name", { length: 255 }),
  fileUrl: text("file_url"),
  /** Storage provider's key/id for getDownloadUrl and delete (e.g. S3 key, blob name). */
  storageKey: text("storage_key"),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  version: varchar("version", { length: 50 }),
  approvalDate: date("approval_date"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  vaultDocumentId: varchar("vault_document_id", { length: 255 }),
  /** Lifecycle status. Placeholders start "awaiting_upload"; legacy rows default to "uploaded". */
  status: artifactStatusEnum("status").notNull().default("uploaded"),
  /** Expected closure shape from the client-required-artifacts catalog. */
  expectedClosureType: varchar("expected_closure_type", { length: 32 }),
  expectedEvidenceType: varchar("expected_evidence_type", { length: 32 }),
  expectedCadence: varchar("expected_cadence", { length: 32 }),
  expectedDueDate: date("expected_due_date"),
  /** Stable catalog key (e.g. "AT.3.2.1.initial_annual_certs"); present only on catalog-seeded placeholders. */
  milestoneKey: varchar("milestone_key", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Polymorphic link from a single stored artifact to any number of things it
 * satisfies: the primary control (already on artifacts.controlRecordId but
 * mirrored here for uniform querying), other controls, governance register
 * entries, POAM entries, and individual POAM milestones.
 */
export const artifactLinks = pgTable(
  "artifact_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    artifactId: uuid("artifact_id").references(() => artifacts.id, { onDelete: "cascade" }).notNull(),
    linkType: artifactLinkTypeEnum("link_type").notNull(),
    linkTargetId: uuid("link_target_id").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("artifact_links_unique").on(t.artifactId, t.linkType, t.linkTargetId),
    index("artifact_links_target_idx").on(t.linkType, t.linkTargetId),
  ]
);

/** Non-upload governance artifact completion (REFERENCE, ATTESTATION, SYSTEM_POINTER). UPLOAD is stored in artifacts. */
export const governanceArtifactCompletions = pgTable(
  "governance_artifact_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
    controlRecordId: uuid("control_record_id").references(() => controlRecords.id, { onDelete: "cascade" }).notNull(),
    artifactLabel: varchar("artifact_label", { length: 255 }).notNull(),
    artifactType: varchar("artifact_type", { length: 32 }).notNull(), // REFERENCE | ATTESTATION | SYSTEM_POINTER
    valueText: text("value_text"),
    attestedBy: uuid("attested_by").references(() => users.id),
    attestedAt: timestamp("attested_at", { withTimezone: true }),
    /**
     * Optional NIST SP 800-171A objective letter (e.g. "[a]", "[b]", "[c]").
     * Per-objective completions let an IR tabletop bundle close
     * 3.6.3[a] independently of [b]/[c] instead of marking the whole
     * control "touched". NULL = whole-control attestation (legacy + most
     * non-IR completions). Added in migration 0065.
     */
    objectiveId: varchar("objective_id", { length: 8 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("governance_artifact_completions_record_label").on(t.controlRecordId, t.artifactLabel),
  ]
);

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
  /** Set when status becomes closed (manual or auto-close). */
  closedAt: timestamp("closed_at", { withTimezone: true }),
  /** Explanation for closure; e.g. "User uploaded required attestation to Governance > Evidence (title)." */
  closeoutEvidence: text("closeout_evidence"),
  /**
   * AG p.10 mandates "deficiency reviews" content for a POA&M to count
   * as a MET-elevator. The "review" describes what's missing, why, and
   * how it was identified. Required when the POA&M is the elevator
   * keeping a control's verdict at MET.
   */
  deficiencyReviewSummary: text("deficiency_review_summary"),
  /**
   * AG p.10 mandates "show progress towards the implementation of
   * corrections." Updated on rescore + by the customer over time.
   */
  progressSummary: text("progress_summary"),
  /**
   * Captured at finalize time and never moved. The `scheduledCompletionDate`
   * can shift; this doesn't. Powers chronic-slippage detection: AG p.10
   * reserves the elevator for "temporary deficiencies," so a POA&M open
   * past 365d from this date stops counting.
   */
  originalCompletionDate: date("original_completion_date"),
  /**
   * Increments every time scheduledCompletionDate moves forward. If > 2
   * the POA&M no longer counts as a "temporary deficiency" elevator.
   */
  targetPushedCount: integer("target_pushed_count").notNull().default(0),
  /**
   * Set when status flips from 'draft' to 'active'. Auto-created stub
   * POA&Ms are draft until the customer fills the AG-mandated fields
   * and finalizes; only then do they elevate the verdict.
   */
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  /**
   * When the rescore creates a stub POA&M for a NOT MET objective, this
   * records which objective letter ("a", "b"...) triggered it. Null on
   * customer-authored POA&Ms.
   */
  autoCreatedForObjective: varchar("auto_created_for_objective", { length: 8 }),
  /** Distinguishes auto-created from customer-created. */
  autoCreatedAt: timestamp("auto_created_at", { withTimezone: true }),
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
  /** Clerk Organization id (org_…) — links this row to the SSO tenant. */
  clerkOrgId: text("clerk_org_id").unique(),
  /** SPRS score (110 to negative). Recomputed on every control status change. */
  sprsScore: integer("sprs_score"),
  /** From onboarding: prime, sub, both */
  organizationType: varchar("organization_type", { length: 20 }),
  /** From onboarding: Level1, Level2, Level3 */
  cmmcTargetLevel: varchar("cmmc_target_level", { length: 20 }),
  /** Step 2 onboarding: 5-character government identifier (sam.gov) */
  cageCode: varchar("cage_code", { length: 10 }),
  /** Primary business address */
  primaryAddress: text("primary_address"),
  /** Primary point of contact name */
  primaryContactName: varchar("primary_contact_name", { length: 255 }),
  /** Primary point of contact email */
  primaryContactEmail: varchar("primary_contact_email", { length: 255 }),
  // ── SSP Boundary Scoping (Wizard) ──────────────────────────────────────────
  /** Formal SSP system name (may differ from org display name). */
  systemName: varchar("system_name", { length: 255 }),
  /** Narrative description of the information system. */
  systemDescription: text("system_description"),
  /** Formal authorization boundary statement anchoring the SSP. */
  authorizationBoundaryStatement: text("authorization_boundary_statement"),
  /** Government-designated System Owner. */
  systemOwnerName: varchar("system_owner_name", { length: 255 }),
  systemOwnerEmail: varchar("system_owner_email", { length: 255 }),
  /** Information System Security Officer. */
  issoName: varchar("isso_name", { length: 255 }),
  issoEmail: varchar("isso_email", { length: 255 }),
  /** DFARS/DoD CUI category identifiers in scope. */
  cuiCategories: jsonb("cui_categories").$type<string[]>(),
  /** External service providers and inherited controls. */
  externalServiceProviders: jsonb("external_service_providers").$type<
    Array<{
      name: string;
      serviceType: string;
      dataTypes: string[];
      inheritedControls: string[];
      website?: string;
    }>
  >(),
  /** Network diagram description / boundary narrative. */
  boundaryNarrative: text("boundary_narrative"),
  /** Set when the scoping wizard is completed. */
  boundaryScopingCompletedAt: timestamp("boundary_scoping_completed_at", { withTimezone: true }),
  /**
   * Default IR Tabletop records retention in years (anchored to two CMMC L2
   * assessment cycles + FAR 4.703 norms; see schema.ir-tabletop.ts header).
   * Per-exercise override lives on ir_exercises.retention_until.
   */
  defaultIrRetentionYears: integer("default_ir_retention_years").notNull().default(6),
  /**
   * Long-lived bearer token for unattended ingest from MacTech EnclaveWatch
   * (the in-vault audit + cadence service). Set per-org via the issuance
   * script. EnclaveWatch sends "Authorization: Bearer <token>" on
   * /api/evidence/v2/ingest, /api/os-baselines/.../import-report, and
   * /api/enclavewatch/weekly-review/ingest. The token resolves the org
   * server-side -- EnclaveWatch never has to know the orgId.
   */
  enclavewatchApiToken: text("enclavewatch_api_token").unique(),
  /**
   * Optional base URL for the EnclaveWatch in-vault UI (e.g.
   * "https://cui-win-pilot-01.westus2.cloudapp.azure.com"). When set,
   * vuln_remediation register entries render a per-machine "View on
   * EnclaveWatch" deep-link to <base_url>/Vulnerabilities?machine=<id>.
   *
   * Setting this assumes the customer has Caddy (or equivalent reverse
   * proxy) in front of EnclaveWatch with a basic-auth + IP-allowlist
   * gate, and EnclaveWatch's ReverseProxy auth scheme enabled.
   * Operational contract documented in
   * docs/EnclaveWatch-Reverse-Proxy-Runbook.md.
   *
   * NULL when the vault is network-isolated from auditor workstations
   * or no reverse proxy is published.
   */
  enclavewatchBaseUrl: text("enclavewatch_base_url"),
  /**
   * TrainOS tenant identifier (cuid). Set per-org in Settings →
   * Integrations → TrainOS during onboarding. The inbound webhook handler
   * resolves orgId via this column; missing row → terminal 404
   * (tenant_not_onboarded). See docs and Sprint 9.
   */
  trainosTenantId: text("trainos_tenant_id").unique(),
  /**
   * Per-tenant HMAC secret (hex-encoded random bytes) used to validate
   * `sha256={hex(hmac_sha256(secret, "{ts}.{body}"))}` on inbound deliveries
   * from training.mactechsolutionsllc.com. Manual two-phase rotation only
   * for v1 (dual-window deferred to v3). Show-once UX in Settings.
   */
  trainosWebhookSecret: text("trainos_webhook_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * TrainOS → Codex delivery audit + dedup log. One row per accepted
 * `evidence.attempt.completed` (or other) event. Replay of the same
 * `delivery_id` returns the cached `verdict_response` verbatim — same
 * pattern as isso_export_manifests.
 */
export const trainosDeliveries = pgTable(
  "trainos_deliveries",
  {
    deliveryId: uuid("delivery_id").primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 8 }),
    canonicalizationVer: varchar("canonicalization_ver", { length: 8 }),
    evidenceRecordId: text("evidence_record_id").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    certificateNumber: text("certificate_number"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    verdictResponse: jsonb("verdict_response").$type<Record<string, unknown>>().notNull(),
    verdictOverall: varchar("verdict_overall", { length: 32 }).notNull(),
    /** sha256 hex of the raw request body — for 409 detection on replay-with-different-body. */
    requestBodyHash: text("request_body_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    sandbox: boolean("sandbox").default(false).notNull(),
  }
);

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

// ============== Boundary Engine: one boundary per account (organization) ==============
/** One row per organization: current boundary input and last allocation hash. */
export const accountBoundary = pgTable(
  "account_boundary",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boundaryId: text("boundary_id").notNull(),
    providerKey: text("provider_key").notNull(),
    environmentKey: text("environment_key").notNull(),
    hostingModel: text("hosting_model").notNull(),
    boundaryInputJson: jsonb("boundary_input_json").$type<Record<string, unknown>>().notNull(),
    allocationHashCurrent: text("allocation_hash_current"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("account_boundary_provider_env_idx").on(t.providerKey, t.environmentKey)]
);

/** Append-only allocation snapshots per account. */
export const boundarySnapshots = pgTable(
  "boundary_snapshots",
  {
    snapshotId: text("snapshot_id").primaryKey(),
    accountId: uuid("account_id")
      .references(() => accountBoundary.accountId, { onDelete: "cascade" })
      .notNull(),
    boundaryId: text("boundary_id").notNull(),
    allocationHash: text("allocation_hash").notNull(),
    registryVersion: text("registry_version").notNull().default(""),
    snapshotMetadataJson: jsonb("snapshot_metadata_json").$type<Record<string, unknown>>().notNull(),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    snapshotSignature: text("snapshot_signature"),
    evidenceRunFingerprints: jsonb("evidence_run_fingerprints").$type<string[]>(),
    coverageSource: text("coverage_source"),
    coverageEvidenceRunId: text("coverage_evidence_run_id"),
    coverageRunFingerprint: text("coverage_run_fingerprint"),
    coverageCollectedAt: timestamp("coverage_collected_at", { withTimezone: true }),
    coverageHash: text("coverage_hash"),
    coverageTotals: jsonb("coverage_totals").$type<{
      enclave_controls: number;
      pass_fresh: number;
      pass_stale: number;
      pass_unknown_layer: number;
      fail: number;
      no_finding: number;
    }>(),
    coverageTopGaps: jsonb("coverage_top_gaps").$type<{
      unknown_layer: string[];
      stale: string[];
      failed: string[];
      no_finding: string[];
    }>(),
  },
  (t) => [
    index("boundary_snapshots_account_created_idx").on(t.accountId, t.createdAt),
    index("boundary_snapshots_snapshot_signature_idx").on(t.snapshotSignature),
    index("boundary_snapshots_coverage_hash_idx").on(t.coverageHash),
    index("boundary_snapshots_coverage_run_fp_idx").on(t.coverageRunFingerprint),
  ]
);

/** Drift and allocation-change events per boundary (CONMON). */
export const boundaryEvents = pgTable(
  "boundary_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .references(() => accountBoundary.accountId, { onDelete: "cascade" })
      .notNull(),
    boundaryId: text("boundary_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("boundary_events_account_created_idx").on(t.accountId, t.createdAt),
    index("boundary_events_boundary_id_idx").on(t.boundaryId),
  ]
);

/** CUI enclave / segment (OS Baselines pillar). */
export const boundaries = pgTable(
  "boundary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    /** In-scope components: microsoft_office, windows_server_vm, azure_cloud. */
    scopeComponents: jsonb("scope_components").$type<string[]>(),
    /** When azure_cloud is in scope_components: gov | commercial. */
    azureEnvironment: varchar("azure_environment", { length: 32 }),
    /** Optional cloud hosting: none | microsoft | google | azure. When microsoft/azure, scope/azure env can apply. */
    cloudProvider: varchar("cloud_provider", { length: 32 }),
    /** Boundary classification: cui_enclave | corporate_it | lab_environment | other. */
    boundaryType: varchar("boundary_type", { length: 32 }).notNull().default("cui_enclave"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("boundary_org_type_idx").on(t.organizationId, t.boundaryType)]
);

/** Baseline template for an OS type/role (e.g. Windows Server 2025 Member Server). */
export const osBaselineProfiles = pgTable("baseline_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 50 }).notNull(),
  osFamily: osFamilyEnum("os_family").notNull(),
  osVersion: varchar("os_version", { length: 50 }).notNull(),
  role: osAssetRoleEnum("role").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Which controls apply to a baseline. */
export const baselineControls = pgTable(
  "baseline_control",
  {
    baselineProfileId: uuid("baseline_profile_id")
      .notNull()
      .references(() => osBaselineProfiles.id, { onDelete: "cascade" }),
    controlId: text("control_id").notNull(),
    applicability: baselineControlApplicabilityEnum("applicability").notNull(),
    rationale: text("rationale"),
  },
  (t) => [primaryKey({ columns: [t.baselineProfileId, t.controlId] })]
);

/** Per-check expected setting and evidence (within a baseline). */
export const baselineChecks = pgTable(
  "baseline_check",
  {
    baselineProfileId: uuid("baseline_profile_id")
      .notNull()
      .references(() => osBaselineProfiles.id, { onDelete: "cascade" }),
    checkId: varchar("check_id", { length: 120 }).notNull(),
    controlId: text("control_id").notNull(),
    expectedSetting: text("expected_setting").notNull(),
    evidenceRequiredFiles: jsonb("evidence_required_files").$type<string[]>().notNull().default([]),
    validation: jsonb("validation"), // regex/threshold/value rules
    remediationGuidance: text("remediation_guidance"),
    manualCommands: jsonb("manual_commands").$type<string[]>(),
  },
  (t) => [uniqueIndex("baseline_check_profile_check_idx").on(t.baselineProfileId, t.checkId)]
);

/** Host inside a boundary (OS Baselines pillar). */
export const osAssets = pgTable("os_asset", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  boundaryId: uuid("boundary_id")
    .references(() => boundaries.id, { onDelete: "cascade" })
    .notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  osFamily: osFamilyEnum("os_family").notNull(),
  osVersion: varchar("os_version", { length: 50 }).notNull(),
  role: osAssetRoleEnum("role").notNull(),
  baselineProfileId: uuid("baseline_profile_id").references(() => osBaselineProfiles.id, {
    onDelete: "set null",
  }),
  owner: varchar("owner", { length: 255 }),
  tags: jsonb("tags").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Additional boundary components (networking devices, VMs, bare metal) not modeled as OS assets. */
export const boundaryComponents = pgTable(
  "boundary_component",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boundaryId: uuid("boundary_id")
      .references(() => boundaries.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** network_device | vm | bare_metal */
    componentType: varchar("component_type", { length: 32 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("boundary_component_boundary_id_idx").on(t.boundaryId)]
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull().unique(),
  /** Clerk user id (user_…). Nullable so legacy rows can be adopted on first SSO login by email. */
  clerkUserId: text("clerk_user_id").unique(),
  /** Legacy bcrypt hash from the NextAuth era. Preserved nullable; no new writes after Clerk cutover. */
  passwordHash: text("password_hash"),
  name: text("name"),
  role: userRoleEnum("role").notNull().default("Compliance"),
  /** CUI vault privilege level — see cuiAccessLevelEnum. */
  cuiAccessLevel: cuiAccessLevelEnum("cui_access_level").notNull().default("general"),
  mfaEnabled: integer("mfa_enabled").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userInvitations = pgTable("user_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("Compliance"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedById: uuid("invited_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============== Feedback ==============
export const feedbackStatusEnum = pgEnum("feedback_status", ["pending", "reviewed", "resolved"]);
export const feedbackCategoryEnum = pgEnum("feedback_category", ["bug", "ux", "feature", "general"]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    category: feedbackCategoryEnum("category").notNull().default("general"),
    status: feedbackStatusEnum("status").notNull().default("pending"),
    pageUrl: text("page_url"),
    elementSelector: text("element_selector"),
    elementId: text("element_id"),
    elementClass: text("element_class"),
    elementText: text("element_text"),
    elementType: text("element_type"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // ── Resolution provenance — populated by the incorporate-feedback agent ──
    resolutionCommitSha: text("resolution_commit_sha"),
    resolutionCommitUrl: text("resolution_commit_url"),
    resolutionSummary: text("resolution_summary"),
    resolutionFiles: jsonb("resolution_files").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("feedback_org_idx").on(t.organizationId),
    index("feedback_status_idx").on(t.status),
    index("feedback_created_idx").on(t.createdAt),
  ]
);

// ============== Agent Runs (background AI jobs) ==============
export const agentRunStatusEnum = pgEnum("agent_run_status", ["running", "done", "error"])

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull().default("incorporate_feedback"),
  status: agentRunStatusEnum("status").notNull().default("running"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("agent_runs_org_idx").on(t.organizationId),
])

export const agentRunEvents = pgTable("agent_run_events", {
  id: bigserial("id", { mode: "number" }),
  runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "cascade" }).notNull(),
  seq: integer("seq").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agent_run_events_run_idx").on(t.runId, t.seq),
])

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

/**
 * Phase C0 SSP rebuild — versioned envelope.
 *
 * One row per generated SSP version. Carries:
 *   - canonical machine-readable + human-readable serializations
 *     (payload_json, payload_md) — both deterministically derived
 *     from the same generation inputs so re-running the generator
 *     against unchanged evidence reproduces an identical SHA-256
 *   - cryptographic provenance (payload_sha256 + Codex signature)
 *   - generation provenance (controls_covered + per-met_via tally)
 *   - lifecycle (draft / signed / superseded / revoked) + supersession
 *     trail
 *
 * Customer countersignature (Posture C) lands in the customer_signature_json
 * column when ready; today the AO sign-off is captured as a separate
 * ssp_signoffs row bound to the same payload_sha256.
 */
export const sspDocuments = pgTable("ssp_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  boundaryId: uuid("boundary_id")
    .notNull()
    .references(() => boundaries.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  generatedFromSnapshotAt: timestamp("generated_from_snapshot_at", {
    withTimezone: true,
  }).notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  payloadMd: text("payload_md").notNull(),
  pdfStorageUri: text("pdf_storage_uri"),
  payloadSha256: varchar("payload_sha256", { length: 64 }).notNull(),
  signatureAlg: varchar("signature_alg", { length: 32 }),
  signatureKid: varchar("signature_kid", { length: 64 }),
  signatureValue: text("signature_value"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedByUserId: uuid("signed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  customerSignatureJson: jsonb("customer_signature_json"),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  supersededById: uuid("superseded_by_id"),
  controlsCovered: integer("controls_covered").notNull().default(0),
  controlsMet: integer("controls_met").notNull().default(0),
  controlsNotMet: integer("controls_not_met").notNull().default(0),
  controlsNa: integer("controls_na").notNull().default(0),
  controlsMetViaEvidence: integer("controls_met_via_evidence").notNull().default(0),
  controlsMetViaEsp: integer("controls_met_via_esp").notNull().default(0),
  controlsMetViaEnduringException: integer("controls_met_via_enduring_exception")
    .notNull()
    .default(0),
  controlsMetViaDodCio: integer("controls_met_via_dod_cio").notNull().default(0),
  controlsMetViaOpPlan: integer("controls_met_via_op_plan").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-section content for a generated SSP version. Section taxonomy
 * matches the AG-mandated SSP structure [AG pp.209–210]:
 * system_id / scope / environment / security_reqs / control /
 * connections / update_freq / appendix / personnel / esp.
 *
 * For control sections, section_key is the NIST control_id ("3.1.1")
 * and the row carries the canonical state at gen time
 * (aggregate_finding, met_via, objective_verdicts) so the SSP renders
 * verdicts without re-querying.
 */
export const sspSectionRevisions = pgTable("ssp_section_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sspDocumentId: uuid("ssp_document_id")
    .notNull()
    .references(() => sspDocuments.id, { onDelete: "cascade" }),
  sectionKind: varchar("section_kind", { length: 32 }).notNull(),
  sectionKey: text("section_key").notNull(),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  bodyJson: jsonb("body_json"),
  evidencePinnedSha256: varchar("evidence_pinned_sha256", { length: 64 }).notNull(),
  aggregateFinding: varchar("aggregate_finding", { length: 16 }),
  metVia: varchar("met_via", { length: 40 }),
  objectiveVerdicts: jsonb("objective_verdicts"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Denormalized hash-pinned evidence-citation list. Every cited
 * evidence row gets one row here with its SHA-256 captured at
 * generation time. The drift-detect endpoint walks these to find
 * rows that have changed since the SSP was signed.
 */
export const sspEvidenceCitations = pgTable("ssp_evidence_citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sspDocumentId: uuid("ssp_document_id")
    .notNull()
    .references(() => sspDocuments.id, { onDelete: "cascade" }),
  sspSectionRevisionId: uuid("ssp_section_revision_id")
    .notNull()
    .references(() => sspSectionRevisions.id, { onDelete: "cascade" }),
  controlId: varchar("control_id", { length: 20 }),
  evidenceKind: varchar("evidence_kind", { length: 40 }).notNull(),
  evidenceId: text("evidence_id").notNull(),
  evidenceSha256: varchar("evidence_sha256", { length: 64 }),
  supportsObjectives: jsonb("supports_objectives").notNull().default([]),
  evidenceExcerpt: text("evidence_excerpt"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Phase 1 of "Send to Doc Control for SSP release."
 *
 * Records each submission of a Codex-generated SSP version to the
 * MacTech Quality QMS for formal release. The Codex generates + signs
 * the SSP from canonical state; this table tracks the handoff into
 * the same governance pipeline every other authorized doc flows
 * through (Reviewer → Approver → Quality Release).
 *
 * State machine:
 *   submitted   → Codex packaged the artifact and (Phase 2) POSTed it
 *                 to MacTech Quality. Awaits QMS-side signatures.
 *   released    → QMS released the doc. The next QMS manifest ingest
 *                 carried it back; the linker matched (document_number,
 *                 sha256) → this row was promoted.
 *   superseded  → A newer submission has been released, retiring this
 *                 one. superseded_by_id points to the successor row.
 *   rejected    → QMS Reviewer/Approver/QR refused release.
 *                 rejected_reason carries the operator-facing detail.
 *
 * Phase 1 (this migration / schema entry) ships only the Codex-side
 * state machine. The outbound HTTP bridge and the inbound linker
 * land in Phases 2/3 once the QMS team exposes the receiving endpoint.
 */
export const sspDocControlSubmissions = pgTable("ssp_doc_control_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  sspDocumentId: uuid("ssp_document_id")
    .notNull()
    .references(() => sspDocuments.id, { onDelete: "cascade" }),
  /** submitted | released | superseded | rejected */
  status: varchar("status", { length: 16 }).notNull().default("submitted"),
  /**
   * payload_sha256 captured at submission time. The QMS-side release
   * may sign over its own (possibly differently canonicalized) bytes,
   * so we keep both: this for "what Codex handed off" and qms_sha256
   * for "what QMS actually released."
   */
  submittedPayloadSha256: varchar("submitted_payload_sha256", { length: 64 }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  /** QMS document_number (e.g. "SSP-001"). Stable across SSP versions. */
  qmsDocumentNumber: text("qms_document_number"),
  qmsSha256: varchar("qms_sha256", { length: 64 }),
  /**
   * QMS-side staging-row id, returned by POST /api/external-submissions/ssp.
   * Set when Phase 2-Codex-outbound successfully reaches QMS and the QMS
   * accepts the submission. Null while the outbound POST is pending or
   * has failed.
   */
  qmsSubmissionId: text("qms_submission_id"),
  /**
   * Diagnostics for the outbound POST. last_outbound_error captures the
   * most recent failure reason (truncated to a few hundred chars) so the
   * dashboard can surface "QMS unreachable" without burying it in logs.
   * outbound_attempt_count + last_outbound_attempt_at let an operator
   * decide whether to retry.
   */
  outboundAttemptCount: integer("outbound_attempt_count").notNull().default(0),
  lastOutboundError: text("last_outbound_error"),
  lastOutboundAttemptAt: timestamp("last_outbound_attempt_at", {
    withTimezone: true,
  }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  supersededById: uuid("superseded_by_id"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  /** Optional comment for control attestations (e.g. "Reviewed Q1 logs"). */
  comment: text("comment"),
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

// ============== Governance Portal Tables ==============
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const governanceControlMetadata = pgTable(
  "governance_control_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    controlId: varchar("control_id", { length: 20 }).notNull().unique(),
    classification: governanceControlClassificationEnum("classification").notNull(),
    controlStatement: text("control_statement"),
    requiredArtifactTypes: jsonb("required_artifact_types").$type<string[]>().default([]),
    requiredDocuments: jsonb("required_documents").$type<string[]>().default([]),
    requiredRegisters: jsonb("required_registers").$type<string[]>().default([]),
    requiredHybridEvidenceTypes: jsonb("required_hybrid_evidence_types").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const governanceDocuments = pgTable("governance_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  docId: varchar("doc_id", { length: 100 }).notNull(),
  title: text("title").notNull(),
  type: governanceDocTypeEnum("type").notNull(),
  domain: varchar("domain", { length: 10 }),
  version: varchar("version", { length: 50 }).default("1"),
  status: governanceDocStatusEnum("status").notNull().default("DRAFT"),
  ownerId: uuid("owner_id").references(() => users.id),
  approverId: uuid("approver_id").references(() => users.id),
  approvalDate: date("approval_date"),
  nextReviewDate: date("next_review_date"),
  reviewCadenceDays: integer("review_cadence_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const governanceDocumentVersions = pgTable("governance_document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .references(() => governanceDocuments.id, { onDelete: "cascade" })
    .notNull(),
  versionNumber: integer("version_number").notNull(),
  fileUrl: text("file_url").notNull(),
  storageKey: text("storage_key"),
  sha256Hash: varchar("sha256_hash", { length: 64 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  originalFilename: varchar("original_filename", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdById: uuid("created_by_id").references(() => users.id),
});

export const governanceRegisters = pgTable("governance_registers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  registerKey: varchar("register_key", { length: 80 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  requiredColumns: jsonb("required_columns").$type<{ key: string; label: string; type: string }[]>().default([]),
  retainForDays: integer("retain_for_days"),
  /** Evidence Engine: default cadence in days for coverage window (from register_entry_schemas). */
  defaultCadenceDays: integer("default_cadence_days"),
  /** Evidence Engine: org override for cadence days; takes precedence over defaultCadenceDays. */
  cadenceOverrideDays: integer("cadence_override_days"),
  /**
   * NIST SP 800-171 control IDs that this register satisfies.
   * Populated from the control intelligence matrix; used to surface register
   * requirements on the control detail page and in the readiness score.
   */
  controlIds: jsonb("control_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const governanceRegisterEntries = pgTable(
  "governance_register_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registerId: uuid("register_id")
      .references(() => governanceRegisters.id, { onDelete: "cascade" })
      .notNull(),
    boundaryId: uuid("boundary_id")
      .references(() => boundaries.id, { onDelete: "cascade" })
      .notNull(),
    entryData: jsonb("entry_data").$type<Record<string, unknown>>().notNull(),
    /** Evidence Engine: entry type from schema (e.g. grant_access, offboarding_completed). */
    entryType: varchar("entry_type", { length: 80 }),
    /** Evidence Engine: draft | final | void; default draft. */
    status: registerEntryStatusEnum("status").default("draft").notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    approvedById: uuid("approved_by_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedById: uuid("locked_by_id").references(() => users.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedById: uuid("voided_by_id").references(() => users.id),
    voidReason: text("void_reason"),
    exportable: boolean("exportable").default(false).notNull(),
    createdById: uuid("created_by_id").references(() => users.id),
    hold: integer("hold").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("gov_register_entries_boundary_register_idx").on(t.boundaryId, t.registerId)]
);

export const governanceRegisterEntryFiles = pgTable(
  "governance_register_entry_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registerEntryId: uuid("register_entry_id")
      .references(() => governanceRegisterEntries.id, { onDelete: "cascade" })
      .notNull(),
    boundaryId: uuid("boundary_id")
      .references(() => boundaries.id, { onDelete: "cascade" })
      .notNull(),
    fileUrl: text("file_url").notNull(),
    storageKey: text("storage_key"),
    sha256Hash: varchar("sha256_hash", { length: 64 }),
    fileSize: integer("file_size"),
    originalFilename: varchar("original_filename", { length: 255 }),
    uploadedById: uuid("uploaded_by_id").references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
    exportable: boolean("exportable").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("gov_entry_files_boundary_entry_idx").on(t.boundaryId, t.registerEntryId)]
);

export const governanceEntryEvents = pgTable(
  "governance_entry_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    boundaryId: uuid("boundary_id")
      .references(() => boundaries.id, { onDelete: "cascade" })
      .notNull(),
    entryId: uuid("entry_id")
      .references(() => governanceRegisterEntries.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).defaultNow().notNull(),
    eventJson: jsonb("event_json").$type<Record<string, unknown>>(),
  },
  (t) => [index("gov_entry_events_org_boundary_entry_idx").on(t.orgId, t.boundaryId, t.entryId)]
);

export const governanceEvidenceItems = pgTable("governance_evidence_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  evidenceType: governanceEvidenceTypeEnum("evidence_type").notNull(),
  sourceSystem: varchar("source_system", { length: 255 }),
  collectedById: uuid("collected_by_id").references(() => users.id),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull(),
  validityPeriodDays: integer("validity_period_days"),
  sha256Hash: varchar("sha256_hash", { length: 64 }),
  implementationStatement: text("implementation_statement"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const governanceEvidenceFiles = pgTable("governance_evidence_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceItemId: uuid("evidence_item_id")
    .references(() => governanceEvidenceItems.id, { onDelete: "cascade" })
    .notNull(),
  fileUrl: text("file_url").notNull(),
  storageKey: text("storage_key"),
  sha256Hash: varchar("sha256_hash", { length: 64 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  originalFilename: varchar("original_filename", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const governanceControlLinks = pgTable(
  "governance_control_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    controlRecordId: uuid("control_record_id")
      .references(() => controlRecords.id, { onDelete: "cascade" })
      .notNull(),
    linkType: governanceControlLinkTypeEnum("link_type").notNull(),
    linkId: uuid("link_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

/** Evidence Engine: control responsibility (CUI Vault model) per org and optional boundary. */
export const governanceControlResponsibilities = pgTable(
  "governance_control_responsibilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    boundaryId: text("boundary_id"),
    controlId: text("control_id").notNull(),
    responsibilityModel: text("responsibility_model").notNull(),
    azureInheritedJson: jsonb("azure_inherited_json").$type<string[]>(),
    mactechProvidedJson: jsonb("mactech_provided_json").$type<string[]>(),
    customerRequiredJson: jsonb("customer_required_json").$type<string[]>(),
    notesJson: jsonb("notes_json").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("governance_control_responsibilities_org_id_idx").on(t.orgId),
    index("governance_control_responsibilities_boundary_id_idx").on(t.boundaryId),
    index("governance_control_responsibilities_control_id_idx").on(t.controlId),
  ]
);

// ============== Governance Manifest Ingest ==============

/** Tracks each governance bundle manifest ingest run per org. */
export const governanceManifestRuns = pgTable(
  "governance_manifest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    runId: text("run_id").notNull(),
    schemaVersion: integer("schema_version").notNull().default(3),
    bundleSource: text("bundle_source"),
    ingestedBy: uuid("ingested_by").references(() => users.id),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    docCount: integer("doc_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("gmr_org_run_idx").on(t.organizationId, t.runId),
    index("gmr_org_idx").on(t.organizationId),
  ]
);

/** Maps individual governance document codes to NIST controls they satisfy, per ingest run. */
export const governanceDocumentControlLinks = pgTable(
  "governance_document_control_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    manifestRunId: uuid("manifest_run_id")
      .references(() => governanceManifestRuns.id, { onDelete: "cascade" })
      .notNull(),
    docCode: text("doc_code").notNull(),
    controlId: text("control_id").notNull(),
    satisfactionType: text("satisfaction_type").notNull().default("primary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("gdcl_org_control_idx").on(t.organizationId, t.controlId),
  ]
);

// ============== Relations ==============
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  accountBoundary: one(accountBoundary),
  boundaryProfile: one(boundaryProfiles),
  users: many(users),
  userInvitations: many(userInvitations),
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
  projects: many(projects),
  governanceDocuments: many(governanceDocuments),
  governanceRegisters: many(governanceRegisters),
  governanceEvidenceItems: many(governanceEvidenceItems),
  governanceControlResponsibilities: many(governanceControlResponsibilities),
  boundaries: many(boundaries),
  osAssets: many(osAssets),
}));

export const boundaryProfilesRelations = relations(boundaryProfiles, ({ one }) => ({
  organization: one(organizations),
}));

export const accountBoundaryRelations = relations(accountBoundary, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [accountBoundary.accountId],
    references: [organizations.id],
  }),
  snapshots: many(boundarySnapshots),
}));

export const boundarySnapshotsRelations = relations(boundarySnapshots, ({ one }) => ({
  accountBoundary: one(accountBoundary, {
    fields: [boundarySnapshots.accountId],
    references: [accountBoundary.accountId],
  }),
}));

export const boundariesRelations = relations(boundaries, ({ one, many }) => ({
  organization: one(organizations),
  osAssets: many(osAssets),
  boundaryComponents: many(boundaryComponents),
}));

export const boundaryComponentsRelations = relations(boundaryComponents, ({ one }) => ({
  boundary: one(boundaries),
}));

export const osBaselineProfilesRelations = relations(osBaselineProfiles, ({ many }) => ({
  baselineControls: many(baselineControls),
  baselineChecks: many(baselineChecks),
  osAssets: many(osAssets),
}));

export const baselineControlsRelations = relations(baselineControls, ({ one }) => ({
  baselineProfile: one(osBaselineProfiles),
}));

export const baselineChecksRelations = relations(baselineChecks, ({ one }) => ({
  baselineProfile: one(osBaselineProfiles),
}));

export const osAssetsRelations = relations(osAssets, ({ one }) => ({
  organization: one(organizations),
  boundary: one(boundaries),
  baselineProfile: one(osBaselineProfiles),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations),
  invitationsSent: many(userInvitations),
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

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  organization: one(organizations),
  invitedBy: one(users),
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
  governanceArtifactCompletions: many(governanceArtifactCompletions),
  technicalEvidence: many(technicalEvidence),
  poamEntries: many(poamEntries),
  history: many(controlRecordHistory),
  governanceControlLinks: many(governanceControlLinks),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations),
  governanceDocuments: many(governanceDocuments),
  governanceRegisters: many(governanceRegisters),
  governanceEvidenceItems: many(governanceEvidenceItems),
}));

export const governanceControlMetadataRelations = relations(governanceControlMetadata, () => ({}));

export const governanceDocumentsRelations = relations(governanceDocuments, ({ one, many }) => ({
  organization: one(organizations),
  project: one(projects),
  owner: one(users, { fields: [governanceDocuments.ownerId], references: [users.id] }),
  approver: one(users, { fields: [governanceDocuments.approverId], references: [users.id] }),
  versions: many(governanceDocumentVersions),
}));

export const governanceDocumentVersionsRelations = relations(governanceDocumentVersions, ({ one }) => ({
  document: one(governanceDocuments),
  createdBy: one(users),
}));

export const governanceRegistersRelations = relations(governanceRegisters, ({ one, many }) => ({
  organization: one(organizations),
  project: one(projects),
  entries: many(governanceRegisterEntries),
}));

export const governanceRegisterEntriesRelations = relations(governanceRegisterEntries, ({ one, many }) => ({
  register: one(governanceRegisters),
  createdBy: one(users, { fields: [governanceRegisterEntries.createdById], references: [users.id] }),
  approvedBy: one(users, { fields: [governanceRegisterEntries.approvedById], references: [users.id] }),
  lockedBy: one(users, { fields: [governanceRegisterEntries.lockedById], references: [users.id] }),
  voidedBy: one(users, { fields: [governanceRegisterEntries.voidedById], references: [users.id] }),
  files: many(governanceRegisterEntryFiles),
  events: many(governanceEntryEvents),
}));

export const governanceEntryEventsRelations = relations(governanceEntryEvents, ({ one }) => ({
  organization: one(organizations, { fields: [governanceEntryEvents.orgId], references: [organizations.id] }),
  entry: one(governanceRegisterEntries, { fields: [governanceEntryEvents.entryId], references: [governanceRegisterEntries.id] }),
  actor: one(users, { fields: [governanceEntryEvents.actorUserId], references: [users.id] }),
}));

export const governanceRegisterEntryFilesRelations = relations(governanceRegisterEntryFiles, ({ one }) => ({
  registerEntry: one(governanceRegisterEntries),
}));

export const governanceEvidenceItemsRelations = relations(governanceEvidenceItems, ({ one, many }) => ({
  organization: one(organizations),
  project: one(projects),
  collectedBy: one(users),
  files: many(governanceEvidenceFiles),
}));

export const governanceEvidenceFilesRelations = relations(governanceEvidenceFiles, ({ one }) => ({
  evidenceItem: one(governanceEvidenceItems),
}));

export const governanceControlLinksRelations = relations(governanceControlLinks, ({ one }) => ({
  controlRecord: one(controlRecords),
}));

export const governanceControlResponsibilitiesRelations = relations(governanceControlResponsibilities, ({ one }) => ({
  organization: one(organizations, { fields: [governanceControlResponsibilities.orgId], references: [organizations.id] }),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  organization: one(organizations),
  controlRecord: one(controlRecords),
  uploadedByUser: one(users),
}));

export const governanceArtifactCompletionsRelations = relations(governanceArtifactCompletions, ({ one }) => ({
  organization: one(organizations),
  controlRecord: one(controlRecords),
  attestedByUser: one(users, { fields: [governanceArtifactCompletions.attestedBy], references: [users.id] }),
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

// ============== Training Records (CMMC 3.2.x) ==============
export const trainingRecords = pgTable(
  "training_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    personnelName: varchar("personnel_name", { length: 255 }).notNull(),
    personnelEmail: varchar("personnel_email", { length: 255 }),
    /** security_awareness | role_based | insider_threat | other */
    trainingType: varchar("training_type", { length: 80 }).notNull(),
    courseTitle: varchar("course_title", { length: 255 }).notNull(),
    /** online | classroom | cbt | self_study */
    deliveryMethod: varchar("delivery_method", { length: 80 }),
    completedAt: date("completed_at").notNull(),
    expiresAt: date("expires_at"),
    /** Audience the training applies to: "All Users" | "Privileged User" | etc. */
    userRole: varchar("user_role", { length: 80 }),
    /** Link to completion certificate or screenshot */
    evidenceUrl: text("evidence_url"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("training_records_org_idx").on(t.organizationId),
    index("training_records_email_idx").on(t.organizationId, t.personnelEmail),
  ]
);

// ============== Trust Codex Onboarding Wizard (v2) ==============

/**
 * Legal gate record — one row per org per Trust Codex version accepted.
 * Immutable once created; forms the legal record of acceptance.
 */
export const trustCodexAcceptances = pgTable("trust_codex_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedByUserId: uuid("accepted_by_user_id").notNull(),
  signatoryName: varchar("signatory_name", { length: 255 }).notNull(),
  signatoryTitle: varchar("signatory_title", { length: 255 }).notNull(),
  cageCode: varchar("cage_code", { length: 10 }),
  primeContractNumber: varchar("prime_contract_number", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  /** SHA-256 hash of the user agent string */
  userAgentHash: varchar("user_agent_hash", { length: 64 }),
});

/**
 * Resumable wizard state — one row per org, upserted at each phase.
 */
export const onboardingWizardState = pgTable("onboarding_wizard_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id),
  currentPhase: integer("current_phase").notNull().default(0),
  completedPhases: jsonb("completed_phases").$type<number[]>().default([]),
  phaseData: jsonb("phase_data").$type<Record<string, unknown>>().default({}),
  sprsScoreSnapshot: integer("sprs_score_snapshot"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-control adjudication record — the legal record of each control outcome.
 * One row per org × controlId; upserted as the wizard advances.
 * attestedByUserId + attestedAt are mandatory for status = "implemented".
 */
export const controlAdjudications = pgTable(
  "control_adjudications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    controlId: varchar("control_id", { length: 20 }).notNull(),
    tier: varchar("tier", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    narrative: text("narrative"),
    attestedByUserId: uuid("attested_by_user_id"),
    attestedAt: timestamp("attested_at", { withTimezone: true }),
    evidenceBlobKeys: jsonb("evidence_blob_keys").$type<string[]>().default([]),
    /** Map of blobKey → SHA-256 hash. Immutable once set. */
    evidenceBlobHashes: jsonb("evidence_blob_hashes")
      .$type<Record<string, string>>()
      .default({}),
    poamTargetDate: date("poam_target_date"),
    poamNotes: text("poam_notes"),
    needsReview: boolean("needs_review").notNull().default(false),
    needsReviewReason: text("needs_review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("org_control_unique").on(table.organizationId, table.controlId),
  ]
);

// ============== Evidence runs (metadata-only) ==============
export {
  evidenceRuns,
  evidenceFiles,
  evidenceControlTechnicalStatus,
  evidenceFindings,
} from "../../drizzle/schema.evidence";

// ============== ISSO Export Manifest dedupe / replay-safety ==============
/**
 * Records every signed ISSO export the codex has ingested. Primary key is
 * the manifest_id (sha256 of canonical body computed by EnclaveWatch).
 * Re-ingesting the same manifest_id is a no-op that returns the cached
 * response. See docs/specs/isso-export-manifest-v1.1.md §7.
 */
export const issoExportManifests = pgTable(
  "isso_export_manifests",
  {
    manifestId: text("manifest_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vaultId: text("vault_id"),
    manifestVersion: text("manifest_version").notNull().default("1.1"),
    reviewPeriodStart: timestamp("review_period_start", { withTimezone: true }),
    reviewPeriodEnd: timestamp("review_period_end", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    responsePayload: jsonb("response_payload"),
    controlsTouched: jsonb("controls_touched"),
    sectionsProcessed: jsonb("sections_processed"),
  },
);

// ============== QMS Governance Manifests (Phase 13 — manifest ingest) ==============
/**
 * Signed CMMC governance manifest received from the QMS document-control
 * service. Mirrors the ISSO weekly-export ingest pattern: QMS produces a
 * snapshot, signs it with HMAC-SHA-256, POSTs to
 * /api/integrations/qms-manifest/ingest. Codex verifies signature +
 * recomputes content_hash + persists immutably.
 *
 * Schema is `mactech-governance-manifest.v1.1` (additive bump over Brian's
 * v1, adds controls_touched aggregation + signing envelope). Each row is
 * append-only — re-POSTing the same run_id is a no-op (idempotent).
 *
 * Drives:
 *   - chain-of-custody for governance docs (CMMC 3.3.1/3.3.2/3.4.1/3.4.2)
 *   - freshness scoring on control_observed_implementations via
 *     mostRecentEvidenceAt refresh after ingest
 *   - OIS narrative regeneration for controls_touched ∩ governance-18
 */
export const qmsGovernanceManifests = pgTable(
  "qms_governance_manifests",
  {
    runId: text("run_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    generatedBy: text("generated_by"),
    toolVersion: text("tool_version"),
    source: text("source").notNull(),
    reviewPeriodStart: timestamp("review_period_start", { withTimezone: true }),
    reviewPeriodEnd: timestamp("review_period_end", { withTimezone: true }),
    issuerService: text("issuer_service"),
    issuerUrl: text("issuer_url"),
    issuerClientId: text("issuer_client_id"),
    issuerGitSha: text("issuer_git_sha"),
    docCount: integer("doc_count").notNull(),
    controlsTouched: jsonb("controls_touched").notNull(),
    contentHash: text("content_hash").notNull(),
    signingHash: text("signing_hash").notNull(),
    signatureAlg: text("signature_alg").notNull(),
    signatureKid: text("signature_kid").notNull(),
    signatureValue: text("signature_value").notNull(),
    rawEnvelope: jsonb("raw_envelope").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("qms_governance_manifests_org_idx").on(t.organizationId),
    receivedIdx: index("qms_governance_manifests_received_idx").on(t.receivedAt),
  }),
);

/**
 * Per-document rows from a manifest. Child of qmsGovernanceManifests on
 * runId. Stored as denormalized JSON column projection so per-control
 * queries can pivot on controls_mapped without parsing the raw envelope.
 *
 * One row per document_number per manifest. Cardinality is bounded by
 * QMS doc count (≤200 in practice) × manifest cadence (weekly).
 */
export const qmsGovernanceManifestDocuments = pgTable(
  "qms_governance_manifest_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: text("run_id")
      .notNull()
      .references(() => qmsGovernanceManifests.runId, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentNumber: text("document_number").notNull(),
    documentName: text("document_name").notNull(),
    documentType: text("document_type"),
    filePath: text("file_path"),
    version: text("version"),
    status: text("status"),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    nextReviewDate: timestamp("next_review_date", { withTimezone: true }),
    sha256: text("sha256").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    controlsMapped: jsonb("controls_mapped").notNull(),
    // v1.2 — release lifecycle fields.
    released: boolean("released").notNull().default(false),
    releasedAt: text("released_at"),
    // QMS DocumentSignature chain ordered by signed_at desc. Schema mirrors
    // qms-manifest-schema.ts manifestSignatureSchema_perDoc.
    signatures: jsonb("signatures").notNull().default([]),
    /**
     * Retire-on-absence stamp. The QMS-manifest-ingest dispatcher sets
     * this on the most-recent row of any (org, document_number) whose
     * document_number disappears from a new manifest — i.e. the doc was
     * deleted/retired on the QMS side. The library view at
     * /dashboard/documents filters retired_at IS NULL by default so
     * orphaned-from-QMS rows stop polluting the auditor's surface.
     *
     * If the doc later reappears in a new manifest, a fresh row is
     * inserted with retired_at = NULL; the old retired row stays
     * untouched as audit history (DISTINCT ON picks the new one).
     */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => ({
    runIdIdx: index("qms_governance_manifest_documents_run_idx").on(t.runId),
    docNumberIdx: index("qms_governance_manifest_documents_doc_idx").on(
      t.documentNumber,
    ),
    orgIdx: index("qms_governance_manifest_documents_org_idx").on(
      t.organizationId,
    ),
  }),
);

// ============== Control Attention Items (Sprint 6.5) ==============
/**
 * Persistent record of every control_freshness.needing_attention[] item the
 * ISSO flags during weekly review. Sprint 3 logged these to /admin/audit-logs
 * only; Sprint 6.5 makes them queryable so the Monitoring tab can surface
 * them as actionable rows that admins can mark resolved.
 *
 * Idempotent on (organization_id, control_id, flagged_by_manifest_id) —
 * re-ingesting the same manifest doesn't duplicate the row. Resolution
 * is admin-driven for now (manual click in Monitoring); future sprint can
 * auto-resolve when ISSO stops flagging the same control on subsequent
 * manifests.
 */
export const controlAttentionItems = pgTable(
  "control_attention_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    controlId: text("control_id").notNull(),
    reason: text("reason").notNull(),
    severity: text("severity").notNull().default("warning"),
    flaggedByManifestId: text("flagged_by_manifest_id"),
    vaultId: text("vault_id"),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolutionNote: text("resolution_note"),
  },
);

// ============== Control Adjudication Ecosystem (Phase 6+) ==============
/**
 * Phase 6 — Observed-Implementation Statements (OIS).
 *
 * Auto-generated per-control SSP narrative derived from observed register
 * entries. Refreshed on every ISSO weekly export ingest so the latest
 * signed manifest's evidence drives the live narrative. Replaces
 * hand-authored implementation statements with a content-hash-traceable
 * derivation.
 *
 * One row per (organization_id, control_id, period_end) — re-running
 * generation for the same period replaces the row.
 *
 * The narrative_lock fields freeze the row during an open Phase 10
 * assessment so a C3PAO sees a stable narrative to adjudicate against.
 */
export const controlObservedImplementations = pgTable(
  "control_observed_implementations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    controlId: varchar("control_id", { length: 20 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    narrative: text("narrative").notNull(),
    /**
     * Per-(register_key, entry_type, lifecycle_state) counts that drove
     * the narrative. Lets the UI show a numerical breakdown next to the
     * prose without re-querying.
     */
    evidenceSummary: jsonb("evidence_summary").notNull().default({}),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    generatedFromManifestId: text("generated_from_manifest_id"),
    /**
     * Most recent admin_signed-or-isso_verified entry across the control's
     * register_requirements. Drives at-risk detection in Phase 8.
     */
    mostRecentEvidenceAt: timestamp("most_recent_evidence_at", {
      withTimezone: true,
    }),
    narrativeLockStartedAt: timestamp("narrative_lock_started_at", {
      withTimezone: true,
    }),
    narrativeLockAssessmentId: uuid("narrative_lock_assessment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

/**
 * Phase 7 — Control Adjudication Engine (CAE) snapshots.
 *
 * For every control × every ISSO weekly export, score the requirements
 * and emit a snapshot. status ∈ {satisfies, partial, gap, at_risk};
 * confidence ∈ [0,1]; requirements_json carries the per-requirement
 * breakdown with click-through evidence_entry_ids.
 *
 * One row per (org, control, manifest). Re-scoring the same manifest is
 * a no-op replace.
 */
export const controlAdjudicationSnapshots = pgTable(
  "control_adjudication_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    controlId: varchar("control_id", { length: 20 }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Internal CAE rollup for sorting/colors:
     *   `satisfies` / `partial` / `gap` / `at_risk`.
     * Derived from objectiveVerdicts. C3PAO-facing surfaces should
     * read aggregateFinding (MET / NOT MET / NA) instead — this
     * column stays for back-compat and the CAE dashboard.
     */
    status: varchar("status", { length: 16 }).notNull(),
    confidence: real("confidence").notNull(),
    requirementsJson: jsonb("requirements_json").notNull().default([]),
    /**
     * Per-objective MET/NOT MET/N/A verdicts — the C3PAO-facing
     * vocabulary mandated by 32 CFR § 170.24 [AG p.10].
     *
     * Shape:
     *   [{ objective: "a",
     *      verdict: "MET" | "NOT_MET" | "NA",
     *      evidence_ids: string[],
     *      rationale: string | null
     *   }, ...]
     *
     * One NOT_MET objective fails the entire requirement.
     */
    objectiveVerdicts: jsonb("objective_verdicts").notNull().default([]),
    /**
     * Computed: MET / NOT_MET / NA. The headline finding the SCTM and
     * SSP show. NA only when an operator declares the entire
     * requirement N/A via control_status_overrides with rationale.
     */
    aggregateFinding: varchar("aggregate_finding", { length: 16 }),
    /**
     * How the requirement reaches MET (or doesn't):
     *   - evidence: native MET via cited evidence rows
     *   - enduring_exception: AG p.10 elevator (with mitigations in SSP)
     *   - operational_plan_of_action: AG p.10 elevator (POA&M; only
     *     active and non-chronic-slipped)
     *   - dod_cio_adjudication: AG p.10 elevator (equally-effective
     *     measure adjudicated by DoD CIO, included in SSP)
     *   - esp_inheritance: AG p.11 elevator (External Service
     *     Provider implements the requirement; evidence supplied)
     *   - not_met: no elevator active
     *   - not_applicable: operator-declared N/A with rationale
     */
    metVia: varchar("met_via", { length: 40 }).notNull().default("evidence"),
    /** Pointer to active enduring_exceptions row, if elevator invoked. */
    enduringExceptionId: uuid("enduring_exception_id"),
    /** Pointer to active poam_entries row, if elevator invoked. */
    operationalPlanPoamId: uuid("operational_plan_poam_id").references(
      () => poamEntries.id,
      { onDelete: "set null" },
    ),
    /** Pointer to active dod_cio_adjudications row. */
    dodCioAdjudicationId: uuid("dod_cio_adjudication_id"),
    /**
     * ESP inheritance is a JSONB pointer set rather than a new table —
     * orgs already carry ESP catalog metadata. Shape:
     *   { provider_name: "...",
     *     kind: "csp" | "msp" | "mssp" | "caas",
     *     objectives: ["a","b"],
     *     evidence_ref: "..." }
     */
    espInheritance: jsonb("esp_inheritance"),
    periodBasisManifestId: text("period_basis_manifest_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

/**
 * Operator-driven status override on a control's bin-1-5 status.
 * Default behaviour (no override) is to derive from
 * controlAdjudicationSnapshots.aggregateFinding. Overrides are visibly
 * distinct in the UI so a C3PAO never mistakes one for a derived
 * verdict. One active override per (org, control); revoking re-opens
 * the slot.
 */
export const controlStatusOverrides = pgTable("control_status_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  controlId: varchar("control_id", { length: 20 }).notNull(),
  /** implemented | inherited | not_applicable | outstanding */
  overrideStatus: varchar("override_status", { length: 24 }).notNull(),
  reason: text("reason").notNull(),
  setByUserId: uuid("set_by_user_id")
    .notNull()
    .references(() => users.id),
  setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
  revokedReason: text("revoked_reason"),
});

/**
 * AG p.10 MET-elevator: an enduring exception described in the SSP
 * with mitigations. Counts as MET for the named objectives.
 */
export const enduringExceptions = pgTable("enduring_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  controlId: varchar("control_id", { length: 20 }).notNull(),
  /** Letter list of objectives this elevator covers. Empty = whole control. */
  appliesToObjectives: jsonb("applies_to_objectives").notNull().default([]),
  description: text("description").notNull(),
  mitigations: text("mitigations").notNull(),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  supersededById: uuid("superseded_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * AG p.10 MET-elevator: DoD CIO adjudication that an alternative
 * security measure is equally effective. Required to be referenced in
 * the SSP for continued MET status; environment-unchanged attestation
 * required to maintain the finding.
 */
export const dodCioAdjudications = pgTable("dod_cio_adjudications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  controlId: varchar("control_id", { length: 20 }).notNull(),
  appliesToObjectives: jsonb("applies_to_objectives").notNull().default([]),
  /** DoD CIO letter / case # / URL. */
  reference: text("reference").notNull(),
  /** What alternative measure was adjudicated equally effective. */
  summary: text("summary").notNull(),
  issuedAt: date("issued_at").notNull(),
  /**
   * FK to ssp_signoffs; the AO attests "no environmental changes since
   * adjudication" — required by AG p.10 for continued MET status.
   */
  environmentUnchangedAttestationId: uuid(
    "environment_unchanged_attestation_id",
  ),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Authorizing Official + system-owner + ISSO sign-offs on a generated
 * SSP version. Posture A+: Codex signs the SSP content with its key
 * (binding evidence to document version); the AO sign-off here carries
 * name + title + the same data_hash Codex signed, naming the human
 * accountable for the document being filed. Customer-key uploads
 * (real Posture C) populate signatureAlg/signatureValue; until then,
 * signatureAlg = 'attestation_only' and the row is the human record.
 */
export const sspSignoffs = pgTable("ssp_signoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Back-filled in Phase C when ssp_documents lands. */
  sspDocumentId: uuid("ssp_document_id"),
  /**
   * authorizing_official | system_owner | isso | environment_unchanged
   *   (last variant is for DoD CIO adjudication continuity)
   */
  signoffKind: varchar("signoff_kind", { length: 32 }).notNull(),
  signerUserId: uuid("signer_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  signerDisplayName: text("signer_display_name").notNull(),
  signerTitle: text("signer_title").notNull(),
  /** SHA-256 the signer is bound to; equals ssp_documents.payload_sha256. */
  dataHash: varchar("data_hash", { length: 64 }).notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** 'attestation_only' (Posture A+) | 'ed25519' / 'rs256' (Posture C). */
  signatureAlg: varchar("signature_alg", { length: 32 }),
  signatureValue: text("signature_value"),
  comment: text("comment"),
});

/**
 * Audit trail for every adjudication transition. Written by the
 * rescore trigger on every state change so the SSP's per-control
 * audit history is reconstructable deterministically.
 */
export const controlAdjudicationHistory = pgTable(
  "control_adjudication_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    controlId: varchar("control_id", { length: 20 }).notNull(),
    snapshotId: uuid("snapshot_id").references(
      () => controlAdjudicationSnapshots.id,
      { onDelete: "set null" },
    ),
    priorAggregateFinding: varchar("prior_aggregate_finding", { length: 16 }),
    newAggregateFinding: varchar("new_aggregate_finding", { length: 16 }),
    priorMetVia: varchar("prior_met_via", { length: 40 }),
    newMetVia: varchar("new_met_via", { length: 40 }),
    priorObjectiveVerdicts: jsonb("prior_objective_verdicts"),
    newObjectiveVerdicts: jsonb("new_objective_verdicts"),
    /**
     * What triggered the rescore — for the SSP audit trail. Examples:
     * attestation_signed, register_entry_finalized, ra_finalized,
     * poam_finalized, manual_override, ir_bundle_archived,
     * qms_manifest_ingested, isso_export_ingested,
     * validator_run_persisted, on_read_stale_recompute.
     */
    triggerSource: varchar("trigger_source", { length: 64 }).notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

/**
 * Phase 9 — Cross-evidence threat narratives.
 *
 * Joins multiple register entries that tell a single threat story (e.g.,
 * break-glass sign-in + privileged grant + Defender alert in the same
 * hour from the same actor). Each narrative is a Pattern A loop in
 * itself: detected by the correlation engine, admin signs investigation
 * outcome, ISSO verifies on weekly review.
 */
export const threatNarratives = pgTable("threat_narratives", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  narrativeType: varchar("narrative_type", { length: 80 }).notNull(),
  summary: text("summary").notNull(),
  confidence: real("confidence").notNull(),
  relatedEntryIds: jsonb("related_entry_ids").notNull().default([]),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  adminAcknowledgedAt: timestamp("admin_acknowledged_at", { withTimezone: true }),
  adminAcknowledgedBy: uuid("admin_acknowledged_by"),
  adminOutcome: text("admin_outcome"),
  adminNotes: text("admin_notes"),
  issoVerifiedAt: timestamp("isso_verified_at", { withTimezone: true }),
  issoVerifiedByName: text("isso_verified_by_name"),
  issoNote: text("isso_note"),
  mergedIntoId: uuid("merged_into_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Phase 10 — C3PAO assessment session lifecycle.
 *
 * Opening an assessment freezes every controlObservedImplementations row
 * for the duration so the auditor sees a stable evidence picture.
 * Closing creates a tamper-evident receipt with assessor sign-off.
 */
export const assessments = pgTable("assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  openedByUserId: uuid("opened_by_user_id"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedByUserId: uuid("closed_by_user_id"),
  assessorName: text("assessor_name"),
  assessorOrg: text("assessor_org"),
  assessorEmail: text("assessor_email"),
  closeoutSummary: text("closeout_summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-(assessment, control) assessor notes + recommended verdict.
 * Autosaves from the /auditor/[controlId] page. The auditor's verdict is
 * INDEPENDENT of the CAE engine's verdict — this captures professional
 * opinion after walking the evidence.
 */
export const assessorScratchpads = pgTable("assessor_scratchpads", {
  id: uuid("id").primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  controlId: varchar("control_id", { length: 20 }).notNull(),
  notes: text("notes").notNull().default(""),
  assessorVerdict: varchar("assessor_verdict", { length: 24 }),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastEditedByUserId: uuid("last_edited_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============== RA.L2-3.11.1 — Risk Assessment lifecycle envelope ==============
//
// One row per annual cycle. Risks themselves continue to live in
// governance_register_entries with registerKey='risk_register'. This
// table is the lifecycle/sign-off/finalization envelope, plus the home
// for the C3PAO objective-level statuses ([a] frequency defined,
// [b] assessment performed). See drizzle/0066_risk_assessment_lifecycle.sql
// for the full DDL + check constraints (finalize-completeness, status
// enum, frequency-must-be-<=-365-days).
export const riskAssessments = pgTable("risk_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  boundaryId: uuid("boundary_id")
    .notNull()
    .references(() => boundaries.id, { onDelete: "restrict" }),
  /**
   * Pivot key shared with governance_register_entries.entryData.assessment_id.
   * Lets the bundle endpoint and the risk register find each other without
   * a hard FK across schema boundaries.
   */
  assessmentPivotId: uuid("assessment_pivot_id").notNull().unique(),
  controlId: varchar("control_id", { length: 20 }).notNull().default("3.11.1"),
  sourceApp: varchar("source_app", { length: 32 }).notNull().default("training_readiness"),
  assessmentName: text("assessment_name"),
  organizationName: text("organization_name"),
  systemName: text("system_name"),
  /** Human-readable boundary label (distinct from system_name). */
  systemBoundaryName: text("system_boundary_name"),
  /** SSP section/version that anchors this assessment. */
  sspReference: text("ssp_reference"),
  scopeType: varchar("scope_type", { length: 16 }).notNull().default("enclave"),
  methodology: text("methodology")
    .notNull()
    .default("NIST SP 800-30 Rev. 1 / CMMC Level 2"),
  definedFrequencyDays: integer("defined_frequency_days"),
  /** WHY this cadence was chosen — defensibility narrative for objective [a]. */
  frequencyRationale: text("frequency_rationale"),
  reviewPeriodStart: date("review_period_start"),
  reviewPeriodEnd: date("review_period_end"),
  nextDueDate: date("next_due_date"),
  /**
   * Lifecycle status. Enum-by-CHECK rather than pg ENUM so future states
   * can be added without a costly type alter. Allowed values pinned by
   * a CHECK constraint in the migration.
   */
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  objectiveAStatus: varchar("objective_a_status", { length: 16 })
    .notNull()
    .default("unknown"),
  objectiveARationale: text("objective_a_rationale"),
  objectiveBStatus: varchar("objective_b_status", { length: 16 })
    .notNull()
    .default("unknown"),
  objectiveBRationale: text("objective_b_rationale"),
  assessorDisplayName: text("assessor_display_name"),
  reviewerDisplayName: text("reviewer_display_name"),
  approverDisplayName: text("approver_display_name"),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  /**
   * Self-FK — a finalized assessment can be marked superseded when a
   * fresh annual cycle is finalized. We carry the pointer rather than
   * deleting because the C3PAO walkthrough wants the trail.
   */
  supersededByAssessmentId: uuid("superseded_by_assessment_id"),
  finalReportSha256: varchar("final_report_sha256", { length: 64 }),
  packageSha256: varchar("package_sha256", { length: 64 }),
  evidenceManifestSha256: varchar("evidence_manifest_sha256", { length: 64 }),
  vaultArtifactPointer: text("vault_artifact_pointer"),
  immutableManifestPointer: text("immutable_manifest_pointer"),
  metadataVersion: integer("metadata_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Executive risk acceptance record. The "skip POA&M" path under CMMC —
 * if the customer chooses to *accept* a risk rather than mitigate /
 * transfer / avoid, an executive must sign off and a re-review date
 * must be set. High/critical acceptance is enforced at the API layer
 * (executive role required) — this table just persists the result.
 */
export const riskAcceptances = pgTable("risk_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  riskAssessmentId: uuid("risk_assessment_id")
    .notNull()
    .references(() => riskAssessments.id, { onDelete: "cascade" }),
  riskExternalId: varchar("risk_external_id", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(),
  residualRisk: varchar("residual_risk", { length: 16 }).notNull(),
  acceptanceRationaleSummary: text("acceptance_rationale_summary").notNull(),
  approverUserId: uuid("approver_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approverDisplayName: text("approver_display_name").notNull(),
  approverRole: varchar("approver_role", { length: 64 }),
  approvedAt: timestamp("approved_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  nextReviewDate: date("next_review_date").notNull(),
  vaultPointer: text("vault_pointer"),
  acceptanceRecordHash: varchar("acceptance_record_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Edge between a specific risk's external id (from the wizard's
 * risks.json output) and a POA&M entry. One link per (risk, assessment).
 * Either poam_entry_id (canonical, FK into poam_entries) or
 * poam_external_ref (when the POA&M lives in an external GRC tool) is
 * populated — never both. Enforced by a CHECK constraint in the
 * migration.
 */
export const riskPoamLinks = pgTable("risk_poam_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  riskAssessmentId: uuid("risk_assessment_id")
    .notNull()
    .references(() => riskAssessments.id, { onDelete: "cascade" }),
  riskExternalId: varchar("risk_external_id", { length: 64 }).notNull(),
  poamEntryId: uuid("poam_entry_id").references(() => poamEntries.id, {
    onDelete: "set null",
  }),
  poamExternalRef: text("poam_external_ref"),
  poamSource: varchar("poam_source", { length: 16 }).notNull().default("control_plane"),
  sanitizedTitle: text("sanitized_title"),
  severity: varchar("severity", { length: 16 }),
  ownerRole: varchar("owner_role", { length: 64 }),
  dueDate: date("due_date"),
  vaultPointer: text("vault_pointer"),
  linkHash: varchar("link_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============== IR Tabletop & AAR Evidence Kit ==============
export {
  irExerciseStatusEnum,
  irExerciseMethodologyEnum,
  irParticipantRoleEnum,
  irInjectResponseStatusEnum,
  irAarFinalResultEnum,
  irFindingSeverityEnum,
  irCorrectiveActionStatusEnum,
  irScenarios,
  irExercises,
  irExerciseControls,
  irExerciseParticipants,
  irInjectResponses,
  irAars,
  irFindings,
  irCorrectiveActions,
  irExerciseBundles,
  irParticipantDisputes,
} from "./schema.ir-tabletop";
export type { IrScenarioInject } from "./schema.ir-tabletop";

/**
 * CA-001 assessment cycle bundles — Codex-side mirror of the vault's
 * CaAssessmentBundle. Populated by /api/ca-assessments/bundles
 * (TrainOS bridge endpoint). The SSP generator cites these for
 * 3.12.x family controls; drift-detect verifies the package_sha256
 * pinned at SSP-generation time still matches the latest cycle.
 *
 * Schema mirrors the vault entity 1:1 to keep bridge serialization
 * trivial. Per PRODUCT.md boundary discipline: metadata only — no
 * AAR text, no CUI, no per-objective adjudication narrative.
 */
export const caAssessmentBundles = pgTable("ca_assessment_bundles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  cycleId: text("cycle_id").notNull(),
  cycleTitle: text("cycle_title").notNull(),
  cycleType: text("cycle_type"),
  contentHash: varchar("content_hash", { length: 64 }),
  packageSha256: varchar("package_sha256", { length: 64 }),
  manifestSha256: varchar("manifest_sha256", { length: 64 }),
  packageVersion: integer("package_version").notNull().default(1),
  finalizedAtUtc: timestamp("finalized_at_utc", { withTimezone: true }),
  retentionUntilUtc: timestamp("retention_until_utc", { withTimezone: true }),
  controlIds: text("control_ids"),
  controlVerdicts: text("control_verdicts"),
  sspVersion: text("ssp_version"),
  boundaryVersion: text("boundary_version"),
  leadAssessor: text("lead_assessor"),
  reviewer: text("reviewer"),
  approver: text("approver"),
  sctmStatus: text("sctm_status"),
  controlFamily: text("control_family").default("CA.L2"),
  cui: boolean("cui").notNull().default(false),
  vaultStorageUri: text("vault_storage_uri"),
  vaultStorageRegion: text("vault_storage_region"),
  sourceApp: varchar("source_app", { length: 40 }).notNull().default("mactech-training"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
