import type { Metadata } from "next";
import { CareersFrame } from "@/components/careers/frame";
import { QuickCheck } from "@/components/assess/quick-check";
import { attemptView } from "@/server/assessments";
import { HttpError } from "@/server/http";
import { quickCheckDict } from "@/lib/i18n/cv-builder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quick Check", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AssessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: Awaited<ReturnType<typeof attemptView>> | null = null;
  try {
    view = await attemptView(token);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
  }
  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-sm">{quickCheckDict.en.invalid}<br /><span lang="el">{quickCheckDict.el.invalid}</span></p>
      </main>
    );
  }
  const org = { slug: view.company.slug, name: view.company.name, logoUrl: view.company.logoUrl, branding: {} };
  return (
    <CareersFrame org={org} theme={view.company.theme} lang={view.language} path={`/careers/${org.slug}`} hideLanguage>
      <QuickCheck token={token} initial={view} />
    </CareersFrame>
  );
}
