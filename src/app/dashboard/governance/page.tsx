import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sspSections } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function GovernancePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const sections = await db
    .select()
    .from(sspSections)
    .where(eq(sspSections.organizationId, orgId));

  const byDoc = sections.reduce((acc: Record<string, typeof sections>, s) => {
    if (!acc[s.documentCode]) acc[s.documentCode] = [];
    acc[s.documentCode].push(s);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">SSP & Governance</h1>
      <p className="mb-6 text-zinc-600">
        System Security Plan sections and governance documents. Versioning and sign-off via attestations.
      </p>
      {Object.keys(byDoc).length === 0 ? (
        <p className="text-zinc-500">No SSP sections yet. Use API POST /api/ssp to create.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDoc).map(([code, list]) => (
            <div key={code}>
              <h2 className="mb-2 font-medium text-zinc-800">{code}</h2>
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.id} className="rounded border border-zinc-200 bg-white p-3">
                    <span className="font-mono text-sm text-zinc-600">{s.sectionKey}</span>
                    <span className="mx-2">—</span>
                    <span>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
