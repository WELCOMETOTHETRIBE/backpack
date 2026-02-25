# Cursor Supplemental Prompt: Unified Evidence Guide Integration

**Objective:** Wire the new unified adjudication + evidence guide data into the `ControlCardV2` component so that every control card shows its plain-English questions, the expected evidence filenames, and an inherited notice where applicable — all sourced from a single new data file.

---

## Step 1 — Create the Data File

Create a new file at `src/lib/compliance/control_evidence_guide.ts`.

This file exports a single record called `CONTROL_EVIDENCE_GUIDE` typed as `Record<string, ControlEvidenceGuideEntry>` where the interface is:

```ts
export interface ControlEvidenceGuideEntry {
  /** Filenames or document names the user should upload or reference as evidence. */
  evidenceExamples: string[];
  /**
   * If this control is satisfied by a cloud provider's FedRAMP authorization,
   * set this to the name of that authorization (e.g., "Azure Government FedRAMP High Authorization (SC-28)").
   * When set, the ControlCard should display an "Inherited" badge instead of the question flow.
   */
  inheritedFrom?: string;
}
```

Populate `CONTROL_EVIDENCE_GUIDE` using the data from the attached file `CMMC_Unified_Guide.md`. The evidence examples for each control are the bullet-pointed items under **Example Evidence** in that file. Inherited controls are those whose evidence example begins with `**Inherited:**`.

Do **not** duplicate the adjudication questions in this file — those already live in `src/lib/compliance/control_adjudication_questions.ts` and should be imported from there.

---

## Step 2 — Update `ControlCardV2.tsx`

Modify `ControlCardV2` to consume the new data file. The changes are:

### 2a — Inherited Badge

Before rendering the adjudication questions, check `CONTROL_EVIDENCE_GUIDE[controlId]?.inheritedFrom`. If it is set:

- **Do not render the question flow at all.**
- Instead, render an indigo/blue `Inherited` badge with the text: `"Satisfied by [inheritedFrom]"`.
- Still render the evidence examples section below the badge (see 2b).

### 2b — Evidence Examples Panel

Below the adjudication questions (or below the inherited badge), render a collapsible panel titled **"Expected Evidence"**. Inside it, render the `evidenceExamples` array as a list. Each item should be styled as a file chip — a small pill with a document icon on the left and the filename as text. The chip should be non-interactive (display only).

If `evidenceExamples` is empty or the control has no entry in `CONTROL_EVIDENCE_GUIDE`, do not render the panel at all.

### 2c — Evidence Upload Shortcut

If a chip's filename ends in `.pdf`, `.docx`, `.xlsx`, or `.zip`, render a small upload icon button on the right side of the chip. Clicking it should open the existing governance document upload flow, pre-filtered to that document's label. This connects the evidence hint directly to the document gating system already in place.

---

## Step 3 — No Other Files Need to Change

The `control_adjudication_questions.ts` file, the `artifact-guide.ts` file, and the `inherited-controls.ts` file are **not** to be modified. This feature is purely additive — a new data file and a UI update to `ControlCardV2`.

---

## Acceptance Criteria

1. Opening any control card shows the expected evidence filenames beneath the questions.
2. Controls with an `inheritedFrom` value (e.g., 3.1.3, 3.1.12, 3.1.13, 3.8.9, 3.13.8, 3.13.16) show the inherited badge and suppress the question flow.
3. Clicking the upload icon on a `.pdf` or `.docx` chip opens the document upload modal pre-filtered to that document label.
4. Controls with no evidence examples (e.g., purely technical controls with only a screenshot requirement) show no evidence panel — the card is unchanged from its current state.
5. No flash of empty state — the evidence panel must be rendered server-side or populated before the card mounts.
