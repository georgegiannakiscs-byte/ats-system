import { AuthCard } from "@/components/auth/auth-card";
import { InviteAccept } from "@/components/auth/auth-forms";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return <AuthCard title="Join a company"><InviteAccept token={(await params).token} /></AuthCard>;
}
