import { BrandLogo } from "@/components/shell/brand-mark";

export function AuthCard({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <BrandLogo height={34} className="mb-8" />
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-5 text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}
