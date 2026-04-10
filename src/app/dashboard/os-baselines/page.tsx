import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaries, osAssets, controlRecords } from "@/db/schema";
import { eq, inArray, count, and } from "drizzle-orm";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  Server,
  Shield,
  Sparkles,
  AlertCircle,
  BarChart3,
  Settings2,
} from "lucide-react";
import { CreateBoundaryButton } from "./CreateBoundaryButton";
import { getScopeComponentLabels } from "./scope-labels";

const TOTAL_CMMC_CONTROLS = 110;

function cloudBadge(cloudProvider: string | null, azureEnvironment: string | null): {
  label: string;
  isMactech: boolean;
} {
  if (cloudProvider === "azure" || cloudProvider === "microsoft") {
    const env = azureEnvironment === "gov" ? "Azure Government" : azureEnvironment === "commercial" ? "Azure Commercial" : "Azure";
    return { label: env, isMactech: false };
  }
  if (cloudProvider === "google") return { label: "Google Cloud", isMactech: false };
  if (!cloudProvider || cloudProvider === "none") return { label: "On-Premises", isMactech: false };
  return { label: cloudProvider, isMactech: false };
}

function isMactechBoundary(b: { scopeComponents: string[] | null; cloudProvider: string | null; azureEnvironment: string | null; name: string }): boolean {
  const hasAzureGov = (b.cloudProvider === "azure" || b.cloudProvider === "microsoft") && b.azureEnvironment === "gov";
  const hasWindowsVm = b.scopeComponents?.includes("windows_server_vm") ?? false;
  const nameHintsMactech = /mactech|cui.?vault/i.test(b.name);
  return hasAzureGov && (hasWindowsVm || nameHintsMactech);
}

