# Handoff / Worklog — Louise's Florist

Working notes, kept in git so they auto-push to GitHub (and mirror to GitLab) — nothing is lost if
VS Code crashes or Peter moves to a new PC.

Repo: `github.com/peterraat/louises-florist` · Owner email: peter.raat@gmail.com
Host: **Render** (Node web service, Starter tier ≈ $7/mo, always-on)
Data: **MongoDB Atlas** (free tier) · Images: **Cloudinary** (free tier) · Email: **MailerSend**

**Live site:** https://louises-florist.onrender.com · **Admin:** /admin
**Staging (private workshop):** https://louises-florist-staging.onrender.com

_Last updated: 2026-07-13_

---

## ▶️ How to resume (new PC / after a crash)

1. Install VS Code + Claude Code CLI; open a terminal, run `claude`.
2. `git clone https://github.com/peterraat/louises-florist` and open it.
3. Tell Claude: *"Read HANDOFF.md and continue."* This file is the full state.
4. **Active work is on the `staging` branch** (`git checkout staging`). Finished features that
   aren't live yet sit there until "promoted". See **Current position** at the bottom.

Workflow reminder: we build on `staging` → review at the staging URL → **promote** (merge
`staging → main`) → Render auto-deploys `main` to the live site. Louise edits her own *content*
live via the admin (that never needs staging).

## What this is now

Louise's Florist started as a single static brochure page. It is now a **full self-service
CMS**: an Express app that serves the storefront and lets Peter **and his (non-technical) wife**
edit almost everything — prices, titles, descriptions, photos, opening hours, and a
maintenance/"back soon" holding page — with no code and no redeploys. Content lives in MongoDB;
photos live in Cloudinary.

Shop: 53 High Street, Hoddesdon EN11 8TQ · ☎ 01992 479794 · hello@louisesflorist.co.uk ·
FB /Louisesfloristhoddesdon.

## Architecture

- **`server.js`** — Express. Serves `public/` (the storefront) and `views/` (admin + login +
  maintenance). All content is one flexible MongoDB doc: `{ _id:"singleton", data:{...}, updatedAt }`.
  Kept in an in-memory `content` cache; `mergeContent()` migrates old docs into the current shape
  on boot so new fields appear without wiping existing edits.
- **Auth** — HMAC-signed httpOnly cookie (Node `crypto`, no JWT library). Password + optional
  **TOTP 2FA** (otplib@12). Login is rate-limited (express-rate-limit). "Trust this browser" on
  login → 30-day session instead of the 8-hour default.
