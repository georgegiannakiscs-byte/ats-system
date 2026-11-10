/**
 * DEMO DATA — deterministic seed for a fictional digital-services company.
 * Every person, company and email address here is fictional.
 */
import type {
  Activity,
  Application,
  Candidate,
  Database,
  EmailTemplate,
  Evaluation,
  Interview,
  InterviewKind,
  Job,
  Note,
  Scorecard,
  Source,
  StageConfig,
  StageId,
  Task,
  TalentList,
  TeamMember,
} from "@/lib/types";
import { DEFAULT_CRITERIA } from "@/lib/constants";

export const DB_VERSION = 4;

/* Deterministic PRNG so the demo looks identical on every fresh load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeed(): Database {
  const rand = mulberry32(20261110);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const pickN = <T,>(arr: readonly T[], n: number) => {
    const copy = [...arr];
    const out: T[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    return out;
  };
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const at = (dayOffset: number, hour = 9, minute = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  /* ── Pipeline ─────────────────────────────────────────── */
  const stages: StageConfig[] = [
    { id: "applied", label: "Applied", description: "New applications awaiting review", slaDays: 3 },
    { id: "screening", label: "HR Screening", description: "CV and motivation review", slaDays: 4 },
    { id: "hr_interview", label: "HR Interview", description: "First conversation with Talent", slaDays: 5 },
    { id: "hm_interview", label: "Hiring Manager", description: "Interview with the hiring manager", slaDays: 6 },
    { id: "technical", label: "Technical Assessment", description: "Case study or technical exercise", slaDays: 7 },
    { id: "final_review", label: "Final Review", description: "Debrief and final decision", slaDays: 4 },
    { id: "offer", label: "Offer", description: "Offer prepared, sent or negotiated", slaDays: 5 },
    { id: "hired", label: "Hired", description: "Offer accepted", slaDays: 0 },
  ];

  /* ── Team ─────────────────────────────────────────────── */
  const team: TeamMember[] = [
    { id: "u_camille", name: "Camille Laurent", email: "camille.laurent@halcyon.example", title: "Head of Talent", role: "Admin", department: "People", hue: 268, status: "active" },
    { id: "u_theo", name: "Théo Marchand", email: "theo.marchand@halcyon.example", title: "Senior Recruiter", role: "Recruiter", department: "People", hue: 200, status: "active" },
    { id: "u_ines", name: "Inès Benali", email: "ines.benali@halcyon.example", title: "Technical Recruiter", role: "Recruiter", department: "People", hue: 330, status: "active" },
    { id: "u_lucas", name: "Lucas Petit", email: "lucas.petit@halcyon.example", title: "VP Engineering", role: "Hiring Manager", department: "Engineering", hue: 150, status: "active" },
    { id: "u_sofia", name: "Sofia Almeida", email: "sofia.almeida@halcyon.example", title: "Head of Design", role: "Hiring Manager", department: "Design", hue: 20, status: "active" },
    { id: "u_jonas", name: "Jonas Weber", email: "jonas.weber@halcyon.example", title: "Director of Product", role: "Hiring Manager", department: "Product", hue: 45, status: "active" },
    { id: "u_amelie", name: "Amélie Rousseau", email: "amelie.rousseau@halcyon.example", title: "Head of Client Services", role: "Hiring Manager", department: "Client Services", hue: 300, status: "active" },
    { id: "u_marc", name: "Marc Dubois", email: "marc.dubois@halcyon.example", title: "Staff Engineer", role: "Interviewer", department: "Engineering", hue: 230, status: "active" },
    { id: "u_elena", name: "Elena Rossi", email: "elena.rossi@halcyon.example", title: "Data Lead", role: "Interviewer", department: "Data", hue: 180, status: "active" },
    { id: "u_hugo", name: "Hugo Lefèvre", email: "hugo.lefevre@halcyon.example", title: "Marketing Director", role: "Hiring Manager", department: "Marketing", hue: 90, status: "invited" },
  ];

  /* ── Jobs ─────────────────────────────────────────────── */
  const jobBase = {
    currency: "EUR",
    channels: { careersPage: true, linkedin: false, indeed: false },
  };
  const jobs: Job[] = [
    {
      ...jobBase, id: "j_fe", title: "Senior Frontend Engineer", department: "Engineering", location: "Paris", workplace: "Hybrid", employmentType: "Full-time", seniority: "Senior", status: "published",
      hiringManagerId: "u_lucas", recruiterId: "u_ines", openings: 2, salaryMin: 65000, salaryMax: 80000,
      summary: "Join the Platform squad to shape the design system and client-facing applications used by millions of end users across our clients' products.",
      responsibilities: "Own complex product surfaces end to end\nEvolve our React and TypeScript design system\nPartner closely with design on interaction quality\nMentor engineers and raise the bar on accessibility",
      requirements: "6+ years building production web applications\nDeep knowledge of React, TypeScript and modern CSS\nA sharp eye for detail and motion\nExperience with performance profiling",
      skills: ["React", "TypeScript", "Next.js", "Design systems", "Accessibility"], createdAt: at(-38), publishedAt: at(-36), targetHireDate: at(30),
    },
    {
      ...jobBase, id: "j_pd", title: "Product Designer", department: "Design", location: "Lisbon", workplace: "Hybrid", employmentType: "Full-time", seniority: "Mid-level", status: "published",
      hiringManagerId: "u_sofia", recruiterId: "u_theo", openings: 1, salaryMin: 48000, salaryMax: 60000,
      summary: "Design calm, considered experiences for B2B products in fintech and mobility.",
      responsibilities: "Lead discovery and design for client engagements\nPrototype in Figma and code\nContribute to our shared design language",
      requirements: "3–5 years of product design experience\nA portfolio showing strong systems thinking\nComfortable presenting to clients",
      skills: ["Figma", "Prototyping", "UX research", "Design systems"], createdAt: at(-30), publishedAt: at(-28), targetHireDate: at(21),
    },
    {
      ...jobBase, id: "j_be", title: "Backend Engineer, Platform", department: "Engineering", location: "Berlin", workplace: "Remote", employmentType: "Full-time", seniority: "Mid-level", status: "published",
      hiringManagerId: "u_lucas", recruiterId: "u_ines", openings: 2, salaryMin: 60000, salaryMax: 75000,
      summary: "Build the services and data pipelines powering our clients' digital products.",
      responsibilities: "Design resilient APIs and event-driven services\nImprove observability and reliability\nCollaborate with product squads on delivery",
      requirements: "4+ years with Go, Kotlin or TypeScript on the server\nSolid understanding of PostgreSQL and distributed systems\nExperience with cloud infrastructure",
      skills: ["Go", "PostgreSQL", "Kubernetes", "AWS", "Event-driven"], createdAt: at(-24), publishedAt: at(-23), targetHireDate: at(40),
    },
    {
      ...jobBase, id: "j_pm", title: "Senior Product Manager", department: "Product", location: "Paris", workplace: "Hybrid", employmentType: "Full-time", seniority: "Senior", status: "published",
      hiringManagerId: "u_jonas", recruiterId: "u_theo", openings: 1, salaryMin: 70000, salaryMax: 85000,
      summary: "Lead strategy and delivery for our flagship mobility client.",
      responsibilities: "Define product strategy with client stakeholders\nRun discovery with design and engineering\nTranslate outcomes into a focused roadmap",
      requirements: "5+ years in product management\nB2B or platform product background\nExcellent written and verbal communication in English and French",
      skills: ["Product strategy", "Discovery", "Roadmapping", "Stakeholder management"], createdAt: at(-45), publishedAt: at(-44), targetHireDate: at(14),
    },
    {
      ...jobBase, id: "j_ds", title: "Data Scientist", department: "Data", location: "Paris", workplace: "Hybrid", employmentType: "Full-time", seniority: "Mid-level", status: "published",
      hiringManagerId: "u_lucas", recruiterId: "u_ines", openings: 1, salaryMin: 55000, salaryMax: 68000,
      summary: "Turn product data into decisions for retail and media clients.",
      responsibilities: "Build forecasting and recommendation models\nPartner with analysts on experimentation\nCommunicate results to non-technical audiences",
      requirements: "Strong Python and SQL\nExperience deploying models to production\nSolid statistics foundations",
      skills: ["Python", "SQL", "Machine learning", "Experimentation"], createdAt: at(-18), publishedAt: at(-16), targetHireDate: at(45),
    },
    {
      ...jobBase, id: "j_em", title: "Engineering Manager", department: "Engineering", location: "Lisbon", workplace: "Hybrid", employmentType: "Full-time", seniority: "Lead", status: "published",
      hiringManagerId: "u_lucas", recruiterId: "u_camille", openings: 1, salaryMin: 85000, salaryMax: 100000,
      summary: "Lead a team of eight engineers delivering a large-scale commerce platform.",
      responsibilities: "Grow and support a cross-functional team\nOwn delivery and engineering quality\nShape hiring and career frameworks",
      requirements: "3+ years managing engineering teams\nHands-on background in web or mobile\nExperience in client-facing environments",
      skills: ["Leadership", "Delivery", "Coaching", "Architecture"], createdAt: at(-52), publishedAt: at(-50), targetHireDate: at(7),
    },
    {
      ...jobBase, id: "j_csm", title: "Client Partner", department: "Client Services", location: "Paris", workplace: "On-site", employmentType: "Full-time", seniority: "Senior", status: "on_hold",
      hiringManagerId: "u_amelie", recruiterId: "u_theo", openings: 1, salaryMin: 60000, salaryMax: 72000,
      summary: "Own relationships with a portfolio of enterprise clients.",
      responsibilities: "Grow strategic accounts\nOrchestrate delivery teams around client outcomes\nLead quarterly business reviews",
      requirements: "6+ years in agency or consulting account leadership\nFluent French and English",
      skills: ["Account management", "Consulting", "Negotiation"], createdAt: at(-60), publishedAt: at(-58),
    },
    {
      ...jobBase, id: "j_mkt", title: "Content Marketing Lead", department: "Marketing", location: "Remote (EU)", workplace: "Remote", employmentType: "Full-time", seniority: "Lead", status: "draft",
      hiringManagerId: "u_hugo", recruiterId: "u_theo", openings: 1, salaryMin: 52000, salaryMax: 62000,
      summary: "Define our editorial voice and grow our thought leadership.",
      responsibilities: "Own the editorial calendar\nWrite and commission long-form content\nMeasure and iterate on content performance",
      requirements: "5+ years in B2B content marketing\nExceptional writing in English",
      skills: ["Content strategy", "Copywriting", "SEO"], createdAt: at(-3),
    },
    {
      ...jobBase, id: "j_qa", title: "QA Automation Engineer", department: "Engineering", location: "Lisbon", workplace: "Hybrid", employmentType: "Contract", seniority: "Mid-level", status: "closed",
      hiringManagerId: "u_lucas", recruiterId: "u_ines", openings: 1, salaryMin: 45000, salaryMax: 55000,
      summary: "Build test automation for mobile and web clients.",
      responsibilities: "Design end-to-end test suites\nIntegrate testing into CI pipelines",
      requirements: "3+ years of test automation\nPlaywright or Cypress experience",
      skills: ["Playwright", "CI/CD", "TypeScript"], createdAt: at(-90), publishedAt: at(-88),
    },
    {
      ...jobBase, id: "j_intern", title: "Design Intern", department: "Design", location: "Paris", workplace: "On-site", employmentType: "Internship", seniority: "Junior", status: "published",
      hiringManagerId: "u_sofia", recruiterId: "u_theo", openings: 2, salaryMin: 14000, salaryMax: 16000,
      summary: "A six-month internship within our product design team.",
      responsibilities: "Support designers on client projects\nRun usability tests\nContribute to the design system",
      requirements: "Final-year design student\nA portfolio showing curiosity and craft",
      skills: ["Figma", "Visual design", "Research"], createdAt: at(-12), publishedAt: at(-11), targetHireDate: at(60),
    },
  ];

  /* ── Candidates ───────────────────────────────────────── */
  const firstNames = ["Léa", "Antoine", "Chloé", "Maxime", "Manon", "Julien", "Sarah", "Nicolas", "Emma", "Thomas", "Clara", "Mehdi", "Zoé", "Raphaël", "Alice", "Yanis", "Louise", "Arthur", "Jade", "Gabriel", "Nora", "Paul", "Anaïs", "Victor", "Mia", "Baptiste", "Lina", "Adrien", "Eva", "Samuel", "Rita", "João", "Ana", "Pedro", "Lena", "Felix", "Hanna", "Matteo", "Giulia", "Oskar", "Freya", "Diego", "Amara", "Kenji", "Priya", "Omar", "Ingrid", "Tomás", "Elif", "Noah", "Margaux", "Romain", "Océane", "Bastien", "Hélène", "Quentin", "Salomé", "Aurélien"];
  const lastNames = ["Moreau", "Fontaine", "Girard", "Bonnet", "Lambert", "Mercier", "Faure", "Chevalier", "Garnier", "Rousseau", "Blanc", "Guerin", "Muller", "Henry", "Roussel", "Nicolas", "Perrin", "Morin", "Mathieu", "Clément", "Gauthier", "Dumont", "Lopez", "Fernandes", "Silva", "Costa", "Schneider", "Fischer", "Bianchi", "Larsen", "Nakamura", "Shah", "Haddad", "Okafor", "Novak", "Yilmaz", "Andersson", "Ricci", "Martins", "Kowalski"];
  const cities = ["Paris", "Lyon", "Lisbon", "Porto", "Berlin", "Amsterdam", "Bordeaux", "Nantes", "Barcelona", "Brussels", "Milan", "London", "Madrid", "Toulouse", "Lille"];
  const companies = ["Doctolib", "BlaBlaCar", "Back Market", "Qonto", "Alan", "Mirakl", "Contentsquare", "Deezer", "Spendesk", "Swile", "Pennylane", "Ledger", "N26", "Zalando", "Farfetch", "OutSystems", "Talkdesk", "Criteo", "Dataiku", "ManoMano", "Vinted", "Sorare"];
  const sources: Source[] = ["LinkedIn", "LinkedIn", "Careers page", "Careers page", "Referral", "Welcome to the Jungle", "Indeed", "Agency", "Sourced"];

  const profiles: Record<string, { titles: string[]; skills: string[]; schools: string[]; degrees: string[] }> = {
    j_fe: { titles: ["Frontend Engineer", "Senior Frontend Developer", "Software Engineer, Web", "UI Engineer"], skills: ["React", "TypeScript", "Next.js", "CSS", "GraphQL", "Testing", "Accessibility", "Performance", "Storybook"], schools: ["EPITA", "École 42", "INSA Lyon", "IST Lisbon"], degrees: ["MSc Computer Science", "BSc Software Engineering"] },
    j_pd: { titles: ["Product Designer", "UX/UI Designer", "Interaction Designer", "Digital Designer"], skills: ["Figma", "Prototyping", "UX research", "Design systems", "Motion", "Workshops", "Usability testing"], schools: ["ENSCI", "Strate", "ESAD Porto", "Gobelins"], degrees: ["MA Interaction Design", "BA Graphic Design"] },
    j_be: { titles: ["Backend Engineer", "Software Engineer", "Platform Engineer", "Go Developer"], skills: ["Go", "PostgreSQL", "Kubernetes", "AWS", "Kafka", "gRPC", "Terraform", "Kotlin"], schools: ["TU Berlin", "Polytechnique", "Centrale Lyon", "FEUP"], degrees: ["MSc Computer Science", "MEng Software Systems"] },
    j_pm: { titles: ["Product Manager", "Senior Product Manager", "Product Owner", "Group PM"], skills: ["Product strategy", "Discovery", "Roadmapping", "Analytics", "Stakeholder management", "A/B testing"], schools: ["HEC Paris", "ESSEC", "INSEAD", "Nova SBE"], degrees: ["MSc Management", "MBA"] },
    j_ds: { titles: ["Data Scientist", "ML Engineer", "Data Analyst", "Applied Scientist"], skills: ["Python", "SQL", "Machine learning", "PyTorch", "Experimentation", "dbt", "Statistics"], schools: ["ENSAE", "Sorbonne Université", "TU München", "Politecnico di Milano"], degrees: ["MSc Data Science", "MSc Applied Mathematics"] },
    j_em: { titles: ["Engineering Manager", "Tech Lead", "Head of Engineering", "Lead Engineer"], skills: ["Leadership", "Delivery", "Coaching", "Architecture", "Hiring", "React", "Java"], schools: ["Mines ParisTech", "IST Lisbon", "EPFL"], degrees: ["MSc Engineering", "MSc Computer Science"] },
    j_csm: { titles: ["Account Director", "Client Partner", "Engagement Manager"], skills: ["Account management", "Consulting", "Negotiation", "Upselling"], schools: ["ESCP", "EDHEC", "Sciences Po"], degrees: ["MSc Management", "Master in Business"] },
    j_qa: { titles: ["QA Engineer", "SDET", "Test Automation Engineer"], skills: ["Playwright", "Cypress", "CI/CD", "TypeScript"], schools: ["Universidade do Porto", "EPITA"], degrees: ["BSc Computer Science"] },
    j_intern: { titles: ["Design Student", "Junior Designer", "Design Intern"], skills: ["Figma", "Visual design", "Research", "Illustration"], schools: ["Gobelins", "ENSAD", "Strate"], degrees: ["BA Design (in progress)", "MA Design (in progress)"] },
  };
  const tagPool = ["Strong portfolio", "Relocation", "Notice: 3 months", "French speaker", "Ex-founder", "Referral bonus", "Remote only", "Fast track", "Visa sponsorship", "Bilingual", "Silver medalist"];

  // Distribution per job: counts per stage [applied, screening, hr, hm, tech, final, offer, hired]
  const distribution: Record<string, number[]> = {
    j_fe: [7, 4, 3, 2, 2, 1, 1, 0],
    j_pd: [5, 3, 2, 2, 1, 1, 0, 0],
    j_be: [6, 3, 2, 1, 1, 0, 0, 0],
    j_pm: [3, 2, 2, 1, 1, 1, 1, 0],
    j_ds: [4, 2, 1, 1, 0, 0, 0, 0],
    j_em: [2, 1, 1, 1, 1, 1, 0, 1],
    j_csm: [2, 1, 1, 0, 0, 0, 0, 0],
    j_qa: [0, 0, 0, 0, 0, 0, 0, 1],
    j_intern: [5, 2, 1, 0, 0, 0, 0, 0],
  };
  const stageOrder: StageId[] = ["applied", "screening", "hr_interview", "hm_interview", "technical", "final_review", "offer", "hired"];

  const candidates: Candidate[] = [];
  const applications: Application[] = [];
  const usedNames = new Set<string>();
  let nameIdx = 0;
  const nextName = () => {
    for (;;) {
      const f = firstNames[nameIdx % firstNames.length];
      const l = lastNames[(nameIdx * 7 + 3) % lastNames.length];
      nameIdx++;
      if (!usedNames.has(f + l)) {
        usedNames.add(f + l);
        return [f, l];
      }
    }
  };
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

  const makeCandidate = (jobId: string, createdOffset: number): Candidate => {
    const [firstName, lastName] = nextName();
    const p = profiles[jobId] ?? profiles.j_fe;
    const company = pick(companies);
    const title = pick(p.titles);
    const startYear = int(2016, 2022);
    const prevCompany = pick(companies.filter((c) => c !== company));
    return {
      id: `c_${candidates.length + 1}`,
      firstName,
      lastName,
      email: `${slug(firstName)}.${slug(lastName)}@mail.example`,
      phone: `+33 6 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
      location: pick(cities),
      headline: title,
      currentCompany: company,
      linkedinUrl: `https://www.linkedin.com/in/${slug(firstName)}-${slug(lastName)}-demo`,
      source: pick(sources),
      tags: rand() > 0.45 ? pickN(tagPool, int(1, 2)) : [],
      skills: pickN(p.skills, int(3, 6)),
      experience: [
        { title, company, start: String(startYear + 2), description: `Leading work on core ${pick(["product", "platform", "client", "growth"])} initiatives with a cross-functional team of ${int(4, 12)}.` },
        { title: pick(p.titles), company: prevCompany, start: String(startYear), end: String(startYear + 2), description: "Shipped features end to end and contributed to hiring and onboarding." },
      ],
      education: [{ school: pick(p.schools), degree: pick(p.degrees), year: String(startYear - 1) }],
      summary: `${title} with ${2026 - startYear} years of experience across ${pick(["fintech", "mobility", "e-commerce", "health-tech", "media", "SaaS"])} products. Known for pragmatic decisions, clear communication and care for quality.`,
      languages: rand() > 0.4 ? ["English", "French"] : ["English", pick(["Portuguese", "German", "Spanish", "Italian"])],
      hue: int(0, 360),
      createdAt: at(createdOffset, int(8, 18), int(0, 59)),
      inTalentPool: false,
    };
  };

  const recruiterFor = (job: Job) => job.recruiterId;
  for (const job of jobs) {
    const dist = distribution[job.id];
    if (!dist) continue;
    dist.forEach((count, stageIdx) => {
      for (let i = 0; i < count; i++) {
        const stage = stageOrder[stageIdx];
        const appliedOffset = stageIdx === 0 ? -int(0, 18) : -int(stageIdx * 4 + 2, stageIdx * 6 + 18);
        const c = makeCandidate(job.id, appliedOffset);
        candidates.push(c);
        const evaluation: Evaluation =
          stageIdx === 0 ? "none" : stageIdx >= 6 ? "positive" : pick(["pending", "positive", "positive", "mixed", "pending", "negative"] as const);
        applications.push({
          id: `a_${applications.length + 1}`,
          candidateId: c.id,
          jobId: job.id,
          stage,
          status: stage === "hired" ? "hired" : "active",
          appliedAt: c.createdAt,
          stageEnteredAt: stageIdx === 0 ? c.createdAt : at(-int(0, Math.min(9, -appliedOffset - 1)), int(9, 17)),
          recruiterId: recruiterFor(job),
          evaluation,
          order: i,
        });
      }
    });
  }

  // A handful of rejected applications for funnel realism
  for (const jobId of ["j_fe", "j_pd", "j_be", "j_pm", "j_em"]) {
    for (let i = 0; i < 3; i++) {
      const c = makeCandidate(jobId, -int(12, 55));
      candidates.push(c);
      applications.push({
        id: `a_${applications.length + 1}`,
        candidateId: c.id,
        jobId,
        stage: pick(["screening", "hr_interview", "hm_interview"] as const),
        status: "rejected",
        appliedAt: c.createdAt,
        stageEnteredAt: at(-int(2, 9)),
        recruiterId: jobs.find((j) => j.id === jobId)!.recruiterId,
        evaluation: "negative",
        order: 99,
        rejectionReason: pick(["Not enough relevant experience", "Salary expectations", "Position filled", "Withdrew interest"]),
      });
    }
  }

  // Talent pool members without active applications
  for (let i = 0; i < 10; i++) {
    const jobKey = pick(["j_fe", "j_pd", "j_be", "j_pm", "j_ds", "j_em"]);
    const c = makeCandidate(jobKey, -int(20, 120));
    c.inTalentPool = true;
    c.source = pick(["Sourced", "Referral", "LinkedIn"] as const);
    candidates.push(c);
  }
  // Silver medalists are in the pool too
  applications.filter((a) => a.status === "rejected").slice(0, 6).forEach((a) => {
    const c = candidates.find((x) => x.id === a.candidateId)!;
    c.inTalentPool = true;
    if (!c.tags.includes("Silver medalist")) c.tags.push("Silver medalist");
  });

  // Make the first candidates memorable for the demo
  const hero = candidates[0];
  Object.assign(hero, { tags: ["Strong portfolio", "Fast track"] });

  /* ── Interviews ───────────────────────────────────────── */
  const interviews: Interview[] = [];
  const kindForStage: Partial<Record<StageId, InterviewKind>> = {
    screening: "Screening call",
    hr_interview: "HR interview",
    hm_interview: "Hiring manager interview",
    technical: "Technical interview",
    final_review: "Final interview",
  };
  const activeApps = applications.filter((a) => a.status === "active");
  let upcomingDay = 0;
  activeApps.forEach((a) => {
    const kind = kindForStage[a.stage];
    if (!kind) return;
    const job = jobs.find((j) => j.id === a.jobId)!;
    const interviewers =
      kind === "HR interview" || kind === "Screening call"
        ? [a.recruiterId]
        : kind === "Technical interview"
          ? [pick(["u_marc", "u_elena"]), job.hiringManagerId]
          : [job.hiringManagerId, ...(rand() > 0.5 ? [a.recruiterId] : [])];
    const isUpcoming = rand() > 0.35;
    const dayOffset = isUpcoming ? Math.floor(upcomingDay++ / 3) : -int(1, 6);
    const hour = pick([9, 10, 11, 14, 15, 16]);
    interviews.push({
      id: `i_${interviews.length + 1}`,
      candidateId: a.candidateId,
      jobId: a.jobId,
      applicationId: a.id,
      kind,
      start: at(dayOffset, hour, pick([0, 30])),
      durationMin: kind === "Screening call" ? 30 : kind === "Technical interview" ? 90 : 45,
      meetingType: kind === "Final interview" ? "On-site" : kind === "Screening call" ? "Phone" : "Video",
      location: kind === "Final interview" ? `${job.location} office` : kind === "Screening call" ? undefined : "Video link added on calendar sync",
      interviewerIds: Array.from(new Set(interviewers)),
      status: isUpcoming ? "scheduled" : "completed",
      createdAt: at(dayOffset - 4),
    });
  });

  /* ── Scorecards for completed interviews ──────────────── */
  const scorecards: Scorecard[] = [];
  interviews
    .filter((i) => i.status === "completed")
    .forEach((i, idx) => {
      if (idx % 3 === 2) return; // some feedback still pending
      const app = applications.find((a) => a.id === i.applicationId)!;
      const base = app.evaluation === "negative" ? 2 : app.evaluation === "mixed" ? 3 : 3;
      const criteria = DEFAULT_CRITERIA.map((c) => ({ ...c, score: Math.max(1, Math.min(4, base + (rand() > 0.6 ? 1 : rand() > 0.8 ? -1 : 0))) }));
      const avg = criteria.reduce((s, c) => s + c.score, 0) / criteria.length;
      scorecards.push({
        id: `s_${scorecards.length + 1}`,
        interviewId: i.id,
        candidateId: i.candidateId,
        jobId: i.jobId,
        authorId: i.interviewerIds[0],
        criteria,
        recommendation: avg >= 3.5 ? "strong_yes" : avg >= 2.75 ? "yes" : avg >= 2 ? "no" : "strong_no",
        summary: pick([
          "Clear communicator with structured thinking. Would enjoy working with them.",
          "Solid fundamentals; some gaps on system-level reasoning but very coachable.",
          "Impressive depth in their domain and thoughtful questions about the team.",
          "Good energy but answers stayed at a surface level on trade-offs.",
        ]),
        submittedAt: new Date(new Date(i.start).getTime() + 3 * 3600_000).toISOString(),
      });
    });

  /* ── Notes ────────────────────────────────────────────── */
  const noteBodies = [
    "Great call — very clear on why they want to join. Salary expectation is within the band.",
    "Available from early January. Prefers hybrid with two days in the office.",
    "Portfolio is excellent, particularly the design system case study.",
    "Asked thoughtful questions about career progression. Follow up with the leveling framework.",
    "Has a competing offer; aim to move quickly to the next stage.",
    "Referred by Marc — they worked together previously.",
  ];
  const notes: Note[] = applications
    .filter((a) => a.status === "active" && a.stage !== "applied")
    .slice(0, 34)
    .map((a, idx) => ({
      id: `n_${idx + 1}`,
      candidateId: a.candidateId,
      authorId: a.recruiterId,
      body: noteBodies[idx % noteBodies.length],
      createdAt: at(-int(0, 6), int(9, 18), int(0, 59)),
      pinned: idx % 7 === 0,
    }));

  /* ── Tasks ────────────────────────────────────────────── */
  const candidateName = (id: string) => {
    const c = candidates.find((x) => x.id === id)!;
    return `${c.firstName} ${c.lastName}`;
  };
  const appsIn = (stage: StageId) => applications.filter((a) => a.stage === stage && a.status === "active");
  const t = (partial: Omit<Task, "id" | "createdAt" | "done"> & { done?: boolean }, i: number): Task => ({
    id: `t_${i}`,
    createdAt: at(-5),
    done: false,
    ...partial,
  });
  const offerApp = appsIn("offer")[0];
  const finalApp = appsIn("final_review")[0];
  const techApp = appsIn("technical")[0];
  const screenApp = appsIn("screening")[0];
  const tasks: Task[] = [
    t({ title: `Prepare offer letter for ${candidateName(offerApp.candidateId)}`, dueDate: at(0, 17), assigneeId: "u_camille", priority: "high", candidateId: offerApp.candidateId, jobId: offerApp.jobId, description: "Align with Finance on equity and start date before sending." }, 1),
    t({ title: `Collect debrief feedback — ${candidateName(finalApp.candidateId)}`, dueDate: at(-1, 12), assigneeId: "u_camille", priority: "high", candidateId: finalApp.candidateId, jobId: finalApp.jobId }, 2),
    t({ title: "Review new applications for Senior Frontend Engineer", dueDate: at(1, 10), assigneeId: "u_camille", priority: "medium", jobId: "j_fe" }, 3),
    t({ title: `Send technical case study to ${candidateName(techApp.candidateId)}`, dueDate: at(-2, 9), assigneeId: "u_camille", priority: "medium", candidateId: techApp.candidateId, jobId: techApp.jobId }, 4),
    t({ title: "Finalise job description for Content Marketing Lead", dueDate: at(3, 16), assigneeId: "u_camille", priority: "low", jobId: "j_mkt", description: "Hugo to confirm the scope of the role." }, 5),
    t({ title: `Reference check — ${candidateName(offerApp.candidateId)}`, dueDate: at(2, 11), assigneeId: "u_theo", priority: "medium", candidateId: offerApp.candidateId, jobId: offerApp.jobId }, 6),
    t({ title: `Schedule screening call with ${candidateName(screenApp.candidateId)}`, dueDate: at(0, 15), assigneeId: "u_ines", priority: "medium", candidateId: screenApp.candidateId, jobId: screenApp.jobId }, 7),
    t({ title: "Q4 hiring plan review with leadership", dueDate: at(6, 14), assigneeId: "u_camille", priority: "low" }, 8),
    t({ title: "Update interview kit for Backend Engineer", dueDate: at(-4, 10), assigneeId: "u_camille", priority: "low", jobId: "j_be", done: true, completedAt: at(-4, 16) }, 9),
    t({ title: "Publish Data Scientist job on careers page", dueDate: at(-15, 10), assigneeId: "u_ines", priority: "medium", jobId: "j_ds", done: true, completedAt: at(-16, 11) }, 10),
    t({ title: "Calibrate scorecard criteria with Sofia", dueDate: at(-3, 10), assigneeId: "u_camille", priority: "medium", jobId: "j_pd", done: true, completedAt: at(-3, 15) }, 11),
  ];

  /* ── Activity feed ────────────────────────────────────── */
  const activities: Activity[] = [];
  const pushAct = (a: Omit<Activity, "id">) => activities.push({ id: `act_${activities.length + 1}`, ...a });
  applications.forEach((a) => {
    const job = jobs.find((j) => j.id === a.jobId)!;
    pushAct({ kind: "applied", candidateId: a.candidateId, jobId: a.jobId, message: `applied for ${job.title}`, createdAt: a.appliedAt });
    if (a.stage !== "applied") {
      const label = stages.find((s) => s.id === a.stage)!.label;
      pushAct({ kind: a.stage === "hired" ? "hired" : "stage_changed", actorId: a.recruiterId, candidateId: a.candidateId, jobId: a.jobId, message: a.stage === "hired" ? `was hired as ${job.title}` : `moved to ${label}`, createdAt: a.stageEnteredAt });
    }
    if (a.status === "rejected") pushAct({ kind: "rejected", actorId: a.recruiterId, candidateId: a.candidateId, jobId: a.jobId, message: `was rejected — ${a.rejectionReason}`, createdAt: a.stageEnteredAt });
  });
  scorecards.forEach((s) => pushAct({ kind: "scorecard_submitted", actorId: s.authorId, candidateId: s.candidateId, jobId: s.jobId, message: "submitted a scorecard", createdAt: s.submittedAt }));
  notes.forEach((n) => pushAct({ kind: "note_added", actorId: n.authorId, candidateId: n.candidateId, message: "added a note", createdAt: n.createdAt }));
  jobs.forEach((j) => {
    pushAct({ kind: "job_created", actorId: j.recruiterId, jobId: j.id, message: `created the job ${j.title}`, createdAt: j.createdAt });
    if (j.publishedAt) pushAct({ kind: "job_published", actorId: j.recruiterId, jobId: j.id, message: `published ${j.title} on the careers page`, createdAt: j.publishedAt });
  });
  activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /* ── Talent lists ─────────────────────────────────────── */
  const pool = candidates.filter((c) => c.inTalentPool);
  const talentLists: TalentList[] = [
    { id: "l_silver", name: "Silver medalists", description: "Strong finalists we'd love to re-engage", candidateIds: pool.filter((c) => c.tags.includes("Silver medalist")).map((c) => c.id), createdAt: at(-40) },
    { id: "l_eng", name: "Engineering — 2027 pipeline", description: "Engineers to approach for next year's roles", candidateIds: pool.slice(0, 5).map((c) => c.id), createdAt: at(-25) },
    { id: "l_design", name: "Design community", description: "Met at Paris Design Week", candidateIds: pool.slice(5, 8).map((c) => c.id), createdAt: at(-14) },
  ];

  /* ── Email templates ──────────────────────────────────── */
  const emailTemplates: EmailTemplate[] = [
    { id: "e_ack", name: "Application received", category: "Application", subject: "Thank you for applying to {{job_title}}", body: "Hi {{first_name}},\n\nThank you for your interest in the {{job_title}} role at {{company}}. We're reviewing your application and will be in touch within five working days.\n\nWarm regards,\n{{recruiter_name}}", updatedAt: at(-30) },
    { id: "e_invite", name: "Interview invitation", category: "Interview", subject: "Let's talk — {{job_title}} at {{company}}", body: "Hi {{first_name}},\n\nWe enjoyed reading your application and would love to invite you to a {{interview_type}}. Please pick a slot that suits you using the link below.\n\n{{scheduling_link}}\n\nBest,\n{{recruiter_name}}", updatedAt: at(-12) },
    { id: "e_offer", name: "Offer letter", category: "Offer", subject: "Your offer from {{company}}", body: "Hi {{first_name}},\n\nWe're delighted to offer you the position of {{job_title}}. Please find the details attached.\n\nWelcome aboard,\n{{recruiter_name}}", updatedAt: at(-8) },
    { id: "e_reject", name: "Rejection — after interview", category: "Rejection", subject: "Your application for {{job_title}}", body: "Hi {{first_name}},\n\nThank you for the time you spent with our team. After careful consideration we've decided to move forward with other candidates. We'd love to stay in touch for future opportunities.\n\nKind regards,\n{{recruiter_name}}", updatedAt: at(-60) },
  ];

  return {
    version: DB_VERSION,
    currentUserId: "u_camille",
    company: {
      name: "Halcyon Digital",
      legalName: "Halcyon Digital SAS",
      website: "https://halcyon.example",
      industry: "Digital product studio",
      size: "201–500 employees",
      headquarters: "Paris, France",
      about: "Halcyon Digital designs and builds digital products for Europe's leading brands across mobility, fintech and retail. Studios in Paris, Lisbon and Berlin.",
      careersUrl: "https://careers.halcyon.example",
    },
    stages,
    team,
    jobs,
    candidates,
    applications,
    notes,
    interviews,
    scorecards,
    tasks,
    activities,
    talentLists,
    savedViews: [
      { id: "v_all", name: "All candidates", system: true, filters: emptyFilters(), columns: ["position", "job", "source", "stage", "applied", "recruiter", "evaluation"], sort: { key: "applied", dir: "desc" } },
      { id: "v_new", name: "New this week", system: true, filters: { ...emptyFilters(), stages: ["applied"] }, columns: ["position", "job", "source", "applied", "recruiter"], sort: { key: "applied", dir: "desc" } },
      { id: "v_eng", name: "Engineering — in interviews", filters: { ...emptyFilters(), jobIds: ["j_fe", "j_be", "j_em"], stages: ["hr_interview", "hm_interview", "technical", "final_review"] }, columns: ["position", "job", "stage", "recruiter", "evaluation"], sort: { key: "stage", dir: "desc" } },
    ],
    emailTemplates,
    integrations: { linkedin: "not_connected", google_calendar: "not_connected", outlook: "not_connected", gmail: "not_connected", smtp: "not_connected" },
    notificationPrefs: { newApplication: true, stageChange: true, interviewReminder: true, scorecardDue: true, taskDue: true, weeklyDigest: false, mentions: true },
    notifications: [
      { id: "no_1", title: "Scorecard due", body: "Your feedback for yesterday's interview is pending.", href: "/interviews?tab=feedback", createdAt: at(0, 8, 30), read: false },
      { id: "no_2", title: "4 new applications", body: "Senior Frontend Engineer received new applicants.", href: "/jobs/view?id=j_fe", createdAt: at(-1, 17, 10), read: false },
      { id: "no_3", title: "Task overdue", body: "Collect debrief feedback is overdue.", href: "/tasks?view=overdue", createdAt: at(-1, 12, 5), read: false },
      { id: "no_4", title: "Offer accepted", body: "A candidate accepted the Engineering Manager offer.", href: "/jobs/view?id=j_em", createdAt: at(-3, 10), read: true },
    ],
  };
}

export function emptyFilters() {
  return { search: "", stages: [], jobIds: [], sources: [], recruiterIds: [], evaluations: [], status: "active" } as Database["savedViews"][number]["filters"];
}

export type { Note };
