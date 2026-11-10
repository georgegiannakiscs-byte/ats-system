"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Maximize2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { SheetContent, SheetTitle, SheetDescription, Tooltip } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/input";
import { useDb } from "@/lib/api/store";
import type { ID } from "@/lib/types";
import { fullName } from "@/lib/api/selectors";
import { CandidateHeader, CandidateTabs, useCandidateApplication } from "./candidate-profile";

/** Slide-over preview — review a candidate without leaving the list or pipeline. */
export function CandidateSheet({ state, onClose, onNavigate }: { state: { id: ID; applicationId?: ID; list?: ID[] } | null; onClose: () => void; onNavigate: (id: ID) => void }) {
  return (
    <Dialog.Root open={!!state} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>{state && <SheetBody state={state} onClose={onClose} onNavigate={onNavigate} />}</SheetContent>
    </Dialog.Root>
  );
}

function SheetBody({ state, onClose, onNavigate }: { state: { id: ID; applicationId?: ID; list?: ID[] }; onClose: () => void; onNavigate: (id: ID) => void }) {
  const db = useDb();
  const candidate = db.candidates.find((c) => c.id === state.id);
  const { app, setAppId } = useCandidateApplication(state.id, state.applicationId);
  const list = state.list ?? [];
  const idx = list.indexOf(state.id);
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined;
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [state.id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === "j" && next) onNavigate(next);
      if (e.key === "k" && prev) onNavigate(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onNavigate]);

  if (!candidate) return null;
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
        <SheetTitle className="sr-only">{fullName(candidate)}</SheetTitle>
        <SheetDescription className="sr-only">Candidate preview</SheetDescription>
        {list.length > 1 && (
          <>
            <Tooltip content="Previous" shortcut="K"><Button variant="ghost" size="icon-sm" disabled={!prev} onClick={() => prev && onNavigate(prev)} aria-label="Previous candidate"><ChevronUp /></Button></Tooltip>
            <Tooltip content="Next" shortcut="J"><Button variant="ghost" size="icon-sm" disabled={!next} onClick={() => next && onNavigate(next)} aria-label="Next candidate"><ChevronDown /></Button></Tooltip>
            <span className="tabular px-1 text-xs text-muted-foreground">{idx + 1} / {list.length}</span>
          </>
        )}
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-subtle-foreground sm:flex"><Kbd>esc</Kbd> to close</span>
        <Tooltip content="Open full profile">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/candidates/view?id=${candidate.id}`} onClick={onClose} aria-label="Open full profile"><Maximize2 /></Link>
          </Button>
        </Tooltip>
        <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X /></Button></Dialog.Close>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-8 pt-5 scrollbar-thin">
        <CandidateHeader candidate={candidate} app={app} onSelectApp={setAppId} variant="sheet" />
        <div className="mt-5">
          <CandidateTabs candidate={candidate} app={app} variant="sheet" />
        </div>
      </div>
    </>
  );
}
