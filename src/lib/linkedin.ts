/*
 * Sharing jobs on LinkedIn without API access. LinkedIn's own share dialog takes a URL and
 * builds the preview from the page's Open Graph tags; the UTM parameters make applications
 * from that link show up with source "LinkedIn" (the apply form forwards utm_* to the server).
 */
export function linkedInJobUrl(origin: string, orgSlug: string, jobSlug: string) {
  const p = new URLSearchParams({ utm_source: "linkedin", utm_medium: "social", utm_campaign: jobSlug });
  return `${origin}/careers/${encodeURIComponent(orgSlug)}/${encodeURIComponent(jobSlug)}?${p}`;
}

export const linkedInShareUrl = (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
