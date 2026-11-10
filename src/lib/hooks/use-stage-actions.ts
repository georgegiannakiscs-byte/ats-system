"use client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getState } from "@/lib/api/store";
import type { Application, StageId } from "@/lib/types";
import { fullName } from "@/lib/api/selectors";

/** Moves an application to a new stage with an undoable toast. */
export function moveStage(app: Application, stage: StageId, index?: number) {
  if (app.stage === stage && index === undefined) return;
  const db = getState();
  const prev = { stage: app.stage, order: app.order, status: app.status, stageEnteredAt: app.stageEnteredAt };
  api.applications.move(app.id, stage, index);
  if (prev.stage === stage) return;
  const c = db.candidates.find((x) => x.id === app.candidateId)!;
  const label = db.stages.find((s) => s.id === stage)?.label;
  toast(stage === "hired" ? `${fullName(c)} marked as hired` : `${fullName(c)} → ${label}`, {
    description: stage === "hired" ? "Congratulations to the team." : undefined,
    action: { label: "Undo", onClick: () => api.applications.move(app.id, prev.stage, prev.order) },
  });
}
