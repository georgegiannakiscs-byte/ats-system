import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { sys } from "@/server/db";

/** Entry point: send people to their most recently used company. */
export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  const [last] = await sys<{ slug: string }>(
    "select o.slug from memberships m join organizations o on o.id = m.org_id where m.user_id = $1 and m.status = 'active' and o.status = 'active' order by m.last_accessed_at desc nulls last limit 1",
    [user.id],
  );
  redirect(last ? `/app/${last.slug}/dashboard` : "/app");
}
