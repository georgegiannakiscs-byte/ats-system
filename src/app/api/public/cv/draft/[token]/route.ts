import { sys } from "@/server/db";
import { sha256 } from "@/server/security";
import { getObject } from "@/server/storage";

/** The candidate's own generated CV, available to them by its unguessable token until it expires. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return new Response("Not found", { status: 404 });
  const [d] = await sys<{ storage_key: string; data: { personal: { fullName: string } } }>("select storage_key, data from cv_drafts where token_hash = $1 and expires_at > now()", [sha256(token)]);
  if (!d) return new Response("This CV link has expired. Generate the CV again.", { status: 404 });
  const buf = await getObject(d.storage_key).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = `${d.data.personal.fullName.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_") || "CV"}_CV.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
