"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Sparkles,
  Info,
  X,
  Check,
  Download,
} from "lucide-react";
import type {
  ThreatScenario,
  Likelihood,
  Impact,
  TreatmentStrategy,
} from "../threat-scenarios";

type Category = ThreatScenario["category"];

type AdjustmentTrace = {
  signal: string;
  effect: "lower_likelihood" | "raise_likelihood" | "raise_impact" | "lower_impact" | "control_added";
  reason: string;
};

type ScenarioSuggestion = {
  scenarioId: string;
  likelihood: Likelihood;
  impact: Impact;
  existingControls: string[];
  trace: AdjustmentTrace[];
};

type PostureSnapshot = {
  boundaryName: string;
  implementedControlCount: number;
  atRiskControlCount: number;
  signedAttestations: { label: string; signedAt: string; controlIds: string[] }[];
  cadenceByName: Record<
    string,
    { source: string; lastSeenAt: string | null; daysSinceLast: number | null; status: "green" | "amber" | "red" | "never" }
  >;
  vulnerability: { openCritical: number; openHigh: number; resolved: number; totalEntries: number };
};

type AiDraft = {
  section: "risk_statement" | "treatment_notes";
  proposed: string;
  loading: boolean;
  error?: string;
};

type Selection = {
  scenarioId: string;
  riskStatement: string;
  likelihood: Likelihood;
  impact: Impact;
  existingControls: string;
  treatment: TreatmentStrategy;
  owner: string;
  targetDate: string;
  notes: string;
  trace: AdjustmentTrace[];
};

type Props = {
  orgName: string;
  boundaryId: string;
  boundaryName: string;
  registerId: string;
  existingEntryCount: number;
  existingFinalCount: number;
  scenarios: ThreatScenario[];
  categories: { id: Category; label: string }[];
};

const STEPS = ["Scope", "Threats", "Treatment", "Approve"] as const;
type Step = (typeof STEPS)[number];

const LIKELIHOOD_OPTIONS: Likelihood[] = ["rare", "unlikely", "possible", "likely", "almost_certain"];
const IMPACT_OPTIONS: Impact[] = ["low", "moderate", "high", "critical"];
const TREATMENT_OPTIONS: TreatmentStrategy[] = ["mitigate", "accept", "transfer", "avoid"];

const RISK_MATRIX: Record<Likelihood, Record<Impact, "low" | "moderate" | "high" | "critical">> = {
  rare: { low: "low", moderate: "low", high: "moderate", critical: "high" },
  unlikely: { low: "low", moderate: "moderate", high: "high", critical: "high" },
  possible: { low: "moderate", moderate: "moderate", high: "high", critical: "critical" },
  likely: { low: "moderate", moderate: "high", high: "critical", critical: "critical" },
  almost_certain: { low: "high", moderate: "high", high: "critical", critical: "critical" },
};

function inherentRisk(l: Likelihood, i: Impact) {
  return RISK_MATRIX[l][i];
}

