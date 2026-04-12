import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ComplianceRegistersClient } from "./ComplianceRegistersClient";

export const metadata = { title: "Compliance Registers | Trust Codex" };

export default async function ComplianceRegistersPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  if (!user?.organizationId) redirect("/auth/signin");

  return (
    <ComplianceRegistersClient
      userRole={user.role ?? "Compliance"}
    />
  );
}
