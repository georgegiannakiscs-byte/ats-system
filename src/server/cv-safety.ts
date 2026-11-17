import zlib from "node:zlib";
import { unzipSync } from "fflate";

/**
 * Built-in active-content check for uploaded CVs (works without ClamAV).
 *
 * A CV only needs text and pictures. We refuse the features attackers use to run code or
 * smuggle files when a recruiter opens the document:
 * - PDF: JavaScript, launch actions, embedded/attached files, rich media (Flash/3D), form
 *   submission/import actions, XFA forms.
 * - Word: macros (VBA), ActiveX controls, embedded OLE objects / macro-enabled documents,
 *   remote templates or sub-documents, DDE fields.
 *
 * This is a structural check, not antivirus: it can't detect malware in an image or a bug in a
 * viewer. With CLAMAV_HOST set, files are malware-scanned as well.
 *
 * Returns null when the file is fine, otherwise a short internal reason (logged, not shown).
 */
export function cvActiveContent(buf: Buffer, ext: "pdf" | "docx"): string | null {
  return ext === "pdf" ? pdfActiveContent(buf) : docxActiveContent(buf);
}

// ---------- PDF ----------

const PDF_BANNED = new Set(["JavaScript", "JS", "Launch", "EmbeddedFile", "EmbeddedFiles", "RichMedia", "SubmitForm", "ImportData", "XFA"]);
const MAX_INFLATE = 64 * 1024 * 1024; // total decompressed object-stream bytes we're willing to inspect

/** PDF names (`/Name`), with `#xx` escapes decoded (so `/J#61vaScript` is caught). */
function pdfNames(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\/([^\s/[\]<>(){}%]+)/g)) {
    out.add(m[1].replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  }
  return out;
}

function bannedName(text: string) {
  for (const n of pdfNames(text)) if (PDF_BANNED.has(n)) return n;
  return null;
}

function pdfActiveContent(buf: Buffer): string | null {
  const text = buf.toString("latin1");
  const all = pdfNames(text);
  // 1) Every uncompressed dictionary (indirect objects, stream dictionaries, trailer).
  for (const n of all) if (PDF_BANNED.has(n)) return `pdf:/${n}`;
  // 2) Object streams (/ObjStm) hide dictionaries inside compressed data: inflate and check them.
  let budget = MAX_INFLATE;
  const encrypted = all.has("Encrypt");
  for (const m of text.matchAll(/(?<!end)stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const dictStart = text.lastIndexOf("obj", m.index!);
    const dict = dictStart >= 0 && m.index! - dictStart < 4096 ? text.slice(dictStart, m.index!) : "";
    if (!pdfNames(dict).has("ObjStm")) continue;
    // Encrypted object streams can't be inspected without the password, so we can't vouch for them.
    if (encrypted) return "pdf:encrypted_objstm";
    const names = pdfNames(dict);
    if (!names.has("FlateDecode") || [...names].some((n) => n.endsWith("Decode") && n !== "FlateDecode")) return "pdf:objstm_filter";
    const end = text.indexOf("endstream", start);
    if (end < 0) return "pdf:objstm_unterminated";
    let inflated: Buffer;
    try {
      inflated = zlib.inflateSync(buf.subarray(start, end), { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: Math.max(1, budget) });
    } catch {
      return budget <= 0 ? "pdf:too_large" : "pdf:objstm_corrupt";
    }
    budget -= inflated.length;
    if (budget <= 0) return "pdf:too_large";
    const inner = bannedName(inflated.toString("latin1"));
    if (inner) return `pdf:/${inner}`;
  }
  return null;
}

// ---------- Word (.docx) ----------

const MAX_XML = 32 * 1024 * 1024; // per part
const BAD_EXTERNAL = /\/(attachedTemplate|oleObject|subDocument|frame|package)$/i;

function docxActiveContent(buf: Buffer): string | null {
  const names: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), {
      filter: (f) => {
        names.push(f.name);
        // Only decompress the small XML parts we read; everything else is judged by name.
        return (/\.xml$|\.rels$/i.test(f.name)) && f.originalSize <= MAX_XML;
      },
    });
  } catch {
    return "docx:unreadable";
  }
  const dec = new TextDecoder();
  const read = (n: string) => (files[n] ? dec.decode(files[n]) : "");
  for (const n of names) {
    const l = n.toLowerCase();
    if (/vbaproject\.bin$|vbadata\.xml$/.test(l)) return "docx:macros";
    if (l.includes("/activex/")) return "docx:activex";
    if (l.includes("/embeddings/") && !/\.(xlsx|docx|pptx|png|jpe?g|gif|emf|wmf)$/.test(l)) return "docx:embedded_object";
  }
  if (/macroEnabled|vbaProject/i.test(read("[Content_Types].xml"))) return "docx:macros";
  for (const n of Object.keys(files)) {
    const xml = read(n);
    if (n.endsWith(".rels")) {
      for (const r of xml.matchAll(/<Relationship\b[^>]*>/g)) {
        const tag = r[0];
        const type = /Type="([^"]*)"/.exec(tag)?.[1] ?? "";
        if (/TargetMode="External"/i.test(tag) && BAD_EXTERNAL.test(type)) return "docx:external_" + type.split("/").pop();
        if (/vbaProject/i.test(type)) return "docx:macros";
      }
    } else if (n.startsWith("word/")) {
      // Field codes can be split across runs: join them before looking for DDE.
      const codes = [...xml.matchAll(/<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g)].map((x) => x[1]).join("")
        + " " + [...xml.matchAll(/<w:fldSimple\b[^>]*w:instr="([^"]*)"/g)].map((x) => x[1]).join(" ");
      if (/(^|[\s{])DDE(AUTO)?\b/i.test(codes)) return "docx:dde";
    }
  }
  return null;
}
