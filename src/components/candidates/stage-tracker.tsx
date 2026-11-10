"use client";
import { Check } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { STAGE_ORDER } from "@/lib/constants";
import type { Application } from "@/lib/types";
import { cn, daysSince } from "@/lib/utils";
import { moveStage } from "@/lib/hooks/use-stage-actions";
import { Tooltip } from "@/components/ui/overlays";

/** Horizontal progress of an application through the pipeline. Steps are clickable. */
export function StageTracker({ app }: { app: Application }) {
  const db = useDb();
  const current = STAGE_ORDER.indexOf(app.stage);
  const rejected = app.status === "rejected";
  const stageCfg = db.stages.find((s) => s.id === app.stage)!;
  const days = daysSince(app.stageEnteredAt);
  const late = stageCfg.slaDays > 0 && days > stageCfg.slaDays && !rejected;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {rejected ? <span className="text-destructive">Rejected at {stageCfg.label}</span> : stageCfg.label}
          <span className="ml-1.5 font-normal text-muted-foreground">· {days === 0 ? "entered today" : `${days}d in stage`}</span>
          {late && <span className="ml-1.5 font-normal text-warning">· over {stageCfg.slaDays}d target</span>}
        </span>
        <span className="tabular text-subtle-foreground">Step {current + 1} of {STAGE_ORDER.length}</span>
      </div>
      <ol className="flex gap-1" aria-label="Pipeline progress">
        {db.stages.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex-1">
              <Tooltip content={active ? `${s.label} (current)` : `Move to ${s.label}`}>
                <button
                  type="button"
                  disabled={rejected}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${s.label}${active ? ", current stage" : done ? ", completed" : ""}`}
                  onClick={() => moveStage(app, s.id)}
                  className={cn(
                    "group relative block h-1.5 w-full rounded-full outline-none transition-all hover:h-2.5 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
                    rejected ? (i <= current ? "bg-destructive/40" : "bg-muted") : done ? "bg-brand/70" : active ? "bg-brand" : "bg-muted hover:bg-border-strong",
                  )}
                >
                  {active && !rejected && <span className="absolute -top-px right-0 size-2 translate-x-1/2 rounded-full border-2 border-surface bg-brand" />}
                  <span className="sr-only">{done && <Check />}</span>
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
