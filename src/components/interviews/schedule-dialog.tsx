"use client";
import * as React from "react";
import { CalendarPlus, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Segmented } from "@/components/ui/controls";
import { CandidatePicker, TeamPicker } from "@/components/common/pickers";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { INTERVIEW_KINDS, MEETING_TYPES } from "@/lib/constants";
import type { ID, InterviewKind, MeetingType, StageId } from "@/lib/types";
import { fullName } from "@/lib/api/selectors";

export interface SchedulePrefill { candidateId?: ID; applicationId?: ID; date?: string; time?: string; kind?: InterviewKind }

const kindForStage: Partial<Record<StageId, InterviewKind>> = { applied: "Screening call", screening: "Screening call", hr_interview: "HR interview", hm_interview: "Hiring manager interview", technical: "Technical interview", final_review: "Final interview" };

export function ScheduleInterviewDialog({ prefill, onClose }: { prefill: SchedulePrefill | null; onClose: () => void }) {
  return (
    <Dialog open={!!prefill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">{prefill && <ScheduleForm prefill={prefill} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ prefill, onClose }: { prefill: SchedulePrefill; onClose: () => void }) {
  const db = useDb();
  const initialApp = prefill.applicationId ? db.applications.find((a) => a.id === prefill.applicationId) : undefined;
  const [candidateId, setCandidateId] = React.useState<ID | undefined>(prefill.candidateId ?? initialApp?.candidateId);
  const apps = db.applications.filter((a) => a.candidateId === candidateId && a.status === "active");
  const [applicationId, setApplicationId] = React.useState<ID | undefined>(initialApp?.id ?? apps[0]?.id);
  const app = db.applications.find((a) => a.id === applicationId);
  const job = app ? db.jobs.find((j) => j.id === app.jobId) : undefined;

  const tomorrow = new Date(Date.now() + 864e5);
  const [kind, setKind] = React.useState<InterviewKind>(prefill.kind ?? (app ? kindForStage[app.stage] : undefined) ?? "HR interview");
  const [date, setDate] = React.useState(prefill.date ?? format(tomorrow, "yyyy-MM-dd"));
  const [time, setTime] = React.useState(prefill.time ?? "10:00");
  const [duration, setDuration] = React.useState("45");
  const [meetingType, setMeetingType] = React.useState<MeetingType>("Video");
  const [location, setLocation] = React.useState("");
  const [interviewers, setInterviewers] = React.useState<ID[]>(() => (job ? [kind.includes("Hiring") || kind.includes("Final") ? job.hiringManagerId : job.recruiterId] : [db.currentUserId]));
  const [notes, setNotes] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!apps.find((a) => a.id === applicationId)) setApplicationId(apps[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const start = new Date(`${date}T${time}`);
  const end = new Date(start.getTime() + Number(duration) * 60000);
  const conflicts = db.interviews.filter((i) => i.status === "scheduled" && i.interviewerIds.some((x) => interviewers.includes(x)) && new Date(i.start) < end && new Date(new Date(i.start).getTime() + i.durationMin * 60000) > start);
  const errors = {
    candidate: !candidateId ? "Choose a candidate" : !applicationId ? "This candidate has no active application" : undefined,
    date: isNaN(start.getTime()) ? "Pick a valid date and time" : start < new Date() ? "Choose a time in the future" : undefined,
    interviewers: interviewers.length === 0 ? "Add at least one interviewer" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || !app) return;
    await api.interviews.schedule({ candidateId: app.candidateId, jobId: app.jobId, applicationId: app.id, kind, start: start.toISOString(), durationMin: Number(duration), meetingType, location: location || undefined, interviewerIds: interviewers, notes: notes || undefined });
    const c = db.candidates.find((x) => x.id === app.candidateId)!;
    toast.success(`Interview scheduled with ${fullName(c)}`, { description: `${format(start, "EEE d MMM, HH:mm")} · No calendar invite was sent — calendar sync isn't connected.` });
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogHeader icon={<CalendarPlus />} title="Schedule interview" description="Plan the conversation and who joins it." />
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Candidate" required error={submitted ? errors.candidate : undefined} className="sm:col-span-2">
          <CandidatePicker value={candidateId} onChange={setCandidateId} onlyActive invalid={submitted && !!errors.candidate} />
        </Field>
        {apps.length > 1 && (
          <Field label="For job" className="sm:col-span-2">
            <Select value={applicationId} onValueChange={setApplicationId} options={apps.map((a) => ({ value: a.id, label: db.jobs.find((j) => j.id === a.jobId)?.title ?? "" }))} />
          </Field>
        )}
        {job && apps.length === 1 && <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">For <span className="font-medium text-foreground">{job.title}</span> · {job.location}</p>}
        <Field label="Interview type">
          <Select value={kind} onValueChange={(v) => setKind(v as InterviewKind)} options={INTERVIEW_KINDS.map((k) => ({ value: k, label: k }))} />
        </Field>
        <Field label="Format">
          <Segmented ariaLabel="Meeting type" value={meetingType} onChange={setMeetingType} options={MEETING_TYPES.map((m) => ({ value: m, label: m }))} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
        </Field>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:col-span-2">
          <Field label="Date" required error={submitted ? errors.date : undefined}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={(submitted && !!errors.date) || undefined} />
          </Field>
          <Field label="Start">
            <Input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} className="w-28" />
          </Field>
          <Field label="Duration">
            <Select value={duration} onValueChange={setDuration} className="w-28" options={["15", "30", "45", "60", "90", "120"].map((d) => ({ value: d, label: `${d} min` }))} />
          </Field>
        </div>
        <Field label="Interviewers" required error={submitted ? errors.interviewers : undefined} className="sm:col-span-2">
          <TeamPicker value={interviewers} onChange={setInterviewers} multiple placeholder="Add interviewers" invalid={submitted && !!errors.interviewers} />
        </Field>
        {conflicts.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs sm:col-span-2" role="status">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>
              Possible conflict: {conflicts.length} overlapping interview{conflicts.length > 1 ? "s" : ""} for selected interviewers (
              {conflicts.slice(0, 2).map((c) => format(new Date(c.start), "HH:mm")).join(", ")}).
            </span>
          </div>
        )}
        <Field label={meetingType === "On-site" ? "Location" : meetingType === "Video" ? "Meeting link" : "Phone number"} hint={meetingType === "Video" ? "Paste a link, or leave empty — links are generated once a calendar is connected." : undefined} className="sm:col-span-2">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={meetingType === "On-site" ? `${job?.location ?? "Paris"} office, 3rd floor` : meetingType === "Video" ? "https://meet.example/…" : "+33 …"} />
        </Field>
        <Field label="Notes for interviewers" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Focus areas, materials to review…" className="min-h-16" />
        </Field>
      </DialogBody>
      <DialogFooter hint={<span className="inline-flex items-center gap-1"><Info className="size-3.5" />Saved to Ulysse. Calendar invites need a connected calendar.</span>}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Schedule</Button>
      </DialogFooter>
    </form>
  );
}
