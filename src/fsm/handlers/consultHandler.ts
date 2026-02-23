import { UserState } from '../types';
import { query } from '../../db/connection';

export async function handleConsult(psid: string, userState: UserState, text: string): Promise<string> {
    const input = text.toUpperCase();

    if (userState.state === 'consultando_ruta') {
        let routeName = '';
        if (input === '1') routeName = 'Violeta';
        else if (input === '2') routeName = 'SITT';
        else if (input === '3') routeName = 'Suburbaja';
        else return "❌ Opción no válida. Escribe:\n1 - Violeta\n2 - SITT\n3 - Suburbaja\n0 - Regresar";

        const res = await query('SELECT id FROM routes WHERE name = $1', [routeName]);
        if (res.rows.length === 0) return "Error: Ruta no encontrada en BD.";
        
        userState.data.ruta_id = res.rows[0].id;
        userState.data.ruta_nombre = routeName;
        userState.state = 'consultando_variante';

        return await getVariantsMenu(userState.data.ruta_id!);
    }

    if (userState.state === 'consultando_variante') {
        const variantIndex = parseInt(input);
        if (isNaN(variantIndex)) return "❌ Por favor ingresa un número válido.\n0. Regresar";

        const res = await query(
            'SELECT id, name FROM route_variants WHERE route_id = $1 ORDER BY id ASC',
            [userState.data.ruta_id]
        );

        if (variantIndex < 1 || variantIndex > res.rows.length) {
            return `❌ Opción no válida. Elige un número del 1 al ${res.rows.length}.\n0. Regresar`;
        }

        const selectedVariant = res.rows[variantIndex - 1];
        userState.data.variant_id = selectedVariant.id;
        userState.data.variant_name = selectedVariant.name;
        userState.state = 'mostrando_resultados';

        return await showResults(userState);
    }

    if (userState.state === 'mostrando_resultados') {
        if (input === '1' && userState.data.last_reports && userState.data.last_reports.length > 0) {
            userState.state = 'confirmando_avistamiento';
            return await processConfirmation(psid, userState);
        } else if (input === '2') {
            userState.state = 'menu';
            userState.data = { timestamp: Date.now() };
            return await getMenuText();
        } else {
            return "❌ Opción no válida.\n1. Yo también la vi (Confirmar el más reciente)\n2. Regresar al menú";
        }
    }

    return "Error en el flujo de consulta.";
}

async function getVariantsMenu(routeId: number): Promise<string> {
    const res = await query('SELECT name FROM route_variants WHERE route_id = $1 ORDER BY id ASC', [routeId]);
    let menu = "¿Qué variante deseas consultar?\n";
    res.rows.forEach((row: any, index: number) => {
        menu += `${index + 1}. ${row.name}\n`;
    });
    menu += "0. Regresar";
    return menu;
}

async function showResults(userState: UserState): Promise<string> {
    const res = await query(
        `SELECT r.id, s.name as stop_name, r.reported_at, r.confirm_count 
         FROM reports r
         JOIN stops s ON r.stop_id = s.id
         WHERE r.variant_id = $1 AND r.is_active = 1 AND r.expires_at > datetime('now')
         ORDER BY r.reported_at DESC LIMIT 5`,
        [userState.data.variant_id]
    );

    if (res.rows.length === 0) {
        const rutaNombre = userState.data.ruta_nombre;
        const variantName = userState.data.variant_name;
        userState.state = 'menu';
        userState.data = { timestamp: Date.now() };
        return `No hay reportes recientes activos para ${rutaNombre} (${variantName}).\n\n` + await getMenuText();
    }

    userState.data.last_reports = res.rows;

    let response = `📋 Últimos avistamientos para ${userState.data.ruta_nombre} (${userState.data.variant_name}):\n\n`;
    
    res.rows.forEach((row: any) => {
        // SQLite devuelve fechas como strings en formato UTC
        const reportedAt = new Date(row.reported_at + 'Z');
        const minutesAgo = Math.floor((Date.now() - reportedAt.getTime()) / 60000);
        const checks = '✅'.repeat(Math.min(row.confirm_count + 1, 3));
        response += `• ${row.stop_name} - hace ${minutesAgo} min ${checks} (${row.confirm_count} confirmaciones)\n`;
    });

    response += `\n¿Qué hacer?\n1. Yo también la vi (Confirma el reporte más reciente)\n2. Regresar al menú`;
    return response;
}

async function processConfirmation(psid: string, userState: UserState): Promise<string> {
    const latestReport = userState.data.last_reports![0];
    // SQLite devuelve fechas como strings en formato UTC
    const reportedAt = new Date(latestReport.reported_at + 'Z');
    const minutesAgo = Math.floor((Date.now() - reportedAt.getTime()) / 60000);

    if (minutesAgo < 20) {
        // Incrementar confirmación
        await query('UPDATE reports SET confirm_count = confirm_count + 1 WHERE id = $1', [latestReport.id]);
        await query('INSERT INTO confirmations (report_id, user_psid) VALUES ($1, $2)', [latestReport.id, psid]);
        userState.state = 'menu';
        userState.data = { timestamp: Date.now() };
        return `✅ ¡Confirmación guardada! Gracias por validar la información.\n\n` + await getMenuText();
    } else {
        // Crear nuevo reporte en la misma parada porque ya pasó mucho tiempo
        await query(
            `INSERT INTO reports (variant_id, stop_id, user_psid, expires_at) 
             VALUES ($1, (SELECT stop_id FROM reports WHERE id = $2), $3, datetime('now', '+90 minutes'))`,
            [userState.data.variant_id, latestReport.id, psid]
        );
        userState.state = 'menu';
        userState.data = { timestamp: Date.now() };
        return `✅ ¡Nuevo reporte creado! Ya había pasado mucho tiempo desde el último avistamiento.\n\n` + await getMenuText();
    }
}

async function getMenuText(): Promise<string> {
    return "¡Hola! ¿Qué deseas hacer?\n1. Reportar avistamiento\n2. Consultar última vez visto\n3. Ver mapas";
}