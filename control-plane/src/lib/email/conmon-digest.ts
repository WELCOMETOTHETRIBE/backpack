/**
 * HTML email template for the Continuous Monitoring (ConMon) digest.
 */

export interface ControlDue {
  controlId: string;
  lastValidationDate?: Date | null;
  monitoringCadence?: string | null;
}

export interface EvidenceExpiring {
  evidenceId: string;
  artifactFilename: string;
  retentionUntil: Date;
}

export interface ConmonDigestParams {
  orgName: string;
  controlsDue: ControlDue[];
  evidenceExpiring: EvidenceExpiring[];
  dashboardUrl: string;
}

export function renderConmonDigestHtml(params: ConmonDigestParams): string {
  const { orgName, controlsDue, evidenceExpiring, dashboardUrl } = params;

  const controlRows =
    controlsDue.length === 0
      ? "<tr><td colspan=\"2\" style=\"padding:8px 12px; color:#6b7280;\">None in the next 30 days.</td></tr>"
      : controlsDue
          .map(
            (c) =>
              `<tr><td style="padding:8px 12px; font-family:ui-monospace, monospace;">${escapeHtml(c.controlId)}</td><td style="padding:8px 12px; color:#6b7280;">${c.monitoringCadence ?? "—"}</td></tr>`
          )
          .join("");

  const evidenceRows =
    evidenceExpiring.length === 0
      ? "<tr><td colspan=\"2\" style=\"padding:8px 12px; color:#6b7280;\">None in the next 30 days.</td></tr>"
      : evidenceExpiring
          .map(
            (e) =>
              `<tr><td style="padding:8px 12px;">${escapeHtml(e.evidenceId)} — ${escapeHtml(e.artifactFilename)}</td><td style="padding:8px 12px; color:#6b7280;">${new Date(e.retentionUntil).toLocaleDateString()}</td></tr>`
          )
          .join("");

  const totalItems = controlsDue.length + evidenceExpiring.length;
  const showDigest = totalItems > 0;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Continuous Monitoring Digest — ${escapeHtml(orgName)}</title>
</head>
<body style="margin:0; font-family: system-ui, -apple-system, sans-serif; background-color: #f3f4f6; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">CMMC OS</h1>
      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">Continuous Monitoring Digest</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 20px; color: #374151; font-size: 15px;">Hello,</p>
      <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5;">
        Here is your continuous monitoring summary for <strong>${escapeHtml(orgName)}</strong>.
      </p>
      ${
        showDigest
          ? `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #0f172a;">Controls due for review (next 30 days)</h2>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Control</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Cadence</th>
            </tr>
          </thead>
          <tbody>
            ${controlRows}
          </tbody>
        </table>
      </div>
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #0f172a;">Evidence expiring soon (next 30 days)</h2>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Evidence</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Retention until</th>
            </tr>
          </thead>
          <tbody>
            ${evidenceRows}
          </tbody>
        </table>
      </div>
      `
          : `
      <p style="margin: 0 0 20px; color: #374151; font-size: 15px;">
        You have no controls due for review and no evidence expiring in the next 30 days. Keep up the good work.
      </p>
      `
      }
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; padding: 12px 20px; background: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 500; font-size: 14px; border-radius: 6px;">View in dashboard</a>
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #6b7280;">This is an automated message from CMMC OS. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
