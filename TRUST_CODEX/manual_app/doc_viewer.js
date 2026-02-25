/* Codex Doc Viewer
 * - Renders Markdown to HTML (same renderer as manual app)
 * - Supports in-doc navigation for relative links
 * - Provides search highlight and "open raw"
 */

function normalize(s) {
  return String(s || "").trim();
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function $(id) {
  return document.getElementById(String(id || ""));
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

function stripPlatformAgnosticBoilerplate(md) {
  const t = String(md || "");
  if (!/^#\s*PLATFORM-AGNOSTIC TEMPLATE\b/i.test(t)) return t;
  const m = t.match(/^#\s*PLATFORM-AGNOSTIC TEMPLATE[\s\S]*?\n---\s*\n+/i);
  if (m && m[0]) return t.slice(m[0].length);
  return t;
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

function parseQuery() {
  const u = new URL(window.location.href);
  return {
    doc: u.searchParams.get("doc") || "",
    v: u.searchParams.get("v") || "",
  };
}

function setQueryDoc(docPath) {
  const u = new URL(window.location.href);
  u.searchParams.set("doc", docPath);
  history.pushState({}, "", u.toString());
}

function resolveDocLinkFactory(currentDocPath) {
  return (href) => {
    const h = normalize(href);
    if (!currentDocPath) return h;
    if (h.startsWith("/")) return h;
    if (h.startsWith("../") || h.startsWith("./")) {
      const base = currentDocPath.split("/").slice(0, -1).join("/");
      const combined = base ? `${base}/${h}` : h;
      return combined.replace(/\/\.\//g, "/");
    }
    const base = currentDocPath.split("/").slice(0, -1).join("/");
    return base ? `${base}/${h}` : h;
  };
}

function highlightHtml(html, q) {
  const query = normalize(q).toLowerCase();
  if (!query) return html;
  try {
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return String(html || "").replace(re, (m) => `<mark>${m}</mark>`);
  } catch {
    return html;
  }
}

async function openDoc(docPath, opts) {
  const path = normalize(docPath);
  const q = (opts && opts.query) || "";
  const body = $("dvBody");
  const status = $("dvStatus");
  const pathEl = $("dvPath");
  if (!path) {
    if (body) body.innerHTML = `<div class="callout callout-warning"><div class="callout-title">WARNING</div><p>Missing doc path.</p></div>`;
    return;
  }
  if (pathEl) pathEl.textContent = path;
  if (status) status.textContent = "Loading…";
  if (body) body.innerHTML = `<div class="callout callout-note"><div class="callout-title">LOADING</div><p>Fetching ${esc(path)}…</p></div>`;
  try {
    const resp = await fetch(path, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.text();
    const cleaned = stripPlatformAgnosticBoilerplate(raw);
    const resolver = resolveDocLinkFactory(path);
    let html = renderMarkdown(cleaned, resolver);
    html = highlightHtml(html, q);
    if (body) body.innerHTML = html;
    // wire in-doc navigation
    body.querySelectorAll("a[data-doc]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const target = a.getAttribute("data-doc");
        if (target) {
          setQueryDoc(target);
          openDoc(target, { query: $("dvSearch").value || "" });
        }
      });
    });
    if (status) status.textContent = "";
  } catch (e) {
    if (status) status.textContent = "Failed to load.";
    if (body) {
      body.innerHTML = `<div class="callout callout-warning"><div class="callout-title">WARNING</div><p>Failed to load: ${esc(
        path
      )}</p><pre class="mono">${esc(e && e.message ? e.message : e)}</pre></div>`;
    }
  }
}

function main() {
  const q = parseQuery();
  const docPath = normalize(q.doc) || "docs/00_Start_Here.md";

  const btnTop = $("dvTop");
  if (btnTop) btnTop.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const btnClose = $("dvClose");
  if (btnClose) btnClose.onclick = () => window.close();

  const btnRaw = $("dvOpenRaw");
  if (btnRaw) btnRaw.onclick = () => window.open(docPath, "_blank", "noreferrer");

  const btnCopy = $("dvCopyLink");
  if (btnCopy)
    btnCopy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const st = $("dvStatus");
        if (st) st.textContent = "Copied viewer link.";
        setTimeout(() => {
          const st2 = $("dvStatus");
          if (st2) st2.textContent = "";
        }, 1200);
      } catch {
        alert("Copy failed.");
      }
    };

  const search = $("dvSearch");
  if (search) {
    let t = null;
    search.oninput = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => openDoc(normalize(parseQuery().doc) || docPath, { query: search.value || "" }), 180);
    };
  }

  window.addEventListener("popstate", () => openDoc(normalize(parseQuery().doc) || docPath, { query: $("dvSearch").value || "" }));
  openDoc(docPath, { query: "" });
}

main();

