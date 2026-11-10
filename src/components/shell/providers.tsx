"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={350} skipDelayDuration={150}>
        {children}
        <Toaster
          position="bottom-right"
          gap={8}
          toastOptions={{
            classNames: {
              toast: "!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg !text-sm !font-sans !gap-2.5 !py-3",
              description: "!text-muted-foreground !text-xs",
              actionButton: "!bg-primary !text-primary-foreground !rounded-md !text-xs !font-medium",
              cancelButton: "!bg-muted !text-foreground !rounded-md !text-xs",
              icon: "!text-muted-foreground",
              success: "[&_[data-icon]]:!text-success",
              error: "[&_[data-icon]]:!text-destructive",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
