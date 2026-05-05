/**
 * media_handling_log handler — v1.1 ISSO export, NEW register for MP family.
 *
 * Three sub-sections, each mapping to its own entry type:
 *
 *  - media_destroyed[]              → media_destroyed entry
 *  - removable_media_authorized[]   → removable_media_authorized entry
 *  - bitlocker_attestations[]       → bitlocker_attestation entry
 *
 * Backs §3.8.1, §3.8.2, §3.8.3, §3.8.6, §3.8.7, §3.8.9.
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED = ["3.8.1", "3.8.2", "3.8.3", "3.8.6", "3.8.7", "3.8.9"] as const;

interface MediaDestroyedItem {
  media_id?: string;
  media_type?: string;
  destruction_method?: string;
  destroyed_at?: string;
  destroyed_by?: string;
  witnessed_by?: string;
  ticket?: string | null;
  notes?: string | null;
}

interface RemovableMediaAuthItem {
  subject_user?: string;
  media_id?: string;
  media_type?: string;
  authorized_at?: string;
  authorized_by?: string;
  expires_at?: string;
  justification?: string;
  encryption_required?: boolean;
  ticket?: string | null;
  notes?: string | null;
}

interface BitlockerAttestationItem {
  scanned_at?: string;
  scanned_by?: string;
  endpoints_total?: number;
  endpoints_encrypted?: number;
  result?: string;
  non_compliant_endpoints?: string[];
  notes?: string | null;
}

interface MediaHandlingPayload {
  media_destroyed?: MediaDestroyedItem[];
  removable_media_authorized?: RemovableMediaAuthItem[];
  bitlocker_attestations?: BitlockerAttestationItem[];
}

export const media_handling_logHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "media_handling_log",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = (payload ?? {}) as MediaHandlingPayload;
  const totalItems =
    (section.media_destroyed?.length ?? 0) +
    (section.removable_media_authorized?.length ?? 0) +
    (section.bitlocker_attestations?.length ?? 0);
  if (totalItems === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — media events not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("media_handling_log");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (matchingRegisters.length === 0) {
    result.warnings.push(
      "media_handling_log register not provisioned for org — visit /dashboard/evidence-engine/registers to auto-provision, or manually insert via seed",
    );
    return result;
  }

  let targetRegisterId = matchingRegisters[0].id;
  if (matchingRegisters.length > 1) {
    const counts = await Promise.all(
      matchingRegisters.map(async (r) => {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { id: r.id, n: c?.n ?? 0 };
      }),
    );
    counts.sort((a, b) => b.n - a.n);
    targetRegisterId = counts[0].id;
  }

  const now = new Date();

  // Media destroyed (idempotent on media_id + destroyed_at).
  for (const m of section.media_destroyed ?? []) {
    if (
      !m.media_id ||
      !m.media_type ||
      !m.destruction_method ||
      !m.destroyed_at ||
      !m.destroyed_by ||
      !m.witnessed_by
    ) {
      result.warnings.push("media_destroyed missing required fields — skipped");
      continue;
    }
    const entryData: Record<string, unknown> = {
      media_id: m.media_id,
      media_type: m.media_type,
      destruction_method: m.destruction_method,
      destroyed_at: m.destroyed_at,
      destroyed_by: m.destroyed_by,
      witnessed_by: m.witnessed_by,
      ticket: m.ticket ?? null,
      notes: m.notes ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "media_destroyed"),
          sql`${governanceRegisterEntries.entryData} ->> 'media_id' = ${m.media_id}`,
          sql`${governanceRegisterEntries.entryData} ->> 'destroyed_at' = ${m.destroyed_at}`,
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({ entryData, status: "final", finalizedAt: now, updatedAt: now })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "media_destroyed",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  // Removable media authorized (idempotent on subject_user + media_id +
  // authorized_at).
  for (const a of section.removable_media_authorized ?? []) {
    if (
      !a.subject_user ||
      !a.media_id ||
      !a.media_type ||
      !a.authorized_at ||
      !a.authorized_by ||
      !a.expires_at ||
      !a.justification
    ) {
      result.warnings.push(
        "removable_media_authorized missing required fields — skipped",
      );
      continue;
    }
    const entryData: Record<string, unknown> = {
      subject_user: a.subject_user,
      media_id: a.media_id,
      media_type: a.media_type,
      authorized_at: a.authorized_at,
      authorized_by: a.authorized_by,
      expires_at: a.expires_at,
      justification: a.justification,
      encryption_required: a.encryption_required ?? true,
      ticket: a.ticket ?? null,
      notes: a.notes ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "removable_media_authorized"),
          sql`${governanceRegisterEntries.entryData} ->> 'subject_user' = ${a.subject_user}`,
          sql`${governanceRegisterEntries.entryData} ->> 'media_id' = ${a.media_id}`,
          sql`${governanceRegisterEntries.entryData} ->> 'authorized_at' = ${a.authorized_at}`,
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({ entryData, status: "final", finalizedAt: now, updatedAt: now })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "removable_media_authorized",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  // BitLocker attestation (idempotent on scanned_at).
  for (const b of section.bitlocker_attestations ?? []) {
    if (
      !b.scanned_at ||
      !b.scanned_by ||
      typeof b.endpoints_total !== "number" ||
      typeof b.endpoints_encrypted !== "number" ||
      !b.result
    ) {
      result.warnings.push("bitlocker_attestation missing required fields — skipped");
      continue;
    }
    const entryData: Record<string, unknown> = {
      scanned_at: b.scanned_at,
      scanned_by: b.scanned_by,
      endpoints_total: b.endpoints_total,
      endpoints_encrypted: b.endpoints_encrypted,
      result: b.result,
      non_compliant_endpoints: b.non_compliant_endpoints ?? [],
      notes: b.notes ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "bitlocker_attestation"),
          sql`${governanceRegisterEntries.entryData} ->> 'scanned_at' = ${b.scanned_at}`,
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({ entryData, status: "final", finalizedAt: now, updatedAt: now })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "bitlocker_attestation",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
