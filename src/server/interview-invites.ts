import "server-only";
import { sys, type Q } from "./db";
import { env } from "./env";
import { addressOf, mailConfigured, sendMail } from "./mail";

/**
 * Calendar invitations for interviews (iCalendar, RFC 5545), sent by email when an interview is
 * scheduled, moved or cancelled. Two separate invitations, so nobody sees the other side's addresses:
 *   - the interviewers (candidate name, job, link to the profile, notes for interviewers)
 *   - the candidate, only when the scheduler ticks it (date, format, place/link; no internal notes)
 * Invitations are one-way (RSVP off): answers are handled by email or in Ulysse.
 */

export interface InviteState {
  team: boolean;
  candidate: boolean;
  timeZone: string;
  sequence: number;
}

type Interview = { candidateId?: unknown; jobId?: unknown; kind?: unknown; start?: unknown; durationMin?: unknown; meetingType?: unknown; location?: unknown; interviewerIds?: unknown; status?: unknown; notes?: unknown; invites?: unknown };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 octets are folded (continuation lines start with a space). */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(o: { uid: string; method: "REQUEST" | "CANCEL"; sequence: number; start: Date; end: Date; summary: string; description: string; location: string; organizerName: string; organizerEmail: string; attendees: { name: string; email: string }[] }) {
  const lines = [
    "BEGIN:VCALENDAR", "PRODID:-//Ulysse//Recruiting//EN", "VERSION:2.0", "CALSCALE:GREGORIAN", `METHOD:${o.method}`,
    "BEGIN:VEVENT", `UID:${o.uid}`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(o.start)}`, `DTEND:${utc(o.end)}`, `SEQUENCE:${o.sequence}`,
    `STATUS:${o.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, `SUMMARY:${esc(o.summary)}`, `DESCRIPTION:${esc(o.description)}`,
    ...(o.location ? [`LOCATION:${esc(o.location)}`] : []),
    `ORGANIZER;CN="${o.organizerName.replace(/["\r\n]/g, "")}":mailto:${o.organizerEmail}`,
    ...o.attendees.map((a) => `ATTENDEE;CN="${a.name.replace(/["\r\n]/g, "")}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${a.email}`),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

function when(start: Date, minutes: number, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(start);
  const t = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day}, ${t(start)}–${t(new Date(start.getTime() + minutes * 60_000))} (${timeZone.replace(/_/g, " ")} time)`;
}

const validTz = (tz: unknown) => {
  if (typeof tz !== "string" || tz.length > 64) return "Europe/Athens";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return "Europe/Athens"; }
};

/**
 * Decides what to send for this save of an interview and sets the invitation state on `data` (call it
 * before the record is written, inside the command's RLS-scoped transaction). The returned function
 * sends the emails and must be called after the commit.
 */
export async function planInterviewInvites(
  q: Q, orgId: string, interviewId: string, data: Interview, prev: Interview | null,
  request: { team?: boolean; candidate?: boolean; timeZone?: string } | null, actor: { name: string; email: string },
): Promise<(() => Promise<void>) | null> {
  const prevState = (prev?.invites ?? null) as InviteState | null;
  const cancelled = data.status === "cancelled";
  let state: InviteState | null = prevState;
  let method: "REQUEST" | "CANCEL" | null = null;
  if (request && !prev && (request.team || request.candidate)) {
    state = { team: !!request.team, candidate: !!request.candidate, timeZone: validTz(request.timeZone), sequence: 0 };
    method = "REQUEST";
  } else if (prevState && prev) {
    const moved = ["start", "durationMin", "meetingType", "location"].some((k) => JSON.stringify(prev[k as keyof Interview]) !== JSON.stringify(data[k as keyof Interview]));
    if (cancelled && prev.status !== "cancelled") method = "CANCEL";
    else if (!cancelled && moved) method = "REQUEST";
    if (method) state = { ...prevState, sequence: prevState.sequence + 1 };
  }
  // The invitation state is server-managed: kept even when the browser sends an older copy of the record.
  if (state) data.invites = state;
  else delete data.invites;
  if (!method || !state || !mailConfigured()) return null;

  const start = new Date(String(data.start));
  const minutes = Math.min(Math.max(Number(data.durationMin) || 45, 5), 600);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + minutes * 60_000);
  const [cand] = await q<{ full_name: string; email: string }>("select full_name, email from candidates where id = $1", [String(data.candidateId)]);
  const [job] = await q<{ title: string }>("select title from jobs where id = $1", [String(data.jobId)]);
  if (!cand || !job) return null;
  const ids = Array.isArray(data.interviewerIds) ? data.interviewerIds.filter((x): x is string => typeof x === "string") : [];
  const team = ids.length ? await sys<{ name: string; email: string }>(
    "select u.name, u.email from memberships m join users u on u.id = m.user_id where m.org_id = $1 and m.user_id = any($2::uuid[]) and m.status = 'active' and u.status = 'active'",
    [orgId, ids],
  ) : [];
  const [org] = await sys<{ name: string; slug: string }>("select name, slug from organizations where id = $1", [orgId]);
  const kind = typeof data.kind === "string" ? data.kind : "Interview";
  const format = typeof data.meetingType === "string" ? data.meetingType : "";
  const place = typeof data.location === "string" ? data.location.slice(0, 500) : "";
  const whenText = when(start, minutes, state.timeZone);
  const organizer = { organizerName: org.name, organizerEmail: addressOf(env.mailFrom) };
  const verb = method === "CANCEL" ? "Cancelled" : state.sequence > 0 ? "Updated" : "Invitation";
  const placeLine = place ? `${format === "On-site" ? "Location" : format === "Video" ? "Meeting link" : "Phone"}: ${place}` : `Format: ${format || "to be confirmed"}`;
  const sends: (() => Promise<unknown>)[] = [];

  if (state.team && team.length) {
    const link = `${env.appUrl}/app/${org.slug}/candidates/view?id=${encodeURIComponent(String(data.candidateId))}`;
    const notes = typeof data.notes === "string" && data.notes.trim() ? `\n\nNotes for interviewers:\n${data.notes.slice(0, 2000)}` : "";
    const summary = `${kind}: ${cand.full_name} (${job.title})`;
    const text = method === "CANCEL"
      ? `The ${kind.toLowerCase()} with ${cand.full_name} for ${job.title} on ${whenText} was cancelled.`
      : `${kind} with ${cand.full_name} for ${job.title}\n\nWhen: ${whenText}\n${placeLine}\nScheduled by: ${actor.name}\n\nCandidate profile in Ulysse:\n${link}${notes}`;
    const ics = buildIcs({ uid: `${interviewId}-team@ulysse`, method, sequence: state.sequence, start, end, summary, description: text, location: place, ...organizer, attendees: team });
    for (const m of team) sends.push(() => sendMail(orgId, m.email, `${verb}: ${summary}`, text, "interview_invite_team", undefined, { replyTo: actor.email, icalEvent: { method, content: ics } }));
  }
  if (state.candidate) {
    const first = cand.full_name.split(/\s+/)[0];
    const summary = `${kind} with ${org.name} (${job.title})`;
    const text = method === "CANCEL"
      ? `Hi ${first},\n\nYour ${kind.toLowerCase()} with ${org.name} for the ${job.title} role on ${whenText} has been cancelled. We'll be in touch about next steps.\n\n${org.name}`
      : `Hi ${first},\n\n${state.sequence > 0 ? "Your interview has been updated. The new details:" : `We'd like to invite you to a ${kind.toLowerCase()} for the ${job.title} role.`}\n\nWhen: ${whenText}\n${placeLine}\n\nIf this time doesn't work for you, just reply to this email.\n\n${org.name}`;
    const ics = buildIcs({ uid: `${interviewId}-candidate@ulysse`, method, sequence: state.sequence, start, end, summary, description: text, location: place, ...organizer, attendees: [{ name: cand.full_name, email: cand.email }] });
    sends.push(() => sendMail(orgId, cand.email, `${verb}: ${summary}`, text, "interview_invite_candidate", undefined, { replyTo: actor.email, icalEvent: { method, content: ics } }));
  }
  return async () => { for (const s of sends) await s().catch((e) => console.error("[invites]", e)); };
}
