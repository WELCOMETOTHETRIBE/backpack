import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const records = await db
      .select({
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
      })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));

    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", buffers.push.bind(buffers));

    doc.fontSize(18).text("Governance Wizard — Progress Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toISOString().slice(0, 10)}`, { align: "center" });
    doc.moveDown(2);

    const implemented = records.filter((r) => r.implementationStatus === "implemented" || r.implementationStatus === "assessed").length;
    const inProgress = records.filter((r) => r.implementationStatus === "in_progress").length;
    const notStarted = records.filter((r) => r.implementationStatus === "not_started").length;

    doc.fontSize(12).text("Summary", { continued: false });
    doc.fontSize(10).text(`Implemented: ${implemented}  |  In progress: ${inProgress}  |  Not started: ${notStarted}`);
    doc.moveDown(2);

    for (const family of CONTROL_FAMILIES) {
      const inFamily = records.filter((r) => r.controlId.startsWith(family.controlPrefix));
      const done = inFamily.filter((r) => r.implementationStatus === "implemented" || r.implementationStatus === "assessed").length;
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
