import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthCard title="Create your account" description="One account for every company you hire for." footer={<>Already have an account? <Link href="/login" className="font-medium text-foreground hover:underline">Sign in</Link></>}>
      <Suspense><SignupForm /></Suspense>
    </AuthCard>
  );
}
