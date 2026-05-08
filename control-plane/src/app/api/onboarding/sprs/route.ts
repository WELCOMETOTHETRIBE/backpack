import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { controlAdjudications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateSprsScore } from "@/lib/sprs/sprs_calculator";
import { VAULT_CONTROL_MAP, getControlsByFamily } from "@/data/vault-control-map";

export async function GET() {
  try {
    const orgId = await requireOrg();

    const allAdj = await db
      .select({
        controlId: controlAdjudications.controlId,
        status: controlAdjudications.status,
      })
      .from(controlAdjudications)
      .where(eq(controlAdjudications.organizationId, orgId));

    const adjMap = new Map(allAdj.map((a) => [a.controlId, a.status]));

    const implementations = VAULT_CONTROL_MAP.map((ctrl) => {
      const status = adjMap.get(ctrl.controlId);
      return {
        controlId: ctrl.controlId,
        isImplemented:
          status === "implemented" ||
          status === "inherited" ||
          status === "not_applicable",
      };
    });

    const sprsScore = calculateSprsScore(implementations);

    // Per-family breakdown
    const familyMap = getControlsByFamily();
    const familyBreakdown = Object.entries(familyMap).map(([family, controls]) => {
      const familyImpls = controls.map((ctrl) => {
        const status = adjMap.get(ctrl.controlId);
        return {
          controlId: ctrl.controlId,
          isImplemented:
            status === "implemented" ||
            status === "inherited" ||
            status === "not_applicable",
        };
      });
      const familyScore = calculateSprsScore(familyImpls);
      const totalControls = controls.length;
      const resolvedControls = familyImpls.filter((c) => c.isImplemented).length;

      return {
        family,
        familyName: controls[0]?.familyName ?? family,
        score: familyScore,
        totalControls,
        resolvedControls,
        atRiskPoints: controls.reduce((sum, ctrl) => {
          const status = adjMap.get(ctrl.controlId);
          const isResolved =
            status === "implemented" ||
            status === "inherited" ||
            status === "not_applicable";
          return isResolved ? sum : sum + ctrl.sprsWeight;
        }, 0),
      };
    });

    return NextResponse.json({
      sprsScore,
      familyBreakdown,
      totalControls: VAULT_CONTROL_MAP.length,
      resolvedControls: implementations.filter((c) => c.isImplemented).length,
      openControls: implementations.filter((c) => !c.isImplemented).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
