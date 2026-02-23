import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getControlsDueForReview, getEvidenceExpiringSoon } from "@/lib/conmon";

export default async function MonitoringPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [controlsDue, evidenceExpiring] = await Promise.all([
    getControlsDueForReview(orgId),
    getEvidenceExpiringSoon(orgId),
  ]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Continuous Monitoring</h1>
      <p className="mb-6 text-zinc-600">
        Controls due for review and evidence expiring in the next 30 days.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-zinc-800">Controls due for review</h2>
        <p className="mb-2 text-sm text-zinc-500">
          Controls whose last validation + cadence is in the past or within 30 days.
        </p>
        {controlsDue.length === 0 ? (
          <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            No controls due for review in the next 30 days.
          </p>
        ) : (
          <ul className="space-y-2">
            {controlsDue.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/controls?control=${c.controlId}`}
                  className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 hover:border-zinc-300"
                >
                  <span className="font-mono text-zinc-800">{c.controlId}</span>
                  <span className="text-sm text-zinc-500">
                    {c.lastValidationDate
                      ? `Last: ${new Date(c.lastValidationDate).toLocaleDateString()}`
                      : "Never validated"}
                    {c.monitoringCadence ? ` · ${c.monitoringCadence}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-zinc-800">Evidence expiring soon</h2>
        <p className="mb-2 text-sm text-zinc-500">
          Evidence metadata with retention date in the next 30 days or already passed.
        </p>
        {evidenceExpiring.length === 0 ? (
          <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            No evidence expiring in the next 30 days.
          </p>
        ) : (
          <ul className="space-y-2">
            {evidenceExpiring.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2"
              >
                <span className="font-mono text-zinc-800">{e.evidenceId}</span>
                <span className="max-w-xs truncate text-sm text-zinc-600">
                  {e.artifactFilename}
                </span>
                <span className="text-sm text-zinc-500">
                  Retain until: {new Date(e.retentionUntil).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
