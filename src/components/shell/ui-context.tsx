"use client";
/**
 * Global overlay controller. Any screen can open the candidate preview,
 * scheduling, task, email, reject or scorecard flows with one call -
 * so recruiters never have to leave the page they are on.
 */
import * as React from "react";
import type { ID, Task } from "@/lib/types";
import { CandidateSheet } from "@/components/candidates/candidate-sheet";
import { ScheduleInterviewDialog, type SchedulePrefill } from "@/components/interviews/schedule-dialog";
import { ScorecardDialog, type ScorecardTarget } from "@/components/interviews/scorecard-dialog";
import { TaskDialog, type TaskPrefill } from "@/components/tasks/task-dialog";
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog";
import { EmailDialog } from "@/components/candidates/email-dialog";
import { RejectDialog } from "@/components/candidates/reject-dialog";
import { AddToJobDialog } from "@/components/candidates/add-to-job-dialog";

interface UI {
  openCandidate: (id: ID, opts?: { applicationId?: ID; list?: ID[] }) => void;
  scheduleInterview: (prefill?: SchedulePrefill) => void;
  openScorecard: (target: ScorecardTarget) => void;
  openTask: (prefill?: TaskPrefill | Task) => void;
  addCandidate: (jobId?: ID) => void;
  sendEmail: (candidateId: ID) => void;
  reject: (applicationId: ID) => void;
  addToJob: (candidateIds: ID[]) => void;
  openCommand: () => void;
  registerCommand: (fn: () => void) => void;
}

const Ctx = React.createContext<UI | null>(null);
export const useUI = () => React.useContext(Ctx)!;

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [candidate, setCandidate] = React.useState<{ id: ID; applicationId?: ID; list?: ID[] } | null>(null);
  const [schedule, setSchedule] = React.useState<SchedulePrefill | null>(null);
  const [scorecard, setScorecard] = React.useState<ScorecardTarget | null>(null);
  const [task, setTask] = React.useState<TaskPrefill | Task | null>(null);
  const [addCand, setAddCand] = React.useState<{ jobId?: ID } | null>(null);
  const [email, setEmail] = React.useState<ID | null>(null);
  const [rejectId, setRejectId] = React.useState<ID | null>(null);
  const [addToJob, setAddToJob] = React.useState<ID[] | null>(null);
  const commandRef = React.useRef<() => void>(() => {});

  const ui = React.useMemo<UI>(
    () => ({
      openCandidate: (id, opts) => setCandidate({ id, ...opts }),
      scheduleInterview: (p) => setSchedule(p ?? {}),
      openScorecard: setScorecard,
      openTask: (p) => setTask(p ?? {}),
      addCandidate: (jobId) => setAddCand({ jobId }),
      sendEmail: setEmail,
      reject: setRejectId,
      addToJob: setAddToJob,
      openCommand: () => commandRef.current(),
      registerCommand: (fn) => (commandRef.current = fn),
    }),
    [],
  );

  return (
    <Ctx.Provider value={ui}>
      {children}
      <CandidateSheet state={candidate} onNavigate={(id) => setCandidate((c) => (c ? { ...c, id, applicationId: undefined } : c))} onClose={() => setCandidate(null)} />
      <ScheduleInterviewDialog prefill={schedule} onClose={() => setSchedule(null)} />
      <ScorecardDialog target={scorecard} onClose={() => setScorecard(null)} />
      <TaskDialog prefill={task} onClose={() => setTask(null)} />
      <AddCandidateDialog state={addCand} onClose={() => setAddCand(null)} />
      <EmailDialog candidateId={email} onClose={() => setEmail(null)} />
      <RejectDialog applicationId={rejectId} onClose={() => setRejectId(null)} />
      <AddToJobDialog candidateIds={addToJob} onClose={() => setAddToJob(null)} />
    </Ctx.Provider>
  );
}
