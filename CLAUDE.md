# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL BOUNDARY — Git

**NEVER run `git commit`, `git push`, or any destructive git command automatically.**
Only do so when the user's message explicitly says "commit", "push", "commit and push", or equivalent.
Completing a task (fix, feature, refactor) does NOT imply permission to commit or push.
A past approval to push does NOT carry forward to future changes.

---

## Working Instructions

We are always working towards the solution together. Ask when there is ambiguity that can't be resolved or if it will change the direction of the work significantly.

**Before starting any task, verify the prompt has:**
1. A clear goal to accomplish
2. Milestone objectives on the way to the answer (if non-trivial)
3. Enough context to avoid wrong assumptions

If any of the above are missing and the gap would change direction, ask directly before proceeding.

**After every response:**
- Check for  improvements, loopholes, flaws, misuses, misguides, vulnerabilities, misformations, hallucinations, security exploits, instability issues, edge cases, or source credibility issues
- Confirm the response actually addresses the problem statement
- Provide a concise summary of what changed and why it solves the problem

**When editing files:**
- Work like git — track net changes and edit existing files in-place
- Do not create new files from scratch unless explicitly required or unavoidable
- Prefer targeted edits over full rewrites

---

## Commands

```bash
npm run dev      # Next.js dev server → http://localhost:3000
npm run build    # Production build
npm start        # Run production build (NODE_ENV=production)
```

No test runner or linter is configured.

Node.js installed via `winget install OpenJS.NodeJS.LTS`.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 18, client components (`'use client'`) |
| Database | SQLite via `@libsql/client` (Turso) |
| Styles | Plain CSS (custom properties, no Tailwind) |
| Deployment | Vercel + Turso cloud DB |

---

## File Structure

```
src/
  app/
    layout.tsx          — root HTML shell, Google Fonts, metadata
    page.tsx            — renders <App /> (entry point)
    globals.css         — all styles, design tokens, theme variants
    api/
      auth/
        users/route.ts        — GET list of usernames (no auth required)
        login/route.ts        — POST username+password → { id, username }
        signup/route.ts       — POST create user (max 3 enforced here)
      board/route.ts          — GET (sweep archive, return grouped tasks)
      archive/route.ts        — GET
      tasks/route.ts          — POST (create task)
      tasks/[id]/route.ts     — PATCH (update task fields)
      tags/route.ts           — GET, POST
      tags/[name]/route.ts    — PATCH (rename), DELETE
      settings/[key]/route.ts — GET, PUT (theme stored here)
  components/
    App.jsx             — all React components and state logic (~830 lines)
    LoginScreen.jsx     — user list tiles, password prompt, signup form
  lib/
    db.ts               — @libsql/client singleton, schema init, helpers
    api.js              — fetch wrappers (injects X-User-Id header)
    auth.ts             — getUserId(req) and unauthorized() helpers

vercel.json             — declares Next.js framework for Vercel detection
local.db                — local SQLite file (git-ignored; auto-created)
.env.local              — TURSO_DATABASE_URL=file:local.db (local dev)
.env.example            — template with Turso production setup instructions
```

---

## Database

**Driver:** `@libsql/client`
- Local dev: `TURSO_DATABASE_URL=file:local.db` — pure file-based SQLite, no setup needed
- Production (Vercel): `TURSO_DATABASE_URL=libsql://...` + `TURSO_AUTH_TOKEN=...` from Turso dashboard

**Schema** (auto-created on first request via `getDb()` in `src/lib/db.ts`):

```sql
users    (id, username, password)                          -- plain-text passwords by design
tasks    (id, user_id, col_key, text, due, tag, done, priority, completed_at, is_archived, origin_hue, created_at)
tags     (user_id, name)                                   -- PRIMARY KEY (user_id, name)
settings (user_id, key, value)                             -- PRIMARY KEY (user_id, key); stores theme
```

All tables are user-scoped. Every API route reads `X-User-Id` header via `getUserId(req)` in `src/lib/auth.ts` and returns 401 if absent.

**Schema migration:** if `users` table is missing (old v1 schema), `getDb()` drops `tasks/tags/settings` and recreates all four tables. Safe to run on a fresh `local.db`.

