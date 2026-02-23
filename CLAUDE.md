# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the terminal-based test interface (interactive chatbot)
npm run start:terminal

# Seed the database with routes, variants, and stops
npm run seed
```

TypeScript is compiled on-the-fly via `ts-node`. There is no separate build step for development. The `test` script exists in `package.json` but is not yet implemented.

## Architecture

PasajeroChat is a WhatsApp/Messenger-style chatbot for urban bus passengers. Users can report bus sightings at stops and query when a bus was last seen on a given route.

### Core Pattern: Finite State Machine (FSM)

All conversation logic lives in a **FSM** (`src/fsm/`). Each user session is tracked in-memory via `Map<string, UserState>` keyed by `psid` (platform-specific user ID). Sessions time out after 30 minutes of inactivity and reset to `menu`.

The FSM has ~18 states. Key ones:

| State | Purpose |
|---|---|
| `menu` | Entry point; routes to report or consult flow |
| `aguardando_ruta` | User choosing a route (Violeta, SITT, Suburbaja) |
| `aguardando_variante_*` | Variant sub-states (direction/variant selection) |
| `aguardando_parada` | Stop selection |
| `consultando_ruta/variante` | Query flow: select route/variant to look up |
| `mostrando_resultados` | Displays last 5 active reports with confirm counts |
| `confirmando_avistamiento` | User confirming a sighting ("Yo también la vi") |
| `mostrando_mapas` | Map link display |

`"0"` returns to menu from any state.

### Handler Modules (`src/fsm/handlers/`)

The FSM delegates to three handlers based on current state:
- `menuHandler` — main menu navigation
- `reportHandler` — report submission flow (anti-spam: 1 report per 10 min per user)
- `consultHandler` — query flow + confirmation logic

### Confirmation Logic

When a user confirms a sighting:
- **Report < 10 min old** → increment `confirm_count` (voting)
- **Report > 20 min old** → create a new report (old data, treat as fresh sighting)

### Database (`src/db/`)

SQLite3 via `better-sqlite3`-style API in `connection.ts`. Schema:

- `routes` — transportation companies
- `route_variants` — directional variants per route (Ida/Vuelta)
- `stops` — stops per variant
- `reports` — sighting reports (expire after 90 min, tracked via `is_active` + `expires_at`)
- `confirmations` — per-user confirmation records

All menus are database-driven: routes → variants → stops are queried dynamically.

### Entry Point

`src/terminal.ts` is the current test harness — it simulates a messaging platform by reading from stdin and passing messages through the FSM as if they came from a user with `psid = "terminal-user"`.

The actual messaging platform integration (Messenger/WhatsApp webhook) is not yet implemented.

### Detailed FSM Documentation

`context/FSM_ESTADOS_COMPLETO.md` contains the full state diagram, all transitions, input validation rules, and data structures. Consult it before modifying FSM logic.

`context/roadmap.md` contains the Scrum backlog and sprint status.
