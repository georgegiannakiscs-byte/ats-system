import { z } from "zod";

/**
 * Structured CV produced by the Ulysse CV Builder. Only fullName and email are required;
 * every section is optional. Shared by the builder UI, the PDF renderer and server validation.
 * Deliberately contains no date of birth, address, nationality, marital status or similar fields.
 */
const s = (max: number) => z.string().trim().max(max);
const url = z.string().trim().max(300).refine((v) => !v || /^https?:\/\/\S+\.\S+/i.test(v), "Use a full URL starting with https://");
const ym = z.string().trim().max(20); // free text "2021", "03/2021", "Mar 2021"

export const CV_TEMPLATES = ["minimal", "modern", "professional"] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

export const CvDataSchema = z.object({
  personal: z.object({
    fullName: s(160).min(2, "Enter your full name"),
    email: z.string().trim().email("Enter a valid email address").max(254),
    phone: s(40).default(""),
    location: s(120).default(""),
    country: s(80).default(""),
    linkedinUrl: url.default(""),
    portfolioUrl: url.default(""),
    headline: s(160).default(""),
  }),
  photoShape: z.enum(["circle", "rectangle"]).default("circle"),
  summary: s(2000).default(""),
  experience: z.array(z.object({
    id: s(40), title: s(160), company: s(160), start: ym, end: ym, current: z.boolean().default(false),
    description: s(2000).default(""), responsibilities: s(3000).default(""), achievements: s(3000).default(""),
  })).max(20).default([]),
  education: z.array(z.object({
    id: s(40), institution: s(200), degree: s(200), field: s(200).default(""), start: ym, end: ym, description: s(1500).default(""),
  })).max(15).default([]),
  skills: z.array(s(60)).max(60).default([]),
  languages: z.array(z.object({ id: s(40), language: s(60), level: s(40).default("") })).max(15).default([]),
  certifications: z.array(z.object({ id: s(40), name: s(200), issuer: s(200).default(""), date: ym, url: url.default("") })).max(20).default([]),
  projects: z.array(z.object({ id: s(40), name: s(200), role: s(160).default(""), description: s(2000).default(""), technologies: s(400).default(""), url: url.default("") })).max(20).default([]),
  additional: z.object({
    publications: s(3000).default(""), awards: s(3000).default(""), volunteering: s(3000).default(""), links: s(1500).default(""), other: s(3000).default(""),
  }).default({ publications: "", awards: "", volunteering: "", links: "", other: "" }),
});

export type CvData = z.infer<typeof CvDataSchema>;

export function emptyCv(fullName = "", email = ""): CvData {
  return {
    personal: { fullName, email, phone: "", location: "", country: "", linkedinUrl: "", portfolioUrl: "", headline: "" },
    photoShape: "circle",
    summary: "",
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    additional: { publications: "", awards: "", volunteering: "", links: "", other: "" },
  };
}

/** Section headings for both languages used on the CV itself. */
export const CV_LABELS = {
  en: { summary: "Profile", experience: "Experience", education: "Education", skills: "Skills", languages: "Languages", certifications: "Certifications", projects: "Projects", publications: "Publications", awards: "Awards", volunteering: "Volunteering", links: "Links", other: "Additional information", present: "Present", responsibilities: "Responsibilities", achievements: "Achievements", technologies: "Technologies" },
  el: { summary: "Προφίλ", experience: "Επαγγελματική εμπειρία", education: "Εκπαίδευση", skills: "Δεξιότητες", languages: "Γλώσσες", certifications: "Πιστοποιήσεις", projects: "Έργα", publications: "Δημοσιεύσεις", awards: "Διακρίσεις", volunteering: "Εθελοντισμός", links: "Σύνδεσμοι", other: "Επιπλέον πληροφορίες", present: "Σήμερα", responsibilities: "Αρμοδιότητες", achievements: "Επιτεύγματα", technologies: "Τεχνολογίες" },
} as const;
export type CvLang = keyof typeof CV_LABELS;

export const dateRange = (start: string, end: string, current: boolean | undefined, lang: CvLang) =>
  [start, current ? CV_LABELS[lang].present : end].filter(Boolean).join(" – ");
