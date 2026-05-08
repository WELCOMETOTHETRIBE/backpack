/**
 * Pinned vendoring of the TrainOS canonicalizer.
 *
 * canonical.ts and canonical.fixtures.ts in this directory are vendored
 * verbatim from cmmc-training-hub at the commit hash below. Do NOT modify
 * those files locally — re-vendor instead so both repos stay byte-aligned.
 *
 * Re-vendor flow (when TrainOS bumps CANONICALIZATION_VERSION or fixes a
 * canonicalizer bug):
 *
 *   TRAINOS_COMMIT="<new sha>"
 *   gh api repos/WELCOMETOTHETRIBE/cmmc-training-hub/contents/lib/evidence/canonical.ts?ref=$TRAINOS_COMMIT \
 *     --jq '.content' | base64 -d > src/lib/integrations/trainos/canonical.ts
 *   gh api repos/WELCOMETOTHETRIBE/cmmc-training-hub/contents/lib/evidence/canonical.fixtures.ts?ref=$TRAINOS_COMMIT \
 *     --jq '.content' | base64 -d > src/lib/integrations/trainos/canonical.fixtures.ts
 *   # update TRAINOS_CANONICALIZER_COMMIT below
 *   npx vitest run src/lib/integrations/trainos/canonical.test.ts   # must stay green
 *
 * If runFixtures() fails after re-vendoring, do NOT silently roll forward —
 * production hash chains reference the OLD bytes and will stop verifying.
 * Coordinate the cutover with the TrainOS team via the rotation event flow.
 */

export const TRAINOS_CANONICALIZER_COMMIT =
  "7da16c6bde0033ccda37a3169edff7ee5bb74cef";

export { CANONICALIZATION_VERSION } from "./canonical";
