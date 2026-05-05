/**
 * No-op handler factory for sections that haven't shipped a concrete
 * implementation yet. Returns a HandlerResult with all zeros so the
 * dispatcher rolls it up cleanly in telemetry without producing surprising
 * side effects.
 *
 * Sprints 2/3/5 swap these out by registering real handlers in the
 * dispatcher's SECTION_HANDLERS map. No caller changes required.
 */

import type { HandlerResult, RegisterHandler } from "../types";

export function noopHandler(section: string): RegisterHandler {
  return async (): Promise<HandlerResult> => ({
    section,
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [
      `section "${section}" has no concrete handler yet (Sprint 2/3/5); payload accepted but ignored`,
    ],
  });
}
