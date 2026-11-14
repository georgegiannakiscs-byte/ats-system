import { z } from "zod";
import QRCode from "qrcode";
import { sys } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { confirmPassword } from "@/server/reauth";
import { encryptSecret, newTotpSecret, otpauthUri } from "@/server/totp";
import { twoFactorStatus } from "@/server/two-factor";
import { BRAND } from "@/config/brand";

const Body = z.object({ password: z.string().min(1).max(200) });

/** Step 1 of turning on two-step verification: a new secret to scan. Not active until confirmed with a code. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const v = Body.parse(await req.json());
  await confirmPassword(user.id, v.password);
  if ((await twoFactorStatus(user.id)).enabled) throw new HttpError(409, "Two-step verification is already on", "already_enabled");
  const secret = newTotpSecret();
  await sys("update users set totp_pending_secret = $2 where id = $1", [user.id, encryptSecret(secret)]);
  const uri = otpauthUri(secret, user.email, BRAND.name);
  const qrSvg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  return json({ secret: secret.match(/.{1,4}/g)!.join(" "), uri, qrSvg });
});