- **Photos** — Cloudinary v2. Uploads go through multer (memory) → `upload_stream` into the
  `louises-florist` folder. A **photo library** (`cloudinary.api.resources`) lets you re-use past
  uploads (e.g. the same Valentine's shots each year) and **delete** old ones (folder-scoped so you
  can only touch this site's images).
- **Editing model** — the admin panel (`/admin`) mirrors the live page top-to-bottom. The live
  site itself is **inline click-to-edit** when logged in: click highlighted text to edit it, click a
  photo (dashed outline) to swap it, click an occasion emoji to pick a new icon. Saves POST a
  *minimal* payload to `/api/admin/content`; the server's `pick()` preserves every field you didn't
  touch, so partial edits are safe.

## Content shape (DEFAULT_CONTENT in server.js)

- `hero` {eyebrow, heading, lede, img}
- `services[4]` {id, title, desc}
- `occasions[5]` {id, icon (emoji), name}
- `gallery[6]` {id, caption, img}
- `boxes[6]` {id, title, desc, price, tag, img}   ← the shop cards
- `contact` {name, address, phone, whatsapp, email, facebook, hours[]}
- `social[8]` {id, name, url, enabled} — footer buttons; only enabled+url ones show
- `maintenance` (bool) — holding page toggle

## Key files

| File | Role |
|---|---|
| `server.js` | Express app, Mongo model, all API routes, auth, Cloudinary, maintenance middleware |
| `public/index.html` | Storefront; `loadContent()` fetches `/api/content` and tags editable text/images |
| `public/js/inline-edit.js` | Inline editor (text, image swap, emoji icon picker) — only active for admins |
| `views/admin.html` | Full CMS editor, laid out to mirror the live page; maintenance toggle + photo library |
| `views/login.html` | Teal/badge-branded sign-in, TOTP field, "Trust this browser" checkbox |
| `views/maintenance.html` | The "back soon" holding page — just the `wonderful_01.jpg` image, nothing else |

## Important API routes

- `GET /api/content` — public content for the storefront
- `GET /api/me` — `{admin:boolean}` so the live site can turn on edit mode
- `POST /api/login` — password (+TOTP); accepts `trust` for the 30-day session
- `GET/POST /api/admin/content` — read / partial-save (uses `pick()` to preserve untouched fields)
- `POST /api/admin/upload` — multer → Cloudinary
- `GET /api/admin/media` — list the photo library
- `POST /api/admin/media/delete` — delete a library image (rejected unless it's in `louises-florist/`)
- Maintenance middleware serves the holding page to visitors when `maintenance` is on, but exempts
  the holding image and the logo badge.

## Database: one database per site + daily content backup

- Louise's content lives in its **own** MongoDB database named **`louisesflorist`** (the
  `MONGODB_URI` path ends in `/louisesflorist`). It was originally sharing the `dividend-sniper`
  database — migrated out on 2026-07-12 so each site has its own database. **Rule for every new
  site: give it its own database name in the connection string** (Mongo auto-creates it on first
  write); never share one database between sites.
- All sites currently share **one free Atlas M0 cluster** (512 MB total, no built-in backups).
  Many small databases fit fine; watch the 512 MB ceiling as sites are added.
- **Daily backup** (`.github/workflows/backup.yml` + `scripts/backup-db.mjs`): once a day it dumps
  every collection to `backups/<db>/<collection>.json`, commits it (git history = restore points),
  and pushes the snapshot to GitLab too. Free. Needs `MONGODB_URI` + `GITLAB_TOKEN` secrets.
  Collections over 90 MB are skipped (git can't hold big data — that needs a different strategy).
- **Restore**: `MONGODB_URI="…" CONFIRM_RESTORE=yes node scripts/restore-db.mjs` (to roll back to an
  older day, first `git checkout <commit> -- backups/` then run it).

## Automatic GitHub → GitLab backup (mirror)

Every push to GitHub auto-copies the whole repo to a **GitLab** backup, via
`.github/workflows/mirror.yml`. This is free (GitHub Actions + GitLab free tier).

- Backup repo: `https://gitlab.com/lifeswonderful/louises-florist-backup` (private)
- Auth: a GitLab **personal access token** (`write_repository` scope, ~1yr expiry, named
  `github-mirror`) stored as a GitHub Actions secret named **`GITLAB_TOKEN`**.
- ⚠️ The GitLab token expires **2027-07-12** — regenerate it before then and update the
  `GITLAB_TOKEN` secret, or backups silently stop.
- One-time gotcha (already fixed): GitLab protects `main` against force-push by default, which
  blocked the mirror. Fixed by turning **Settings → Repository → Protected branches → main →
  "Allowed to force push"** ON.

### To add this backup to a NEW client site (reusable pattern)
1. Create an empty (no README) private GitLab repo for the site.
2. Turn on "Allowed to force push" for its `main` branch (Settings → Repository → Protected branches).
3. Copy `.github/workflows/mirror.yml` into the new repo; change the GitLab URL to the new repo.
4. Add the same `GITLAB_TOKEN` secret to the new GitHub repo (the one token works for all your
   repos since it's a legacy/all-projects token). Push — it mirrors automatically.

## Environment variables (set on Render, see `.env.example`)

`MONGODB_URI` · `ADMIN_PASSWORD` · `JWT_SECRET` (cookie signing) · `TOTP_SECRET` ·
`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`.
Cloudinary is only enabled when all three Cloudinary vars are present.

## Gotchas we already hit (don't re-learn these)

- **Atlas Network Access** must allow `0.0.0.0/0` — Render uses dynamic IPs. Without it Mongo shows
  "Database not connected". Changing it needs a service restart/redeploy to reconnect.
- **otplib** — pin to `otplib@12` (`authenticator.check`). The latest major changed the API.
- **Holding image** — the 371KB export looked blurry, so it's a full-res 2814px @ q92 (~1.1MB) file
  at `public/images/wonderful_01.jpg`. Don't "optimise" it back down.
- **Cloudinary via GitHub SSO** inherits GitHub's 2FA — no separate 2FA to set up.
- **Render blocks SMTP 587** — use port 2525 if we ever add email (learned on the scaffolding-caps
  project).

## Done recently (2026-07-11 → 07-12)

- **Social media buttons** — admin section ⑥ has a per-platform toggle + link box for 8 popular
  platforms (Facebook, Instagram, TikTok, Pinterest, YouTube, X, WhatsApp, LinkedIn). The storefront
  footer shows a button only for platforms that are toggled on *and* have a link; if none are on, no
  social row appears at all. Brand SVG icons are inlined in `index.html` (`ICONS` map in `loadContent`).
- Editable **occasions** ("the moment") with an **inline emoji icon picker** (~52 florist emojis).
- **Anchor scroll fix** — "Order flowers" and nav links no longer land a section under the sticky
  header (added `scroll-margin-top`).
- **Gallery photo-click bug fixed** — the gallery tiles have a gradient overlay (`.tile::after`)
  that sits *above* the image, so clicks were landing on the tile container, not the
  `[data-editimg]` photo, and the change-photo dialog never opened (worked on the shop cards below
  because those have no overlay). `onClick` now falls back to finding the `[data-editimg]` image
  inside the nearest `.tile`/`.shop-img`/`.hero` container.

## Enquiry form → email (MailerSend)

The order/enquiry form posts to `POST /api/enquiry`, which emails the shop via **MailerSend's
HTTP API** (not SMTP — avoids Render's port blocks). Honeypot + rate-limited (5 / 10 min). The
customer's email is set as `reply_to` so Louise can just hit Reply.

Needs these env vars on Render (form degrades gracefully to "please call the shop" if unset):
- `MAILERSEND_API_KEY` — MailerSend API token
- `ENQUIRY_TO` — where enquiries land (Louise's inbox / Gmail)
- `ENQUIRY_FROM` — a **verified** MailerSend sender address
- `ENQUIRY_FROM_NAME` — display name (optional)

Reusable across sites — this is part of the template engine.

## Environments & workflow (staging → production)

- **Production**: Render service `louises-florist`, deploys from **`main`**, database `louisesflorist`.
  URL: https://louises-florist.onrender.com
- **Staging**: Render service `louises-florist-staging` (free tier, sleeps when idle), deploys from
  **`staging`**, its own database `louisesflorist-staging` (isolated — testing never touches live
  content). URL: https://louises-florist-staging.onrender.com
- **Promote** = merge `staging → main`; Render redeploys production. Nothing goes live without it.
- Staging Render env vars mirror production except `MONGODB_URI` ends in `louisesflorist-staging`
  and `TOTP_SECRET` is omitted (no 2FA prompt on staging).

## Template / reuse (this repo is the blueprint)

- `site.config.js` — per-site identity (brand, `cloudinaryFolder`, theme palette, SEO). Cloudinary
  folder is now read from here (not hardcoded).
- `TEMPLATE.md` — full "new site = rebrand" checklist. The plan: mark this repo as a GitHub template;
  each new client (gift shop, café…) is a copy + rebrand, inheriting the whole engine + backups.
- The palette lives in a `🎨 THEME` block at the top of `public/index.html`'s `<style>`.

## Business context / decisions (for continuity)

- Goal: Peter is scaling this into a business (many client sites; aspiration ~1000 in 5 yrs).
- **Louise's is a free showpiece** — Peter is not charging her; it's the portfolio flagship.
- Conventions adopted: 3-2-1 backups; one database per site; config in env vars; 2FA; per-site
  GitHub repo + GitLab mirror + daily DB backup. Next conventions to consider: template repo,
  monitoring (UptimeRobot), a password manager, and — the big scaling issue — **hosting economics**
  (1 Render service/site at ~$7/mo doesn't scale to 1000; eventually multi-tenant or cheaper hosting).
- Domain: **on hold** — Peter plans to buy `louisesflorist.co.uk` himself (under his GoDaddy),
  then point web DNS at Render + verify the domain in MailerSend for a branded `ENQUIRY_FROM`.

## Still to do (paused until Peter talks to Louise)

1. **Promote staging → main** — the occasions admin editor + template files (`site.config.js`,
   `TEMPLATE.md`, theme banner) are finished on `staging`, not yet live.
2. **Switch on the contact form** — code is done; add the 4 MailerSend env vars on Render
   (`MAILERSEND_API_KEY`, `ENQUIRY_TO`, `ENQUIRY_FROM`, `ENQUIRY_FROM_NAME`). For now reuse the
   lifeswonderful.com verified sender; upgrade to a branded address once the domain lands. Then test.
3. **Mobile responsiveness sweep** of the storefront (do it on staging, then promote).
4. **Custom domain** (on hold) → point DNS at Render + HTTPS + branded MailerSend sender.
5. Real prices/photos — Louise's to fill in via the admin (not blocking).

## Current position (where we left off — 2026-07-13)

- On branch **`staging`**. Everything is committed & pushed (GitHub + GitLab mirror).
- **Built on staging but NOT promoted to live:** occasions admin editor, `site.config.js`,
  `TEMPLATE.md`, the theme banner, Cloudinary-folder-from-config.
- **Built (on both branches) but NOT switched on:** the MailerSend contact form (needs Render env vars).
- Work is **paused** — Peter is talking to Louise before finishing. Next session: promote the
  staging work, wire the contact form, do the mobile sweep. Then it's launch-ready (domain optional).
