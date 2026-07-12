# Reusing this as a template for a new site

This repo is the blueprint for a self-service brochure+CMS site (florist, gift shop,
café, barber…). A new site is a **rebrand**, not a rebuild. Here's the full checklist.

## 1. Create the new site from this template
- On GitHub: **Use this template → Create a new repository** (e.g. `daisy-gift-shop`).
- Clone it locally.

## 2. Change the identity (the ~6 things that differ per site)
| What | Where |
|---|---|
| **Brand name, tagline, SEO** | `site.config.js` |
| **Cloudinary folder** (keep unique per site) | `site.config.js` → `cloudinaryFolder` |
| **Theme colours** | `public/index.html` → the `🎨 THEME` block at the top of `<style>` (mirror the values into `site.config.js` `theme`) |
| **Logo / badge images** | `public/images/…-logo-badge.png` (+ favicon references) |
| **Default text & sections** | `server.js` → `DEFAULT_CONTENT` (hero, services, occasions, gallery, boxes, contact) |
| **Page `<title>` / meta** | `public/index.html` `<head>` |
| **Holding page image** | `public/images/wonderful_01.jpg` + `views/maintenance.html` |

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
