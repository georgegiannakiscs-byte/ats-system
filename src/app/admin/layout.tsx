import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = { title: { default: "Platform administration", template: "%s · Ulysse Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isPlatformAdmin)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-base font-semibold">Platform administrators only</h1>
        <p className="text-sm text-muted-foreground">Your account doesn&apos;t have access to platform administration.</p>
        <Link href="/app" className="mt-2 text-sm underline underline-offset-2">Back to my companies</Link>
      </main>
    );
  return <AdminShell email={user.email}>{children}</AdminShell>;
}
