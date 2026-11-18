import { sys } from "@/server/db";
import { getObject } from "@/server/storage";

/** Careers cover images are public branding assets (careers page, link previews). */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return new Response("Not found", { status: 404 });
  const [org] = await sys<{ branding: Record<string, string>; status: string }>("select branding, status from organizations where id = $1", [orgId]);
  const key = org?.branding.coverKey;
  if (!org || org.status !== "active" || !key) return new Response("Not found", { status: 404 });
  try {
    const data = await getObject(key);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
