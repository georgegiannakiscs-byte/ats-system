import "server-only";

/** Row shape returned to the platform admin (no internal storage keys). */
export const TALENT_COLUMNS = `id, full_name, email, current_company, role, phone, language, consent_at, source, utm_source, utm_medium, utm_campaign,
  cv_file_name, cv_mime, cv_size, cv_scan_status, cv_source, status, admin_notes, created_at, updated_at`;

export type TalentRow = {
  id: string; full_name: string; email: string; current_company: string; role: string; phone: string; language: string; consent_at: Date;
  source: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  cv_file_name: string; cv_mime: string; cv_size: number; cv_scan_status: string; cv_source: string; status: string; admin_notes: string; created_at: Date; updated_at: Date;
};

export const toLead = (r: TalentRow) => ({
  id: r.id, fullName: r.full_name, email: r.email, currentCompany: r.current_company, role: r.role, phone: r.phone, language: r.language,
  consentAt: r.consent_at, source: r.source, utm: { source: r.utm_source, medium: r.utm_medium, campaign: r.utm_campaign },
  cv: { fileName: r.cv_file_name, mime: r.cv_mime, size: r.cv_size, scanStatus: r.cv_scan_status, source: r.cv_source },
  status: r.status, adminNotes: r.admin_notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const TALENT_STATUSES = ["new", "reviewed", "contacted", "archived"] as const;
