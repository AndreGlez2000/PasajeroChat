import { UserState } from '../types';
import { query } from '../../db/connection';
import { handleMenu } from './menuHandler';

export async function handleReport(psid: string, userState: UserState, text: string): Promise<string> {
    const input = text.toUpperCase();

    if (userState.state === 'aguardando_ruta') {
        let routeName = '';
        if (input === '1') routeName = 'Violeta';
        else if (input === '2') routeName = 'SITT';
        else if (input === '3') routeName = 'Suburbaja';
        else return "❌ Opción no válida. Escribe:\n1 - Violeta\n2 - SITT\n3 - Suburbaja\n0 - Regresar";

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
        userState.state = 'aguardando_parada';

        return await getStopsMenu(selectedVariant.id);
    }

    if (userState.state === 'aguardando_parada') {
        const stopIndex = parseInt(input);
        if (isNaN(stopIndex)) return "❌ Por favor ingresa un número válido.\n0. Regresar";

        const res = await query(
            'SELECT id, name FROM stops WHERE variant_id = $1 ORDER BY stop_number ASC',
            [userState.data.variant_id]
        );

        if (stopIndex < 1 || stopIndex > res.rows.length) {
            return `❌ Opción no válida. Elige un número del 1 al ${res.rows.length}.\n0. Regresar`;
        }

        const selectedStop = res.rows[stopIndex - 1];
        
        // Validando Spam
        const spamCheck = await query(
            `SELECT reported_at FROM reports 
             WHERE user_psid = $1 AND reported_at > datetime('now', '-10 minutes')
             ORDER BY reported_at DESC LIMIT 1`,
            [psid]
        );

        if (spamCheck.rows.length > 0) {
            // SQLite devuelve fechas como strings en formato UTC
            const lastReport = new Date(spamCheck.rows[0].reported_at + 'Z');
            const minutesLeft = 10 - Math.floor((Date.now() - lastReport.getTime()) / 60000);
            userState.state = 'menu';
            userState.data = { timestamp: Date.now() };
            const spamMsg = `⏳ Ya reportaste recientemente. Por favor espera ${minutesLeft} minutos más para volver a reportar.\n`;
            return spamMsg + "\n" + (await handleMenu(psid, userState, ''));
        }

        // Guardando Reporte
        await query(
            `INSERT INTO reports (variant_id, stop_id, user_psid, expires_at) 
             VALUES ($1, $2, $3, datetime('now', '+90 minutes'))`,
            [userState.data.variant_id, selectedStop.id, psid]
        );

        const rutaNombre = userState.data.ruta_nombre;
        const variantName = userState.data.variant_name;
        userState.state = 'menu';
        userState.data = { timestamp: Date.now() };
        const successMsg = `✅ ¡Reporte guardado exitosamente!\n🚌 ${rutaNombre} (${variantName})\n📍 ${selectedStop.name}\n\n¡Gracias por ayudar a la comunidad!\n`;
        return successMsg + "\n" + (await handleMenu(psid, userState, ''));
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