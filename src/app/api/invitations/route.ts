import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { Resend } from "resend";

import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/db";
import { organizations, userInvitations, users } from "@/db/schema";

const INVITE_TTL_DAYS = 14;

const postSchema = z.object({
  email: z.string().email(),
  role: z.enum(["Admin", "Compliance", "Assessor"]),
});

function appBaseUrl(): string {
  const direct = process.env.NEXTAUTH_URL?.trim();
  if (direct) return direct.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "https://codex.mactechsolutionsllc.com";
}

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const now = new Date();
    const rows = await db
      .select({
        id: userInvitations.id,
        email: userInvitations.email,
        role: userInvitations.role,
        expiresAt: userInvitations.expiresAt,
        createdAt: userInvitations.createdAt,
      })
      .from(userInvitations)
      .where(and(eq(userInvitations.organizationId, orgId), gt(userInvitations.expiresAt, now)))
      .orderBy(desc(userInvitations.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const sessionUser = await requireRole(["Admin", "Compliance"]);

    const body = await postSchema.parseAsync(await req.json());
    const normalizedEmail = body.email.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.email, normalizedEmail)))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already belongs to your organization." },
        { status: 409 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("[invitations] RESEND_API_KEY is not set — cannot send invitation email");
      return NextResponse.json(
        {
          error:
            "Email is not configured for this environment (RESEND_API_KEY). Ask your administrator to set Resend credentials.",
        },
        { status: 503 },
      );
    }

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const orgName = org?.name ?? "your organization";

    await db
      .delete(userInvitations)
      .where(and(eq(userInvitations.organizationId, orgId), eq(userInvitations.email, normalizedEmail)));

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [invitation] = await db
      .insert(userInvitations)
      .values({
        organizationId: orgId,
        email: normalizedEmail,
        role: body.role,
        token,
        expiresAt,
        invitedById: sessionUser.id ?? null,
      })
      .returning({ id: userInvitations.id });

    if (!invitation) {
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
    }

    const baseUrl = appBaseUrl();
    const joinLink = `${baseUrl}/join/${token}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM ?? "Trust Codex <no-reply@mactechsolutionsllc.com>";

    try {
      await resend.emails.send({
        from,
        to: normalizedEmail,
        subject: `You're invited to ${orgName} on Trust Codex`,
        html: `
          <p>Hello,</p>
          <p>You've been invited to join <strong>${escapeHtml(orgName)}</strong> on Trust Codex with the role <strong>${escapeHtml(body.role)}</strong>.</p>
          <p>Use the email address <strong>${escapeHtml(normalizedEmail)}</strong> when you sign in or create your account.</p>
          <p><a href="${joinLink}" style="display:inline-block; margin-top:12px; padding:10px 20px; background:#3B82F6; color:white; text-decoration:none; border-radius:6px;">Accept invitation</a></p>
          <p style="word-break:break-all; color:#64748b; font-size:13px;">Or copy this link:<br/>${joinLink}</p>
          <p style="color:#64748b; font-size:13px;">This link expires in ${INVITE_TTL_DAYS} days.</p>
        `,
      });
    } catch (emailErr) {
      await db.delete(userInvitations).where(eq(userInvitations.id, invitation.id));
      console.error("[invitations] Resend failed for", normalizedEmail, emailErr);
      const resendMsg =
        emailErr && typeof emailErr === "object" && "message" in emailErr
          ? String((emailErr as { message: unknown }).message)
          : "Email provider rejected the message.";
      return NextResponse.json(
        { error: `Failed to send invitation email: ${resendMsg}` },
        { status: 502 },
      );
    }

    await writeAuditLog({
      organizationId: orgId,
      userId: sessionUser.id ?? null,
      action: "team.invite_sent",
      resourceType: "user_invitation",
      resourceId: invitation.id,
      details: { email: normalizedEmail, role: body.role },
    });

    return NextResponse.json({ success: true, id: invitation.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
