import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Evidence is metadata-only (RunId, path, sha256, size, timestamps).
 * No artifact ingestion. Keep this Control Plane outside the CUI boundary.
 */

export const evidenceRuns = pgTable(
  "evidence_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    systemId: uuid("system_id").notNull(), // your asset/enclave/system record id
    runId: text("run_id").notNull(), // e.g. CUI-Evidence-20260224-082350
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    collectorName: text("collector_name").notNull(),
    collectorVersion: text("collector_version").notNull(),
    bundleRoot: text("bundle_root").notNull(), // e.g. "<RunId>/"
    manifest: jsonb("manifest").notNull(), // meta/manifest.json (metadata only)
    hashAlgorithm: text("hash_algorithm").notNull().default("sha256"),
    /** Evidence source: azure_entra | windows_server_hardening | legacy */
    source: text("source").notNull().default("legacy"),
    /** Account boundary id (from account_boundary); set on import for boundary-scoped runs */
    boundaryId: text("boundary_id"),
    /** Fingerprint for idempotency: sha256(source|validator_sha256|inputs_manifest_sha256) */
    runFingerprint: text("run_fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("evidence_run_org_idx").on(t.organizationId),
    systemIdx: index("evidence_run_system_idx").on(t.systemId),
    runIdIdx: index("evidence_run_runid_idx").on(t.runId),
    boundaryIdx: index("evidence_run_boundary_idx").on(t.boundaryId),
    fingerprintIdx: index("evidence_run_fingerprint_idx").on(t.runFingerprint),
    orgFingerprintUnique: uniqueIndex("evidence_run_org_fingerprint_unique").on(
      t.organizationId,
      t.runFingerprint
    ),
  })
);

export const evidenceFiles = pgTable(
  "evidence_file",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evidenceRunId: uuid("evidence_run_id")
      .notNull()
      .references(() => evidenceRuns.id, { onDelete: "cascade" }),
    path: text("path").notNull(), // forward slashes, relative to bundle root
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("evidence_file_run_idx").on(t.evidenceRunId),
    pathIdx: index("evidence_file_path_idx").on(t.path),
    shaIdx: index("evidence_file_sha_idx").on(t.sha256),
  })
);

export const evidenceControlTechnicalStatus = pgTable(
  "evidence_control_technical_status",
  {
    evidenceRunId: uuid("evidence_run_id")
      .notNull()
      .references(() => evidenceRuns.id, { onDelete: "cascade" }),
    controlId: text("control_id").notNull(), // e.g. AC.L2-3.1.10
    technicalOk: boolean("technical_ok").notNull(),
    missingFiles: jsonb("missing_files").notNull().default([]),
    presentFiles: jsonb("present_files").notNull().default([]),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    /** When run is tied to an OS asset (system_id = os_asset.id). */
    osAssetId: uuid("os_asset_id"),
    /** Baseline profile used to evaluate this run (from os_asset). */
    baselineProfileId: uuid("baseline_profile_id"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evidenceRunId, t.controlId] }),
  })
);

/** Per-check findings from validator reports (azure_entra, windows_server_hardening). */
export const evidenceFindings = pgTable(
  "evidence_finding",
  {
    evidenceRunId: uuid("evidence_run_id")
      .notNull()
      .references(() => evidenceRuns.id, { onDelete: "cascade" }),
    controlId: text("control_id").notNull(),
    pass: boolean("pass").notNull(),
    observed: text("observed").notNull(),
    expected: text("expected").notNull(),
    evidenceHint: text("evidence_hint").notNull(),
    evidenceFilesUsed: jsonb("evidence_files_used").$type<string[]>().notNull().default([]),
    providerOrCustomer: text("provider_or_customer").notNull(), // provider | customer | shared
    layer: text("layer"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    /** True when OS evidence is present but control requires accompanying gov docs, logs, or records (manifest support_level PARTIAL). */
    partial: boolean("partial").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evidenceRunId, t.controlId] }),
    controlIdx: index("evidence_finding_control_idx").on(t.controlId),
  })
);
