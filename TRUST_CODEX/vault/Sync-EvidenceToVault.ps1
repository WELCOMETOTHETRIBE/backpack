param(
  [Parameter(Mandatory = $false)]
  [string]$SourceRoot = 'C:\evidence',

  [Parameter(Mandatory = $false)]
  [string]$VaultRoot = '\\EvidenceVault\CUI-Enclave',

  # Optional: only sync directories matching this RunId (yyyyMMdd-HHmmss)
  [Parameter(Mandatory = $false)]
  [string]$RunId = '',

  # If set, mirror semantics for each synced directory (delete removed files).
  [Parameter(Mandatory = $false)]
  [switch]$Mirror
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host "[vault-sync] $m" -ForegroundColor Cyan }
function Write-Warn([string]$m) { Write-Host "[vault-sync] $m" -ForegroundColor Yellow }

function Ensure-Dir([string]$p) {
  try { New-Item -ItemType Directory -Force -Path $p | Out-Null } catch {}
}

function Get-RunIdFromName([string]$name) {
  # Expected: PREFIX-yyyyMMdd-HHmmss
  $m = [regex]::Match($name, '(\d{8}-\d{6})$')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Copy-Dir([string]$src, [string]$dst) {
  if ($Mirror) {
    $rb = Get-Command robocopy -ErrorAction SilentlyContinue
    if ($rb) {
      Ensure-Dir $dst
      & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS | Out-Null
      return
    }
    if (Test-Path $dst) { Remove-Item -Recurse -Force -Path $dst }
    Copy-Item -Recurse -Force -Path $src -Destination $dst
    return
  }
  Copy-Item -Recurse -Force -Path $src -Destination $dst
}

Write-Info "SourceRoot: $SourceRoot"
Write-Info "VaultRoot:  $VaultRoot"
if ($RunId) { Write-Info "RunId filter: $RunId" }
if ($Mirror) { Write-Info "Mirror: enabled" }

if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
  throw "SourceRoot does not exist: $SourceRoot"
}

Ensure-Dir $VaultRoot

$patterns = @(
  'CUI-Evidence-*',
  'CUI-Validation-*',
  'CUI-Azure-*',
  'CUI-Azure-Inheritance-*',
  'CUI-SRM-Ack-*'
)

$dirs = @()
foreach ($pat in $patterns) {
  $dirs += Get-ChildItem -LiteralPath $SourceRoot -Directory -Filter $pat -ErrorAction SilentlyContinue
}

if (-not $dirs -or $dirs.Count -eq 0) {
  Write-Warn "No matching evidence directories found under SourceRoot."
  exit 0
}

# Group by derived RunId
$groups = @{}
foreach ($d in $dirs) {
  $rid = Get-RunIdFromName $d.Name
  if (-not $rid) { continue }
  if ($RunId -and ($rid -ne $RunId)) { continue }
  if (-not $groups.ContainsKey($rid)) { $groups[$rid] = @() }
  $groups[$rid] += $d
}

if ($groups.Keys.Count -eq 0) {
  Write-Warn "No runs matched (possibly RunId filter excluded all)."
  exit 0
}

foreach ($rid in ($groups.Keys | Sort-Object)) {
  $runRoot = Join-Path $VaultRoot ("runs\{0}" -f $rid)
  $rawRoot = Join-Path $runRoot "raw"
  Ensure-Dir $rawRoot

  $synced = @()

  foreach ($d in $groups[$rid]) {
    $dst = Join-Path $rawRoot $d.Name
    Write-Info "Copy: $($d.FullName) -> $dst"
    Copy-Dir -src $d.FullName -dst $dst
    $synced += $d.Name

    # If there is a sibling zip (CUI-Evidence-<RunId>.zip), copy it too
    try {
      $zip = Join-Path $SourceRoot ($d.Name + ".zip")
      if (Test-Path -LiteralPath $zip -PathType Leaf) {
        $zipDst = Join-Path $rawRoot ($d.Name + ".zip")
        Copy-Item -Force -LiteralPath $zip -Destination $zipDst
        $synced += ($d.Name + ".zip")
      }
    } catch {}
  }

  # Locate hashes manifest in raw (for integrity/provenance)
  $hashesRel = $null
  foreach ($entry in ($synced | Sort-Object -Unique)) {
    if ($entry -match '^CUI-Evidence-' -and $entry -notmatch '\.zip$') {
      $hp = Join-Path $rawRoot ($entry + "\hashes.sha256.txt")
      if (Test-Path -LiteralPath $hp -PathType Leaf) {
        $hashesRel = "raw\$entry\hashes.sha256.txt"
        break
      }
    }
  }

  # Write/overwrite a small manifest for this run (append-only semantics: new RunId per run)
  $manifest = [pscustomobject]@{
    schema = "mactech.codex.vault_run_manifest"
    version = 1
    run_id = $rid
    source_root = $SourceRoot
    vault_root = $VaultRoot
    mirror = [bool]$Mirror
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    synced_entries = ($synced | Sort-Object -Unique)
    hashes_file = $hashesRel
  }
  $json = ($manifest | ConvertTo-Json -Depth 6)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $runRoot "run.json"), $json + "`n", $enc)

  Write-Info "Run synced: $rid"
}

Write-Info "Done."

