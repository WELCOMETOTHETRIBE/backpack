import { NextResponse, type NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

import { db } from "@/db"
import { controls } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  DraftedScenarioSchema,
  GenerateScenarioRequestSchema,
  logIrAuditEvent,
  type DraftedScenario,
} from "@/lib/ir-tabletop-bridge"

/**
 * POST /api/ir-tabletop/scenarios/generate
 *
 * Phase 12: AI-drafted custom scenarios.
 *
 * Returns a fully-formed scenario draft (title, summary, narrative, ROE,
 * 6-8 injects with control mappings + MITRE TTPs + objective pass criteria)
 * the customer can preview, optionally refine, and save via POST /scenarios.
 *
 * NOTHING is persisted by this endpoint. The customer always reviews + saves.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = GenerateScenarioRequestSchema.parse(JSON.parse(rawBody))

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AI scenario generation unavailable: ANTHROPIC_API_KEY not configured.",
        },
        { status: 503 }
      )
    }

    // Pull the live valid control id list so the prompt can constrain Claude
    // to actual NIST 800-171 / CMMC L2 control identifiers (instead of inventing
    // them). This is the cheapest defense against hallucinated control IDs.
    const controlRows = await db
      .select({ controlId: controls.controlId })
      .from(controls)
    const validControlIds = controlRows.map((r) => r.controlId)
    if (validControlIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Control library is empty — seed controls before using the scenario generator.",
        },
        { status: 503 }
      )
    }

    const prompt = buildPrompt({
      userPrompt: body.prompt,
      validControlIds,
      previousDraft: body.previousDraft,
      refinementPrompt: body.refinementPrompt,
    })

    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    })

    const rawText = msg.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()

    if (!rawText) {
      return NextResponse.json(
        { error: "AI returned empty content. Try again with a clearer prompt." },
        { status: 502 }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(stripCodeFences(rawText))
    } catch {
      return NextResponse.json(
        {
          error:
            "AI returned non-JSON content. Try again — usually a clearer or shorter prompt fixes this.",
          rawSnippet: rawText.slice(0, 400),
        },
        { status: 502 }
      )
    }

    const validation = DraftedScenarioSchema.safeParse(parsed)
    if (!validation.success) {
      return NextResponse.json(
        {
          error:
            "AI output failed schema validation. Likely the prompt asked for something outside our scenario shape — try refining or simplifying.",
          issues: validation.error.issues.slice(0, 8),
          rawSnippet: rawText.slice(0, 400),
        },
        { status: 502 }
      )
    }

    const draft = validation.data

    // Defense-in-depth: every control id Claude included must be in the live
    // controls table. Reject if any are invented.
    const validControlIdSet = new Set(validControlIds)
    const invalidIds = collectInvalidControlIds(draft, validControlIdSet)
    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error: `AI invented ${invalidIds.length} control id(s) that don't exist in the library: ${invalidIds.slice(0, 5).join(", ")}. Try regenerating.`,
          invalidControlIds: invalidIds,
        },
        { status: 502 }
      )
    }

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "scenario_drafted",
      resourceType: "ir_scenario",
      resourceId: null,
      details: {
        promptChars: body.prompt.length,
        injectCount: draft.injectsJson.length,
        controlCount: draft.targetedControlIds.length,
        modelUsed: "claude-sonnet-4-5",
        refinement: !!body.refinementPrompt,
      },
      req,
    })

    return NextResponse.json({
      draft,
      modelUsed: "claude-sonnet-4-5",
      aiAssisted: true,
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

function stripCodeFences(text: string): string {
  // Claude sometimes wraps JSON in ```json ... ``` despite "no fences" instructions.
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/)
  return fenceMatch ? fenceMatch[1].trim() : text
}

function collectInvalidControlIds(
  draft: DraftedScenario,
  valid: Set<string>
): string[] {
  const invalid: string[] = []
  for (const id of draft.targetedControlIds) {
    if (!valid.has(id)) invalid.push(id)
  }
  for (const inj of draft.injectsJson) {
    for (const id of inj.controlIds) {
      if (!valid.has(id) && !invalid.includes(id)) invalid.push(id)
    }
  }
  return invalid
}

function buildPrompt(args: {
  userPrompt: string
  validControlIds: string[]
  previousDraft?: DraftedScenario
  refinementPrompt?: string
}): string {
  const lines: string[] = []
  lines.push(
    "You are generating a CMMC 2.0 Level 2 IR Tabletop scenario for a customer running a single-tenant CUI Vault on Windows Server 2025 in Microsoft Azure Government. The output goes into a structured assessment-grade evidence package."
  )
  lines.push("")
  lines.push("USER PROMPT (what kind of incident scenario):")
  lines.push(args.userPrompt)

  if (args.previousDraft && args.refinementPrompt) {
    lines.push("")
    lines.push("PREVIOUS DRAFT (improve, don't replace wholesale):")
    lines.push(JSON.stringify(args.previousDraft, null, 2))
    lines.push("")
    lines.push("REFINEMENT REQUEST:")
    lines.push(args.refinementPrompt)
  }

  lines.push("")
  lines.push("OUTPUT REQUIREMENTS — CRITICAL, READ EVERY LINE:")
  lines.push("")
  lines.push("Return ONLY a single JSON object matching this shape:")
  lines.push("")
  lines.push("{")
  lines.push("  \"title\":  short scenario title (5-200 chars),")
  lines.push("  \"summary\": 1-2 sentences (20-500 chars),")
  lines.push("  \"narrative\": 1-2 paragraph background (50-3000 chars),")
  lines.push("  \"targetedControlIds\": [array of NIST 800-171 / CMMC L2 control IDs from the allow-list below],")
  lines.push("  \"defaultRoe\": rules of engagement statement (20-2000 chars),")
  lines.push("  \"injectsJson\": [array of 4-12 injects, see inject shape]")
  lines.push("}")
  lines.push("")
  lines.push("Each inject must be:")
  lines.push("{")
  lines.push("  \"key\": stable id (alphanumeric + dash + underscore + plus only, e.g. \"T+30-account-disabled\"),")
  lines.push("  \"offsetMinutes\": integer 0-240 — minutes from T+0,")
  lines.push("  \"prompt\": the inject prompt to read aloud (20-2000 chars),")
  lines.push("  \"expectedAction\": what the team should do (10-1000 chars),")
  lines.push("  \"controlIds\": [subset of targetedControlIds — at least one],")
  lines.push("  \"passCriteria\": OBJECTIVE pass criterion (20-500 chars),")
  lines.push("  \"mitreTtps\": [MITRE technique IDs like \"T1078.003\"; empty array allowed for non-attacker injects like reporting decisions]")
  lines.push("}")
  lines.push("")
  lines.push("HARD RULES:")
  lines.push("- IR.L2-3.6.1, IR.L2-3.6.2, and IR.L2-3.6.3 MUST appear in targetedControlIds. This is non-negotiable for CMMC alignment.")
  lines.push("- Pass criteria must be MEASURABLE — time bounds (\"within 15 minutes\"), specific actions (\"account disabled\", \"log preservation order issued\"), or specific artifacts (\"DC3 submission path documented\"). NEVER subjective phrases like \"team responds well\" or \"adequate response\".")
  lines.push("- Inject prompts should be realistic — actual IT/security signals like SIEM alerts, Defender alerts, audit log entries, user reports, network telemetry. Reference actual Windows Server / Azure Gov primitives where appropriate.")
  lines.push("- Injects span the timeline naturally — typically T+0, T+15, T+30, T+45, T+60, T+75 (or similar). 6-8 injects is the typical count.")
  lines.push("- Reporting/recovery injects (e.g. \"decide whether to notify DC3\", \"validate backups\") should have empty mitreTtps arrays — those aren't attacker techniques.")
  lines.push("- Detection/exploitation injects (e.g. \"successful login from foreign IP\", \"ransomware behavior\") should have populated mitreTtps arrays.")
  lines.push("- The defaultRoe MUST state \"Simulation only\" and forbid live destructive activity.")
  lines.push("")
  lines.push("CONTROL ID ALLOW-LIST (use ONLY these IDs in targetedControlIds and inject controlIds — picking one not on this list will fail validation):")
  lines.push(args.validControlIds.join(", "))
  lines.push("")
  lines.push("OUTPUT FORMAT:")
  lines.push("- Output ONLY the JSON object.")
  lines.push("- No markdown code fences. No preamble. No closing remarks.")
  lines.push("- Use double-quoted property names, valid JSON, no trailing commas.")
  return lines.join("\n")
}
