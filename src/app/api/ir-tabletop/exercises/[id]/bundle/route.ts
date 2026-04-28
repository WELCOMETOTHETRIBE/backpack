import { type NextRequest } from "next/server";
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  notImplementedYet,
  UploadBundleManifestSchema,
} from "@/lib/ir-tabletop-bridge";

/**
 * POST /api/ir-tabletop/exercises/:id/bundle
 *
 * Receive a generated artifact bundle manifest from MacTech_Training. The
 * manifest is the canonical record; individual files are persisted via the
 * existing evidence_run / evidence_file path (Phase 3 fills this in). Stub.
 */
export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  try {
    const rawBody = await req.text();
    await authorizeIrRequest(req, rawBody);
    UploadBundleManifestSchema.parse(JSON.parse(rawBody));
    return notImplementedYet("1b");
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}
