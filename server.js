import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

import express from "express";
import mongoose from "mongoose";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";

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
    lede: "Fresh, hand-tied arrangements for every occasion — from weddings and celebrations to funeral tributes — crafted by Louise with over 40 years' experience, right in the heart of Hoddesdon."
  },
  services: [
    { id: "s1", title: "Weddings",                 desc: "Bouquets, buttonholes, arches and venue flowers — planned with you for your perfect day." },
    { id: "s2", title: "Funerals & Tributes",      desc: "Thoughtful, dignified tributes and sympathy flowers, arranged with care and delivered on time." },
    { id: "s3", title: "Occasions & Celebrations", desc: "Birthdays, anniversaries, new baby or \"just because\" — hand-tied bouquets to make someone smile." },
    { id: "s4", title: "Corporate & Events",       desc: "Regular displays, event flowers and seasonal arrangements for local businesses." }
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
    gallery: (Array.isArray(s.gallery) && s.gallery.length) ? s.gallery : def.gallery,
    boxes: (Array.isArray(s.boxes) && s.boxes.length) ? s.boxes : def.boxes,
    contact: { ...def.contact, ...(s.contact || {}),
      hours: (s.contact && Array.isArray(s.contact.hours) && s.contact.hours.length) ? s.contact.hours : def.contact.hours },
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
  res.json({ hero: content.hero, services: content.services, gallery: content.gallery, boxes: content.boxes, contact: content.contact });
});
app.get("/api/login-config", (req, res) => res.json({ totp: TOTP_ENABLED }));
app.get("/api/me", (req, res) => res.json({ admin: isAdmin(req) }));  // for inline editing on the live site
app.get("/healthz", (req, res) => res.json({ ok: true }));

/* ===================== AUTH ===================== */
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, validate: false, message: { error: "Too many attempts — please wait a few minutes." } });

app.post("/api/login", loginLimiter, (req, res) => {
  if (!ADMIN_PASSWORD || !AUTH_SECRET) return res.status(503).json({ error: "Admin not configured" });
  const { password, totp } = req.body || {};
  if (!password || !safeEqual(password, ADMIN_PASSWORD)) return res.status(401).json({ error: "Invalid password" });
  if (TOTP_ENABLED) {
    const code = String(totp || "").replace(/\s+/g, "");
    let ok = false;
    try { ok = code.length === 6 && authenticator.check(code, TOTP_SECRET); } catch (_) { ok = false; }
    if (!ok) return res.status(401).json({ error: "Invalid authenticator code", totp: true });
  }
  res.cookie(ADMIN_COOKIE, signToken(Date.now() + 8 * 60 * 60 * 1000), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 8 * 60 * 60 * 1000 });
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
      lede:    pick(hb, content.hero.lede, "lede", 400)
    };
    const services = content.services.map((s) => {
      const inp = (body.services || []).find((x) => x && x.id === s.id);
      return { ...s, title: pick(inp, s.title, "title", 60), desc: pick(inp, s.desc, "desc", 240) };
    });
    const gallery = content.gallery.map((g) => {
      const inp = (body.gallery || []).find((x) => x && x.id === g.id);
      return { ...g, caption: pick(inp, g.caption, "caption", 60) };
    });
    const boxes = content.boxes.map((b) => {
      const inp = (body.boxes || []).find((x) => x && x.id === b.id);
      return { ...b,
        title: pick(inp, b.title, "title", 80),
        desc:  pick(inp, b.desc, "desc", 240),
        price: pick(inp, b.price, "price", 40),
        tag:   pick(inp, b.tag, "tag", 30) };
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
    const maintenance = body.maintenance === undefined ? content.maintenance : !!body.maintenance;

    const next = { hero, services, gallery, boxes, contact: contactNew, maintenance };
    await Content.findByIdAndUpdate("singleton", { data: next, updatedAt: new Date() }, { upsert: true });
    content = next;
    res.json({ ok: true, ...next });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
