# EnclaveWatch — small fix: `os.windows_update.last_success_days` on Server 2022+

**Send this verbatim to the EnclaveWatch dev as a small adjacent fix to Phase 3c. Self-contained, ~30 minutes of work.**

---

## Problem

Tech-checks UI on the EnclaveWatch dashboard shows:

```
os | 14 pass · 0 fail · 1 warn · 0 unknown

Windows Update last successful install recency
os.windows_update.last_success_days     SI.L2-3.14.4
  warn    expected: <=35-days    observed: registry-missing
```

The check (compiled into `EnclaveWatch.Core.dll`, not in any PowerShell on the vault — confirmed via filesystem search) is reading:

```
HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Install
```

That key **does not exist on Server 2022+**. Microsoft retired the legacy `Auto Update\Results\Install` path. Diag confirms (run on the pilot just now):

```
=== Whole WindowsUpdate subtree (what's actually there) ===
Auto Update
ClientCache
DeploymentCallbackInfo
Orchestrator
Reporting
Services
SLS
StickyUpdates
WinREUninstallList
```

→ `Auto Update\Results` is genuinely absent.

But the vault **is** updating. Get-HotFix shows recent KBs:

```
HotFixID  Description     InstalledOn
KB5082062 Security Update 4/16/2026 12:00:00 AM
KB5082063 Security Update 4/16/2026 12:00:00 AM
KB5082417 Update          4/16/2026 12:00:00 AM
```

19 days since last hotfix — well under the 35-day threshold. The check fails because the validator is looking in the wrong place, not because the vault is unpatched.

## Fix shape

Wherever the C# check `os.windows_update.last_success_days` lives (likely `EnclaveWatch.Infrastructure/Collectors/OsChecks/WindowsUpdateRecencyCheck.cs` or similar), replace the single registry read with a 2-level fallback:

### Pseudocode

```csharp
public CheckResult Evaluate()
{
    // 1) Try legacy registry path (preserves behavior on older Windows).
    var legacyDate = TryReadLegacyRegistry();
    if (legacyDate.HasValue)
    {
        var days = (DateTime.UtcNow - legacyDate.Value).TotalDays;
        return Build(days, source: "registry-legacy");
    }

    // 2) Fall back to Win32_QuickFixEngineering (Get-HotFix-equivalent).
    //    Reliable on Server 2022+ where the legacy registry isn't written.
    var hotfixDate = TryReadHotFixHistory();
    if (hotfixDate.HasValue)
    {
        var days = (DateTime.UtcNow - hotfixDate.Value).TotalDays;
        return Build(days, source: "win32_quickfixengineering");
    }

    // 3) Final fallback: COM Microsoft.Update.Session history.
    //    Catches Defender-only update streams when no KBs hit.
    var comDate = TryReadUpdateSessionHistory();
    if (comDate.HasValue)
    {
        var days = (DateTime.UtcNow - comDate.Value).TotalDays;
        return Build(days, source: "update_session_com");
    }

    // 4) Genuinely no signal anywhere.
    return new CheckResult
    {
        Status = "warn",
        Observed = "no-update-history-found",
        Expected = "<=35-days",
        EvidenceHint = "Get-HotFix, Get-WindowsUpdateLog, or registry"
    };
}

private DateTime? TryReadHotFixHistory()
{
    // Win32_QuickFixEngineering has InstalledOn (string MM/dd/yyyy on most
    // locales; can also come back as a CIM_DATETIME). Defensively parse.
    using var searcher = new ManagementObjectSearcher(
        "SELECT HotFixID, InstalledOn FROM Win32_QuickFixEngineering");
    DateTime? latest = null;
    foreach (ManagementObject mo in searcher.Get())
    {
        var raw = mo["InstalledOn"]?.ToString();
        if (string.IsNullOrWhiteSpace(raw)) continue;
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture,
                              DateTimeStyles.None, out var parsed))
        {
            if (latest == null || parsed > latest) latest = parsed;
        }
    }
    return latest;
}

private DateTime? TryReadUpdateSessionHistory()
{
    try
    {
        var sessionType = Type.GetTypeFromProgID("Microsoft.Update.Session");
        if (sessionType == null) return null;
        dynamic session = Activator.CreateInstance(sessionType);
        dynamic searcher = session.CreateUpdateSearcher();
        int count = (int)searcher.GetTotalHistoryCount();
        if (count <= 0) return null;
        dynamic history = searcher.QueryHistory(0, Math.Min(20, count));
        DateTime? latest = null;
        foreach (var entry in history)
        {
            DateTime entryDate = entry.Date;
            if (latest == null || entryDate > latest) latest = entryDate;
        }
        return latest;
    }
    catch
    {
        return null;
    }
}
```

### Updated `observed` strings

So the dashboard tells us which path was used:

- `"<N>-days (via registry-legacy)"` — old path, still works on older Windows
- `"<N>-days (via win32_quickfixengineering)"` — Get-HotFix-equivalent
- `"<N>-days (via update_session_com)"` — Microsoft.Update.Session COM
- `"no-update-history-found"` — genuinely no signal (fail/warn appropriately)

The codex side just stores `observed` verbatim, so this gets shown in the EnclaveWatch dashboard and survives re-export.

## Why this matters

The check is currently giving a false negative on a healthy patched VM. A C3PAO would see "warn" and ask why; the answer "Microsoft changed the registry path five years ago" is a fine answer but it's better to not have the warn at all.

Bonus: this same pattern applies to **any other "registry recency" check that hardcodes a legacy path**. Worth a quick search across the codebase for similar patterns and applying the same 2-level fallback.

## Test plan

1. Unit test: stub the registry / WMI / COM layers, verify each fallback path returns the right `source` string.
2. Pilot smoke: deploy the fix, refresh the EnclaveWatch dashboard, the row should flip to `pass` with observed `19-days (via win32_quickfixengineering)` (or whatever the current age is).
3. Negative: on a freshly-installed VM with no patches, observed should be `no-update-history-found` with appropriate severity.

## Definition of done

- [ ] Fallback chain implemented + unit-tested
- [ ] Pilot dashboard shows `pass` instead of `warn` for the WU recency check
- [ ] No regression on Windows 10 / older Windows (where legacy registry still writes)
- [ ] Cross-platform build clean, full test suite green

That's the fix. Roll it into Phase 3c or ship as a tiny adjacent commit — it's small enough either way.

---

**End of brief.**
