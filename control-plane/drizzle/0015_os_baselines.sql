-- OS Baselines: new enums and tables; extend evidence_control_technical_status
DO $$ BEGIN CREATE TYPE "public"."baseline_control_applicability" AS ENUM('required', 'conditional', 'na_by_default'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."os_asset_role" AS ENUM('member_server', 'domain_controller', 'workstation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."os_family" AS ENUM('windows_server', 'windows_client', 'linux'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "boundary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "baseline_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"os_family" "os_family" NOT NULL,
	"os_version" varchar(50) NOT NULL,
	"role" "os_asset_role" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "baseline_control" (
	"baseline_profile_id" uuid NOT NULL,
	"control_id" text NOT NULL,
	"applicability" "baseline_control_applicability" NOT NULL,
	"rationale" text,
	CONSTRAINT "baseline_control_baseline_profile_id_control_id_pk" PRIMARY KEY("baseline_profile_id","control_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "baseline_check" (
	"baseline_profile_id" uuid NOT NULL,
	"check_id" varchar(120) NOT NULL,
	"control_id" text NOT NULL,
	"expected_setting" text NOT NULL,
	"evidence_required_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb,
	"remediation_guidance" text,
	"manual_commands" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "os_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"boundary_id" uuid NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"os_family" "os_family" NOT NULL,
	"os_version" varchar(50) NOT NULL,
	"role" "os_asset_role" NOT NULL,
	"baseline_profile_id" uuid,
	"owner" varchar(255),
	"tags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_control_technical_status" ADD COLUMN "os_asset_id" uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_control_technical_status" ADD COLUMN "baseline_profile_id" uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "baseline_check" ADD CONSTRAINT "baseline_check_baseline_profile_id_baseline_profile_id_fk" FOREIGN KEY ("baseline_profile_id") REFERENCES "public"."baseline_profile"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "baseline_control" ADD CONSTRAINT "baseline_control_baseline_profile_id_baseline_profile_id_fk" FOREIGN KEY ("baseline_profile_id") REFERENCES "public"."baseline_profile"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "boundary" ADD CONSTRAINT "boundary_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "os_asset" ADD CONSTRAINT "os_asset_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "os_asset" ADD CONSTRAINT "os_asset_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "os_asset" ADD CONSTRAINT "os_asset_baseline_profile_id_baseline_profile_id_fk" FOREIGN KEY ("baseline_profile_id") REFERENCES "public"."baseline_profile"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "baseline_check_profile_check_idx" ON "baseline_check" USING btree ("baseline_profile_id","check_id");
