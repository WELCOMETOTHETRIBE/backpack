// ────────────────────────────────────────────────────────────────────────────
// Shared secret auth for the agent shim — used by the Claude Code routine
// to reach Postgres over HTTPS (sandbox blocks direct TCP to Railway DB).
//
// The shared secret lives in two places:
//   1. Railway env: AGENT_SHIM_SECRET — the Next.js routes validate this
//   2. Claude Code cloud env: AGENT_SHIM_SECRET — the routine sends it on every call
//
// Keep them in sync. Rotate if leaked.
// ────────────────────────────────────────────────────────────────────────────

export function verifyAgentShimSecret(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = process.env.AGENT_SHIM_SECRET;
  if (!expected) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "AGENT_SHIM_SECRET env var is not set on the server" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  const provided = req.headers.get("x-agent-secret");
  if (!provided || provided !== expected) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Invalid or missing x-agent-secret header" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  return { ok: true };
}
