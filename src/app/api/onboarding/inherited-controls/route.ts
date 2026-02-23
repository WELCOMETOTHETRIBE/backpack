import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { getInheritedControls } from "@/lib/compliance";

/**
 * POST /api/onboarding/inherited-controls
 * Body: { selectedTechnologies: string[] }
 * Returns { controls: { controlId, inheritedFrom }[], summary: string }
 */
export async function POST(req: Request) {
  try {
    await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json();
    const selectedTechnologies = Array.isArray(body.selectedTechnologies)
      ? body.selectedTechnologies
      : [];

    const controls = getInheritedControls(selectedTechnologies);
    const count = controls.length;
    const summary =
      count === 0
        ? "No controls are automatically satisfied by your selected cloud provider."
        : `By choosing your cloud provider, you have inherited ${count} control${count !== 1 ? "s" : ""}.`;

    return NextResponse.json({ controls, summary, count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compute inherited controls";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
