/**
 * Tests for the weekly Friday-17:00-UTC anchor cadence model.
 *
 * Cycle definition: each weekly cycle ends at Friday 17:00 UTC. An entry
 * within cycle W satisfies cycle W; the next deadline becomes the END of
 * cycle W+1 (the Friday 17:00 UTC after the cycle the entry falls into).
 */

import { describe, it, expect } from "vitest";
import { nextWeeklyDeadline } from "./compliance-health";

/** Helper: build a UTC Date with explicit components. */
function utc(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0));
}

const FRIDAY_17_UTC = { hours: 17, minutes: 0 };

describe("nextWeeklyDeadline — Friday 17:00 UTC anchor", () => {
  // 2026-05-05 is a Tuesday. Anchor week:
  //   Mon May 4, Tue May 5, Wed May 6, Thu May 7, Fri May 8, Sat May 9, Sun May 10.
  // "This Friday" = May 8 17:00 UTC. "Next Friday" = May 15 17:00 UTC.

  it("Tuesday entry → next deadline is the Friday of the FOLLOWING week (≈10 days)", () => {
    const entry = utc(2026, 5, 5, 12, 0); // Tue May 5 12:00 UTC
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-15T17:00:00.000Z");
    const days = (deadline.getTime() - entry.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(10.21, 1);
  });

  it("Monday early-week entry → still 11 days to next Friday-after-this-Friday", () => {
    const entry = utc(2026, 5, 4, 9, 0); // Mon May 4 09:00 UTC
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-15T17:00:00.000Z");
  });

  it("Friday before 17:00 UTC entry → next deadline is exactly 7 days later", () => {
    const entry = utc(2026, 5, 8, 16, 0); // Fri May 8 16:00 UTC (just before deadline)
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-15T17:00:00.000Z");
    const days = (deadline.getTime() - entry.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7.04, 1);
  });

  it("Friday at exactly 17:00 UTC entry → counts toward this cycle (still 7 days)", () => {
    const entry = utc(2026, 5, 8, 17, 0); // Fri May 8 17:00 UTC sharp
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-15T17:00:00.000Z");
  });

  it("Friday AFTER 17:00 UTC entry → already in next cycle, deadline is two Fridays out", () => {
    const entry = utc(2026, 5, 8, 18, 0); // Fri May 8 18:00 UTC
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-22T17:00:00.000Z");
  });

  it("Saturday entry → in next cycle, deadline is Friday TWO weeks out", () => {
    const entry = utc(2026, 5, 9, 2, 0); // Sat May 9 02:00 UTC
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-22T17:00:00.000Z");
    const days = (deadline.getTime() - entry.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(13.625, 2);
  });

  it("Sunday entry → in next cycle, deadline is Friday TWO weeks out", () => {
    const entry = utc(2026, 5, 10, 23, 59); // Sun May 10 23:59 UTC
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.toISOString()).toBe("2026-05-22T17:00:00.000Z");
  });

  it("Multiple entries in same cycle: latest entry sets the deadline (idempotent)", () => {
    const earlier = utc(2026, 5, 4, 9, 0); // Mon May 4
    const later = utc(2026, 5, 6, 14, 30); // Wed May 6
    expect(nextWeeklyDeadline(earlier).toISOString()).toBe(
      nextWeeklyDeadline(later).toISOString()
    );
  });

  it("anchor lands at 17:00 UTC on a Friday (not some other hour)", () => {
    const entry = utc(2026, 5, 5, 12, 0);
    const deadline = nextWeeklyDeadline(entry);
    expect(deadline.getUTCDay()).toBe(5); // Friday
    expect(deadline.getUTCHours()).toBe(FRIDAY_17_UTC.hours);
    expect(deadline.getUTCMinutes()).toBe(FRIDAY_17_UTC.minutes);
  });
});
