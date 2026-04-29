/**
 * IR Tabletop & AAR Evidence Kit — schema.
 *
 * Owns all state for the customer-facing CMMC IR Tabletop product.
 * Generation/UI lives in MacTech_Training; this control-plane app owns the data.
 * See docs/ir-tabletop/README.md (Phase 1b deliverable) for the integration contract.
 *
 * Defensibility anchors:
 *  - C3PAO assessor evidence chain: per-row created_by / drafted_by / approved_by users
 *  - Executor != approver: CHECK constraint on ir_aars (added in migration)
 *  - Records retention: ir_exercises.retention_until + legal_hold_*; defaults to
 *    organizations.default_ir_retention_years (= 6) anchored to two CMMC L2
 *    assessment cycles + FAR 4.703 norms. Policy version: mactech-ir-retention.v1
 *  - Reproducibility: ir_scenarios versioned by (code, version) +
 *    ir_exercises.scenario_snapshot_json immutable once status > draft
 *  - Tamper-evident bundles: ir_exercise_bundles.manifest_sha256 + timestamp_token
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  jsonb,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizations, users, controlAdjudications } from "./schema";
import { evidenceRuns } from "../../drizzle/schema.evidence";

// ============== Enums ==============
export const irExerciseStatusEnum = pgEnum("ir_exercise_status", [
  "draft",
  "scheduled",
  "in_progress",
  "executed",
  "aar_drafted",
  "approved",
  "archived",
]);

export const irExerciseMethodologyEnum = pgEnum("ir_exercise_methodology", [
  "tabletop",
  "walkthrough",
  "functional",
]);

export const irParticipantRoleEnum = pgEnum("ir_participant_role", [
  "facilitator",
  "approver",
  "executive",
  "it_admin",
  "program_manager",
  "security_lead",
  "mactech_support",
  "observer",
  "other",
]);

export const irInjectResponseStatusEnum = pgEnum("ir_inject_response_status", [
  "pass",
  "partial",
  "fail",
  "not_reached",
]);

export const irAarFinalResultEnum = pgEnum("ir_aar_final_result", [
  "pass",
  "partial",
  "needs_remediation",
]);

export const irFindingSeverityEnum = pgEnum("ir_finding_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const irCorrectiveActionStatusEnum = pgEnum("ir_corrective_action_status", [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "deferred",
]);

/**
 * Phase 11: difficulty levels for IR exercises.
 * - management: high-level decisions, business-impact framing, no technical detail
 * - mixed (default): full inject prompts as written
 * - technical: deep system-level detail, log lookups, sample queries
 *
 * Lets a customer rotate audiences year-over-year (CEO/CIO → IT staff →
 * tabletop facilitators) and treat each as a separate IR.L2-3.6.3 test event.
 */
export const irExerciseDifficultyEnum = pgEnum("ir_exercise_difficulty", [
  "management",
  "mixed",
  "technical",
]);

// ============== Inject blueprint shape (in scenarios) ==============
export type IrScenarioInject = {
  /** Stable identifier within scenario (e.g. "T+30-failed-admin-login"). */
  key: string;
  offsetMinutes: number;
  prompt: string;
  expectedAction: string;
  /** Which CMMC controls this inject exercises (textual control_id list). */
  controlIds: string[];
  /** Objective pass criterion, e.g. "decision recorded within 15 min of inject delivery". */
  passCriteria: string;
  /**
   * Phase 11: MITRE ATT&CK technique IDs this inject exercises (optional).
   * Examples: ["T1078.003", "T1110.001"]. Surface in the runtime console,
   * Facilitator Guide, and Control Mapping Matrix so reports speak the same
   * vocabulary the customer's SOC already uses.
   */
  mitreTtps?: string[];
};

