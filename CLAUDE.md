# CLAUDE.md

## Commands

```bash
npm start                # combined server (webhook + dashboard) — used by Railway
npm run start:terminal   # interactive test harness (stdin → FSM → stdout)
npm run start:dashboard  # same as npm start — webhook + dashboard on PORT
npm run seed             # reset DB and repopulate routes/variants/stops
npm run db:reset         # clear reports only, keep routes/stops intact
npm test                 # run vitest suite
npm run add-admin -- --username <u> --password <p>   # create dashboard admin user
```

TypeScript runs via `ts-node` — no build step in development.

---

## Project context

PasajeroChat is a chatbot for urban bus passengers in Tijuana, Baja California. The problem it solves: information about bus whereabouts currently lives in private WhatsApp groups — people get kicked out arbitrarily and there is no open, neutral source.

The channel is Facebook Messenger (and eventually WhatsApp) because a large portion of the target users have limited mobile data, do not install new apps, but already have Messenger installed and it functions well on low bandwidth.

Users report bus sightings at stops. Other passengers on the same route can query when a bus was last seen. The three routes covered are Violeta, SITT, and Suburbaja.

---

## Architecture

### Finite State Machine

All conversation logic lives in `src/fsm/`. Each user session is tracked in-memory via `Map<string, UserState>` keyed by `psid`. Sessions expire after 30 minutes of inactivity and reset to `menu`. Sending `0` from any state returns to menu.

The FSM delegates to three handlers based on current state:

- `menuHandler` — main menu and `mostrando_mapas`
- `reportHandler` — route → variant → stop → anti-spam check → INSERT
- `consultHandler` — route → variant → SELECT last 5 active reports

**State transitions:**

| State | Valid inputs | Next state |
|---|---|---|
| `menu` | 1 | `aguardando_ruta` |
| `menu` | 2 | `consultando_ruta` |
| `menu` | 3 | `mostrando_mapas` |
| `aguardando_ruta` | 1/2/3 | `aguardando_variante_*` |
| `aguardando_variante_*` | numeric index | `aguardando_parada` |
| `aguardando_parada` | numeric index | anti-spam check → `menu` |
| `consultando_ruta` | 1/2/3 | `consultando_variante` |
| `consultando_variante` | numeric index | `mostrando_resultados` |
| `mostrando_resultados` | any | `menu` |

Invalid input in any state keeps the state unchanged and shows an error message.

**Business rules:**

- Anti-spam: 1 report per user per 10 minutes. Remaining wait time is calculated and shown.
- Reports expire after 90 minutes via `expires_at`. Queries filter on `is_active = true AND expires_at > NOW()`.
- Session timeout: 30 minutes of inactivity resets to `menu`.
- The "Yo también la vi" confirmation flow was removed from the FSM. The `confirm_count` column and `confirmations` table still exist in the schema but are not written to by any current handler.

### Database

PostgreSQL via `pg` module (`Pool`), wrapped in a Promise-based `query()` helper in `src/db/connection.ts`. Connection string via `DATABASE_URL` env var. SSL enabled in production (`NODE_ENV=production`).

```
routes          — transportation companies (Violeta, SITT, Suburbaja)
route_variants  — directional variants per route (Ida / Vuelta)
stops           — stops per variant, ordered by stop_number
reports         — sighting reports (90-minute expiration)
confirmations   — reserved, not used
users           — dashboard admin users (bcrypt passwords)
```

**Important:** PostgreSQL returns `TIMESTAMPTZ` columns as proper JavaScript `Date` objects (serialized as ISO strings in JSON). Do NOT add `+ 'Z'` or `.replace(' ', 'T')` hacks — `new Date(row.timestamp)` works directly.

**Date/time syntax:** Use `NOW()`, `NOW() - INTERVAL '10 minutes'`, `NOW() + INTERVAL '90 minutes'`. Use `EXTRACT(HOUR FROM col)` instead of `strftime`. Use `FLOOR(EXTRACT(EPOCH FROM (NOW() - col)) / 60)::INTEGER` for minute differences.

**Schema types:** `SERIAL PRIMARY KEY`, `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `BOOLEAN DEFAULT true`.

**Deploy:** Un solo servicio Railway corre webhook + dashboard juntos (`npm start` → `ts-node src/dashboard/server.ts`). Required env vars: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`, `VERIFY_TOKEN`, `PAGE_ACCESS_TOKEN`. `PORT` lo asigna Railway automáticamente.

### Admin dashboard

`src/dashboard/server.ts` serves a real-time operations panel via SSE (10-second push interval). It exposes REST endpoints under `/api/` for all metrics. The frontend in `src/dashboard/public/` renders without any framework.

The dashboard is protected by session-based authentication (`express-session` + `bcrypt`). All routes except `/webhook` require a valid session.

**Auth files:**
- `src/auth/middleware.ts` — `requireAuth` Express middleware (redirects to `/login` if no session)
- `src/auth/session.d.ts` — TypeScript module augmentation adding `userId: number` to `SessionData`. Referenced via triple-slash directive (`/// <reference path="../auth/session.d.ts" />`) at the top of `server.ts` — do NOT import it as a module (it has no JS runtime equivalent)
- `src/auth/middleware.test.ts` — 2 vitest tests for `requireAuth`
- `src/scripts/add-admin.ts` — CLI to create admin users: `npm run add-admin -- --username <u> --password <p>`

**Auth routes:**
- `GET /login` — login form
- `POST /login` — verify credentials, create session
- `POST /logout` — destroy session, redirect to `/login`
- `GET /admin/users` — list users + create-user form
- `POST /admin/users` — create new user (password 8–72 chars)
- `POST /admin/users/:id/delete` — delete user (cannot delete self)

**Database:** `users` table in `src/db/schema.sql` with `id, username, password_hash, created_at`. Passwords hashed with bcrypt cost 12. The seed script does NOT touch the users table — users survive `npm run seed`.

**Session secret** stored in `.env` as `SESSION_SECRET`. The `.env` file is NOT tracked in git (`git rm --cached .env` was run). Set this variable in your environment before running the dashboard.

### Entry point

`src/terminal.ts` simulates a messaging platform via stdin. All messages are processed as `psid = "terminal-user"`.

The Messenger/WhatsApp webhook is not yet implemented. The next integration step is replacing `terminal.ts` with a webhook handler that maps incoming platform events to `psid` values and routes them through `stateMachine.ts`.
