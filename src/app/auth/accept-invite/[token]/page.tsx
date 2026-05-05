import { redirect } from "next/navigation";

export default async function LegacyAcceptInviteRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/join/${encodeURIComponent(token)}`);
}
