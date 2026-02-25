DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "cage_code" varchar(10); EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "primary_address" text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "primary_contact_name" varchar(255); EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "primary_contact_email" varchar(255); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
