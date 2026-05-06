/**
 * Shared inbound handler for TrainOS deliveries. Production and sandbox
 * routes both call into this function — sandbox only differs in (a) tenant
 * resolution scoping ("sandbox" only), (b) the `sandbox: true` flag on the
 * persisted delivery row.
 *
 * Flow (matches the integration brief v2-final §5 retry semantics):
 *
 *   1. Read raw body bytes for HMAC + canonical re-hash.
 *   2. Resolve org by `X-TrainOS-Tenant` against organizations.trainos_tenant_id.
 *      Missing → 404 terminal `{"error": "tenant_not_onboarded"}`.
 *   3. Validate HMAC + 5-min replay window. Errors map to 400/401 per the
 *      table in the brief; both are terminal (no TrainOS retry).
 *   4. Parse JSON. Schema mismatch → 400.
 *   5. Recompute sha256(canonicalize(canonical)) and compare to
 *      evidence.evidenceHash. Mismatch → 400 `{"error":"canonicalizer_drift"}`.
 *   6. Dedup on delivery_id:
 *        - same id + same body → IDEMPOTENT_REPLAY (return cached verdict).
 *        - same id + different body → 409 (replay-with-different-body bug).
 *   7. Adjudicate per-objective + roll up overall verdict.
 *   8. If overall ∈ {ACCEPTED, ACCEPTED_WITH_NOTES}: applyTrainosEvidence()
 *      (transactional register entry + attestation + recalc).
 *   9. Persist trainos_deliveries row with cached verdict.
 *  10. writeAuditLog (best-effort, post-tx).
 *  11. Return verdict response.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { organizations, trainosDeliveries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";
import { canonicalize } from "./canonical";
import { CANONICALIZATION_VERSION, TRAINOS_CANONICALIZER_COMMIT } from "./version";
import { verifyTrainosSignature } from "./hmac";
import { adjudicatePerObjective, rollupOverallVerdict, POLICY_VERSION } from "./adjudicate";
import { applyTrainosEvidence } from "./apply";
import type {
  TrainosAttemptCompletedEvent,
  TrainosVerdictResponse,
  PerObjectiveVerdict,
} from "./types";

interface HandlerOptions {
  /** True for the /sandbox route — only the "sandbox" tenant is allowed. */
  sandbox: boolean;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export async function handleTrainosDelivery(
  req: Request,
  opts: HandlerOptions
): Promise<NextResponse> {
  // 1. Raw body bytes — required for HMAC. Once req.json() is called this
  // is consumed, so we read text first and parse downstream.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  const sigHeader = req.headers.get("x-trainos-signature");
  const tsHeader = req.headers.get("x-trainos-timestamp");
  const tenantHeader = req.headers.get("x-trainos-tenant");
  const eventHeader = req.headers.get("x-trainos-event");

  if (!tenantHeader) {
    return NextResponse.json(
      { error: "missing X-TrainOS-Tenant header" },
      { status: 400 }
    );
  }

  // 2. Resolve org by tenant ID. Sandbox route enforces tenant === "sandbox".
  if (opts.sandbox && tenantHeader !== "sandbox") {
    return NextResponse.json(
      { error: "sandbox route only accepts X-TrainOS-Tenant: sandbox" },
      { status: 400 }
    );
  }
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trainosWebhookSecret: organizations.trainosWebhookSecret,
      trainosTenantId: organizations.trainosTenantId,
    })
    .from(organizations)
    .where(eq(organizations.trainosTenantId, tenantHeader))
    .limit(1);
  if (!org) {
    return NextResponse.json(
      {
        error: "tenant_not_onboarded",
        message: `No Codex organization is mapped to TrainOS tenant "${tenantHeader}". Have the customer admin enter their TrainOS tenant ID in /dashboard/settings/integrations/trainos.`,
      },
      { status: 404 }
    );
  }
  if (!org.trainosWebhookSecret) {
    return NextResponse.json(
      {
        error: "tenant_secret_missing",
        message: "Tenant is mapped but no webhook secret is configured. Complete onboarding to enable inbound deliveries.",
      },
      { status: 404 }
    );
  }

  // 3. HMAC + replay window.
  const verify = verifyTrainosSignature({
    rawBody,
    signatureHeader: sigHeader,
    timestampHeader: tsHeader,
    secret: org.trainosWebhookSecret,
  });
  if (!verify.ok) {
    return NextResponse.json({ error: verify.reason }, { status: verify.status });
  }

  // 4. Parse JSON.
  let parsed: TrainosAttemptCompletedEvent;
  try {
    parsed = JSON.parse(rawBody) as TrainosAttemptCompletedEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Branch: handshake event → counter-PR'd response per integration brief §3.
  if ((eventHeader && eventHeader === "integration.handshake") || (parsed as { event?: string }).event === "integration.handshake") {
    return handleHandshake({
      rawBody,
      parsed: parsed as unknown as Record<string, unknown>,
      org: { id: org.id, name: org.name, trainosTenantId: org.trainosTenantId ?? tenantHeader },
      sandbox: opts.sandbox,
    });
  }

  // Schema sanity checks for evidence.attempt.completed.
  if (parsed.event !== "evidence.attempt.completed") {
    return NextResponse.json(
      { error: "unsupported_event", message: `Codex Sprint 9 only handles evidence.attempt.completed; got "${parsed.event}".` },
      { status: 400 }
    );
  }
  if (!parsed.deliveryId) {
    return NextResponse.json({ error: "missing_delivery_id" }, { status: 400 });
  }
  if (!parsed.evidence?.canonical || !parsed.evidence?.evidenceHash) {
    return NextResponse.json({ error: "malformed_envelope" }, { status: 400 });
  }

  // 5. Canonical re-hash. Strip the "sha256:" prefix if TrainOS includes it.
  const canonicalHash = sha256Hex(canonicalize(parsed.evidence.canonical));
  const expectedHash = parsed.evidence.evidenceHash.replace(/^sha256:/, "");
  if (canonicalHash !== expectedHash) {
    return NextResponse.json(
      {
        error: "canonicalizer_drift",
        message: "Recomputed sha256(canonicalize(canonical)) does not match evidence.evidenceHash. Check TRAINOS_CANONICALIZER_COMMIT pin and CANONICALIZATION_VERSION.",
        expected: expectedHash,
        computed: canonicalHash,
        canonicalizationVersion: CANONICALIZATION_VERSION,
      },
      { status: 400 }
    );
  }

  // 6. Dedup check.
  const requestBodyHash = sha256Hex(rawBody);
  const [existing] = await db
    .select({
      verdictResponse: trainosDeliveries.verdictResponse,
      requestBodyHash: trainosDeliveries.requestBodyHash,
      receivedAt: trainosDeliveries.receivedAt,
    })
    .from(trainosDeliveries)
    .where(eq(trainosDeliveries.deliveryId, parsed.deliveryId))
    .limit(1);
  if (existing) {
    if (existing.requestBodyHash !== requestBodyHash) {
      return NextResponse.json(
        {
          error: "delivery_id_body_mismatch",
          message: "This delivery_id was previously seen with a different body. Replays must use identical bytes.",
        },
        { status: 409 }
      );
    }
    // Replay — return cached verdict with verdict overridden to IDEMPOTENT_REPLAY
    // and originalAdjudicatedAt set so TrainOS can distinguish.
    const cached = existing.verdictResponse as Record<string, unknown>;
    const replay: TrainosVerdictResponse = {
      deliveryId: parsed.deliveryId,
      verdict: "IDEMPOTENT_REPLAY",
      perObjective: (cached.perObjective as PerObjectiveVerdict[]) ?? [],
      policyVersion: (cached.policyVersion as string) ?? POLICY_VERSION,
      adjudicatedAt: new Date().toISOString(),
      originalAdjudicatedAt: (cached.adjudicatedAt as string) ?? existing.receivedAt.toISOString(),
    };
    return NextResponse.json(replay, { status: 200 });
  }

  // 7. Adjudicate.
  const perObjective = adjudicatePerObjective(parsed.evidence.canonical);
  const overall = rollupOverallVerdict(perObjective);

  // 8. Apply side effects only for accepting verdicts.
  let applyError: string | null = null;
  if (overall === "ACCEPTED" || overall === "ACCEPTED_WITH_NOTES") {
    try {
      await applyTrainosEvidence({
        organizationId: org.id,
        event: parsed,
        perObjective,
        evidenceHashHex: canonicalHash,
      });
    } catch (e) {
      applyError = e instanceof Error ? e.message : String(e);
      // Convert to 5xx so TrainOS retries — server-side issue, not TrainOS's
      // fault. Don't persist a delivery row so the retry can re-attempt.
      return NextResponse.json(
        { error: "apply_failed", message: applyError },
        { status: 500 }
      );
    }
  }

  // 9. Build response and persist.
  const adjudicatedAt = new Date();
  const response: TrainosVerdictResponse = {
    deliveryId: parsed.deliveryId,
    verdict: overall,
    perObjective,
    policyVersion: POLICY_VERSION,
    adjudicatedAt: adjudicatedAt.toISOString(),
  };

  await db.insert(trainosDeliveries).values({
    deliveryId: parsed.deliveryId,
    organizationId: org.id,
    event: parsed.event,
    schemaVersion: parsed.schemaVersion ?? null,
    canonicalizationVer: parsed.evidence.canonicalizationVersion,
    evidenceRecordId: parsed.evidence.evidenceRecordId,
    evidenceHash: canonicalHash,
    certificateNumber: parsed.certificate?.certificateNumber ?? null,
    occurredAt: new Date(parsed.occurredAt),
    verdictResponse: response as unknown as Record<string, unknown>,
    verdictOverall: overall,
    requestBodyHash,
    sandbox: opts.sandbox,
  });

  // 10. Audit log (best-effort).
  try {
    await writeAuditLog({
      organizationId: org.id,
      action: "trainos.evidence_received",
      resourceType: "trainos_delivery",
      resourceId: parsed.deliveryId,
      details: {
        evidence_record_id: parsed.evidence.evidenceRecordId,
        certificate_number: parsed.certificate?.certificateNumber,
        verdict: overall,
        controls_touched: [...new Set(perObjective.map((v) => v.controlId))],
        policy_version: POLICY_VERSION,
        canonicalizer_commit: TRAINOS_CANONICALIZER_COMMIT,
        sandbox: opts.sandbox,
      },
    });
  } catch {
    // Don't fail the response on audit-log error — the delivery is recorded.
  }

  return NextResponse.json(response, { status: 200 });
}

