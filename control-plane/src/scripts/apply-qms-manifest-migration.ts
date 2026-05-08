/**
 * Apply Phase 13 QMS governance manifest ingest migration (0065).
 *
 * Same workaround as apply-trainos-migrations.ts: the drizzle journal in
 * this codebase has been corrupt since a prior sprint, so
 * `drizzle-kit migrate` no-ops on hand-written SQL files. Re-emit the
 * 0065 statements as idempotent CREATE / ALTER calls and run on every
 * deploy via `npm run release`.
 *
 * Statements mirror drizzle/0065_qms_governance_manifests.sql verbatim.
 * Keep them in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-qms-manifest-migration.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  {
    label: "0065 qms_governance_manifests table",
    sql: `CREATE TABLE IF NOT EXISTS qms_governance_manifests (
      run_id              text PRIMARY KEY,
      organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      schema_version      text NOT NULL,
      generated_at        timestamptz NOT NULL,
      generated_by        text,
      tool_version        text,
      source              text NOT NULL,
      review_period_start timestamptz,
      review_period_end   timestamptz,
      issuer_service      text,
      issuer_url          text,
      issuer_client_id    text,
      issuer_git_sha      text,
      doc_count           integer NOT NULL,
      controls_touched    jsonb NOT NULL,
      content_hash        text NOT NULL,
      signing_hash        text NOT NULL,
      signature_alg       text NOT NULL,
      signature_kid       text NOT NULL,
      signature_value     text NOT NULL,
      raw_envelope        jsonb NOT NULL,
      received_at         timestamptz DEFAULT now() NOT NULL
    )`,
  },
  {
    label: "0065 qms_governance_manifests org index",
    sql: `CREATE INDEX IF NOT EXISTS qms_governance_manifests_org_idx
      ON qms_governance_manifests (organization_id)`,
  },
  {
    label: "0065 qms_governance_manifests received index",
    sql: `CREATE INDEX IF NOT EXISTS qms_governance_manifests_received_idx
      ON qms_governance_manifests (received_at)`,
  },
  {
    label: "0065 qms_governance_manifest_documents table",
    sql: `CREATE TABLE IF NOT EXISTS qms_governance_manifest_documents (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id            text NOT NULL REFERENCES qms_governance_manifests(run_id) ON DELETE CASCADE,
      organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_number   text NOT NULL,
      document_name     text NOT NULL,
      document_type     text,
      file_path         text,
      version           text,
      status            text,
      effective_date    timestamptz,
      next_review_date  timestamptz,
      sha256            text NOT NULL,
      file_size_bytes   integer,
      controls_mapped   jsonb NOT NULL
    )`,
  },
  {
    label: "0065 qms_governance_manifest_documents run index",
    sql: `CREATE INDEX IF NOT EXISTS qms_governance_manifest_documents_run_idx
      ON qms_governance_manifest_documents (run_id)`,
  },
  {
    label: "0065 qms_governance_manifest_documents doc_number index",
    sql: `CREATE INDEX IF NOT EXISTS qms_governance_manifest_documents_doc_idx
      ON qms_governance_manifest_documents (document_number)`,
  },
  {
    label: "0065 qms_governance_manifest_documents org index",
    sql: `CREATE INDEX IF NOT EXISTS qms_governance_manifest_documents_org_idx
      ON qms_governance_manifest_documents (organization_id)`,
  },
  // ── v1.2 lifecycle/signature columns (additive on existing 0065 table) ──
  {
    label: "0065+v1.2 qms_governance_manifest_documents.released",
    sql: `ALTER TABLE qms_governance_manifest_documents
      ADD COLUMN IF NOT EXISTS released boolean NOT NULL DEFAULT false`,
  },
  {
    label: "0065+v1.2 qms_governance_manifest_documents.released_at",
    sql: `ALTER TABLE qms_governance_manifest_documents
      ADD COLUMN IF NOT EXISTS released_at text`,
  },
  {
    label: "0065+v1.2 qms_governance_manifest_documents.signatures",
    sql: `ALTER TABLE qms_governance_manifest_documents
      ADD COLUMN IF NOT EXISTS signatures jsonb NOT NULL DEFAULT '[]'::jsonb`,
  },
];

(async () => {
  for (const { label, sql: stmt } of STMTS) {
    try {
      await sql.unsafe(stmt);
      console.log(`  ok  ${label}`);
    } catch (err) {
      console.error(`  FAIL ${label}:`, err);
      process.exit(1);
    }
  }
  await sql.end();
  console.log("apply-qms-manifest-migration: 0065 applied (idempotent).");
})();
