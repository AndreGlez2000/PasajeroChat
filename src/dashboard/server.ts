/// <reference path="../auth/session.d.ts" />
import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { requireAuth } from '../auth/middleware';
import { query, dbReady } from '../db/connection';
import { handleMessage } from '../fsm/stateMachine';

const VERIFY_TOKEN      = process.env.VERIFY_TOKEN      ?? '';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN ?? '';

const app = express();
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' },
}));

const PORT = Number(process.env.PORT) || 3000;

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loginPage(error = ''): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>PasajeroChat · Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090e;color:#e4e4f0;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#101016;border:1px solid #22222e;border-radius:12px;padding:2rem;width:100%;max-width:360px}
    h1{font-size:1.1rem;font-weight:600;margin-bottom:1.5rem}
    label{display:block;font-size:.8rem;color:#8080a0;margin-bottom:.3rem}
    input{width:100%;background:#16161e;border:1px solid #22222e;border-radius:6px;color:#e4e4f0;padding:.6rem .8rem;font-size:.9rem;margin-bottom:1rem;outline:none}
    input:focus{border-color:#7c3aed}
    button{width:100%;background:#7c3aed;border:none;border-radius:6px;color:#fff;padding:.7rem;font-size:.9rem;font-weight:500;cursor:pointer}
    button:hover{background:#6d28d9}
    .error{color:#ef4444;font-size:.8rem;margin-bottom:1rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>PasajeroChat · Dashboard</h1>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="POST" action="/login">
      <label>Usuario</label>
      <input type="text" name="username" required autofocus>
      <label>Contraseña</label>
      <input type="password" name="password" required>
      <button type="submit">Entrar</button>
    </form>
  </div>
</body>
</html>`;
}

// ---- Webhook (Facebook Messenger) ----

app.get('/webhook', (req: Request, res: Response) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[Webhook] Verificación exitosa');
        res.status(200).send(challenge);
    } else {
        console.warn('[Webhook] Verificación fallida — token incorrecto');
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req: Request, res: Response) => {
    const body = req.body;

    if (body.object !== 'page') {
        res.sendStatus(404);
        return;
    }

    res.sendStatus(200);

    for (const entry of body.entry ?? []) {
        for (const event of entry.messaging ?? []) {
            const psid = event.sender?.id as string | undefined;
            if (!psid || !event.message?.text) continue;

            const text = (event.message.text as string).trim();
            console.log(`[Webhook] psid=${psid} texto="${text}"`);

            try {
                const reply = await handleMessage(psid, text);
                await sendMessage(psid, reply);
            } catch (err) {
                console.error(`[Webhook] Error procesando mensaje de ${psid}:`, err);
            }
        }
    }
});

async function sendMessage(psid: string, text: string): Promise<void> {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn('[Webhook] PAGE_ACCESS_TOKEN no configurado — respuesta no enviada');
        return;
    }

    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipient: { id: psid }, message: { text } }),
    });

    if (!res.ok) {
        console.error(`[Webhook] Send API error ${res.status}:`, await res.text());
    }
}

// ---- Auth ----

app.get('/login', (_req: Request, res: Response) => {
    res.send(loginPage());
});

app.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body as { username: string; password: string };

    if (!username || !password) {
        res.send(loginPage('Usuario o contraseña incorrectos.'));
        return;
    }

    try {
        const result = await query(
            'SELECT id, password_hash FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            res.send(loginPage('Usuario o contraseña incorrectos.'));
            return;
        }

        const valid = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!valid) {
            res.send(loginPage('Usuario o contraseña incorrectos.'));
            return;
        }

        req.session.userId = result.rows[0].id;
        req.session.save((err) => {
            if (err) {
                res.send(loginPage('Error de sesión. Por favor intenta de nuevo.'));
                return;
            }
            res.redirect('/');
        });
    } catch {
        res.send(loginPage('Error interno. Por favor intenta de nuevo.'));
    }
});

app.post('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ---- Data helpers ----

async function getSummary() {
    const [active, today, users, lastHour] = await Promise.all([
        query(`SELECT COUNT(*) as total FROM reports WHERE is_active=true AND expires_at > NOW()`),
        query(`SELECT COUNT(*) as total FROM reports WHERE reported_at > NOW() - INTERVAL '1 day'`),
        query(`SELECT COUNT(DISTINCT user_psid) as total FROM reports WHERE reported_at > NOW() - INTERVAL '1 day'`),
        query(`SELECT COUNT(*) as total FROM reports WHERE reported_at > NOW() - INTERVAL '1 hour'`),
    ]);
    return {
        activeNow:        active.rows[0]?.total ?? 0,
        reportsToday:     today.rows[0]?.total ?? 0,
        uniqueUsersToday: users.rows[0]?.total ?? 0,
        reportsLastHour:  lastHour.rows[0]?.total ?? 0,
    };
}

async function getActiveReports() {
    const result = await query(`
        SELECT r.id, ro.name as route_name, rv.name as variant_name, rv.direction,
               s.name as stop_name, r.reported_at, r.expires_at, r.confirm_count, r.user_psid
        FROM reports r
        JOIN route_variants rv ON r.variant_id = rv.id
        JOIN routes ro ON rv.route_id = ro.id
        JOIN stops s ON r.stop_id = s.id
        WHERE r.is_active = true AND r.expires_at > NOW()
        ORDER BY r.reported_at DESC
    `);
    return result.rows;
}

async function getRecentHistory() {
    const result = await query(`
        SELECT r.id, ro.name as route_name, rv.name as variant_name, rv.direction,
               s.name as stop_name, r.reported_at, r.expires_at, r.is_active, r.confirm_count
        FROM reports r
        JOIN route_variants rv ON r.variant_id = rv.id
        JOIN routes ro ON rv.route_id = ro.id
        JOIN stops s ON r.stop_id = s.id
        ORDER BY r.reported_at DESC
        LIMIT 20
    `);
    return result.rows;
}

async function getByRoute() {
    const result = await query(`
        SELECT ro.name, COUNT(*) as count
        FROM reports r
        JOIN route_variants rv ON r.variant_id = rv.id
        JOIN routes ro ON rv.route_id = ro.id
        WHERE r.reported_at > NOW() - INTERVAL '7 days'
        GROUP BY ro.id, ro.name
        ORDER BY count DESC
    `);
    return result.rows;
}

async function getByHour() {
    const result = await query(`
        SELECT EXTRACT(HOUR FROM reported_at)::text as hour, COUNT(*) as count
        FROM reports
        WHERE reported_at > NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour
    `);
    return result.rows;
}

async function getTopStops() {
    const result = await query(`
        SELECT s.name as stop_name, ro.name as route_name, COUNT(*) as count
        FROM reports r
        JOIN stops s ON r.stop_id = s.id
        JOIN route_variants rv ON r.variant_id = rv.id
        JOIN routes ro ON rv.route_id = ro.id
        GROUP BY s.id, s.name, ro.name
        ORDER BY count DESC
        LIMIT 10
    `);
    return result.rows;
}

async function getSystemSilence(): Promise<number | null> {
    const result = await query(`
        SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(reported_at))) / 60)::INTEGER as minutes_ago
        FROM reports
    `);
    return result.rows[0]?.minutes_ago ?? null;
}


async function getSuspiciousUsers() {
    const result = await query(`
        SELECT
            user_psid,
            COUNT(*) as reports_24h,
            SUM(CASE WHEN reported_at > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END) as reports_1h,
            MAX(reported_at) as last_activity
        FROM reports
        WHERE reported_at > NOW() - INTERVAL '24 hours'
        GROUP BY user_psid
        HAVING COUNT(*) > 5 OR SUM(CASE WHEN reported_at > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END) > 2
        ORDER BY reports_24h DESC
        LIMIT 10
    `);
    return result.rows;
}

async function getHourlyHistorical() {
    const [historical, today] = await Promise.all([
        query(`
            SELECT EXTRACT(HOUR FROM reported_at)::text as hour,
                   ROUND(COUNT(*)::FLOAT / 30, 1) as avg_count
            FROM reports
            WHERE reported_at > NOW() - INTERVAL '30 days'
            GROUP BY hour
            ORDER BY hour
        `),
        query(`
            SELECT EXTRACT(HOUR FROM reported_at)::text as hour, COUNT(*) as count
            FROM reports
            WHERE reported_at > NOW() - INTERVAL '24 hours'
            GROUP BY hour
            ORDER BY hour
        `),
    ]);
    return { historical: historical.rows, today: today.rows };
}

async function getRouteCoverage() {
    const result = await query(`
        SELECT
            ro.name as route_name,
            COUNT(r.id) as total_reports,
            COUNT(DISTINCT r.user_psid) as unique_users,
            COALESCE(SUM(r.confirm_count), 0) as total_confirms,
            MAX(r.reported_at) as last_report,
            CASE
                WHEN MAX(r.reported_at) IS NULL THEN NULL
                ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(r.reported_at))) / 3600)::INTEGER
            END as hours_since_last
        FROM routes ro
        LEFT JOIN route_variants rv ON rv.route_id = ro.id
        LEFT JOIN reports r ON r.variant_id = rv.id
            AND r.reported_at > NOW() - INTERVAL '7 days'
        GROUP BY ro.id, ro.name
        ORDER BY total_reports DESC
    `);
    return result.rows;
}

async function getAllDashboardData() {
    const [
        summary, activeReports, byRoute, byHour, topStops, history,
        silence, suspiciousUsers, hourlyHistorical, routeCoverage,
    ] = await Promise.all([
        getSummary(),
        getActiveReports(),
        getByRoute(),
        getByHour(),
        getTopStops(),
        getRecentHistory(),
        getSystemSilence(),
        getSuspiciousUsers(),
        getHourlyHistorical(),
        getRouteCoverage(),
    ]);
    return {
        summary, activeReports, byRoute, byHour, topStops, history,
        silence, suspiciousUsers, hourlyHistorical, routeCoverage,
        timestamp: new Date().toISOString(),
    };
}

// ---- REST Endpoints ----

app.use(requireAuth, express.static(path.join(__dirname, 'public')));
app.use('/api', requireAuth);

app.get('/api/summary', async (_req: Request, res: Response) => {
    try { res.json(await getSummary()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/reports/active', async (_req: Request, res: Response) => {
    try { res.json(await getActiveReports()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/reports/history', async (_req: Request, res: Response) => {
    try { res.json(await getRecentHistory()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/analytics/by-route', async (_req: Request, res: Response) => {
    try { res.json(await getByRoute()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/analytics/by-hour', async (_req: Request, res: Response) => {
    try { res.json(await getByHour()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/analytics/top-stops', async (_req: Request, res: Response) => {
    try { res.json(await getTopStops()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/analytics/silence', async (_req: Request, res: Response) => {
    try { res.json({ minutesSinceLastReport: await getSystemSilence() }); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/analytics/suspicious-users', async (_req: Request, res: Response) => {

    try { res.json(await getSuspiciousUsers()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/analytics/route-coverage', async (_req: Request, res: Response) => {
    try { res.json(await getRouteCoverage()); }
    catch (err) { res.status(500).json({ error: String(err) }); }
});

// ---- Admin: User management ----

app.get('/admin/users', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await query(
            'SELECT id, username, created_at FROM users ORDER BY created_at ASC',
            []
        );
        const currentId = req.session.userId;

        const rows = result.rows.map((u: any) => `
        <tr>
            <td>${escapeHtml(String(u.username))}</td>
            <td>${escapeHtml(String(u.created_at))}</td>
            <td>${u.id === currentId
                ? '<span style="color:#8080a0">—</span>'
                : `<form method="POST" action="/admin/users/${u.id}/delete" style="display:inline">
                     <button type="submit" class="btn-del">Eliminar</button>
                   </form>`
            }</td>
        </tr>`).join('');

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>PasajeroChat · Usuarios</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090e;color:#e4e4f0;font-family:Inter,sans-serif;padding:2rem}
    h1{font-size:1.2rem;font-weight:600;margin:1rem 0 1.5rem}
    a{color:#7c3aed;text-decoration:none;font-size:.85rem}
    table{width:100%;max-width:700px;border-collapse:collapse;margin-bottom:2rem;font-size:.85rem}
    th,td{padding:.6rem .8rem;text-align:left;border-bottom:1px solid #22222e}
    th{color:#8080a0;font-weight:500}
    .btn-del{background:transparent;border:1px solid #ef4444;border-radius:4px;color:#ef4444;cursor:pointer;padding:.2rem .6rem;font-size:.8rem}
    .btn-del:hover{background:rgba(239,68,68,.1)}
    fieldset{border:1px solid #22222e;border-radius:8px;padding:1rem;max-width:380px}
    legend{color:#8080a0;font-size:.8rem;padding:0 .4rem}
    label{display:block;font-size:.8rem;color:#8080a0;margin:.5rem 0 .25rem}
    input{width:100%;background:#16161e;border:1px solid #22222e;border-radius:6px;color:#e4e4f0;padding:.5rem .7rem;font-size:.85rem}
    button[type=submit]{margin-top:.8rem;background:#7c3aed;border:none;border-radius:6px;color:#fff;padding:.5rem 1rem;cursor:pointer;font-size:.85rem}
  </style>
</head>
<body>
  <a href="/">← Volver al dashboard</a>
  <h1>Gestión de usuarios</h1>
  <table>
    <thead><tr><th>Usuario</th><th>Creado</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <fieldset>
    <legend>Agregar usuario</legend>
    <form method="POST" action="/admin/users">
      <label>Usuario</label>
      <input type="text" name="username" required>
      <label>Contraseña</label>
      <input type="password" name="password" required minlength="8">
      <button type="submit">Crear</button>
    </form>
  </fieldset>
</body>
</html>`);
    } catch {
        res.status(500).send('Error interno al cargar usuarios.');
    }
});

