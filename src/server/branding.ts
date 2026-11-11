/** Public URL of a company logo variant (null when none is uploaded). */
export function logoUrl(orgId: string, branding: Record<string, unknown>, variant: "light" | "dark" = "light") {
  const key = variant === "dark" ? (branding.logoDarkKey as string | undefined) : (branding.logoKey as string | undefined);
  if (!key) return null;
  return `/api/public/logo/${orgId}/${variant}?v=${encodeURIComponent(String(branding[variant === "dark" ? "logoDarkVersion" : "logoVersion"] ?? "1"))}`;
}
