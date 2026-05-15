import { NextResponse } from "next/server";

import { requireOrg, requireRole } from "@/lib/auth";
import { buildIntakeReconstructionByTransactionId } from "@/lib/intake/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ intakeTransactionId: string }> },
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { intakeTransactionId } = await params;
    if (!intakeTransactionId) {
      return NextResponse.json(
        { error: "intakeTransactionId is required" },
        { status: 400 },
      );
    }

    const reconstruction = await buildIntakeReconstructionByTransactionId({
      orgId,
      intakeTransactionId,
    });
    if (!reconstruction) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(reconstruction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
