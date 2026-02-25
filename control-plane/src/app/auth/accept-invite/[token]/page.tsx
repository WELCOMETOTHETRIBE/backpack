import { db } from "@/db";
import { userInvitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import AcceptInviteForm from "./AcceptInviteForm";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invitation] = await db
    .select({ email: userInvitations.email, expiresAt: userInvitations.expiresAt })
    .from(userInvitations)
    .where(eq(userInvitations.token, token))
    .limit(1);

  if (!invitation || new Date() > invitation.expiresAt) {
    notFound();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-zinc-900">Join your team</h1>
        <p className="mb-4 text-sm text-zinc-500">
          You&apos;ve been invited. Set a password to create your account.
        </p>
        <p className="mb-4 text-sm text-zinc-700">
          <span className="font-medium">Email:</span> {invitation.email}
        </p>
        <AcceptInviteForm token={token} email={invitation.email} />
      </div>
    </div>
  );
}