// ============== 1. Scenario library (catalog, versioned, JSON-seeded) ==============
export const irScenarios = pgTable(
  "ir_scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 32 }).notNull(), // SCEN-A, SCEN-B, ...
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    narrative: text("narrative").notNull(),
    /** Textual control_ids this scenario is designed to test. */
    targetedControlIds: jsonb("targeted_control_ids").$type<string[]>().notNull().default([]),
    defaultRoe: text("default_roe").notNull(),
    /** Inject blueprint — copied to ir_exercises.scenario_snapshot_json at generation time. */
    injectsJson: jsonb("injects_json").$type<IrScenarioInject[]>().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Phase 11: distinguishes the seeded library (false) from customer-authored
     *  scenarios (true, written via the AI-assisted custom scenario generator). */
    isCustom: boolean("is_custom").notNull().default(false),
    /** Phase 11: who authored this scenario (null for seeded library entries). */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Phase 12: per-tenant scope for custom scenarios.
     *   NULL  = global library (the seeded SCEN-A..D rows)
     *   set   = scoped to one organization
     * Listing logic filters: WHERE is_active AND (organization_id IS NULL OR
     * organization_id = caller's org). Seeded rows stay NULL forever.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ir_scenarios_code_version_idx").on(t.code, t.version),
    index("ir_scenarios_is_custom_idx").on(t.isCustom),
    index("ir_scenarios_organization_id_idx").on(t.organizationId),
  ]
);

// ============== 2. Exercise (one per scheduled tabletop, per org) ==============
export const irExercises = pgTable(
  "ir_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    /** Optional binding to existing CUI Vault boundary (text — matches evidence_run pattern). */
    boundaryId: text("boundary_id"),
    scenarioId: uuid("scenario_id").references(() => irScenarios.id).notNull(),
    /** Immutable snapshot of scenario at generation time (audit trail). */
    scenarioSnapshotJson: jsonb("scenario_snapshot_json").$type<Record<string, unknown>>(),
    name: text("name").notNull(),
    methodology: irExerciseMethodologyEnum("methodology").notNull(),
    /** C3PAO-required: justify why tabletop vs walkthrough vs functional was chosen. */
    methodologyJustification: text("methodology_justification").notNull(),
    /** One-paragraph statement that exercise scope = CUI Vault assessment boundary. */
    scopeStatement: text("scope_statement").notNull(),
    /** CUI Registry codes in scope (e.g. ["DEFENSE/CUI//SP-CTI"]). */
    cuiCategories: jsonb("cui_categories").$type<string[]>().notNull().default([]),
    customerName: text("customer_name").notNull(),
    contractProgramName: text("contract_program_name"),
    systemName: text("system_name").notNull(),
    environmentDescription: text("environment_description").notNull(),
    /** External + internal reporting paths captured for this exercise. */
    reportingAuthoritiesJson: jsonb("reporting_authorities_json").$type<{
      dibNetEnabled: boolean;
      contractOfficerName?: string;
      contractOfficerEmail?: string;
      mssp?: { name: string; contact: string };
      otherChannels?: Array<{ name: string; contact: string; purpose: string }>;
    }>().notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    facilitatorUserId: uuid("facilitator_user_id").references(() => users.id),
    approverUserId: uuid("approver_user_id").references(() => users.id),
    status: irExerciseStatusEnum("status").notNull().default("draft"),
    /** Phase 11: per-exercise difficulty. Defaults to 'mixed' (the existing
     *  pre-Phase-11 behavior) so historical exercises continue to render
     *  identically. */
    difficulty: irExerciseDifficultyEnum("difficulty").notNull().default("mixed"),
    /**
     * Records retention floor (date type).
     * Computed at row creation = (executedAt ?? scheduledFor ?? createdAt)
     *                          + organizations.default_ir_retention_years.
     * Recomputed when executedAt is set (unless the floor was explicitly overridden).
     * NEVER auto-deleted; this column is a floor, not a ceiling.
     */
    retentionUntil: date("retention_until"),
    /** Legal hold supersedes retention math entirely; effective floor becomes indefinite. */
    legalHoldActive: boolean("legal_hold_active").notNull().default(false),
    legalHoldReason: text("legal_hold_reason"),
    legalHoldSetByUserId: uuid("legal_hold_set_by_user_id").references(() => users.id),
    legalHoldSetAt: timestamp("legal_hold_set_at", { withTimezone: true }),
    plannerNotes: text("planner_notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ir_exercises_org_idx").on(t.organizationId),
    index("ir_exercises_status_idx").on(t.status),
    index("ir_exercises_boundary_idx").on(t.boundaryId),
    index("ir_exercises_scheduled_idx").on(t.scheduledFor),
  ]
);

