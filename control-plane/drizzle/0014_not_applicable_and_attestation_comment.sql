-- Add not_applicable to implementation_status enum (PostgreSQL: ADD VALUE)
ALTER TYPE "implementation_status" ADD VALUE IF NOT EXISTS 'not_applicable';--> statement-breakpoint
-- Add optional comment to attestations for control attestations
ALTER TABLE "attestations" ADD COLUMN IF NOT EXISTS "comment" text;
