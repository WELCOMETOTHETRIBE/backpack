import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";

export type CodexRole = "Admin" | "Compliance" | "Assessor";

export interface PageSession {
  orgId: string;
  userId: string;
  role: CodexRole;
}

type RedirectMode =
  | { kind: "redirect"; to: string }
  | { kind: "notFound" };

export interface PageRoleOptions {
  // Where to send anonymous users. Default: /auth/signin.
  onAnon?: RedirectMode;
  // Where to send signed-in users whose role is not in `allowed`.
  // Default: /auth/signin (matches the legacy inline pattern).
  onDeny?: RedirectMode;
}

const DEFAULT_OPTIONS: Required<PageRoleOptions> = {
  onAnon: { kind: "redirect", to: "/auth/signin" },
  onDeny: { kind: "redirect", to: "/auth/signin" },
};

function bounce(mode: RedirectMode): never {
  if (mode.kind === "notFound") notFound();
  redirect(mode.to);
}

// Server-page role gate. Wraps the same `auth()` resolution every page does
// inline today. Returns a typed session bag on success; redirects (or 404s)
// on failure per the supplied options.
//
// Replaces the eleven-instance `if (!orgId || user?.role !== "Assessor") redirect(...)`
// pattern across /assessor/*, /dashboard/admin/*, and /dashboard/poam/[id].
export async function requirePageRole(
  allowed: readonly CodexRole[],
  options: PageRoleOptions = {}
): Promise<PageSession> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const session = await auth();
  const orgId = session?.user?.organizationId;
  const userId = session?.user?.id;
  const role = session?.user?.role as CodexRole | undefined;

  if (!orgId || !userId) bounce(opts.onAnon);
  if (!role || !allowed.includes(role)) bounce(opts.onDeny);

  return { orgId, userId, role };
}

// Convenience wrappers for the two most common gates on the codex.
export const requireAssessor = () =>
  requirePageRole(["Assessor"]);

export const requireAdminOrCompliance = (options?: PageRoleOptions) =>
  requirePageRole(["Admin", "Compliance"], options);
