import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { calculateSprsScore } from "@/lib/sprs";

export async function GET() {
  try {
    const orgId = await requireOrg();
    const score = await calculateSprsScore(orgId);
    return NextResponse.json({ score });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
