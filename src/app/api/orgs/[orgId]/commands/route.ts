import { z } from "zod";
import { handler, json } from "@/server/http";
import { requireOrg } from "@/server/org";
import { runCommand } from "@/server/commands";

const Body = z.object({ type: z.string().max(60), payload: z.record(z.string(), z.unknown()).default({}) });

export const POST = handler(async (req, ctx: { params: Promise<{ orgId: string }> }) => {
  const access = await requireOrg((await ctx.params).orgId);
  const { type, payload } = Body.parse(await req.json());
  await runCommand(access, type, payload);
  return json({ ok: true });
});
