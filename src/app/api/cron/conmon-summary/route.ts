import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getControlsDueForReview, getEvidenceExpiringSoon } from "@/lib/conmon";
import { Resend } from "resend";

/**
 * GET /api/cron/conmon-summary
 * Daily cron: for each org, compute controls due for review and evidence expiring soon,
 * then email Compliance/Admin users. Secure with Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = process.env.RESEND_FROM ?? "CMMC OS <onboarding@resend.dev>";
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);

  const results: { orgId: string; orgName: string; emailed: string[]; error?: string }[] = [];

  for (const org of orgs) {
    try {
      const [controlsDue, evidenceExpiring] = await Promise.all([
        getControlsDueForReview(org.id),
        getEvidenceExpiringSoon(org.id),
      ]);

      const recipients = await db
        .select({ email: users.email })
        .from(users)
        .where(
          and(eq(users.organizationId, org.id), inArray(users.role, ["Admin", "Compliance"]))
        );
      const emails = recipients.map((r) => r.email).filter(Boolean);
      if (emails.length === 0) {
        results.push({ orgId: org.id, orgName: org.name, emailed: [] });
        continue;
      }

      const controlList =
        controlsDue.length === 0
          ? "<p>None.</p>"
          : `<ul>${controlsDue.map((c) => `<li>${c.controlId}</li>`).join("")}</ul>`;
      const evidenceList =
        evidenceExpiring.length === 0
          ? "<p>None.</p>"
          : `<ul>${evidenceExpiring.map((e) => `<li>${e.evidenceId} — ${e.artifactFilename} (until ${new Date(e.retentionUntil).toLocaleDateString()})</li>`).join("")}</ul>`;

      const html = `
        <h1>Continuous Monitoring Summary — ${org.name}</h1>
        <h2>Controls due for review (next 30 days)</h2>
        ${controlList}
        <h2>Evidence expiring soon (next 30 days)</h2>
        ${evidenceList}
        <p><a href="${process.env.NEXTAUTH_URL ?? "https://example.com"}/dashboard/monitoring">View in dashboard</a></p>
      `;

      if (!process.env.RESEND_API_KEY) {
        results.push({
          orgId: org.id,
          orgName: org.name,
          emailed: [],
          error: "RESEND_API_KEY not set",
        });
        continue;
      }

      const resendClient = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resendClient.emails.send({
        from,
        to: emails,
        subject: `CMMC OS ConMon: ${controlsDue.length} controls due, ${evidenceExpiring.length} evidence expiring`,
        html,
      });

      if (error) {
        results.push({
          orgId: org.id,
          orgName: org.name,
          emailed: [],
          error: error.message,
        });
      } else {
        results.push({ orgId: org.id, orgName: org.name, emailed: emails });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      results.push({ orgId: org.id, orgName: org.name, emailed: [], error: message });
    }
  }

  return NextResponse.json({ results });
}
