import Link from "next/link";
import { ArrowLeft, Cloud, Server, FileText, ShieldCheck } from "lucide-react";
import { AZURE_ENTRA_12_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";
import { ENCLAVE_73_NIST_IDS } from "@/lib/compliance/os-evidence-manifest";

// Force dynamic so the live counts always reflect current canonical lists.
export const dynamic = "force-dynamic";

/**
 * /dashboard/evidence-engine/about-collectors
 *
 * The "Two collectors, one workflow" explainer. Customers land here from:
 *   - The Outstanding Wizard's Azure-run hint banner
 *   - Phase 4 of onboarding (post-onboarding referral)
 *   - The evidence-engine sidebar (if they explore on their own)
 *
 * Goal: make the OS-vs-Azure split obvious, give them the exact commands
 * for both, and explain the C3PAO defensibility chain.
 */
export default function AboutCollectorsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/dashboard/evidence-engine"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Evidence Engine
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Two collectors, one workflow
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          OS evidence + Azure evidence = your C3PAO bundle
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          The MacTech CUI Vault relies on two parallel evidence pipelines. The
          OS Collector validates {ENCLAVE_73_NIST_IDS.length} enclave-baseline controls;
          the Azure/Entra Collector validates {AZURE_ENTRA_12_CONTROL_IDS.length} cloud-side
          controls. <strong>11 of those overlap</strong> (the same control validated by both
          pipelines for defense-in-depth) — so together the two produce
          technical proof for <strong>74 distinct controls</strong>. A C3PAO expects both
          bundles: the OS hardening alone or the Azure configuration alone is
          not enough.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-slate-500">
          Plus 5 controls (3.10.1, 3.10.2, 3.10.4, 3.10.5 + the broader 3.10
          family on attestation) are inherited from Azure Government FedRAMP
          High and need no customer-side collector. The remaining controls
          (governance, attestations, register entries) are surfaced by the
          Outstanding Controls Wizard at <code>/dashboard/readiness/outstanding</code>.
        </p>
      </header>

      <section className="mb-8 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            <Server className="h-4 w-4" />
            OS Collector
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            Windows Server 2025 hardening evidence
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Runs <em>on the VM</em>. Captures GPO state, BitLocker, AppLocker, audit policy,
            firewall rules, services, hotfixes, Defender, and FIPS-mode crypto for the
            73 enclave-baseline controls.
          </p>
          <div className="mt-4 rounded-lg bg-slate-900 p-3">
            <pre className="overflow-x-auto whitespace-pre text-[12px] leading-tight text-slate-100">
{`# On the Windows Server VM, in PowerShell as admin:
.\\Collect-Cui-Evidence-v2.ps1 -OutRoot C:\\evidence
.\\Test-CuiHardening.ps1 -OutRoot C:\\evidence -RunId <run>`}
            </pre>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <strong>Output:</strong>{" "}
            <code>CUI-Validation-&lt;RunId&gt;/validation-report.json</code>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <strong>Covers:</strong> {ENCLAVE_73_NIST_IDS.length} OS controls (AC, AU, CM,
            IA, MP, SC, SI families — see SCTM)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
            <Cloud className="h-4 w-4" />
            Azure / Entra Collector
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            Cloud / Entra ID configuration evidence
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Runs anywhere with <code>az login</code> (Mac, Linux, Windows, or the VM).
            Captures NSG rules, Key Vault properties, storage account TLS settings,
            Entra sign-in / audit logs, Conditional Access policies, and role
            assignments.
          </p>
          <div className="mt-4 rounded-lg bg-slate-900 p-3">
            <pre className="overflow-x-auto whitespace-pre text-[12px] leading-tight text-slate-100">
{`# macOS / Linux:
AZURE_RG=<your-rg> \\
  bash TRUST_CODEX/tools/export_azure_evidence.sh
python3 TRUST_CODEX/tools/validate_azure_entra.py

# Windows / VM:
.\\Run-AzureEntraCollectAndValidate.ps1 \`
  -ResourceGroup <your-rg>`}
            </pre>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <strong>Output:</strong>{" "}
            <code>CUI-Validation-AzureEntra-&lt;RunId&gt;/validation-report-azure-entra.json</code>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <strong>Covers:</strong> {AZURE_ENTRA_12_CONTROL_IDS.length} cloud controls (
            {AZURE_ENTRA_12_CONTROL_IDS.join(", ")})
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
          <FileText className="h-4 w-4" />
          Unified runner (recommended)
        </div>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          One command, both bundles, same RunId
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          <code>Run-CuiAndAzureBulkEvidenceAndValidate.ps1</code> chains both
          collectors and both validators under a shared RunId so the bundles
          are always paired. This is the recommended path for steady-state runs.
        </p>
        <div className="mt-4 rounded-lg bg-slate-900 p-3">
          <pre className="overflow-x-auto whitespace-pre text-[12px] leading-tight text-slate-100">
{`# On the Windows Server VM:
.\\Run-CuiAndAzureBulkEvidenceAndValidate.ps1 \`
  -OutRoot C:\\evidence \`
  -ResourceGroup <your-rg>

# Output:
#   C:\\evidence\\CUI-Evidence-<RunId>\\
#   C:\\evidence\\CUI-Evidence-<RunId>\\azure-entra\\
#   C:\\evidence\\CUI-Validation-<RunId>\\
#   C:\\evidence\\CUI-Validation-AzureEntra-<RunId>\\`}
          </pre>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Upload to Codex</h2>
        <p className="mt-2 text-sm text-slate-600">
          Both validation reports are uploaded the same way — via the boundary
          page&apos;s file picker. Codex parses the JSON, creates an{" "}
          <code>evidence_run</code> with <code>source=</code>
          <code>azure_entra</code> or <code>windows_server_hardening</code>,
          writes per-check <code>evidence_findings</code>, and flips{" "}
          <code>control_records.technical_status</code> for every control the
          report attests to.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Open <Link className="text-blue-600 underline" href="/dashboard/boundary">your boundary page</Link>
          </li>
          <li>Find the &quot;Cloud Hosting&quot; or &quot;OS Baseline&quot; card</li>
          <li>Pick the JSON validation report file</li>
          <li>Set Run ID (from the manifest) + Collected At (UTC timestamp)</li>
          <li>Hit Upload — wait for the success summary (passed / failed / poam_entries_created)</li>
        </ol>
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <strong>What happens next:</strong> the dashboard&apos;s{" "}
          <code>PathTo110</code> widget recomputes, the Outstanding Controls
          Wizard re-evaluates each card&apos;s <code>liveStatus</code>, and
          any failed checks auto-create POA&amp;M entries you can track.
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
        <h2 className="text-base font-semibold text-slate-900">
          C3PAO defensibility — why both collectors?
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          A C3PAO interviews you about three layers of defense. The OS bundle
          proves what&apos;s configured <em>inside the VM</em> (BitLocker, audit
          policy, FIPS-mode crypto). The Azure bundle proves what&apos;s
          configured <em>around the VM</em> (NSG denies public RDP, Key Vault
          has soft delete, Conditional Access requires MFA, Storage Account
          enforces TLS 1.2+). Without the Azure bundle, claims about
          3.13.10 (Key Vault), 3.13.5 (NSG), or 3.5.3 (MFA) sit on inheritance
          rationale alone — defensible, but a smart assessor will ask for the
          configuration export. The Azure validator&apos;s JSON report is that
          export.
        </p>
        <p className="mt-3 text-sm text-slate-700">
          The validator also handles &quot;PARTIAL&quot; cases honestly: if your
          Conditional Access policies aren&apos;t exported (Graph permission
          missing) or your Sign-in logs are empty (Audit Logs Reader role
          missing), the report says PARTIAL with an exact remediation step.
          You can&apos;t accidentally over-claim.
        </p>
      </section>
    </main>
  );
}
