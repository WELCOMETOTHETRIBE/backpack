/**
 * POST /api/integrations/trainos/evidence-attempt-completed
 *
 * Production inbound webhook for TrainOS deliveries. Sandbox sibling lives
 * at /api/integrations/trainos/sandbox/evidence-attempt-completed.
 *
 * All real logic lives in the shared handler; this file just dispatches.
 * See src/lib/integrations/trainos/handler.ts for the full flow.
 */

import { handleTrainosDelivery } from "@/lib/integrations/trainos/handler";

export async function POST(req: Request) {
  return handleTrainosDelivery(req, { sandbox: false });
}
