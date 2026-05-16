"use client";

/**
 * SoD Matrix viewer — read-only mirror of MAC-SOP-235 (CUI Vault).
 *
 * Renders as a tab on the SCTM 3.1.4 detail page. Read-only by design: the
 * matrix is authored in QMS and pinned by Doc Control release. Operators
 * who need to change the matrix re-route through the QMS Doc Control
 * workflow; the page surfaces the released sha256 + version so an
 * assessor can verify they're looking at the signed artifact.
 */
import { useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldOff, Info } from "lucide-react";
import {
  getSodMatrix,
  getCellDisposition,
  getCompensatingControlsFor,
  type CellDisposition,
  type SodRole,
} from "@/lib/compliance/sod-matrix";

const CELL_STYLE: Record<CellDisposition, string> = {
  P: "bg-red-100 text-red-900 ring-1 ring-inset ring-red-300 hover:bg-red-200",
  C: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-200",
  A: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100",
};

const CELL_ICON: Record<CellDisposition, React.ReactNode> = {
  P: <ShieldOff className="h-3 w-3" aria-hidden="true" />,
  C: <ShieldAlert className="h-3 w-3" aria-hidden="true" />,
  A: <ShieldCheck className="h-3 w-3" aria-hidden="true" />,
};

export function SoDMatrixPanel() {
  const sod = getSodMatrix();
  const [selected, setSelected] = useState<{ a: string; b: string } | null>(null);

  const selectedDetail = selected
    ? {
        roleA: sod.roles.find((r) => r.id === selected.a)!,
        roleB: sod.roles.find((r) => r.id === selected.b)!,
        disposition: getCellDisposition(selected.a, selected.b),
        compensating: getCompensatingControlsFor(selected.a, selected.b),
      }
    : null;

  const sourceReleased = sod.source.sha256 !== null && sod.source.releasedAt !== null;

  return (
    <div className="space-y-4">
      {/* Source provenance header — same pattern as SSP version banner */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
              Authoritative source (QMS Doc Control)
            </h3>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-[var(--color-gray-900)]">
                {sod.source.documentNumber}
              </span>
              <span className="text-sm text-[var(--color-gray-700)]">
                {sod.source.documentName}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                v{sod.source.version}
              </span>
              <span
                className={
                  sourceReleased
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                    : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                }
              >
                {sourceReleased ? "Released" : `Draft (${sod.source.docControlStatus})`}
              </span>
            </div>
            {sourceReleased && (
              <p className="mt-1.5 font-mono text-[11px] text-slate-500">
                sha256: {sod.source.sha256?.slice(0, 16)}…
                <span className="ml-3">
                  released: {new Date(sod.source.releasedAt!).toISOString().slice(0, 10)}
                </span>
              </p>
            )}
            {!sourceReleased && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                Matrix is in draft. Release MAC-SOP-235 through Doc Control to pin the
                authoritative sha256 — Trust Codex will auto-seed a sod_matrix_review
                register entry on release.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sod.crossWalks.map((cw) => (
              <span
                key={cw}
                className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                title={`Cross-walk to ${cw}`}
              >
                ↔ {cw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Legend */}
      <section className="flex flex-wrap gap-3 rounded-xl border border-[var(--color-border)] bg-slate-50 p-3 text-xs">
        {(["P", "C", "A"] as CellDisposition[]).map((d) => (
          <div key={d} className="flex items-start gap-2">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${CELL_STYLE[d]}`}
              aria-hidden="true"
            >
              {CELL_ICON[d]}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">
                {d} — {sod.legend[d].label}
              </p>
              <p className="text-slate-600">{sod.legend[d].description}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Matrix grid */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">
          Conflict matrix — click any cell for detail
        </h3>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-1.5"></th>
                {sod.roles.map((r) => (
                  <th
                    key={r.id}
                    className="min-w-[2.75rem] p-1.5 text-[11px] font-semibold text-slate-700"
                    title={r.name}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="font-mono">{r.id}</span>
                      <span className="text-[10px] text-slate-500">{r.code}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sod.roles.map((rowRole) => (
                <tr key={rowRole.id}>
                  <th
                    className="sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-right text-[11px] font-semibold text-slate-700"
                    title={rowRole.name}
                  >
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span className="font-mono">{rowRole.id}</span>
                      <span className="text-[10px] text-slate-500">{rowRole.code}</span>
                    </div>
                  </th>
                  {sod.roles.map((colRole) => {
                    const disp = getCellDisposition(rowRole.id, colRole.id);
                    if (disp === null) {
                      return (
                        <td
                          key={colRole.id}
                          className="h-9 w-11 bg-slate-100 text-center text-slate-400"
                          aria-label="diagonal"
                        >
                          —
                        </td>
                      );
                    }
                    const isSelected =
                      selected &&
                      ((selected.a === rowRole.id && selected.b === colRole.id) ||
                        (selected.a === colRole.id && selected.b === rowRole.id));
                    return (
                      <td key={colRole.id} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => setSelected({ a: rowRole.id, b: colRole.id })}
                          aria-label={`${rowRole.id} × ${colRole.id}: ${sod.legend[disp].label}`}
                          aria-pressed={isSelected ?? false}
                          className={`flex h-8 w-10 items-center justify-center rounded font-mono text-[11px] font-bold transition ${CELL_STYLE[disp]} ${
                            isSelected ? "ring-2 ring-offset-1 ring-[var(--color-primary)]" : ""
                          }`}
                        >
                          {disp}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Selected-cell detail */}
      {selectedDetail && selectedDetail.disposition && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                CELL_STYLE[selectedDetail.disposition]
              }`}
              aria-hidden="true"
            >
              {CELL_ICON[selectedDetail.disposition]}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedDetail.roleA.id} ({selectedDetail.roleA.code}) ×{" "}
                {selectedDetail.roleB.id} ({selectedDetail.roleB.code}) —{" "}
                {sod.legend[selectedDetail.disposition].label}
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                {sod.legend[selectedDetail.disposition].description}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RoleCard role={selectedDetail.roleA} />
            <RoleCard role={selectedDetail.roleB} />
          </div>

          {selectedDetail.disposition === "C" && selectedDetail.compensating && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1.5 flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                Required compensating controls ({selectedDetail.compensating.label})
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                {selectedDetail.compensating.controls.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-700">
                A current quarterly attestation must accompany any identity holding this
                pair. Without it, the detective scan flags the identity as medium-severity.
              </p>
            </div>
          )}

          {selectedDetail.disposition === "P" && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-800 mb-1.5 flex items-center gap-1.5">
                <ShieldOff className="h-3 w-3" />
                Enforcement
              </h4>
              <p className="text-sm text-red-900">
                Trust Codex preventive workflow rejects this combination at provisioning;
                detective scan flags any drift as high-severity (SLA: {sod.failOpenSla.pMinutes} min
                to remediate).
              </p>
            </div>
          )}
        </section>
      )}

      {/* Role catalog */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">
          Role catalog (R1–R10) — AD/Entra mapping & enforcement mechanism
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {sod.roles.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RoleCard({ role }: { role: SodRole }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-sm font-semibold text-slate-900">{role.id}</span>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
          {role.code}
        </span>
        <span className="font-semibold text-slate-800">{role.name}</span>
      </div>
      <p className="mt-1 text-slate-600">{role.summary}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="font-semibold text-slate-500">AD group</dt>
        <dd className="font-mono text-slate-800">{role.adGroup}</dd>
        <dt className="font-semibold text-slate-500">Tier</dt>
        <dd className="text-slate-800">{role.adminTier}</dd>
        <dt className="font-semibold text-slate-500">Enforcement</dt>
        <dd className="text-slate-700">{role.enforcementMechanism}</dd>
      </dl>
    </div>
  );
}
