import { Readable } from "node:stream";
import { z } from "zod";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { confirmPassword } from "@/server/reauth";
import { audit } from "@/server/org";
import { rateLimit } from "@/server/security";
import { BACKUP_MIN_PASSWORD, encryptedBackup, lastBackup, recordBackup } from "@/server/backup";

export const dynamic = "force-dynamic";

/** When the last backup was downloaded (for the reminder). */
export const GET = handler(async () => {
  await requirePlatformAdmin();
  return json(await lastBackup());
});

const Body = z.object({
  accountPassword: z.string().min(1, "Enter your account password").max(200),
  backupPassword: z.string().min(BACKUP_MIN_PASSWORD, `The backup password needs at least ${BACKUP_MIN_PASSWORD} characters`).max(200),
});

/**
 * Downloads a full encrypted backup: every company's data and files. Platform admins only (two-step
 * verification required), with the account password asked again; every download is audited.
 */
export const POST = handler(async (req) => {
  const user = await requirePlatformAdmin();
  const v = Body.parse(await req.json());
  if (!rateLimit(`backup:${user.id}`, 6, 60 * 60_000).ok) throw new HttpError(429, "Too many backups in a short time. Please try again later.", "rate_limited");
  await confirmPassword(user.id, v.accountPassword);
  const stream = await encryptedBackup(v.backupPassword);
  await recordBackup(user.email);
  await audit({ scope: "platform", action: "platform.backup_downloaded", actorId: user.id, ip: clientIp(req) });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="ulysse-backup-${day}.ulyssebak"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
