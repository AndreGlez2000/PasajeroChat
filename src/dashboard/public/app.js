'use strict';

// ================================================================
// Constants
// ================================================================

const THRESHOLDS = {
    silence:       { ok: 30, crit: 90 },        // minutes
    confirmRate:   { ok: 1.5, warn: 0.5 },      // avg. confirms per report (higher = better)
    unverified:    { ok: 20, crit: 50 },         // % unverified (lower = better)
    suspicious24h: { warn: 5,  crit: 10 },
    suspicious1h:  { warn: 2,  crit: 3 },
    suspiciousPct: { warn: 60, crit: 80 },
};

const ROUTE_COLORS = {
    violeta:   { bar: '#7c3aed', chip: 'chip--violeta' },
    sitt:      { bar: '#f97316', chip: 'chip--sitt' },
    suburbaja: { bar: '#10b981', chip: 'chip--suburbaja' },
};

// ================================================================
// Utilities
// ================================================================

// SQLite stores datetimes as UTC without timezone info ("YYYY-MM-DD HH:MM:SS").
// Without the 'Z' suffix, JS parses them as local time → wrong timestamps.
function parseUtc(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr.replace(' ', 'T') + 'Z');
}

function timeAgo(dateStr) {
    const d = parseUtc(dateStr);
    if (!d) return '–';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 0)     return 'ahora';
    if (diff < 60)    return `${diff}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    return `${Math.floor(diff / 86400)}d`;
}

function timeUntil(dateStr) {
    const d = parseUtc(dateStr);
    if (!d) return '–';
    const diff = Math.floor((d.getTime() - Date.now()) / 1000);
    if (diff <= 0)  return 'vencido';
    if (diff < 60)  return `${diff}s`;
    return `${Math.floor(diff / 60)} min`;
}

function minutesUntil(dateStr) {
    const d = parseUtc(dateStr);
    if (!d) return Infinity;
    return Math.floor((d.getTime() - Date.now()) / 60000);
}

function routeInfo(name) {
    const n = name.toLowerCase();
    if (n.includes('violeta'))   return ROUTE_COLORS.violeta;
    if (n.includes('sitt'))      return ROUTE_COLORS.sitt;
    if (n.includes('suburbaja')) return ROUTE_COLORS.suburbaja;
    return { bar: '#7c3aed', chip: '' };
}

function chip(name) {
    return `<span class="chip ${routeInfo(name).chip}">${esc(name)}</span>`;
}

function rankClass(i) {
    if (i === 0) return 'gold';
    if (i === 1) return 'silver';
    if (i === 2) return 'bronze';
    return '';
}

function flagClass(value, warnT, critT) {
    if (value >= critT) return 'flag-num crit';
    if (value >= warnT) return 'flag-num warn';
    return 'flag-num';
}

function truncatePsid(psid) {
    if (!psid || psid.length <= 10) return psid;
    return psid.slice(0, 4) + '…' + psid.slice(-4);
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ================================================================
// Charts — created once, updated in place
// ================================================================

const CHART_COMMON = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#1c1c27',
            borderColor: '#28283a',
            borderWidth: 1,
            titleColor: '#8a8aaa',
            bodyColor: '#ddddef',
            padding: 10,
            cornerRadius: 6,
        },
    },
    scales: {
        x: {
            grid:  { color: '#28283a' },
            ticks: { color: '#55556a', font: { size: 11 } },
        },
        y: {
            grid:  { color: '#28283a' },
            ticks: { color: '#55556a', font: { size: 11 } },
            beginAtZero: true,
        },
    },
};

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const HOUR_LABELS = HOURS_24.map(h => `${h}h`);

let chartHour24, chartHistorical;

function initCharts() {
    // Chart 1: activity last 24h
    chartHour24 = new Chart(document.getElementById('chartHour24'), {
        type: 'bar',
        data: {
            labels: HOUR_LABELS,
            datasets: [{
                data: new Array(24).fill(0),
                backgroundColor: 'rgba(124,58,237,0.6)',
                hoverBackgroundColor: '#7c3aed',
                borderRadius: 4,
                borderSkipped: false,
            }],
        },
        options: {
            ...CHART_COMMON,
            scales: {
                ...CHART_COMMON.scales,
                x: { ...CHART_COMMON.scales.x, ticks: { color: '#55556a', font: { size: 11 }, maxTicksLimit: 12 } },
            },
        },
    });

    // Chart 2: historical 30d avg vs today
    chartHistorical = new Chart(document.getElementById('chartHistorical'), {
        type: 'line',
        data: {
            labels: HOUR_LABELS,
            datasets: [
                {
                    label: 'Hoy',
                    data: new Array(24).fill(0),
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124,58,237,0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointBackgroundColor: '#7c3aed',
                    borderWidth: 2,
                },
                {
                    label: 'Prom. 30d',
                    data: new Array(24).fill(0),
                    borderColor: '#475569',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                },
            ],
        },
        options: {
            ...CHART_COMMON,
            plugins: {
                ...CHART_COMMON.plugins,
                legend: { display: false },
            },
            scales: {
                ...CHART_COMMON.scales,
                x: { ...CHART_COMMON.scales.x, ticks: { color: '#55556a', font: { size: 11 }, maxTicksLimit: 12 } },
            },
        },
    });
}

function updateChartHour24(byHour) {
    const map = {};
    byHour.forEach(h => { map[String(h.hour).padStart(2, '0')] = Number(h.count); });
    chartHour24.data.datasets[0].data = HOURS_24.map(h => map[h] ?? 0);
    chartHour24.update('none');
}

function updateChartHistorical(hourlyHistorical) {
    const histMap = {}, todayMap = {};
    hourlyHistorical.historical.forEach(h => { histMap[String(h.hour).padStart(2, '0')]  = Number(h.avg_count); });
    hourlyHistorical.today.forEach(h =>      { todayMap[String(h.hour).padStart(2, '0')] = Number(h.count); });

    chartHistorical.data.datasets[0].data = HOURS_24.map(h => todayMap[h] ?? 0);
    chartHistorical.data.datasets[1].data = HOURS_24.map(h => histMap[h]  ?? 0);
    chartHistorical.update('none');
}

// ================================================================
// System silence — header center
// ================================================================

function fmtSilence(minutes) {
    if (minutes < 60)   return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? (minutes % 60) + 'min' : ''}`.trim();
    const days  = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function updateSystemStatus(silence) {
    const dot  = document.getElementById('silenceDot');
    const text = document.getElementById('silenceText');

    if (silence === null || silence === undefined) {
        dot.className  = 'system-dot';
        text.className = 'system-text';
        text.textContent = 'Sin reportes registrados';
        return;
    }

    const fmt = fmtSilence(silence);
    let status, label;
    if (silence < THRESHOLDS.silence.ok) {
        status = 'ok';
        label  = `Sistema activo · hace ${fmt}`;
    } else if (silence < THRESHOLDS.silence.crit) {
        status = 'warn';
        label  = `Baja actividad · hace ${fmt}`;
    } else {
        status = 'crit';
        label  = `Sin reportes hace ${fmt}`;
    }

    dot.className  = `system-dot ${status}`;
    text.className = `system-text ${status}`;
    text.textContent = label;
}

