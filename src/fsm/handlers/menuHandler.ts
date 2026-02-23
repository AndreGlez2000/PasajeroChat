import { UserState } from '../types';

export async function handleMenu(psid: string, userState: UserState, text: string): Promise<string> {
    if (userState.state === 'menu' && text === '') {
        return getMenuText();
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
                return "Mapas disponibles:\n- Violeta: [Link]\n- SITT: [Link]\n- Suburbaja: [Link]\n\n0. Regresar al menú";
            default:
                return "❌ Opción no válida.\n\n" + getMenuText();
        }
    }

    if (userState.state === 'mostrando_mapas') {
        return "Escribe 0 para regresar al menú principal.";
    }

    return getMenuText();
}

function getMenuText(): string {
    return "¡Hola! ¿Qué deseas hacer?\n1. Reportar avistamiento\n2. Consultar última vez visto\n3. Ver mapas";
}