app.post('/admin/users', requireAuth, async (req: Request, res: Response) => {
    const { username, password } = req.body as { username: string; password: string };
    if (username && password && password.length >= 8 && password.length <= 72) {
        const hash = await bcrypt.hash(password, 12);
        try {
            await query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
        } catch {
            // duplicate username — redirect back silently
        }
    }
    res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAuth, async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
        res.redirect('/admin/users');
        return;
    }
    if (targetId !== req.session.userId) {
        await query('DELETE FROM users WHERE id = $1', [targetId]);
    }
    res.redirect('/admin/users');
});

// ---- SSE ----

const sseClients = new Set<Response>();

app.get('/api/sse', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseClients.add(res);

    getAllDashboardData().then((data) => {
        res.write(`event: data-update\ndata: ${JSON.stringify(data)}\n\n`);
    });

    const heartbeat = setInterval(() => { res.write(': keepalive\n\n'); }, 25_000);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
    });
});

setInterval(async () => {
    if (sseClients.size === 0) return;
    try {
        const data = await getAllDashboardData();
        const msg  = `event: data-update\ndata: ${JSON.stringify(data)}\n\n`;
        sseClients.forEach((client) => client.write(msg));
    } catch (err) {
        console.error('SSE polling error:', err);
    }
}, 10_000);

// ---- Start ----

dbReady.then(() => {
    app.listen(PORT, () => {
        console.log(`\n  Dashboard → http://localhost:${PORT}\n`);
    });
});
