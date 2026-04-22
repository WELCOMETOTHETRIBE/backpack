"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, MinusCircle, ChevronDown, ChevronRight, ArrowRight, EyeOff, Eye } from "lucide-react";
import type {
  ReadinessChecklist as ReadinessChecklistData,
  ReadinessSection,
  ReadinessTask,
  TaskStatus,
} from "@/lib/readiness/types";

export function ReadinessChecklist({ data }: { data: ReadinessChecklistData }) {
  const [outstandingOnly, setOutstandingOnly] = useState(true);

  const visibleSections = useMemo(() => {
    if (!outstandingOnly) return data.sections;
    // Hide sections that are fully complete, and hide completed tasks within
    // surviving sections so the reader only sees what still needs attention.
    return data.sections
      .filter((s) => s.totalCount === 0 || s.doneCount < s.totalCount)
      .map((s) => ({
        ...s,
        tasks: s.tasks.filter((t) => t.status !== "done"),
      }));
  }, [data.sections, outstandingOnly]);

  const hiddenSectionCount = data.sections.length - visibleSections.length;
  const hiddenTaskCount = data.sections.reduce(
    (sum, s) => sum + s.tasks.filter((t) => t.status === "done").length,
    0
  ) - visibleSections.reduce(
    (sum, s) => sum + s.tasks.filter((t) => t.status === "done").length,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <RollupCard rollup={data.rollup} />
      {data.topActions.length > 0 && <TopActions tasks={data.topActions} />}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Readiness tasks by section</h3>
        <button
          type="button"
          onClick={() => setOutstandingOnly((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          title={outstandingOnly ? `Show ${hiddenSectionCount} completed section${hiddenSectionCount === 1 ? "" : "s"} and ${hiddenTaskCount} completed task${hiddenTaskCount === 1 ? "" : "s"}` : "Hide completed"}
        >
          {outstandingOnly ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              Show all{hiddenSectionCount + hiddenTaskCount > 0 ? ` (+${hiddenSectionCount + hiddenTaskCount})` : ""}
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Outstanding only
            </>
          )}
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {visibleSections.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600 mb-2" />
            <p className="text-sm font-semibold text-emerald-900">Every readiness task is complete.</p>
            <button
              type="button"
              onClick={() => setOutstandingOnly(false)}
              className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
            >
              Show completed sections
            </button>
          </div>
        ) : (
          visibleSections.map((s) => (
            <SectionCard key={s.key} section={s} outstandingOnly={outstandingOnly} />
          ))
        )}
      </div>
    </div>
  );
}

function RollupCard({ rollup }: { rollup: ReadinessChecklistData["rollup"] }) {
  const adjudicated =
    rollup.inherited + rollup.notApplicable + rollup.implementedEvidenced;
  const pct = Math.round((adjudicated / rollup.total) * 100);

  const segs = [
    { label: "Inherited", count: rollup.inherited, color: "bg-sky-400" },
    { label: "Not Applicable", count: rollup.notApplicable, color: "bg-indigo-400" },
    { label: "Implemented + evidenced", count: rollup.implementedEvidenced, color: "bg-emerald-500" },
    { label: "Outstanding", count: rollup.outstanding, color: "bg-slate-200" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Path to C3PAO readiness</h2>
          <p className="text-sm text-slate-500 mt-1">
            Every task below moves specific controls toward the 110/110 target.
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold text-slate-900">
            {adjudicated}
            <span className="text-slate-400 font-normal text-xl"> / {rollup.total}</span>
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mt-1">controls adjudicated · {pct}%</div>
        </div>
      </div>

      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full">
        {segs.map((s) => {
          const w = (s.count / rollup.total) * 100;
          if (w <= 0) return null;
          return (
            <div
              key={s.label}
              className={`h-full ${s.color}`}
              style={{ width: `${w}%` }}
              title={`${s.label}: ${s.count}`}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-semibold text-slate-900">{s.count}</span>
          </div>
        ))}
      </div>

      {rollup.readyExceptRegister > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <span className="font-semibold">{rollup.readyExceptRegister} control{rollup.readyExceptRegister === 1 ? " is" : "s are"} ready except for a register.</span>{" "}
          Your OS Collector evidence covers them — the assessor still needs to
          examine the corresponding register(s). Populate them below to flip
          these to <em>implemented</em>.
        </div>
      )}
    </div>
  );
}

function TopActions({ tasks }: { tasks: ReadinessTask[] }) {
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
        Next actions — highest leverage
      </h3>
      <p className="text-xs text-amber-900/70 mt-0.5">
        Three tasks that each unlock the most controls if completed.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {tasks.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className="group flex items-center justify-between rounded-lg border border-amber-200 bg-white px-4 py-3 hover:border-amber-400 hover:shadow-sm transition"
          >
            <div>
              <div className="text-sm font-medium text-slate-900">{t.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {(t.unblocksReady ?? 0) > 0
                  ? `Flips ${t.unblocksReady} ready control${t.unblocksReady === 1 ? "" : "s"} to implemented`
                  : t.satisfiesControls.length > 0
                  ? `Satisfies ${t.satisfiesControls.length} control${t.satisfiesControls.length === 1 ? "" : "s"}`
                  : ""}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-600 group-hover:translate-x-0.5 transition" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ section, outstandingOnly }: { section: ReadinessSection; outstandingOnly?: boolean }) {
  const complete = section.totalCount > 0 && section.doneCount === section.totalCount;
  // When the user asked to see only outstanding work, keep surviving sections
  // open by default so the remaining tasks are immediately scannable.
  const [expanded, setExpanded] = useState(outstandingOnly ? true : !complete);
  const pct = section.totalCount ? Math.round((section.doneCount / section.totalCount) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 truncate">{section.title}</h3>
              {complete && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{section.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="text-sm font-semibold text-slate-900 tabular-nums">
            {section.doneCount} / {section.totalCount}
          </div>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-sky-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {section.tasks.length === 0 ? (
            <li className="px-5 py-4 text-sm text-slate-400">No tasks for this section.</li>
          ) : (
            section.tasks.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </ul>
      )}
    </div>
  );
}

function TaskIcon({ status }: { status: TaskStatus }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "in_progress") return <MinusCircle className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

function TaskRow({ task }: { task: ReadinessTask }) {
  const isDone = task.status === "done";
  const hasUnblocks = !isDone && (task.unblocksReady ?? 0) > 0;
  return (
    <li className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70 transition">
      <TaskIcon status={task.status} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${isDone ? "text-slate-500 line-through" : "text-slate-900 font-medium"}`}>
          {task.label}
        </div>
        {task.description && (
          <div className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</div>
        )}
      </div>
      {hasUnblocks && (
        <span
          title={task.unblocksReadyIds?.join(", ") ?? ""}
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 tabular-nums"
        >
          unblocks {task.unblocksReady}
        </span>
      )}
      {task.satisfiesControls.length > 0 && !hasUnblocks && (
        <span className="text-xs text-slate-400 tabular-nums">
          {task.satisfiesControls.length} ctrl
          {task.satisfiesControls.length === 1 ? "" : "s"}
        </span>
      )}
      {!isDone && (
        <Link
          href={task.href}
          className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700"
        >
          Go <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </li>
  );
}
