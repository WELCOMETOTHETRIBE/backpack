CREATE TYPE "public"."register_entry_status" AS ENUM('draft', 'final', 'void');--> statement-breakpoint
CREATE TABLE "boundary_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boundary_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"component_type" varchar(32) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_control_responsibilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"boundary_id" text,
	"control_id" text NOT NULL,
	"responsibility_model" text NOT NULL,
	"azure_inherited_json" jsonb,
	"mactech_provided_json" jsonb,
	"customer_required_json" jsonb,
	"notes_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_entry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"boundary_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_json" jsonb
);
--> statement-breakpoint
ALTER TABLE "boundary" ADD COLUMN "boundary_type" varchar(32) DEFAULT 'cui_enclave' NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "boundary_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "entry_type" varchar(80);--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "status" "register_entry_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "approved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "locked_by_id" uuid;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "voided_by_id" uuid;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD COLUMN "exportable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_register_entry_files" ADD COLUMN "boundary_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_register_entry_files" ADD COLUMN "uploaded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "governance_register_entry_files" ADD COLUMN "uploaded_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "governance_register_entry_files" ADD COLUMN "exportable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_registers" ADD COLUMN "default_cadence_days" integer;--> statement-breakpoint
ALTER TABLE "governance_registers" ADD COLUMN "cadence_override_days" integer;--> statement-breakpoint
ALTER TABLE "boundary_component" ADD CONSTRAINT "boundary_component_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_control_responsibilities" ADD CONSTRAINT "governance_control_responsibilities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_entry_events" ADD CONSTRAINT "governance_entry_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_entry_events" ADD CONSTRAINT "governance_entry_events_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_entry_events" ADD CONSTRAINT "governance_entry_events_entry_id_governance_register_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."governance_register_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_entry_events" ADD CONSTRAINT "governance_entry_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boundary_component_boundary_id_idx" ON "boundary_component" USING btree ("boundary_id");--> statement-breakpoint
CREATE INDEX "governance_control_responsibilities_org_id_idx" ON "governance_control_responsibilities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "governance_control_responsibilities_boundary_id_idx" ON "governance_control_responsibilities" USING btree ("boundary_id");--> statement-breakpoint
CREATE INDEX "governance_control_responsibilities_control_id_idx" ON "governance_control_responsibilities" USING btree ("control_id");--> statement-breakpoint
CREATE INDEX "gov_entry_events_org_boundary_entry_idx" ON "governance_entry_events" USING btree ("org_id","boundary_id","entry_id");--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_register_entry_files" ADD CONSTRAINT "governance_register_entry_files_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_register_entry_files" ADD CONSTRAINT "governance_register_entry_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boundary_org_type_idx" ON "boundary" USING btree ("organization_id","boundary_type");--> statement-breakpoint
CREATE INDEX "gov_register_entries_boundary_register_idx" ON "governance_register_entries" USING btree ("boundary_id","register_id");--> statement-breakpoint
CREATE INDEX "gov_entry_files_boundary_entry_idx" ON "governance_register_entry_files" USING btree ("boundary_id","register_entry_id");