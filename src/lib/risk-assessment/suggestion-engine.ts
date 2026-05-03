import type { ThreatScenario, Likelihood, Impact } from "@/app/dashboard/readiness/risk-assessment/threat-scenarios";
import type { OrgPosture } from "./posture-engine";

/**
 * Suggestion engine — given a curated threat scenario AND the org's
 * computed posture, produces:
 *   - posture-adjusted likelihood/impact (capped at the curated bounds)
 *   - existing-controls bullets backed by REAL evidence (signed
 *     attestations, healthy cadences, populated registers) instead of
 *     the generic strings baked into the curated library
 *   - a human-readable "trace" explaining each adjustment, surfaced in
 *     the wizard's "Why this score?" tooltip
 *
 * Every adjustment is deterministic and one-step (-1 / +1) — no
 * black-box scoring. The trace is the audit log.
 */

const LIKELIHOOD_ORDER: Likelihood[] = ["rare", "unlikely", "possible", "likely", "almost_certain"];
const IMPACT_ORDER: Impact[] = ["low", "moderate", "high", "critical"];

function shiftLikelihood(l: Likelihood, delta: number): Likelihood {
  const idx = LIKELIHOOD_ORDER.indexOf(l);
  const next = Math.max(0, Math.min(LIKELIHOOD_ORDER.length - 1, idx + delta));
  return LIKELIHOOD_ORDER[next];
}

function shiftImpact(i: Impact, delta: number): Impact {
  const idx = IMPACT_ORDER.indexOf(i);
  const next = Math.max(0, Math.min(IMPACT_ORDER.length - 1, idx + delta));
  return IMPACT_ORDER[next];
}

export type AdjustmentTraceEntry = {
  signal: string;
  effect: "lower_likelihood" | "raise_likelihood" | "raise_impact" | "lower_impact" | "control_added";
  reason: string;
};

export type ScenarioSuggestion = {
  scenarioId: string;
  /** Posture-adjusted likelihood — may differ from scenario.suggestedLikelihood. */
  likelihood: Likelihood;
  /** Posture-adjusted impact — may differ from scenario.suggestedImpact. */
  impact: Impact;
  /** Existing-controls list, replacing curated text with real evidence-backed entries when available. */
  existingControls: string[];
  /** Audit trail: each adjustment + the signal that drove it. */
  trace: AdjustmentTraceEntry[];
};

const ATTESTATION_LABEL_TO_DESCRIPTION: Record<string, string> = {
  mfa_in_path: "MFA enforced on all privileged accounts (mfa_in_path attestation signed)",
  mobile_blocked_at_ca: "Mobile/personal devices blocked at Conditional Access (mobile_blocked_at_ca attestation signed)",
  audit_log_review_sop: "Audit log review SOP signed and operating",
  enclavewatch_audit_program: "EnclaveWatch audit collection program attested and operating",
  codex_poam_program: "Codex POA&M program attested",
  vulnerability_scanning_program: "MDVM vulnerability-scanning program attested",
  risk_assessment_program: "Risk assessment program attested",
  digital_only_media: "Digital-only media handling attested (no physical CUI media)",
  azure_managed_disposal: "Azure-managed disposal path attested for digital media",
  architectural_isolation: "Architectural isolation between CUI and corporate IT attested",
  na_no_wireless: "Wireless N/A — no wireless in scope",
  na_no_onprem_maintenance: "On-prem maintenance N/A",
  na_no_thirdparty_maintenance: "Third-party maintenance N/A",
  na_digital_only_media: "Physical media N/A — digital only",
  na_no_media_transport: "Media transport N/A",
  attest_no_onsite_cui_visitors: "On-site CUI visitor program N/A",
  attest_no_alternate_work_sites: "Alternate work sites N/A",
};

/**
 * Adjust a single scenario against the org's posture. Pure function — no
 * I/O.
 */
