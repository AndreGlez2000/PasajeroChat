import { UserState, StateName } from './types';
import { handleMenu } from './handlers/menuHandler';
import { handleReport } from './handlers/reportHandler';
import { handleConsult } from './handlers/consultHandler';

// Memoria temporal para el MVP
const userStates = new Map<string, UserState>();

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

export async function handleMessage(psid: string, text: string): Promise<string> {
    const now = Date.now();
    let userState = userStates.get(psid);

    // Inicializar estado si no existe o si pasó el timeout
    if (!userState || (now - userState.data.timestamp > TIMEOUT_MS)) {
        if (userState && (now - userState.data.timestamp > TIMEOUT_MS)) {
            console.log(`[Timeout] Sesión reiniciada para ${psid}`);
        }
        userState = {
            state: 'menu',
            data: { timestamp: now }
        };
        userStates.set(psid, userState);
    }

    // Actualizar timestamp
    userState.data.timestamp = now;

    // Opción global para regresar al menú
    if (text === '0' && userState.state !== 'menu') {
        userState.state = 'menu';
        userState.data = { timestamp: now };
        return "Regresando al menú principal...\n\n" + await handleMenu(psid, userState, '');
    }

    let response = '';

    try {
        switch (userState.state) {
            case 'menu':
            case 'mostrando_mapas':
                response = await handleMenu(psid, userState, text);
                break;
            
            case 'aguardando_ruta':
            case 'aguardando_variante_violeta':
            case 'aguardando_variante_sitt':
            case 'aguardando_variante_suburbaja':
            case 'aguardando_parada':
                response = await handleReport(psid, userState, text);
                break;

            case 'consultando_ruta':
            case 'consultando_variante':
            case 'mostrando_resultados':
                response = await handleConsult(psid, userState, text);
                break;

            default:
                userState.state = 'menu';
                response = "Estado desconocido. Regresando al menú...\n\n" + await handleMenu(psid, userState, '');
        }
    } catch (error) {
        console.error(`Error procesando mensaje para ${psid}:`, error);
        response = "Ocurrió un error interno. Por favor, intenta de nuevo más tarde.";
    }

    return response;
}