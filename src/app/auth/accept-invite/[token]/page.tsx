import { redirect } from "next/navigation";

export default async function LegacyAcceptInviteRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await params;
  redirect("/sign-in");
}
