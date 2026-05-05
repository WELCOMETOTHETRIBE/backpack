import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sendAuditLogAsync } from "@/lib/mactech-audit-client";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/join(.*)",
  "/api/webhooks(.*)",
  // Server-to-server SPRS lookup (consumed by CaptureOS). Does its own
  // bearer-token check against CAPTUREOS_API_TOKEN; doesn't need a
  // Clerk session.
  "/api/sprs(.*)",
  // Server-to-server training-completion ingestion (from MacTech
  // Training and other LMSs). Does its own bearer-token check against
  // TRAINING_API_TOKEN; doesn't need a Clerk session for the
  // completing user.
  "/api/training/completion(.*)",
  // Agent shim — used by the incorporate-feedback Claude Code routine
  // to read feedback / append events / mark complete from a sandboxed
  // environment that has no Clerk session. Each route validates
  // x-agent-secret against AGENT_SHIM_SECRET on its own.
  "/api/agent/run(.*)",
  // IR Tabletop bridge — service-to-service calls from MacTech Training
  // (HMAC-signed bearer) plus session-mode reads from /assessor/ir-tabletop
  // pages. Each route in src/app/api/ir-tabletop/ validates auth via
  // authorizeIrRequest() in src/lib/ir-tabletop-bridge.ts. Without this
  // exception, Clerk's protect() rewrites all unauthenticated requests to
  // /clerk_* (404), blocking the bridge entirely.
  "/api/ir-tabletop(.*)",
  // EnclaveWatch unattended ingest endpoints. The vault service pushes
  // OS evidence + Azure validator + weekly review acknowledgements
  // without a Clerk session. Each route uses resolveOrgFromSessionOrBearer
  // (src/lib/auth-bearer.ts) which accepts EITHER a Clerk session OR an
  // EnclaveWatch bearer token (organizations.enclavewatch_api_token).
  // Without these exceptions, Clerk's protect() rewrites to /clerk_*
  // (404) before the route handler ever sees the bearer header.
  "/api/evidence/v2/ingest(.*)",
  "/api/os-baselines/boundaries/:id/evidence-runs/import-report(.*)",
  "/api/enclavewatch(.*)",
  "/api/registers/vuln-remediation(.*)",
  "/api/registers/identity-inventory(.*)",
  "/api/registers/access-authorizations(.*)",
]);

const AUDIT_SESSION_COOKIE = "mactech_audit_session";
const AUDIT_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  await auth.protect();

  // Fire one "session opened" audit event per browser session per app.
  // Cookie-based dedup keeps the central log signal-to-noise high.
  if (!req.cookies.has(AUDIT_SESSION_COOKIE)) {
    const session = await auth();
    sendAuditLogAsync({
      payload: {
        appKey: "codex",
        eventType: "codex.session.opened",
        eventCategory: "auth",
        action: "Opened MacTech Codex (CMMC compliance plane)",
        actorClerkUserId: session.userId ?? undefined,
        customerOrgClerkId: session.orgId ?? undefined,
        metadata: { path: req.nextUrl.pathname },
      },
    });
    const response = NextResponse.next();
    response.cookies.set(AUDIT_SESSION_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: AUDIT_SESSION_TTL_SECONDS,
      path: "/",
    });
    return response;
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
