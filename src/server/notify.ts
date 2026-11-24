import "server-only";
import { sys } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";

/**
 * Emails the job's recruiter about a new application (Settings → Notifications → New applications).
 * Only the candidate's name and the job: the CV and details stay in Ulysse, behind sign-in.
 */
export async function notifyNewApplication(job: { id: string; org_id: string; title: string; recruiter_id: string | null }, candidateId: string, candidateName: string) {
  if (!job.recruiter_id) return;
  const [r] = await sys<{ email: string; name: string; slug: string; org_name: string; on: boolean }>(
    `select u.email, u.name, o.slug, o.name as org_name, coalesce((o.notification_prefs->>'newApplication')::boolean, true) as on
     from memberships m join users u on u.id = m.user_id join organizations o on o.id = m.org_id
     where m.org_id = $1 and m.user_id = $2 and m.status = 'active' and u.status = 'active'`,
    [job.org_id, job.recruiter_id],
  );
  if (!r?.on) return;
  const link = `${env.appUrl}/app/${r.slug}/candidates/view?id=${encodeURIComponent(candidateId)}`;
  const first = r.name.split(/\s+/)[0] || r.name;
  await sendMail(
    job.org_id, r.email, `New application: ${candidateName} for ${job.title}`,
    `Hi ${first},\n\n${candidateName} applied for ${job.title} at ${r.org_name}.\n\nReview the application in Ulysse:\n${link}\n\nYou get this email because you're the recruiter for this job. Company admins can turn it off in Settings → Notifications.`,
    "new_application_notice", undefined, { fromName: "Ulysse" },
  );
}
