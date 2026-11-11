import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { CompaniesOverview } from "@/components/onboarding/companies-overview";

export const metadata = { title: "My companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ suspended?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/app");
  return <CompaniesOverview suspended={(await searchParams).suspended} />;
}
