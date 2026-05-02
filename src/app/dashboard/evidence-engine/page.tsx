import { redirect } from "next/navigation";

/**
 * The Evidence Engine landing was an early operational-records dashboard
 * that surfaced per-control register pass/fail using a local helper that
 * disagreed with the canonical isControlAdjudicated() in
 * adjudication-helpers.ts. Result: same org showed 88 adjudicated on
 * /dashboard and 0% pass here -- a credibility-killer for an assessor.
 *
 * Day-to-day register management lives at /dashboard/registers. The
 * /dashboard/evidence-engine/registers/[id] subtree (per-register detail
 * + entries + attest-no-events) stays live -- it's what the Registers tab
 * links into. This top-level redirect just removes the misleading
 * headline view from circulation.
 *
 * Two features that lived here are scheduled to move:
 *   - "Export Auditor Bundle (ZIP)" -> Readiness page
 *   - "Generate SSP Draft (MDX)" -> SSP page
 *   - The responsibility column (Azure / MacTech / Customer / Shared) is
 *     preserved in src/lib/evidence-engine/responsibilities.ts for the
 *     Customer Responsibility Matrix project.
 */
export default function EvidenceEngineLanding() {
  redirect("/dashboard/registers");
}
