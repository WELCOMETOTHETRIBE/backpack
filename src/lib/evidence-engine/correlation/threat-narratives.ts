/**
 * Phase 9 — Cross-evidence threat-narrative correlator.
 *
 * Walks every register entry written in the recent window. For each rule
 * in threat_narrative_rules.v1.json, finds entries that match the lead
 * filter and joins them to entries matching the supporting filters within
 * the configured time window. Emits one threat_narratives row per
 * matching cluster, with the contributing entry_ids on related_entry_ids.
 *
 * The narrative itself is a Pattern A loop: detected here, admin
 * acknowledges via the Phase-9 admin endpoint (TODO: built on top of this
 * data layer), ISSO verifies on next weekly review.
 *
 * Idempotent: re-running the correlator over the same entries is a no-op
 * because we dedupe by (organization_id, narrative_type, lead_entry_id).
 *
 * §11 PRINCIPLE: Narratives are DERIVED from observed entries; never
 * hand-authored. Every claim in summary is interpolated from the
 * contributing entries.
 */

import { db } from "@/db";
import {
  threatNarratives,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import rulesJson from "@/data/cmmc/threat_narrative_rules.v1.json";

interface JoinFilter {
  event_type_in?: string[];
  finding_type_in?: string[];
  lifecycle_state_in?: string[];
}

interface SupportingClause {
  entry_type: string;
  register_key_in: string[];
  min_count: number;
  join_on?: string[];
  filter?: JoinFilter;
}

interface RuleSpec {
  id: string;
  narrative_type: string;
  title: string;
  description: string;
  lead: {
    entry_type: string;
    register_key_in: string[];
    filter?: JoinFilter;
  };
  supporting: SupportingClause[];
  window_minutes: number;
  summary_template: string;
  confidence: number;
}

interface RulesFile {
  rules: RuleSpec[];
}

const RULES = (rulesJson as RulesFile).rules;

interface CorrelationContext {
  orgId: string;
  /** Look-back window in days. Default 7 — narratives age out of scope. */
  lookbackDays?: number;
}

interface CorrelationResult {
  rule_id: string;
  narrative_type: string;
  inserted: number;
  updated: number;
}

/**
 * Run the correlator over recent entries. Called from the dispatcher hook
 * after every ingest so new entries get joined into narratives quickly.
 */
export async function runThreatCorrelation(
  ctx: CorrelationContext,
): Promise<CorrelationResult[]> {
  const lookback = ctx.lookbackDays ?? 7;
  const now = new Date();
  const since = new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000);

  const results: CorrelationResult[] = [];
  for (const rule of RULES) {
    results.push(await runRule(ctx.orgId, rule, since, now));
  }
  return results;
}

/**
 * Read recent narratives for the Monitoring tab card. Default: last 30d
 * of open / admin_investigating narratives.
 */
export async function getRecentThreatNarratives(
  orgId: string,
  lookbackDays = 30,
): Promise<(typeof threatNarratives.$inferSelect)[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(threatNarratives)
    .where(
      and(
        eq(threatNarratives.organizationId, orgId),
        gte(threatNarratives.lastObservedAt, since),
      ),
    )
    .orderBy(desc(threatNarratives.lastObservedAt))
    .limit(50);
}

// ─────────────────────────────────────────────────────────────────────
// internals
// ─────────────────────────────────────────────────────────────────────

async function runRule(
  orgId: string,
  rule: RuleSpec,
  sinceUtc: Date,
  nowUtc: Date,
): Promise<CorrelationResult> {
  let inserted = 0;
  let updated = 0;

  // 1. Find every entry matching the lead filter in the window.
  const leadEntries = await fetchEntriesMatching(
    orgId,
    rule.lead.entry_type,
    rule.lead.register_key_in,
    rule.lead.filter,
    sinceUtc,
    nowUtc,
  );

  // 2. For each lead, look up supporting entries within rule.window_minutes.
  for (const lead of leadEntries) {
    const leadOccurredAt =
      asDate(lead.entryData?.occurred_at) ??
      asDate(lead.entryData?.detected_at) ??
      lead.createdAt;
    const windowStart = new Date(
      leadOccurredAt.getTime() - rule.window_minutes * 60 * 1000,
    );
    const windowEnd = new Date(
      leadOccurredAt.getTime() + rule.window_minutes * 60 * 1000,
    );

    const supportingMatches: typeof leadEntries[number][][] = [];
    let allSatisfied = true;
    for (const support of rule.supporting) {
      const candidates = await fetchEntriesMatching(
        orgId,
        support.entry_type,
        support.register_key_in,
        support.filter,
        windowStart,
        windowEnd,
      );
      // Join filter: contributing entries must share at least one of the
      // join_on field values with the lead. Skip the lead itself.
      const matched = candidates.filter((c) => {
        if (c.entryId === lead.entryId) return false;
        if (!support.join_on || support.join_on.length === 0) return true;
        return support.join_on.some((field) => {
          const a = (lead.entryData?.[field] ?? null) as
            | string
            | number
            | null;
          const b = (c.entryData?.[field] ?? null) as string | number | null;
          if (a === null || b === null) return false;
          return String(a).toLowerCase() === String(b).toLowerCase();
        });
      });

      if (matched.length < support.min_count) {
        allSatisfied = false;
        break;
      }
      supportingMatches.push(matched);
    }

    if (!allSatisfied) continue;

    // 3. Build the narrative + persist (idempotent on (org, type, lead_id)).
    const allRelated = [
      { entry_id: lead.entryId, register_key: lead.registerKey, entry_type: lead.entryType, contribution: "lead" as const },
      ...supportingMatches.flatMap((matched) =>
        matched.map((m) => ({
          entry_id: m.entryId,
          register_key: m.registerKey,
          entry_type: m.entryType,
          contribution: "supporting" as const,
        })),
      ),
    ];
    const lastObservedAt = supportingMatches
      .flat()
      .map(
        (m) =>
          asDate(m.entryData?.occurred_at) ??
          asDate(m.entryData?.detected_at) ??
          m.createdAt,
      )
      .reduce<Date>((a, b) => (b > a ? b : a), leadOccurredAt);

    const counts = countSupporting(supportingMatches, rule.supporting);
    const summary = renderSummary(rule.summary_template, lead, counts);

    // Idempotency: same (org, narrative_type, lead_entry_id) replaces.
    // Encoded by storing the lead entry_id as the FIRST element of
    // related_entry_ids; we look it up via JSONB extraction.
    const [existing] = await db
      .select({ id: threatNarratives.id })
      .from(threatNarratives)
      .where(
        and(
          eq(threatNarratives.organizationId, orgId),
          eq(threatNarratives.narrativeType, rule.narrative_type),
          sql`${threatNarratives.relatedEntryIds} -> 0 ->> 'entry_id' = ${lead.entryId}`,
        ),
      )
      .limit(1);

    const ts = nowUtc;
    if (existing) {
      await db
        .update(threatNarratives)
        .set({
          summary,
          confidence: rule.confidence,
          relatedEntryIds: allRelated as unknown as Record<string, unknown>[],
          lastObservedAt,
          updatedAt: ts,
        })
        .where(eq(threatNarratives.id, existing.id));
      updated++;
    } else {
      await db.insert(threatNarratives).values({
        organizationId: orgId,
        narrativeType: rule.narrative_type,
        summary,
        confidence: rule.confidence,
        relatedEntryIds: allRelated as unknown as Record<string, unknown>[],
        openedAt: leadOccurredAt,
        lastObservedAt,
        status: "open",
      });
      inserted++;
    }
  }

  return { rule_id: rule.id, narrative_type: rule.narrative_type, inserted, updated };
}