export default async function OSBaselinesPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // ── Load boundaries ─────────────────────────────────────────────────────────
  const list = await db.select().from(boundaries).where(eq(boundaries.organizationId, orgId));

  // ── Control adjudication progress ────────────────────────────────────────────
  const records = await db
    .select({ status: controlRecords.implementationStatus })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  const adjudicatedCount = records.filter((r) => r.status === "implemented" || r.status === "in_progress").length;
  const notStarted = TOTAL_CMMC_CONTROLS - records.length;
  const progressPct = Math.round((adjudicatedCount / TOTAL_CMMC_CONTROLS) * 100);

  // ── Asset counts per boundary ─────────────────────────────────────────────────
  let withCounts: Array<{
    id: string;
    name: string;
    description: string | null;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
    scopeComponents: string[] | null;
    cloudProvider: string | null;
    azureEnvironment: string | null;
    assetCount: number;
  }> = list.map((b) => ({ ...b, assetCount: 0 }));

  if (list.length > 0) {
    const boundaryIds = list.map((b) => b.id);
    const assets = await db
      .select({ boundaryId: osAssets.boundaryId })
      .from(osAssets)
      .where(inArray(osAssets.boundaryId, boundaryIds));
    const countByBoundary = new Map<string, number>();
    for (const b of list) countByBoundary.set(b.id, 0);
    for (const a of assets) countByBoundary.set(a.boundaryId, (countByBoundary.get(a.boundaryId) ?? 0) + 1);
    withCounts = list.map((b) => ({ ...b, assetCount: countByBoundary.get(b.id) ?? 0 }));
  }

  const hasBoundary = list.length > 0;
  const primaryBoundary = withCounts[0] ?? null;

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">CUI Enclave</h1>
            <p className="mt-1.5 text-[var(--color-gray-600)]">
              Define what&apos;s in scope, then adjudicate all 110 CMMC Level 2 controls to reach assessor readiness.
            </p>
          </div>
          {hasBoundary && (
            <Link
              href="/dashboard/adjudication"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-blue-accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              <BarChart3 className="h-4 w-4" />
              Adjudicate Controls
            </Link>
          )}
        </div>

        {/* ── Adjudication progress bar (once boundary exists) ─────────────────── */}
        {hasBoundary && (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--color-gray-800)]">
                  Assessor Readiness — {adjudicatedCount} of {TOTAL_CMMC_CONTROLS} controls adjudicated
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                  {records.filter((r) => r.status === "implemented").length} implemented
                  {records.filter((r) => r.status === "in_progress").length > 0 && (
                    <> · {records.filter((r) => r.status === "in_progress").length} in progress</>
                  )}
                  {notStarted > 0 && <> · {notStarted} not started</>}
                </p>
              </div>
              <span className="shrink-0 text-2xl font-bold text-[var(--color-blue-accent)]">{progressPct}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-gray-200)]">
              <div
                className="h-full rounded-full bg-[var(--color-blue-accent)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-end">
              <Link
                href="/dashboard/adjudication"
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
              >
                View all 110 controls
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* ── Empty state — no boundary yet ───────────────────────────────────── */}
        {!hasBoundary && (
          <>
            {/* Step explainer */}
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Getting to assessor readiness</h2>
              <ol className="mt-3 space-y-2 text-sm text-[var(--color-gray-600)]">
                {[
                  "Define your CUI enclave — tell the platform what systems handle CUI.",
                  "Map your 110 controls — inherited from the platform, shared, or customer-owned.",
                  "Adjudicate each control — document implementation narratives, upload evidence.",
                  "Export your SSP and artifacts for your C3PAO assessment.",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-blue-accent)]/10 text-xs font-bold text-[var(--color-blue-accent)]">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>

            {/* MacTech CUI Vault callout */}
            <section className="rounded-xl border-2 border-[var(--color-blue-accent)]/40 bg-[var(--color-blue-accent)]/[0.03] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-blue-accent)]/10">
                  <Sparkles className="h-5 w-5 text-[var(--color-blue-accent)]" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--color-gray-900)]">
                      MacTech Solutions Secure CUI Vault
                    </h2>
                    <span className="rounded-full bg-[var(--color-blue-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Recommended
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                    If you purchased the MacTech CUI Vault — a CMMC-ready Windows Server 2025 enclave on Azure Government — select this path
                    for one-click boundary setup with pre-mapped control allocations.
                  </p>
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {[
                      "Azure Government (FedRAMP High)",
                      "Windows Server 2025 · DISA STIG baseline",
                      "Entra ID + Conditional Access + MFA",
                      "Azure Bastion — no public RDP",
                      "Microsoft Defender for Endpoint",
                      "Azure Monitor + Sentinel",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-[var(--color-gray-700)]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-status-green)]" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <CreateBoundaryButton disabled={false} label="Set up MacTech CUI Vault →" preselect="mactech" />
                  </div>
                </div>
              </div>
            </section>

            {/* Other boundary types */}
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Other enclave types</h2>
              <p className="mt-0.5 text-sm text-[var(--color-gray-500)]">
                Not using the MacTech CUI Vault? Define your own boundary.
              </p>
              <div className="mt-4">
                <CreateBoundaryButton disabled={false} />
              </div>
            </section>
          </>
        )}

        {/* ── Boundary cards (when configured) ─────────────────────────────────── */}
        {hasBoundary && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-gray-800)]">
                {withCounts.length === 1 ? "Your CUI enclave" : `CUI enclaves (${withCounts.length})`}
              </h2>
              {withCounts.length === 0 && <CreateBoundaryButton disabled={false} />}
            </div>

            {withCounts.map((b) => {
              const isMactech = isMactechBoundary(b);
              const cloud = cloudBadge(b.cloudProvider, b.azureEnvironment);
              const scopeLabels = getScopeComponentLabels(b.scopeComponents ?? null);

              return (
                <div
                  key={b.id}
                  className={`rounded-xl border bg-[var(--color-surface)] p-5 shadow-sm ${
                    isMactech
                      ? "border-[var(--color-blue-accent)]/30"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-[var(--color-gray-900)]">{b.name}</h3>
                        {isMactech && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-blue-accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-blue-accent)]">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            MacTech CUI Vault
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-gray-600)]">
                          <Cloud className="h-3 w-3" aria-hidden />
                          {cloud.label}
                        </span>
                      </div>
                      {b.description && (
                        <p className="mt-1 text-sm text-[var(--color-gray-500)]">{b.description}</p>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/os-baselines/boundaries/${b.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)]"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Manage
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {/* Endpoints */}
                    <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]">
                        <Server className="h-3.5 w-3.5" />
                        Endpoints
                      </div>
                      <p className="mt-1 text-xl font-bold text-[var(--color-gray-900)]">{b.assetCount}</p>
                      <Link
                        href={`/dashboard/os-baselines/boundaries/${b.id}`}
                        className="mt-0.5 block text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        {b.assetCount === 0 ? "Add endpoints →" : "Manage →"}
                      </Link>
                    </div>

                    {/* Controls adjudicated */}
                    <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]">
                        <Shield className="h-3.5 w-3.5" />
                        Controls
                      </div>
                      <p className="mt-1 text-xl font-bold text-[var(--color-gray-900)]">
                        {adjudicatedCount}
                        <span className="ml-1 text-sm font-normal text-[var(--color-gray-500)]">/ {TOTAL_CMMC_CONTROLS}</span>
                      </p>
                      <Link
                        href="/dashboard/adjudication"
                        className="mt-0.5 block text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        Adjudicate →
                      </Link>
                    </div>

                    {/* Scope summary */}
                    <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]">
                        <BarChart3 className="h-3.5 w-3.5" />
                        In-scope components
                      </div>
                      {scopeLabels.length > 0 ? (
                        <p className="mt-1 text-xs text-[var(--color-gray-600)] line-clamp-3">
                          {scopeLabels.join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--color-gray-400)]">Not configured</p>
                      )}
                    </div>
                  </div>

                  {/* MacTech inherited controls callout */}
                  {isMactech && (
                    <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[var(--color-blue-accent)]/20 bg-[var(--color-blue-accent)]/[0.04] px-3 py-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-blue-accent)]" aria-hidden />
                      <p className="text-xs text-[var(--color-gray-700)]">
                        <span className="font-medium">MacTech platform controls are pre-mapped.</span>{" "}
                        Azure Government and the MacTech service stack inherit a set of NIST 800-171 controls — reducing your customer-owned adjudication burden.
                        Review your allocation on the{" "}
                        <Link href="/dashboard/boundary" className="font-medium text-[var(--color-blue-accent)] hover:underline">
                          System Boundary
                        </Link>{" "}
                        page.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ── Next steps (once boundary is configured) ─────────────────────────── */}
        {hasBoundary && adjudicatedCount < TOTAL_CMMC_CONTROLS && (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Next steps toward assessor readiness</h2>
            <div className="mt-3 space-y-2">
              {[
                {
                  done: withCounts.some((b) => b.assetCount > 0),
                  label: "Add at least one endpoint to your enclave",
                  href: primaryBoundary ? `/dashboard/os-baselines/boundaries/${primaryBoundary.id}` : undefined,
                  action: "Add endpoint",
                },
                {
                  done: records.some((r) => r.status === "implemented" || r.status === "in_progress"),
                  label: "Start adjudicating controls",
                  href: "/dashboard/adjudication",
                  action: "Go to adjudication",
                },
                {
                  done: false,
                  label: "Complete your System Security Plan (SSP) narrative",
                  href: "/dashboard/os-baselines/scoping",
                  action: "Open SSP scoping",
                },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-status-green)]" aria-hidden />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-[var(--color-gray-400)]" aria-hidden />
                  )}
                  <span className={`flex-1 text-sm ${item.done ? "text-[var(--color-gray-500)] line-through" : "text-[var(--color-gray-700)]"}`}>
                    {item.label}
                  </span>
                  {!item.done && item.href && (
                    <Link
                      href={item.href}
                      className="shrink-0 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                    >
                      {item.action} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
