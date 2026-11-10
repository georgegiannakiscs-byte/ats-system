import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { extractText } from "unpdf";

/** Plain text of a PDF or DOCX CV (no OCR: scanned image-only PDFs return little or no text). */
export async function cvText(buf: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
    return String(text).replace(/[ \t]+/g, " ").trim();
  }
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"] ? strFromU8(files["word/document.xml"]) : "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Deterministic extraction of contact details — no AI needed. */
export function contactDetails(text: string) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? "";
  const linkedinUrl = text.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s,;)]+/i)?.[0] ?? "";
  const portfolioUrl = (text.match(/https?:\/\/[^\s,;)]+/gi) ?? []).find((u) => !/linkedin\.com/i.test(u)) ?? "";
  return { email, phone, linkedinUrl, portfolioUrl };
}
