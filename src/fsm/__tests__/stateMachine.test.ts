import { vi, describe, it, expect, afterEach } from 'vitest';

// Mockear la BD antes de importar cualquier módulo que la use
vi.mock('../../db/connection', () => ({
    query: vi.fn(),
    db: {},
}));

import { handleMessage } from '../stateMachine';

let psidCounter = 0;
const newPsid = () => `test-sm-${psidCounter++}`;

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

// ─── Menú principal ───────────────────────────────────────────────────────────

describe('menú principal', () => {
    it('muestra el menú al iniciar sesión', async () => {
        const res = await handleMessage(newPsid(), '');
        expect(res).toContain('¿Qué deseas hacer?');
        expect(res).toContain('1. Reportar avistamiento');
        expect(res).toContain('2. Consultar última vez visto');
    });

    it('"1" transiciona a selección de ruta para reportar', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        const res = await handleMessage(psid, '1');
        expect(res).toContain('¿Qué ruta viste?');
    });

    it('"2" transiciona a selección de ruta para consultar', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        const res = await handleMessage(psid, '2');
        expect(res).toContain('¿Qué ruta deseas consultar?');
    });

    it('"3" muestra los mapas', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        const res = await handleMessage(psid, '3');
        expect(res).toContain('Mapas disponibles');
    });

    it('input inválido muestra error y permanece en el menú', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        const res = await handleMessage(psid, '99');
        expect(res).toContain('❌');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('después de input inválido sigue aceptando entradas válidas', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '99'); // input inválido
        const res = await handleMessage(psid, '1');
        expect(res).toContain('¿Qué ruta viste?');
    });
});

// ─── Opción "0" – regresar al menú ───────────────────────────────────────────

describe('opción "0" – regresar al menú', () => {
    it('regresa al menú desde aguardando_ruta', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '1'); // → aguardando_ruta
        const res = await handleMessage(psid, '0');
        expect(res).toContain('Regresando al menú');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('regresa al menú desde consultando_ruta', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '2'); // → consultando_ruta
        const res = await handleMessage(psid, '0');
        expect(res).toContain('Regresando al menú');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('regresa al menú desde mostrando_mapas', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '3'); // → mostrando_mapas
        const res = await handleMessage(psid, '0');
        expect(res).toContain('Regresando al menú');
    });

    it('"0" en el menú principal se trata como opción inválida', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        // En el menú, "0" no tiene un manejo especial (la condición `state !== 'menu'` es false)
        const res = await handleMessage(psid, '0');
        expect(res).toContain('¿Qué deseas hacer?');
    });
});

// ─── Timeout de sesión ────────────────────────────────────────────────────────

describe('timeout de sesión (30 minutos)', () => {
    it('resetea la sesión al menú tras 30 minutos de inactividad', async () => {
        const psid = newPsid();
        const startTime = Date.now();

        vi.useFakeTimers();
        vi.setSystemTime(startTime);

        await handleMessage(psid, '');
        await handleMessage(psid, '1'); // → aguardando_ruta

        // Avanzar 31 minutos
        vi.setSystemTime(startTime + 31 * 60 * 1000);

        // El próximo mensaje debe resetear la sesión y mostrar el menú
        const res = await handleMessage(psid, '');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('sesión activa no resetea antes de los 30 minutos', async () => {
        const psid = newPsid();
        const startTime = Date.now();

        vi.useFakeTimers();
        vi.setSystemTime(startTime);

        await handleMessage(psid, '');
        await handleMessage(psid, '1'); // → aguardando_ruta

        // Avanzar solo 15 minutos (dentro del timeout)
        vi.setSystemTime(startTime + 15 * 60 * 1000);

        // Debe seguir en aguardando_ruta, no en menú
        // Un input inválido de ruta mostrará "❌" (no el menú inicial)
        const res = await handleMessage(psid, 'X');
        expect(res).toContain('❌');
        expect(res).toContain('Violeta'); // sigue mostrando opciones de ruta
    });
});
