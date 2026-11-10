import { handler, json } from "@/server/http";
import { destroySession } from "@/server/auth";

export const POST = handler(async () => {
  await destroySession();
  return json({ ok: true });
});
