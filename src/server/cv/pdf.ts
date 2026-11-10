import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { CV_LABELS, dateRange, type CvData, type CvLang, type CvTemplate } from "@/lib/cv/schema";

/*
 * Renders a CV to a real, text-based PDF (selectable/extractable text, embedded Unicode fonts
 * covering Greek and Latin). Every template flows in a single reading order so ATS software
 * can extract it reliably; "minimal" is the most conservative layout.
 */
const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
const font = (f: string) => path.join(FONT_DIR, `${f}.ttf`);

type Theme = { regular: string; bold: string; italic: string; ink: string; muted: string; accent: string; rule: string };
const THEMES: Record<CvTemplate, Theme> = {
  minimal: { regular: "LiberationSans-Regular", bold: "LiberationSans-Bold", italic: "LiberationSans-Italic", ink: "#1b1f1d", muted: "#5d6560", accent: "#1b1f1d", rule: "#d9dcd9" },
  modern: { regular: "LiberationSans-Regular", bold: "LiberationSans-Bold", italic: "LiberationSans-Italic", ink: "#16231d", muted: "#5f6a64", accent: "#193329", rule: "#be7157" },
  professional: { regular: "LiberationSerif-Regular", bold: "LiberationSerif-Bold", italic: "LiberationSerif-Italic", ink: "#111111", muted: "#4a4a4a", accent: "#111111", rule: "#111111" },
};

/** All-caps that follows Greek typography (accents dropped in capitals). */
const caps = (s: string) => s.normalize("NFD").replace(/[\u0301\u0308](?=)/g, "").toUpperCase().normalize("NFC");

const lines = (s: string) => s.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

