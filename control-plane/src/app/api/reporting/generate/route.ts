import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";

// For now, return JSON data that can be rendered client-side
// In production, use Puppeteer or a dedicated PDF service for server-side PDF generation
export async function POST(req: Request) {
  try {
    await requireOrg();
    const { searchParams } = new URL(req.url);
    const reportType = searchParams.get("type");
    const body = await req.json();

    // Generate HTML content for PDF (can be converted using Puppeteer in production)
    let htmlContent = "";

    switch (reportType) {
      case "executive":
        htmlContent = generateExecutiveHTML(body);
        break;
      case "poam-aging":
        htmlContent = generatePOAMAgingHTML(body);
        break;
      case "evidence-expiration":
        htmlContent = generateEvidenceExpirationHTML(body);
        break;
      case "family-breakdown":
        htmlContent = generateFamilyBreakdownHTML(body);
        break;
      default:
        return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    // Return HTML that can be printed to PDF client-side
    // In production, use Puppeteer to convert HTML to PDF server-side
    return NextResponse.json({ html: htmlContent, type: reportType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generateExecutiveHTML(data: any): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Executive Compliance Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #0F172A; margin-bottom: 30px; }
          .section { margin-bottom: 25px; }
          .metric { margin: 10px 0; font-size: 14px; }
          .label { font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Executive Compliance Summary</h1>
        <div class="section">
          <h2>Overall Compliance</h2>
          <div class="metric"><span class="label">Compliance Score:</span> ${data.compliancePct}%</div>
          <div class="metric"><span class="label">Total Controls:</span> ${data.total}</div>
          <div class="metric"><span class="label">Implemented Controls:</span> ${data.implemented}</div>
        </div>
        <div class="section">
          <h2>Key Metrics</h2>
          <div class="metric"><span class="label">Open POA&Ms:</span> ${data.openPoams}</div>
          <div class="metric"><span class="label">Evidence Expiring Soon:</span> ${data.expiringEvidence}</div>
        </div>
        <div class="section">
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>
      </body>
    </html>
  `;
}

function generatePOAMAgingHTML(data: any): string {
  const rows = data.poams
    .map((poam: any) => {
      const daysOverdue = poam.targetCompletionDate
        ? Math.floor(
            (new Date().getTime() - new Date(poam.targetCompletionDate).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;
      return `
        <tr>
          <td>${poam.poamId}</td>
          <td>${poam.title}</td>
          <td>${daysOverdue > 0 ? `${daysOverdue} days overdue` : "On track"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>POA&M Aging Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #0F172A; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background-color: #f3f4f6; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>POA&M Aging Report</h1>
        <table>
          <thead>
            <tr>
              <th>POA&M ID</th>
              <th>Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function generateEvidenceExpirationHTML(data: any): string {
  const rows = data.evidence
    .map((ev: any) => `
      <tr>
        <td>${ev.evidenceId}</td>
        <td>${ev.artifactFilename}</td>
        <td>${ev.retentionUntil ? new Date(ev.retentionUntil).toLocaleDateString() : "N/A"}</td>
      </tr>
    `)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Evidence Expiration Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #0F172A; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background-color: #f3f4f6; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Evidence Expiration Report</h1>
        <table>
          <thead>
            <tr>
              <th>Evidence ID</th>
              <th>Artifact</th>
              <th>Expiration Date</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function generateFamilyBreakdownHTML(data: any): string {
  const rows = data.families
    .map((family: any) => {
      const pct = family.total > 0 ? Math.round((family.implemented / family.total) * 100) : 0;
      return `
        <tr>
          <td>${family.code}</td>
          <td>${family.name}</td>
          <td>${family.implemented}/${family.total} (${pct}%)</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Control Family Breakdown</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #0F172A; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background-color: #f3f4f6; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Control Family Breakdown</h1>
        <table>
          <thead>
            <tr>
              <th>Family Code</th>
              <th>Family Name</th>
              <th>Implementation Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}
