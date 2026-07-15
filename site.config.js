/*
 * SITE IDENTITY — the per-site settings that change when you reuse this template
 * for a new business (a gift shop, a café, etc.). This is the main file to edit,
 * alongside the logo images, the CSS palette, and DEFAULT_CONTENT. See TEMPLATE.md.
 */
export default {
  // Branding
  brand: "Louise's Florist",
  accentWord: "Florist",                    // the word shown in the accent colour
  tagline: "Beautiful flowers, lovingly made.",

  // Photos — this site's images live in this Cloudinary folder (keep it unique per site)
  cloudinaryFolder: "louises-florist",

  // Theme palette — mirror of the CSS variables in public/index.html (kept here as
  // the single source of truth to copy from when rebranding).
  theme: {
    teal:   "#2b8f9b",   // primary / accent
    tealDk: "#1f6f79",   // darker accent (hovers)
    gold:   "#c49a53",   // secondary accent
    cream:  "#f3f8f9",   // light background
    ink:    "#26383c"    // text
  },

  // SEO — rendered into the page <title> and meta description via {{SEO_TITLE}}/{{SEO_DESC}}
  seo: {
    title: "Louise's Florist · Hoddesdon — Beautiful flowers for every occasion",
    description: "Louise's Florist, 53 High Street, Hoddesdon. A family florist with over 40 years' experience — weddings, funerals, occasions & celebrations, with fresh cut flowers daily and local delivery."
  }
};
