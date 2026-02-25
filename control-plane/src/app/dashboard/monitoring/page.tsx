import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getControlsDueForReview, getEvidenceExpiringSoon } from "@/lib/conmon";
import { MonitoringClient } from "./MonitoringClient";

export default async function MonitoringPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [controlsDueRaw, evidenceExpiringRaw] = await Promise.all([
    getControlsDueForReview(orgId),
    getEvidenceExpiringSoon(orgId),
  ]);

  const controlsDue = controlsDueRaw.map((c) => ({
    id: c.id,
    controlId: c.controlId ?? "—",
    lastValidated: c.lastValidationDate
      ? new Date(c.lastValidationDate).toLocaleDateString()
      : "Never validated",
    cadence: c.monitoringCadence ?? "—",
    link: `/dashboard/controls?control=${c.controlId}`,
  }));

  const evidenceExpiring = evidenceExpiringRaw.map((e) => ({
    id: e.id,
    evidenceId: e.evidenceId ?? "—",
    artifactFilename: e.artifactFilename ?? "—",
    retainUntil: e.retentionUntil
      ? new Date(e.retentionUntil).toLocaleDateString()
      : "—",
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">Continuous Monitoring</h1>
        <p className="mt-2 text-gray-600">
          Controls due for review and evidence expiring in the next 30 days.
        </p>
      </div>
      <MonitoringClient controlsDue={controlsDue} evidenceExpiring={evidenceExpiring} />
    </div>
  );
}
