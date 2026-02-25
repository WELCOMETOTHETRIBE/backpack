# Cursor Build Prompt: CMMC Onboarding Wizard — Full Redesign v2

## Context: The Persona and the Goal

This entire build is for **Brenda**, the non-technical office manager tasked with CMMC. The goal is to transform the onboarding wizard from a technical data entry form into a guided interview that a non-expert can complete with confidence. The platform asks plain-English questions about the business, and translates the answers into an auditor-defensible compliance posture.

This prompt has three parts. Build them in order.

---

## Part I: The Boundary Scoping Interview & SVG Diagram

This replaces the current `BoundaryProfileSelector.tsx` with a new, more intelligent interview process.

### 1. New Component: `src/components/onboarding/BoundaryScopingInterview.tsx`

Create this new component. It will be a multi-step modal that asks a series of questions. Use a simple state machine (`useState` with a step counter) to manage the flow.

**The Interview Questions & Mapping Logic:**

Implement the following questions. The user's selections will be mapped to the `boundaryProfile` technology keys.

| Step | Question | Options | Maps to Key(s) |
| :--- | :--- | :--- | :--- |
| 1 | Where do your employees typically work? | In our company office, Remotely (from home), Both | `on_prem_network` (if office), `remote_workforce` (if remote) |
| 2 | How do you store and share files for work? | Microsoft 365 (SharePoint, OneDrive), Google Workspace (Drive), A server in our office, Other cloud storage | `m365`, `google_workspace`, `on_prem_ad`, `other_cloud` |
| 3 | How do you manage user accounts and passwords? | Microsoft accounts (Entra ID), Google accounts, A server in our office (Active Directory), Okta | `entra_id`, `google_workspace`, `on_prem_ad`, `okta` |
| 4 | What kind of computers do employees use? | Windows, Macs, Both | `windows_workstation`, `macos` |
| 5 | Do you use any of these for security? | Microsoft Defender, CrowdStrike, SentinelOne, Microsoft Intune, JAMF, Tenable/Nessus, Splunk | `defender`, `crowdstrike`, `sentinelone`, `intune`, `jamf`, `tenable`, `splunk` |
| 6 | Do you use a cloud provider for servers or applications? | Microsoft Azure, Azure Government, Amazon Web Services (AWS), Google Cloud (GCP) | `azure_commercial`, `azure_gov`, `aws`, `gcp` |

### 2. New API Route: `POST /api/boundary/profile-from-interview`

Create this route. It receives the raw interview answers, applies the mapping logic from the table above to create a `string[]` of technology keys, and saves this array to the `organization.boundaryProfile` field in the database.

### 3. New API Route: `GET /api/boundary/diagram`

Create this route. It should:
1.  Fetch the current user's `organization.boundaryProfile`.
2.  Call a new function, `generateMermaidSource(profile: string[]): string`, that you will create in `src/lib/compliance/diagram-generator.ts`.
3.  This function will contain the logic to generate a Mermaid graph definition based on the technologies in the profile. Start with a simple implementation:
    -   Create a `subgraph "CUI Boundary"`.
    -   For each technology in the profile, add a node inside the subgraph (e.g., `M365[Microsoft 365]`).
    -   Add a `User` node outside the boundary.
    -   Draw a simple edge: `User --> CUI_Boundary`.
4.  The API route will then use the `manus-render-diagram` shell command to convert the Mermaid source to an SVG string. You will need to write the Mermaid source to a temporary file first (e.g., `/tmp/diagram.mmd`).
    ```typescript
    // Example of using the shell command in the API route
    import { exec } from 'child_process';
    import { writeFile, readFile } from 'fs/promises';

    // ... inside the route handler
    const mermaidSource = generateMermaidSource(profile);
    await writeFile('/tmp/diagram.mmd', mermaidSource);

    const svg = await new Promise<string>((resolve, reject) => {
      exec('manus-render-diagram /tmp/diagram.mmd /tmp/diagram.svg', (err) => {
        if (err) return reject(err);
        resolve(readFile('/tmp/diagram.svg', 'utf-8'));
      });
    });

    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
    ```

