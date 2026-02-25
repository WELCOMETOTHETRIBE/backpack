import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";

const ALLOWED_TECHNOLOGIES = new Set([
  "windows_11",
  "windows_server",
  "rhel",
  "macos",
  "azure_gov",
  "aws_govcloud",
  "entra_id",
  "okta",
  "intune",
  "jamf",
  "defender",
  "crowdstrike",
  "splunk",
  "tenable",
  "palo_alto",
  "cisco_asa",
]);

const KEY_HINTS =
  "Technology keys (return only these exact strings if they apply): windows_11, windows_server, rhel, macos, azure_gov, aws_govcloud, entra_id, okta, intune, jamf, defender, crowdstrike, splunk, tenable, palo_alto, cisco_asa. " +
  "Map common terms: Azure Government -> azure_gov, AWS GovCloud -> aws_govcloud, Entra ID/Azure AD -> entra_id, Intune -> intune, JAMF -> jamf, Microsoft Defender -> defender, CrowdStrike -> crowdstrike, Splunk -> splunk, Tenable/Nessus -> tenable, Palo Alto -> palo_alto, Cisco -> cisco_asa, Windows 11 -> windows_11, Windows Server -> windows_server, RHEL/Linux -> rhel, macOS -> macos.";

/**
 * POST /api/boundary/parse-description
 * Body: { description: string }
 * Uses LLM to extract boundary technology keys from natural language; returns only keys in ALLOWED_TECHNOLOGIES.
 */
export async function POST(req: Request) {
  try {
    await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json().catch(() => ({}));
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Parse is not configured (OPENAI_API_KEY missing)." },
        { status: 503 }
      );
    }

    const { OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You extract technology stack keywords from a user's description of their IT/CUI environment. ${KEY_HINTS} Respond with a JSON array of only the applicable keys, e.g. ["azure_gov","entra_id","windows_server"]. If none apply, respond with []. No other text.`,
        },
        { role: "user", content: description.slice(0, 2000) },
      ],
      max_tokens: 200,
    });

    const raw =
      completion.choices[0]?.message?.content?.trim() || "[]";
    let parsed: unknown[] = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]) as unknown[];
    } catch {
      parsed = [];
    }
    const selectedTechnologies = (Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string")
      : []
    ).filter((k) => ALLOWED_TECHNOLOGIES.has(k));

    return NextResponse.json({ selectedTechnologies: [...new Set(selectedTechnologies)] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
