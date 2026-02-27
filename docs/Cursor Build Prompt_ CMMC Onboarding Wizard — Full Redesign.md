# Cursor Build Prompt: CMMC Onboarding Wizard — Full Redesign

## Context: Who You Are Building For

You are redesigning the CMMC OS onboarding experience for a specific user persona. Her name is **Brenda**. She is the office manager at a 50-person defense subcontractor. She is smart, organized, and has been handed the task of "getting us CMMC compliant" because nobody else would do it. She has never heard of NIST SP 800-171. She does not know what an SSP is. She is not a system administrator. She is not a lawyer. She is a capable professional who needs a guide, not a form.

**The single most important design principle in this entire build:** Every interaction must make Brenda feel competent, not confused. If she has to Google a term to understand what the wizard is asking her, we have failed.

---

## What Currently Exists in the Repo

The following files exist and are working. Do not delete them — refactor or replace them:

- `src/components/onboarding/OnboardingWizard.tsx` — 5-step wizard (welcome, org, boundary, inherited, complete). The structure is correct but the UX is sparse.
- `src/components/onboarding/BoundaryProfileSelector.tsx` — Checkbox list of technologies. Functional but not visual.
- `src/components/governance-wizard/WizardGauntlet.tsx` — The main compliance wizard with family nav and ControlCards. Functional but intimidating.
- `src/components/governance-wizard/ControlCard.tsx` — The per-control adjudication card. Has all the right data but the UX is a dense form.
- `src/app/api/onboarding/augment-description/route.ts` — AI magic wand for text fields. Already built and working.
- `src/app/api/ai/generate-document/route.ts` — AI policy template generator. Already built and working.
- `src/app/api/onboarding/complete/route.ts` — Onboarding completion endpoint. Already built and working.
- `src/app/api/onboarding/inherited-controls/route.ts` — Inherited controls calculator. Already built and working.

---

## Part I: The Onboarding Wizard Redesign

### File: `src/components/onboarding/OnboardingWizard.tsx`

Replace the current implementation with a full-screen, centered modal-style wizard. The outer shell should be a full-viewport overlay (`fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm`) with a centered card (`max-w-3xl w-full bg-white rounded-2xl shadow-2xl`).

**The persistent header (always visible at the top of the card):**

```
[Company Logo / MAC wordmark]          Step 2 of 6: Your CUI Boundary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[●●●○○○]  Progress bar — filled circles for completed steps, empty for remaining
```

The progress bar uses filled/empty dots, not a percentage. Percentages feel like a test. Dots feel like a checklist.

---

### Step 1: Welcome

**Headline:** "Let's get you CMMC ready."

**Body copy:**
> "CMMC (Cybersecurity Maturity Model Certification) is a requirement for companies that handle sensitive government information. This wizard will walk you through everything you need to do — step by step, in plain English. Most companies complete this in about 45 minutes. You can save your progress and come back at any time."

**CTA Button:** "Let's start →"

No form fields on this screen. No jargon. Just confidence.

---

### Step 2: Your Organization

**Headline:** "Tell us about your company."

**Fields (all pre-populated from the database if available):**
- Company legal name
- CAGE Code — with a tooltip: *"Your CAGE Code is a 5-character identifier assigned by the government. You can find it on your contract or at sam.gov."*
- Primary address
- Primary point of contact name and email

**UX rule:** All fields are pre-populated from the `organizations` table. If the data is already there, the user just confirms it and clicks Next. Do not make them re-type what you already know.

---

### Step 3: Your CUI Boundary (The Redesigned `BoundaryProfileSelector`)

This is the most important step in the onboarding. The current implementation is a checkbox list. We are replacing it with a **visual card-selection interface**.

**Headline:** "What's inside your CUI environment?"

**Subheadline (plain English):**
> "Your CUI environment is the collection of computers, servers, and software that your team uses to work with government-related information. Select everything that applies — don't worry about getting it perfect, you can update this later."

**Layout:** A responsive grid of technology cards (`grid grid-cols-2 md:grid-cols-3 gap-3`). Each card contains:
- A recognizable logo/icon (use `lucide-react` icons where possible; for branded logos use a simple text abbreviation in a colored square)
- The technology name in plain English (e.g., "Windows Computers" not "Windows Server 2022")
- A one-line plain-English description (e.g., "The computers your team uses day-to-day")
- A selected state: when clicked, the card gets a blue border and a checkmark badge in the top-right corner

**Technology card groups and their plain-English labels:**

