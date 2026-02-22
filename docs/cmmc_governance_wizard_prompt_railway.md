# Cursor Build Prompt: CMMC Governance Wizard (Railway Pilot Edition)

---

## Part I: The Mission & The Strategy

**The Mission:** Build the **CMMC Governance Wizard**, a guided onboarding experience that demystifies CMMC compliance. The Wizard will walk a user step-by-step through every governance-relevant control in NIST SP 800-171 Rev 2, allowing them to adjudicate their compliance posture by submitting all required evidence directly within their CMMC OS company profile.

**The User Persona:** A compliance manager or IT director at a defense contractor. They are overwhelmed and need a tool that tells them exactly what to do, what documents to provide, and how to know when they are done.

**The Hosting Strategy (CRITICAL):** This is a two-phase strategy. You are building the production architecture now, but deploying it to a pilot environment.

- **Pilot Phase (Current):** The application runs on **Railway**. For file storage, use a simple S3-compatible object store (e.g., Cloudflare R2 or an Azure Blob Storage container in a commercial account) that is easy to configure for the pilot.
- **Production Phase (Future):** The application will be migrated to **Azure Government**. The application host will be Azure App Service, the database will be Azure PostgreSQL Flexible Server, and file storage will be Azure Blob Storage within the Azure Government FedRAMP High boundary.

**The Core Technical Directive:** You must build a **Storage Abstraction Layer** from day one. The application must not know or care whether it is writing files to the pilot storage or the production Azure Government storage. This abstraction is the most important architectural decision in this build.

---

## Part II: The Storage Abstraction Layer

Create a new service module at `lib/storage/` responsible for all file handling operations. This service will be selectable via a `STORAGE_PROVIDER` environment variable.

**Step 1 — Define the Interface:**

```typescript
// lib/storage/IStorageService.ts
interface IStorageService {
  upload(
    file: Buffer,
    metadata: {
      organizationId: string;
      controlId: string;
      fileName: string;
      mimeType: string;
    }
  ): Promise<{ fileUrl: string; fileId: string }>;
  getDownloadUrl(fileId: string): Promise<string>;
  delete(fileId: string): Promise<void>;
}
```

**Step 2 — Create Two Implementations:**

`PilotStorageService.ts` — Uses an S3-compatible client (e.g., `@aws-sdk/client-s3`) configured via environment variables (`STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`). This is the active implementation for the Railway pilot.

`AzureGovStorageService.ts` — Uses the `@azure/storage-blob` SDK configured for an Azure Government endpoint. This implementation is built now but activated only when `STORAGE_PROVIDER=azure_gov`.

**Step 3 — Implement a Factory:**

```typescript
// lib/storage/index.ts
export function getStorageService(): IStorageService {
  const provider = process.env.STORAGE_PROVIDER ?? 'pilot';
  if (provider === 'azure_gov') return new AzureGovStorageService();
  return new PilotStorageService();
}
```

Every API route that handles file uploads must call `getStorageService()` and use the returned instance. No route may reference a storage provider directly.

---

## Part III: The Governance Wizard Architecture

The Governance Wizard is a multi-step, full-screen modal experience. It launches automatically for new organizations and is accessible at any time from the main dashboard via a "Continue Governance Wizard" button.

**Step 1 — Introduction & Progress Overview**

A welcome screen that explains the Wizard's purpose. It shows a high-level progress ring indicating how many of the 14 control families have been completed. For the pilot, this step also includes a feature-flagged placeholder for the "Acknowledge Azure Government Inherited Controls" step — build the UI component now but hide it behind `FEATURE_INHERITED_CONTROLS=false`.

**Step 2 — The Governance Gauntlet (By Control Family)**

A persistent left-hand navigation panel lists all 14 control families (AC, AT, AU, CM, IA, IR, MA, MP, PS, PE, RA, CA, SC, SI). Each family shows a completion percentage badge. The main content area renders the controls for the currently selected family.

For each **Governance-Centric** and **Hybrid** control within the selected family, render a control card containing:

1. The Control ID (e.g., `3.1.1`) and the full official control text from NIST SP 800-171 Rev 2.
2. A plain-English "What This Means" explanation written for a non-technical compliance manager.
3. A "Satisfaction Type" badge — **Governance-Centric**, **Hybrid**, or **Technical-Centric** — pulled from the attached `cmmc_unified_artifact_guide.md`.
4. A list of required artifacts for that control, also pulled from `cmmc_unified_artifact_guide.md`. For each required artifact, render a `FileUploadWidget` component that accepts the file, a version string, and an approval date. On upload, this component calls `POST /api/artifacts` which calls `getStorageService().upload()` and writes a record to the `artifacts` table linked to the correct `controlRecordId`.
5. A rich text editor for the `governanceNarrative` field. Auto-save on blur to `PATCH /api/control-records/:id`.
6. A `responsibleRole` dropdown populated from the organization's `roles` table.
7. A real-time implementation status indicator (see Part IV).

For **Technical-Centric** controls, render a read-only card that says: *"This control is satisfied through technical configuration. It will be addressed in the Technical Configuration Wizard."* Show the control's current status indicator.

**Step 3 — Review & Finalize**

