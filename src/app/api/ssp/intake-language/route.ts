import { NextResponse } from "next/server";

import { requireOrg, requireRole } from "@/lib/auth";
import { buildIntakeSspLanguage } from "@/lib/ssp/intake-language";

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const payload = await buildIntakeSspLanguage(orgId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
