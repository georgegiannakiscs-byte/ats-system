/**
 * Brand configuration — the single source of truth for the product name.
 * The logo artwork lives in src/assets/deceler-logo.png and is rendered by
 * components/shell/brand-mark.tsx.
 */
export const BRAND = {
  name: "Déceler",
  /** ASCII-safe variant used for storage keys and identifiers. */
  slug: "deceler",
  tagline: "Recruiting, with discernment.",
} as const;
