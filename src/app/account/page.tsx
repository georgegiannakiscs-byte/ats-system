import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { AccountSecurity } from "@/components/account/account-security";

export const metadata = { title: "Account & security" };

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");
  return <AccountSecurity email={user.email} name={user.name} />;
}
