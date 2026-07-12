import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

import express from "express";
import mongoose from "mongoose";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

/* =====================================================================
   CONTENT — single source of truth (editable in /admin, stored in Mongo)
   Falls back to defaults so the site runs before Mongo is configured.
===================================================================== */
const DEFAULT_CONTENT = {
  hero: {
    eyebrow: "Hoddesdon · Est. family florist",
    heading: "Beautiful flowers, lovingly made.",
    lede: "Fresh, hand-tied arrangements for every occasion — from weddings and celebrations to funeral tributes — crafted by Louise with over 40 years' experience, right in the heart of Hoddesdon.",
    img: "images/hero.jpg"
  },
  services: [
    { id: "s1", title: "Weddings",                 desc: "Bouquets, buttonholes, arches and venue flowers — planned with you for your perfect day." },
    { id: "s2", title: "Funerals & Tributes",      desc: "Thoughtful, dignified tributes and sympathy flowers, arranged with care and delivered on time." },
    { id: "s3", title: "Occasions & Celebrations", desc: "Birthdays, anniversaries, new baby or \"just because\" — hand-tied bouquets to make someone smile." },
    { id: "s4", title: "Corporate & Events",       desc: "Regular displays, event flowers and seasonal arrangements for local businesses." }
  ],
  occasions: [
    { id: "o1", icon: "💍", name: "Weddings" },
    { id: "o2", icon: "🕊️", name: "Funerals" },
    { id: "o3", icon: "❤️", name: "Valentine's" },
    { id: "o4", icon: "💐", name: "Mother's Day" },
    { id: "o5", icon: "🥂", name: "Anniversaries" }
  ],
  gallery: [
    { id: "gal1", caption: "Hand-tied bouquets", img: "images/g1.jpg" },
    { id: "gal2", caption: "Seasonal blooms",    img: "images/g2.jpg" },
    { id: "gal3", caption: "Bright & cheerful",  img: "images/g3.jpg" },
    { id: "gal4", caption: "Wedding flowers",    img: "images/g4.jpg" },
    { id: "gal5", caption: "Sympathy tributes",  img: "images/g5.jpg" },
    { id: "gal6", caption: "Beautiful bouquets", img: "images/g6.jpg" }
  ],
  boxes: [
    { id: "b1", title: "Hand-tied Bouquet",  desc: "A beautiful seasonal mix, hand-tied and beautifully wrapped.",     price: "from £25", tag: "seasonal", img: "images/g1.jpg" },
    { id: "b2", title: "Luxury Bouquet",     desc: "A generous, statement arrangement of premium blooms.",             price: "from £45", tag: "deluxe",   img: "images/g4.jpg" },
    { id: "b3", title: "A Dozen Roses",      desc: "Classic and romantic — a dozen fresh roses, beautifully tied.",    price: "from £35", tag: "roses",    img: "images/g6.jpg" },
    { id: "b4", title: "Seasonal Blooms",    desc: "Whatever's freshest that week, arranged with a keen eye.",         price: "from £30", tag: "seasonal", img: "images/g2.jpg" },
    { id: "b5", title: "Sympathy Tribute",   desc: "Dignified funeral tributes and sympathy flowers, made with care.", price: "from £40", tag: "tribute",  img: "images/g5.jpg" },
    { id: "b6", title: "Bright & Cheerful",  desc: "A vibrant, happy bunch to brighten anyone's day.",                 price: "from £28", tag: "bouquet",  img: "images/g3.jpg" }
  ],
  contact: {
    name: "Louise's Florist",
    address: "53 High Street, Hoddesdon, EN11 8TQ",
    phone: "01992479794",
    whatsapp: "447930318018",
    email: "hello@louisesflorist.co.uk",
    facebook: "https://www.facebook.com/Louisesfloristhoddesdon/",
    hours: [
      { day: "Mon – Fri", time: "9:00 – 5:00" },
      { day: "Saturday",  time: "9:00 – 4:00" },
      { day: "Sunday",    time: "Closed" }
    ]
  },
  social: [
    { id: "facebook",  name: "Facebook",  url: "https://www.facebook.com/Louisesfloristhoddesdon/", enabled: true },
    { id: "instagram", name: "Instagram", url: "", enabled: false },
    { id: "tiktok",    name: "TikTok",    url: "", enabled: false },
    { id: "pinterest", name: "Pinterest", url: "", enabled: false },
    { id: "youtube",   name: "YouTube",   url: "", enabled: false },
    { id: "x",         name: "X (Twitter)", url: "", enabled: false },
    { id: "whatsapp",  name: "WhatsApp",  url: "", enabled: false },
    { id: "linkedin",  name: "LinkedIn",  url: "", enabled: false }
  ],
  maintenance: false
};

