import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { SCTMPage } from "./SCTMPage";

export default async function ControlsPage() {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const userRole = user?.role ?? "Compliance";

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-gray-600)]">
          Loading…
        </div>
      }
    >
      <SCTMPage userRole={userRole} />
    </Suspense>
  );
}
