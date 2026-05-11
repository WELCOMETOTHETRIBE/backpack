/**
 * One-shot: send the CMMC L2 close-out punch-list email to the team
 * via Resend, using the existing inline template style
 * (src/lib/ir-tabletop-dispute-email.ts + src/app/api/invitations/route.ts).
 *
 * Recipients fixed at script-write time. Re-edit the recipient block
 * below and re-run if you need to change the audience.
 *
 * Run with:
 *   RESEND_API_KEY=... npx tsx src/scripts/send-cmmc-closeout-email.ts
 *
 * To pull the key from Railway:
 *   RESEND_API_KEY=$(railway variables --service=CMMC --kv | \
 *     grep '^RESEND_API_KEY=' | cut -d= -f2-) \
 *     npx tsx src/scripts/send-cmmc-closeout-email.ts
 */
import { Resend } from "resend";

const TO = ["james@mactechsolutionsllc.com", "brian@mactechsolutionsllc.com"];
const CC = ["patrick@mactechsolutionsllc.com"];
const REPLY_TO = "patrick@mactechsolutionsllc.com";

const SUBJECT =
  "CMMC L2 — remaining 11 controls + operational exercises to close 110/110";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const HTML = `<!doctype html>
<html>
  <body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;max-width:680px;margin:auto;padding:24px;line-height:1.55">

  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:20px">
    <p style="font-size:11px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;margin:0">Trust Codex · MacTech CMMC L2</p>
    <h1 style="font-size:18px;margin:6px 0 0">Remaining 11 controls + operational exercises to close 110/110</h1>
  </div>

  <p>Hi James, Brian —</p>
  <p>Live SCTM as of today is <strong>99 of 110 controls satisfied</strong>. Below is the complete breakdown of what's left and who owns each piece. Some are operational exercises we need to actually run (training, tabletop, annual RA, vuln scan), some are QMS policy releases, and a few are Codex-side technical wiring on my end.</p>
  <p>I've grouped by owner so the action list is unambiguous.</p>

  <h2 style="font-size:15px;margin-top:28px;color:#111827;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Operational exercises we need to schedule + run</h2>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">1. CUI Awareness + Role-Based Training — AT.L2-3.2.1, 3.2.2, 3.2.3</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 8px">Currently <strong style="color:#b91c1c">0 of 3</strong> on SCTM</p>
  <p>Each of us needs to take TrainOS <strong>AT-001</strong> (CMMC CUI, Cyber Risk &amp; Insider Threat Awareness, ~60 min) and <strong>AT-002</strong> (Role-Based Security Training, ~50–70 min). Certificates issue with deterministic hashes on pass.</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>Who</strong>: all three of us — Patrick (AO), Brian (System Owner), James (ISSO)</li>
    <li><strong>Cadence going forward</strong>: annual per AT.L2-3.2.1[c]</li>
    <li><strong>Codex-side dependency</strong>: I'm wiring the AT bundle ingest path so attempts flip per-control adjudication. Will land before you take the training.</li>
    <li><strong>Target</strong>: complete both modules by <strong>2026-05-31</strong></li>
  </ul>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">2. Annual IR Tabletop Exercise — IR.L2-3.6.3</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 8px">IR family currently 2 of 3</p>
  <p>Need to schedule and execute one annual IR tabletop using the TrainOS IR Tabletop module. The 11-file deterministic evidence bundle (Exercise Plan, Facilitator Guide, Injects, AAR, CAR Register, etc.) finalizes after the exercise. Once it lands in Codex via the IR-Tabletop bridge, 3.6.3 flips MET.</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>Brian</strong>: schedule + facilitate</li>
    <li><strong>Patrick</strong>: participate as AO</li>
    <li><strong>James</strong>: participate as ISSO</li>
    <li><strong>Cadence going forward</strong>: annual</li>
    <li><strong>Target</strong>: schedule by <strong>2026-05-20</strong>, execute by <strong>2026-06-15</strong></li>
  </ul>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">3. Annual Risk Assessment — RA.L2-3.11.1</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 8px">RA family currently 2 of 3</p>
  <p>We have 5 RA envelopes on file (1 finalized + 4 superseded) but the SCTM shows the family below MET. Re-run the 2026 annual cycle through the TrainOS Annual Risk Assessment 7-phase wizard so the cadence stays current. Module produces an 11-file vault zip plus the Codex relational mirror.</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>Brian</strong>: lead author through the wizard</li>
    <li><strong>James</strong>: review (cannot also be the assessor — SoD enforced at the state machine)</li>
    <li><strong>Patrick</strong>: executive approve as AO</li>
    <li><strong>Cadence going forward</strong>: annual</li>
    <li><strong>Target</strong>: complete 2026 cycle by <strong>2026-06-30</strong></li>
  </ul>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">4. Vulnerability Scan + Ingest — RA.L2-3.11.2</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 8px">Currently NOT MET</p>
  <p>Run Microsoft Defender for Cloud (or Qualys) against the CUI Vault VM, ingest the report via the ISSO weekly review handler so it lands in the <code>vuln_remediation</code> register.</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>James</strong>: own the scan + ingest</li>
    <li><strong>Cadence going forward</strong>: monthly minimum</li>
    <li><strong>Target</strong>: first scan + ingest by <strong>2026-05-20</strong></li>
  </ul>

  <h2 style="font-size:15px;margin-top:28px;color:#111827;border-bottom:1px solid #e5e7eb;padding-bottom:6px">QMS Document Control releases</h2>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">5. MAC-POL-229 (External System Connections &amp; ISA Policy) — AC.L2-3.1.20</h3>
  <p>Doc is authored and currently in DRAFT in QMS. Walk it through Reviewer → Approver → Quality Release.</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>Brian</strong>: submit for review</li>
    <li><strong>James</strong>: technical review (ISSO)</li>
    <li><strong>Patrick</strong>: approve as AO</li>
    <li><strong>Quality Release</strong>: whoever holds the QR role</li>
    <li><strong>After release</strong>: James populates the <code>external_system_connections</code> register with current connections (federal customer endpoints, contracted assessor uplinks, the QMS bridge itself)</li>
    <li><strong>Target</strong>: Released by <strong>2026-05-17</strong></li>
  </ul>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">6. NEW — MAC-POL-2XX Separation of Duties Policy — AC.L2-3.1.4</h3>
  <p>Currently fragile (only Doc Control bin) and there's no dedicated doc — MAC-SOP-243 covers 3.13.3 (system-functionality separation), which is a different control than 3.1.4 (personnel-workflow separation). Need a new policy that names: roles, the <code>role_assignment_matrix</code>, the <code>sod_matrix</code>, and the workflows where SoD is enforced (PR approvals, ISA workflow, RA approver chain, etc.).</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>Brian</strong>: author (mirror MAC-POL-229 structure — especially the §11 NIST SP 800-171A crosswalk that maps each determination statement [a]–[c] to a policy section)</li>
    <li><strong>Target</strong>: draft by <strong>2026-05-20</strong>, Released by <strong>2026-05-31</strong></li>
  </ul>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">7. NEW — MAC-POL-2XX Maintenance Personnel Escort Policy — MA.L2-3.7.6</h3>
  <p>Currently fragile (Doc Control only). Need a brief policy (~5 pages) that defines: how external maintenance personnel are escorted and monitored on the CUI Vault, MFA requirements (cross-references 3.7.5), session audit, deauth on departure.</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li><strong>Brian</strong>: author</li>
    <li><strong>Target</strong>: draft by <strong>2026-05-25</strong>, Released by <strong>2026-06-10</strong></li>
  </ul>

  <h2 style="font-size:15px;margin-top:28px;color:#111827;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Codex-side technical wiring (Patrick — for visibility)</h2>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">8. Azure PIM/PAM evidence wiring — AC.L2-3.1.15</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 8px">Currently NOT MET</p>
  <p>Azure-bin metadata correctly includes 3.1.15 (PIM activation logs, Conditional Access, role assignments), but the CAE scorer needs register entries to actually credit it. Three options under consideration:</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li>(a) Add a dedicated <code>azure_privileged_access</code> register type, wire 3.1.15 to require it, modify the Azure ingest pipeline to land each PIM activation as an entry</li>
    <li>(b) Have Azure ingest land PIM activations as <code>access_authorization</code> register entries (semantic fit, no new register type)</li>
    <li>(c) Stamp <code>control_records.implementation_status='implemented'</code> for 3.1.15 directly when Azure PIM evidence is present (mirrors the QMS manifest bridge today)</li>
  </ul>
  <p>I'm leaning toward (a) for clean separation. James — when the time comes, will need your sign-off on the Azure ingest pipeline change to land PIM evidence per the new schema.</p>
  <p><strong>Target</strong>: ship by <strong>2026-05-20</strong></p>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">9. AT family CAE plumbing — supports operational exercise #1 above</h3>
  <p>Codex's CAE doesn't currently credit TrainOS AT bundle evidence for 3.2.1/3.2.2/3.2.3. Will extend <code>control_assessment_logic.v1.json</code> to name a TrainOS-source register (<code>trainos_at_attempts</code>) and wire the ingest path. Must precede the team taking training so the family flips when we complete.</p>
  <p><strong>Target</strong>: ship by <strong>2026-05-20</strong> (blocking #1)</p>

  <h3 style="font-size:14px;margin-top:18px;color:#111827">10. CA family TrainOS plumbing audit — CA.L2-3.12.2, 3.12.3</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 8px">CA family currently 2 of 4</p>
  <p>TrainOS CA-001 has shipped 2 ANNUAL_FORMAL bundles per the data sheet but live SCTM shows 3.12.2 (POA&amp;M) and 3.12.3 (continuous monitoring) NOT MET. Likely a missing field in the rescore trigger or <code>register_requirements</code>. Diagnostic + fix.</p>
  <p><strong>Target</strong>: ship by <strong>2026-05-15</strong></p>

  <h2 style="font-size:15px;margin-top:28px;color:#111827;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Punch list (for tracking)</h2>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
    <thead>
      <tr style="background:#f3f4f6;color:#374151">
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb">#</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb">Control(s)</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb">Owner</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb">Target</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb">Type</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">1</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">AT.L2-3.2.1/2/3</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">All three (training)</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-05-31</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Operational</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">IR.L2-3.6.3</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Brian leads</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-06-15</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Operational</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">3</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">RA.L2-3.11.1</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Brian leads</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-06-30</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Operational</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">4</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">RA.L2-3.11.2</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">James</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-05-20</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Operational</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">5</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">AC.L2-3.1.20</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Brian + James</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-05-17</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">QMS release</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">6</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">AC.L2-3.1.4</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Brian</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-05-31</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">New policy</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">7</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">MA.L2-3.7.6</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Brian</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-06-10</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">New policy</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">8</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">AC.L2-3.1.15</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Patrick + James</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-05-20</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Codex + Azure ingest</td></tr>
      <tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">9</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">AT plumbing</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Patrick</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">2026-05-20</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">Codex (blocks #1)</td></tr>
      <tr><td style="padding:5px 8px">10</td><td style="padding:5px 8px">CA.L2-3.12.2/3</td><td style="padding:5px 8px">Patrick</td><td style="padding:5px 8px">2026-05-15</td><td style="padding:5px 8px">Codex</td></tr>
    </tbody>
  </table>

  <p style="margin-top:20px">If the targets work, we should be at <strong>110/110 with full audit defensibility by mid-July</strong>. Most of these can be re-sequenced if needed, but two have hard order dependencies:</p>
  <ul style="margin:6px 0;padding-left:20px">
    <li>#9 (AT plumbing) must land before #1 (we take training) or the family won't flip</li>
    <li>#5 (MAC-POL-229 release) must complete before the register population in #5</li>
  </ul>

  <p>Raise it now if any timeline doesn't work — happy to re-shuffle.</p>

  <p style="margin-top:20px">Thanks,<br/>Patrick</p>

  <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" />
  <p style="color:#9ca3af;font-size:11px">Sent from Trust Codex on behalf of Patrick Caruso. Reply to this thread to reach the group.</p>

  </body>
</html>`;