### 4. New Component: `src/components/onboarding/BoundaryDiagram.tsx`

Create this component. It will make a request to `/api/boundary/diagram`, receive the SVG string, and render it using `dangerouslySetInnerHTML`.

### 5. Update `OnboardingWizard.tsx`

Replace the `BoundaryProfileSelector` step with the new `BoundaryScopingInterview` component. After the interview is complete, show a new step that displays the `BoundaryDiagram` component with the headline: "Here is what your CUI boundary looks like based on your answers."

---

## Part II: Question-Driven Control Adjudication

This redesigns the `ControlCardV2` to be a guided interview rather than a form.

### 1. New Data File: `src/lib/compliance/control_adjudication_questions.ts`

Create this new file. It will export a constant, `CONTROL_ADJUDICATION_QUESTIONS`, which is a map where keys are control IDs and values are an array of question objects.

**Schema:**
```typescript
interface AdjudicationQuestion {
  id: string;
  text: string; // The plain-English question
  isKeyQuestion: boolean; // If true, answering "No" marks the control as not_implemented
}

export const CONTROL_ADJUDICATION_QUESTIONS: Record<string, AdjudicationQuestion[]> = {
  // ...
};
```

**Populate with initial data (examples):**

-   **`3.1.1`**: `[{ id: 'q1', text: 'Do you have a process to limit system access to only authorized users?', isKeyQuestion: true }]`
-   **`3.1.5`**: `[{ id: 'q1', text: 'Do you ensure users only have the minimum access they need to do their jobs?', isKeyQuestion: true }, { id: 'q2', text: 'Do you review these access rights regularly?', isKeyQuestion: false }]`
-   **`3.5.3`**: `[{ id: 'q1', text: 'Do you use antivirus software on all computers?', isKeyQuestion: true }, { id: 'q2', text: 'Is the antivirus software updated automatically?', isKeyQuestion: true }]`

### 2. Update `ControlCardV2.tsx`

Replace the current "Do You Have This?" section (the three Yes/Partially/Not Yet buttons) with the new question-driven flow.

1.  Fetch the questions for the current control from `CONTROL_ADJUDICATION_QUESTIONS`.
2.  Render each question with two buttons: `[✅ Yes]` and `[❌ No]`.
3.  Store the answers in local component state.
4.  When the user has answered all questions:
    -   If they answered "No" to any `isKeyQuestion`, automatically set the control status to `not_implemented` and trigger the POA&M flow.
    -   If they answered "Yes" to all `isKeyQuestion`s but "No" to others, set the status to `partially_implemented`.
    -   If they answered "Yes" to all questions, set the status to `implemented`.
5.  Only show the "Show Your Evidence" section after the user has answered all questions affirmatively.

---

## Part III: Governance Document Checklist

This feature ensures that required policies are in place before a control can be marked as implemented.

### 1. Update `WizardGauntlet.tsx`

At the top of the main content area for each control family, render a "Required Documents" checklist. This list is derived from the `cmmc_unified_artifact_guide.md` data.

-   For each governance document required by any control in that family (e.g., "Access Control Policy" for the AC family), render a checklist item.
-   Each item should have a status icon: a red `X` if the document has not been uploaded for any control in that family, and a green `✓` if it has.

### 2. Update `ControlCardV2.tsx`

Add gating logic. For any control that requires a specific governance document (e.g., `3.1.2` requires the "Access Control Policy"):

1.  Check if that document has been uploaded as an artifact for *any* control in the organization.
2.  If it has not, disable the question-driven adjudication flow in the card and show a message instead:
    > "This control requires an **Access Control Policy**. Please upload this document for control `3.1.1` before proceeding."

This creates a clear dependency chain for the user, forcing them to establish the foundational policies before they can claim to have implemented the procedures that rely on them.

---

## Part IV: The End State

When this build is complete, a user will:
1.  Be interviewed about their business, not their tech stack.
2.  See a visual diagram of their CUI boundary.
3.  Answer simple yes/no questions to determine control status.
4.  Be guided to create foundational policy documents before they can proceed.
5.  Arrive at a more accurate and defensible compliance posture with less technical knowledge and less confusion.
