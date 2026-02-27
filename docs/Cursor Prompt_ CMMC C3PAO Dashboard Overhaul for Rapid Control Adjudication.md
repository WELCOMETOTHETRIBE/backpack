# Cursor Prompt: CMMC C3PAO Dashboard Overhaul for Rapid Control Adjudication

## Executive Summary

You are tasked with designing and implementing a comprehensive dashboard overhaul for a CMMC C3PAO (Certified Third-Party Assessment Organization) platform. The primary objective is to **accelerate the adjudication of all 110 NIST 800-171 controls** while maintaining assessment integrity. The secondary objectives are evidence validation and provisioning. The dashboard must serve both organizations preparing for assessment and C3PAO assessors verifying compliance.

The current technology stack is **Next.js (App Router)**, **Tailwind CSS**, **Drizzle ORM**, and **Lucide React**. The platform stores control records, artifacts, technical evidence, POA&M entries, and governance documents in PostgreSQL.

---

## Design Philosophy & Principles

### Core Principles

**Rapid Acceleration**: Every interaction should reduce the number of clicks required to adjudicate a control. The dashboard should minimize cognitive load by presenting only the most relevant information at each step.

**Context-Aware Binning**: Controls are grouped by their satisfaction type (Technical, Governance/Policy, Inherited, N/A) rather than by family. This allows assessors to process controls in logical batches.

**Evidence-Centric Workflow**: The dashboard prioritizes evidence collection and validation. Every control adjudication must be traceable to supporting artifacts.

**Assessor-Friendly**: The interface must accommodate both C3PAO assessors (who need to verify evidence) and organization compliance teams (who need to prepare documentation).

### Visual & Interaction Design

The dashboard employs a **modern, high-density layout** with a persistent sidebar navigation. The color palette uses slate and zinc tones for a professional "GovCloud" aesthetic. Interactive elements use Lucide React icons for consistency. Tailwind CSS provides responsive design across all screen sizes.

---

## Widget 1: AI Boundary Diagram Creator

### Purpose

The AI Boundary Diagram Creator enables organizations to visualize and define their CUI (Controlled Unclassified Information) boundary using natural language input and interactive canvas manipulation. This widget generates a machine-readable boundary profile that determines which controls apply to the organization.

### Functional Requirements

**Natural Language Processing**: Users describe their environment in plain English (e.g., "We have an Azure Government tenant with 50 Windows laptops managed by Intune, an on-premises Active Directory, and a local office network"). An LLM parses this description and extracts technology components.

**Diagram Generation**: The system generates a Mermaid.js diagram or SVG visualization showing the CUI boundary, external systems, and user access points. The diagram includes labeled components (e.g., "Azure Gov", "Windows Workstations", "Intune MDM").

**Interactive Canvas**: Users can drag/drop technology components from a palette (sourced from `lib/compliance/technical_evidence_requirements.ts`) to add them to the boundary. Components include cloud platforms (Azure Gov, AWS GovCloud, GCP), identity providers (Entra ID, Okta, on-prem AD), endpoint management (Intune, JAMF), and security tools (Defender, CrowdStrike, Splunk).

**Persistence**: The selected technology profile is saved to the `boundary_profiles` table with a JSON array of technology keys. This profile determines which technical evidence requirements apply to each control.

### Implementation Details

**Data Source**: Reference `src/lib/compliance/diagram-generator.ts` for Mermaid diagram generation logic. The function `generateMermaidSource(profile: string[])` takes an array of technology keys and returns a Mermaid graph definition.

**Technology Mapping**: Use `BOUNDARY_TECHNOLOGY_OPTIONS` from `src/lib/compliance/technical_evidence_requirements.ts` to populate the component palette. Each technology key (e.g., `azure_gov`, `windows_server`, `entra_id`) maps to a display label and icon.

**API Endpoint**: Create or extend `POST /api/boundary/profile` to accept the selected technologies and update the `boundary_profiles` table.

**UI Components**: Build a React component that combines a text input area (for natural language description), a Mermaid diagram viewer, and a drag-drop component palette. Use shadcn/ui `Card`, `Button`, and `Input` components.

---

## Widget 2: Control Adjudication & Binning Interface

### Purpose

The Control Adjudication & Binning Interface allows assessors to rapidly move through the 110 NIST controls by grouping them into logical "bins" based on their satisfaction type. This widget dramatically reduces the time required to adjudicate controls by allowing batch processing.

### Functional Requirements

**Binning Categories**: Controls are organized into four bins:
- **Technical**: Controls satisfied by automated evidence (e.g., 3.1.1 Access Control, 3.5.3 MFA). These require screenshots, logs, and configuration exports.
- **Governance / Policy**: Controls satisfied by documented policies and procedures (e.g., 3.1.22 CUI Handling, 3.2.1 Security Awareness Training). These require policy documents and training records.
- **Inherited**: Controls satisfied by a Cloud Service Provider's FedRAMP authorization (e.g., physical security controls when using Azure Government). These are pre-populated based on the boundary profile.
- **N/A (Not Applicable)**: Controls outside the CUI boundary scope. These require justification via the Friendly Suggestor.

