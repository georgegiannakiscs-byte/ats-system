import { z } from "zod";
import { sys, tenantTx } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit, slugify, uniqueOrgSlug } from "@/server/org";
import { initialiseOrg } from "@/server/workspace";
import { rateLimit } from "@/server/security";

const Body = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(120),
  slug: z.string().trim().toLowerCase().max(48).optional(),
  industry: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
});

export const POST = handler(async (req) => {
  const user = await requireUser();
  if (!rateLimit(`org-create:${user.id}`, 20, 60 * 60_000).ok) throw new HttpError(429, "Too many companies created recently", "rate_limited");
  const [policy] = await sys<{ value: { policy: string } }>("select value from platform_settings where key = 'company_creation'");
  if (policy?.value.policy === "platform_admins" && !user.isPlatformAdmin) throw new HttpError(403, "Company creation is restricted by the platform administrator", "forbidden");
  const v = Body.parse(await req.json());
  let slug = v.slug ? slugify(v.slug) : await uniqueOrgSlug(v.name);
  if (v.slug && (await sys("select 1 from organizations where slug = $1", [slug])).length) throw new HttpError(409, "That address is already taken", "slug_taken");
  if (!slug) slug = await uniqueOrgSlug(v.name);
  const [org] = await sys<{ id: string }>("insert into organizations (slug, name, created_by, profile, branding) values ($1,$2,$3,$4,$5) returning id", [
    slug, v.name, user.id, JSON.stringify({ industry: v.industry ?? "", website: v.website ?? "" }), JSON.stringify({ primaryColor: "#193329", accentColor: "#BE7157", careersLanguage: user.preferredLanguage }),
  ]);
  await sys("insert into memberships (org_id, user_id, role, last_accessed_at) values ($1,$2,'admin', now())", [org.id, user.id]);
  await tenantTx(org.id, user.id, (q) => initialiseOrg(q, org.id));
  await audit({ scope: "org", action: "company.created", actorId: user.id, orgId: org.id, targetType: "organization", targetId: org.id, metadata: { name: v.name, slug }, ip: clientIp(req) });
  return json({ id: org.id, slug }, 201);
});
