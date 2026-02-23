import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { evidenceMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import RegisterEvidenceForm from "./RegisterEvidenceForm";

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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">Evidence Metadata Registry</h1>
        <p className="mt-2 text-gray-600">
          Metadata only — no file uploads. Register RunId, path, SHA-256, and link to controls.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {expiring.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-amber-800">Expiring within 30 days ({expiring.length})</h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-700">
              {expiring.map((i) => (
                <li key={i.id}>
                  {i.evidenceId} — retention until {i.retentionUntil ? new Date(i.retentionUntil).toLocaleDateString() : ""}
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
          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="rounded border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-slate-700">{i.evidenceId}</span>
                  <span className="mx-2 text-slate-500">|</span>
                  <span className="text-slate-600">{i.artifactFilename}</span>
                  <span className="mx-2 text-slate-500">|</span>
                  <span className="text-slate-500">{i.storageLocation}</span>
                  {i.sha256Hash && (
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      {i.sha256Hash.slice(0, 16)}…
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No evidence registered yet. Use the form above (metadata only).</p>
          )}
        </div>
      </div>
    </div>
  );
}
