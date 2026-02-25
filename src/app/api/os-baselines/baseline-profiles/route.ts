import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { osBaselineProfiles } from "@/db/schema";

/**
 * GET /api/os-baselines/baseline-profiles — list all baseline profiles (templates).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await db.select().from(osBaselineProfiles);
  return NextResponse.json(list);
}