const Content = mongoose.model("Content", new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  data: { type: mongoose.Schema.Types.Mixed },
  updatedAt: Date
}, { versionKey: false, minimize: false }));

// Merge stored content over the defaults so new fields always have a value
// (and older/partial documents migrate cleanly).
function mergeContent(def, s) {
  s = s || {};
  return {
    hero: { ...def.hero, ...(s.hero || {}) },
    services: (Array.isArray(s.services) && s.services.length) ? s.services : def.services,
    occasions: (Array.isArray(s.occasions) && s.occasions.length) ? s.occasions : def.occasions,
    gallery: (Array.isArray(s.gallery) && s.gallery.length) ? s.gallery : def.gallery,
    boxes: (Array.isArray(s.boxes) && s.boxes.length) ? s.boxes : def.boxes,
    contact: { ...def.contact, ...(s.contact || {}),
      hours: (s.contact && Array.isArray(s.contact.hours) && s.contact.hours.length) ? s.contact.hours : def.contact.hours },
    // keep the full default platform list; overlay stored url/enabled by id
    social: def.social.map((p) => {
      const st = (Array.isArray(s.social) ? s.social : []).find((x) => x && x.id === p.id) || {};
      return { ...p, url: typeof st.url === "string" ? st.url : p.url, enabled: typeof st.enabled === "boolean" ? st.enabled : p.enabled };
    }),
    maintenance: typeof s.maintenance === "boolean" ? s.maintenance : def.maintenance
  };
}

let content = DEFAULT_CONTENT;   // in-memory cache
let dbReady = false;

async function initContent() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.warn("MONGODB_URI not set — using default content (admin edits won't persist)"); return; }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    dbReady = true;
    const doc = await Content.findById("singleton").lean();
    const stored = doc ? (doc.data || doc) : {};   // migrate old top-level docs
    content = mergeContent(DEFAULT_CONTENT, stored);
    await Content.findByIdAndUpdate("singleton", { data: content, updatedAt: new Date() }, { upsert: true });
    console.log("Content loaded from MongoDB");
  } catch (err) {
    console.error("Mongo connect/load failed — using default content:", err.message);
  }
}

/* ---- Admin auth: HMAC-signed cookie + TOTP 2FA (no extra deps) ---- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const AUTH_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
const ADMIN_COOKIE = "lf_admin";
authenticator.options = { window: 1 };
const TOTP_SECRET = (process.env.TOTP_SECRET || "").trim();
const TOTP_ENABLED = TOTP_SECRET.length >= 16;

// Cloudinary — durable image hosting for admin photo uploads.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});
const cloudinaryReady = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// MailerSend — the enquiry form emails the shop via MailerSend's HTTP API, so
// Render's SMTP port blocks don't matter. Configure with env vars below.
const MAILERSEND_API_KEY = (process.env.MAILERSEND_API_KEY || "").trim();
const ENQUIRY_TO = (process.env.ENQUIRY_TO || "").trim();          // where enquiries land (Louise's inbox)
const ENQUIRY_FROM = (process.env.ENQUIRY_FROM || "").trim();      // a verified MailerSend sender address
const ENQUIRY_FROM_NAME = (process.env.ENQUIRY_FROM_NAME || "Website enquiry").trim();
const mailReady = Boolean(MAILERSEND_API_KEY && ENQUIRY_TO && ENQUIRY_FROM);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function signToken(exp) {
  const p = `admin.${exp}`;
  return `${p}.${crypto.createHmac("sha256", AUTH_SECRET).update(p).digest("hex")}`;
}
function verifyToken(tok) {
  if (!tok || !AUTH_SECRET) return false;
  const parts = String(tok).split(".");
  if (parts.length !== 3) return false;
  const [role, exp, sig] = parts;
  const expect = crypto.createHmac("sha256", AUTH_SECRET).update(`${role}.${exp}`).digest("hex");
  if (!safeEqual(sig, expect)) return false;
  if (!(Number(exp) > Date.now())) return false;
  return role === "admin";
}
function getCookie(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function isAdmin(req) { return verifyToken(getCookie(req, ADMIN_COOKIE)); }
function requireAuth(req, res, next) { return isAdmin(req) ? next() : res.status(401).json({ error: "unauthorized" }); }

/* ===================== PUBLIC API ===================== */
app.get("/api/content", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ hero: content.hero, services: content.services, occasions: content.occasions, gallery: content.gallery, boxes: content.boxes, contact: content.contact, social: (content.social || []).filter((p) => p.enabled && p.url) });
});
app.get("/api/login-config", (req, res) => res.json({ totp: TOTP_ENABLED }));
app.get("/api/me", (req, res) => res.json({ admin: isAdmin(req) }));  // for inline editing on the live site
app.get("/healthz", (req, res) => res.json({ ok: true }));

