import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { evidenceMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import RegisterEvidenceForm from "./RegisterEvidenceForm";
import { EvidenceTableClient } from "./EvidenceTableClient";

const cardClass = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";

export default async function EvidencePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const items = await db
    .select()
    .from(evidenceMetadata)
    .where(eq(evidenceMetadata.organizationId, orgId));

  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiring = items.filter(
    (r) => r.retentionUntil && new Date(r.retentionUntil) <= in30Days
  );

  const rows = items.map((i) => ({
    id: i.id,
    evidenceId: i.evidenceId ?? "—",
    artifactFilename: i.artifactFilename ?? "—",
    storageLocation: i.storageLocation ?? "—",
    sha256Preview: i.sha256Hash ? `${i.sha256Hash.slice(0, 16)}…` : "",
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">Evidence Metadata Registry</h1>
        <p className="mt-2 text-gray-600">
          Metadata only — no file uploads. Register RunId, path, SHA-256, and link to controls.
        </p>
      </div>

      <div className="space-y-6">
        {expiring.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-amber-800">
              Expiring within 30 days ({expiring.length})
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-700">
              {expiring.map((i) => (
                <li key={i.id}>
                  {i.evidenceId} — retention until{" "}
                  {i.retentionUntil ? new Date(i.retentionUntil).toLocaleDateString() : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={cardClass}>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Register evidence</h2>
          <RegisterEvidenceForm />
        </div>

        <div className={cardClass}>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Registered evidence</h2>
          <EvidenceTableClient rows={rows} />
        </div>
      </div>
    </div>
  );
}
