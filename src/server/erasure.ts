import "server-only";
import { sys, sysTx, tenantTx, type Q } from "./db";
import { deleteObject } from "./storage";
import { audit } from "./org";

/*
 * GDPR: erasing a candidate and enforcing the retention period.
 * Erasure removes the candidate and everything about them in that company: applications and their
 * stage history, CVs and photos (rows and files), CV Builder data, Quick Check attempts, notes,
 * interviews/scorecards/tasks that point at them, activity lines and emails sent to them.
 * The audit log keeps only that an erasure happened (no name or email).
 */

async function eraseIn(q: Q, candidateId: string): Promise<{ keys: string[]; found: boolean }> {
  const [c] = await q<{ email: string }>("select email from candidates where id = $1", [candidateId]);
  if (!c) return { keys: [], found: false };
  const keys = [
    ...(await q<{ storage_key: string }>("select storage_key from cv_documents where candidate_id = $1", [candidateId])).map((r) => r.storage_key),
    ...(await q<{ storage_key: string }>("select storage_key from candidate_photos where candidate_id = $1", [candidateId])).map((r) => r.storage_key),
  ];
  await q("delete from workspace_records where data->>'candidateId' = $1", [candidateId]);
  await q("delete from activities where candidate_id = $1", [candidateId]);
  await q("delete from email_outbox where lower(to_email) = lower($1) and kind not in ('invitation', 'password_reset')", [c.email]);
  await q("delete from candidates where id = $1", [candidateId]); // applications, CV rows, notes, photos, attempts… cascade
  return { keys, found: true };
}

async function deleteFiles(keys: string[]) {
  for (const k of keys) await deleteObject(k).catch((e) => console.error("[erasure] file", k, e));
}

/** Erase on request, by a member with candidates.delete (runs with the company's RLS). */
export async function eraseCandidate(orgId: string, userId: string, candidateId: string, reason: string) {
  const r = await tenantTx(orgId, userId, (q) => eraseIn(q, candidateId));
  if (!r.found) return false;
  await deleteFiles(r.keys);
  await audit({ scope: "org", action: "candidate.erased", actorId: userId, orgId, targetType: "candidate", targetId: candidateId, metadata: { reason, files: r.keys.length } });
  return true;
}

export interface RetentionPolicy { months: number; source: "company" | "platform" }

export async function retentionFor(orgId: string): Promise<RetentionPolicy> {
  const [r] = await sys<{ company: string | null; platform: number | null }>(
    `select o.privacy->>'retentionMonths' as company, (select (value->>'retentionMonths')::int from platform_settings where key = 'recruitment_defaults') as platform
     from organizations o where o.id = $1`, [orgId]);
  const company = Number(r?.company);
  if (Number.isInteger(company) && company >= 1) return { months: company, source: "company" };
  return { months: r?.platform && r.platform >= 1 ? r.platform : 24, source: "platform" };
}

/**
 * Candidates whose retention has run out: none of their applications is still active, and nothing
 * happened (profile change, application, stage change, note) for `months`. `withinDays` looks ahead
 * for the "will be deleted soon" view.
 */
export async function expiredCandidates(q: Q, orgId: string, months: number, withinDays = 0) {
  return q<{ id: string }>(
    `select c.id from candidates c
     where c.org_id = $1
       and not exists (select 1 from applications a where a.candidate_id = c.id and a.status = 'active')
       and greatest(c.updated_at, c.created_at,
             coalesce((select max(greatest(a.applied_at, a.stage_entered_at)) from applications a where a.candidate_id = c.id), c.created_at),
             coalesce((select max(n.created_at) from notes n where n.candidate_id = c.id), c.created_at))
           < now() - make_interval(months => $2::int) + make_interval(days => $3::int)`,
    [orgId, months, withinDays]);
}

/**
 * Deletes expired candidate data in every active company. Safe to run often. Overlapping runs in
 * this process are skipped; parallel instances would only try to erase the same rows (a no-op).
 */
let running = false;
export async function runRetention() {
  if (running) return { skipped: true, erased: 0 };
  running = true;
  let erased = 0;
  try {
    const orgs = await sys<{ id: string }>("select id from organizations where status = 'active'");
    for (const o of orgs) {
      const { months } = await retentionFor(o.id);
      const ids = await sysTx((q) => expiredCandidates(q, o.id, months));
      let n = 0;
      for (const { id } of ids) {
        const r = await sysTx((q) => eraseIn(q, id));
        if (r.found) { await deleteFiles(r.keys); n++; }
      }
      if (n) await audit({ scope: "org", action: "retention.candidates_erased", orgId: o.id, metadata: { count: n, months } });
      erased += n;
    }
    const extra = await purgePlatformData();
    if (extra.leads || extra.drafts) await audit({ scope: "platform", action: "retention.platform_data_erased", metadata: extra });
  } finally {
    running = false;
  }
  return { skipped: false, erased };
}

/**
 * Data that belongs to no candidate record:
 * - CV Builder drafts: once used, the PDF belongs to the CV/lead and only the draft row (a copy of the
 *   CV data) is removed; drafts never submitted are removed with their files a day after they expire.
 * - Talent leads from /talent: kept for the platform retention period after their last update.
 */
async function purgePlatformData() {
  const files: string[] = [];
  const drafts = await sysTx(async (q) => {
    let n = (await q("delete from cv_drafts where consumed_at is not null returning id")).length;
    n += (await q("delete from talent_cv_drafts where consumed_at is not null returning id")).length;
    for (const r of await q<{ storage_key: string; photo_key: string | null }>("delete from cv_drafts where consumed_at is null and expires_at < now() - interval '1 day' returning storage_key, photo_key")) {
      files.push(r.storage_key); if (r.photo_key) files.push(r.photo_key); n++;
    }
    for (const r of await q<{ storage_key: string }>("delete from talent_cv_drafts where consumed_at is null and expires_at < now() - interval '1 day' returning storage_key")) { files.push(r.storage_key); n++; }
    return n;
  });
  const [p] = await sys<{ months: number | null }>("select (value->>'retentionMonths')::int as months from platform_settings where key = 'recruitment_defaults'");
  const months = p?.months && p.months >= 1 ? p.months : 24;
  const leads = await sysTx(async (q) => {
    const rows = await q<{ cv_key: string; email: string }>("delete from talent_leads where greatest(created_at, updated_at) < now() - make_interval(months => $1::int) returning cv_key, email", [months]);
    for (const r of rows) {
      files.push(r.cv_key);
      await q("delete from email_outbox where org_id is null and lower(to_email) = lower($1) and kind not in ('invitation', 'password_reset')", [r.email]);
    }
    return rows.length;
  });
  await deleteFiles(files);
  return { leads, drafts, files: files.length };
}
