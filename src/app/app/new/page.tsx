import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUser } from "@/server/auth";
import { Onboarding } from "@/components/onboarding/onboarding";

export const metadata = { title: "Set up a company" };

export default async function NewCompanyPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/app/new");
  return <Suspense><Onboarding /></Suspense>;
}
