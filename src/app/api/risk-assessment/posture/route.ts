import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeOrgPosture } from "@/lib/risk-assessment/posture-engine";
import { adjustScenario } from "@/lib/risk-assessment/suggestion-engine";
import { THREAT_SCENARIOS } from "@/app/dashboard/readiness/risk-assessment/threat-scenarios";

/**
 * GET /api/risk-assessment/posture
 *
 * Phase 2 — returns the org's current posture summary (signed
 * attestations, cadence health, vuln counts, control status) plus
 * posture-adjusted suggestions for every curated threat scenario.
 *
 * The wizard fetches this on mount; selections start with the
 * adjusted suggestions instead of the static curated values, and the
 * adjustment trace is shown in the "Why this score?" tooltip.
 */

export async function GET() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const posture = await computeOrgPosture(orgId);
  const suggestions = THREAT_SCENARIOS.map((s) => adjustScenario(s, posture));

  return NextResponse.json({
    posture: {
      boundaryName: posture.boundaryName,
      implementedControlCount: posture.implementedControlCount,
      atRiskControlCount: posture.atRiskControlCount,
      signedAttestations: posture.signedAttestations.map((a) => ({
        label: a.label,
        signedAt: a.signedAt.toISOString(),
        controlIds: a.controlIds,
      })),
      cadenceByName: Object.fromEntries(
        Object.entries(posture.cadenceByName).map(([k, v]) => [
          k,
          {
            source: v.source,
            lastSeenAt: v.lastSeenAt?.toISOString() ?? null,
            daysSinceLast: v.daysSinceLast,
            status: v.status,
          },
        ]),
      ),
      vulnerability: posture.vulnerability,
    },
    suggestions,
  });
}
