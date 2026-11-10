import { z } from "zod";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit } from "@/server/security";
import { answerAttempt, attemptView, declineAttempt, skipQuestion, startAttempt } from "@/server/assessments";

type Ctx = { params: Promise<{ token: string }> };
const NO_STORE = { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } };

/** Candidate's Quick Check state (the link token is the only credential). */
export const GET = handler(async (_req: Request, ctx: Ctx) => json(await attemptView((await ctx.params).token), NO_STORE));

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), accommodation: z.enum(["none", "extended", "untimed"]).default("none") }),
  z.object({ action: z.literal("answer"), position: z.number().int().min(0).max(10), optionId: z.string().max(10).nullish(), text: z.string().max(4000).nullish() }),
  z.object({ action: z.literal("skip"), position: z.number().int().min(0).max(10) }),
  z.object({ action: z.literal("decline") }),
]);

export const POST = handler(async (req: Request, ctx: Ctx) => {
  if (!rateLimit(`assess:${clientIp(req)}`, 300, 60 * 60_000).ok) throw new HttpError(429, "Too many requests. Please wait a moment.", "rate_limited");
  const token = (await ctx.params).token;
  const a = Action.parse(await req.json());
  switch (a.action) {
    case "start": return json(await startAttempt(token, a.accommodation), NO_STORE);
    case "answer": return json(await answerAttempt(token, a), NO_STORE);
    case "skip": return json(await skipQuestion(token, a.position), NO_STORE);
    case "decline": return json(await declineAttempt(token), NO_STORE);
  }
});
