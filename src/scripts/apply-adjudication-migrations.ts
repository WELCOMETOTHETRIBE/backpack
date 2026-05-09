/**
 * Apply Phase 6-10 adjudication migrations (0058-0061).
 *
 * The drizzle journal in this codebase has been corrupt since some prior
 * sprint, so `drizzle-kit migrate` no-ops on these hand-written SQL files.
 * Mirroring apply-evidence-engine-migration.ts: re-emit each migration as
 * idempotent statements via the `postgres` driver, runnable on every
 * deploy without breakage.
 *
 * Used by `npm run release` (railway.toml preDeployCommand) so prod stays
 * in sync with src/db/schema.ts. Safe to run multiple times — every
 * statement uses IF NOT EXISTS / EXCEPTION WHEN duplicate_object.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-adjudication-migrations.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  // ── 0058: Phase 6 Observed-Implementation Statements (OIS) ─────────
  {
    label: "0058 control_observed_implementations table",
    sql: `CREATE TABLE IF NOT EXISTS control_observed_implementations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      control_id varchar(20) NOT NULL,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      narrative text NOT NULL,
      evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
      generated_at timestamptz NOT NULL DEFAULT now(),
      generated_from_manifest_id text,
      most_recent_evidence_at timestamptz,
      narrative_lock_started_at timestamptz,
      narrative_lock_assessment_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    label: "0058 OIS unique idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS control_observed_implementations_org_control_period_idx
      ON control_observed_implementations (organization_id, control_id, period_end)`,
  },
  {
    label: "0058 OIS recent idx",
    sql: `CREATE INDEX IF NOT EXISTS control_observed_implementations_org_control_recent_idx
      ON control_observed_implementations (organization_id, control_id, period_end DESC)`,
  },
  {
    label: "0058 OIS locked idx",
    sql: `CREATE INDEX IF NOT EXISTS control_observed_implementations_locked_idx
      ON control_observed_implementations (organization_id, narrative_lock_assessment_id)
      WHERE narrative_lock_started_at IS NOT NULL`,
  },

  // ── 0059: Phase 7 Control Adjudication Engine snapshots ────────────
  {
    label: "0059 control_adjudication_snapshots table",
    sql: `CREATE TABLE IF NOT EXISTS control_adjudication_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      control_id varchar(20) NOT NULL,
      computed_at timestamptz NOT NULL DEFAULT now(),
      status varchar(16) NOT NULL,
      confidence real NOT NULL,
      requirements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      period_basis_manifest_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    label: "0059 CAE unique idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS control_adjudication_snapshots_org_control_manifest_idx
      ON control_adjudication_snapshots (
        organization_id, control_id, COALESCE(period_basis_manifest_id, '__manual__')
      )`,
  },
  {
    label: "0059 CAE recent per-control idx",
    sql: `CREATE INDEX IF NOT EXISTS control_adjudication_snapshots_org_control_recent_idx
      ON control_adjudication_snapshots (organization_id, control_id, computed_at DESC)`,
  },
  {
    label: "0059 CAE recent org idx",
    sql: `CREATE INDEX IF NOT EXISTS control_adjudication_snapshots_org_recent_idx
      ON control_adjudication_snapshots (organization_id, computed_at DESC)`,
  },

  // ── 0060: Phase 9 Threat narratives ─────────────────────────────────
  {
    label: "0060 threat_narratives table",
    sql: `CREATE TABLE IF NOT EXISTS threat_narratives (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      narrative_type varchar(80) NOT NULL,
      summary text NOT NULL,
      confidence real NOT NULL,
      related_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      opened_at timestamptz NOT NULL,
      last_observed_at timestamptz NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'open',
      admin_acknowledged_at timestamptz,
      admin_acknowledged_by uuid,
      admin_outcome text,
      admin_notes text,
      isso_verified_at timestamptz,
      isso_verified_by_name text,
      isso_note text,
      merged_into_id uuid REFERENCES threat_narratives(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    label: "0060 threat_narratives status idx",
    sql: `CREATE INDEX IF NOT EXISTS threat_narratives_org_status_idx
      ON threat_narratives (organization_id, status, last_observed_at DESC)`,
  },
  {
    label: "0060 threat_narratives recent idx",
    sql: `CREATE INDEX IF NOT EXISTS threat_narratives_org_recent_idx
      ON threat_narratives (organization_id, last_observed_at DESC)`,
  },
  {
    label: "0060 threat_narratives type idx",
    sql: `CREATE INDEX IF NOT EXISTS threat_narratives_type_idx
      ON threat_narratives (organization_id, narrative_type, last_observed_at DESC)`,
  },

  // ── 0061: Phase 10 Assessments + assessor scratchpads ──────────────
  {
    label: "0061 assessments table",
    sql: `CREATE TABLE IF NOT EXISTS assessments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title text NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'open',
      opened_at timestamptz NOT NULL DEFAULT now(),
      opened_by_user_id uuid REFERENCES users(id),
      closed_at timestamptz,
      closed_by_user_id uuid REFERENCES users(id),
      assessor_name text,
      assessor_org text,
      assessor_email text,
      closeout_summary text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    label: "0061 assessments status idx",
    sql: `CREATE INDEX IF NOT EXISTS assessments_org_status_idx
      ON assessments (organization_id, status, opened_at DESC)`,
  },
  {
    label: "0061 assessor_scratchpads table",
    sql: `CREATE TABLE IF NOT EXISTS assessor_scratchpads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      control_id varchar(20) NOT NULL,
      notes text NOT NULL DEFAULT '',
      assessor_verdict varchar(24),
      last_edited_at timestamptz NOT NULL DEFAULT now(),
      last_edited_by_user_id uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    label: "0061 assessor_scratchpads unique idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS assessor_scratchpads_assessment_control_idx
      ON assessor_scratchpads (assessment_id, control_id)`,
  },

  // ── 0062 (Phase 10 follow-up): closeout receipt snapshot table ─────
  {
    label: "0062 assessment_closeout_receipts table",
    sql: `CREATE TABLE IF NOT EXISTS assessment_closeout_receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      generated_at timestamptz NOT NULL DEFAULT now(),
      generated_by_user_id uuid REFERENCES users(id),
      payload jsonb NOT NULL,
      payload_hash text NOT NULL,
      assessor_signature text
    )`,
  },
  {
    label: "0062 closeout receipts assessment idx",
    sql: `CREATE INDEX IF NOT EXISTS assessment_closeout_receipts_assessment_idx
      ON assessment_closeout_receipts (assessment_id, generated_at DESC)`,
  },

  // ── 0071 (Phase 1 "Send to Doc Control"): ssp_doc_control_submissions ───
  // Phase 1 wires only the Codex-side state machine. The outbound bridge
  // (Phase 2) and the inbound linker (Phase 3) ship once the QMS team
  // exposes a receiving endpoint. Idempotent; drizzle/0071 is the canonical
  // source — this is the runtime applier so prod stays in sync with
  // src/db/schema.ts on every deploy.
  {
    label: "0071 ssp_doc_control_submissions table",
    sql: `CREATE TABLE IF NOT EXISTS ssp_doc_control_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      ssp_document_id uuid NOT NULL REFERENCES ssp_documents(id) ON DELETE CASCADE,
      status varchar(16) NOT NULL DEFAULT 'submitted',
      submitted_payload_sha256 varchar(64) NOT NULL,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      qms_document_number text,
      qms_sha256 varchar(64),
      released_at timestamptz,
      superseded_at timestamptz,
      superseded_by_id uuid REFERENCES ssp_doc_control_submissions(id) ON DELETE SET NULL,
      rejected_at timestamptz,
      rejected_reason text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ssp_doc_control_submissions_status_chk
        CHECK (status IN ('submitted','released','superseded','rejected'))
    )`,
  },
  {
    label: "0071 ssp_doc_control_submissions one-inflight unique idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS ssp_doc_control_submissions_one_inflight_idx
      ON ssp_doc_control_submissions (organization_id, ssp_document_id)
      WHERE status = 'submitted'`,
  },
  {
    label: "0071 ssp_doc_control_submissions org idx",
    sql: `CREATE INDEX IF NOT EXISTS ssp_doc_control_submissions_org_idx
      ON ssp_doc_control_submissions (organization_id, status)`,
  },
  {
    label: "0071 ssp_doc_control_submissions doc idx",
    sql: `CREATE INDEX IF NOT EXISTS ssp_doc_control_submissions_doc_idx
      ON ssp_doc_control_submissions (ssp_document_id, status)`,
  },
  {
    label: "0071 ssp_doc_control_submissions qms-match idx",
    sql: `CREATE INDEX IF NOT EXISTS ssp_doc_control_submissions_qms_match_idx
      ON ssp_doc_control_submissions (organization_id, qms_document_number, qms_sha256)`,
  },
];

async function run() {
  let applied = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      applied++;
      console.log(`[adjudication-migrations] applied: ${stmt.label}`);
    } catch (err) {
      console.error(
        `[adjudication-migrations] FAILED: ${stmt.label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
  console.log(`[adjudication-migrations] complete (${applied}/${STMTS.length})`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
