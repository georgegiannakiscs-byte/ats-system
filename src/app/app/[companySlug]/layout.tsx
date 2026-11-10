import { notFound, redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { sys } from "@/server/db";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/app/${encodeURIComponent(companySlug)}/dashboard`);
  // Resolve slug → stable org ID, and verify membership on the server.
  const [org] = await sys<{ id: string; status: string; name: string }>(
    "select o.id, o.status, o.name from organizations o join memberships m on m.org_id = o.id and m.user_id = $2 and m.status = 'active' where o.slug = $1",
    [companySlug, user.id],
  );
  if (!org) notFound();
  if (org.status !== "active") redirect(`/app?suspended=${encodeURIComponent(org.name)}`);
  return (
    <WorkspaceShell key={org.id} orgId={org.id} slug={companySlug}>
      {children}
    </WorkspaceShell>
  );
}
