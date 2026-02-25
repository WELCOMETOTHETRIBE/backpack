param(
  [Parameter(Mandatory = $false)]
  [string]$Bind = '127.0.0.1',

  [Parameter(Mandatory = $false)]
  [int]$Port = 8787,

  [Parameter(Mandatory = $false)]
  [string]$StartPath = '/manual_app/index.html',

  [Parameter(Mandatory = $false)]
  [int]$StartupHealthTimeoutMs = 900,

  [Parameter(Mandatory = $false)]
  [int]$RestartKillWaitMs = 700,

  [Parameter(Mandatory = $false)]
  [string]$EvidenceRoot = 'C:\evidence',

  [Parameter(Mandatory = $false)]
  [string]$HardeningRoot = 'C:\hardening\codex-scripts'
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host "[manual-app] $m" -ForegroundColor Cyan }
function Write-Warn([string]$m) { Write-Host "[manual-app] $m" -ForegroundColor Yellow }

# Serve from TRUST_CODEX root so the app can link to chapters/tables and existing viewers.
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# Allowlist (read-only) for a small number of specific file paths outside EvidenceRoot/HardeningRoot.
# This is intentionally narrow; it exists so the Manual can read the live-service token after you run
# a token installer (without broad filesystem access).
$DefaultTokenPath = $null
try {
  if ($env:USERPROFILE) {
    $DefaultTokenPath = Join-Path (Join-Path $env:USERPROFILE 'mactech') '.secrets\codex_manual_service_token'
  }
} catch {}
$ReadAllowlistFiles = @()
if ($DefaultTokenPath) { $ReadAllowlistFiles += $DefaultTokenPath }
# Common fixed path on this VM image (kept explicit so the server still works if USERPROFILE is SYSTEM).
$ReadAllowlistFiles += 'C:\Users\admin_patrick\mactech\.secrets\codex_manual_service_token'

$prefix = "http://{0}:{1}/" -f $Bind, $Port
Write-Info "Root: $Root"
Write-Info "Listening: $prefix"
Write-Info "Open: $prefix$($StartPath.TrimStart('/'))"
Write-Info "Stop: Ctrl+C"

$SelfScript = (Resolve-Path $MyInvocation.MyCommand.Path).Path
$CodexHeaderName = 'X-Codex-Manual-Server'
$CodexHeaderValue = '1'

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

$ErrLog = $null
try {
  $ErrLog = Join-Path $EvidenceRoot 'codex-manual-server-errors.log'
} catch {}

$PidFile = $null
try {
  $PidFile = Join-Path $EvidenceRoot 'codex-manual-server.pid'
} catch {}

function Log-Err([string]$m) {
  try {
    if (-not $ErrLog) { return }
    $ts = [DateTime]::UtcNow.ToString('o')
    Add-Content -LiteralPath $ErrLog -Value ("[$ts] " + $m)
  } catch {}
}

function Try-HealthCheck([string]$url, [int]$timeoutMs) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'GET'
    $req.Timeout = $timeoutMs
    $req.ReadWriteTimeout = $timeoutMs
    $res = $req.GetResponse()
    try {
      $hdr = $res.Headers[$CodexHeaderName]
      if ($hdr -eq $CodexHeaderValue) { return $true }
      return $false
    } finally {
      $res.Close()
    }
  } catch {
    return $false
  }
}

function Try-StopExistingCodexServer([int]$port, [string]$expectedScriptPath, [int]$waitMs) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { return $false }
    $pid = $conn.OwningProcess
    if (-not $pid) { return $false }

    # Try to verify it's *our* server script before killing.
    $cmd = $null
    try {
      $p = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $pid) -ErrorAction SilentlyContinue
      if ($p) { $cmd = $p.CommandLine }
    } catch {}

    if ($cmd -and ($cmd -like ("*{0}*" -f $expectedScriptPath))) {
      Write-Warn ("Port {0} is in use by an existing Codex server (PID {1}). Stopping it for a fresh session." -f $port, $pid)
      try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
      Start-Sleep -Milliseconds $waitMs
      return $true
    }

    Write-Warn ("Port {0} is already in use (PID {1}). Not stopping because it does not look like the Codex server script." -f $port, $pid)
    return $false
  } catch {
    return $false
  }
}

