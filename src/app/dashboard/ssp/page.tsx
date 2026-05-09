import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, FileSignature, Plus, ShieldCheck, Sparkles } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  organizations,
  sspDocuments,
  sspSignoffs,
} from "@/db/schema";
import { GenerateSspButton } from "./GenerateSspButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /dashboard/ssp — SSP Versions page (Phase C).
 *
 * Replaces the legacy "authoring progress" page that read raw
 * implementation_status. Now reads from ssp_documents (Phase C0
 * schema) and renders one row per generated SSP version with:
 *
 *   - version number + lifecycle badge (draft / signed / superseded /
 *     revoked)
 *   - cryptographic provenance (payload_sha256 short form +
 *     copy-to-clipboard via the page's data attributes)
 *   - generation tally (MET / NOT MET / N/A) — these match the SCTM
 *     and dashboard counts because they all read the canonical helper
 *   - sign-off chain (which AO/system_owner/ISSO rows are bound to
 *     this version's payload_sha256)
 *   - drift status link to GET /api/ssp/[id]/verify
 *
 * Plus a "Generate new version" CTA — Admin-only — that POSTs to
 * /api/ssp/generate. After the new version is issued the page revalidates.
 */
export default async function SspPage() {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/sign-in");

  const isAdmin = user?.role === "Admin";

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const versions = await db
    .select({
      id: sspDocuments.id,
      versionNumber: sspDocuments.versionNumber,
      status: sspDocuments.status,
      generatedAt: sspDocuments.generatedAt,
      generatedFromSnapshotAt: sspDocuments.generatedFromSnapshotAt,
      payloadSha256: sspDocuments.payloadSha256,
      signatureAlg: sspDocuments.signatureAlg,
      signedAt: sspDocuments.signedAt,
      controlsCovered: sspDocuments.controlsCovered,
      controlsMet: sspDocuments.controlsMet,
      controlsNotMet: sspDocuments.controlsNotMet,
      controlsNa: sspDocuments.controlsNa,
      controlsMetViaEvidence: sspDocuments.controlsMetViaEvidence,
      controlsMetViaEsp: sspDocuments.controlsMetViaEsp,
      controlsMetViaEnduringException: sspDocuments.controlsMetViaEnduringException,
      controlsMetViaDodCio: sspDocuments.controlsMetViaDodCio,
      controlsMetViaOpPlan: sspDocuments.controlsMetViaOpPlan,
    })
    .from(sspDocuments)
    .where(eq(sspDocuments.organizationId, orgId))
    .orderBy(desc(sspDocuments.versionNumber));

  // Sign-off counts per version.
  const signoffs = await db
    .select({
      sspDocumentId: sspSignoffs.sspDocumentId,
      signoffKind: sspSignoffs.signoffKind,
      signerDisplayName: sspSignoffs.signerDisplayName,
      signedAt: sspSignoffs.signedAt,
    })
    .from(sspSignoffs)
    .where(eq(sspSignoffs.organizationId, orgId));
  const signoffsByDoc = new Map<string, typeof signoffs>();
  for (const s of signoffs) {
    if (!s.sspDocumentId) continue;
    const arr = signoffsByDoc.get(s.sspDocumentId) ?? [];
    arr.push(s);
    signoffsByDoc.set(s.sspDocumentId, arr);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            CA.L2-3.12.4 — System Security Plan
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
            System Security Plan — {org?.name ?? org?.slug ?? "Your organization"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            One row per generated SSP version. Each version carries a
            deterministic <code>payload_sha256</code> over the canonical
            JSON and binds every cited evidence row by SHA-256.
            The <em>verify</em> action re-derives current evidence
            hashes and reports per-section drift — the C3PAO walkthrough
            asks "is this signed SSP still defensible against current
            state?" with one click.
          </p>
        </div>
        {isAdmin && <GenerateSspButton />}
      </header>

      {versions.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <FileSignature className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-sm text-gray-700">
            No SSP versions generated yet.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {isAdmin
              ? "Click “Generate new version” above to issue the first draft from current canonical state."
              : "Ask an Admin to issue the first draft from current canonical state."}
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {versions.map((v) => {
            const signs = signoffsByDoc.get(v.id) ?? [];
            const defensible = v.controlsMet + v.controlsNa;
            return (
              <li
                key={v.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Version {v.versionNumber}
                    </h2>
                    <StatusBadge status={v.status} />
                    <span
                      className="font-mono text-xs text-gray-500"
                      title={`payload_sha256: ${v.payloadSha256}`}
                    >
                      sha256:{v.payloadSha256.slice(0, 12)}…
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Generated {new Date(v.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Stat label="MET" value={v.controlsMet} tone="emerald" />
                  <Stat label="NOT MET" value={v.controlsNotMet} tone="rose" />
                  <Stat label="N/A" value={v.controlsNa} tone="gray" />
                  <Stat label="Defensible" value={defensible} tone="sky" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600 sm:grid-cols-5">
                  <MetViaPill label="evidence" n={v.controlsMetViaEvidence} />
                  <MetViaPill label="ESP" n={v.controlsMetViaEsp} />
                  <MetViaPill label="enduring" n={v.controlsMetViaEnduringException} />
                  <MetViaPill label="DoD CIO" n={v.controlsMetViaDodCio} />
                  <MetViaPill label="op plan" n={v.controlsMetViaOpPlan} />
                </div>

                {v.status === "signed" && (
                  <div className="mt-4 border-t border-gray-100 pt-3 text-xs">
                    <span className="font-medium text-gray-700">Signed:</span>{" "}
                    <span className="text-gray-600">
                      {v.signedAt
                        ? new Date(v.signedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC"
                        : "—"}
                      {" · "}
                      alg <code className="rounded bg-gray-100 px-1">{v.signatureAlg}</code>
                    </span>
                  </div>
                )}

                {signs.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-700">Sign-offs</p>
                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                      {signs.map((s, i) => (
                        <li key={i}>
                          <span className="font-medium">{s.signoffKind.replace(/_/g, " ")}</span>{" — "}
                          {s.signerDisplayName} ·{" "}
                          {s.signedAt ? new Date(s.signedAt).toISOString().slice(0, 10) : "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs">
                  <a
                    href={`/api/ssp/${v.id}/pdf`}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-700"
                  >
                    Download PDF
                  </a>
                  <a
                    href={`/api/ssp/${v.id}?format=md`}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2.5 py-1 font-medium text-sky-700 hover:bg-sky-100"
                  >
                    Markdown
                  </a>
                  <a
                    href={`/api/ssp/${v.id}?format=raw`}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    JSON payload
                  </a>
                  <Link
                    href={`/api/ssp/${v.id}/verify`}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Verify against current evidence
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        <Sparkles className="mr-1 inline h-3 w-3" />
        Per CA.L2-3.12.4 [a]–[h] (CMMC L2 Assessment Guide v2.13), the SSP
        is updated annually and on material change. Click <em>verify</em>
        on any signed version to confirm it&rsquo;s still defensible
        against current evidence; if drift is reported, generate a new
        version to supersede.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "signed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "draft"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status === "superseded"
          ? "bg-gray-100 text-gray-600 ring-gray-200"
          : "bg-rose-50 text-rose-700 ring-rose-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${cls}`}
    >
      {status}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "gray" | "sky";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40 text-emerald-900"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/40 text-rose-900"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50/40 text-sky-900"
          : "border-gray-200 bg-gray-50/40 text-gray-700";
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

function MetViaPill({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5">
      <span className="font-medium text-gray-700">{n}</span>
      <span className="opacity-70">via {label}</span>
    </span>
  );
}
