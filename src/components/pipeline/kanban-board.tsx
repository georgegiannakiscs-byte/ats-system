"use client";
import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, defaultDropAnimationSideEffects, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type Announcements, type DropAnimation,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Info } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { STAGE_ORDER, STAGE_TONE } from "@/lib/constants";
import type { ID, StageId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/api/selectors";
import { moveStage } from "@/lib/hooks/use-stage-actions";
import { useUI } from "@/components/shell/ui-context";
import { ConfirmDialog, Tooltip } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { CandidateCard, type CardData } from "./candidate-card";

type Columns = Record<StageId, ID[]>;

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
};

export function KanbanBoard({ cards, jobId }: { cards: CardData[]; jobId: ID }) {
  const db = useDb();
  const ui = useUI();
  const byId = React.useMemo(() => new Map(cards.map((c) => [c.app.id, c])), [cards]);

  const derive = React.useCallback((): Columns => {
    const cols = Object.fromEntries(STAGE_ORDER.map((s) => [s, [] as ID[]])) as Columns;
    [...cards].sort((a, b) => a.app.order - b.app.order).forEach((c) => cols[c.app.stage].push(c.app.id));
    return cols;
  }, [cards]);

  const [columns, setColumns] = React.useState<Columns>(derive);
  const [activeId, setActiveId] = React.useState<ID | null>(null);
  const [overStage, setOverStage] = React.useState<StageId | null>(null);
  const [pendingHire, setPendingHire] = React.useState<{ id: ID; index: number } | null>(null);
  const snapshot = React.useRef<Columns | null>(null);

  // Keep local columns in sync with data whenever we're not mid-drag.
  React.useEffect(() => {
    if (!activeId) setColumns(derive());
  }, [derive, activeId]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Long-press on touch so horizontal scrolling of the board still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findStage = (id: ID | StageId): StageId | undefined => {
    if ((STAGE_ORDER as string[]).includes(id)) return id as StageId;
    return STAGE_ORDER.find((s) => columns[s].includes(id));
  };
  const label = (s: StageId) => db.stages.find((x) => x.id === s)?.label ?? s;
  const nameOf = (id: ID | number | string) => {
    const c = byId.get(String(id));
    return c ? fullName(c.candidate) : "candidate";
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)} from ${label(findStage(String(active.id))!)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${label(findStage(String(over.id))!)}.` : `${nameOf(active.id)} is no longer over a stage.`),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} was dropped in ${label(findStage(String(over.id))!)}.` : `${nameOf(active.id)} was dropped.`),
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    snapshot.current = columns;
    setActiveId(String(active.id));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return setOverStage(null);
    const from = findStage(String(active.id));
    const to = findStage(String(over.id));
    setOverStage(to ?? null);
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const fromItems = cols[from].filter((x) => x !== active.id);
      const toItems = [...cols[to]];
      const overIndex = toItems.indexOf(String(over.id));
      const isBelow = over.rect && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const index = overIndex >= 0 ? overIndex + (isBelow ? 1 : 0) : toItems.length;
      toItems.splice(index, 0, String(active.id));
      return { ...cols, [from]: fromItems, [to]: toItems };
    });
  };

  /** Converts an index in the (possibly filtered) column into an index in the full column. */
  const commit = (id: ID, stage: StageId, visibleIndex: number, cols: Columns) => {
    const prevVisible = cols[stage][visibleIndex - 1];
    const full = db.applications.filter((a) => a.jobId === jobId && a.stage === stage && a.status !== "rejected" && a.id !== id).sort((a, b) => a.order - b.order).map((a) => a.id);
    const index = prevVisible ? full.indexOf(prevVisible) + 1 : 0;
    const app = db.applications.find((a) => a.id === id)!;
    moveStage(app, stage, index);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setOverStage(null);
    if (!over) {
      setActiveId(null);
      return;
    }
    const stage = findStage(String(over.id));
    if (!stage) return setActiveId(null);
    let cols = columns;
    const oldIndex = cols[stage].indexOf(id);
    const overIndex = cols[stage].indexOf(String(over.id));
    if (overIndex >= 0 && oldIndex !== overIndex) {
      cols = { ...cols, [stage]: arrayMove(cols[stage], oldIndex, overIndex) };
      setColumns(cols);
    }
    const finalIndex = cols[stage].indexOf(id);
    const original = byId.get(id)!.app;
    if (stage === "hired" && original.stage !== "hired") {
      setPendingHire({ id, index: finalIndex });
      setActiveId(null);
      return;
    }
    if (original.stage !== stage || finalIndex !== snapshot.current?.[stage].indexOf(id)) commit(id, stage, finalIndex, cols);
    setActiveId(null);
  };

  const onDragCancel = () => {
    if (snapshot.current) setColumns(snapshot.current);
    setActiveId(null);
    setOverStage(null);
  };

  const active = activeId ? byId.get(activeId) : undefined;
  const ids = cards.map((c) => c.app.id);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel} accessibility={{ announcements, screenReaderInstructions: { draggable: "To pick up a candidate, press space or enter. Use the arrow keys to move between stages. Press space or enter again to drop, or escape to cancel." } }}>
        <div className="flex h-full gap-2.5 overflow-x-auto px-4 pb-4 pt-1 scrollbar-thin snap-x sm:px-6">
          {STAGE_ORDER.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              items={columns[stage]}
              byId={byId}
              highlight={!!activeId && overStage === stage && active?.app.stage !== stage}
              dragging={!!activeId}
              onOpen={(id) => {
                const c = byId.get(id)!;
                ui.openCandidate(c.candidate.id, { applicationId: id, list: ids.map((x) => byId.get(x)!.candidate.id) });
              }}
              onAddCandidate={stage === "applied" ? () => ui.addCandidate(jobId) : undefined}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={dropAnimation}>{active ? <div className="w-[264px]"><CandidateCard data={active} overlay /></div> : null}</DragOverlay>
      </DndContext>
      <ConfirmDialog
        open={!!pendingHire}
        onOpenChange={(o) => {
          if (!o) {
            setPendingHire(null);
            setColumns(derive());
          }
        }}
        title="Mark as hired?"
        description={pendingHire ? `${nameOf(pendingHire.id)} will be moved to Hired. Remember to close the role when all openings are filled.` : undefined}
        confirmLabel="Mark as hired"
        onConfirm={() => {
          if (pendingHire) commit(pendingHire.id, "hired", pendingHire.index, columns);
          setPendingHire(null);
        }}
      />
    </>
  );
}

