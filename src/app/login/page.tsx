import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" description="Welcome back." footer={<>New to Déceler? <Link href="/signup" className="font-medium text-foreground hover:underline">Create an account</Link></>}>
      <Suspense><LoginForm /></Suspense>
    </AuthCard>
  );
}
