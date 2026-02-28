-- Snapshot coverage attestation: coverage_hash + run metadata bound into snapshot signature. Idempotent.
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_source text;
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_evidence_run_id text;
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_run_fingerprint text;
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_collected_at timestamptz;
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_hash text;
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_totals jsonb;
ALTER TABLE boundary_snapshots ADD COLUMN IF NOT EXISTS coverage_top_gaps jsonb;

CREATE INDEX IF NOT EXISTS boundary_snapshots_coverage_hash_idx ON boundary_snapshots(coverage_hash);
CREATE INDEX IF NOT EXISTS boundary_snapshots_coverage_run_fp_idx ON boundary_snapshots(coverage_run_fingerprint);
