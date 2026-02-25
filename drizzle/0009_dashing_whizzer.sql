DO $$ BEGIN CREATE TYPE "public"."flowdown_response_type" AS ENUM('linked_workspace', 'manual_attestation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."mock_assessment_score" AS ENUM('Met', 'Partially Met', 'Not Met'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."mock_assessment_status" AS ENUM('in_progress', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE "mock_assessment_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_assessment_id" uuid NOT NULL,
	"control_id" varchar(20) NOT NULL,
	"question_text" text NOT NULL,
	"user_response" text NOT NULL,
	"llm_evaluation" text NOT NULL,
	"score" "mock_assessment_score" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "mock_assessment_status" DEFAULT 'in_progress' NOT NULL,
	"scope" varchar(20) DEFAULT 'full' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subcontractor_flowdown_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subcontractor_relationship_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"response_type" "flowdown_response_type",
	"linked_organization_id" uuid,
	"attestation_data" jsonb,
	"ssp_document_url" text,
	"poam_document_url" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcontractor_flowdown_responses_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "mock_assessment_responses" ADD CONSTRAINT "mock_assessment_responses_mock_assessment_id_mock_assessments_id_fk" FOREIGN KEY ("mock_assessment_id") REFERENCES "public"."mock_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_assessments" ADD CONSTRAINT "mock_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_flowdown_responses" ADD CONSTRAINT "subcontractor_flowdown_responses_subcontractor_relationship_id_subcontractor_relationships_id_fk" FOREIGN KEY ("subcontractor_relationship_id") REFERENCES "public"."subcontractor_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_flowdown_responses" ADD CONSTRAINT "subcontractor_flowdown_responses_linked_organization_id_organizations_id_fk" FOREIGN KEY ("linked_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;