const TEXT = `MacTech CMMC L2 — Remaining 11 controls + operational exercises to close 110/110

Hi James, Brian —

Live SCTM as of today is 99 of 110 controls satisfied. Below is the complete breakdown of what's left and who owns each piece.

OPERATIONAL EXERCISES WE NEED TO SCHEDULE + RUN

1. CUI Awareness + Role-Based Training — AT.L2-3.2.1, 3.2.2, 3.2.3 (currently 0/3)
   - Each of us needs TrainOS AT-001 (~60 min) and AT-002 (~50-70 min)
   - Who: all three of us
   - Codex-side dependency: AT bundle ingest plumbing (#9 below)
   - Target: complete by 2026-05-31

2. Annual IR Tabletop — IR.L2-3.6.3 (IR family 2/3)
   - Brian: schedule + facilitate; Patrick (AO) + James (ISSO) participate
   - Target: schedule by 2026-05-20, execute by 2026-06-15

3. Annual Risk Assessment — RA.L2-3.11.1 (RA family 2/3)
   - Brian leads, James reviews, Patrick approves
   - Target: 2026 cycle complete by 2026-06-30

4. Vulnerability Scan ingest — RA.L2-3.11.2
   - James: Defender for Cloud or Qualys, ingest via ISSO weekly handler
   - Cadence: monthly going forward
   - Target: first scan by 2026-05-20

QMS DOC CONTROL RELEASES

5. MAC-POL-229 (External System Connections & ISA) — AC.L2-3.1.20
   - Currently DRAFT. Walk through Reviewer/Approver/QR
   - Brian: submit; James: review; Patrick: approve; QR: release
   - James populates external_system_connections register after release
   - Target: Released by 2026-05-17

6. NEW — Separation of Duties Policy — AC.L2-3.1.4
   - MAC-SOP-243 covers 3.13.3 (different control). Need a dedicated 3.1.4 doc.
   - Brian: author (mirror MAC-POL-229 structure)
   - Target: draft by 2026-05-20, Released by 2026-05-31

7. NEW — Maintenance Personnel Escort Policy — MA.L2-3.7.6
   - Brian: author
   - Target: draft by 2026-05-25, Released by 2026-06-10

CODEX-SIDE TECHNICAL WIRING (Patrick — for visibility)

8. Azure PIM/PAM evidence wiring — AC.L2-3.1.15
   - Metadata is correct; need register-entry plumbing
   - Patrick (Codex) + James (Azure ingest)
   - Target: ship by 2026-05-20

9. AT family CAE plumbing — supports #1
   - Wire control_assessment_logic to credit TrainOS AT attempts
   - Patrick (Codex)
   - Target: ship by 2026-05-20 (blocking #1)

10. CA family TrainOS plumbing audit — CA.L2-3.12.2, 3.12.3
    - Diagnose why CA-001 bundles aren't flipping these controls
    - Patrick (Codex)
    - Target: ship by 2026-05-15

PUNCH LIST

#  Control(s)         Owner                 Target       Type
1  AT.L2-3.2.1/2/3    All three (training)  2026-05-31   Operational
2  IR.L2-3.6.3        Brian leads           2026-06-15   Operational
3  RA.L2-3.11.1       Brian leads           2026-06-30   Operational
4  RA.L2-3.11.2       James                 2026-05-20   Operational
5  AC.L2-3.1.20       Brian + James         2026-05-17   QMS release
6  AC.L2-3.1.4        Brian                 2026-05-31   New policy
7  MA.L2-3.7.6        Brian                 2026-06-10   New policy
8  AC.L2-3.1.15       Patrick + James       2026-05-20   Codex + Azure ingest
9  AT plumbing        Patrick               2026-05-20   Codex (blocks #1)
10 CA.L2-3.12.2/3     Patrick               2026-05-15   Codex

If the targets work, we should be at 110/110 with full audit defensibility by mid-July. Two hard order dependencies:
  - #9 (AT plumbing) must land before #1 (training)
  - #5 (MAC-POL-229 release) must complete before the register population

Raise it now if any timeline doesn't work — happy to re-shuffle.

Thanks,
Patrick

—
Sent from Trust Codex on behalf of Patrick Caruso. Reply to this thread to reach the group.
`;

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set");
    process.exit(1);
  }
  const from =
    process.env.RESEND_FROM ?? "Trust Codex <no-reply@mactechsolutionsllc.com>";

  console.log("Sending email:");
  console.log(`  From: ${from}`);
  console.log(`  To: ${TO.join(", ")}`);
  console.log(`  Cc: ${CC.join(", ")}`);
  console.log(`  Reply-To: ${REPLY_TO}`);
  console.log(`  Subject: ${SUBJECT}`);
  console.log("");

  const resend = new Resend(apiKey);

  // Resend's Node SDK uses camelCase (replyTo, not reply_to); snake_case
  // gets validation-rejected with the misleading "domain is invalid"
  // 422. The other email paths in this codebase don't use cc/replyTo
  // at all so the bug never surfaced before. Use camelCase here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    from,
    to: TO,
    cc: CC,
    replyTo: REPLY_TO,
    subject: SUBJECT,
    html: HTML,
    text: TEXT,
  };

  // Suppress the unused-after-renderfn warning from the helper's
  // explicit-any path while still providing the escapeHtml utility for
  // the (unused at present) future-templating callers.
  void escapeHtml;

  try {
    const res = await resend.emails.send(payload);
    console.log("✓ Send dispatched.");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("✗ Resend rejected:");
    console.error(err);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
