/**
 * Live readiness checklist types — shared between the builder and the UI.
 * See src/lib/readiness/checklist.ts for the builder, and
 * src/app/dashboard/readiness/ReadinessChecklist.tsx for rendering.
 */

export type TaskStatus = "done" | "in_progress" | "not_started";

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
};

export type ReadinessChecklist = {
  sections: ReadinessSection[];
  rollup: ReadinessRollup;
  /** Top 3 highest-leverage not-started tasks across all sections. */
  topActions: ReadinessTask[];
};
