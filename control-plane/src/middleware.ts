import { auth } from "@/lib/auth";

export default auth((req) => {
  const isSignedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/auth/");
  if (isAuthPage && isSignedIn) {
    return Response.redirect(new URL("/dashboard", req.url));
  }
  if (!isAuthPage && !isSignedIn && req.nextUrl.pathname !== "/") {
    return Response.redirect(new URL("/auth/signin", req.url));
  }
  return undefined;
});

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/assessor/:path*"],
};
