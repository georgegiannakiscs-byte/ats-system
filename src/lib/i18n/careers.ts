/** Public-facing strings for careers pages and the application form (English & Greek). */
export const careersDict = {
  en: {
    openPositions: "Open positions", noJobs: "There are no open positions right now. Please check back soon.", search: "Search positions", allLocations: "All locations", allTypes: "All types", allDepartments: "All departments",
    apply: "Apply", applyFor: "Apply for this position", backToJobs: "All positions", about: "About the role", responsibilities: "Responsibilities", requirements: "Requirements", experience: "Experience", skills: "Skills", niceToHave: "Nice to have", benefits: "Benefits", salary: "Salary",
    fullName: "Full name", email: "Email address", cv: "CV / Resume", cvHint: "PDF or Word (.docx), up to {mb} MB", dropCv: "Drag your CV here, or", browse: "browse files", replace: "Replace",
    additional: "Additional information", optional: "optional", phone: "Phone number", city: "City", country: "Country", linkedin: "LinkedIn profile", portfolio: "Portfolio or website", github: "GitHub", currentTitle: "Current job title", currentCompany: "Current company",
    summary: "Professional summary", years: "Years of experience", education: "Education", skillsField: "Skills", languages: "Languages", certifications: "Certifications", salaryExp: "Salary expectations", availability: "Availability", notice: "Notice period", coverLetter: "Cover letter", notes: "Anything else?",
    questions: "A few questions from the team", submit: "Submit application", submitting: "Submitting…", uploading: "Uploading CV…", required: "Required",
    errName: "Enter your full name", errEmail: "Enter a valid email address", errCv: "Attach your CV as a PDF or Word file", errCvSize: "Your CV must be smaller than {mb} MB",
    successTitle: "Application received", successBody: "Thank you for applying to {job} at {company}. The team will review your application and get back to you.", successEmail: "We've sent a confirmation to {email}.", reference: "Reference",
    privacyTitle: "How we use your data", privacyBody: "{company} processes the information you submit solely to evaluate your application for this and, if you agree to be contacted, future roles. Your CV is stored securely and is only visible to {company}'s hiring team. You can ask {company} at any time to access, correct or delete your data.",
    poweredBy: "Recruitment powered by", minutes: "Takes about a minute - only name, email and CV are required.", posted: "Posted",
  },
  el: {
    openPositions: "Ανοιχτές θέσεις", noJobs: "Δεν υπάρχουν ανοιχτές θέσεις αυτή τη στιγμή. Ελάτε ξανά σύντομα.", search: "Αναζήτηση θέσεων", allLocations: "Όλες οι τοποθεσίες", allTypes: "Όλοι οι τύποι", allDepartments: "Όλα τα τμήματα",
    apply: "Αίτηση", applyFor: "Κάντε αίτηση για τη θέση", backToJobs: "Όλες οι θέσεις", about: "Σχετικά με τη θέση", responsibilities: "Αρμοδιότητες", requirements: "Απαιτήσεις", experience: "Εμπειρία", skills: "Δεξιότητες", niceToHave: "Επιθυμητά", benefits: "Παροχές", salary: "Αποδοχές",
    fullName: "Ονοματεπώνυμο", email: "Email", cv: "Βιογραφικό", cvHint: "PDF ή Word (.docx), έως {mb} MB", dropCv: "Σύρετε εδώ το βιογραφικό σας ή", browse: "επιλέξτε αρχείο", replace: "Αλλαγή",
    additional: "Επιπλέον πληροφορίες", optional: "προαιρετικά", phone: "Τηλέφωνο", city: "Πόλη", country: "Χώρα", linkedin: "Προφίλ LinkedIn", portfolio: "Portfolio ή ιστοσελίδα", github: "GitHub", currentTitle: "Τρέχουσα θέση", currentCompany: "Τρέχουσα εταιρεία",
    summary: "Επαγγελματική περίληψη", years: "Έτη εμπειρίας", education: "Εκπαίδευση", skillsField: "Δεξιότητες", languages: "Γλώσσες", certifications: "Πιστοποιήσεις", salaryExp: "Μισθολογικές απαιτήσεις", availability: "Διαθεσιμότητα", notice: "Χρόνος προειδοποίησης", coverLetter: "Συνοδευτική επιστολή", notes: "Κάτι ακόμα;",
    questions: "Μερικές ερωτήσεις από την ομάδα", submit: "Υποβολή αίτησης", submitting: "Υποβολή…", uploading: "Μεταφόρτωση βιογραφικού…", required: "Υποχρεωτικό",
    errName: "Συμπληρώστε το ονοματεπώνυμό σας", errEmail: "Συμπληρώστε ένα έγκυρο email", errCv: "Επισυνάψτε το βιογραφικό σας σε PDF ή Word", errCvSize: "Το βιογραφικό πρέπει να είναι μικρότερο από {mb} MB",
    successTitle: "Η αίτησή σας ελήφθη", successBody: "Ευχαριστούμε για την αίτησή σας για τη θέση {job} στην {company}. Η ομάδα θα την εξετάσει και θα επικοινωνήσει μαζί σας.", successEmail: "Στείλαμε επιβεβαίωση στο {email}.", reference: "Κωδικός",
    privacyTitle: "Πώς χρησιμοποιούμε τα δεδομένα σας", privacyBody: "Η {company} επεξεργάζεται τα στοιχεία που υποβάλλετε αποκλειστικά για την αξιολόγηση της αίτησής σας. Το βιογραφικό σας αποθηκεύεται με ασφάλεια και είναι ορατό μόνο στην ομάδα προσλήψεων της {company}. Μπορείτε οποιαδήποτε στιγμή να ζητήσετε πρόσβαση, διόρθωση ή διαγραφή των δεδομένων σας.",
    poweredBy: "Προσλήψεις με το", minutes: "Διαρκεί περίπου ένα λεπτό - απαιτούνται μόνο όνομα, email και βιογραφικό.", posted: "Δημοσιεύθηκε",
  },
} as const;

export type CareersLang = keyof typeof careersDict;
export type CareersStrings = { [K in keyof (typeof careersDict)["en"]]: string };
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