// ================================================================
// Alert strip
// ================================================================

function updateAlerts(data) {
    const alerts = [];

    // Critical: system silence
    if (data.silence !== null && data.silence >= THRESHOLDS.silence.crit) {
        alerts.push({ level: 'crit', msg: `Sin reportes hace ${fmtSilence(data.silence)} — verificar que el sistema esté activo` });
    } else if (data.silence !== null && data.silence >= THRESHOLDS.silence.ok) {
        alerts.push({ level: 'warn', msg: `Baja actividad: último reporte hace ${fmtSilence(data.silence)}` });
    }

    // Warn: abandoned route (no reports in 7d)
    data.routeCoverage.forEach(r => {
        if (r.total_reports === 0) {
            alerts.push({ level: 'warn', msg: `Ruta ${r.route_name}: sin reportes en los últimos 7 días` });
        }
    });

    const strip = document.getElementById('alertStrip');
    const list  = document.getElementById('alertList');

    if (alerts.length === 0) {
        strip.hidden = true;
        return;
    }

    const hasCrit = alerts.some(a => a.level === 'crit');
    strip.hidden    = false;
    strip.className = hasCrit ? 'alert-strip' : 'alert-strip warn';

    list.innerHTML = alerts
        .sort((a, b) => (a.level === 'crit' ? -1 : 1) - (b.level === 'crit' ? -1 : 1))
        .map(a => `
            <li class="alert-item ${a.level === 'warn' ? 'warn' : ''}">
                <span class="alert-dot"></span>
                <span>${esc(a.msg)}</span>
            </li>`)
        .join('');
}