function riskTone(level: "low" | "moderate" | "high" | "critical") {
  return {
    low: "bg-emerald-100 text-emerald-800",
    moderate: "bg-amber-100 text-amber-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  }[level];
}

export default function RiskWizardClient({
  orgName,
  boundaryId,
  boundaryName,
  registerId,
  existingEntryCount,
  existingFinalCount,
  scenarios,
  categories,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("Scope");

  const today = new Date().toISOString().slice(0, 10);
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [scopeStatement, setScopeStatement] = useState(
    `Annual risk assessment for ${orgName}'s CUI vault boundary "${boundaryName}", per NIST SP 800-30 Rev 1. Scope covers the in-scope hosts, identities, network paths, and data flows handling Controlled Unclassified Information.`,
  );
  const [reviewPeriodStart, setReviewPeriodStart] = useState(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [reviewPeriodEnd, setReviewPeriodEnd] = useState(today);
  const [assessor, setAssessor] = useState("");
  const [methodology, setMethodology] = useState("NIST SP 800-30 Rev 1");

  const [selections, setSelections] = useState<Map<string, Selection>>(new Map());
  const [posture, setPosture] = useState<PostureSnapshot | null>(null);
  const [postureLoading, setPostureLoading] = useState(true);
  const [postureError, setPostureError] = useState<string | null>(null);
  const [suggestionsById, setSuggestionsById] = useState<Map<string, ScenarioSuggestion>>(new Map());
  const [aiDrafts, setAiDrafts] = useState<Map<string, AiDraft>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/risk-assessment/posture");
        const json = (await res.json()) as
          | { posture: PostureSnapshot; suggestions: ScenarioSuggestion[] }
          | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in json) {
          setPostureError("error" in json ? json.error : "Failed to load posture");
          return;
        }
        setPosture(json.posture);
        const map = new Map<string, ScenarioSuggestion>();
        for (const s of json.suggestions) map.set(s.scenarioId, s);
        setSuggestionsById(map);
      } catch (err) {
        if (!cancelled) setPostureError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setPostureLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [preparer, setPreparer] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [approver, setApprover] = useState("");
  const [signOffDate, setSignOffDate] = useState(today);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ inserted: number; assessmentId: string } | null>(null);

  const scenariosByCategory = useMemo(() => {
    const map = new Map<Category, ThreatScenario[]>();
    for (const s of scenarios) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return map;
  }, [scenarios]);

  function toggleScenario(s: ThreatScenario) {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(s.id)) {
        next.delete(s.id);
      } else {
        const adj = suggestionsById.get(s.id);
        next.set(s.id, {
          scenarioId: s.id,
          riskStatement: s.riskStatement,
          likelihood: adj?.likelihood ?? s.suggestedLikelihood,
          impact: adj?.impact ?? s.suggestedImpact,
          existingControls: (adj?.existingControls ?? s.existingControls).join("\n"),
          treatment: s.suggestedTreatment,
          owner: "",
          targetDate: oneYearFromNow,
          notes: "",
          trace: adj?.trace ?? [],
        });
      }
      return next;
    });
  }

  async function requestAiRewrite(scenarioId: string, section: "risk_statement" | "treatment_notes") {
    const sel = selections.get(scenarioId);
    if (!sel) return;
    setAiDrafts((prev) => {
      const next = new Map(prev);
      next.set(scenarioId, { section, proposed: "", loading: true });
      return next;
    });
    try {
      const res = await fetch("/api/risk-assessment/ai-rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          section,
          currentDraft: section === "risk_statement" ? sel.riskStatement : sel.notes,
          treatment: section === "treatment_notes" ? sel.treatment : undefined,
        }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      setAiDrafts((prev) => {
        const next = new Map(prev);
        if (!res.ok || !json.text) {
          next.set(scenarioId, {
            section,
            proposed: "",
            loading: false,
            error: json.error ?? "AI rewrite failed",
          });
        } else {
          next.set(scenarioId, { section, proposed: json.text, loading: false });
        }
        return next;
      });
    } catch (err) {
      setAiDrafts((prev) => {
        const next = new Map(prev);
        next.set(scenarioId, {
          section,
          proposed: "",
          loading: false,
          error: err instanceof Error ? err.message : "Network error",
        });
        return next;
      });
    }
  }

  function acceptAiDraft(scenarioId: string) {
    const draft = aiDrafts.get(scenarioId);
    if (!draft || !draft.proposed) return;
    if (draft.section === "risk_statement") {
      updateSelection(scenarioId, { riskStatement: draft.proposed });
    } else {
      updateSelection(scenarioId, { notes: draft.proposed });
    }
    discardAiDraft(scenarioId);
  }

  function discardAiDraft(scenarioId: string) {
    setAiDrafts((prev) => {
      const next = new Map(prev);
      next.delete(scenarioId);
      return next;
    });
  }

  function updateSelection(id: string, patch: Partial<Selection>) {
    setSelections((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (!cur) return prev;
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }

  // Step gate logic
  const scopeReady =
    scopeStatement.trim().length > 20 &&
    assessor.trim().length > 1 &&
    reviewPeriodStart &&
    reviewPeriodEnd;
  const threatsReady = selections.size > 0;
  const treatmentReady = useMemo(() => {
    for (const sel of selections.values()) {
      if (sel.owner.trim().length < 2) return false;
      if (sel.treatment !== "accept" && !sel.targetDate) return false;
    }
    return true;
  }, [selections]);
  const approveReady =
    preparer.trim().length > 1 && approver.trim().length > 1 && signOffDate;

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        registerId,
        boundaryId,
        scope: {
          statement: scopeStatement.trim(),
          reviewPeriodStart,
          reviewPeriodEnd,
          assessor: assessor.trim(),
          methodology: methodology.trim() || "NIST SP 800-30 Rev 1",
        },
        risks: Array.from(selections.values()).map((sel) => ({
          scenarioId: sel.scenarioId,
          riskStatement: sel.riskStatement.trim(),
          likelihood: sel.likelihood,
          impact: sel.impact,
          existingControls: sel.existingControls
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          treatment: sel.treatment,
          owner: sel.owner.trim(),
          targetDate: sel.treatment === "accept" ? null : sel.targetDate,
          notes: sel.notes.trim() || null,
        })),
        signoff: {
          preparer: preparer.trim(),
          reviewer: reviewer.trim() || null,
          approver: approver.trim(),
          signOffDate,
        },
      };

      const res = await fetch("/api/risk-assessment/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { inserted?: number; assessmentId?: string; error?: string };
      if (!res.ok) {
        setSubmitError(json.error ?? "Submission failed");
        return;
      }
      setSubmitResult({ inserted: json.inserted ?? 0, assessmentId: json.assessmentId ?? "" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitResult) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden />
        </div>
        <h2 className="mt-4 text-xl font-bold text-emerald-900">Risk assessment submitted</h2>
        <p className="mt-2 text-sm text-emerald-800">
          {submitResult.inserted} risk {submitResult.inserted === 1 ? "entry" : "entries"} written
          to the live risk_register. Approved sign-off recorded.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {submitResult.assessmentId && (
            <a
              href={`/api/risk-assessment/bundle/${submitResult.assessmentId}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" /> Download evidence bundle
            </a>
          )}
          <Link
            href={`/dashboard/evidence-engine/registers/${registerId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
          >
            Open risk_register <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/dashboard/readiness/risk-assessment"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
          >
            Back to Risk Assessment
          </Link>
        </div>
        {submitResult.assessmentId && (
          <p className="mt-3 text-[11px] text-emerald-800">
            Bundle includes a PDF cover sheet, risks.csv/json, posture snapshot,
            and a SHA-256 fingerprint.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* ── Step indicator ───────────────────────────────────────── */}
      <ol className="flex items-center gap-2 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {STEPS.map((s, idx) => {
          const isActive = s === step;
          const stepIndex = STEPS.indexOf(step);
          const isComplete = idx < stepIndex;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isActive
                    ? "bg-[var(--color-blue-accent)] text-white"
                    : isComplete
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-[var(--color-gray-100)] text-[var(--color-gray-600)]"
                }`}
              >
                {isComplete ? <CheckCircle2 className="h-3 w-3" /> : idx + 1}
              </span>
              <span
                className={`text-xs font-medium ${
                  isActive ? "text-[var(--color-navy-primary)]" : "text-[var(--color-gray-600)]"
                }`}
              >
                {s}
              </span>
              {idx < STEPS.length - 1 && (
                <ArrowRight className="h-3 w-3 text-[var(--color-gray-400)]" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* ── Step content ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        {step === "Scope" && (
          <ScopeStep
            scopeStatement={scopeStatement}
            setScopeStatement={setScopeStatement}
            reviewPeriodStart={reviewPeriodStart}
            setReviewPeriodStart={setReviewPeriodStart}
            reviewPeriodEnd={reviewPeriodEnd}
            setReviewPeriodEnd={setReviewPeriodEnd}
            assessor={assessor}
            setAssessor={setAssessor}
            methodology={methodology}
            setMethodology={setMethodology}
            existingEntryCount={existingEntryCount}
            existingFinalCount={existingFinalCount}
          />
        )}

        {step === "Threats" && (
          <ThreatsStep
            scenariosByCategory={scenariosByCategory}
            categories={categories}
            selections={selections}
            toggleScenario={toggleScenario}
            updateSelection={updateSelection}
            posture={posture}
            postureLoading={postureLoading}
            postureError={postureError}
            suggestionsById={suggestionsById}
            aiDrafts={aiDrafts}
            requestAiRewrite={requestAiRewrite}
            acceptAiDraft={acceptAiDraft}
            discardAiDraft={discardAiDraft}
          />
        )}

        {step === "Treatment" && (
          <TreatmentStep
            selections={selections}
            updateSelection={updateSelection}
            aiDrafts={aiDrafts}
            requestAiRewrite={requestAiRewrite}
            acceptAiDraft={acceptAiDraft}
            discardAiDraft={discardAiDraft}
          />
        )}

        {step === "Approve" && (
          <ApproveStep
            scopeStatement={scopeStatement}
            assessor={assessor}
            reviewPeriodStart={reviewPeriodStart}
            reviewPeriodEnd={reviewPeriodEnd}
            selections={selections}
            preparer={preparer}
            setPreparer={setPreparer}
            reviewer={reviewer}
            setReviewer={setReviewer}
            approver={approver}
            setApprover={setApprover}
            signOffDate={signOffDate}
            setSignOffDate={setSignOffDate}
          />
        )}
      </div>

      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      {/* ── Step nav ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={step === "Scope"}
          onClick={() => {
            const idx = STEPS.indexOf(step);
            if (idx > 0) setStep(STEPS[idx - 1]);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        {step === "Approve" ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !approveReady || !threatsReady || !treatmentReady}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Submit assessment
          </button>
        ) : (
          <button
            type="button"
            disabled={
              (step === "Scope" && !scopeReady) ||
              (step === "Threats" && !threatsReady) ||
              (step === "Treatment" && !treatmentReady)
            }
            onClick={() => {
              const idx = STEPS.indexOf(step);
              if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1: Scope
// ─────────────────────────────────────────────────────────────────────
function ScopeStep(props: {
  scopeStatement: string;
  setScopeStatement: (s: string) => void;
  reviewPeriodStart: string;
  setReviewPeriodStart: (s: string) => void;
  reviewPeriodEnd: string;
  setReviewPeriodEnd: (s: string) => void;
  assessor: string;
  setAssessor: (s: string) => void;
  methodology: string;
  setMethodology: (s: string) => void;
  existingEntryCount: number;
  existingFinalCount: number;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-navy-primary)]">1. Scope &amp; Methodology</h2>
        <p className="mt-1 text-xs text-[var(--color-gray-600)]">
          Define what this assessment covers. The pre-filled scope statement targets the
          CUI Vault boundary; edit if your assessment is narrower or broader.
        </p>
      </div>

      <Field label="Scope statement" required>
        <textarea
          value={props.scopeStatement}
          onChange={(e) => props.setScopeStatement(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          required
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Review period start" required>
          <input
            type="date"
            value={props.reviewPeriodStart}
            onChange={(e) => props.setReviewPeriodStart(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
        <Field label="Review period end" required>
          <input
            type="date"
            value={props.reviewPeriodEnd}
            onChange={(e) => props.setReviewPeriodEnd(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Designated assessor" required hint="The person performing the assessment.">
          <input
            type="text"
            value={props.assessor}
            onChange={(e) => props.setAssessor(e.target.value)}
            placeholder="e.g. Jane Smith, ISSO"
            className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
        <Field label="Methodology" hint="Reference framework guiding the assessment.">
          <input
            type="text"
            value={props.methodology}
            onChange={(e) => props.setMethodology(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {props.existingEntryCount > 0 && (
        <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-3 text-xs text-[var(--color-gray-600)]">
          Note: the live risk_register already has{" "}
          <strong>{props.existingEntryCount}</strong> entries (
          {props.existingFinalCount} final). New risks identified by this
          assessment will be added — they will not replace existing entries.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2: Threats
// ─────────────────────────────────────────────────────────────────────
function ThreatsStep(props: {
  scenariosByCategory: Map<Category, ThreatScenario[]>;
  categories: { id: Category; label: string }[];
  selections: Map<string, Selection>;
  toggleScenario: (s: ThreatScenario) => void;
  updateSelection: (id: string, patch: Partial<Selection>) => void;
  posture: PostureSnapshot | null;
  postureLoading: boolean;
  postureError: string | null;
  suggestionsById: Map<string, ScenarioSuggestion>;
  aiDrafts: Map<string, AiDraft>;
  requestAiRewrite: (scenarioId: string, section: "risk_statement" | "treatment_notes") => void;
  acceptAiDraft: (scenarioId: string) => void;
  discardAiDraft: (scenarioId: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-navy-primary)]">
            2. Identify Applicable Threat Scenarios
          </h2>
          <p className="mt-1 text-xs text-[var(--color-gray-600)]">
            Select scenarios that apply to your environment. Each selection becomes a
            risk register entry. Suggested scoring is adjusted from your real posture
            (signed attestations, cadence health, open CVEs); click "Why this score?"
            to see the trace.
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
          {props.selections.size} selected
        </span>
      </div>

      <PostureBanner posture={props.posture} loading={props.postureLoading} error={props.postureError} />

      {props.categories.map((cat) => {
        const list = props.scenariosByCategory.get(cat.id) ?? [];
        if (list.length === 0) return null;
        return (
          <details key={cat.id} open className="rounded-md border border-[var(--color-border-muted)]">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-600)] hover:bg-[var(--color-gray-50)]">
              {cat.label}
              <span className="ml-2 text-[10px] font-normal text-[var(--color-gray-500)]">
                ({list.filter((s) => props.selections.has(s.id)).length} of {list.length} selected)
              </span>
            </summary>
            <div className="divide-y divide-[var(--color-border-muted)]">
              {list.map((s) => {
                const sel = props.selections.get(s.id);
                const checked = !!sel;
                const adj = props.suggestionsById.get(s.id);
                const headerL = adj?.likelihood ?? s.suggestedLikelihood;
                const headerI = adj?.impact ?? s.suggestedImpact;
                const adjusted =
                  adj &&
                  (adj.likelihood !== s.suggestedLikelihood ||
                    adj.impact !== s.suggestedImpact ||
                    adj.trace.length > 0);
                const draft = sel ? props.aiDrafts.get(s.id) : undefined;
                const draftForRiskStmt =
                  draft?.section === "risk_statement" ? draft : undefined;
                return (
                  <div key={s.id} className="px-3 py-3">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => props.toggleScenario(s)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--color-navy-primary)]">
                            {s.title}
                          </span>
                          <span className="rounded bg-[var(--color-gray-100)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-gray-700)]">
                            {s.id}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${riskTone(
                              inherentRisk(headerL, headerI),
                            )}`}
                          >
                            {adjusted ? "posture-adjusted" : "suggested"}: {headerL} × {headerI}
                          </span>
                          {adjusted && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                              <Sparkles className="h-2.5 w-2.5" /> evidence-driven
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-gray-600)]">
                          {s.riskStatement}
                        </p>
                        {s.applicableControls.length > 0 && (
                          <p className="mt-1 text-[10px] text-[var(--color-gray-500)]">
                            Controls: {s.applicableControls.join(", ")}
                          </p>
                        )}
                      </div>
                    </label>

                    {sel && (
                      <div className="mt-3 ml-6 space-y-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/40 p-3">
                        {sel.trace.length > 0 && <WhyTraceReveal trace={sel.trace} />}
                        <Field
                          label="Risk statement (edit if needed)"
                          actions={
                            <button
                              type="button"
                              onClick={() => props.requestAiRewrite(s.id, "risk_statement")}
                              disabled={draftForRiskStmt?.loading}
                              className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-50"
                            >
                              {draftForRiskStmt?.loading ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-2.5 w-2.5" />
                              )}
                              Tailor with AI
                            </button>
                          }
                        >
                          <textarea
                            value={sel.riskStatement}
                            onChange={(e) =>
                              props.updateSelection(s.id, { riskStatement: e.target.value })
                            }
                            rows={2}
                            className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                          />
                        </Field>
                        {draftForRiskStmt && (draftForRiskStmt.proposed || draftForRiskStmt.error) && (
                          <AiDiffCard
                            current={sel.riskStatement}
                            draft={draftForRiskStmt}
                            onAccept={() => props.acceptAiDraft(s.id)}
                            onDiscard={() => props.discardAiDraft(s.id)}
                          />
                        )}
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="Likelihood">
                            <select
                              value={sel.likelihood}
                              onChange={(e) =>
                                props.updateSelection(s.id, {
                                  likelihood: e.target.value as Likelihood,
                                })
                              }
                              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                            >
                              {LIKELIHOOD_OPTIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Impact">
                            <select
                              value={sel.impact}
                              onChange={(e) =>
                                props.updateSelection(s.id, { impact: e.target.value as Impact })
                              }
                              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                            >
                              {IMPACT_OPTIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-[var(--color-gray-500)]">Inherent risk:</span>
                          <span
                            className={`rounded px-2 py-0.5 font-semibold ${riskTone(
                              inherentRisk(sel.likelihood, sel.impact),
                            )}`}
                          >
                            {inherentRisk(sel.likelihood, sel.impact).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      {props.selections.size === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mr-1 inline-block h-3 w-3" />
          Select at least one threat scenario to continue.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3: Treatment
// ─────────────────────────────────────────────────────────────────────
function TreatmentStep(props: {
  selections: Map<string, Selection>;
  updateSelection: (id: string, patch: Partial<Selection>) => void;
  aiDrafts: Map<string, AiDraft>;
  requestAiRewrite: (scenarioId: string, section: "risk_statement" | "treatment_notes") => void;
  acceptAiDraft: (scenarioId: string) => void;
  discardAiDraft: (scenarioId: string) => void;
}) {
  const items = Array.from(props.selections.values());

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-navy-primary)]">
          3. Risk Treatment
        </h2>
        <p className="mt-1 text-xs text-[var(--color-gray-600)]">
          For each identified risk, document existing controls, choose a treatment
          strategy, assign an owner, and set a target date. Mitigate / transfer / avoid
          risks will feed POA&amp;M creation; accepted risks need management sign-off.
        </p>
      </div>

      <div className="space-y-4">
        {items.map((sel) => (
          <div
            key={sel.scenarioId}
            className="rounded-md border border-[var(--color-border)] bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded bg-[var(--color-gray-100)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-gray-700)]">
                {sel.scenarioId}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${riskTone(
                  inherentRisk(sel.likelihood, sel.impact),
                )}`}
              >
                {inherentRisk(sel.likelihood, sel.impact).toUpperCase()} inherent
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--color-gray-700)]">{sel.riskStatement}</p>

            <div className="mt-3 space-y-3">
              <Field label="Existing controls (one per line)">
                <textarea
                  value={sel.existingControls}
                  onChange={(e) =>
                    props.updateSelection(sel.scenarioId, { existingControls: e.target.value })
                  }
                  rows={3}
                  className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Treatment" required>
                  <select
                    value={sel.treatment}
                    onChange={(e) =>
                      props.updateSelection(sel.scenarioId, {
                        treatment: e.target.value as TreatmentStrategy,
                      })
                    }
                    className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                  >
                    {TREATMENT_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Risk owner" required>
                  <input
                    type="text"
                    value={sel.owner}
                    onChange={(e) =>
                      props.updateSelection(sel.scenarioId, { owner: e.target.value })
                    }
                    placeholder="e.g. CISO, ISSO"
                    className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                  />
                </Field>
                <Field
                  label={sel.treatment === "accept" ? "Target date (n/a)" : "Target date"}
                  required={sel.treatment !== "accept"}
                >
                  <input
                    type="date"
                    value={sel.targetDate}
                    onChange={(e) =>
                      props.updateSelection(sel.scenarioId, { targetDate: e.target.value })
                    }
                    disabled={sel.treatment === "accept"}
                    className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs disabled:bg-[var(--color-gray-100)] disabled:opacity-60"
                  />
                </Field>
              </div>

              <Field
                label="Notes (optional)"
                actions={
                  <button
                    type="button"
                    onClick={() => props.requestAiRewrite(sel.scenarioId, "treatment_notes")}
                    disabled={
                      props.aiDrafts.get(sel.scenarioId)?.section === "treatment_notes" &&
                      props.aiDrafts.get(sel.scenarioId)?.loading
                    }
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-50"
                  >
                    {props.aiDrafts.get(sel.scenarioId)?.section === "treatment_notes" &&
                    props.aiDrafts.get(sel.scenarioId)?.loading ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-2.5 w-2.5" />
                    )}
                    Draft with AI
                  </button>
                }
              >
                <textarea
                  value={sel.notes}
                  onChange={(e) =>
                    props.updateSelection(sel.scenarioId, { notes: e.target.value })
                  }
                  rows={2}
                  placeholder="Rationale, dependencies, references…"
                  className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
                />
              </Field>
              {(() => {
                const draft = props.aiDrafts.get(sel.scenarioId);
                if (!draft || draft.section !== "treatment_notes") return null;
                if (!draft.proposed && !draft.error) return null;
                return (
                  <AiDiffCard
                    current={sel.notes}
                    draft={draft}
                    onAccept={() => props.acceptAiDraft(sel.scenarioId)}
                    onDiscard={() => props.discardAiDraft(sel.scenarioId)}
                  />
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4: Approve
// ─────────────────────────────────────────────────────────────────────
function ApproveStep(props: {
  scopeStatement: string;
  assessor: string;
  reviewPeriodStart: string;
  reviewPeriodEnd: string;
  selections: Map<string, Selection>;
  preparer: string;
  setPreparer: (s: string) => void;
  reviewer: string;
  setReviewer: (s: string) => void;
  approver: string;
  setApprover: (s: string) => void;
  signOffDate: string;
  setSignOffDate: (s: string) => void;
}) {
  const items = Array.from(props.selections.values());
  const counts = items.reduce(
    (acc, sel) => {
      const lvl = inherentRisk(sel.likelihood, sel.impact);
      acc[lvl] = (acc[lvl] ?? 0) + 1;
      return acc;
    },
    {} as Record<"low" | "moderate" | "high" | "critical", number>,
  );
  const treatmentCounts = items.reduce(
    (acc, sel) => {
      acc[sel.treatment] = (acc[sel.treatment] ?? 0) + 1;
      return acc;
    },
    {} as Record<TreatmentStrategy, number>,
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-navy-primary)]">4. Review &amp; Approve</h2>
        <p className="mt-1 text-xs text-[var(--color-gray-600)]">
          Review the summary and capture preparer/approver sign-off. On submit, all
          selected risks are written as final entries in the live risk_register.
        </p>
      </div>

      <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Assessment summary
        </p>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-[var(--color-gray-500)]">Assessor</dt>
            <dd className="font-medium text-[var(--color-navy-primary)]">{props.assessor}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-gray-500)]">Review period</dt>
            <dd className="font-medium text-[var(--color-navy-primary)]">
              {props.reviewPeriodStart} → {props.reviewPeriodEnd}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--color-gray-500)]">Scope</dt>
            <dd className="text-[var(--color-gray-700)]">{props.scopeStatement}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-[var(--color-border-muted)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Risks by inherent severity
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {(["critical", "high", "moderate", "low"] as const).map((lvl) => (
              <li key={lvl} className="flex items-center justify-between">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${riskTone(lvl)}`}
                >
                  {lvl}
                </span>
                <span className="font-mono text-[var(--color-gray-700)]">{counts[lvl] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-[var(--color-border-muted)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Treatment breakdown
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {TREATMENT_OPTIONS.map((t) => (
              <li key={t} className="flex items-center justify-between">
                <span>{t}</span>
                <span className="font-mono text-[var(--color-gray-700)]">{treatmentCounts[t] ?? 0}</span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-[var(--color-border-muted)] pt-1">
              <span className="font-semibold">Total</span>
              <span className="font-mono font-semibold text-[var(--color-navy-primary)]">
                {items.length}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-md border border-[var(--color-border)] bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Sign-off
        </p>
        <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
          Signers must be human staff. Don't enter "Claude", "AI", or
          "Codex Agent" — the C3PAO needs accountable human attestation.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Preparer" required>
            <input
              type="text"
              value={props.preparer}
              onChange={(e) => props.setPreparer(e.target.value)}
              placeholder="e.g. Jane Smith, ISSO"
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
            />
          </Field>
          <Field label="Reviewer (optional)">
            <input
              type="text"
              value={props.reviewer}
              onChange={(e) => props.setReviewer(e.target.value)}
              placeholder="e.g. John Doe, CISO"
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
            />
          </Field>
          <Field label="Approver" required>
            <input
              type="text"
              value={props.approver}
              onChange={(e) => props.setApprover(e.target.value)}
              placeholder="e.g. Patrick Caruso, CEO"
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
            />
          </Field>
        </div>
        <div className="mt-3 max-w-xs">
          <Field label="Sign-off date" required>
            <input
              type="date"
              value={props.signOffDate}
              onChange={(e) => props.setSignOffDate(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared form field
// ─────────────────────────────────────────────────────────────────────
function Field({
  label,
  required,
  hint,
  actions,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {actions}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[10px] text-[var(--color-gray-500)]">{hint}</span>}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Posture banner (top of Threats step)
// ─────────────────────────────────────────────────────────────────────
function PostureBanner({
  posture,
  loading,
  error,
}: {
  posture: PostureSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-3 text-xs text-[var(--color-gray-600)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Reading your org's posture from
        signed attestations, cadence health, and the live registers…
      </div>
    );
  }
  if (error || !posture) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="mr-1 inline-block h-3 w-3" />
        Posture unavailable — using static curated suggestions only. {error}
      </div>
    );
  }

  const cadenceList = Object.values(posture.cadenceByName);
  const greenCount = cadenceList.filter((c) => c.status === "green").length;
  const amberCount = cadenceList.filter((c) => c.status === "amber").length;
  const redCount = cadenceList.filter((c) => c.status === "red" || c.status === "never").length;

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-blue-700" />
        <span className="font-semibold text-blue-900">Posture-aware suggestions enabled</span>
        <span className="text-blue-800">
          for boundary <strong>{posture.boundaryName}</strong>.
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <PostureStat
          label="Signed attestations"
          value={posture.signedAttestations.length}
        />
        <PostureStat
          label="Implemented controls"
          value={posture.implementedControlCount}
          subValue={posture.atRiskControlCount > 0 ? `${posture.atRiskControlCount} at-risk` : undefined}
        />
        <PostureStat
          label="Cadence health"
          value={`${greenCount} green`}
          subValue={
            amberCount + redCount > 0
              ? `${amberCount} amber · ${redCount} red`
              : "all sources fresh"
          }
        />
        <PostureStat
          label="Open CVEs"
          value={`${posture.vulnerability.openCritical} critical`}
          subValue={`${posture.vulnerability.openHigh} high · ${posture.vulnerability.resolved} resolved`}
        />
      </div>
      <p className="mt-2 text-[10px] italic text-blue-800">
        Likelihood/impact below has been adjusted from the curated baseline using these
        signals. You can override any value before saving.
      </p>
    </div>
  );
}

function PostureStat({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
  return (
    <div className="rounded border border-blue-100 bg-white px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-700">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-blue-900">{value}</p>
      {subValue && <p className="text-[9px] text-blue-700">{subValue}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Why-this-score reveal (per scenario)
// ─────────────────────────────────────────────────────────────────────
function WhyTraceReveal({ trace }: { trace: AdjustmentTrace[] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-blue-800 hover:underline">
        <Info className="h-2.5 w-2.5" /> Why this score? ({trace.length} signal{trace.length === 1 ? "" : "s"})
      </summary>
      <ul className="mt-1.5 space-y-0.5 rounded border border-blue-100 bg-blue-50/30 p-2 text-[10px]">
        {trace.map((t, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span
              className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                t.effect.startsWith("raise")
                  ? "bg-red-500"
                  : t.effect === "control_added"
                    ? "bg-blue-500"
                    : "bg-emerald-500"
              }`}
            />
            <span className="text-blue-900">
              <span className="font-mono text-[9px] text-blue-700">{t.effect}</span> · {t.reason}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AI diff card — shown when Claude returns a draft
// ─────────────────────────────────────────────────────────────────────
function AiDiffCard({
  current,
  draft,
  onAccept,
  onDiscard,
}: {
  current: string;
  draft: AiDraft;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  if (draft.error) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
        <div className="flex-1">
          <p className="font-semibold">AI tailoring failed</p>
          <p className="mt-0.5">{draft.error}</p>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="shrink-0 rounded p-1 hover:bg-red-100"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-blue-700" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-900">
          AI suggested rewrite
        </span>
        <span className="text-[10px] text-blue-700">claude-haiku-4-5</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Current
          </p>
          <p className="mt-0.5 rounded bg-white p-2 text-[11px] text-[var(--color-gray-700)]">
            {current.trim() || <span className="italic text-[var(--color-gray-400)]">(empty)</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            Proposed
          </p>
          <p className="mt-0.5 rounded border border-blue-200 bg-white p-2 text-[11px] text-blue-900">
            {draft.proposed}
          </p>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
        >
          <X className="h-3 w-3" /> Discard
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex items-center gap-1 rounded bg-[var(--color-blue-accent)] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90"
        >
          <Check className="h-3 w-3" /> Use this
        </button>
      </div>
    </div>
  );
}