**Matrix View**: Display a matrix with control families (rows) and bins (columns). Each cell shows the count of controls in that family/bin combination. Clicking a cell opens a modal to adjudicate all controls in that group.

**Friendly Suggestor Modal**: When a user selects the N/A bin, a modal appears with 2-3 branching questions to determine if the control is truly not applicable. Example flow:
- "Is this asset located in a physical office you control?" → No
- "Does your Cloud Service Provider handle all physical access for this asset?" → Yes
- **Suggestion**: "This control is likely Inherited from your CSP's FedRAMP authorization. Mark as Inherited."

If the user confirms, the control status is automatically updated to "Not Applicable" or "Inherited" in the `control_records` table.

**Rapid Adjudication Flow**: Within a bin, users navigate through controls one at a time. For each control, they see:
- Control ID and NIST title
- Current implementation status
- Required evidence type (from `artifact-guide.ts`)
- Uploaded artifacts (if any)
- A dropdown to change status (Not Started, In Progress, Implemented, Inherited, N/A)

### Implementation Details

**Data Source**: Use `src/lib/artifact-guide.ts` to determine each control's satisfaction type. The `CMMC_ARTIFACT_SPECS` array contains `satisfactionType` for each control.

**Inherited Controls Logic**: Reference `src/lib/compliance/inherited-controls.ts` to determine which controls are inherited based on the boundary profile. For example, if the boundary includes `azure_gov`, all controls with `inheritedFrom: 'Azure Government FedRAMP High Authorization'` are marked as inherited.

**Adjudication Questions**: Use `src/lib/compliance/control_adjudication_questions.ts` to retrieve the adjudication questions for each control. The `getAdjudicationQuestionsForControl()` function returns an array of yes/no questions.

**API Endpoints**: 
- `PATCH /api/control-records/{id}` to update control status
- `GET /api/control-records` to fetch all control records for the organization
- `GET /api/controls/nist` to fetch NIST control titles and guidance

**UI Components**: Build a matrix component using Tailwind grid layout. Each cell is clickable and shows a badge with the count. Use shadcn/ui `Dialog` for the adjudication modal and `Select` for status changes.

---

## Widget 3: Governance Document Upload & Mapping Modal

### Purpose

The Governance Document Upload & Mapping Modal streamlines the collection of policy and procedure documents required for CMMC Level 2 certification. It guides users through uploading documents with proper naming conventions and automatically maps them to relevant controls.

### Functional Requirements

**Control Family Categorization**: The modal displays tabs for each control family (AC, AT, AU, CM, IA, IR, MA, MP, PS, PE, RA, CA, SC, SI). Users select the appropriate family before uploading a document.

**NIST Naming Conventions**: For each document type, display a suggested filename following NIST conventions. Examples:
- `AC-Policy-Access-Control-v1.pdf`
- `SSP-System-Security-Plan-2024.docx`
- `3.2.1-Security-Awareness-Training-Curriculum-v2.pdf`

**NIST Discussion Guidance**: Display a brief blurb explaining what the document should contain, sourced from the NIST 800-171 discussion section. Example for 3.1.22 (CUI Handling):
> "Organizations establish and maintain procedures for handling CUI throughout its lifecycle, including creation, processing, storage, transmission, and destruction. The procedures must address the protection of CUI in accordance with applicable laws, regulations, and organizational policies."

**Multi-Control Mapping**: Allow a single document to be mapped to multiple controls. For example, a comprehensive "Access Control Policy" can satisfy controls 3.1.1, 3.1.2, 3.1.4, and 3.1.5 simultaneously.

**File Upload & Versioning**: Provide a file upload input with fields for version number and approval date. Store the document in the `artifacts` table with the control record ID and artifact label.

### Implementation Details

**Data Source**: Use `src/lib/artifact-guide.ts` to retrieve the required artifact labels for each control. The `getRequiredUploadArtifactLabels()` function returns an array of labels.

**NIST Guidance**: Reference the `nistDiscussionGuidance` field from the `controls` table to populate the blurb for each control.

**API Endpoints**:
- `POST /api/artifacts` to upload a governance document
- `GET /api/governance-documents/uploaded-labels` to fetch already-uploaded document labels
- `PATCH /api/control-records/{id}` to map documents to controls

**UI Components**: Use shadcn/ui `Tabs` for control families, `Input` for file selection, and `Button` for submission. Display a list of uploaded documents with their version and approval date.

---

## Widget 4: Records Management (Manual Evidence & Attestations)

### Purpose

The Records Management widget tracks controls that require periodic manual logging, attestations, or certification uploads. These are typically governance controls that don't have automated evidence (e.g., training compliance, audit reviews, SSP updates).

