# PasajeroChat

A WhatsApp/Messenger chatbot for urban bus passengers in Tijuana. Users report bus sightings at stops; other passengers on the same route can query when a bus was last seen.

Built as a learning project to explore finite state machines, event-driven conversation flows, and real-time operational tooling.

---

## Overview

The core problem: bus schedules in Tijuana are unreliable and there is no real-time tracking. PasajeroChat turns passengers into a distributed sensor network — each person who sees a bus reports it, and everyone waiting at a stop can query the last known position.

**Routes covered:** Violeta, SITT, Suburbaja (Tijuana, Baja California)

---

## Architecture

```
src/
├── fsm/
│   ├── stateMachine.ts       — session routing and timeout logic
│   ├── types.ts              — UserState type definitions
│   └── handlers/
│       ├── menuHandler.ts    — main menu navigation
│       ├── reportHandler.ts  — report submission + anti-spam
│       └── consultHandler.ts — route query flow
├── db/
│   ├── connection.ts         — SQLite wrapper with Promise-based API
│   └── schema.sql            — table definitions
├── dashboard/
│   ├── server.ts             — Express API + SSE push
│   └── public/               — dashboard frontend (HTML/CSS/JS)
├── scripts/
│   ├── seed.ts               — populate routes, variants, and stops
│   └── reset.ts              — clear operational data for testing
└── terminal.ts               — local test harness (stdin → FSM → stdout)
```

### Finite State Machine

Each user session is tracked in-memory via `Map<string, UserState>` keyed by `psid`. Sessions expire after 30 minutes of inactivity and reset to `menu`. Sending `0` from any state returns to the main menu.

| State | Description |
|---|---|
| `menu` | Entry point; routes to report or consult flow |
| `aguardando_ruta` | User selecting a route |
| `aguardando_variante_*` | Variant/direction selection (per route) |
| `aguardando_parada` | Stop selection |
| `consultando_ruta/variante` | Query flow: select route and variant to look up |
| `mostrando_resultados` | Displays last 5 active reports for the queried variant |
| `mostrando_mapas` | Returns Google Maps links for each route |

**Report flow:** route → variant → stop → anti-spam check → INSERT

**Query flow:** route → variant → SELECT last 5 active reports

### Anti-spam

One report per user per 10 minutes. On attempt, the system queries for a recent report from the same `psid` and returns a cooldown message with the exact wait time remaining.

### Report expiration

Reports expire after 90 minutes via an `expires_at` column. The dashboard and query results filter on `is_active = 1 AND expires_at > datetime('now')`.

### Database schema

```sql
routes          — transportation companies (Violeta, SITT, Suburbaja)
route_variants  — directional variants per route (Ida / Vuelta)
stops           — stops per variant, ordered by stop_number
reports         — sighting reports with 90-minute expiration
confirmations   — per-user confirmation records (reserved, feature paused)
```

---

## Getting started

**Requirements:** Node.js 18+

```bash
npm install
npm run seed        # create schema and populate routes/stops
npm run start:terminal
```

The terminal harness simulates a messaging platform. Type as a user and the FSM responds. All messages are processed as `psid = "terminal-user"`.

---

## Commands

| Command | Description |
|---|---|
| `npm run start:terminal` | Interactive CLI test interface |
| `npm run start:dashboard` | Admin dashboard at `http://localhost:3000` |
| `npm run seed` | Reset database and re-seed routes/stops |
| `npm run db:reset` | Clear reports only, keep routes and stops intact |
| `npm test` | Run test suite (Vitest) |

TypeScript is compiled on the fly via `ts-node`. There is no separate build step.

---

## Admin dashboard

The dashboard is a real-time operations panel served by the Express backend. It uses Server-Sent Events to push data every 10 seconds without polling from the client.

**System health** — minutes since the last report, with threshold-based status indicators (active / low activity / no reports).

**KPIs** — active reports right now, reports in the last 24 hours, unique users today, reports in the last hour.

**Active reports table** — live view of all non-expired reports with relative timestamps and expiration countdown.

**Route coverage** — per-route summary showing report volume, unique users, and time since last report over the past 7 days. Flags abandoned routes.

**Hourly charts** — bar chart of activity over the last 24 hours; line chart comparing today against the 30-day hourly average.

**Users under review** — automatically surfaces users with more than 5 reports in 24 hours or more than 2 in a single hour.

**Top stops** — all-time report volume per stop, useful for identifying high-traffic locations.

---

## Environment

The project uses a local SQLite file (`pasajerochat.sqlite`) excluded from version control. No additional environment configuration is required for local development.

For deployment, the database either needs a persistent volume or a migration to PostgreSQL. `connection.ts` already uses `$1/$2` parameterized syntax and converts to SQLite's `?` internally, so the migration surface is limited to that file.

---

## Project context

| Item | Detail |
|---|---|
| Stack | Node.js, TypeScript, SQLite3, Express |
| Real-time | Server-Sent Events |
| Testing | Vitest |
| Platform target | WhatsApp / Meta Messenger (webhook not yet implemented) |
| Location | Tijuana, Baja California |

The Messenger/WhatsApp webhook integration is not yet implemented. The FSM is fully functional and tested via the terminal harness. The next integration step is replacing `terminal.ts` with a webhook handler that maps incoming messages to `psid` values and passes them through the existing `stateMachine.ts`.

---

## Development notes

Full FSM state diagram, transition table, and data structures are documented in `context/FSM_ESTADOS_COMPLETO.md`.

Sprint history and backlog are tracked in `context/roadmap.md`.
