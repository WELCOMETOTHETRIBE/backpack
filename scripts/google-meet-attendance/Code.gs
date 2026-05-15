/**
 * Google Meet → Codex / TrainOS attendance bridge.
 *
 * Watches a Drive folder for new Meet attendance reports and routes
 * each one based on the [CDX-{kind}-{prefix}] tag in the meeting
 * title:
 *
 *   [CDX-IR-...]      → TrainOS  /api/ir-tabletop/exercises/by-prefix/{prefix}/attendance/import
 *                       (TrainOS owns the IR bundle ZIP build, so the CSV
 *                       must physically land there for the bundle a C3PAO
 *                       downloads from Azure Gov to actually contain it)
 *   [CDX-RA-...]      → Codex   /api/integrations/google-meet-attendance
 *   [CDX-CA-...]      → Codex   /api/integrations/google-meet-attendance
 *   No tag / unknown  → Codex   /api/integrations/google-meet-attendance
 *                       (lands as unmatched provenance row for manual
 *                       reconciliation in the dashboard)
 *
 * Setup (one-time):
 *   1. Create an Apps Script project at https://script.google.com
 *   2. Paste this whole file as Code.gs (replacing the default).
 *   3. In "Project Settings → Script properties" set:
 *        DRIVE_FOLDER_ID            — id of the Drive folder Google
 *                                     drops attendance reports into
 *        CODEX_BASE_URL             — https://codex.mactechsolutionsllc.com
 *        CODEX_ORG_ID               — organizations.id (uuid) OR clerk org_*
 *        GOOGLE_MEET_BRIDGE_TOKEN   — Codex bridge bearer (matches Codex Railway)
 *        GOOGLE_MEET_BRIDGE_HMAC    — Codex bridge HMAC   (matches Codex Railway)
 *        TRAINOS_BASE_URL           — https://training.mactechsolutionsllc.com
 *        TRAINOS_GMEET_BRIDGE_TOKEN — TrainOS bridge bearer (matches TrainOS Railway)
 *        TRAINOS_GMEET_BRIDGE_HMAC  — TrainOS bridge HMAC   (matches TrainOS Railway)
 *   4. Run installTrigger() once (top toolbar → Run dropdown). Authorize
 *      Drive + UrlFetch when prompted.
 *
 * After that, the script runs every 10 min, finds new attendance
 * files, routes each to Codex or TrainOS based on the tag, and
 * tags the Drive file's description so it's not re-processed.
 * Both destinations are idempotent on (org/exercise, fileId).
 *
 * To test: run processNewAttendanceFiles() manually after dropping a
 * file into the folder. Logs are in Executions (left sidebar).
 */

const PROCESSED_TAG = "codex-imported";
const PROCESSED_DESCRIPTION_PREFIX = "Codex import: ";

// ============== Trigger management ==============

/** Run once after pasting the script. Idempotent. */
function installTrigger() {
  // Remove existing triggers for this function (clean re-install).
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "processNewAttendanceFiles")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("processNewAttendanceFiles")
    .timeBased()
    .everyMinutes(10)
    .create();

  console.log("Trigger installed: processNewAttendanceFiles every 10 min.");
}

/** Removes the trigger. Use if uninstalling. */
function removeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "processNewAttendanceFiles")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  console.log("Trigger removed.");
}

// ============== Main loop ==============