# Idempotent startup:
# - If healthy server already running, exit successfully.
# - If port is taken by our server but unhealthy, stop it and start fresh.
$healthUrl = ("http://{0}:{1}/__health" -f $Bind, $Port)
if (Try-HealthCheck -url $healthUrl -timeoutMs $StartupHealthTimeoutMs) {
  Write-Info "Existing server is healthy; exiting (idempotent)."
  return
}

try {
  $listener.Start()
} catch {
  # If binding fails, attempt to stop old Codex server and retry once.
  $stopped = Try-StopExistingCodexServer -port $Port -expectedScriptPath $SelfScript -waitMs $RestartKillWaitMs
  if ($stopped) {
    try {
      $listener.Start()
    } catch {
      Write-Warn "Failed to start listener after stopping old session."
      throw
    }
  } else {
    Write-Warn "Failed to start listener. If this is access denied, run as Administrator or choose a different port."
    throw
  }
}

# Record PID for reliable restarts (http.sys hides owning PID).
try {
  if ($PidFile) {
    Set-Content -LiteralPath $PidFile -Value ([string]$PID) -Encoding ASCII
  }
} catch {}

try {
  Start-Process $("$prefix" + $StartPath.TrimStart('/')) | Out-Null
} catch {
  Write-Warn "Could not auto-open browser: $($_.Exception.Message)"
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.md'   = 'text/markdown; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

function Get-SafeLocalPath([string]$urlPath) {
  # Normalize URL path -> local file path under $Root
  $p = [System.Uri]::UnescapeDataString($urlPath)
  if ([string]::IsNullOrWhiteSpace($p) -or $p -eq '/') { $p = $StartPath }
  if ($p.StartsWith('/')) { $p = $p.Substring(1) }
  $candidate = Join-Path $Root ($p -replace '/', '\')
  $full = [System.IO.Path]::GetFullPath($candidate)
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $full
}

function Parse-QueryString([string]$q) {
  $out = @{}
  if ([string]::IsNullOrWhiteSpace($q)) { return $out }
  $s = $q
  if ($s.StartsWith('?')) { $s = $s.Substring(1) }
  if ([string]::IsNullOrWhiteSpace($s)) { return $out }
  foreach ($part in $s.Split('&')) {
    if (-not $part) { continue }
    $kv = $part.Split('=', 2)
    $k0 = $kv[0]
    if ($null -eq $k0) { $k0 = '' }
    $v0 = ''
    if ($kv.Length -gt 1 -and $null -ne $kv[1]) { $v0 = $kv[1] }
    $k = [System.Uri]::UnescapeDataString($k0.Replace('+',' '))
    $v = [System.Uri]::UnescapeDataString($v0.Replace('+',' '))
    if ($k) { $out[$k] = $v }
  }
  return $out
}

function Ensure-UnderRoot([string]$Path, [string]$RootPath) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $rootFull = [System.IO.Path]::GetFullPath($RootPath)
  if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}

function Ensure-UnderAnyRoot([string]$Path, [string[]]$Roots) {
  foreach ($r in $Roots) {
    if (-not $r) { continue }
    $safe = Ensure-UnderRoot -Path $Path -RootPath $r
    if ($safe) { return $safe }
  }
  return $null
}

function Write-Json([System.Net.HttpListenerResponse]$res, [object]$obj, [int]$status = 200) {
  $res.StatusCode = $status
  $res.ContentType = 'application/json; charset=utf-8'
  $res.AddHeader($CodexHeaderName, $CodexHeaderValue)
  $json = ($obj | ConvertTo-Json -Depth 6)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

function ContentType-For([string]$local) {
  $ext = [System.IO.Path]::GetExtension($local).ToLowerInvariant()
  $ctype = $mime[$ext]
  if (-not $ctype) { $ctype = 'application/octet-stream' }
  return $ctype
}

function Try-ParseIsoUtc([string]$s) {
  try {
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    # Accept ISO 8601 (with or without Z); normalize to UTC DateTime.
    $dt = [DateTime]::Parse($s, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal)
    return $dt.ToUniversalTime()
  } catch {
    return $null
  }
}

function Extract-EventFields($ev) {
  $out = @{}
  try {
    $xml = [xml]$ev.ToXml()
    $dataNodes = @()
    try { $dataNodes = @($xml.Event.EventData.Data) } catch { $dataNodes = @() }
    foreach ($d in $dataNodes) {
      try {
        $name = [string]$d.Name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $val = [string]$d.'#text'
        if ($null -eq $val) { $val = '' }
        $out[$name] = $val
      } catch {}
    }
  } catch {}
  return $out
}

while ($true) {
  $ctx = $null
  try {
    $ctx = $listener.GetContext()
  } catch {
    Log-Err ("GetContext failed: " + $_.Exception.Message)
    Start-Sleep -Milliseconds 200
    continue
  }
  try {
    $req = $ctx.Request
    $res = $ctx.Response

    if ($req.Url.AbsolutePath -eq '/__health') {
      Write-Json -res $res -obj @{
        ok = $true
        server = 'codex-manual'
        root = $Root
        evidenceRoot = $EvidenceRoot
        hardeningRoot = $HardeningRoot
      }
      continue
    }

    # Live Windows event log API (read-only).
    # GET /__events?log=Security&ids=4624,4625&sinceMinutes=1440&user=alice&contains=LogonType%3A%2010&max=200
    if ($req.Url.AbsolutePath -eq '/__events') {
      if ($req.HttpMethod -ne 'GET') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      $qs = Parse-QueryString $req.Url.Query
      $logName = $qs['log']
      if (-not $logName) { $logName = 'Security' }
      $logName = [string]$logName
      $allowedLogs = @(
        'Security',
        'System',
        'Application',
        'Microsoft-Windows-Windows Defender/Operational'
      )
      if ($allowedLogs -notcontains $logName) {
        Write-Json -res $res -obj @{ error = 'forbidden_log'; message = "Log must be one of: $($allowedLogs -join ', ')" } -status 403
        continue
      }

      $max = 200
      try {
        if ($qs['max']) { $max = [int]$qs['max'] }
      } catch {}
      if ($max -lt 1) { $max = 1 }
      if ($max -gt 500) { $max = 500 }

      $ids = @()
      try {
        $rawIds = [string]$qs['ids']
        if (-not [string]::IsNullOrWhiteSpace($rawIds)) {
          foreach ($p in $rawIds.Split(',')) {
            $t = $p.Trim()
            if (-not $t) { continue }
            $n = 0
            if ([int]::TryParse($t, [ref]$n)) { $ids += $n }
          }
        }
      } catch {}

      $start = $null
      $end = $null
      try {
        if ($qs['sinceMinutes']) {
          $mins = [int]$qs['sinceMinutes']
          if ($mins -gt 0) { $start = [DateTime]::UtcNow.AddMinutes(-1 * $mins) }
        }
      } catch {}
      $start2 = Try-ParseIsoUtc $qs['startUtc']
      $end2 = Try-ParseIsoUtc $qs['endUtc']
      if ($start2) { $start = $start2 }
      if ($end2) { $end = $end2 }

      $user = [string]$qs['user']
      $contains = [string]$qs['contains']

      try {
        $fh = @{ LogName = $logName }
        if ($ids -and $ids.Count -gt 0) { $fh['Id'] = $ids }
        if ($start) { $fh['StartTime'] = $start }
        if ($end) { $fh['EndTime'] = $end }

        $evs = Get-WinEvent -FilterHashtable $fh -MaxEvents $max -ErrorAction Stop
        $rows = @()
        foreach ($ev in $evs) {
          $fields = Extract-EventFields $ev
          $targetUser = $fields['TargetUserName']
          $targetDomain = $fields['TargetDomainName']
          $subjectUser = $fields['SubjectUserName']
          $subjectDomain = $fields['SubjectDomainName']
          $account = $fields['AccountName']
          $ip = $fields['IpAddress']
          $logonType = $fields['LogonType']

          $msg = ''
          try { $msg = [string]$ev.Message } catch { $msg = '' }

          if ($user) {
            $u = $user.ToLowerInvariant()
            $hit = $false
            foreach ($cand in @($targetUser, $subjectUser, $account)) {
              if ($cand -and ([string]$cand).ToLowerInvariant().IndexOf($u) -ge 0) { $hit = $true; break }
            }
            if (-not $hit -and $msg -and $msg.ToLowerInvariant().IndexOf($u) -ge 0) { $hit = $true }
            if (-not $hit) { continue }
          }
          if ($contains) {
            $c = $contains.ToLowerInvariant()
            $m = ''
            if ($msg) { $m = [string]$msg }
            if ($m.ToLowerInvariant().IndexOf($c) -lt 0) { continue }
          }

          $userVal = ''
          if ($targetUser) {
            if ($targetDomain) { $userVal = ([string]$targetDomain + '\' + [string]$targetUser) } else { $userVal = [string]$targetUser }
          } elseif ($subjectUser) {
            if ($subjectDomain) { $userVal = ([string]$subjectDomain + '\' + [string]$subjectUser) } else { $userVal = [string]$subjectUser }
          } elseif ($account) {
            $userVal = [string]$account
          }

          $result = ''
          try {
            if ($ev.Id -eq 4624) { $result = 'OK' }
            elseif ($ev.Id -eq 4625) { $result = 'FAIL' }
          } catch {}

          $keyFields = @{
            TargetUserName = [string]$fields['TargetUserName']
            TargetDomainName = [string]$fields['TargetDomainName']
            SubjectUserName = [string]$fields['SubjectUserName']
            SubjectDomainName = [string]$fields['SubjectDomainName']
            LogonType = [string]$fields['LogonType']
            IpAddress = [string]$fields['IpAddress']
            WorkstationName = [string]$fields['WorkstationName']
            ProcessName = [string]$fields['ProcessName']
            AuthenticationPackageName = [string]$fields['AuthenticationPackageName']
            FailureReason = [string]$fields['FailureReason']
            Status = [string]$fields['Status']
            SubStatus = [string]$fields['SubStatus']
          }

          $rows += @{
            timeCreatedUtc = ($ev.TimeCreated.ToUniversalTime().ToString('o'))
            id = $ev.Id
            provider = [string]$ev.ProviderName
            level = [string]$ev.LevelDisplayName
            recordId = $ev.RecordId
            user = $userVal
            ip = [string]$ip
            logonType = [string]$logonType
            result = $result
            fields = $keyFields
            message = $msg
          }
        }
        Write-Json -res $res -obj @{
          ok = $true
          log = $logName
          max = $max
          count = ($rows | Measure-Object).Count
          events = $rows
        }
      } catch {
        Write-Json -res $res -obj @{ error = 'events_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Windows Defender posture (read-only).
    if ($req.Url.AbsolutePath -eq '/__defender') {
      if ($req.HttpMethod -ne 'GET') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      try {
        $s = Get-MpComputerStatus -ErrorAction Stop
        $sigLast = ''
        try {
          if ($s.AntivirusSignatureLastUpdated) { $sigLast = $s.AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o') }
        } catch {}
        Write-Json -res $res -obj @{
          ok = $true
          status = @{
            AMServiceEnabled = $s.AMServiceEnabled
            AntivirusEnabled = $s.AntivirusEnabled
            AntispywareEnabled = $s.AntispywareEnabled
            RealTimeProtectionEnabled = $s.RealTimeProtectionEnabled
            NISEnabled = $s.NISEnabled
            AntivirusSignatureVersion = $s.AntivirusSignatureVersion
            AntivirusSignatureLastUpdated = $sigLast
            AntivirusSignatureAge = $s.AntivirusSignatureAge
            EngineVersion = $s.EngineVersion
            AMProductVersion = $s.AMProductVersion
            FullScanAge = $s.FullScanAge
            QuickScanAge = $s.QuickScanAge
          }
        }
      } catch {
        Write-Json -res $res -obj @{ error = 'defender_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Windows Defender maintenance tasks (read-only).
    if ($req.Url.AbsolutePath -eq '/__defender_tasks') {
      if ($req.HttpMethod -ne 'GET') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      try {
        $names = @(
          'Codex_Defender_SignatureUpdate',
          'Codex_Defender_QuickScan',
          'Codex_Defender_FullScan'
        )
        $rows = @()
        foreach ($n in $names) {
          try {
            $csv = & schtasks /Query /TN $n /V /FO CSV 2>$null
            $exit = $LASTEXITCODE
            if ($exit -ne 0) {
              # Not installed (schtasks prints ERROR: ... even with stderr suppressed on some builds)
              $rows += @{ name = $n; installed = $false }
              continue
            }
            if (-not $csv) { $rows += @{ name = $n; installed = $false }; continue }
            $first = ''
            try { $first = [string]($csv | Select-Object -First 1) } catch { $first = '' }
            if ($first -and $first.TrimStart().StartsWith('ERROR:', [System.StringComparison]::OrdinalIgnoreCase)) {
              $rows += @{ name = $n; installed = $false }
              continue
            }

            $obj = $csv | ConvertFrom-Csv | Select-Object -First 1
            if (-not $obj) {
              $rows += @{ name = $n; installed = $false }
              continue
            }
            $rows += @{
              name = $n
              installed = $true
              status = $obj.Status
              lastRunTime = $obj.'Last Run Time'
              nextRunTime = $obj.'Next Run Time'
              lastResult = $obj.'Last Result'
              scheduleType = $obj.'Schedule Type'
              startTime = $obj.'Start Time'
              startDate = $obj.'Start Date'
              days = $obj.Days
            }
          } catch {
            $rows += @{ name = $n; installed = $false; error = $_.Exception.Message }
          }
        }
        Write-Json -res $res -obj @{ ok = $true; tasks = $rows }
      } catch {
        Write-Json -res $res -obj @{ error = 'defender_tasks_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Install/refresh Defender maintenance tasks (writes tasks; safe local-only convenience).
    if ($req.Url.AbsolutePath -eq '/__defender_install_tasks') {
      if ($req.HttpMethod -ne 'POST') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      try {
        $script = 'C:\Codex\TRUST_CODEX\vm-scripts\Install-DefenderMaintenanceTasks.ps1'
        if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
          Write-Json -res $res -obj @{ error = 'missing_script'; message = "Missing: $script" } -status 500
          continue
        }
        $out = ''
        $code = 0
        try {
          $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script 2>&1 | Out-String)
          $code = $LASTEXITCODE
        } catch {
          $out = $_.Exception.Message
          $code = 1
        }
        if ($code -ne 0) {
          Write-Json -res $res -obj @{ error = 'install_failed'; message = "Installer exit code: $code"; exitCode = $code; output = $out } -status 500
          continue
        }
        Write-Json -res $res -obj @{ ok = $true; message = 'Defender maintenance tasks installed/refreshed.'; exitCode = $code; output = $out }
      } catch {
        Write-Json -res $res -obj @{ error = 'defender_install_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Run Defender maintenance (writes evidence under C:\evidence).
    if ($req.Url.AbsolutePath -eq '/__defender_run') {
      if ($req.HttpMethod -ne 'POST') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        try { $body = $reader.ReadToEnd() } finally { $reader.Close() }
        if ([string]::IsNullOrWhiteSpace($body)) {
          Write-Json -res $res -obj @{ error = 'empty_body'; message = 'Provide JSON body with mode.' } -status 400
          continue
        }
        try { $payload = $body | ConvertFrom-Json } catch {
          Write-Json -res $res -obj @{ error = 'invalid_json'; message = 'Body is not valid JSON.' } -status 400
          continue
        }

        $mode = [string]$payload.mode
        if (-not $mode) { $mode = 'Status' }
        $allowed = @('Status','SignatureUpdate','QuickScan','FullScan')
        if ($allowed -notcontains $mode) {
          Write-Json -res $res -obj @{ error = 'forbidden_mode'; message = "mode must be one of: $($allowed -join ', ')" } -status 403
          continue
        }

        $async = $false
        try {
          if ($payload.async -eq $true) { $async = $true }
        } catch {}
        # Always run scans async to keep the server responsive.
        if ($mode -eq 'QuickScan' -or $mode -eq 'FullScan') { $async = $true }

        $runId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
        $script = 'C:\Codex\TRUST_CODEX\vm-scripts\Run-DefenderMaintenance.ps1'
        if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
          Write-Json -res $res -obj @{ error = 'missing_script'; message = "Missing: $script" } -status 500
          continue
        }

        $outDir = Join-Path $EvidenceRoot ("CUI-Defender-Maintenance-" + $runId)

        if ($async) {
          $wrapper = 'C:\Codex\TRUST_CODEX\vm-scripts\Invoke-DefenderMaintenanceAsync.ps1'
          if (-not (Test-Path -LiteralPath $wrapper -PathType Leaf)) {
            Write-Json -res $res -obj @{ error = 'missing_wrapper'; message = "Missing: $wrapper" } -status 500
            continue
          }
          try { New-Item -ItemType Directory -Force -Path $outDir | Out-Null } catch {}
          $args2 = @(
            '-NoProfile',
            '-ExecutionPolicy','Bypass',
            '-File', $wrapper,
            '-Mode', $mode,
            '-OutRoot', $EvidenceRoot,
            '-RunId', $runId
          )
          $outLog = Join-Path $outDir 'run-wrapper.out.txt'
          $errLog = Join-Path $outDir 'run-wrapper.err.txt'
          $p2 = Start-Process -FilePath 'powershell.exe' -ArgumentList $args2 -PassThru -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
          Write-Json -res $res -obj @{
            ok = $true
            async = $true
            mode = $mode
            runId = $runId
            outDir = $outDir
            pid = $p2.Id
          }
          continue
        }

        $out = ''
        $code = 0
        try {
          $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Mode $mode -OutRoot $EvidenceRoot -RunId $runId 2>&1 | Out-String)
          $code = $LASTEXITCODE
        } catch {
          $out = $_.Exception.Message
          $code = 1
        }
        Write-Json -res $res -obj @{
          ok = ($code -eq 0)
          async = $false
          mode = $mode
          runId = $runId
          exitCode = $code
          outDir = $outDir
          output = $out
        }
      } catch {
        Write-Json -res $res -obj @{ error = 'defender_run_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Status for async Defender runs.
    # GET /__defender_run_status?runId=YYYYMMDD-HHMMSS
    if ($req.Url.AbsolutePath -eq '/__defender_run_status') {
      if ($req.HttpMethod -ne 'GET') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      try {
        $qs = Parse-QueryString $req.Url.Query
        $runId = [string]$qs['runId']
        if (-not $runId) {
          Write-Json -res $res -obj @{ error = 'missing_runId'; message = 'Provide runId.' } -status 400
          continue
        }
        $outDir = Join-Path $EvidenceRoot ("CUI-Defender-Maintenance-" + $runId)
        $statusPath = Join-Path $outDir 'run-status.json'
        $finishedPath = Join-Path $outDir 'run-finished.json'

        if (Test-Path -LiteralPath $finishedPath -PathType Leaf) {
          $txt = Get-Content -LiteralPath $finishedPath -Raw -ErrorAction SilentlyContinue
          try { $obj = $txt | ConvertFrom-Json } catch { $obj = @{ raw = $txt } }
          Write-Json -res $res -obj @{ ok = $true; runId = $runId; outDir = $outDir; finished = $true; data = $obj }
          continue
        }
        if (Test-Path -LiteralPath $statusPath -PathType Leaf) {
          $txt = Get-Content -LiteralPath $statusPath -Raw -ErrorAction SilentlyContinue
          try { $obj = $txt | ConvertFrom-Json } catch { $obj = @{ raw = $txt } }
          Write-Json -res $res -obj @{ ok = $true; runId = $runId; outDir = $outDir; finished = $false; data = $obj }
          continue
        }
        Write-Json -res $res -obj @{ error = 'not_found'; message = "No status found for runId: $runId"; runId = $runId; outDir = $outDir } -status 404
      } catch {
        Write-Json -res $res -obj @{ error = 'defender_run_status_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Archive older Defender evidence folders to keep C:\evidence clean.
    # POST /__defender_archive  Body: { "keep": 1 }
    if ($req.Url.AbsolutePath -eq '/__defender_archive') {
      if ($req.HttpMethod -ne 'POST') {
        Write-Json -res $res -obj @{ error = 'method_not_allowed'; method = $req.HttpMethod } -status 405
        continue
      }
      try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        try { $body = $reader.ReadToEnd() } finally { $reader.Close() }
        $keep = 1
        if (-not [string]::IsNullOrWhiteSpace($body)) {
          try { $payload = $body | ConvertFrom-Json } catch { $payload = $null }
          try {
            if ($payload -and $payload.keep) { $keep = [int]$payload.keep }
          } catch {}
        }
        if ($keep -lt 1) { $keep = 1 }
        if ($keep -gt 10) { $keep = 10 }

        $archiveRoot = Join-Path $EvidenceRoot 'archive\defender'
        try { New-Item -ItemType Directory -Force -Path $archiveRoot | Out-Null } catch {}

        $dirs = Get-ChildItem -LiteralPath $EvidenceRoot -Directory -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -like 'CUI-Defender-Maintenance-*' } |
          Sort-Object Name -Descending

        $kept = @()
        $moved = @()
        $i = 0
        foreach ($d in @($dirs)) {
          if (-not $d) { continue }
          if ($i -lt $keep) {
            $kept += $d.FullName
            $i += 1
            continue
          }
          $dest = Join-Path $archiveRoot $d.Name
          try {
            if (Test-Path -LiteralPath $dest) {
              # Avoid collision: append timestamp.
              $ts = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
              $dest = Join-Path $archiveRoot ($d.Name + "-" + $ts)
            }
            Move-Item -LiteralPath $d.FullName -Destination $dest -Force -ErrorAction Stop
            $moved += @{ from = $d.FullName; to = $dest }
          } catch {
            $moved += @{ from = $d.FullName; to = $dest; error = $_.Exception.Message }
          }
        }

        Write-Json -res $res -obj @{
          ok = $true
          keep = $keep
          kept = $kept
          moved = $moved
          archiveRoot = $archiveRoot
        }
      } catch {
        Write-Json -res $res -obj @{ error = 'defender_archive_failed'; message = $_.Exception.Message } -status 500
      }
      continue
    }

    # Evidence file API: /__fs?path=C:\evidence\...\file.txt
    # Returns JSON with either file preview text or directory listing.
    if ($req.RawUrl -like '/__fs*') {
      # POST /__fs  (write a text file under EvidenceRoot only)
      # Body: { "path": "C:\\evidence\\...\\file.json", "content": "<text>" }
      if ($req.HttpMethod -eq 'POST') {
        try {
          $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
          try { $body = $reader.ReadToEnd() } finally { $reader.Close() }
          if ([string]::IsNullOrWhiteSpace($body)) {
            Write-Json -res $res -obj @{ error = 'empty_body'; message = 'Provide JSON body with path/content.' } -status 400
            continue
          }
          try {
            $payload = $body | ConvertFrom-Json
          } catch {
            Write-Json -res $res -obj @{ error = 'invalid_json'; message = 'Body is not valid JSON.' } -status 400
            continue
          }

          $p = $payload.path
          $content = $payload.content
          if (-not $p) {
            Write-Json -res $res -obj @{ error = 'missing_path'; message = 'Provide payload.path.' } -status 400
            continue
          }

          # Only allow writes under EvidenceRoot (never HardeningRoot).
          $safeRequested = Ensure-UnderRoot -Path $p -RootPath $EvidenceRoot
          if (-not $safeRequested) {
            Write-Json -res $res -obj @{ error = 'forbidden'; message = "Write path must be under EvidenceRoot: $EvidenceRoot" } -status 403
            continue
          }

          $ext = [System.IO.Path]::GetExtension($safeRequested).ToLowerInvariant()
          if (@('.json','.txt','.md') -notcontains $ext) {
            Write-Json -res $res -obj @{ error = 'forbidden_extension'; message = 'Only .json/.txt/.md writes are allowed.' } -status 403
            continue
          }

          $text = [string]$content
          $maxChars = 1024 * 1024 # ~1 MiB of text
          if ($text.Length -gt $maxChars) {
            Write-Json -res $res -obj @{ error = 'too_large'; message = 'Content too large.' } -status 413
            continue
          }

          $dir = [System.IO.Path]::GetDirectoryName($safeRequested)
          if ($dir -and -not (Test-Path -LiteralPath $dir -PathType Container)) {
            [System.IO.Directory]::CreateDirectory($dir) | Out-Null
          }

          $enc = New-Object System.Text.UTF8Encoding($false) # UTF-8, no BOM
          [System.IO.File]::WriteAllText($safeRequested, $text, $enc)

          Write-Json -res $res -obj @{
            ok = $true
            kind = 'write'
            path = $safeRequested
            chars = $text.Length
            evidenceRoot = $EvidenceRoot
          }
        } catch {
          Write-Json -res $res -obj @{ error = 'write_failed'; message = $_.Exception.Message } -status 500
        }
        continue
      }

      $qs = Parse-QueryString $req.Url.Query
      $p = $qs['path']
      if (-not $p) {
        Write-Json -res $res -obj @{ error = 'missing_query_param'; message = 'Provide ?path=...'; method = $req.HttpMethod; rawUrl = $req.RawUrl } -status 400
        continue
      }

      # Resolve relative paths (e.g. governance/... from manifest) under server Root so governance docs load.
      $pathToCheck = $p
      $trimmed = [string]$p
      if ($trimmed -and -not [System.IO.Path]::IsPathRooted($trimmed) -and $trimmed.IndexOf([System.IO.Path]::VolumeSeparatorChar) -lt 0) {
        try {
          $resolvedUnderRoot = Join-Path $Root ($trimmed -replace '/', [System.IO.Path]::DirectorySeparatorChar)
          $pathToCheck = [System.IO.Path]::GetFullPath($resolvedUnderRoot)
        } catch {}
      }
      $safeRequested = Ensure-UnderRoot -Path $pathToCheck -RootPath $Root
      if (-not $safeRequested) {
        $safeRequested = Ensure-UnderAnyRoot -Path $p -Roots @($EvidenceRoot, $HardeningRoot)
      }
      $allowlisted = $false
      if (-not $safeRequested) {
        # Fall back to allowlisted single-file reads (e.g., token file).
        try {
          $fullReq = [System.IO.Path]::GetFullPath($p)
          foreach ($ap in $ReadAllowlistFiles) {
            if (-not $ap) { continue }
            $fullAllowed = [System.IO.Path]::GetFullPath($ap)
            if ($fullReq -eq $fullAllowed) {
              $safeRequested = $fullReq
              $allowlisted = $true
              break
            }
          }
        } catch {}
      }
      if (-not $safeRequested) {
        Write-Json -res $res -obj @{
          error = 'forbidden'
          message = "Path must be under server Root, $EvidenceRoot, or $HardeningRoot"
        } -status 403
        continue
      }

      if (Test-Path $safeRequested -PathType Container) {
        if ($allowlisted) {
          Write-Json -res $res -obj @{ error = 'forbidden'; message = 'Directory listing is not allowed for this path.' } -status 403
          continue
        }
        $entries = Get-ChildItem -LiteralPath $safeRequested -Force | ForEach-Object {
          $kind = 'file'
          $size = $null
          if ($_.PSIsContainer) {
            $kind = 'dir'
            $size = $null
          } else {
            $kind = 'file'
            $size = $_.Length
          }
          @{
            name = $_.Name
            fullPath = $_.FullName
            kind = $kind
            size = $size
            lastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
          }
        }
        Write-Json -res $res -obj @{
          kind = 'dir'
          path = $safeRequested
          evidenceRoot = $EvidenceRoot
          entries = $entries
        }
        continue
      }

      if (-not (Test-Path $safeRequested -PathType Leaf)) {
        Write-Json -res $res -obj @{ error = 'not_found'; path = $safeRequested } -status 404
        continue
      }

      $fi = Get-Item -LiteralPath $safeRequested -Force
      $ctype = ContentType-For $safeRequested
      $maxBytes = 1024 * 1024 * 2 # 2 MiB preview
      $preview = $null
      $truncated = $false

      if ($allowlisted) {
        # Allowlisted files are expected to be small text (e.g., token file).
        # Force a text content type so clients can preview via textContent.
        $ctype = 'text/plain; charset=utf-8'
      }

      # Preview text for normal text-like files.
      if ($ctype -match '^(text/|application/json)') {
        $bytes = [System.IO.File]::ReadAllBytes($safeRequested)
        if ($bytes.Length -gt $maxBytes) {
          $bytes = $bytes[0..($maxBytes-1)]
          $truncated = $true
        }
        $preview = [System.Text.Encoding]::UTF8.GetString($bytes)
      }

      Write-Json -res $res -obj @{
        kind = 'file'
        path = $safeRequested
        evidenceRoot = $EvidenceRoot
        allowlisted = $allowlisted
        size = $fi.Length
        lastWriteTimeUtc = $fi.LastWriteTimeUtc.ToString('o')
        contentType = $ctype
        textContent = $preview
        truncated = $truncated
      }
      continue
    }

    $local = Get-SafeLocalPath $req.Url.AbsolutePath

    if (-not $local) {
      $res.StatusCode = 400
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Bad request.")
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    if (Test-Path $local -PathType Container) {
      $local = Join-Path $local 'index.html'
    }

    if (-not (Test-Path $local -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found: $($req.Url.AbsolutePath)")
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    $res.ContentType = ContentType-For $local

    # Avoid caching during iteration / rapid redeploy.
    try {
      $ext = [System.IO.Path]::GetExtension($local).ToLowerInvariant()
      $noCacheExts = @('.html', '.js', '.css', '.json', '.md')
      if ($noCacheExts -contains $ext) {
        $res.AddHeader('Cache-Control', 'no-store')
        $res.AddHeader('Pragma', 'no-cache')
      }
    } catch {}

    $fs = [System.IO.File]::OpenRead($local)
    try {
      $res.ContentLength64 = $fs.Length
      $fs.CopyTo($res.OutputStream)
    } finally {
      $fs.Close()
    }
    $res.StatusCode = 200
    $res.Close()
  } catch {
    Log-Err ("Request failed: " + $_.Exception.Message)
    try {
      $ctx.Response.StatusCode = 500
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Server error: $($_.Exception.Message)")
      $ctx.Response.ContentType = 'text/plain; charset=utf-8'
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close()
    } catch {
      # ignore secondary failures
    }
  }
}

