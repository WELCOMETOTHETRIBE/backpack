CREATE TABLE "poam_entry_closure_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poam_entry_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"approval_order" integer NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poam_entry_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poam_entry_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poam_entry_closure_approvals" ADD CONSTRAINT "poam_entry_closure_approvals_poam_entry_id_poam_entries_id_fk" FOREIGN KEY ("poam_entry_id") REFERENCES "public"."poam_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poam_entry_closure_approvals" ADD CONSTRAINT "poam_entry_closure_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poam_entry_milestones" ADD CONSTRAINT "poam_entry_milestones_poam_entry_id_poam_entries_id_fk" FOREIGN KEY ("poam_entry_id") REFERENCES "public"."poam_entries"("id") ON DELETE cascade ON UPDATE no action;