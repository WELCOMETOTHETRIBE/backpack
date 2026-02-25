ALTER TABLE "organizations" ADD COLUMN "cage_code" varchar(10);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_address" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_contact_name" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_contact_email" varchar(255);
