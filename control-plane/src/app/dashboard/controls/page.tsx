import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { SCTMPage } from "./SCTMPage";

export default async function ControlsPage() {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const userRole = user?.role ?? "Compliance";

  // Pull back the layout's p-8 so the SCTM fills the full content area with its
  // own internal scroll management. -m-8 cancels padding; h-[calc(100%+4rem)]
  // restores the full flex-1 height (parent loses 2rem top + 2rem bottom = 4rem).
  return (
    <div className="-m-8 flex flex-col overflow-hidden" style={{ height: "calc(100% + 4rem)" }}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-gray-600)]">
            Loading…
          </div>
        }
      >
        <SCTMPage userRole={userRole} />
      </Suspense>
    </div>
  );
}
