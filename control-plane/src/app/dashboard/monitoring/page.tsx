import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFindings,
  governanceRegisterEntries,
  governanceRegisters,
  governanceArtifactCompletions,
  controlRecords,
  poamEntries,
  boundaries,
  organizations,
  issoExportManifests,
  controlAttentionItems,
} from "@/db/schema";
import { eq, sql, desc, and, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import {
  Activity,
  Cloud,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  ClockAlert,
  ExternalLink,
  Shield,
  Bug,
  Wrench,
  Zap,
  FileWarning,
  Inbox,
  ScrollText,
  Eye,
  Flame,
} from "lucide-react";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { getVulnStatsForOrg } from "@/lib/sctm/vuln-stats";
import { AttentionResolveButton } from "./AttentionResolveButton";
import { CollapsibleMonitoringSection } from "./CollapsibleMonitoringSection";
import { getRecentThreatNarratives } from "@/lib/evidence-engine/correlation/threat-narratives";

/**
 * Continuous Monitoring (3.12.3) — operational dashboard for the
 * MacTech EnclaveWatch program. Replaces the old static "controls due
 * for review + evidence expiring" view, which was a calendar reminder
 * not a real continuous-monitoring signal.
 *
 * The page reads four evidenceRuns sources that EnclaveWatch posts into
 * the Codex on every weekly cadence:
 *   - cui_evidence_manifest    (OS evidence bundle from Collect-Cui-Evidence-v2)
 *   - windows_server_hardening (OS validator from Test-CuiHardening)
 *   - azure_entra              (Azure validator from validate_azure_entra)
 *   - enclavewatch_weekly_review (signed ISSO weekly acknowledgement)
 *
 * Per-source freshness is the heartbeat: weekly cadence -> green ≤ 8 d,
 * amber 8-21 d, red > 21 d (or never). Drift signal is computed by
 * comparing the latest run's findings against the prior run.
 */

// Source subtitles describe the collector script only. Check counts are
// computed dynamically from each run's actual evidence_findings rows so
// we never lie about how many checks ran.
const SOURCES = [
  { key: "cui_evidence_manifest", label: "OS Evidence Bundle", subtitle: "Collect-Cui-Evidence-v2 (manifest, no checks)", icon: HardDrive, kind: "manifest" as const },
  { key: "windows_server_hardening", label: "OS Validator", subtitle: "Test-CuiHardening", icon: ShieldCheck, kind: "validator" as const },
  { key: "azure_entra", label: "Azure Validator", subtitle: "validate_azure_entra", icon: Cloud, kind: "validator" as const },
  { key: "enclavewatch_weekly_review", label: "ISSO Weekly Review", subtitle: "Signed acknowledgement", icon: Activity, kind: "signoff" as const },
] as const;

const FRESHNESS_GREEN_DAYS = 8;
const FRESHNESS_AMBER_DAYS = 21;

function freshness(daysSinceLastRun: number | null): "green" | "amber" | "red" {
  if (daysSinceLastRun === null) return "red";
  if (daysSinceLastRun <= FRESHNESS_GREEN_DAYS) return "green";
  if (daysSinceLastRun <= FRESHNESS_AMBER_DAYS) return "amber";
  return "red";
}

function freshnessClasses(f: "green" | "amber" | "red"): { dot: string; pill: string; ring: string } {
  if (f === "green") return { dot: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-800 border-emerald-200", ring: "ring-emerald-200" };
  if (f === "amber") return { dot: "bg-amber-500", pill: "bg-amber-100 text-amber-800 border-amber-200", ring: "ring-amber-200" };
  return { dot: "bg-red-500", pill: "bg-red-100 text-red-700 border-red-200", ring: "ring-red-200" };
}

function freshnessLabel(daysSinceLastRun: number | null): string {
  if (daysSinceLastRun === null) return "Never run";
  if (daysSinceLastRun === 0) return "Today";
  if (daysSinceLastRun === 1) return "Yesterday";
  if (daysSinceLastRun < 30) return `${daysSinceLastRun}d ago`;
  const months = Math.floor(daysSinceLastRun / 30);
  return `${months}mo ago`;
}

type RunRow = {
  id: string;
  runId: string;
  source: string;
  collectedAt: Date;
  bundleRoot: string;
  pass: number;
  partial: number;
  fail: number;
};

export default async function MonitoringPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const allRuns = await db
    .select({
      id: evidenceRuns.id,
      runId: evidenceRuns.runId,
      source: evidenceRuns.source,
      collectedAt: evidenceRuns.collectedAt,
      bundleRoot: evidenceRuns.bundleRoot,
    })
    .from(evidenceRuns)
    .where(eq(evidenceRuns.organizationId, orgId))
    .orderBy(desc(evidenceRuns.collectedAt));

  // EnclaveWatch UI deep-link base. When the org has published its
  // reverse-proxied EnclaveWatch URL, each Program health pill below
  // becomes a click-through into the boundary VM's EnclaveWatch UI,
  // mirroring the per-machine vuln deep-link the auditor view uses.
  const [orgRow] = await db
    .select({ enclavewatchBaseUrl: organizations.enclavewatchBaseUrl })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const enclavewatchBaseUrl = orgRow?.enclavewatchBaseUrl?.replace(/\/+$/, "") ?? null;

  const findingCounts = await db
    .select({
      runId: evidenceFindings.evidenceRunId,
      pass: sql<number>`count(*) filter (where ${evidenceFindings.pass} = true and ${evidenceFindings.partial} = false)::int`,
      partial: sql<number>`count(*) filter (where ${evidenceFindings.partial} = true)::int`,
      fail: sql<number>`count(*) filter (where ${evidenceFindings.pass} = false and ${evidenceFindings.partial} = false)::int`,
    })
    .from(evidenceFindings)
    .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
    .where(eq(evidenceRuns.organizationId, orgId))
    .groupBy(evidenceFindings.evidenceRunId);

  const findingsByRun = new Map(findingCounts.map((f) => [f.runId, f]));

  const runs: RunRow[] = allRuns.map((r) => {
    const f = findingsByRun.get(r.id);
    return {
      id: r.id,
      runId: r.runId,
      source: r.source,
      collectedAt: r.collectedAt,
      bundleRoot: r.bundleRoot ?? "",
      pass: f?.pass ?? 0,
      partial: f?.partial ?? 0,
      fail: f?.fail ?? 0,
    };
  });

  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const perSource = SOURCES.map((s) => {
    const sourceRuns = runs.filter((r) => r.source === s.key);
    const latest = sourceRuns[0] ?? null;
    const previous = sourceRuns[1] ?? null;
    const daysSince = latest ? Math.floor((now - latest.collectedAt.getTime()) / MS_PER_DAY) : null;
    return {
      ...s,
      latest,
      previous,
      daysSince,
      freshness: freshness(daysSince),
      runCount: sourceRuns.length,
    };
  });

  // ── Host vitals (parsed from latest OS validator findings + vuln register) ──
  // Each card's source: see comment per metric. All data is already in the
  // codex (no new collectors). Parsed live on every page render so the
  // numbers always reflect the latest cadence run.
  const latestOsValidatorRun = perSource.find((s) => s.key === "windows_server_hardening")?.latest;
  let osValidatorFindings: { controlId: string; pass: boolean; observed: string }[] = [];
  if (latestOsValidatorRun) {
    osValidatorFindings = await db
      .select({ controlId: evidenceFindings.controlId, pass: evidenceFindings.pass, observed: evidenceFindings.observed })
      .from(evidenceFindings)
      .where(eq(evidenceFindings.evidenceRunId, latestOsValidatorRun.id));
  }
  const findingByControl = new Map(osValidatorFindings.map((f) => [f.controlId, f]));

  // 1. AV state — read from the 3.14.2 finding (Defender / malicious code
  // protection). 3.14.4 is OS patch recency (win32_quickfixengineering /
  // Windows Update last-success), NOT antivirus — wiring the AV card to
  // 3.14.4 was a control-mapping bug that made the widget show a WU
  // age while labeled "AV definitions".
  //
  // Two emission formats observed from the validator over time:
  //   • "RealTimeProtectionEnabled=True"  (current state — boolean)
  //   • "SignatureAge=N"                  (future — when validator wires
  //                                        Get-MpComputerStatus output)
  // Prefer SignatureAge when present (richer signal, gives an age in days);
  // otherwise fall back to the realtime-protection boolean. Card render
  // logic below switches on which signal we have.
  const avFinding = findingByControl.get("3.14.2");
  const avSigAgeMatch = avFinding?.observed.match(/SignatureAge=(\d+)/i);
  const avAgeDays = avSigAgeMatch ? parseInt(avSigAgeMatch[1], 10) : null;
  const avRealtimeEnabled =
    avFinding?.observed.match(/RealTimeProtectionEnabled=(True|False)/i)?.[1]?.toLowerCase() === "true"
      ? true
      : avFinding?.observed.match(/RealTimeProtectionEnabled=(True|False)/i)?.[1]?.toLowerCase() === "false"
        ? false
        : null;

  // 2. OS patch state — combines two signals:
  //    • 3.14.1 (`wuauserv` + bits service health) → headline PASS/FAIL
  //    • 3.14.4 (`win32_quickfixengineering` last-hotfix age) → days-old
  //      number when present. Surfaced as a sub-line so the auditor sees
  //      both "services running" AND "actually patched recently" without
  //      conflating the two like the previous AV-defs miswiring did.
  const wuFinding = findingByControl.get("3.14.1");
  const wuPass = wuFinding?.pass ?? null;
  const qfeFinding = findingByControl.get("3.14.4");
  const qfeAgeMatch = qfeFinding?.observed.match(/(\d+)\s*-?\s*days?\b/i);
  const qfeAgeDays = qfeAgeMatch ? parseInt(qfeAgeMatch[1], 10) : null;

  // 3. Open critical + high CVEs — count vuln_remediation register entries
  // with status=draft AND severity ∈ (critical, high). Will be 0 until
  // EnclaveWatch's MDVM collector starts pushing.
  const orgBoundaryRows = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const vulnRegCandidates = resolveRegisterKeyCandidates("vuln_remediation");
  let openCriticalHigh = 0;
  let totalVulnEntries = 0;
  if (orgBoundaryRows.length > 0 && vulnRegCandidates.length > 0) {
    const [vulnReg] = await db
      .select({ id: governanceRegisters.id })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          sql`${governanceRegisters.registerKey} IN (${sql.join(
            vulnRegCandidates.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      )
      .limit(1);
    if (vulnReg) {
      const entries = await db
        .select({ entryData: governanceRegisterEntries.entryData, status: governanceRegisterEntries.status })
        .from(governanceRegisterEntries)
        .where(
          and(
            eq(governanceRegisterEntries.registerId, vulnReg.id),
            inArray(
              governanceRegisterEntries.boundaryId,
              orgBoundaryRows.map((b) => b.id),
            ),
          ),
        );
      totalVulnEntries = entries.length;
      for (const e of entries) {
        if (e.status === "draft") {
          const sev = ((e.entryData ?? {}) as { severity?: string }).severity?.toLowerCase();
          if (sev === "critical" || sev === "high") openCriticalHigh++;
        }
      }
    }
  }

  // 4. TTR snapshot — median time-to-remediate for criticals + recent
  // regressions. Reuses the same vuln-stats helper that powers the 3.11.3
  // SCTM widget; we just take the critical slice for a single number.
  const vulnStats = await getVulnStatsForOrg(orgId);
  const criticalSlice = vulnStats?.ttrBySeverity.find((s) => s.severity === "critical");
  const ttrMedian = criticalSlice?.medianDays ?? null;
  const slaBreaches =
    vulnStats?.ttrBySeverity.reduce((acc, s) => acc + s.slaBreachCount, 0) ?? 0;

  // 5. Open POA&M items (org-wide) — count of poam_entries with status=open.
  // This is operational evidence the program is producing remediation plans
  // when controls fail, not a "fluctuating signal" — but it's useful at a
  // glance to know the open-plan backlog.
  const [poamCounts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${poamEntries.status} = 'open')::int`,
      overdue: sql<number>`count(*) filter (where ${poamEntries.status} = 'open' AND ${poamEntries.scheduledCompletionDate} < CURRENT_DATE)::int`,
    })
    .from(poamEntries)
    .where(eq(poamEntries.organizationId, orgId));
  const openPoams = poamCounts?.open ?? 0;
  const overduePoams = poamCounts?.overdue ?? 0;

  // 6. Recent attestation activity — last 5 signed completions for the
  // "Recent activity" feed; also flag any that are renewal-due (signed
  // > 365 days ago) for the "What needs attention" list. We pass the
  // cutoff as an ISO string because drizzle's sql`` template can't
  // serialize a Date directly.
  const ATTESTATION_RENEWAL_DAYS = 365;
  const renewalCutoffIso = new Date(now - ATTESTATION_RENEWAL_DAYS * MS_PER_DAY).toISOString();
  const expiredAttestations = await db
    .select({
      label: governanceArtifactCompletions.artifactLabel,
      attestedAt: governanceArtifactCompletions.attestedAt,
      controlId: controlRecords.controlId,
    })
    .from(governanceArtifactCompletions)
    .innerJoin(controlRecords, eq(governanceArtifactCompletions.controlRecordId, controlRecords.id))
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        sql`${governanceArtifactCompletions.attestedAt} IS NOT NULL`,
        sql`${governanceArtifactCompletions.attestedAt} < ${renewalCutoffIso}::timestamptz`,
      ),
    )
    .limit(20);
  // Dedupe by label (same template can fan out across multiple control records).
  const expiredAttestationLabels = new Set(expiredAttestations.map((a) => a.label));

  // ── Pending break-glass acknowledgments ────────────────────────────────
  // Surface every maintenance_log entry of type break_glass_acknowledgment
  // that's still in draft. The admin must finalize within 72h or the alert
  // escalates to the ISSO. Sorted by oldest-first so the most urgent
  // bubbles up.
  const ACK_STALE_HOURS = 72;
  const mlCandidates = resolveRegisterKeyCandidates("maintenance_log");
  const mlRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          mlCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );
  let pendingBreakGlassAcks: Array<{
    id: string;
    alertId: string;
    upn: string;
    detectedAt: string | null;
    source: string;
    ageHours: number;
    overdue: boolean;
  }> = [];
  if (mlRegisters.length > 0) {
    const draftRows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
        createdAt: governanceRegisterEntries.createdAt,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            mlRegisters.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
          eq(governanceRegisterEntries.entryType, "break_glass_acknowledgment"),
          eq(governanceRegisterEntries.status, "draft"),
        ),
      );
    pendingBreakGlassAcks = draftRows
      .map((r) => {
        const data = (r.entryData ?? {}) as Record<string, unknown>;
        const ageHours = Math.max(
          0,
          Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000),
        );
        return {
          id: r.id,
          alertId: (data.alert_id as string | undefined) ?? r.id,
          upn: (data.upn as string | undefined) ?? "(unknown)",
          detectedAt: (data.detected_at as string | undefined) ?? null,
          source: (data.source as string | undefined) ?? "unknown",
          ageHours,
          overdue: ageHours >= ACK_STALE_HOURS,
        };
      })
      .sort((a, b) => b.ageHours - a.ageHours);
  }

  // ── Pending privileged-grant justifications ────────────────────────────
  // Mirrors break-glass: surface every access_authorization entry of type
  // privileged_grant_acknowledgment that's still in draft. Admin justifies
  // within 72h or escalation to ISSO. Sorted oldest-first so the most
  // urgent bubbles up. (Phase 1 of Register-Automation v1.1 brief.)
  const aaCandidatesForPga = resolveRegisterKeyCandidates("access_authorization");
  const aaRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          aaCandidatesForPga.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );
  let pendingPrivilegedGrantAcks: Array<{
    id: string;
    alertId: string;
    actorUser: string;
    azureRoleName: string;
    scopeArm: string | null;
    detectedAt: string | null;
    occurredAt: string | null;
    ageHours: number;
    overdue: boolean;
  }> = [];
  if (aaRegisters.length > 0) {
    const pgaDraftRows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
        createdAt: governanceRegisterEntries.createdAt,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            aaRegisters.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
          eq(governanceRegisterEntries.entryType, "privileged_grant_acknowledgment"),
          eq(governanceRegisterEntries.status, "draft"),
        ),
      );
    pendingPrivilegedGrantAcks = pgaDraftRows
      .map((r) => {
        const data = (r.entryData ?? {}) as Record<string, unknown>;
        const ageHours = Math.max(
          0,
          Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000),
        );
        return {
          id: r.id,
          alertId: (data.alert_id as string | undefined) ?? r.id,
          actorUser: (data.actor_user as string | undefined) ?? "(unknown)",
          azureRoleName:
            (data.azure_role_name as string | undefined) ?? "(unknown role)",
          scopeArm: (data.scope_arm as string | null | undefined) ?? null,
          detectedAt: (data.detected_at as string | undefined) ?? null,
          occurredAt: (data.occurred_at as string | undefined) ?? null,
          ageHours,
          overdue: ageHours >= ACK_STALE_HOURS,
        };
      })
      .sort((a, b) => b.ageHours - a.ageHours);
  }

  // ── Pending configuration-drift justifications ─────────────────────────
  // Surface every change_drift_log entry in draft. The admin must justify
  // each detected drift event within 72h or the alert escalates to ISSO.
  // (Phase 2 of Register-Automation v1.1 brief.)
  const cdlCandidates = resolveRegisterKeyCandidates("change_drift_log");
  const cdlRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          cdlCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );
  let pendingChangeDriftAcks: Array<{
    id: string;
    alertId: string;
    actorUser: string;
    path: string;
    changeType: string;
    host: string | null;
    detectedAt: string | null;
    occurredAt: string | null;
    ageHours: number;
    overdue: boolean;
  }> = [];
  if (cdlRegisters.length > 0) {
    const cdlDraftRows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
        createdAt: governanceRegisterEntries.createdAt,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            cdlRegisters.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
          eq(governanceRegisterEntries.entryType, "change_drift_acknowledgment"),
          eq(governanceRegisterEntries.status, "draft"),
        ),
      );
    pendingChangeDriftAcks = cdlDraftRows
      .map((r) => {
        const data = (r.entryData ?? {}) as Record<string, unknown>;
        const ageHours = Math.max(
          0,
          Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000),
        );
        return {
          id: r.id,
          alertId: (data.alert_id as string | undefined) ?? r.id,
          actorUser: (data.actor_user as string | undefined) ?? "(unknown)",
          path: (data.path as string | undefined) ?? "(unknown path)",
          changeType:
            (data.change_type as string | undefined) ??
            (data.event_type as string | undefined) ??
            "(unknown)",
          host: (data.host as string | null | undefined) ?? null,
          detectedAt: (data.detected_at as string | undefined) ?? null,
          occurredAt: (data.occurred_at as string | undefined) ?? null,
          ageHours,
          overdue: ageHours >= ACK_STALE_HOURS,
        };
      })
      .sort((a, b) => b.ageHours - a.ageHours);
  }

  // ── Pending Defender alert acknowledgments ─────────────────────────────
  // Surface every incident_log entry of type defender_alert_acknowledgment
  // in draft. The admin must record an investigation outcome within 24h
  // (tighter than the 72h SLA on lower-severity surfaces) or the alert
  // escalates to ISSO on next weekly review. (Phase 3 of Register-
  // Automation v1.1 brief.)
  const DEFENDER_ACK_STALE_HOURS = 24;
  const ilCandidates = resolveRegisterKeyCandidates("incident_log");
  const ilRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          ilCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );
  let pendingDefenderAcks: Array<{
    id: string;
    alertId: string;
    alertTitle: string;
    severity: string;
    eventType: string;
    system: string | null;
    actorUser: string | null;
    detectedAt: string | null;
    occurredAt: string | null;
    ageHours: number;
    overdue: boolean;
  }> = [];
  if (ilRegisters.length > 0) {
    const defDraftRows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
        createdAt: governanceRegisterEntries.createdAt,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            ilRegisters.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
          eq(
            governanceRegisterEntries.entryType,
            "defender_alert_acknowledgment",
          ),
          eq(governanceRegisterEntries.status, "draft"),
        ),
      );
    pendingDefenderAcks = defDraftRows
      .map((r) => {
        const data = (r.entryData ?? {}) as Record<string, unknown>;
        const ageHours = Math.max(
          0,
          Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000),
        );
        return {
          id: r.id,
          alertId: (data.alert_id as string | undefined) ?? r.id,
          alertTitle:
            (data.actor_alert_title as string | undefined) ?? "(unknown alert)",
          severity: (data.severity as string | undefined) ?? "high",
          eventType: (data.event_type as string | undefined) ?? "(unknown)",
          system: (data.system as string | null | undefined) ?? null,
          actorUser: (data.actor_user as string | null | undefined) ?? null,
          detectedAt: (data.detected_at as string | undefined) ?? null,
          occurredAt: (data.occurred_at as string | undefined) ?? null,
          ageHours,
          overdue: ageHours >= DEFENDER_ACK_STALE_HOURS,
        };
      })
      .sort((a, b) => b.ageHours - a.ageHours);
  }

  // ── Recent ISSO manifest receipts ──────────────────────────────────────
  // Last 5 manifests the codex ingested. Proves the ISSO weekly cadence
  // is firing and gives the assessor an "audit trail of audit trails."
  const recentManifests = await db
    .select({
      manifestId: issoExportManifests.manifestId,
      manifestVersion: issoExportManifests.manifestVersion,
      reviewPeriodEnd: issoExportManifests.reviewPeriodEnd,
      receivedAt: issoExportManifests.receivedAt,
      controlsTouched: issoExportManifests.controlsTouched,
      sectionsProcessed: issoExportManifests.sectionsProcessed,
    })
    .from(issoExportManifests)
    .where(eq(issoExportManifests.organizationId, orgId))
    .orderBy(desc(issoExportManifests.receivedAt))
    .limit(5);

  // ── Phase 9: active threat narratives ────────────────────────────────
  // Cross-evidence joins (e.g., break-glass + privileged grant + Defender
  // alert from same actor). Surfaces threat stories the auditor would
  // otherwise have to assemble manually.
  // Phase 9 narratives query — wrapped in try/catch so a missing table
  // (pre-Phase-9 deploy, partial migration apply) doesn't 500 the
  // Monitoring page. The empty array makes the card hide silently.
  let threatNarrativesRecent: Awaited<
    ReturnType<typeof getRecentThreatNarratives>
  > = [];
  try {
    threatNarrativesRecent = await getRecentThreatNarratives(orgId, 30);
  } catch (err) {
    console.warn(
      "[monitoring] threat narratives query failed; rendering empty card:",
      err instanceof Error ? err.message : err,
    );
  }

  // ── ISSO observations rollup ───────────────────────────────────────────
  // Sums high+critical entries written by ISSO weekly review across three
  // registers in the last 14 days. Drives the admin "what did ISSO flag"
  // surface.
  const OBSERVATION_LOOKBACK_DAYS = 14;
  const obsCutoff = new Date(now - OBSERVATION_LOOKBACK_DAYS * MS_PER_DAY);

  // Resolve the three register sets we care about (alias-aware).
  const aaCandidates = resolveRegisterKeyCandidates("access_authorization");
  const afCandidates = resolveRegisterKeyCandidates("assessment_findings");
  const prCandidates = resolveRegisterKeyCandidates("policy_review");
  const allCandidates = [...aaCandidates, ...afCandidates, ...prCandidates];

  let issoObservations = {
    weeklyReviewFindings: 0,
    reviewObservations: 0,
    staleDocs: 0,
    breakGlassEscalated: 0,
    total: 0,
  };
  if (allCandidates.length > 0) {
    const obsRegisters = await db
      .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          sql`${governanceRegisters.registerKey} IN (${sql.join(
            allCandidates.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      );

    if (obsRegisters.length > 0) {
      const obsRows = await db
        .select({
          entryType: governanceRegisterEntries.entryType,
          entryData: governanceRegisterEntries.entryData,
        })
        .from(governanceRegisterEntries)
        .where(
          and(
            sql`${governanceRegisterEntries.registerId} IN (${sql.join(
              obsRegisters.map((r) => sql`${r.id}`),
              sql`, `,
            )})`,
            inArray(governanceRegisterEntries.entryType, [
              "weekly_review_finding",
              "review_observation",
              "stale_document_flag",
            ]),
            sql`${governanceRegisterEntries.createdAt} >= ${obsCutoff.toISOString()}::timestamptz`,
          ),
        );

      for (const r of obsRows) {
        const sev = (
          (r.entryData as { severity?: string } | null)?.severity ?? ""
        ).toLowerCase();
        const isHighOrCritical =
          sev === "critical" || sev === "high" || r.entryType === "stale_document_flag";
        if (!isHighOrCritical) continue;
        if (r.entryType === "weekly_review_finding") issoObservations.weeklyReviewFindings++;
        if (r.entryType === "review_observation") issoObservations.reviewObservations++;
        if (r.entryType === "stale_document_flag") issoObservations.staleDocs++;
      }
    }
  }

  // Break-glass escalations (entries with escalated_at set in last 14d).
  if (mlRegisters.length > 0) {
    const escalatedRows = await db
      .select({ entryData: governanceRegisterEntries.entryData })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            mlRegisters.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
          eq(governanceRegisterEntries.entryType, "break_glass_acknowledgment"),
          sql`${governanceRegisterEntries.entryData} ? 'escalated_at'`,
          sql`${governanceRegisterEntries.createdAt} >= ${obsCutoff.toISOString()}::timestamptz`,
        ),
      );
    issoObservations.breakGlassEscalated = escalatedRows.length;
  }

  issoObservations.total =
    issoObservations.weeklyReviewFindings +
    issoObservations.reviewObservations +
    issoObservations.staleDocs +
    issoObservations.breakGlassEscalated;

  // ── Open control_attention_items (Sprint 6.5) ──────────────────────────
  // Items the ISSO flagged via control_freshness.needing_attention[]. Admin
  // marks resolved via the small client component on this page.
  const openAttentionItems = await db
    .select({
      id: controlAttentionItems.id,
      controlId: controlAttentionItems.controlId,
      reason: controlAttentionItems.reason,
      severity: controlAttentionItems.severity,
      flaggedAt: controlAttentionItems.flaggedAt,
      flaggedByManifestId: controlAttentionItems.flaggedByManifestId,
    })
    .from(controlAttentionItems)
    .where(
      and(
        eq(controlAttentionItems.organizationId, orgId),
        isNull(controlAttentionItems.resolvedAt),
      ),
    )
    .orderBy(desc(controlAttentionItems.flaggedAt));

  // Drift signal: prefer Azure validator (most change-prone surface);
  // fall back to OS validator. OS bundle has 0 findings on its own runs
  // (it's a manifest, not a check) so it can't drive drift.
  const driftSource =
    perSource.find((s) => s.key === "azure_entra" && s.latest && s.previous) ??
    perSource.find((s) => s.key === "windows_server_hardening" && s.latest && s.previous) ??
    null;
  const drift =
    driftSource && driftSource.latest && driftSource.previous
      ? {
          source: driftSource.label,
          // Absolute counts on the latest run — DriftCell shows these as
          // the headline so a steady-state "no change since prior" reads
          // as "43 PASS, unchanged" instead of misleading "0".
          passCurrent: driftSource.latest.pass,
          partialCurrent: driftSource.latest.partial,
          failCurrent: driftSource.latest.fail,
          passDelta: driftSource.latest.pass - driftSource.previous.pass,
          partialDelta: driftSource.latest.partial - driftSource.previous.partial,
          failDelta: driftSource.latest.fail - driftSource.previous.fail,
          priorRunId: driftSource.previous.runId,
          currentRunId: driftSource.latest.runId,
          priorCollectedAt: driftSource.previous.collectedAt,
          currentCollectedAt: driftSource.latest.collectedAt,
        }
      : null;

  const recentRuns = runs.slice(0, 15);
  const totalRuns = runs.length;

  // Cadence health is judged separately from the ISSO weekly review.
  // The 3 automated sources (OS bundle, OS validator, Azure validator)
  // arm via cron on the vault. The ISSO weekly review is a manual
  // human action and may legitimately not have fired yet on a fresh
  // deployment -- that's not a "cadence not armed" condition, it's an
  // "awaiting first signature" condition.
  const automatedSources = perSource.filter((s) => s.key !== "enclavewatch_weekly_review");
  const issoSource = perSource.find((s) => s.key === "enclavewatch_weekly_review");
  const automatedArmed = automatedSources.every((s) => s.runCount > 0);
  const automatedAllGreen = automatedSources.every((s) => s.freshness === "green");
  const automatedAnyRed = automatedSources.some((s) => s.freshness === "red");
  const issoNeverRun = issoSource?.runCount === 0;

  // ── What Needs Attention ────────────────────────────────────────────
  // Aggregate operational signals into a single actionable list. Each
  // item is a row the operator can act on, ranked by urgency. Empty
  // list = "all clear, nothing in your queue today" which is itself
  // a defensible cadence statement.
  type Attn = {
    severity: "critical" | "warning" | "info";
    label: string;
    detail: string;
    href?: string;
  };
  const attention: Attn[] = [];

  // Stale cadence sources (red = >21 days)
  for (const s of perSource) {
    if (s.freshness === "red" && s.runCount > 0) {
      attention.push({
        severity: "critical",
        label: `${s.label} cadence stale`,
        detail: `Last run ${freshnessLabel(s.daysSince)}. EnclaveWatch may have stopped pushing — verify the vault service.`,
        href: "/dashboard/monitoring",
      });
    }
  }

  // Pending break-glass acknowledgments (overdue ones are critical)
  const overdueAcks = pendingBreakGlassAcks.filter((a) => a.overdue);
  const pendingAcks = pendingBreakGlassAcks.filter((a) => !a.overdue);
  if (overdueAcks.length > 0) {
    attention.push({
      severity: "critical",
      label: `${overdueAcks.length} break-glass acknowledgment${overdueAcks.length === 1 ? "" : "s"} OVERDUE`,
      detail: `Detected break-glass sign-in${overdueAcks.length === 1 ? "" : "s"} not acknowledged within 72h. ISSO will escalate on next weekly review.`,
      href: "/dashboard/monitoring",
    });
  }
  if (pendingAcks.length > 0) {
    attention.push({
      severity: "warning",
      label: `${pendingAcks.length} break-glass sign-in${pendingAcks.length === 1 ? "" : "s"} awaiting acknowledgment`,
      detail: `File the maintenance log within 72h of detection or the alert escalates.`,
      href: "/dashboard/monitoring",
    });
  }

  // Pending privileged-grant justifications (Phase 1)
  const overduePrivilegedAcks = pendingPrivilegedGrantAcks.filter((a) => a.overdue);
  const pendingPrivilegedAcksOpen = pendingPrivilegedGrantAcks.filter((a) => !a.overdue);
  if (overduePrivilegedAcks.length > 0) {
    attention.push({
      severity: "critical",
      label: `${overduePrivilegedAcks.length} privileged-grant justification${overduePrivilegedAcks.length === 1 ? "" : "s"} OVERDUE`,
      detail: `Privileged role grant${overduePrivilegedAcks.length === 1 ? "" : "s"} not justified within 72h of detection. ISSO will escalate on next weekly review.`,
      href: "/dashboard/monitoring",
    });
  }
  if (pendingPrivilegedAcksOpen.length > 0) {
    attention.push({
      severity: "warning",
      label: `${pendingPrivilegedAcksOpen.length} privileged role grant${pendingPrivilegedAcksOpen.length === 1 ? "" : "s"} awaiting justification`,
      detail: `Provide business justification, sunset plan, and outcome within 72h of detection.`,
      href: "/dashboard/monitoring",
    });
  }

  // Pending configuration-drift justifications (Phase 2)
  const overdueDriftAcks = pendingChangeDriftAcks.filter((a) => a.overdue);
  const pendingDriftAcksOpen = pendingChangeDriftAcks.filter((a) => !a.overdue);
  if (overdueDriftAcks.length > 0) {
    attention.push({
      severity: "critical",
      label: `${overdueDriftAcks.length} configuration-drift justification${overdueDriftAcks.length === 1 ? "" : "s"} OVERDUE`,
      detail: `Sysmon detected baseline-protected change${overdueDriftAcks.length === 1 ? "" : "s"} with no matching change_log entry, not justified within 72h. ISSO will escalate on next weekly review.`,
      href: "/dashboard/monitoring",
    });
  }
  if (pendingDriftAcksOpen.length > 0) {
    attention.push({
      severity: "warning",
      label: `${pendingDriftAcksOpen.length} configuration drift${pendingDriftAcksOpen.length === 1 ? "" : "s"} awaiting justification`,
      detail: `Provide business justification + outcome within 72h of detection. Common outcomes: intended_change_no_change_log, false_positive, unauthorized_change_remediated.`,
      href: "/dashboard/monitoring",
    });
  }

  // Pending Defender alert acknowledgments (Phase 3)
  // Defender alerts always start at warning severity. Critical-severity
  // Defender alerts and any overdue alert (>24h) bubble up as critical.
  const overdueDefenderAcks = pendingDefenderAcks.filter((a) => a.overdue);
  const pendingDefenderAcksOpen = pendingDefenderAcks.filter((a) => !a.overdue);
  const criticalDefenderAcksOpen = pendingDefenderAcksOpen.filter(
    (a) => a.severity === "critical",
  );
  if (overdueDefenderAcks.length > 0) {
    attention.push({
      severity: "critical",
      label: `${overdueDefenderAcks.length} Defender alert${overdueDefenderAcks.length === 1 ? "" : "s"} OVERDUE`,
      detail: `High/critical Defender for Endpoint alert${overdueDefenderAcks.length === 1 ? "" : "s"} not acknowledged within 24h. ISSO will escalate on next weekly review.`,
      href: "/dashboard/monitoring",
    });
  }
  if (criticalDefenderAcksOpen.length > 0) {
    attention.push({
      severity: "critical",
      label: `${criticalDefenderAcksOpen.length} CRITICAL Defender alert${criticalDefenderAcksOpen.length === 1 ? "" : "s"} awaiting acknowledgment`,
      detail: `Investigate, record outcome (true_positive_remediated / false_positive_investigated / risk_accepted) within 24h.`,
      href: "/dashboard/monitoring",
    });
  }
  const warningDefenderAcksOpen = pendingDefenderAcksOpen.filter(
    (a) => a.severity !== "critical",
  );
  if (warningDefenderAcksOpen.length > 0) {
    attention.push({
      severity: "warning",
      label: `${warningDefenderAcksOpen.length} Defender alert${warningDefenderAcksOpen.length === 1 ? "" : "s"} awaiting acknowledgment`,
      detail: `Investigate within 24h. Outcomes: true_positive_remediated, true_positive_in_progress, false_positive_investigated, risk_accepted.`,
      href: "/dashboard/monitoring",
    });
  }

  // ISSO open observations (high/critical severity flagged in last 14d)
  if (issoObservations.total > 0) {
    const parts: string[] = [];
    if (issoObservations.weeklyReviewFindings > 0)
      parts.push(`${issoObservations.weeklyReviewFindings} access-review finding(s)`);
    if (issoObservations.reviewObservations > 0)
      parts.push(`${issoObservations.reviewObservations} review observation(s)`);
    if (issoObservations.staleDocs > 0)
      parts.push(`${issoObservations.staleDocs} stale policy document(s)`);
    if (issoObservations.breakGlassEscalated > 0)
      parts.push(`${issoObservations.breakGlassEscalated} escalated break-glass alert(s)`);

    attention.push({
      severity: issoObservations.breakGlassEscalated > 0 ? "critical" : "warning",
      label: `ISSO flagged ${issoObservations.total} item${issoObservations.total === 1 ? "" : "s"} this period`,
      detail: parts.join(" · "),
      href: "/dashboard/registers",
    });
  }

  // Open critical/high CVEs
  if (openCriticalHigh > 0) {
    attention.push({
      severity: "critical",
      label: `${openCriticalHigh} open critical/high CVE${openCriticalHigh === 1 ? "" : "s"}`,
      detail: "From vuln_remediation register. Patch or document risk acceptance to satisfy 3.11.3 SLA.",
      href: "/dashboard/evidence-engine/registers/vuln_remediation",
    });
  }

  // Recent regressions (regressed_at within last 30 days)
  if (vulnStats?.regressionCount && vulnStats.regressionCount > 0 && vulnStats.latestRegressionAt) {
    const daysAgoRegressed = Math.floor(
      (now - new Date(vulnStats.latestRegressionAt).getTime()) / MS_PER_DAY,
    );
    if (daysAgoRegressed <= 30) {
      attention.push({
        severity: "warning",
        label: `${vulnStats.regressionCount} CVE regression${vulnStats.regressionCount === 1 ? "" : "s"} this cycle`,
        detail: `A previously-resolved CVE flipped back to open (most recent ${daysAgoRegressed}d ago). Investigate why the fix didn't hold.`,
        href: "/dashboard/evidence-engine/registers/vuln_remediation",
      });
    }
  }

  // SLA breaches (any severity)
  if (slaBreaches > 0) {
    attention.push({
      severity: "warning",
      label: `${slaBreaches} CVE SLA breach${slaBreaches === 1 ? "" : "es"}`,
      detail: "Findings whose fix time exceeded the org SLA target (30d/90d/180d/365d by severity). Document acceptance or escalate.",
      href: "/dashboard/evidence-engine/controls/3.11.3",
    });
  }

  // Expired attestations
  if (expiredAttestationLabels.size > 0) {
    attention.push({
      severity: "warning",
      label: `${expiredAttestationLabels.size} attestation${expiredAttestationLabels.size === 1 ? "" : "s"} due for renewal`,
      detail: `Signed > ${ATTESTATION_RENEWAL_DAYS} days ago. Re-sign on the readiness page to keep the program current.`,
      href: "/dashboard/readiness/outstanding",
    });
  }

  // Overdue POA&Ms
  if (overduePoams > 0) {
    attention.push({
      severity: "warning",
      label: `${overduePoams} POA&M item${overduePoams === 1 ? "" : "s"} past target date`,
      detail: "Scheduled completion date has passed. Revise the date or close the item with closeout evidence.",
      href: "/dashboard/poam",
    });
  }

  // ISSO sign-off awaiting
  if (automatedAllGreen && issoNeverRun) {
    attention.push({
      severity: "info",
      label: "First ISSO weekly review pending",
      detail: "Automated cadence is healthy. Sign the first weekly review packet to complete the program loop.",
      href: "/dashboard/monitoring",
    });
  }

  attention.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <Activity className="h-6 w-6 text-[var(--color-blue-accent)]" aria-hidden />
          <h1 className="text-2xl font-bold text-[var(--color-navy-primary)]">Continuous Monitoring</h1>
          {!automatedArmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Cadence not yet armed
            </span>
          )}
          {automatedArmed && automatedAnyRed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
              <AlertTriangle className="h-3 w-3" /> Cadence stale
            </span>
          )}
          {automatedArmed && !automatedAnyRed && automatedAllGreen && issoNeverRun && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              <Activity className="h-3 w-3" /> Cadence healthy · awaiting first ISSO sign-off
            </span>
          )}
          {automatedArmed && !automatedAnyRed && automatedAllGreen && !issoNeverRun && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3" /> Program healthy
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-gray-600)]">
          MacTech <strong>EnclaveWatch</strong> is the operational program for NIST 800-171 §3.12.3.
          It runs the canonical evidence collectors + validators inside the CUI Vault on weekly
          cadence and pushes signed metadata-only acknowledgements to the Codex (raw audit data
          never leaves the boundary). This page surfaces the heartbeat, history, and drift across
          all four cadence sources.
        </p>
      </header>

      {/* ── Section 0: What needs attention ─────────────────────────── */}
      {attention.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              What needs attention
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)]">
              {attention.length} item{attention.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className={`${cardClass} space-y-2 p-4`}>
            {attention.map((a, i) => {
              const tone =
                a.severity === "critical"
                  ? { wrap: "border-red-200 bg-red-50/60", icon: "text-red-700", iconBg: "bg-red-100" }
                  : a.severity === "warning"
                    ? { wrap: "border-amber-200 bg-amber-50/60", icon: "text-amber-700", iconBg: "bg-amber-100" }
                    : { wrap: "border-blue-200 bg-blue-50/40", icon: "text-blue-700", iconBg: "bg-blue-100" };
              const Icon =
                a.severity === "critical" ? AlertTriangle : a.severity === "warning" ? FileWarning : Inbox;
              return (
                <div key={i} className={`rounded-md border ${tone.wrap} px-3 py-2.5`}>
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone.iconBg}`}>
                      <Icon className={`h-3.5 w-3.5 ${tone.icon}`} aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-navy-primary)]">
                        {a.label}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">{a.detail}</p>
                    </div>
                    {a.href && (
                      <Link
                        href={a.href}
                        className="shrink-0 inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section>
          <div className={`${cardClass} flex items-center gap-3 bg-emerald-50/30 p-4`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-900">All clear</p>
              <p className="text-xs text-emerald-800">
                No stale cadences, no open critical/high CVEs, no SLA breaches, no expired attestations, no overdue POA&amp;Ms.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 0a2: Active threat narratives (Phase 9) ─────────── */}
      {threatNarrativesRecent.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Active threat narratives
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
              {threatNarrativesRecent.length} narrative{threatNarrativesRecent.length === 1 ? "" : "s"} (last 30d)
            </span>
          </div>
          <div className={`${cardClass} space-y-2 p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              Cross-evidence joins detected by the Phase 9 correlation
              engine — e.g., a break-glass session + privileged role grant
              from the same actor, or configuration drift + a Defender
              alert on the same host. Each narrative is a Pattern A loop:
              admin signs investigation outcome, ISSO verifies on next
              weekly review.
            </p>
            <ul className="mt-3 space-y-1.5">
              {threatNarrativesRecent.map((n) => {
                const related = Array.isArray(n.relatedEntryIds)
                  ? (n.relatedEntryIds as Array<{ entry_id: string }>)
                  : [];
                const tone =
                  n.status === "open"
                    ? "border-purple-200 bg-purple-50/60 text-purple-900"
                    : n.status === "isso_verified" ||
                      n.status === "admin_resolved"
                    ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                    : n.status === "false_positive"
                    ? "border-gray-200 bg-gray-50/60 text-gray-700"
                    : "border-amber-200 bg-amber-50/60 text-amber-900";
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 rounded-md border ${tone} px-3 py-2 text-sm`}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-purple-700">
                      <Flame className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">
                          {n.narrativeType.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide opacity-70">
                          {n.status}
                        </span>
                        <span className="text-[10px] opacity-70">
                          confidence {Math.round(n.confidence * 100)}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-90">{n.summary}</p>
                      <p className="mt-0.5 text-[10px] opacity-70">
                        opened {new Date(n.openedAt).toLocaleString()} · last observed{" "}
                        {new Date(n.lastObservedAt).toLocaleString()} ·{" "}
                        {related.length} contributing entr{related.length === 1 ? "y" : "ies"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── Section 0b: Pending break-glass acknowledgments ─────────── */}
      {pendingBreakGlassAcks.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Pending break-glass acknowledgments
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {pendingBreakGlassAcks.length} open · {overdueAcks.length} overdue
            </span>
          </div>
          <div className={`${cardClass} space-y-2 p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              EnclaveWatch detected sign-ins by the break-glass account. The
              admin who used break-glass must file an acknowledgment maintenance
              log within 72 hours, or the alert escalates to the ISSO on next
              weekly review.
            </p>
            <ul className="mt-3 space-y-1.5">
              {pendingBreakGlassAcks.map((ack) => {
                const tone = ack.overdue
                  ? "border-red-200 bg-red-50/60 text-red-900"
                  : "border-amber-200 bg-amber-50/60 text-amber-900";
                const remaining = Math.max(0, 72 - ack.ageHours);
                const ageLabel = ack.overdue
                  ? `OVERDUE — ${ack.ageHours - 72}h past 72h deadline`
                  : `${remaining}h remaining`;
                return (
                  <li
                    key={ack.id}
                    className={`flex items-start gap-3 rounded-md border ${tone} px-3 py-2 text-sm`}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{ack.upn}</span>
                        <span className="text-[11px] uppercase tracking-wide opacity-80">
                          via {ack.source}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-80">
                        Detected{" "}
                        {ack.detectedAt
                          ? new Date(ack.detectedAt).toLocaleString()
                          : "(unknown)"}{" "}
                        · {ageLabel}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] opacity-70 break-words">
                        alert: {ack.alertId}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/evidence-engine/entries/${ack.id}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-current bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-opacity-80"
                    >
                      Acknowledge <ExternalLink className="h-3 w-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── Section 0b2: Pending privileged-grant justifications ───── */}
      {pendingPrivilegedGrantAcks.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Pending privileged-grant justifications
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {pendingPrivilegedGrantAcks.length} open · {overduePrivilegedAcks.length} overdue
            </span>
          </div>
          <div className={`${cardClass} space-y-2 p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              EnclaveWatch detected privileged role assignments (Owner /
              Contributor / User Access Administrator). The admin must
              justify each grant within 72 hours with a business purpose,
              sunset plan, and outcome — or the alert escalates to the
              ISSO on next weekly review.
            </p>
            <ul className="mt-3 space-y-1.5">
              {pendingPrivilegedGrantAcks.map((ack) => {
                const tone = ack.overdue
                  ? "border-red-200 bg-red-50/60 text-red-900"
                  : "border-amber-200 bg-amber-50/60 text-amber-900";
                const remaining = Math.max(0, 72 - ack.ageHours);
                const ageLabel = ack.overdue
                  ? `OVERDUE — ${ack.ageHours - 72}h past 72h deadline`
                  : `${remaining}h remaining`;
                return (
                  <li
                    key={ack.id}
                    className={`flex items-start gap-3 rounded-md border ${tone} px-3 py-2 text-sm`}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                      <Shield className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{ack.actorUser}</span>
                        <span className="text-[11px] uppercase tracking-wide opacity-80">
                          {ack.azureRoleName}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-80">
                        {ack.scopeArm ? <>scope <span className="font-mono">{ack.scopeArm}</span> · </> : null}
                        Granted{" "}
                        {ack.occurredAt
                          ? new Date(ack.occurredAt).toLocaleString()
                          : ack.detectedAt
                          ? new Date(ack.detectedAt).toLocaleString()
                          : "(unknown)"}{" "}
                        · {ageLabel}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] opacity-70 break-words">
                        alert: {ack.alertId}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/evidence-engine/entries/${ack.id}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-current bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-opacity-80"
                    >
                      Justify <ExternalLink className="h-3 w-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── Section 0b3: Pending configuration-drift justifications ── */}
      {pendingChangeDriftAcks.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Pending configuration-drift justifications
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {pendingChangeDriftAcks.length} open · {overdueDriftAcks.length} overdue
            </span>
          </div>
          <div className={`${cardClass} space-y-2 p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              EnclaveWatch&apos;s Sysmon-based collector detected baseline-
              protected file/registry/service changes with no matching{" "}
              <code className="font-mono">change_log</code> entry within ±60
              minutes. The admin must justify each event within 72 hours
              (intended ticketed change / false positive / unauthorized
              change remediated) or the alert escalates to the ISSO on next
              weekly review.
            </p>
            <ul className="mt-3 space-y-1.5">
              {pendingChangeDriftAcks.map((ack) => {
                const tone = ack.overdue
                  ? "border-red-200 bg-red-50/60 text-red-900"
                  : "border-amber-200 bg-amber-50/60 text-amber-900";
                const remaining = Math.max(0, 72 - ack.ageHours);
                const ageLabel = ack.overdue
                  ? `OVERDUE — ${ack.ageHours - 72}h past 72h deadline`
                  : `${remaining}h remaining`;
                return (
                  <li
                    key={ack.id}
                    className={`flex items-start gap-3 rounded-md border ${tone} px-3 py-2 text-sm`}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                      <FileWarning className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium font-mono break-words">
                          {ack.path}
                        </span>
                        <span className="text-[11px] uppercase tracking-wide opacity-80">
                          {ack.changeType}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-80">
                        {ack.host ? <>host <span className="font-mono">{ack.host}</span> · </> : null}
                        actor <span className="font-mono">{ack.actorUser}</span>{" "}
                        ·{" "}
                        Occurred{" "}
                        {ack.occurredAt
                          ? new Date(ack.occurredAt).toLocaleString()
                          : ack.detectedAt
                          ? new Date(ack.detectedAt).toLocaleString()
                          : "(unknown)"}{" "}
                        · {ageLabel}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] opacity-70 break-words">
                        alert: {ack.alertId}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/evidence-engine/entries/${ack.id}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-current bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-opacity-80"
                    >
                      Justify <ExternalLink className="h-3 w-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── Section 0b4: Pending Defender alert acknowledgments ────── */}
      {pendingDefenderAcks.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Pending Defender alert acknowledgments
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
              {pendingDefenderAcks.length} open · {overdueDefenderAcks.length} overdue
            </span>
          </div>
          <div className={`${cardClass} space-y-2 p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              Microsoft Defender for Endpoint raised one or more high or
              critical alerts. The admin must record an investigation outcome
              within 24 hours (true positive remediated / in progress / false
              positive / risk accepted) or the alert escalates to the ISSO on
              next weekly review.
            </p>
            <ul className="mt-3 space-y-1.5">
              {pendingDefenderAcks.map((ack) => {
                const isCritical = ack.severity === "critical";
                const tone =
                  ack.overdue || isCritical
                    ? "border-red-200 bg-red-50/60 text-red-900"
                    : "border-amber-200 bg-amber-50/60 text-amber-900";
                const remaining = Math.max(0, 24 - ack.ageHours);
                const ageLabel = ack.overdue
                  ? `OVERDUE — ${ack.ageHours - 24}h past 24h deadline`
                  : `${remaining}h remaining`;
                return (
                  <li
                    key={ack.id}
                    className={`flex items-start gap-3 rounded-md border ${tone} px-3 py-2 text-sm`}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                      <Flame className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium break-words">
                          {ack.alertTitle}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-wide font-bold ${
                            isCritical
                              ? "rounded bg-red-700 px-1.5 py-0.5 text-white"
                              : "opacity-80"
                          }`}
                        >
                          {ack.severity}
                        </span>
                        <span className="text-[11px] uppercase tracking-wide opacity-80">
                          {ack.eventType}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-80">
                        {ack.system ? <>system <span className="font-mono">{ack.system}</span> · </> : null}
                        {ack.actorUser ? <>actor <span className="font-mono">{ack.actorUser}</span> · </> : null}
                        Detected{" "}
                        {ack.occurredAt
                          ? new Date(ack.occurredAt).toLocaleString()
                          : ack.detectedAt
                          ? new Date(ack.detectedAt).toLocaleString()
                          : "(unknown)"}{" "}
                        · {ageLabel}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] opacity-70 break-words">
                        alert: {ack.alertId}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/evidence-engine/entries/${ack.id}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-current bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-opacity-80"
                    >
                      Acknowledge <ExternalLink className="h-3 w-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* "Recent ISSO weekly exports" lives at the bottom of the page now;
          see the collapsed section just above the footer note. */}

      {/* ── Section 0d: ISSO observations rollup ───────────────────── */}
      {issoObservations.total > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              ISSO observations (last 14 days)
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {issoObservations.total} flagged
            </span>
          </div>
          <div className={`${cardClass} grid grid-cols-2 gap-3 p-4 sm:grid-cols-4`}>
            <ObservationTile
              icon={Eye}
              label="Access-review findings"
              count={issoObservations.weeklyReviewFindings}
              href="/dashboard/evidence-engine/registers/access_authorization"
              tone="amber"
            />
            <ObservationTile
              icon={FileWarning}
              label="Review observations"
              count={issoObservations.reviewObservations}
              href="/dashboard/evidence-engine/registers/assessment_findings"
              tone="amber"
            />
            <ObservationTile
              icon={ScrollText}
              label="Stale policy docs"
              count={issoObservations.staleDocs}
              href="/dashboard/evidence-engine/registers/policy_review"
              tone="amber"
            />
            <ObservationTile
              icon={Flame}
              label="Escalated break-glass"
              count={issoObservations.breakGlassEscalated}
              href="/dashboard/evidence-engine/registers/maintenance_log"
              tone={issoObservations.breakGlassEscalated > 0 ? "red" : "gray"}
            />
          </div>
        </section>
      )}

      {/* ── Section 0e: Open admin actions (control_freshness.needing_attention) ── */}
      {openAttentionItems.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Open admin actions
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {openAttentionItems.length} flagged by ISSO
            </span>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              The ISSO flagged these controls during weekly review. Each row
              represents a control whose evidence freshness, posture, or
              process needs admin follow-up. Click <strong>Mark resolved</strong>{" "}
              once the underlying issue is addressed.
            </p>
            <ul className="mt-3 space-y-1.5">
              {openAttentionItems.map((item) => {
                const tone =
                  item.severity === "critical"
                    ? "border-red-200 bg-red-50/60 text-red-900"
                    : item.severity === "warning"
                      ? "border-amber-200 bg-amber-50/60 text-amber-900"
                      : "border-blue-200 bg-blue-50/40 text-blue-900";
                return (
                  <li
                    key={item.id}
                    className={`flex items-start gap-3 rounded-md border ${tone} px-3 py-2 text-sm`}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                      <FileWarning className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link
                          href={`/dashboard/cae/${encodeURIComponent(item.controlId)}`}
                          className="font-medium underline decoration-dotted hover:no-underline"
                        >
                          {item.controlId}
                        </Link>
                        <span className="text-[11px] uppercase tracking-wide opacity-80">
                          {item.severity}
                        </span>
                        <span className="text-[11px] opacity-70">
                          flagged {new Date(item.flaggedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-90">{item.reason}</p>
                    </div>
                    <AttentionResolveButton itemId={item.id} />
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── Section 1: Program health (4 source pills) ─────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Program health
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perSource.map((s) => {
            const cls = freshnessClasses(s.freshness);
            const Icon = s.icon;
            const deepLink = enclavewatchBaseUrl
              ? `${enclavewatchBaseUrl}/?source=${encodeURIComponent(s.key)}`
              : null;
            const cardCommonCls = `${cardClass} relative ring-2 ring-offset-2 ring-offset-[var(--color-bg)] ${cls.ring}`;
            const wrapperProps = deepLink
              ? {
                  href: deepLink,
                  target: "_blank" as const,
                  rel: "noreferrer noopener",
                  title: `Open ${s.label} in EnclaveWatch (${enclavewatchBaseUrl}). Requires reachability from your network.`,
                  className: `${cardCommonCls} block transition hover:bg-[var(--color-gray-50)] hover:ring-offset-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-blue-accent)]/30`,
                }
              : { className: cardCommonCls };
            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <Icon className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} />
                    {freshnessLabel(s.daysSince)}
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-[var(--color-navy-primary)]">
                  <span>{s.label}</span>
                  {deepLink && (
                    <ExternalLink className="h-3 w-3 text-[var(--color-gray-400)]" aria-hidden />
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-gray-500)]">{s.subtitle}</p>
                {s.latest ? (
                  s.kind === "manifest" ? (
                    <div className="mt-3 text-xs text-[var(--color-gray-600)]">
                      <span className="font-semibold text-[var(--color-navy-primary)]">{s.latest.runId.slice(0, 28)}…</span>
                      <p className="mt-0.5 text-[10px] text-[var(--color-gray-500)] italic">
                        Manifest collector — captures evidence files, no per-control checks.
                      </p>
                    </div>
                  ) : s.kind === "signoff" ? (
                    <div className="mt-3 text-xs text-[var(--color-gray-600)]">
                      <span className="font-semibold text-emerald-700">Signed</span>
                      <p className="mt-0.5 text-[10px] text-[var(--color-gray-500)]">
                        Latest acknowledgement {freshnessLabel(s.daysSince)}.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold tabular-nums text-[var(--color-navy-primary)]">
                          {s.latest.pass + s.latest.partial + s.latest.fail}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">checks ran</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--color-gray-600)]">
                        <span><span className="font-semibold text-emerald-700">{s.latest.pass}</span> pass</span>
                        {s.latest.partial > 0 && (
                          <span><span className="font-semibold text-blue-700">{s.latest.partial}</span> partial</span>
                        )}
                        {s.latest.fail > 0 && (
                          <span><span className="font-semibold text-amber-700">{s.latest.fail}</span> fail</span>
                        )}
                        {s.latest.partial === 0 && s.latest.fail === 0 && (
                          <span className="text-[var(--color-gray-400)]">all clean</span>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <p className="mt-3 text-xs italic text-[var(--color-gray-500)]">
                    Awaiting first cadence run
                  </p>
                )}
                <p className="mt-3 text-[11px] text-[var(--color-gray-400)]">
                  {s.runCount} run{s.runCount === 1 ? "" : "s"} on file
                </p>
              </>
            );
            return deepLink ? (
              <a key={s.key} {...wrapperProps}>{inner}</a>
            ) : (
              <div key={s.key} {...wrapperProps}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* ── Section 2: Host vitals (live signals an assessor opens with) ── */}
      {latestOsValidatorRun && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Host vitals
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <VitalCard
              icon={Shield}
              label="AV definitions"
              control="SI 3.14.2"
              value={
                avAgeDays !== null
                  ? `${avAgeDays}d`
                  : avRealtimeEnabled === true
                  ? "Active"
                  : avRealtimeEnabled === false
                  ? "Off"
                  : "—"
              }
              valueLabel={
                avAgeDays !== null
                  ? avAgeDays === 0
                    ? "current today"
                    : avAgeDays === 1
                    ? "1 day old"
                    : `${avAgeDays} days old`
                  : avRealtimeEnabled === true
                  ? "Defender real-time protection on"
                  : avRealtimeEnabled === false
                  ? "Defender real-time protection OFF"
                  : "Not captured"
              }
              tone={
                avAgeDays !== null
                  ? avAgeDays <= 7
                    ? "good"
                    : avAgeDays <= 14
                    ? "warn"
                    : "bad"
                  : avRealtimeEnabled === true
                  ? "good"
                  : avRealtimeEnabled === false
                  ? "bad"
                  : "neutral"
              }
              hint="Microsoft Defender state — assessor-relevant for malicious code protection (3.14.2)"
            />
            <VitalCard
              icon={Wrench}
              label="OS patch posture"
              control="SI 3.14.1"
              value={wuPass === null ? "—" : wuPass ? "Healthy" : "Stalled"}
              valueLabel={
                wuPass === null
                  ? "No data yet"
                  : wuPass
                  ? qfeAgeDays !== null
                    ? `wuauserv + bits ready · last hotfix ${qfeAgeDays}d ago`
                    : "wuauserv + bits ready"
                  : "Update services not running"
              }
              tone={wuPass === null ? "neutral" : wuPass ? "good" : "bad"}
              hint="Windows Update services state — proxy for flaw remediation cadence (real day-count comes when EnclaveWatch captures WU history)"
            />
            <VitalCard
              icon={Bug}
              label="Open Critical+High CVEs"
              control="3.11.2 / 3.11.3"
              value={totalVulnEntries === 0 ? "—" : String(openCriticalHigh)}
              valueLabel={totalVulnEntries === 0 ? "Awaiting first MDVM cadence" : openCriticalHigh === 0 ? "no high-severity open" : "needs remediation"}
              tone={totalVulnEntries === 0 ? "neutral" : openCriticalHigh === 0 ? "good" : openCriticalHigh <= 3 ? "warn" : "bad"}
              hint="Defender Vulnerability Management feed via EnclaveWatch — count of unresolved CVEs at severity ≥ high"
            />
            <VitalCard
              icon={Zap}
              label="Critical CVE TTR (median)"
              control="3.11.3"
              value={ttrMedian === null ? "—" : `${ttrMedian.toFixed(1)}d`}
              valueLabel={
                ttrMedian === null
                  ? "no resolved criticals yet"
                  : slaBreaches > 0
                    ? `${slaBreaches} SLA breach${slaBreaches === 1 ? "" : "es"}`
                    : "within 30d SLA"
              }
              tone={
                ttrMedian === null
                  ? "neutral"
                  : ttrMedian > 30
                    ? "bad"
                    : ttrMedian > 22
                      ? "warn"
                      : "good"
              }
              hint="Median time-to-remediate for resolved critical-severity CVEs (first_detected_utc → fixed_utc). 30d SLA target."
            />
          </div>
        </section>
      )}

      {/* ── Section 3: Drift signal ───────────────────────────────── */}
      {drift && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Drift since last cycle
          </h2>
          <div className={cardClass}>
            <div className="flex items-start gap-3">
              <ClockAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-blue-accent)]" aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--color-navy-primary)]">
                  {drift.source}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                  Comparing run from{" "}
                  <span className="font-medium text-[var(--color-gray-700)]">
                    {drift.priorCollectedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>{" "}
                  against{" "}
                  <span className="font-medium text-[var(--color-gray-700)]">
                    {drift.currentCollectedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <span className="ml-1 text-[var(--color-gray-400)]" title={`prior: ${drift.priorRunId} → current: ${drift.currentRunId}`}>
                    ⓘ
                  </span>
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <DriftCell label="PASS" current={drift.passCurrent} delta={drift.passDelta} positiveIsGood />
                  <DriftCell label="PARTIAL" current={drift.partialCurrent} delta={drift.partialDelta} positiveIsGood={false} />
                  <DriftCell label="FAIL" current={drift.failCurrent} delta={drift.failDelta} positiveIsGood={false} />
                </div>
                {drift.passDelta === 0 && drift.partialDelta === 0 && drift.failDelta === 0 && (
                  <p className="mt-3 text-xs text-[var(--color-gray-500)]">
                    No change in the validator finding set since the prior cycle. Steady state.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 3: Cadence history (last 15 runs) ─────────────── */}
      <CollapsibleMonitoringSection
        title="Cadence history"
        badge={
          totalRuns > recentRuns.length ? (
            <Link
              href="/dashboard/evidence/upload-manifest"
              className="text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View all {totalRuns} uploads <ExternalLink className="ml-0.5 inline h-3 w-3" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)]">
              last {recentRuns.length}
            </span>
          )
        }
      >
        <div className={`${cardClass} overflow-hidden p-0`}>
          {recentRuns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <CircleSlash className="h-8 w-8 text-[var(--color-gray-400)]" />
              <p className="text-sm font-medium text-[var(--color-gray-700)]">
                No cadence runs yet
              </p>
              <p className="max-w-md text-xs text-[var(--color-gray-500)]">
                EnclaveWatch hasn&apos;t pushed any evidence to the codex yet. Verify the vault
                service is running and the configured Codex bearer token resolves
                (<code className="font-mono text-[10px]">/api/auth/me</code> on the vault side).
                The weekly cron fires Sundays at 02:00 vault-local.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-4 py-2.5">Run ID</th>
                    <th className="px-4 py-2.5">Collected</th>
                    <th className="px-4 py-2.5 text-right">PASS</th>
                    <th className="px-4 py-2.5 text-right">PARTIAL</th>
                    <th className="px-4 py-2.5 text-right">FAIL</th>
                    <th className="px-4 py-2.5">Bundle</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => {
                    const sourceMeta = SOURCES.find((s) => s.key === r.source);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--color-border)] last:border-none hover:bg-[var(--color-surface-muted)]/50"
                      >
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-gray-700)]">
                            {sourceMeta?.label ?? r.source}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-gray-700)]">
                          {r.runId}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-gray-600)]">
                          {r.collectedAt.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.pass > 0 ? (
                            <span className="font-semibold text-emerald-700">{r.pass}</span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.partial > 0 ? (
                            <span className="font-semibold text-blue-700">{r.partial}</span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.fail > 0 ? (
                            <span className="font-semibold text-amber-700">{r.fail}</span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--color-gray-500)] truncate max-w-[200px]">
                          {r.bundleRoot || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleMonitoringSection>

      {/* ── Section 4: Recent ISSO weekly exports (collapsed; moved to
              bottom per UX feedback — it's a deep-detail audit drawer,
              not headline data, so it shouldn't push live signal down). */}
      {recentManifests.length > 0 && (
        <CollapsibleMonitoringSection
          title="Recent ISSO weekly exports"
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)]">
              last {recentManifests.length}
            </span>
          }
        >
          <div className={`${cardClass} p-4`}>
            <p className="text-xs text-[var(--color-gray-600)]">
              Each row is a signed weekly export from EnclaveWatch. The
              ISSO&apos;s signature on the manifest is the attestation that
              the listed controls were observed operating during the review
              window — replaces individual cadenced attestations.
            </p>
            <ul className="mt-3 divide-y divide-[var(--color-border-muted)]">
              {recentManifests.map((m) => {
                const controlsTouched = Array.isArray(m.controlsTouched)
                  ? (m.controlsTouched as string[])
                  : [];
                const sectionsProcessed = Array.isArray(m.sectionsProcessed)
                  ? (m.sectionsProcessed as string[])
                  : [];
                return (
                  <li key={m.manifestId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-gray-100)]">
                      <ScrollText className="h-3.5 w-3.5 text-[var(--color-gray-700)]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-[var(--color-navy-primary)]">
                          {new Date(m.reviewPeriodEnd).toLocaleDateString()}
                        </span>
                        <span className="text-[11px] uppercase tracking-wide text-[var(--color-gray-500)]">
                          v{m.manifestVersion}
                        </span>
                        <span className="text-[11px] text-[var(--color-gray-500)]">
                          ingested {new Date(m.receivedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                        {controlsTouched.length} control{controlsTouched.length === 1 ? "" : "s"} refreshed ·{" "}
                        {sectionsProcessed.length} section{sectionsProcessed.length === 1 ? "" : "s"} ({sectionsProcessed.join(", ")})
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--color-gray-400)] break-words">
                        {m.manifestId}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/monitoring/manifests/${encodeURIComponent(m.manifestId)}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--color-blue-accent)] hover:bg-[var(--color-gray-50)]"
                    >
                      View detail <ExternalLink className="h-3 w-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </CollapsibleMonitoringSection>
      )}

      {/* ── Footer note: what an assessor sees ──────────────────────── */}
      <p className="text-xs text-[var(--color-gray-500)]">
        For the C3PAO assessor: this page is the operational record of the EnclaveWatch
        continuous-monitoring program. The signed{" "}
        <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
          enclavewatch_audit_program
        </code>{" "}
        attestation (visible on the{" "}
        <Link href="/dashboard/artifacts" className="text-[var(--color-blue-accent)] hover:underline">
          Artifacts page
        </Link>
        ) is the customer&apos;s declaration; the rows above are the operational evidence that
        the program actually ran.
      </p>
    </div>
  );
}

function VitalCard({
  icon: Icon,
  label,
  control,
  value,
  valueLabel,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  control: string;
  value: string;
  valueLabel: string;
  tone: "good" | "warn" | "bad" | "neutral";
  hint: string;
}) {
  const toneClass =
    tone === "good"
      ? { ring: "ring-emerald-200", value: "text-emerald-700", dot: "bg-emerald-500" }
      : tone === "warn"
        ? { ring: "ring-amber-200", value: "text-amber-700", dot: "bg-amber-500" }
        : tone === "bad"
          ? { ring: "ring-red-200", value: "text-red-700", dot: "bg-red-500" }
          : { ring: "ring-slate-200", value: "text-slate-500", dot: "bg-slate-400" };
  return (
    <div
      className={`rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm ring-2 ring-offset-2 ring-offset-[var(--color-bg)] ${toneClass.ring}`}
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-600)]">
          <span className={`h-1.5 w-1.5 rounded-full ${toneClass.dot}`} />
          {control}
        </span>
      </div>
      <p className={`mt-3 text-3xl font-bold tabular-nums ${toneClass.value}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-navy-primary)]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--color-gray-500)]">{valueLabel}</p>
    </div>
  );
}

function DriftCell({
  label,
  current,
  delta,
  positiveIsGood,
}: {
  label: string;
  current: number;
  delta: number;
  positiveIsGood: boolean;
}) {
  const sign = delta > 0 ? "+" : "";
  const good = positiveIsGood ? delta >= 0 : delta <= 0;
  // Headline = absolute count on the latest run. Subtitle = delta vs the
  // prior run. Earlier version showed delta-only, so a steady-state
  // PASS Δ=0 read as "0 passes" — bad signal even when nothing changed.
  const deltaColor =
    delta === 0
      ? "text-[var(--color-gray-500)]"
      : good
        ? "text-emerald-700"
        : "text-amber-700";
  const deltaText = delta === 0 ? "no change" : `${sign}${delta} since prior`;
  return (
    <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-navy-primary)]">
        {current}
      </p>
      <p className={`text-[10px] font-medium ${deltaColor}`}>{deltaText}</p>
    </div>
  );
}

// ── Helper: ObservationTile (Sprint 6.2) ──────────────────────────────────
// Renders one of the four counters in the ISSO observations rollup card.
// Tone "red" reserved for escalations; "amber" for warnings; "gray" for
// zero-state.
function ObservationTile({
  icon: Icon,
  label,
  count,
  href,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  href: string;
  tone: "red" | "amber" | "gray";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50/60 text-red-900"
      : tone === "amber" && count > 0
        ? "border-amber-200 bg-amber-50/60 text-amber-900"
        : "border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 text-[var(--color-gray-700)]";
  return (
    <Link
      href={href}
      className={`block rounded-md border ${toneClass} px-3 py-2.5 transition hover:opacity-90`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{count}</p>
    </Link>
  );
}
