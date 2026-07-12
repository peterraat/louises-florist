/* Inline editing on the live site for the logged-in admin.
   loadContent() (in index.html) tags editable elements with data-edit="path"
   and calls window.LFInlineEdit() once the page is populated. */
(function () {
  "use strict";
  var isAdmin = false, ready = false, wired = false;
  var active = null, original = "", ctrl = null;

  fetch("/api/me").then(function (r) { return r.json(); }).then(function (m) {
    isAdmin = !!(m && m.admin);
    if (isAdmin) { injectStyles(); document.body.classList.add("lf-admin"); showBar(); if (ready) wire(); }
  }).catch(function () {});

  window.LFInlineEdit = function () { ready = true; if (isAdmin) wire(); };

  function wire() { if (wired) return; wired = true; document.addEventListener("click", onClick, true); }

  function onClick(e) {
    var el = e.target.closest("[data-edit]");
    if (!el || el === active) return;
    e.preventDefault(); e.stopPropagation();
    if (active) return;
    start(el);
  }

  function start(el) {
    active = el; original = el.textContent;
    el.classList.add("lf-editing");
    el.setAttribute("contenteditable", "true");
    el.focus(); selectAll(el);
    el.addEventListener("keydown", keyHandler);
    ctrl = document.createElement("div");
    ctrl.className = "lf-ctrl";
    ctrl.innerHTML = '<button class="lf-ok" title="Save (Enter)">✓</button><button class="lf-no" title="Cancel (Esc)">✕</button>';
    document.body.appendChild(ctrl); position();
    ctrl.querySelector(".lf-ok").addEventListener("mousedown", function (e) { e.preventDefault(); save(); });
    ctrl.querySelector(".lf-no").addEventListener("mousedown", function (e) { e.preventDefault(); cancel(); });
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
  }

  function position() {
    if (!ctrl || !active) return;
    var r = active.getBoundingClientRect();
    ctrl.style.top = (r.bottom + window.scrollY + 6) + "px";
    ctrl.style.left = (r.left + window.scrollX) + "px";
  }

  function keyHandler(e) {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    else if (e.key === "Enter" && active.getAttribute("data-multiline") !== "1") { e.preventDefault(); save(); }
  }

  function cleanup() {
    if (active) {
      active.removeAttribute("contenteditable");
      active.classList.remove("lf-editing");
      active.removeEventListener("keydown", keyHandler);
    }
    if (ctrl) { ctrl.remove(); ctrl = null; }
    window.removeEventListener("scroll", position, true);
    window.removeEventListener("resize", position);
    active = null;
  }

  function cancel() { if (active) active.textContent = original; cleanup(); }

  function save() {
    var el = active, val = el.textContent.trim(), payload = build(el.getAttribute("data-edit"), val);
    if (!payload) { cleanup(); return; }
    var ok = ctrl.querySelector(".lf-ok"); ok.textContent = "…";
    fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { if (r.status === 401) { location.href = "/admin"; return null; } return r.json(); })
      .then(function (d) { if (d && d.ok) { toast("Saved ✓"); cleanup(); } else { toast((d && d.error) || "Could not save", true); if (ok) ok.textContent = "✓"; } })
      .catch(function () { toast("Save failed", true); if (ok) ok.textContent = "✓"; });
  }

  function build(path, val) {
    var p = path.split(".");
    if (p[0] === "hero")    { var a = {}; a[p[1]] = val; return { hero: a }; }
    if (p[0] === "service") { var b = { id: p[1] }; b[p[2]] = val; return { services: [b] }; }
    if (p[0] === "box")     { var c = { id: p[1] }; c[p[2]] = val; return { boxes: [c] }; }
    if (p[0] === "gallery") { var e = { id: p[1] }; e[p[2]] = val; return { gallery: [e] }; }
    if (p[0] === "contact") { var f = {}; f[p[1]] = val; return { contact: f }; }
    return null;
  }

  function selectAll(el) {
    var r = document.createRange(); r.selectNodeContents(el);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function showBar() {
    var b = document.createElement("div"); b.className = "lf-bar";
    b.innerHTML = '✏️ Editing mode — click any highlighted text to change it. <a href="/admin">Full admin ↗</a>';
    document.body.appendChild(b);
  }
  function toast(msg, err) {
    var t = document.createElement("div"); t.className = "lf-toast" + (err ? " err" : ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800);
  }
  function injectStyles() {
    var css =
      "body.lf-admin [data-edit]{outline:1px dashed rgba(43,143,155,.55);outline-offset:2px;cursor:text;transition:background .15s;}" +
      "body.lf-admin [data-edit]:hover{background:rgba(43,143,155,.1);}" +
      "[data-edit].lf-editing{outline:2px solid #2b8f9b;background:#fff;}" +
      ".lf-ctrl{position:absolute;z-index:99999;display:flex;gap:6px;}" +
      ".lf-ctrl button{width:34px;height:34px;border:none;border-radius:8px;font-size:16px;line-height:1;cursor:pointer;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.25);}" +
      ".lf-ctrl .lf-ok{background:#2e7d51;} .lf-ctrl .lf-no{background:#b42318;}" +
      ".lf-bar{position:fixed;bottom:0;left:0;right:0;z-index:99998;background:#1f6f79;color:#fff;font:600 13px/1.4 Montserrat,system-ui,sans-serif;padding:10px 16px;text-align:center;}" +
      ".lf-bar a{color:#fff;text-decoration:underline;margin-left:6px;}" +
      ".lf-toast{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);z-index:99999;background:#2e7d51;color:#fff;padding:10px 18px;border-radius:999px;font:600 14px Montserrat,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);}" +
      ".lf-toast.err{background:#b42318;}" +
      "body.lf-admin{padding-bottom:46px;}";
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }
})();
