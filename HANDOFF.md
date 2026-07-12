# Handoff / Worklog — Louise's Florist

Working notes, kept in git so they auto-push to GitHub and nothing is lost if VS Code crashes.

Repo: `github.com/peterraat/louises-florist`
Host: **Render** (Node web service, Starter tier ≈ $7/mo, always-on)
Data: **MongoDB Atlas** (free tier) · Images: **Cloudinary** (free tier)

_Last updated: 2026-07-12_

---

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

- Editable **occasions** ("the moment") with an **inline emoji icon picker** (~52 florist emojis).
- **Anchor scroll fix** — "Order flowers" and nav links no longer land a section under the sticky
  header (added `scroll-margin-top`).
- **Gallery photo-click bug fixed** — the gallery tiles have a gradient overlay (`.tile::after`)
  that sits *above* the image, so clicks were landing on the tile container, not the
  `[data-editimg]` photo, and the change-photo dialog never opened (worked on the shop cards below
  because those have no overlay). `onClick` now falls back to finding the `[data-editimg]` image
  inside the nearest `.tile`/`.shop-img`/`.hero` container.

## Still to do

1. **Social media buttons** — admin backend gets a per-platform toggle (checkbox) for all the
   popular platforms; the storefront shows a social bar at the bottom **only if at least one is
   toggled on** (no toggles on = no social section at all). *(not started)*
2. **Add occasions to the admin panel** — they're currently editable inline on the live site only;
   mirror them in `views/admin.html` too.
3. **Mobile responsiveness sweep** of the storefront.
4. Real prices/photos confirmed with Louise; wire the order/enquiry form to actually send.
5. Optional: custom domain → point DNS at Render + HTTPS.