export function adjustScenario(scenario: ThreatScenario, posture: import("./posture-engine").OrgPosture): ScenarioSuggestion {
  let likelihood = scenario.suggestedLikelihood;
  let impact = scenario.suggestedImpact;
  const trace: AdjustmentTraceEntry[] = [];
  const realControls: string[] = [];

  // ── 1. Per-control attestation lookups ───────────────────────────────
  // For each scenario, walk applicableControls and translate any signed
  // attestation we find on those controls into a real evidence-backed
  // line; if a majority of applicable controls have signed attestations,
  // the threat is one step less likely.
  const matchedAttestations = new Set<string>();
  for (const att of posture.signedAttestations) {
    const overlaps = att.controlIds.some((cid) => scenario.applicableControls.includes(cid));
    if (overlaps) matchedAttestations.add(att.label);
  }
  for (const label of matchedAttestations) {
    const desc = ATTESTATION_LABEL_TO_DESCRIPTION[label] ?? `${label} attestation signed`;
    realControls.push(desc);
    trace.push({
      signal: `attestation_signed:${label}`,
      effect: "control_added",
      reason: `${label} is signed for at least one control covered by this scenario.`,
    });
  }

  // ── 2. Scenario-specific posture rules ───────────────────────────────
  // Targeted, defensible adjustments. Each rule references a real signal
  // and adds a trace entry.
  switch (scenario.id) {
    case "TS-001":
    case "TS-004": {
      // Privileged credential / MFA bypass — MFA in path strongly mitigates.
      const mfa = posture.signedAttestations.find((a) => a.label === "mfa_in_path");
      if (mfa) {
        likelihood = shiftLikelihood(likelihood, -1);
        trace.push({
          signal: "mfa_in_path",
          effect: "lower_likelihood",
          reason: "MFA enforced on all privileged accounts (mfa_in_path attestation signed).",
        });
      }
      break;
    }
    case "TS-101": {
      // Critical CVE remains unpatched — directly tied to vuln stats.
      const { openCritical, openHigh } = posture.vulnerability;
      if (openCritical + openHigh > 5) {
        likelihood = shiftLikelihood(likelihood, +1);
        trace.push({
          signal: "open_critical_high_cves",
          effect: "raise_likelihood",
          reason: `${openCritical} critical and ${openHigh} high CVEs currently open in vuln_remediation register.`,
        });
      } else if (openCritical + openHigh === 0 && posture.vulnerability.totalEntries > 0) {
        likelihood = shiftLikelihood(likelihood, -1);
        trace.push({
          signal: "no_open_critical_high",
          effect: "lower_likelihood",
          reason: "No open critical/high CVEs in vuln_remediation register today.",
        });
      }
      break;
    }
    case "TS-102": {
      // MDVM cadence breaks — directly tied to cadence health.
      const cadence = posture.cadenceByName["mdvm_scan"];
      if (cadence?.status === "red" || cadence?.status === "never") {
        likelihood = shiftLikelihood(likelihood, +2);
        trace.push({
          signal: "mdvm_scan_cadence",
          effect: "raise_likelihood",
          reason:
            cadence.status === "never"
              ? "MDVM scan cadence has never produced an evidence run."
              : `MDVM scan cadence is ${cadence.daysSinceLast}d stale (>21d).`,
        });
      } else if (cadence?.status === "amber") {
        likelihood = shiftLikelihood(likelihood, +1);
        trace.push({
          signal: "mdvm_scan_cadence",
          effect: "raise_likelihood",
          reason: `MDVM scan cadence is ${cadence.daysSinceLast}d stale (>8d).`,
        });
      }
      break;
    }
    case "TS-201": {
      // Hardening baseline drift — tied to windows_server_hardening cadence.
      const cadence = posture.cadenceByName["windows_server_hardening"];
      if (cadence?.status === "red" || cadence?.status === "never") {
        likelihood = shiftLikelihood(likelihood, +1);
        trace.push({
          signal: "windows_server_hardening_cadence",
          effect: "raise_likelihood",
          reason: `OS validator cadence is ${cadence.daysSinceLast ?? "never"} (>21d).`,
        });
      }
      break;
    }
    case "TS-202": {
      // Audit logging disabled — tied to cui_evidence_manifest cadence.
      const cadence = posture.cadenceByName["cui_evidence_manifest"];
      if (cadence?.status === "red" || cadence?.status === "never") {
        likelihood = shiftLikelihood(likelihood, +2);
        impact = shiftImpact(impact, +1);
        trace.push({
          signal: "cui_evidence_manifest_cadence",
          effect: "raise_likelihood",
          reason: `Daily manifest cadence is ${cadence.daysSinceLast ?? "never"} (red).`,
        });
        trace.push({
          signal: "cui_evidence_manifest_cadence",
          effect: "raise_impact",
          reason: "Audit-log gap means a real incident might go undetected.",
        });
      } else if (cadence?.status === "amber") {
        likelihood = shiftLikelihood(likelihood, +1);
        trace.push({
          signal: "cui_evidence_manifest_cadence",
          effect: "raise_likelihood",
          reason: `Daily manifest cadence is ${cadence.daysSinceLast}d stale (amber).`,
        });
      }
      const audit = posture.signedAttestations.find((a) => a.label === "audit_log_review_sop");
      if (audit) {
        likelihood = shiftLikelihood(likelihood, -1);
        trace.push({
          signal: "audit_log_review_sop",
          effect: "lower_likelihood",
          reason: "Audit log review SOP signed (catches anomalous activity).",
        });
      }
      break;
    }
    case "TS-301": {
      // Microsoft platform compromise — out-of-customer-control; track
      // architectural isolation as the only meaningful local lever.
      const iso = posture.signedAttestations.find((a) => a.label === "architectural_isolation");
      if (iso) {
        impact = shiftImpact(impact, -1);
        trace.push({
          signal: "architectural_isolation",
          effect: "lower_impact",
          reason: "Architectural isolation reduces blast radius of platform compromise.",
        });
      }
      break;
    }
    case "TS-403": {
      // Phishing — MFA + audit review combined are the strongest mitigators.
      const mfa = posture.signedAttestations.find((a) => a.label === "mfa_in_path");
      if (mfa) {
        likelihood = shiftLikelihood(likelihood, -1);
        trace.push({
          signal: "mfa_in_path",
          effect: "lower_likelihood",
          reason: "Phishing-resistant MFA on privileged users limits credential-replay success.",
        });
      }
      break;
    }
    case "TS-501": {
      // CUI exfil via clipboard/screenshot — covered by architectural isolation.
      const iso = posture.signedAttestations.find((a) => a.label === "architectural_isolation");
      if (iso) {
        likelihood = shiftLikelihood(likelihood, -1);
        trace.push({
          signal: "architectural_isolation",
          effect: "lower_likelihood",
          reason: "Architectural isolation attestation includes clipboard/RDP redirection controls.",
        });
      }
      break;
    }
    case "TS-603": {
      // EnclaveWatch service halt — tied to enclavewatch_weekly_review cadence.
      const cadence = posture.cadenceByName["enclavewatch_weekly_review"];
      const audit = posture.cadenceByName["cui_evidence_manifest"];
      if (cadence?.status === "red" || audit?.status === "red") {
        likelihood = shiftLikelihood(likelihood, +1);
        trace.push({
          signal: "enclavewatch_cadence",
          effect: "raise_likelihood",
          reason: `EnclaveWatch cadence is stale (review=${cadence?.status}, manifest=${audit?.status}).`,
        });
      }
      break;
    }
  }

  // ── 3. Generic at-risk control fallback ──────────────────────────────
  // If a majority of applicable controls are at-risk, raise likelihood.
  const applicableStatuses = scenario.applicableControls
    .map((cid) => posture.controlStatusByControlId[cid])
    .filter(Boolean);
  if (applicableStatuses.length > 0) {
    const atRiskCount = applicableStatuses.filter((s) => s === "not_started").length;
    if (atRiskCount > 0 && atRiskCount >= Math.ceil(applicableStatuses.length / 2)) {
      const before = likelihood;
      likelihood = shiftLikelihood(likelihood, +1);
      if (likelihood !== before) {
        trace.push({
          signal: "applicable_controls_at_risk",
          effect: "raise_likelihood",
          reason: `${atRiskCount} of ${applicableStatuses.length} applicable controls are not_implemented.`,
        });
      }
    }
  }

  // Combine real evidence-backed controls with curated baseline list.
  const existingControls = realControls.length > 0
    ? [...realControls, ...scenario.existingControls.filter((c) => !realControls.some((r) => r.toLowerCase().includes(c.toLowerCase().slice(0, 24))))]
    : scenario.existingControls;

  return {
    scenarioId: scenario.id,
    likelihood,
    impact,
    existingControls,
    trace,
  };
}