// ================================================================
// KPI Cards
// ================================================================

function setKPI(cardId, value, status) {
    const card = document.getElementById(cardId);
    if (status) card.dataset.status = status;
    else delete card.dataset.status;
    return card;
}

function renderKPIs(summary) {
    document.getElementById('kpiActiveVal').textContent   = summary.activeNow;
    document.getElementById('kpiTodayVal').textContent    = summary.reportsToday;
    document.getElementById('kpiUsersVal').textContent    = summary.uniqueUsersToday;
    document.getElementById('kpiLastHourVal').textContent = summary.reportsLastHour;
}

// ================================================================
// Active reports table
// ================================================================

function renderActiveReports(reports) {
    const tag  = document.getElementById('activeTag');
    const n    = reports.length;
    tag.textContent = `${n} ${n === 1 ? 'activo' : 'activos'}`;

    const tbody = document.getElementById('activeReportsBody');
    if (n === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Sin reportes activos en este momento</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(r => {
        const ago      = timeAgo(r.reported_at);
        const fresh    = (Date.now() - parseUtc(r.reported_at).getTime()) < 5 * 60_000;
        const minsLeft = minutesUntil(r.expires_at);
        const expiresClass = minsLeft <= 10 ? 'expires critical'
                           : minsLeft <= 30 ? 'expires expiring'
                           : 'expires';
        return `
        <tr>
            <td>${chip(r.route_name)}</td>
            <td>
                ${esc(r.variant_name)}
                ${r.direction ? `<span class="dir-badge">${esc(r.direction)}</span>` : ''}
            </td>
            <td>${esc(r.stop_name)}</td>
            <td><span class="time-ago${fresh ? ' fresh' : ''}">hace ${ago}</span></td>
            <td><span class="${expiresClass}">${timeUntil(r.expires_at)}</span></td>
        </tr>`;
    }).join('');
}

// ================================================================
// Route coverage
// ================================================================

function renderRouteCoverage(coverage) {
    const container = document.getElementById('routeCoverageList');
    if (!coverage || coverage.length === 0) {
        container.innerHTML = '<p class="empty-row">Sin datos de rutas</p>';
        return;
    }

    const maxReports = Math.max(...coverage.map(r => Number(r.total_reports)), 1);

    container.innerHTML = coverage.map(r => {
        const reports     = Number(r.total_reports);
        const users       = Number(r.unique_users);
        const hoursSince  = r.hours_since_last !== null ? Number(r.hours_since_last) : null;
        const barPct      = Math.round((reports / maxReports) * 100);
        const barColor    = routeInfo(r.route_name).bar;

        let statusClass, statusLabel, timeLabel;
        if (reports === 0) {
            statusClass = 'dead'; statusLabel = 'Sin cobertura';
        } else if (hoursSince !== null && hoursSince > 48) {
            statusClass = 'warn'; statusLabel = 'Inactiva';
        } else {
            statusClass = 'ok'; statusLabel = 'Activa';
        }

        if (hoursSince === null)        timeLabel = 'Sin reportes';
        else if (hoursSince < 1)        timeLabel = 'hace &lt;1h';
        else if (hoursSince < 24)       timeLabel = `hace ${hoursSince}h`;
        else                            timeLabel = `hace ${Math.floor(hoursSince / 24)}d`;

        return `
        <div class="coverage-item">
            <div class="coverage-top">
                ${chip(r.route_name)}
                <span class="coverage-time">${timeLabel}</span>
            </div>
            <div class="coverage-stats">${reports} rep. · ${users} usuarios</div>
            <div class="coverage-bar-row">
                <div class="bar-track">
                    <div class="bar-fill" style="width:${barPct}%;background:${barColor}"></div>
                </div>
                <span class="coverage-status ${statusClass}">${statusLabel}</span>
            </div>
        </div>`;
    }).join('');
}

// ================================================================
// Suspicious users
// ================================================================

function renderSuspiciousUsers(users) {
    const tbody = document.getElementById('suspiciousBody');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Sin actividad inusual detectada</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const r24 = Number(u.reports_24h);
        const r1  = Number(u.reports_1h);

        return `
        <tr>
            <td style="font-variant-numeric:tabular-nums;color:var(--text-2);font-size:12px">${esc(truncatePsid(u.user_psid))}</td>
            <td class="${flagClass(r24, THRESHOLDS.suspicious24h.warn, THRESHOLDS.suspicious24h.crit)} col-right">${r24}</td>
            <td class="${flagClass(r1,  THRESHOLDS.suspicious1h.warn,  THRESHOLDS.suspicious1h.crit)} col-right">${r1}</td>
            <td class="time-ago">hace ${timeAgo(u.last_activity)}</td>
        </tr>`;
    }).join('');
}

