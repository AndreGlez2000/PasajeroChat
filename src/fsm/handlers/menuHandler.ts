import { UserState } from '../types';

const nameCache = new Map<string, string>();

async function getFirstName(psid: string): Promise<string | null> {
    if (nameCache.has(psid)) return nameCache.get(psid)!;

    const token = process.env.PAGE_ACCESS_TOKEN;
    if (!token || psid.startsWith('terminal')) return null;

    try {
        const res = await fetch(`https://graph.facebook.com/${psid}?fields=first_name&access_token=${token}`);
        if (!res.ok) return null;
        const data = await res.json() as { first_name?: string };
        const name = data.first_name ?? null;
        if (name) nameCache.set(psid, name);
        return name;
    } catch {
        return null;
    }
}

export async function handleMenu(psid: string, userState: UserState, text: string): Promise<string> {
    if (userState.state === 'menu' && text === '') {
        const name = await getFirstName(psid);
        return getMenuText(name);
    }

    if (userState.state === 'menu') {
        switch (text) {
            case '1':
                userState.state = 'aguardando_ruta';
                return "¿Qué ruta viste?\n1. Violeta\n2. SITT\n3. Suburbaja\n0. Regresar";
            case '2':
                userState.state = 'consultando_ruta';
                return "¿Qué ruta deseas consultar?\n1. Violeta\n2. SITT\n3. Suburbaja\n0. Regresar";
            case '3':
                userState.state = 'mostrando_mapas';
                return "Mapas disponibles:\n- Violeta: https://www.google.com/maps/d/u/0/viewer?mid=1n01i-D-KQYFfxvC5K6KmJDyn3zZHIlk&ll=32.454608427328075%2C-116.943342&z=12\n- SITT: https://www.google.com/maps/d/u/0/viewer?mid=1ToQk7i0zrG-4tnaaJSD8JwxCk0c5u7c&ll=32.5028023414874%2C-116.97531825000002&z=13\n- Suburbaja: https://www.google.com/maps/d/u/0/viewer?mid=1JeN22DdT9nlCljIbvmE1Z4O7m8RzymE&ll=32.491176805189916%2C-116.88647232843017&z=12\n\n0. Regresar al menú";
            default:
                return "Opción no válida.\n\n" + getMenuText(null);
        }
    }

    if (userState.state === 'mostrando_mapas') {
        return "Escribe 0 para regresar al menú principal.";
    }

    return getMenuText(null);
}

function getMenuText(name: string | null): string {
    const greeting = name ? `¡Hola, ${name}!` : '¡Hola!';
    return `${greeting} ¿Qué deseas hacer?\n1. Reportar avistamiento\n2. Consultar última vez visto\n3. Ver mapas`;
}