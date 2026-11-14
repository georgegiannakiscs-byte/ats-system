/*
 * A company's own CSS for its careers pages (Settings → Branding & careers → Custom CSS).
 *
 * Only CSS, never HTML or JavaScript: careers pages are served from the same origin as the
 * workspace, so a company's script could act as any signed-in visitor (including platform admins)
 * or read what candidates type. CSS can't run code, but it can still send data out by loading URLs
 * (e.g. an attribute selector on an input + a background image), so anything that loads a resource
 * is refused as well. Backslash escapes are refused so none of this can be spelled indirectly.
 */

export const CUSTOM_CSS_MAX = 20_000;

const FORBIDDEN: [RegExp, string][] = [
  [/</, "“<” isn't allowed (no HTML or </style>)"],
  [/\\/, "backslash escapes aren't allowed"],
  [/url\s*\(/i, "url(…) isn't allowed: images and fonts from other sites can leak visitors' data"],
  [/@import/i, "@import isn't allowed"],
  [/@font-face/i, "@font-face isn't allowed: use the fonts list above"],
  [/@namespace|@charset/i, "@namespace / @charset aren't allowed"],
  [/image-set\s*\(|(?:^|[^a-z-])image\s*\(|cross-fade\s*\(|element\s*\(|(?:^|[^a-z-])src\s*\(|attr\s*\(/i, "functions that load resources or read attributes aren't allowed"],
  [/expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i, "script-like values aren't allowed"],
];

/** Problems that stop the CSS from being saved (empty list = fine). */
export function customCssProblems(css: string): string[] {
  if (css.length > CUSTOM_CSS_MAX) return [`Keep it under ${CUSTOM_CSS_MAX.toLocaleString("en")} characters`];
  const out: string[] = [];
  for (const [re, msg] of FORBIDDEN) if (re.test(css)) out.push(msg);
  return out;
}

/** The CSS to render, or "" if it isn't a string or fails the checks (defence in depth for stored data). */
export function safeCustomCss(css: unknown): string {
  return typeof css === "string" && css.trim() && customCssProblems(css).length === 0 ? css : "";
}

/** Class names companies can target. Kept stable across releases. */
export const CAREERS_CSS_HOOKS = [
  [".ulysse-careers", "the whole page"],
  [".careers-header / .careers-logo", "top bar and logo"],
  [".careers-main / .careers-footer", "content area and footer"],
  [".careers-hero / .careers-hero-band", "headline area (band = coloured header)"],
  [".careers-accent-line", "the short line above the headline"],
  [".careers-headline / .careers-intro", "page headline and introduction"],
  [".careers-benefits / .careers-benefit", "benefit chips"],
  [".careers-jobs-section / .careers-jobs-title", "open positions block and its title"],
  [".careers-jobs / .careers-job", "job list and each job"],
  [".careers-job-title / .careers-job-meta", "job title and location/type line"],
  [".careers-job-page / .careers-job-details", "job page and its description column"],
  [".careers-job-section / .careers-section-title", "description sections and their titles"],
  [".careers-apply / .careers-form / .careers-button", "application column, form and submit button"],
] as const;
