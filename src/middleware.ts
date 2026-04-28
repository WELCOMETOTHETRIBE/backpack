import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
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
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
