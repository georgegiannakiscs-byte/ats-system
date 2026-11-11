/**
 * Brand configuration — the single source of truth for the product name.
 * The logo artwork lives in src/assets/ulysse-logo.webp and is rendered by
 * components/shell/brand-mark.tsx.
 */
export const BRAND = {
  name: "Ulysse",
  /** ASCII-safe variant used for storage keys and identifiers. */
  slug: "ulysse",
  tagline: "Recruiting, with discernment.",
} as const;
