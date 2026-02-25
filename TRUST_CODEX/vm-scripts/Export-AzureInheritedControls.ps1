<#
Export-AzureInheritedControls.ps1

Writes an SRM-style artifact describing which controls are inherited/shared with Microsoft Azure.

Outputs:
- C:\evidence\CUI-Azure-Inheritance-<RunId>\azure-inheritance.json
- C:\evidence\CUI-Azure-Inheritance-<RunId>\azure-inheritance.md

Notes:
- This does not fetch Microsoft attestation documents automatically.
- It is intended to record the boundary statement + what evidence to retain.
#>

param(
  [string]$OutRoot = "C:\evidence",

  # Optional mapping files (generated in the repo)
  [string]$ControlImplementationMapPath = "C:\hardening\codex-scripts\control-implementation-map.json",
  [string]$SctmCsvPath = "C:\hardening\codex-scripts\SCTM_FULL_STATUS_LIST.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function NowIso() { (Get-Date).ToUniversalTime().ToString("o") }

$runId = Get-Date -Format yyyyMMdd-HHmmss
$outDir = Join-Path $OutRoot ("CUI-Azure-Inheritance-{0}" -f $runId)
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$implControls = @()
try {
  if (Test-Path -LiteralPath $ControlImplementationMapPath -PathType Leaf) {
    $raw = Get-Content -LiteralPath $ControlImplementationMapPath -Raw -ErrorAction Stop
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
    if ($obj -and $obj.controls) { $implControls = @($obj.controls) }
  }
} catch {}

$sctmRows = @()
try {
  if (Test-Path -LiteralPath $SctmCsvPath -PathType Leaf) {
    $sctmRows = Import-Csv -LiteralPath $SctmCsvPath
  }
} catch {}

# Identify Azure-related inheritance/sharing
$azureRelated = @()
foreach ($c in $implControls) {
  try {
    $src = [string]$c.inheritance_source
    if ($src -and ($src -match '(?i)azure')) {
      $azureRelated += $c
    }
  } catch {}
}

# Also include any SCTM rows explicitly classified as Inherited (typically physical controls)
$inheritedRows = @()
foreach ($r in $sctmRows) {
  try {
    if ([string]$r.classification -eq "Inherited") { $inheritedRows += $r }
  } catch {}
}

$artifact = [pscustomobject]@{
  schema = "mactech.codex.azure_inheritance"
  version = 2
  generated_utc = (NowIso)
  run_id = $runId
  out_dir = $outDir
  mapping_sources = [pscustomobject]@{
    control_implementation_map = (Test-Path -LiteralPath $ControlImplementationMapPath -PathType Leaf)
    sctm_csv = (Test-Path -LiteralPath $SctmCsvPath -PathType Leaf)
  }
  boundary_statement = @"
The enclave runs on Microsoft Azure. Azure provides the physical datacenter security and underlying platform operations for hosted infrastructure components within the cloud provider boundary.

Customer remains responsible for all enclave configuration and operation, including (at minimum): identity and authentication configuration (tenant, roles, administrative access paths), network rules/segmentation, OS hardening, logging/monitoring/alerting and log review processes, governance controls (policies/SOPs and records), incident response processes, and evidence retention.

Inherited/shared claims are only defensible when: (1) the boundary is explicit, (2) responsibilities are assigned per control, (3) provider and customer evidence expectations are documented, (4) evidence snapshots/exports are retained, and (5) SRM review is recorded (initial + annual + per material change).
"@.Trim()
  azure_related_controls = $azureRelated
  inherited_controls = $inheritedRows
  provider_evidence_required = @(
    "Provider attestation snapshot(s) applicable to inherited claims (timestamped PDFs/zips).",
    "Provider documentation snapshot(s) that describe security responsibilities/controls for in-scope services."
  )
  customer_evidence_required = @(
    "SRM review record (initial + annual + per material change) signed by the Attestee/system owner.",
    "Customer-side configuration exports proving shared responsibilities (NSG rules, VPN/RDP access config, VM properties, disk encryption posture, monitoring linkage).",
    "Customer operational records proving governance activities (log review records, incident response tests, change approvals) as applicable."
  )
  evidence_expectations = @(
    "Retain provider attestations AND customer configuration exports; do not treat provider evidence as satisfying customer responsibilities.",
    "Retain SRM per-control acknowledgement record referencing where evidence is stored."
  )
}

$jsonPath = Join-Path $outDir "azure-inheritance.json"
Write-Utf8NoBom -Path $jsonPath -Text (($artifact | ConvertTo-Json -Depth 10) + "`n")

$md = @()
$md += "# Azure inheritance / shared responsibility"
$md += ""
$md += ("Generated: {0}" -f $artifact.generated_utc)
$md += ("RunId: {0}" -f $artifact.run_id)
$md += ""
$md += "## Boundary statement"
$md += ""
$md += $artifact.boundary_statement
$md += ""
$md += "## Azure-related controls (from implementation map)"
$md += ""
if ($azureRelated.Count -eq 0) {
  $md += "_No Azure-related controls found (mapping file missing or no matches)._"
} else {
  foreach ($c in $azureRelated | Sort-Object control_id) {
    $md += ("- **{0}** - {1} ({2})" -f $c.control_id,$c.title,$c.implementation_domain)
  }
}
$md += ""
$md += "## Inherited controls (from SCTM classification)"
$md += ""
if ($inheritedRows.Count -eq 0) {
  $md += "_No Inherited rows found (SCTM CSV missing or none classified as Inherited)._"
} else {
  foreach ($r in $inheritedRows | Sort-Object control_id) {
    $md += ("- **{0}** - {1}" -f $r.control_id,$r.title)
  }
}
$md += ""
$md += "## Evidence expectations"
$md += ""
foreach ($e in $artifact.evidence_expectations) { $md += ("- " + $e) }
$md += ""

$mdPath = Join-Path $outDir "azure-inheritance.md"
Write-Utf8NoBom -Path $mdPath -Text (($md -join "`n") + "`n")

Write-Host "Wrote: $jsonPath"
Write-Host "Wrote: $mdPath"

