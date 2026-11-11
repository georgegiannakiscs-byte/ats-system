import type { Evaluation, JobStatus, Recommendation, ScoreCriterion, Source, StageId, TaskPriority, InterviewKind, MeetingType, EmploymentType, Workplace, Seniority, CandidateColumn } from "@/lib/types";

export const STAGE_ORDER: StageId[] = ["applied", "screening", "hr_interview", "hm_interview", "technical", "final_review", "offer", "hired"];

/** Subtle per-stage dot colours — a calm progression toward the accent and finally green. */
export const STAGE_TONE: Record<StageId, string> = {
  applied: "#c9c4b8",
  screening: "#a9bdb2",
  hr_interview: "#86a596",
  hm_interview: "#5f8a76",
  technical: "#7c8ea0",
  final_review: "#c9a46a",
  offer: "#be7157",
  hired: "#3f7a5f",
};

export const DEPARTMENTS = ["Engineering", "Design", "Product", "Data", "Client Services", "Marketing", "People", "Finance"];
export const SOURCES: Source[] = ["LinkedIn", "Careers page", "Referral", "Welcome to the Jungle", "Indeed", "Agency", "Sourced"];
export const EMPLOYMENT_TYPES: EmploymentType[] = ["Full-time", "Part-time", "Contract", "Internship"];
export const WORKPLACES: Workplace[] = ["On-site", "Hybrid", "Remote"];
export const SENIORITIES: Seniority[] = ["Junior", "Mid-level", "Senior", "Lead", "Principal"];
export const INTERVIEW_KINDS: InterviewKind[] = ["Screening call", "HR interview", "Hiring manager interview", "Technical interview", "Culture & values", "Final interview"];
export const MEETING_TYPES: MeetingType[] = ["Video", "On-site", "Phone"];

export const JOB_STATUS: Record<JobStatus, { label: string; tone: "success" | "neutral" | "warning" | "muted" }> = {
  published: { label: "Published", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  on_hold: { label: "On hold", tone: "warning" },
  closed: { label: "Closed", tone: "muted" },
  archived: { label: "Archived", tone: "muted" },
};

export const EVALUATION: Record<Evaluation, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "muted" }> = {
  none: { label: "Not evaluated", tone: "muted" },
  pending: { label: "Feedback pending", tone: "warning" },
  positive: { label: "Positive", tone: "success" },
  mixed: { label: "Mixed", tone: "neutral" },
  negative: { label: "Negative", tone: "danger" },
};

export const RECOMMENDATION: Record<Recommendation, { label: string; short: string; tone: "success" | "danger" }> = {
  strong_yes: { label: "Strong yes", short: "Strong yes", tone: "success" },
  yes: { label: "Yes", short: "Yes", tone: "success" },
  no: { label: "No", short: "No", tone: "danger" },
  strong_no: { label: "Strong no", short: "Strong no", tone: "danger" },
};

export const PRIORITY: Record<TaskPriority, { label: string; className: string }> = {
  high: { label: "High", className: "text-destructive" },
  medium: { label: "Medium", className: "text-warning" },
  low: { label: "Low", className: "text-muted-foreground" },
};

export const DEFAULT_CRITERIA: ScoreCriterion[] = [
  { id: "craft", label: "Craft & expertise", description: "Depth of skills relevant to the role", score: 0 },
  { id: "problem", label: "Problem solving", description: "Structures ambiguous problems and reasons about trade-offs", score: 0 },
  { id: "communication", label: "Communication", description: "Clear, concise and adapts to the audience", score: 0 },
  { id: "collaboration", label: "Collaboration", description: "Works well with others; gives and receives feedback", score: 0 },
  { id: "motivation", label: "Motivation & fit", description: "Genuine interest in the role and our way of working", score: 0 },
];

export const SCORE_LABELS = ["Not rated", "Poor", "Fair", "Good", "Excellent"];

export const CANDIDATE_COLUMNS: { id: CandidateColumn; label: string }[] = [
  { id: "position", label: "Current position" },
  { id: "job", label: "Applied job" },
  { id: "source", label: "Source" },
  { id: "stage", label: "Stage" },
  { id: "applied", label: "Applied" },
  { id: "recruiter", label: "Recruiter" },
  { id: "evaluation", label: "Evaluation" },
  { id: "location", label: "Location" },
];

export function emptyFilters(): import("@/lib/types").CandidateFilters {
  return { search: "", stages: [], jobIds: [], sources: [], recruiterIds: [], evaluations: [], status: "active" };
}

export const WITHDRAWAL_REASONS = ["Accepted another offer", "No longer looking", "Compensation", "Location or relocation", "Personal reasons", "Other"];

export const REJECTION_REASONS = [
  "Not enough relevant experience",
  "Skills mismatch",
  "Salary expectations",
  "Position filled",
  "Candidate withdrew",
  "Culture add concerns",
  "Other",
];
