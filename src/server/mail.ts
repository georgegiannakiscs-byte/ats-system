import "server-only";
import { sys } from "./db";
import { env } from "./env";

/**
 * Transactional email. Messages are always written to the outbox (audit trail).
 * They are only delivered when SMTP_URL and MAIL_FROM are configured - otherwise
 * the outbox row is marked "not_configured" and nothing is claimed as sent.
 *
 * The sender address is always MAIL_FROM's (the domain verified with the email provider); the
 * display name is the company's for company emails, and replies go to a person who reads them:
 * the given replyTo, else the company's data-request email, else the platform support email.
 */
export interface MailOptions {
  replyTo?: string;
  fromName?: string;
  /** A calendar invitation (iCalendar text), shown by Gmail/Outlook as an event with its own buttons. */
  icalEvent?: { method: "REQUEST" | "CANCEL"; content: string; filename?: string };
}

export const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
const quoteName = (name: string) => `"${name.replace(/["\\\r\n]/g, "").slice(0, 80)}"`;

async function defaults(orgId: string | null) {
  if (orgId) {
    const [o] = await sys<{ name: string; contact: string | null }>("select name, privacy->>'contactEmail' as contact from organizations where id = $1", [orgId]);
    if (o) return { fromName: o.name, replyTo: o.contact || "" };
  }
  const [g] = await sys<{ name: string | null; support: string | null }>("select value->>'platformName' as name, value->>'supportEmail' as support from platform_settings where key = 'general'");
  return { fromName: g?.name || "Ulysse", replyTo: g?.support || "" };
}

export async function sendMail(orgId: string | null, to: string, subject: string, body: string, kind: string, html?: string, opts: MailOptions = {}) {
  const [row] = await sys<{ id: string }>("insert into email_outbox (org_id, to_email, subject, body, kind, status) values ($1,$2,$3,$4,$5,$6) returning id", [
    orgId, to, subject, body, kind, env.smtpUrl && env.mailFrom ? "queued" : "not_configured",
  ]);
  if (!env.smtpUrl || !env.mailFrom) return "not_configured" as const;
  try {
    const d = await defaults(orgId);
    const from = `${quoteName(opts.fromName || d.fromName)} <${addressOf(env.mailFrom)}>`;
    const replyTo = opts.replyTo || d.replyTo || undefined;
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(env.smtpUrl);
    await transport.sendMail({ from, to, subject, text: body, html, replyTo, ...(opts.icalEvent ? { icalEvent: { method: opts.icalEvent.method.toLowerCase(), content: opts.icalEvent.content, filename: opts.icalEvent.filename ?? "invite.ics" } } : {}) });
    await sys("update email_outbox set status = 'sent', sent_at = now() where id = $1", [row.id]);
    return "sent" as const;
  } catch (e) {
    await sys("update email_outbox set status = 'failed', error = $2 where id = $1", [row.id, (e as Error).message.slice(0, 500)]);
    return "failed" as const;
  }
}

export const mailConfigured = () => Boolean(env.smtpUrl && env.mailFrom);
