ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "clerk_org_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_user_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_clerk_org_id_unique" UNIQUE ("clerk_org_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_clerk_user_id_unique" UNIQUE ("clerk_user_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
