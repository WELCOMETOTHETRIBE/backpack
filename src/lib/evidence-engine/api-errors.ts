import { NextResponse } from "next/server";

/**
 * Stable error response shape for Evidence Engine API routes.
 * Use for 400, 403, 404, 500 so clients can handle consistently.
 */
export type EvidenceEngineErrorBody = {
  error: string;
  code?: string;
  fields?: Record<string, string>;
};

export function errorResponse(
  error: string,
  status: number,
  opts?: { code?: string; fields?: Record<string, string> }
): NextResponse {
  const body: EvidenceEngineErrorBody = { error };
  if (opts?.code) body.code = opts.code;
  if (opts?.fields) body.fields = opts.fields;
  return NextResponse.json(body, { status });
}
