"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LayoutGrid, Plus, Search, Settings, ShieldCheck, Ticket } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useMe, type MeCompany } from "@/lib/session";
import { useDb } from "@/lib/api/store";
import { cn } from "@/lib/utils";

export function CompanyLogo({ name, logoUrl, size = 20, className }: { name: string; logoUrl?: string | null; size?: number; className?: string }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" width={size} height={size} className={cn("shrink-0 rounded-[5px] border border-border bg-white object-contain", className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-[5px] bg-primary font-semibold text-primary-foreground", className)} style={{ width: size, height: size, fontSize: size * 0.48 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function CompanySwitcher({ collapsed }: { collapsed?: boolean }) {
  const db = useDb();
  const me = useMe();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [join, setJoin] = React.useState(false);
  const companies = me?.companies ?? [];
  const current = { name: db.org.name, logoUrl: db.org.logoUrl };
  const query = q.trim().toLowerCase();
  const list = companies.filter((c) => !query || c.name.toLowerCase().includes(query) || c.slug.includes(query));
  const recent = query ? [] : companies.filter((c) => c.id !== db.org.id && c.lastAccessedAt).slice(0, 3);
  const rest = list.filter((c) => !recent.includes(c));
  const go = (c: MeCompany) => {
    setOpen(false);
    setQ("");
    if (c.id !== db.org.id) router.push(`/app/${c.slug}/dashboard`);
  };
  const Row = ({ c }: { c: MeCompany }) => (
    <button onClick={() => go(c)} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent">
      <CompanyLogo name={c.name} logoUrl={c.logoUrl} />
      <span className="min-w-0 flex-1 truncate">{c.name}</span>
      <span className="text-[11px] text-subtle-foreground">{c.roleLabel}</span>
      {c.id === db.org.id && <Check className="size-3.5" />}
    </button>
  );
  return (
    <>
      <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQ(""))}>
        <PopoverTrigger
          aria-label="Switch company"
          className={cn(
            "group flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border-strong",
            collapsed && "justify-center border-transparent bg-transparent px-0 shadow-none",
          )}
        >
          <CompanyLogo name={current.name} logoUrl={current.logoUrl} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{current.name}</span>
              <ChevronsUpDown className="size-3.5 text-subtle-foreground group-hover:text-muted-foreground" />
            </>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="size-3.5 text-subtle-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies" aria-label="Search companies" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground" />
          </div>
          <div className="max-h-80 overflow-y-auto p-1 scrollbar-thin">
            {recent.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Recent</p>
                {recent.map((c) => <Row key={c.id} c={c} />)}
                <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">All companies</p>
              </>
            )}
            {rest.map((c) => <Row key={c.id} c={c} />)}
            {list.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No companies match “{q}”</p>}
          </div>
          <div className="border-t border-border p-1">
            <button onClick={() => (setOpen(false), router.push("/app/new"))} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent"><Plus className="size-4 text-muted-foreground" />Add new company</button>
            <button onClick={() => (setOpen(false), setJoin(true))} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent"><Ticket className="size-4 text-muted-foreground" />Join with an invitation</button>
            <button onClick={() => (setOpen(false), router.push("/app"))} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent"><LayoutGrid className="size-4 text-muted-foreground" />All my companies</button>
            <button onClick={() => (setOpen(false), router.push(`/app/${db.org.slug}/settings`))} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent"><Settings className="size-4 text-muted-foreground" />Company settings</button>
            {me?.user.isPlatformAdmin && (
              <button onClick={() => (setOpen(false), router.push("/admin"))} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent"><ShieldCheck className="size-4 text-muted-foreground" />Platform administration</button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <JoinDialog open={join} onOpenChange={setJoin} />
    </>
  );
}

function JoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [value, setValue] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), setValue(""), setErr(undefined))}>
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const token = value.trim().split("/invite/").pop()?.split(/[?#]/)[0] ?? "";
            if (token.length < 20) return setErr("Paste the full invitation link you received");
            onOpenChange(false);
            router.push(`/invite/${token}`);
          }}
        >
          <DialogHeader icon={<Ticket />} title="Join a company" description="Paste the invitation link a company administrator shared with you." />
          <DialogBody>
            <Field label="Invitation link" error={err}><Input autoFocus value={value} onChange={(e) => (setValue(e.target.value), setErr(undefined))} placeholder="https://…/invite/…" aria-invalid={!!err || undefined} /></Field>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Continue</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