**Key helper functions in `src/lib/db.ts`:**
- `getDb()` — returns initialised client; creates tables on first cold start
- `rowToTask(row)` — maps DB row → frontend Task shape (excludes `user_id`)
- `sweepArchive(userId)` — moves tasks with `done=1` and `completed_at < 30d ago` to `is_archived=1`
- `DEFAULT_TAGS` — array of 8 default tag names seeded on signup

**Auto-archive** runs server-side inside `GET /api/board` on every load (idempotent).

---

## Architecture

**DameonNotes** is a personal task journal with three planning horizons. The frontend is a single client-side React tree; data fetches from Next.js API routes; all state persists to SQLite.

### State shape (React, in `App.jsx`)

```js
board:   { short: Task[], medium: Task[], long: Task[] }
archive: Task[]        // read-only; tasks auto-moved here after 30d post-completion
tags:    string[]      // user-managed
theme:   'dark' | 'light'
loading: boolean
```

`Task` fields: `id`, `text`, `due` (ISO date | null), `tag`, `done`, `priority` (`'high'|'med'|'low'`), `completedAt` (ms timestamp | null), `_origin` (column hue, archive only).

### Data flow

1. On mount: `Promise.all` fetches board, archive, tags, and theme from API → sets state
2. All mutations: **optimistic update** (local state changes immediately) + fire-and-forget API call
3. No error recovery on API failure by design (local app)

### Three views

| View | Component | Notes |
|---|---|---|
| `board` | `Column` × 3 | Hover expands via `flexGrow`; Short term splits into two sub-panes |
| `archive` | `ArchiveView` | Read-only; shows tasks archived by the server sweep |
| `tags` | `TagsView` | CRUD; renaming propagates to all tasks via `PATCH /api/tags/:name` |

### Auth flow

- App loads → checks `localStorage('dameon_session')` → if found, restores session and skips login screen
- `LoginScreen` shows all user tiles (fetched from `GET /api/auth/users`). Click a tile → password prompt. "New user" tile visible only when `users.length < 3`.
- On login/signup success: `api.setUserId(id)` sets the `X-User-Id` header for all subsequent API calls; session written to `localStorage('dameon_session')`.
- Logout: clears localStorage, calls `api.clearUserId()`, resets all state.
- **Max 3 users** — enforced in `POST /api/auth/signup` with a COUNT check.
- **Passwords are plain text** — intentional for easy DB lookup if forgotten.

### Task rules

- **Checked tasks cannot be unchecked** — `onToggle` only sets `done: true`; the check button is `disabled` once done
- **No seed/demo data** — board starts empty; tags are seeded per-user at signup

### Theming

Toggled via `document.documentElement.dataset.theme = 'dark' | 'light'`. Persisted to `settings` table via `PUT /api/settings/theme`. All colors are CSS custom properties in `globals.css` under `:root[data-theme="dark"]` / `[data-theme="light"]`. Column accent colors use `data-hue` attribute (`green`, `yellow`, `blue`). Tag colors use `--tag-{tagname-lowercase}`.

### Key patterns

- **`usePopover(onClose)`** — click-outside + ESC; used by `TagPicker` and `DatePicker`. Popovers use `position: absolute; z-index: 1000`. `.col-inner` must stay `overflow: visible` so popovers aren't clipped.
- **Column flex expansion** — hovering boosts `flexGrow` by `POP_STRENGTH` (35%); other columns dim via `.is-dim`.
- **Composer layout** — `NewTaskComposer` uses a two-row meta layout: chips row (tag, date) + actions row (Cancel, Add task right-aligned). This keeps equal height across all three columns regardless of `noDueDate`.
- **Task sort** — by due date ascending, then incomplete before complete.

### Fonts

Loaded via `<link>` in `src/app/layout.tsx`: Space Grotesk (UI), Bungee (display/brand), VT323 (mono accent), JetBrains Mono (code mono), Inter (fallback).

---

## Deployment (Vercel + Turso)

1. Push repo to GitHub, connect in Vercel dashboard
2. Create Turso DB:
   ```bash
   turso db create dameon-notes
   turso db show --url dameon-notes   # → TURSO_DATABASE_URL
   turso db tokens create dameon-notes # → TURSO_AUTH_TOKEN
   ```
3. Add both env vars in Vercel project settings
4. Deploy — schema is auto-created on first request

All API routes run on the **Node.js runtime** (not Edge). Do not add `export const runtime = 'edge'` to any route that imports `src/lib/db.ts`.