A summary screen showing a grid of all 110 controls, each displaying its status indicator. Group them by family. Show the total count of Implemented, In Progress, and Not Started controls. Provide a "Download Progress Report" button that generates a simple PDF summary.

---

## Part IV: The Control Implementation Indicator System

Every control throughout the entire application — in the Wizard, on the dashboard, in all generated documents — must display one of four states. The `implementationStatus` field on the `controlRecords` table is the single source of truth for this state. It is calculated server-side based on the following logic and never set manually by the user.

| Status | Color | Badge Label | Calculation Logic |
| :--- | :--- | :--- | :--- |
| **Not Started** | Gray | `NOT STARTED` | No artifacts uploaded, no narrative written |
| **In Progress** | Amber | `IN PROGRESS` | At least one artifact uploaded OR narrative has content, but not all required artifacts are present |
| **Implemented** | Blue | `IMPLEMENTED` | All required artifacts for this control are uploaded AND a governance narrative is present |
| **Assessed** | Green | `ASSESSED` | An assessor has reviewed the evidence and marked the control as satisfied (Assessor Mode only) |

A server-side function `calculateControlStatus(controlRecordId)` must be called after every artifact upload, artifact deletion, and narrative save to recompute and persist the `implementationStatus` to the database.

---

## Part V: The Database Schema (Drizzle ORM)

This schema supersedes any previous `controlImplementations` table. Implement the following using Drizzle ORM and run a migration.

**`controlRecords` table** — The atomic unit of the platform. One record per control per organization.

```typescript
export const controlRecords = pgTable('control_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  controlId: varchar('control_id', { length: 20 }).notNull(), // e.g. "3.1.1"
  implementationStatus: statusEnum('implementation_status').notNull().default('not_started'),
  governanceNarrative: text('governance_narrative'),
  technicalNarrative: text('technical_narrative'),
  responsibleRoleId: uuid('responsible_role_id').references(() => roles.id),
  inheritedFrom: varchar('inherited_from', { length: 255 }), // e.g. "Microsoft Azure Government"
  assessorId: uuid('assessor_id').references(() => users.id),
  assessorFindings: text('assessor_findings'),
  assessmentDate: date('assessment_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**`artifacts` table** — Linked to a specific control record.

```typescript
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  controlRecordId: uuid('control_record_id').notNull().references(() => controlRecords.id),
  artifactLabel: varchar('artifact_label', { length: 255 }).notNull(), // e.g. "Access Control Policy"
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'),
  version: varchar('version', { length: 50 }),
  approvalDate: date('approval_date'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  vaultDocumentId: varchar('vault_document_id', { length: 255 }), // Reserved for future CUI Vault integration
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**`technicalEvidence` table** — For the Technical Configuration Wizard (schema built now, populated later).

```typescript
export const technicalEvidence = pgTable('technical_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  controlRecordId: uuid('control_record_id').notNull().references(() => controlRecords.id),
  evidenceType: evidenceTypeEnum('evidence_type').notNull(), // screenshot | config_file | scan_result | log_file
  description: text('description'),
  fileUrl: text('file_url'),
  sourceUrl: text('source_url'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**`poamEntries` table** — Auto-generated for any control that is not Implemented or Assessed.

```typescript
export const poamEntries = pgTable('poam_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  controlRecordId: uuid('control_record_id').notNull().references(() => controlRecords.id),
  status: poamStatusEnum('status').notNull().default('open'),
  weaknessDescription: text('weakness_description'),
  remediationPlan: text('remediation_plan'),
  scheduledCompletionDate: date('scheduled_completion_date'),
  responsibleRoleId: uuid('responsible_role_id').references(() => roles.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**`roles` table** — Organizational roles referenced across control records and POA&M entries.

```typescript
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## Part VI: The Read Contracts — How Downstream Documents Use This Data

All document generation features read from `controlRecords` and their related tables. They never maintain their own data. This is the contract every future document generator must honor.

The **SSP Generator** iterates all 110 `controlRecords` for the organization. For each record it renders: the control ID and official text, a merged narrative combining `governanceNarrative` and `technicalNarrative`, a list of all linked `artifacts` with their version and approval date, and the `responsibleRole` name.

The **SCTM Generator** renders a table of all 110 `controlRecords` with columns for: Control ID, Control Text, Implementation Status, Responsible Role, Artifact Count, and Technical Evidence Count.

The **POA&M Generator** queries all `controlRecords` where `implementationStatus` is `not_started` or `in_progress`, joins with `poamEntries`, and renders the full POA&M document. When a control transitions to `implemented`, its linked `poamEntry` is automatically set to `closed`.

The **SPRS Score Calculator** queries all 110 `controlRecords` and calculates the total score using the DoD-prescribed point values per control. This score is displayed on the main dashboard and recalculates in real time after every status change.

---

## Part VII: The End State

When this build is complete, a new user will sign up, launch the Governance Wizard, and work through each of the 14 control families. For every governance-relevant control, they will upload the required policy or procedure documents and write their SSP narrative. The platform will calculate their implementation status in real time, turning control indicators from gray to blue as they complete each control. Every piece of data they enter will be stored in the `controlRecords` table and will automatically flow into their SSP, SCTM, POA&M, and SPRS score — with zero additional data entry required. The entire experience runs on Railway for the pilot and can be migrated to Azure Government by changing a single environment variable.
