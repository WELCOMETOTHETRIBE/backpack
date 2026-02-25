# Physical Access Log Procedure

**CMMC Practice:** PE.L1-3.10.4  
**Purpose:** Document how to use the physical access log module for compliance evidence

---

## Overview

The physical access log module provides a digital logbook for recording physical access to locations where systems used to process/store/access FCI exist.

**Access:** Admin-only via `/admin/physical-access-logs`

---

## Creating a Log Entry

1. Navigate to `/admin/physical-access-logs`
2. Click "New Entry" button
3. Fill in required fields:
   - **Date:** Date of access
   - **Location:** Location identifier (e.g., "Home Office", "Workstation Area")
   - **Person Name:** Name of person accessing
   - **Purpose:** Purpose of access (e.g., "System administration", "Development work")
   - **Time In:** Time access began (HH:mm format)
   - **Time Out:** Time access ended (optional, HH:mm format)
   - **Host/Escort:** Name of host/escort if applicable (optional)
   - **Notes:** Additional notes (optional)
4. Click "Create Entry"

**Note:** Entries are immutable after creation (tamper-evident).

---

## Viewing Logs

1. Navigate to `/admin/physical-access-logs`
2. Use filters to narrow results:
   - **Start Date:** Filter by start date
   - **End Date:** Filter by end date
   - **Location:** Filter by location
3. View entries in table format

---

## Exporting Evidence

1. Navigate to `/admin/physical-access-logs`
2. Apply filters if needed (date range, location)
3. Click "Export CSV" button
4. CSV file will download with all entries matching filters

**CSV Format:**
- Date, Time In, Time Out, Person Name, Purpose, Host/Escort, Location, Notes, Created At, Created By

**Retention:** Database retention is configurable, default 90 days minimum.

---

## Evidence for Assessors

**Demonstration Steps:**
1. Show admin portal: `/admin/physical-access-logs`
2. Create a sample entry
3. Show existing entries
4. Export CSV and show file

**Evidence Files:**
- Admin UI: `app/admin/physical-access-logs/page.tsx`
- API Routes: `app/api/admin/physical-access-logs/route.ts`
- Database: `PhysicalAccessLog` table

---

## Best Practices

1. **Record promptly:** Create entries as soon as possible after access
2. **Be specific:** Use clear location identifiers
3. **Complete information:** Fill in all required fields accurately
4. **Regular exports:** Export CSV periodically for evidence retention
5. **Review regularly:** Review entries as needed for accuracy

---

## Retention Policy

- **Database:** Physical access logs are retained for a minimum of 90 days in the database.
- **Exports:** CSV exports are retained per organizational retention policy
- **Evidence:** Retain exports for compliance audits

---

## Related Documents

- Physical Security Policy: `../02-policies-and-procedures/MAC-POL-212_Physical_Security_Policy.md`
