"use client";
import * as React from "react";
import { toast } from "sonner";
import { Download, FileText, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { useCan, useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { EmptyState } from "@/components/common/empty-state";
import type { Candidate, CvDocument } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Stored CVs. Previews use short-lived signed URLs, re-authorised on every request. */
export function CvTab({ candidate }: { candidate: Candidate }) {
  const db = useDb();
  const canUpload = useCan("candidates.edit");
  const canView = useCan("cv.download");
  const docs = db.cvDocuments.filter((d) => d.candidateId === candidate.id);
  const [selected, setSelected] = React.useState<CvDocument | undefined>(docs[0]);
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!selected && docs[0]) setSelected(docs[0]);
  }, [docs, selected]);

  React.useEffect(() => {
    setUrl(null);
    if (!selected || !canView || selected.mimeType !== "application/pdf") return;
    setLoading(true);
    api.candidates.cvUrl(selected.id).then((r) => setUrl(r.url)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [selected, canView]);

  const download = async (d: CvDocument) => {
    try {
      const r = await api.candidates.cvUrl(d.id, true);
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      await api.candidates.uploadCv(candidate.id, file);
      toast.success("CV uploaded");
      setSelected(undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const uploader = (
    <>
      <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => upload(e.target.files?.[0])} aria-label="Upload CV" />
      {canUpload && <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload />{uploading ? "Uploading…" : "Upload CV"}</Button>}
    </>
  );

  if (!docs.length) return <EmptyState compact icon={<FileText />} title="No CV on file" description="CVs submitted with applications or uploaded by your team appear here." action={uploader} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {docs.map((d) => (
          <button key={d.id} onClick={() => setSelected(d)} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors", selected?.id === d.id ? "border-signal/50 bg-signal-soft/50" : "border-border hover:border-border-strong")}>
            <FileText className="size-4 text-muted-foreground" />
            <span className="max-w-48 truncate">{d.fileName}</span>
            <span className="text-xs text-muted-foreground">{shortDate(d.createdAt)}</span>
          </button>
        ))}
        <span className="ml-auto">{uploader}</span>
      </div>
      <CandidatePhoto candidateId={candidate.id} />
      {selected && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
            <span>{selected.mimeType === "application/pdf" ? "PDF" : "Word document"} · {kb(selected.sizeBytes)}</span>
            {selected.source === "builder" ? <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />Created by the candidate with the Déceler CV Builder</span> : selected.scanStatus === "clean" ? <span className="inline-flex items-center gap-1 text-success"><ShieldCheck className="size-3.5" />Malware scan passed</span> : <span className="inline-flex items-center gap-1"><ShieldAlert className="size-3.5" />Not malware-scanned (scanner not configured)</span>}
            {canView && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => download(selected)}><Download />Download</Button>}
          </div>
          {!canView ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Your role can&apos;t view CV documents.</p>
          ) : selected.mimeType !== "application/pdf" ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Word documents can&apos;t be previewed in the browser. Download the file to open it.</div>
          ) : loading || !url ? (
            <Skeleton className="m-4 h-[480px]" />
          ) : (
            <iframe src={url} title={`CV — ${selected.fileName}`} className="h-[70vh] min-h-[480px] w-full bg-white" />
          )}
        </div>
      )}
    </div>
  );
}

/** Optional photo from the CV Builder. Never used by AI; hidden when the company chooses so. */
function CandidatePhoto({ candidateId }: { candidateId: string }) {
  const db = useDb();
  const photo = db.candidatePhotos.find((p) => p.candidateId === candidateId);
  const [show, setShow] = React.useState(false);
  if (!photo) return null;
  if (db.cvSettings.hidePhotos) return <p className="text-xs text-muted-foreground">The candidate added a photo. Photos are hidden during screening in this company.</p>;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/orgs/${db.org.id}/photos/${photo.id}`} alt="Candidate photo" className="size-16 rounded-md object-cover ring-1 ring-border" />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShow(true)}>Show photo</Button>
      )}
      <span>Optional photo provided by the candidate. It isn&apos;t used for AI or assessment.</span>
    </div>
  );
}
