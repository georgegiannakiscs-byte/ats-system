import * as React from "react";
import { cn } from "@/lib/utils";

export const inputBase =
  "w-full min-w-0 rounded-md border border-input bg-surface px-2.5 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-brand/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputBase, "h-8 file:border-0 file:bg-transparent file:text-sm", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(inputBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-foreground select-none", className)} {...props} />;
}

export function Field({ label, hint, error, htmlFor, required, children, className }: { label: string; hint?: string; error?: string; htmlFor?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  const autoId = React.useId();
  // Associate the label with a single form control child automatically (accessibility).
  const child = React.isValidElement<{ id?: string; "aria-describedby"?: string }>(children) ? children : null;
  const id = htmlFor ?? child?.props.id ?? (child ? autoId : undefined);
  const msgId = `${autoId}-msg`;
  const control = child && !htmlFor && !child.props.id ? React.cloneElement(child, { id, "aria-describedby": error || hint ? msgId : undefined }) : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>
      {control}
      {error ? (
        <p id={msgId} role="alert" className="text-xs text-destructive animate-fade-in">{error}</p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted-foreground", className)} {...props} />;
}
