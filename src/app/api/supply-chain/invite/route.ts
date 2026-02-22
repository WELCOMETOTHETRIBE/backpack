import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import { subcontractorRelationships, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";

const requestSchema = z.object({
  companyName: z.string().min(1),
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const body = await requestSchema.parseAsync(await req.json());
    const { companyName, email } = body;

    // Check if organization already exists with this email domain
    const [existingOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, email.split("@")[1].replace(/\./g, "-")))
      .limit(1);

    let subOrganizationId = existingOrg?.id;

    // If org doesn't exist, create it (or leave null for pending invite)
    if (!subOrganizationId) {
      // For now, we'll create the relationship with inviteEmail
      // The organization will be created when the user accepts the invite
    }

    // Create or update relationship
    const [relationship] = await db
      .insert(subcontractorRelationships)
      .values({
        primeOrganizationId: orgId,
        subOrganizationId: subOrganizationId || null,
        status: subOrganizationId ? "Active" : "Pending",
        inviteEmail: email,
      })
      .returning();

    await writeAuditLog({
      organizationId: orgId,
      action: "supply_chain.invite",
      resourceType: "subcontractor_relationship",
      resourceId: relationship?.id,
      details: { companyName, email },
    });

    // TODO: Send invitation email via Resend

    return NextResponse.json({ success: true, relationship });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
