# Ulysse in GitHub Codespaces

When the codespace finishes starting, the app opens on port **3000** (or open the **Ports** tab and click the globe next to 3000). The first start takes a few minutes because it installs dependencies and builds the app.

**Demo sign-in:** `demo@example.com` / `Ulysse-demo-2026` — platform admin (`/admin`) and admin of the demo company **Aegean Analytics**.

- Candidate side: sign out (or use a private window) and open `/careers/aegean-analytics`.
- AI features: add `ANTHROPIC_API_KEY` as a Codespaces secret for this repository (GitHub → Settings → Codespaces → Secrets), then restart the codespace. Without it, AI actions say "not configured" and everything else works.
- Emails are recorded in the outbox but not sent (no SMTP configured).
- Server log: `/tmp/ulysse.log`. Restart the app: `bash .devcontainer/start.sh`.

This is a temporary demo environment with sample data — don't put real candidate data in it.
