import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { desc, eq } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { db } from "@/db"
import { irExercises, irAars } from "@/db/schema"

export default async function AssessorIrTabletopListPage() {
  const session = await auth()
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined
  const orgId = user?.organizationId
  if (!orgId || user?.role !== "Assessor") redirect("/auth/signin")

  const exercises = await db
    .select({
      id: irExercises.id,
      name: irExercises.name,
      methodology: irExercises.methodology,
      scheduledFor: irExercises.scheduledFor,
      executedAt: irExercises.executedAt,
      status: irExercises.status,
      retentionUntil: irExercises.retentionUntil,
      legalHoldActive: irExercises.legalHoldActive,
      customerName: irExercises.customerName,
    })
    .from(irExercises)
    .where(eq(irExercises.organizationId, orgId))
    .orderBy(desc(irExercises.createdAt))

  // Fetch AAR snapshots for status indicators
  const exerciseIds = exercises.map((e) => e.id)
  const aars =
    exerciseIds.length > 0
      ? await db
          .select({
            exerciseId: irAars.exerciseId,
            draftedAt: irAars.draftedAt,
            approvedAt: irAars.approvedAt,
            finalResult: irAars.finalResult,
          })
          .from(irAars)
      : []
  const aarByExercise = new Map(aars.map((a) => [a.exerciseId, a]))

  const counts = {
    total: exercises.length,
    approved: exercises.filter((e) => e.status === "approved").length,
    pendingApproval: exercises.filter(
      (e) => e.status === "aar_drafted"
    ).length,
    drafts: exercises.filter((e) => e.status === "draft").length,
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            IR Tabletop & AAR Evidence Kit
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            CMMC 2.0 Level 2 IR.L2-3.6.1 / 3.6.2 / 3.6.3 incident response
            tabletop exercises (read-only).
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total exercises" value={counts.total} />
        <Stat label="Approved AARs" value={counts.approved} tone="good" />
        <Stat
          label="Pending approval"
          value={counts.pendingApproval}
          tone={counts.pendingApproval > 0 ? "warn" : "neutral"}
        />
        <Stat label="Drafts" value={counts.drafts} />
      </div>

      {exercises.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <ShieldAlert
            className="mx-auto h-8 w-8 text-gray-400"
            aria-hidden
          />
          <p className="mt-2 text-sm text-gray-600">
            No IR Tabletop exercises have been created for this organization.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Methodology</th>
                <th className="px-4 py-3">Executed</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">AAR result</th>
                <th className="px-4 py-3">Retention until</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {exercises.map((ex) => {
                const aar = aarByExercise.get(ex.id)
                return (
                  <tr key={ex.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {ex.name}
                      <div className="text-xs text-gray-500">
                        {ex.customerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700">
                      {ex.methodology}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {ex.executedAt
                        ? new Date(ex.executedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ex.status} />
                      {ex.legalHoldActive ? (
                        <span className="ml-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          Legal hold
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {aar?.finalResult ? (
                        <span className="capitalize">
                          {aar.finalResult.replace("_", " ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {ex.retentionUntil ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/assessor/ir-tabletop/${ex.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number
  tone?: "good" | "warn" | "neutral"
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-gray-200 bg-white"
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    scheduled: "bg-sky-100 text-sky-800",
    in_progress: "bg-amber-100 text-amber-800",
    executed: "bg-amber-100 text-amber-800",
    aar_drafted: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    archived: "bg-gray-100 text-gray-500",
  }
  const label = status
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ")
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        colors[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {label}
    </span>
  )
}