// ============== 3. Exercise <-> Control link (snapshot of tested controls) ==============
export const irExerciseControls = pgTable(
  "ir_exercise_controls",
  {
    exerciseId: uuid("exercise_id")
      .references(() => irExercises.id, { onDelete: "cascade" })
      .notNull(),
    /** Textual control_id (matches controls.controlId, controlAdjudications.controlId). */
    controlId: varchar("control_id", { length: 30 }).notNull(),
    /** Primary IR controls (3.6.1/2/3) vs adjacent (AU, AC, CP, SI). */
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.controlId] }),
    index("ir_exercise_controls_control_idx").on(t.controlId),
  ]
);

// ============== 4. Participants + attendance attestation ==============
export const irExerciseParticipants = pgTable(
  "ir_exercise_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .references(() => irExercises.id, { onDelete: "cascade" })
      .notNull(),
    /** Internal user (Clerk-backed) when applicable; null for external guests. */
    userId: uuid("user_id").references(() => users.id),
    name: text("name").notNull(),
    organization: text("organization").notNull(),
    title: text("title"),
    role: irParticipantRoleEnum("role").notNull(),
    email: varchar("email", { length: 320 }),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    attestationSignatureRef: text("attestation_signature_ref"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ir_exercise_participants_exercise_idx").on(t.exerciseId),
    index("ir_exercise_participants_user_idx").on(t.userId),
  ]
);

// ============== 5. Inject responses (one row per inject per exercise) ==============
export const irInjectResponses = pgTable(
  "ir_inject_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .references(() => irExercises.id, { onDelete: "cascade" })
      .notNull(),
    injectKey: varchar("inject_key", { length: 64 }).notNull(),
    /** Snapshot of the inject prompt + expected action at the time of capture. */
    injectPromptSnapshot: text("inject_prompt_snapshot").notNull(),
    expectedActionSnapshot: text("expected_action_snapshot").notNull(),
    status: irInjectResponseStatusEnum("status").notNull(),
    actualResponseNotes: text("actual_response_notes"),
    decisionOffsetMinutes: integer("decision_offset_minutes"),
    decisionTimestamp: timestamp("decision_timestamp", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ir_inject_responses_exercise_inject_idx").on(t.exerciseId, t.injectKey),
  ]
);

// ============== 6. After-Action Report (one per exercise) ==============
// CHECK constraint added in migration: drafted_by_user_id != approved_by_user_id
export const irAars = pgTable(
  "ir_aars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .references(() => irExercises.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    executiveSummary: text("executive_summary"),
    timelineNarrative: text("timeline_narrative"),
    strengths: text("strengths"),
    gaps: text("gaps"),
    evidenceReviewed: text("evidence_reviewed"),
    finalResult: irAarFinalResultEnum("final_result"),
    draftedByUserId: uuid("drafted_by_user_id").references(() => users.id),
    draftedAt: timestamp("drafted_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalSignatureRef: text("approval_signature_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ir_aars_drafted_by_idx").on(t.draftedByUserId),
    index("ir_aars_approved_by_idx").on(t.approvedByUserId),
  ]
);

