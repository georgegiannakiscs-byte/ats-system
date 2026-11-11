import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";

const SCHEMAS = {
  general: z.object({ platformName: z.string().min(2).max(60), supportEmail: z.string().email().or(z.literal("")), defaultLanguage: z.enum(["en", "el"]), supportedLanguages: z.array(z.enum(["en", "el"])).min(1) }),
  company_creation: z.object({ policy: z.enum(["any_user", "platform_admins"]) }),
  storage: z.object({ maxCvMb: z.number().int().min(1).max(50), maxLogoMb: z.number().int().min(1).max(10), perCompanyQuotaMb: z.number().int().min(100).max(1_000_000) }),
  maintenance: z.object({ enabled: z.boolean(), message: z.string().max(300) }),
  recruitment_defaults: z.object({ retentionMonths: z.number().int().min(1).max(120), careersLanguage: z.enum(["en", "el"]) }),
  // AI provider configuration. The API key itself is an environment variable, never stored here.
  ai: z.object({ enabled: z.boolean(), model: z.string().trim().max(80).regex(/^[a-z0-9.\-]*$/, "Use a model id such as claude-opus-5-5"), monthlyRequestLimitPerCompany: z.number().int().min(0).max(1_000_000), monthlyBudgetUsdPerCompany: z.number().min(0).max(1_000_000) }),
  cv_templates: z.object({ enabled: z.array(z.enum(["minimal", "modern", "professional"])).min(1) }),
} as const;

export const GET = handler(async () => {
  await requirePlatformAdmin();
  const rows = await sys<{ key: string; value: unknown; updated_at: Date }>("select key, value, updated_at from platform_settings");
  return json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

export const PUT = handler(async (req) => {
  const admin = await requirePlatformAdmin();
  const body = z.object({ key: z.enum(Object.keys(SCHEMAS) as [keyof typeof SCHEMAS]), value: z.unknown() }).parse(await req.json());
  const value = SCHEMAS[body.key].parse(body.value);
  if (!value) throw new HttpError(400, "Invalid settings", "validation");
  await sys("insert into platform_settings (key, value, updated_by, updated_at) values ($1,$2,$3, now()) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()", [body.key, JSON.stringify(value), admin.id]);
  await audit({ scope: "platform", action: "platform.settings_updated", actorId: admin.id, targetType: "setting", targetId: body.key, metadata: { value }, ip: clientIp(req) });
  return json({ ok: true });
});
