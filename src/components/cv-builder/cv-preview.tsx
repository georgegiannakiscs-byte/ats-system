"use client";
import * as React from "react";
import { CV_LABELS, dateRange, type CvData, type CvLang, type CvTemplate } from "@/lib/cv/schema";

/*
 * Live HTML approximation of the PDF templates (same order, fonts and colours) so candidates
 * see changes instantly. The downloadable file is always the server-rendered PDF.
 */
const THEME: Record<CvTemplate, { font: string; ink: string; muted: string; accent: string; rule: string }> = {
  minimal: { font: "'Liberation Sans', Arial, Helvetica, sans-serif", ink: "#1b1f1d", muted: "#5d6560", accent: "#1b1f1d", rule: "#d9dcd9" },
  modern: { font: "'Liberation Sans', Arial, Helvetica, sans-serif", ink: "#16231d", muted: "#5f6a64", accent: "#193329", rule: "#be7157" },
  professional: { font: "'Liberation Serif', 'Times New Roman', Georgia, serif", ink: "#111111", muted: "#4a4a4a", accent: "#111111", rule: "#111111" },
};
const lines = (s: string) => s.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
const caps = (s: string) => s.normalize("NFD").replace(/[́̈]/g, "").toUpperCase().normalize("NFC");

export function CvPreview({ data, template, lang, photo }: { data: CvData; template: CvTemplate; lang: CvLang; photo: string | null }) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.5);
  const [pages, setPages] = React.useState(1);
  React.useEffect(() => {
    const el = wrap.current;
    const page = inner.current;
    if (!el || !page) return;
    const ro = new ResizeObserver(() => {
      setScale(el.clientWidth / 794);
      setPages(Math.max(1, Math.ceil(page.scrollHeight / 1123)));
    });
    ro.observe(el);
    ro.observe(page);
    return () => ro.disconnect();
  }, []);
  const t = THEME[template];
  const L = CV_LABELS[lang];
  const p = data.personal;
  const contact = [p.email, p.phone, [p.location, p.country].filter(Boolean).join(", "), p.linkedinUrl, p.portfolioUrl].filter(Boolean);
  const center = template === "professional" && !photo;
  const isCircle = data.photoShape === "circle";

  const H = ({ children }: { children: string }) =>
    template === "professional" ? (
      <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1.3, borderBottom: `0.7px solid ${t.rule}`, paddingBottom: 2, margin: "18px 0 8px" }}>{caps(children)}</h3>
    ) : template === "modern" ? (
      <h3 style={{ fontSize: 14.5, fontWeight: 700, color: t.accent, margin: "18px 0 6px" }}>{children}</h3>
    ) : (
      <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: "18px 0 6px" }}>{caps(children)}</h3>
    );
  const Entry = ({ title, sub, dates }: { title: string; sub: string; dates: string }) => (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <strong style={{ fontSize: 14 }}>{title || sub}</strong>
        {dates && <span style={{ fontSize: 12.5, color: t.muted, whiteSpace: "nowrap" }}>{dates}</span>}
      </div>
      {title && sub && <div style={{ fontSize: 13.3, color: t.muted, fontStyle: template === "professional" ? "italic" : "normal" }}>{sub}</div>}
    </div>
  );
  const Bullets = ({ items }: { items: string[] }) => <ul style={{ margin: "4px 0 0 10px", padding: 0, listStyle: "none" }}>{items.map((i, k) => <li key={k} style={{ fontSize: 13.3, lineHeight: 1.45 }}>•&nbsp;&nbsp;{i}</li>)}</ul>;
  const Body = ({ children }: { children: React.ReactNode }) => <p style={{ fontSize: 13.3, lineHeight: 1.5, margin: "2px 0 0", whiteSpace: "pre-line" }}>{children}</p>;

  return (
    <div ref={wrap} className="w-full" aria-label="CV preview">
      <div style={{ height: 1123 * pages * scale }} className="relative overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-black/5">
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-signal/60" style={{ top: 1123 * (i + 1) * scale }} />
        ))}
        <div ref={inner} style={{ width: 794, minHeight: 1123, transform: `scale(${scale})`, transformOrigin: "top left", background: "#fff", color: t.ink, fontFamily: t.font, padding: "64px 69px" }}>
          <header style={{ display: "flex", gap: 24, flexDirection: template === "modern" ? "row" : "row-reverse", justifyContent: center ? "center" : "space-between", alignItems: "flex-start" }}>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" style={{ width: 112, height: isCircle ? 112 : 140, objectFit: "cover", borderRadius: isCircle ? "50%" : 6, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, textAlign: center ? "center" : "left" }}>
              <div style={{ fontSize: template === "professional" ? 29 : 32, fontWeight: 700, color: t.accent, lineHeight: 1.15 }}>{p.fullName || " "}</div>
              {p.headline && <div style={{ fontSize: 16, color: t.muted, marginTop: 3 }}>{p.headline}</div>}
              {contact.length > 0 && <div style={{ fontSize: 12.7, color: t.muted, marginTop: 6, wordBreak: "break-word" }}>{contact.join("  ·  ")}</div>}
            </div>
          </header>
          {template === "modern" ? <div style={{ width: 48, height: 3, background: t.rule, margin: "14px 0 6px" }} /> : <hr style={{ border: 0, borderTop: `${template === "professional" ? 1.3 : 0.8}px solid ${t.rule}`, margin: "12px 0 4px" }} />}

          {data.summary.trim() && (<><H>{L.summary}</H><Body>{data.summary.trim()}</Body></>)}
          {data.experience.length > 0 && (
            <>
              <H>{L.experience}</H>
              {data.experience.map((e) => (
                <div key={e.id} style={{ marginBottom: 10 }}>
                  <Entry title={e.title} sub={e.company} dates={dateRange(e.start, e.end, e.current, lang)} />
                  {e.description.trim() && <Body>{e.description.trim()}</Body>}
                  {lines(e.responsibilities).length > 0 && <Bullets items={lines(e.responsibilities)} />}
                  {lines(e.achievements).length > 0 && (<><div style={{ fontSize: 12.7, fontWeight: 700, color: t.muted, marginTop: 4 }}>{L.achievements}</div><Bullets items={lines(e.achievements)} /></>)}
                </div>
              ))}
            </>
          )}
          {data.education.length > 0 && (
            <>
              <H>{L.education}</H>
              {data.education.map((e) => (
                <div key={e.id} style={{ marginBottom: 8 }}>
                  <Entry title={[e.degree, e.field].filter(Boolean).join(", ")} sub={e.institution} dates={dateRange(e.start, e.end, false, lang)} />
                  {e.description.trim() && <Body>{e.description.trim()}</Body>}
                </div>
              ))}
            </>
          )}
          {data.skills.length > 0 && (<><H>{L.skills}</H><Body>{data.skills.join("  ·  ")}</Body></>)}
          {data.languages.length > 0 && (<><H>{L.languages}</H><Body>{data.languages.map((l) => (l.level ? `${l.language} — ${l.level}` : l.language)).join("  ·  ")}</Body></>)}
          {data.certifications.length > 0 && (<><H>{L.certifications}</H>{data.certifications.map((c) => <div key={c.id}><Entry title={c.name} sub={c.issuer} dates={c.date} />{c.url && <Body>{c.url}</Body>}</div>)}</>)}
          {data.projects.length > 0 && (
            <>
              <H>{L.projects}</H>
              {data.projects.map((pr) => (
                <div key={pr.id} style={{ marginBottom: 8 }}>
                  <Entry title={pr.name} sub={pr.role} dates="" />
                  {pr.description.trim() && <Body>{pr.description.trim()}</Body>}
                  {pr.technologies.trim() && <div style={{ fontSize: 12.7, color: t.muted }}>{L.technologies}: {pr.technologies}</div>}
                  {pr.url && <Body>{pr.url}</Body>}
                </div>
              ))}
            </>
          )}
          {(["publications", "awards", "volunteering", "links", "other"] as const).map((k) => {
            const v = data.additional[k]?.trim();
            if (!v) return null;
            const ls = lines(v);
            return <React.Fragment key={k}><H>{L[k]}</H>{ls.length > 1 ? <Bullets items={ls} /> : <Body>{v}</Body>}</React.Fragment>;
          })}
        </div>
      </div>
    </div>
  );
}
