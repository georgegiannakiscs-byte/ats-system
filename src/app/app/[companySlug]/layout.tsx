import { notFound, redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { sys } from "@/server/db";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { TwoFactorRequired } from "@/components/account/two-factor-required";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/app/${encodeURIComponent(companySlug)}/dashboard`);
  // Resolve slug → stable org ID, and verify membership on the server.
  const [org] = await sys<{ id: string; status: string; name: string; require_two_factor: boolean }>(
    "select o.id, o.status, o.name, o.require_two_factor from organizations o join memberships m on m.org_id = o.id and m.user_id = $2 and m.status = 'active' where o.slug = $1",
    [companySlug, user.id],
  );
  if (!org) notFound();
  if (org.status !== "active") redirect(`/app?suspended=${encodeURIComponent(org.name)}`);
  if (org.require_two_factor && !user.hasTwoFactor)
    return <TwoFactorRequired title={`${org.name} requires two-step verification`} reason={`${org.name} asks everyone in its workspace to protect their account with two-step verification.`} next={`/app/${companySlug}/dashboard`} back={{ href: "/app", label: "Back to my companies" }} />;
  return (
    <WorkspaceShell key={org.id} orgId={org.id} slug={companySlug}>
      {children}
    </WorkspaceShell>
  );
}
