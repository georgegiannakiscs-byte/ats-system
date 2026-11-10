"use client";
import * as React from "react";
import { Dialog as D, AlertDialog as AD, Popover as P, Tooltip as T, DropdownMenu as DM } from "radix-ui";
import { Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";

/* ───────────── Dialog ───────────── */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlayCls = "fixed inset-0 z-50 bg-[oklch(0.2_0.01_70/0.28)] backdrop-blur-[1.5px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 dark:bg-black/50";

export function DialogContent({ className, children, size = "md", hideClose, ...props }: React.ComponentProps<typeof D.Content> & { size?: "sm" | "md" | "lg" | "xl"; hideClose?: boolean }) {
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <D.Portal>
      <D.Overlay className={overlayCls} />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 duration-150",
          w,
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "absolute right-3 top-3")} aria-label="Close">
            <X />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ title, description, className, icon }: { title: React.ReactNode; description?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex gap-3 border-b border-border px-5 pb-4 pt-5 pr-12", className)}>
      {icon && <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-foreground [&_svg]:size-4">{icon}</div>}
      <div className="min-w-0">
        <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
        {description ? <D.Description className="mt-0.5 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
      </div>
    </div>
  );
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin", className)} {...props} />;
}

export function DialogFooter({ className, children, hint }: { className?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-border bg-surface-2/60 px-5 py-3", className)}>
      {hint && <div className="mr-auto text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

/* ───────────── Sheet (slide-over) ───────────── */
export function SheetContent({ className, children, width = "max-w-[720px]", ...props }: React.ComponentProps<typeof D.Content> & { width?: string }) {
  return (
    <D.Portal>
      <D.Overlay className={cn(overlayCls, "bg-[oklch(0.2_0.01_70/0.12)] backdrop-blur-none dark:bg-black/40")} />
      <D.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-lg outline-none sm:inset-y-2 sm:right-2 sm:rounded-xl sm:border",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-8 data-[state=closed]:fade-out-0 duration-200 ease-out",
          width,
          className,
        )}
        onOpenAutoFocus={(e) => {
          // Focus the panel itself rather than the first button (avoids a stray tooltip).
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        {...props}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}
export const SheetTitle = D.Title;
export const SheetDescription = D.Description;

/* ───────────── Confirm (AlertDialog) ───────────── */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, onConfirm, children,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; children?: React.ReactNode;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlayCls} />
        <AD.Content className="fixed left-1/2 top-[20vh] z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-border bg-popover p-5 shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 duration-150">
          <AD.Title className="text-base font-semibold tracking-tight">{title}</AD.Title>
          {description && <AD.Description className="mt-1.5 text-sm text-muted-foreground">{description}</AD.Description>}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <AD.Cancel asChild><Button variant="outline">Cancel</Button></AD.Cancel>
            <AD.Action asChild><Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button></AD.Action>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}

/* ───────────── Popover ───────────── */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;
export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[side=bottom]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-100", className)}
        {...props}
      />
    </P.Portal>
  );
}

/* ───────────── Tooltip ───────────── */
export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = "top", shortcut }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] flex items-center gap-2 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 duration-100">
          {content}
          {shortcut && <span className="text-primary-foreground/60">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ───────────── Dropdown menu ───────────── */
export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuSub = DM.Sub;
export const DropdownMenuRadioGroup = DM.RadioGroup;

const menuContent = "z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[side=bottom]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-100";
const menuItem = "relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={sideOffset} align={align} className={cn(menuContent, className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, destructive, shortcut, children, asChild, ...props }: React.ComponentProps<typeof DM.Item> & { destructive?: boolean; shortcut?: string }) {
  return (
    <DM.Item asChild={asChild} className={cn(menuItem, destructive && "text-destructive data-[highlighted]:bg-destructive-soft [&_svg]:text-destructive", className)} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {shortcut && <span className="ml-auto pl-4 text-xs text-subtle-foreground">{shortcut}</span>}
        </>
      )}
    </DM.Item>
  );
}
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn(menuItem, "pr-8", className)} onSelect={(e) => e.preventDefault()} {...props}>
      {children}
      <DM.ItemIndicator className="absolute right-2"><Check className="!text-foreground" /></DM.ItemIndicator>
    </DM.CheckboxItem>
  );
}
export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem className={cn(menuItem, "pr-8", className)} {...props}>
      {children}
      <DM.ItemIndicator className="absolute right-2"><Check className="!text-foreground" /></DM.ItemIndicator>
    </DM.RadioItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground", className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof DM.SubTrigger>) {
  return (
    <DM.SubTrigger className={cn(menuItem, "data-[state=open]:bg-accent", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </DM.SubTrigger>
  );
}
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent sideOffset={4} className={cn(menuContent, "max-h-80 overflow-y-auto scrollbar-thin", className)} {...props} />
    </DM.Portal>
  );
}