function processNewAttendanceFiles() {
  const props = PropertiesService.getScriptProperties();
  const cfg = {
    folderId: props.getProperty("DRIVE_FOLDER_ID"),
    codexBaseUrl: props.getProperty("CODEX_BASE_URL"),
    codexOrgId: props.getProperty("CODEX_ORG_ID"),
    codexToken: props.getProperty("GOOGLE_MEET_BRIDGE_TOKEN"),
    codexHmac: props.getProperty("GOOGLE_MEET_BRIDGE_HMAC"),
    trainosBaseUrl: props.getProperty("TRAINOS_BASE_URL"),
    trainosToken: props.getProperty("TRAINOS_GMEET_BRIDGE_TOKEN"),
    trainosHmac: props.getProperty("TRAINOS_GMEET_BRIDGE_HMAC"),
  };

  // Codex props are required; TrainOS props are required ONLY when an
  // IR-tagged file shows up (we throw lazily at routing time so the
  // script still works for RA/CA/untagged before TrainOS is wired).
  for (const [name, val] of Object.entries({
    DRIVE_FOLDER_ID: cfg.folderId,
    CODEX_BASE_URL: cfg.codexBaseUrl,
    CODEX_ORG_ID: cfg.codexOrgId,
    GOOGLE_MEET_BRIDGE_TOKEN: cfg.codexToken,
    GOOGLE_MEET_BRIDGE_HMAC: cfg.codexHmac,
  })) {
    if (!val) {
      throw new Error(
        `Missing Script Property: ${name}. Set it in Project Settings → Script properties.`,
      );
    }
  }

  const folder = DriveApp.getFolderById(cfg.folderId);
  const files = folder.getFiles();

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  while (files.hasNext()) {
    const file = files.next();

    const desc = file.getDescription() || "";
    if (desc.indexOf(PROCESSED_DESCRIPTION_PREFIX) === 0) {
      skipped++;
      continue;
    }

    const name = file.getName();
    if (!/attendance/i.test(name) || file.getMimeType() !== "text/csv") {
      skipped++;
      continue;
    }

    try {
      const result = processOne(file, cfg);
      file.setDescription(
        `${PROCESSED_DESCRIPTION_PREFIX}${result.action} dest=${result.destination} ` +
        `${result.bundleVersion ? `bundle=v${result.bundleVersion} ` : ""}` +
        `importId=${result.importId || "?"} matched=${result.matchKind || "no"} ` +
        `at=${new Date().toISOString()}`,
      );
      processed++;
    } catch (err) {
      console.error(`Failed on ${name}:`, err);
      failed++;
    }
  }

  console.log(
    `processed=${processed} skipped=${skipped} failed=${failed} folder=${cfg.folderId}`,
  );
}

/** Pull [CDX-{IR|RA|CA}-{8hex}] tag from a meeting title. Returns null if absent. */
function parseAssessmentTag(meetingTitle) {
  if (!meetingTitle) return null;
  const m = meetingTitle.match(/\[CDX-(IR|RA|CA)-([0-9a-f]{8})\]/i);
  if (!m) return null;
  return { kind: m[1].toUpperCase(), idPrefix: m[2].toLowerCase(), raw: m[0] };
}

// ============== Per-file processing ==============

function processOne(file, cfg) {
  const csv = file.getBlob().getDataAsString();
  const parsed = parseAttendanceCsv(csv);
  const sha256 = sha256Hex(csv);

  const meetingTitle = parsed.meetingTitle || file.getName();
  const tag = parseAssessmentTag(meetingTitle);

  // Common fields both destinations use.
  const baseFields = {
    meetingTitle,
    meetingStartedAt: parsed.meetingStartedAt,
    meetingEndedAt: parsed.meetingEndedAt,
    meetingDurationMinutes: parsed.meetingDurationMinutes,
    driveFileId: file.getId(),
    driveFileUrl: file.getUrl(),
    driveFileName: file.getName(),
    driveFileSha256: sha256,
    attendees: parsed.attendees,
  };

  // Route by tag kind. IR → TrainOS (so the CSV bytes physically end
  // up in the bundle ZIP); everything else → Codex.
  if (tag && tag.kind === "IR") {
    if (!cfg.trainosBaseUrl || !cfg.trainosToken || !cfg.trainosHmac) {
      throw new Error(
        "IR-tagged meeting found but TrainOS Script Properties are not set " +
        "(TRAINOS_BASE_URL / TRAINOS_GMEET_BRIDGE_TOKEN / TRAINOS_GMEET_BRIDGE_HMAC). " +
        "Either set them or remove the [CDX-IR-...] tag from the meeting title.",
      );
    }
    const payload = {
      ...baseFields,
      // TrainOS REQUIRES the raw CSV bytes — it embeds them in the
      // bundle ZIP it uploads to Azure Gov.
      csvBytesBase64: Utilities.base64Encode(csv),
    };
    return postSigned({
      url: `${cfg.trainosBaseUrl}/api/ir-tabletop/exercises/by-prefix/${tag.idPrefix}/attendance/import`,
      destination: "trainos",
      orgId: cfg.codexOrgId, // TrainOS resolves the same org id Codex does
      token: cfg.trainosToken,
      hmac: cfg.trainosHmac,
      payload,
    });
  }

  // RA, CA, untagged → Codex.
  return postSigned({
    url: `${cfg.codexBaseUrl}/api/integrations/google-meet-attendance`,
    destination: "codex",
    orgId: cfg.codexOrgId,
    token: cfg.codexToken,
    hmac: cfg.codexHmac,
    payload: baseFields,
  });
}

