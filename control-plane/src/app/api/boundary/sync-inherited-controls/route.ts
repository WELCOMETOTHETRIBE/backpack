import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { syncInheritedControls } from "@/lib/boundary/sync-inherited-controls";

/**
 * POST /api/boundary/sync-inherited-controls
 *
 * Reads externalServiceProviders from the org and sets any controls listed
 * as inherited to status="inherited" — but only if they are currently
 * "not_started". Already-adjudicated controls are preserved.
 *
 * Returns { updated, skipped, providerCount, providers }
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const result = await syncInheritedControls(orgId, user.id!);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
