import { sys } from "@/server/db";
import { getObject } from "@/server/storage";

/** Company logos are public branding assets (shown on careers pages and emails). */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string; variant: string }> }) {
  const { orgId, variant } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return new Response("Not found", { status: 404 });
  const [org] = await sys<{ branding: Record<string, string>; status: string }>("select branding, status from organizations where id = $1", [orgId]);
  const prefix = variant === "dark" ? "logoDark" : "logo";
  const key = org?.branding[`${prefix}Key`];
  if (!org || org.status !== "active" || !key) return new Response("Not found", { status: 404 });
  try {
    const data = await getObject(key);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": org.branding[`${prefix}Mime`] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