// ================================================================
// Top stops
// ================================================================

function renderTopStops(stops) {
    const tbody = document.getElementById('topStopsBody');
    if (!stops || stops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Sin datos aún</td></tr>';
        return;
    }

    const max = Number(stops[0].count);
    tbody.innerHTML = stops.map((s, i) => `
        <tr>
            <td><span class="rank ${rankClass(i)}">${i + 1}</span></td>
            <td>${esc(s.stop_name)}</td>
            <td>${chip(s.route_name)}</td>
            <td>
                <div class="bar-inline">
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${Math.round((Number(s.count) / max) * 100)}%;background:${routeInfo(s.route_name).bar}"></div>
                    </div>
                    <span class="bar-count">${s.count}</span>
                </div>
            </td>
        </tr>`).join('');
}

// ================================================================
// Dashboard update
// ================================================================

let lastData = null;

function updateDashboard(data) {
    lastData = data;

    updateSystemStatus(data.silence);
    updateAlerts(data);
    renderKPIs(data.summary);
    renderActiveReports(data.activeReports);
    renderRouteCoverage(data.routeCoverage);
    renderSuspiciousUsers(data.suspiciousUsers);
    renderTopStops(data.topStops);
    updateChartHour24(data.byHour);
    updateChartHistorical(data.hourlyHistorical);

    const ts = new Date(data.timestamp);
    document.getElementById('lastUpdate').textContent =
        `Act. ${ts.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

// ================================================================
// SSE connection
// ================================================================

function connectSSE() {
    const indicator = document.getElementById('liveIndicator');
    const label     = document.getElementById('liveLabel');

    const es = new EventSource('/api/sse');

    es.addEventListener('data-update', (e) => {
        indicator.className = 'live-indicator connected';
        label.textContent   = 'En vivo';
        try {
            updateDashboard(JSON.parse(e.data));
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    });

    es.onerror = () => {
        indicator.className = 'live-indicator disconnected';
        label.textContent   = 'Desconectado';
    };
}

// ================================================================
// Refresh relative times every 30s (between SSE pushes)
// ================================================================

setInterval(() => {
    if (lastData) renderActiveReports(lastData.activeReports);
}, 30_000);

// ================================================================
// Init
// ================================================================

initCharts();
connectSSE();
