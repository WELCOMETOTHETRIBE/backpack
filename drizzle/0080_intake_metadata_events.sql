-- Intake metadata event register for C3PAO-defensible ingestion chain.
-- Metadata-only by policy: no filenames, paths, SAS tokens, or raw file content.

DO $$ BEGIN
 CREATE TYPE "public"."intake_metadata_event_type" AS ENUM(
  'intake_upload_authorization',
  'intake_upload_started',
  'intake_upload_completed',
  'intake_rejected',
  'intake_expired',
  'intake_replay_blocked'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."intake_metadata_event_status" AS ENUM(
  'issued',
  'preflight_recorded',
  'upload_started',
  'upload_completed',
  'rejected',
  'expired',
  'replay_blocked'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "intake_metadata_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "transaction_id" varchar(100) NOT NULL,
  "event_type" "intake_metadata_event_type" NOT NULL,
  "status" "intake_metadata_event_status" NOT NULL,
  "event_timestamp_utc" timestamp with time zone DEFAULT now() NOT NULL,
  "timestamp_bucket" varchar(32) NOT NULL,
  "object_reference_token" text,
  "issued_by_actor_id" text,
  "recipient_email_hash" varchar(64),
  "artifact_type" text,
  "token_id" text,
  "token_expires_at_utc" timestamp with time zone,
  "boundary_assertion" text DEFAULT 'metadata_only' NOT NULL,
  "upload_destination" text DEFAULT 'azure_blob_direct' NOT NULL,
  "planned_bundle_hash_sha256" varchar(64),
  "content_hash_sha256" varchar(64),
  "size_bytes" integer,
  "upload_completed_at_utc" timestamp with time zone,
  "malware_scan_status" text,
  "policy_version" text NOT NULL,
  "evidence_trace_id" text,
  "correlation_id" text,
  "source_system" text DEFAULT 'enclavewatch' NOT NULL,
  "replay_key" text,
  "decision" text DEFAULT 'accepted' NOT NULL,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_metadata_events_recipient_hash_chk" CHECK (
    recipient_email_hash IS NULL OR recipient_email_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "intake_metadata_events_planned_hash_chk" CHECK (
    planned_bundle_hash_sha256 IS NULL OR planned_bundle_hash_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "intake_metadata_events_content_hash_chk" CHECK (
    content_hash_sha256 IS NULL OR content_hash_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "intake_metadata_events_size_chk" CHECK (
    size_bytes IS NULL OR size_bytes >= 0
  ),
  CONSTRAINT "intake_metadata_events_boundary_assertion_chk" CHECK (
    boundary_assertion = 'metadata_only'
  ),
  CONSTRAINT "intake_metadata_events_upload_destination_chk" CHECK (
    upload_destination = 'azure_blob_direct'
  ),
  CONSTRAINT "intake_metadata_events_source_system_chk" CHECK (
    source_system = 'enclavewatch'
  ),
  CONSTRAINT "intake_metadata_events_decision_chk" CHECK (
    decision IN ('accepted', 'rejected')
  )
);

ALTER TABLE "intake_metadata_events" ADD CONSTRAINT "intake_metadata_events_org_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_metadata_events" ADD CONSTRAINT "intake_metadata_events_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "intake_metadata_events_event_unique_idx"
  ON "intake_metadata_events" USING btree ("organization_id", "event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "intake_metadata_events_replay_unique_idx"
  ON "intake_metadata_events" USING btree ("organization_id", "transaction_id", "event_type", "timestamp_bucket");
CREATE INDEX IF NOT EXISTS "intake_metadata_events_request_idx"
  ON "intake_metadata_events" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_metadata_events_tx_idx"
  ON "intake_metadata_events" USING btree ("transaction_id");
CREATE INDEX IF NOT EXISTS "intake_metadata_events_corr_idx"
  ON "intake_metadata_events" USING btree ("correlation_id");
CREATE INDEX IF NOT EXISTS "intake_metadata_events_event_ts_idx"
  ON "intake_metadata_events" USING btree ("event_timestamp_utc");
CREATE INDEX IF NOT EXISTS "intake_metadata_events_status_idx"
  ON "intake_metadata_events" USING btree ("status");
