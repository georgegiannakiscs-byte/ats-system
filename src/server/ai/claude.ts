import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { sys } from "@/server/db";
import { HttpError } from "@/server/http";
import { featureEnabled } from "@/server/org";

/*
 * Claude integration (official Anthropic SDK). Server-side only: the API key is read from
 * ANTHROPIC_API_KEY and never sent to the browser. Every call:
 *  - checks platform + company switches and monthly per-company request/cost limits,
 *  - uses structured outputs (JSON schema from Zod) and re-validates the result,
 *  - records tokens, cost, latency and failures in ai_usage.
 * When Claude is unavailable, callers degrade gracefully (approved questions and
 * deterministic answer checking never depend on it).
 */

export type AiFeature = "question_generation" | "response_observations" | "cv_summary" | "cv_extract";
const FEATURE_FLAG: Record<AiFeature, string> = {
  question_generation: "ai_question_generation",
  response_observations: "ai_assessment_observations",
  cv_summary: "ai_cv_assist",
  cv_extract: "ai_cv_assist",
};

/** USD per million tokens (input, output). Unknown models are costed at Opus rates. */
const PRICING: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-4-8": [5, 25],
};

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function aiSettings() {
  const [row] = await sys<{ value: { enabled: boolean; model: string; monthlyRequestLimitPerCompany: number; monthlyBudgetUsdPerCompany: number } }>("select value from platform_settings where key = 'ai'");
  return row?.value ?? { enabled: true, model: "", monthlyRequestLimitPerCompany: 500, monthlyBudgetUsdPerCompany: 50 };
}

export async function aiModel() {
  return process.env.ANTHROPIC_MODEL || (await aiSettings()).model || "claude-opus-5-5";
}

/** Why AI can't be used right now (null = available). Shown to users verbatim. */
export async function aiUnavailableReason(orgId: string, feature: AiFeature): Promise<string | null> {
  if (!aiConfigured()) return "AI is not configured on this Déceler installation (ANTHROPIC_API_KEY missing).";
  const s = await aiSettings();
  if (!s.enabled) return "AI features are switched off by the platform administrator.";
  if (!(await featureEnabled(orgId, FEATURE_FLAG[feature]))) return "This AI feature is not enabled for your company.";
  const [org] = await sys<{ ai_settings: Record<string, boolean> }>("select ai_settings from organizations where id = $1", [orgId]);
  if (org?.ai_settings[feature] === false) return "Your company has switched this AI feature off in Settings.";
  const [u] = await sys<{ n: string; cost: string }>(
    "select count(*) n, coalesce(sum(cost_usd), 0) cost from ai_usage where org_id = $1 and status = 'ok' and created_at >= date_trunc('month', now())",
    [orgId],
  );
  if (Number(u.n) >= s.monthlyRequestLimitPerCompany) return "Your company has reached this month's AI request limit.";
  if (Number(u.cost) >= s.monthlyBudgetUsdPerCompany) return "Your company has reached this month's AI budget.";
  return null;
}

async function record(orgId: string | null, feature: AiFeature, model: string, status: "ok" | "error" | "blocked", usage: { input_tokens?: number; output_tokens?: number } | null, latency: number, error?: string) {
  const [pin, pout] = PRICING[model] ?? PRICING["claude-opus-5-5"];
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  await sys("insert into ai_usage (org_id, feature, model, status, input_tokens, output_tokens, cost_usd, latency_ms, error) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    orgId, feature, model, status, input, output, (input * pin + output * pout) / 1_000_000, latency, error?.slice(0, 500) ?? null,
  ]).catch(() => {});
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 }));

/**
 * One structured Claude call. Throws HttpError(503) when AI is unavailable or fails, with a
 * message safe to show to users; the details go to ai_usage.
 */
export async function claudeStructured<S extends z.ZodType>(opts: { orgId: string; feature: AiFeature; schema: S; system: string; prompt: string; maxTokens?: number; effort?: "low" | "medium" | "high" }): Promise<{ data: z.infer<S>; model: string }> {
  const reason = await aiUnavailableReason(opts.orgId, opts.feature);
  const model = await aiModel();
  if (reason) {
    await record(opts.orgId, opts.feature, model, "blocked", null, 0, reason);
    throw new HttpError(503, reason, "ai_unavailable");
  }
  const started = Date.now();
  try {
    const res = await getClient().beta.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: opts.effort ?? (process.env.ANTHROPIC_EFFORT as "medium" | undefined) ?? "medium", format: betaZodOutputFormat(opts.schema) },
    });
    if (res.stop_reason === "refusal") throw new Error(`refused (${res.stop_details?.category ?? "unspecified"})`);
    if (res.stop_reason === "max_tokens") throw new Error("response truncated (max_tokens)");
    if (!res.parsed_output) throw new Error("no structured output");
    const data = opts.schema.parse(res.parsed_output); // re-validate server-side
    await record(opts.orgId, opts.feature, res.model, "ok", res.usage, Date.now() - started);
    return { data, model: res.model };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.message}` : (e as Error).message;
    await record(opts.orgId, opts.feature, model, "error", null, Date.now() - started, msg);
    console.error(`[ai] ${opts.feature} failed:`, msg);
    throw new HttpError(503, "The AI service couldn't complete this request. Nothing was changed — please try again later.", "ai_failed");
  }
}
