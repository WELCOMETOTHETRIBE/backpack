import Link from "next/link"
import { notFound } from "next/navigation"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"

import { requireAssessor } from "@/lib/role-gate"
import { db } from "@/db"
import {
  auditLogs,
  irAars,
  irCorrectiveActions,
  irExerciseBundles,
  irExerciseControls,
  irExerciseParticipants,
  irExercises,
  irFindings,
  irInjectResponses,
  users,
} from "@/db/schema"

interface PageProps {
  params: Promise<{ exerciseId: string }>
}

export default async function AssessorIrTabletopDetailPage({
  params,
}: PageProps) {
  const { exerciseId } = await params
  const { orgId } = await requireAssessor()

  const exercise = (
    await db
      .select()
      .from(irExercises)
      .where(
        and(
          eq(irExercises.id, exerciseId),
          eq(irExercises.organizationId, orgId)
        )
      )
      .limit(1)
  )[0]
  if (!exercise) notFound()

  const [
    participants,
    controlsTested,
    injectResponses,
    aar,
    bundles,
  ] = await Promise.all([
    db
      .select()
      .from(irExerciseParticipants)
      .where(eq(irExerciseParticipants.exerciseId, exerciseId)),
    db
      .select()
      .from(irExerciseControls)
      .where(eq(irExerciseControls.exerciseId, exerciseId)),
    db
      .select()
      .from(irInjectResponses)
      .where(eq(irInjectResponses.exerciseId, exerciseId)),
    db
      .select()
      .from(irAars)
      .where(eq(irAars.exerciseId, exerciseId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select()
      .from(irExerciseBundles)
      .where(eq(irExerciseBundles.exerciseId, exerciseId))
      .orderBy(desc(irExerciseBundles.bundleVersion)),
  ])

  const findings = aar
    ? await db.select().from(irFindings).where(eq(irFindings.aarId, aar.id))
    : []
  const findingIds = findings.map((f) => f.id)
  const cars =
    findingIds.length > 0
      ? await db
          .select()
          .from(irCorrectiveActions)
          .where(inArray(irCorrectiveActions.findingId, findingIds))
      : []
  const carsByFinding = new Map<string, typeof cars>()
  for (const c of cars) {
    const list = carsByFinding.get(c.findingId) ?? []
    list.push(c)
    carsByFinding.set(c.findingId, list)
  }

  // Fetch user labels for drafted/approved/recorded/etc.
  const userIds = Array.from(
    new Set(
      [
        aar?.draftedByUserId,
        aar?.approvedByUserId,
        exercise.facilitatorUserId,
        exercise.approverUserId,
        exercise.createdByUserId,
        ...injectResponses.map((r) => r.recordedByUserId),
      ].filter((x): x is string => !!x)
    )
  )
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : []
  const userById = new Map(userRows.map((u) => [u.id, u]))
  const fmtUser = (id: string | null) => {
    if (!id) return "—"
    const u = userById.get(id)
    if (!u) return id.slice(0, 8) + "…"
    return u.name ?? u.email
  }

  // Audit trail: events directly on the exercise OR with details->exerciseId
  const auditTrail = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, orgId),
        or(
          and(
            eq(auditLogs.resourceType, "ir_exercise"),
            eq(auditLogs.resourceId, exerciseId)
          ),
          sql`${auditLogs.details}->>'exerciseId' = ${exerciseId}`
        )
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(50)

  // C3PAO defensibility checks
  const drafterApproverDistinct =
    !aar ||
    !aar.draftedByUserId ||
    !aar.approvedByUserId ||
    aar.draftedByUserId !== aar.approvedByUserId

  const responsesByKey = new Map(
    injectResponses.map((r) => [r.injectKey, r])
  )

  const scenarioSnapshot = exercise.scenarioSnapshotJson as
    | {
        code: string
        version: number
        title: string
        injectsJson: Array<{
          key: string
          offsetMinutes: number
          prompt: string
          expectedAction: string
          passCriteria: string
          controlIds: string[]
        }>
      }
    | null

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <Link
          href="/assessor/ir-tabletop"
          className="text-sm text-blue-600 hover:underline"
        >
          ← All exercises
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
          {exercise.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {exercise.customerName} · {exercise.systemName}
        </p>
      </header>

      {!drafterApproverDistinct ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <strong>C3PAO ALERT:</strong> AAR drafter and approver are the same
          user. Separation-of-duties requirement IR.L2-3.6.3 not satisfied.
        </div>
      ) : null}

      <Section title="Scope & methodology">
        <Kv label="Scope statement" wide value={exercise.scopeStatement} />
        <Kv label="Methodology" value={exercise.methodology} />
        <Kv
          label="Methodology justification"
          wide
          value={exercise.methodologyJustification}
        />
        <Kv
          label="CUI categories"
          value={exercise.cuiCategories.join(", ") || "—"}
        />
        <Kv label="Boundary id" value={exercise.boundaryId ?? "—"} />
        <Kv label="Environment" value={exercise.environmentDescription} />
        <Kv
          label="Scheduled for"
          value={
            exercise.scheduledFor
              ? new Date(exercise.scheduledFor).toLocaleString()
              : "—"
          }
        />
        <Kv
          label="Executed at"
          value={
            exercise.executedAt
              ? new Date(exercise.executedAt).toLocaleString()
              : "—"
          }
        />
        <Kv
          label="Retention until"
          value={
            exercise.retentionUntil
              ? `${exercise.retentionUntil}${exercise.legalHoldActive ? " (LEGAL HOLD ACTIVE)" : ""}`
              : "—"
          }
        />
        <Kv label="Created by" value={fmtUser(exercise.createdByUserId)} />
      </Section>

      <Section
        title={`Controls tested (${controlsTested.length})`}
      >
        <div className="flex flex-wrap gap-2">
          {controlsTested.map((c) => (
            <span
              key={c.controlId}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                c.isPrimary
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {c.controlId}
              {c.isPrimary ? " (primary)" : ""}
            </span>
          ))}
        </div>
      </Section>

      <Section title={`Participants (${participants.length})`}>
        {participants.length === 0 ? (
          <p className="text-sm text-gray-500">No participants recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Organization</th>
                <th className="py-2">Email</th>
                <th className="py-2">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participants.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 font-medium text-gray-900">{p.name}</td>
                  <td className="py-2 text-gray-700">
                    {p.role.replace("_", " ")}
                  </td>
                  <td className="py-2 text-gray-700">{p.organization}</td>
                  <td className="py-2 text-gray-600">{p.email ?? "—"}</td>
                  <td className="py-2 text-gray-600">
                    {p.attendedAt
                      ? new Date(p.attendedAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Inject timeline (${injectResponses.length} captured)`}>
        {scenarioSnapshot ? (
          <ol className="space-y-3">
            {scenarioSnapshot.injectsJson.map((inj) => {
              const r = responsesByKey.get(inj.key)
              return (
                <li
                  key={inj.key}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-500">
                      T+{inj.offsetMinutes}m · {inj.controlIds.join(", ")}
                    </div>
                    {r ? (
                      <ResponseBadge status={r.status} />
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Not captured
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {inj.prompt}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Expected: {inj.expectedAction}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    Pass criterion: {inj.passCriteria}
                  </div>
                  {r?.actualResponseNotes ? (
                    <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700">
                      {r.actualResponseNotes}
                    </div>
                  ) : null}
                  {r?.decisionTimestamp ? (
                    <div className="mt-1 text-xs text-gray-500">
                      Decision: {new Date(r.decisionTimestamp).toLocaleString()}
                      {r.decisionOffsetMinutes !== null
                        ? ` (T+${r.decisionOffsetMinutes}m)`
                        : ""}
                      {r.recordedByUserId
                        ? ` · recorded by ${fmtUser(r.recordedByUserId)}`
                        : ""}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm text-gray-500">No scenario snapshot.</p>
        )}
      </Section>

      <Section title="After-Action Report">
        {!aar ? (
          <p className="text-sm text-gray-500">AAR not drafted yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Kv label="Drafted by" value={fmtUser(aar.draftedByUserId)} />
              <Kv
                label="Drafted at"
                value={
                  aar.draftedAt
                    ? new Date(aar.draftedAt).toLocaleString()
                    : "—"
                }
              />
              <Kv
                label="Approved by"
                value={fmtUser(aar.approvedByUserId)}
              />
              <Kv
                label="Approved at"
                value={
                  aar.approvedAt
                    ? new Date(aar.approvedAt).toLocaleString()
                    : "Pending approval"
                }
              />
              <Kv
                label="Final result"
                value={
                  aar.finalResult
                    ? aar.finalResult.replace("_", " ").toUpperCase()
                    : "—"
                }
              />
              <Kv
                label="Approval signature"
                value={aar.approvalSignatureRef ?? "—"}
              />
            </div>
            {aar.executiveSummary ? (
              <Block label="Executive summary" body={aar.executiveSummary} />
            ) : null}
            {aar.timelineNarrative ? (
              <Block label="Timeline narrative" body={aar.timelineNarrative} />
            ) : null}
            {aar.strengths ? (
              <Block label="Strengths" body={aar.strengths} />
            ) : null}
            {aar.gaps ? <Block label="Gaps" body={aar.gaps} /> : null}
            {aar.evidenceReviewed ? (
              <Block
                label="Evidence reviewed"
                body={aar.evidenceReviewed}
              />
            ) : null}
          </div>
        )}
      </Section>

      <Section title={`Findings & corrective actions (${findings.length})`}>
        {findings.length === 0 ? (
          <p className="text-sm text-gray-500">No findings recorded.</p>
        ) : (
          <ol className="space-y-3">
            {findings.map((f) => {
              const fcars = carsByFinding.get(f.id) ?? []
              return (
                <li
                  key={f.id}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      {f.severity} · {f.controlId}
                    </div>
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {f.title}
                  </div>
                  <div className="mt-1 text-xs text-gray-700">
                    {f.description}
                  </div>
                  {fcars.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {fcars.map((ca) => (
                        <div
                          key={ca.id}
                          className="rounded bg-gray-50 p-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              CAR
                            </span>
                            <CarStatusBadge status={ca.status} />
                          </div>
                          <div className="mt-1 text-gray-700">
                            {ca.weakness}
                          </div>
                          <div className="mt-0.5 text-gray-500">
                            Control {ca.controlReference}
                            {ca.scheduledCompletionDate
                              ? ` · due ${ca.scheduledCompletionDate}`
                              : ""}
                            {ca.ownerName ? ` · owner ${ca.ownerName}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </Section>

      <Section title={`Archived bundles (${bundles.length})`}>
        {bundles.length === 0 ? (
          <p className="text-sm text-gray-500">
            No bundles archived. Customer may not have generated the package
            yet, or the archive call failed.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="py-2">Version</th>
                <th className="py-2">Generated</th>
                <th className="py-2">Manifest SHA-256</th>
                <th className="py-2">Generated by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bundles.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 font-medium">v{b.bundleVersion}</td>
                  <td className="py-2 text-gray-600">
                    {b.timestampedAt
                      ? new Date(b.timestampedAt).toLocaleString()
                      : new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 font-mono text-xs text-gray-700">
                    {b.manifestSha256.slice(0, 12)}…
                    {b.manifestSha256.slice(-8)}
                  </td>
                  <td className="py-2 text-gray-600">
                    {fmtUser(b.generatedByUserId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Audit trail (last ${auditTrail.length} events)`}>
        {auditTrail.length === 0 ? (
          <p className="text-sm text-gray-500">No audit events recorded.</p>
        ) : (
          <ol className="space-y-1 text-xs">
            {auditTrail.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline gap-3 border-b border-gray-100 pb-1"
              >
                <span className="text-gray-500 tabular-nums">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
                <span className="font-mono font-medium text-gray-900">
                  {a.action}
                </span>
                <span className="text-gray-600">
                  {a.userId ? `· ${fmtUser(a.userId)}` : "· —"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function Kv({
  label,
  value,
  wide,
}: {
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  )
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
        {body}
      </div>
    </div>
  )
}

function ResponseBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pass: "bg-emerald-100 text-emerald-800",
    partial: "bg-amber-100 text-amber-800",
    fail: "bg-red-100 text-red-800",
    not_reached: "bg-gray-100 text-gray-700",
  }
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        colors[status] ?? "bg-gray-100"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  )
}

function CarStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-amber-100 text-amber-800",
    in_progress: "bg-blue-100 text-blue-800",
    blocked: "bg-red-100 text-red-800",
    completed: "bg-emerald-100 text-emerald-800",
    deferred: "bg-gray-100 text-gray-700",
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        colors[status] ?? "bg-gray-100"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  )
}
