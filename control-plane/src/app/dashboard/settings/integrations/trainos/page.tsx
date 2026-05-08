/**
 * Settings → Integrations → TrainOS
 *
 * Per-org configuration for the inbound webhook from
 * training.mactechsolutionsllc.com. Two-phase manual rotation only for v1
 * (dual-window deferred to v3 brief).
 *
 * Auth model: only ADMINs see this page. The tenant_id and webhook secret
 * are sensitive enough that a Compliance role shouldn't be able to wire a
 * different TrainOS tenant into the org.
 *
 * Show-once UX for the secret: when the admin generates a new secret it
 * is rendered ONCE in plain text; subsequent visits only show last-4 +
 * created_at. There is no "view secret" link — re-generation is the only
 * recovery path. Same posture as other API tokens in the codebase.
 */

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, trainosDeliveries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { TRAINOS_CANONICALIZER_COMMIT, CANONICALIZATION_VERSION } from "@/lib/integrations/trainos/version";
import { POLICY_VERSION } from "@/lib/integrations/trainos/adjudicate";
import { saveTenantIdAction, rotateWebhookSecretAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cardClass =
  "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

export default async function TrainosIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ newSecret?: string; saved?: string }>;
}) {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");
  if (user?.role !== "Admin") {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Insufficient permissions</h1>
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">
          Only Admins can configure integration settings.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const justRotatedSecret = params.newSecret ?? null;
  const justSaved = params.saved === "1";

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trainosTenantId: organizations.trainosTenantId,
      trainosWebhookSecret: organizations.trainosWebhookSecret,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) redirect("/auth/signin");

  const [latestDelivery] = await db
    .select({
      receivedAt: trainosDeliveries.receivedAt,
      verdictOverall: trainosDeliveries.verdictOverall,
      evidenceRecordId: trainosDeliveries.evidenceRecordId,
    })
    .from(trainosDeliveries)
    .where(eq(trainosDeliveries.organizationId, orgId))
    .orderBy(desc(trainosDeliveries.receivedAt))
    .limit(1);

  const secretLast4 = org.trainosWebhookSecret?.slice(-4) ?? null;
  const isOnboarded = Boolean(org.trainosTenantId && org.trainosWebhookSecret);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">TrainOS integration</h1>
        <p className="mt-1 text-sm text-[var(--color-gray-500)]">
          Inbound webhook configuration for training.mactechsolutionsllc.com
          → Codex evidence ingest. Once both fields are set the customer can
          send the integration.handshake event to verify wiring.
        </p>
      </header>

      <section className={cardClass}>
        <h2 className="text-base font-semibold">Integration status</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-[var(--color-gray-500)]">Status</dt>
          <dd>
            {isOnboarded ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Configured
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Pending
              </span>
            )}
          </dd>
          <dt className="text-[var(--color-gray-500)]">TrainOS tenant ID</dt>
          <dd className="font-mono">
            {org.trainosTenantId ?? <span className="text-[var(--color-gray-400)]">—</span>}
          </dd>
          <dt className="text-[var(--color-gray-500)]">Webhook secret</dt>
          <dd className="font-mono">
            {secretLast4 ? (
              <span>•••• •••• •••• {secretLast4}</span>
            ) : (
              <span className="text-[var(--color-gray-400)]">—</span>
            )}
          </dd>
          <dt className="text-[var(--color-gray-500)]">Canonicalizer pin</dt>
          <dd className="font-mono text-xs">
            {TRAINOS_CANONICALIZER_COMMIT.slice(0, 12)} (v{CANONICALIZATION_VERSION})
          </dd>
          <dt className="text-[var(--color-gray-500)]">Adjudication policy</dt>
          <dd className="font-mono text-xs">{POLICY_VERSION}</dd>
          <dt className="text-[var(--color-gray-500)]">Last delivery</dt>
          <dd>
            {latestDelivery ? (
              <span>
                {new Date(latestDelivery.receivedAt).toLocaleString()} —{" "}
                <span className="font-mono text-xs">{latestDelivery.verdictOverall}</span>
              </span>
            ) : (
              <span className="text-[var(--color-gray-400)]">No deliveries yet</span>
            )}
          </dd>
        </dl>
      </section>

      {justRotatedSecret ? (
        <section className={`${cardClass} border-amber-300 bg-amber-50`}>
          <h2 className="text-base font-semibold text-amber-900">
            New webhook secret — copy now
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            This secret is shown <strong>once</strong>. Paste it into TrainOS
            admin → integrations → Codex. It is required to validate inbound
            HMAC signatures. After this page reloads we will only show the
            last 4 characters.
          </p>
          <pre className="mt-3 select-all rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-mono text-amber-900">
            {justRotatedSecret}
          </pre>
        </section>
      ) : null}

      {justSaved ? (
        <p className="text-sm text-emerald-700">Saved.</p>
      ) : null}

      <section className={cardClass}>
        <h2 className="text-base font-semibold">TrainOS tenant ID</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-500)]">
          The cuid TrainOS sends in the <code className="font-mono text-xs">X-TrainOS-Tenant</code> header.
          The customer admin can find it under TrainOS → Settings → Integration → Codex.
        </p>
        <form action={saveTenantIdAction} className="mt-4 flex gap-3">
          <input
            type="text"
            name="trainosTenantId"
            defaultValue={org.trainosTenantId ?? ""}
            placeholder="ckv9..."
            className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-sm"
            pattern="^[a-zA-Z0-9_-]+$"
            maxLength={64}
            required
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Save tenant ID
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold">Webhook secret</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-500)]">
          Generates a 32-byte hex secret. Used to validate{" "}
          <code className="font-mono text-xs">X-TrainOS-Signature: sha256=&lt;hex&gt;</code>{" "}
          on inbound deliveries. Manual two-phase rotation: generate a new
          secret here → paste it into TrainOS → wait for TrainOS to confirm
          cutover → previous secret stops working immediately on save (no
          dual-window for v1).
        </p>
        <form action={rotateWebhookSecretAction} className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-gray-50)]"
          >
            {org.trainosWebhookSecret ? "Rotate webhook secret" : "Generate webhook secret"}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold">Endpoint URLs</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-[var(--color-gray-500)]">Production</dt>
            <dd className="mt-1 font-mono text-xs">
              POST https://codex.mactechsolutionsllc.com/api/integrations/trainos/evidence-attempt-completed
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-gray-500)]">Sandbox (X-TrainOS-Tenant must be &quot;sandbox&quot;)</dt>
            <dd className="mt-1 font-mono text-xs">
              POST https://codex.mactechsolutionsllc.com/api/integrations/trainos/sandbox/evidence-attempt-completed
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
