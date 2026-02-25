param(
  [Parameter(Mandatory = $false)]
  [string]$SourceRoot = 'C:\evidence',

  [Parameter(Mandatory = $false)]
  [string]$DestRoot = $null,

  [Parameter(Mandatory = $false)]
  [switch]$Mirror
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host "[sync-evidence] $m" -ForegroundColor Cyan }
function Write-Warn([string]$m) { Write-Host "[sync-evidence] $m" -ForegroundColor Yellow }

# TRUST_CODEX root is the parent of manual_app/
$CodexRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $DestRoot) {
  $DestRoot = Join-Path $CodexRoot '_evidence'
}

Write-Info "SourceRoot: $SourceRoot"
Write-Info "DestRoot:   $DestRoot"

if (-not (Test-Path $SourceRoot -PathType Container)) {
  throw "SourceRoot does not exist: $SourceRoot"
}

New-Item -ItemType Directory -Force -Path $DestRoot | Out-Null

$patterns = @('CUI-Evidence-*', 'CUI-Validation-*')
$dirs = @()
foreach ($pat in $patterns) {
  $dirs += Get-ChildItem -LiteralPath $SourceRoot -Directory -Filter $pat -ErrorAction SilentlyContinue
}

if (-not $dirs -or $dirs.Count -eq 0) {
  Write-Warn "No matching evidence directories found under SourceRoot."
  exit 0
}

foreach ($d in $dirs) {
  $dst = Join-Path $DestRoot $d.Name
  Write-Info "Copy: $($d.FullName) -> $dst"
  if ($Mirror) {
    # Mirror semantics (robocopy) if available; fall back to Copy-Item.
    $rb = Get-Command robocopy -ErrorAction SilentlyContinue
    if ($rb) {
      & robocopy $d.FullName $dst /MIR /NFL /NDL /NJH /NJS | Out-Null
    } else {
      if (Test-Path $dst) { Remove-Item -Recurse -Force -Path $dst }
      Copy-Item -Recurse -Force -Path $d.FullName -Destination $dst
    }
  } else {
    Copy-Item -Recurse -Force -Path $d.FullName -Destination $dst
  }
}

Write-Info "Done. Evidence mirror available at: $DestRoot"