export async function renderCvPdf(data: CvData, template: CvTemplate, lang: CvLang, photo?: Buffer | null): Promise<Buffer> {
  const t = THEMES[template];
  const L = CV_LABELS[lang];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 52, left: 52, right: 52 },
    font: font(t.regular), // avoids loading the built-in Helvetica (no Greek glyphs)
    bufferPages: true,
    info: { Title: `CV — ${data.personal.fullName}`, Author: data.personal.fullName, Creator: "Déceler CV Builder", Producer: "Déceler" },
    lang: lang === "el" ? "el-GR" : "en-GB",
    displayTitle: true,
  });
  for (const f of [t.regular, t.bold, t.italic]) doc.registerFont(f, font(f));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  /* ── Header ── */
  const p = data.personal;
  const contact = [p.email, p.phone, [p.location, p.country].filter(Boolean).join(", "), p.linkedinUrl, p.portfolioUrl].filter(Boolean);
  const photoSize = template === "professional" ? 78 : 84;
  let textLeft = left;
  let textWidth = width;
  const topY = doc.y;
  if (photo) {
    const px = template === "modern" ? left : left + width - photoSize;
    const isCircle = data.photoShape === "circle";
    const ph = isCircle ? photoSize : Math.round(photoSize * 1.25);
    doc.save();
    if (isCircle) doc.circle(px + photoSize / 2, topY + photoSize / 2, photoSize / 2).clip();
    else doc.roundedRect(px, topY, photoSize, ph, 4).clip();
    doc.image(photo, px, topY, { cover: [photoSize, ph], align: "center", valign: "center" });
    doc.restore();
    if (template === "modern") textLeft = left + photoSize + 18;
    textWidth = width - photoSize - 18;
  }
  const align = template === "professional" && !photo ? "center" : "left";
  doc.fillColor(t.accent).font(t.bold).fontSize(template === "professional" ? 22 : 24).text(p.fullName, textLeft, topY, { width: textWidth, align });
  if (p.headline) doc.moveDown(0.15).fillColor(t.muted).font(t.regular).fontSize(12).text(p.headline, textLeft, doc.y, { width: textWidth, align });
  if (contact.length) doc.moveDown(0.35).fillColor(t.muted).font(t.regular).fontSize(9.5).text(contact.join("  ·  "), textLeft, doc.y, { width: textWidth, align, lineGap: 2 });
  if (photo) doc.y = Math.max(doc.y, topY + (data.photoShape === "circle" ? photoSize : photoSize * 1.25));
  doc.moveDown(0.6);
  if (template === "modern") {
    doc.rect(left, doc.y, 36, 2.5).fill(t.rule);
    doc.moveDown(0.8);
  } else {
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(template === "professional" ? 1 : 0.6).strokeColor(t.rule).stroke();
    doc.moveDown(0.7);
  }

  /* ── Section helpers ── */
  const heading = (label: string) => {
    ensure(48);
    doc.moveDown(0.5);
    const y = doc.y;
    if (template === "professional") {
      doc.fillColor(t.ink).font(t.bold).fontSize(11.5).text(caps(label), left, y, { width, characterSpacing: 1 });
      doc.moveTo(left, doc.y + 1).lineTo(left + width, doc.y + 1).lineWidth(0.5).strokeColor(t.rule).stroke();
      doc.moveDown(0.45);
    } else if (template === "modern") {
      doc.fillColor(t.accent).font(t.bold).fontSize(11).text(label, left, y, { width });
      doc.moveDown(0.3);
    } else {
      doc.fillColor(t.ink).font(t.bold).fontSize(10).text(caps(label), left, y, { width, characterSpacing: 0.8 });
      doc.moveDown(0.35);
    }
  };
  const body = (text: string, opts: PDFKit.Mixins.TextOptions = {}) =>
    doc.fillColor(t.ink).font(t.regular).fontSize(10).text(text, left, doc.y, { width, lineGap: 2.2, ...opts });
  const bullets = (items: string[]) => {
    for (const item of items) {
      ensure(16);
      doc.fillColor(t.ink).font(t.regular).fontSize(10).text(`•  ${item}`, left + 8, doc.y, { width: width - 8, lineGap: 2, indent: 0 });
    }
  };
  const entry = (title: string, sub: string, dates: string) => {
    ensure(42);
    const y = doc.y;
    const dateW = dates ? Math.min(150, doc.font(t.regular).fontSize(9.5).widthOfString(dates) + 4) : 0;
    doc.fillColor(t.ink).font(t.bold).fontSize(10.5).text(title || sub, left, y, { width: width - dateW - 8 });
    const afterTitle = doc.y;
    if (dates) doc.fillColor(t.muted).font(t.regular).fontSize(9.5).text(dates, left + width - dateW, y + 1, { width: dateW, align: "right" });
    doc.y = afterTitle;
    if (title && sub) doc.fillColor(t.muted).font(template === "professional" ? t.italic : t.regular).fontSize(10).text(sub, left, doc.y, { width });
    doc.moveDown(0.2);
  };

  /* ── Sections (all optional) ── */
  if (data.summary.trim()) {
    heading(L.summary);
    body(data.summary.trim());
  }
  if (data.experience.length) {
    heading(L.experience);
    data.experience.forEach((e, i) => {
      entry(e.title, e.company, dateRange(e.start, e.end, e.current, lang));
      if (e.description.trim()) body(e.description.trim());
      if (lines(e.responsibilities).length) bullets(lines(e.responsibilities));
      if (lines(e.achievements).length) {
        doc.moveDown(0.15).fillColor(t.muted).font(t.bold).fontSize(9.5).text(L.achievements, left, doc.y, { width });
        bullets(lines(e.achievements));
      }
      if (i < data.experience.length - 1) doc.moveDown(0.55);
    });
  }
  if (data.education.length) {
    heading(L.education);
    data.education.forEach((e, i) => {
      entry([e.degree, e.field].filter(Boolean).join(", "), e.institution, dateRange(e.start, e.end, false, lang));
      if (e.description.trim()) body(e.description.trim());
      if (i < data.education.length - 1) doc.moveDown(0.45);
    });
  }
  if (data.skills.length) {
    heading(L.skills);
    body(data.skills.join("  ·  "));
  }
  if (data.languages.length) {
    heading(L.languages);
    body(data.languages.map((l) => (l.level ? `${l.language} — ${l.level}` : l.language)).join("  ·  "));
  }
  if (data.certifications.length) {
    heading(L.certifications);
    data.certifications.forEach((c) => {
      entry(c.name, c.issuer, c.date);
      if (c.url) body(c.url, { link: c.url });
    });
  }
  if (data.projects.length) {
    heading(L.projects);
    data.projects.forEach((pr, i) => {
      entry(pr.name, pr.role, "");
      if (pr.description.trim()) body(pr.description.trim());
      if (pr.technologies.trim()) doc.fillColor(t.muted).font(t.regular).fontSize(9.5).text(`${L.technologies}: ${pr.technologies.trim()}`, left, doc.y, { width });
      if (pr.url) body(pr.url, { link: pr.url });
      if (i < data.projects.length - 1) doc.moveDown(0.45);
    });
  }
  for (const k of ["publications", "awards", "volunteering", "links", "other"] as const) {
    const v = data.additional[k]?.trim();
    if (!v) continue;
    heading(L[k]);
    const ls = lines(v);
    if (ls.length > 1) bullets(ls);
    else body(v);
  }

  /* ── Footer page numbers ── */
  const range = doc.bufferedPageRange();
  if (range.count > 1) {
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(t.muted).font(t.regular).fontSize(8).text(`${data.personal.fullName} · ${i + 1}/${range.count}`, left, doc.page.height - 34, { width, align: "right", lineBreak: false });
    }
  }
  doc.end();
  return done;
}
