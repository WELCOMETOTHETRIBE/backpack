import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/db";
import { userInvitations, users, organizations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { Resend } from "resend";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["Admin", "Compliance", "Assessor"]).optional(),
});

const INVITE_EXPIRY_DAYS = 7;

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const list = await db
      .select({
        id: userInvitations.id,
        email: userInvitations.email,
        role: userInvitations.role,
        expiresAt: userInvitations.expiresAt,
        createdAt: userInvitations.createdAt,
      })
      .from(userInvitations)
      .where(eq(userInvitations.organizationId, orgId));

    return NextResponse.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const inviter = await requireRole(["Admin", "Compliance"]);

    const body = await inviteSchema.parseAsync(await req.json());
    const email = body.email.trim().toLowerCase();
    const role = body.role ?? "Compliance";

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.email, email)))
      .limit(1);
    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email is already in your organization." },
        { status: 400 }
      );
    }

    const [existingInvite] = await db
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.organizationId, orgId),
          eq(userInvitations.email, email)
        )
      )
      .limit(1);
    if (existingInvite) {
      return NextResponse.json(
        { error: "An invitation for this email is already pending." },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const [invitation] = await db
      .insert(userInvitations)
      .values({
        organizationId: orgId,
        email,
        role,
        token,
        expiresAt,
        invitedById: inviter.id,
      })
      .returning({ id: userInvitations.id, expiresAt: userInvitations.expiresAt });

    if (!invitation) {
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://example.com";
    const acceptLink = `${baseUrl}/auth/accept-invite/${token}`;

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const orgName = org?.name ?? "Your organization";

    if (!process.env.RESEND_API_KEY) {
      console.error("[invitations] RESEND_API_KEY is not set — invitation email was NOT sent to", email);
    } else {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM ?? "CMMC OS <onboarding@resend.dev>";
      try {
        const result = await resend.emails.send({
          from,
          to: email,
          subject: `You're invited to join ${orgName} on CMMC OS`,
          html: `
            <p>Hello,</p>
            <p>You have been invited to join <strong>${orgName}</strong> on CMMC OS.</p>
            <p>Click the link below to set your password and join:</p>
            <p><a href="${acceptLink}" style="display:inline-block; margin-top:12px; padding:10px 20px; background:#3B82F6; color:white; text-decoration:none; border-radius:6px;">Accept invitation</a></p>
            <p>Or copy this link: ${acceptLink}</p>
            <p>This link expires in ${INVITE_EXPIRY_DAYS} days.</p>
          `,
        });
        console.log("[invitations] Email sent to", email, "resend id:", result.data?.id);
      } catch (emailErr) {
        console.error("[invitations] Failed to send email to", email, emailErr);
      }
    }

    return NextResponse.json({ ok: true, expiresAt: invitation.expiresAt });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Failed to create invitation";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
