import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { buildSSPMdx } from "@/lib/evidence-engine/ssp-generator";

/**
 * GET /api/evidence-engine/ssp — Build SSP draft MDX with placeholder substitution.
 * ?download=1 returns attachment with filename SSP_Draft_<date>.mdx
 */
export async function GET(request: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download") === "1";

    const mdx = await buildSSPMdx(orgId);

    if (download) {
      const date = new Date().toISOString().slice(0, 10);
      const filename = `SSP_Draft_${date}.mdx`;
      return new NextResponse(mdx, {
        status: 200,
        headers: {
          "Content-Type": "text/mdx",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ mdx });
  } catch (e) {
    console.error("GET /api/evidence-engine/ssp", e);
    return NextResponse.json({ error: "Failed to generate SSP draft" }, { status: 500 });
  }
}
