import { redirect } from "next/navigation";

/**
 * Compliance reports moved out of a dedicated /dashboard/reporting page
 * and into the surfaces where the data lives:
 *   - SCTM (per-control + family rollups): /dashboard/controls
 *   - SSP (system security plan + sections): /dashboard/ssp
 *   - POA&M export: /dashboard/poam
 *   - Readiness summary + auditor bundle: /dashboard/readiness
 *
 * This page was a leftover that ran a parallel implementation count off
 * the legacy controlImplementations table -- numbers diverged from the
 * canonical helper. Redirecting to the SSP since that's the formal
 * compliance-reporting artifact a C3PAO actually examines.
 */
export default function ReportingLanding() {
  redirect("/dashboard/ssp");
}
