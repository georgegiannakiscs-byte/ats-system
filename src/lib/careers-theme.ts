/*
 * Careers page theme: turns a company's saved branding into CSS custom properties.
 * Shared by the public careers pages (server) and the live preview in Settings (client).
 * Every value that reaches CSS is re-validated here, so stored data can never inject CSS.
 */

export const CAREERS_FONTS = [
  { key: "default", label: "Ulysse default", kind: "default" },
  { key: "inter", label: "Inter", kind: "sans" },
  { key: "manrope", label: "Manrope", kind: "sans" },
  { key: "commissioner", label: "Commissioner", kind: "sans" },
  { key: "ibm-plex-sans", label: "IBM Plex Sans", kind: "sans" },
  { key: "open-sans", label: "Open Sans", kind: "sans" },
  { key: "roboto", label: "Roboto", kind: "sans" },
  { key: "noto-sans", label: "Noto Sans", kind: "sans" },
  { key: "sofia-sans", label: "Sofia Sans", kind: "sans" },
  { key: "geologica", label: "Geologica", kind: "sans" },
  { key: "comfortaa", label: "Comfortaa (rounded)", kind: "sans" },
  { key: "literata", label: "Literata", kind: "serif" },
  { key: "source-serif", label: "Source Serif", kind: "serif" },
  { key: "noto-serif", label: "Noto Serif", kind: "serif" },
  { key: "eb-garamond", label: "EB Garamond", kind: "serif" },
  { key: "alegreya", label: "Alegreya", kind: "serif" },
  { key: "roboto-slab", label: "Roboto Slab", kind: "serif" },
  { key: "piazzolla", label: "Piazzolla", kind: "serif" },
] as const;

export type CareersFontKey = (typeof CAREERS_FONTS)[number]["key"];
export const CAREERS_FONT_KEYS = CAREERS_FONTS.map((f) => f.key) as [CareersFontKey, ...CareersFontKey[]];

export const CORNER_STYLES = ["sharp", "rounded", "round"] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];
export const HERO_STYLES = ["plain", "band"] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];

export const DEFAULT_PRIMARY = "#193329";
export const DEFAULT_ACCENT = "#BE7157";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

function channels(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Picks readable text (dark ink or white) for a brand colour. */
export function onColor(hex: string) {
  return luminance(hex) > 0.45 ? "#16231d" : "#ffffff";
}

export interface CareersThemeInput {
  primaryColor?: unknown;
  accentColor?: unknown;
  backgroundColor?: unknown;
  textColor?: unknown;
  headingFont?: unknown;
  bodyFont?: unknown;
  cornerStyle?: unknown;
  heroStyle?: unknown;
}

export interface CareersTheme {
  primary: string;
  accent: string;
  /** null = follow Ulysse's light/dark theme. */
  background: string | null;
  text: string | null;
  headingFont: CareersFontKey;
  bodyFont: CareersFontKey;
  corners: CornerStyle;
  hero: HeroStyle;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Normalises stored branding. When custom branding is switched off for the company, returns the defaults. */
export function resolveCareersTheme(b: CareersThemeInput, enabled = true): CareersTheme {
  if (!enabled) b = {};
  const background = isHex(b.backgroundColor) ? b.backgroundColor : null;
  return {
    primary: isHex(b.primaryColor) ? b.primaryColor : DEFAULT_PRIMARY,
    accent: isHex(b.accentColor) ? b.accentColor : DEFAULT_ACCENT,
    background,
    text: background ? (isHex(b.textColor) ? b.textColor : onColor(background)) : null,
    headingFont: pick(b.headingFont, CAREERS_FONT_KEYS, "default"),
    bodyFont: pick(b.bodyFont, CAREERS_FONT_KEYS, "default"),
    corners: pick(b.cornerStyle, CORNER_STYLES, "rounded"),
    hero: pick(b.heroStyle, HERO_STYLES, "plain"),
  };
}

const RADIUS: Record<CornerStyle, string> = { sharp: "0.125rem", rounded: "0.5rem", round: "1rem" };
const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";

/**
 * CSS custom properties for a theme. `fontFamilyFor` comes from careers-fonts (kept separate so this
 * module stays free of next/font and can be unit-tested).
 */
export function careersThemeVars(t: CareersTheme, fontFamilyFor: (k: CareersFontKey) => string | null): Record<string, string> {
  const vars: Record<string, string> = {
    "--primary": t.primary,
    "--primary-foreground": onColor(t.primary),
    "--ring": `${t.primary}55`,
    "--careers-accent": t.accent,
    "--careers-accent-foreground": onColor(t.accent),
    "--radius": RADIUS[t.corners],
  };
  const heading = fontFamilyFor(t.headingFont);
  const body = fontFamilyFor(t.bodyFont);
  const kindOf = (k: CareersFontKey) => CAREERS_FONTS.find((f) => f.key === k)?.kind;
  if (heading) vars["--font-display-serif"] = `${heading}, ${kindOf(t.headingFont) === "serif" ? SERIF_FALLBACK : SANS_FALLBACK}`;
  if (body) vars["--font-geist-sans"] = `${body}, ${kindOf(t.bodyFont) === "serif" ? SERIF_FALLBACK : SANS_FALLBACK}`;
  if (t.background && t.text) {
    const bg = t.background, fg = t.text;
    const mix = (pct: number) => `color-mix(in srgb, ${fg} ${pct}%, ${bg})`;
    const light = luminance(bg) > 0.4;
    const surface = light ? `color-mix(in srgb, #ffffff 65%, ${bg})` : mix(6);
    Object.assign(vars, {
      "--background": bg, "--foreground": fg,
      "--surface": surface, "--card": surface, "--popover": surface,
      "--card-foreground": fg, "--popover-foreground": fg, "--accent-foreground": fg, "--secondary-foreground": fg,
      "--surface-2": mix(4), "--muted": mix(6), "--accent": mix(6), "--secondary": mix(6),
      "--muted-foreground": mix(70), "--subtle-foreground": mix(52),
      "--border": mix(13), "--border-strong": mix(22), "--input": mix(20),
    });
  }
  return vars;
}

/** Same variables as a CSS declaration block (values are validated hex colours, enums or next/font family names). */
export function cssDeclarations(vars: Record<string, string>) {
  return Object.entries(vars).map(([k, v]) => `${k}:${v.replace(/[<>{};]/g, "")}`).join(";");
}

export interface ContrastWarning { field: "text" | "primary" | "accent"; message: string }

/** Plain-language readability warnings (WCAG AA) for the settings screen. Never blocks saving. */
export function contrastWarnings(t: CareersTheme, defaultBackground = "#faf8f3", defaultText = "#16231d"): ContrastWarning[] {
  const bg = t.background ?? defaultBackground;
  const fg = t.text ?? defaultText;
  const out: ContrastWarning[] = [];
  if (contrast(fg, bg) < 4.5) out.push({ field: "text", message: "Text is hard to read on this background. Pick a darker or lighter text colour." });
  if (contrast(onColor(t.primary), t.primary) < 4.5) out.push({ field: "primary", message: "Button labels are hard to read on the main colour. A darker or lighter main colour reads better." });
  else if (contrast(t.primary, bg) < 3) out.push({ field: "primary", message: "Buttons barely stand out from the page background." });
  if (contrast(t.accent, bg) < 3) out.push({ field: "accent", message: "The accent colour barely stands out from the page background." });
  return out;
}
