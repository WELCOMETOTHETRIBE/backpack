import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getControlsDueForReview, getEvidenceExpiringSoon } from "@/lib/conmon";
import { renderConmonDigestHtml } from "@/lib/email/conmon-digest";
import { Resend } from "resend";

/**
 * GET /api/cron/conmon-summary
 * Legacy cron entry point. For each org, sends ConMon digest using shared template.
 * Prefer POST /api/conmon/send-digests for new cron jobs.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://example.com";
  const dashboardUrl = `${baseUrl}/dashboard/monitoring`;
  const from = process.env.RESEND_FROM ?? "CMMC OS <no-reply@mactechsolutionsllc.com>";
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

      const html = renderConmonDigestHtml({
        orgName: org.name,
        controlsDue: controlsDue.map((c) => ({
          controlId: c.controlId,
          lastValidationDate: c.lastValidationDate,
          monitoringCadence: c.monitoringCadence,
        })),
        evidenceExpiring: evidenceExpiring.map((e) => ({
          evidenceId: e.evidenceId,
          artifactFilename: e.artifactFilename,
          retentionUntil: e.retentionUntil,
        })),
        dashboardUrl,
      });

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
      const totalItems = controlsDue.length + evidenceExpiring.length;
      const subject =
        totalItems > 0
          ? `CMMC OS ConMon: ${controlsDue.length} controls due, ${evidenceExpiring.length} evidence expiring`
          : "CMMC OS ConMon: All clear for the next 30 days";

      const { error } = await resendClient.emails.send({
        from,
        to: emails,
        subject,
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
