import express, { Request, Response } from 'express';
import path from 'path';
import session from 'express-session';
import bcrypt from 'bcrypt';
import '../auth/session';
import { requireAuth } from '../auth/middleware';
import { query, dbReady } from '../db/connection';

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict' },
}));

const PORT = 3000;

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
    ${error ? `<p class="error">${error}</p>` : ''}
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

app.get('/login', (_req: Request, res: Response) => {
    res.send(loginPage());
});

app.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body as { username: string; password: string };

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
    res.redirect('/');
});

app.post('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ---- Data helpers ----

async function getSummary() {
    const [active, today, users, lastHour] = await Promise.all([
        query(`SELECT COUNT(*) as total FROM reports WHERE is_active=1 AND expires_at > datetime('now')`),
        query(`SELECT COUNT(*) as total FROM reports WHERE reported_at > datetime('now', '-1 day')`),
        query(`SELECT COUNT(DISTINCT user_psid) as total FROM reports WHERE reported_at > datetime('now', '-1 day')`),
        query(`SELECT COUNT(*) as total FROM reports WHERE reported_at > datetime('now', '-1 hour')`),
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
        WHERE r.is_active = 1 AND r.expires_at > datetime('now')
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
        WHERE r.reported_at > datetime('now', '-7 days')
        GROUP BY ro.id, ro.name
        ORDER BY count DESC
    `);
    return result.rows;
}

async function getByHour() {
    const result = await query(`
        SELECT strftime('%H', reported_at) as hour, COUNT(*) as count
        FROM reports
        WHERE reported_at > datetime('now', '-24 hours')
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
        SELECT CAST(
            (julianday('now') - julianday(MAX(reported_at))) * 24 * 60
        AS INTEGER) as minutes_ago
        FROM reports
    `);
    return result.rows[0]?.minutes_ago ?? null;
}


async function getSuspiciousUsers() {
    const result = await query(`
        SELECT
            user_psid,
            COUNT(*) as reports_24h,
            SUM(CASE WHEN reported_at > datetime('now', '-1 hour') THEN 1 ELSE 0 END) as reports_1h,
            MAX(reported_at) as last_activity
        FROM reports
        WHERE reported_at > datetime('now', '-24 hours')
        GROUP BY user_psid
        HAVING reports_24h > 5 OR reports_1h > 2
        ORDER BY reports_24h DESC
        LIMIT 10
    `);
    return result.rows;
}

async function getHourlyHistorical() {
    const [historical, today] = await Promise.all([
        query(`
            SELECT strftime('%H', reported_at) as hour,
                   ROUND(CAST(COUNT(*) AS FLOAT) / 30, 1) as avg_count
            FROM reports
            WHERE reported_at > datetime('now', '-30 days')
            GROUP BY hour
            ORDER BY hour
        `),
        query(`
            SELECT strftime('%H', reported_at) as hour, COUNT(*) as count
            FROM reports
            WHERE reported_at > datetime('now', '-24 hours')
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
                ELSE CAST((julianday('now') - julianday(MAX(r.reported_at))) * 24 AS INTEGER)
            END as hours_since_last
        FROM routes ro
        LEFT JOIN route_variants rv ON rv.route_id = ro.id
        LEFT JOIN reports r ON r.variant_id = rv.id
            AND r.reported_at > datetime('now', '-7 days')
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

// ---- SSE ----

const sseClients = new Set<Response>();

app.get('/api/sse', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    sseClients.add(res);

    getAllDashboardData().then((data) => {
        res.write(`event: data-update\ndata: ${JSON.stringify(data)}\n\n`);
    });

    req.on('close', () => { sseClients.delete(res); });
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