// Enquiry/contact form -> emails the shop via MailerSend.
const enquiryLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, validate: false, message: { error: "Too many enquiries — please try again shortly, or call the shop." } });
app.post("/api/enquiry", enquiryLimiter, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true });   // honeypot: bots fill this hidden field — silently accept
  const clean = (s, max) => String(s == null ? "" : s).trim().slice(0, max);
  const name = clean(b.name, 100), phone = clean(b.phone, 40), email = clean(b.email, 120),
        occasion = clean(b.occasion, 60), date = clean(b.date, 40), message = clean(b.message, 2000);
  if (!name || (!phone && !email)) return res.status(400).json({ error: "Please add your name and a phone number or email." });
  if (!mailReady) return res.status(503).json({ error: "The enquiry form isn't set up yet — please call the shop." });

  const rows = [
    ["Name", name], ["Phone", phone || "—"], ["Email", email || "—"],
    ["Occasion", occasion || "—"], ["Date needed", date || "—"]
  ];
  const text = "New enquiry from the website:\n\n" + rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nMessage:\n${message || "—"}`;
  const html = "<h2>New enquiry from the website</h2>" +
    "<table>" + rows.map(([k, v]) => `<tr><td><b>${escapeHtml(k)}:</b></td><td>${escapeHtml(v)}</td></tr>`).join("") + "</table>" +
    `<p><b>Message:</b><br>${escapeHtml(message || "—").replace(/\n/g, "<br>")}</p>`;

  const payload = {
    from: { email: ENQUIRY_FROM, name: ENQUIRY_FROM_NAME },
    to: [{ email: ENQUIRY_TO }],
    subject: `New enquiry from ${name}${occasion ? " — " + occasion : ""}`,
    text, html
  };
  if (email && /.+@.+\..+/.test(email)) payload.reply_to = { email, name };   // so Louise can just hit Reply

  try {
    const r = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: { Authorization: `Bearer ${MAILERSEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (r.ok || r.status === 202) return res.json({ ok: true });
    console.error("MailerSend error", r.status, await r.text().catch(() => ""));
    return res.status(502).json({ error: "Couldn't send right now — please call the shop." });
  } catch (err) {
    console.error("MailerSend request failed:", err.message);
    return res.status(502).json({ error: "Couldn't send right now — please call the shop." });
  }
});

/* ===================== AUTH ===================== */
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, validate: false, message: { error: "Too many attempts — please wait a few minutes." } });

app.post("/api/login", loginLimiter, (req, res) => {
  if (!ADMIN_PASSWORD || !AUTH_SECRET) return res.status(503).json({ error: "Admin not configured" });
  const { password, totp, trust } = req.body || {};
  if (!password || !safeEqual(password, ADMIN_PASSWORD)) return res.status(401).json({ error: "Invalid password" });
  if (TOTP_ENABLED) {
    const code = String(totp || "").replace(/\s+/g, "");
    let ok = false;
    try { ok = code.length === 6 && authenticator.check(code, TOTP_SECRET); } catch (_) { ok = false; }
    if (!ok) return res.status(401).json({ error: "Invalid authenticator code", totp: true });
  }
  const ttl = trust ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000; // 30 days if trusted, else 8h
  res.cookie(ADMIN_COOKIE, signToken(Date.now() + ttl), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: ttl });
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => { res.clearCookie(ADMIN_COOKIE); res.json({ ok: true }); });

app.get("/api/admin/totp-qr", requireAuth, async (req, res) => {
  if (!TOTP_ENABLED) return res.json({ enabled: false });
  const uri = authenticator.keyuri("admin", "LouisesFlorist", TOTP_SECRET);
  res.json({ enabled: true, qr: await QRCode.toDataURL(uri).catch(() => null) });
});

/* ===================== ADMIN API ===================== */
app.get("/api/admin/content", requireAuth, (req, res) => res.json({ ...content }));

