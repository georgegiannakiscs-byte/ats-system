import { sys } from "@/server/db";
import { handler, json } from "@/server/http";
import { requireOrg } from "@/server/org";
import { buildSnapshot } from "@/server/workspace";

export const GET = handler(async (_req, ctx: { params: Promise<{ orgId: string }> }) => {
  const access = await requireOrg((await ctx.params).orgId);
  await sys("update memberships set last_accessed_at = now() where org_id = $1 and user_id = $2", [access.org.id, access.user.id]);
  return json(await buildSnapshot(access), { headers: { "Cache-Control": "private, no-store" } });
});
