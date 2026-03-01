import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  PURE_TECHNICAL_IDS,
  HYBRID_TECHNICAL_IDS,
} from "@/lib/compliance/control-bins";
import { Cpu, FolderOpen, Server, Upload, Download } from "lucide-react";

const PURE_TECHNICAL_TOTAL = PURE_TECHNICAL_IDS.length;
const HYBRID_TECHNICAL_TOTAL = HYBRID_TECHNICAL_IDS.length;
const IMPLEMENTED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

export default async function TechnicalDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  const metStatusSet = new Set(IMPLEMENTED_STATUSES);
  const recordByControlId = new Map(records.map((r) => [r.controlId, r.implementationStatus as string]));
  let pureTechnicalDone = 0;
  let hybridTechnicalDone = 0;
  const pureTechnicalNotMet: string[] = [];
  const hybridTechnicalNotMet: string[] = [];
  for (const id of PURE_TECHNICAL_IDS) {
    const status = recordByControlId.get(id);
    if (status && metStatusSet.has(status as (typeof IMPLEMENTED_STATUSES)[number])) {
      pureTechnicalDone++;
    } else {
      pureTechnicalNotMet.push(id);
    }
  }
  for (const id of HYBRID_TECHNICAL_IDS) {
    const status = recordByControlId.get(id);
    if (status && metStatusSet.has(status as (typeof IMPLEMENTED_STATUSES)[number])) {
      hybridTechnicalDone++;
    } else {
      hybridTechnicalNotMet.push(id);
    }
  }

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Technical overview
          </h2>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Pure technical controls ({PURE_TECHNICAL_TOTAL}), hybrid technical-centric controls (
            {HYBRID_TECHNICAL_TOTAL}), evidence runs, and system boundary.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={cardClass}>
            <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
              <Cpu className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">Pure Technical controls</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">
              {pureTechnicalDone}{" "}
              <span className="font-normal text-[var(--color-gray-600)]">
                / {PURE_TECHNICAL_TOTAL}
              </span>
            </p>
            {pureTechnicalNotMet.length > 0 && (
              <p className="mt-1.5 text-sm text-[var(--color-gray-600)]" title="Controls not yet met">
                <span className="font-medium text-[var(--color-gray-700)]">Not met:</span>{" "}
                {pureTechnicalNotMet.length <= 8
                  ? pureTechnicalNotMet.join(", ")
                  : `${pureTechnicalNotMet.slice(0, 5).join(", ")} and ${pureTechnicalNotMet.length - 5} more`}
              </p>
            )}
            <Link
              href="/dashboard/technical/controls?classification=TECHNICAL"
              className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View controls →
            </Link>
          </div>
          <div className={cardClass}>
            <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
              <Cpu className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">Hybrid Technical controls</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">
              {hybridTechnicalDone}{" "}
              <span className="font-normal text-[var(--color-gray-600)]">
                / {HYBRID_TECHNICAL_TOTAL}
              </span>
            </p>
            {hybridTechnicalNotMet.length > 0 && (
              <p className="mt-1.5 text-sm text-[var(--color-gray-600)]" title="Controls not yet met">
                <span className="font-medium text-[var(--color-gray-700)]">Not met:</span>{" "}
                {hybridTechnicalNotMet.length <= 8
                  ? hybridTechnicalNotMet.join(", ")
                  : `${hybridTechnicalNotMet.slice(0, 5).join(", ")} and ${hybridTechnicalNotMet.length - 5} more`}
              </p>
            )}
            <Link
              href="/dashboard/technical/controls?classification=HYBRID_TECHNICAL"
              className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View controls →
            </Link>
          </div>
        </div>

        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard/technical/upload"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Upload className="h-4 w-4" aria-hidden />
              Upload evidence bundle
            </Link>
            <Link
              href="/dashboard/os-baselines"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Server className="h-4 w-4" aria-hidden />
              System Boundary (endpoints)
            </Link>
            <Link
              href="/dashboard/evidence"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" aria-hidden />
              Evidence runs & drift
            </Link>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/dashboard/technical/controls?classification=TECHNICAL"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <Cpu className="h-5 w-5" aria-hidden />
              <span className="font-semibold">Controls</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Adjudicate pure and hybrid technical controls; link to evidence runs and system boundary.
            </p>
          </Link>
          <Link
            href="/dashboard/evidence"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <FolderOpen className="h-5 w-5" aria-hidden />
              <span className="font-semibold">Evidence</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Upload evidence bundles; view Azure and OS runs, drift, and adjudicated control status.
            </p>
          </Link>
          <Link
            href="/dashboard/os-baselines"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <Server className="h-5 w-5" aria-hidden />
              <span className="font-semibold">System Boundary</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Define boundary and endpoints with baseline profiles for evidence scoring.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
