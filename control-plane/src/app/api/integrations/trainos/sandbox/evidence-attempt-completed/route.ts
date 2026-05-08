/**
 * POST /api/integrations/trainos/sandbox/evidence-attempt-completed
 *
 * Sandbox inbound webhook. Only accepts X-TrainOS-Tenant: sandbox so prod
 * data flows can't accidentally land in the sandbox org's records (and
 * vice versa). Persisted deliveries are flagged sandbox=true on the
 * trainos_deliveries row so they're excluded from production rollups,
 * SPRS scoring, and assessor exports.
 */

import { handleTrainosDelivery } from "@/lib/integrations/trainos/handler";

export async function POST(req: Request) {
  return handleTrainosDelivery(req, { sandbox: true });
}