function Column({ stage, items, byId, highlight, dragging, onOpen, onAddCandidate }: { stage: StageId; items: ID[]; byId: Map<ID, CardData>; highlight: boolean; dragging: boolean; onOpen: (id: ID) => void; onAddCandidate?: () => void }) {
  const db = useDb();
  const cfg = db.stages.find((s) => s.id === stage)!;
  const { setNodeRef } = useDroppable({ id: stage });
  const late = items.filter((id) => {
    const c = byId.get(id);
    return c && cfg.slaDays > 0 && (Date.now() - new Date(c.app.stageEnteredAt).getTime()) / 864e5 > cfg.slaDays;
  }).length;
  return (
    <section aria-label={`${cfg.label}, ${items.length} candidates`} className="flex w-[272px] shrink-0 snap-start flex-col">
      <header className="flex h-9 items-center gap-2 px-1.5">
        <span className="size-2 rounded-full" style={{ background: STAGE_TONE[stage] }} aria-hidden />
        <h3 className="truncate text-[13px] font-semibold">{cfg.label}</h3>
        <span className="tabular rounded bg-muted px-1.5 text-[11px] font-medium leading-[18px] text-muted-foreground">{items.length}</span>
        {late > 0 && (
          <Tooltip content={`${late} over the ${cfg.slaDays}-day target`}>
            <span className="tabular inline-flex items-center gap-1 text-[11px] text-warning"><Info className="size-3" />{late}</span>
          </Tooltip>
        )}
        {onAddCandidate && (
          <Tooltip content="Add candidate">
            <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={onAddCandidate} aria-label="Add candidate to Applied"><Plus /></Button>
          </Tooltip>
        )}
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-transparent bg-[color-mix(in_oklch,var(--muted)_70%,transparent)] p-1.5 transition-colors duration-150",
          highlight && "border-brand/30 bg-brand-soft/60",
          dragging && !highlight && "bg-muted/50",
        )}
      >
        <SortableContext id={stage} items={items} strategy={verticalListSortingStrategy}>
          {items.map((id) => {
            const data = byId.get(id);
            return data ? <SortableCard key={id} data={data} onOpen={() => onOpen(id)} /> : null;
          })}
        </SortableContext>
        {items.length === 0 && (
          <div className={cn("flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong/70 px-3 py-6 text-center text-xs text-subtle-foreground transition-colors", highlight && "border-brand/50 text-brand")}>
            {dragging ? "Drop here" : "No candidates"}
          </div>
        )}
      </div>
    </section>
  );
}

function SortableCard({ data, onOpen }: { data: CardData; onOpen: () => void }) {
  const ui = useUI();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: data.app.id, data: { stage: data.app.stage } });
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(data.app.stage) + 1];
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <CandidateCard
        data={data}
        dragging={isDragging}
        onOpen={onOpen}
        handleProps={{ ...attributes, ...listeners, "aria-roledescription": "Draggable candidate", "aria-label": `${fullName(data.candidate)}, ${data.stage.label}` } as React.HTMLAttributes<HTMLDivElement>}
        onAdvance={next && next !== "hired" ? () => moveStage(data.app, next) : undefined}
        onSchedule={() => ui.scheduleInterview({ candidateId: data.candidate.id, applicationId: data.app.id })}
        onEmail={() => ui.sendEmail(data.candidate.id)}
        onReject={() => ui.reject(data.app.id)}
      />
    </div>
  );
}
