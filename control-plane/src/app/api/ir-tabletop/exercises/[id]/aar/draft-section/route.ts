import { NextResponse, type NextRequest } from "next/server"
import { and, asc, eq } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"

import { db } from "@/db"
import {
  irAars,
  irExercises,
  irFindings,
  irInjectResponses,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  DraftAarSectionRequestSchema,
  logIrAuditEvent,
  type AarSectionKey,
} from "@/lib/ir-tabletop-bridge"

const SECTION_LABEL: Record<AarSectionKey, string> = {
  executiveSummary: "Executive Summary",
  timelineNarrative: "Timeline Narrative",
  strengths: "Strengths",
  gaps: "Gaps",
  evidenceReviewed: "Evidence Reviewed",
}

const SECTION_GUIDANCE: Record<AarSectionKey, string> = {
  executiveSummary:
    "1-2 paragraphs. Open with what was tested and the outcome. Name the scenario, methodology, and final result. Mention the most consequential decisions (good or bad). End with the headline takeaway for leadership.",
  timelineNarrative:
    "Chronological narrative covering the exercise from T+0 to the last captured inject. Use the actual inject responses with their T+ timestamps. Don't list injects; tell the story of how the team responded over time.",
  strengths:
    "Specific things the team did well. Reference the exact inject responses that demonstrate strength. Avoid generic praise — say what worked and why.",
  gaps:
    "Specific gaps observed. Reference the exact injects where the team fell short. If 'fail' or 'partial' or 'not_reached' statuses exist, ground the gap in those. Avoid generic deficiencies — call out the specific decision or process that didn't hold up.",
  evidenceReviewed:
    "List the artifacts the team consulted during the exercise: logs, tickets, procedures, the customer's IR plan, screenshots, etc. Be specific about which artifact was used at which inject.",
}

