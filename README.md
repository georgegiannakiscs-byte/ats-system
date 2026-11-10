# Déceler — Applicant Tracking System (frontend)

A premium, frontend-only ATS prototype. Every screen is interactive and backed by a
typed mock service layer that persists to `localStorage`, ready to be swapped for a
real API.

> **Demo data.** All people, companies and emails are fictional. No emails are sent,
> no calendar invites are created, and no LinkedIn / Google / Microsoft APIs are called.
> Simulated states are labelled in the UI ("Demo", "simulated", "not sent").

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

Reset the demo dataset any time from **Settings → Appearance → Reset demo data** (or the
workspace menu in the sidebar).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui-style
components on Radix primitives · Lucide icons · dnd-kit · Recharts · cmdk · sonner ·
next-themes · date-fns.

## Rebranding

The product name lives in `src/config/brand.ts`; the logo is `src/assets/deceler-logo.png`
(used unmodified, framed with CSS in `components/shell/brand-mark.tsx`). Page titles,
and storage keys read from the config. Colours are design tokens in
`src/app/globals.css`: forest green `--primary`/`--brand`, terracotta `--signal` for
selected states and small details, cream `--background` (light and dark values are
defined separately).

## Architecture

```
src/
  config/brand.ts          Product name & tagline
  app/(app)/               Routes: overview, jobs, candidates, talent-pool,
                           interviews, tasks, analytics, settings
  components/
    ui/                    Primitives (button, inputs, dialogs, menus, tabs, …)
    shell/                 Sidebar, top bar, ⌘K command menu, global overlay controller
    pipeline/              Kanban board (dnd-kit), pipeline table, candidate card
    candidates/            Profile, slide-over preview, inline editing, dialogs
    interviews/ tasks/ jobs/ settings/ charts/ common/
  lib/
    types.ts               Domain model (mirrors future API payloads)
    api/index.ts           ← The only write path. Async methods, one per use case.
    api/store.ts           Mock persistence (external store + localStorage)
    api/selectors.ts       Pure read helpers
    mock/seed.ts           Deterministic demo dataset
    analytics.ts           Funnel, source and time-series computations
```

**Swapping in a backend:** re-implement the methods in `lib/api/index.ts` with HTTP
calls (they already return Promises), and replace `useDb()` reads with your data
fetching layer (e.g. TanStack Query). Components never touch `localStorage` directly.

## Keyboard

`⌘K` search & commands · `C` create · `[` toggle sidebar · `G` then `O/J/C/P/I/T/A/S`
to navigate · `J/K` next/previous candidate in the slide-over · `?` all shortcuts.
Kanban cards can be moved with the keyboard: focus a card, `Space`, arrow keys, `Space`.
