import { z } from "zod";
import { sys, sysTx } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit, slugify, uniqueOrgSlug } from "@/server/org";
import { initialiseOrg, logoUrl } from "@/server/workspace";
import { randomToken, sha256 } from "@/server/security";
import { sendMail } from "@/server/mail";

export const GET = handler(async (req) => {
  await requirePlatformAdmin();
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  const status = u.searchParams.get("status");
  const rows = await sys<{ id: string; slug: string; name: string; status: string; created_at: Date; branding: Record<string, unknown>; members: string; jobs: string; applications: string; admins: string | null }>(
    `select o.id, o.slug, o.name, o.status, o.created_at, o.branding,
      (select count(*) from memberships m where m.org_id = o.id and m.status = 'active') members,
      (select count(*) from jobs j where j.org_id = o.id) jobs,
      (select count(*) from applications a where a.org_id = o.id) applications,
      (select string_agg(u.email, ', ') from memberships m join users u on u.id = m.user_id where m.org_id = o.id and m.role = 'admin' and m.status = 'active') admins
     from organizations o
     where ($1 = '' or o.name ilike '%' || $1 || '%' or o.slug ilike '%' || $1 || '%') and ($2::text is null or o.status = $2)
     order by o.created_at desc limit 200`,
    [q, status],
  );
  return json({ companies: rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, status: r.status, createdAt: r.created_at, logoUrl: logoUrl(r.id, r.branding), members: +r.members, jobs: +r.jobs, applications: +r.applications, admins: r.admins ?? "" })) });
});

const Body = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().max(48).optional(), adminEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")) });

export const POST = handler(async (req) => {
  const admin = await requirePlatformAdmin();
  const v = Body.parse(await req.json());
  const slug = v.slug ? slugify(v.slug) : await uniqueOrgSlug(v.name);
  if ((await sys("select 1 from organizations where slug = $1", [slug])).length) throw new HttpError(409, "That address is already taken", "slug_taken");
  const [org] = await sys<{ id: string }>("insert into organizations (slug, name, created_by, branding) values ($1,$2,$3,$4) returning id", [slug, v.name, admin.id, JSON.stringify({ primaryColor: "#193329", accentColor: "#BE7157", careersLanguage: "en" })]);
  // Defaults are written in system context; the platform admin is NOT added as a member.
  await sysTx((q) => initialiseOrg(q, org.id));
  let invite: { link: string; delivery: string } | null = null;
  if (v.adminEmail) {
    const [existing] = await sys<{ id: string }>("select id from users where lower(email) = $1", [v.adminEmail]);
    if (existing) {
      await sys("insert into memberships (org_id, user_id, role) values ($1,$2,'admin') on conflict do nothing", [org.id, existing.id]);
    } else {
      const token = randomToken();
      await sys("insert into invitations (org_id, email, role, token_hash, invited_by, expires_at) values ($1,$2,'admin',$3,$4, now() + interval '7 days')", [org.id, v.adminEmail, sha256(token), admin.id]);
      const link = `${env.appUrl}/invite/${token}`;
      invite = { link, delivery: await sendMail(org.id, v.adminEmail, `You've been invited to administer ${v.name} on Ulysse`, `Accept the invitation: ${link}`, "invitation") };
    }
  }
  await audit({ scope: "platform", action: "company.created_by_platform_admin", actorId: admin.id, orgId: org.id, targetType: "organization", targetId: org.id, metadata: { name: v.name, slug, adminEmail: v.adminEmail || null }, ip: clientIp(req) });
  return json({ id: org.id, slug, invite }, 201);
});
