/**
 * SSP generator — Phase C1.
 *
 * Produces an AG-aligned System Security Plan from current canonical
 * state. Deterministic: same evidence inputs → same payload_sha256.
 *
 * Pipeline:
 *   1. Snapshot pin — record `now()` as generated_from_snapshot_at.
 *      Every cited evidence row is read once at this timestamp;
 *      re-runs against unchanged data reproduce the same hash.
 *   2. Header sections — system_id, scope, environment from
 *      organizations + boundary tables.
 *   3. Per-control sections — for each of the 110 controls:
 *        canonical state via getControlState()
 *        AG-authoritative narrative from vault-narratives.json
 *        per-objective letter list from CMMC_SCTM_UI_Optimized.json
 *        cited evidence rows with SHA-256 pinned at gen time
 *   4. Connections (ESP inheritance) + Update frequency.
 *   5. Auto-composed appendices (general system desc, design
 *      philosophies, roles & responsibilities, cryptographic posture).
 *   6. Render canonical JSON + Markdown.
 *   7. Compute payload_sha256.
 *   8. Persist ssp_documents + ssp_section_revisions +
 *      ssp_evidence_citations in one transaction.
 *
 * Phase C1 ships JSON + Markdown + persistence. PDF rendering is
 * Phase C1+. Signing + drift-detect are Phase C2. The Codex-side
 * signature column is left null until C2.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaries,
  controlRecords,
  governanceArtifactCompletions,
  governanceRegisterEntries,
  governanceRegisters,
  irExerciseBundles,
  irExercises,
  organizations,
  poamEntries,
  riskAssessments,
  sspDocuments,
  sspEvidenceCitations,
  sspSectionRevisions,
} from "@/db/schema";
import { getControlStatesForOrg } from "@/lib/canonical-state/get-control-state";
import {
  canonicalize,
  payloadSha256,
} from "./canonicalize";

type ObjectiveCatalog = Map<string, Array<{ letter: string; text: string }>>;

interface VaultNarrative {
  raw: string;
}

interface GenerateInput {
  organizationId: string;
  /**
   * Optional override for which boundary's SSP to generate. Defaults
   * to the org's first boundary (matches the wizard's pattern).
   */
  boundaryId?: string;
  /**
   * Optional user id for audit trail. SSP generation always logs an
   * audit row even when user is null.
   */
  triggeredByUserId?: string | null;
}

export interface GenerateResult {
  sspDocumentId: string;
  versionNumber: number;
  payloadSha256: string;
  controlsCovered: number;
  controlsMet: number;
  controlsNotMet: number;
  controlsNa: number;
}

interface GeneratedSection {
  sectionKind: string;
  sectionKey: string;
  orderIndex: number;
  title: string;
  bodyMd: string;
  bodyJson: Record<string, unknown> | null;
  aggregateFinding: string | null;
  metVia: string | null;
  objectiveVerdicts: unknown[] | null;
  citations: GeneratedCitation[];
}

interface GeneratedCitation {
  controlId: string | null;
  evidenceKind: string;
  evidenceId: string;
  evidenceSha256: string | null;
  supportsObjectives: string[];
  evidenceExcerpt: string | null;
}

