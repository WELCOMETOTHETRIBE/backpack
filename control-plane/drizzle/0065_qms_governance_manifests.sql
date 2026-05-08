-- Phase 13 — QMS governance manifest ingest tables.
--
-- Stores signed CMMC governance manifests received from QMS via
-- POST /api/integrations/qms-manifest/ingest. Mirrors the ISSO weekly-
-- export ingest pattern (isso_export_manifests). Each manifest is
-- append-only — re-POSTing the same run_id is a no-op via the PRIMARY
-- KEY constraint.
--
-- Schema is `mactech-governance-manifest.v1.1` — additive bump over
-- Brian's QMS-side v1, adds the signing envelope (content_hash,
-- signing_hash, signature_*) + controls_touched aggregation.

CREATE TABLE IF NOT EXISTS "qms_governance_manifests" (
  "run_id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "schema_version" text NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "generated_by" text,
  "tool_version" text,
  "source" text NOT NULL,
  "review_period_start" timestamp with time zone,
  "review_period_end" timestamp with time zone,
  "issuer_service" text,
  "issuer_url" text,
  "issuer_client_id" text,
  "issuer_git_sha" text,
  "doc_count" integer NOT NULL,
  "controls_touched" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "signing_hash" text NOT NULL,
  "signature_alg" text NOT NULL,
  "signature_kid" text NOT NULL,
  "signature_value" text NOT NULL,
  "raw_envelope" jsonb NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "qms_governance_manifests_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "qms_governance_manifests_org_idx"
  ON "qms_governance_manifests" ("organization_id");
CREATE INDEX IF NOT EXISTS "qms_governance_manifests_received_idx"
  ON "qms_governance_manifests" ("received_at");

CREATE TABLE IF NOT EXISTS "qms_governance_manifest_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "document_number" text NOT NULL,
  "document_name" text NOT NULL,
  "document_type" text,
  "file_path" text,
  "version" text,
  "status" text,
  "effective_date" timestamp with time zone,
  "next_review_date" timestamp with time zone,
  "sha256" text NOT NULL,
  "file_size_bytes" integer,
  "controls_mapped" jsonb NOT NULL,
  CONSTRAINT "qms_governance_manifest_documents_run_id_qms_governance_manifests_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "qms_governance_manifests"("run_id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "qms_governance_manifest_documents_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "qms_governance_manifest_documents_run_idx"
  ON "qms_governance_manifest_documents" ("run_id");
CREATE INDEX IF NOT EXISTS "qms_governance_manifest_documents_doc_idx"
  ON "qms_governance_manifest_documents" ("document_number");
CREATE INDEX IF NOT EXISTS "qms_governance_manifest_documents_org_idx"
  ON "qms_governance_manifest_documents" ("organization_id");
