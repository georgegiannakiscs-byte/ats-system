import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { twoFactorStatus } from "@/server/two-factor";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ twoFactor: await twoFactorStatus(user.id) });
});