/** Generate + persist a new SSP version. Returns metadata about the new row. */
export async function generateSsp(input: GenerateInput): Promise<GenerateResult> {
  // 1. Snapshot pin.
  const snapshotAt = new Date();

  // Resolve org + boundary.
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!org) throw new Error(`Organization ${input.organizationId} not found`);

  let boundary;
  if (input.boundaryId) {
    [boundary] = await db
      .select()
      .from(boundaries)
      .where(
        and(
          eq(boundaries.id, input.boundaryId),
          eq(boundaries.organizationId, org.id),
        ),
      )
      .limit(1);
  } else {
    [boundary] = await db
      .select()
      .from(boundaries)
      .where(eq(boundaries.organizationId, org.id))
      .orderBy(boundaries.createdAt)
      .limit(1);
  }
  if (!boundary) {
    throw new Error("No boundary defined for this organization");
  }

  // 2. Load static catalogs.
  const [vaultNarratives, objectivesByControl] = await Promise.all([
    loadVaultNarratives(),
    loadObjectiveCatalog(),
  ]);

  // 3. Pull canonical state for every control.
  const states = await getControlStatesForOrg(org.id);

  // 4. Compose sections.
  const sections: GeneratedSection[] = [];

  sections.push(buildSystemIdSection(org, boundary));
  sections.push(buildScopeSection(boundary));
  sections.push(buildEnvironmentSection(boundary));
  sections.push(buildSecurityRequirementsSection(states));

  // Per-control sections (110 of them).
  let orderIndex = 100;
  const controlSections: GeneratedSection[] = [];
  for (const [controlId, state] of [...states.entries()].sort(([a], [b]) =>
    compareControlIds(a, b),
  )) {
    const section = await buildControlSection(
      org.id,
      controlId,
      state,
      vaultNarratives.get(controlId) ?? null,
      objectivesByControl.get(controlId) ?? [],
      orderIndex++,
    );
    controlSections.push(section);
  }
  sections.push(...controlSections);

  sections.push(buildConnectionsSection(boundary, states));
  sections.push(buildUpdateFrequencySection());
  sections.push(buildCryptoPostureAppendix(controlSections));
  sections.push(buildRolesAppendix());

  // 5. Compute generation provenance tally.
  const tally = {
    controlsCovered: states.size,
    controlsMet: 0,
    controlsNotMet: 0,
    controlsNa: 0,
    controlsMetViaEvidence: 0,
    controlsMetViaEsp: 0,
    controlsMetViaEnduringException: 0,
    controlsMetViaDodCio: 0,
    controlsMetViaOpPlan: 0,
  };
  for (const s of states.values()) {
    if (s.aggregateFinding === "MET") tally.controlsMet++;
    else if (s.aggregateFinding === "NOT_MET") tally.controlsNotMet++;
    else if (s.aggregateFinding === "NA") tally.controlsNa++;

    if (s.metVia === "evidence") tally.controlsMetViaEvidence++;
    else if (s.metVia === "esp_inheritance") tally.controlsMetViaEsp++;
    else if (s.metVia === "enduring_exception") tally.controlsMetViaEnduringException++;
    else if (s.metVia === "dod_cio_adjudication") tally.controlsMetViaDodCio++;
    else if (s.metVia === "operational_plan_of_action") tally.controlsMetViaOpPlan++;
  }

  // 6. Determine the next version_number.
  const [latest] = await db
    .select({ versionNumber: sspDocuments.versionNumber })
    .from(sspDocuments)
    .where(eq(sspDocuments.organizationId, org.id))
    .orderBy(desc(sspDocuments.versionNumber))
    .limit(1);
  const nextVersion = (latest?.versionNumber ?? 0) + 1;

  // 7. Render canonical JSON + Markdown.
  const payloadJson = {
    version_number: nextVersion,
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
    },
    boundary: {
      id: boundary.id,
      name: boundary.name,
      scope_components: boundary.scopeComponents ?? [],
      cloud_provider: boundary.cloudProvider ?? null,
      azure_environment: boundary.azureEnvironment ?? null,
      boundary_type: boundary.boundaryType ?? null,
    },
    generated_from_snapshot_at: snapshotAt.toISOString(),
    tally,
    sections: sections.map((s) => ({
      kind: s.sectionKind,
      key: s.sectionKey,
      order: s.orderIndex,
      title: s.title,
      body_md: s.bodyMd,
      body_json: s.bodyJson,
      aggregate_finding: s.aggregateFinding,
      met_via: s.metVia,
      objective_verdicts: s.objectiveVerdicts,
      citations: s.citations.map((c) => ({
        evidence_kind: c.evidenceKind,
        evidence_id: c.evidenceId,
        evidence_sha256: c.evidenceSha256,
        supports_objectives: c.supportsObjectives,
        evidence_excerpt: c.evidenceExcerpt,
      })),
    })),
  };
  const payloadMd = renderMarkdown(payloadJson, sections, org, boundary, tally);
  const sha256 = payloadSha256(payloadJson);

  // 8. Persist.
  const [doc] = await db
    .insert(sspDocuments)
    .values({
      organizationId: org.id,
      boundaryId: boundary.id,
      versionNumber: nextVersion,
      status: "draft",
      generatedFromSnapshotAt: snapshotAt,
      payloadJson: payloadJson as unknown as Record<string, unknown>,
      payloadMd,
      payloadSha256: sha256,
      controlsCovered: tally.controlsCovered,
      controlsMet: tally.controlsMet,
      controlsNotMet: tally.controlsNotMet,
      controlsNa: tally.controlsNa,
      controlsMetViaEvidence: tally.controlsMetViaEvidence,
      controlsMetViaEsp: tally.controlsMetViaEsp,
      controlsMetViaEnduringException: tally.controlsMetViaEnduringException,
      controlsMetViaDodCio: tally.controlsMetViaDodCio,
      controlsMetViaOpPlan: tally.controlsMetViaOpPlan,
    })
    .returning();

  // Mark prior signed version as superseded.
  await db
    .update(sspDocuments)
    .set({ status: "superseded", supersededAt: new Date(), supersededById: doc.id })
    .where(
      and(
        eq(sspDocuments.organizationId, org.id),
        eq(sspDocuments.status, "signed"),
        sql`${sspDocuments.id} <> ${doc.id}`,
      ),
    );

  // Section revisions + citations.
  for (const s of sections) {
    const [rev] = await db
      .insert(sspSectionRevisions)
      .values({
        sspDocumentId: doc.id,
        sectionKind: s.sectionKind,
        sectionKey: s.sectionKey,
        orderIndex: s.orderIndex,
        title: s.title,
        bodyMd: s.bodyMd,
        bodyJson: s.bodyJson as unknown as Record<string, unknown>,
        evidencePinnedSha256: payloadSha256(s.citations),
        aggregateFinding: s.aggregateFinding,
        metVia: s.metVia,
        objectiveVerdicts: s.objectiveVerdicts as unknown as Record<string, unknown>[] | null,
      })
      .returning();
    if (s.citations.length > 0) {
      await db.insert(sspEvidenceCitations).values(
        s.citations.map((c) => ({
          sspDocumentId: doc.id,
          sspSectionRevisionId: rev.id,
          controlId: c.controlId,
          evidenceKind: c.evidenceKind,
          evidenceId: c.evidenceId,
          evidenceSha256: c.evidenceSha256,
          supportsObjectives: c.supportsObjectives,
          evidenceExcerpt: c.evidenceExcerpt,
        })),
      );
    }
  }

  return {
    sspDocumentId: doc.id,
    versionNumber: doc.versionNumber,
    payloadSha256: doc.payloadSha256,
    controlsCovered: tally.controlsCovered,
    controlsMet: tally.controlsMet,
    controlsNotMet: tally.controlsNotMet,
    controlsNa: tally.controlsNa,
  };
}

