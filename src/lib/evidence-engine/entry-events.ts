import { db } from "@/db";
import { governanceEntryEvents } from "@/db/schema";

export type EntryEventType =
  | "created"
  | "updated"
  | "finalized"
  | "attachment_added"
  | "voided";

export async function logEntryEvent(
  orgId: string,
  entryId: string,
  eventType: EntryEventType,
  actorUserId: string | null,
  eventJson?: Record<string, unknown>
) {
  await db.insert(governanceEntryEvents).values({
    orgId,
    entryId,
    actorUserId: actorUserId ?? null,
    eventType,
    eventJson: eventJson ?? null,
  });
}
