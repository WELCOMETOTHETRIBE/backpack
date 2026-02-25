/* Trust Codex Manual App
 * - Loads manual-data.json
 * - Provides per-control adjudication checklist
 * - Persists to localStorage
 */

// Boot flag used by boot.js to detect startup success.
try {
  window.CodexManualAppStarted = true;
} catch (e) {}

const APP_VERSION = "v1";
const STORAGE_KEY = `mactech_codex_manual_progress_${APP_VERSION}`;
const UI_VIEW_KEY = `mactech_codex_manual_last_view_${APP_VERSION}`;
const BUILD_ID = "20260211-20";

// Web app bridge (shared with ConMon panel).
// These values are stored in localStorage because the Manual is a static app.
const WEBAPP_ORIGIN_KEY = "codex.conmon.liveOrigin";
const WEBAPP_TOKEN_KEY = "codex.conmon.serviceToken";
const USE_LIVE_STATE_KEY = "codex.controls.useLiveState";

// Persist progress to disk on the VM (requires running via the local server).
// This is in addition to browser localStorage, so progress survives browser resets/rebuilds.
const DISK_PROGRESS_DIR = "C:\\evidence\\CUI-Manual-Progress";
const DISK_PROGRESS_LATEST_PATH = `${DISK_PROGRESS_DIR}\\codex-manual-progress-latest.json`;

function $(sel) {
  const s = String(sel || "");
  if (!s) return null;
  // Back-compat: most of this app calls $("someId") intending getElementById.
  // If the string looks like a real selector (#foo, .bar, div > a, [attr], etc) use querySelector.
  const looksLikeSelector =
    s[0] === "#" ||
    s[0] === "." ||
    s.indexOf(" ") >= 0 ||
    s.indexOf("[") >= 0 ||
    s.indexOf(">") >= 0 ||
    s.indexOf(":") >= 0;
  if (looksLikeSelector) return document.querySelector(s);
  return document.getElementById(s);
}

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s);
}

function bindClick(selOrId, fn) {
  const el = $(selOrId);
  if (!el) return false;
  el.onclick = fn;
  return true;
}

function getAttesteeProfile(progress) {
  const p = progress && typeof progress === "object" ? progress : {};
  const prof = p.__attestee_profile && typeof p.__attestee_profile === "object" ? p.__attestee_profile : null;
  if (!prof) return null;
  const name = normalize(prof.name);
  if (!name) return null;
  return {
    name,
    title: normalize(prof.title),
    org: normalize(prof.org),
    review_date: normalize(prof.review_date),
    created_utc: normalize(prof.created_utc),
    updated_utc: normalize(prof.updated_utc),
  };
}

function applyAttesteeProfileToInputs(progress) {
  const prof = getAttesteeProfile(progress);
  if (!prof) return;
  // Do not overwrite user's current edits; only fill empty fields.
  const fillIfEmpty = (id, v) => {
    const el = $(id);
    if (!el) return;
    if (normalize(el.value)) return;
    el.value = v || "";
  };
  fillIfEmpty("#attName", prof.name);
  fillIfEmpty("#attTitle", prof.title);
  fillIfEmpty("#attOrg", prof.org);
  fillIfEmpty("#attReviewDate", prof.review_date);
}

function normalize(s) {
  return esc(s).trim();
}

function normOrigin(o) {
  const s = normalize(o).replace(/\/+$/g, "");
  return s || "http://127.0.0.1:3000";
}

function getWebAppOrigin() {
  try {
    return normOrigin(localStorage.getItem(WEBAPP_ORIGIN_KEY) || "http://127.0.0.1:3000");
  } catch {
    return "http://127.0.0.1:3000";
  }
}

function getWebAppToken() {
  try {
    const raw = normalize(localStorage.getItem(WEBAPP_TOKEN_KEY) || "");
    return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
  } catch {
    return "";
  }
}

async function tryLoadConMonTokenFromVm() {
  // Best-effort: auto-load token from VM so Controls tab refresh works
  // even if the operator never pasted it into ConMon.
  // Requires the Manual to be opened via the VM local server (so /__fs can read).
  const candidates = [
    "C:\\Users\\admin_patrick\\mactech\\.secrets\\codex_manual_service_token",
    "C:\\evidence\\codex_manual_service_token.txt",
  ];
  for (const p of candidates) {
    try {
      const tok = normalize(await fsReadTextFile(p));
      if (!tok) continue;
      try {
        localStorage.setItem(WEBAPP_TOKEN_KEY, tok);
      } catch {}
      return tok;
    } catch {}
  }
  return "";
}

// SSP tab uses its OWN bridge config (self-contained).
const SSP_WEBAPP_ORIGIN_KEY = "codex.ssp.liveOrigin";
const SSP_WEBAPP_TOKEN_KEY = "codex.ssp.serviceToken";

function getSspOrigin() {
  try {
    return normOrigin(localStorage.getItem(SSP_WEBAPP_ORIGIN_KEY) || "http://127.0.0.1:3000");
  } catch {
    return "http://127.0.0.1:3000";
  }
}

function getSspToken() {
  try {
    return normalize(localStorage.getItem(SSP_WEBAPP_TOKEN_KEY) || "");
  } catch {
    return "";
  }
}

function setSspOrigin(v) {
  try {
    localStorage.setItem(SSP_WEBAPP_ORIGIN_KEY, String(v || ""));
  } catch {}
}

function setSspToken(v) {
  try {
    localStorage.setItem(SSP_WEBAPP_TOKEN_KEY, String(v || ""));
  } catch {}
}

async function sspPostJson(origin, token, path, body) {
  const o = normOrigin(origin || "");
  // Accept either raw token ("abc") or a pasted header value ("Bearer abc").
  const raw = normalize(token || "");
  const t = raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
  if (!t) throw new Error("Unauthorized (service token missing/invalid)");
  const url = o + path;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.success) {
    const msg = (data && data.error) || `HTTP ${res.status} calling ${url}`;
    throw new Error(msg);
  }
  return data;
}

async function sspTestAuth(origin, token) {
  // Fast auth check: verify we can hit live-controls for a single control.
  // We pick a common control id; server will ignore unknown ids safely.
  const data = await sspPostJson(origin, token, "/api/admin/codex/live-controls", { controlIds: ["3.13.16"] });
  return data;
}

function getUseLiveState() {
  try {
    return String(localStorage.getItem(USE_LIVE_STATE_KEY) || "") === "true";
  } catch {
    return false;
  }
}

function setUseLiveState(v) {
  try {
    localStorage.setItem(USE_LIVE_STATE_KEY, v ? "true" : "false");
  } catch {}
}

// Live audit cache MUST NOT be stored inside progress/localStorage (quota blowups).
// Store a slimmed version in-memory + sessionStorage instead.
const LIVE_AUDIT_CACHE_KEY = "mactech_codex_manual_live_audit_cache_v1";
let __liveAuditCacheMem = null;

function _slimAuditResult(r) {
  const x = r && typeof r === "object" ? r : {};
  const issues = Array.isArray(x.issues) ? x.issues.slice(0, 50).map((s) => String(s || "")) : [];
  return {
    controlId: String(x.controlId || ""),
    verifiedStatus: x.verifiedStatus ? String(x.verifiedStatus) : "",
    verificationStatus: x.verificationStatus ? String(x.verificationStatus) : "",
    complianceScore: typeof x.complianceScore === "number" ? x.complianceScore : null,
    lastVerified: x.lastVerified ? String(x.lastVerified) : "",
    issues,
  };
}

function _loadLiveAuditCache() {
  if (__liveAuditCacheMem && typeof __liveAuditCacheMem === "object") return __liveAuditCacheMem;
  const empty = { generatedAt: "", byId: {} };
  try {
    const raw = sessionStorage.getItem(LIVE_AUDIT_CACHE_KEY);
    if (!raw) return (__liveAuditCacheMem = empty);
    const parsed = JSON.parse(raw);
    const byId = parsed && parsed.byId && typeof parsed.byId === "object" ? parsed.byId : {};
    const generatedAt = parsed && parsed.generatedAt ? String(parsed.generatedAt) : "";
    return (__liveAuditCacheMem = { generatedAt, byId });
  } catch {
    return (__liveAuditCacheMem = empty);
  }
}

function _saveLiveAuditCache(cache) {
  __liveAuditCacheMem = cache;
  try {
    sessionStorage.setItem(LIVE_AUDIT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort: if sessionStorage quota is hit, keep in-memory only.
  }
}

function getLiveAuditEntry(controlId) {
  const cid = String(controlId || "").trim();
  if (!cid) return null;
  const c = _loadLiveAuditCache();
  const e = c && c.byId ? c.byId[cid] : null;
  return e && typeof e === "object" ? e : null;
}

function mergeLiveAuditResults(results, generatedAt) {
  const c0 = _loadLiveAuditCache();
  const next = { generatedAt: String(generatedAt || c0.generatedAt || ""), byId: { ...(c0.byId || {}) } };
  for (const r of results || []) {
    const slim = _slimAuditResult(r);
    const cid = slim.controlId;
    if (!cid) continue;
    next.byId[cid] = { generatedAt: next.generatedAt, result: slim };
  }
  _saveLiveAuditCache(next);
}

async function fetchLiveControlAudit(controlIds) {
  const origin = getWebAppOrigin();
  let token = getWebAppToken();
  if (!token) {
    token = await tryLoadConMonTokenFromVm();
  }
  if (!token) {
    throw new Error("Service token not set. Open ConMon tab and paste CODEX_MANUAL_SERVICE_TOKEN first.");
  }

  const url = origin + "/api/admin/codex/live-controls";
  const body = Array.isArray(controlIds) && controlIds.length ? { controlIds } : {};

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.success) {
    // If token is stale/invalid, try once to reload from VM and retry.
    if (res.status === 401 || res.status === 403) {
      const fresh = await tryLoadConMonTokenFromVm();
      if (fresh && fresh !== token) {
        const res2 = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${fresh}` },
          body: JSON.stringify(body),
        });
        const data2 = await res2.json().catch(() => null);
        if (res2.ok && data2 && data2.success) return data2;
      }
    }
    const msg = (data && data.error) || `HTTP ${res.status} calling ${url}`;
    throw new Error(msg);
  }
  return data;
}

async function pullLiveEvidence(controlId, opts) {
  const origin = getWebAppOrigin();
  let token = getWebAppToken();
  if (!token) {
    token = await tryLoadConMonTokenFromVm();
  }
  if (!token) {
    throw new Error("Service token not set. Open ConMon tab and paste CODEX_MANUAL_SERVICE_TOKEN first.");
  }
  const url = origin + "/api/admin/codex/pull-evidence";
  const targetPaths = opts && Array.isArray(opts.targetPaths) ? opts.targetPaths : [];
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ controlId: String(controlId || ""), targetPaths }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.success) {
    if (res.status === 401 || res.status === 403) {
      const fresh = await tryLoadConMonTokenFromVm();
      if (fresh && fresh !== token) {
        const res2 = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${fresh}` },
          body: JSON.stringify({ controlId: String(controlId || ""), targetPaths }),
        });
        const data2 = await res2.json().catch(() => null);
        if (res2.ok && data2 && data2.success) return data2;
      }
    }
    const msg = (data && data.error) || `HTTP ${res.status} calling ${url}`;
    throw new Error(msg);
  }
  return data;
}

async function pullLiveEvidenceAll() {
  const origin = getWebAppOrigin();
  let token = getWebAppToken();
  if (!token) {
    token = await tryLoadConMonTokenFromVm();
  }
  if (!token) {
    throw new Error("Service token not set. Open ConMon tab and paste CODEX_MANUAL_SERVICE_TOKEN first.");
  }
  const url = origin + "/api/admin/codex/pull-evidence";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scope: "all" }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.success) {
    if (res.status === 401 || res.status === 403) {
      const fresh = await tryLoadConMonTokenFromVm();
      if (fresh && fresh !== token) {
        const res2 = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${fresh}` },
          body: JSON.stringify({ scope: "all" }),
        });
        const data2 = await res2.json().catch(() => null);
        if (res2.ok && data2 && data2.success) return data2;
      }
    }
    const msg = (data && data.error) || `HTTP ${res.status} calling ${url}`;
    throw new Error(msg);
  }
  return data;
}

// Minimal CSS selector escaping for attribute selectors used in this app.
// (Good enough for our data-cid / data-srm-ref values.)
function cssEsc(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function tryRerender() {
  try {
    const fn = (typeof window !== "undefined" && (window.__rerender || window.rerender)) || null;
    if (typeof fn === "function") fn();
  } catch {}
}

function extractFirstWindowsEvidencePath(text) {
  const t = String(text || "");
  // Prefer C:\evidence\... paths if present.
  const m = t.match(/C:\\evidence\\[^\s;"']+/i);
  return m && m[0] ? String(m[0]) : "";
}

function isRelLink(href) {
  const h = normalize(href);
  if (!h) return false;
  if (h.startsWith("#")) return false;
  if (/^[a-zA-Z]+:\/\//.test(h)) return false;
  if (h.startsWith("mailto:")) return false;
  return true;
}

function inlineMd(md, linkResolver) {
  let s = esc(md);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const h = String(href).trim();
    const t = String(text);
    if (isRelLink(h)) {
      const resolved = linkResolver ? linkResolver(h) : h;
      return `<a href="#" data-doc="${esc(resolved)}">${esc(t)}</a>`;
    }
    return `<a href="${esc(h)}" target="_blank" rel="noreferrer">${esc(t)}</a>`;
  });
  return s;
}

function renderMarkdown(src, linkResolver) {
  const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let out = "";

  function paraUntilBlank() {
    const buf = [];
    while (i < lines.length && lines[i].trim() !== "") {
      buf.push(lines[i]);
      i++;
    }
    const txt = buf.join(" ").replace(/\s+/g, " ").trim();
    if (txt) out += `<p>${inlineMd(txt, linkResolver)}</p>`;
  }

  function codeFence() {
    const first = lines[i];
    const lang = (first.match(/^```(\w+)?/) || ["", ""])[1] || "";
    i++;
    const buf = [];
    while (i < lines.length && !lines[i].startsWith("```")) {
      buf.push(lines[i]);
      i++;
    }
    if (i < lines.length && lines[i].startsWith("```")) i++;
    const code = esc(buf.join("\n"));
    out += `<pre class="mono"><code data-lang="${esc(lang)}">${code}</code></pre>`;
  }

  function listBlock() {
    const isOrdered = /^\s*\d+\.\s+/.test(lines[i]);
    const tag = isOrdered ? "ol" : "ul";
    out += `<${tag}>`;
    while (i < lines.length) {
      const line = lines[i];
      const m = isOrdered ? line.match(/^\s*\d+\.\s+(.*)$/) : line.match(/^\s*[-*]\s+(.*)$/);
      if (!m) break;
      out += `<li>${inlineMd(m[1], linkResolver)}</li>`;
      i++;
    }
    out += `</${tag}>`;
  }

  function calloutBlock() {
    const m = lines[i].match(/^>\s*\[!([A-Za-z]+)\]\s*$/);
    const kind = (m ? m[1] : "NOTE").toUpperCase();
    i++;
    const buf = [];
    while (i < lines.length && lines[i].startsWith(">")) {
      buf.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    const inner = renderMarkdown(buf.join("\n"), linkResolver);
    const cls = kind === "IMPORTANT" ? "important" : kind === "WARNING" ? "warning" : "note";
    out += `<div class="callout callout-${cls}"><div class="callout-title">${esc(kind)}</div>${inner}</div>`;
  }

  function blockquoteBlock() {
    const buf = [];
    while (i < lines.length && lines[i].startsWith(">")) {
      buf.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    const inner = renderMarkdown(buf.join("\n"), linkResolver);
    out += `<blockquote>${inner}</blockquote>`;
  }

  function tableBlock() {
    const header = lines[i];
    const sep = lines[i + 1] || "";
    if (!/^\s*\|?.*\|.*\|?\s*$/.test(header)) return false;
    if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(sep)) return false;

    function splitRow(row) {
      let r = row.trim();
      if (r.startsWith("|")) r = r.slice(1);
      if (r.endsWith("|")) r = r.slice(0, -1);
      return r.split("|").map((c) => c.trim());
    }

    const headCells = splitRow(header);
    i += 2;
    const rows = [];
    while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
      rows.push(splitRow(lines[i]));
      i++;
    }

    out += '<div class="md-table"><table><thead><tr>';
    for (const c of headCells) out += `<th>${inlineMd(c, linkResolver)}</th>`;
    out += "</tr></thead><tbody>";
    for (const r of rows) {
      out += "<tr>";
      for (let k = 0; k < headCells.length; k++) {
        const cell = r[k];
        out += `<td>${inlineMd(cell === null || cell === undefined ? "" : cell, linkResolver)}</td>`;
      }
      out += "</tr>";
    }
    out += "</tbody></table></div>";
    return true;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      codeFence();
      continue;
    }
    if (/^>\s*\[![A-Za-z]+\]\s*$/.test(line)) {
      calloutBlock();
      continue;
    }
    if (line.startsWith(">")) {
      blockquoteBlock();
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      const level = (m[1] || "#").length;
      out += `<h${level}>${inlineMd(m[2] || "", linkResolver)}</h${level}>`;
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      listBlock();
      continue;
    }
    if (line.trim() === "---" || line.trim() === "***") {
      out += "<hr />";
      i++;
      continue;
    }
    if (line.includes("|") && tableBlock()) continue;
    paraUntilBlank();
  }

  return out;
}

function stripPlatformAgnosticBoilerplate(md) {
  const t = String(md || "");
  // Only strip if it's the standard platform-agnostic header block.
  if (!/^#\s*PLATFORM-AGNOSTIC TEMPLATE\b/i.test(t)) return t;
  const m = t.match(/^#\s*PLATFORM-AGNOSTIC TEMPLATE[\s\S]*?\n---\s*\n+/i);
  if (m && m[0]) return t.slice(m[0].length);
  return t;
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function stripUtf8Bom(text) {
  const s = String(text || "");
  // Remove UTF-8 BOM if present (U+FEFF)
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function todayISODate() {
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function buildProgressExportObject(progressObj) {
  return {
    schema: "mactech.codex.manual.progress",
    version: APP_VERSION,
    exported_utc: new Date().toISOString(),
    progress: progressObj || {},
  };
}

function canUseFsApi() {
  try {
    const proto = window && window.location ? String(window.location.protocol || "") : "";
    // /__fs API is provided by start-server.ps1 under http://127.0.0.1:8787
    return proto === "http:" || proto === "https:";
  } catch {
    return false;
  }
}

function scheduleDiskProgressSave(progressObj) {
  if (!canUseFsApi()) return;
  try {
    scheduleDiskProgressSave._pending = progressObj || {};
    clearTimeout(scheduleDiskProgressSave._t);
  } catch {}
  scheduleDiskProgressSave._t = setTimeout(async () => {
    try {
      const p = scheduleDiskProgressSave._pending || {};
      const out = buildProgressExportObject(p);
      const json = JSON.stringify(out, null, 2) + "\n";
      await fsWriteTextFile(DISK_PROGRESS_LATEST_PATH, json);
    } catch {
      // Best-effort: if disk persistence fails, localStorage still works.
    }
  }, 800);
}

async function tryLoadProgressFromDisk() {
  if (!canUseFsApi()) return null;
  try {
    const raw = await fsReadTextFile(DISK_PROGRESS_LATEST_PATH);
    const obj = JSON.parse(String(raw || ""));
    const imported = obj && obj.progress && typeof obj.progress === "object" ? obj.progress : obj;
    if (!imported || typeof imported !== "object") return null;
    return imported;
  } catch {
    return null;
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveProgress(p) {
  // Compact JSON (smaller) + prune transient caches (prevents quota blowups).
  const prune = (obj) => {
    const o = obj && typeof obj === "object" ? { ...(obj || {}) } : {};
    try {
      delete o.__live_control_audit; // legacy
    } catch {}
    return o;
  };
  const pruned = prune(p);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Best-effort: if quota exceeded, do not throw; disk persistence may still work.
  }
  scheduleDiskProgressSave(pruned);
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2) + "\n"], { type: "application/json" });
  // IE/legacy Edge
  const nav = window.navigator;
  if (nav && (nav.msSaveOrOpenBlob || nav.msSaveBlob)) {
    const fn = nav.msSaveOrOpenBlob || nav.msSaveBlob;
    fn.call(nav, blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(filename, text, contentType = "text/plain; charset=utf-8") {
  const blob = new Blob([String(text || "")], { type: contentType });
  // IE/legacy Edge
  const nav = window.navigator;
  if (nav && (nav.msSaveOrOpenBlob || nav.msSaveBlob)) {
    const fn = nav.msSaveOrOpenBlob || nav.msSaveBlob;
    fn.call(nav, blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function statusPillClass(pilotStatus) {
  const s = normalize(pilotStatus).toLowerCase();
  if (s.includes("adjudicated")) return "pill-good";
  if (s.includes("implemented")) return "pill-good";
  if (s.includes("planned") || s.includes("partially")) return "pill-warn";
  if (s.includes("n/a") || s.includes("not applicable")) return "pill-muted";
  if (s.includes("governed")) return "pill-warn";
  return "pill-muted";
}

function getProgressEntry(progress, controlId) {
  if (!progress || !controlId) return {};
  const p = progress[controlId];
  return p && typeof p === "object" ? p : {};
}

function effectiveStatusLabel(control, progress) {
  const cid = control && control.control_id ? control.control_id : "";
  const p = getProgressEntry(progress, cid);
  if (p.adjudicated) return "Adjudicated";
  return normalize(control && control.pilot_status ? control.pilot_status : "") || "(blank)";
}

function setBuildInfo() {
  try {
    const el = document.querySelector(".brand-subtitle");
    if (!el) return;
    const base = "Step-by-step control adjudication workflow";
    el.textContent = `${base} · Build ${BUILD_ID}`;
  } catch {}
}

function outstandingReasonHint(control, progress) {
  const cid = control && control.control_id ? control.control_id : "";
  const p = getProgressEntry(progress, cid);
  if (p && p.adjudicated) return "";

  const clsRaw = normalize(control && control.classification ? control.classification : "");
  const clsLower = clsRaw.toLowerCase();
  const dom = normalize(control && control.implementation_domain ? control.implementation_domain : "").toLowerCase();

  // Explicit: inherited / N/A require governance-style closeout, not technical validation.
  if (clsLower.indexOf("not applicable") >= 0 || clsLower === "n/a" || clsLower === "na") {
    return "N/A — requires documented justification + adjudication";
  }
  if (clsLower.indexOf("inherited") >= 0) {
    return "Inherited — requires SRM / boundary evidence + adjudication";
  }

  // Domain hints for shared-responsibility controls (reduce confusion: not all are VM-local).
  if (dom === "entra_tenant") return "Entra tenant — requires tenant configuration evidence + adjudication";
  if (dom === "azure_resource") return "Azure resource — requires Azure configuration evidence + adjudication";

  // If the user has ingested a run, but this control has no per-control validator linkage, call it out.
  // This typically means: the validator does not implement a check for this control yet.
  const lastV = progress && progress.__last_validation_dir ? String(progress.__last_validation_dir) : "";
  if (lastV && clsLower.indexOf("system-enforced") >= 0) {
    const linkedV = p && p.linked_validation_dir ? String(p.linked_validation_dir) : "";
    if (!linkedV || linkedV !== lastV) return "Not validated (no check implemented)";
  }

  // If we have ingest/validator details, surface high-signal reasons.
  if (p && p.linked_evidence_dir && p.linked_validation_dir) {
    if (p.validation_pass === false) {
      const failed = p.validation_failed_check_ids && Array.isArray(p.validation_failed_check_ids) ? p.validation_failed_check_ids : [];
      if (failed.includes("NO-CHECK-IMPLEMENTED")) return "Not validated (no check implemented)";
      return "Validator FAIL";
    }
    const missing = p.validation_missing_files && Array.isArray(p.validation_missing_files) ? p.validation_missing_files : [];
    if (missing.length) return `Missing artifacts: ${missing.join(", ")}`;
    // If linked but no explicit PASS yet, keep it short.
    if (p.validation_pass === true) return "PASS; ready to adjudicate";
    // If the validator didn't emit a per-control result, call it out explicitly (coverage gap).
    if (clsLower.indexOf("system-enforced") >= 0) return "Not validated (no check implemented)";
    return "Needs adjudication";
  }

  // Governance: if doc signoffs exist, it may just be awaiting adjudication; otherwise docs need signing.
  if (clsLower.indexOf("governance") >= 0) {
    const signed = progress && progress.__doc_signoffs && typeof progress.__doc_signoffs === "object" ? progress.__doc_signoffs : null;
    if (signed && Object.keys(signed).length) return "Docs signed; needs adjudication";
    return "Docs not signed";
  }

  // Otherwise: not yet linked/ingested.
  return "Not ingested / not yet reviewed";
}

// IMPORTANT: Do not auto-adjudicate from SCTM baseline status.
// Adjudication should only occur when evidence is actually produced/verified (ingest PASS + artifacts) or when an operator explicitly adjudicates.

function sortControls(controls) {
  // Stable-ish: by family, then by NIST requirement numeric-ish, then by control_id
  const nistKey = (c) => {
    const n = normalize(c.nist_req_id);
    const m = n.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return [999, 999, 999];
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  };
  return controls.slice().sort((a, b) => {
    const fa = normalize(a.family);
    const fb = normalize(b.family);
    if (fa !== fb) return fa.localeCompare(fb);
    const ka = nistKey(a);
    const kb = nistKey(b);
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return normalize(a.control_id).localeCompare(normalize(b.control_id));
  });
}

function makeStats(controls, progress, filtered) {
  const total = controls.length;
  const shown = filtered.length;
  const adjudicated = filtered.filter((c) => getProgressEntry(progress, c.control_id).adjudicated).length;
  const outstanding = shown - adjudicated;

  // Bucket breakdown (adjudicated/total), derived from classification.
  const buckets = {
    system: { label: "Enclave Configuration (System-Enforced)", adjudicated: 0, total: 0 },
    governance: { label: "Governance (Policies/SOPs + records)", adjudicated: 0, total: 0 },
    inherited: { label: "Inherited (SRM boundary)", adjudicated: 0, total: 0 },
    na: { label: "N/A (documented)", adjudicated: 0, total: 0 },
    other: { label: "Other", adjudicated: 0, total: 0 },
  };
  for (const c of filtered) {
    const cls = normalize(c && c.classification ? c.classification : "").toLowerCase();
    const isAdj = !!getProgressEntry(progress, c.control_id).adjudicated;
    let b = buckets.other;
    if (cls.indexOf("system-enforced") >= 0) b = buckets.system;
    else if (cls.indexOf("governance") >= 0) b = buckets.governance;
    else if (cls === "inherited" || cls.indexOf("inherited") >= 0) b = buckets.inherited;
    else if (cls.indexOf("not applicable") >= 0 || cls === "n/a" || cls === "na") b = buckets.na;
    b.total++;
    if (isAdj) b.adjudicated++;
  }
  const bucketBreakdown = [buckets.system, buckets.governance, buckets.inherited, buckets.na]
    .filter((x) => x.total > 0)
    .concat(buckets.other.total ? [buckets.other] : []);

  // Readiness is computed over the full 110 controls.
  // Single source of truth: adjudicated.
  const readiness = controls.filter((c) => getProgressEntry(progress, c.control_id).adjudicated).length;

  return { total, shown, adjudicated, outstanding, bucketBreakdown, readiness };
}

function buildSelectOptions(sel, values, includeAllLabel = "All") {
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = includeAllLabel;
  sel.appendChild(optAll);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
}

function filterControls(controls, query, family, classification, adjudicatedFilter, progress) {
  const q = normalize(query).toLowerCase();
  return controls.filter((c) => {
    if (family !== "all" && normalize(c.family) !== family) return false;
    if (classification !== "all" && normalize(c.classification) !== classification) return false;
    const isAdj = !!(progress && progress[c.control_id] && progress[c.control_id].adjudicated);
    if (adjudicatedFilter === "yes" && !isAdj) return false;
    if (adjudicatedFilter === "no" && isAdj) return false;
    if (!q) return true;
    const hay = [
      c.control_id,
      c.title,
      c.family,
      c.nist_req_id,
      c.classification,
      c.pilot_status,
      c.owner_role,
      c.pilot_status_basis,
      c && c.evidence ? c.evidence.evidence_type : "",
      c && c.evidence ? c.evidence.artifact_name : "",
      c && c.evidence ? c.evidence.location : "",
      c && c.evidence ? c.evidence.regeneration_method : "",
    ]
      .map((x) => normalize(x).toLowerCase())
      .join(" | ");
    return hay.includes(q);
  });
}

function renderStats(stats) {
  const root = $("#stats");
  root.innerHTML = "";
  const make = (k, v) => {
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
    return d;
  };
  // Overall CMMC L2 readiness bar (110 controls).
  const pct = stats.total ? Math.max(0, Math.min(100, Math.round((stats.readiness / stats.total) * 100))) : 0;
  const p = document.createElement("div");
  p.className = "stat";
  p.style.gridColumn = "1 / -1";
  p.innerHTML = `
    <div class="k">CMMC Level 2 readiness (adjudicated/closed)</div>
    <div class="v">${stats.readiness}/${stats.total} (${pct}%)</div>
    <div class="progressBar"><div class="fill" style="width:${pct}%"></div></div>
    <div class="progressMeta"><span>Goal: 110/110</span><span>Counts adjudicated only (requires evidence/verification)</span></div>
  `;
  root.appendChild(p);
  root.appendChild(make("Controls (total)", stats.total));
  root.appendChild(make("Shown", stats.shown));
  root.appendChild(make("Adjudicated (shown)", stats.adjudicated));
  root.appendChild(make("Outstanding (shown)", stats.outstanding));

  if (stats.bucketBreakdown && stats.bucketBreakdown.length) {
    const d = document.createElement("div");
    d.className = "stat";
    d.style.gridColumn = "1 / -1";
    d.innerHTML = `<div class="k">Adjudicated by bucket (shown)</div><div class="v" style="font-size:13px; font-weight:700; margin-top:8px;"></div>`;
    const v = d.querySelector(".v");
    for (const b of stats.bucketBreakdown) {
      const label = b && b.label ? String(b.label) : "—";
      const n = b && typeof b.adjudicated === "number" ? b.adjudicated : 0;
      const t = b && typeof b.total === "number" ? b.total : 0;
      const pillClass = n >= t && t > 0 ? "pill-good" : (n > 0 ? "pill-warn" : "pill-muted");
      const row = document.createElement("div");
      row.style.marginTop = "6px";
      row.innerHTML = `<span class="pill ${pillClass}">${esc(label)}</span> <span style="color:rgba(255,255,255,0.72)">(${n}/${t})</span>`;
      v.appendChild(row);
    }
    root.appendChild(d);
  }
}

function splitOutstanding(controls, progress) {
  const isOutstanding = (c) => {
    // Outstanding if NOT adjudicated. (Adjudicated is the only 'closed' concept.)
    return !getProgressEntry(progress, c.control_id).adjudicated;
  };
  const outstanding = [];
  const adjudicated = [];
  for (const c of controls) (isOutstanding(c) ? outstanding : adjudicated).push(c);
  return { outstanding, adjudicated, isOutstanding };
}

function renderList(listEl, controls, progress, selectedId, onSelect, mode = "controls") {
  function makeItem(c) {
    const item = document.createElement("div");
    item.className = "item" + (c.control_id === selectedId ? " active" : "");
    const p = getProgressEntry(progress, c.control_id);
    const adj = !!p.adjudicated;
    const primary = adj ? "Adjudicated" : "Outstanding";
    const primaryClass = adj ? "pill-good" : "pill-warn";
    const reason = adj ? "" : outstandingReasonHint(c, progress);
    const dom = normalize(c.implementation_domain);
    const resp = normalize(c.responsibility);
    const src = normalize(c.inheritance_source);
    const srcShort = src ? src.replace(/\s*\(.*?\)\s*$/g, "").trim() : "";
    item.innerHTML = `
        <div class="left">
          <div class="cid">${esc(c.control_id)}</div>
          <div class="meta">${esc(c.family)} · ${esc(c.nist_req_id)}</div>
        </div>
        <div class="right">
          <div class="title">${esc(c.title)}</div>
          <div class="tags">
            <span class="pill ${primaryClass}">${esc(primary)}</span>
            <span class="pill pill-muted">${esc(c.classification)}</span>
            ${dom ? `<span class="pill pill-muted">domain: ${esc(dom)}</span>` : ""}
            ${resp ? `<span class="pill pill-muted">resp: ${esc(resp)}</span>` : ""}
            ${srcShort ? `<span class="pill pill-muted">source: ${esc(srcShort)}</span>` : ""}
            ${reason ? `<span class="pill pill-muted">${esc(reason)}</span>` : ""}
          </div>
        </div>
      `;
    item.addEventListener("click", () => onSelect(c.control_id));
    return item;
  }

  listEl.innerHTML = "";

  const { outstanding, adjudicated } = splitOutstanding(controls, progress);

  function section(title, subtitle) {
    const d = document.createElement("div");
    d.className = "list-section";
    d.innerHTML = `<div class="list-section-title">${esc(title)}</div><div class="list-section-sub">${esc(
      subtitle || ""
    )}</div>`;
    return d;
  }

  if (mode === "outstanding") {
    listEl.appendChild(section("Outstanding", "Items requiring closeout actions and/or adjudication."));
    if (!outstanding.length) {
      const empty = document.createElement("div");
      empty.className = "list-empty";
      empty.textContent = "No outstanding items match the current filters.";
      listEl.appendChild(empty);
    } else {
      for (const c of outstanding) listEl.appendChild(makeItem(c));
    }
    return;
  }

  // Controls mode: show both sections
  listEl.appendChild(section("Adjudicated", "Items that should not block readiness (complete and reviewed)."));
  if (!adjudicated.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "No items match this section with current filters.";
    listEl.appendChild(empty);
  } else {
    for (const c of adjudicated) listEl.appendChild(makeItem(c));
  }

  listEl.appendChild(section("Outstanding", "Items requiring closeout actions and/or adjudication."));
  if (!outstanding.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "No outstanding items match the current filters.";
    listEl.appendChild(empty);
  } else {
    for (const c of outstanding) listEl.appendChild(makeItem(c));
  }
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = esc(value);
}

function setHref(id, href) {
  const el = $(id);
  if (!el) return;
  el.setAttribute("href", href);
}

function openInNewTab(href) {
  window.open(href, "_blank", "noreferrer");
}

function isMarkdownPath(path) {
  const p = normalize(path);
  return /\.md(\?|#|$)/i.test(p);
}

function openRenderedDocInNewTab(path) {
  const p = normalize(path);
  if (!p) return;
  // Keep doc path relative (works under the local server root).
  const url = `doc_viewer.html?doc=${encodeURIComponent(p)}&v=${encodeURIComponent(BUILD_ID || "")}`;
  openInNewTab(url);
}

function fmtBoolPill(v) {
  return v ? `<span class="auditBadge good">ON</span>` : `<span class="auditBadge bad">OFF</span>`;
}

function fmtAgePill(days) {
  const n = typeof days === "number" ? days : parseInt(String(days || ""), 10);
  // Defender sometimes reports "never" as UINT32 max (4294967295).
  if (n === 4294967295) return `<span class="auditBadge warn">never</span>`;
  if (!isFinite(n)) return `<span class="auditBadge warn">unknown</span>`;
  if (n <= 1) return `<span class="auditBadge good">${n}d</span>`;
  if (n <= 3) return `<span class="auditBadge warn">${n}d</span>`;
  return `<span class="auditBadge bad">${n}d</span>`;
}

function initWinAuditDashboard() {
  // Back-compat wrapper (older builds used to place audit+AV in ConMon).
  try {
    initWinAuditLogsPanel();
  } catch {}
  try {
    initWinAvPanel();
  } catch {}
}

function initWinAuditLogsPanel() {
  const resultsEl = $("#winAuditResults");
  if (!resultsEl) return;
  if (resultsEl.getAttribute("data-init") === "1") return;
  resultsEl.setAttribute("data-init", "1");

  const statusEl = $("#winAuditStatus");
  const setStatus = (m) => {
    if (statusEl) statusEl.textContent = m ? String(m) : " ";
  };

  const logEl = $("#winAuditLog");
  const idsEl = $("#winAuditIds");
  const userEl = $("#winAuditUser");
  const sinceEl = $("#winAuditSince");
  const maxEl = $("#winAuditMax");
  const containsEl = $("#winAuditContains");

  const btnPresetRdp = $("#btnWinAuditPresetRdp");
  const btnFetch = $("#btnWinAuditFetch");
  const btnWrite = $("#btnWinAuditWriteSnapshot");

  const state = {
    lastQuery: null,
    lastEvents: [],
    lastLog: "Security",
  };

  const buildQuery = () => {
    const log = logEl && logEl.value ? String(logEl.value) : "Security";
    const ids = idsEl && idsEl.value ? String(idsEl.value).trim() : "";
    const user = userEl && userEl.value ? String(userEl.value).trim() : "";
    const sinceMinutes = sinceEl && sinceEl.value ? String(sinceEl.value).trim() : "1440";
    const max = maxEl && maxEl.value ? String(maxEl.value).trim() : "200";
    const contains = containsEl && containsEl.value ? String(containsEl.value).trim() : "";
    return { log, ids, user, sinceMinutes, max, contains };
  };

  const presets = {
    success_logons: {
      title: "Successful logons (Security 4624)",
      q: { log: "Security", ids: "4624", contains: "", sinceMinutes: "1440", max: "200" },
    },
    failed_logons: {
      title: "Failed logons (Security 4625)",
      q: { log: "Security", ids: "4625", contains: "", sinceMinutes: "1440", max: "200" },
    },
    rdp_logons: {
      title: "RDP logons (Security 4624/4625, LogonType 10)",
      q: { log: "Security", ids: "4624,4625", contains: "Logon Type:\t\t10", sinceMinutes: "1440", max: "200" },
    },
    privileged_logons: {
      title: "Privileged logons (Security 4672)",
      q: { log: "Security", ids: "4672", contains: "", sinceMinutes: "1440", max: "200" },
    },
    account_lockouts: {
      title: "Account lockouts (Security 4740)",
      q: { log: "Security", ids: "4740", contains: "", sinceMinutes: "10080", max: "200" },
    },
    audit_log_cleared: {
      title: "Audit log cleared (Security 1102)",
      q: { log: "Security", ids: "1102", contains: "", sinceMinutes: "10080", max: "200" },
    },
    policy_changes: {
      title: "Audit policy changes (Security 4719)",
      q: { log: "Security", ids: "4719", contains: "", sinceMinutes: "10080", max: "200" },
    },
    account_changes: {
      title: "Account/group management changes (Security)",
      // Common subset (covers most “who changed what?” auditor sampling)
      q: { log: "Security", ids: "4720,4722,4725,4726,4728,4732,4733,4738,4740,4767", contains: "", sinceMinutes: "10080", max: "200" },
    },
    object_access: {
      title: "File/object access (Security 4663)",
      q: { log: "Security", ids: "4663", contains: "", sinceMinutes: "1440", max: "200" },
    },
    share_access: {
      title: "SMB share access (Security 5140/5145)",
      q: { log: "Security", ids: "5140,5145", contains: "", sinceMinutes: "1440", max: "200" },
    },
    share_access_denied: {
      title: "SMB share access denied (Security 5145 contains Access Denied)",
      q: { log: "Security", ids: "5145", contains: "Access Denied", sinceMinutes: "1440", max: "200" },
    },
  };

  const applyPreset = (key, doFetch = true) => {
    const p = presets[key];
    if (!p || !p.q) return;
    const q = p.q;
    if (logEl) logEl.value = q.log || "Security";
    if (idsEl) idsEl.value = q.ids || "";
    if (containsEl) containsEl.value = q.contains || "";
    if (sinceEl && q.sinceMinutes) sinceEl.value = String(q.sinceMinutes);
    if (maxEl && q.max) maxEl.value = String(q.max);
    setStatus(`Quick query applied: ${p.title}.`);
    if (doFetch && btnFetch && typeof btnFetch.click === "function") btnFetch.click();
  };

  const fetchEvents = async (q) => {
    const params = new URLSearchParams();
    params.set("log", q.log || "Security");
    if (q.ids) params.set("ids", q.ids);
    if (q.user) params.set("user", q.user);
    if (q.contains) params.set("contains", q.contains);
    if (q.sinceMinutes) params.set("sinceMinutes", q.sinceMinutes);
    if (q.max) params.set("max", q.max);
    const url = `/__events?${params.toString()}`;
    const resp = await fetch(url, { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok || !data || data.error) {
      throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`);
    }
    return data;
  };

  const resultBadge = (e) => {
    const id = parseInt(String(e && e.id ? e.id : ""), 10);
    const res = (e && e.result ? String(e.result) : "") || (id === 4625 ? "FAIL" : id === 4624 ? "OK" : "");
    if (res.toUpperCase() === "OK") return `<span class="auditBadge good">OK</span>`;
    if (res.toUpperCase() === "FAIL") return `<span class="auditBadge bad">FAIL</span>`;
    return `<span class="auditBadge muted">—</span>`;
  };

  const logonTypeLabel = (v) => {
    const n = parseInt(String(v || ""), 10);
    const map = {
      2: "Interactive",
      3: "Network",
      4: "Batch",
      5: "Service",
      7: "Unlock",
      8: "NetworkCleartext",
      9: "NewCredentials",
      10: "RemoteInteractive (RDP)",
      11: "CachedInteractive",
    };
    if (!isFinite(n)) return String(v || "");
    return map[n] ? `${n} (${map[n]})` : String(n);
  };

  const renderEvents = (q, evs) => {
    const events = Array.isArray(evs) ? evs : [];
    state.lastQuery = q;
    state.lastEvents = events;
    state.lastLog = q && q.log ? q.log : state.lastLog;

    if (!events.length) {
      resultsEl.innerHTML = `<div class="list-empty">No events returned for this filter.</div>`;
      return;
    }

    const rows = events
      .slice(0, 500)
      .map((e) => {
        const when = esc(e.timeCreatedUtc || "");
        const id = esc(e.id);
        const user = esc(e.user || "");
        const ip = esc(e.ip || "");
        const lt = esc(logonTypeLabel(e.logonType || ""));
        const prov = esc(e.provider || "");
        const msg = esc(e.message || "");
        const msgShort = msg.length > 280 ? msg.slice(0, 280) + "…" : msg;
        let parsed = "";
        try {
          const f = e && e.fields && typeof e.fields === "object" ? e.fields : null;
          if (f) {
            const keys = [
              "TargetUserName",
              "TargetDomainName",
              "SubjectUserName",
              "SubjectDomainName",
              "WorkstationName",
              "ProcessName",
              "AuthenticationPackageName",
              "FailureReason",
              "Status",
              "SubStatus",
            ];
            const lines = [];
            for (const k of keys) {
              const v = f[k];
              if (!v) continue;
              const s = String(v);
              if (!s.trim()) continue;
              lines.push(`${k}: ${s}`);
            }
            if (lines.length) {
              parsed = `<div class="auditMono" style="margin-top:8px; white-space:pre-wrap">${esc(lines.join("\n"))}</div>`;
            }
          }
        } catch {}

        return `<tr>
          <td class="auditMono">${when}</td>
          <td class="auditMono">${id}</td>
          <td>${resultBadge(e)}</td>
          <td class="auditMono">${user || "—"}</td>
          <td class="auditMono">${ip || "—"}</td>
          <td class="auditMono">${lt || "—"}</td>
          <td class="auditMono">${prov || "—"}</td>
          <td>
            <details>
              <summary class="muted">${msgShort || "(no message)"}</summary>
              ${parsed}
              <div class="auditMsg">${msg || ""}</div>
            </details>
          </td>
        </tr>`;
      })
      .join("");

    resultsEl.innerHTML = `
      <div class="auditTableWrap">
        <table class="auditTable" role="table" aria-label="Windows events">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>ID</th>
              <th>Result</th>
              <th>User</th>
              <th>IP</th>
              <th>LogonType</th>
              <th>Provider</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  const writeSnapshot = async () => {
    if (!state.lastQuery) {
      alert("Fetch events first, then write a snapshot.");
      return;
    }
    const nowUtc = new Date().toISOString();
    const runId = runIdFromUtcIso(nowUtc) || nowUtc.replace(/[:.]/g, "-");
    const outDir = `C:\\evidence\\CUI-Audit-Review-${runId}`;
    const jsonPath = `${outDir}\\windows-events.json`;
    const mdPath = `${outDir}\\windows-events.md`;
    const payload = {
      schema: "mactech.codex.manual.windows_event_review",
      version: 2,
      generated_utc: nowUtc,
      query: state.lastQuery,
      log: state.lastLog,
      count: state.lastEvents.length,
      events: state.lastEvents,
    };
    const md = [
      "# Windows Event Log review snapshot",
      "",
      `Generated (UTC): ${nowUtc}`,
      "",
      "## Query",
      "```",
      JSON.stringify(state.lastQuery, null, 2),
      "```",
      "",
      `## Results: ${state.lastEvents.length} event(s)`,
      "",
      `- JSON: \`${jsonPath}\``,
      `- Markdown: \`${mdPath}\``,
      "",
    ].join("\n");
    await fsWriteTextFile(jsonPath, JSON.stringify(payload, null, 2) + "\n");
    await fsWriteTextFile(mdPath, md + "\n");
    alert(`Wrote audit snapshot:\n${jsonPath}\n${mdPath}`);
  };

  if (btnPresetRdp) {
    btnPresetRdp.onclick = () => {
      applyPreset("rdp_logons", false);
      setStatus("Preset applied: RDP logons. Click Fetch events.");
    };
  }

  // Bind quick query buttons (data-audit-preset)
  try {
    document.querySelectorAll("button[data-audit-preset]").forEach((b) => {
      b.onclick = () => applyPreset(String(b.getAttribute("data-audit-preset") || "").trim(), true);
    });
  } catch {}
  if (btnFetch) {
    btnFetch.onclick = async () => {
      const q = buildQuery();
      setStatus("Fetching events…");
      resultsEl.innerHTML = "";
      try {
        const data = await fetchEvents(q);
        renderEvents(q, data.events || []);
        setStatus(`Fetched ${data.count || 0} event(s) from ${q.log}.`);
      } catch (e) {
        setStatus(`Fetch failed: ${e && e.message ? e.message : e}`);
        resultsEl.innerHTML = `<div class="list-empty">Fetch failed. Ensure the local server is running.</div>`;
      }
    };
  }
  if (btnWrite) {
    btnWrite.onclick = async () => {
      try {
        await writeSnapshot();
      } catch (e) {
        alert(`Write failed: ${e && e.message ? e.message : e}`);
      }
    };
  }
}

function initWinAvPanel() {
  const root = $("#avShell");
  if (!root) return;
  if (root.getAttribute("data-init") === "1") return;
  root.setAttribute("data-init", "1");

  const avMsgEl = $("#avActionStatus");
  const setAvMsg = (m) => {
    if (avMsgEl) avMsgEl.textContent = m ? String(m) : " ";
  };
  const debugEl = $("#avDebugOutput");
  const setDebug = (m) => {
    if (!debugEl) return;
    debugEl.textContent = m ? String(m) : "";
  };
  // Clear any stale debug from previous sessions.
  try {
    setDebug("");
  } catch {}

  const heroEl = $("#avHero");
  const overallTitleEl = $("#avOverallTitle");
  const overallPillEl = $("#avOverallPill");
  const overallSubEl = $("#avOverallSub");
  const rtpPillEl = $("#avRtpPill");
  const avPillEl = $("#avAvPill");
  const sigAgePillEl = $("#avSigAgePill");
  const sigLastUtcEl = $("#avSigLastUtc");
  const sigVerEl = $("#avSigVersion");
  const engineProductEl = $("#avEngineProduct");
  const quickAgeEl = $("#avQuickAgePill");
  const fullAgeEl = $("#avFullAgePill");

  const defenderEl = null; // legacy element removed in new AV UI
  const defenderTasksEl = $("#defenderTasks");
  const defenderHistoryEl = $("#defenderHistory");
  const defenderHistoryArchiveEl = $("#defenderHistoryArchive");
  const btnDefRefresh = $("#btnDefenderRefresh");
  const btnDefInstall = $("#btnDefenderInstallTasks");
  const btnDefRunRec = $("#btnDefenderRunRecommended");
  const btnDefRunSig = $("#btnDefenderRunSigUpdate");
  const btnDefRunQuick = $("#btnDefenderRunQuickScan");
  const btnDefRunFull = $("#btnDefenderRunFullScan");
  const btnDefOpenEv = $("#btnDefenderOpenEvidence");
  const btnDefOpenLatest = $("#btnDefenderOpenLatestEvidence");
  const btnDefViewArchive = $("#btnDefenderViewEvidenceArchive");
  const btnDefArchiveOld = $("#btnDefenderArchiveOldEvidence");

  const lastQuickResultEl = $("#avLastQuickResult");
  const lastFullResultEl = $("#avLastFullResult");
  const lastQuickMetaEl = $("#avLastQuickMeta");
  const lastFullMetaEl = $("#avLastFullMeta");
  const btnOpenLastQuick = $("#btnAvOpenLastQuickEvidence");
  const btnOpenLastFull = $("#btnAvOpenLastFullEvidence");

  const setBusy = (busy) => {
    const on = !!busy;
    const buttons = [
      btnDefRefresh,
      btnDefInstall,
      btnDefRunRec,
      btnDefRunSig,
      btnDefRunQuick,
      btnDefRunFull,
      btnDefOpenLatest,
      btnDefOpenEv,
    ].filter(Boolean);
    buttons.forEach((b) => {
      try {
        b.disabled = on;
      } catch {}
    });
  };

  const runState = {
    mode: "",
    startedAt: 0,
    timer: null,
  };
  const evState = {
    archiveOpen: false,
    lastLatestName: "",
    lastQuickManualUtc: "",
    lastFullManualUtc: "",
    lastQuickEvidencePath: "",
    lastFullEvidencePath: "",
  };
  const setScanResultCard = (mode, info) => {
    const isQuick = mode === "QuickScan";
    const rEl = isQuick ? lastQuickResultEl : lastFullResultEl;
    const mEl = isQuick ? lastQuickMetaEl : lastFullMetaEl;
    const bEl = isQuick ? btnOpenLastQuick : btnOpenLastFull;
    if (!rEl || !mEl || !bEl) return;
    if (!info) {
      rEl.innerHTML = `<span class="auditBadge warn">unknown</span>`;
      mEl.textContent = "";
      bEl.disabled = true;
      return;
    }
    const ok = info.ok === true;
    const sev = info.threats && info.threats.total ? Number(info.threats.total) : 0;
    const badge = ok ? `<span class="auditBadge good">OK</span>` : `<span class="auditBadge bad">FAILED</span>`;
    const threatPill = sev > 0 ? `<span class="auditBadge warn">${sev} detection(s)</span>` : `<span class="auditBadge good">No detections</span>`;
    rEl.innerHTML = `${badge} ${threatPill}`;
    const when = info.generatedUtc ? String(info.generatedUtc) : "";
    const dur = typeof info.durationSeconds === "number" && info.durationSeconds > 0 ? `${info.durationSeconds}s` : "";
    mEl.textContent = [when ? `UTC: ${when}` : "", dur ? `duration: ${dur}` : ""].filter(Boolean).join(" · ");
    bEl.disabled = !info.outDir;
    bEl.onclick = () => {
      const p = info.outDir;
      try {
        if (window && window.__fileModal && typeof window.__fileModal.openPath === "function") {
          window.__fileModal.openPath(p);
          return;
        }
      } catch {}
    };
  };

  const loadLatestScanResults = async () => {
    // Look for latest evidence runs by mode across active + archive.
    const candidates = [];
    try {
      const roots = ["C:\\evidence", "C:\\evidence\\archive\\defender"];
      for (const rootPath of roots) {
        let entries = [];
        try {
          entries = await fsListDir(rootPath);
        } catch {
          continue;
        }
        const dirs = (entries || [])
          .filter((e) => e && e.kind === "dir" && String(e.name || "").indexOf("CUI-Defender-Maintenance-") === 0)
          .map((e) => ({ name: String(e.name || ""), fullPath: String(e.fullPath || "") }))
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, 18);
        candidates.push(...dirs);
      }
    } catch {}

    const best = { QuickScan: null, FullScan: null };
    for (const d of candidates) {
      if (!d || !d.fullPath) continue;
      let txt = "";
      try {
        txt = await fsReadTextFile(`${d.fullPath}\\defender-maintenance.json`);
      } catch {
        continue;
      }
      let obj = null;
      try {
        obj = JSON.parse(String(txt || ""));
      } catch {
        continue;
      }
      const mode = obj && obj.mode ? String(obj.mode) : "";
      if (mode !== "QuickScan" && mode !== "FullScan") continue;
      if (best[mode]) continue;
      const threats = (obj && obj.threat_detection && obj.threat_detection.summary) || {};
      const dur = obj && obj.action && typeof obj.action.duration_seconds === "number" ? obj.action.duration_seconds : null;
      best[mode] = {
        ok: true,
        outDir: d.fullPath,
        generatedUtc: obj.generated_utc || "",
        durationSeconds: dur,
        threats: threats,
      };
      if (best.QuickScan && best.FullScan) break;
    }

    setScanResultCard("QuickScan", best.QuickScan);
    setScanResultCard("FullScan", best.FullScan);
  };

  const fmtElapsed = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}m ${r}s`;
  };

  const setRunningToast = () => {
    if (!runState.mode || !runState.startedAt) return;
    const elapsed = fmtElapsed(Date.now() - runState.startedAt);
    setAvMsg(`Running ${runState.mode}… elapsed ${elapsed}.`);
  };

  const readJsonSafe = async (resp) => {
    // Fetch may return non-JSON on failures; always capture text.
    let text = "";
    try {
      text = await resp.text();
    } catch {}
    try {
      if (!text) return {};
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  const setHeroState = (level) => {
    if (!heroEl) return;
    heroEl.classList.remove("good", "warn", "bad");
    heroEl.classList.add(level === "bad" ? "bad" : level === "warn" ? "warn" : "good");
  };

  const setOverall = (title, level, sub) => {
    if (overallTitleEl) overallTitleEl.textContent = title ? String(title) : "";
    if (overallPillEl) overallPillEl.innerHTML = `<span class="auditBadge ${level || "good"}">${esc(level === "bad" ? "Not protected" : level === "warn" ? "At risk" : "Protected")}</span>`;
    if (overallSubEl) overallSubEl.textContent = sub ? String(sub) : "";
    setHeroState(level);
  };

  const refreshDefender = async () => {
    try {
      // Refresh is a "read" action; clear debug so users don't misinterpret old errors.
      setDebug("");
      const resp = await fetch("/__defender", { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok || !data || data.error) throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`);
      const s = data.status || {};

      const rtp = !!s.RealTimeProtectionEnabled;
      const avOn = !!s.AntivirusEnabled;
      const sigAge = typeof s.AntivirusSignatureAge === "number" ? s.AntivirusSignatureAge : parseInt(String(s.AntivirusSignatureAge || ""), 10);
      const sigLast = s.AntivirusSignatureLastUpdated || "";
      const ok = rtp && avOn && isFinite(sigAge) && sigAge <= 3;
      const level = !rtp || !avOn ? "bad" : ok ? "good" : "warn";

      if (rtpPillEl) rtpPillEl.innerHTML = fmtBoolPill(rtp);
      if (avPillEl) avPillEl.innerHTML = fmtBoolPill(avOn);
      if (sigAgePillEl) sigAgePillEl.innerHTML = fmtAgePill(sigAge);
      if (sigLastUtcEl) sigLastUtcEl.textContent = sigLast ? String(sigLast) : "—";
      if (sigVerEl) sigVerEl.textContent = s.AntivirusSignatureVersion ? String(s.AntivirusSignatureVersion) : "—";
      if (engineProductEl) {
        const eng = s.EngineVersion ? String(s.EngineVersion) : "—";
        const prod = s.AMProductVersion ? String(s.AMProductVersion) : "—";
        engineProductEl.textContent = `${eng} / ${prod}`;
      }
      if (quickAgeEl) quickAgeEl.innerHTML = fmtAgePill(s.QuickScanAge);
      if (fullAgeEl) fullAgeEl.innerHTML = fmtAgePill(s.FullScanAge);

      const sub =
        level === "good"
          ? "Defender is enabled and signatures are fresh."
          : level === "warn"
            ? "Defender is enabled, but signatures may be stale. Run an update to generate evidence."
            : "Defender does not look enabled (or real-time protection is off). Investigate before assessment.";
      setOverall(level === "bad" ? "Action required" : level === "warn" ? "Needs attention" : "Protected", level, sub);

      setAvMsg("Status refreshed.");
    } catch (e) {
      setOverall("Unknown", "warn", "Failed to load Defender status from this VM.");
      setAvMsg("Status refresh failed.");
      setDebug(String(e && e.message ? e.message : e));
    }
  };

  const refreshDefenderTasks = async () => {
    if (!defenderTasksEl) return;
    defenderTasksEl.textContent = "Loading scheduled task status…";
    try {
      const resp = await fetch("/__defender_tasks", { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok || !data || data.error) throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`);
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (!tasks.length) {
        defenderTasksEl.textContent = "No task status returned.";
        return;
      }
      const meta = {
        Codex_Defender_SignatureUpdate: { title: "Signature updates (weekly)", desc: "Forces signature update and writes evidence." },
        Codex_Defender_QuickScan: { title: "Quick scan (weekly)", desc: "Runs quick scan and writes evidence." },
        Codex_Defender_FullScan: { title: "Full scan (monthly)", desc: "Runs full scan and writes evidence (longer runtime)." },
      };

      const rows = tasks
        .map((t) => {
          const name = t && t.name ? String(t.name) : "(task)";
          const mm = meta[name] || { title: name, desc: "" };
          if (!t || t.installed !== true) {
            return `<div class="av-taskRow">
              <div class="name">${esc(mm.title)}</div>
              ${mm.desc ? `<div class="faint" style="margin-top:6px">${esc(mm.desc)}</div>` : ""}
              <div class="meta"><span class="auditBadge bad">NOT INSTALLED</span></div>
            </div>`;
          }
          const st = t.status ? String(t.status) : "?";
          const lastRaw = t.lastRunTime ? String(t.lastRunTime) : "";
          const last = !lastRaw || lastRaw.indexOf("1999") >= 0 ? "(never scheduled run yet)" : lastRaw;
          const next = t.nextRunTime ? String(t.nextRunTime) : "(unknown)";
          const resRaw = t.lastResult ? String(t.lastResult) : "";
          const resNote = resRaw === "267011" ? "never ran yet (267011)" : resRaw && resRaw !== "0" ? `lastResult=${resRaw}` : "";
          const badgeCls = st.toLowerCase().indexOf("ready") >= 0 ? "good" : "warn";
          return `<div class="av-taskRow">
            <div class="name">${esc(mm.title)}</div>
            ${mm.desc ? `<div class="faint" style="margin-top:6px">${esc(mm.desc)}</div>` : ""}
            <div class="meta">
              <span class="auditBadge ${badgeCls}">${esc(st)}</span>
              <span class="mono faint">last:</span> <span class="mono">${esc(last)}</span>
              <span class="mono faint">next:</span> <span class="mono">${esc(next)}</span>
              ${resNote ? `<span class="mono faint">${esc(resNote)}</span>` : ""}
            </div>
          </div>`;
        })
        .join("");
      defenderTasksEl.innerHTML = `<div class="av-taskListInner">${rows}</div>`;
    } catch (e) {
      defenderTasksEl.textContent = `Failed to load scheduled task status: ${e && e.message ? e.message : e}`;
    }
  };

  const tryExtractUtcFromEvidenceJson = (txt) => {
    try {
      const obj = JSON.parse(String(txt || ""));
      const utc = obj && (obj.generated_utc || (obj.status && obj.status.AntivirusSignatureLastUpdatedUtc) || (obj.action && obj.action.ended_utc));
      return utc ? String(utc) : "";
    } catch {
      return "";
    }
  };

  const tryExtractModeFromEvidenceJson = (txt) => {
    try {
      const obj = JSON.parse(String(txt || ""));
      const mode = obj && obj.mode ? String(obj.mode) : "";
      return mode;
    } catch {
      return "";
    }
  };

  const refreshDefenderHistory = async () => {
    if (!defenderHistoryEl) return;
    defenderHistoryEl.innerHTML = "";
    if (defenderHistoryArchiveEl) defenderHistoryArchiveEl.innerHTML = "";
    try {
      const entries = await fsListDir("C:\\evidence");
      const dirs = (entries || [])
        .filter((e) => e && e.kind === "dir" && String(e.name || "").indexOf("CUI-Defender-Maintenance-") === 0)
        .map((e) => ({ name: String(e.name || ""), fullPath: String(e.fullPath || "") }))
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 30);
      if (!dirs.length) {
        defenderHistoryEl.innerHTML = `<div class="list-empty">No evidence runs yet. Use “Run Smart Scan” above to generate an assessor-ready evidence folder.</div>`;
        return;
      }
      const mkRow = (d) => {
        const safe = esc(d.name);
        const p = esc(d.fullPath);
        return `<div class="av-evRow">
          <div class="left">
            <div class="title">${safe}</div>
            <div class="path mono">${p}</div>
          </div>
          <div class="right">
            <button class="btn btn-secondary" data-open-def-evidence="${esc(d.fullPath)}">Open</button>
          </div>
        </div>`;
      };

      // Latest only (default)
      defenderHistoryEl.innerHTML = mkRow(dirs[0]);
      evState.lastLatestName = dirs[0] && dirs[0].name ? String(dirs[0].name) : "";

      // Archive is hidden by default and lives in a separate folder under C:\evidence\archive\defender.
      if (defenderHistoryArchiveEl) {
        // Show contents of archive folder, not older entries from root.
        let archEntries = [];
        try {
          archEntries = await fsListDir("C:\\evidence\\archive\\defender");
        } catch {
          archEntries = [];
        }
        const archDirs = (archEntries || [])
          .filter((e) => e && e.kind === "dir" && String(e.name || "").indexOf("CUI-Defender-Maintenance-") === 0)
          .map((e) => ({ name: String(e.name || ""), fullPath: String(e.fullPath || "") }))
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, 50);
        defenderHistoryArchiveEl.innerHTML = archDirs.map(mkRow).join("") || `<div class="list-empty">Archive is empty.</div>`;
        defenderHistoryArchiveEl.classList.toggle("hidden", !evState.archiveOpen);
        if (btnDefViewArchive) btnDefViewArchive.textContent = evState.archiveOpen ? "Hide archive" : `View archive (${archDirs.length})`;
      }

      const bindOpenButtons = (rootEl) => {
        if (!rootEl) return;
        rootEl.querySelectorAll("button[data-open-def-evidence]").forEach((b) => {
          b.onclick = () => {
            const p = b.getAttribute("data-open-def-evidence");
            try {
              if (window && window.__fileModal && typeof window.__fileModal.openPath === "function") {
                window.__fileModal.openPath(p);
                return;
              }
            } catch {}
            try {
              const rootBtn = document.getElementById("btnOpenEvidenceRoot");
              if (rootBtn && rootBtn.click) rootBtn.click();
            } catch {}
          };
        });
      };
      bindOpenButtons(defenderHistoryEl);
      bindOpenButtons(defenderHistoryArchiveEl);

      // Best-effort: derive "last manual run" times from recent evidence JSON.
      try {
        let quickUtc = "";
        let fullUtc = "";
        for (const d of dirs.slice(0, 12)) {
          const jsonPath = `${d.fullPath}\\defender-maintenance.json`;
          const txt = await fsReadTextFile(jsonPath);
          const mode = tryExtractModeFromEvidenceJson(txt);
          const utc = tryExtractUtcFromEvidenceJson(txt);
          if (!utc) continue;
          if (!quickUtc && mode === "QuickScan") quickUtc = utc;
          if (!fullUtc && mode === "FullScan") fullUtc = utc;
          if (quickUtc && fullUtc) break;
        }
        evState.lastQuickManualUtc = quickUtc;
        evState.lastFullManualUtc = fullUtc;
      } catch {}
    } catch (e) {
      defenderHistoryEl.innerHTML = `<div class="list-empty">Failed to list C:\\evidence: ${esc(e && e.message ? e.message : e)}</div>`;
    }
  };

  const runDefender = async (mode) => {
    const m = String(mode || "").trim();
    if (!m) return { ok: false, error: "missing mode" };
    if (defenderEl) defenderEl.textContent = `Running: ${m}…`;
    try {
      setBusy(true);
      runState.mode = m;
      runState.startedAt = Date.now();
      if (runState.timer) clearInterval(runState.timer);
      runState.timer = setInterval(setRunningToast, 1000);
      setRunningToast();
      const resp = await fetch("/__defender_run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: m }),
      });
      const data = await readJsonSafe(resp);
      if (data && data.output) setDebug(String(data.output));
      if (!resp.ok || !data || data.error) throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`);
      const outDir = data.outDir ? String(data.outDir) : "";
      const runId = data.runId ? String(data.runId) : "";

      // Async scan runs: poll for completion so the UI can show progress.
      if (data.async === true && runId) {
        setAvMsg(`Started ${m}. Tracking run ${runId}…`);
        const statusUrl = `/__defender_run_status?runId=${encodeURIComponent(runId)}`;
        const t0 = Date.now();
        const maxMs = m === "FullScan" ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000; // 6h for full, 1h otherwise
        while (Date.now() - t0 < maxMs) {
          await new Promise((r) => setTimeout(r, 2000));
          setRunningToast();
          let sresp;
          try {
            sresp = await fetch(statusUrl, { cache: "no-store" });
          } catch {
            continue;
          }
          const sdata = await readJsonSafe(sresp);
          if (!sresp.ok || !sdata) continue;
          if (sdata.finished === true) {
            const fin = sdata.data || {};
            const ok = fin.ok === true || fin.exitCode === 0;
            // Try to read run log (if present) for verbose output.
            try {
              const log = await fsReadTextFile(`${outDir}\\run.log`);
              if (log) setDebug(String(log));
            } catch {}
            setAvMsg(ok ? `Completed ${m}. Evidence: ${outDir || "(unknown)"}` : `Failed ${m}. Evidence: ${outDir || "(unknown)"}`);
            await refreshDefender();
            await refreshDefenderTasks();
            await refreshDefenderHistory();
            return { ok, outDir, runId, mode: m, async: true };
          }
        }
        setAvMsg(`Still running ${m} (run ${runId}). If this persists, check the evidence folder and run log.`);
        return { ok: true, outDir, runId, mode: m, async: true };
      }
      setAvMsg(`Completed ${m}. Evidence: ${outDir || "(unknown)"}`);
      await refreshDefender();
      await refreshDefenderTasks();
      await refreshDefenderHistory();
      return { ok: true, outDir, runId, mode: m, async: false };
    } catch (e) {
      // If fetch failed before we could read a response body, capture the JS error.
      if (String(debugEl && debugEl.textContent ? debugEl.textContent : "").trim().length === 0) {
        setDebug(String(e && e.message ? e.message : e));
      }
      setAvMsg(`Run failed: ${e && e.message ? e.message : e}`);
      try {
        await refreshDefender();
      } catch {}
      return { ok: false, error: String(e && e.message ? e.message : e), mode: m };
    } finally {
      try {
        if (runState.timer) clearInterval(runState.timer);
      } catch {}
      runState.timer = null;
      runState.mode = "";
      runState.startedAt = 0;
      setBusy(false);
    }
  };

  const openLatestEvidence = async () => {
    try {
      const entries = await fsListDir("C:\\evidence");
      const dirs = (entries || [])
        .filter((e) => e && e.kind === "dir" && String(e.name || "").indexOf("CUI-Defender-Maintenance-") === 0)
        .map((e) => ({ name: String(e.name || ""), fullPath: String(e.fullPath || "") }))
        .sort((a, b) => b.name.localeCompare(a.name));
      const latest = dirs.length ? dirs[0] : null;
      if (!latest) {
        setAvMsg("No Defender evidence runs found yet.");
        setDebug("No CUI-Defender-Maintenance-* directories found under C:\\evidence.");
        return;
      }
      try {
        if (window && window.__fileModal && typeof window.__fileModal.openPath === "function") {
          window.__fileModal.openPath(latest.fullPath);
          return;
        }
      } catch {}
      // Fallback: open evidence root
      try {
        const rootBtn = document.getElementById("btnOpenEvidenceRoot");
        if (rootBtn && rootBtn.click) rootBtn.click();
      } catch {}
    } catch (e) {
      setAvMsg("Failed to locate latest evidence.");
      setDebug(String(e && e.message ? e.message : e));
    }
  };

  const downloadDefenderInstallLauncher = () => {
    const script = "C:\\Codex\\TRUST_CODEX\\vm-scripts\\Install-DefenderMaintenanceTasks.ps1";
    const inner = buildElevatedInnerForScripts([script], "Install Defender belt+suspenders scheduled tasks");
    const cmdFile = buildRunElevatedCmdFile(inner, "Codex - Install Defender tasks", "C:\\Codex\\TRUST_CODEX");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadText(`codex-install-defender-tasks-${ts}.cmd`, cmdFile, "text/plain; charset=utf-8");
    alert("Downloaded installer (.cmd). Run it on the VM (UAC prompt) to enable weekly defs updates + routine scans.");
  };

  const installTasks = async () => {
    // Preferred: run install from local server (SYSTEM). Fallback: download elevated launcher.
    try {
      setBusy(true);
      setAvMsg("Installing weekly Defender maintenance tasks…");
      const resp = await fetch("/__defender_install_tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await readJsonSafe(resp);
      if (data && data.output) setDebug(String(data.output));
      if (!resp.ok || !data || data.error) throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`);
      if (data.output) setDebug(String(data.output));
      setAvMsg("Tasks installed/refreshed.");
      await refreshDefenderTasks();
      return;
    } catch (e) {
      if (String(debugEl && debugEl.textContent ? debugEl.textContent : "").trim().length === 0) {
        setDebug(String(e && e.message ? e.message : e));
      }
      setAvMsg("Couldn't install tasks automatically; downloaded elevated installer instead.");
      downloadDefenderInstallLauncher();
    } finally {
      setBusy(false);
    }
  };

  if (btnDefRefresh) btnDefRefresh.onclick = () => refreshDefender();
  if (btnDefInstall) btnDefInstall.onclick = () => installTasks();
  if (btnDefRunRec)
    btnDefRunRec.onclick = async () => {
      try {
        setAvMsg("Running recommended evidence: signature update → quick scan…");
        const r1 = await runDefender("SignatureUpdate");
        if (!r1 || r1.ok !== true) {
          setAvMsg("Recommended evidence stopped: Signature update failed.");
          return;
        }
        const r2 = await runDefender("QuickScan");
        if (!r2 || r2.ok !== true) {
          setAvMsg("Recommended evidence partial: Quick scan failed.");
          return;
        }
        setAvMsg("Recommended evidence completed (signature update + quick scan).");
      } catch (e) {
        setAvMsg(`Recommended run failed: ${e && e.message ? e.message : e}`);
      }
    };
  if (btnDefRunSig) btnDefRunSig.onclick = () => runDefender("SignatureUpdate");
  if (btnDefRunQuick) btnDefRunQuick.onclick = () => runDefender("QuickScan");
  if (btnDefRunFull) btnDefRunFull.onclick = () => runDefender("FullScan");
  if (btnDefOpenLatest) btnDefOpenLatest.onclick = () => openLatestEvidence();
  if (btnDefOpenEv)
    btnDefOpenEv.onclick = () => {
      try {
        const rootBtn = document.getElementById("btnOpenEvidenceRoot");
        if (rootBtn && rootBtn.click) rootBtn.click();
      } catch {}
    };

  if (btnDefViewArchive && defenderHistoryArchiveEl) {
    btnDefViewArchive.onclick = () => {
      evState.archiveOpen = !evState.archiveOpen;
      defenderHistoryArchiveEl.classList.toggle("hidden", !evState.archiveOpen);
      // refresh will update button label with archive count
      try {
        refreshDefenderHistory();
      } catch {}
    };
  }

  if (btnDefArchiveOld) {
    btnDefArchiveOld.onclick = async () => {
      try {
        setAvMsg("Archiving older evidence…");
        setDebug("");
        const resp = await fetch("/__defender_archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep: 1 }) });
        const data = await readJsonSafe(resp);
        if (!resp.ok || !data || data.error) throw new Error((data && (data.message || data.error)) || `HTTP ${resp.status}`);
        setAvMsg("Archived older evidence.");
        await refreshDefenderHistory();
        await loadLatestScanResults();
      } catch (e) {
        setAvMsg("Archive failed.");
        setDebug(String(e && e.message ? e.message : e));
      }
    };
  }

  try {
    refreshDefender();
    refreshDefenderTasks();
    refreshDefenderHistory();
    loadLatestScanResults();
  } catch {}
}

function setupFileModal() {
  const modal = $("#fileModal");
  const backdrop = $("#fileBackdrop");
  const btnClose = $("#btnFileClose");
  const btnExplorer = $("#btnFileOpenExplorer");
  const fileTitle = $("#fileTitle");
  const fileSubtitle = $("#fileSubtitle");
  const dirList = $("#fileDirList");
  const fileBody = $("#fileBody");
  const fileSearch = $("#fileSearch");
  const btnTop = $("#btnFileTop");

  let currentPath = null;
  let currentText = "";

  function openModal() {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  backdrop.addEventListener("click", closeModal);
  btnClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeModal();
  });

  btnTop.addEventListener("click", () => {
    try {
      fileBody.parentElement.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      fileBody.parentElement.scrollTop = 0;
    }
  });

  btnExplorer.addEventListener("click", () => {
    if (!currentPath) return;
    // Best-effort: open file:// link (browser policy may block; still useful on many Windows setups)
    const url = "file:///" + currentPath.replace(/\\/g, "/");
    openInNewTab(url);
  });

  function renderDir(entries) {
    dirList.innerHTML = "";
    for (const e of entries || []) {
      const a = document.createElement("a");
      a.href = "#";
      a.className = "nav-item";
      a.textContent = `${e.kind === "dir" ? "📁 " : "📄 "}${e.name}`;
      a.onclick = (ev) => {
        ev.preventDefault();
        if (e.fullPath) openPath(e.fullPath);
      };
      dirList.appendChild(a);
    }
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return esc(text).replace(re, (m) => `<mark>${m}</mark>`);
  }

  async function openPath(path) {
    openModal();
    currentPath = path;
    fileTitle.textContent = path;
    fileSubtitle.textContent = "Evidence Viewer";
    fileSearch.value = "";
    fileBody.textContent = "Loading…";
    dirList.innerHTML = "";
    currentText = "";

    const url = `/__fs?path=${encodeURIComponent(path)}`;
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) {
        // Fallback: if the server doesn't implement /__fs, try a static mirror under TRUST_CODEX/_evidence.
        if (resp.status === 404) {
          const win = String(path || "");
          const m = win.match(/^[A-Za-z]:\\evidence\\(.*)$/i);
          if (m) {
            const rel = m[1].replace(/\\/g, "/");
            const mirrorUrl = `/_evidence/${rel}`;
            try {
              const r2 = await fetch(mirrorUrl, { cache: "no-store" });
              if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
              const ct = r2.headers.get("content-type") || "";
              fileSubtitle.textContent = `mirror: ${ct}`;
              const text = await r2.text();
              currentText = text;
              if (ct.includes("application/json") || mirrorUrl.toLowerCase().endsWith(".json")) {
                try {
                  currentText = JSON.stringify(JSON.parse(text), null, 2);
                } catch {
                  // keep raw
                }
              }
              fileBody.textContent = currentText;
              return;
            } catch (e2) {
              fileBody.textContent =
                `This environment isn't serving evidence files yet.\n\n` +
                `Tried API: ${url}\n` +
                `Tried mirror: /_evidence (expected file: ${mirrorUrl})\n\n` +
                `To enable mirror mode: copy/sync C:\\evidence into C:\\CODEX\\TRUST_CODEX\\_evidence.\n` +
                `Error: ${e2 && e2.message ? e2.message : e2}`;
              return;
            }
          }
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const obj = await resp.json();

      if (obj.kind === "dir") {
        fileSubtitle.textContent = "Directory listing";
        renderDir(obj.entries || []);
        fileBody.textContent = `Directory: ${obj.path}\n\nClick an entry to open it.`;
        return;
      }

      if (obj.kind === "file") {
        renderDir([]); // leave empty by default for files
        const ct = obj.contentType || "";
        fileSubtitle.textContent = `${ct} · ${(obj.size === null || obj.size === undefined) ? "" : obj.size} bytes`;
        if (typeof obj.textContent === "string") {
          currentText = obj.textContent;
          if (ct.includes("application/json")) {
            try {
              const parsed = JSON.parse(obj.textContent);
              currentText = JSON.stringify(parsed, null, 2);
            } catch {
              // keep raw
            }
          }
          fileBody.textContent = currentText + (obj.truncated ? "\n\n[preview truncated]" : "");
        } else {
          fileBody.textContent =
            `Binary or non-previewable file.\n\nPath: ${obj.path}\nContent-Type: ${ct}\nSize: ${obj.size} bytes`;
        }
        return;
      }

      fileBody.textContent = "Unknown response.";
    } catch (err) {
      fileBody.textContent = `Failed to open: ${path}\n\n${err && err.message ? err.message : err}`;
    }
  }

  fileSearch.addEventListener("input", () => {
    const q = normalize(fileSearch.value);
    if (!currentText) return;
    if (!q) {
      fileBody.textContent = currentText;
      return;
    }
    fileBody.innerHTML = highlight(currentText, q);
  });

  return { openPath, close: closeModal };
}

function extractEvidencePaths(text) {
  const t = String(text || "");
  const out = [];

  // Special-case: "...\\validation-report.txt/json" -> two paths
  const special = /([A-Za-z]:\\[^\s"'<>]+?)\.txt\/json\b/g;
  let m;
  while ((m = special.exec(t)) !== null) {
    const base = m[1];
    out.push({ start: m.index, end: m.index + m[0].length, paths: [`${base}.txt`, `${base}.json`], label: m[0] });
  }

  const re = /[A-Za-z]:\\[^\s"'<>]+/g;
  while ((m = re.exec(t)) !== null) {
    const raw = m[0];
    // strip trailing punctuation
    const cleaned = raw.replace(/[)\].,;:]+$/g, "");
    out.push({ start: m.index, end: m.index + raw.length, paths: [cleaned], label: cleaned });
  }

  // de-dup overlaps by preferring special-case spans
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  let lastEnd = -1;
  for (const r of out) {
    if (r.start < lastEnd) continue;
    merged.push(r);
    lastEnd = r.end;
  }
  return merged;
}

function renderTextWithEvidenceLinks(el, text, fileModal) {
  el.innerHTML = "";
  const t = String(text || "");
  const ranges = extractEvidencePaths(t);
  if (!ranges.length) {
    el.textContent = t;
    return;
  }

  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) el.appendChild(document.createTextNode(t.slice(cursor, r.start)));

    if (r.paths.length === 1) {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = r.label;
      a.onclick = (e) => {
        e.preventDefault();
        fileModal.openPath(r.paths[0]);
      };
      el.appendChild(a);
    } else {
      // render as "label (open .txt | open .json)"
      const span = document.createElement("span");
      span.appendChild(document.createTextNode(r.label + " ("));
      r.paths.forEach((p, idx) => {
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = p.toLowerCase().endsWith(".json") ? "json" : "txt";
        a.onclick = (e) => {
          e.preventDefault();
          fileModal.openPath(p);
        };
        span.appendChild(a);
        if (idx < r.paths.length - 1) span.appendChild(document.createTextNode(" | "));
      });
      span.appendChild(document.createTextNode(")"));
      el.appendChild(span);
    }

    cursor = r.end;
  }
  if (cursor < t.length) el.appendChild(document.createTextNode(t.slice(cursor)));
}

function renderCmmcIntroBreakdown(controlsAll) {
  const el = $("#onbWideIntro");
  if (!el) return;

  const ctrls = (controlsAll || []).filter((c) => c && c.control_id);
  const total = ctrls.length;

  const norm = (s) => normalize(s);
  const cls = (c) => norm(c.classification).toLowerCase();

  const isNa = (c) => cls(c).includes("not applicable") || cls(c) === "n/a" || cls(c) === "na";
  const isGov = (c) => cls(c).includes("governance");
  const isInherited = (c) => cls(c).includes("inherited");
  const isEnclave = (c) => cls(c).includes("system-enforced");

  const count = (pred) => ctrls.filter(pred).length;
  const nEnclave = count(isEnclave);
  const nGov = count(isGov);
  const nInherited = count(isInherited);
  const nNa = count(isNa);

  el.innerHTML = `
    <div class="onb-wideGrid">
      <div>
        <div class="onb-wideTitle">Enclave (Windows VM) — CMMC Accelerator</div>
        <div class="onb-wideSub">
          This VM is a controlled workspace intended to help you <b>maintain CUI handling requirements</b> by producing repeatable,
          auditor-defensible evidence for <b>NIST SP 800-171 Rev.2 (CMMC Level 2)</b>.
        </div>
        <ul class="onb-wideList">
          <li><b>Technical evidence</b>: run read-only collectors to generate artifacts under <span class="mono">C:\\evidence</span>.</li>
          <li><b>Governance evidence</b>: review + sign Policies/SOPs on cadence; export governance signoff artifacts.</li>
          <li><b>You are the Attestee</b>: the system owner signs and owns compliance for this enclave deployment.</li>
        </ul>
      </div>

      <div class="onb-breakdown">
        <div class="k">Controls in this accelerator (${total || 110})</div>
        <div class="v">
          <div><b>Enclave Configuration</b>: ${nEnclave}</div>
          <div><b>Governance (Policies/SOPs + records)</b>: ${nGov}</div>
          <div><b>Inherited</b>: ${nInherited}</div>
          <div><b>N/A (documented)</b>: ${nNa}</div>
        </div>
        <div class="goal">
          Goal: <b>110/110 adjudicated</b>. Inherited and N/A still require adjudication (SRM boundary evidence or documented justification).
        </div>
      </div>
    </div>
  `;
}

function extractPs1Paths(text) {
  const t = String(text || "");
  const out = [];
  const re = /[A-Za-z]:\\[^\s"'<>]+?\.ps1\b/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const raw = m[0];
    const cleaned = raw.replace(/[)\].,;:]+$/g, "");
    out.push(cleaned);
  }
  // unique, preserve order
  const seen = new Set();
  const uniq = [];
  for (const p of out) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  return uniq;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    // fallback for older browsers
    const ta = document.createElement("textarea");
    ta.value = String(text);
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      ta.remove();
      return false;
    }
  }
}

function _lv(shell, command, expected) {
  const s = normalize(shell) || "powershell";
  const cmd = normalize(command);
  if (!cmd) return null;
  return { shell: s, command: cmd, expected: normalize(expected || "") };
}

function getLiveValidationCommand(nistReqId) {
  const id = normalize(nistReqId);
  if (!id) return null;

  // Windows enclave (RDP restrictions, logging, portable media)
  if (id === "3.1.3") {
    return _lv(
      "powershell",
      [
        "# 3.1.3 – Control flow of CUI (enclave egress controls)",
        "# RDP redirection restrictions (clipboard/drives/printers/etc.)",
        'Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" | Select-Object *Disable*',
        "",
        "# Removable storage restrictions (USBSTOR disabled + RemovableStorageDevices deny-all)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" -Name Start | Format-List',
        'Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices" -ErrorAction SilentlyContinue | Format-List',
      ].join("\n"),
      "Expect RDP redirection disable flags set (e.g., fDisableCdm/fDisableClip) and removable storage deny-all / USBSTOR disabled."
    );
  }

  if (id === "3.1.11") {
    return _lv(
      "powershell",
      [
        "# 3.1.11 – Automatic session termination (remote session limits)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" | Select-Object MaxIdleTime,MaxDisconnectionTime,MaxConnectionTime | Format-List',
      ].join("\n"),
      "Expect MaxIdleTime / MaxDisconnectionTime / MaxConnectionTime set per enclave baseline (e.g., 15m idle, 5m disconnect, 8h max)."
    );
  }

  if (id === "3.1.12") {
    return _lv(
      "powershell",
      [
        "# 3.1.12 – Monitor remote access (Security log sampling)",
        '$filter = @{ LogName = "Security"; Id = 4624, 4625 }',
        "Get-WinEvent -FilterHashtable $filter -MaxEvents 50 |",
        '  Select-Object TimeCreated, Id, ProviderName, @{n="Account";e={$_.Properties[5].Value}}, @{n="LogonType";e={$_.Properties[8].Value}} |',
        "  Format-Table -AutoSize",
      ].join("\n"),
      "Expect 4624/4625 events present for interactive/remote logons; assessor can sample timestamps/accounts."
    );
  }

  if (id === "3.1.13") {
    return _lv(
      "powershell",
      [
        "# 3.1.13 – Cryptographic remote access (RDP NLA/TLS/encryption)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" |',
        "  Select-Object UserAuthentication, SecurityLayer, MinEncryptionLevel |",
        "  Format-List",
      ].join("\n"),
      "Expect UserAuthentication=1 (NLA), SecurityLayer=2 (TLS), MinEncryptionLevel=3 (High)."
    );
  }

  if (id === "3.1.14") {
    return _lv(
      "azure-cli",
      [
        "# 3.1.14 – Managed access control points (VPN + RDP; NSG / access path)",
        "# Requires Azure CLI login (az login) and correct subscription context.",
        'az network nsg rule list --nsg-name "<nsgName>" --resource-group "<rg>" -o table',
        "# VM: RDP allowed only from VPN/subnet; no direct internet RDP.",
      ].join("\n"),
      "Expect NSG rules restrict RDP to VPN/jump subnet; no public RDP. VPN + RDP is the managed access path."
    );
  }

  if (id === "3.1.21") {
    return _lv(
      "powershell",
      [
        "# 3.1.21 – Limit portable storage (technical enforcement)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" -Name Start | Format-List',
        'Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices" -ErrorAction SilentlyContinue | Format-List',
      ].join("\n"),
      "Expect USBSTOR Start=4 (disabled) and RemovableStorageDevices deny-all policy present."
    );
  }

  // Audit and accountability (Windows event log settings, time sync)
  if (id === "3.3.1") {
    return _lv(
      "powershell",
      ['# 3.3.1 – Create and retain audit logs (Windows log settings snapshot)', 'wevtutil gl Security | Select-String "retention|maxSize|logFileName"'].join("\n"),
      "Expect Security log configured with sufficient max size and retention behavior per baseline."
    );
  }
  if (id === "3.3.7") {
    return _lv("powershell", ["# 3.3.7 – System clock synchronization", "w32tm /query /status"].join("\n"), "Expect clock source/time sync status healthy; timestamps align with audit logs.");
  }

  // CUI at rest (BitLocker)
  if (id === "3.13.16") {
    return _lv(
      "powershell",
      ["# 3.13.16 – Protect CUI at rest (BitLocker status)", "manage-bde -status C:", "manage-bde -status D:"].join("\n"),
      "Expect 100% encrypted and Protection Status = On for in-scope volumes."
    );
  }

  // SI controls commonly asked as “show me Defender posture”
  if (id === "3.14.2" || id === "3.14.5") {
    return _lv(
      "powershell",
      [
        `# ${id} – Malicious code protection / periodic & real-time scans`,
        "Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareEnabled,FullScanAge,QuickScanAge | Format-List",
      ].join("\n"),
      "Expect RealTimeProtectionEnabled=True and AntivirusEnabled=True."
    );
  }

  return null;
}

function getLiveValidationCommandForNistReqId(nistReqId) {
  const id = normalize(nistReqId || "");
  if (!id) return null;

  const PS = (command, expected) => ({ shell: "powershell", command: String(command || ""), expected: expected ? String(expected) : "" });
  const AZ = (command, expected) => ({ shell: "azure-cli", command: String(command || ""), expected: expected ? String(expected) : "" });

  // Access Control (Windows enclave)
  if (id === "3.1.3") {
    return PS(
      [
        "# 3.1.3 – Control flow of CUI (enclave egress controls)",
        "# RDP redirection restrictions (clipboard/drives/printers/etc.)",
        'Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" | Select-Object *Disable*',
        "",
        "# Removable storage restrictions (USBSTOR disabled + RemovableStorageDevices deny-all)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" -Name Start | Format-List',
        'Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices" -ErrorAction SilentlyContinue | Format-List',
      ].join("\n"),
      "Expect RDP redirection disable flags set (e.g., fDisableCdm/fDisableClip) and removable storage deny-all / USBSTOR disabled."
    );
  }

  if (id === "3.1.11") {
    return PS(
      [
        "# 3.1.11 – Automatic session termination (remote session limits)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" | Select-Object MaxIdleTime,MaxDisconnectionTime,MaxConnectionTime | Format-List',
      ].join("\n"),
      "Expect MaxIdleTime / MaxDisconnectionTime / MaxConnectionTime set per enclave baseline (e.g., 15m idle, 5m disconnect, 8h max)."
    );
  }

  if (id === "3.1.12") {
    return PS(
      [
        "# 3.1.12 – Monitor remote access (Security log sampling)",
        '$filter = @{ LogName = "Security"; Id = 4624, 4625 }',
        "Get-WinEvent -FilterHashtable $filter -MaxEvents 50 |",
        '  Select-Object TimeCreated, Id, ProviderName, @{n="Account";e={$_.Properties[5].Value}}, @{n="LogonType";e={$_.Properties[8].Value}} |',
        "  Format-Table -AutoSize",
      ].join("\n"),
      "Expect 4624/4625 events present for interactive/remote logons; assessor can sample timestamps/accounts."
    );
  }

  if (id === "3.1.13") {
    return PS(
      [
        "# 3.1.13 – Cryptographic remote access (RDP NLA/TLS/encryption)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" |',
        "  Select-Object UserAuthentication, SecurityLayer, MinEncryptionLevel |",
        "  Format-List",
      ].join("\n"),
      "Expect UserAuthentication=1 (NLA), SecurityLayer=2 (TLS), MinEncryptionLevel=3 (High)."
    );
  }

  if (id === "3.1.14") {
    return AZ(
      [
        "# 3.1.14 – Managed access control points (VPN + RDP; NSG / access path)",
        "# Requires Azure CLI login (az login) and correct subscription context.",
        'az network nsg rule list --nsg-name "<nsgName>" --resource-group "<rg>" -o table',
        "# VM: RDP allowed only from VPN/subnet; no direct internet RDP.",
      ].join("\n"),
      "Expect NSG rules restrict RDP to VPN/jump subnet; no public RDP. VPN + RDP is the managed access path."
    );
  }

  if (id === "3.1.21") {
    return PS(
      [
        "# 3.1.21 – Limit portable storage (technical enforcement)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" -Name Start | Format-List',
        'Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices" -ErrorAction SilentlyContinue | Format-List',
      ].join("\n"),
      "Expect USBSTOR Start=4 (disabled) and RemovableStorageDevices deny-all policy present."
    );
  }

  // Audit and accountability (Windows)
  if (id === "3.3.1") {
    return PS(
      ['# 3.3.1 – Create and retain audit logs (Windows log settings snapshot)', 'wevtutil gl Security | Select-String "retention|maxSize|logFileName"'].join("\n"),
      "Expect Security log configured with sufficient max size and retention behavior per baseline."
    );
  }

  if (id === "3.3.7") {
    return PS(["# 3.3.7 – System clock synchronization", "w32tm /query /status"].join("\n"), "Expect clock source/time sync status healthy; timestamps align with audit logs.");
  }

  // System & communications protection
  if (id === "3.13.8") {
    return PS(
      [
        "# 3.13.8 – Cryptographic mechanisms for CUI in transit (remote session crypto posture)",
        'Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" |',
        "  Select-Object UserAuthentication, SecurityLayer, MinEncryptionLevel |",
        "  Format-List",
      ].join("\n"),
      "Expect RDP session uses NLA+TLS and High encryption."
    );
  }

  // CUI at rest
  if (id === "3.13.16") {
    return PS(["# 3.13.16 – Protect CUI at rest (BitLocker status)", "manage-bde -status C:", "manage-bde -status D:"].join("\n"), "Expect 100% encrypted and Protection Status = On for in-scope volumes.");
  }

  // System and information integrity
  if (id === "3.14.2" || id === "3.14.5") {
    return PS(
      [
        `# ${id} – Malicious code protection / periodic & real-time scans`,
        "Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareEnabled,FullScanAge,QuickScanAge | Format-List",
      ].join("\n"),
      "Expect RealTimeProtectionEnabled=True and AntivirusEnabled=True."
    );
  }

  return null;
}

function psSingleQuote(s) {
  return "'" + String(s || "").replace(/'/g, "''") + "'";
}

function bytesToBase64Url(bytes) {
  try {
    let bin = "";
    for (const b of bytes || []) bin += String.fromCharCode(b);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    // Fallback: hex (still high entropy)
    const arr = Array.from(bytes || []);
    return arr.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
  }
}

function generateServiceToken() {
  // 32 bytes = 256-bit token
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

async function installServiceTokenToRepo(repoPath, token) {
  const rp = normalize(repoPath) || "C:\\Users\\admin_patrick\\mactech";
  const tok = normalize(token);
  if (!tok) throw new Error("Token is empty.");

  const secretsDir = `${rp}\\\.secrets`;
  const secretsFile = `${secretsDir}\\codex_manual_service_token`;
  const evidenceTokenFile = "C:\\evidence\\codex_manual_service_token.txt";

  // Always try to write a copy under EvidenceRoot so the Manual can load it
  // without broad filesystem access (the local server only permits /__fs under C:\evidence).
  try {
    await fsWriteTextFile(evidenceTokenFile, tok + "\n");
  } catch {}

  // Try direct write (requires manual opened via local server with /__fs enabled).
  try {
    await fsWriteTextFile(`${secretsDir}\\_keep.txt`, "keep\n");
    await fsWriteTextFile(secretsFile, tok + "\n");
    return { ok: true, method: "fs", path: secretsFile };
  } catch (e) {
    // Fall back to a simple installer .cmd (non-elevated) for the user to run.
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const cmd = [
      "@echo off",
      "setlocal EnableExtensions",
      "echo.",
      "echo Codex: installing CODEX_MANUAL_SERVICE_TOKEN to repo .secrets ...",
      `set "REPO=${rp}"`,
      "set \"DIR=%REPO%\\.secrets\"",
      "if not exist \"%DIR%\" mkdir \"%DIR%\"",
      "powershell -NoProfile -ExecutionPolicy Bypass -Command " +
        psSingleQuote(
          `$p=${psSingleQuote(secretsFile)};` +
            `$t=${psSingleQuote(tok)};` +
            `Set-Content -LiteralPath $p -Value $t -Encoding ASCII;` +
            `Set-Content -LiteralPath ${psSingleQuote(evidenceTokenFile)} -Value $t -Encoding ASCII;` +
            `Write-Host ('Wrote: ' + ${psSingleQuote(evidenceTokenFile)}) -ForegroundColor Green;` +
            `Write-Host ('Wrote: ' + $p) -ForegroundColor Green;`
        ),
      "echo.",
      "echo Done. Re-open the manual if needed and use the new token.",
      "pause",
      "",
    ].join("\r\n");
    downloadText(`codex-install-service-token-${ts}.cmd`, cmd, "text/plain; charset=utf-8");
    return { ok: false, method: "download", path: secretsFile, error: e };
  }
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = enc.encode(String(text || ""));
  const dig = await crypto.subtle.digest("SHA-256", buf);
  const bytes = Array.from(new Uint8Array(dig));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildRunElevatedCmdFile(elevatedInnerCommand, title = "Codex", workingDir = "") {
  // Generates a .cmd that prompts UAC and launches an elevated PowerShell window.
  // Browsers cannot directly spawn elevated processes; this is the most reliable workflow.
  const inner = String(elevatedInnerCommand || "").trim();
  const wd = String(workingDir || "").trim();
  const argList = `-NoProfile -ExecutionPolicy Bypass -NoExit -Command ${inner}`;
  const wdPart = wd ? ` -WorkingDirectory ${psSingleQuote(wd)}` : "";
  const outer =
    "$ErrorActionPreference='Stop';" +
    "try {" +
    ` $p = Start-Process powershell -Verb RunAs${wdPart} -ArgumentList ${psSingleQuote(argList)} -PassThru;` +
    " Write-Host ('Started elevated PowerShell (PID ' + $p.Id + ').');" +
    "} catch {" +
    " Write-Host 'FAILED to start elevated PowerShell.' -ForegroundColor Red;" +
    " Write-Host $_.Exception.ToString() -ForegroundColor Red;" +
    " exit 1;" +
    "}";
  return [
    "@echo off",
    "setlocal EnableExtensions",
    `title ${title}`,
    "echo.",
    "echo Codex launcher: requesting elevation (UAC prompt)...",
    "echo If you do not see a UAC prompt, check local policy / UAC settings.",
    "echo.",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command ${psSingleQuote(outer)}`,
    "echo.",
    "echo If the elevated window appeared briefly and closed, see the log path printed in that window, or re-run and capture a screenshot.",
    "pause",
    "",
  ].join("\r\n");
}

function buildElevatedInnerForScripts(scriptPaths, label = "") {
  const paths = (scriptPaths || []).filter(Boolean).map((p) => String(p));
  const calls = paths.map((p) => `$codes += Run-CodexScript ${psSingleQuote(p)};`).join("");
  const hdr = label ? `Write-Host ${psSingleQuote(String(label))} -ForegroundColor Cyan;` : "";
  // Critical: run each script in a CHILD powershell.exe so `exit` in the script does not close this window.
  const inner =
    "$ErrorActionPreference='Stop';" +
    "$logDir = Join-Path $env:TEMP 'codex-manual-logs';" +
    "New-Item -ItemType Directory -Force -Path $logDir | Out-Null;" +
    "$log = Join-Path $logDir ('run-' + (Get-Date -Format yyyyMMdd-HHmmss) + '.txt');" +
    "Start-Transcript -Path $log -Append | Out-Null;" +
    "try {" +
    " $wp = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());" +
    " $isAdmin = $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);" +
    " if ($isAdmin) { Write-Host 'ELEVATED: yes' -ForegroundColor Green } else { Write-Host 'ELEVATED: no' -ForegroundColor Yellow };" +
    " Write-Host ('Log: ' + $log) -ForegroundColor Cyan;" +
    " Write-Host '';" +
    hdr +
    " function Run-CodexScript([string]$path) {" +
    "   Write-Host ('==> ' + $path) -ForegroundColor Cyan;" +
    "   if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host 'Missing script file.' -ForegroundColor Red; return 9009 }" +
    "   $p = Start-Process powershell.exe -NoNewWindow -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$path);" +
    "   $code = 0; try { $code = $p.ExitCode } catch { $code = 1 }" +
    "   Write-Host ('ExitCode: ' + $code);" +
    "   Write-Host '';" +
    "   return $code" +
    " }" +
    " $codes = @();" +
    calls +
    " $max = ($codes | Measure-Object -Maximum).Maximum;" +
    " Write-Host ('MaxExitCode: ' + $max) -ForegroundColor Yellow;" +
    "} catch {" +
    " Write-Host '';" +
    " Write-Host 'ERROR:' -ForegroundColor Red;" +
    " Write-Host $_.Exception.ToString() -ForegroundColor Red;" +
    "} finally {" +
    " try { Stop-Transcript | Out-Null } catch {}" +
    " Write-Host '';" +
    " Write-Host ('Log saved: ' + $log) -ForegroundColor Cyan;" +
    " Read-Host 'Press Enter to close';" +
    "}";
  return inner;
}

function renderEvidenceActions(control, fileModal) {
  const root = $("#evidenceActions");
  if (!root) return;
  root.innerHTML = "";

  const ev = control.evidence || {};
  const regen = normalize(ev.regeneration_method);
  if (!regen) return;

  const ps1s = extractPs1Paths(regen);
  if (!ps1s.length) return;

  const row1 = document.createElement("div");
  row1.className = "actionRow";
  row1.innerHTML = `<div class="label">Actions</div>`;

  for (const p of ps1s) {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${p}"`;

    const btnCopy = document.createElement("button");
    btnCopy.className = "pillBtn";
    btnCopy.textContent = `Copy: ${p.split("\\").slice(-1)[0]}`;
    btnCopy.onclick = async () => {
      const ok = await copyToClipboard(cmd);
      if (!ok) alert("Copy failed. You can manually copy from the notes area.");
    };

    const btnView = document.createElement("button");
    btnView.className = "pillBtn";
    btnView.textContent = `View`;
    btnView.onclick = () => fileModal.openPath(p);

    const btnRun = document.createElement("button");
    btnRun.className = "pillBtn";
    btnRun.textContent = `Run elevated`;
    btnRun.onclick = () => {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const base = p.split("\\").slice(-1)[0].replace(/[^A-Za-z0-9_.-]+/g, "_");
      const inner = buildElevatedInnerForScripts([p], `Run elevated: ${p}`);
      const cmdFile = buildRunElevatedCmdFile(inner, "Codex - Run Elevated");
      downloadText(`codex-run-elevated-${base}-${ts}.cmd`, cmdFile, "text/plain; charset=utf-8");
      alert("Downloaded a launcher (.cmd). Run it to open an elevated PowerShell and execute the script (output + log).");
    };

    row1.appendChild(btnCopy);
    row1.appendChild(btnView);
    row1.appendChild(btnRun);
  }

  // Optional: combined run-all command (sequential)
  if (ps1s.length > 1) {
    const allCmd = ps1s.map((p) => `powershell -NoProfile -ExecutionPolicy Bypass -File "${p}"`).join(" ; ");
    const btnAll = document.createElement("button");
    btnAll.className = "pillBtn";
    btnAll.textContent = "Copy: run all";
    btnAll.onclick = async () => {
      const ok = await copyToClipboard(allCmd);
      if (!ok) alert("Copy failed.");
    };
    row1.appendChild(btnAll);
  }

  root.appendChild(row1);
}

function setupDocModal(progressGetter, progressSetter) {
  const modal = $("#docModal");
  const backdrop = $("#docBackdrop");
  const btnClose = $("#btnDocClose");
  const btnOpenNewTab = $("#btnDocOpenNewTab");
  const btnReader = $("#btnDocReaderMode");
  const docTitle = $("#docTitle");
  const docSubtitle = $("#docSubtitle");
  const docBody = $("#docBody");
  const docSearch = $("#docSearch");
  const btnTop = $("#btnDocTop");

  let currentDocPath = null;
  let currentDocRaw = "";
  let readerMode = false;

  function applyReaderMode() {
    try {
      const drawer = modal && modal.querySelector ? modal.querySelector(".drawer") : null;
      if (drawer) drawer.classList.toggle("reader", !!readerMode);
      if (btnReader) btnReader.textContent = readerMode ? "Sidebar" : "Reader mode";
    } catch {}
  }

  function resolveDocLink(href) {
    // In-doc links are usually relative to the referenced file. We keep it simple:
    // - if link starts with ../ or ./ or a bare path, fetch relative to current doc's directory if possible.
    const h = normalize(href);
    if (!currentDocPath) return h;
    if (h.startsWith("/")) return h; // server root path
    if (h.startsWith("../") || h.startsWith("./")) {
      const base = currentDocPath.split("/").slice(0, -1).join("/");
      const combined = base ? `${base}/${h}` : h;
      return combined.replace(/\/\.\//g, "/");
    }
    // Bare relative: resolve against current doc folder.
    const base = currentDocPath.split("/").slice(0, -1).join("/");
    return base ? `${base}/${h}` : h;
  }

  function setActiveNav(path) {
    document.querySelectorAll(".nav-item[data-doc]").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-doc") === path);
    });
  }

  async function openDoc(path) {
    const p = normalize(path);
    if (!p) return;
    currentDocPath = p;
    setActiveNav(p);
    docTitle.textContent = p;
    docSubtitle.textContent = "Rendered Markdown";
    docSearch.value = "";
    docBody.innerHTML = `<div class="callout callout-note"><div class="callout-title">LOADING</div><p>Fetching ${esc(p)}…</p></div>`;

    try {
      const resp = await fetch(p, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.text();
      currentDocRaw = raw;
      const cleaned = stripPlatformAgnosticBoilerplate(raw);
      const html = renderMarkdown(cleaned, resolveDocLink);
      docBody.innerHTML = html;

      // enable in-doc navigation
      docBody.querySelectorAll("a[data-doc]").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = a.getAttribute("data-doc");
          if (target) openDoc(target);
        });
      });
    } catch (err) {
      docBody.innerHTML = `<div class="callout callout-warning"><div class="callout-title">WARNING</div><p>Failed to load: ${esc(
        p
      )}</p><pre class="mono">${esc(err && err.message ? err.message : err)}</pre></div>`;
    }

    // store last-opened doc for convenience
    const pg = progressGetter();
    const modules = pg.__modules || {};
    modules.__last_doc = p;
    progressSetter("__modules", { ...modules });
  }

  function openModal() {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    // restore reader mode preference
    try {
      const pg = progressGetter();
      const modules = pg && pg.__modules && typeof pg.__modules === "object" ? pg.__modules : {};
      readerMode = !!modules.__doc_reader_mode;
    } catch {}
    applyReaderMode();
  }
  function closeModal() {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  backdrop.addEventListener("click", closeModal);
  btnClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll(".nav-item[data-doc]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const p = a.getAttribute("data-doc");
      if (!p) return;
      openModal();
      openDoc(p);
    });
  });

  btnOpenNewTab.addEventListener("click", () => {
    if (!currentDocPath) return;
    if (isMarkdownPath(currentDocPath)) openRenderedDocInNewTab(currentDocPath);
    else openInNewTab(currentDocPath);
  });

  if (btnReader) {
    btnReader.addEventListener("click", () => {
      readerMode = !readerMode;
      applyReaderMode();
      try {
        const pg = progressGetter();
        const modules = pg && pg.__modules && typeof pg.__modules === "object" ? pg.__modules : {};
        modules.__doc_reader_mode = !!readerMode;
        progressSetter("__modules", { ...modules });
      } catch {}
    });
  }

  btnTop.addEventListener("click", () => {
    try {
      docBody.parentElement.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      docBody.parentElement.scrollTop = 0;
    }
  });

  docSearch.addEventListener("input", () => {
    const q = normalize(docSearch.value).toLowerCase();
    if (!q) {
      docBody.querySelectorAll("mark").forEach((m) => {
        const t = document.createTextNode(m.textContent || "");
        m.replaceWith(t);
      });
      return;
    }
    // lightweight highlight: re-render from raw and wrap matches
    try {
      const safe = currentDocRaw || "";
      let html = renderMarkdown(stripPlatformAgnosticBoilerplate(safe), resolveDocLink);
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      html = html.replace(re, (m) => `<mark>${m}</mark>`);
      docBody.innerHTML = html;
      docBody.querySelectorAll("a[data-doc]").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = a.getAttribute("data-doc");
          if (target) openDoc(target);
        });
      });
    } catch {
      // ignore
    }
  });

  return {
    openDocInModal: (path) => {
      openModal();
      openDoc(path);
    },
    openDefault: () => {
      const pg = progressGetter();
      const last = pg && pg.__modules ? pg.__modules.__last_doc : null;
      const p = normalize(last) || "docs/00_Start_Here.md";
      openModal();
      openDoc(p);
    },
    close: closeModal,
  };
}

function setupSrmModal(opts) {
  const controlsInherited = (opts && Array.isArray(opts.inheritedControls) ? opts.inheritedControls : []).slice();
  const controlsNa = (opts && Array.isArray(opts.naControls) ? opts.naControls : []).slice();
  const getProgress = opts && typeof opts.getProgress === "function" ? opts.getProgress : () => ({});
  const setProgressBulk = opts && typeof opts.setProgressBulk === "function" ? opts.setProgressBulk : () => {};
  const docModal = opts && opts.docModal ? opts.docModal : null;
  const fileModal = opts && opts.fileModal ? opts.fileModal : null;

  const modal = $("#srmModal");
  const backdrop = $("#srmBackdrop");
  const btnClose = $("#btnSrmClose");
  const btnWrite = $("#btnSrmWriteArtifact");
  const btnTop = $("#btnSrmTop");
  const body = $("#srmBody");
  const status = $("#srmStatus");
  const search = $("#srmSearch");
  const showSel = $("#srmShow");
  const btnNextMissing = $("#btnSrmNextMissing");

  const btnLoadAzure = $("#btnSrmLoadAzure");
  const btnJumpInherited = $("#btnSrmJumpInherited");
  const btnJumpNa = $("#btnSrmJumpNa");
  const btnOpenDoc = $("#btnSrmOpenDoc");
  const btnOpenNarr = $("#btnSrmOpenNarrative");

  function setStatus(msg) {
    if (!status) return;
    status.textContent = msg ? String(msg) : "";
  }

  function openModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function ensureSrmProgress(p0) {
    const p = p0 && typeof p0 === "object" ? { ...(p0 || {}) } : {};
    p.__srm_module = p.__srm_module && typeof p.__srm_module === "object" ? { ...(p.__srm_module || {}) } : {};
    p.__srm_module.inherited =
      p.__srm_module.inherited && typeof p.__srm_module.inherited === "object" ? { ...(p.__srm_module.inherited || {}) } : {};
    p.__srm_module.na = p.__srm_module.na && typeof p.__srm_module.na === "object" ? { ...(p.__srm_module.na || {}) } : {};
    return p;
  }

  function signerNameFromProgress(p) {
    try {
      const prof = getAttesteeProfile(p);
      if (prof && prof.name) return prof.name;
    } catch {}
    return "";
  }

  function counts(p) {
    const sp = p && p.__srm_module ? p.__srm_module : {};
    const inh = sp && sp.inherited ? sp.inherited : {};
    const na = sp && sp.na ? sp.na : {};
    let inhDone = 0;
    for (const ctl of controlsInherited) {
      const cid = String((ctl && ctl.control_id) || "");
      if (!cid) continue;
      const e = inh && inh[cid] ? inh[cid] : {};
      if (e && e.ack === true && normalize(e.evidence_ref)) inhDone++;
    }
    let naDone = 0;
    for (const ctl of controlsNa) {
      const cid = String((ctl && ctl.control_id) || "");
      if (!cid) continue;
      const e = na && na[cid] ? na[cid] : {};
      // For N/A: we auto-generate a rationale and require the user to acknowledge it.
      if (e && e.ack === true) naDone++;
    }
    return { inhDone, inhTotal: controlsInherited.length, naDone, naTotal: controlsNa.length };
  }

  function naRationaleForControl(ctl) {
    const cid = normalize(ctl && ctl.control_id ? ctl.control_id : "");
    const title = normalize(ctl && ctl.title ? ctl.title : "");
    const basis = normalize(ctl && ctl.pilot_status_basis ? ctl.pilot_status_basis : "");
    const t = `${cid} ${title} ${basis}`.toLowerCase();

    const defaultTail =
      "If the enclave scope/boundary changes (e.g., new device types, wireless networks, external interconnections), this N/A determination will be re-evaluated and implemented as required.";

    if (t.indexOf("mobile") >= 0 || t.indexOf("portable") >= 0 || t.indexOf("mdm") >= 0) {
      return [
        "This enclave does not authorize mobile or portable endpoints to access, process, or store CUI.",
        "CUI access is restricted to the Windows enclave VM via controlled remote access paths; therefore the mobile-device-specific requirement is not applicable in the current scope.",
        defaultTail,
      ].join(" ");
    }
    if (t.indexOf("wireless") >= 0 || t.indexOf("wifi") >= 0 || t.indexOf("bluetooth") >= 0 || t.indexOf("802.11") >= 0) {
      return [
        "This enclave does not provide wireless networking within the in-scope environment for processing CUI.",
        "The enclave boundary is implemented as a single Azure-hosted Windows VM with managed network controls; therefore wireless-specific requirements are not applicable in the current scope.",
        defaultTail,
      ].join(" ");
    }
    if (t.indexOf("external") >= 0 || t.indexOf("interconnection") >= 0 || t.indexOf("system interconnection") >= 0) {
      return [
        "The current enclave is a single isolated VM boundary and does not maintain trusted interconnections with external information systems for CUI processing.",
        "Because there are no cross-system interconnections in scope, interconnection-specific requirements are not applicable as implemented today.",
        defaultTail,
      ].join(" ");
    }
    if (t.indexOf("voip") >= 0 || t.indexOf("voice") >= 0 || t.indexOf("fax") >= 0) {
      return [
        "The enclave does not use voice/telephony (VoIP/fax) systems for transmitting or processing CUI.",
        "CUI communications are limited to approved digital channels within the enclave boundary; therefore voice-system-specific requirements are not applicable in the current scope.",
        defaultTail,
      ].join(" ");
    }

    // Generic N/A rationale (2–3 sentences).
    return [
      "This requirement is not applicable to the current enclave scope because the referenced technology/process is not used within the Windows CUI enclave boundary.",
      "CUI processing is confined to a single Azure-hosted Windows VM with controlled remote access and no unmanaged endpoints in scope.",
      defaultTail,
    ].join(" ");
  }

  function filterTextMatch(s, q) {
    const t = normalize(s).toLowerCase();
    return t.indexOf(q) >= 0;
  }

  function getShowMode(inhMissing, naMissing) {
    try {
      const k = "codex.srm.show";
      const v = normalize(localStorage.getItem(k));
      if (v === "all" || v === "missing") return v;
      // default: show missing if there is anything missing
      return (inhMissing && inhMissing.length) || (naMissing && naMissing.length) ? "missing" : "all";
    } catch {
      return (inhMissing && inhMissing.length) || (naMissing && naMissing.length) ? "missing" : "all";
    }
  }

  function setShowMode(v) {
    try {
      localStorage.setItem("codex.srm.show", String(v || ""));
    } catch {}
  }

  function scrollToFirstMissing() {
    try {
      const el = body && body.querySelector ? body.querySelector(".srmRow.missing") : null;
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      }
    } catch {}
    return false;
  }

  function render() {
    if (!body) return;
    // Preserve scroll position inside drawer-content and (best effort) focused field.
    const scroller = body.parentElement;
    const prevScroll = scroller && typeof scroller.scrollTop === "number" ? scroller.scrollTop : 0;
    const active = document.activeElement;
    const activeCid = active && active.getAttribute ? active.getAttribute("data-cid") : null;
    const activeKind = active && active.getAttribute ? active.getAttribute("data-srm-ref") : null;

    let p0 = ensureSrmProgress(getProgress());
    // One-time migration: auto-fill N/A rationales so the user only needs to acknowledge.
    try {
      const sp0 = p0 && p0.__srm_module && typeof p0.__srm_module === "object" ? p0.__srm_module : {};
      if (!sp0.na_rationale_migrated) {
        const next = { ...(p0 || {}) };
        ensureSrmProgress(next);
        next.__srm_module.na_rationale_migrated = true;
        next.__srm_module.na = next.__srm_module.na && typeof next.__srm_module.na === "object" ? next.__srm_module.na : {};
        for (const ctl of controlsNa || []) {
          const cid = String((ctl && ctl.control_id) || "");
          if (!cid) continue;
          const prev = next.__srm_module.na[cid] && typeof next.__srm_module.na[cid] === "object" ? next.__srm_module.na[cid] : {};
          if (!normalize(prev.justification_ref)) {
            next.__srm_module.na[cid] = { ...(prev || {}), justification_ref: naRationaleForControl(ctl) };
          }
        }
        setProgressBulk(next);
        p0 = next;
      }
    } catch {}
    const sp = p0.__srm_module || {};
    const q = normalize(search && search.value ? search.value : "").toLowerCase();
    const c = counts(p0);

    const loadedPath = sp.azure_inheritance && sp.azure_inheritance.path ? String(sp.azure_inheritance.path) : "";
    const boundary = sp.azure_inheritance && sp.azure_inheritance.boundary_statement ? String(sp.azure_inheritance.boundary_statement) : "";
    const exp = sp.azure_inheritance && Array.isArray(sp.azure_inheritance.evidence_expectations) ? sp.azure_inheritance.evidence_expectations : [];
    const providerReq =
      sp.azure_inheritance && Array.isArray(sp.azure_inheritance.provider_evidence_required) ? sp.azure_inheritance.provider_evidence_required : [];
    const customerReq =
      sp.azure_inheritance && Array.isArray(sp.azure_inheritance.customer_evidence_required) ? sp.azure_inheritance.customer_evidence_required : [];

    const signer = signerNameFromProgress(p0) || "(set Attestee in Step 1)";
    const srmSignedUtc = p0.__srm_reviewed_utc || "";
    const naSignedUtc = p0.__na_attested_utc || "";
    const srmSigned = !!normalize(srmSignedUtc);
    const naSigned = !!normalize(naSignedUtc);

    const inhMissing = [];
    for (const ctl of controlsInherited) {
      const cid = String(ctl.control_id || "");
      if (!cid) continue;
      const e = sp.inherited && sp.inherited[cid] ? sp.inherited[cid] : {};
      const ok = !!(e && e.ack === true && normalize(e.evidence_ref));
      if (!ok) inhMissing.push(cid);
    }
    const naMissing = [];
    for (const ctl of controlsNa) {
      const cid = String(ctl.control_id || "");
      if (!cid) continue;
      const e = sp.na && sp.na[cid] ? sp.na[cid] : {};
      if (!(e && e.ack === true)) naMissing.push(cid);
    }

    const showMode = getShowMode(inhMissing, naMissing);
    if (showSel) {
      try {
        if (!showSel.value) showSel.value = showMode;
        if (showSel.value !== showMode) showSel.value = showMode;
      } catch {}
    }

    const inhRows = controlsInherited
      .filter((ctl) => {
        if (!q) return true;
        return filterTextMatch(ctl.control_id, q) || filterTextMatch(ctl.title, q) || filterTextMatch(ctl.inheritance_source, q);
      })
      .filter((ctl) => {
        if (showMode !== "missing") return true;
        const cid = String((ctl && ctl.control_id) || "");
        if (!cid) return false;
        return inhMissing.indexOf(cid) >= 0;
      })
      .map((ctl) => {
        const cid = String(ctl.control_id || "");
        const entry = sp.inherited && sp.inherited[cid] ? sp.inherited[cid] : {};
        const ack = !!(entry && entry.ack);
        const ref = entry && entry.evidence_ref ? String(entry.evidence_ref) : "";
        const hasRef = !!normalize(ref);
        const source = normalize(ctl.inheritance_source) || "—";
        const isMissing = inhMissing.indexOf(cid) >= 0;
        return `
          <div class="srmRow ${ack && hasRef ? "done" : ""} ${isMissing ? "missing" : ""}">
            <div class="srmCid">${esc(cid)}</div>
            <div>
              <div class="srmTitle">${esc(ctl.title || "")}</div>
              <div class="srmMeta mono">Source: ${esc(source)}</div>
            </div>
            <div class="srmAction">
              <label class="check"><input type="checkbox" data-srm-kind="inh" data-cid="${esc(cid)}" ${ack ? "checked" : ""}/> <strong>Verified</strong></label>
              <div class="srmMeta" style="margin-top:6px">${hasRef ? "" : `<span class="srmReq">Evidence refs required</span>`}</div>
              <input class="input mono srmInput" placeholder="Evidence refs (provider + customer paths/attestations)" value="${esc(ref)}" data-srm-ref="inh" data-cid="${esc(
          cid
        )}" />
            </div>
          </div>
        `;
      })
      .join("");

    const naRows = controlsNa
      .filter((ctl) => {
        if (!q) return true;
        return filterTextMatch(ctl.control_id, q) || filterTextMatch(ctl.title, q) || filterTextMatch(ctl.pilot_status_basis, q);
      })
      .filter((ctl) => {
        if (showMode !== "missing") return true;
        const cid = String((ctl && ctl.control_id) || "");
        if (!cid) return false;
        return naMissing.indexOf(cid) >= 0;
      })
      .map((ctl) => {
        const cid = String(ctl.control_id || "");
        const entry = sp.na && sp.na[cid] ? sp.na[cid] : {};
        const ack = !!(entry && entry.ack);
        const just = entry && entry.justification_ref ? String(entry.justification_ref) : naRationaleForControl(ctl);
        const basis = normalize(ctl.pilot_status_basis) || "";
        const hasJust = !!normalize(just);
        const isMissing = naMissing.indexOf(cid) >= 0;
        return `
          <div class="srmRow ${ack && hasJust ? "done" : ""} ${isMissing ? "missing" : ""}">
            <div class="srmCid">${esc(cid)}</div>
            <div>
              <div class="srmTitle">${esc(ctl.title || "")}</div>
              ${
                basis
                  ? `<details class="srmBasis"><summary class="muted">Show basis / guidance</summary><div class="srmBasisBody">${esc(basis)}</div></details>`
                  : `<div class="srmMeta">Basis: —</div>`
              }
              <details class="srmBasis" style="margin-top:8px">
                <summary class="muted">Show N/A rationale statement (acknowledge)</summary>
                <div class="srmBasisBody">${esc(just)}</div>
              </details>
            </div>
            <div class="srmAction">
              <label class="check"><input type="checkbox" data-srm-kind="na" data-cid="${esc(cid)}" ${ack ? "checked" : ""}/> <strong>Acknowledge N/A rationale</strong></label>
              <div class="srmMeta" style="margin-top:6px">${hasJust ? `<span class="pill pill-good">Rationale generated</span>` : `<span class="srmReq">Rationale missing</span>`}</div>
            </div>
          </div>
        `;
      })
      .join("");

    body.innerHTML = `
      <div class="subcard srmSection" style="margin-bottom:12px">
        <div class="subcard-title">Provider–recipient agreement &amp; acknowledgements</div>
        <div class="callout subtle">
          <b>MacTech Solutions</b> (Cloud Provider for the CUI vault) and the <b>Recipient</b> agree to the SRM boundary and evidence expectations.
          By signing the SRM review and N/A attestation below, the <b>Recipient acknowledges</b>: (1) responsibility to <b>uphold the CUI boundary</b> and all applicable requirements;
          (2) the <b>User Access Form</b> (User Agreement and Rules of Behavior, MAC-FRM-204) and its expectations — access is contingent on completion and compliance.
          <a href="#" id="srmOpenAgreementDoc" class="pill" style="margin-top:8px;display:inline-block">Open full SRM doc (agreement, acknowledgements, handover)</a>
        </div>
      </div>

      <div class="srmTop">
        <div class="left">
          <div class="srmK">Signer (Attestee)</div>
          <div class="srmV"><b>${esc(signer)}</b></div>
          <div class="srmV" style="margin-top:8px">
            <span class="srmK">Progress</span><br/>
            Inherited verified <b>${c.inhDone}/${c.inhTotal}</b> · N/A attested <b>${c.naDone}/${c.naTotal}</b>
          </div>
        </div>
        <div class="right">
          <div class="srmPills">
            <span class="pill ${srmSigned ? "pill-good" : "pill-warn"}">SRM review: ${srmSigned ? "SIGNED" : "NOT SIGNED"}</span>
            <span class="pill ${naSigned ? "pill-good" : "pill-warn"}">N/A attestation: ${naSigned ? "SIGNED" : "NOT SIGNED"}</span>
          </div>
          <div class="srmK" style="max-width:520px">
            ${srmSigned ? `SRM signed (UTC): <span class="mono">${esc(srmSignedUtc)}</span>` : `SRM missing: <b>${inhMissing.length}</b>`}
            <br/>
            ${naSigned ? `N/A signed (UTC): <span class="mono">${esc(naSignedUtc)}</span>` : `N/A missing: <b>${naMissing.length}</b> (must acknowledge statements)`}
          </div>
        </div>
      </div>

      <div class="subcard srmSection" id="srmAzureBlock">
        <div class="subcard-title">SRM boundary (Azure inheritance report)</div>
        <div class="srmHint">
          ${loadedPath ? `Loaded: <span class="mono">${esc(loadedPath)}</span>` : "Not loaded yet. Use “Load latest Azure inheritance report” on the left."}
        </div>
        <div class="srmToolbar">
          <button class="btn btn-secondary" id="btnSrmLoadAzureInline">Reload Azure inheritance report</button>
        </div>
        ${boundary ? `<div class="callout subtle" style="margin-top:10px"><b>Boundary statement</b><br/>${esc(boundary)}</div>` : ""}
        ${
          providerReq && providerReq.length
            ? `<div class="callout subtle" style="margin-top:10px"><b>Provider evidence required</b><br/>${providerReq
                .map((x) => `- ${esc(x)}`)
                .join("<br/>")}</div>`
            : ""
        }
        ${
          customerReq && customerReq.length
            ? `<div class="callout subtle" style="margin-top:10px"><b>Customer evidence required</b><br/>${customerReq
                .map((x) => `- ${esc(x)}`)
                .join("<br/>")}</div>`
            : ""
        }
        ${
          exp && exp.length
            ? `<div class="callout subtle" style="margin-top:10px"><b>Evidence expectations</b><br/>${exp
                .map((x) => `- ${esc(x)}`)
                .join("<br/>")}</div>`
            : ""
        }
      </div>

      <div class="subcard srmSection" id="srmInheritedBlock">
        <div class="subcard-title">Inherited controls — verify + acknowledge</div>
        <div class="srmHint">
          Verify SRM boundaries and record where provider/customer evidence is retained for each control. Then you can safely bulk-adjudicate.
        </div>
        <div class="srmToolbar">
          <button class="btn btn-secondary" id="btnSrmMarkAllInherited">Mark all Inherited verified</button>
          <button class="btn" id="btnSrmSignInherited" ${inhMissing.length ? "disabled" : ""} title="${
          inhMissing.length ? `Missing ${inhMissing.length} verification(s)` : "All inherited controls verified"
        }">Sign SRM review</button>
        </div>
        <div class="srmList" role="table" aria-label="Inherited controls">
          <div class="srmRow srmHead" role="row">
            <div role="columnheader">Control</div>
            <div role="columnheader">Details</div>
            <div role="columnheader">Verification</div>
          </div>
          ${inhRows || `<div class="srmRow"><div class="muted" style="grid-column:1/-1">No inherited controls match this search.</div></div>`}
        </div>
      </div>

      <div class="subcard srmSection" id="srmNaBlock">
        <div class="subcard-title">N/A controls — acknowledge auto-generated rationale</div>
        <div class="srmHint">
          For each N/A control, review the pre-written N/A rationale statement and acknowledge it. (Required before signing.)
        </div>
        <div class="srmToolbar">
          <button class="btn btn-secondary" id="btnSrmMarkAllNa">Mark all N/A attested</button>
          <button class="btn" id="btnSrmSignNa" ${naMissing.length ? "disabled" : ""} title="${
          naMissing.length ? `Missing ${naMissing.length} acknowledgement(s)` : "All N/A controls acknowledged"
        }">Sign N/A attestation</button>
        </div>
        <div class="srmList" role="table" aria-label="N/A controls">
          <div class="srmRow srmHead" role="row">
            <div role="columnheader">Control</div>
            <div role="columnheader">Details</div>
            <div role="columnheader">Attestation</div>
          </div>
          ${naRows || `<div class="srmRow"><div class="muted" style="grid-column:1/-1">No N/A controls match this search.</div></div>`}
        </div>
      </div>
    `;

    const btnLoadInline = $("#btnSrmLoadAzureInline");
    if (btnLoadInline) btnLoadInline.onclick = () => loadLatestAzureInheritance();

    if (showSel) {
      showSel.onchange = () => {
        const v = normalize(showSel.value);
        setShowMode(v === "all" ? "all" : "missing");
        render();
      };
    }
    if (btnNextMissing) {
      btnNextMissing.onclick = () => {
        const ok = scrollToFirstMissing();
        if (!ok) alert("No outstanding items found (everything in-view is complete).");
      };
    }

    // Wire dynamic controls
    const linkAgreementDoc = body.querySelector("#srmOpenAgreementDoc");
    if (linkAgreementDoc && docModal) {
      linkAgreementDoc.onclick = (e) => {
        e.preventDefault();
        docModal.openDocInModal("docs/03_Shared_Responsibility_Matrix.md");
      };
    }
    body.querySelectorAll("input[type=checkbox][data-srm-kind][data-cid]").forEach((el) => {
      el.onchange = () => {
        const kind = el.getAttribute("data-srm-kind");
        const cid = el.getAttribute("data-cid");
        const next = ensureSrmProgress(getProgress());
        const nowUtc = new Date().toISOString();
        const by = signerNameFromProgress(next) || "";
        if (kind === "inh") {
          const prev = next.__srm_module.inherited[cid] || {};
          const entry = { ...(prev || {}), ack: !!el.checked, utc: nowUtc, by };
          // Helpful: when checking "Verified", auto-fill Evidence refs if still empty and Azure report is loaded.
          try {
            if (entry.ack === true && !normalize(entry.evidence_ref)) {
              const az = next.__srm_module && next.__srm_module.azure_inheritance ? next.__srm_module.azure_inheritance : null;
              const pth = az && az.path ? String(az.path) : "";
              if (pth) entry.evidence_ref = `Boundary: ${pth}`;
            }
          } catch {}
          next.__srm_module.inherited[cid] = entry;
        } else {
          const prev = next.__srm_module.na[cid] || {};
          const entry = { ...(prev || {}), ack: !!el.checked, utc: nowUtc, by };
          // Auto-fill rationale when acknowledging.
          try {
            if (entry.ack === true && !normalize(entry.justification_ref)) {
              const ctl = controlsNa.find((x) => String((x && x.control_id) || "") === String(cid));
              entry.justification_ref = ctl ? naRationaleForControl(ctl) : entry.justification_ref;
            }
          } catch {}
          next.__srm_module.na[cid] = entry;
        }
        setProgressBulk(next);
        render();
      };
    });
    body.querySelectorAll("input[data-srm-ref][data-cid]").forEach((el) => {
      // Save on input (debounced) so it feels responsive and doesn't lose text.
      let t = null;
      const save = () => {
        const kind = el.getAttribute("data-srm-ref");
        const cid = el.getAttribute("data-cid");
        const val = String(el.value || "");
        const next = ensureSrmProgress(getProgress());
        if (kind === "inh") {
          next.__srm_module.inherited[cid] = { ...(next.__srm_module.inherited[cid] || {}), evidence_ref: val };
        }
        setProgressBulk(next);
      };
      el.oninput = () => {
        if (t) clearTimeout(t);
        t = setTimeout(save, 250);
      };
      el.onchange = () => save();
    });

    const btnAllInh = $("#btnSrmMarkAllInherited");
    if (btnAllInh) {
      btnAllInh.onclick = () => {
        const next = ensureSrmProgress(getProgress());
        const nowUtc = new Date().toISOString();
        const by = signerNameFromProgress(next) || "";
        const defaultRef = (() => {
          try {
            const az = next.__srm_module && next.__srm_module.azure_inheritance ? next.__srm_module.azure_inheritance : null;
            const pth = az && az.path ? String(az.path) : "";
            return pth ? `Boundary: ${pth}` : "";
          } catch {
            return "";
          }
        })();
        for (const ctl of controlsInherited) {
          const cid = String(ctl.control_id || "");
          if (!cid) continue;
          const prev = next.__srm_module.inherited[cid] || {};
          next.__srm_module.inherited[cid] = {
            ...(prev || {}),
            ack: true,
            utc: nowUtc,
            by,
            evidence_ref: normalize(prev.evidence_ref) ? prev.evidence_ref : defaultRef,
          };
        }
        setProgressBulk(next);
        render();
      };
    }
    const btnAllNa = $("#btnSrmMarkAllNa");
    if (btnAllNa) {
      btnAllNa.onclick = () => {
        const next = ensureSrmProgress(getProgress());
        const nowUtc = new Date().toISOString();
        const by = signerNameFromProgress(next) || "";
        for (const ctl of controlsNa) {
          const cid = String(ctl.control_id || "");
          if (!cid) continue;
          const prev = next.__srm_module.na[cid] || {};
          next.__srm_module.na[cid] = {
            ...(prev || {}),
            ack: true,
            utc: nowUtc,
            by,
            justification_ref: normalize(prev.justification_ref) ? prev.justification_ref : naRationaleForControl(ctl),
          };
        }
        setProgressBulk(next);
        render();
      };
    }

    const btnSignInh = $("#btnSrmSignInherited");
    if (btnSignInh) {
      btnSignInh.onclick = () => {
        const next = ensureSrmProgress(getProgress());
        const signer = signerNameFromProgress(next);
        if (!signer) {
          alert("Set Attestee identity (Step 1) before signing SRM review.");
          return;
        }
        if (!next.__srm_module.azure_inheritance || !normalize(next.__srm_module.azure_inheritance.path)) {
          alert("Load the latest Azure inheritance report first (SRM boundary evidence), then sign SRM review.");
          return;
        }
        // Require every inherited control to be explicitly verified (no blanket signing).
        const missing = [];
        for (const ctl of controlsInherited) {
          const cid = String(ctl.control_id || "");
          if (!cid) continue;
          const e = next.__srm_module.inherited && next.__srm_module.inherited[cid] ? next.__srm_module.inherited[cid] : {};
          if (!(e && e.ack === true)) missing.push(`${cid} (verify)`);
          else if (!normalize(e && e.evidence_ref ? e.evidence_ref : "")) missing.push(`${cid} (evidence refs)`);
        }
        if (missing.length) {
          alert(
            `SRM review cannot be signed until all Inherited controls are marked Verified.\n\nMissing (${missing.length}): ${missing
              .slice(0, 30)
              .join(", ")}${missing.length > 30 ? " …" : ""}`
          );
          return;
        }
        const nowUtc = new Date().toISOString();
        next.__srm_reviewed_utc = nowUtc;
        next.__srm_reviewed_by = signer;
        next.__srm_module.srm_reviewed = { utc: nowUtc, by: signer };

        // Auto-close Inherited controls once SRM review is signed (prevents the common "verified but still unmet" loop).
        let adjN = 0;
        for (const ctl of controlsInherited || []) {
          const cid = String((ctl && ctl.control_id) || "");
          if (!cid) continue;
          const prev = next[cid] && typeof next[cid] === "object" ? next[cid] : {};
          if (prev && prev.adjudicated) continue;
          next[cid] = {
            ...(prev || {}),
            adjudicated: true,
            updated_utc: nowUtc,
            notes:
              prev.notes ||
              `Inherited control adjudicated after SRM review signature. Signer: ${signer}. Evidence boundary + refs retained: see SRM module.`,
          };
          adjN++;
        }
        setProgressBulk(next);
        alert(adjN ? `Recorded SRM review signature and adjudicated ${adjN} Inherited controls.` : "Recorded SRM review signature in progress.");
        render();
      };
    }
    const btnSignNa = $("#btnSrmSignNa");
    if (btnSignNa) {
      btnSignNa.onclick = () => {
        const next = ensureSrmProgress(getProgress());
        const signer = signerNameFromProgress(next);
        if (!signer) {
          alert("Set Attestee identity (Step 1) before signing N/A attestation.");
          return;
        }
        // Require every N/A control to be explicitly acknowledged; rationale is auto-generated and stored for export/audit.
        const missing = [];
        for (const ctl of controlsNa) {
          const cid = String(ctl.control_id || "");
          if (!cid) continue;
          const e = next.__srm_module.na && next.__srm_module.na[cid] ? next.__srm_module.na[cid] : {};
          const hasJust = !!normalize(e && e.justification_ref ? e.justification_ref : "");
          if (!hasJust) {
            // Backfill (should be rare).
            next.__srm_module.na[cid] = { ...(e || {}), justification_ref: naRationaleForControl(ctl) };
          }
          if (!(e && e.ack === true)) missing.push(cid);
        }
        if (missing.length) {
          alert(
            `N/A attestation cannot be signed until all N/A controls are acknowledged.\n\nMissing (${missing.length}): ${missing
              .slice(0, 30)
              .join(", ")}${missing.length > 30 ? " …" : ""}`
          );
          return;
        }
        const nowUtc = new Date().toISOString();
        next.__na_attested_utc = nowUtc;
        next.__na_attested_by = signer;
        next.__srm_module.na_attested = { utc: nowUtc, by: signer };

        // Auto-close N/A controls once N/A attestation is signed (prevents "signed but still unmet").
        let adjN = 0;
        for (const ctl of controlsNa || []) {
          const cid = String((ctl && ctl.control_id) || "");
          if (!cid) continue;
          const prev = next[cid] && typeof next[cid] === "object" ? next[cid] : {};
          if (prev && prev.adjudicated) continue;
          next[cid] = {
            ...(prev || {}),
            adjudicated: true,
            updated_utc: nowUtc,
            notes:
              prev.notes ||
              `N/A control adjudicated after N/A attestation signature. Signer: ${signer}. Justification refs retained: see SRM module.`,
          };
          adjN++;
        }
        setProgressBulk(next);
        alert(adjN ? `Recorded N/A attestation signature and adjudicated ${adjN} N/A controls.` : "Recorded N/A attestation signature in progress.");
        render();
      };
    }

    // Restore scroll + focus (best effort).
    try {
      if (scroller) scroller.scrollTop = prevScroll;
      if (activeCid && activeKind) {
        const sel = `input[data-srm-ref="${cssEsc(activeKind)}"][data-cid="${cssEsc(activeCid)}"]`;
        const el = body.querySelector(sel);
        if (el && el.focus) el.focus();
      }
    } catch {}
  }

  async function loadLatestAzureInheritance() {
    setStatus("Loading latest Azure inheritance report…");
    try {
      const entries = await fsListDir("C:\\evidence");
      const dirs = entries
        .filter((e) => e && e.kind === "dir" && String(e.name || "").startsWith("CUI-Azure-Inheritance-"))
        .map((e) => String(e.name))
        .sort();
      if (!dirs.length) throw new Error("No CUI-Azure-Inheritance-* folders found under C:\\evidence yet.");
      const latest = dirs[dirs.length - 1];
      const path = `C:\\evidence\\${latest}\\azure-inheritance.json`;
      const raw = await fsReadTextFile(path);
      const obj = JSON.parse(raw);
      const next = ensureSrmProgress(getProgress());
      next.__srm_module.azure_inheritance = {
        path,
        generated_utc: obj && obj.generated_utc ? obj.generated_utc : "",
        run_id: obj && obj.run_id ? obj.run_id : "",
        boundary_statement: obj && obj.boundary_statement ? obj.boundary_statement : "",
        evidence_expectations: obj && Array.isArray(obj.evidence_expectations) ? obj.evidence_expectations : [],
        provider_evidence_required: obj && Array.isArray(obj.provider_evidence_required) ? obj.provider_evidence_required : [],
        customer_evidence_required: obj && Array.isArray(obj.customer_evidence_required) ? obj.customer_evidence_required : [],
      };
      setProgressBulk(next);
      setStatus(`Loaded ${path}`);
      render();
    } catch (e) {
      setStatus(`Load failed: ${e && e.message ? e.message : e}`);
    }
  }

  function mkSrmAckArtifact(progressObj) {
    const p = ensureSrmProgress(progressObj);
    const sp = p.__srm_module || {};
    const runId = runIdFromUtcIso(new Date().toISOString()) || new Date().toISOString().replace(/[:.]/g, "-");
    const inh = sp.inherited || {};
    const na = sp.na || {};

    const inherited = controlsInherited.map((ctl) => {
      const cid = String(ctl.control_id || "");
      const e = inh[cid] || {};
      return {
        control_id: cid,
        title: ctl.title || "",
        inheritance_source: ctl.inheritance_source || "",
        verified: e.ack === true,
        evidence_ref: e.evidence_ref || "",
        verified_utc: e.utc || "",
        verified_by: e.by || "",
      };
    });
    const naList = controlsNa.map((ctl) => {
      const cid = String(ctl.control_id || "");
      const e = na[cid] || {};
      return {
        control_id: cid,
        title: ctl.title || "",
        attested_na: e.ack === true,
        justification_ref: e.justification_ref || "",
        attested_utc: e.utc || "",
        attested_by: e.by || "",
      };
    });

    const signer = signerNameFromProgress(p) || "";
    const summary = counts(p);
    return {
      schema: "mactech.codex.manual.srm_ack",
      version: 2,
      generated_utc: new Date().toISOString(),
      run_id: runId,
      signer,
      agreement_and_acknowledgements: {
        provider: "MacTech Solutions (Cloud Provider for the CUI vault)",
        recipient: "Recipient (Customer / System owner / Attestee)",
        agreement_summary:
          "Provider and Recipient agree to the SRM boundary and evidence expectations. Recipient is responsible for enclave configuration, CUI boundary, and compliance.",
        recipient_acknowledges: [
          "Responsibility to uphold the CUI boundary and all applicable requirements.",
          "User Access Form (User Agreement and Rules of Behavior, MAC-FRM-204) and its expectations; access is contingent on completion and compliance.",
        ],
        full_srm_doc: "docs/03_Shared_Responsibility_Matrix.md",
      },
      attestation_statements: {
        inherited:
          "I reviewed the Shared Responsibility Matrix (SRM) boundary for this enclave. For each Inherited control, I verified the responsibility split and recorded where provider and customer evidence is retained. I understand that provider attestations do not satisfy customer responsibilities.",
        na:
          "For each N/A control, I confirm the requirement does not apply within this enclave scope and that a documented justification exists and is retained. I understand N/A decisions must be re-evaluated upon scope/boundary change.",
      },
      srm_reviewed_utc: p.__srm_reviewed_utc || "",
      srm_reviewed_by: p.__srm_reviewed_by || "",
      na_attested_utc: p.__na_attested_utc || "",
      na_attested_by: p.__na_attested_by || "",
      azure_inheritance: sp.azure_inheritance || null,
      summary: {
        inherited_total: summary.inhTotal,
        inherited_verified: summary.inhDone,
        na_total: summary.naTotal,
        na_attested: summary.naDone,
      },
      inherited_controls: inherited,
      na_controls: naList,
    };
  }

  function mkSrmAckMarkdown(artifact) {
    const lines = [];
    lines.push("# SRM / Inherited / N-A acknowledgement (strict)");
    lines.push("");
    const agg = artifact.agreement_and_acknowledgements;
    if (agg) {
      lines.push("## Provider–recipient agreement & acknowledgements");
      lines.push("");
      lines.push(`- **Provider:** ${agg.provider || "MacTech Solutions (Cloud Provider for the CUI vault)"}`);
      lines.push(`- **Recipient:** ${agg.recipient || "Recipient (Customer / System owner / Attestee)"}`);
      lines.push(`- **Agreement:** ${agg.agreement_summary || "Provider and Recipient agree to the SRM boundary and evidence expectations."}`);
      lines.push("- **Recipient acknowledges:**");
      for (const a of agg.recipient_acknowledges || []) lines.push(`  - ${a}`);
      if (agg.full_srm_doc) lines.push(`- **Full SRM doc (handover reference):** \`${agg.full_srm_doc}\``);
      lines.push("");
    }
    lines.push(`Generated (UTC): ${artifact.generated_utc}`);
    lines.push(`Signer: ${artifact.signer || "(not set)"}`);
    lines.push(`SRM reviewed (UTC): ${artifact.srm_reviewed_utc || "(not signed)"}`);
    lines.push(`N/A attested (UTC): ${artifact.na_attested_utc || "(not signed)"}`);
    lines.push("");
    lines.push("## Attestation statements");
    lines.push("");
    if (artifact.attestation_statements && artifact.attestation_statements.inherited) {
      lines.push("- Inherited/SRM:");
      lines.push(`  - ${String(artifact.attestation_statements.inherited)}`);
    }
    if (artifact.attestation_statements && artifact.attestation_statements.na) {
      lines.push("- N/A:");
      lines.push(`  - ${String(artifact.attestation_statements.na)}`);
    }
    lines.push("");
    if (artifact.azure_inheritance && artifact.azure_inheritance.path) {
      lines.push("## Boundary evidence source (loaded)");
      lines.push("");
      lines.push(`- Azure inheritance report: \`${artifact.azure_inheritance.path}\``);
      if (artifact.azure_inheritance.generated_utc) lines.push(`- Azure inheritance generated_utc: ${artifact.azure_inheritance.generated_utc}`);
      if (artifact.azure_inheritance.run_id) lines.push(`- Azure inheritance run_id: ${artifact.azure_inheritance.run_id}`);
      lines.push("");
    }
    if (artifact.azure_inheritance && artifact.azure_inheritance.boundary_statement) {
      lines.push("## Boundary statement");
      lines.push("");
      lines.push(String(artifact.azure_inheritance.boundary_statement));
      lines.push("");
    }
    lines.push("## Summary");
    lines.push(`- Inherited verified: ${artifact.summary.inherited_verified}/${artifact.summary.inherited_total}`);
    lines.push(`- N/A attested: ${artifact.summary.na_attested}/${artifact.summary.na_total}`);
    lines.push("");
    lines.push("## Inherited controls (verification)");
    for (const c of artifact.inherited_controls || []) {
      const ev = c.evidence_ref ? ` · evidence: ${c.evidence_ref}` : " · evidence: (missing)";
      lines.push(`- **${c.control_id}** — ${c.verified ? "VERIFIED" : "NOT VERIFIED"}${ev}`);
    }
    lines.push("");
    lines.push("## N/A controls (attestation)");
    for (const c of artifact.na_controls || []) {
      const j = c.justification_ref ? ` · justification: ${c.justification_ref}` : " · justification: (missing)";
      lines.push(`- **${c.control_id}** — ${c.attested_na ? "ATTESTED" : "NOT ATTESTED"}${j}`);
    }
    lines.push("");
    return lines.join("\n");
  }

  async function writeArtifact() {
    setStatus("Writing SRM acknowledgement artifact to C:\\evidence…");
    try {
      const p = getProgress();
      const art = mkSrmAckArtifact(p);
      const outDir = `C:\\evidence\\CUI-SRM-Ack-${art.run_id}`;
      const jsonPath = `${outDir}\\srm-ack.json`;
      const mdPath = `${outDir}\\srm-ack.md`;
      await fsWriteTextFile(jsonPath, JSON.stringify(art, null, 2) + "\n");
      await fsWriteTextFile(mdPath, mkSrmAckMarkdown(art) + "\n");
      setStatus(`Wrote: ${jsonPath} and ${mdPath}`);
      if (fileModal) fileModal.openPath(outDir);
    } catch (e) {
      setStatus(`Write failed: ${e && e.message ? e.message : e}`);
    }
  }

  if (backdrop) backdrop.addEventListener("click", closeModal);
  if (btnClose) btnClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (!modal || modal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeModal();
  });
  if (btnTop) {
    btnTop.onclick = () => {
      try {
        body.parentElement.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        body.parentElement.scrollTop = 0;
      }
    };
  }
  if (btnLoadAzure) btnLoadAzure.onclick = () => loadLatestAzureInheritance();
  if (btnJumpInherited)
    btnJumpInherited.onclick = () => {
      const el = $("#srmInheritedBlock");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  if (btnJumpNa)
    btnJumpNa.onclick = () => {
      const el = $("#srmNaBlock");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  if (btnOpenDoc)
    btnOpenDoc.onclick = (e) => {
      e.preventDefault();
      if (docModal) docModal.openDocInModal("docs/03_Shared_Responsibility_Matrix.md");
    };
  if (btnOpenNarr)
    btnOpenNarr.onclick = (e) => {
      e.preventDefault();
      if (docModal) docModal.openDocInModal("../chapters/11_Governance_Inherited_and_NA_Controls.md");
    };
  if (btnWrite) btnWrite.onclick = () => writeArtifact();
  if (search) search.oninput = () => render();

  return {
    open: () => {
      openModal();
      render();
    },
  };
}

function renderCloseoutSteps(control, progress, progressSetter, docModal) {
  const root = $("#closeoutSteps");
  if (!root) return;
  root.innerHTML = "";

  const cid = control.control_id;
  const p = getProgressEntry(progress, cid);
  const stepsState = p.closeout_steps || {};

  const status = normalize(control.pilot_status);
  const classification = normalize(control.classification);
  const clsNorm = classification.toLowerCase();
  const ev = control && control.evidence ? control.evidence : {};
  const regen = normalize(ev.regeneration_method);
  const ps1s = regen ? extractPs1Paths(regen) : [];

  const isSystem = clsNorm.includes("system-enforced");
  const isGov = clsNorm.includes("governance");
  const isInherited = clsNorm === "inherited";
  const isNa = clsNorm === "not applicable" || clsNorm === "n/a";

  const guidance = [];

  // 1) Evidence required (specific to this control)
  const reqBits = [];
  if (ev && ev.evidence_type) reqBits.push(`Type: ${ev.evidence_type}`);
  if (ev && ev.artifact_name) reqBits.push(`Artifact: ${ev.artifact_name}`);
  if (ev && ev.location) reqBits.push(`Location: ${ev.location}`);
  if (ev && ev.cadence) reqBits.push(`Cadence: ${ev.cadence}`);
  if (ev && ev.retention) reqBits.push(`Retention: ${ev.retention}`);
  if (ps1s.length) reqBits.push(`Collector(s): ${ps1s.map((p) => p.split("\\").slice(-1)[0]).join(", ")}`);
  if (!reqBits.length && regen) reqBits.push(`Regeneration: ${regen}`);
  if (!reqBits.length) reqBits.push("No evidence metadata present in dataset for this control.");
  guidance.push({
    id: "evidence_required",
    title: "Evidence required for this control",
    desc: reqBits.join(" · "),
    links: [{ label: "Evidence Index", doc: "../tables/EVIDENCE_INDEX.md" }],
  });

  // Add a specific CMVP reference helper for the FIPS control.
  if (normalize(control && control.control_id) === "SC.L2-3.13.11") {
    guidance.push({
      id: "fips_cmvp_refs",
      title: "CMVP validation references (FIPS)",
      desc:
        "Capture the CMVP certificate numbers + security policy PDFs for the Windows cryptographic modules in use, and store them in the evidence vault (attach path in Evidence refs).",
      links: [{ label: "FIPS / CMVP references", doc: "docs/05_FIPS_CMVP_REFERENCES.md" }],
    });
  }

  // 2) Current state + gaps (derived from live progress)
  const stateBits = [];
  if (p.linked_evidence_dir) stateBits.push(`Produced evidence: ${p.linked_evidence_dir}`);
  if (typeof p.validation_pass === "boolean") stateBits.push(`Validator: ${p.validation_pass ? "PASS" : "FAIL"}`);
  if (p.linked_validation_dir) stateBits.push(`Validation dir: ${p.linked_validation_dir}`);
  if (normalize(p.evidence_refs)) stateBits.push(`Evidence refs: set`);
  const failures = adjudicationPrereqFailures(control, progress);
  const gapDesc = failures.length ? `Missing: ${failures.join(" | ")}` : "No missing prerequisites detected for adjudication.";
  guidance.push({
    id: "current_gaps",
    title: "Current state (and what’s missing)",
    desc: (stateBits.length ? stateBits.join(" · ") + " · " : "") + gapDesc,
    links: [],
  });

  // 3) Next action (minimal, specific)
  let nextTitle = "Next action";
  let nextDesc = "";
  let nextLinks = [];

  if (isSystem) {
    if (p.validation_pass === true) {
      nextTitle = "Next action (system-enforced)";
      nextDesc = "If evidence is hashed and stored, you can adjudicate this control from PASS (or attach assessor notes and adjudicate).";
    } else {
      nextTitle = "Next action (system-enforced)";
      nextDesc = ps1s.length
        ? `Run collector(s), then run validation, then Ingest. Collectors: ${ps1s.map((p) => p.split("\\").slice(-1)[0]).join(", ")}.`
        : "Run evidence collection + validation, then Ingest the latest run.";
    }
    nextLinks = [
      { label: "Windows 2025 evidence pack", doc: "../WINDOWS2025_OS_EVIDENCE_PACK.md" },
      { label: "Evidence runbook", doc: "../README_WINDOWS2025_EVIDENCE_RUNBOOK.md" },
    ];
  } else if (isGov || basisSuggestsOperationalRecordsMissing(control)) {
    nextTitle = "Next action (operational records)";
    nextDesc =
      "Attach the operational record(s) for this control under C:\\evidence, then paste the path(s) into Evidence refs and adjudicate.";
    nextLinks = [
      { label: "Governance annual review & sign-off", doc: "docs/02_Governance_Annual_Review.md" },
      { label: "Policies & SOP review checklist", doc: "docs/04_Policies_and_SOP_Review.md" },
    ];
  } else if (isInherited) {
    nextTitle = "Next action (inherited)";
    nextDesc = "Open Step 2 SRM: verify this inherited control, record provider/customer evidence refs, sign SRM review, then adjudicate.";
    nextLinks = [{ label: "Shared Responsibility Matrix (SRM)", doc: "docs/03_Shared_Responsibility_Matrix.md" }];
  } else if (isNa) {
    nextTitle = "Next action (N/A)";
    nextDesc =
      "Open Step 2 SRM: attest N/A applicability, record justification ref, sign N/A attestation, then adjudicate (N/A is still an adjudicated decision).";
    nextLinks = [{ label: "Governance/Inherited/N-A narrative", doc: "../chapters/11_Governance_Inherited_and_NA_Controls.md" }];
  } else {
    nextDesc = "Use the Evidence Index entry for this control, collect/retain the listed artifacts, then adjudicate with evidence refs + notes.";
    nextLinks = [{ label: "Evidence closeout workflow", doc: "docs/01_Evidence_Closeout_Workflow.md" }];
  }

  guidance.push({ id: "next_action", title: nextTitle, desc: nextDesc, links: nextLinks });

  // 4) Optional: if already adjudicated, show what the app is relying on.
  if (p.adjudicated) {
    const b = [];
    if (isSystem) b.push(p.validation_pass === true ? "Validator PASS" : "Validator not PASS");
    if (isSystem) b.push(p.evidence_hashed === true ? "Evidence hashed" : "Evidence not hashed");
    if (normalize(p.linked_evidence_dir)) b.push(`Evidence dir: ${p.linked_evidence_dir}`);
    if (normalize(p.linked_validation_dir)) b.push(`Validation dir: ${p.linked_validation_dir}`);
    if (normalize(p.evidence_refs)) b.push("Evidence refs present");
    guidance.push({
      id: "adjudication_basis",
      title: "Adjudication basis (what’s being claimed)",
      desc: b.length ? b.join(" · ") : "Adjudicated in progress, but no basis details recorded.",
      links: [],
    });
  }

  for (const g of guidance) {
    const row = document.createElement("div");
    row.className = "step";
    const checked = !!stepsState[g.id];
    row.innerHTML = `
      <input type="checkbox" ${checked ? "checked" : ""} />
      <div>
        <div class="t">${esc(g.title)}</div>
        <div class="d">${esc(g.desc)}</div>
        <div class="meta"></div>
      </div>
    `;
    const cb = row.querySelector("input");
    cb.onchange = () => {
      const next = { ...(stepsState || {}), [g.id]: cb.checked };
      progressSetter(cid, { closeout_steps: next, updated_utc: new Date().toISOString() });
    };
    const meta = row.querySelector(".meta");
    for (const l of g.links || []) {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = l.label;
      a.onclick = (e) => {
        e.preventDefault();
        if (l.doc) docModal.openDocInModal(l.doc);
      };
      meta.appendChild(a);
    }
    root.appendChild(row);
  }
}

function ensureEvidenceOverrides(p0) {
  const p = p0 && typeof p0 === "object" ? { ...(p0 || {}) } : {};
  p.__evidence_overrides =
    p.__evidence_overrides && typeof p.__evidence_overrides === "object" ? { ...(p.__evidence_overrides || {}) } : {};
  return p;
}

function getEvidenceLocationOverride(progress, controlId) {
  try {
    const p = ensureEvidenceOverrides(progress || {});
    const ov = p.__evidence_overrides && p.__evidence_overrides[controlId] ? p.__evidence_overrides[controlId] : null;
    if (!ov || typeof ov !== "object") return "";
    return normalize(ov.location || "");
  } catch {
    return "";
  }
}

function setEvidenceLocationOverride(progress, controlId, location) {
  const next = ensureEvidenceOverrides(progress || {});
  next.__evidence_overrides[controlId] = {
    location: normalize(location || ""),
    updated_utc: new Date().toISOString(),
  };
  return next;
}

function renderControl(control, progress, progressSetter, docModal, fileModal) {
  $("#welcome").classList.add("hidden");
  $("#controlCard").classList.remove("hidden");

  setText("#controlId", control.control_id);
  setText("#controlTitle", control.title);
  setText("#pillFamily", control.family);
  setText("#pillClass", control.classification);
  setText("#pillDomain", control.implementation_domain ? `domain:${control.implementation_domain}` : "domain:—");
  setText("#pillResp", control.responsibility ? `resp:${control.responsibility}` : "resp:—");
  const pillStatus = $("#pillStatus");
  const eff = effectiveStatusLabel(control, progress);
  pillStatus.textContent = esc(eff);
  pillStatus.className = `pill pill-status ${statusPillClass(eff)}`;

  // NOTE: renderControl is a top-level function and cannot see the `getProgress`/`setProgressBulk` closures
  // created later in `loadManualApp()`. Always work from the passed `progress` + `progressSetter`.
  let pLocal = progress && typeof progress === "object" ? progress : {};

  // Live status uses NIST requirement ID (e.g., "3.13.16"), not the CMMC control code (e.g., "SC.L2-3.13.16").
  const cid = String(control.control_id || ""); // progress key
  const nistId =
    normalize(control && control.nist_req_id ? control.nist_req_id : "") ||
    ((String(control.control_id || "").match(/(\d+\.\d+\.\d+)\s*$/) || [])[1] || "");
  const pillLive = $("#pillLive");
  let liveEntry = nistId ? getLiveAuditEntry(nistId) : null;
  const useLive = getUseLiveState();
  const updatePillLive = (entry) => {
    if (!pillLive) return;
    if (!useLive) {
      pillLive.textContent = "live: off";
      return;
    }
    if (!entry || !entry.result) {
      pillLive.textContent = "live: (not loaded)";
      return;
    }
    const r = entry.result || {};
    const vstat = normalize(r.verificationStatus) || "—";
    const score = typeof r.complianceScore === "number" ? `${r.complianceScore}%` : "—";
    pillLive.textContent = `live: ${vstat} (${score})`;
  };
  if (pillLive) {
    updatePillLive(liveEntry);
  }

  // Live validation command helper (assessment-day "show me" command)
  try {
    const card = $("#liveValidationCard");
    const shellEl = $("#liveValidationShell");
    const cmdEl = $("#liveValidationCommand");
    const expEl = $("#liveValidationExpected");
    const copyStatusEl = $("#liveValidationCopyStatus");
    const btnCopy = $("#btnCopyLiveValidation");
    const v = getLiveValidationCommandForNistReqId(nistId);

    if (card) {
      if (!v || !normalize(v.command)) {
        card.classList.add("hidden");
      } else {
        card.classList.remove("hidden");
        if (shellEl) shellEl.textContent = esc(String(v.shell || "cmd").toUpperCase());
        if (cmdEl) cmdEl.textContent = String(v.command || "");
        if (expEl) expEl.textContent = v.expected ? `Expected: ${String(v.expected)}` : "";
        if (copyStatusEl) copyStatusEl.textContent = " ";
        if (btnCopy) {
          btnCopy.onclick = async () => {
            const ok = await copyToClipboard(String(v.command || ""));
            if (copyStatusEl) copyStatusEl.textContent = ok ? "Copied." : "Copy failed (browser restrictions).";
          };
        }
      }
    }
  } catch {}

  const basisEl = $("#statusBasis");
  const p = getProgressEntry(pLocal, control.control_id);
  const base = normalize(control.pilot_status_basis) || "(no basis text present)";
  renderTextWithEvidenceLinks(basisEl, base, fileModal);

  // NIST text + guidance (if available)
  const nistExact = $("#nistExactText");
  if (nistExact) renderTextWithEvidenceLinks(nistExact, normalize(control.nist_exact_text) || "(not available in dataset)", fileModal);
  const nistGuid = $("#nistGuidance");
  if (nistGuid) renderTextWithEvidenceLinks(nistGuid, normalize(control.nist_discussion_guidance) || "(not available in dataset)", fileModal);

  const ev = control.evidence || {};
  setText("#evType", ev.evidence_type || "(not set)");
  setText("#evArtifact", ev.artifact_name || "(not set)");
  setText("#evOwner", ev.owner_role || control.owner_role || "(not set)");
  // Evidence location can be overridden per-control in local progress (useful when bundles rotate).
  const overrideLoc = cid ? getEvidenceLocationOverride(progress, cid) : "";
  const locToShow = overrideLoc || ev.location || "(not set)";
  // Linkify any C:\ evidence locations if present.
  renderTextWithEvidenceLinks($("#evLocation"), locToShow, fileModal);
  // Where to view on VM: linkify paths so evidence root and README are clickable.
  const vmPathEl = $("#evVmPath");
  if (vmPathEl) {
    const vmPathText =
      "C:\\evidence\\ — open the latest CUI-Evidence-<RunId> folder for artifacts; CUI-Validation-<RunId> for validation results. See C:\\evidence\\README-for-auditor.txt.";
    renderTextWithEvidenceLinks(vmPathEl, vmPathText, fileModal);
  }
  // Linked run: show linked dirs as clickable links; when not linked, still offer clickable default evidence paths.
  const linkedParts = [];
  if (p.linked_evidence_dir) linkedParts.push(`Evidence: ${p.linked_evidence_dir}`);
  if (p.linked_validation_dir) linkedParts.push(`Validation: ${p.linked_validation_dir}`);
  const linkedText = linkedParts.length
    ? linkedParts.join("\n")
    : "(not linked). Open evidence root: C:\\evidence\\ or README: C:\\evidence\\README-for-auditor.txt.";
  renderTextWithEvidenceLinks($("#evLinked"), linkedText, fileModal);
  setText("#evCadence", ev.cadence || "(not set)");
  setText("#evRetention", ev.retention || "(not set)");
  setText("#evRegen", ev.regeneration_method || "(not set)");
  renderEvidenceActions(control, fileModal);

  // Control-based artifacts: fetch control_evidence_index.json and show per-control artifact links when available
  const evControlArtifactsEl = $("#evControlArtifacts");
  if (evControlArtifactsEl) {
    evControlArtifactsEl.textContent = "—";
    const evidenceDir = p.linked_evidence_dir ? String(p.linked_evidence_dir).replace(/\//g, "\\") : "";
    const cid = control.control_id;
    if (evidenceDir && cid) {
      const evidenceRoot = evidenceDir.replace(/\\[^\\]+$/, ""); // parent of CUI-Evidence-<RunId>
      const indexPath = evidenceRoot + "\\control_evidence_index.json";
      evControlArtifactsEl.textContent = "Loading…";
      fetch("/__fs?path=" + encodeURIComponent(indexPath), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((obj) => {
          if (!obj || obj.kind !== "file" || typeof obj.textContent !== "string") {
            evControlArtifactsEl.textContent = "—";
            return;
          }
          try {
            const index = JSON.parse(obj.textContent);
            const entry = index.controls && index.controls[cid];
            if (!entry || !Array.isArray(entry.artifact_paths)) {
              evControlArtifactsEl.textContent = "—";
              return;
            }
            const frag = document.createDocumentFragment();
          if (entry.manifest_path) {
            const a = document.createElement("a");
            a.href = "#";
            a.textContent = "manifest.json";
            a.onclick = (e) => { e.preventDefault(); fileModal.openPath(entry.manifest_path); };
            frag.appendChild(a);
            frag.appendChild(document.createTextNode(" · "));
          }
          entry.artifact_paths.forEach((path, i) => {
            if (i) frag.appendChild(document.createTextNode(" "));
            const a = document.createElement("a");
            a.href = "#";
            a.textContent = path.split(/[/\\]/).pop() || path;
            a.onclick = (e) => { e.preventDefault(); fileModal.openPath(path); };
            frag.appendChild(a);
          });
          evControlArtifactsEl.textContent = "";
          evControlArtifactsEl.appendChild(frag);
          } catch {
            evControlArtifactsEl.textContent = "—";
          }
        })
        .catch(() => { evControlArtifactsEl.textContent = "—"; });
    }
  }

  // Live implementation card population + actions
  try {
    const chk = $("#chkUseLiveState");
    if (chk) {
      chk.checked = !!useLive;
      chk.onchange = () => {
        setUseLiveState(!!chk.checked);
        try {
          tryRerender();
        } catch {}
      };
    }

    const setLiveText = (id, v) => setText(id, v || "—");
    const setLiveIssues = (txt) => {
      const el = $("#liveIssues");
      if (!el) return;
      renderTextWithEvidenceLinks(el, normalize(txt) || "(none)", fileModal);
    };
    const setLiveEvidenceLocation = (txt) => {
      const el = $("#liveEvidenceLocation");
      if (!el) return;
      renderTextWithEvidenceLinks(el, normalize(txt) || "—", fileModal);
    };

    const renderLiveFromCache = () => {
      liveEntry = nistId ? getLiveAuditEntry(nistId) : null;
      updatePillLive(liveEntry);
      if (liveEntry && liveEntry.result) {
        const r = liveEntry.result || {};
        setLiveText("#liveVerifiedStatus", normalize(r.verifiedStatus) || "—");
        setLiveText("#liveVerificationStatus", normalize(r.verificationStatus) || "—");
        setLiveText(
          "#liveComplianceScore",
          typeof r.complianceScore === "number" ? `${r.complianceScore}%` : normalize(r.complianceScore) || "—"
        );
        setLiveText("#liveGeneratedAt", normalize(liveEntry.generatedAt) || normalize(r.lastVerified) || "—");
        setLiveIssues(Array.isArray(r.issues) ? r.issues.join("\n") : normalize(r.issues) || "");
        // Default: no live evidence location unless a pull-evidence workflow has populated it.
        const pe = getProgressEntry(pLocal, cid);
        const liveLoc = pe && pe.__live_evidence_location ? String(pe.__live_evidence_location) : "";
        // Fallback: show the Evidence Card location (what the control points to) as the "live" evidence location.
        // This is especially important when the evidence file is kept fresh by the run workflow (e.g., CUI-Evidence-LATEST).
        const evCardPath = extractFirstWindowsEvidencePath(locToShow);
        setLiveEvidenceLocation(liveLoc || evCardPath || "—");
      } else {
        setLiveText("#liveVerifiedStatus", "—");
        setLiveText("#liveVerificationStatus", useLive ? "(not loaded)" : "(off)");
        setLiveText("#liveComplianceScore", "—");
        setLiveText("#liveGeneratedAt", "—");
        setLiveIssues("");
        setLiveEvidenceLocation("—");
      }
    };
    renderLiveFromCache();

    // Live validation command (terminal)
    try {
      const card = $("#liveValidationCard");
      const shellEl = $("#liveValidationShell");
      const cmdEl = $("#liveValidationCommand");
      const expEl = $("#liveValidationExpected");
      const stEl = $("#liveValidationCopyStatus");
      const btnCopy = $("#btnCopyLiveValidation");
      if (stEl) stEl.textContent = " ";

      const lv = getLiveValidationCommand(nistId);
      if (!card || !shellEl || !cmdEl || !expEl || !btnCopy) {
        // no-op (missing DOM)
      } else if (!lv || !normalize(lv.command)) {
        card.classList.add("hidden");
      } else {
        card.classList.remove("hidden");
        shellEl.textContent = `shell: ${normalize(lv.shell) || "powershell"}`;
        cmdEl.textContent = String(lv.command || "");
        expEl.textContent = lv.expected ? `Expected: ${lv.expected}` : "";
        btnCopy.onclick = async () => {
          const ok = await copyToClipboard(lv.command || "");
          if (stEl) stEl.textContent = ok ? "Copied." : "Copy failed (browser restrictions).";
          try {
            clearTimeout(btnCopy._t);
          } catch {}
          btnCopy._t = setTimeout(() => {
            try {
              if (stEl) stEl.textContent = " ";
            } catch {}
          }, 2500);
        };
      }
    } catch {}

    const st = $("#liveControlStatus");
    const setSt = (m) => {
      if (st) st.textContent = m ? String(m) : " ";
    };

    const refreshIntoProgress = async (ids) => {
      const data = await fetchLiveControlAudit(ids);
      mergeLiveAuditResults(data.results || [], data.generatedAt);
      renderLiveFromCache();
    };

    const btnOne = $("#btnLiveRefreshControl");
    if (btnOne) {
      btnOne.onclick = async () => {
        if (!cid || !nistId) return;
        setSt("Refreshing live state for this control…");
        try {
          // For BitLocker, also sync the Evidence Card's exact file path (if it's a CUI-Evidence-* bitlocker-status.txt).
          if (String(nistId) === "3.13.16") {
            const m = String(locToShow || "").match(/C:\\evidence\\CUI-Evidence-(?:\d{8}-\d{6}|LATEST)\\bitlocker-status\.txt/i);
            const target = m && m[0] ? String(m[0]) : "";
            setSt(target ? "Pulling BitLocker evidence + syncing Evidence Card file…" : "Pulling BitLocker evidence…");
            await pullLiveEvidence(nistId, target ? { targetPaths: [target] } : undefined);
          }
          // For software inventory (3.4.9), sync installed-software evidence files into the Evidence Card paths (if present).
          if (String(nistId) === "3.4.9") {
            const m = String(locToShow || "").match(/C:\\evidence\\CUI-Evidence-(?:\d{8}-\d{6}|LATEST)\\installed-software(?:-hashes-sha256)?\.(?:txt|json)/ig);
            const targets = m && m.length ? Array.from(new Set(m.map((s) => String(s)))) : [];
            setSt(targets.length ? "Pulling software inventory + syncing Evidence Card files…" : "Pulling software inventory…");
            await pullLiveEvidence(nistId, targets.length ? { targetPaths: targets } : undefined);
          }
          await refreshIntoProgress([nistId]);
          setSt("Live state refreshed.");
          tryRerender();
        } catch (e) {
          setSt(`Live refresh failed: ${e && e.message ? e.message : String(e)}`);
        }
      };
    }

    const btnAll = $("#btnLiveRefreshAll");
    if (btnAll) {
      btnAll.onclick = async () => {
        setSt("Refreshing live state for all controls (full audit)…");
        try {
          await refreshIntoProgress([]);
          setSt("Live state refreshed (all controls).");
          tryRerender();
        } catch (e) {
          setSt(`Live refresh failed: ${e && e.message ? e.message : String(e)}`);
        }
      };
    }

    const btnPullAll = $("#btnPullAllEvidence");
    if (btnPullAll) {
      btnPullAll.onclick = async () => {
        setSt("Pulling ALL live evidence from VM…");
        try {
          const data = await pullLiveEvidenceAll();

          // If this pull updated Windows workspace verification, update Evidence Card locations for any controls that
          // reference dated windows-workspace/verification bundles.
          const stableRefs = (data && data.evidence && data.evidence.stableRefs) || [];
          const stableJson = stableRefs.find((s) => String(s).endsWith("windows-workspace-evidence.json")) || "";
          const stableBitlocker = stableRefs.find((s) => String(s).endsWith("bitlocker-status.txt")) || "";
          const stableInstalledSoftware = stableRefs.find((s) => String(s).endsWith("installed-software.txt")) || "";

          if (stableJson || stableBitlocker) {
            let next = pLocal;
            for (const c of (window.__controls_dataset || [])) {
              const cid0 = c && (c.control_id || c.controlId || c.id);
              const cid = String(cid0 || "").trim();
              if (!cid) continue;
              const evLoc = c && c.evidence && c.evidence.location ? String(c.evidence.location) : "";
              const refs = `${evLoc}`.trim();
              const nist0 = c && (c.nist_req_id || c.nistReqId || c.nist_id || c.nistId);
              const nist = String(nist0 || "").trim();

              // Heuristic: if the control references the dated Windows workspace evidence bundle, pin it to the stable current JSON.
              if (stableJson && /windows-workspace\/verification\/\d{4}-\d{2}-\d{2}\/windows-workspace-evidence\.json/i.test(refs)) {
                next = setEvidenceLocationOverride(next, cid, stableJson);
              }

              // If control is BitLocker (3.13.16), prefer stable bitlocker-status if available.
              if (nist === "3.13.16" && stableBitlocker) {
                next = setEvidenceLocationOverride(next, cid, stableBitlocker);
              }

              // If control is software inventory (3.4.9), prefer stable installed-software inventory if available.
              if (nist === "3.4.9" && stableInstalledSoftware) {
                next = setEvidenceLocationOverride(next, cid, stableInstalledSoftware);
              }
            }
            pLocal = next;
            progressSetter("__bulk", next);
          }

          setSt("Evidence pulled. Refreshing live audit for all controls…");
          await refreshIntoProgress([]);
          setSt("All evidence + live audit refreshed.");
          tryRerender();
        } catch (e) {
          setSt(`Pull ALL evidence failed: ${e && e.message ? e.message : String(e)}`);
        }
      };
    }

    // Full evidence + validation workflow (writes CUI-Evidence-* and CUI-Validation-* under C:\evidence).
    const btnRunBoth = $("#btnRunEvidenceValidationAdmin");
    if (btnRunBoth) {
      btnRunBoth.onclick = async () => {
        setSt("Preparing elevated launcher for evidence+validation…");
        try {
          const runBothScript = "C:\\hardening\\codex-scripts\\Run-CuiBulkEvidenceAndValidate.ps1";
          downloadRunElevatedLauncherForScripts([runBothScript], "evidence+validation");
          setSt("Downloaded elevated launcher (.cmd). Run it on the VM (UAC prompt), then click “Ingest latest run”.");
        } catch (e) {
          setSt(`Run launcher failed: ${e && e.message ? e.message : String(e)}`);
        }
      };
    }

    const btnIngest = $("#btnIngestLatestRun");
    if (btnIngest) {
      btnIngest.onclick = async () => {
        setSt("Ingesting latest CUI-Evidence / CUI-Validation run…");
        try {
          const dirs = await getLatestRunDirsFromDisk();
          if (!dirs.validationDirName) throw new Error("No CUI-Validation-* directory found yet. Run evidence+validation first.");
          if (!dirs.evidenceDirName) throw new Error("Could not determine matching CUI-Evidence-* for the latest validation run.");
          const validationDir = `C:\\evidence\\${dirs.validationDirName}`;
          const evidenceDir = `C:\\evidence\\${dirs.evidenceDirName}`;
          const res = await ingestEvidenceRunIntoProgress({ evidenceDir, validationDir }, window.__controls_dataset || [], () => pLocal, (obj) => {
            pLocal = obj;
            progressSetter("__bulk", obj);
          });
          setSt(`Ingested ${dirs.validationDirName}: updated ${res.updated} controls; auto-adjudicated ${res.adjudicated}; hashes=${res.hasHashes ? "yes" : "no"}.`);
          tryRerender();
        } catch (e) {
          setSt(
            `Ingest failed: ${e && e.message ? e.message : String(e)}\n\n` +
              `Tip: ingest requires the manual to be opened via the local Codex server (so /__fs can access C:\\evidence).`
          );
        }
      };
    }

    // Pull evidence workflow (currently implemented for BitLocker / 3.13.16).
    // This writes a fresh evidence file on the VM and updates the Evidence Card location automatically.
    if (useLive && nistId === "3.13.16") {
      const root = $("#liveControlCard");
      if (root && !$("#btnPullLiveEvidence")) {
        const row = document.createElement("div");
        row.className = "actionRow";
        row.setAttribute("style", "margin-top:10px");
        row.innerHTML = `
          <button id="btnPullLiveEvidence" class="btn">Pull BitLocker evidence + update Evidence card</button>
        `;
        root.appendChild(row);
        const b = $("#btnPullLiveEvidence");
        if (b) {
          b.onclick = async () => {
            setSt("Pulling live BitLocker evidence on VM…");
            try {
              const m = String(locToShow || "").match(/C:\\evidence\\CUI-Evidence-(?:\d{8}-\d{6}|LATEST)\\bitlocker-status\.txt/i);
              const target = m && m[0] ? String(m[0]) : "";
              const data = await pullLiveEvidence(nistId, target ? { targetPaths: [target] } : undefined);
              const ev = data && data.evidence ? data.evidence : null;
              const stableRefs = ev && ev.stableRefs && Array.isArray(ev.stableRefs) ? ev.stableRefs : [];
              const stableBitlocker = stableRefs.find((s) => String(s).endsWith("bitlocker-status.txt")) || "";
              const filePath = stableBitlocker ? String(stableBitlocker) : "";
              const evDir = ev && ev.snapshotEvidenceDir ? String(ev.snapshotEvidenceDir) : "";

              // Update evidence location override so Evidence Card Location updates immediately.
              const next = setEvidenceLocationOverride(pLocal, cid, filePath || evDir);
              // Also store a breadcrumb for the live evidence location display.
              const pe = getProgressEntry(next, cid);
              const merged = {
                ...(pe || {}),
                __live_evidence_location: filePath || evDir,
                linked_evidence_dir: evDir || (pe && pe.linked_evidence_dir) || "",
                updated_utc: new Date().toISOString(),
              };
              next[cid] = merged;
              pLocal = next;
              progressSetter("__bulk", next);

              // If server returned an audit object, cache it too.
              if (data && data.audit) {
                mergeLiveAuditResults([data.audit], data.generatedAt);
              }

              setSt("Pulled evidence and updated Evidence card location.");
              tryRerender();
            } catch (e) {
              setSt(`Pull evidence failed: ${e && e.message ? e.message : String(e)}`);
            }
          };
        }
      }
    }

    // Auto-refresh once per control view when live is enabled and cache is empty.
    if (useLive && nistId && (!liveEntry || !liveEntry.result)) {
      const key = `__live_fetch_${nistId}`;
      if (!window[key]) {
        window[key] = true;
        setTimeout(async () => {
          try {
            await refreshIntoProgress([nistId]);
            try { tryRerender(); } catch {}
          } catch (e) {
            try {
              setSt(`Live auto-refresh failed: ${e && e.message ? e.message : String(e)}`);
            } catch {}
          }
        }, 50);
      }
    }
  } catch {}

  // Append inline override editor to evidenceActions.
  try {
    const root = $("#evidenceActions");
    if (root && cid) {
      const cur = overrideLoc || "";
      const box = document.createElement("div");
      box.className = "subcard";
      box.setAttribute("style", "margin-top:10px");
      box.innerHTML = `
        <div class="subcard-title">Evidence location override (local)</div>
        <div class="callout subtle" style="margin-top:0">
          Use this when your evidence bundle path changes (new collector run) but the dataset still points at an older bundle.
          This is stored in this browser's manual progress only.
        </div>
        <div class="actionRow" style="margin-top:10px">
          <input id="evLocOverrideInput" class="input mono" style="min-width:280px; flex:1" placeholder="VM: C:\\evidence\\CUI-Evidence-YYYYMMDD-HHMMSS\\bitlocker-status.txt" value="${esc(cur)}" />
          <button id="btnEvLocOverrideSave" class="btn">Save override</button>
          <button id="btnEvLocOverrideClear" class="btn btn-secondary">Clear</button>
        </div>
        <div class="muted" id="evLocOverrideStatus" style="margin-top:8px"> </div>
      `;
      root.appendChild(box);

      const st = $("#evLocOverrideStatus");
      const setSt = (m) => {
        if (st) st.textContent = m ? String(m) : " ";
      };
      const inp = $("#evLocOverrideInput");
      const btnSave = $("#btnEvLocOverrideSave");
      const btnClear = $("#btnEvLocOverrideClear");
      if (btnSave) {
        btnSave.onclick = () => {
          const val = normalize(inp && inp.value ? inp.value : "");
          // Local-only override stored in progress.
          progressSetter("__bulk", setEvidenceLocationOverride(pLocal, cid, val));
          setSt(val ? "Saved override." : "Saved (empty override).");
          try {
            tryRerender();
          } catch {}
        };
      }
      if (btnClear) {
        btnClear.onclick = () => {
          const p0 = ensureEvidenceOverrides(pLocal);
          try {
            delete p0.__evidence_overrides[cid];
          } catch {}
          progressSetter("__bulk", p0);
          setSt("Cleared override.");
          try {
            tryRerender();
          } catch {}
        };
      }
    }
  } catch {}

  // Intent & demonstration summary (per-control)
  const demoEl = $("#intentDemo");
  if (demoEl) {
    const bits = [];
    const intent = normalize(control.intent_plain) || normalize(control.title) || "";
    if (intent) bits.push(`Intent (interpreted): ${intent}`);
    if (normalize(control.implementation_summary)) bits.push(`How satisfied: ${control.implementation_summary}`);
    if (control.implementation_domain) bits.push(`Implementation domain: ${control.implementation_domain}`);
    if (control.responsibility || control.inheritance_source) {
      const src = control.inheritance_source ? ` (${control.inheritance_source})` : "";
      bits.push(`Responsibility: ${control.responsibility || "(unspecified)"}${src}`);
    }
    if (ev && ev.artifact_name) bits.push(`Primary artifact: ${ev.artifact_name}`);
    if (ev && ev.location) bits.push(`Expected location: ${ev.location}`);
    if (p.linked_evidence_dir) bits.push(`Produced evidence: ${p.linked_evidence_dir}`);
    if (typeof p.validation_pass === "boolean") {
      const v = p.validation_pass ? "PASS" : "FAIL";
      bits.push(`Validator result: ${v}`);
      if (!p.validation_pass && p.validation_failed_check_ids && p.validation_failed_check_ids.length) {
        bits.push(`Failed checks: ${p.validation_failed_check_ids.join(", ")}`);
      }
    } else if (p.linked_validation_dir) {
      bits.push(`Validator: linked at ${p.linked_validation_dir}`);
    }
    const txt = bits.length ? bits.join("\n\n") : "(not available)";
    renderTextWithEvidenceLinks(demoEl, txt, fileModal);
  }

  const refs = control.references || {};
  const evidenceIndexHref = `../${refs.evidence_index_path || "tables/EVIDENCE_INDEX.md"}`;
  const mappingHref = `../${refs.mapping_path || "tables/CONTROL_MAPPING_800-171R2.md"}`;
  const narrative10Href = `../chapters/10_System_Enforced_Controls_by_Family.md`;
  const narrative11Href = `../chapters/11_Governance_Inherited_and_NA_Controls.md`;
  setHref("#lnkEvidenceIndex", evidenceIndexHref);
  setHref("#lnkMapping", mappingHref);
  setHref("#lnkNarrative10", narrative10Href);
  setHref("#lnkNarrative11", narrative11Href);

  bindClick("#lnkEvidenceIndex", (e) => {
    e.preventDefault();
    docModal.openDocInModal(evidenceIndexHref);
  });
  bindClick("#lnkMapping", (e) => {
    e.preventDefault();
    docModal.openDocInModal(mappingHref);
  });
  bindClick("#lnkNarrative10", (e) => {
    e.preventDefault();
    docModal.openDocInModal(narrative10Href);
  });
  bindClick("#lnkNarrative11", (e) => {
    e.preventDefault();
    docModal.openDocInModal(narrative11Href);
  });

  const checklistRoot = $("#checklist");
  checklistRoot.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    const field = cb.getAttribute("data-field");
    cb.checked = !!p[field];
    cb.onchange = () => {
      if (field === "adjudicated" && cb.checked) {
        const failures = adjudicationPrereqFailures(control, progress);
        if (failures.length) {
          alert(
            `Cannot mark adjudicated yet. Evidence prerequisites missing:\n\n- ${failures.join("\n- ")}\n\nFix the items above (or leave control Open).`
          );
          cb.checked = false;
          return;
        }
      }
      progressSetter(control.control_id, { [field]: cb.checked, updated_utc: new Date().toISOString() });
    };
  });

  const evRefsEl = $("#evidenceRefs");
  if (evRefsEl) {
    evRefsEl.value = p.evidence_refs || "";
    let t = null;
    evRefsEl.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        progressSetter(control.control_id, { evidence_refs: evRefsEl.value, updated_utc: new Date().toISOString() });
      }, 250);
    };
  }

  const notesEl = $("#notes");
  notesEl.value = p.notes || "";
  let notesTimer = null;
  notesEl.oninput = () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      progressSetter(control.control_id, { notes: notesEl.value, updated_utc: new Date().toISOString() });
    }, 250);
  };

  renderCloseoutSteps(control, progress, progressSetter, docModal);
}

function renderAttestationList(progress) {
  const root = $("#attestationList");
  if (!root) return;
  const atts = (progress && progress.__attestations && Array.isArray(progress.__attestations) ? progress.__attestations : []).slice();
  atts.sort((a, b) => String(b.created_utc || "").localeCompare(String(a.created_utc || "")));
  if (!atts.length) {
    root.innerHTML = `<div class="list-empty">No attestations yet.</div>`;
    return;
  }
  root.innerHTML = atts
    .slice(0, 8)
    .map((a) => {
      const who = `${esc(a.name || "")}${a.title ? " · " + esc(a.title) : ""}${a.org ? " · " + esc(a.org) : ""}`;
      const when = esc(a.created_utc || "");
      const scope = esc(a.scope || "onboarding");
      return `<div class="item" style="cursor:default">
        <div class="left">
          <div class="cid">${scope}</div>
          <div class="meta">${when}</div>
        </div>
        <div class="right">
          <div class="title">${who || "(unknown signer)"}</div>
          <div class="tags">
            <span class="pill pill-good">attested</span>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function buildAttestationMarkdown(progress, governanceDocs) {
  const atts = progress && progress.__attestations && Array.isArray(progress.__attestations) ? progress.__attestations : [];
  const docs = governanceDocs && Array.isArray(governanceDocs) ? governanceDocs : [];
  const docById = {};
  for (const d of docs) {
    if (d && d.id) docById[String(d.id)] = d;
  }
  const docSignoffs =
    progress && progress.__doc_signoffs && typeof progress.__doc_signoffs === "object" ? progress.__doc_signoffs : {};
  const docSignoffsByCode =
    progress && progress.__doc_signoffs_by_code && typeof progress.__doc_signoffs_by_code === "object"
      ? progress.__doc_signoffs_by_code
      : {};

  const fmtDoc = (docId) => {
    const d = docById[String(docId || "")] || null;
    if (!d) return { code: "", title: "", kind: "", id: String(docId || "") };
    return { code: normalize(d.code), title: normalize(d.title), kind: normalize(d.kind), id: String(d.id) };
  };
  const sortDocKey = (d) => `${normalize(d.code).toUpperCase()}|${normalize(d.title)}`;

  const lines = [];
  lines.push("# Trust Codex Manual — Attestations");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Document-by-document signoffs inventory (assessor-friendly).
  {
    lines.push("## Document sign-offs (per document)");
    lines.push("");
    lines.push(
      "This section enumerates each governance document and the signed record stored under `C:\\evidence` (per-document sign-off JSON/MD)."
    );
    lines.push("");

    const renderDocTable = (kindLower, heading) => {
      const subset = docs.length
        ? docs
            .filter((d) => normalize(d.kind).toLowerCase() === kindLower)
            .slice()
            .sort((a, b) => sortDocKey(a).localeCompare(sortDocKey(b)))
        : [];
      lines.push(`### ${heading}`);
      lines.push("");
      lines.push("| Code | Title | Signed (UTC) | Signer | Record JSON |");
      lines.push("|------|-------|--------------|--------|-------------|");
      if (subset.length) {
        for (const d of subset) {
          const s = getDocSignoff(progress, d.id);
          const signer = s ? normalize(s.name) || "" : "";
          const signed = s ? normalize(s.signed_utc) || "" : "";
          const jsonp = s ? normalize(s.record_json_path) || "" : "";
          const code = normalize(d.code) || "";
          const title = normalize(d.title) || "";
          lines.push(`| ${code} | ${title} | ${signed || ""} | ${signer || ""} | ${jsonp ? `\`${jsonp}\`` : ""} |`);
        }
      } else {
        // Fallback: if governance manifest isn't available, render whatever doc signoffs we have by code.
        const rows = [];
        for (const [codeRaw, rec] of Object.entries(docSignoffsByCode || {})) {
          const code = normalize(codeRaw) || (rec && rec.doc_code ? normalize(rec.doc_code) : "");
          const title = ""; // manifest not available
          const signer = rec && typeof rec === "object" ? normalize(rec.name) : "";
          const signed = rec && typeof rec === "object" ? normalize(rec.signed_utc) : "";
          const jsonp = rec && typeof rec === "object" ? normalize(rec.record_json_path) : "";
          if (!code && !signed && !signer) continue;
          rows.push({ code, title, signed, signer, jsonp });
        }
        rows.sort((a, b) => normalize(a.code).toUpperCase().localeCompare(normalize(b.code).toUpperCase()));
        for (const r of rows) {
          lines.push(`| ${r.code} | ${r.title} | ${r.signed || ""} | ${r.signer || ""} | ${r.jsonp ? `\`${r.jsonp}\`` : ""} |`);
        }
      }
      lines.push("");
    };

    renderDocTable("policy", "Policies");
    renderDocTable("procedure", "SOPs / Procedures");
    // Supporting docs are anything not explicitly classified as Policy or Procedure.
    {
      const subset = docs.length
        ? docs
            .filter((d) => {
              const k = normalize(d.kind).toLowerCase();
              return k && k !== "policy" && k !== "procedure";
            })
            .slice()
            .sort((a, b) => sortDocKey(a).localeCompare(sortDocKey(b)))
        : [];
      lines.push("### Plans / Forms / Other (Supporting)");
      lines.push("");
      lines.push("| Code | Title | Signed (UTC) | Signer | Record JSON |");
      lines.push("|------|-------|--------------|--------|-------------|");
      for (const d of subset) {
        const s = getDocSignoff(progress, d.id);
        const signer = s ? normalize(s.name) || "" : "";
        const signed = s ? normalize(s.signed_utc) || "" : "";
        const jsonp = s ? normalize(s.record_json_path) || "" : "";
        const code = normalize(d.code) || "";
        const title = normalize(d.title) || "";
        lines.push(`| ${code} | ${title} | ${signed || ""} | ${signer || ""} | ${jsonp ? `\`${jsonp}\`` : ""} |`);
      }
      lines.push("");
    }

    const missing = docs.length ? docs.filter((d) => !getDocSignoff(progress, d.id)) : [];
    if (missing.length) {
      lines.push("### Missing document sign-offs");
      lines.push("");
      lines.push(
        `The following governance documents do not yet have a per-document sign-off record in progress (and therefore no corresponding evidence record path captured):`
      );
      lines.push("");
      for (const d of missing.slice().sort((a, b) => sortDocKey(a).localeCompare(sortDocKey(b)))) {
        lines.push(`- ${normalize(d.code) || d.id} — ${normalize(d.title) || ""} (${normalize(d.kind) || "doc"})`);
      }
      lines.push("");
    }
    if (!docs.length) {
      const n = Object.keys(docSignoffsByCode || {}).length || Object.keys(docSignoffs || {}).length;
      if (!n) {
        lines.push(
          "_No governance documents were loaded (governance manifest missing) and no per-document sign-offs were found in progress._"
        );
        lines.push("");
      } else {
        lines.push(
          "_Note: governance manifest was not available at export time; table above is reconstructed from saved progress sign-offs._"
        );
        lines.push("");
      }
    }
  }

  if (!atts.length) {
    lines.push("_No attestations recorded._");
    lines.push("");
    return lines.join("\n");
  }
  for (const a of atts) {
    lines.push(`## ${a.scope || "onboarding"} — ${a.created_utc || ""}`);
    lines.push("");
    lines.push(`- **Name**: ${a.name || ""}`);
    lines.push(`- **Title/Role**: ${a.title || ""}`);
    lines.push(`- **Organization**: ${a.org || ""}`);
    if (a.review_date) lines.push(`- **Review date**: ${a.review_date || ""}`);
    lines.push(`- **Notes**: ${a.notes || ""}`);
    lines.push("");

    // Enrich attestation entries with the exact documents they cover.
    try {
      const scope = normalize(a.scope);
      const created = normalize(a.created_utc);
      if (scope.startsWith("bulk:")) {
        const kindLower = scope.slice("bulk:".length).toLowerCase();
        // Avoid duplicating long doc lists: per-document inventory tables above already include the record paths.
        lines.push("### Documents covered");
        lines.push("");
        lines.push(
          `See **Document sign-offs (per document)** tables above. Filter by Signed (UTC) = \`${created}\` and kind = \`${kindLower}\` (supporting = not policy/procedure).`
        );
        lines.push("");
      } else if (scope.startsWith("doc:")) {
        const docId = scope.slice("doc:".length);
        const meta = fmtDoc(docId);
        const s = getDocSignoff(progress, docId);
        if (meta.code || meta.title || s) {
          const jsonp = s && s.record_json_path ? normalize(s.record_json_path) : "";
          lines.push("### Document covered");
          lines.push("");
          lines.push(`- Code: ${meta.code || ""}`);
          lines.push(`- Title: ${meta.title || ""}`);
          lines.push(`- Kind: ${meta.kind || ""}`);
          if (jsonp) lines.push(`- Record JSON: \`${jsonp}\``);
          lines.push("");
        }
      }
    } catch {}

    lines.push("### Checklist");
    const checks = a.checks || {};
    const scopeLower = normalize(a.scope).toLowerCase();
    const items = [];
    const showPackAcks = !(scopeLower.startsWith("bulk:") || scopeLower.startsWith("doc:"));
    const showPolicy =
      scopeLower === "governance-pack" ||
      scopeLower === "onboarding" ||
      scopeLower.indexOf("annual") >= 0 ||
      scopeLower.indexOf("change") >= 0 ||
      scopeLower.startsWith("bulk:policy") ||
      (scopeLower.startsWith("doc:") && (() => {
        const meta = fmtDoc(scopeLower.slice("doc:".length));
        return normalize(meta.kind).toLowerCase() === "policy";
      })());
    const showSops =
      scopeLower === "governance-pack" ||
      scopeLower === "onboarding" ||
      scopeLower.indexOf("annual") >= 0 ||
      scopeLower.indexOf("change") >= 0 ||
      scopeLower.startsWith("bulk:procedure") ||
      (scopeLower.startsWith("doc:") && (() => {
        const meta = fmtDoc(scopeLower.slice("doc:".length));
        return normalize(meta.kind).toLowerCase() === "procedure";
      })());
    const showSupporting =
      scopeLower === "governance-pack" ||
      scopeLower === "onboarding" ||
      scopeLower.indexOf("annual") >= 0 ||
      scopeLower.indexOf("change") >= 0 ||
      scopeLower.startsWith("bulk:supporting") ||
      (scopeLower.startsWith("doc:") && (() => {
        const meta = fmtDoc(scopeLower.slice("doc:".length));
        const k = normalize(meta.kind).toLowerCase();
        return k && k !== "policy" && k !== "procedure";
      })());

    if (showPolicy) items.push(["reviewed_policies", "Reviewed required Policies"]);
    if (showSops) items.push(["reviewed_sops", "Reviewed required SOPs"]);
    if (showSupporting) items.push(["reviewed_supporting", "Reviewed supporting docs (plans/forms/other)"]);
    if (showPackAcks) {
      items.push(["annual_review_scheduled", "Annual review scheduled (governance refresh)"]);
      items.push(["srm_reviewed", "Shared Responsibility Matrix reviewed (if applicable)"]);
      items.push(["understand_monitoring_banner", "Acknowledged monitoring / authorized use notice"]);
    }
    for (const [k, label] of items) {
      const ok = !!checks[k];
      lines.push(`- ${ok ? "[x]" : "[ ]"} ${label}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildBulkEvidenceChecklistMarkdown(controlsAll, progress) {
  const lines = [];
  lines.push("# Trust Codex Manual — Bulk Evidence Checklist");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("This checklist is intended to support **bulk** evidence generation (collect once, then adjudicate with artifacts).");
  lines.push("");

  const eligible = (controlsAll || []).filter((c) => {
    const cls = normalize(c.classification);
    if (cls.indexOf("System-Enforced") < 0) return false;
    const regen = (c.evidence && c.evidence.regeneration_method) || "";
    return extractPs1Paths(regen).length > 0;
  });

  const fams = uniqSorted(eligible.map((c) => normalize(c.family)));
  for (const fam of fams) {
    lines.push(`## ${fam}`);
    lines.push("");
    const items = eligible.filter((c) => normalize(c.family) === fam);
    for (const c of items) {
      const p = progress && progress[c.control_id] ? progress[c.control_id] : null;
      const adjudicated = p && p.adjudicated ? "Adjudicated" : "Outstanding";
      const loc = (c.evidence && c.evidence.location) || "";
      const regen = (c.evidence && c.evidence.regeneration_method) || "";
      lines.push(`- **${c.control_id}** (${adjudicated}) — ${c.title || ""}`);
      if (loc) lines.push(`  - Location: ${loc}`);
      if (regen) lines.push(`  - Regeneration: ${regen}`);
    }
    lines.push("");
  }

  lines.push("## Governance sign-off (separate from technical evidence)");
  lines.push("");
  lines.push("- Review required Policies and SOPs.");
  lines.push("- Record initial onboarding adjudication (or change-control adjudication).");
  lines.push("- Schedule and record annual governance refresh.");
  lines.push("- Sign an attestation in the manual app (Exports → Attestations).");
  lines.push("");
  return lines.join("\n");
}

function openAttestationForm(progressGetter, progressSetter) {
  // Legacy fallback (kept for callers), prefer the on-page form.
  const name = prompt("Attestation — name");
  if (!name) return;
  const created_utc = new Date().toISOString();
  const att = {
    id: `att-${created_utc.replace(/[:.]/g, "-")}`,
    scope: "onboarding",
    created_utc,
    name: String(name || "").trim(),
    title: "",
    org: "",
    notes: "",
    checks: {},
  };
  const p = progressGetter();
  const next = { ...(p || {}) };
  const arr = next.__attestations && Array.isArray(next.__attestations) ? next.__attestations.slice() : [];
  arr.push(att);
  next.__attestations = arr;
  progressSetter("__bulk", next);
}

async function loadGovernanceManifest() {
  try {
    const resp = await fetch("governance-manifest.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const obj = await resp.json();
    const docs = obj && obj.docs && Array.isArray(obj.docs) ? obj.docs : [];
    return docs.filter((d) => d && d.id);
  } catch {
    return [];
  }
}

function docScopeFromId(id) {
  return `doc:${String(id || "")}`;
}

function getDocSignoff(progress, docId) {
  const p = progress || {};
  const map = p.__doc_signoffs && typeof p.__doc_signoffs === "object" ? p.__doc_signoffs : null;
  if (map && map[docId]) return map[docId];
  return null;
}

function docsAllSigned(progress, docs, kindsLower) {
  const kinds = (kindsLower && kindsLower.length) ? kindsLower : [];
  const list = (docs || []).filter((d) => {
    if (!kinds.length) return true;
    return kinds.indexOf(normalize(d.kind).toLowerCase()) >= 0;
  });
  if (!list.length) return false;
  for (const d of list) {
    if (!getDocSignoff(progress, d.id)) return false;
  }
  return true;
}

function backfillDocSignoffsByCode(progressObj, governanceDocById) {
  const p0 = progressObj && typeof progressObj === "object" ? progressObj : {};
  const docMap = p0.__doc_signoffs && typeof p0.__doc_signoffs === "object" ? p0.__doc_signoffs : null;
  if (!docMap) return p0;

  const existing =
    p0.__doc_signoffs_by_code && typeof p0.__doc_signoffs_by_code === "object" ? p0.__doc_signoffs_by_code : null;
  if (existing && Object.keys(existing).length) return p0; // already present

  const byId = governanceDocById && typeof governanceDocById === "object" ? governanceDocById : {};
  const next = { ...(p0 || {}) };
  next.__doc_signoffs_by_code = {};
  for (const [docId, rec] of Object.entries(docMap)) {
    const d = byId[String(docId)] || null;
    const code = d && d.code ? normalize(d.code).toUpperCase() : "";
    if (!code) continue;
    next.__doc_signoffs_by_code[code] = { ...(rec || {}), doc_code: d.code };
  }
  return next;
}

function runIdFromUtcIso(iso) {
  const s = String(iso || "");
  // 2026-02-07T08:22:21.104Z -> 20260207-082221
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`;
}

async function writeGovernanceEvidenceArtifact(nextProgress, signer, governanceControls, governanceDocs) {
  const p = nextProgress && typeof nextProgress === "object" ? nextProgress : {};
  const completeUtc = p.__governance_pack_complete_utc || new Date().toISOString();
  const runId = runIdFromUtcIso(completeUtc) || runIdFromUtcIso(new Date().toISOString());
  const dir = `C:\\evidence\\CUI-Governance-${runId}`;
  const outPath = `${dir}\\governance-signoffs.json`;

  const docSignoffs = p.__doc_signoffs && typeof p.__doc_signoffs === "object" ? p.__doc_signoffs : {};
  const prof = getAttesteeProfile(p) || {};
  const att = {
    name: normalize($("#attName") ? $("#attName").value : "") || normalize(prof.name) || signer || "",
    title: normalize($("#attTitle") ? $("#attTitle").value : "") || normalize(prof.title) || "",
    org: normalize($("#attOrg") ? $("#attOrg").value : "") || normalize(prof.org) || "",
    review_date: normalize($("#attReviewDate") ? $("#attReviewDate").value : "") || normalize(prof.review_date) || "",
  };

  const govControlIds = [];
  const gcs = governanceControls && Array.isArray(governanceControls) ? governanceControls : [];
  for (const c of gcs) {
    const cid = c && c.control_id ? String(c.control_id) : "";
    if (!cid) continue;
    const entry = p[cid];
    if (entry && typeof entry === "object" && entry.adjudicated) govControlIds.push(cid);
  }
  govControlIds.sort();

  const artifact = {
    schema: "mactech.codex.manual.governance_signoffs",
    version: 1,
    generated_utc: new Date().toISOString(),
    governance_pack_complete_utc: completeUtc,
    evidence_dir: dir,
    linked_last_validation_dir: p.__last_validation_dir || "",
    linked_last_evidence_dir: p.__last_evidence_dir || "",
    signer: att,
    docs: governanceDocs && Array.isArray(governanceDocs) ? governanceDocs : [],
    doc_signoffs: docSignoffs,
    governance_controls_adjudicated: govControlIds,
    counts: {
      docs_signed: Object.keys(docSignoffs).length,
      governance_controls_adjudicated: govControlIds.length,
    },
  };

  try {
    await fsWriteTextFile(outPath, JSON.stringify(artifact, null, 2) + "\n");
    // Persist pointers so the Dashboard can guide the next steps.
    try {
      p.__last_governance_dir = dir;
      p.__last_governance_artifact_path = outPath;
      p.__last_governance_artifact_utc = new Date().toISOString();
    } catch {}
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function getLatestRunDirsFromUI() {
  const ev = $("#latestEvidenceHint");
  const va = $("#latestValidationHint");
  const evName = ev ? String(ev.textContent || "").replace(/^Evidence:\s*/i, "").trim() : "";
  const vaName = va ? String(va.textContent || "").replace(/^Validation:\s*/i, "").trim() : "";
  const ok = (s) => s && s !== "—" && s !== "(unavailable)" && s.indexOf("(") !== 0;
  return {
    evidenceDirName: ok(evName) ? evName : "",
    validationDirName: ok(vaName) ? vaName : "",
  };
}

async function getLatestRunDirsFromDisk() {
  const entries = await fsListDir("C:\\evidence");
  const dirs = (entries || []).filter((e) => e && e.kind === "dir" && e.name);
  const isTimestampedValidation = (name) => /^CUI-Validation-\d{8}-\d{6}$/i.test(String(name || ""));
  const isTimestampedEvidence = (name) => /^CUI-Evidence-\d{8}-\d{6}$/i.test(String(name || ""));

  // IMPORTANT: ignore non-timestamp "smoke" runs or any other variants here.
  const validations = dirs
    .filter((d) => isTimestampedValidation(d.name))
    .slice()
    // Names include timestamp; lexicographic sort works.
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const latestValidation = validations.length ? validations[validations.length - 1] : null;
  const validationDirName = latestValidation ? String(latestValidation.name) : "";

  const evidences = dirs
    .filter((d) => isTimestampedEvidence(d.name))
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // Prefer exact RunId match: CUI-Validation-<RunId> -> CUI-Evidence-<RunId>
  let evidenceDirName = "";
  if (validationDirName) {
    const m = String(validationDirName).match(/^CUI-Validation-(\d{8}-\d{6})$/i);
    const runId = m ? m[1] : "";
    if (runId) {
      const exact = `CUI-Evidence-${runId}`;
      const found = evidences.find((d) => String(d.name).toLowerCase() === exact.toLowerCase());
      if (found && found.name) evidenceDirName = String(found.name);
    }
  }

  // Fallback: closest timestamp proximity match.
  if (!evidenceDirName && latestValidation) {
    const pick = pickEvidenceDirForValidation(evidences, validationDirName);
    if (pick && pick.name) evidenceDirName = String(pick.name);
  }

  // Final fallback: newest evidence folder by name.
  if (!evidenceDirName && evidences.length) evidenceDirName = String(evidences[evidences.length - 1].name);

  return { evidenceDirName, validationDirName };
}

function downloadRunElevatedLauncherForScripts(scriptPaths, label) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = String(label || "run").replace(/[^A-Za-z0-9_.-]+/g, "_");
  const inner = buildElevatedInnerForScripts(scriptPaths, label || "Run elevated");
  const cmdFile = buildRunElevatedCmdFile(inner, "Codex - Run Elevated", "C:\\hardening\\codex-scripts");
  downloadText(`codex-run-elevated-${safe}-${ts}.cmd`, cmdFile, "text/plain; charset=utf-8");
}

async function fsListDir(path) {
  const resp = await fetch(`/__fs?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const obj = await resp.json();
  if (!obj || obj.kind !== "dir") throw new Error("Not a directory.");
  return obj.entries && Array.isArray(obj.entries) ? obj.entries : [];
}

async function fsReadTextFile(path) {
  const resp = await fetch(`/__fs?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const obj = await resp.json();
  if (!obj || obj.kind !== "file") throw new Error("Not a file.");
  if (typeof obj.textContent !== "string") throw new Error("File is not previewable.");
  return stripUtf8Bom(obj.textContent);
}

async function fsWriteTextFile(path, content) {
  const resp = await fetch(`/__fs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const obj = await resp.json();
  if (!obj || !obj.ok) throw new Error("Write failed.");
  return obj;
}

function mkAuditMarkdown(artifact) {
  const lines = [];
  lines.push("# Trust Codex Manual — Adjudication Audit");
  lines.push("");
  lines.push(`Generated (UTC): ${artifact.generated_utc}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total controls: ${artifact.summary.total_controls}`);
  lines.push(`- Adjudicated (before): ${artifact.summary.adjudicated_before}`);
  lines.push(`- Verified OK: ${artifact.summary.verified_ok}`);
  lines.push(`- Unadjudicated (enforced): ${artifact.summary.unadjudicated}`);
  lines.push(`- Adjudicated (after): ${artifact.summary.adjudicated_after}`);
  lines.push("");
  lines.push("## Results (OK)");
  const ok = (artifact.results || []).filter((r) => r && r.ok);
  if (!ok.length) {
    lines.push("- None");
    lines.push("");
  } else {
    for (const r of ok) {
      lines.push(`- **${r.control_id}** — ${r.title || ""}`);
      if (r.classification) lines.push(`  - Classification: ${r.classification}`);
      if (r.audit_basis) lines.push(`  - Basis: ${r.audit_basis}`);
      if (r.linked_evidence_dir) lines.push(`  - Evidence: \`${r.linked_evidence_dir}\``);
      if (r.linked_validation_dir) lines.push(`  - Validation: \`${r.linked_validation_dir}\``);
      if (r.governance_artifact) lines.push(`  - Governance artifact: \`${r.governance_artifact}\``);
      if (r.srm_evidence_ref) lines.push(`  - SRM evidence refs: ${r.srm_evidence_ref}`);
      if (r.na_justification_ref) lines.push(`  - N/A justification ref: ${r.na_justification_ref}`);
      if (r.evidence_refs) lines.push(`  - Evidence refs (vault): ${r.evidence_refs}`);
    }
    lines.push("");
  }
  lines.push("## Results (not OK)");
  const bad = (artifact.results || []).filter((r) => !r.ok);
  if (!bad.length) {
    lines.push("- None");
    lines.push("");
    return lines.join("\n");
  }
  for (const r of bad) {
    lines.push(`- **${r.control_id}** — ${r.title || ""}`);
    for (const reason of r.reasons || []) lines.push(`  - ${reason}`);
    if (r.linked_evidence_dir) lines.push(`  - Evidence: \`${r.linked_evidence_dir}\``);
    if (r.linked_validation_dir) lines.push(`  - Validation: \`${r.linked_validation_dir}\``);
  }
  lines.push("");
  return lines.join("\n");
}

function mkPerControlNarrativesMarkdown(artifact) {
  const lines = [];
  lines.push("# Trust Codex Manual — Per-control narrative (assessor-ready)");
  lines.push("");
  lines.push(`Generated (UTC): ${artifact.generated_utc}`);
  lines.push("");
  lines.push("## How to use this report");
  lines.push(
    "- This is a concise per-control narrative for each **adjudicated/met** control in this run. It is designed to be read alongside the linked evidence directories, validation reports, SRM artifacts, and governance signoff records."
  );
  lines.push("- If an assessor asks “show me”, use the paths included under each control.");
  lines.push("");

  const ok = (artifact.results || []).filter((r) => r && r.ok);
  for (const r of ok) {
    lines.push(`## ${r.control_id} — ${r.title || ""}`);
    if (r.classification) lines.push(`- **Classification**: ${r.classification}`);
    if (r.audit_basis) lines.push(`- **Claim / basis**: ${r.audit_basis}`);

    // Evidence pointers
    const evBits = [];
    if (r.linked_evidence_dir) evBits.push(`Evidence bundle: \`${r.linked_evidence_dir}\``);
    if (r.linked_validation_dir) evBits.push(`Validation bundle: \`${r.linked_validation_dir}\``);
    if (r.governance_artifact) evBits.push(`Governance signoffs artifact: \`${r.governance_artifact}\``);
    if (r.srm_evidence_ref) evBits.push(`SRM evidence refs: ${r.srm_evidence_ref}`);
    if (r.na_justification_ref) evBits.push(`N/A justification ref: ${r.na_justification_ref}`);
    if (r.evidence_refs) evBits.push(`Evidence refs (vault): ${r.evidence_refs}`);
    if (evBits.length) {
      lines.push("- **Evidence pointers**:");
      for (const b of evBits) lines.push(`  - ${b}`);
    }

    // Assessor prompts (what they'll likely ask next)
    const prompts = [];
    const cls = normalize(r.classification).toLowerCase();
    if (cls.indexOf("system-enforced") >= 0) {
      prompts.push("Show the validation PASS in `validation-report.json` for this control and the hashed evidence bundle (`hashes.sha256.txt`).");
      prompts.push("Show the collector command / regeneration method and confirm it is repeatable.");
    } else if (cls.indexOf("governance") >= 0) {
      prompts.push("Show that required governance docs were reviewed/signed and that the governance signoffs artifact is retained in the evidence vault.");
      prompts.push("If requested, produce associated operational records (tickets, rosters, approvals) and link them under Evidence refs.");
    } else if (cls.indexOf("inherited") >= 0) {
      prompts.push("Show SRM boundary evidence and confirm provider/customer responsibilities and where each side retains evidence.");
    } else if (cls.indexOf("not applicable") >= 0 || cls === "n/a") {
      prompts.push("Show the written justification memo/path and confirm enclave scope makes the requirement non-applicable.");
    } else {
      prompts.push("Show the manual evidence record(s) supporting this closeout decision.");
    }
    if (prompts.length) {
      lines.push("- **Assessor sanity prompts**:");
      for (const p of prompts) lines.push(`  - ${p}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function auditAndEnforceAdjudications(controlsAll, getProgress, setProgressBulk, setAuditStatus) {
  const nowUtc = new Date().toISOString();
  const runId = runIdFromUtcIso(nowUtc) || nowUtc.replace(/[:.]/g, "-");
  const outDir = `C:\\evidence\\CUI-Audit-${runId}`;
  const outJson = `${outDir}\\audit-adjudications.json`;
  const outMd = `${outDir}\\audit-adjudications.md`;
  const outNarrMd = `${outDir}\\per-control-narratives.md`;

  const p0 = getProgress() || {};
  const next = { ...(p0 || {}) };

  // Cache evidence root listing once (used to discover governance artifacts too).
  let evidenceRootEntries = [];
  try {
    evidenceRootEntries = await fsListDir("C:\\evidence");
  } catch {}

  const dirCache = {};
  const listDirCached = async (path) => {
    if (dirCache[path]) return dirCache[path];
    const entries = await fsListDir(path);
    dirCache[path] = entries;
    return entries;
  };

  const readTextCached = {};
  const readText = async (path) => {
    if (readTextCached[path]) return readTextCached[path];
    const t = await fsReadTextFile(path);
    readTextCached[path] = t;
    return t;
  };

  const validationCache = {};
  const loadValidationReport = async (validationDir) => {
    if (validationCache[validationDir]) return validationCache[validationDir];
    const txt = await readText(`${validationDir}\\validation-report.json`);
    const obj = JSON.parse(stripUtf8Bom(txt));
    validationCache[validationDir] = obj;
    return obj;
  };

  const findLatestGovernanceArtifactPath = async () => {
    // Prefer the explicit pointer captured when the artifact was written.
    // This avoids listing C:\evidence, which can fail if the directory is huge.
    try {
      const hinted = normalize(p0 && p0.__last_governance_artifact_path ? p0.__last_governance_artifact_path : "");
      if (hinted) {
        try {
          const txt = await readText(hinted);
          const obj = JSON.parse(stripUtf8Bom(txt));
          if (obj && obj.doc_signoffs) return hinted;
        } catch {}
      }
    } catch {}

    const dirs = (evidenceRootEntries || []).filter(
      (e) => e && e.kind === "dir" && e.name && String(e.name).toLowerCase().indexOf("cui-governance-") === 0
    );
    // newest first by name (RunId timestamp)
    dirs.sort((a, b) => String(b.name).localeCompare(String(a.name)));
    for (const d of dirs) {
      const dirPath = `C:\\evidence\\${d.name}`;
      try {
        const entries = await listDirCached(dirPath);
        const has = (entries || []).some(
          (x) => x && x.kind === "file" && String(x.name || "").toLowerCase() === "governance-signoffs.json"
        );
        if (has) return `${dirPath}\\governance-signoffs.json`;
      } catch {}
    }
    return "";
  };

  const results = [];
  const adjudicatedBefore = controlsAll.filter((c) => getProgressEntry(p0, c.control_id).adjudicated).length;
  let unadjudicated = 0;
  let verifiedOk = 0;

  const srm = p0 && p0.__srm_module && typeof p0.__srm_module === "object" ? p0.__srm_module : {};
  const inhMap = srm && srm.inherited && typeof srm.inherited === "object" ? srm.inherited : {};
  const naMap = srm && srm.na && typeof srm.na === "object" ? srm.na : {};
  const docByCode =
    p0 && p0.__doc_signoffs_by_code && typeof p0.__doc_signoffs_by_code === "object" ? p0.__doc_signoffs_by_code : {};

  for (const c of controlsAll) {
    const cid = c.control_id;
    const pe = getProgressEntry(p0, cid);
    if (!pe.adjudicated) continue;

    const r = {
      control_id: cid,
      title: c.title || "",
      classification: c.classification || "",
      ok: true,
      reasons: [],
      linked_evidence_dir: pe.linked_evidence_dir || "",
      linked_validation_dir: pe.linked_validation_dir || "",
      evidence_refs: normalize(pe.evidence_refs || ""),
      srm_evidence_ref: "",
      na_justification_ref: "",
      governance_artifact: "",
      audit_basis: "",
    };

    const cls = normalize(c.classification);
    const clsNorm = cls.toLowerCase();
    const isSystem = clsNorm.indexOf("system-enforced") >= 0;
    const isGov = clsNorm.indexOf("governance") >= 0;
    const isInherited = clsNorm === "inherited" || clsNorm.indexOf("inherited") >= 0;
    const isNa = clsNorm === "not applicable" || clsNorm === "n/a" || clsNorm.indexOf("not applicable") >= 0;

    // Unify with adjudication gating. If the control can't pass prereqs, it's not auditor-defensible.
    try {
      const prereq = adjudicationPrereqFailures(c, p0);
      if (prereq && prereq.length) {
        r.ok = false;
        for (const x of prereq) r.reasons.push(String(x));
      }
    } catch {}

    // Pull SRM details into the report (for assessor traceability).
    if (isInherited) {
      const e = inhMap && inhMap[cid] ? inhMap[cid] : {};
      r.srm_evidence_ref = normalize(e && e.evidence_ref ? e.evidence_ref : "");
      r.audit_basis = "SRM boundary verified + evidence refs recorded; SRM review signed.";
    }
    if (isNa) {
      const e = naMap && naMap[cid] ? naMap[cid] : {};
      r.na_justification_ref = normalize(e && e.justification_ref ? e.justification_ref : "");
      r.audit_basis = "N/A applicability attested + justification ref recorded; N/A attestation signed.";
    }

    // Governance controls: require an evidence artifact written under C:\evidence.
    if (isGov) {
      const govPath = await findLatestGovernanceArtifactPath();
      if (!govPath) {
        r.ok = false;
        r.reasons.push("Missing governance evidence artifact (no CUI-Governance-* directory found under C:\\evidence).");
      } else {
        r.governance_artifact = govPath;
        try {
          const txt = await readText(govPath);
          const obj = JSON.parse(stripUtf8Bom(txt));
          if (!obj || !obj.doc_signoffs) {
            r.ok = false;
            r.reasons.push(`Governance artifact present but invalid JSON structure: ${govPath}`);
          }
        } catch (e) {
          r.ok = false;
          r.reasons.push(`Cannot read governance evidence artifact: ${govPath}`);
        }
      }

      // Also enforce that each control's referenced governance docs are signed (by code).
      try {
        const refsRaw = c && c.policy_sop_refs ? c.policy_sop_refs : "";
        const codes = String(refsRaw || "").match(/MAC-(?:POL|SOP|IRP|CMP|FRM)-\d{3}/gi) || [];
        const uniq = [];
        const seen = {};
        for (const x of codes) {
          const k = normalize(x).toUpperCase();
          if (!k || seen[k]) continue;
          seen[k] = true;
          uniq.push(k);
        }
        const missing = uniq.filter((k) => !docByCode[k]);
        if (missing.length) {
          r.ok = false;
          r.reasons.push(`Missing required governance doc signoffs: ${missing.join(", ")}`);
        }
        r.audit_basis = uniq.length
          ? `Governance docs signed (${uniq.length} required). Governance artifact present.`
          : "Governance artifact present.";
      } catch {}
    } else if (isSystem) {
      // System-enforced: require linked evidence + validation + hashes + validator PASS for this control.
      const evDir = pe.linked_evidence_dir || "";
      const vaDir = pe.linked_validation_dir || "";
      if (!evDir) {
        r.ok = false;
        r.reasons.push("Missing linked evidence directory.");
      }
      if (!vaDir) {
        r.ok = false;
        r.reasons.push("Missing linked validation directory.");
      }
      if (evDir) {
        let evEntries = [];
        try {
          evEntries = await listDirCached(evDir);
        } catch (e) {
          r.ok = false;
          r.reasons.push(`Cannot list evidence directory: ${evDir}`);
        }
        const hasHashes = evEntries.some((e) => e && e.kind === "file" && String(e.name || "").toLowerCase() === "hashes.sha256.txt");
        if (!hasHashes) {
          r.ok = false;
          r.reasons.push("Missing hashes.sha256.txt in evidence bundle (integrity protection not proven).");
        }
      }
      if (vaDir) {
        try {
          const rep = await loadValidationReport(vaDir);
          const cr = rep && rep.control_results && Array.isArray(rep.control_results) ? rep.control_results : [];
          const row = cr.find((x) => normalize(x && x.control_id) === normalize(cid));
          if (!row) {
            r.ok = false;
            r.reasons.push("Validation report does not include control_results entry for this control.");
          } else {
            if (!row.pass) {
              r.ok = false;
              r.reasons.push(`Validator FAIL (failed_check_ids=${JSON.stringify(row.failed_check_ids || [])}).`);
            }
            if (row.missing_files && row.missing_files.length) {
              r.ok = false;
              r.reasons.push(`Evidence bundle missing required files: ${row.missing_files.join(", ")}`);
            }
          }
        } catch (e) {
          r.ok = false;
          r.reasons.push("Cannot read/parse validation-report.json for linked validation directory.");
        }
      }
      if (!r.audit_basis) r.audit_basis = "Validator PASS + evidence bundle hashed + validation report linked.";
    } else {
      // Non-system, non-governance: require either SRM-backed closeout (Inherited/N/A) or explicit manual evidence.
      if (!isInherited && !isNa) {
        const notes = normalize(pe.notes || "");
        if (!notes && !r.evidence_refs) {
          r.ok = false;
          r.reasons.push("Manual adjudication requires explicit assessor notes and/or Evidence refs, but both are empty.");
        }
        if (!r.audit_basis) r.audit_basis = "Manual closeout with evidence refs/notes.";
      }
    }

    results.push(r);

    if (r.ok) {
      verifiedOk++;
      continue;
    }

    // Enforce: unadjudicate if not defensible.
    const prev = next[cid] && typeof next[cid] === "object" ? next[cid] : {};
    next[cid] = {
      ...(prev || {}),
      adjudicated: false,
      audit_failed_utc: nowUtc,
      updated_utc: nowUtc,
      notes: prev.notes ? `${prev.notes}\n\nAUDIT FAILED: ${r.reasons.join(" | ")}` : `AUDIT FAILED: ${r.reasons.join(" | ")}`,
    };
    unadjudicated++;
  }

  const adjudicatedAfter = controlsAll.filter((c) => getProgressEntry(next, c.control_id).adjudicated).length;
  const artifact = {
    schema: "mactech.codex.manual.audit_adjudications",
    version: 1,
    generated_utc: nowUtc,
    output_dir: outDir,
    summary: {
      total_controls: controlsAll.length,
      adjudicated_before: adjudicatedBefore,
      verified_ok: verifiedOk,
      unadjudicated,
      adjudicated_after: adjudicatedAfter,
    },
    results,
  };

  await fsWriteTextFile(outJson, JSON.stringify(artifact, null, 2) + "\n");
  await fsWriteTextFile(outMd, mkAuditMarkdown(artifact));
  await fsWriteTextFile(outNarrMd, mkPerControlNarrativesMarkdown(artifact));
  next.__last_audit_dir = outDir;
  next.__last_audit_json = outJson;
  next.__last_audit_md = outMd;
  next.__last_audit_narratives_md = outNarrMd;
  next.__last_audit_utc = nowUtc;
  setProgressBulk(next);

  if (setAuditStatus) {
    setAuditStatus(`Audit complete. Wrote: ${outJson} (and ${outMd}; ${outNarrMd}). Unadjudicated: ${unadjudicated}.`);
  }
  return artifact;
}

function summarizeValidationReport(report) {
  const checks = report && report.checks && Array.isArray(report.checks) ? report.checks : [];
  const byControl = {};
  for (const ch of checks) {
    const cid = normalize(ch && ch.control);
    if (!cid) continue;
    byControl[cid] = byControl[cid] || { passAll: true, passAny: false, checks: [] };
    const pass = !!ch.pass;
    byControl[cid].checks.push(ch);
    byControl[cid].passAny = byControl[cid].passAny || pass;
    byControl[cid].passAll = byControl[cid].passAll && pass;
  }
  return byControl;
}

function parseRunTimestampFromName(name) {
  const s = String(name || "");
  const m = s.match(/-(\d{8})-(\d{6})$/);
  if (!m) return null;
  const y = parseInt(m[1].slice(0, 4), 10);
  const mo = parseInt(m[1].slice(4, 6), 10) - 1;
  const d = parseInt(m[1].slice(6, 8), 10);
  const hh = parseInt(m[2].slice(0, 2), 10);
  const mm = parseInt(m[2].slice(2, 4), 10);
  const ss = parseInt(m[2].slice(4, 6), 10);
  // local time (good enough for picking nearest bundle on the same host)
  return new Date(y, mo, d, hh, mm, ss);
}

function inferLatestLinkedDir(progress, controlsAll, fieldName) {
  // Some older progress exports may not include __last_validation_dir / __last_evidence_dir.
  // Fall back to inferring the latest linked dir from per-control entries.
  try {
    const p = progress && typeof progress === "object" ? progress : {};
    const dirs = new Set();
    for (const c of controlsAll || []) {
      const cid = c && c.control_id ? String(c.control_id) : "";
      if (!cid) continue;
      const e = p[cid];
      if (!e || typeof e !== "object") continue;
      const v = e[fieldName];
      if (v) dirs.add(String(v));
    }
    const arr = Array.from(dirs);
    if (!arr.length) return "";
    // Prefer lexicographic max (names include timestamp), fallback ok.
    arr.sort();
    return arr[arr.length - 1] || "";
  } catch {
    return "";
  }
}

function ensurePoamProgress(p0) {
  const p = p0 && typeof p0 === "object" ? { ...(p0 || {}) } : {};
  p.__poam = p.__poam && typeof p.__poam === "object" ? { ...(p.__poam || {}) } : {};
  p.__poam.items = p.__poam.items && typeof p.__poam.items === "object" ? { ...(p.__poam.items || {}) } : {};
  p.__poam.ui_collapsed =
    p.__poam.ui_collapsed && typeof p.__poam.ui_collapsed === "object" ? { ...(p.__poam.ui_collapsed || {}) } : {};
  return p;
}

function poamDefaultItem() {
  return {
    status: "open", // open | in_progress | blocked | complete
    severity: "medium", // high | medium | low
    owner: "",
    planned_completion_date: "",
    remediation_steps: "",
    evidence_ref: "",
    notes: "",
    updated_utc: "",
  };
}

function poamSuggestedItem(control, findingSummary, latestValidationDir, latestEvidenceDir) {
  const cid = normalize(control && control.control_id ? control.control_id : "");
  const title = normalize(control && control.title ? control.title : "");
  const finding = normalize(findingSummary);
  const now = new Date();
  const due = addDays(now, 14);
  const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;

  // Default evidence ref: encourage a concrete vault path per item.
  const evidenceRef = cid ? `C:\\evidence\\CUI-POAM-Taskers\\${cid}\\closeout.md` : `C:\\evidence\\CUI-POAM-Taskers\\closeout.md`;

  // Most POA&M items here are technical remediations.
  const base = {
    status: "open",
    severity: "high",
    owner: "IT Administrator",
    planned_completion_date: dueIso,
    evidence_ref: evidenceRef,
    notes: "",
    remediation_steps: "",
    updated_utc: "",
  };

  // Known blocker: BITLOCKER-OS check failures (Windows Server 2025 hardening).
  if (finding.toUpperCase().indexOf("BITLOCKER-OS") >= 0) {
    const latestV = latestValidationDir ? String(latestValidationDir) : "";
    const latestE = latestEvidenceDir ? String(latestEvidenceDir) : "";
    base.remediation_steps = [
      "1) Confirm VM prerequisites for BitLocker (Azure): vTPM + Secure Boot enabled for this VM.",
      "   - If missing, enable vTPM/Secure Boot in Azure VM settings (requires deallocate/reconfigure).",
      "",
      "2) Re-run Codex hardening with BitLocker enabled (must be elevated/SYSTEM):",
      "   - `C:\\hardening\\codex-scripts\\Run-CuiHardeningAndValidate-Elevated.ps1 -EnableBitLocker $true -KeepSshAccess $true -KeepRdpAccess $true`",
      "",
      "3) Validate BitLocker is ON for OS volume and a recovery protector exists:",
      "   - `manage-bde -status C:`",
      "   - `manage-bde -protectors -get C:`",
      "",
      "4) Regenerate evidence + validation and ensure the check passes:",
      "   - `C:\\hardening\\codex-scripts\\Collect-Cui-Evidence.ps1`",
      "   - `C:\\hardening\\codex-scripts\\Test-CuiHardening.ps1`",
      "",
      "5) Ingest the latest run in the Manual and re-run Audit adjudications.",
      latestV ? `   - Prior linked validation: ${latestV}` : "",
      latestE ? `   - Prior linked evidence: ${latestE}` : "",
      "",
      "Closeout criteria (assessor-ready):",
      "- Validator shows PASS for BITLOCKER-OS in `validation-report.json`.",
      "- Evidence bundle includes BitLocker evidence + hashes (`hashes.sha256.txt`).",
      "- Evidence vault contains a remediation record and references how recovery material is protected/escrowed for the enclave.",
    ]
      .filter(Boolean)
      .join("\n");
    base.notes = `Auto-generated taskers for ${cid}${title ? ` (${title})` : ""}. Finding: ${finding || "validator FAIL"}.`;
    return base;
  }

  // Fallback suggestion: still fill fields so it’s actionable.
  base.severity = "medium";
  base.remediation_steps = [
    "1) Re-run evidence collection + validation.",
    "2) Review the failing checks and remediate configuration gaps.",
    "3) Regenerate evidence bundle, ensure hashes are present, then re-ingest and re-audit.",
  ].join("\n");
  base.notes = `Auto-generated POA&M taskers for ${cid || "control"}. Finding: ${finding || "(see validation report)"}.`;
  return base;
}

function mkPoamArtifact(nowUtc, latestValidationDir, items) {
  const runId = runIdFromUtcIso(nowUtc) || nowUtc.replace(/[:.]/g, "-");
  return {
    schema: "mactech.codex.manual.poam",
    version: 1,
    generated_utc: nowUtc,
    run_id: runId,
    linked_last_validation_dir: latestValidationDir || "",
    items: items || [],
  };
}

function mkPoamMarkdown(artifact) {
  const lines = [];
  lines.push("# POA&M (Plan of Action and Milestones)");
  lines.push("");
  lines.push(`Generated (UTC): ${artifact.generated_utc}`);
  if (artifact.linked_last_validation_dir) lines.push(`Linked validation: \`${artifact.linked_last_validation_dir}\``);
  lines.push("");
  lines.push(`Items: ${Array.isArray(artifact.items) ? artifact.items.length : 0}`);
  lines.push("");
  for (const it of artifact.items || []) {
    lines.push(`## ${it.control_id} — ${it.title || ""}`);
    lines.push(`- Status: ${it.status || ""}`);
    lines.push(`- Severity: ${it.severity || ""}`);
    lines.push(`- Owner: ${it.owner || ""}`);
    lines.push(`- Planned completion: ${it.planned_completion_date || ""}`);
    if (it.finding_summary) lines.push(`- Finding: ${it.finding_summary}`);
    if (it.remediation_steps) {
      lines.push("");
      lines.push("Remediation steps:");
      lines.push(String(it.remediation_steps));
    }
    if (it.evidence_ref) lines.push(`- Evidence ref: ${it.evidence_ref}`);
    if (it.notes) lines.push(`- Notes: ${it.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function ensureConMonProgress(p0) {
  const p = p0 && typeof p0 === "object" ? { ...(p0 || {}) } : {};
  p.__conmon = p.__conmon && typeof p.__conmon === "object" ? { ...(p.__conmon || {}) } : {};
  return p;
}

function parseCadenceBuckets(cadenceText) {
  const s = normalize(cadenceText).toLowerCase();
  if (!s) return [];
  const out = new Set();
  if (s.includes("weekly")) out.add("weekly");
  if (s.includes("monthly")) out.add("monthly");
  if (s.includes("quarter")) out.add("quarterly");
  if (s.includes("annual") || s.includes("yearly")) out.add("annual");
  if (s.includes("per change") || s.includes("per-change") || s.includes("change-control") || s.includes("change control") || s.includes("per_change"))
    out.add("per_change");
  return Array.from(out);
}

function cadenceLabel(k) {
  if (k === "weekly") return "Weekly";
  if (k === "monthly") return "Monthly";
  if (k === "quarterly") return "Quarterly";
  if (k === "annual") return "Annual";
  if (k === "per_change") return "Per change";
  return k;
}

function addDays(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d, months) {
  const x = new Date(d.getTime());
  x.setMonth(x.getMonth() + months);
  return x;
}

function dueStateFor(cadenceKey, lastCompletedUtc) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (cadenceKey === "per_change") {
    return { state: "ok", nextDue: null };
  }
  const last = normalize(lastCompletedUtc) ? new Date(String(lastCompletedUtc)) : null;
  const base = last && !isNaN(last.getTime()) ? new Date(last.getTime()) : null;
  let next = null;
  if (!base) {
    // Never completed => due now.
    return { state: "due_now", nextDue: null };
  }
  if (cadenceKey === "weekly") next = addDays(base, 7);
  else if (cadenceKey === "monthly") next = addMonths(base, 1);
  else if (cadenceKey === "quarterly") next = addMonths(base, 3);
  else if (cadenceKey === "annual") next = addMonths(base, 12);
  if (!next || isNaN(next.getTime())) return { state: "due_now", nextDue: null };

  const nextDay = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  const deltaDays = Math.floor((nextDay.getTime() - today.getTime()) / (24 * 3600 * 1000));
  if (deltaDays < 0) return { state: "overdue", nextDue: nextDay };
  if (deltaDays === 0) return { state: "due_now", nextDue: nextDay };
  if (deltaDays <= 7) return { state: "due_soon", nextDue: nextDay };
  return { state: "ok", nextDue: nextDay };
}

function mkConMonArtifact(nowUtc, tasks, summary) {
  const runId = runIdFromUtcIso(nowUtc) || nowUtc.replace(/[:.]/g, "-");
  return {
    schema: "mactech.codex.manual.conmon_snapshot",
    version: 1,
    generated_utc: nowUtc,
    run_id: runId,
    summary: summary || {},
    tasks: tasks || [],
  };
}

function mkConMonMarkdown(artifact) {
  const lines = [];
  lines.push("# Continuous Monitoring (ConMon) snapshot");
  lines.push("");
  lines.push(`Generated (UTC): ${artifact.generated_utc}`);
  lines.push("");
  if (artifact.summary) {
    lines.push("## Summary");
    for (const [k, v] of Object.entries(artifact.summary)) lines.push(`- ${k}: ${v}`);
    lines.push("");
  }
  lines.push("## Tasks");
  for (const t of artifact.tasks || []) {
    lines.push(`- **${t.control_id}** (${t.cadence}) — ${t.title || ""}`);
    if (t.due_state) lines.push(`  - due_state: ${t.due_state}`);
    if (t.next_due_local) lines.push(`  - next_due_local: ${t.next_due_local}`);
    if (t.last_completed_utc) lines.push(`  - last_completed_utc: ${t.last_completed_utc}`);
    if (t.last_evidence_ref) lines.push(`  - last_evidence_ref: ${t.last_evidence_ref}`);
  }
  lines.push("");
  return lines.join("\n");
}

function basisSuggestsOperationalRecordsMissing(control) {
  const b = normalize(control && control.pilot_status_basis).toLowerCase();
  if (!b) return false;
  return b.includes("operational records not yet attached") || b.includes("records not yet attached") || b.includes("records pending");
}

function classificationIs(control, needle) {
  return normalize(control && control.classification).toLowerCase().includes(String(needle || "").toLowerCase());
}

function adjudicationPrereqFailures(control, progressAll) {
  const failures = [];
  const cid = control && control.control_id ? String(control.control_id) : "";
  if (!cid) return failures;
  const p = getProgressEntry(progressAll || {}, cid);
  const evRefs = normalize(p.evidence_refs);

  const clsNorm = normalize(control && control.classification).toLowerCase();
  const isSystem = classificationIs(control, "system-enforced");
  const isGov = classificationIs(control, "governance");
  const isInherited = clsNorm === "inherited" || classificationIs(control, "inherited");
  const isNa = clsNorm === "not applicable" || clsNorm === "n/a" || classificationIs(control, "not applicable");

  if (isSystem) {
    if (!normalize(p.linked_evidence_dir)) failures.push("Missing linked evidence directory (run evidence collection + ingest).");
    if (p.validation_pass !== true) failures.push("Validator is not PASS for this control (run validation + ingest).");
    if (p.evidence_hashed !== true) failures.push("Evidence not hashed/integrity protected for latest run.");
  }

  if (isGov) {
    // Governance controls close when their referenced governance docs are signed.
    // Operational records are important, but do NOT block governance controls from closing.
    // Closeout for governance is doc-signoff driven; operational evidence refs are tracked separately.
    const byCode =
      progressAll && progressAll.__doc_signoffs_by_code && typeof progressAll.__doc_signoffs_by_code === "object" ? progressAll.__doc_signoffs_by_code : {};
    const refsRaw = control && control.policy_sop_refs ? control.policy_sop_refs : "";
    const codes = String(refsRaw || "").match(/MAC-(?:POL|SOP|IRP|CMP|FRM)-\d{3}/gi) || [];
    const uniq = [];
    const seen = new Set();
    for (const c of codes) {
      const k = normalize(c).toUpperCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(k);
    }
    if (!uniq.length) {
      if (!normalize(progressAll && progressAll.__last_governance_artifact_path)) {
        failures.push("Missing governance doc references (policy_sop_refs) and no governance artifact pointer found.");
      }
    } else {
      const missing = uniq.filter((k) => !byCode[k]);
      if (missing.length) failures.push(`Missing required governance doc signoffs: ${missing.join(", ")}`);
    }
  } else if (basisSuggestsOperationalRecordsMissing(control)) {
    if (!evRefs) failures.push("Missing operational record evidence refs in vault (fill Evidence refs).");
  }

  if (isInherited) {
    const sp = progressAll && progressAll.__srm_module && typeof progressAll.__srm_module === "object" ? progressAll.__srm_module : {};
    const inh = sp && sp.inherited && typeof sp.inherited === "object" ? sp.inherited : {};
    const e = inh[cid] && typeof inh[cid] === "object" ? inh[cid] : {};
    if (!normalize(progressAll && progressAll.__srm_reviewed_utc)) failures.push("SRM review not signed (Step 2 SRM).");
    if (!(e && e.ack === true)) failures.push("Inherited control not verified in SRM module.");
    if (!normalize(e && e.evidence_ref)) failures.push("Inherited evidence refs missing in SRM module.");
  }

  if (isNa) {
    const sp = progressAll && progressAll.__srm_module && typeof progressAll.__srm_module === "object" ? progressAll.__srm_module : {};
    const na = sp && sp.na && typeof sp.na === "object" ? sp.na : {};
    const e = na[cid] && typeof na[cid] === "object" ? na[cid] : {};
    if (!normalize(progressAll && progressAll.__na_attested_utc)) failures.push("N/A attestation not signed (Step 2 SRM).");
    if (!(e && e.ack === true)) failures.push("N/A control not attested in SRM module.");
    // N/A rationale is auto-generated (stored under justification_ref); do not block on user-authored text.
  }

  return failures;
}

function pickEvidenceDirForValidation(entries, validationName) {
  const vts = parseRunTimestampFromName(validationName);
  if (!vts) return null;
  const evidDirs = (entries || []).filter((e) => e && e.kind === "dir" && e.name && String(e.name).toLowerCase().indexOf("cui-evidence-") === 0);
  let best = null;
  let bestDelta = Infinity;
  for (const d of evidDirs) {
    const ets = parseRunTimestampFromName(d.name);
    if (!ets) continue;
    const delta = Math.abs(vts.getTime() - ets.getTime());
    // Prefer evidence generated close to validation (within ~2 hours)
    if (delta < bestDelta) {
      best = d;
      bestDelta = delta;
    }
  }
  return best;
}

async function ingestEvidenceRunIntoProgress(opts, controlsAll, getProgress, setProgressBulk) {
  const evidenceDir = opts && opts.evidenceDir ? String(opts.evidenceDir) : "";
  const validationDir = opts && opts.validationDir ? String(opts.validationDir) : "";
  if (!evidenceDir || !validationDir) throw new Error("Missing evidenceDir or validationDir.");

  const reportPath = `${validationDir}\\validation-report.json`;
  const reportText = await fsReadTextFile(reportPath);
  const report = JSON.parse(stripUtf8Bom(reportText));
  const byControl = summarizeValidationReport(report);
  const controlResults = report && report.control_results && Array.isArray(report.control_results) ? report.control_results : null;
  const byControlResult = {};
  if (controlResults) {
    for (const r of controlResults) {
      const cid = normalize(r && (r.control_id || r.control));
      if (!cid) continue;
      byControlResult[cid] = r;
    }
  }

  const evEntries = await fsListDir(evidenceDir);
  const hasHashes = evEntries.some((e) => e && e.kind === "file" && String(e.name || "").toLowerCase() === "hashes.sha256.txt");

  const nowUtc = new Date().toISOString();
  let next = { ...(getProgress() || {}) };
  next.__last_evidence_dir = evidenceDir;
  next.__last_validation_dir = validationDir;
  next.__last_validation_report = reportPath;
  next.__last_ingest_utc = nowUtc;
  next.__ingested_runs = next.__ingested_runs && Array.isArray(next.__ingested_runs) ? next.__ingested_runs.slice() : [];
  next.__ingested_runs.push({
    evidence_dir: evidenceDir,
    validation_dir: validationDir,
    validation_report: reportPath,
    ingested_utc: nowUtc,
    summary: report && report.summary ? report.summary : null,
  });

  // Evidence card auto-update:
  // Most controls in the dataset have evidence locations pinned to a specific historical CUI-Evidence-* run.
  // On ingest, rewrite those to the newest run so the Controls tab Evidence Cards always open the latest files.
  const rewriteTimestampedEvidencePaths = (s) => {
    const t = String(s || "");
    // Course correction: keep Evidence Card locations stable while archiving timestamped runs.
    // The bulk run wrapper maintains these as copies of the newest run:
    // - C:\evidence\CUI-Evidence-LATEST
    // - C:\evidence\CUI-Validation-LATEST
    return t
      .replace(/C:\\evidence\\CUI-Evidence-\d{8}-\d{6}/gi, "C:\\evidence\\CUI-Evidence-LATEST")
      .replace(/C:\\evidence\\CUI-Validation-\d{8}-\d{6}/gi, "C:\\evidence\\CUI-Validation-LATEST");
  };
  next = ensureEvidenceOverrides(next);

  let updated = 0;
  let adjudicated = 0;
  for (const c of controlsAll || []) {
    const cid = normalize(c.control_id);
    const res = byControl[cid];
    const cres = byControlResult[cid];
    if (!res && !cres) continue;

    const prev = next[cid] && typeof next[cid] === "object" ? next[cid] : {};
    const patch = {
      ...prev,
      linked_evidence_dir: evidenceDir,
      linked_validation_dir: validationDir,
      linked_validation_report: reportPath,
      evidence_collected: true,
      evidence_hashed: hasHashes ? true : !!prev.evidence_hashed,
      evidence_stored: true,
      updated_utc: nowUtc,
    };

    const pass = cres ? !!cres.pass : !!(res && res.passAll);
    if (cres) {
      patch.validation_pass = !!cres.pass;
      patch.validation_required_files = cres.required_files && Array.isArray(cres.required_files) ? cres.required_files : [];
      patch.validation_missing_files = cres.missing_files && Array.isArray(cres.missing_files) ? cres.missing_files : [];
      patch.validation_required_check_ids = cres.required_check_ids && Array.isArray(cres.required_check_ids) ? cres.required_check_ids : [];
      patch.validation_failed_check_ids = cres.failed_check_ids && Array.isArray(cres.failed_check_ids) ? cres.failed_check_ids : [];
      patch.validation_timestamp_utc = cres.timestamp_utc || nowUtc;
    }
    // Only auto-adjudicate when the run is complete and integrity-protected.
    // (If you still owe GUI screenshots / inherited evidence, leave as outstanding and adjudicate manually after attaching.)
    const canAutoAdjudicate = pass && hasHashes && (!patch.validation_missing_files || patch.validation_missing_files.length === 0);
    if (canAutoAdjudicate) {
      patch.adjudicated = true;
      adjudicated++;
    }

    // Ensure notes include a one-line trace.
    const noteLine = `Ingested validation ${validationDir} (PASS=${pass ? "yes" : "no"}) and evidence ${evidenceDir}`;
    if (!patch.notes) patch.notes = noteLine;
    else if (String(patch.notes).indexOf(noteLine) < 0) patch.notes = `${patch.notes}\n\n${noteLine}`;

    next[cid] = patch;
    updated++;

    // Update evidence card location override for this control (if it contains timestamped run paths).
    try {
      const baseLoc = c && c.evidence && c.evidence.location ? String(c.evidence.location) : "";
      if (baseLoc && /C:\\evidence\\CUI-(Evidence|Validation)-\d{8}-\d{6}/i.test(baseLoc)) {
        const rewritten = rewriteTimestampedEvidencePaths(baseLoc);
        if (rewritten && rewritten !== baseLoc) {
          // Do not clobber a user-set override.
          const existing = next.__evidence_overrides && next.__evidence_overrides[cid] ? next.__evidence_overrides[cid] : null;
          const existingLoc = existing && typeof existing === "object" ? normalize(existing.location || "") : "";
          if (!existingLoc) {
            next.__evidence_overrides[cid] = { location: rewritten, updated_utc: nowUtc };
          }
        }
      }
    } catch {}
  }

  setProgressBulk(next);
  return { updated, adjudicated, hasHashes };
}
function renderGovernanceDocs(docs, progress, docModal) {
  const root = $("#govDocList");
  const statsEl = $("#govDocStats");
  if (!root) return;

  if (!docs || !docs.length) {
    if (statsEl) statsEl.innerHTML = "";
    root.innerHTML = `<div class="list-empty">No governance documents found. Ensure the governance bundle exists under TRUST_CODEX/governance/.</div>`;
    return;
  }

  const signed = docs.filter((d) => getDocSignoff(progress, d.id)).length;
  const total = docs.length;
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat"><div class="k">Documents</div><div class="v">${total}</div></div>
      <div class="stat"><div class="k">Signed</div><div class="v">${signed}</div></div>
      <div class="stat"><div class="k">Remaining</div><div class="v">${Math.max(0, total - signed)}</div></div>
    `;
  }

  const rows = docs
    .slice()
    .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")) || String(a.title || "").localeCompare(String(b.title || "")));

  const kindLabel = (k) => {
    const s = normalize(k).toLowerCase();
    if (s === "policy") return "Policy";
    if (s === "procedure") return "SOP";
    if (s === "plan") return "Plan";
    if (s === "form") return "Form";
    return k || "Doc";
  };

  const kindPurpose = (k) => {
    const s = normalize(k).toLowerCase();
    if (s === "policy" || s === "procedure") {
      return "required sign-off (governance control closeout)";
    }
    if (s === "plan" || s === "form") {
      return "supporting template (optional unless org policy requires)";
    }
    return "supporting doc (optional unless org policy requires)";
  };

  root.innerHTML = `<div class="tableList">
    <div class="row h"><div>Document</div><div>Title</div><div class="right">Actions</div></div>
    ${rows
      .map((d) => {
        const s = getDocSignoff(progress, d.id);
        const statusPill = s ? `<span class="pill pill-good">signed</span>` : `<span class="pill pill-warn">needs sign-off</span>`;
        const sub = s ? `Signed by ${esc(s.name || "")}${s.review_date ? " · " + esc(s.review_date) : ""}` : `Not signed`;
        return `<div class="row">
          <div>
            <div class="cid">${esc(d.code || "")}</div>
            <div class="muted">${esc(kindLabel(d.kind))} · ${esc(kindPurpose(d.kind))}</div>
          </div>
          <div>
            <div style="font-weight:800">${esc(d.title || d.id)}</div>
            <div class="muted">${statusPill} <span class="muted"> ${esc(sub)}</span></div>
          </div>
          <div class="right">
            <button class="btnMini" data-gov-open="${esc(d.id)}">Open</button>
            <button class="btnMini" data-gov-sign="${esc(d.id)}">Sign</button>
          </div>
        </div>`;
      })
      .join("")}
  </div>`;

  root.querySelectorAll("button[data-gov-open]").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-gov-open");
      if (!id) return;
      docModal.openDocInModal(`../${id}`);
    };
  });
  root.querySelectorAll("button[data-gov-sign]").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-gov-sign");
      if (!id) return;
      const scopeEl = $("#attScope");
      if (scopeEl) scopeEl.value = docScopeFromId(id);
      const rd = $("#attReviewDate");
      if (rd && !normalize(rd.value)) rd.value = todayISODate();
      try {
        const el = $("#attName");
        if (el) el.focus();
      } catch {}
    };
  });
}

async function main() {
  if (window.location && window.location.protocol === "file:") {
    // Friendly file:// handling: redirect to local server URL.
    // (The app requires HTTP to load JSON/docs reliably.)
    const url = "http://127.0.0.1:8787/manual_app/index.html";
    try {
      document.body.innerHTML = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 18px; max-width: 720px; margin: 30px auto;">
          <div style="font-weight:900; font-size:18px;">Open Trust Codex Manual via the local server</div>
          <div style="margin-top:10px; color: rgba(0,0,0,0.72); line-height:1.45;">
            You opened this file directly (<code>file://</code>), but the manual must run over HTTP.
          </div>
          <div style="margin-top:12px;">
            Opening: <a href="${url}">${url}</a>
          </div>
          <div style="margin-top:12px; color: rgba(0,0,0,0.70);">
            If the page doesn’t load, start the server task: <code>schtasks /Run /TN CodexManualServer</code>
          </div>
        </div>
      `;
    } catch {}
    try { setTimeout(() => { window.location.href = url; }, 120); } catch {}
    return;
  }
  const resp = await fetch("manual-data.json", { cache: "no-store" });
  if (!resp.ok) throw new Error(`Failed to load manual-data.json: ${resp.status}`);
  const data = await resp.json();
  // Best-effort: enrich controls with NIST exact text + discussion guidance from SCTM dataset.
  try {
    const sctmResp = await fetch("../sctm/sctm-data.json", { cache: "no-store" });
    if (sctmResp.ok) {
      const sctm = await sctmResp.json();
      const map = {};
      for (const c of sctm && sctm.controls && Array.isArray(sctm.controls) ? sctm.controls : []) {
        if (c && c.control_id) map[c.control_id] = c;
      }
      for (const c of data.controls || []) {
        const ex = map[c.control_id];
        if (!ex) continue;
        if (!c.intent_plain && ex.intent_plain) c.intent_plain = ex.intent_plain;
        if (!c.nist_exact_text && ex.nist_exact_text) c.nist_exact_text = ex.nist_exact_text;
        if (!c.nist_discussion_guidance && ex.nist_discussion_guidance) c.nist_discussion_guidance = ex.nist_discussion_guidance;
        if (!c.classification_justification && ex.classification_justification) c.classification_justification = ex.classification_justification;
        if (!c.policy_sop_refs && ex.policy_sop_refs) c.policy_sop_refs = ex.policy_sop_refs;
      }
    }
  } catch {}

  const controlsAll = sortControls(data.controls || []);
  // Expose the dataset for small cross-view helpers.
  try { window.__controls_dataset = controlsAll; } catch {}
  try { setBuildInfo(); } catch {}
  const governanceDocs = await loadGovernanceManifest();
  const governanceControls = controlsAll.filter((c) => normalize(c.classification).indexOf("Governance") >= 0);
  const inheritedControls = controlsAll.filter((c) => normalize(c.classification).toLowerCase().indexOf("inherited") >= 0);
  const naControls = controlsAll.filter((c) => {
    const cls = normalize(c.classification).toLowerCase();
    if (cls.indexOf("not applicable") >= 0) return true;
    const st = normalize(c.pilot_status).toLowerCase();
    return st.indexOf("n/a") >= 0 || st.indexOf("not applicable") >= 0;
  });
  const classAControls = controlsAll.filter((c) => normalize(c.classification).toLowerCase().indexOf("system-enforced") >= 0);

  // Governance doc lookup helpers (for closure counts + incremental governance adjudication).
  const governanceDocById = {};
  const governanceDocByCode = {};
  for (const d of governanceDocs || []) {
    if (!d) continue;
    if (d.id) governanceDocById[String(d.id)] = d;
    if (d.code) governanceDocByCode[normalize(d.code).toUpperCase()] = d;
  }
  const extractGovDocCodes = (refsRaw) => {
    const s = String(refsRaw || "");
    const m = s.match(/MAC-(?:POL|SOP|IRP|CMP|FRM)-\d{3}/gi);
    if (!m) return [];
    const uniq = {};
    for (const x of m) {
      const k = normalize(x).toUpperCase();
      if (k) uniq[k] = true;
    }
    return Object.keys(uniq).sort();
  };
  const requiredGovDocsForControl = (control) => {
    const codes = extractGovDocCodes(control && control.policy_sop_refs ? control.policy_sop_refs : "");
    const docIds = [];
    const kinds = { policy: false, procedure: false, other: false };
    for (const code of codes) {
      const d = governanceDocByCode[code];
      if (!d || !d.id) continue;
      docIds.push(d.id);
      const k = normalize(d.kind).toLowerCase();
      if (k === "policy") kinds.policy = true;
      else if (k === "procedure") kinds.procedure = true;
      else kinds.other = true;
    }
    return { codes, docIds, kinds };
  };
  const computeGovernanceClosureStats = (progressObj) => {
    const p = progressObj && typeof progressObj === "object" ? progressObj : {};
    let govTotal = 0;
    let govAdjudicated = 0;
    let unmapped = 0;
    let policyOnly = 0;
    let sopOnly = 0;
    let policyAndSop = 0;
    let otherOnly = 0;

    for (const c of governanceControls || []) {
      govTotal++;
      const cid = c && c.control_id ? String(c.control_id) : "";
      if (cid && getProgressEntry(p, cid).adjudicated) govAdjudicated++;
      const req = requiredGovDocsForControl(c);
      if (!req.docIds.length) {
        unmapped++;
        continue;
      }
      const hasPol = !!req.kinds.policy;
      const hasSop = !!req.kinds.procedure;
      if (hasPol && hasSop) policyAndSop++;
      else if (hasPol) policyOnly++;
      else if (hasSop) sopOnly++;
      else otherOnly++;
    }
    return { govTotal, govAdjudicated, unmapped, policyOnly, sopOnly, policyAndSop, otherOnly };
  };

  const byId = {};
  for (const c of controlsAll) byId[c.control_id] = c;

  const familiesAll = uniqSorted(controlsAll.map((c) => normalize(c.family)));
  const familyMap = {};
  for (const fam of familiesAll) familyMap[fam] = controlsAll.filter((c) => normalize(c.family) === fam);

  const families = uniqSorted(controlsAll.map((c) => normalize(c.family)));
  const classes = uniqSorted(controlsAll.map((c) => normalize(c.classification)));

  buildSelectOptions($("#filterFamily"), families);
  buildSelectOptions($("#filterClass"), classes);

  let progress = loadProgress();
  // Migration/cleanup: legacy builds stored live audit cache inside progress (can exceed browser quota).
  try {
    if (progress && typeof progress === "object" && progress.__live_control_audit) {
      const next = { ...(progress || {}) };
      delete next.__live_control_audit;
      progress = next;
      saveProgress(progress);
    }
  } catch {}
  // If browser storage is empty, restore from disk (C:\evidence) if available.
  try {
    if (!progress || !Object.keys(progress).length) {
      const disk = await tryLoadProgressFromDisk();
      if (disk && typeof disk === "object") {
        progress = disk;
        saveProgress(progress);
      }
    }
  } catch {}

  // Backfill: ensure __doc_signoffs_by_code exists if __doc_signoffs exists.
  // This prevents governance closeout from getting stuck at 0/18 due to missing by-code index.
  try {
    const next = backfillDocSignoffsByCode(progress, governanceDocById);
    if (next !== progress) {
      progress = next;
      saveProgress(progress);
    }
  } catch {}

  // Migration: undo any prior auto-adjudication from SCTM baseline.
  // Controls should not be marked passing/adjudicated unless evidence is actually produced/verified.
  try {
    let changed = 0;
    const next = progress && typeof progress === "object" ? { ...(progress || {}) } : {};
    const nowUtc = new Date().toISOString();
    for (const key of Object.keys(next)) {
      if (!key || key.indexOf(".") < 0) continue;
      const entry = next[key];
      if (!entry || typeof entry !== "object") continue;
      if (entry.auto_adjudicated_from_sctm) {
        entry.adjudicated = false;
        delete entry.auto_adjudicated_from_sctm;
        entry.updated_utc = nowUtc;
        entry.notes = entry.notes ? `${entry.notes}\n\nAUTO-ADJUDICATION REVERTED: baseline status is not evidence.` : "AUTO-ADJUDICATION REVERTED: baseline status is not evidence.";
        next[key] = entry;
        changed++;
      }
    }
    if (changed) {
      progress = next;
      saveProgress(progress);
    }
  } catch {}

  // Reconcile governance controls from existing doc signoffs.
  // (If docs were bulk-signed previously, ensure governance controls become adjudicated automatically.)
  try {
    const prof = getAttesteeProfile(progress) || {};
    const signer = normalize(prof.name) || "";
    const next = progress && typeof progress === "object" ? { ...(progress || {}) } : {};
    const applied = maybeAdjudicateGovernanceControls(next, signer);
    if (applied && applied.applied) {
      progress = next;
      saveProgress(progress);
    }
  } catch {}
  const setProgress = (controlId, patch) => {
    progress = progress || {};
    progress[controlId] = { ...(progress[controlId] || {}), ...patch };
    saveProgress(progress);
    // re-render sidebar to update adjudicated pills
    scheduleRerender();
  };

  const setModuleProgress = (moduleKey, patch) => {
    progress = progress || {};
    progress.__modules = { ...(progress.__modules || {}) };
    progress.__modules[moduleKey] = { ...(progress.__modules[moduleKey] || {}), ...patch };
    saveProgress(progress);
  };
  const getProgress = () => progress || {};

  // Prefill signer inputs (Exports/Governance) from the required Attestee profile.
  try {
    applyAttesteeProfileToInputs(progress);
  } catch {}

  // Special internal path to persist a full object (used for attestations without rewriting all plumbing).
  const setProgressBulk = (obj) => {
    progress = obj || {};
    saveProgress(progress);
    scheduleRerender();
  };

  const docModal = setupDocModal(
    () => getProgress(),
    (moduleKey, patchObj) => setModuleProgress(moduleKey, patchObj)
  );
  const fileModal = setupFileModal();
  try {
    // Expose for small utility panels (e.g., ConMon audit/AV viewer) that render outside this closure.
    window.__fileModal = fileModal;
  } catch {}
  const srmModal = setupSrmModal({
    inheritedControls,
    naControls,
    getProgress: () => getProgress(),
    setProgressBulk,
    docModal,
    fileModal,
  });

  const setBulkStatus = (msg) => {
    const el = $("#bulkStatus");
    if (!el) return;
    el.textContent = msg ? String(msg) : " ";
    try {
      clearTimeout(setBulkStatus._t);
    } catch {}
    setBulkStatus._t = setTimeout(() => {
      const el2 = $("#bulkStatus");
      if (el2) el2.textContent = " ";
    }, 4000);
  };

  // Wire reference buttons to the modal (rendered markdown) and other apps to new tabs.
  bindClick("#btnOpenEvidenceIndex", () => docModal.openDocInModal("../tables/EVIDENCE_INDEX.md"));
  bindClick("#btnOpenSctm", () => openInNewTab("../sctm/SCTM_GUI.html"));
  bindClick("#btnOpenCodexViewer", () => openInNewTab("../_build/CODEX_VIEWER.html"));

  let selectedId = null;
  const listEl = $("#list");

  let activeView = "dashboard"; // dashboard | controls | governance | poam | conmon | ssp | exports | family
  let activeFamily = null;
  let lastEvidenceHintFetchMs = 0;

  const state = {
    query: "",
    family: "all",
    classification: "all",
    adjudicated: "all",
  };

  const getFiltered = () =>
    filterControls(
      controlsAll,
      state.query,
      state.family,
      state.classification,
      state.adjudicated,
      progress
    );

  // Performance: schedule rerenders (debounced) and avoid re-rendering the full control card
  // unless the selected control or its progress actually changed.
  let _rerenderScheduled = false;
  let _lastControlRenderKey = "";
  const scheduleRerender = () => {
    if (_rerenderScheduled) return;
    _rerenderScheduled = true;
    setTimeout(() => {
      _rerenderScheduled = false;
      rerender();
    }, 80);
  };

  // Ensure we don't crash if we introduce a view name not present in tab map.
  const originalSetTabActive = setTabActive;
  setTabActive = (view) => {
    if (view === "family") return; // no dedicated tab
    originalSetTabActive(view);
  };

  function ensureSelection(filtered) {
    if (selectedId && filtered.some((c) => c.control_id === selectedId)) return;
    selectedId = filtered.length ? filtered[0].control_id : null;
  }

  function setTabActive(view) {
    const map = {
      dashboard: "#tabDashboard",
      controls: "#tabControls",
      governance: "#tabGovernance",
      poam: "#tabPoam",
      conmon: "#tabConMon",
      audit: "#tabAudit",
      av: "#tabAv",
      ssp: "#tabSsp",
      exports: "#tabExports",
    };
    Object.entries(map).forEach(([k, sel]) => {
      const el = $(sel);
      if (!el) return;
      const on = k === view;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function applyViewVisibility() {
    const layout = document.querySelector(".layout");
    const sidebar = $("#sidebar");
    const mainActions = $("#mainActions");

    $("#viewDashboard").classList.toggle("hidden", activeView !== "dashboard");
    const famEl = $("#viewFamily");
    if (famEl) famEl.classList.toggle("hidden", activeView !== "family");
    $("#viewGovernance").classList.toggle("hidden", activeView !== "governance");
    const poamEl = $("#viewPoam");
    if (poamEl) poamEl.classList.toggle("hidden", activeView !== "poam");
    const conmonEl = $("#viewConMon");
    if (conmonEl) conmonEl.classList.toggle("hidden", activeView !== "conmon");
    const auditEl = $("#viewAudit");
    if (auditEl) auditEl.classList.toggle("hidden", activeView !== "audit");
    const avEl = $("#viewAv");
    if (avEl) avEl.classList.toggle("hidden", activeView !== "av");
    const sspEl = $("#viewSsp");
    if (sspEl) sspEl.classList.toggle("hidden", activeView !== "ssp");
    $("#viewExports").classList.toggle("hidden", activeView !== "exports");

    const controlsMode = activeView === "controls";
    $("#welcome").classList.toggle("hidden", !controlsMode);
    // controlCard visibility is handled in rerender when a selection exists.
    if (!controlsMode) $("#controlCard").classList.add("hidden");

    if (controlsMode) {
      layout.classList.remove("single");
      sidebar.style.display = "";
      mainActions.style.display = "";
    } else {
      layout.classList.add("single");
      sidebar.style.display = "none";
      mainActions.style.display = "none";
    }
  }

  function setView(view) {
    activeView = view;
    setTabActive(view);
    applyViewVisibility();
    try {
      localStorage.setItem(UI_VIEW_KEY, String(view || ""));
    } catch {}
    scheduleRerender();
  }

  function renderFamilyGrid() {
    const root = $("#familyGrid");
    if (!root) return;
    root.innerHTML = "";
    const so = splitOutstanding(controlsAll, progress);
    const outstanding = so.outstanding;

    for (const fam of familiesAll) {
      const items = familyMap[fam] || [];
      const famOutstanding = outstanding.filter((c) => normalize(c.family) === fam);
      const sysValidated = items.filter((c) => extractPs1Paths((c.evidence && c.evidence.regeneration_method) || "").length > 0);
      const gov = items.filter((c) => normalize(c.classification).indexOf("Governance") >= 0);

      const tile = document.createElement("div");
      tile.className = "tile";
      tile.innerHTML = `
        <div class="tile-k">${esc(fam)} family</div>
        <div class="tile-v">${items.length}</div>
        <div class="tile-sub">
          ${famOutstanding.length} outstanding · ${sysValidated.length} system-validated · ${gov.length} governance
        </div>
        <div class="tile-actions">
          <button class="btn btn-secondary" data-open-family="${esc(fam)}">Open ${esc(fam)}</button>
          <button class="btn" data-work-family="${esc(fam)}">Work outstanding</button>
        </div>
      `;
      root.appendChild(tile);
    }

    root.querySelectorAll("button[data-open-family]").forEach((b) => {
      b.onclick = () => {
        activeFamily = b.getAttribute("data-open-family");
        setView("family");
      };
    });
    root.querySelectorAll("button[data-work-family]").forEach((b) => {
      b.onclick = () => {
        activeFamily = b.getAttribute("data-work-family");
        setView("controls");
        state.adjudicated = "no";
        const selAdj = $("#filterAdjudicated");
        if (selAdj) selAdj.value = "no";
        const sel = $("#filterFamily");
        if (sel) sel.value = activeFamily;
        state.family = activeFamily;
        rerender();
      };
    });
  }

  function renderOnboardingWizard() {
    const root = $("#onbContent");
    const banner = $("#onbBanner");
    const steps = Array.from(document.querySelectorAll("button.onb-step[data-onb-step]"));
    if (!root || !banner || !steps.length) return;

    // Intro block (left side) — show the control-type breakdown before the steps.
    try {
      renderCmmcIntroBreakdown(controlsAll);
    } catch {}

    const p = getProgress() || {};
    const prof = getAttesteeProfile(p);
    const onb = p.__onboarding && typeof p.__onboarding === "object" ? p.__onboarding : {};
    const order = ["identify", "srm", "verify", "review", "ingest_finalize"];
    const active = order.indexOf(onb.active_step) >= 0 ? onb.active_step : "identify";

    const setActive = (key) => {
      const next = { ...(getProgress() || {}) };
      next.__onboarding = { ...(next.__onboarding || {}) };
      next.__onboarding.active_step = key;
      next.__onboarding.updated_utc = new Date().toISOString();
      if (!next.__onboarding.created_utc) next.__onboarding.created_utc = next.__onboarding.updated_utc;
      setProgressBulk(next);
      // setProgressBulk triggers rerender
    };

    steps.forEach((b) => {
      const k = b.getAttribute("data-onb-step");
      b.classList.toggle("active", k === active);
      b.onclick = () => setActive(k);
    });

    const statsAll = makeStats(controlsAll, progress, controlsAll);
    const total = statsAll.total || (controlsAll ? controlsAll.length : 0);
    const adj = statsAll.adjudicated || 0;
    const out = statsAll.outstanding || 0;
    const pct = total ? Math.round((adj / total) * 100) : 0;
    const attesteeLine = prof
      ? `Attestee: ${prof.name}${prof.title ? " · " + prof.title : ""}${prof.org ? " · " + prof.org : ""}`
      : "Action required: set Attestee identity (Step 1).";
    const targets = {
      enclaveConfig: classAControls.length,
      governance: governanceControls.length,
      inherited: inheritedControls.length,
      na: naControls.length,
    };
    const binAdj = {
      enclaveConfig: classAControls.filter((c) => getProgressEntry(progress, c.control_id).adjudicated).length,
      governance: governanceControls.filter((c) => getProgressEntry(progress, c.control_id).adjudicated).length,
      inherited: inheritedControls.filter((c) => getProgressEntry(progress, c.control_id).adjudicated).length,
      na: naControls.filter((c) => getProgressEntry(progress, c.control_id).adjudicated).length,
    };

    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>${esc(attesteeLine)}</div>
        <div><b>Adjudicated</b>: ${adj}/${total} (${pct}%) · <b>Outstanding</b>: ${out}</div>
      </div>
      <div class="muted" style="margin-top:8px">
        Closeout by bucket (adjudicated/total): <b>${binAdj.enclaveConfig}/${targets.enclaveConfig}</b> Enclave Configuration · <b>${binAdj.governance}/${targets.governance}</b> Governance · <b>${binAdj.inherited}/${targets.inherited}</b> Inherited · <b>${binAdj.na}/${targets.na}</b> N/A
      </div>
      <div class="progressBar" style="margin-top:10px"><div class="fill" style="width:${pct}%"></div></div>
    `;

    function contentFor(stepKey) {
      if (stepKey === "identify") {
        return `
          <h3>Identify (Attestee)</h3>
          <div class="prose">
            The customer/system owner is the <b>Attestee</b>. This identity is stamped onto governance sign-offs and exported attestations.
          </div>
          <div class="callout subtle" style="margin-top:10px">
            Also, CMMC Level 2 uses <b>NIST SP 800-171 Rev.2</b>. You can reference the mapping and evidence index at any time.
          </div>
          <div class="wf-actions" style="margin-top:12px">
            <button id="onbOpenMapping" class="btn btn-secondary" title="Open the 110-requirement mapping table (authoritative Rev.2)">Open control mapping (Rev.2)</button>
            <button id="onbOpenEvidenceIndex" class="btn btn-secondary" title="Open the Evidence Index (what artifacts to retain, cadence, retention)">Open Evidence Index</button>
          </div>

          <div class="gridForm" style="margin-top:12px">
            <div class="field">
              <label class="label" for="onbAttName">Name (required)</label>
              <input id="onbAttName" class="input" placeholder="Jane Doe" value="${esc(prof ? prof.name : "")}" />
            </div>
            <div class="field">
              <label class="label" for="onbAttTitle">Title / role</label>
              <input id="onbAttTitle" class="input" placeholder="System Owner" value="${esc(prof ? prof.title : "")}" />
            </div>
            <div class="field">
              <label class="label" for="onbAttOrg">Organization</label>
              <input id="onbAttOrg" class="input" placeholder="Customer Org" value="${esc(prof ? prof.org : "")}" />
            </div>
            <div class="field">
              <label class="label" for="onbAttReviewDate">Review date</label>
              <input id="onbAttReviewDate" class="input" placeholder="YYYY-MM-DD" value="${esc(prof ? prof.review_date : "")}" />
            </div>
          </div>
          <div class="wf-actions" style="margin-top:12px">
            <button id="onbAttSave" class="btn">Save Attestee profile</button>
          </div>
          <div class="muted" id="onbAttSaveStatus" style="margin-top:10px"> </div>
        `;
      }
      if (stepKey === "srm") {
        const sp = p.__srm_module && typeof p.__srm_module === "object" ? p.__srm_module : {};
        const az = sp.azure_inheritance && typeof sp.azure_inheritance === "object" ? sp.azure_inheritance : null;
        const loaded = !!(az && normalize(az.path));
        const inhMap = sp.inherited && typeof sp.inherited === "object" ? sp.inherited : {};
        const naMap = sp.na && typeof sp.na === "object" ? sp.na : {};
        const inhVerified = Object.values(inhMap).filter((x) => x && x.ack === true).length;
        const naAttested = Object.values(naMap).filter((x) => x && x.ack === true).length;
        const srmSigned = !!p.__srm_reviewed_utc;
        const naSigned = !!p.__na_attested_utc;
        const providerReq = az && Array.isArray(az.provider_evidence_required) ? az.provider_evidence_required : [];
        const customerReq = az && Array.isArray(az.customer_evidence_required) ? az.customer_evidence_required : [];
        const exp = az && Array.isArray(az.evidence_expectations) ? az.evidence_expectations : [];

        const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<div class="muted">—</div>`);
        return `
          <h3>SRM (Shared Responsibility Matrix) — Inherited + N/A closeout</h3>
          <div class="prose">
            This step is required to make <b>Inherited</b> and <b>N/A</b> adjudication defensible. You will load the Azure inheritance report, verify boundaries, record evidence references, and sign attestation statements.
          </div>
          <div class="callout subtle" style="margin-top:10px">
            <b>Status</b>: Azure inheritance loaded=${loaded ? "yes" : "no"} · Inherited verified ${inhVerified}/${inheritedControls.length} · N/A attested ${naAttested}/${naControls.length}<br/>
            <b>Signed</b>: SRM review=${srmSigned ? "yes" : "no"} · N/A attestation=${naSigned ? "yes" : "no"}
          </div>
          <div class="wf-actions" style="margin-top:12px">
            <button id="onbOpenSrmStep" class="btn">Open SRM module</button>
          </div>
          <div class="subcard" style="margin-top:12px">
            <div class="subcard-title">Evidence expectations (strict)</div>
            <div class="callout subtle" style="margin-top:0">
              These expectations must be retained as evidence. Provider attestations do not satisfy customer responsibilities.
            </div>
            <div class="prose">
              <div style="font-weight:900; margin-top:6px">Provider evidence required</div>
              ${list(providerReq)}
              <div style="font-weight:900; margin-top:10px">Customer evidence required</div>
              ${list(customerReq)}
              <div style="font-weight:900; margin-top:10px">SRM module expectations</div>
              ${list(exp)}
            </div>
          </div>
        `;
      }
      if (stepKey === "verify") {
        return `
          <h3>Verify OS hardening + auditing (bulk validation)</h3>
          <div class="prose">
            Run the read-only collectors to generate evidence and a validation report under <span class="mono">C:\\\\evidence</span>.
            Then ingest and audit to identify what still needs screenshots or additional artifacts.
          </div>
          <div class="callout subtle" style="margin-top:10px">
            <b>Order</b>: 1) Run evidence + validation → 2) Ingest latest run → 3) Run audit → 4) Review what still needs screenshots/artifacts.
          </div>
          <div class="wf-actions" style="margin-top:12px">
            <button id="onbRunBoth" class="btn">Run evidence + validation (Admin)</button>
            <button id="onbIngestLatest" class="btn btn-secondary">Ingest latest run</button>
            <button id="onbAdjudicatePass" class="btn btn-secondary" title="Marks controls as Adjudicated only when latest run shows PASS + hashes + no missing required artifacts.">Adjudicate PASS (latest run)</button>
            <button id="onbRunAudit" class="btn btn-secondary">Run audit now</button>
            <button id="onbOpenEvidenceRoot" class="btn btn-secondary">Open C:\\evidence</button>
          </div>
          <div class="muted" id="onbVerifyStatus" style="margin-top:10px"> </div>
          <div class="subcard" style="margin-top:12px">
            <div class="subcard-title">What’s still outstanding (after ingest)</div>
            <div class="prose" id="onbOsFindings">(Run ingest to populate findings.)</div>
          </div>
        `;
      }
      if (stepKey === "review") {
        return `
          <h3>Review Policies & SOPs (sign on cadence)</h3>
          <div class="prose">
            Governance controls require document review and sign-off. You can sign <b>individually</b> (document-by-document) or use the existing <b>bulk sign</b> option after completing your review process.
            Then write the governance artifact under <span class="mono">C:\\\\evidence</span>.
          </div>
          <div class="callout subtle" style="margin-top:10px">
            <b>Individual path</b>: Start Policies / Start SOPs → use <b>Sign + advance</b> on each document.<br/>
            <b>Bulk path</b>: Bulk sign all Policies/SOPs (when your org’s review is complete) → export the governance signoffs artifact.<br/>
            <b>Supporting docs</b>: Plans/forms/templates are shown under <b>Supporting docs</b>. These are optional unless your org policy requires sign-off.
          </div>
          <div class="wf-actions" style="margin-top:12px">
            <button id="onbOpenGovernance" class="btn">Open Governance review</button>
            <button id="onbStartPolicies" class="btn btn-secondary">Start Policies</button>
            <button id="onbStartSops" class="btn btn-secondary">Start SOPs</button>
            <button id="onbStartSupporting" class="btn btn-secondary">Start Supporting docs</button>
            <button id="onbBulkPolicies" class="btn btn-secondary">Bulk sign all Policies</button>
            <button id="onbBulkSops" class="btn btn-secondary">Bulk sign all SOPs</button>
            <button id="onbBulkSupporting" class="btn btn-secondary">Bulk sign Supporting docs</button>
            <button id="onbWriteGovArtifact" class="btn btn-secondary">Write governance artifact</button>
          </div>
          <div class="subcard" style="margin-top:12px">
            <div class="subcard-title">Governance progress</div>
            <div class="prose" id="onbGovProgress">—</div>
          </div>
        `;
      }
      // ingest_finalize
      return `
        <h3>Ingest & finalize (link everything to controls)</h3>
        <div class="prose">
          Finalize by linking the latest run to controls, enforcing audit accuracy, and exporting your package for backup/transfer.
        </div>
        <div class="wf-actions" style="margin-top:12px">
          <button id="onbIngestLatest2" class="btn">Ingest latest run</button>
          <button id="onbAdjudicatePass2" class="btn btn-secondary" title="Marks controls as Adjudicated only when latest run shows PASS + hashes + no missing required artifacts.">Adjudicate PASS (latest run)</button>
          <button id="onbRunAudit2" class="btn btn-secondary">Run audit now</button>
          <button id="onbExportProgress" class="btn btn-secondary">Export progress JSON</button>
          <button id="onbExportAtt" class="btn btn-secondary">Export attestations (MD)</button>
        </div>

        <div class="subcard" style="margin-top:12px">
          <div class="subcard-title">Inherited & N/A closeout (so they are adjudicated too)</div>
          <div class="prose" id="onbInhNaStatus">—</div>
          <div class="callout subtle" style="margin-top:10px">
            <b>Inherited</b>: verify Shared Responsibility Matrix (SRM) boundaries and retain provider/customer evidence as required.<br/>
            <b>N/A</b>: confirm a documented justification exists for why the requirement does not apply in this enclave scope.
          </div>
          <div class="wf-actions" style="margin-top:10px">
            <button id="onbOpenSrmDoc" class="btn btn-secondary">Open SRM module</button>
            <button id="onbBulkAdjInherited" class="btn btn-secondary">Adjudicate all Inherited (after SRM review)</button>
            <button id="onbBulkAdjNa" class="btn btn-secondary">Adjudicate all N/A (documented)</button>
          </div>
        </div>
      `;
    }

    root.innerHTML = contentFor(active);

    // Shared CTAs
    bindClick("#onbOpenMapping", () => docModal.openDocInModal("../tables/CONTROL_MAPPING_800-171R2.md"));
    bindClick("#onbOpenEvidenceIndex", () => docModal.openDocInModal("../tables/EVIDENCE_INDEX.md"));
    bindClick("#onbOpenSrmStep", () => srmModal.open());

    const setVerifyStatus = (msg) => {
      const el = $("#onbVerifyStatus");
      if (!el) return;
      el.textContent = msg ? String(msg) : "";
    };

    bindClick("#onbRunBoth", () => {
      try {
        const runBothScript = "C:\\hardening\\codex-scripts\\Run-CuiBulkEvidenceAndValidate.ps1";
        downloadRunElevatedLauncherForScripts([runBothScript], "evidence+validation");
        setVerifyStatus("Downloaded an elevated launcher (.cmd). Run it (UAC prompt), wait for completion, then click “Ingest latest run”.");
      } catch (e) {
        setVerifyStatus(`Run launcher failed: ${e && e.message ? e.message : e}`);
      }
    });
    bindClick("#onbOpenEvidenceRoot", () => {
      try {
        fileModal.openPath("C:\\evidence");
        setVerifyStatus("Opened C:\\evidence in the evidence viewer.");
      } catch (e) {
        setVerifyStatus(`Open failed: ${e && e.message ? e.message : e}`);
      }
    });
    bindClick("#onbIngestLatest", async () => {
      try {
        setVerifyStatus("Ingesting latest run…");
        const dirs = await getLatestRunDirsFromDisk();
        if (!dirs.validationDirName) throw new Error("No CUI-Validation-* directory found yet. Run “Run evidence + validation (Admin)” first.");
        if (!dirs.evidenceDirName) throw new Error("Could not determine matching CUI-Evidence-* for the latest validation run.");
        const validationDir = `C:\\evidence\\${dirs.validationDirName}`;
        const evidenceDir = `C:\\evidence\\${dirs.evidenceDirName}`;
        const res = await ingestEvidenceRunIntoProgress({ evidenceDir, validationDir }, controlsAll, getProgress, setProgressBulk);
        setVerifyStatus(
          `Ingested ${dirs.validationDirName}: updated ${res.updated} controls; auto-adjudicated ${res.adjudicated}; hashes=${res.hasHashes ? "yes" : "no"}.`
        );
      } catch (e) {
        setVerifyStatus(
          `Ingest failed: ${e && e.message ? e.message : e}\n\n` +
            `Tip: ingest requires the manual to be opened via the local Codex server (so /__fs can access C:\\evidence).`
        );
      }
    });
    bindClick("#onbRunAudit", async () => {
      try {
        setVerifyStatus("Running audit…");
        await auditAndEnforceAdjudications(controlsAll, getProgress, setProgressBulk, setVerifyStatus);
        setVerifyStatus("Audit complete. Review the audit report under C:\\evidence\\CUI-Audit-*.");
      } catch (e) {
        setVerifyStatus(
          `Audit failed: ${e && e.message ? e.message : e}\n\n` +
            `Tip: audit requires /__fs write access to C:\\evidence.`
        );
      }
    });
    const bulkAdjudicatePassLatest = () => {
      const p0 = getProgress() || {};
      const vdir = p0.__last_validation_dir ? String(p0.__last_validation_dir) : "";
      const edir = p0.__last_evidence_dir ? String(p0.__last_evidence_dir) : "";
      if (!vdir || !edir) {
        alert("No ingested run found yet. Run Ingest latest run first.");
        return;
      }
      const nowUtc = new Date().toISOString();
      const next = { ...(p0 || {}) };
      let n = 0;
      for (const c of controlsAll || []) {
        const cid = c && c.control_id ? String(c.control_id) : "";
        if (!cid) continue;
        const cls = normalize(c.classification).toLowerCase();
        if (cls.indexOf("system-enforced") < 0) continue;
        const e = next[cid];
        if (!e || typeof e !== "object") continue;
        if (String(e.linked_validation_dir || "") !== vdir) continue;
        const missing = e.validation_missing_files && Array.isArray(e.validation_missing_files) ? e.validation_missing_files : [];
        const ok = e.validation_pass === true && e.evidence_hashed === true && missing.length === 0;
        if (!ok) continue;
        if (e.adjudicated) continue;
        const noteLine = `Bulk adjudicated from validator PASS (latest run): ${vdir}`;
        next[cid] = {
          ...(e || {}),
          adjudicated: true,
          updated_utc: nowUtc,
          notes: e.notes ? (String(e.notes).indexOf(noteLine) >= 0 ? e.notes : `${e.notes}\n\n${noteLine}`) : noteLine,
        };
        n++;
      }
      setProgressBulk(next);
      alert(n ? `Adjudicated ${n} controls from PASS results in the latest run.` : "No eligible PASS controls found to adjudicate (latest run).");
    };
    bindClick("#onbAdjudicatePass", () => bulkAdjudicatePassLatest());
    bindClick("#onbOpenGovernance", () => setView("governance"));
    bindClick("#onbStartPolicies", () => {
      setView("governance");
      const b = $("#btnGovWizardPolicies");
      if (b) b.click();
    });
    bindClick("#onbStartSops", () => {
      setView("governance");
      const b = $("#btnGovWizardSops");
      if (b) b.click();
    });
    bindClick("#onbStartSupporting", () => {
      setView("governance");
      const b = $("#btnGovWizardSupporting");
      if (b) b.click();
    });
    bindClick("#onbBulkPolicies", () => {
      setView("governance");
      const b = $("#btnGovBulkSignPolicies");
      if (b) b.click();
    });
    bindClick("#onbBulkSops", () => {
      setView("governance");
      const b = $("#btnGovBulkSignSops");
      if (b) b.click();
    });
    bindClick("#onbBulkSupporting", () => {
      setView("governance");
      const b = $("#btnGovBulkSignSupporting");
      if (b) b.click();
    });
    bindClick("#onbWriteGovArtifact", () => {
      setView("governance");
      const b = $("#btnGovWriteEvidenceArtifact");
      if (b) b.click();
    });

    bindClick("#onbIngestLatest2", () => {
      const b = $("#onbIngestLatest");
      if (b) b.click();
    });
    bindClick("#onbAdjudicatePass2", () => bulkAdjudicatePassLatest());
    bindClick("#onbRunAudit2", () => {
      const b = $("#onbRunAudit");
      if (b) b.click();
    });
    bindClick("#onbExportProgress", () => {
      const b = $("#btnExport");
      if (b) b.click();
    });
    bindClick("#onbExportAtt", () => {
      const b = $("#btnExportAttestationsMd");
      if (b) b.click();
    });
    bindClick("#onbOpenSrmDoc", () => srmModal.open());
    bindClick("#onbBulkAdjInherited", () => {
      const prof = getAttesteeProfile(getProgress() || {});
      const signer = prof && prof.name ? prof.name : normalize($("#attName") ? $("#attName").value : "");
      if (!signer) {
        alert("Set Attestee identity (Step 1) before adjudicating Inherited controls.");
        return;
      }
      const pNow = getProgress() || {};
      if (!pNow.__srm_reviewed_utc) {
        alert("SRM review not signed yet. Open the SRM module, verify inherited boundaries, then click “Sign SRM review”.");
        return;
      }
      try {
        const sp = pNow.__srm_module && typeof pNow.__srm_module === "object" ? pNow.__srm_module : {};
        if (!sp.azure_inheritance || !normalize(sp.azure_inheritance.path)) {
          alert("Azure inheritance report not loaded in SRM module yet. Open SRM module and load it before bulk adjudication.");
          return;
        }
        const inhMap = sp && sp.inherited && typeof sp.inherited === "object" ? sp.inherited : {};
        const missing = [];
        for (const c of inheritedControls || []) {
          const cid = c && c.control_id ? String(c.control_id) : "";
          if (!cid) continue;
          const e = inhMap[cid] || {};
          if (!(e && e.ack === true)) missing.push(`${cid} (verify)`);
          else if (!normalize(e && e.evidence_ref ? e.evidence_ref : "")) missing.push(`${cid} (evidence refs)`);
        }
        if (missing.length) {
          alert(
            `Cannot bulk adjudicate Inherited until all are Verified in the SRM module.\n\nMissing (${missing.length}): ${missing
              .slice(0, 30)
              .join(", ")}${missing.length > 30 ? " …" : ""}`
          );
          return;
        }
      } catch {}
      const ok = confirm(
        "Adjudicate ALL Inherited controls?\n\nOnly do this after SRM/boundary evidence has been reviewed and retained."
      );
      if (!ok) return;
      const nowUtc = new Date().toISOString();
      const p0 = getProgress() || {};
      const next = { ...(p0 || {}) };
      let n = 0;
      for (const c of inheritedControls || []) {
        const cid = c && c.control_id ? String(c.control_id) : "";
        if (!cid) continue;
        const prev = next[cid] && typeof next[cid] === "object" ? next[cid] : {};
        if (prev.adjudicated) continue;
        next[cid] = {
          ...(prev || {}),
          adjudicated: true,
          updated_utc: nowUtc,
          notes:
            prev.notes ||
            `Inherited control adjudicated after SRM review. Signer: ${signer}. Evidence boundary: see SRM module + retained provider/customer artifacts.`,
        };
        n++;
      }
      next.__srm_reviewed_utc = nowUtc;
      next.__srm_reviewed_by = signer;
      setProgressBulk(next);
      alert(n ? `Adjudicated ${n} Inherited controls.` : "No outstanding Inherited controls found.");
    });
    bindClick("#onbBulkAdjNa", () => {
      const prof = getAttesteeProfile(getProgress() || {});
      const signer = prof && prof.name ? prof.name : normalize($("#attName") ? $("#attName").value : "");
      if (!signer) {
        alert("Set Attestee identity (Step 1) before adjudicating N/A controls.");
        return;
      }
      const pNow = getProgress() || {};
      if (!pNow.__na_attested_utc) {
        alert("N/A attestation not signed yet. Open the SRM module, acknowledge each N/A rationale, then click “Sign N/A attestation”.");
        return;
      }
      // Ensure each N/A has an acknowledgement (rationale is auto-generated).
      try {
        const sp = pNow.__srm_module && typeof pNow.__srm_module === "object" ? pNow.__srm_module : {};
        const naMap = sp && sp.na && typeof sp.na === "object" ? sp.na : {};
        const missing = [];
        for (const c of naControls || []) {
          const cid = c && c.control_id ? String(c.control_id) : "";
          if (!cid) continue;
          const e = naMap[cid] || {};
          const ok = e && e.ack === true;
          if (!ok) missing.push(cid);
        }
        if (missing.length) {
          alert(
            `N/A attestation incomplete. These controls are missing acknowledgement:\n\n${missing
              .slice(0, 30)
              .join(", ")}${missing.length > 30 ? " …" : ""}\n\nOpen SRM module and fill them in first.`
          );
          return;
        }
      } catch {}
      const ok = confirm(
        "Adjudicate ALL N/A controls?\n\nOnly do this after you have reviewed and acknowledged each N/A rationale statement for this enclave scope."
      );
      if (!ok) return;
      const nowUtc = new Date().toISOString();
      const p0 = getProgress() || {};
      const next = { ...(p0 || {}) };
      let n = 0;
      for (const c of naControls || []) {
        const cid = c && c.control_id ? String(c.control_id) : "";
        if (!cid) continue;
        const prev = next[cid] && typeof next[cid] === "object" ? next[cid] : {};
        if (prev.adjudicated) continue;
        next[cid] = {
          ...(prev || {}),
          adjudicated: true,
          updated_utc: nowUtc,
          notes:
            prev.notes ||
            `N/A control adjudicated (documented non-applicability in enclave scope). Signer: ${signer}.`,
        };
        n++;
      }
      next.__na_attested_utc = nowUtc;
      next.__na_attested_by = signer;
      setProgressBulk(next);
      alert(n ? `Adjudicated ${n} N/A controls.` : "No outstanding N/A controls found.");
    });

    // Step-specific dynamic content
    if (active === "verify") {
      try {
        const findings = $("#onbOsFindings");
        if (findings) {
          const { outstanding } = splitOutstanding(controlsAll, progress);
          const classAAll = (controlsAll || []).filter((c) => normalize(c.classification).includes("System-Enforced"));
          const classAOutstanding = outstanding.filter((c) => normalize(c.classification).includes("System-Enforced"));
          const latestV = (p.__last_validation_dir ? String(p.__last_validation_dir) : "") || inferLatestLinkedDir(p, controlsAll, "linked_validation_dir");
          const collectorsDefined = classAAll.filter((c) => extractPs1Paths((c.evidence && c.evidence.regeneration_method) || "").length > 0)
            .length;
          let linkedAll = 0;
          let passAll = 0;
          let failAll = 0;
          let notEvaluatedAll = 0;

          const NO_CHECK = "NO-CHECK-IMPLEMENTED";
          const notValidated = [];
          const realFails = [];
          const missingArtifacts = [];

          for (const c of classAAll) {
            const e = progress && progress[c.control_id] ? progress[c.control_id] : null;
            if (!e || typeof e !== "object") continue;
            if (latestV && String(e.linked_validation_dir || "") !== latestV) continue;
            linkedAll++;

            const missing = e.validation_missing_files && Array.isArray(e.validation_missing_files) ? e.validation_missing_files : [];
            const failed = e.validation_failed_check_ids && Array.isArray(e.validation_failed_check_ids) ? e.validation_failed_check_ids : [];

            if (missing.length) missingArtifacts.push({ c, missing, failed });

            if (e.validation_pass === true) {
              passAll++;
            } else if (e.validation_pass === false) {
              failAll++;
              if (failed.includes(NO_CHECK)) notValidated.push({ c, missing, failed });
              else realFails.push({ c, missing, failed });
            } else {
              notEvaluatedAll++;
            }
          }
          const lines = [];
          lines.push(`Outstanding Class A controls: ${classAOutstanding.length}`);
          lines.push("");
          lines.push(`Class A controls (total): ${classAAll.length}`);
          lines.push(`Class A controls with collectors defined: ${collectorsDefined}`);
          lines.push("");
          lines.push(`Latest ingest run: ${latestV || "(none yet — run Ingest latest run)"}`);
          if (latestV) {
            lines.push(`Validator coverage (all Class A linked to latest run): ${linkedAll}`);
            lines.push(`- PASS: ${passAll}`);
            lines.push(`- FAIL (real enforcement check failed): ${realFails.length}`);
            lines.push(`- Not validated (no check implemented): ${notValidated.length}`);
            lines.push(`- Missing required artifacts: ${missingArtifacts.length}`);
            lines.push(`- Not evaluated (no per-control validator result): ${notEvaluatedAll}`);
          }

          lines.push("");
          // Next actions summary (turns counts into an operator workflow).
          if (latestV) {
            lines.push("Next actions (recommended order):");
            lines.push(`1) Adjudicate PASS (latest run) — up to ${passAll} controls can be auto-adjudicated from this run.`);
            if (realFails.length || missingArtifacts.length) {
              lines.push(`2) Fix real FAILs / missing artifacts — ${Math.max(realFails.length, 0) + Math.max(missingArtifacts.length, 0)} control(s) need remediation or additional files.`);
            } else {
              lines.push("2) Fix real FAILs / missing artifacts — none detected in this run.");
            }
            if (notValidated.length) {
              lines.push(`3) Expand validator coverage OR adjudicate manually — ${notValidated.length} control(s) have no implemented validator check yet.`);
            } else {
              lines.push("3) Expand validator coverage OR adjudicate manually — none.");
            }
            lines.push("4) Run audit — enforces that adjudicated claims remain evidence-defensible.");
            lines.push("");
          }

          if (realFails.length || missingArtifacts.length) {
            lines.push("Controls that need closeout actions (real validator FAIL or missing artifacts):");
            const combined = [];
            for (const x of realFails) combined.push({ kind: "fail", ...x });
            for (const x of missingArtifacts) combined.push({ kind: "missing", ...x });
            for (const x of combined.slice(0, 14)) {
              const bits = [];
              if (x.kind === "fail") bits.push("validator FAIL");
              if (x.missing && x.missing.length) bits.push(`missing: ${x.missing.join(", ")}`);
              if (x.failed && x.failed.length) bits.push(`failed_check_ids: ${x.failed.join(", ")}`);

              // Provide a short remediation hint for common checks.
              const hintByCheck = {
                "AU-SUBCATS": "Run hardening (pilot_strict) to enable required audit subcategories, then re-run evidence+validation.",
                "AU-LOGSIZE": "Run hardening (pilot_strict) to set event log max sizes, then re-run evidence+validation.",
                "AU-SECLOG": "Ensure Security event log is enabled (wevtutil gl Security), then re-run validation.",
                "AU-AUDITPOL": "Ensure auditpol is available and returns output, then re-run validation.",
              };
              const firstHint = (x.failed || []).map((id) => hintByCheck[id]).find(Boolean);
              lines.push(`- ${x.c.control_id} — ${bits.join(" · ")}`);
              if (firstHint) lines.push(`  - Suggested fix: ${firstHint}`);
            }
            if (combined.length > 14) lines.push(`- …and ${combined.length - 14} more`);
          } else {
            lines.push("No real validator FAILs or missing required artifacts detected in the latest run.");
          }

          if (notValidated.length) {
            lines.push("");
            lines.push("Not validated yet (no check implemented in validator):");
            // Group by family to make the list digestible.
            const famMap = {};
            for (const x of notValidated) {
              const fam = normalize(x.c.family) || normalize(String(x.c.control_id || "").split(".")[0]) || "Other";
              famMap[fam] = famMap[fam] || [];
              famMap[fam].push(x.c);
            }
            const fams = Object.keys(famMap).sort((a, b) => a.localeCompare(b));
            for (const fam of fams) {
              const arr = famMap[fam] || [];
              const ids = arr.map((c) => c.control_id).slice(0, 10);
              lines.push(`- ${fam}: ${arr.length} (${ids.join(", ")}${arr.length > 10 ? ", …" : ""})`);
            }
            lines.push("");
            lines.push("Meaning: these are outstanding because the validator has no per-control enforcement check yet.");
            lines.push("You can still close them by manual adjudication (attach evidence paths + assessor notes), but they will not auto-close from PASS.");
          }
          findings.textContent = lines.join("\n");
        }
      } catch {}
    }
    if (active === "review") {
      try {
        const el = $("#onbGovProgress");
        if (el) {
          const docs = governanceDocs || [];
          const signedMap = p.__doc_signoffs && typeof p.__doc_signoffs === "object" ? p.__doc_signoffs : {};
          const signedCount = Object.keys(signedMap).length;
          const polTotal = docs.filter((d) => normalize(d.kind).toLowerCase() === "policy").length;
          const sopTotal = docs.filter((d) => normalize(d.kind).toLowerCase() === "procedure").length;
          const otherTotal = Math.max(0, docs.length - polTotal - sopTotal);
          const polSigned = docs.filter((d) => normalize(d.kind).toLowerCase() === "policy" && getDocSignoff(p, d.id)).length;
          const sopSigned = docs.filter((d) => normalize(d.kind).toLowerCase() === "procedure" && getDocSignoff(p, d.id)).length;
          const otherSigned = Math.max(0, signedCount - polSigned - sopSigned);
          const gs = computeGovernanceClosureStats(p);
          // How many are "ready" from doc signoffs right now?
          let ready = 0;
          try {
            for (const c of governanceControls || []) {
              const req = requiredGovDocsForControl(c);
              if (!req.docIds.length) continue;
              let ok = true;
              for (const docId of req.docIds) {
                if (!getDocSignoff(p, docId)) {
                  ok = false;
                  break;
                }
              }
              if (ok) ready++;
            }
          } catch {}
          const lines = [];
          lines.push(`Docs signed (all kinds): ${signedCount}/${docs.length}`);
          lines.push("");
          lines.push("Required for governance control closeout (controls reference these):");
          lines.push(`- Policies: ${polSigned}/${polTotal}`);
          lines.push(`- SOPs: ${sopSigned}/${sopTotal}`);
          lines.push("");
          lines.push("Supporting templates / program artifacts (not directly required for SCTM governance-control closeout):");
          lines.push(`- Plans/Forms/Other: ${otherSigned}/${otherTotal}`);
          lines.push("  - Purpose: retained as program documentation; sign-off is optional unless your org policy requires it.");
          lines.push("");
          lines.push(`Governance controls adjudicated: ${gs.govAdjudicated}/${gs.govTotal}`);
          lines.push(`Governance controls ready from signed docs: ${ready}/${gs.govTotal}`);
          lines.push("Expected closeout impact when fully completed:");
          lines.push(`- Policy-only controls (close after Policies): ${gs.policyOnly}`);
          lines.push(`- SOP-only controls (close after SOPs): ${gs.sopOnly}`);
          lines.push(`- Policy + SOP controls (need both): ${gs.policyAndSop}`);
          if (gs.otherOnly) lines.push(`- Other doc kinds referenced (plan/form/etc): ${gs.otherOnly}`);
          if (gs.unmapped) lines.push(`- Unmapped (no Policy/SOP reference found): ${gs.unmapped}`);
          lines.push("");
          lines.push("Tip: after signing a doc, governance controls will be adjudicated automatically once all referenced docs for that control are signed.");
          el.textContent = lines.join("\n");
        }
      } catch {}
    }
    if (active === "ingest_finalize") {
      try {
        const el = $("#onbInhNaStatus");
        if (el) {
          const pNow = getProgress() || {};
          const inhOut = inheritedControls.filter((c) => !getProgressEntry(pNow, c.control_id).adjudicated).length;
          const naOut = naControls.filter((c) => !getProgressEntry(pNow, c.control_id).adjudicated).length;
          el.textContent = `Outstanding: ${inhOut}/${inheritedControls.length} Inherited · ${naOut}/${naControls.length} N/A`;
        }
      } catch {}
    }

    // Attestee save handler (Step 1)
    bindClick("#onbAttSave", () => {
      const name = normalize($("#onbAttName") ? $("#onbAttName").value : "");
      const status = $("#onbAttSaveStatus");
      if (!name) {
        if (status) status.textContent = "Name is required.";
        alert("Attestee Name is required.");
        return;
      }
      const next = { ...(getProgress() || {}) };
      const now = new Date().toISOString();
      const existing = next.__attestee_profile && typeof next.__attestee_profile === "object" ? next.__attestee_profile : {};
      next.__attestee_profile = {
        created_utc: existing.created_utc || now,
        updated_utc: now,
        name,
        title: normalize($("#onbAttTitle") ? $("#onbAttTitle").value : ""),
        org: normalize($("#onbAttOrg") ? $("#onbAttOrg").value : ""),
        review_date: normalize($("#onbAttReviewDate") ? $("#onbAttReviewDate").value : ""),
      };
      setProgressBulk(next);
      try {
        applyAttesteeProfileToInputs(next);
      } catch {}
      if (status) status.textContent = "Saved. This identity will be used for document sign-offs and exported attestations.";
    });
  }

  function renderFamilyView() {
    if (activeView !== "family") return;
    const fam = activeFamily || familiesAll[0] || "";
    const items = familyMap[fam] || [];
    const t = $("#familyTitle");
    if (t) t.textContent = `${fam} family`;
    const st = $("#familySubtitle");
    if (st) st.textContent = `${items.length} controls in this family`;

    const sys = items.filter((c) => extractPs1Paths((c.evidence && c.evidence.regeneration_method) || "").length > 0);
    const gov = items.filter((c) => normalize(c.classification).indexOf("Governance") >= 0);

    const sysRoot = $("#familySystemList");
    const govRoot = $("#familyGovList");
    if (sysRoot) {
      if (!sys.length) {
        sysRoot.innerHTML = `<div class="list-empty">No system-validated controls detected for this family.</div>`;
      } else {
        sysRoot.innerHTML = `<div class="tableList">
          <div class="row h"><div>Control</div><div>Title</div><div class="right">Status</div></div>
          ${sys
            .map(
              (c) =>
                `<div class="row"><div class="cid">${esc(c.control_id)}</div><div class="muted">${esc(
                  c.title
                )}</div><div class="right"><span class="pill ${statusPillClass(effectiveStatusLabel(c, progress))}">${esc(
                  effectiveStatusLabel(c, progress)
                )}</span></div></div>`
            )
            .join("")}
        </div>`;
      }
    }
    if (govRoot) {
      if (!gov.length) {
        govRoot.innerHTML = `<div class="list-empty">No governance controls in this family.</div>`;
      } else {
        govRoot.innerHTML = `<div class="tableList">
          <div class="row h"><div>Control</div><div>Title</div><div class="right">Status</div></div>
          ${gov
            .map(
              (c) =>
                `<div class="row"><div class="cid">${esc(c.control_id)}</div><div class="muted">${esc(
                  c.title
                )}</div><div class="right"><span class="pill ${statusPillClass(effectiveStatusLabel(c, progress))}">${esc(
                  effectiveStatusLabel(c, progress)
                )}</span></div></div>`
            )
            .join("")}
        </div>`;
      }
    }
  }

  function firstOutstandingBy(predicate) {
    const { outstanding } = splitOutstanding(controlsAll, progress);
    for (const c of outstanding) if (predicate(c)) return c;
    return outstanding[0] || null;
  }

  function jumpToControl(control) {
    if (!control) return;
    selectedId = control.control_id;
    setView("controls");
    // focus the list on Outstanding-only for the user
    state.adjudicated = "no";
    const sel = $("#filterAdjudicated");
    if (sel) sel.value = "no";
  }

  let _autoReopenInFlight = false;
  function autoReopenInvalidAdjudications() {
    if (_autoReopenInFlight) return false;
    try {
      const p0 = getProgress() || {};
      const nowUtc = new Date().toISOString();
      let changed = false;
      const next = { ...(p0 || {}) };
      for (const c of controlsAll || []) {
        const cid = c && c.control_id ? String(c.control_id) : "";
        if (!cid) continue;
        const e = next[cid] && typeof next[cid] === "object" ? next[cid] : null;
        if (!e || e.adjudicated !== true) continue;
        const failures = adjudicationPrereqFailures(c, next);
        if (!failures.length) continue;
        const prevNotes = normalize(e.notes);
        const noteLine = `Auto-reopened: missing evidence prerequisites (${failures.join(" | ")}).`;
        next[cid] = {
          ...(e || {}),
          adjudicated: false,
          updated_utc: nowUtc,
          notes: prevNotes ? `${prevNotes}\n\n${noteLine}` : noteLine,
        };
        changed = true;
      }
      if (changed) {
        _autoReopenInFlight = true;
        setProgressBulk(next);
        _autoReopenInFlight = false;
        return true;
      }
    } catch {}
    return false;
  }

  function rerender() {
    // Enforce: closed/adjudicated must be evidence-defensible.
    // Only enforce this in the Controls view; other workflow tabs must remain usable.
    // If not, automatically reopen the control (prevents false-close).
    if (activeView === "controls") {
      if (autoReopenInvalidAdjudications()) return;
    }

    // Keep signer inputs conveniently prefilled whenever we re-render.
    try {
      applyAttesteeProfileToInputs(progress);
    } catch {}

    const filtered = getFiltered();
    ensureSelection(filtered);
    const stats = makeStats(controlsAll, progress, filtered);
    renderStats(stats);
    const listMode = state.adjudicated === "no" ? "outstanding" : "controls";
    renderList(listEl, filtered, progress, selectedId, (id) => {
      selectedId = id;
      scheduleRerender();
      const c = filtered.find((x) => x.control_id === id) || controlsAll.find((x) => x.control_id === id);
      if (c) renderControl(c, progress, setProgress, docModal, fileModal);
    }, listMode);

    if (activeView === "controls") {
      const selected = selectedId ? filtered.find((x) => x.control_id === selectedId) || byId[selectedId] : null;
      if (selected) {
        const p = getProgressEntry(progress, selected.control_id);
        const key = `${selected.control_id}|${p.updated_utc || ""}|${p.audit_failed_utc || ""}|${p.linked_evidence_dir || ""}|${p.linked_validation_dir || ""}|${p.adjudicated ? "1" : "0"}`;
        if (key !== _lastControlRenderKey) {
          _lastControlRenderKey = key;
          renderControl(selected, progress, setProgress, docModal, fileModal);
        }
      }
      if (!selected) {
        $("#controlCard").classList.add("hidden");
        $("#welcome").classList.remove("hidden");
      }
    }

    // update prev/next handlers based on current filtered list
    const idx = selectedId ? filtered.findIndex((c) => c.control_id === selectedId) : -1;
    bindClick("#btnPrev", () => {
      if (idx > 0) {
        selectedId = filtered[idx - 1].control_id;
        rerender();
      }
    });
    bindClick("#btnNext", () => {
      if (idx >= 0 && idx < filtered.length - 1) {
        selectedId = filtered[idx + 1].control_id;
        rerender();
      }
    });

    // dashboard (now onboarding)
    if (activeView === "dashboard") {
      renderOnboardingWizard();
    }

    if (activeView === "poam") {
      // Do not swallow POA&M failures silently — blank POA&M is worse than an error message.
      const poamStatusEl = $("#poamStatus");
      const setPoamStatusSafe = (msg) => {
        try {
          if (poamStatusEl) poamStatusEl.textContent = msg ? String(msg) : " ";
        } catch {}
      };
      try {
        const p0 = ensurePoamProgress(getProgress());
        const latestV =
          (p0.__last_validation_dir ? String(p0.__last_validation_dir) : "") || inferLatestLinkedDir(p0, controlsAll, "linked_validation_dir");
        const latestE = (p0.__last_evidence_dir ? String(p0.__last_evidence_dir) : "") || inferLatestLinkedDir(p0, controlsAll, "linked_evidence_dir");
        const summaryEl = $("#poamSummary");
        const listEl2 = $("#poamList");
        const statusEl = $("#poamStatus");
        const fStatus = $("#poamFilterStatus");
        const fSev = $("#poamFilterSeverity");
        const btnWrite = $("#btnPoamWriteArtifact");

        const setPoamStatus = (msg) => {
          if (statusEl) statusEl.textContent = msg ? String(msg) : " ";
        };

        // Always show *some* line above the list, even if later logic fails.
        try {
          if (summaryEl) summaryEl.textContent = `POA&M loading… (Build ${BUILD_ID})`;
        } catch {}

        const NO_CHECK = "NO-CHECK-IMPLEMENTED";
        const pathEq = (a, b) => normalize(a).toLowerCase() === normalize(b).toLowerCase();

        // Prefer scanning progress entries (robust even if controls list changes).
        const buildItemsFromProgress = (filterValidationDir) => {
          const out = [];
          for (const [cid0, e0] of Object.entries(p0 || {})) {
            const cid = String(cid0 || "");
            if (!cid || cid.indexOf("__") === 0) continue;
            const e = e0 && typeof e0 === "object" ? e0 : null;
            if (!e) continue;
            if (filterValidationDir && !pathEq(e.linked_validation_dir || "", filterValidationDir)) continue;

            const missing = e.validation_missing_files && Array.isArray(e.validation_missing_files) ? e.validation_missing_files : [];
            const failed = e.validation_failed_check_ids && Array.isArray(e.validation_failed_check_ids) ? e.validation_failed_check_ids : [];

            const hasMissing = missing.length > 0;
            const isRealFail = e.validation_pass === false && failed.length > 0 && !failed.includes(NO_CHECK);
            if (!hasMissing && !isRealFail) continue;

            const ctl = byId && byId[cid] ? byId[cid] : null;
            const title = (ctl && ctl.title) ? String(ctl.title) : "";

            const existing = p0.__poam.items[cid] && typeof p0.__poam.items[cid] === "object" ? p0.__poam.items[cid] : null;
            const po = { ...poamDefaultItem(), ...(existing || {}) };
            const findingBits = [];
            if (isRealFail) findingBits.push(`validator FAIL: ${failed.join(", ")}`);
            if (hasMissing) findingBits.push(`missing artifacts: ${missing.join(", ")}`);

            out.push({
              control_id: cid,
              title,
              finding_summary: findingBits.join(" · "),
              failed_check_ids: failed,
              missing_files: missing,
              linked_validation_dir: String(e.linked_validation_dir || ""),
              linked_evidence_dir: String(e.linked_evidence_dir || ""),
              poam: po,
            });
          }
          // Stable ordering
          out.sort((a, b) => String(a.control_id).localeCompare(String(b.control_id)));
          return out;
        };

        // Prefer the latest linked validation run; if that yields zero items, fall back to scanning all runs.
        let items = latestV ? buildItemsFromProgress(latestV) : buildItemsFromProgress("");
        let poamScope = latestV || "";
        if (!items.length) {
          const all = buildItemsFromProgress("");
          items = all;
          poamScope = latestV ? `${latestV} (no POA&M items found; showing all runs)` : "(all runs)";
        }

        // Auto-fill: populate concrete taskers the first time items are detected.
        // (User requested full fields filled for POA&M closeout.)
        try {
          if (!window.__poamAutofillInFlight) {
            let changed = false;
            const next = ensurePoamProgress(getProgress());
            for (const it of items) {
              const cid = it.control_id;
              if (!cid) continue;
              const existing = next.__poam.items[cid] && typeof next.__poam.items[cid] === "object" ? next.__poam.items[cid] : null;
              const cur = { ...poamDefaultItem(), ...(existing || {}) };
              const suggested = poamSuggestedItem(byId[cid] || { control_id: cid, title: it.title }, it.finding_summary, latestV, latestE);
              const merged = { ...(cur || {}) };
              // Only fill fields that are empty so we don’t overwrite user edits.
              let changedThis = false;
              for (const k of ["status", "severity", "owner", "planned_completion_date", "remediation_steps", "evidence_ref", "notes"]) {
                if (!normalize(merged[k]) && normalize(suggested[k])) {
                  merged[k] = suggested[k];
                  changedThis = true;
                }
              }
              if (changedThis) {
                merged.updated_utc = new Date().toISOString();
                next.__poam.items[cid] = merged;
                changed = true;
              }
            }
            if (changed) {
              window.__poamAutofillInFlight = true;
              setProgressBulk(next);
              window.__poamAutofillInFlight = false;
              // setProgressBulk triggers rerender; bail this render to avoid double work.
              return;
            }
          }
        } catch {}

        // filters
        const wantStatus = fStatus && fStatus.value ? String(fStatus.value) : "all";
        const wantSev = fSev && fSev.value ? String(fSev.value) : "all";
        const filteredItems = items.filter((it) => {
          const st = normalize(it.poam.status) || "open";
          const sev = normalize(it.poam.severity) || "medium";
          if (wantStatus !== "all" && st !== wantStatus) return false;
          if (wantSev !== "all" && sev !== wantSev) return false;
          return true;
        });

        if (summaryEl) {
          // Diagnostics for blank POA&M issues.
          const latestMsg = latestV ? `Latest linked validation: ${latestV}` : "Latest linked validation: (none)";
          const diagFailsAll = buildItemsFromProgress("").length;
          summaryEl.textContent = latestV
            ? `POA&M scope: ${poamScope} · Items detected: ${items.length} · ${latestMsg} · Fail candidates (all runs): ${diagFailsAll}`
            : `No linked validation run found yet. Run Verify + Ingest so POA&M can auto-populate.`;
        }

        if (listEl2) {
          if (!items.length) {
            listEl2.innerHTML = `<div class="muted">No POA&amp;M items detected for the latest linked validation run.</div>`;
          } else {
            // Render as readable cards (assessor-friendly, quick to scan).
            listEl2.innerHTML = `
              <div class="poamCards" aria-label="POA&M items">
                ${filteredItems
                  .map((it) => {
                    const cid = it.control_id;
                    const stored = p0.__poam.items[cid] && typeof p0.__poam.items[cid] === "object" ? p0.__poam.items[cid] : it.poam || {};
                    const status = normalize(stored.status) || "open";
                    const sev = normalize(stored.severity) || "medium";
                    const owner = stored.owner || "";
                    const pcd = stored.planned_completion_date || "";
                    const rem = stored.remediation_steps || "";
                    const evr = stored.evidence_ref || "";
                    const notes = stored.notes || "";
                    const sevClass = sev === "high" ? "pill-bad" : sev === "medium" ? "pill-warn" : "pill-muted";
                    const stClass = status === "complete" ? "pill-good" : status === "blocked" ? "pill-bad" : status === "in_progress" ? "pill-warn" : "pill-muted";
                    const collapsed =
                      !!(p0.__poam &&
                        p0.__poam.ui_collapsed &&
                        typeof p0.__poam.ui_collapsed === "object" &&
                        p0.__poam.ui_collapsed[cid] === true);
                    return `
                      <div class="poamCard ${collapsed ? "collapsed" : ""}" data-poam-card="${esc(cid)}">
                        <div class="poamCardHead">
                          <div>
                            <div class="poamCid">${esc(cid)}</div>
                            <div class="poamTitle">${esc(it.title || "")}</div>
                            <div class="poamFinding mono">${esc(it.finding_summary || "")}</div>
                          </div>
                          <div class="poamBadges">
                            <span class="pill ${sevClass}">sev:${esc(sev)}</span>
                            <span class="pill ${stClass}">status:${esc(status)}</span>
                            <button class="btn btn-secondary poamToggle" data-poam-toggle="${esc(cid)}">${collapsed ? "Expand" : "Collapse"}</button>
                          </div>
                        </div>

                        <div class="poamQuick">
                          <button class="btn btn-secondary" data-poam-open="${esc(cid)}">Open control</button>
                          <button class="btn btn-secondary" data-poam-set="in_progress" data-cid="${esc(cid)}">Mark in progress</button>
                          <button class="btn btn-secondary" data-poam-set="blocked" data-cid="${esc(cid)}">Mark blocked</button>
                          <button class="btn" data-poam-set="complete" data-cid="${esc(cid)}">Mark complete</button>
                        </div>

                        <div class="poamGrid">
                          <div class="field">
                            <label class="label">Owner</label>
                            <input class="input" value="${esc(owner)}" data-poam-field="owner" data-cid="${esc(cid)}" placeholder="IT Administrator / Compliance Officer" />
                          </div>
                          <div class="field">
                            <label class="label">Planned completion</label>
                            <input class="input mono" value="${esc(pcd)}" data-poam-field="planned_completion_date" data-cid="${esc(cid)}" placeholder="YYYY-MM-DD" />
                          </div>
                          <div class="field">
                            <label class="label">Status</label>
                            <select class="select" data-poam-field="status" data-cid="${esc(cid)}">
                              <option value="open" ${status === "open" ? "selected" : ""}>Open</option>
                              <option value="in_progress" ${status === "in_progress" ? "selected" : ""}>In progress</option>
                              <option value="blocked" ${status === "blocked" ? "selected" : ""}>Blocked</option>
                              <option value="complete" ${status === "complete" ? "selected" : ""}>Complete</option>
                            </select>
                          </div>
                          <div class="field">
                            <label class="label">Severity</label>
                            <select class="select" data-poam-field="severity" data-cid="${esc(cid)}">
                              <option value="high" ${sev === "high" ? "selected" : ""}>High</option>
                              <option value="medium" ${sev === "medium" ? "selected" : ""}>Medium</option>
                              <option value="low" ${sev === "low" ? "selected" : ""}>Low</option>
                            </select>
                          </div>
                          <div class="field" style="grid-column:1/-1">
                            <label class="label">Taskers (closeout steps)</label>
                            <textarea class="textarea" rows="10" data-poam-field="remediation_steps" data-cid="${esc(cid)}">${esc(rem)}</textarea>
                          </div>
                          <div class="field" style="grid-column:1/-1">
                            <label class="label">Evidence ref/path (vault)</label>
                            <input class="input mono" value="${esc(evr)}" data-poam-field="evidence_ref" data-cid="${esc(cid)}" placeholder="C:\\evidence\\..." />
                          </div>
                          <div class="field" style="grid-column:1/-1">
                            <label class="label">Notes</label>
                            <textarea class="textarea" rows="3" data-poam-field="notes" data-cid="${esc(cid)}">${esc(notes)}</textarea>
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `;
          }
        }

        // wiring (filters)
        if (fStatus) fStatus.onchange = () => scheduleRerender();
        if (fSev) fSev.onchange = () => scheduleRerender();

        // wiring (open control + field saving)
        if (listEl2) {
          listEl2.querySelectorAll("button[data-poam-open]").forEach((b) => {
            b.onclick = () => {
              const cid = b.getAttribute("data-poam-open");
              const ctl = cid ? byId[cid] : null;
              if (ctl) jumpToControl(ctl);
            };
          });

          listEl2.querySelectorAll("button[data-poam-set][data-cid]").forEach((b) => {
            b.onclick = () => {
              const cid = b.getAttribute("data-cid");
              const st = b.getAttribute("data-poam-set");
              if (!cid || !st) return;
              const next = ensurePoamProgress(getProgress());
              const nowUtc = new Date().toISOString();
              const prev = next.__poam.items[cid] && typeof next.__poam.items[cid] === "object" ? next.__poam.items[cid] : poamDefaultItem();
              next.__poam.items[cid] = { ...(prev || {}), status: st, updated_utc: nowUtc };
              setProgressBulk(next);
            };
          });

          listEl2.querySelectorAll("button[data-poam-toggle]").forEach((b) => {
            b.onclick = (e) => {
              try {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
              } catch {}
              const cid = b.getAttribute("data-poam-toggle");
              if (!cid) return;
              const next = ensurePoamProgress(getProgress());
              const cur = !!(next.__poam.ui_collapsed && next.__poam.ui_collapsed[cid] === true);
              next.__poam.ui_collapsed[cid] = !cur;
              setProgressBulk(next);
            };
          });

          const saveField = (cid, field, value) => {
            const next = ensurePoamProgress(getProgress());
            const nowUtc = new Date().toISOString();
            const prev = next.__poam.items[cid] && typeof next.__poam.items[cid] === "object" ? next.__poam.items[cid] : poamDefaultItem();
            next.__poam.items[cid] = { ...(prev || {}), [field]: value, updated_utc: nowUtc };
            setProgressBulk(next);
          };

          listEl2.querySelectorAll("[data-poam-field][data-cid]").forEach((el) => {
            const cid = el.getAttribute("data-cid");
            const field = el.getAttribute("data-poam-field");
            if (!cid || !field) return;
            if (el.tagName === "SELECT") {
              el.onchange = () => saveField(cid, field, String(el.value || ""));
            } else {
              let t = null;
              el.oninput = () => {
                if (t) clearTimeout(t);
                t = setTimeout(() => saveField(cid, field, String(el.value || "")), 250);
              };
              el.onchange = () => saveField(cid, field, String(el.value || ""));
            }
          });
        }

        if (btnWrite) {
          btnWrite.onclick = async () => {
            try {
              setPoamStatus("Writing POA&M artifact to C:\\evidence…");
              const nowUtc = new Date().toISOString();
              const pNow = ensurePoamProgress(getProgress());
              const latestV2 =
                (pNow.__last_validation_dir ? String(pNow.__last_validation_dir) : "") || inferLatestLinkedDir(pNow, controlsAll, "linked_validation_dir");

              const outItems = items.map((it) => {
                const stored = pNow.__poam.items[it.control_id] && typeof pNow.__poam.items[it.control_id] === "object" ? pNow.__poam.items[it.control_id] : {};
                return {
                  control_id: it.control_id,
                  title: it.title || "",
                  finding_summary: it.finding_summary || "",
                  failed_check_ids: it.failed_check_ids || [],
                  missing_files: it.missing_files || [],
                  status: stored.status || "open",
                  severity: stored.severity || "medium",
                  owner: stored.owner || "",
                  planned_completion_date: stored.planned_completion_date || "",
                  remediation_steps: stored.remediation_steps || "",
                  evidence_ref: stored.evidence_ref || "",
                  notes: stored.notes || "",
                  updated_utc: stored.updated_utc || "",
                };
              });

              const art = mkPoamArtifact(nowUtc, latestV2, outItems);
              const outDir = `C:\\evidence\\CUI-POAM-${art.run_id}`;
              const jsonPath = `${outDir}\\poam.json`;
              const mdPath = `${outDir}\\poam.md`;
              await fsWriteTextFile(jsonPath, JSON.stringify(art, null, 2) + "\n");
              await fsWriteTextFile(mdPath, mkPoamMarkdown(art) + "\n");
              setPoamStatus(`Wrote: ${jsonPath} and ${mdPath}`);
              if (fileModal) fileModal.openPath(outDir);
            } catch (e) {
              setPoamStatus(`Write failed: ${e && e.message ? e.message : e}`);
            }
          };
        }
      } catch (e) {
        console.error(e);
        setPoamStatusSafe(`POA&M render error: ${e && e.message ? e.message : e}`);
      }
    }

    if (activeView === "conmon") {
      try {
        const p0 = ensureConMonProgress(getProgress());
        const tiles = $("#conmonTiles");
        const listEl2 = $("#conmonList");
        const statusEl = $("#conmonStatus");
        const fCad = $("#conmonFilterCadence");
        const fDue = $("#conmonFilterDue");
        const btnWrite = $("#btnConmonWriteArtifact");

        // BOE collection (web app bridge) + in-app cadence tracking
        try {
          const KEY = "codex.conmon.liveOrigin";
          const defaultOrigin = "http://127.0.0.1:3000";
          const KEY_TOKEN = "codex.conmon.serviceToken";
          const inOrigin = $("#conmonLiveOrigin");
          const inToken = $("#conmonServiceToken");
          const btnGenToken = $("#btnConmonGenToken");
          const boeTiles = $("#conmonBoeTiles");
          const boeList = $("#conmonBoeList");
          const boeStatus = $("#conmonBoeStatus");

          const setBoeStatus = (msg) => {
            if (boeStatus) boeStatus.textContent = msg ? String(msg) : " ";
          };

          const normOrigin = (s) => String(s || "").trim().replace(/\/+$/, "");
          const getOrigin = () => {
            try {
              const v = localStorage.getItem(KEY);
              return normOrigin(v || "") || defaultOrigin;
            } catch {
              return defaultOrigin;
            }
          };
          const setOrigin = (v) => {
            try {
              localStorage.setItem(KEY, String(v || ""));
            } catch {}
          };
          const getToken = () => {
            try {
              return String(localStorage.getItem(KEY_TOKEN) || "").trim();
            } catch {
              return "";
            }
          };
          const setToken = (v) => {
            try {
              localStorage.setItem(KEY_TOKEN, String(v || ""));
            } catch {}
          };
          const apiUrl = () => {
            const origin = normOrigin(inOrigin && inOrigin.value ? inOrigin.value : getOrigin());
            return origin + "/api/admin/conmon/run";
          };

          if (inOrigin && !inOrigin.value) {
            inOrigin.value = getOrigin();
          }
          if (inOrigin) {
            inOrigin.onchange = () => setOrigin(inOrigin.value || "");
          }
          if (inToken && !inToken.value) {
            inToken.value = getToken();
          }
          if (inToken) {
            inToken.onchange = () => setToken(inToken.value || "");
          }

          // Convenience: generate a fresh service token and install it on the VM.
          // Server reads from env or repo file: .secrets/codex_manual_service_token
          if (btnGenToken) {
            btnGenToken.onclick = async () => {
              try {
                const tok = generateServiceToken();
                if (inToken) inToken.value = tok;
                setToken(tok);
                setBoeStatus("Generated token. Installing to VM repo…");

                // Prefer repo path from SSP tab settings if present; else default.
                let repoPath = "C:\\Users\\admin_patrick\\mactech";
                try {
                  const saved = localStorage.getItem("codex.ssp.repoPath");
                  if (saved && String(saved).trim()) repoPath = String(saved).trim();
                } catch {}

                const secretsDir = `${repoPath}\\\.secrets`;
                const secretsFile = `${secretsDir}\\codex_manual_service_token`;

                // Try direct write (requires manual opened via local server with /__fs enabled).
                try {
                  // Ensure directory exists (best-effort).
                  await fsWriteTextFile(`${secretsDir}\\_keep.txt`, "keep\n");
                  await fsWriteTextFile(secretsFile, tok + "\n");
                  setBoeStatus(`Token installed: ${secretsFile}\n\nNext: use the Controls/SSP workflows without pasting tokens.`);
                  return;
                } catch (e) {
                  // Fall back to a simple installer .cmd (non-elevated) for the user to run.
                  const ts = new Date().toISOString().replace(/[:.]/g, "-");
                  const cmd = [
                    "@echo off",
                    "setlocal EnableExtensions",
                    "echo.",
                    "echo Codex: installing CODEX_MANUAL_SERVICE_TOKEN to repo .secrets ...",
                    `set "REPO=${repoPath}"`,
                    "set \"DIR=%REPO%\\.secrets\"",
                    "if not exist \"%DIR%\" mkdir \"%DIR%\"",
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command " +
                      psSingleQuote(
                        `$p=${psSingleQuote(secretsFile)};` +
                          `$t=${psSingleQuote(tok)};` +
                          // Write token with newline (Set-Content adds newline by default).
                          `Set-Content -LiteralPath $p -Value $t -Encoding ASCII;` +
                          `Write-Host ('Wrote: ' + $p) -ForegroundColor Green;`
                      ),
                    "echo.",
                    "echo Done. Re-open the manual if needed and use the new token.",
                    "pause",
                    "",
                  ].join("\r\n");
                  downloadText(`codex-install-service-token-${ts}.cmd`, cmd, "text/plain; charset=utf-8");
                  setBoeStatus(
                    `Generated token, but couldn't write to disk from the browser.\n` +
                      `Downloaded installer (.cmd). Run it on the VM to write:\n` +
                      `${secretsFile}\n`
                  );
                }
              } catch (e) {
                setBoeStatus("Token generation failed: " + (e && e.message ? e.message : e));
              }
            };
          }

          // Native BOE buttons (service-token bridge)
          const BOE_TASKS = [
            {
              id: "audit_security_event_review",
              title: "Audit & security event review (AU/SI)",
              cadence: "Daily (triage) + monthly/quarterly formal review",
            },
            {
              id: "identity_access_review",
              title: "Identity & access posture snapshot (IA/AC)",
              cadence: "Continuous enforcement + quarterly review (minimum)",
            },
            {
              id: "endpoint_av_verification_review",
              title: "Endpoint AV/EDR verification currency (SI)",
              cadence: "As needed + monthly currency check",
            },
            {
              id: "change_control_snapshot",
              title: "Configuration / change activity snapshot (CM)",
              cadence: "Per change + monthly drift/baseline check",
            },
            {
              id: "poam_status_review",
              title: "POA&M status snapshot (CA/RA support)",
              cadence: "Monthly (minimum) + trigger-based",
            },
            {
              id: "vulnerability_alert_review",
              title: "Vulnerability alert snapshot (RA/SI) (Dependabot optional)",
              cadence: "Weekly dependency scanning + monthly application scan",
            },
          ];

          const renderBoe = () => {
            if (boeTiles) {
              boeTiles.innerHTML = `
                <div class="tile"><div class="tile-k">Tasks</div><div class="tile-v">${BOE_TASKS.length}</div><div class="tile-sub">Runnable via API bridge.</div></div>
                <div class="tile"><div class="tile-k">Endpoint</div><div class="tile-v">/api/admin/conmon/run</div><div class="tile-sub">CORS + Bearer token.</div></div>
              `;
            }
            if (boeList) {
              boeList.innerHTML = `
                <div class="conmonList" role="table" aria-label="CONMON BOE tasks">
                  <div class="conmonRow conmonHead" role="row">
                    <div role="columnheader">Task</div>
                    <div role="columnheader">Cadence</div>
                    <div role="columnheader">Run</div>
                  </div>
                  ${BOE_TASKS.map((t) => {
                    const tid = esc(t.id);
                    return `
                      <div class="conmonRow" role="row">
                        <div>
                          <div class="conmonCid">${tid}</div>
                          <div class="conmonMeta">${esc(t.title)}</div>
                        </div>
                        <div class="conmonMeta mono">${esc(t.cadence)}</div>
                        <div class="conmonActions">
                          <button class="btn" data-boe-run="${tid}">Run BOE (store in /admin/files)</button>
                          <button class="btn btn-secondary" data-boe-openfiles="1">Open /admin/files</button>
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              `;
            }

            if (boeList) {
              setBoeStatus("Ready. Paste token, then click Run BOE.");

              boeList.querySelectorAll("button[data-boe-openfiles]").forEach((b) => {
                b.onclick = () => {
                  const origin = normOrigin(inOrigin && inOrigin.value ? inOrigin.value : getOrigin());
                  openInNewTab(origin + "/admin/files");
                };
              });

              boeList.querySelectorAll("button[data-boe-run]").forEach((b) => {
                b.onclick = async () => {
                  const taskId = String(b.getAttribute("data-boe-run") || "");
                  if (!taskId) return;
                  const origin = normOrigin(inOrigin && inOrigin.value ? inOrigin.value : getOrigin());
                  const token = String(inToken && inToken.value ? inToken.value : getToken()).trim();
                  if (!token) {
                    alert("Service token is required (CODEX_MANUAL_SERVICE_TOKEN). Paste it into the Service token field first.");
                    return;
                  }
                  setBoeStatus("Running BOE task via API bridge…");
                  try {
                    const res = await fetch(apiUrl(), {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + token
                      },
                      body: JSON.stringify({ taskId: taskId })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      const msg = data && data.error ? String(data.error) : ("HTTP " + res.status);
                      setBoeStatus("BOE failed: " + msg);
                      return;
                    }
                    const arts = data && data.artifacts && Array.isArray(data.artifacts) ? data.artifacts : [];
                    const links = arts.map((a) => {
                      const fn = a && a.filename ? String(a.filename) : "artifact";
                      const su = a && a.signedUrl ? String(a.signedUrl) : "";
                      const href = su ? (origin + su) : (origin + "/admin/files");
                      return `- ${fn} → ${href}`;
                    }).join("\n");
                    setBoeStatus("BOE generated. Artifacts:\n" + (links || "(none returned)") + "\n\nTip: open /admin/files to browse.");
                  } catch (e) {
                    setBoeStatus("BOE failed: " + (e && e.message ? e.message : e));
                  }
                };
              });

              // If buttons didn't render for any reason, surface it.
              try {
                const n = boeList.querySelectorAll("button[data-boe-run]").length;
                if (!n) {
                  setBoeStatus("BOE bridge UI failed to initialize (no buttons rendered). Refresh the page, then reopen ConMon.");
                }
              } catch {}
            }
          };

          try {
            renderBoe();
          } catch (e) {
            // Surface in UI instead of failing silently.
            setBoeStatus("BOE bridge init failed: " + (e && e.message ? e.message : e));
          }
        } catch {}

        const setConMonStatus = (msg) => {
          if (statusEl) statusEl.textContent = msg ? String(msg) : " ";
        };

        const wantCad = fCad && fCad.value ? String(fCad.value) : "all";
        const wantDue = fDue && fDue.value ? String(fDue.value) : "all";

        const tasks = [];
        for (const c of controlsAll || []) {
          if (!c || !c.control_id) continue;
          const ev = c.evidence && typeof c.evidence === "object" ? c.evidence : {};
          const cadText = ev && ev.cadence ? String(ev.cadence) : "";
          const buckets = parseCadenceBuckets(cadText);
          if (!buckets.length) continue;

          const cid = String(c.control_id);
          const cm = p0.__conmon && p0.__conmon[cid] && typeof p0.__conmon[cid] === "object" ? p0.__conmon[cid] : {};
          const cadMap = cm.cadences && typeof cm.cadences === "object" ? cm.cadences : {};

          for (const k of buckets) {
            const per = cadMap[k] && typeof cadMap[k] === "object" ? cadMap[k] : {};
            const lastUtc = normalize(per.last_completed_utc) || "";
            const lastEv = normalize(per.last_evidence_ref) || "";
            const lastNotes = normalize(per.last_notes) || "";
            const due = dueStateFor(k, lastUtc);

            tasks.push({
              control_id: cid,
              title: c.title || "",
              family: c.family || "",
              classification: c.classification || "",
              cadence_key: k,
              cadence_label: cadenceLabel(k),
              due_state: due.state,
              next_due: due.nextDue,
              last_completed_utc: lastUtc,
              last_evidence_ref: lastEv,
              last_notes: lastNotes,
              cadence_text: cadText,
            });
          }
        }

        const filtered = tasks.filter((t) => {
          if (wantCad !== "all" && t.cadence_key !== wantCad) return false;
          if (wantDue !== "all" && t.due_state !== wantDue) return false;
          return true;
        });

        const counts = { due_now: 0, due_soon: 0, overdue: 0, ok: 0 };
        for (const t of tasks) {
          if (counts[t.due_state] !== undefined) counts[t.due_state]++;
        }

        if (tiles) {
          tiles.innerHTML = `
            <div class="tile"><div class="tile-k">Due now</div><div class="tile-v">${counts.due_now}</div><div class="tile-sub">Needs completion now (or never completed).</div></div>
            <div class="tile"><div class="tile-k">Due soon</div><div class="tile-v">${counts.due_soon}</div><div class="tile-sub">Due within 7 days.</div></div>
            <div class="tile"><div class="tile-k">Overdue</div><div class="tile-v">${counts.overdue}</div><div class="tile-sub">Past due date.</div></div>
            <div class="tile"><div class="tile-k">OK</div><div class="tile-v">${counts.ok}</div><div class="tile-sub">Not due yet (or per-change).</div></div>
          `;
        }

        if (fCad) fCad.onchange = () => scheduleRerender();
        if (fDue) fDue.onchange = () => scheduleRerender();

        if (listEl2) {
          if (!tasks.length) {
            listEl2.innerHTML = `<div class="muted">No cadence-based tasks found. (Controls must have \`evidence.cadence\` defined.)</div>`;
          } else {
            const fmtLocal = (d) => {
              try {
                if (!d) return "";
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              } catch {
                return "";
              }
            };

            listEl2.innerHTML = `
              <div class="conmonList" role="table" aria-label="ConMon tasks">
                <div class="conmonRow conmonHead" role="row">
                  <div role="columnheader">Control</div>
                  <div role="columnheader">Cadence</div>
                  <div role="columnheader">Record completion</div>
                </div>
                ${filtered
                  .sort((a, b) => {
                    const w = { overdue: 0, due_now: 1, due_soon: 2, ok: 3 };
                    const da = w[a.due_state] ?? 9;
                    const db = w[b.due_state] ?? 9;
                    if (da !== db) return da - db;
                    return `${a.control_id}|${a.cadence_key}`.localeCompare(`${b.control_id}|${b.cadence_key}`);
                  })
                  .map((t) => {
                    const key = `${t.control_id}|${t.cadence_key}`;
                    const nextDue = t.next_due ? fmtLocal(t.next_due) : "";
                    const lastUtc = t.last_completed_utc || "";
                    const lastEv = t.last_evidence_ref || "";
                    const statePill =
                      t.due_state === "overdue"
                        ? "pill-bad"
                        : t.due_state === "due_now"
                          ? "pill-warn"
                          : t.due_state === "due_soon"
                            ? "pill-warn"
                            : "pill-good";
                    return `
                      <div class="conmonRow" role="row">
                        <div class="conmonCid">${esc(t.control_id)}</div>
                        <div>
                          <div><span class="pill ${statePill}">${esc(t.due_state)}</span> <span class="pill pill-muted">${esc(
                      t.cadence_label
                    )}</span></div>
                          <div class="conmonMeta">${esc(t.title || "")}</div>
                          <div class="conmonMeta mono">cadence: ${esc(t.cadence_text || "")}</div>
                          ${nextDue ? `<div class="conmonMeta">Next due (local): <span class="mono">${esc(nextDue)}</span></div>` : ""}
                          ${lastUtc ? `<div class="conmonMeta">Last completed (UTC): <span class="mono">${esc(lastUtc)}</span></div>` : ""}
                          ${lastEv ? `<div class="conmonMeta">Last evidence: <span class="mono">${esc(lastEv)}</span></div>` : ""}
                        </div>
                        <div class="conmonActions">
                          <input class="input mono" placeholder="Evidence ref/path (required)" data-conmon-ev="${esc(key)}" />
                          <input class="input" placeholder="Notes (optional)" data-conmon-notes="${esc(key)}" />
                          <button class="btn" data-conmon-record="${esc(key)}">Record completion (now)</button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `;
          }
        }

        if (listEl2) {
          listEl2.querySelectorAll("button[data-conmon-record]").forEach((b) => {
            b.onclick = () => {
              const key = b.getAttribute("data-conmon-record");
              const parts = String(key || "").split("|");
              const cid = parts[0] || "";
              const cad = parts[1] || "";
              if (!cid || !cad) return;
              const evInput = listEl2.querySelector(`input[data-conmon-ev="${cssEsc(key)}"]`);
              const nInput = listEl2.querySelector(`input[data-conmon-notes="${cssEsc(key)}"]`);
              const evidenceRef = normalize(evInput && evInput.value ? evInput.value : "");
              const notes = normalize(nInput && nInput.value ? nInput.value : "");
              if (!evidenceRef) {
                alert("Evidence ref/path is required to record a ConMon completion.");
                return;
              }
              const next = ensureConMonProgress(getProgress());
              next.__conmon[cid] = next.__conmon[cid] && typeof next.__conmon[cid] === "object" ? { ...(next.__conmon[cid] || {}) } : {};
              next.__conmon[cid].cadences =
                next.__conmon[cid].cadences && typeof next.__conmon[cid].cadences === "object" ? { ...(next.__conmon[cid].cadences || {}) } : {};
              const per = next.__conmon[cid].cadences[cad] && typeof next.__conmon[cid].cadences[cad] === "object" ? next.__conmon[cid].cadences[cad] : {};
              const nowUtc = new Date().toISOString();
              const hist = per.history && Array.isArray(per.history) ? per.history.slice() : [];
              hist.push({ completed_utc: nowUtc, evidence_ref: evidenceRef, notes });
              next.__conmon[cid].cadences[cad] = {
                ...(per || {}),
                last_completed_utc: nowUtc,
                last_evidence_ref: evidenceRef,
                last_notes: notes,
                history: hist,
              };
              setProgressBulk(next);
            };
          });
        }

        if (btnWrite) {
          btnWrite.onclick = async () => {
            try {
              setConMonStatus("Writing ConMon snapshot to C:\\evidence…");
              const nowUtc = new Date().toISOString();
              const pNow = ensureConMonProgress(getProgress());
              const outTasks = tasks.map((t) => {
                const cid = t.control_id;
                const cad = t.cadence_key;
                const cm = pNow.__conmon && pNow.__conmon[cid] && typeof pNow.__conmon[cid] === "object" ? pNow.__conmon[cid] : {};
                const per =
                  cm.cadences && cm.cadences[cad] && typeof cm.cadences[cad] === "object" ? cm.cadences[cad] : {};
                const due = dueStateFor(cad, per && per.last_completed_utc ? per.last_completed_utc : "");
                const nextDueLocal = due.nextDue
                  ? `${due.nextDue.getFullYear()}-${String(due.nextDue.getMonth() + 1).padStart(2, "0")}-${String(due.nextDue.getDate()).padStart(2, "0")}`
                  : "";
                return {
                  control_id: cid,
                  title: t.title || "",
                  cadence: cad,
                  cadence_label: cadenceLabel(cad),
                  due_state: due.state,
                  next_due_local: nextDueLocal,
                  last_completed_utc: per && per.last_completed_utc ? per.last_completed_utc : "",
                  last_evidence_ref: per && per.last_evidence_ref ? per.last_evidence_ref : "",
                  last_notes: per && per.last_notes ? per.last_notes : "",
                };
              });

              const summary = {
                total_tasks: tasks.length,
                due_now: counts.due_now,
                due_soon: counts.due_soon,
                overdue: counts.overdue,
                ok: counts.ok,
              };
              const art = mkConMonArtifact(nowUtc, outTasks, summary);
              const outDir = `C:\\evidence\\CUI-ConMon-${art.run_id}`;
              const jsonPath = `${outDir}\\conmon.json`;
              const mdPath = `${outDir}\\conmon.md`;
              await fsWriteTextFile(jsonPath, JSON.stringify(art, null, 2) + "\n");
              await fsWriteTextFile(mdPath, mkConMonMarkdown(art) + "\n");
              setConMonStatus(`Wrote: ${jsonPath} and ${mdPath}`);
              if (fileModal) fileModal.openPath(outDir);
            } catch (e) {
              setConMonStatus(`Write failed: ${e && e.message ? e.message : e}`);
            }
          };
        }
      } catch {}
    }

    if (activeView === "audit") {
      try {
        initWinAuditLogsPanel();
      } catch (e) {
        try {
          const st = $("#winAuditStatus");
          if (st) st.textContent = `Audit logs UI failed to init: ${e && e.message ? e.message : e}`;
        } catch {}
      }
    }

    if (activeView === "av") {
      try {
        initWinAvPanel();
      } catch (e) {
        try {
          const st = $("#defenderStatus");
          if (st) st.textContent = `AV UI failed to init: ${e && e.message ? e.message : e}`;
        } catch {}
      }
    }

    if (activeView === "ssp") {
      try {
        const statusEl = $("#sspStatus");
        const inDate = $("#sspAssessmentDate");
        const inRepo = $("#sspRepoPath");
        const inName = $("#sspAttName");
        const inTitle = $("#sspAttTitle");
        const inOrg = $("#sspAttOrg");
        const inOrigin = $("#sspLiveOrigin");
        const inToken = $("#sspServiceToken");
        const btnUseIdentify = $("#btnSspUseIdentify");
        const btnCap = $("#btnSspCaptureSnapshot");
        const btnLaunch = $("#btnSspBuildLauncher");
        const btnOpen = $("#btnSspOpenOutput");
        const btnGenToken = $("#btnSspGenToken");
        const btnLoadToken = $("#btnSspLoadToken");
        const btnTestToken = $("#btnSspTestToken");
        const pathsEl = $("#sspPaths");
        const buildEl = $("#sspBuild");

        const KEY_DATE = "codex.ssp.assessmentDate";
        const KEY_REPO = "codex.ssp.repoPath";

        const setSspStatus = (msg) => {
          if (statusEl) statusEl.textContent = msg ? String(msg) : " ";
        };
        if (buildEl) buildEl.textContent = `Build: ${BUILD_ID}`;

        const getSaved = (k, dflt) => {
          try {
            const v = localStorage.getItem(k);
            return normalize(v || "") || dflt;
          } catch {
            return dflt;
          }
        };
        const setSaved = (k, v) => {
          try {
            localStorage.setItem(k, String(v || ""));
          } catch {}
        };

        const today = new Date().toISOString().slice(0, 10);
        const applyIdentifyDefaults = (force) => {
          const prof = getAttesteeProfile(getProgress());
          const preferDate = prof && prof.review_date ? String(prof.review_date).trim() : "";
          const preferName = prof && prof.name ? String(prof.name).trim() : "";
          const preferTitle = prof && prof.title ? String(prof.title).trim() : "";
          const preferOrg = prof && prof.org ? String(prof.org).trim() : "";

          if (inDate && (force || !normalize(inDate.value))) inDate.value = preferDate || today;
          if (inName && (force || !normalize(inName.value))) inName.value = preferName || "";
          if (inTitle && (force || !normalize(inTitle.value))) inTitle.value = preferTitle || "";
          if (inOrg && (force || !normalize(inOrg.value))) inOrg.value = preferOrg || "";

          if (preferDate) setSaved(KEY_DATE, preferDate);
        };

        // Force SSP inputs to mirror Identify step (operator expectation).
        try {
          applyIdentifyDefaults(true);
        } catch {}

        if (btnUseIdentify) {
          btnUseIdentify.onclick = () => {
            try {
              applyIdentifyDefaults(true);
              setSspStatus("Copied Identify (Attestee) defaults into SSP inputs.");
            } catch (e) {
              setSspStatus(`Copy defaults failed: ${e && e.message ? e.message : e}`);
            }
          };
        }

        if (inDate && !normalize(inDate.value)) inDate.value = getSaved(KEY_DATE, today);
        if (inRepo && !normalize(inRepo.value)) inRepo.value = getSaved(KEY_REPO, "C:\\Users\\admin_patrick\\mactech");
        if (inDate) inDate.onchange = () => setSaved(KEY_DATE, inDate.value || "");
        if (inRepo) inRepo.onchange = () => setSaved(KEY_REPO, inRepo.value || "");
        if (inName) inName.onchange = () => setSaved("codex.ssp.attName", inName.value || "");
        if (inTitle) inTitle.onchange = () => setSaved("codex.ssp.attTitle", inTitle.value || "");
        if (inOrg) inOrg.onchange = () => setSaved("codex.ssp.attOrg", inOrg.value || "");

        // SSP bridge config (self-contained)
        if (inOrigin && !normalize(inOrigin.value)) inOrigin.value = getSspOrigin();
        if (inOrigin) inOrigin.onchange = () => setSspOrigin(inOrigin.value || "");
        if (inToken && !normalize(inToken.value)) inToken.value = getSspToken();
        if (inToken) inToken.onchange = () => setSspToken(inToken.value || "");

        const assessmentDate = normalize(inDate && inDate.value ? inDate.value : "") || today;
        const outRoot = `C:\\evidence\\CUI-SSP-Deliverable-${assessmentDate}`;
        const snapLive = `${outRoot}\\live-controls.json`;
        const snapPull = `${outRoot}\\pull-evidence-all.json`;
        const snapInfo = `${outRoot}\\snapshot-info.json`;
        const deliverableDir = `${outRoot}\\deliverable`;

        if (pathsEl) {
          pathsEl.textContent =
            `Snapshot JSON:\n` +
            `- ${snapLive}\n` +
            `- ${snapPull}\n` +
            `- ${snapInfo}\n\n` +
            `Deliverable output dir:\n` +
            `- ${deliverableDir}\n\n` +
            `Expected outputs:\n` +
            `- ${deliverableDir}\\MAC-IT-304_SSP_${assessmentDate}.deliverable.md\n` +
            `- ${deliverableDir}\\MAC-IT-304_SSP_${assessmentDate}.deliverable.html\n` +
            `- ${deliverableDir}\\MAC-IT-304_SSP_${assessmentDate}.deliverable.pdf\n`;
        }

        if (btnOpen) {
          btnOpen.onclick = () => {
            if (fileModal) fileModal.openPath(outRoot);
          };
        }

        if (btnCap) {
          btnCap.onclick = async () => {
            setSspStatus("Capturing live audit snapshot + evidence metadata…");
            try {
              btnCap.disabled = true;
            } catch {}
            try {
              // IMPORTANT: read current values at click time (Load token updates inputs/localStorage).
              const sspOriginNow = normOrigin(inOrigin && inOrigin.value ? inOrigin.value : getSspOrigin());
              const sspTokenNow = normalize(inToken && inToken.value ? inToken.value : getSspToken());

              if (!sspTokenNow) {
                const msg =
                  "Unauthorized (service token missing/invalid). Click “Generate & install token” on this SSP page (or paste token above).";
                setSspStatus(msg);
                alert(msg);
                return;
              }

              const live = await sspPostJson(sspOriginNow, sspTokenNow, "/api/admin/codex/live-controls", {});
              const pull = await sspPostJson(sspOriginNow, sspTokenNow, "/api/admin/codex/pull-evidence", { scope: "all" });

              const info = {
                ok: true,
                assessmentDate,
                generatedAt: new Date().toISOString(),
                webAppOrigin: sspOriginNow,
                outputs: {
                  liveControls: snapLive,
                  pullEvidenceAll: snapPull,
                  snapshotInfo: snapInfo,
                },
              };

              await fsWriteTextFile(snapLive, JSON.stringify(live, null, 2) + "\n");
              await fsWriteTextFile(snapPull, JSON.stringify(pull, null, 2) + "\n");
              await fsWriteTextFile(snapInfo, JSON.stringify(info, null, 2) + "\n");

              setSspStatus(`Wrote snapshot JSON under: ${outRoot}`);
              if (fileModal) fileModal.openPath(outRoot);
            } catch (e) {
              setSspStatus(`Snapshot failed: ${e && e.message ? e.message : e}`);
              try {
                alert(`Snapshot failed:\n\n${e && e.message ? e.message : e}`);
              } catch {}
            } finally {
              try {
                btnCap.disabled = false;
              } catch {}
            }
          };
        }

        if (btnLoadToken) {
          btnLoadToken.onclick = async () => {
            try {
              const repoPath = normalize(inRepo && inRepo.value ? inRepo.value : "") || "C:\\Users\\admin_patrick\\mactech";
              const tokenRepo = `${repoPath}\\.secrets\\codex_manual_service_token`;
              const tokenEvidence = "C:\\evidence\\codex_manual_service_token.txt";

              setSspStatus(`Reading token from: ${tokenRepo}`);
              let tok = "";
              try {
                tok = normalize(await fsReadTextFile(tokenRepo));
              } catch {
                // Fallback for older server builds (or if repo path is wrong)
                setSspStatus(`Reading token from: ${tokenEvidence}`);
                tok = normalize(await fsReadTextFile(tokenEvidence));
              }
              if (!tok) throw new Error("Token file is empty.");
              if (inToken) inToken.value = tok;
              setSspToken(tok);
              setSspStatus("Loaded token from VM file into SSP token field.");
            } catch (e) {
              setSspStatus(`Load token failed: ${e && e.message ? e.message : e}`);
              try {
                alert(`Load token failed:\n\n${e && e.message ? e.message : e}`);
              } catch {}
            }
          };
        }

        if (btnTestToken) {
          btnTestToken.onclick = async () => {
            const o = normOrigin(inOrigin && inOrigin.value ? inOrigin.value : getSspOrigin());
            const t = normalize(inToken && inToken.value ? inToken.value : getSspToken());
            setSspStatus("Testing SSP origin+token against live audit…");
            try {
              await sspTestAuth(o, t);
              setSspStatus("Token OK (authorized). You can capture snapshot now.");
            } catch (e) {
              setSspStatus(`Token test failed: ${e && e.message ? e.message : e}`);
              try {
                alert(`Token test failed:\n\n${e && e.message ? e.message : e}`);
              } catch {}
            }
          };
        }

        if (btnLaunch) {
          btnLaunch.onclick = async () => {
            try {
              const repoPath = normalize(inRepo && inRepo.value ? inRepo.value : "") || "C:\\Users\\admin_patrick\\mactech";
              const ts = new Date().toISOString().replace(/[:.]/g, "-");

              const cmd =
                "$ErrorActionPreference='Stop';" +
                "$logDir = Join-Path $env:TEMP 'codex-manual-logs';" +
                "New-Item -ItemType Directory -Force -Path $logDir | Out-Null;" +
                "$log = Join-Path $logDir ('ssp-build-' + (Get-Date -Format yyyyMMdd-HHmmss) + '.txt');" +
                "Start-Transcript -Path $log -Append | Out-Null;" +
                "try {" +
                " Write-Host ('Log: ' + $log) -ForegroundColor Cyan;" +
                " Write-Host '';" +
                ` $AssessmentDate=${psSingleQuote(assessmentDate)};` +
                ` $OutDir=${psSingleQuote(deliverableDir)};` +
                ` $Live=${psSingleQuote(snapLive)};` +
                ` $Meta=${psSingleQuote(snapPull)};` +
                " if (-not (Test-Path -LiteralPath $Live -PathType Leaf)) { throw ('Missing snapshot: ' + $Live) }" +
                " if (-not (Test-Path -LiteralPath $Meta -PathType Leaf)) { throw ('Missing snapshot: ' + $Meta) }" +
                " Write-Host ('AssessmentDate: ' + $AssessmentDate);" +
                " Write-Host ('OutDir: ' + $OutDir);" +
                " Write-Host '';" +
                " powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\build-ssp-pdf.ps1 " +
                "  -AssessmentDate $AssessmentDate " +
                "  -OutDir $OutDir " +
                "  -LiveControlsJson $Live " +
                "  -EvidenceLatestJson $Meta;" +
                " Write-Host '';" +
                " Write-Host 'DONE. Open the output folder to retrieve the PDF.' -ForegroundColor Green;" +
                "} catch {" +
                " Write-Host '';" +
                " Write-Host 'ERROR:' -ForegroundColor Red;" +
                " Write-Host $_.Exception.ToString() -ForegroundColor Red;" +
                "} finally {" +
                " try { Stop-Transcript | Out-Null } catch {}" +
                " Write-Host '';" +
                " Write-Host ('Log saved: ' + $log) -ForegroundColor Cyan;" +
                " Read-Host 'Press Enter to close';" +
                "}";

              const cmdFile = buildRunElevatedCmdFile(cmd, "Codex - Build SSP Deliverable", repoPath);
              downloadText(`codex-ssp-build-${assessmentDate}-${ts}.cmd`, cmdFile, "text/plain; charset=utf-8");
              setSspStatus("Downloaded build launcher (.cmd). Run it on the VM (UAC prompt).");
            } catch (e) {
              setSspStatus(`Launcher failed: ${e && e.message ? e.message : e}`);
            }
          };
        }

        const tok2 = sspToken;
        setSspStatus(
          `Ready. Step 1 captures snapshot JSON; Step 2 builds the export-ready deliverable/PDF (requires pandoc + Edge/Chrome on the VM).\n` +
            `Web app origin: ${sspOrigin}\n` +
            `Service token: ${tok2 ? "(set)" : "(missing — set above)"}`
        );

        if (btnGenToken) {
          btnGenToken.onclick = async () => {
            try {
              const tok = generateServiceToken();
              if (inToken) inToken.value = tok;
              setSspToken(tok);
              setSspStatus("Generated token. Installing to VM repo…");
              const res = await installServiceTokenToRepo(inRepo && inRepo.value ? inRepo.value : "", tok);
              if (res.ok) {
                setSspStatus(`Token installed on VM: ${res.path}\n\nNext: click “Capture snapshot”.`);
                alert("Token installed. Now click “Capture snapshot”.");
              } else {
                setSspStatus(
                  `Generated token, but couldn't write to disk from the browser.\n` +
                    `Downloaded installer (.cmd). Run it on the VM to write:\n` +
                    `${res.path}\n\nThen retry “Capture snapshot”.`
                );
              }
            } catch (e) {
              setSspStatus(`Token install failed: ${e && e.message ? e.message : e}`);
            }
          };
        }
      } catch (e) {
        console.error(e);
        const statusEl = $("#sspStatus");
        if (statusEl) statusEl.textContent = `SSP view error: ${e && e.message ? e.message : e}`;
      }
    }

    // governance list
    renderAttestationList(getProgress());
    if (activeView === "governance") {
      try {
        // Ensure governance control adjudication is always consistent with existing doc signoffs.
        const p0 = getProgress() || {};
        const prof = getAttesteeProfile(p0) || {};
        const signer = normalize(prof.name) || normalize($("#attName") ? $("#attName").value : "") || "";
        const next = { ...(p0 || {}) };
        const applied = maybeAdjudicateGovernanceControls(next, signer);
        if (applied && applied.applied) {
          setProgressBulk(next);
          return;
        }
      } catch {}
      // legacy list (kept), wizard is the primary workflow
      // renderGovernanceDocs(governanceDocs, getProgress(), docModal);
      renderGovWizard();
    }

    // exports preview
    const exp = $("#exportPreview");
    if (exp) {
      const sample = {
        schema: "mactech.codex.manual.progress",
        version: APP_VERSION,
        exported_utc: new Date().toISOString(),
        progress: getProgress(),
      };
      exp.textContent = JSON.stringify(sample, null, 2).slice(0, 4000) + "\n";
    }

    renderFamilyView();
  }

  // Expose rerender globally so other top-level handlers (and older builds) can refresh safely.
  try { window.__rerender = rerender; } catch {}

  // top-level docs button
  const btnDocs = $("#btnDocs");
  if (btnDocs) btnDocs.onclick = () => docModal.openDefault();
  // Dashboard tab is onboarding now, no separate route.

  bindClick("#btnOnboardingGoNext", () => {
    const p = getProgress() || {};
    const prof = getAttesteeProfile(p);
    const onb = p.__onboarding && typeof p.__onboarding === "object" ? p.__onboarding : {};
    const order = ["identify", "srm", "verify", "review", "ingest_finalize"];
    const active = order.indexOf(onb.active_step) >= 0 ? onb.active_step : "identify";
    let idx = order.indexOf(active);
    if (idx < 0) idx = 0;
    const desired = order[Math.min(order.length - 1, idx + 1)];

    // Enforce Attestee identity before leaving Step 1.
    if (!prof && active !== "identify") {
      const next = { ...(p || {}) };
      next.__onboarding = { ...(next.__onboarding || {}) };
      next.__onboarding.active_step = "identify";
      next.__onboarding.updated_utc = new Date().toISOString();
      if (!next.__onboarding.created_utc) next.__onboarding.created_utc = next.__onboarding.updated_utc;
      setProgressBulk(next);
      alert("Attestee identity is required to continue.");
      return;
    }

    const next = { ...(p || {}) };
    next.__onboarding = { ...(next.__onboarding || {}) };
    next.__onboarding.active_step = desired;
    next.__onboarding.updated_utc = new Date().toISOString();
    if (!next.__onboarding.created_utc) next.__onboarding.created_utc = next.__onboarding.updated_utc;
    setProgressBulk(next);
  });
  const btnDashboardOpenMapping = $("#btnDashboardOpenMapping");
  if (btnDashboardOpenMapping) btnDashboardOpenMapping.onclick = () => docModal.openDocInModal("../tables/CONTROL_MAPPING_800-171R2.md");

  // Tabs
  const tabDashboard = $("#tabDashboard");
  if (tabDashboard) tabDashboard.onclick = () => setView("dashboard");
  const tabControls = $("#tabControls");
  if (tabControls) tabControls.onclick = () => setView("controls");
  const tabGovernance = $("#tabGovernance");
  if (tabGovernance) tabGovernance.onclick = () => setView("governance");
  const tabPoam = $("#tabPoam");
  if (tabPoam) tabPoam.onclick = () => setView("poam");
  const tabConMon = $("#tabConMon");
  if (tabConMon) tabConMon.onclick = () => setView("conmon");
  const tabAudit = $("#tabAudit");
  if (tabAudit) tabAudit.onclick = () => setView("audit");
  const tabAv = $("#tabAv");
  if (tabAv) tabAv.onclick = () => setView("av");
  const tabSsp = $("#tabSsp");
  if (tabSsp) tabSsp.onclick = () => setView("ssp");
  const tabExports = $("#tabExports");
  if (tabExports) tabExports.onclick = () => setView("exports");

  // Quick view buttons (Controls)
  const applyQuickView = (val) => {
    state.adjudicated = val;
    const sel = $("#filterAdjudicated");
    if (sel) sel.value = val;
    scheduleRerender();
  };
  bindClick("#btnQuickAll", () => applyQuickView("all"));
  bindClick("#btnQuickOutstanding", () => applyQuickView("no"));
  bindClick("#btnQuickAdjudicated", () => applyQuickView("yes"));
  // Family view buttons
  const back = $("#btnFamilyBack");
  if (back) back.onclick = () => setView("dashboard");
  const workFam = $("#btnFamilyWorkOutstanding");
  if (workFam)
    workFam.onclick = () => {
      setView("controls");
      state.adjudicated = "no";
      const selAdj = $("#filterAdjudicated");
      if (selAdj) selAdj.value = "no";
      const sel = $("#filterFamily");
      if (sel) sel.value = activeFamily || "all";
      state.family = activeFamily || "all";
      rerender();
    };
  const govMods = $("#btnFamilyOpenGovModules");
  if (govMods) govMods.onclick = () => docModal.openDocInModal("docs/02_Governance_Annual_Review.md");
  const famAtt = $("#btnFamilySignAttestation");
  if (famAtt)
    famAtt.onclick = () => {
      setView("governance");
      const scope = activeFamily ? `family:${activeFamily}` : "family";
      const scopeEl = $("#attScope");
      if (scopeEl) scopeEl.value = scope;
      const el = $("#attName");
      if (el) el.focus();
    };

  // Bulk evidence run buttons (run elevated / copy / view)
  const collectScript = "C:\\hardening\\codex-scripts\\Collect-Cui-Evidence.ps1";
  const testScript = "C:\\hardening\\codex-scripts\\Test-CuiHardening.ps1";
  const runBothScript = "C:\\hardening\\codex-scripts\\Run-CuiBulkEvidenceAndValidate.ps1";
  const cmdCollect = `powershell -NoProfile -ExecutionPolicy Bypass -File \"${collectScript}\"`;
  const cmdTest = `powershell -NoProfile -ExecutionPolicy Bypass -File \"${testScript}\"`;
  const cmdBoth = `powershell -NoProfile -ExecutionPolicy Bypass -File \"${runBothScript}\"`;
  const downloadRunLauncher = (label, innerPsCommand) => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = String(label || "run").replace(/[^A-Za-z0-9_.-]+/g, "_");
    const cmdFile = buildRunElevatedCmdFile(innerPsCommand, "Codex - Run Elevated", "C:\\hardening\\codex-scripts");
    downloadText(`codex-run-elevated-${safe}-${ts}.cmd`, cmdFile, "text/plain; charset=utf-8");
    setBulkStatus("Downloaded launcher (.cmd). Run it (UAC prompt) to execute in elevated PowerShell.");
  };
  const btnBulkCopyCollectEvidence = $("#btnBulkCopyCollectEvidence");
  if (btnBulkCopyCollectEvidence)
    btnBulkCopyCollectEvidence.onclick = async () =>
      downloadRunLauncher("collect", buildElevatedInnerForScripts([collectScript], "Collect evidence bundle"));
  const btnBulkCopyTestHardening = $("#btnBulkCopyTestHardening");
  if (btnBulkCopyTestHardening)
    btnBulkCopyTestHardening.onclick = async () =>
      downloadRunLauncher("test", buildElevatedInnerForScripts([testScript], "Run hardening validation test"));
  const btnBulkCopyRunBoth = $("#btnBulkCopyRunBoth");
  if (btnBulkCopyRunBoth)
    btnBulkCopyRunBoth.onclick = async () =>
      downloadRunLauncher("collect+test", buildElevatedInnerForScripts([runBothScript], "Run evidence + validation (matched RunId)"));
  const btnBulkViewCollectEvidence = $("#btnBulkViewCollectEvidence");
  if (btnBulkViewCollectEvidence)
    btnBulkViewCollectEvidence.onclick = () => {
      fileModal.openPath(collectScript);
      setBulkStatus("Opened collect script in viewer.");
    };
  const btnBulkViewTestHardening = $("#btnBulkViewTestHardening");
  if (btnBulkViewTestHardening)
    btnBulkViewTestHardening.onclick = () => {
      fileModal.openPath(testScript);
      setBulkStatus("Opened test script in viewer.");
    };
  const btnBulkCopyCmds = $("#btnBulkCopyCmds");
  if (btnBulkCopyCmds)
    btnBulkCopyCmds.onclick = async () => {
      const ok = await copyToClipboard(`${cmdCollect}\n${cmdTest}\n${cmdBoth}`);
      setBulkStatus(ok ? "Copied commands to clipboard." : "Copy failed (browser restrictions).");
    };
  const btnOpenEvidenceRoot = $("#btnOpenEvidenceRoot");
  if (btnOpenEvidenceRoot)
    btnOpenEvidenceRoot.onclick = () => {
      fileModal.openPath("C:\\evidence");
      setBulkStatus("Opened C:\\evidence.");
    };
  bindClick("#btnBulkIngestLatest", async () => {
    try {
      const dirs = getLatestRunDirsFromUI();
      if (!dirs.validationDirName) {
        throw new Error("Latest validation run name is not available yet. Wait 2–3 seconds or refresh.");
      }
      const validationDir = `C:\\evidence\\${dirs.validationDirName}`;
      // Prefer matching evidence run by timestamp proximity to the validation run.
      const entries = await fsListDir("C:\\evidence");
      const pick = pickEvidenceDirForValidation(entries, dirs.validationDirName);
      const evidenceName = (pick && pick.name) ? pick.name : dirs.evidenceDirName;
      if (!evidenceName) {
        throw new Error("Could not determine matching evidence run. Select it under Advanced → Ingest specific run.");
      }
      const evidenceDir = `C:\\evidence\\${evidenceName}`;
      const res = await ingestEvidenceRunIntoProgress({ evidenceDir, validationDir }, controlsAll, getProgress, setProgressBulk);
      setBulkStatus(
        `Ingested: updated ${res.updated} controls; adjudicated ${res.adjudicated}; hashes=${res.hasHashes ? "yes" : "no"}.`
      );
    } catch (e) {
      setBulkStatus(`Ingest failed: ${e && e.message ? e.message : e}`);
    }
  });

  bindClick("#btnBulkIngestSelected", async () => {
    try {
      const selEv = $("#selEvidenceRun");
      const selVa = $("#selValidationRun");
      const evName = selEv ? normalize(selEv.value) : "";
      const vaName = selVa ? normalize(selVa.value) : "";
      if (!evName || !vaName) throw new Error("Select both an Evidence run and a Validation run.");
      const evidenceDir = `C:\\evidence\\${evName}`;
      const validationDir = `C:\\evidence\\${vaName}`;
      const res = await ingestEvidenceRunIntoProgress({ evidenceDir, validationDir }, controlsAll, getProgress, setProgressBulk);
      setBulkStatus(`Ingested selected: updated ${res.updated}; adjudicated ${res.adjudicated}; hashes=${res.hasHashes ? "yes" : "no"}.`);
    } catch (e) {
      setBulkStatus(`Ingest failed: ${e && e.message ? e.message : e}`);
    }
  });
  bindClick("#btnBulkDownloadChecklist", () => {
    try {
      const md = buildBulkEvidenceChecklistMarkdown(controlsAll, getProgress());
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      downloadText(`codex-bulk-evidence-checklist-${ts}.md`, md, "text/markdown; charset=utf-8");
      setBulkStatus("Downloaded bulk evidence checklist.");
    } catch (e) {
      setBulkStatus(`Download failed: ${e && e.message ? e.message : e}`);
    }
  });

  // Governance actions
  bindClick("#btnGovAnnual", () => docModal.openDocInModal("docs/02_Governance_Annual_Review.md"));
  bindClick("#btnGovPolicies", () => docModal.openDocInModal("docs/04_Policies_and_SOP_Review.md"));
  bindClick("#btnGovSrm", () => srmModal.open());
  bindClick("#btnGovNewAttestation", () => {
    const el = $("#attName");
    if (el) el.focus();
  });

  // Governance wizard (review -> sign -> next)
  let govWizardKind = "policy"; // policy | procedure
  let govWizardDocs = [];
  let govWizardIdx = 0;

  const wizardEl = $("#govWizard");
  const wizardListEl = $("#govWizardList");
  const wizardNavTitle = $("#govWizardNavTitle");
  const wizardDocTitle = $("#govWizardDocTitle");
  const wizardDocMeta = $("#govWizardDocMeta");
  const wizardDocBody = $("#govWizardDocBody");
  const wizardSignedStatus = $("#govWizardSignedStatus");
  const btnWPrev = $("#btnGovWizardPrev");
  const btnWNext = $("#btnGovWizardNext");
  const btnWOpen = $("#btnGovWizardOpenNewTab");
  const btnWSign = $("#btnGovWizardSign");

  function wizardVisible() {
    return wizardEl && !wizardEl.classList.contains("hidden");
  }

  function selectFirstUnsignedIdx(progress, docs) {
    for (let i = 0; i < docs.length; i++) {
      if (!getDocSignoff(progress, docs[i].id)) return i;
    }
    return 0;
  }

  async function loadWizardDoc(d) {
    if (!wizardDocBody) return;
    wizardDocBody.textContent = "Loading…";
    let raw = null;
    try {
      const url = `../${d.id}`;
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.ok) {
        raw = await resp.text();
      } else if (resp.status === 404) {
        // Fallback: server may not serve static files from parent (e.g. root is manual_app). Try /__fs with relative path.
        const fsResp = await fetch(`/__fs?path=${encodeURIComponent(d.id)}`, { cache: "no-store" });
        if (fsResp.ok) {
          const obj = await fsResp.json();
          if (obj && obj.kind === "file" && obj.textContent != null) raw = obj.textContent;
        }
      }
      if (raw == null) throw new Error(`HTTP ${(resp && resp.status) || "?"}`);
      wizardDocBody.innerHTML = renderMarkdown(stripPlatformAgnosticBoilerplate(raw));
      // Cache doc hash for signature section.
      try {
        loadWizardDoc._cache = loadWizardDoc._cache || {};
        const sha = await sha256Hex(raw);
        loadWizardDoc._cache[d.id] = { sha256: sha, chars: raw.length, fetched_utc: new Date().toISOString() };
      } catch {}
    } catch (e) {
      wizardDocBody.textContent = `Failed to load document.\n\n${e && e.message ? e.message : e}`;
    }
  }

  function renderWizardList(progress) {
    if (!wizardListEl) return;
    wizardListEl.innerHTML = "";
    for (let i = 0; i < govWizardDocs.length; i++) {
      const d = govWizardDocs[i];
      const a = document.createElement("a");
      a.href = "#";
      a.className = "nav-item" + (i === govWizardIdx ? " active" : "");
      const s = getDocSignoff(progress, d.id);
      const sub = s ? `Signed · ${s.review_date || s.signed_utc || ""}` : "Not signed";
      a.innerHTML = `<span>${esc(d.code || "")} — ${esc(d.title || "")}</span><span class="sub">${esc(sub)}</span>`;
      a.onclick = (ev) => {
        ev.preventDefault();
        govWizardIdx = i;
        renderGovWizard();
      };
      wizardListEl.appendChild(a);
    }
  }

  async function renderGovWizard() {
    if (!wizardEl) return;
    // Only show wizard when governance view active.
    if (activeView !== "governance") {
      wizardEl.classList.add("hidden");
      return;
    }
    if (!govWizardDocs.length) {
      wizardEl.classList.add("hidden");
      return;
    }
    wizardEl.classList.remove("hidden");
    const p = getProgress();
    const d = govWizardDocs[Math.max(0, Math.min(govWizardDocs.length - 1, govWizardIdx))];

    if (wizardNavTitle) wizardNavTitle.textContent = govWizardKind === "policy" ? "Policies" : "SOPs";
    if (wizardDocTitle) wizardDocTitle.textContent = `${d.code || ""} — ${d.title || d.id}`;
    if (wizardDocMeta) {
      const s = getDocSignoff(p, d.id);
      wizardDocMeta.textContent = s
        ? `Signed by ${s.name || ""}${s.review_date ? " · " + s.review_date : ""}`
        : "Not signed yet";
    }
    if (wizardSignedStatus) {
      const s = getDocSignoff(p, d.id);
      wizardSignedStatus.className = "pill " + (s ? "pill-good" : "pill-warn");
      wizardSignedStatus.textContent = s ? "signed" : "needs sign-off";
    }
    try {
      const sigEl = $("#govWizardSignatureDetails");
      if (sigEl) {
        const s = getDocSignoff(p, d.id);
        const cache = loadWizardDoc._cache && loadWizardDoc._cache[d.id] ? loadWizardDoc._cache[d.id] : null;
        const sha = cache && cache.sha256 ? cache.sha256 : "(hash unavailable until doc loads)";
        const rec = s && s.record_json_path ? s.record_json_path : "(not written yet)";
        const recSha = s && s.record_json_sha256 ? s.record_json_sha256 : "(not written yet)";
        const signedLine = s && s.signed_utc ? `Signed UTC: ${s.signed_utc}\nSigner: ${s.name || ""}${s.title ? " · " + s.title : ""}${s.org ? " · " + s.org : ""}\n` : "";
        sigEl.textContent =
          `Signature section (evidence record)\n` +
          `Document: ${d.code || ""} — ${d.title || d.id}\n` +
          `Source path: ${d.id}\n` +
          `Document SHA-256: ${sha}\n\n` +
          `Stored signed record (JSON): ${rec}\n` +
          `Stored signed record SHA-256: ${recSha}\n` +
          signedLine;
      }
    } catch {}
    if (btnWPrev) btnWPrev.disabled = govWizardIdx <= 0;
    if (btnWNext) btnWNext.disabled = govWizardIdx >= govWizardDocs.length - 1;
  if (btnWOpen)
    btnWOpen.onclick = () => {
      const url = `../${d.id}`;
      // Governance docs are Markdown; open rendered viewer in new tab.
      if (isMarkdownPath(url)) openRenderedDocInNewTab(url);
      else openInNewTab(url);
    };
    await loadWizardDoc(d);
    renderWizardList(p);
  }

  function openWizard(kind) {
    govWizardKind = kind;
    const k = normalize(kind).toLowerCase();
    if (k === "supporting") {
      // Supporting templates: anything not policy/procedure (e.g., plans, forms).
      govWizardDocs = (governanceDocs || []).filter((d) => {
        const dk = normalize(d.kind).toLowerCase();
        return dk && dk !== "policy" && dk !== "procedure";
      });
    } else {
      govWizardDocs = (governanceDocs || []).filter((d) => normalize(d.kind).toLowerCase() === k);
    }
    govWizardIdx = selectFirstUnsignedIdx(getProgress(), govWizardDocs);
    renderGovWizard();
    try {
      const el = $("#attName");
      if (el && !normalize(el.value)) el.focus();
    } catch {}
  }

  const btnStartPol = $("#btnGovWizardPolicies");
  if (btnStartPol) btnStartPol.onclick = () => openWizard("policy");
  const btnStartSop = $("#btnGovWizardSops");
  if (btnStartSop) btnStartSop.onclick = () => openWizard("procedure");
  const btnStartSupporting = $("#btnGovWizardSupporting");
  if (btnStartSupporting) btnStartSupporting.onclick = () => openWizard("supporting");
  const btnCont = $("#btnGovWizardContinue");
  if (btnCont)
    btnCont.onclick = () => {
      if (!govWizardDocs.length) openWizard("policy");
      else renderGovWizard();
    };
  if (btnWPrev) btnWPrev.onclick = () => {
    if (govWizardIdx > 0) govWizardIdx--;
    renderGovWizard();
  };
  if (btnWNext) btnWNext.onclick = () => {
    if (govWizardIdx < govWizardDocs.length - 1) govWizardIdx++;
    renderGovWizard();
  };

  function maybeAdjudicateGovernanceControls(nextProgress, signer) {
    const nowUtc = new Date().toISOString();
    let n = 0;
    for (const c of governanceControls) {
      const prev = nextProgress[c.control_id] && typeof nextProgress[c.control_id] === "object" ? nextProgress[c.control_id] : {};
      if (prev.adjudicated) continue;
      // Incremental: adjudicate a governance control when ALL referenced docs for that control are signed.
      const req = requiredGovDocsForControl(c);
      if (!req.docIds.length) continue; // unmapped governance controls remain outstanding until mapped or explicitly adjudicated
      let ok = true;
      for (const docId of req.docIds) {
        if (!getDocSignoff(nextProgress, docId)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      nextProgress[c.control_id] = {
        ...(prev || {}),
        adjudicated: true,
        updated_utc: nowUtc,
        notes:
          prev.notes ||
          `Governance docs signed for this control: ${req.codes.join(", ") || "(unlabeled docs)"} · Signer: ${signer || ""}`,
      };
      n++;
    }
    const packComplete = docsAllSigned(nextProgress, governanceDocs, ["policy", "procedure"]);
    if (packComplete) nextProgress.__governance_pack_complete_utc = nowUtc;
    return { applied: n > 0, count: n, packComplete };
  }

  async function signCurrentWizardDocAndAdvance() {
    if (!govWizardDocs.length) return;
    const name = normalize($("#attName").value);
    if (!name) {
      alert("Enter Name in the attestation form (Name) before signing.");
      return;
    }
    const title = normalize($("#attTitle").value);
    const org = normalize($("#attOrg").value);
    const review_date = $("#attReviewDate") ? normalize($("#attReviewDate").value) : "";

    const created_utc = new Date().toISOString();
    const d = govWizardDocs[govWizardIdx];

    const p = getProgress();
    const next = { ...(p || {}) };
    next.__doc_signoffs = next.__doc_signoffs && typeof next.__doc_signoffs === "object" ? next.__doc_signoffs : {};

    // Compute doc hash and write per-document signed record under C:\evidence.
    let docRaw = "";
    try {
      const url = `../${d.id}`;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      docRaw = await resp.text();
    } catch (e) {
      alert(`Cannot sign because the document could not be loaded.\n\n${e && e.message ? e.message : e}`);
      return;
    }
    const docSha256 = await sha256Hex(docRaw);
    const runId = runIdFromUtcIso(created_utc) || created_utc.replace(/[:.]/g, "-");
    const safeCode = String(d.code || "DOC").replace(/[^A-Za-z0-9_.-]+/g, "_");
    const outDir = `C:\\evidence\\CUI-Doc-Signoff-${runId}`;
    const jsonPath = `${outDir}\\${safeCode}-signoff.json`;
    const mdPath = `${outDir}\\${safeCode}-signoff.md`;

    const signoffRecord = {
      schema: "mactech.codex.manual.doc_signoff",
      version: 1,
      generated_utc: created_utc,
      signer: { name, title, org, review_date },
      document: {
        id: d.id,
        code: d.code || "",
        title: d.title || "",
        kind: d.kind || "",
        source_path: d.id,
        sha256: docSha256,
      },
      stored_record: {
        out_dir: outDir,
        json_path: jsonPath,
        md_path: mdPath,
      },
      notes:
        "This record attests the signer reviewed the referenced document version (by SHA-256) and approved it for use within the enclave scope. The document content itself remains a template; this signed record is the approval evidence artifact.",
    };
    const signoffJsonText = JSON.stringify(signoffRecord, null, 2) + "\n";
    const signoffMdText =
      [
        "# Document sign-off record",
        "",
        `Generated (UTC): ${created_utc}`,
        "",
        "## Signer",
        `- Name: ${name}`,
        `- Title: ${title || ""}`,
        `- Organization: ${org || ""}`,
        `- Review date: ${review_date || ""}`,
        "",
        "## Document",
        `- Code: ${d.code || ""}`,
        `- Title: ${d.title || ""}`,
        `- Path: ${d.id}`,
        `- SHA-256: ${docSha256}`,
        "",
        "## Stored record locations",
        `- JSON: \`${jsonPath}\``,
        `- Markdown: \`${mdPath}\``,
        "",
      ].join("\n") + "\n";
    await fsWriteTextFile(jsonPath, signoffJsonText);
    await fsWriteTextFile(mdPath, signoffMdText);
    const recordJsonSha256 = await sha256Hex(signoffJsonText);

    next.__doc_signoffs[d.id] = {
      doc_id: d.id,
      signed_utc: created_utc,
      review_date,
      name,
      title,
      org,
      notes: "",
      doc_sha256: docSha256,
      record_json_path: jsonPath,
      record_md_path: mdPath,
      record_json_sha256: recordJsonSha256,
    };
    // Convenience index by code (helps UX + per-control mapping).
    next.__doc_signoffs_by_code =
      next.__doc_signoffs_by_code && typeof next.__doc_signoffs_by_code === "object" ? next.__doc_signoffs_by_code : {};
    if (d && d.code) {
      next.__doc_signoffs_by_code[normalize(d.code).toUpperCase()] = {
        ...(next.__doc_signoffs[d.id] || {}),
        doc_code: d.code,
      };
    }

    // record attestation entry too
    const arr = next.__attestations && Array.isArray(next.__attestations) ? next.__attestations.slice() : [];
    arr.push({
      id: `att-${created_utc.replace(/[:.]/g, "-")}`,
      scope: docScopeFromId(d.id),
      review_date,
      created_utc,
      name,
      title,
      org,
      notes: `Signed ${d.code || ""} ${d.title || ""}`,
      checks: {},
    });
    next.__attestations = arr;

    const applied = maybeAdjudicateGovernanceControls(next, name);
    setProgressBulk(next);

    // advance to next unsigned doc in current kind
    let nextIdx = -1;
    for (let i = govWizardIdx + 1; i < govWizardDocs.length; i++) {
      if (!getDocSignoff(next, govWizardDocs[i].id)) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx < 0) {
      // wrap search
      for (let i = 0; i < govWizardDocs.length; i++) {
        if (!getDocSignoff(next, govWizardDocs[i].id)) {
          nextIdx = i;
          break;
        }
      }
    }
    if (nextIdx >= 0) govWizardIdx = nextIdx;
    renderGovWizard();

    if (applied.applied && applied.packComplete) {
      const w = await writeGovernanceEvidenceArtifact(next, name, governanceControls, governanceDocs);
      const msg = w.ok
        ? `Signed document. Governance pack complete — adjudicated ${applied.count} governance controls.\n\nWrote evidence artifact:\n${w.path}`
        : `Signed document. Governance pack complete — adjudicated ${applied.count} governance controls.\n\nArtifact write failed:\n${w.error}\n\nTip: ensure the manual server is running (http://127.0.0.1:8787/).`;
      alert(msg);
    }
  }

  if (btnWSign) btnWSign.onclick = () => signCurrentWizardDocAndAdvance();

  const bulkSignByKind = async (kind) => {
    const name = normalize($("#attName").value);
    if (!name) {
      alert("Enter Name in the attestation form first (then click bulk sign).");
      return;
    }
    const title = normalize($("#attTitle").value);
    const org = normalize($("#attOrg").value);
    const review_date = $("#attReviewDate") ? normalize($("#attReviewDate").value) : "";
    const created_utc = new Date().toISOString();
    const runId = runIdFromUtcIso(created_utc) || created_utc.replace(/[:.]/g, "-");
    const outDir = `C:\\evidence\\CUI-Doc-Signoff-${runId}`;

    const targetKind = normalize(kind).toLowerCase();
    const docs = (governanceDocs || []).filter((d) => {
      const dk = normalize(d.kind).toLowerCase();
      if (!dk) return false;
      if (targetKind === "supporting") return dk !== "policy" && dk !== "procedure";
      return dk === targetKind;
    });
    if (!docs.length) {
      alert(`No documents of kind: ${kind}`);
      return;
    }

    const p = getProgress();
    const next = { ...(p || {}) };
    next.__doc_signoffs = next.__doc_signoffs && typeof next.__doc_signoffs === "object" ? next.__doc_signoffs : {};
    next.__doc_signoffs_by_code =
      next.__doc_signoffs_by_code && typeof next.__doc_signoffs_by_code === "object" ? next.__doc_signoffs_by_code : {};

    for (const d of docs) {
      // Fetch doc and write per-document evidence record, same as single-sign path.
      let docRaw = "";
      try {
        const url = `../${d.id}`;
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        docRaw = await resp.text();
      } catch (e) {
        alert(`Bulk sign aborted: could not load ${d.code || d.id}.\n\n${e && e.message ? e.message : e}`);
        return;
      }
      const docSha256 = await sha256Hex(docRaw);
      const safeCode = String(d.code || "DOC").replace(/[^A-Za-z0-9_.-]+/g, "_");
      const jsonPath = `${outDir}\\${safeCode}-signoff.json`;
      const mdPath = `${outDir}\\${safeCode}-signoff.md`;

      const signoffRecord = {
        schema: "mactech.codex.manual.doc_signoff",
        version: 1,
        generated_utc: created_utc,
        signer: { name, title, org, review_date },
        document: {
          id: d.id,
          code: d.code || "",
          title: d.title || "",
          kind: d.kind || "",
          source_path: d.id,
          sha256: docSha256,
        },
        stored_record: {
          out_dir: outDir,
          json_path: jsonPath,
          md_path: mdPath,
        },
        notes:
          "This record attests the signer reviewed the referenced document version (by SHA-256) and approved it for use within the enclave scope. The document content itself remains a template; this signed record is the approval evidence artifact.",
      };
      const signoffJsonText = JSON.stringify(signoffRecord, null, 2) + "\n";
      const signoffMdText =
        [
          "# Document sign-off record",
          "",
          `Generated (UTC): ${created_utc}`,
          "",
          "## Signer",
          `- Name: ${name}`,
          `- Title: ${title || ""}`,
          `- Organization: ${org || ""}`,
          `- Review date: ${review_date || ""}`,
          "",
          "## Document",
          `- Code: ${d.code || ""}`,
          `- Title: ${d.title || ""}`,
          `- Path: ${d.id}`,
          `- SHA-256: ${docSha256}`,
          "",
          "## Stored record locations",
          `- JSON: \`${jsonPath}\``,
          `- Markdown: \`${mdPath}\``,
          "",
        ].join("\n") + "\n";
      await fsWriteTextFile(jsonPath, signoffJsonText);
      await fsWriteTextFile(mdPath, signoffMdText);
      const recordJsonSha256 = await sha256Hex(signoffJsonText);

      next.__doc_signoffs[d.id] = {
        doc_id: d.id,
        signed_utc: created_utc,
        review_date,
        name,
        title,
        org,
        notes: `Bulk sign-off (${kind})`,
        doc_sha256: docSha256,
        record_json_path: jsonPath,
        record_md_path: mdPath,
        record_json_sha256: recordJsonSha256,
      };
      if (d && d.code) {
        next.__doc_signoffs_by_code[normalize(d.code).toUpperCase()] = {
          ...(next.__doc_signoffs[d.id] || {}),
          doc_code: d.code,
        };
      }
    }

    // Also record an attestation for audit trail.
    const att = {
      id: `att-${created_utc.replace(/[:.]/g, "-")}`,
      scope: `bulk:${targetKind}`,
      review_date,
      created_utc,
      name,
      title,
      org,
      notes: `Bulk sign-off for ${docs.length} ${kind} documents.`,
      checks: {
        reviewed_policies: targetKind === "policy",
        reviewed_sops: targetKind === "procedure",
        reviewed_supporting: targetKind === "supporting",
        annual_review_scheduled: !!$("#attAnnualScheduled").checked,
        srm_reviewed: !!$("#attSrmReviewed").checked,
        understand_monitoring_banner: !!$("#attBannerAck").checked,
      },
    };
    const arr = next.__attestations && Array.isArray(next.__attestations) ? next.__attestations.slice() : [];
    arr.push(att);
    next.__attestations = arr;

    const applied = maybeAdjudicateGovernanceControls(next, name);
    setProgressBulk(next);
    if (applied.packComplete) {
      const w = await writeGovernanceEvidenceArtifact(next, name, governanceControls, governanceDocs);
      const msg = w.ok
        ? `Bulk signed ${docs.length} ${kind} documents.\n\nGovernance pack complete — adjudicated ${applied.count} governance controls.\nWrote evidence artifact:\n${w.path}`
        : `Bulk signed ${docs.length} ${kind} documents.\n\nGovernance pack complete — adjudicated ${applied.count} governance controls.\nArtifact write failed:\n${w.error}`;
      alert(msg);
      return;
    }
    const suffix = applied.count ? `\n\nAdjudicated ${applied.count} governance controls unlocked by these sign-offs.` : "";
    alert(`Bulk signed ${docs.length} ${kind} documents.${suffix}`);
  };

  const btnBulkPol = $("#btnGovBulkSignPolicies");
  if (btnBulkPol)
    btnBulkPol.onclick = async () => {
      try {
        await bulkSignByKind("policy");
      } catch (e) {
        alert(`Bulk sign failed: ${e && e.message ? e.message : e}`);
      }
    };
  const btnBulkSop = $("#btnGovBulkSignSops");
  if (btnBulkSop)
    btnBulkSop.onclick = async () => {
      try {
        await bulkSignByKind("procedure");
      } catch (e) {
        alert(`Bulk sign failed: ${e && e.message ? e.message : e}`);
      }
    };
  const btnBulkSupporting = $("#btnGovBulkSignSupporting");
  if (btnBulkSupporting)
    btnBulkSupporting.onclick = async () => {
      try {
        await bulkSignByKind("supporting");
      } catch (e) {
        alert(`Bulk sign failed: ${e && e.message ? e.message : e}`);
      }
    };
  const btnGovWrite = $("#btnGovWriteEvidenceArtifact");
  if (btnGovWrite)
    btnGovWrite.onclick = async () => {
      const p = getProgress();
      const name = normalize($("#attName").value);
      const w = await writeGovernanceEvidenceArtifact(p, name, governanceControls, governanceDocs);
      if (w.ok) alert(`Wrote governance evidence artifact:\n${w.path}`);
      else alert(`Failed to write governance artifact:\n${w.error}`);
    };

  const btnGovRecompute = $("#btnGovRecomputeCloseout");
  if (btnGovRecompute)
    btnGovRecompute.onclick = () => {
      try {
        const p0 = getProgress() || {};
        const prof = getAttesteeProfile(p0) || {};
        const signer = normalize(prof.name) || normalize($("#attName") ? $("#attName").value : "") || "";
        const next = { ...(p0 || {}) };
        const applied = maybeAdjudicateGovernanceControls(next, signer);
        setProgressBulk(next);
        alert(applied && applied.count ? `Recomputed governance closeout: adjudicated ${applied.count} governance controls.` : "Recomputed governance closeout.");
      } catch (e) {
        alert(`Recompute failed: ${e && e.message ? e.message : e}`);
      }
    };

  const clearAttForm = () => {
    $("#attName").value = "";
    $("#attTitle").value = "";
    $("#attOrg").value = "";
    if ($("#attScope")) $("#attScope").value = "";
    if ($("#attReviewDate")) $("#attReviewDate").value = "";
    $("#attNotes").value = "";
    $("#attReviewedPolicies").checked = false;
    $("#attReviewedSops").checked = false;
    if ($("#attReviewedSupporting")) $("#attReviewedSupporting").checked = false;
    $("#attAnnualScheduled").checked = false;
    $("#attSrmReviewed").checked = false;
    $("#attBannerAck").checked = false;
  };
  bindClick("#btnAttestClear", () => clearAttForm());
  bindClick("#btnAttestFull", () => {
    // Fill out a complete governance attestation checklist.
    if ($("#attScope")) $("#attScope").value = "governance-pack";
    const rd = $("#attReviewDate");
    if (rd && !normalize(rd.value)) {
      const d = new Date();
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      rd.value = `${yyyy}-${mm}-${dd}`;
    }
    $("#attReviewedPolicies").checked = true;
    $("#attReviewedSops").checked = true;
    if ($("#attReviewedSupporting")) $("#attReviewedSupporting").checked = true;
    $("#attAnnualScheduled").checked = true;
    $("#attSrmReviewed").checked = true;
    $("#attBannerAck").checked = true;
    const notes = $("#attNotes");
    if (notes && !normalize(notes.value)) {
      notes.value =
        "Full governance attestation: reviewed required Policies, SOPs/Procedures, and supporting docs; scheduled governance refresh; reviewed SRM; acknowledged monitoring banner.";
    }
    alert("Full attestation checklist auto-filled. Review the fields, then click “Sign attestation”.");
  });
  bindClick("#btnAttestSign", async () => {
    const name = normalize($("#attName").value);
    if (!name) {
      alert("Please provide a Name to sign the attestation.");
      return;
    }
    // Enforce a complete attestation checklist for assessor-grade exports.
    const missingChecks = [];
    const require = (id, label) => {
      const el = $(id);
      const ok = !!(el && el.checked);
      if (!ok) missingChecks.push(label);
      return ok;
    };
    require("#attReviewedPolicies", "Reviewed required Policies");
    require("#attReviewedSops", "Reviewed required SOPs");
    require("#attReviewedSupporting", "Reviewed supporting docs (plans/forms/other)");
    require("#attAnnualScheduled", "Annual governance review scheduled");
    require("#attSrmReviewed", "Shared Responsibility Matrix reviewed (if applicable)");
    require("#attBannerAck", "Acknowledged monitoring / authorized use notice");
    if (missingChecks.length) {
      alert(
        `Attestation cannot be signed until all checklist items are confirmed.\n\nMissing (${missingChecks.length}):\n- ${missingChecks.join(
          "\n- "
        )}`
      );
      return;
    }
    const created_utc = new Date().toISOString();
    const scopeRaw = $("#attScope") ? normalize($("#attScope").value) : "";
    const scope = scopeRaw || "governance-pack";
    const review_date = $("#attReviewDate") ? normalize($("#attReviewDate").value) : "";
    const att = {
      id: `att-${created_utc.replace(/[:.]/g, "-")}`,
      scope,
      review_date,
      created_utc,
      name,
      title: normalize($("#attTitle").value),
      org: normalize($("#attOrg").value),
      notes: normalize($("#attNotes").value),
      checks: {
        reviewed_policies: !!$("#attReviewedPolicies").checked,
        reviewed_sops: !!$("#attReviewedSops").checked,
        reviewed_supporting: !!$("#attReviewedSupporting").checked,
        annual_review_scheduled: !!$("#attAnnualScheduled").checked,
        srm_reviewed: !!$("#attSrmReviewed").checked,
        understand_monitoring_banner: !!$("#attBannerAck").checked,
      },
    };
    const p = getProgress();
    const next = { ...(p || {}) };
    const arr = next.__attestations && Array.isArray(next.__attestations) ? next.__attestations.slice() : [];
    arr.push(att);
    next.__attestations = arr;

    // If this attestation is for a governance document, also store a per-document signoff record.
    if (scope && scope.indexOf("doc:") === 0) {
      const docId = scope.slice(4);
      if (docId) {
        next.__doc_signoffs = next.__doc_signoffs && typeof next.__doc_signoffs === "object" ? next.__doc_signoffs : {};
        // Best-effort: write the same per-document signoff evidence record as the Governance wizard.
        // If this fails (e.g., no /__fs access), we still retain an in-progress signoff record for audit trail.
        try {
          const d = governanceDocById && governanceDocById[docId] ? governanceDocById[docId] : null;
          if (d && d.id) {
            let docRaw = "";
            const url = `../${d.id}`;
            const resp = await fetch(url, { cache: "no-store" });
            if (resp.ok) docRaw = await resp.text();
            const docSha256 = docRaw ? await sha256Hex(docRaw) : "";
            const runId = runIdFromUtcIso(created_utc) || created_utc.replace(/[:.]/g, "-");
            const safeCode = String(d.code || "DOC").replace(/[^A-Za-z0-9_.-]+/g, "_");
            const outDir = `C:\\evidence\\CUI-Doc-Signoff-${runId}`;
            const jsonPath = `${outDir}\\${safeCode}-signoff.json`;
            const mdPath = `${outDir}\\${safeCode}-signoff.md`;
            const signoffRecord = {
              schema: "mactech.codex.manual.doc_signoff",
              version: 1,
              generated_utc: created_utc,
              signer: { name, title: att.title || "", org: att.org || "", review_date },
              document: {
                id: d.id,
                code: d.code || "",
                title: d.title || "",
                kind: d.kind || "",
                source_path: d.id,
                sha256: docSha256 || "",
              },
              stored_record: { out_dir: outDir, json_path: jsonPath, md_path: mdPath },
              notes:
                "This record attests the signer reviewed the referenced document version (by SHA-256 when available) and approved it for use within the enclave scope.",
            };
            const signoffJsonText = JSON.stringify(signoffRecord, null, 2) + "\n";
            const signoffMdText =
              [
                "# Document sign-off record",
                "",
                `Generated (UTC): ${created_utc}`,
                "",
                "## Signer",
                `- Name: ${name}`,
                `- Title: ${att.title || ""}`,
                `- Organization: ${att.org || ""}`,
                `- Review date: ${review_date || ""}`,
                "",
                "## Document",
                `- Code: ${d.code || ""}`,
                `- Title: ${d.title || ""}`,
                `- Path: ${d.id}`,
                docSha256 ? `- SHA-256: ${docSha256}` : "- SHA-256: (not computed)",
                "",
                "## Stored record locations",
                `- JSON: \`${jsonPath}\``,
                `- Markdown: \`${mdPath}\``,
                "",
              ].join("\n") + "\n";
            // Writes require the manual to be opened via the local server (/__fs).
            await fsWriteTextFile(jsonPath, signoffJsonText);
            await fsWriteTextFile(mdPath, signoffMdText);
            const recordJsonSha256 = await sha256Hex(signoffJsonText);

            next.__doc_signoffs[docId] = {
              doc_id: docId,
              signed_utc: created_utc,
              review_date,
              name,
              title: att.title,
              org: att.org,
              notes: att.notes,
              doc_sha256: docSha256 || "",
              record_json_path: jsonPath,
              record_md_path: mdPath,
              record_json_sha256: recordJsonSha256,
            };
            // Convenience index by code (helps UX messaging elsewhere).
            if (d && d.code) {
              next.__doc_signoffs_by_code =
                next.__doc_signoffs_by_code && typeof next.__doc_signoffs_by_code === "object" ? next.__doc_signoffs_by_code : {};
              next.__doc_signoffs_by_code[normalize(d.code).toUpperCase()] = {
                ...(next.__doc_signoffs[docId] || {}),
                doc_code: d.code,
              };
            }
          } else {
            // Fallback: record signoff only (no doc evidence record).
            next.__doc_signoffs[docId] = {
              doc_id: docId,
              signed_utc: created_utc,
              review_date,
              name,
              title: att.title,
              org: att.org,
              notes: att.notes,
            };
          }
        } catch {
          next.__doc_signoffs[docId] = {
            doc_id: docId,
            signed_utc: created_utc,
            review_date,
            name,
            title: att.title,
            org: att.org,
            notes: att.notes,
          };
        }
        // Incremental governance adjudication: if this sign-off satisfies one or more governance controls, adjudicate them now.
        try {
          maybeAdjudicateGovernanceControls(next, name);
        } catch {}
      }
    }

    setProgressBulk(next);
    clearAttForm();
    alert("Attestation signed and saved.");
  });

  // Export page actions
  bindClick("#btnExportHere", () => $("#btnExport").click());
  bindClick("#btnExportAttestationsMd", () => {
    const md = buildAttestationMarkdown(getProgress(), governanceDocs);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadText(`codex-attestations-${ts}.md`, md, "text/markdown; charset=utf-8");
  });

  const setAuditStatus = (msg) => {
    const el = $("#auditStatus");
    if (!el) return;
    el.textContent = msg ? String(msg) : "";
  };
  const btnAudit = $("#btnAuditAdjudications");
  if (btnAudit)
    btnAudit.onclick = async () => {
      try {
        setAuditStatus("Running audit…");
        await auditAndEnforceAdjudications(controlsAll, getProgress, setProgressBulk, setAuditStatus);
      } catch (e) {
        setAuditStatus(`Audit failed: ${e && e.message ? e.message : e}`);
      }
    };

  // Unified workflow buttons on Dashboard
  bindClick("#btnWfRunBoth", () => {
    const b = $("#btnBulkCopyRunBoth");
    if (b) b.click();
    else downloadText("codex-run-both-admin.txt", "Button not available. Open Advanced tools or refresh.\n", "text/plain; charset=utf-8");
  });
  bindClick("#btnWfAudit", () => $("#btnAuditAdjudications").click());
  bindClick("#btnWfExport", () => $("#btnExport").click());
  bindClick("#btnWfExportAtt", () => $("#btnExportAttestationsMd").click());

  $("#q").addEventListener("input", (e) => {
    state.query = e.target.value || "";
    scheduleRerender();
  });
  $("#filterFamily").addEventListener("change", (e) => {
    state.family = e.target.value;
    scheduleRerender();
  });
  $("#filterClass").addEventListener("change", (e) => {
    state.classification = e.target.value;
    scheduleRerender();
  });
  $("#filterAdjudicated").addEventListener("change", (e) => {
    state.adjudicated = e.target.value;
    scheduleRerender();
  });

  // Keyboard navigation for selection
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) {
      return;
    }
    const filtered = getFiltered();
    if (!filtered.length) return;
    const idx = selectedId ? filtered.findIndex((c) => c.control_id === selectedId) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = Math.min(filtered.length - 1, idx < 0 ? 0 : idx + 1);
      selectedId = filtered[nextIdx].control_id;
      rerender();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = Math.max(0, idx < 0 ? 0 : idx - 1);
      selectedId = filtered[prevIdx].control_id;
      rerender();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[idx >= 0 ? idx : 0];
      if (c) {
        selectedId = c.control_id;
        rerender();
      }
    }
  });

  bindClick("#btnExport", () => {
    const out = {
      schema: "mactech.codex.manual.progress",
      version: APP_VERSION,
      exported_utc: new Date().toISOString(),
      progress,
    };
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`codex-manual-progress-${ts}.json`, out);
    // Also persist a timestamped copy to disk (best-effort).
    try {
      if (canUseFsApi()) {
        const json = JSON.stringify(out, null, 2) + "\n";
        fsWriteTextFile(`${DISK_PROGRESS_DIR}\\codex-manual-progress-${ts}.json`, json).catch(() => {});
        fsWriteTextFile(DISK_PROGRESS_LATEST_PATH, json).catch(() => {});
      }
    } catch {}
  });

  $("#fileImport").addEventListener("change", async (e) => {
    const files = e && e.target ? e.target.files : null;
    const f = files && files.length ? files[0] : null;
    if (!f) return;
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      const imported = obj && obj.progress && typeof obj.progress === "object" ? obj.progress : obj;
      if (!imported || typeof imported !== "object") throw new Error("Invalid import file");
      progress = { ...(progress || {}), ...imported };
      saveProgress(progress);
      rerender();
      alert("Progress imported.");
    } catch (err) {
      console.error(err);
      alert("Import failed. Ensure you selected a valid progress JSON.");
    } finally {
      e.target.value = "";
    }
  });

  bindClick("#btnReset", () => {
    if (!confirm("Reset local progress for this browser profile?")) return;
    const alsoDisk = confirm("Also delete the disk backup under C:\\evidence\\CUI-Manual-Progress?\n\nChoose OK to delete disk backup too, or Cancel to keep it.");
    localStorage.removeItem(STORAGE_KEY);
    progress = {};
    try {
      if (alsoDisk && canUseFsApi()) {
        // Overwrite latest with an empty progress object (deletes intent without requiring delete API).
        const out = buildProgressExportObject({});
        const json = JSON.stringify(out, null, 2) + "\n";
        fsWriteTextFile(DISK_PROGRESS_LATEST_PATH, json).catch(() => {});
      }
    } catch {}
    rerender();
  });

  // initial render
  let initialView = "controls";
  try {
    const v = normalize(localStorage.getItem(UI_VIEW_KEY));
    const ok = ["dashboard", "controls", "family", "governance", "poam", "conmon", "exports"];
    if (v && ok.indexOf(v) >= 0) initialView = v;
  } catch {}
  setView(initialView);
}

main().catch((err) => {
  console.error(err);
  const msg = err && err.message ? err.message : String(err);
  const tip =
    (window.location && window.location.protocol === "file:")
      ? "Tip: open via http://127.0.0.1:8787/manual_app/index.html (not file://)."
      : "Tip: ensure the local server is running (start-server.ps1).";
  alert(`Manual app failed to start: ${msg}\n\n${tip}`);
});

