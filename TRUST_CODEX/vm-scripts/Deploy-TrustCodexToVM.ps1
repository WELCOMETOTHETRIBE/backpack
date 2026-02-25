<#
.SYNOPSIS
  Deploy Trust Codex Manual assets from a source path to VM locations (C:\hardening\codex-scripts, C:\evidence).
  Run this on the enclave VM after the Trust Codex folder is present (e.g. git clone, network share, or after push from host).

.DESCRIPTION
  Copies:
  - vm-scripts\*       -> C:\hardening\codex-scripts\   (hardening, collect, validate, runbook)
  - README-for-auditor -> C:\evidence\README-for-auditor.txt
  - _build\CODEX_VIEWER.html -> C:\evidence\CODEX_VIEWER.html
  Optionally:
  - manual_app\*       -> C:\evidence\manual\           (Auditor Manual / manual app)
  - tables\*, docs\*   -> C:\Codex\TRUST_CODEX\         (so manual server can use them)

.PARAMETER CodexPath
  Path to the TRUST_CODEX folder (e.g. C:\Codex\TRUST_CODEX or \\server\share\TRUST_CODEX).

.PARAMETER DeployManual
  If set, also copy manual_app to C:\evidence\manual\ and (if CodexPath is local) copy tables/docs to C:\Codex\TRUST_CODEX for the manual server.

.EXAMPLE
  .\Deploy-TrustCodexToVM.ps1 -CodexPath "C:\Codex\TRUST_CODEX"
  .\Deploy-TrustCodexToVM.ps1 -CodexPath "\\EvidenceVault\Codex\TRUST_CODEX" -DeployManual
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$CodexPath,

  [switch]$DeployManual
)

$ErrorActionPreference = "Stop"

$codex = $CodexPath.TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $codex -PathType Container)) {
  throw "Codex path not found or not a folder: $codex"
}

$vmScripts = Join-Path $codex "vm-scripts"
$buildDir  = Join-Path $codex "_build"
$viewer    = Join-Path $buildDir "CODEX_VIEWER.html"
$readme    = Join-Path $vmScripts "README-for-auditor.txt"

# Targets
$hardeningScripts = "C:\hardening\codex-scripts"
$evidenceRoot     = "C:\evidence"

# Ensure target directories exist
foreach ($dir in $hardeningScripts, $evidenceRoot) {
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Write-Host "Created: $dir"
  }
}

# 1) vm-scripts -> C:\hardening\codex-scripts
if (-not (Test-Path -LiteralPath $vmScripts -PathType Container)) {
  throw "vm-scripts not found at: $vmScripts"
}
Write-Host "Copying vm-scripts to $hardeningScripts ..."
Copy-Item -Path (Join-Path $vmScripts "*") -Destination $hardeningScripts -Recurse -Force
Write-Host "Done: $hardeningScripts"

# 2) README-for-auditor -> C:\evidence\
if (Test-Path -LiteralPath $readme -PathType Leaf) {
  Copy-Item -LiteralPath $readme -Destination (Join-Path $evidenceRoot "README-for-auditor.txt") -Force
  Write-Host "Done: $evidenceRoot\README-for-auditor.txt"
} else {
  Write-Host "Skip: README-for-auditor.txt not found at $readme"
}

# 3) CODEX_VIEWER.html -> C:\evidence\
if (Test-Path -LiteralPath $viewer -PathType Leaf) {
  Copy-Item -LiteralPath $viewer -Destination (Join-Path $evidenceRoot "CODEX_VIEWER.html") -Force
  Write-Host "Done: $evidenceRoot\CODEX_VIEWER.html"
} else {
  Write-Host "Skip: CODEX_VIEWER.html not found at $viewer"
}

# 4) Optional: manual_app -> C:\evidence\manual\ and full Codex to C:\Codex\TRUST_CODEX
if ($DeployManual) {
  $manualApp = Join-Path $codex "manual_app"
  $evidenceManual = Join-Path $evidenceRoot "manual"
  if (Test-Path -LiteralPath $manualApp -PathType Container) {
    if (-not (Test-Path -LiteralPath $evidenceManual -PathType Container)) {
      New-Item -ItemType Directory -Path $evidenceManual -Force | Out-Null
    }
    Write-Host "Copying manual_app to $evidenceManual ..."
    Copy-Item -Path (Join-Path $manualApp "*") -Destination $evidenceManual -Recurse -Force
    Write-Host "Done: $evidenceManual"
  }

  $codexLocal = "C:\Codex\TRUST_CODEX"
  if ($codex -eq $codexLocal -or $codex -eq "C:\Codex\TRUST_CODEX") {
    Write-Host "Source is already $codexLocal; manual server can use it as-is."
  } elseif (Test-Path -LiteralPath "C:\Codex" -PathType Container) {
    $tables = Join-Path $codex "tables"
    $docs   = Join-Path $codex "docs"
    $destTables = Join-Path $codexLocal "tables"
    $destDocs   = Join-Path $codexLocal "docs"
    foreach ($d in $codexLocal, $destTables, $destDocs) {
      if (-not (Test-Path -LiteralPath $d -PathType Container)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    if (Test-Path -LiteralPath $tables -PathType Container) {
      Copy-Item -Path (Join-Path $tables "*") -Destination $destTables -Recurse -Force
      Write-Host "Done: $destTables"
    }
    if (Test-Path -LiteralPath $docs -PathType Container) {
      Copy-Item -Path (Join-Path $docs "*") -Destination $destDocs -Recurse -Force
      Write-Host "Done: $destDocs"
    }
  }
}

Write-Host ""
Write-Host "Deploy complete. Next steps:"
Write-Host "  - Run evidence + validation:  & '$hardeningScripts\Run-CuiBulkEvidenceAndValidate.ps1' -OutRoot $evidenceRoot"
Write-Host "  - Show auditor:              $evidenceRoot\  (latest CUI-Evidence-<RunId>, CUI-Validation-<RunId>, CODEX_VIEWER.html, README-for-auditor.txt)"
