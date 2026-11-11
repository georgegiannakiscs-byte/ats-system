import "server-only";
import { sys } from "./db";
import { env } from "./env";

/**
 * Transactional email. Messages are always written to the outbox (audit trail).
 * They are only delivered when SMTP_URL and MAIL_FROM are configured - otherwise
 * the outbox row is marked "not_configured" and nothing is claimed as sent.
 */
export async function sendMail(orgId: string, to: string, subject: string, body: string, kind: string, html?: string) {
  const [row] = await sys<{ id: string }>("insert into email_outbox (org_id, to_email, subject, body, kind, status) values ($1,$2,$3,$4,$5,$6) returning id", [
    orgId, to, subject, body, kind, env.smtpUrl && env.mailFrom ? "queued" : "not_configured",
  ]);
  if (!env.smtpUrl || !env.mailFrom) return "not_configured" as const;
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(env.smtpUrl);
    await transport.sendMail({ from: env.mailFrom, to, subject, text: body, html });
    await sys("update email_outbox set status = 'sent', sent_at = now() where id = $1", [row.id]);
    return "sent" as const;
  } catch (e) {
    await sys("update email_outbox set status = 'failed', error = $2 where id = $1", [row.id, (e as Error).message.slice(0, 500)]);
    return "failed" as const;
  }
}

export const mailConfigured = () => Boolean(env.smtpUrl && env.mailFrom);
