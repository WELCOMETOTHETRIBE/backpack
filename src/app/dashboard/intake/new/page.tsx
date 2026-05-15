import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { NewIntakeForm } from "./NewIntakeForm";

export const metadata = { title: "New Intake Request | Trust Codex" };

export default async function NewIntakePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  if (!user?.organizationId) redirect("/auth/signin");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--color-navy-primary)]">
        Create Intake Request
      </h1>
      <p className="text-sm text-[var(--color-gray-600)]">
        Create a controlled CUI/FCI ingress transaction and generate a scoped upload flow.
      </p>
      <NewIntakeForm />
    </div>
  );
}
