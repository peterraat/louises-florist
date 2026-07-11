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
  boxes: [
    { id: "b1", title: "Hand-tied Bouquet",  desc: "A beautiful seasonal mix, hand-tied and beautifully wrapped.",     price: "from £25", tag: "seasonal", img: "images/g1.jpg" },
    { id: "b2", title: "Luxury Bouquet",     desc: "A generous, statement arrangement of premium blooms.",             price: "from £45", tag: "deluxe",   img: "images/g4.jpg" },
    { id: "b3", title: "A Dozen Roses",      desc: "Classic and romantic — a dozen fresh roses, beautifully tied.",    price: "from £35", tag: "roses",    img: "images/g6.jpg" },
    { id: "b4", title: "Seasonal Blooms",    desc: "Whatever's freshest that week, arranged with a keen eye.",         price: "from £30", tag: "seasonal", img: "images/g2.jpg" },
    { id: "b5", title: "Sympathy Tribute",   desc: "Dignified funeral tributes and sympathy flowers, made with care.", price: "from £40", tag: "tribute",  img: "images/g5.jpg" },
    { id: "b6", title: "Bright & Cheerful",  desc: "A vibrant, happy bunch to brighten anyone's day.",                 price: "from £28", tag: "bouquet",  img: "images/g3.jpg" }
  ],
  maintenance: false
};

const Content = mongoose.model("Content", new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  boxes: [{ _id: false, id: String, title: String, desc: String, price: String, tag: String, img: String }],
  maintenance: Boolean,
  updatedAt: Date
}, { versionKey: false }));

let content = DEFAULT_CONTENT;   // in-memory cache
let dbReady = false;

async function initContent() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.warn("MONGODB_URI not set — using default content (admin edits won't persist)"); return; }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    dbReady = true;
    let doc = await Content.findById("singleton").lean();
    if (!doc) {
      await Content.create({ _id: "singleton", ...DEFAULT_CONTENT, updatedAt: new Date() });
      doc = await Content.findById("singleton").lean();
    }
    content = { boxes: doc.boxes, maintenance: !!doc.maintenance };
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
  res.json({ boxes: content.boxes });
});
app.get("/api/login-config", (req, res) => res.json({ totp: TOTP_ENABLED }));
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
app.get("/api/admin/content", requireAuth, (req, res) => res.json({ boxes: content.boxes, maintenance: content.maintenance }));

app.post("/api/admin/content", requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: "Database not connected — changes can't be saved" });
  try {
    const body = req.body || {};
    const clean = (s, max) => String(s == null ? "" : s).trim().slice(0, max);
    const boxes = content.boxes.map((b) => {
      const inp = (body.boxes || []).find((x) => x && x.id === b.id) || {};
      return {
        ...b,
        title: inp.title !== undefined ? clean(inp.title, 80) : b.title,
        desc:  inp.desc  !== undefined ? clean(inp.desc, 240) : b.desc,
        price: inp.price !== undefined ? clean(inp.price, 40) : b.price,
        tag:   inp.tag   !== undefined ? clean(inp.tag, 30)  : b.tag
      };
    });
    const maintenance = body.maintenance === undefined ? content.maintenance : !!body.maintenance;
    await Content.findByIdAndUpdate("singleton", { boxes, maintenance, updatedAt: new Date() }, { upsert: true });
    content = { boxes, maintenance };
    res.json({ ok: true, boxes, maintenance });
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
  res.status(503).sendFile(path.join(__dirname, "views", "maintenance.html"));
});

/* ===================== STATIC SITE ===================== */
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
initContent().finally(() => app.listen(PORT, () => console.log(`Louise's Florist running on ${PORT}`)));
