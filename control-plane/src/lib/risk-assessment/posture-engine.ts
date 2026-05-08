import { db } from "@/db";
import {
  controlRecords,
  governanceArtifactCompletions,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { evidenceRuns } from "../../../drizzle/schema.evidence";
import { eq, and, desc, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * Posture engine — reads the org's actual operational state and emits a
 * compact `OrgPosture` summary that the suggestion engine uses to adjust
 * each threat scenario's likelihood/impact and pre-fill existing-controls
 * with real evidence references.
 *
 * Everything here is deterministic and traceable: every signal is grounded
 * in a row in the database. No LLM. The output is what the suggestion
 * engine consumes; the wizard surfaces the trace verbatim so the operator
 * (and later the C3PAO) can see exactly which evidence drove each
 * recommendation.
 */

export type CadenceHealth = "green" | "amber" | "red" | "never";

export type SignedAttestation = {
  label: string;
  controlIds: string[]; // populated control IDs that hold this attestation
  signedAt: Date;
  signedBy: string | null;
};

export type CadenceSignal = {
  source: string; // e.g. "cui_evidence_manifest"
  lastSeenAt: Date | null;
  daysSinceLast: number | null;
  status: CadenceHealth;
};

export type OrgPosture = {
  /** Map control id -> implementation status, for every controlRecord on the org. */
  controlStatusByControlId: Record<string, string>;
  /** Signed governanceArtifactCompletions, deduped by label. */
  signedAttestations: SignedAttestation[];
  /** Latest cadence signal per source. */
  cadenceByName: Record<string, CadenceSignal>;
  /** vuln_remediation register stats (live findings). */
  vulnerability: {
    openCritical: number;
    openHigh: number;
    resolved: number;
    totalEntries: number;
  };
  /** Total controls passing (status=implemented). */
  implementedControlCount: number;
  /** Total controls AT_RISK / not_implemented. */
  atRiskControlCount: number;
  /** Boundary metadata used in scenario tailoring. */
  boundaryName: string;
};

const TRACKED_CADENCE_SOURCES = [
  "cui_evidence_manifest",
  "windows_server_hardening",
  "azure_entra",
  "enclavewatch_weekly_review",
  "mdvm_scan",
] as const;

const FRESHNESS_GREEN_DAYS = 8;
const FRESHNESS_AMBER_DAYS = 21;

function classifyCadence(daysSinceLast: number | null): CadenceHealth {
  if (daysSinceLast === null) return "never";
  if (daysSinceLast <= FRESHNESS_GREEN_DAYS) return "green";
  if (daysSinceLast <= FRESHNESS_AMBER_DAYS) return "amber";
  return "red";
}

export async function computeOrgPosture(orgId: string): Promise<OrgPosture> {
  // ── Boundary
  const [boundary] = await db
    .select({ name: boundaries.name })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);

  // ── Control status map
  const controls = await db
    .select({
      controlId: controlRecords.controlId,
      status: controlRecords.implementationStatus,
      id: controlRecords.id,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));
  const controlStatusByControlId: Record<string, string> = {};
  let implementedControlCount = 0;
  let atRiskControlCount = 0;
  for (const c of controls) {
    controlStatusByControlId[c.controlId] = c.status;
    if (c.status === "implemented") implementedControlCount++;
    if (c.status === "not_started") atRiskControlCount++;
  }

  // ── Signed attestations (governanceArtifactCompletions joined to controlRecords)
  const completions = await db
    .select({
      label: governanceArtifactCompletions.artifactLabel,
      attestedAt: governanceArtifactCompletions.attestedAt,
      attestedBy: governanceArtifactCompletions.attestedBy,
      controlId: controlRecords.controlId,
    })
    .from(governanceArtifactCompletions)
    .innerJoin(controlRecords, eq(governanceArtifactCompletions.controlRecordId, controlRecords.id))
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        sql`${governanceArtifactCompletions.attestedAt} IS NOT NULL`,
      ),
    );
  const attestationByLabel = new Map<string, SignedAttestation>();
  for (const c of completions) {
    if (!c.attestedAt) continue;
    const at = c.attestedAt instanceof Date ? c.attestedAt : new Date(c.attestedAt);
    const existing = attestationByLabel.get(c.label);
    if (existing) {
      if (!existing.controlIds.includes(c.controlId)) existing.controlIds.push(c.controlId);
      // Keep the earliest signed timestamp as canonical
      if (at < existing.signedAt) existing.signedAt = at;
    } else {
      attestationByLabel.set(c.label, {
        label: c.label,
        controlIds: [c.controlId],
        signedAt: at,
        signedBy: c.attestedBy ?? null,
      });
    }
  }
  const signedAttestations = Array.from(attestationByLabel.values()).sort((a, b) =>
    b.signedAt.getTime() - a.signedAt.getTime(),
  );

  // ── Cadence per source
  const cadenceByName: Record<string, CadenceSignal> = {};
  for (const source of TRACKED_CADENCE_SOURCES) {
    const [latest] = await db
      .select({ collectedAt: evidenceRuns.collectedAt })
      .from(evidenceRuns)
      .where(and(eq(evidenceRuns.organizationId, orgId), eq(evidenceRuns.source, source)))
      .orderBy(desc(evidenceRuns.collectedAt))
      .limit(1);
    const lastSeenAt = latest?.collectedAt
      ? latest.collectedAt instanceof Date
        ? latest.collectedAt
        : new Date(latest.collectedAt)
      : null;
    const daysSinceLast = lastSeenAt
      ? Math.floor((Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    cadenceByName[source] = {
      source,
      lastSeenAt,
      daysSinceLast,
      status: classifyCadence(daysSinceLast),
    };
  }

  // ── Vulnerability stats from vuln_remediation register
  const vulnCandidates = resolveRegisterKeyCandidates("vuln_remediation");
  const [vulnReg] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          vulnCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  let openCritical = 0;
  let openHigh = 0;
  let resolved = 0;
  let totalEntries = 0;
  if (vulnReg) {
    const entries = await db
      .select({ entryData: governanceRegisterEntries.entryData, status: governanceRegisterEntries.status })
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.registerId, vulnReg.id));
    totalEntries = entries.length;
    for (const e of entries) {
      const d = (e.entryData ?? {}) as Record<string, unknown>;
      const sev = String(d.severity ?? "").toLowerCase();
      const isResolved = e.status === "final" || d.remediation_status === "resolved" || !!d.fixed_utc;
      if (isResolved) {
        resolved++;
        continue;
      }
      if (sev === "critical") openCritical++;
      else if (sev === "high") openHigh++;
    }
  }

  return {
    controlStatusByControlId,
    signedAttestations,
    cadenceByName,
    vulnerability: { openCritical, openHigh, resolved, totalEntries },
    implementedControlCount,
    atRiskControlCount,
    boundaryName: boundary?.name ?? "CUI vault",
  };
}

/** Quick lookup: is this attestation label signed? */
export function isAttestationSigned(posture: OrgPosture, label: string): SignedAttestation | undefined {
  return posture.signedAttestations.find((a) => a.label === label);
}