| Group Header | Card Label | Value Key |
| :--- | :--- | :--- |
| **Computers & Servers** | Windows Computers | `windows_workstation` |
| | Windows Servers | `windows_server` |
| | Mac Computers | `macos` |
| | Linux Servers | `rhel` |
| **Cloud Services** | Microsoft Azure | `azure_commercial` |
| | Azure Government | `azure_gov` |
| | Amazon Web Services | `aws` |
| | Google Cloud | `gcp` |
| **Identity & Access** | Microsoft Entra ID (Active Directory) | `entra_id` |
| | Okta | `okta` |
| | On-Premise Active Directory | `on_prem_ad` |
| **Endpoint Protection** | Microsoft Defender | `defender` |
| | CrowdStrike | `crowdstrike` |
| | SentinelOne | `sentinelone` |
| **Device Management** | Microsoft Intune | `intune` |
| | JAMF (Mac Management) | `jamf` |
| **Security Monitoring** | Microsoft Sentinel | `sentinel` |
| | Splunk | `splunk` |
| **Vulnerability Scanning** | Tenable / Nessus | `tenable` |
| | Qualys | `qualys` |
| **Email & Collaboration** | Microsoft 365 | `m365` |
| | Google Workspace | `google_workspace` |
| **File Storage** | SharePoint / OneDrive | `sharepoint` |
| | Network File Share (NFS/SMB) | `nfs` |

**Below the grid, two text fields with the Magic Wand:**

```
[Describe your CUI boundary — where does government information live?]
[✨ Magic Wand]

[Describe the scope of your CMMC assessment — what systems are included?]
[✨ Magic Wand]
```

The Magic Wand button calls `POST /api/onboarding/augment-description` with the current text and the field name. On success, it replaces the text with the AI-expanded version. The button shows a spinner while loading. After expansion, a small "✓ Expanded by AI" badge appears next to the field label.

---

### Step 4: Inherited Controls

**Headline:** "Great news — you've already inherited [N] controls."

**Body copy (dynamic):**
> "Because you selected [Azure Government / Entra ID / etc.], [N] of the 110 CMMC controls are automatically satisfied by your technology provider's own compliance certifications. We've marked these as 'Inherited' in your compliance program. You don't need to do anything for these."

**Visual:** A large green number showing the inherited count, followed by a collapsed list of the control IDs (expandable with "Show all inherited controls"). Each inherited control shows:
- The control ID (e.g., `3.13.8`)
- The plain-English name (e.g., "Encrypt data in transit")
- The inherited-from label (e.g., "Inherited from Azure Government FedRAMP High")

**If zero controls are inherited:** Show a neutral message: "Your selected technologies don't include any pre-certified cloud providers, so you'll implement all controls yourself. That's completely normal — let's get started."

---

### Step 5: Meet Your Compliance Checklist

**Headline:** "Here's your personalized CMMC checklist."

**Body copy:**
> "Based on your environment, you have [N] controls to implement. We've organized them into 14 categories. You'll work through each one, and we'll guide you every step of the way. You can do this in any order — start with what you know best."

**Visual:** A grid of 14 control family cards. Each card shows:
- The family name in plain English (e.g., "Who Can Access What" for Access Control)
- The number of controls in that family
- A progress ring (empty at this point)
- A color-coded category icon

**Plain-English family name mapping:**

| NIST Code | Plain-English Name | Icon |
| :--- | :--- | :--- |
| AC | Who Can Access What | `Shield` |
| AT | Training & Awareness | `GraduationCap` |
| AU | Activity Logs & Auditing | `FileText` |
| CM | System Configuration | `Settings` |
| IA | Proving Who You Are | `Fingerprint` |
| IR | Responding to Incidents | `AlertTriangle` |
| MA | System Maintenance | `Wrench` |
| MP | Protecting Physical Media | `HardDrive` |
| PS | Personnel Security | `Users` |
| PE | Physical Security | `Lock` |
| RA | Risk Assessment | `BarChart` |
| CA | Security Assessments | `ClipboardCheck` |
| SC | Network & Communications | `Network` |
| SI | System Health & Integrity | `Activity` |

**CTA Button:** "Start with [first incomplete family] →" — smart default that routes the user to the family with the most inherited controls already complete (to give them an early win).

---

### Step 6: Complete Setup

This step is reached after the user clicks "Complete Setup" from within the compliance wizard (not from the onboarding wizard itself). It calls `/api/onboarding/complete` and shows:

- A success animation (a simple CSS confetti or checkmark animation)
- The SPRS score (starting score based on inherited controls)
- A "Go to my Dashboard" button

---

## Part II: The ControlCard Redesign (`ControlCardV2.tsx`)

Create a new file: `src/components/governance-wizard/ControlCardV2.tsx`. This replaces `ControlCard.tsx` in the `WizardGauntlet`.

### The Card Structure

Each control card is a white, rounded card with a subtle shadow. It has two states: **collapsed** (default) and **expanded**.

**Collapsed state:**
```
[Status Icon] [Control ID]  [Plain-English Control Name]          [Status Badge]
              3.1.1         Limit who can access your systems      ● Not Started
```

The entire collapsed card is clickable to expand.

**Expanded state:**

The expanded card has four sections, presented as a vertical stepper:

---

**Section A: What This Means (always visible)**

A plain-English explanation of the control, written at a 6th-grade reading level. This is NOT the NIST control text. It is a human translation.

Example for `3.1.1`:
> "This control is about making sure that only the right people can access your systems and data. Think of it like a key card system — only employees with the right clearance can open certain doors."

Below the explanation, a small "Learn more" link expands to show the actual NIST control text for users who want the technical detail.

---

**Section B: Do You Have This? (The Implementation Question)**

