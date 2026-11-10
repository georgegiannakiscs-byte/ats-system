/**
 * Builds company-scoped URLs: orgPath("/jobs") → "/app/acme/jobs".
 * The active company slug is set by the workspace shell before any child renders.
 * Slugs are for routing only — authorisation always uses the stable org ID.
 */
let currentSlug = "";

export function setOrgSlug(slug: string) {
  currentSlug = slug;
}

export function getOrgSlug() {
  return currentSlug;
}

export function orgPath(path: string, slug = currentSlug) {
  if (path === "/" || path === "") return `/app/${slug}/dashboard`;
  if (path.startsWith("/app/") || path.startsWith("/careers/") || path.startsWith("/admin") || path.startsWith("/api/")) return path;
  return `/app/${slug}${path.startsWith("/") ? path : `/${path}`}`;
}
