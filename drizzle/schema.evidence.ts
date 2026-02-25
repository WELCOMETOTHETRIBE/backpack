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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("evidence_run_org_idx").on(t.organizationId),
    systemIdx: index("evidence_run_system_idx").on(t.systemId),
    runIdIdx: index("evidence_run_runid_idx").on(t.runId),
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
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evidenceRunId, t.controlId] }),
  })
);