A single, prominent question in plain English, followed by three large clickable buttons:

```
Do you have a process for controlling who can access your systems?

[✅ Yes, fully]   [⚠️ Partially]   [❌ Not yet]
```

- **"Yes, fully"** → sets status to `implemented`, opens Section C (evidence upload)
- **"Partially"** → sets status to `in_progress`, opens Section C (evidence upload) AND Section D (POA&M)
- **"Not yet"** → sets status to `not_implemented`, skips Section C, opens Section D (POA&M) automatically

These are large, full-width buttons with clear icons. No dropdowns. No jargon.

---

**Section C: Show Your Evidence**

This section only appears if the user selected "Yes, fully" or "Partially."

For each required artifact (from the `cmmc_unified_artifact_guide.md` for governance artifacts, and from `technical_evidence_requirements.ts` for technical evidence), show an **evidence card**:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📄 Access Control Policy                                        │
│ A written document that describes your rules for who can access │
│ your systems.                                                   │
│                                                                 │
│ [⬆️ Upload existing document]  [✨ Generate with AI]           │
│                                                                 │
│ ✓ Uploaded: Access_Control_Policy_v2.pdf  [Remove]             │
└─────────────────────────────────────────────────────────────────┘
```

**"Upload existing document"** — triggers the existing `FileUploadWidget` component.

**"Generate with AI"** — calls `POST /api/ai/generate-document` with the `controlId` and `artifactLabel`. On success, shows a modal:
```
┌─────────────────────────────────────────────────────────────────┐
│ ✨ AI-Generated: Access Control Policy                          │
│                                                                 │
│ [Editable text area with the generated policy]                  │
│                                                                 │
│ [Download as .docx]  [Save to my compliance program]           │
└─────────────────────────────────────────────────────────────────┘
```

The "Save to my compliance program" button saves the generated text as a file via the storage abstraction layer and links it to the control record as an artifact.

**For technical evidence items** (from the user's Boundary Profile), show the same card structure but with a different icon (🖥️) and a "Describe how you've implemented this" text field with a Magic Wand button instead of "Generate with AI."

---

**Section D: Add to Your Action Plan (POA&M)**

This section appears automatically when the user selects "Partially" or "Not yet."

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Add to Action Plan                                           │
│                                                                 │
│ We'll track this as something you need to fix. This is normal  │
│ — most companies have items in their action plan.              │
│                                                                 │
│ What's the plan to fix this?                                    │
│ [Text area with Magic Wand — "Describe in a few words..."]     │
│                                                                 │
│ Target completion date:  [Date picker]                          │
│ Who is responsible?      [Dropdown of team members/roles]       │
│                                                                 │
│ [Add to Action Plan]                                           │
└─────────────────────────────────────────────────────────────────┘
```

On submit, this calls `POST /api/poam/entries` with the pre-populated data. The button changes to "✓ Added to Action Plan" and a link to the POA&M entry appears.

---

**Section E: SSP Narrative (Collapsible, Advanced)**

Below all the above, a collapsible "Advanced: Write your SSP narrative" section. This is hidden by default and only shown to users who click "Advanced options." It contains the current narrative textarea. This keeps the advanced compliance language out of Brenda's way while still being accessible to the technical users who need it.

---

## Part III: The WizardGauntlet Redesign

Update `WizardGauntlet.tsx` to use `ControlCardV2` instead of `ControlCard`.

**Left sidebar changes:**
- Replace the family code abbreviations (AC, AT, etc.) with the plain-English names from the mapping table above.
- Add a progress ring next to each family name showing the percentage of controls completed.
- Add a "Jump to incomplete" button at the top of the sidebar that scrolls to the first incomplete control in the current family.

**Main content area changes:**
- Add a persistent "Your Progress" banner at the top of the main area: "You've completed [N] of [110] controls. Your current SPRS score is [X]."
- Add a "Mark all as Not Applicable" button for families that are clearly not relevant (e.g., MA — Maintenance — for a software-only company).

---

## Part IV: Technical Requirements

1.  **No new API routes are needed.** All the backend logic already exists. This is a pure UI/UX build.
2.  **State management:** Use React `useState` and `useCallback` within each component. Do not introduce a global state library.
3.  **Animations:** Use `transition-all duration-200` for expand/collapse animations. Use `animate-pulse` for loading states.
4.  **Accessibility:** All interactive elements must have `aria-label` attributes. Color is never the only indicator of state (always pair color with an icon or text).
5.  **Mobile responsiveness:** The wizard must be fully functional on a tablet (768px+). The card grid collapses to a single column on mobile.
6.  **TypeScript:** Strict typing throughout. No `any` types.

---

## Part V: The End State

When this build is complete, a user with no compliance background should be able to:

1. Open the platform for the first time.
2. Complete the onboarding wizard in under 45 minutes.
3. Have a fully populated compliance program with: inherited controls pre-marked, existing documents uploaded, AI-generated templates for missing policies, and all gaps logged as POA&M items.
4. See a live SPRS score on their dashboard.
5. Have a compliance posture that is defensible to a C3PAO assessor.

That is the bar. Build to it.
