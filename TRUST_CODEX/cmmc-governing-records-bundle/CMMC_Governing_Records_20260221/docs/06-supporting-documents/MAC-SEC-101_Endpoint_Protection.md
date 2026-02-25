# Endpoint Protection - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## Purpose

This document specifies endpoint protection requirements for developer and administrator devices that access the system. This addresses the requirement to employ malicious code protection mechanisms.

---

## Requirement

**Developer/Administrator Endpoints Must Have OS AV/EDR Enabled**

All devices used by developers and administrators to access the system must have operating system antivirus/endpoint detection and response (EDR) software enabled with automatic updates.

---

## Implementation

### endpoint operating system Endpoints

**Required:** endpoint operating system Defender (or equivalent) enabled with automatic updates

**Verification:**
1. Open endpoint operating system Security
2. Check "Virus & threat protection" status
3. Verify "Real-time protection" is ON
4. Verify "Cloud-delivered protection" is ON
5. Verify "Automatic sample submission" is ON (optional but recommended)
6. Check update status: "Protection definitions are up to date"

**Screenshot Evidence:** endpoint operating system Security dashboard showing protection enabled

---

### macOS Endpoints

**Required:** XProtect (built-in) or third-party AV with automatic updates

**Verification:**
1. System Settings → Privacy & Security
2. Check "XProtect" status (built-in)
3. Or verify third-party AV is installed and active
4. Verify automatic updates enabled

**Alternative:** Third-party solutions (e.g., Sophos, CrowdStrike) with automatic updates enabled

**Screenshot Evidence:** System security settings or AV software dashboard

---

### Linux Endpoints

**Required:** ClamAV or equivalent with automatic updates

**Verification:**
```bash
# Check if ClamAV is installed and running
sudo systemctl status clamav-freshclam
sudo freshclam  # Update definitions
```

**Or:** Third-party solutions with automatic updates

---

## Automatic Updates

**Requirement:** Antivirus/EDR definitions must update automatically

**endpoint operating system Defender:**
- Automatic updates enabled by default
- Updates via endpoint operating system Update service
- Verify: endpoint operating system Update settings

**Third-Party Solutions:**
- Configure automatic definition updates
- Set update frequency (daily recommended)
- Verify update schedule in AV software settings

---

## Internal Audit Checklist Item

**Verification (as needed):**

- [ ] Verify all developer endpoints have AV/EDR enabled
- [ ] Verify all administrator endpoints have AV/EDR enabled
- [ ] Verify automatic updates are enabled
- [ ] Verify definitions are current (updated within last 7 days)
- [ ] Document verification results
- [ ] Store evidence (screenshots, verification logs)

**Evidence Storage:** Compliance evidence folder, dated verification logs

---

## Important Notes

**No Centralized EDR Claims:**
- This document does not claim centralized EDR management
- Each endpoint is individually configured
- Verification is manual (as needed)

**Factual Language:**
- States requirement: OS AV/EDR enabled
- States verification method: Manual check
- Does not claim enterprise EDR platform unless implemented

---

## Sample Verification Record (Redacted)

**Note:** This is an example structure only. Actual verification records should be completed using the Endpoint AV Verification template.

**Device Identifier:** [Example: LAPTOP-ABC123]  
**Owner:** [Example: John Doe]  
**Operating System:** [Example: hardened workstation endpoint]  
**Date Verified:** [Example: 2026-01-15]

**Antivirus Status:**
- Antivirus Enabled: Yes
- Antivirus Product: endpoint operating system Defender
- Version: [Current version]
- Last Update: [Date of last update]
- Real-time Protection: Enabled

**Verification Method:**
- Method Used: Screenshot of AV interface
- Screenshot/Evidence Location: `05-evidence/endpoint-verifications/2026-01-15-laptop-abc123-screenshot.png`

**Verification Details:**
- Verified By: [System Administrator name]
- Verification Date: 2026-01-15
- Notes: endpoint operating system Defender verified active with real-time protection enabled. Screenshot captured and stored.

**Next Verification:**
- Scheduled Date: As needed
- Reminder Set: Yes

**Related Documents:**
- Endpoint AV Verification Template: `../05-evidence/templates/endpoint-av-verification-template.md`
- Endpoint Inventory: `/admin/endpoint-inventory`

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---

## Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation

---

## Appendix A: Related Documents

- Internal Audit Checklist (`../04-self-assessment/MAC-AUD-103_Internal_Audit_Checklist.md`)
- Physical Security (`MAC-SEC-104_Physical_Security.md`)
- Endpoint AV Verification Template (`../05-evidence/templates/endpoint-av-verification-template.md`)
- System Integrity Policy (`../02-policies-and-procedures/MAC-POL-214_System_Integrity_Policy.md`)

## Appendix B: Verification Commands

**endpoint operating system:**
```powershell
# Check endpoint operating system Defender status
Get-MpComputerStatus
```

**macOS:**
```bash
# Check XProtect version
/usr/libexec/xpcd
```

**Linux:**
```bash
# Check ClamAV status
sudo systemctl status clamav-freshclam
clamd --version
```
