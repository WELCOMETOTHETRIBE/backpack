/**
 * Live readiness checklist types — shared between the builder and the UI.
 * See src/lib/readiness/checklist.ts for the builder, and
 * src/app/dashboard/readiness/ReadinessChecklist.tsx for rendering.
 */

export type TaskStatus = "done" | "in_progress" | "not_started" | "not_applicable";

export type ReadinessTask = {
  /** Stable identifier, e.g. "gov.access_control_policy" or "reg.training_completion". */
  id: string;
  label: string;
  description?: string;
  status: TaskStatus;
  /** Where to go to complete the task. */
  href: string;
  /** Control IDs this task contributes toward. Used for rollup priority. */
  satisfiesControls: string[];
  /** Progress indicator for aggregable tasks (e.g. "3/24 users in training register"). */
  progress?: { current: number; total: number };
  /**
   * Number of controls that are technically ready (in_progress + technical
   * evidence present) and would flip to implemented if THIS task were
   * completed. Used for "populate this register to unlock 5 controls" UX.
   */
  unblocksReady?: number;
  /** Control IDs in the unblocksReady set (for tooltip / drill-in). */
  unblocksReadyIds?: string[];
};

export type ReadinessSectionKey =
  | "setup"
  | "governance"
  | "registers"
  | "artifacts"
  | "attestations";

export type ReadinessSection = {
  key: ReadinessSectionKey;
  title: string;
  subtitle: string;
  tasks: ReadinessTask[];
  doneCount: number;
  totalCount: number;
};

export type ReadinessRollup = {
  inherited: number;
  notApplicable: number;
  implementedEvidenced: number;
  outstanding: number;
  total: number; // always 110
  /**
   * Of the outstanding, how many are "ready except for a register" — i.e.
   * in_progress with technical evidence present. Populating one register can
   * often flip several at once; this is the most actionable sub-metric.
   */
  readyExceptRegister: number;
};

export type ReadinessChecklist = {
  sections: ReadinessSection[];
  rollup: ReadinessRollup;
  /** Top 3 highest-leverage not-started tasks across all sections. */
  topActions: ReadinessTask[];
};