interface FetchedEntry {
  entryId: string;
  registerKey: string;
  entryType: string;
  status: string;
  createdAt: Date;
  entryData: Record<string, unknown> | null;
}

async function fetchEntriesMatching(
  orgId: string,
  entryType: string,
  registerKeysIn: string[],
  filter: JoinFilter | undefined,
  sinceUtc: Date,
  untilUtc: Date,
): Promise<FetchedEntry[]> {
  // Resolve every candidate register key (alias-aware).
  const allCandidates = registerKeysIn.flatMap((k) =>
    resolveRegisterKeyCandidates(k),
  );
  if (allCandidates.length === 0) return [];

  const matchingRegisters = await db
    .select({
      id: governanceRegisters.id,
      registerKey: governanceRegisters.registerKey,
    })
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
  if (matchingRegisters.length === 0) return [];
  const registerKeyById = new Map(
    matchingRegisters.map((r) => [r.id, r.registerKey]),
  );
  const registerIds = matchingRegisters.map((r) => r.id);

  const rows = await db
    .select({
      id: governanceRegisterEntries.id,
      entryType: governanceRegisterEntries.entryType,
      status: governanceRegisterEntries.status,
      createdAt: governanceRegisterEntries.createdAt,
      registerId: governanceRegisterEntries.registerId,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .where(
      and(
        sql`${governanceRegisterEntries.registerId} IN (${sql.join(
          registerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.entryType, entryType),
        gte(governanceRegisterEntries.createdAt, sinceUtc),
        lte(governanceRegisterEntries.createdAt, untilUtc),
      ),
    )
    .orderBy(governanceRegisterEntries.createdAt);

  // Apply filter (event_type_in / finding_type_in / lifecycle_state_in) to
  // the entryData blob. Cheap in-app filter to avoid JSONB-extract hell in
  // the where clause for one or two fields.
  const filtered = rows
    .map((r) => ({
      entryId: r.id,
      registerKey: registerKeyById.get(r.registerId) ?? "(unknown)",
      entryType: r.entryType ?? "(unknown)",
      status: r.status,
      createdAt: r.createdAt,
      entryData: (r.entryData ?? null) as Record<string, unknown> | null,
    }))
    .filter((r) => {
      if (!filter) return true;
      const data = r.entryData ?? {};
      if (filter.event_type_in && filter.event_type_in.length > 0) {
        const v = data.event_type;
        if (typeof v !== "string" || !filter.event_type_in.includes(v))
          return false;
      }
      if (filter.finding_type_in && filter.finding_type_in.length > 0) {
        const v = data.finding_type;
        if (typeof v !== "string" || !filter.finding_type_in.includes(v))
          return false;
      }
      if (
        filter.lifecycle_state_in &&
        filter.lifecycle_state_in.length > 0
      ) {
        const v = data.lifecycle_state;
        if (typeof v !== "string" || !filter.lifecycle_state_in.includes(v))
          return false;
      }
      return true;
    });

  return filtered;
}

function countSupporting(
  matches: FetchedEntry[][],
  clauses: SupportingClause[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < clauses.length; i++) {
    counts[clauses[i].entry_type] =
      (counts[clauses[i].entry_type] ?? 0) + matches[i].length;
  }
  return counts;
}

function renderSummary(
  template: string,
  lead: FetchedEntry,
  counts: Record<string, number>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, raw) => {
    const path = String(raw).split(".");
    if (path[0] === "lead") {
      const field = path.slice(1).join(".");
      const v = lead.entryData?.[field];
      if (v === undefined || v === null) return "—";
      return typeof v === "string" || typeof v === "number"
        ? String(v)
        : JSON.stringify(v);
    }
    if (path[0] === "count") {
      const field = path.slice(1).join(".");
      return String(counts[field] ?? 0);
    }
    return "—";
  });
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
