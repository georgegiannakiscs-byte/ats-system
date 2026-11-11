import Image from "next/image";
import logo from "@/assets/ulysse-logo.webp";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/*
 * The official logo file is used as-is (transparent background, unmodified pixels).
 * The file has generous transparent padding, so we frame the artwork with CSS:
 * the wordmark occupies x 503–1518 and y 171–533 of the 2000×667 canvas.
 */
const W = 2000, H = 667;
const BOX = { x: 503, y: 171, w: 1015, h: 362 };
const MONOGRAM_WIDTH = 262; // the "U" alone, used when the sidebar is collapsed

export function BrandMark({ height = 22, variant = "wordmark", className }: { height?: number; variant?: "wordmark" | "monogram"; className?: string }) {
  const scale = height / BOX.h;
  const frameW = (variant === "monogram" ? MONOGRAM_WIDTH : BOX.w) * scale;
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden", className)}
      style={{ width: frameW, height }}
      role="img"
      aria-label={BRAND.name}
    >
      <Image
        src={logo}
        alt=""
        priority
        unoptimized
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{ width: W * scale, height: H * scale, left: -BOX.x * scale, top: -BOX.y * scale }}
      />
    </span>
  );
}

/**
 * The logo is dark ink on transparent. In dark mode it sits on a small cream plate
 * so it stays legible without altering the artwork.
 */
export function BrandLogo({ height = 22, variant = "wordmark", className }: { height?: number; variant?: "wordmark" | "monogram"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center dark:rounded-md dark:bg-[#faf8f3] dark:px-2 dark:py-1", className)}>
      <BrandMark height={height} variant={variant} />
    </span>
  );
}
