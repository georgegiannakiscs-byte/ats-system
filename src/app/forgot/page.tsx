import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <AuthCard title="Forgot your password?" description="We'll email you a link to choose a new one." footer={<Link href="/login" className="font-medium text-foreground hover:underline">Back to sign in</Link>}>
      <ForgotForm />
    </AuthCard>
  );
}
