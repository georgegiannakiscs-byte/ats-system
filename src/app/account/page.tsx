import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { AccountSecurity } from "@/components/account/account-security";

export const metadata = { title: "Account & security" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: n } = await searchParams;
  // Same-site paths only (open-redirect guard, as on the sign-in page).
  const next = typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : undefined;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next ? `/account?next=${encodeURIComponent(next)}` : "/account")}`);
  return <AccountSecurity email={user.email} name={user.name} next={next} />;
}
