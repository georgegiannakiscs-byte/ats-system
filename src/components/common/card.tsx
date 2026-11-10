import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-xs", className)} {...props} />;
}

export function CardHeader({ title, description, action, href, className, icon }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; href?: string; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 pt-3.5 pb-2", className)}>
      {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold tracking-tight">
          {href ? (
            <Link href={href} className="group inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:underline">
              {title}
              <ArrowUpRight className="size-3.5 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ) : (
            title
          )}
        </h2>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between", className)}>
      <h3 className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">{children}</h3>
      {action}
    </div>
  );
}
