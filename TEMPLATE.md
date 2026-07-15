# Reusing this as a template for a new site

This repo is the blueprint for a self-service brochure+CMS site (florist, gift shop,
café, barber…). A new site is a **rebrand**, not a rebuild. Here's the full checklist.

## 1. Create the new site from this template
- On GitHub: **Use this template → Create a new repository** (e.g. `daisy-gift-shop`).
- Clone it locally.

## 2. Change the identity

### Just edit `site.config.js` — this now drives the pages automatically
The server injects these into every page at request time (via `{{TOKENS}}`), so you **don't touch
the HTML** for any of them:
- `brand` — shop name (e.g. "Daisy's Gifts"). Shown in the header, footer, admin, login, copyright.
- `accentWord` — the word shown in the accent colour (the last word of `brand`, e.g. "Gifts").
- `tagline` — short strapline.
- `seo.title` / `seo.description` — the page `<title>` and meta description.
- `cloudinaryFolder` — keep unique per site (where this site's photos live).

### Still manual per site (can't be a text token)
| What | Where |
|---|---|
| **Logo / badge image** | replace `public/images/…-logo-badge.png` (+ the maintenance/holding image) |
| **Theme colours** | `public/index.html` → the `🎨 THEME` block at the top of `<style>` (also mirror into `site.config.js` `theme`) |
| **Default text & sections** | `server.js` → `DEFAULT_CONTENT` (or just edit it live in `/admin` once deployed) |

That's it — brand/title/tagline come from one file; logo + colours + starter content are the only
hands-on bits.

## 3. Give it its own database
- In the `MONGODB_URI`, set the database name to the new site's slug (e.g. `/daisygiftshop`).
  Mongo creates it on first write. **Never share a database between sites.**

## 4. Hosting + infra (per site)
- **Render:** new web service from the repo, branch `main`, start `npm start`.
  *(Optional: a second service on a `staging` branch with a `-staging` database — see the staging setup.)*
- **Env vars on Render:** `MONGODB_URI`, `ADMIN_PASSWORD`, `JWT_SECRET`, `TOTP_SECRET` (optional),
  `CLOUDINARY_*`, and the MailerSend set (`MAILERSEND_API_KEY`, `ENQUIRY_TO`, `ENQUIRY_FROM`,
  `ENQUIRY_FROM_NAME`). See `.env.example`.

## 5. Backups (comes with the template)
- **Code mirror:** already in `.github/workflows/mirror.yml` — point its GitLab URL at the new
  site's GitLab backup repo, add the `GITLAB_TOKEN` secret.
- **Daily DB backup:** already in `.github/workflows/backup.yml` — add the `MONGODB_URI` +
  `GITLAB_TOKEN` secrets. It dumps to `backups/` and mirrors to GitLab automatically.

## What you get for free (the engine — don't touch per site)
Self-service `/admin` editor, inline click-to-edit on the live site, Cloudinary photo uploads +
library, emoji occasion picker, social-media buttons, opening hours, maintenance/"back soon" mode,
HMAC cookie auth + optional TOTP 2FA, the MailerSend enquiry form, and both backups.
