import { Suspense } from "react";
import { SCTMPage } from "./SCTMPage";

export default function ControlsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-gray-600)]">Loading…</div>}>
      <SCTMPage />
    </Suspense>
  );
}
