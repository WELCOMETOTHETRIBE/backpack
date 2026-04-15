import { auth } from "@/lib/auth";

export default auth((req) => {
  const isSignedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;
  const isAuthPage = pathname.startsWith("/auth/");
  const isWelcomePage = pathname.startsWith("/welcome");
  const isDashboard = pathname.startsWith("/dashboard");

  // Signed-in users on auth pages → dashboard
  if (isAuthPage && isSignedIn) {
    return Response.redirect(new URL("/dashboard", req.url));
  }

  // Unauthenticated users on protected pages → sign in
  if (!isAuthPage && !isSignedIn && pathname !== "/") {
    return Response.redirect(new URL("/auth/signin", req.url));
  }

  // Welcome page is allowed through — the page.tsx server component handles
  // redirect logic (completed wizard → /dashboard, no org → /auth/signin)
  if (isWelcomePage) {
    return undefined;
  }

  // Dashboard pages: the server components themselves verify wizard completion.
  // No middleware-level Trust Codex gate here to avoid needing DB access in edge.
  return undefined;
});

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/assessor/:path*", "/welcome/:path*", "/welcome"],
};
