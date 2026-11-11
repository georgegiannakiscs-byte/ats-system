import { redirect } from "next/navigation";

export default async function CompanyRoot({ params }: { params: Promise<{ companySlug: string }> }) {
  redirect(`/app/${(await params).companySlug}/dashboard`);
}
