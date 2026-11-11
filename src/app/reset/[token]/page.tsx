import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  return <AuthCard title="Choose a new password"><ResetForm token={(await params).token} /></AuthCard>;
}
