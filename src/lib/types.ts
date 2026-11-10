/**
 * Domain types. These mirror the shapes a future REST/GraphQL API would return,
 * so the mock layer in `lib/api` can later be swapped for real endpoints.
 */

export type ID = string;
export type ISODate = string;

export type StageId =
  | "applied"
  | "screening"
  | "hr_interview"
  | "hm_interview"
  | "technical"
  | "final_review"
  | "offer"
  | "hired";

export interface StageConfig {
  id: StageId;
  label: string;
  description: string;
  /** Target number of days a candidate should spend in this stage. */
  slaDays: number;
}

export type Role = "Admin" | "Recruiter" | "Hiring Manager" | "Interviewer";

export interface TeamMember {
  id: ID;
  name: string;
  email: string;
  title: string;
  role: Role;
  department: string;
  /** Hue (0–360) used for the subtle avatar tint. */
  hue: number;
  status: "active" | "invited";
}

export type JobStatus = "draft" | "published" | "on_hold" | "closed";
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship";
export type Workplace = "On-site" | "Hybrid" | "Remote";
export type Seniority = "Junior" | "Mid-level" | "Senior" | "Lead" | "Principal";

export interface Job {
  id: ID;
  title: string;
  department: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  seniority: Seniority;
  status: JobStatus;
  hiringManagerId: ID;
  recruiterId: ID;
  openings: number;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  skills: string[];
  createdAt: ISODate;
  publishedAt?: ISODate;
  targetHireDate?: ISODate;
  /** Channels where the job is shown. External channels are demo flags only. */
  channels: { careersPage: boolean; linkedin: boolean; indeed: boolean };
}

export type Source =
  | "LinkedIn"
  | "Careers page"
  | "Referral"
  | "Welcome to the Jungle"
  | "Indeed"
  | "Agency"
  | "Sourced";

export interface Experience {
  title: string;
  company: string;
  start: string; // "2021"
  end?: string; // undefined = present
  description?: string;
}

export interface Education {
  school: string;
  degree: string;
  year: string;
}

export interface Candidate {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  currentCompany: string;
  linkedinUrl?: string;
  source: Source;
  tags: string[];
  skills: string[];
  experience: Experience[];
  education: Education[];
  summary: string;
  languages: string[];
  hue: number;
  createdAt: ISODate;
  /** Whether the candidate is saved in the talent pool. */
  inTalentPool: boolean;
}

export type ApplicationStatus = "active" | "rejected" | "hired" | "withdrawn";
export type Evaluation = "none" | "pending" | "positive" | "mixed" | "negative";

export interface Application {
  id: ID;
  candidateId: ID;
  jobId: ID;
  stage: StageId;
  status: ApplicationStatus;
  appliedAt: ISODate;
  stageEnteredAt: ISODate;
  recruiterId: ID;
  evaluation: Evaluation;
  /** Sort order within a pipeline column. */
  order: number;
  rejectionReason?: string;
}

export interface Note {
  id: ID;
  candidateId: ID;
  authorId: ID;
  body: string;
  createdAt: ISODate;
  pinned?: boolean;
}

export type InterviewKind = "HR interview" | "Hiring manager interview" | "Technical interview" | "Culture & values" | "Final interview" | "Screening call";
export type MeetingType = "Video" | "On-site" | "Phone";
export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Interview {
  id: ID;
  candidateId: ID;
  jobId: ID;
  applicationId: ID;
  kind: InterviewKind;
  start: ISODate;
  durationMin: number;
  meetingType: MeetingType;
  location?: string;
  interviewerIds: ID[];
  status: InterviewStatus;
  notes?: string;
  createdAt: ISODate;
}

export type Recommendation = "strong_no" | "no" | "yes" | "strong_yes";

export interface ScoreCriterion {
  id: string;
  label: string;
  description: string;
  score: number; // 0 = not rated, 1–4
}

export interface Scorecard {
  id: ID;
  interviewId?: ID;
  candidateId: ID;
  jobId: ID;
  authorId: ID;
  criteria: ScoreCriterion[];
  recommendation: Recommendation;
  summary: string;
  submittedAt: ISODate;
}

export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: ID;
  title: string;
  description?: string;
  dueDate: ISODate;
  assigneeId: ID;
  priority: TaskPriority;
  done: boolean;
  candidateId?: ID;
  jobId?: ID;
  createdAt: ISODate;
  completedAt?: ISODate;
}

export type ActivityKind =
  | "applied"
  | "stage_changed"
  | "note_added"
  | "interview_scheduled"
  | "scorecard_submitted"
  | "rejected"
  | "hired"
  | "job_created"
  | "job_updated"
  | "job_published"
  | "task_completed"
  | "candidate_updated"
  | "email_drafted"
  | "talent_pool";

export interface Activity {
  id: ID;
  kind: ActivityKind;
  actorId?: ID;
  candidateId?: ID;
  jobId?: ID;
  message: string;
  createdAt: ISODate;
}

export interface TalentList {
  id: ID;
  name: string;
  description?: string;
  candidateIds: ID[];
  createdAt: ISODate;
}

export interface CandidateFilters {
  search: string;
  stages: StageId[];
  jobIds: ID[];
  sources: Source[];
  recruiterIds: ID[];
  evaluations: Evaluation[];
  status: ApplicationStatus | "all";
}

export type CandidateColumn = "position" | "job" | "source" | "stage" | "applied" | "recruiter" | "evaluation" | "location";

export interface SavedView {
  id: ID;
  name: string;
  filters: CandidateFilters;
  columns: CandidateColumn[];
  sort: { key: string; dir: "asc" | "desc" };
  system?: boolean;
}

export interface EmailTemplate {
  id: ID;
  name: string;
  category: "Application" | "Interview" | "Offer" | "Rejection";
  subject: string;
  body: string;
  updatedAt: ISODate;
}

export type IntegrationId = "linkedin" | "google_calendar" | "outlook" | "gmail" | "smtp";
export type IntegrationState = "not_connected" | "demo_connected" | "pending_approval";

export interface CompanyProfile {
  name: string;
  legalName: string;
  website: string;
  industry: string;
  size: string;
  headquarters: string;
  about: string;
  careersUrl: string;
}

export interface NotificationPrefs {
  newApplication: boolean;
  stageChange: boolean;
  interviewReminder: boolean;
  scorecardDue: boolean;
  taskDue: boolean;
  weeklyDigest: boolean;
  mentions: boolean;
}

export interface AppNotification {
  id: ID;
  title: string;
  body: string;
  href: string;
  createdAt: ISODate;
  read: boolean;
}

export interface Database {
  version: number;
  currentUserId: ID;
  company: CompanyProfile;
  stages: StageConfig[];
  team: TeamMember[];
  jobs: Job[];
  candidates: Candidate[];
  applications: Application[];
  notes: Note[];
  interviews: Interview[];
  scorecards: Scorecard[];
  tasks: Task[];
  activities: Activity[];
  talentLists: TalentList[];
  savedViews: SavedView[];
  emailTemplates: EmailTemplate[];
  integrations: Record<IntegrationId, IntegrationState>;
  notificationPrefs: NotificationPrefs;
  notifications: AppNotification[];
}