app.post("/api/admin/content", requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: "Database not connected — changes can't be saved" });
  try {
    const body = req.body || {};
    const clean = (s, max) => String(s == null ? "" : s).trim().slice(0, max);
    const pick = (obj, cur, field, max, xform) => {
      if (!obj || obj[field] === undefined) return cur;
      const v = clean(obj[field], max);
      return xform ? xform(v) : v;
    };

    const hb = body.hero || {};
    const hero = {
      eyebrow: pick(hb, content.hero.eyebrow, "eyebrow", 80),
      heading: pick(hb, content.hero.heading, "heading", 120),
      lede:    pick(hb, content.hero.lede, "lede", 400),
      img:     pick(hb, content.hero.img, "img", 300)
    };
    const services = content.services.map((s) => {
      const inp = (body.services || []).find((x) => x && x.id === s.id);
      return { ...s, title: pick(inp, s.title, "title", 60), desc: pick(inp, s.desc, "desc", 240) };
    });
    const occasions = content.occasions.map((o) => {
      const inp = (body.occasions || []).find((x) => x && x.id === o.id);
      return { ...o, name: pick(inp, o.name, "name", 40), icon: pick(inp, o.icon, "icon", 12) };
    });
    const gallery = content.gallery.map((g) => {
      const inp = (body.gallery || []).find((x) => x && x.id === g.id);
      return { ...g, caption: pick(inp, g.caption, "caption", 60), img: pick(inp, g.img, "img", 300) };
    });
    const boxes = content.boxes.map((b) => {
      const inp = (body.boxes || []).find((x) => x && x.id === b.id);
      return { ...b,
        title: pick(inp, b.title, "title", 80),
        desc:  pick(inp, b.desc, "desc", 240),
        price: pick(inp, b.price, "price", 40),
        tag:   pick(inp, b.tag, "tag", 30),
        img:   pick(inp, b.img, "img", 300) };
    });
    const cb = body.contact || {};
    const contactNew = {
      name:     pick(cb, content.contact.name, "name", 80),
      address:  pick(cb, content.contact.address, "address", 160),
      phone:    pick(cb, content.contact.phone, "phone", 30),
      whatsapp: pick(cb, content.contact.whatsapp, "whatsapp", 20, (v) => v.replace(/[^\d]/g, "")),
      email:    pick(cb, content.contact.email, "email", 120),
      facebook: pick(cb, content.contact.facebook, "facebook", 200),
      hours: Array.isArray(cb.hours)
        ? cb.hours.slice(0, 7).map((h) => ({ day: clean(h && h.day, 30), time: clean(h && h.time, 30) }))
        : content.contact.hours
    };
    const social = (content.social || []).map((p) => {
      const inp = (body.social || []).find((x) => x && x.id === p.id);
      if (!inp) return p;
      return { ...p,
        url:     inp.url === undefined ? p.url : clean(inp.url, 300),
        enabled: inp.enabled === undefined ? p.enabled : !!inp.enabled };
    });
    const maintenance = body.maintenance === undefined ? content.maintenance : !!body.maintenance;

    const next = { hero, services, occasions, gallery, boxes, contact: contactNew, social, maintenance };
    await Content.findByIdAndUpdate("singleton", { data: next, updatedAt: new Date() }, { upsert: true });
    content = next;
    res.json({ ok: true, ...next });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: upload a photo to Cloudinary; returns the hosted URL to store in content.
app.post("/api/admin/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!cloudinaryReady) return res.status(503).json({ error: "Image uploads aren't configured yet" });
  if (!req.file) return res.status(400).json({ error: "No file received" });
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "louises-florist", resource_type: "image",
          transformation: [{ width: 1400, height: 1400, crop: "limit" }, { quality: "auto", fetch_format: "auto" }] },
        (err, r) => (err ? reject(err) : resolve(r))
      );
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list previously-uploaded photos (the reusable library).
app.get("/api/admin/media", requireAuth, async (req, res) => {
  if (!cloudinaryReady) return res.status(503).json({ error: "Image uploads aren't configured yet" });
  try {
    const result = await cloudinary.api.resources({ type: "upload", prefix: "louises-florist/", max_results: 200 });
    const images = (result.resources || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((r) => ({ url: r.secure_url, id: r.public_id }));
    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete a photo from the Cloudinary library.
app.post("/api/admin/media/delete", requireAuth, async (req, res) => {
  if (!cloudinaryReady) return res.status(503).json({ error: "Image uploads aren't configured yet" });
  const id = (req.body && req.body.id) || "";
  if (!id || id.indexOf("louises-florist/") !== 0) return res.status(400).json({ error: "Invalid image" });
  try {
    const r = await cloudinary.uploader.destroy(id);
    res.json({ ok: r.result === "ok" || r.result === "not found", result: r.result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===================== ADMIN PAGE ===================== */
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "views", isAdmin(req) ? "admin.html" : "login.html"));
});

/* ===================== MAINTENANCE GATE ===================== */
// When maintenance is on, visitors get a 503 "back soon" page; the admin (valid
// cookie) still sees the real site. /admin + /api are handled above, so login
// and toggling-off always work.
app.use((req, res, next) => {
  if (!content.maintenance || isAdmin(req)) return next();
  // let the holding page image + the admin/login logo through the gate
  if (req.path === "/images/wonderful_01.jpg" || req.path === "/images/louises-florist-logo-badge.png") return next();
  res.status(503).sendFile(path.join(__dirname, "views", "maintenance.html"));
});

/* ===================== STATIC SITE ===================== */
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
initContent().finally(() => app.listen(PORT, () => console.log(`Louise's Florist running on ${PORT}`)));
