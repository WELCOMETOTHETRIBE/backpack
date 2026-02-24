import { redirect } from "next/navigation";

/**
 * Adjudication is now the SCTM at /dashboard/controls.
 * Redirect so bookmarks and links to /dashboard/adjudication land on SCTM.
 * Sub-routes (/dashboard/adjudication/governance, .../governance/[controlId]) remain for 18 governance control detail pages.
 */
export default function AdjudicationPage() {
  redirect("/dashboard/controls");
}