/** Sign + POST. Throws on non-200. Returns parsed JSON body + destination tag. */
function postSigned(opts) {
  const body = JSON.stringify(opts.payload);
  const ts = String(Date.now());
  const sig = hmacSha256Hex(opts.hmac, `${ts}.${body}`);

  const response = UrlFetchApp.fetch(opts.url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "X-GMeet-Bridge-Timestamp": ts,
      "X-GMeet-Bridge-Signature": sig,
      "X-GMeet-Bridge-Org": opts.orgId,
      "X-GMeet-Bridge-Caller": "google-meet-apps-script",
      "X-GMeet-Bridge-User-Email": Session.getActiveUser().getEmail() || "",
    },
    payload: body,
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status !== 200) {
    throw new Error(`${opts.destination} returned HTTP ${status}: ${text}`);
  }

  const parsed = JSON.parse(text);
  parsed.destination = opts.destination;
  return parsed;
}

// ============== CSV parser ==============

/**
 * Google Meet attendance CSVs come in two shapes depending on the
 * Workspace edition. This parser handles both:
 *
 * Shape A (newer "Attendance report" — Workspace Enterprise/Education):
 *   Meeting title,Date,Start time,End time
 *   Standup,2026-05-11,09:00,09:32
 *   <blank>
 *   Name,Email,Duration,Time joined,Time exited
 *   Alice Doe,alice@x.com,32m,9:00:12,9:32:01
 *
 * Shape B (legacy "Participation report"):
 *   Name,Email,Duration
 *   Alice Doe,alice@x.com,32:14
 *
 * If neither shape matches we fall back to "first row is headers,
 * required columns: name + email" and leave start/end times null —
 * Codex falls back to file-creation time.
 */
