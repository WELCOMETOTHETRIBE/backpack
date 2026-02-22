import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import {
  controlImplementations,
  poamItems,
  evidenceMetadata,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") ?? "executive";

    const impls = await db
      .select({ status: controlImplementations.status })
      .from(controlImplementations)
      .where(eq(controlImplementations.organizationId, orgId));

    const total = impls.length;
    const implemented = impls.filter((i) => i.status === "Implemented").length;
    const poamCount = impls.filter((i) => i.status === "POA&M").length;
    const inherited = impls.filter((i) => i.status === "Inherited").length;
    const compliancePct = total ? Math.round((implemented / total) * 100) : 0;

    const openPoam = await db
      .select()
      .from(poamItems)
      .where(eq(poamItems.organizationId, orgId));
    const openPoamCount = openPoam.filter((p) => p.status !== "Closed").length;
    const highRiskCount = openPoam.filter(
      (p) => p.status !== "Closed" && (p.riskSeverity === "High" || p.riskSeverity === "Critical")
    ).length;

    const evidence = await db
      .select({ retentionUntil: evidenceMetadata.retentionUntil })
      .from(evidenceMetadata)
      .where(eq(evidenceMetadata.organizationId, orgId));
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const expiringSoon = evidence.filter(
      (e) => e.retentionUntil && new Date(e.retentionUntil) <= in30Days
    ).length;

    if (view === "technical") {
      return NextResponse.json({
        controlsNeedingMonitoring: poamCount,
        evidenceExpiringSoon: expiringSoon,
        auditReadinessScore: total
          ? Math.round(
              (implemented / total) * 100 - (openPoamCount > 0 ? 10 : 0) - (expiringSoon > 0 ? 5 : 0)
            )
          : 0,
      });
    }

    return NextResponse.json({
      compliancePct,
      totalControls: total,
      implemented,
      byStatus: {
        "Not Started": impls.filter((i) => i.status === "Not Started").length,
        Implemented: implemented,
        Partial: impls.filter((i) => i.status === "Partial").length,
        "POA&M": poamCount,
        Inherited: inherited,
        "Not Applicable": impls.filter((i) => i.status === "Not Applicable").length,
      },
      openPoamCount,
      highRiskCount,
      inheritanceCount: inherited,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
