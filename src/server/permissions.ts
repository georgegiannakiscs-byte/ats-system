/**
 * Company-level roles and permissions. Evaluated per organisation membership:
 * the same user can hold different roles in different companies.
 * Platform Super Admin is a separate flag on the user and grants NO company data access.
 */
export type OrgRole = "admin" | "recruiter" | "hiring_manager" | "interviewer";

export type Permission =
  | "workspace.view"
  | "jobs.manage"
  | "candidates.view"
  | "candidates.edit"
  | "pipeline.move"
  | "cv.download"
  | "notes.write"
  | "interviews.manage"
  | "feedback.submit"
  | "tasks.manage"
  | "settings.manage"
  | "team.manage"
  | "branding.manage"
  | "analytics.view"
  | "assessments.view"
  | "assessments.manage";

const MATRIX: Record<OrgRole, Permission[]> = {
  admin: ["workspace.view", "jobs.manage", "candidates.view", "candidates.edit", "pipeline.move", "cv.download", "notes.write", "interviews.manage", "feedback.submit", "tasks.manage", "settings.manage", "team.manage", "branding.manage", "analytics.view", "assessments.view", "assessments.manage"],
  recruiter: ["workspace.view", "jobs.manage", "candidates.view", "candidates.edit", "pipeline.move", "cv.download", "notes.write", "interviews.manage", "feedback.submit", "tasks.manage", "analytics.view", "assessments.view", "assessments.manage"],
  hiring_manager: ["workspace.view", "candidates.view", "candidates.edit", "pipeline.move", "cv.download", "notes.write", "interviews.manage", "feedback.submit", "tasks.manage", "analytics.view", "assessments.view"],
  interviewer: ["workspace.view", "candidates.view", "notes.write", "feedback.submit", "tasks.manage"],
};

export const can = (role: OrgRole, p: Permission) => MATRIX[role]?.includes(p) ?? false;
export const permissionsFor = (role: OrgRole) => MATRIX[role] ?? [];

export const ROLE_LABEL: Record<OrgRole, string> = { admin: "Admin", recruiter: "Recruiter", hiring_manager: "Hiring Manager", interviewer: "Interviewer" };
export const ROLE_FROM_LABEL: Record<string, OrgRole> = { Admin: "admin", Recruiter: "recruiter", "Hiring Manager": "hiring_manager", Interviewer: "interviewer" };