function parseAttendanceCsv(csv) {
  const rows = Utilities.parseCsv(csv);
  if (!rows || rows.length === 0) {
    throw new Error("Empty CSV.");
  }

  let meetingTitle = "";
  let meetingStartedAt = null;
  let meetingEndedAt = null;
  let meetingDurationMinutes = null;
  let attendeeStartIdx = 0;

  // Shape A detection: first row says "Meeting title".
  const header = rows[0].map((c) => c.toLowerCase().trim());
  if (header.indexOf("meeting title") >= 0) {
    const titleIdx = header.indexOf("meeting title");
    const dateIdx = header.indexOf("date");
    const startIdx = header.indexOf("start time");
    const endIdx = header.indexOf("end time");

    const meta = rows[1] || [];
    meetingTitle = (meta[titleIdx] || "").trim();
    const dateStr = (meta[dateIdx] || "").trim();
    const startStr = (meta[startIdx] || "").trim();
    const endStr = (meta[endIdx] || "").trim();

    if (dateStr && startStr) {
      meetingStartedAt = combineDateTime(dateStr, startStr);
    }
    if (dateStr && endStr) {
      meetingEndedAt = combineDateTime(dateStr, endStr);
    }
    if (meetingStartedAt && meetingEndedAt) {
      meetingDurationMinutes = Math.round(
        (Date.parse(meetingEndedAt) - Date.parse(meetingStartedAt)) / 60000,
      );
    }

    // Find the participant header row.
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i].map((c) => c.toLowerCase().trim());
      if (row.indexOf("name") >= 0 && row.indexOf("email") >= 0) {
        attendeeStartIdx = i;
        break;
      }
    }
  }

  // Shape B / fallback: header row at index 0 (or attendeeStartIdx from Shape A).
  const attendeeHeader = rows[attendeeStartIdx].map((c) =>
    c.toLowerCase().trim(),
  );
  const nameCol = attendeeHeader.indexOf("name");
  const emailCol = attendeeHeader.indexOf("email");
  const durationCol = attendeeHeader.indexOf("duration");
  // Both casings have appeared in the wild.
  const joinCol = (() => {
    const a = attendeeHeader.indexOf("time joined");
    if (a >= 0) return a;
    return attendeeHeader.indexOf("first joined");
  })();
  const leaveCol = (() => {
    const a = attendeeHeader.indexOf("time exited");
    if (a >= 0) return a;
    return attendeeHeader.indexOf("last left");
  })();
  const roleCol = attendeeHeader.indexOf("role");

  if (nameCol < 0) {
    throw new Error(
      `Couldn't find "Name" column. Headers: ${attendeeHeader.join(", ")}`,
    );
  }

  // If we didn't pick up meetingStartedAt from the metadata block,
  // fall back to file creation time so Codex still records SOMETHING.
  if (!meetingStartedAt) {
    meetingStartedAt = new Date().toISOString();
  }

  const attendees = [];
  for (let i = attendeeStartIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const name = (row[nameCol] || "").trim();
    if (!name) continue;
    const email = emailCol >= 0 ? (row[emailCol] || "").trim() : "";
    const durRaw = durationCol >= 0 ? (row[durationCol] || "").trim() : "";
    const join = joinCol >= 0 ? (row[joinCol] || "").trim() : "";
    const leave = leaveCol >= 0 ? (row[leaveCol] || "").trim() : "";
    const role = roleCol >= 0 ? (row[roleCol] || "").trim() : "";

    attendees.push({
      name,
      email: email || null,
      joinTimeIso: meetingStartedAt && join ? combineDateOnlyTime(meetingStartedAt, join) : null,
      leaveTimeIso: meetingStartedAt && leave ? combineDateOnlyTime(meetingStartedAt, leave) : null,
      durationMinutes: parseDurationToMinutes(durRaw),
      role: role || null,
    });
  }

  return {
    meetingTitle,
    meetingStartedAt,
    meetingEndedAt,
    meetingDurationMinutes,
    attendees,
  };
}

/** "32m" → 32; "32:14" → 32; "1h 5m" → 65; "" → null. */
function parseDurationToMinutes(s) {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const colonMatch = trimmed.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    const a = Number(colonMatch[1]);
    const b = Number(colonMatch[2]);
    const c = colonMatch[3] ? Number(colonMatch[3]) : 0;
    // Two-segment is mm:ss; three-segment is hh:mm:ss.
    if (colonMatch[3]) return a * 60 + b;
    return a;
  }
  const hMatch = trimmed.match(/(\d+)\s*h/i);
  const mMatch = trimmed.match(/(\d+)\s*m/i);
  if (hMatch || mMatch) {
    const h = hMatch ? Number(hMatch[1]) : 0;
    const m = mMatch ? Number(mMatch[1]) : 0;
    return h * 60 + m;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Combine "2026-05-11" + "09:00" → "2026-05-11T09:00:00Z" (assume UTC). */
function combineDateTime(dateStr, timeStr) {
  // Accept HH:mm or HH:mm:ss
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${dateStr}T${t}Z`).toISOString();
}

/** Combine an existing ISO date with HH:mm:ss to get an ISO datetime. */
function combineDateOnlyTime(isoDate, timeStr) {
  const dateOnly = isoDate.slice(0, 10);
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${dateOnly}T${t}Z`).toISOString();
}

// ============== Crypto helpers ==============

function hmacSha256Hex(secret, data) {
  const raw = Utilities.computeHmacSha256Signature(data, secret);
  return raw
    .map((b) => {
      const v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? `0${v}` : v;
    })
    .join("");
}

function sha256Hex(data) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data);
  return raw
    .map((b) => {
      const v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? `0${v}` : v;
    })
    .join("");
}
