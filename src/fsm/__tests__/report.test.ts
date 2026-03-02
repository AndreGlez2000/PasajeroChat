import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('../../db/connection', () => ({
    query: vi.fn(),
    pool: {},
}));

import { handleMessage } from '../stateMachine';
import { query } from '../../db/connection';

const mockQuery = vi.mocked(query);

let psidCounter = 0;
const newPsid = () => `test-rpt-${psidCounter++}`;

afterEach(() => {
    vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lleva la sesión hasta aguardando_variante_violeta */
async function setupToVariantState(psid: string) {
    await handleMessage(psid, '');
    await handleMessage(psid, '1'); // → aguardando_ruta

    mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })                                              // SELECT routes WHERE name='Violeta'
        .mockResolvedValueOnce({ rows: [{ name: 'Centro → Presa' }, { name: 'Presa → Centro' }] }); // SELECT route_variants

    await handleMessage(psid, '1'); // Violeta → aguardando_variante_violeta
}

/** Lleva la sesión hasta aguardando_parada (variante 1 de Violeta) */
async function setupToStopState(psid: string) {
    await setupToVariantState(psid);

    mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }, { id: 2, name: 'Presa → Centro' }] }) // SELECT route_variants (validar índice)
        .mockResolvedValueOnce({ rows: [] })                                                                       // SELECT reports recientes (sin avistamientos)
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Zona Centro' }, { id: 2, name: 'Clínica 7' }] });        // SELECT stops

    await handleMessage(psid, '1'); // variante 1 → aguardando_parada
}

// ─── Selección de ruta ────────────────────────────────────────────────────────

describe('selección de ruta', () => {
    it('seleccionar Violeta muestra sus variantes', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '1');

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Centro → Presa' }, { name: 'Presa → Centro' }] });

        const res = await handleMessage(psid, '1');
        expect(res).toContain('¿Qué variante viste?');
        expect(res).toContain('Centro → Presa');
        expect(res).toContain('Presa → Centro');
    });

    it('seleccionar SITT muestra sus variantes', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '1');

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 2 }] })
            .mockResolvedValueOnce({ rows: [{ name: 'SITT Ida' }, { name: 'SITT Vuelta' }] });

        const res = await handleMessage(psid, '2');
        expect(res).toContain('SITT Ida');
    });

    it('seleccionar Suburbaja muestra sus variantes', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '1');

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 3 }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Suburbaja Norte' }] });

        const res = await handleMessage(psid, '3');
        expect(res).toContain('Suburbaja Norte');
    });

    it('input inválido muestra error y permanece en aguardando_ruta', async () => {
        const psid = newPsid();
        await handleMessage(psid, '');
        await handleMessage(psid, '1');

        const res = await handleMessage(psid, 'X');
        expect(res).toContain('❌');
        expect(res).toContain('Violeta');

        // Debe seguir en aguardando_ruta, no haber regresado al menú
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Centro → Presa' }] });

        const res2 = await handleMessage(psid, '1');
        expect(res2).toContain('Centro → Presa'); // llegó a variantes
    });
});

// ─── Selección de variante ────────────────────────────────────────────────────

describe('selección de variante', () => {
    it('seleccionar variante válida muestra sus paradas', async () => {
        const psid = newPsid();
        await setupToVariantState(psid);

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }, { id: 2, name: 'Presa → Centro' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ name: 'Zona Centro' }, { name: 'Clínica 7' }] });

        const res = await handleMessage(psid, '1');
        expect(res).toContain('¿En qué parada la viste?');
        expect(res).toContain('Zona Centro');
        expect(res).toContain('Clínica 7');
    });

    it('input fuera de rango muestra error con el máximo válido', async () => {
        const psid = newPsid();
        await setupToVariantState(psid);

        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }] }); // solo 1 variante

        const res = await handleMessage(psid, '9');
        expect(res).toContain('❌');
        expect(res).toContain('1 al 1');
    });

    it('input no numérico muestra error', async () => {
        const psid = newPsid();
        await setupToVariantState(psid);

        const res = await handleMessage(psid, 'abc');
        expect(res).toContain('❌');
    });
});

// ─── Selección de parada y guardado del reporte ───────────────────────────────

describe('guardado del reporte', () => {
    it('guarda el reporte exitosamente cuando no hay spam', async () => {
        const psid = newPsid();
        await setupToStopState(psid);

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Zona Centro' }, { id: 2, name: 'Clínica 7' }] }) // SELECT stops
            .mockResolvedValueOnce({ rows: [] })            // spam check → sin reportes recientes
            .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT report
            .mockResolvedValueOnce({ rows: [] });           // SELECT avistamientos activos (mensaje de éxito)

        const res = await handleMessage(psid, '2'); // parada 2 = Clínica 7
        expect(res).toContain('Reporte guardado');
        expect(res).toContain('Clínica 7');
        expect(res).toContain('Regresar al menú');
    });

    it('muestra cuántos minutos faltan cuando el usuario acaba de reportar', async () => {
        const psid = newPsid();
        await setupToStopState(psid);

        // Reporte hace 5 minutos → faltan 5 minutos
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Zona Centro' }] }) // SELECT stops
            .mockResolvedValueOnce({ rows: [{ reported_at: fiveMinutesAgo }] }); // spam check → sí hay

        const res = await handleMessage(psid, '1');
        expect(res).toContain('⏳');
        expect(res).toContain('5 minutos');
        expect(res).toContain('¿Qué deseas hacer?'); // regresó al menú
    });

    it('input fuera de rango en paradas muestra error', async () => {
        const psid = newPsid();
        await setupToStopState(psid);

        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Zona Centro' }, { id: 2, name: 'Clínica 7' }] });

        const res = await handleMessage(psid, '99');
        expect(res).toContain('❌');
        expect(res).toContain('1 al 2');
    });

    it('input no numérico en paradas muestra error', async () => {
        const psid = newPsid();
        await setupToStopState(psid);

        const res = await handleMessage(psid, 'centro');
        expect(res).toContain('❌');
    });

    it('cooldown no bloquea reportar una variante distinta', async () => {
        const psid = newPsid();
        await setupToStopState(psid);

        // El spam check filtra por variant_id, así que devuelve vacío para esta variante
        // aunque el usuario haya reportado otra variante recientemente
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Zona Centro' }] }) // SELECT stops
            .mockResolvedValueOnce({ rows: [] })                                // spam check por variante → sin cooldown
            .mockResolvedValueOnce({ rows: [{ id: 11 }] })                     // INSERT report
            .mockResolvedValueOnce({ rows: [] });                               // SELECT avistamientos activos

        const res = await handleMessage(psid, '1');
        expect(res).toContain('Reporte guardado');
        expect(res).not.toContain('⏳');
    });
});
