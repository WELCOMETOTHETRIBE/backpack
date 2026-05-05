import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations, userInvitations } from "@/db/schema";

export default async function JoinInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    notFound();
  }

  const [invite] = await db
    .select({
      email: userInvitations.email,
      role: userInvitations.role,
      expiresAt: userInvitations.expiresAt,
      orgName: organizations.name,
    })
    .from(userInvitations)
    .innerJoin(organizations, eq(userInvitations.organizationId, organizations.id))
    .where(eq(userInvitations.token, token))
    .limit(1);

  if (!invite) {
    notFound();
  }

  const expired = invite.expiresAt.getTime() <= Date.now();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[#2A2A2A] bg-[#141414] p-8 shadow-lg">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3B82F6] mb-2">
          Trust Codex
        </p>
        <h1 className="text-2xl font-bold text-white mb-2">Team invitation</h1>
        {expired ? (
          <p className="text-sm text-gray-400 mb-6">
            This invitation link has expired. Ask your administrator to send a new invitation.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">
              You&apos;ve been invited to <strong className="text-gray-200">{invite.orgName}</strong>{" "}
              with role <strong className="text-gray-200">{invite.role}</strong>.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Sign in or create an account using{" "}
              <strong className="text-gray-200">{invite.email}</strong> so your access can be matched
              to this invitation.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/sign-up"
                className="flex h-12 items-center justify-center rounded-lg bg-[#3B82F6] text-sm font-semibold text-white hover:bg-[#2563EB]"
              >
                Create account
              </Link>
              <Link
                href="/sign-in"
                className="flex h-12 items-center justify-center rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] text-sm font-medium text-gray-100 hover:border-[#3B82F6]"
              >
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
