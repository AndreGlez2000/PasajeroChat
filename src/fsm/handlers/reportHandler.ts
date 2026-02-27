import { UserState } from '../types';
import { query } from '../../db/connection';

export async function handleReport(psid: string, userState: UserState, text: string): Promise<string> {
    const input = text.toUpperCase();

    if (userState.state === 'aguardando_ruta') {
        let routeName = '';
        if (input === '1') routeName = 'Violeta';
        else if (input === '2') routeName = 'SITT';
        else if (input === '3') routeName = 'Suburbaja';
        else return "Opción no válida. Escribe:\n1 - Violeta\n2 - SITT\n3 - Suburbaja\n0 - Regresar";

        const res = await query('SELECT id FROM routes WHERE name = $1', [routeName]);
        if (res.rows.length === 0) return "Error: Ruta no encontrada en BD.";
        
        userState.data.ruta_id = res.rows[0].id;
        userState.data.ruta_nombre = routeName;

        if (routeName === 'Violeta') userState.state = 'aguardando_variante_violeta';
        else if (routeName === 'SITT') userState.state = 'aguardando_variante_sitt';
        else if (routeName === 'Suburbaja') userState.state = 'aguardando_variante_suburbaja';

        return await getVariantsMenu(userState.data.ruta_id!);
    }

    if (userState.state.startsWith('aguardando_variante_')) {
        const variantIndex = parseInt(input);
        if (isNaN(variantIndex)) return "Por favor ingresa un número válido.\n0. Regresar";

        const res = await query(
            'SELECT id, name FROM route_variants WHERE route_id = $1 ORDER BY id ASC',
            [userState.data.ruta_id]
        );

        if (variantIndex < 1 || variantIndex > res.rows.length) {
            return `Opción no válida. Elige un número del 1 al ${res.rows.length}.\n0. Regresar`;
        }

        const selectedVariant = res.rows[variantIndex - 1];
        userState.data.variant_id = selectedVariant.id;
        userState.data.variant_name = selectedVariant.name;

        // Verificar si hay reporte reciente de otro usuario en esta variante
        const recent = await query(
            `SELECT r.id, s.name as stop_name, r.reported_at, r.confirm_count
             FROM reports r
             JOIN stops s ON r.stop_id = s.id
             WHERE r.variant_id = $1
               AND r.is_active = true
               AND r.expires_at > NOW()
               AND r.user_psid != $2
             ORDER BY r.reported_at DESC LIMIT 1`,
            [selectedVariant.id, psid]
        );

        if (recent.rows.length > 0) {
            const row = recent.rows[0];
            const reportedAt = new Date(row.reported_at);
            const minutesAgo = Math.floor((Date.now() - reportedAt.getTime()) / 60000);
            const checks = '✅'.repeat(Math.min(row.confirm_count + 1, 3));

            userState.data.report_id = row.id;
            userState.state = 'confirmando_avistamiento';

            return `Ya hay un avistamiento reciente:\n\n• ${row.stop_name} - hace ${minutesAgo} min ${checks}\n\n1. Confirmar este avistamiento\n2. Reportar en otra parada`;
        }

        userState.state = 'aguardando_parada';
        return await getStopsMenu(selectedVariant.id);
    }

    if (userState.state === 'aguardando_parada') {
        const stopIndex = parseInt(input);
        if (isNaN(stopIndex)) return "Por favor ingresa un número válido.\n0. Regresar";

        const res = await query(
            'SELECT id, name FROM stops WHERE variant_id = $1 ORDER BY stop_number ASC',
            [userState.data.variant_id]
        );

        if (stopIndex < 1 || stopIndex > res.rows.length) {
            return `Opción no válida. Elige un número del 1 al ${res.rows.length}.\n0. Regresar`;
        }

        const selectedStop = res.rows[stopIndex - 1];
        
        // Validando Spam
        const spamCheck = await query(
            `SELECT reported_at FROM reports
             WHERE user_psid = $1 AND reported_at > NOW() - INTERVAL '10 minutes'
             ORDER BY reported_at DESC LIMIT 1`,
            [psid]
        );

        if (spamCheck.rows.length > 0) {
            const lastReport = new Date(spamCheck.rows[0].reported_at);
            const minutesLeft = 10 - Math.floor((Date.now() - lastReport.getTime()) / 60000);
            userState.state = 'menu';
            userState.data = { timestamp: Date.now() };
            return `⏳ Ya reportaste recientemente. Por favor espera ${minutesLeft} minutos más para volver a reportar.\n\n¿Qué deseas hacer?\n2. Consultar última vez visto\n3. Ver mapas`;
        }

        // Guardando Reporte
        await query(
            `INSERT INTO reports (variant_id, stop_id, user_psid, expires_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '90 minutes')`,
            [userState.data.variant_id, selectedStop.id, psid]
        );

        const rutaNombre = userState.data.ruta_nombre;
        const variantName = userState.data.variant_name;

        // Mostrar avistamientos recientes de la misma variante
        const recent = await query(
            `SELECT s.name as stop_name, r.reported_at, r.confirm_count
             FROM reports r
             JOIN stops s ON r.stop_id = s.id
             WHERE r.variant_id = $1 AND r.is_active = true AND r.expires_at > NOW()
             ORDER BY r.reported_at DESC LIMIT 5`,
            [userState.data.variant_id]
        );

        let successMsg = `¡Reporte guardado exitosamente!\n🚌 ${rutaNombre} (${variantName})\n📍 ${selectedStop.name}\n\n¡Gracias por ayudar a la comunidad!\n`;

        if (recent.rows.length > 0) {
            successMsg += `\n📋 Avistamientos activos en esta ruta:\n\n`;
            recent.rows.forEach((row: any) => {
                const reportedAt = new Date(row.reported_at);
                const minutesAgo = Math.floor((Date.now() - reportedAt.getTime()) / 60000);
                const checks = '✅'.repeat(Math.min(row.confirm_count + 1, 3));
                successMsg += `• ${row.stop_name} - hace ${minutesAgo} min ${checks}\n`;
            });
        }

        successMsg += `\n1. Regresar al menú`;
        userState.state = 'mostrando_resultados';
        userState.data.timestamp = Date.now();
        return successMsg;
    }

    if (userState.state === 'confirmando_avistamiento') {
        if (input === '1') {
            const reportId = userState.data.report_id!;

            // Verificar que sigue activo
            const reportRes = await query(
                `SELECT id FROM reports WHERE id = $1 AND is_active = true AND expires_at > NOW()`,
                [reportId]
            );

            if (reportRes.rows.length === 0) {
                userState.state = 'aguardando_parada';
                return `Ese avistamiento ya expiró.\n\n` + await getStopsMenu(userState.data.variant_id!);
            }

            // Anti-duplicado
            const alreadyConfirmed = await query(
                `SELECT id FROM confirmations WHERE report_id = $1 AND user_psid = $2`,
                [reportId, psid]
            );

            if (alreadyConfirmed.rows.length > 0) {
                userState.state = 'menu';
                userState.data = { timestamp: Date.now() };
                return `Ya confirmaste este avistamiento anteriormente.\n\n¡Hola! ¿Qué deseas hacer?\n1. Reportar avistamiento\n2. Consultar última vez visto\n3. Ver mapas`;
            }

            await query(
                `INSERT INTO confirmations (report_id, user_psid) VALUES ($1, $2)`,
                [reportId, psid]
            );
            await query(
                `UPDATE reports SET confirm_count = confirm_count + 1 WHERE id = $1`,
                [reportId]
            );

            userState.state = 'menu';
            userState.data = { timestamp: Date.now() };
            return `¡Gracias por confirmar! Tu aporte ayuda a la comunidad. 🙌\n\n¡Hola! ¿Qué deseas hacer?\n1. Reportar avistamiento\n2. Consultar última vez visto\n3. Ver mapas`;
        }

        if (input === '2') {
            userState.state = 'aguardando_parada';
            return await getStopsMenu(userState.data.variant_id!);
        }

        return `Opción no válida.\n1. Confirmar este avistamiento\n2. Reportar en otra parada`;
    }

    return "Error en el flujo de reporte.";
}

async function getVariantsMenu(routeId: number): Promise<string> {
    const res = await query('SELECT name FROM route_variants WHERE route_id = $1 ORDER BY id ASC', [routeId]);
    let menu = "¿Qué variante viste?\n";
    res.rows.forEach((row: any, index: number) => {
        menu += `${index + 1}. ${row.name}\n`;
    });
    menu += "0. Regresar";
    return menu;
}

async function getStopsMenu(variantId: number): Promise<string> {
    const res = await query('SELECT name FROM stops WHERE variant_id = $1 ORDER BY stop_number ASC', [variantId]);
    let menu = "¿En qué parada la viste?\n";
    res.rows.forEach((row: any, index: number) => {
        menu += `${index + 1}. ${row.name}\n`;
    });
    menu += "0. Regresar";
    return menu;
}