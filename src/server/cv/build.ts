import "server-only";
import sharp from "sharp";
import { HttpError } from "@/server/http";
import { sniffImage } from "@/server/storage";

/**
 * Validates and re-encodes the optional CV Builder photo (data URL from the browser crop).
 * Re-encoding strips metadata (including location), normalises orientation and caps the size.
 */
export async function photoFromDataUrl(dataUrl: string | null | undefined, shape: "circle" | "rectangle"): Promise<Buffer | null> {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(415, "Use a JPG, PNG or WebP photo", "photo_type");
  const raw = Buffer.from(m[2], "base64");
  const kind = sniffImage(raw);
  if (!kind || kind.ext === "svg") throw new HttpError(415, "Use a JPG, PNG or WebP photo", "photo_type");
  const ratio = shape === "circle" ? 1 : 1.25;
  return sharp(raw, { failOn: "error" }).rotate().resize({ width: 600, height: Math.round(600 * ratio), fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
}

/** "Eleni Georgiou" → "Eleni_Georgiou_CV.pdf" (letters and digits only). */
export const cvFileName = (fullName: string) => `${fullName.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_") || "CV"}_CV.pdf`;
