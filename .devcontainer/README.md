# Ulysse in GitHub Codespaces

Open port **3000** (it opens automatically, or use the **Ports** tab → globe next to 3000). The app starts by itself - no terminal needed. During the first start (a few minutes: install and build) the page shows "The app is starting…" and refreshes until the app is ready. If setup fails, that page shows the error.

**Demo sign-in:** `demo@example.com` / `Ulysse-demo-2026` - platform admin (`/admin`) and admin of the demo company **Aegean Analytics**.

- Candidate side: sign out (or use a private window) and open `/careers/aegean-analytics`.
- AI features: add `ANTHROPIC_API_KEY` as a Codespaces secret for this repository (GitHub → Settings → Codespaces → Secrets), then restart the codespace. Without it, AI actions say "not configured" and everything else works.
- Emails are recorded in the outbox but not sent (no SMTP configured).
- Server log: `/tmp/ulysse.log`. The server restarts itself if it stops; to force a restart run `bash .devcontainer/start.sh`.

This is a temporary demo environment with sample data - don't put real candidate data in it.
