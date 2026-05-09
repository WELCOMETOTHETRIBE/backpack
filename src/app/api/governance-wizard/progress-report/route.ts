import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { requireOrg, requireRole } from "@/lib/auth";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { getControlStatesForOrg } from "@/lib/canonical-state/get-control-state";

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    // Phase A1: report numbers come from the canonical helper, not raw
    // implementation_status. Vocabulary is C3PAO-aligned (MET / NOT
    // MET / NA per 32 CFR § 170.24) so the exported PDF matches what
    // the SCTM and dashboard show.
    const canonicalStates = await getControlStatesForOrg(orgId);
    const records = Array.from(canonicalStates.values());

    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", buffers.push.bind(buffers));

    doc.fontSize(18).text("Governance Wizard — Progress Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toISOString().slice(0, 10)}`, { align: "center" });
    doc.moveDown(2);

    const met = records.filter((r) => r.aggregateFinding === "MET").length;
    const notMet = records.filter((r) => r.aggregateFinding === "NOT_MET").length;
    const na = records.filter((r) => r.aggregateFinding === "NA").length;

    doc.fontSize(12).text("Summary (CMMC L2 findings)", { continued: false });
    doc
      .fontSize(10)
      .text(`MET: ${met}  |  NOT MET: ${notMet}  |  N/A: ${na}  |  Defensible (MET + N/A): ${met + na}`);
    doc.moveDown(2);

    for (const family of CONTROL_FAMILIES) {
      const inFamily = records.filter((r) => r.controlId.startsWith(family.controlPrefix));
      const done = inFamily.filter(
        (r) => r.aggregateFinding === "MET" || r.aggregateFinding === "NA",
      ).length;
      doc.fontSize(11).text(`${family.code} — ${family.name}: ${done}/${inFamily.length}`, { continued: false });
      doc.moveDown(0.5);
    }

    doc.end();

    return new Promise<NextResponse>((resolve, reject) => {
      doc.on("end", () => {
        const pdf = Buffer.concat(buffers);
        resolve(
          new NextResponse(pdf, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="governance-progress-report.pdf"',
              "Content-Length": String(pdf.length),
            },
          })
        );
      });
      doc.on("error", reject);
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