### Functional Requirements

**Manual Logging Controls**: Display a list of controls that require manual records, such as:
- 3.2.1 (Security Awareness Training): Training completion records for all personnel
- 3.3.2 (Audit Review & Analysis): Monthly or quarterly audit log reviews
- 3.12.1 (System Security Plan): Annual SSP updates and reviews
- 3.14.1 (Incident Response): Incident response plan exercises and reviews

**Attestation Button**: For each control, provide a one-click "Attest" button. Clicking it opens a modal where the user confirms "I have reviewed the logs/records for this period" and optionally adds a comment. The attestation is recorded in the `poam_entries` table with a timestamp.

**Certification Upload**: For training-related controls (3.2.1, 3.2.2, 3.2.3), provide a dedicated area to upload training completion certificates or rosters. These are stored as artifacts linked to the control record.

**Health Indicator**: Display a "pulse" or "health" indicator next to each control showing when the last manual record was updated. Use color coding: green (updated within the last 30 days), amber (30-90 days), red (over 90 days).

**Recurring Reminder**: For controls with defined monitoring cadences (Quarterly, Monthly, Annual), display a "Next Review Due" date and highlight overdue reviews.

### Implementation Details

**Data Source**: Use `src/db/schema.ts` to identify controls with `monitoringCadence` set to "Quarterly", "Monthly", or "Annual". Reference the `lastValidationDate` field to calculate when the next review is due.

**Attestation Storage**: Create a new table `attestations` (or extend `poam_entries`) to record manual attestations with fields: `id`, `controlRecordId`, `attestedBy`, `attestedAt`, `comment`, `nextDueDate`.

**API Endpoints**:
- `POST /api/attestations` to record a manual attestation
- `GET /api/attestations?controlRecordId={id}` to fetch attestation history
- `POST /api/artifacts` to upload training certificates

**UI Components**: Use shadcn/ui `Card` for each control, `Button` for the Attest action, and `Dialog` for the attestation confirmation modal. Display a timeline of past attestations below each control.

---

## Dashboard Layout & Navigation

### Overall Structure

The dashboard uses a **sidebar + main content area** layout. The sidebar contains:
- Organization name and logo
- Navigation links: Dashboard, Controls, Evidence, POA&M, Reporting, Settings
- User profile and logout

The main content area displays the four widgets in a responsive grid:
- **Top Row**: AI Boundary Diagram Creator (full width)
- **Middle Rows**: Control Adjudication & Binning (left, 2/3 width), Records Management (right, 1/3 width)
- **Bottom Row**: Governance Document Upload & Mapping (full width)

### Responsive Design

On mobile devices (< 768px), stack the widgets vertically. On tablets (768px - 1024px), use a 2-column layout. On desktops (> 1024px), use the full 4-widget layout described above.

### Color & Typography

Use the existing Tailwind slate and zinc palette. Primary actions use the blue accent color. Status indicators use green (implemented), amber (in progress), red (not started), and gray (N/A). Typography uses the default Tailwind sans-serif with bold headings and regular body text.

---

## Technical Implementation Checklist

- [ ] Create new React components for each widget in `src/components/`
- [ ] Extend existing API routes in `src/app/api/` to support new widget functionality
- [ ] Add new database tables for attestations and audit trails (if needed)
- [ ] Implement LLM integration for natural language parsing in the Boundary Diagram Creator
- [ ] Add Mermaid.js diagram rendering library
- [ ] Create unit tests for control adjudication logic
- [ ] Add keyboard shortcuts for rapid navigation between controls
- [ ] Implement audit logging for all control adjudications
- [ ] Add export functionality to generate assessment reports
- [ ] Conduct user testing with C3PAO assessors and compliance teams

---

## Success Metrics

The dashboard overhaul is successful when:
1. **Adjudication Speed**: Average time to adjudicate a single control decreases from 5 minutes to < 2 minutes
2. **Evidence Completeness**: 95% of controls have supporting evidence artifacts within 2 weeks of dashboard launch
3. **Assessor Satisfaction**: C3PAO assessors rate the dashboard 4.5+ out of 5 for usability
4. **Error Reduction**: Adjudication errors (e.g., incorrect status assignments) decrease by 80%
5. **Certification Timeline**: Time from assessment start to certification issuance decreases by 30%

---

## References & Resources

- CMMC Assessment Process (CAP) v2.0 Guide: https://cyberab.org/
- NIST SP 800-171 Rev 2: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171r2.pdf
- CMMC Assessment Guide Level 2 v2.13: https://dodcio.defense.gov/Portals/0/Documents/CMMC/AssessmentGuideL2v2.pdf
- A-LIGN CMMC Assessment Process: https://www.a-lign.com/articles/cmmc-assessment-process
- Current CMMC Repository: https://github.com/WELCOMETOTHETRIBE/CMMC
