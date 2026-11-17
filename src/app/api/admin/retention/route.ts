import { clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";
import { runRetention } from "@/server/erasure";

/** Runs the retention job now (it also runs on its own every few hours). */
export const POST = handler(async (req) => {
  const admin = await requirePlatformAdmin();
  const r = await runRetention();
  await audit({ scope: "platform", action: "retention.run_manually", actorId: admin.id, metadata: r, ip: clientIp(req) });
  return json(r);
});
