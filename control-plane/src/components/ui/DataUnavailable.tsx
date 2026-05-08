import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export interface DataUnavailableProps {
  // What the user was trying to view (e.g. "register entry", "manifest").
  resource: string;
  // Where to send the user back to. Defaults to /dashboard.
  backTo?: string;
  backLabel?: string;
}

// Detail-page fallback when a primary fetch throws. Distinct from
// `notFound()` (which is for "row doesn't exist"); this handles operational
// failures — schema drift, transient DB errors, downstream timeouts — so a
// detail-page crash doesn't take the whole route segment down.
export function DataUnavailable({
  resource,
  backTo = "/dashboard",
  backLabel = "Back to dashboard",
}: DataUnavailableProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">Data unavailable</p>
          <p className="mt-1">
            We couldn&apos;t load this {resource} right now. The record may exist but the database
            returned an error. Try again in a moment, or check the application logs.
          </p>
        </div>
      </div>
      <Link
        href={backTo}
        className="inline-block text-sm text-[var(--color-blue-accent,#2563eb)] hover:underline"
      >
        ← {backLabel}
      </Link>
    </div>
  );
}
