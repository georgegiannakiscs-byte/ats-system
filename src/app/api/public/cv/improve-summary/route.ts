import { z } from "zod";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit } from "@/server/security";
import { assertCvBuilder, publicJob } from "@/server/public";
import { improveSummary } from "@/server/ai/tasks";

const Body = z.object({
  orgSlug: z.string().max(60), jobSlug: z.string().max(120),
  summary: z.string().trim().min(20, "Write a few sentences first").max(2000),
  headline: z.string().max(160).default(""), titles: z.array(z.string().max(160)).max(20).default([]), skills: z.array(z.string().max(60)).max(60).default([]),
});

/** Suggests clearer wording for the candidate's own summary. The candidate decides whether to use it. */
export const POST = handler(async (req) => {
  if (!rateLimit(`cvsum:${clientIp(req)}`, 10, 60 * 60_000).ok) throw new HttpError(429, "Too many requests. Please try again later.", "rate_limited");
  const v = Body.parse(await req.json());
  const job = await publicJob(v.orgSlug, v.jobSlug);
  await assertCvBuilder(job.org_id);
  const r = await improveSummary(job.org_id, v);
  return json({ suggestion: r.suggestion, notes: r.notes });
});
