/* Inline editing on the live site for the logged-in admin.
   loadContent() (in index.html) tags editable elements with data-edit="path"
   and calls window.LFInlineEdit() once the page is populated. */
(function () {
  "use strict";
  var isAdmin = false, ready = false, wired = false;
  var active = null, original = "", ctrl = null;

  fetch("/api/me").then(function (r) { return r.json(); }).then(function (m) {
    isAdmin = !!(m && m.admin);
    if (isAdmin) { injectStyles(); buildImageModal(); buildIconModal(); document.body.classList.add("lf-admin"); showBar(); showSignout(); if (ready) wire(); }
  }).catch(function () {});

  window.LFInlineEdit = function () { ready = true; if (isAdmin) wire(); };

  function wire() { if (wired) return; wired = true; document.addEventListener("click", onClick, true); }

  function onClick(e) {
    var iconEl = e.target.closest("[data-editicon]");
    if (iconEl) { e.preventDefault(); e.stopPropagation(); openIconPicker(iconEl); return; }
    var imgEl = e.target.closest("[data-editimg]");
    if (imgEl) { e.preventDefault(); e.stopPropagation(); openImageEditor(imgEl); return; }
    var el = e.target.closest("[data-edit]");
    if (el) {
      if (el === active || active) return;
      e.preventDefault(); e.stopPropagation();
      start(el);
      return;
    }
    // Fallback: on gallery tiles the gradient overlay (.tile::after) sits ABOVE the
    // image, so the click target is the container, not the [data-editimg] photo inside.
    // Find the image within the nearest photo container so it still opens the editor.
    var container = e.target.closest(".tile, .shop-img, .hero, .hero-in");
    if (container) {
      var cim = container.querySelector("[data-editimg]");
      if (cim) { e.preventDefault(); e.stopPropagation(); openImageEditor(cim); return; }
    }
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
    if (p[0] === "occasion") { var o = { id: p[1] }; o[p[2]] = val; return { occasions: [o] }; }
    if (p[0] === "contact" && p[1] === "hours") {
      // hours is an array — gather every row from the page (the edited value is already in the DOM)
      var hours = [];
      document.querySelectorAll("#contact .hours > div").forEach(function (row) {
        var b = row.querySelector("b"), s = row.querySelector("span");
        hours.push({ day: b ? b.textContent.trim() : "", time: s ? s.textContent.trim() : "" });
      });
      return { contact: { hours: hours } };
    }
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
  function showSignout() {
    var b = document.createElement("button"); b.className = "lf-signout"; b.type = "button"; b.textContent = "Sign out";
    b.addEventListener("click", function () { fetch("/api/logout", { method: "POST" }).then(function () { location.reload(); }); });
    document.body.appendChild(b);
  }
  function toast(msg, err) {
    var t = document.createElement("div"); t.className = "lf-toast" + (err ? " err" : ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800);
  }
  /* ---- inline image editing (change photos on the live site) ---- */
  var imgModal = null, imgGrid = null, imgTarget = null, imgLoaded = false, imgMedia = [];
  function buildImageModal() {
    imgModal = document.createElement("div"); imgModal.className = "lf-modal"; imgModal.hidden = true;
    imgModal.innerHTML = '<div class="lf-modal-box"><div class="lf-modal-head"><b>Change photo</b><label class="lf-upload">Upload new<input type="file" accept="image/*" hidden></label><button class="lf-close" type="button">✕</button></div><div class="lf-modal-grid"></div></div>';
    document.body.appendChild(imgModal);
    imgGrid = imgModal.querySelector(".lf-modal-grid");
    imgModal.querySelector(".lf-close").addEventListener("click", closeImageModal);
    imgModal.addEventListener("click", function (e) { if (e.target === imgModal) closeImageModal(); });
    imgModal.querySelector(".lf-upload input").addEventListener("change", function () { uploadImage(this); });
    imgGrid.addEventListener("click", function (e) { var c = e.target.closest("[data-url]"); if (c) applyImage(c.getAttribute("data-url")); });
  }
  function openImageEditor(img) {
    imgTarget = img; imgModal.hidden = false;
    if (imgLoaded) { renderImgGrid(); return; }
    imgGrid.innerHTML = '<p class="lf-msg">Loading your photos…</p>';
    fetch("/api/admin/media").then(function (r) { if (r.status === 401) { location.href = "/admin"; return null; } return r.json(); })
      .then(function (d) { if (d && d.images) { imgLoaded = true; imgMedia = d.images; renderImgGrid(); } else imgGrid.innerHTML = '<p class="lf-msg">' + ((d && d.error) || "Could not load photos.") + "</p>"; })
      .catch(function () { imgGrid.innerHTML = '<p class="lf-msg">Could not load photos.</p>'; });
  }
  function renderImgGrid() {
    imgGrid.innerHTML = imgMedia.length
      ? imgMedia.map(function (m) { return '<img class="lf-media" src="' + m.url + '" data-url="' + m.url + '" alt="">'; }).join("")
      : '<p class="lf-msg">No photos yet — click "Upload new" above.</p>';
  }
  function closeImageModal() { if (imgModal) imgModal.hidden = true; imgTarget = null; }
  function uploadImage(inp) {
    var file = inp.files[0]; if (!file) return;
    var fd = new FormData(); fd.append("file", file);
    imgGrid.innerHTML = '<p class="lf-msg">Uploading…</p>';
    fetch("/api/admin/upload", { method: "POST", body: fd }).then(function (r) { if (r.status === 401) { location.href = "/admin"; return null; } return r.json(); })
      .then(function (d) { inp.value = ""; if (d && d.url) { confirmUse(d.url); } else imgGrid.innerHTML = '<p class="lf-msg">' + ((d && d.error) || "Upload failed.") + "</p>"; })
      .catch(function () { imgGrid.innerHTML = '<p class="lf-msg">Upload failed.</p>'; });
  }
  function confirmUse(url) {
    imgLoaded = false; // the new photo is now in the library
    imgGrid.innerHTML = '<div class="lf-confirm"><img class="lf-confirm-img" src="' + url + '" alt=""><p>✓ Saved to your photo library.<br>Use this photo here now?</p><div class="lf-confirm-btns"><button class="lf-yes" type="button">Use it here</button><button class="lf-nope" type="button">Just keep in library</button></div></div>';
    imgGrid.querySelector(".lf-yes").addEventListener("click", function () { applyImage(url); });
    imgGrid.querySelector(".lf-nope").addEventListener("click", function () { openImageEditor(imgTarget); });
  }
  function applyImage(url) {
    if (!imgTarget) return;
    var payload = buildImg(imgTarget.getAttribute("data-editimg"), url);
    if (!payload) { closeImageModal(); return; }
    imgTarget.src = url;
    fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { if (r.status === 401) { location.href = "/admin"; return null; } return r.json(); })
      .then(function (d) { if (d && d.ok) toast("Photo updated ✓"); else toast((d && d.error) || "Could not save", true); })
      .catch(function () { toast("Save failed", true); });
    closeImageModal();
  }
  function buildImg(path, url) {
    var p = path.split(".");
    if (p[0] === "hero") return { hero: { img: url } };
    if (p[0] === "box") return { boxes: [{ id: p[1], img: url }] };
    if (p[0] === "gallery") return { gallery: [{ id: p[1], img: url }] };
    return null;
  }

  /* ---- inline icon picker (occasion icons) ---- */
  var iconModal = null, iconTarget = null;
  var EMOJIS = ["💐","🌷","🌹","🌸","🌺","🌻","🌼","🪷","🌿","🍀","💒","💍","🕊️","❤️","💕","💖","💝","💗","🧡","💛","💚","💙","💜","🖤","🤍","🎁","🎉","🎊","🥂","🍾","🎂","🎈","👶","🍼","🎓","🏆","🌟","⭐","✨","👑","💌","🌈","☀️","🌙","🕯️","⚰️","✝️","🙏","🎃","🎄","❄️","🍁"];
  function buildIconModal() {
    iconModal = document.createElement("div"); iconModal.className = "lf-modal"; iconModal.hidden = true;
    iconModal.innerHTML = '<div class="lf-modal-box"><div class="lf-modal-head"><b>Pick an icon</b><button class="lf-close" type="button">✕</button></div><div class="lf-icon-grid">' + EMOJIS.map(function (e) { return '<button class="lf-emoji" type="button">' + e + '</button>'; }).join("") + '</div></div>';
    document.body.appendChild(iconModal);
    iconModal.querySelector(".lf-close").addEventListener("click", closeIcon);
    iconModal.addEventListener("click", function (e) { if (e.target === iconModal) closeIcon(); });
    iconModal.querySelector(".lf-icon-grid").addEventListener("click", function (e) { var b = e.target.closest(".lf-emoji"); if (b) applyIcon(b.textContent); });
  }
  function openIconPicker(el) { iconTarget = el; iconModal.hidden = false; }
  function closeIcon() { if (iconModal) iconModal.hidden = true; iconTarget = null; }
  function applyIcon(emoji) {
    if (!iconTarget) return;
    var p = iconTarget.getAttribute("data-editicon").split("."); // occasion.<id>.icon
    iconTarget.textContent = emoji;
    fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occasions: [{ id: p[1], icon: emoji }] }) })
      .then(function (r) { if (r.status === 401) { location.href = "/admin"; return null; } return r.json(); })
      .then(function (d) { if (d && d.ok) toast("Icon updated ✓"); else toast((d && d.error) || "Could not save", true); })
      .catch(function () { toast("Save failed", true); });
    closeIcon();
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
      ".lf-signout{position:fixed;top:12px;right:12px;z-index:99999;background:#b42318;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:600 13px Montserrat,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);}" +
      ".lf-signout:hover{background:#8f1c12;}" +
      "body.lf-admin [data-editimg]{outline:2px dashed rgba(43,143,155,.6);outline-offset:-2px;cursor:pointer;}" +
      "body.lf-admin [data-editimg]:hover{outline-color:#2b8f9b;box-shadow:0 0 0 4px rgba(43,143,155,.25) inset;}" +
      ".lf-modal{position:fixed;inset:0;z-index:100000;background:rgba(38,56,60,.6);display:flex;align-items:center;justify-content:center;padding:20px;}" +
      ".lf-modal[hidden]{display:none;}" +
      ".lf-modal-box{background:#fff;border-radius:16px;width:min(760px,100%);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;font-family:Montserrat,system-ui,sans-serif;}" +
      ".lf-modal-head{display:flex;align-items:center;gap:12px;padding:15px 20px;border-bottom:1px solid #e2eef0;}" +
      ".lf-modal-head b{font-size:15px;color:#26383c;}" +
      ".lf-upload{margin-left:auto;background:#2b8f9b;color:#fff;font-size:13px;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer;}" +
      ".lf-modal-head .lf-close{background:#e2eef0;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:15px;}" +
      ".lf-modal-grid{overflow-y:auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;}" +
      ".lf-media{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #d5e4e6;cursor:pointer;}" +
      ".lf-media:hover{border-color:#2b8f9b;box-shadow:0 0 0 3px rgba(43,143,155,.25);}" +
      ".lf-msg{padding:24px;color:#5d7176;font-size:14px;text-align:center;grid-column:1/-1;}" +
      ".lf-confirm{grid-column:1/-1;text-align:center;padding:24px;}" +
      ".lf-confirm-img{max-width:220px;max-height:200px;border-radius:12px;border:1px solid #d5e4e6;margin-bottom:14px;}" +
      ".lf-confirm p{color:#26383c;font-size:14px;line-height:1.5;margin-bottom:16px;}" +
      ".lf-confirm-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}" +
      ".lf-yes{background:#2e7d51;color:#fff;border:none;border-radius:999px;padding:11px 22px;font-weight:700;font-size:14px;cursor:pointer;}" +
      ".lf-nope{background:#e2eef0;color:#26383c;border:none;border-radius:999px;padding:11px 22px;font-weight:700;font-size:14px;cursor:pointer;}" +
      "body.lf-admin [data-editicon]{outline:1px dashed rgba(43,143,155,.5);outline-offset:3px;cursor:pointer;border-radius:6px;}" +
      "body.lf-admin [data-editicon]:hover{background:rgba(43,143,155,.12);}" +
      ".lf-icon-grid{overflow-y:auto;padding:16px;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;}" +
      ".lf-emoji{font-size:24px;line-height:1;cursor:pointer;padding:8px 4px;border:none;background:none;border-radius:8px;}" +
      ".lf-emoji:hover{background:#e2eef0;}" +
      "body.lf-admin{padding-bottom:46px;}";
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }
})();
