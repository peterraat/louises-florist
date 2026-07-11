# Handoff — Louise's Florist

Working notes (kept in git → auto-pushed to GitHub so nothing is lost).
Repo: `github.com/peterraat/louises-florist` · Host: **GitHub Pages** (free, static).
Live: `https://peterraat.github.io/louises-florist/`

_Last updated: 2026-07-11_

## What this is
- **Single static page** (index.html + images) for Louise's Florist, 53 High Street,
  Hoddesdon EN11 8TQ · ☎ 01992 479794 · hello@louisesflorist.co.uk · FB /Louisesfloristhoddesdon.
- Static site → GitHub Pages is the correct free host (no backend needed).
- Sections: hero, services, occasions, gallery, shop, reviews, order form, contact.

## To finish (today)
1. **Order/enquiry form doesn't send.** `sendEnquiry()` only shows a "thank you" —
   nothing is delivered. Wire to a free no-backend form service (**Formspree** or
   **Web3Forms**) so submissions email Louise. (Static site = no server, so a form
   service is the right approach.)
2. **Demo pricing.** Shop cards show sample prices + the note "Sample prices shown for
   the demo — Louise sets the real prices." Replace with real prices (or a "from £X"
   range) and remove the demo disclaimer.
3. **Images.** Hero + some cards have placeholder fallbacks (loremflickr). Confirm all
   using Louise's real photos.
4. **Custom domain.** Peter is buying the domain → point it at GitHub Pages
   (add a `CNAME` file + DNS records), and enable HTTPS.
5. Optional polish: SEO meta/OG, a Google Map embed, real Google reviews link.

## Notes
- Phone/address/FB are real. Reviews shown are real quotes (4.3★, Facebook).
- No secrets involved (static site) — safe on GitHub Pages.
