# DameonNotes

A personal task journal organised into three planning horizons — short term, medium term, and long term. Built with Next.js, SQLite (Turso), and plain CSS.

---

## Features

- **Three-column board** — Short term (this month), Medium term (this quarter), Long term (this year)
- **Task management** — add, edit, tag, set due dates, mark complete (one-way — can't uncheck)
- **Calendar date picker** — click any day, navigates by month
- **Tag system** — create, rename, delete tags; colours auto-assigned per tag name
- **Auto-archive** — completed tasks move to archive automatically after 30 days
- **Multi-user auth** — up to 3 users; each has their own board, tags, and theme
- **Dark / light theme** — persisted per user
- **Search** — filters tasks and tags in real time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 18 (client components) |
| Database | SQLite via `@libsql/client` (Turso) |
| Styles | Plain CSS with custom properties |
| Deployment | Vercel + Turso cloud |

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up local environment
cp .env.example .env.local
# .env.local already points to file:local.db — no other setup needed

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database (`local.db`) is created automatically on first request.

---

## Environment Variables

| Variable | Description |
|---|---|
| `TURSO_DATABASE_URL` | `file:local.db` for local dev, `libsql://...` for production |
| `TURSO_AUTH_TOKEN` | Required for Turso cloud only; leave unset for local file |

See `.env.example` for the full template.

---

## Deployment (Vercel + Turso)

**1. Create a Turso database**

Option A — Web dashboard (no CLI needed):
> Go to [turso.tech](https://turso.tech) → Create Database → copy the URL and token from Settings.

Option B — CLI:
```bash
# Windows: run in PowerShell
irm https://get.turso.tech/windows.ps1 | iex

turso auth login
turso db create dameon-notes
turso db show --url dameon-notes      # → TURSO_DATABASE_URL
turso db tokens create dameon-notes   # → TURSO_AUTH_TOKEN
```

**2. Add env vars in Vercel**

Vercel → Project → Settings → Environment Variables:
```
TURSO_DATABASE_URL = libsql://dameon-notes-<org>.turso.io
TURSO_AUTH_TOKEN   = <token>
```

**3. Set the function region closest to your Turso DB**

In `vercel.json`, set `regions` to match your Turso region (reduces latency):
```json
{ "framework": "nextjs", "regions": ["sin1"] }
```

**4. Deploy**

Push to GitHub — Vercel picks it up automatically. The schema and default data are created on first request.

---

## Project Structure

```
src/
  app/
    layout.tsx              — root HTML shell, fonts, metadata
    page.tsx                — entry point, renders <App />
    globals.css             — all styles and design tokens
    api/
      auth/
        users/route.ts      — GET  list of usernames
        login/route.ts      — POST username + password → session
        signup/route.ts     — POST create account (max 3 users)
      board/route.ts        — GET  tasks grouped by column
      archive/route.ts      — GET  archived tasks
      tasks/route.ts        — POST create task
      tasks/[id]/route.ts   — PATCH update task
      tags/route.ts         — GET, POST
      tags/[name]/route.ts  — PATCH rename, DELETE
      settings/[key]/route.ts — GET, PUT (theme)
  components/
    App.jsx                 — full board UI and state (~830 lines)
    LoginScreen.jsx         — user list, password prompt, signup form
  lib/
    db.ts                   — Turso client, schema init, row helpers
    api.js                  — fetch wrappers (adds X-User-Id header)
    auth.ts                 — getUserId() helper for API routes

vercel.json                 — framework declaration for Vercel
.env.example                — environment variable template
```

---

## Notes

- **Passwords are stored in plain text** — this is intentional for easy recovery via the DB. Do not use this for anything sensitive.
- **Max 3 users** — enforced at the API level. The "New user" tile disappears automatically when the limit is reached.
- **Tasks cannot be unchecked** once marked complete.
- **No test runner or linter** is configured.
