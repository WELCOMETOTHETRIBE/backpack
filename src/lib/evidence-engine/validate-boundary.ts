import { NextResponse } from "next/server";
import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { errorResponse } from "./api-errors";

export type BoundaryRow = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  scopeComponents: string[] | null;
  azureEnvironment: string | null;
  cloudProvider: string | null;
  boundaryType: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Validate boundary_id for the current org. Returns { boundary } or a 400 NextResponse with VALIDATION_ERROR.
 */
export async function requireBoundaryForOrg(
  orgId: string,
  boundaryId: string | null | undefined
): Promise<{ boundary: BoundaryRow } | NextResponse> {
  if (!boundaryId || typeof boundaryId !== "string" || boundaryId.trim() === "") {
    return errorResponse("boundary_id required", 400, { code: "VALIDATION_ERROR", fields: { boundary_id: "required" } });
  }
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId.trim()), eq(boundaries.organizationId, orgId)));
  if (!boundary) {
    return errorResponse("Invalid or unauthorized boundary", 400, { code: "VALIDATION_ERROR", fields: { boundary_id: "invalid" } });
  }
  return { boundary: boundary as BoundaryRow };
}