// ============== 7. Findings (gaps from AAR) ==============
export const irFindings = pgTable(
  "ir_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aarId: uuid("aar_id")
      .references(() => irAars.id, { onDelete: "cascade" })
      .notNull(),
    controlId: varchar("control_id", { length: 30 }).notNull(),
    severity: irFindingSeverityEnum("severity").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** Optional cross-link into broader compliance posture. */
    linkedAdjudicationId: uuid("linked_adjudication_id").references(
      () => controlAdjudications.id,
      { onDelete: "set null" }
    ),
    /** Soft link to existing poam_entries.id (no FK to keep schema decoupled). */
    linkedPoamEntryId: uuid("linked_poam_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ir_findings_aar_idx").on(t.aarId),
    index("ir_findings_control_idx").on(t.controlId),
  ]
);

// ============== 8. Corrective Action Register (POA&M-aligned columns) ==============
export const irCorrectiveActions = pgTable(
  "ir_corrective_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id")
      .references(() => irFindings.id, { onDelete: "cascade" })
      .notNull(),
    weakness: text("weakness").notNull(),
    controlReference: varchar("control_reference", { length: 30 }).notNull(),
    resourcesRequired: text("resources_required"),
    scheduledCompletionDate: date("scheduled_completion_date"),
    milestonesJson: jsonb("milestones_json")
      .$type<Array<{ title: string; dueDate: string; completedAt?: string }>>()
      .notNull()
      .default([]),
    status: irCorrectiveActionStatusEnum("status").notNull().default("open"),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    /** Owner name when the owner has no Clerk-backed user. */
    ownerName: text("owner_name"),
    notes: text("notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ir_corrective_actions_finding_idx").on(t.findingId),
    index("ir_corrective_actions_status_idx").on(t.status),
    index("ir_corrective_actions_owner_idx").on(t.ownerUserId),
  ]
);

// ============== 9. Bundle (link exercise to generated artifact set in evidenceRuns) ==============
export const irExerciseBundles = pgTable(
  "ir_exercise_bundles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .references(() => irExercises.id, { onDelete: "cascade" })
      .notNull(),
    /** Dedicated evidence_run (source = 'ir_tabletop') for this bundle. */
    evidenceRunId: uuid("evidence_run_id")
      .references(() => evidenceRuns.id, { onDelete: "restrict" })
      .notNull(),
    bundleVersion: integer("bundle_version").notNull().default(1),
    /** Manifest also persisted as a file in evidence_file; this is the canonical inline copy. */
    manifestJson: jsonb("manifest_json").$type<Record<string, unknown>>().notNull(),
    manifestSha256: varchar("manifest_sha256", { length: 64 }).notNull(),
    /** RFC 3161 timestamp token when available; else system-signed timestamp record. */
    timestampToken: text("timestamp_token"),
    timestampedAt: timestamp("timestamped_at", { withTimezone: true }),
    retentionUntil: date("retention_until"),
    generatedByUserId: uuid("generated_by_user_id").references(() => users.id),
    storagePrefix: text("storage_prefix"),
    /**
     * Frozen state snapshot at archive time — full read-back of every input
     * the bundle was generated from (exercise + participants + inject
     * responses + AAR + findings + corrective actions). This is the
     * authoritative C3PAO record: even if subsequent edits change live state,
     * the bundle's archived snapshot tells exactly what was tested.
     *
     * Schema:
     *   {
     *     archivedAt: ISO,
     *     exercise: { ... },
     *     participants: [ ... ],
     *     injectResponses: [ ... ],
     *     aar: { ... } | null,
     *     findings: [{ ...finding, correctiveActions: [ ... ] }],
     *   }
     */
    archivedStateSnapshotJson: jsonb("archived_state_snapshot_json").$type<
      Record<string, unknown>
    >(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ir_exercise_bundles_exercise_version_idx").on(t.exerciseId, t.bundleVersion),
    index("ir_exercise_bundles_evidence_run_idx").on(t.evidenceRunId),
  ]
);
