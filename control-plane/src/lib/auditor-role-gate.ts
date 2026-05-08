/**
 * Phase 10 — auditor route role gate.
 *
 * /auditor/* pages are intended for the C3PAO during a formal assessment.
 * The userRoleEnum already defines `Assessor`; this is the canonical
 * "auditor" role. Admin + Compliance are also allowed to view the same
 * pages so they can preview what the C3PAO will see before the actual
 * walkthrough.
 *
 * Returns the role bag if the user is allowed; redirects to a forbidden
 * stub otherwise.
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export const AUDITOR_ALLOWED_ROLES = ["Admin", "Compliance", "Assessor"] as const;

export interface AuditorSession {
  orgId: string;
  userId: string;
  role: (typeof AUDITOR_ALLOWED_ROLES)[number];
}

/**
 * Gate any /auditor/* server page on Admin / Compliance / Assessor role.
 * Redirects to /auth/signin when no session, or to /auditor/forbidden
 * when the role isn't in the allow-list.
 */
export async function requireAuditorRole(): Promise<AuditorSession> {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!orgId || !userId) redirect("/auth/signin");
  if (
    !role ||
    !(AUDITOR_ALLOWED_ROLES as readonly string[]).includes(role)
  ) {
    redirect("/auditor/forbidden");
  }
  return {
    orgId,
    userId,
    role: role as (typeof AUDITOR_ALLOWED_ROLES)[number],
  };
}
