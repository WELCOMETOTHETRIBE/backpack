import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import { subcontractorRelationships, subcontractorFlowdownResponses, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";
import { Resend } from "resend";

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

    const [primeOrg] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const primeName = primeOrg?.name ?? "Your prime contractor";

    // Check if organization already exists with this email domain
    const [existingOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, email.split("@")[1].replace(/\./g, "-")))
      .limit(1);

    let subOrganizationId = existingOrg?.id;

    const [relationship] = await db
      .insert(subcontractorRelationships)
      .values({
        primeOrganizationId: orgId,
        subOrganizationId: subOrganizationId || null,
        status: subOrganizationId ? "Active" : "Pending",
        inviteEmail: email,
      })
      .returning();

    if (!relationship) {
      return NextResponse.json({ error: "Failed to create relationship" }, { status: 500 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(subcontractorFlowdownResponses).values({
      subcontractorRelationshipId: relationship.id,
      token,
    });

    await writeAuditLog({
      organizationId: orgId,
      action: "supply_chain.invite",
      resourceType: "subcontractor_relationship",
      resourceId: relationship.id,
      details: { companyName, email },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://example.com";
    const responseLink = `${baseUrl}/subcontractor-response/${token}`;

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM ?? "CMMC OS <onboarding@resend.dev>";
      await resend.emails.send({
        from,
        to: email,
        subject: `${primeName} has invited you to respond to flow-down requirements`,
        html: `
          <p>Hello,</p>
          <p><strong>${primeName}</strong> has invited you to respond to their CMMC flow-down requirements.</p>
          <p>You can either link your CMMC OS workspace (if you have an account) or submit a manual attestation.</p>
          <p><a href="${responseLink}" style="display:inline-block; margin-top:12px; padding:10px 20px; background:#3B82F6; color:white; text-decoration:none; border-radius:6px;">Respond to flow-down request</a></p>
          <p>Or copy this link: ${responseLink}</p>
          <p>This link is unique and should not be shared.</p>
        `,
      });
    }

    return NextResponse.json({ success: true, relationship });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