/**
 * Handshake event — Codex's counter-PR'd response shape (per the brief's
 * "response spec is sketched ... counter-PR welcome" line).
 *
 * On acceptance:
 *   - re-canonicalize the probe.input field
 *   - assert canonicalize() === probe.expectedCanonical AND
 *     sha256 === probe.expectedSha256
 *   - return HANDSHAKE_OK with the canonicalizer commit + policy version
 *     so TrainOS can sanity-check the pin we're running
 *   - mismatch → 400 canonicalizer_drift (terminal — re-vendor required)
 */
function handleHandshake(args: {
  rawBody: string;
  parsed: Record<string, unknown>;
  org: { id: string; name: string; trainosTenantId: string };
  sandbox: boolean;
}): NextResponse {
  // TrainOS's actual payload shape (lib/integrations/codex/payload.ts
  // buildHandshakePayload): probe lives under handshake.probe and the
  // sha256 field is named expectedSha256Hex. The brief's draft used a
  // flatter shape but the sender shipped first; align with the wire
  // reality. Fall back to the flat shape for forward-compat with any
  // future sender that follows the original draft.
  const handshakeBlock = args.parsed.handshake as
    | { probe?: Record<string, unknown> }
    | undefined;
  const rawProbe = (handshakeBlock?.probe ?? args.parsed.probe) as
    | {
        input?: unknown;
        expectedCanonical?: string;
        expectedSha256?: string;
        expectedSha256Hex?: string;
      }
    | undefined;
  const probe = rawProbe
    ? {
        input: rawProbe.input,
        expectedCanonical: rawProbe.expectedCanonical,
        expectedSha256: rawProbe.expectedSha256Hex ?? rawProbe.expectedSha256,
      }
    : undefined;
  if (!probe || probe.input === undefined || !probe.expectedCanonical || !probe.expectedSha256) {
    return NextResponse.json(
      {
        error: "malformed_handshake",
        message: "integration.handshake events must include handshake.probe (or top-level probe) with input + expectedCanonical + expectedSha256Hex.",
      },
      { status: 400 }
    );
  }
  let computedCanonical: string;
  try {
    computedCanonical = canonicalize(probe.input);
  } catch (e) {
    return NextResponse.json(
      {
        error: "canonicalizer_drift",
        message: `Codex canonicalize() threw on probe input: ${e instanceof Error ? e.message : String(e)}`,
        canonicalizerCommit: TRAINOS_CANONICALIZER_COMMIT,
      },
      { status: 400 }
    );
  }
  const computedSha = sha256Hex(computedCanonical);
  const expectedSha = probe.expectedSha256.replace(/^sha256:/, "");
  if (computedCanonical !== probe.expectedCanonical || computedSha !== expectedSha) {
    return NextResponse.json(
      {
        error: "canonicalizer_drift",
        message: "Codex's vendored canonicalizer produced different bytes than TrainOS's probe expects. Re-vendor required.",
        canonicalizerCommit: TRAINOS_CANONICALIZER_COMMIT,
        canonicalizationVersion: CANONICALIZATION_VERSION,
        computed: { canonical: computedCanonical, sha256: computedSha },
        expected: { canonical: probe.expectedCanonical, sha256: expectedSha },
      },
      { status: 400 }
    );
  }
  const deliveryId = (args.parsed.deliveryId as string) ?? "(no-delivery-id)";
  return NextResponse.json(
    {
      deliveryId,
      verdict: "HANDSHAKE_OK",
      echo: {
        canonicalizationVersion: CANONICALIZATION_VERSION,
        canonicalizerCommit: TRAINOS_CANONICALIZER_COMMIT,
        policyVersion: POLICY_VERSION,
      },
      tenant: {
        trainosTenantId: args.org.trainosTenantId,
        codexOrgId: args.org.id,
        codexOrgName: args.org.name,
      },
      sandbox: args.sandbox,
      acknowledgedAt: new Date().toISOString(),
    },
    { status: 200 }
  );
}
