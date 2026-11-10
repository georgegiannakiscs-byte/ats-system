import { verifyPayload } from "@/server/security";
import { getObject } from "@/server/storage";
import { requireOrg } from "@/server/org";
import { HttpError } from "@/server/http";

/** Serves private files for valid, unexpired signed tokens issued to the same signed-in member. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const p = verifyPayload<{ k: string; o: string; d: string; u: string; n: string; m: string; a: number }>((await ctx.params).token);
  if (!p) return new Response("This link has expired", { status: 403 });
  try {
    const access = await requireOrg(p.o, "cv.download");
    if (access.user.id !== p.u) return new Response("Forbidden", { status: 403 });
  } catch (e) {
    return new Response(e instanceof HttpError ? e.message : "Forbidden", { status: e instanceof HttpError ? e.status : 403 });
  }
  const data = await getObject(p.k).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": p.m,
      // Only PDFs may render inline (browser PDF viewer); everything else downloads.
      "Content-Disposition": `${p.a || p.m !== "application/pdf" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(p.n)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