/**
 * POST /api/ir-tabletop/exercises/:id/aar/draft-section
 *
 * Phase 11: AI-assisted AAR drafting. The customer clicks "Suggest from
 * captured data" next to one of the AAR textareas; we read the exercise's
 * scenario snapshot + captured inject responses + (for the Gaps section)
 * findings, and ask Claude to draft 2-3 paragraphs of professional prose
 * the customer can edit and save.
 *
 * The customer ALWAYS edits before saving — the audit log on aar_drafted
 * already exists; this endpoint contributes a separate aar_section_drafted
 * audit entry with `aiAssisted: true` so the C3PAO can see which sections
 * were AI-drafted vs. human-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = DraftAarSectionRequestSchema.parse(JSON.parse(rawBody))

    // Tenant isolation + load context for the prompt.
    const exercise = (
      await db
        .select()
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!exercise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (!exercise.scenarioSnapshotJson) {
      return NextResponse.json(
        { error: "Exercise has no scenario snapshot — cannot draft." },
        { status: 422 }
      )
    }

    const responses = await db
      .select()
      .from(irInjectResponses)
      .where(eq(irInjectResponses.exerciseId, id))
      .orderBy(asc(irInjectResponses.decisionOffsetMinutes))

    let findings: Array<typeof irFindings.$inferSelect> = []
    if (body.section === "gaps") {
      const aar = (
        await db
          .select()
          .from(irAars)
          .where(eq(irAars.exerciseId, id))
          .limit(1)
      )[0]
      if (aar) {
        findings = await db
          .select()
          .from(irFindings)
          .where(eq(irFindings.aarId, aar.id))
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AI drafting unavailable: ANTHROPIC_API_KEY is not configured on control-plane.",
        },
        { status: 503 }
      )
    }

    const scenario = exercise.scenarioSnapshotJson as {
      code: string
      title: string
      summary: string
    }

    const prompt = buildPrompt({
      sectionKey: body.section,
      sectionLabel: SECTION_LABEL[body.section],
      sectionGuidance: SECTION_GUIDANCE[body.section],
      existingText: body.existingText,
      exercise: {
        name: exercise.name,
        customerName: exercise.customerName,
        systemName: exercise.systemName,
        methodology: exercise.methodology,
        scopeStatement: exercise.scopeStatement,
      },
      scenario,
      responses: responses.map((r) => ({
        injectKey: r.injectKey,
        offsetMinutes: r.decisionOffsetMinutes ?? 0,
        prompt: r.injectPromptSnapshot,
        status: r.status,
        notes: r.actualResponseNotes,
      })),
      findings: findings.map((f) => ({
        severity: f.severity,
        controlId: f.controlId,
        title: f.title,
        description: f.description,
      })),
    })

    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    })

    const text = msg.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()

    if (!text) {
      return NextResponse.json(
        { error: "AI returned an empty response. Try again or draft manually." },
        { status: 502 }
      )
    }

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "aar_section_drafted",
      resourceType: "ir_aar",
      resourceId: id,
      details: {
        section: body.section,
        aiAssisted: true,
        existingTextProvided: !!body.existingText,
        responseCount: responses.length,
        findingCount: findings.length,
        modelUsed: "claude-haiku-4-5",
        outputChars: text.length,
      },
      req,
    })

    return NextResponse.json({
      section: body.section,
      text,
      aiAssisted: true,
      modelUsed: "claude-haiku-4-5",
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

function buildPrompt(args: {
  sectionKey: AarSectionKey
  sectionLabel: string
  sectionGuidance: string
  existingText?: string
  exercise: {
    name: string
    customerName: string
    systemName: string
    methodology: string
    scopeStatement: string
  }
  scenario: { code: string; title: string; summary: string }
  responses: Array<{
    injectKey: string
    offsetMinutes: number
    prompt: string
    status: string
    notes: string | null
  }>
  findings: Array<{
    severity: string
    controlId: string
    title: string
    description: string
  }>
}): string {
  const lines: string[] = []
  lines.push(
    `You are drafting one section of a CMMC 2.0 Level 2 Incident Response After-Action Report. The drafted text will be reviewed and edited by a human before it's saved, but it should be ready-to-submit quality.`
  )
  lines.push("")
  lines.push(`SECTION: ${args.sectionLabel}`)
  lines.push("")
  lines.push("GUIDANCE FOR THIS SECTION:")
  lines.push(args.sectionGuidance)
  lines.push("")
  lines.push("EXERCISE CONTEXT:")
  lines.push(`- Name: ${args.exercise.name}`)
  lines.push(`- Customer: ${args.exercise.customerName}`)
  lines.push(`- System: ${args.exercise.systemName}`)
  lines.push(`- Methodology: ${args.exercise.methodology}`)
  lines.push(`- Scope: ${args.exercise.scopeStatement}`)
  lines.push(
    `- Scenario: ${args.scenario.code} — ${args.scenario.title} (${args.scenario.summary})`
  )
  lines.push("")
  lines.push(
    `CAPTURED INJECT RESPONSES (${args.responses.length} total, in chronological order):`
  )
  if (args.responses.length === 0) {
    lines.push("(no inject responses captured yet)")
  } else {
    for (const r of args.responses) {
      lines.push(
        `- T+${r.offsetMinutes}m [${r.status.toUpperCase()}] ${r.injectKey}: ${r.prompt}`
      )
      if (r.notes) {
        lines.push(`  Decision notes: ${r.notes}`)
      } else {
        lines.push(`  Decision notes: (none captured)`)
      }
    }
  }

  if (args.sectionKey === "gaps" && args.findings.length > 0) {
    lines.push("")
    lines.push(`FINDINGS RECORDED (${args.findings.length}):`)
    for (const f of args.findings) {
      lines.push(
        `- ${f.severity.toUpperCase()} (${f.controlId}) ${f.title}: ${f.description}`
      )
    }
  }

  if (args.existingText && args.existingText.trim()) {
    lines.push("")
    lines.push("EXISTING DRAFT (improve and extend; don't replace wholesale):")
    lines.push(args.existingText)
  }

  lines.push("")
  lines.push("OUTPUT RULES:")
  lines.push(
    "- Output ONLY the section body text. No headings, no preamble, no closing remarks."
  )
  lines.push(
    "- Reference specific inject responses by their decisions and T+ timestamps where relevant."
  )
  lines.push("- Be specific. Don't speculate beyond what's captured.")
  lines.push(
    "- Plain professional English. Avoid corporate buzzwords like 'leverage', 'synergize', 'best-in-class'."
  )
  lines.push("- 2-3 paragraphs unless the section is short by nature.")

  return lines.join("\n")
}
