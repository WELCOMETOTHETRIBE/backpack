/* Minimal ES5 boot shim for Trust Codex Manual.
 * Purpose:
 * - Make file:// launches self-heal by redirecting to local HTTP server
 * - Surface obvious "JS didn't start" situations (IE mode / legacy engine)
 *
 * Keep this file ES5-compatible (no const/let, no arrow functions, etc).
 */
(function () {
  // Capture startup errors to display in-page.
  var lastErr = null;

  function safeStr(x) {
    try {
      if (x == null) return "";
      return String(x);
    } catch (e) {
      return "";
    }
  }

  function byId(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  function setText(id, text) {
    var el = byId(id);
    if (!el) return;
    try {
      el.textContent = String(text == null ? "" : text);
    } catch (e) {}
  }

  function ensureBanner() {
    var el = byId("bootNotice");
    if (el) return el;
    try {
      el = document.createElement("div");
      el.id = "bootNotice";
      el.setAttribute("style", "margin: 12px 0; padding: 12px; border-radius: 14px; border: 1px solid rgba(251,113,133,0.35); background: rgba(251,113,133,0.10); color: rgba(255,255,255,0.88);");
      // Put it at the top of main content area if present; otherwise just prepend body.
      var main = byId("viewDashboard") || byId("controlCard") || null;
      if (main && main.parentNode) {
        main.parentNode.insertBefore(el, main);
      } else if (document.body) {
        document.body.insertBefore(el, document.body.firstChild);
      }
    } catch (e) {}
    return el;
  }

  function isProbablyIEEngine() {
    try {
      var ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
      return ua.indexOf("Trident/") >= 0 || ua.indexOf("MSIE ") >= 0;
    } catch (e) {
      return false;
    }
  }

  function isIEModeDocumentMode() {
    try {
      // documentMode exists in IE (and IE-mode).
      return !!(document && document.documentMode);
    } catch (e) {
      return false;
    }
  }

  // Hook global errors early (helps distinguish parse/runtime failures).
  try {
    window.onerror = function (message, source, lineno, colno, error) {
      try {
        lastErr = {
          message: safeStr(message),
          source: safeStr(source),
          line: lineno,
          col: colno,
          stack: error && error.stack ? safeStr(error.stack) : ""
        };
      } catch (e) {}
      return false;
    };
  } catch (e) {}

  try {
    if (window && window.addEventListener) {
      window.addEventListener("unhandledrejection", function (ev) {
        try {
          var r = ev && ev.reason ? ev.reason : null;
          lastErr = {
            message: "Unhandled promise rejection: " + safeStr(r && r.message ? r.message : r),
            source: "",
            line: "",
            col: "",
            stack: r && r.stack ? safeStr(r.stack) : ""
          };
        } catch (e) {}
      });
    }
  } catch (e) {}

  function redirectToLocalServer() {
    var url = "http://127.0.0.1:8787/manual_app/index.html";
    ensureBanner();
    setText(
      "bootNotice",
      "You opened this manual via file:// which blocks loading the dataset. Redirecting to " + url + " (ensure the local server is running)."
    );
    try {
      setTimeout(function () {
        try {
          window.location.href = url;
        } catch (e) {}
      }, 150);
    } catch (e) {}
  }

  // If launched via file://, redirect immediately. (This works even if app.js fails to parse.)
  try {
    if (window && window.location && window.location.protocol === "file:") {
      redirectToLocalServer();
      return;
    }
  } catch (e) {}

  // If the main app doesn't flip the started flag shortly after load,
  // surface a helpful message (common when in IE mode / legacy engine).
  try {
    setTimeout(function () {
      var started = false;
      try {
        started = !!(window && window.CodexManualAppStarted);
      } catch (e) {}
      if (started) return;
      ensureBanner();
      var ie = isProbablyIEEngine() || isIEModeDocumentMode();
      var extra = ie
        ? " Detected IE-mode / legacy engine. In Edge, disable IE mode for this site (Settings -> Default browser -> Internet Explorer mode) and reload."
        : " Please ensure JavaScript is enabled and check the error details below.";
      var details = "";
      try {
        if (lastErr && (lastErr.message || lastErr.source || lastErr.stack)) {
          details =
            "\\n\\nError details:\\n" +
            (lastErr.message ? ("- message: " + lastErr.message + "\\n") : "") +
            (lastErr.source ? ("- source: " + lastErr.source + "\\n") : "") +
            (lastErr.line ? ("- line: " + lastErr.line + "\\n") : "") +
            (lastErr.col ? ("- col: " + lastErr.col + "\\n") : "") +
            (lastErr.stack ? ("- stack: " + lastErr.stack + "\\n") : "");
        } else {
          // Always include UA to aid debugging.
          var ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
          if (ua) details = "\\n\\nUser-Agent: " + ua;
        }
      } catch (e) {}
      setText(
        "bootNotice",
        "The manual UI did not finish starting (JavaScript failed)." + extra + details
      );
    }, 1200);
  } catch (e) {}
})();