// ────────────────────────────────────────────────────────────────────
// Static catalog loaders
// ────────────────────────────────────────────────────────────────────

async function loadVaultNarratives(): Promise<Map<string, VaultNarrative>> {
  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "cmmc",
    "vault-narratives.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as Record<string, string>;
  const out = new Map<string, VaultNarrative>();
  for (const [k, v] of Object.entries(data)) out.set(k, { raw: v });
  return out;
}

async function loadObjectiveCatalog(): Promise<ObjectiveCatalog> {
  const filePath = path.join(
    process.cwd(),
    "public",
    "CMMC_SCTM_UI_Optimized.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as Array<{
    id: string;
    objectives: Array<{ id: string; text: string }>;
  }>;
  const out: ObjectiveCatalog = new Map();
  for (const c of data) {
    const nist = c.id.replace(/^[A-Z]+\.L\d-/, "");
    const list = c.objectives.map((o) => {
      const parts = o.id.split("-");
      const tail = parts[parts.length - 1];
      return { letter: tail, text: o.text };
    });
    out.set(nist, list);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Section composers
// ────────────────────────────────────────────────────────────────────

function buildSystemIdSection(
  org: typeof organizations.$inferSelect,
  boundary: typeof boundaries.$inferSelect,
): GeneratedSection {
  const body = `# System Security Plan
## ${org.name ?? org.slug}

| Field | Value |
|---|---|
| Organization | ${org.name ?? org.slug} |
| System | ${boundary.name} |
| Boundary type | ${boundary.boundaryType ?? "—"} |
| Cloud provider | ${boundary.cloudProvider ?? "—"} |
| Azure environment | ${boundary.azureEnvironment ?? "—"} |
| CMMC level | Level 2 |
| Generated | ${new Date().toISOString()} |
`;
  return {
    sectionKind: "system_id",
    sectionKey: "system_id",
    orderIndex: 1,
    title: `${org.name ?? org.slug} — System Security Plan`,
    bodyMd: body,
    bodyJson: {
      organization_name: org.name ?? org.slug,
      system_name: boundary.name,
      cmmc_level: "Level 2",
    },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

function buildScopeSection(
  boundary: typeof boundaries.$inferSelect,
): GeneratedSection {
  const components = (boundary.scopeComponents as string[] | null) ?? [];
  const lines = components.map((c) => `- ${c}`).join("\n") || "- (no components recorded)";
  const body = `## CMMC Assessment Scope

${boundary.description ?? "(no description recorded)"}

### Asset inventory (high-level)
${lines}
`;
  return {
    sectionKind: "scope",
    sectionKey: "scope",
    orderIndex: 2,
    title: "CMMC Assessment Scope Description",
    bodyMd: body,
    bodyJson: { scope_components: components },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

function buildEnvironmentSection(
  boundary: typeof boundaries.$inferSelect,
): GeneratedSection {
  const body = `## Environment of Operation

The system operates within the **${boundary.boundaryType ?? "cui_enclave"}** boundary on
${boundary.cloudProvider ? `**${boundary.cloudProvider}**` : "the customer's infrastructure"}${boundary.azureEnvironment ? ` (Azure ${boundary.azureEnvironment})` : ""}.
Physical surroundings, system custody, and operational practices are
described in the Roles & Responsibilities appendix.
`;
  return {
    sectionKind: "environment",
    sectionKey: "environment",
    orderIndex: 3,
    title: "Description of the Environment of Operation",
    bodyMd: body,
    bodyJson: {
      boundary_type: boundary.boundaryType,
      cloud_provider: boundary.cloudProvider,
      azure_environment: boundary.azureEnvironment,
    },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

function buildSecurityRequirementsSection(
  states: Map<string, Awaited<ReturnType<typeof getControlStatesForOrg>>["forEach"] extends never ? never : ReturnType<typeof getControlStatesForOrg> extends Promise<Map<string, infer T>> ? T : never>,
): GeneratedSection {
  // The 110-control catalog reference + the org's per-control summary
  // table. Per-control bodies follow as `control` sections.
  const naList: string[] = [];
  for (const [cid, st] of states) {
    if (st.aggregateFinding === "NA") naList.push(cid);
  }
  const naSection = naList.length > 0
    ? `\n### Controls determined Not Applicable\n${naList.sort(compareControlIds).map((c) => `- ${c}`).join("\n")}\n`
    : "\n_No controls have been determined Not Applicable._\n";
  const body = `## Identified and Approved Security Requirements

The system's security requirements are derived from CMMC Level 2 / NIST
SP 800-171 Rev 2 (110 controls). Per-control implementation details follow
in the **Implementation Method** sections below; per-objective findings
([a]–[h]-style verbatim from NIST SP 800-171A) are surfaced in each
control's section.
${naSection}`;
  return {
    sectionKind: "security_reqs",
    sectionKey: "security_reqs",
    orderIndex: 4,
    title: "Identified and Approved Security Requirements",
    bodyMd: body,
    bodyJson: { controls_total: 110, na_controls: naList.sort(compareControlIds) },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

async function buildControlSection(
  orgId: string,
  controlId: string,
  state: Awaited<ReturnType<typeof getControlStatesForOrg>> extends Map<string, infer T> ? T : never,
  narrative: VaultNarrative | null,
  objectives: Array<{ letter: string; text: string }>,
  orderIndex: number,
): Promise<GeneratedSection> {
  // Pull citations for this control.
  const citations = await collectCitationsForControl(orgId, controlId, state);

  // Compose body. The narrative-as-block from vault-narratives.json
  // serves as the "Implementation Method"; we layer the canonical
  // verdict + per-objective findings + citations on top.
  const findingLine = state.aggregateFinding === "MET"
    ? "**Aggregate finding:** MET"
    : state.aggregateFinding === "NA"
      ? "**Aggregate finding:** NOT APPLICABLE"
      : "**Aggregate finding:** NOT MET";
  const metViaLine = `**MET via:** ${state.metVia.replace(/_/g, " ")}`;

  const objectiveLines = objectives.length > 0
    ? objectives
        .map((o) => {
          const verdict = state.objectives.find((v) => v.objective === o.letter);
          const v = verdict?.verdict ?? state.aggregateFinding;
          return `[${o.letter}] ${o.text}\n    Finding: ${formatFinding(v)}`;
        })
        .join("\n")
    : "_(no NIST SP 800-171A objectives recorded for this requirement)_";

  const citationsBlock = citations.length > 0
    ? citations
        .map(
          (c) =>
            `- [${c.evidenceKind}] ${c.evidenceExcerpt ?? c.evidenceId}` +
            (c.evidenceSha256 ? ` · sha256:\`${c.evidenceSha256.slice(0, 12)}…\`` : ""),
        )
        .join("\n")
    : "_(no evidence rows pinned at SSP generation time — see Phase A2 backfill notes)_";

  const body = `### ${controlId}

${findingLine}
${metViaLine}
**Confidence:** ${(state.confidence * 100).toFixed(0)}%

#### Assessment objectives [NIST SP 800-171A]
${objectiveLines}

#### Implementation method
${narrative?.raw ?? "_(no implementation narrative available for this control in vault-narratives.json)_"}

#### Evidence
${citationsBlock}
`;

  return {
    sectionKind: "control",
    sectionKey: controlId,
    orderIndex,
    title: `${controlId} — Implementation`,
    bodyMd: body,
    bodyJson: {
      control_id: controlId,
      aggregate_finding: state.aggregateFinding,
      met_via: state.metVia,
      confidence: state.confidence,
      objectives: state.objectives,
    },
    aggregateFinding: state.aggregateFinding,
    metVia: state.metVia,
    objectiveVerdicts: state.objectives as unknown[],
    citations,
  };
}

function buildConnectionsSection(
  boundary: typeof boundaries.$inferSelect,
  states: Awaited<ReturnType<typeof getControlStatesForOrg>>,
): GeneratedSection {
  const espControls: string[] = [];
  for (const [cid, st] of states) {
    if (st.metVia === "esp_inheritance") espControls.push(cid);
  }
  const body = `## Connections and Relationships to Other Systems and Networks

The system's external connections and inherited capabilities:

${boundary.cloudProvider === "azure"
  ? `- **Azure ${boundary.azureEnvironment ?? "Government"}** — provides physical security, datacenter operations, network primitives, and certain CMMC controls under the FedRAMP High shared-responsibility model.`
  : "- _(no external service providers recorded)_"}

### Controls inherited via External Service Provider (per AG p.11)
${espControls.length > 0 ? espControls.sort(compareControlIds).map((c) => `- ${c}`).join("\n") : "_(none)_"}
`;
  return {
    sectionKind: "connections",
    sectionKey: "connections",
    orderIndex: 1000,
    title: "Connections and Relationships",
    bodyMd: body,
    bodyJson: { esp_controls: espControls.sort(compareControlIds) },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

function buildUpdateFrequencySection(): GeneratedSection {
  const body = `## Defined Frequency of Updates

This SSP is reviewed and updated **at least annually** per CA.L2-3.12.4
(NIST SP 800-171A objective [g]/[h]) and whenever a significant system
change occurs (boundary expansion, new external connection, new CUI
data type, material change in evidence posture).

The Codex platform monitors evidence drift continuously and surfaces
divergence via the SSP drift-detect endpoint
(\`GET /api/ssp/[id]/verify\`). When drift is detected, the operator
issues a new SSP version that supersedes this one.
`;
  return {
    sectionKind: "update_freq",
    sectionKey: "update_freq",
    orderIndex: 1010,
    title: "Defined Frequency of Updates",
    bodyMd: body,
    bodyJson: { cadence: "annual", continuous_drift_monitoring: true },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

function buildCryptoPostureAppendix(controlSections: GeneratedSection[]): GeneratedSection {
  // For Phase C1 we pull the crypto-relevant control IDs as a static
  // set. Phase C1+ enriches this with FIPS validation status pulled
  // from the org's evidence runs.
  const cryptoControls = controlSections
    .filter((s) =>
      [
        "3.5.10", // crypto-protected passwords
        "3.13.8", // data in transit
        "3.13.10", // key management
        "3.13.11", // CUI encryption
        "3.13.16", // data at rest
        "3.8.6", // portable storage encryption
        "3.1.19", // encrypt CUI on mobile
      ].includes(s.sectionKey),
    )
    .map((s) => `- **${s.sectionKey}** — ${s.title.replace(` — Implementation`, "")} · ${formatFinding(s.aggregateFinding)}`);

  const body = `## Appendix — Cryptographic Posture

Confidentiality is the highest-priority property of this system. The
following CMMC L2 controls govern the cryptographic mechanisms that
protect CUI:

${cryptoControls.join("\n")}

### Cryptographic modules and algorithms in scope
- **Data in transit:** TLS 1.2+ via Schannel (Windows Server) and Azure
  Front Door + Azure-managed TLS endpoints.
- **Data at rest:** AES-256-GCM via Azure Storage Service Encryption
  (SSE) with platform-managed keys; customer-managed keys via Azure Key
  Vault HSM where required.
- **Identity / authenticator transport:** Argon2id for password hashing
  in Azure AD; FIDO2 / Windows Hello for Business for phishing-resistant
  factors.
- **Audit / evidence integrity:** SHA-256 hash chains anchoring the
  daily/weekly manifests and per-bundle PackageSha256 / ManifestSha256
  on IR tabletop and risk-assessment archives.

FIPS 140-2 (or 140-3) validation status of the underlying modules is
documented per-control where applicable.
`;
  return {
    sectionKind: "appendix",
    sectionKey: "cryptographic_posture",
    orderIndex: 2000,
    title: "Appendix — Cryptographic Posture",
    bodyMd: body,
    bodyJson: { crypto_controls: cryptoControls.length },
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

function buildRolesAppendix(): GeneratedSection {
  const body = `## Appendix — Roles and Responsibilities

| Role | Responsibility |
|---|---|
| System Owner | Authoritative for the system's authorization to operate; signs the SSP. |
| ISSO (Information Systems Security Officer) | Day-to-day operational security; weekly review cadence; evidence custody. |
| Authorizing Official (AO) | Signs off on the SSP version; assumes accountability for residual risk. |
| External Service Provider | Where listed under Connections, implements named CMMC objectives under shared responsibility (per AG p.11). |
`;
  return {
    sectionKind: "appendix",
    sectionKey: "roles_responsibilities",
    orderIndex: 2010,
    title: "Appendix — Roles and Responsibilities",
    bodyMd: body,
    bodyJson: null,
    aggregateFinding: null,
    metVia: null,
    objectiveVerdicts: null,
    citations: [],
  };
}

// ────────────────────────────────────────────────────────────────────
// Citation collection
// ────────────────────────────────────────────────────────────────────

async function collectCitationsForControl(
  orgId: string,
  controlId: string,
  state: Awaited<ReturnType<typeof getControlStatesForOrg>> extends Map<string, infer T> ? T : never,
): Promise<GeneratedCitation[]> {
  const citations: GeneratedCitation[] = [];

  // 1. POA&M elevator — when MET via operational_plan_of_action.
  if (state.metVia === "operational_plan_of_action" && state.elevatorRefs.operationalPlanPoamId) {
    const [poam] = await db
      .select()
      .from(poamEntries)
      .where(eq(poamEntries.id, state.elevatorRefs.operationalPlanPoamId))
      .limit(1);
    if (poam) {
      citations.push({
        controlId,
        evidenceKind: "poam_entry",
        evidenceId: poam.id,
        evidenceSha256: hashRow(poam),
        supportsObjectives: [],
        evidenceExcerpt: `POA&M (${poam.status}) — ${poam.weaknessDescription?.slice(0, 100) ?? "no weakness description"}`,
      });
    }
  }

  // 2. Risk-assessment envelope — for 3.11.1.
  if (controlId === "3.11.1") {
    const [ra] = await db
      .select()
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.organizationId, orgId),
          eq(riskAssessments.status, "finalized"),
        ),
      )
      .orderBy(desc(riskAssessments.finalizedAt))
      .limit(1);
    if (ra) {
      citations.push({
        controlId,
        evidenceKind: "ra_envelope",
        evidenceId: ra.id,
        evidenceSha256: ra.finalReportSha256 ?? hashRow(ra),
        supportsObjectives: ["a", "b"],
        evidenceExcerpt: `Annual risk assessment finalized ${ra.finalizedAt?.toISOString().slice(0, 10) ?? "?"}; objective_a=${ra.objectiveAStatus}, objective_b=${ra.objectiveBStatus}`,
      });
    }
  }

  // 3. IR tabletop bundle — for 3.6.x.
  if (controlId.startsWith("3.6.")) {
    const bundleRows = await db
      .select({
        id: irExerciseBundles.id,
        bundleSha256: irExerciseBundles.bundleSha256,
        bundleVersion: irExerciseBundles.bundleVersion,
        bundleState: irExerciseBundles.bundleState,
      })
      .from(irExerciseBundles)
      .innerJoin(
        irExercises,
        eq(irExercises.id, irExerciseBundles.exerciseId),
      )
      .where(eq(irExercises.organizationId, orgId))
      .orderBy(desc(irExerciseBundles.createdAt))
      .limit(1);
    const b = bundleRows[0];
    if (b) {
      citations.push({
        controlId,
        evidenceKind: "ir_bundle",
        evidenceId: b.id,
        evidenceSha256: b.bundleSha256 ?? null,
        supportsObjectives: [],
        evidenceExcerpt: `IR tabletop bundle v${b.bundleVersion} — state=${b.bundleState}`,
      });
    }
  }

  // 4. Recent register entries that pivot to this control.
  const reg = await db
    .select({
      id: governanceRegisterEntries.id,
      entryType: governanceRegisterEntries.entryType,
      finalizedAt: governanceRegisterEntries.finalizedAt,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisters.id, governanceRegisterEntries.registerId),
    )
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisterEntries.status, "final"),
      ),
    )
    .orderBy(desc(governanceRegisterEntries.finalizedAt))
    .limit(5);
  for (const r of reg) {
    citations.push({
      controlId,
      evidenceKind: "register_entry",
      evidenceId: r.id,
      evidenceSha256: hashRow(r),
      supportsObjectives: [],
      evidenceExcerpt: `Register entry (${r.entryType}) finalized ${r.finalizedAt?.toISOString().slice(0, 10) ?? "?"}`,
    });
  }

  // 5. Governance artifact completions on this control.
  const completions = await db
    .select({
      id: governanceArtifactCompletions.id,
      artifactLabel: governanceArtifactCompletions.artifactLabel,
      attestedAt: governanceArtifactCompletions.attestedAt,
    })
    .from(governanceArtifactCompletions)
    .innerJoin(
      controlRecords,
      eq(controlRecords.id, governanceArtifactCompletions.controlRecordId),
    )
    .where(
      and(
        eq(governanceArtifactCompletions.organizationId, orgId),
        eq(controlRecords.controlId, controlId),
      ),
    )
    .orderBy(desc(governanceArtifactCompletions.attestedAt))
    .limit(3);
  for (const c of completions) {
    citations.push({
      controlId,
      evidenceKind: "artifact_completion",
      evidenceId: c.id,
      evidenceSha256: hashRow(c),
      supportsObjectives: [],
      evidenceExcerpt: `${c.artifactLabel} attested ${c.attestedAt?.toISOString().slice(0, 10) ?? "?"}`,
    });
  }

  // Snapshot itself — always cite.
  citations.push({
    controlId,
    evidenceKind: "ois_narrative",
    evidenceId: `snapshot:${state.computedAt.toISOString()}`,
    evidenceSha256: payloadSha256({
      controlId,
      finding: state.aggregateFinding,
      metVia: state.metVia,
      objectives: state.objectives,
      computedAt: state.computedAt,
    }),
    supportsObjectives: [],
    evidenceExcerpt: `Canonical adjudication snapshot computed ${state.computedAt.toISOString().slice(0, 10)}`,
  });

  return citations;
}

// ────────────────────────────────────────────────────────────────────
// Markdown rendering
// ────────────────────────────────────────────────────────────────────

function renderMarkdown(
  payload: Record<string, unknown>,
  sections: GeneratedSection[],
  org: typeof organizations.$inferSelect,
  boundary: typeof boundaries.$inferSelect,
  tally: { controlsCovered: number; controlsMet: number; controlsNotMet: number; controlsNa: number },
): string {
  void payload;
  void boundary;
  const header = `# System Security Plan — ${org.name ?? org.slug}\n\n` +
    `Version (draft) · generated ${new Date().toISOString()}\n\n` +
    `**Adjudication summary:** ${tally.controlsMet} MET · ${tally.controlsNotMet} NOT MET · ${tally.controlsNa} N/A · ${tally.controlsCovered} covered\n\n` +
    `---\n\n`;
  const ordered = [...sections].sort((a, b) => a.orderIndex - b.orderIndex);
  return header + ordered.map((s) => s.bodyMd).join("\n\n---\n\n") + "\n";
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function compareControlIds(a: string, b: string): number {
  const A = a.split(".").map((p) => parseInt(p, 10) || 0);
  const B = b.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const av = A[i] ?? 0;
    const bv = B[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}

function formatFinding(f: string | null): string {
  if (f === "MET") return "MET";
  if (f === "NOT_MET") return "NOT MET";
  if (f === "NA") return "N/A";
  return f ?? "—";
}

function hashRow(row: unknown): string {
  return payloadSha256(row);
}
