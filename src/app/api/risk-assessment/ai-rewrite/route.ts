import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { computeOrgPosture } from "@/lib/risk-assessment/posture-engine";
import { scenarioById } from "@/app/dashboard/readiness/risk-assessment/threat-scenarios";

/**
 * POST /api/risk-assessment/ai-rewrite
 *
 * Phase 2 — Claude tailors qualitative copy for a single risk: rewrites
 * the generic risk statement using the org's actual boundary name +
 * topology, or drafts treatment notes given the user's chosen treatment.
 * Output is text only; never likelihood/impact/treatment scoring (those
 * stay in the deterministic posture-driven path).
 *
 * The user must explicitly accept Claude's draft — the wizard surfaces it
 * as an opt-in diff card with "Use this" / "Discard" buttons. This
 * endpoint does NOT mutate state.
 */

type Body = {
  scenarioId: string;
  section: "risk_statement" | "treatment_notes";
  /** Whatever the user has typed so far in this field — will be improved on, not replaced cold. */
  currentDraft?: string;
  /** When section=treatment_notes, the chosen treatment (mitigate/accept/transfer/avoid). */
  treatment?: string;
};

const MAX_OUTPUT_TOKENS = 400;

export async function POST(req: Request) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scenarioId || !body.section) {
    return NextResponse.json({ error: "scenarioId and section required" }, { status: 400 });
  }

  const scenario = scenarioById(body.scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "Unknown scenarioId" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI tailoring unavailable: ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const posture = await computeOrgPosture(orgId);

  const postureSummary = [
    `Boundary name: "${posture.boundaryName}"`,
    `Implemented controls: ${posture.implementedControlCount}`,
    `Open critical CVEs: ${posture.vulnerability.openCritical}; open high: ${posture.vulnerability.openHigh}`,
    `Signed program attestations on file: ${posture.signedAttestations.map((a) => a.label).slice(0, 8).join(", ") || "(none)"}`,
  ].join("\n");

  let systemPrompt: string;
  let userPrompt: string;

  if (body.section === "risk_statement") {
    systemPrompt = `You are a CMMC compliance writer helping document a risk assessment under NIST SP 800-30 Rev 1.
Produce a single tightened risk statement (one paragraph, 2-4 sentences max).
Replace generic phrases like "the CUI vault" with the actual boundary name when given.
Do NOT change the underlying threat or vulnerability; do NOT make up facts; do NOT add likelihood/impact/scoring.
Keep the tone professional and audit-defensible. Output only the risk statement, no preamble.`;
    userPrompt = `## Curated scenario
**Title:** ${scenario.title}
**Threat source:** ${scenario.threatSource}
**Vulnerability:** ${scenario.vulnerability}
**Potential impact:** ${scenario.potentialImpact}
**Original risk statement:** ${scenario.riskStatement}

## Org posture (use to tailor wording, not to make up new facts)
${postureSummary}

## Current draft (the user has already edited; build on this if non-empty)
${body.currentDraft?.trim() || "(none — start from the original risk statement)"}

Write the tailored risk statement now.`;
  } else {
    const treatment = body.treatment ?? "mitigate";
    systemPrompt = `You are a CMMC compliance writer helping document a risk assessment under NIST SP 800-30 Rev 1.
Produce treatment notes (one paragraph, 2-4 sentences) explaining the rationale for the chosen treatment strategy and any dependencies.
Reference real controls and signed attestations from the org's posture when relevant.
Do NOT recommend a different treatment; the operator has chosen "${treatment}".
Do NOT make up facts; if the posture doesn't support a claim, leave it out.
Output only the notes paragraph, no preamble.`;
    userPrompt = `## Curated scenario
**Title:** ${scenario.title}
**Risk statement:** ${scenario.riskStatement}
**Chosen treatment:** ${treatment}

## Org posture (factual context)
${postureSummary}

## Current draft (build on this if non-empty)
${body.currentDraft?.trim() || "(none — write fresh notes)"}

Write the treatment notes now.`;
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  if (!text) {
    return NextResponse.json(
      { error: "Claude returned an empty response. Try again or write manually." },
      { status: 502 },
    );
  }

  console.log(
    JSON.stringify({
      event: "risk_assessment_ai_rewrite",
      orgId,
      scenarioId: body.scenarioId,
      section: body.section,
      modelUsed: "claude-haiku-4-5",
      outputChars: text.length,
    }),
  );

  return NextResponse.json({
    text,
    aiAssisted: true,
    modelUsed: "claude-haiku-4-5",
  });
}
