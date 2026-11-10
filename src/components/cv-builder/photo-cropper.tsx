"use client";
import * as React from "react";
import { ImagePlus, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Shape = "circle" | "rectangle";
type Labels = { addPhoto: string; replacePhoto: string; removePhoto: string; zoom: string; dragToMove: string; circle: string; rectangle: string; photoType: string };

const FRAME_W = 220;
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Optional photo: choose, crop, zoom, reposition, replace or remove. Cropping happens in the
 * browser; only the cropped JPEG is uploaded when the CV is generated (the server re-encodes it
 * again to strip any metadata).
 */
export function PhotoCropper({ shape, onShape, value, onChange, labels }: { shape: Shape; onShape: (s: Shape) => void; value: string | null; onChange: (dataUrl: string | null) => void; labels: Labels }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [error, setError] = React.useState<string>();
  const drag = React.useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const frameH = shape === "circle" ? FRAME_W : Math.round(FRAME_W * 1.25);

  const pick = (f: File | undefined) => {
    setError(undefined);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > MAX_BYTES) return setError(labels.photoType);
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      const b = Math.max(FRAME_W / im.naturalWidth, frameH / im.naturalHeight);
      setImg(im); setSrc(url); setZoom(1);
      setPos({ x: (FRAME_W - im.naturalWidth * b) / 2, y: (frameH - im.naturalHeight * b) / 2 });
    };
    im.onerror = () => setError(labels.photoType);
    im.src = url;
  };

  // Base scale so the image covers the frame at zoom 1.
  const base = img ? Math.max(FRAME_W / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : 0;
  const h = img ? img.naturalHeight * base * zoom : 0;
  const clamp = React.useCallback((p: { x: number; y: number }) => ({ x: Math.min(0, Math.max(FRAME_W - w, p.x)), y: Math.min(0, Math.max(frameH - h, p.y)) }), [w, h, frameH]);
  const view = img ? clamp(pos) : { x: 0, y: 0 };
  // Zoom around the centre of the frame.
  const zoomTo = (z: number) => {
    const r = z / zoom;
    const cx = FRAME_W / 2, cy = frameH / 2;
    setPos({ x: cx - (cx - view.x) * r, y: cy - (cy - view.y) * r });
    setZoom(z);
  };

  // Re-render the cropped output whenever the crop changes.
  React.useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => {
      const outW = 600;
      const outH = Math.round(600 * (frameH / FRAME_W));
      const c = document.createElement("canvas");
      c.width = outW; c.height = outH;
      const ctx = c.getContext("2d")!;
      const k = outW / FRAME_W;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, view.x * k, view.y * k, w * k, h * k);
      onChange(c.toDataURL("image/jpeg", 0.9));
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom, view.x, view.y, frameH]);

  const remove = () => { setImg(null); setSrc(null); onChange(null); if (inputRef.current) inputRef.current.value = ""; };

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={labels.addPhoto} onChange={(e) => pick(e.target.files?.[0])} />
      <div className="inline-flex rounded-md border border-border p-0.5 text-sm" role="radiogroup" aria-label="Photo shape">
        {(["circle", "rectangle"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={shape === s} onClick={() => onShape(s)} className={cn("rounded px-3 py-1", shape === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{labels[s]}</button>
        ))}
      </div>
      {img && src ? (
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={cn("relative touch-none select-none overflow-hidden bg-muted ring-1 ring-border", shape === "circle" ? "rounded-full" : "rounded-md", "cursor-grab active:cursor-grabbing")}
            style={{ width: FRAME_W, height: frameH }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: view.x, py: view.y }; }}
            onPointerMove={(e) => { if (drag.current) setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })); }}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={(e) => {
              const step = 8;
              const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
              if (d) { e.preventDefault(); setPos(clamp({ x: view.x + d[0], y: view.y + d[1] })); }
            }}
            tabIndex={0}
            role="img"
            aria-label={labels.dragToMove}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} style={{ position: "absolute", left: view.x, top: view.y, width: w, height: h, maxWidth: "none" }} />
          </div>
          <div className="min-w-48 flex-1 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{labels.zoom}</span>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
            </label>
            <p className="text-xs text-muted-foreground">{labels.dragToMove}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-accent"><RefreshCw className="size-3.5" />{labels.replacePhoto}</button>
              <button type="button" onClick={remove} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-destructive hover:bg-destructive/5"><Trash2 className="size-3.5" />{labels.removePhoto}</button>
            </div>
          </div>
        </div>
      ) : value ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className={cn("object-cover ring-1 ring-border", shape === "circle" ? "size-24 rounded-full" : "h-30 w-24 rounded-md")} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-accent"><RefreshCw className="size-3.5" />{labels.replacePhoto}</button>
            <button type="button" onClick={remove} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-destructive hover:bg-destructive/5"><Trash2 className="size-3.5" />{labels.removePhoto}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-4 py-6 text-sm hover:border-foreground/30">
          <ImagePlus className="size-5 text-muted-foreground" />
          {labels.addPhoto}
          <span className="text-xs text-muted-foreground">{labels.photoType}</span>
        </button>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
