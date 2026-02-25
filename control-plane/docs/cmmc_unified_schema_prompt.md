# Cursor Build Prompt: The CMMC OS Unified Control Record

---

## Part I: The Mission - A Single Source of Truth

**The Mission:** Refactor the CMMC OS to be built on a **single source of truth** model. Every piece of compliance data — governance artifacts, technical configurations, narratives, assessor findings — will be stored in a unified **Control Record**. All downstream documents (SSP, SCTM, POA&M) and dashboard views will be rendered from this single record. This eliminates data duplication, ensures consistency, and makes the entire platform more powerful and maintainable.

**The Core Principle:** We are not building separate features. We are building a single, unified data model and a set of views (Wizards, Dashboards, Documents) that read from and write to it. The Control Record is the atomic unit of the entire platform.

---

## Part II: The Unified Control Record Schema (Drizzle ORM)

This is the most important schema in the application. You will refactor the existing database to center on this table.

**`controlRecords` Table:**

*   `id` (Primary Key)
*   `organizationId` (Foreign Key to `organizations`)
*   `controlId` (string, e.g., "AC.1.1") - *Indexed*
*   `implementationStatus` (Enum: `not_started`, `in_progress`, `implemented`, `assessed`) - *Indexed*
*   `governanceNarrative` (text, nullable) - *Written by Governance Wizard*
*   `technicalNarrative` (text, nullable) - *Written by Technical Config Wizard*
*   `responsibleRoleId` (Foreign Key to a new `roles` table, nullable)
*   `inheritedFrom` (string, nullable, e.g., "Microsoft Azure Government")
*   `assessorId` (Foreign Key to `users`, nullable)
*   `assessorFindings` (text, nullable)
*   `assessmentDate` (date, nullable)
*   `createdAt`, `updatedAt`

**Supporting Tables:**

*   **`artifacts`:** (As defined previously) `id`, `organizationId`, `controlRecordId` (NEW - Foreign Key to `controlRecords`), `fileName`, `fileUrl`, `fileType`, `fileSize`, `version`, `approvalDate`, `uploadedBy`, `createdAt`, `updatedAt`.

*   **`technicalEvidence`:** (NEW TABLE) `id`, `organizationId`, `controlRecordId` (Foreign Key to `controlRecords`), `evidenceType` (Enum: `screenshot`, `config_file`, `scan_result`, `log_file`), `description` (text), `fileUrl` (string, for uploaded evidence), `sourceUrl` (string, for linked evidence), `uploadedBy`, `createdAt`, `updatedAt`.

*   **`poamEntries`:** (NEW TABLE) `id`, `organizationId`, `controlRecordId` (Foreign Key to `controlRecords`), `status` (Enum: `open`, `closed`), `weaknessDescription` (text), `remediationPlan` (text), `scheduledCompletionDate` (date), `responsibleRoleId` (Foreign Key to `roles`), `createdAt`, `updatedAt`.

*   **`roles`:** (NEW TABLE) `id`, `organizationId`, `name` (string, e.g., "System Administrator", "Compliance Officer"), `description` (text).

---

## Part III: The Write Contracts - How Wizards Populate the Record

**1. The Governance Wizard Write Contract:**

*   When a user launches the Wizard, the application will create 110 empty `controlRecords` for their organization if they do not already exist.
*   For each control, the Wizard will present the UI for uploading artifacts and writing the `governanceNarrative`.
*   When a user uploads a file, a new record is created in the `artifacts` table, linked to the corresponding `controlRecord`.
*   When a user saves their narrative, the `governanceNarrative` field in the `controlRecord` is updated.
*   The `implementationStatus` for the control is dynamically calculated based on the completeness of the required governance evidence.

**2. The Technical Configuration Wizard Write Contract (Future):**

*   This Wizard will follow the same pattern as the Governance Wizard, but it will populate different fields in the same `controlRecord`.
*   It will present UI for uploading or linking technical evidence (screenshots, config files), which will create records in the `technicalEvidence` table.
*   It will present a rich text editor for the `technicalNarrative`.
*   The `implementationStatus` will be recalculated based on the combined completeness of both governance and technical evidence.

---

## Part IV: The Read Contracts - How Documents Are Rendered

All document generation features will be refactored to be read-only views of the `controlRecords`.

*   **SSP (System Security Plan) Generator:**
    *   Iterates through all 110 `controlRecords` for the organization.
    *   For each control, it renders a section containing:
        *   The control ID and official text.
        *   A merged narrative from `governanceNarrative` and `technicalNarrative`.
        *   A list of all linked `artifacts` and `technicalEvidence`.
        *   The `responsibleRole`.

*   **SCTM (Security Control Traceability Matrix) Generator:**
    *   Renders a table of all 110 `controlRecords`.
    *   Columns include: Control ID, Implementation Status, Responsible Role, and counts of linked artifacts and technical evidence.

*   **POA&M (Plan of Action & Milestones) Generator:**
    *   Queries for all `controlRecords` where `implementationStatus` is not `implemented` or `assessed`.
    *   For each of these, it joins with the `poamEntries` table to render the full POA&M document.

*   **SPRS Score Calculator:**
    *   A server-side function that queries all 110 `controlRecords`.
    *   It calculates the total score based on the `implementationStatus` of each control, using the DoD-prescribed point values.
    *   This score is displayed on the main dashboard and updates in real time.

---

## Part V: The End State

The deliverable is a refactored CMMC OS where the `controlRecords` table is the heart of the application. The Governance Wizard is the first feature to be updated to write to this new unified schema. All other features (Technical Config Wizard, document generators) will be built on top of this same foundation. The result is a robust, scalable, and maintainable platform where data is entered once and used everywhere.
