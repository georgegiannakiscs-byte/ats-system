import "server-only";
import crypto from "node:crypto";
import { sys, type Q } from "./db";
import { HttpError } from "./http";
import { putObject, scanBuffer, sniffCv } from "./storage";
import { randomToken } from "./security";

export async function maxCvBytes() {
  const [s] = await sys<{ value: { maxCvMb: number } }>("select value from platform_settings where key = 'storage'");
  return (s?.value.maxCvMb ?? 10) * 1024 * 1024;
}

/** Validates (size, real file type, malware scan when configured) and stores a CV privately. */
export async function storeCv(orgId: string, file: File) {
  const max = await maxCvBytes();
  if (file.size === 0) throw new HttpError(400, "The CV file is empty", "cv_empty");
  if (file.size > max) throw new HttpError(413, `CVs must be smaller than ${Math.round(max / 1024 / 1024)} MB`, "cv_too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffCv(buf);
  if (!kind) throw new HttpError(415, "Upload your CV as a PDF or Word (.docx) file", "cv_type");
  const scan = await scanBuffer(buf);
  if (scan === "infected") throw new HttpError(422, "This file was flagged by our malware scanner and can't be accepted", "cv_infected");
  const key = `cv/${orgId}/${crypto.randomUUID()}.${kind.ext}`;
  await putObject(key, buf);
  const name = (file.name || `cv.${kind.ext}`).replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120);
  return { key, mime: kind.mime, size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), fileName: name, scanStatus: scan === "error" ? "error" : scan };
}

export async function insertCvRow(q: Q, orgId: string, candidateId: string, applicationId: string | null, cv: Awaited<ReturnType<typeof storeCv>>, uploadedBy: string | null) {
  await q(
    "insert into cv_documents (org_id, candidate_id, application_id, storage_key, file_name, mime_type, size_bytes, sha256, scan_status, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [orgId, candidateId, applicationId, cv.key, cv.fileName, cv.mime, cv.size, cv.sha256, cv.scanStatus, uploadedBy],
  );
}

export const newId = (prefix: string) => `${prefix}_${randomToken(12).replace(/[^A-Za-z0-9]/g, "x")}`;
