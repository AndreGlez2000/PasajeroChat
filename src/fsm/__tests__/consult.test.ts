import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('../../db/connection', () => ({
    query: vi.fn(),
    db: {},
}));

import { handleMessage } from '../stateMachine';
import { query } from '../../db/connection';

const mockQuery = vi.mocked(query);

let psidCounter = 0;
const newPsid = () => `test-cns-${psidCounter++}`;

afterEach(() => {
    vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lleva la sesión hasta consultando_variante (Violeta seleccionada) */
async function setupToVariantState(psid: string) {
    await handleMessage(psid, '');
    await handleMessage(psid, '2'); // → consultando_ruta

    mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })                   // SELECT routes WHERE name='Violeta'
        .mockResolvedValueOnce({ rows: [{ name: 'Centro → Presa' }] }); // SELECT route_variants

    await handleMessage(psid, '1'); // Violeta → consultando_variante
}

/** Lleva la sesión hasta mostrando_resultados con un reporte de hace N minutos */
async function setupToResultsState(psid: string, minutesAgo: number = 10) {
    await setupToVariantState(psid);

    const reportedAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString().replace('Z', '');

    mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }] })
        .mockResolvedValueOnce({
            rows: [{ id: 42, stop_name: 'Clínica 7', reported_at: reportedAt, confirm_count: 2 }],
        });

    await handleMessage(psid, '1'); // variante → mostrando_resultados
}

// ─── Selección de ruta y variante ─────────────────────────────────────────────

describe('consulta: selección de ruta y variante', () => {
    it('muestra los avistamientos con parada, tiempo y confirmaciones', async () => {
        const psid = newPsid();
        await setupToVariantState(psid);

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('Z', '');
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }] })
            .mockResolvedValueOnce({
                rows: [{ id: 1, stop_name: 'Clínica 7', reported_at: fiveMinutesAgo, confirm_count: 3 }],
            });

        const res = await handleMessage(psid, '1');
        expect(res).toContain('Clínica 7');
        expect(res).toContain('hace 5 min');
        expect(res).toContain('3 confirmaciones');
        expect(res).toContain('Regresar al menú');
        expect(res).not.toContain('Yo también la vi');
    });

    it('cuando no hay reportes activos regresa al menú automáticamente', async () => {
        const psid = newPsid();
        await setupToVariantState(psid);

        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }] })
            .mockResolvedValueOnce({ rows: [] }); // sin reportes

        const res = await handleMessage(psid, '1');
        expect(res).toContain('No hay reportes recientes');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('input fuera de rango en variante muestra error', async () => {
        const psid = newPsid();
        await setupToVariantState(psid);

        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Centro → Presa' }] });

        const res = await handleMessage(psid, '9');
        expect(res).toContain('❌');
        expect(res).toContain('1 al 1');
    });
});

// ─── mostrando_resultados ─────────────────────────────────────────────────────

describe('mostrando_resultados', () => {
    it('"1" regresa al menú principal', async () => {
        const psid = newPsid();
        await setupToResultsState(psid);

        const res = await handleMessage(psid, '1');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('"0" también regresa al menú (opción global)', async () => {
        const psid = newPsid();
        await setupToResultsState(psid);

        const res = await handleMessage(psid, '0');
        expect(res).toContain('Regresando al menú');
        expect(res).toContain('¿Qué deseas hacer?');
    });

    it('input inválido muestra error y permanece en mostrando_resultados', async () => {
        const psid = newPsid();
        await setupToResultsState(psid);

        const res = await handleMessage(psid, '9');
        expect(res).toContain('❌');
        expect(res).toContain('Regresar al menú');

        // Sigue en mostrando_resultados: "1" debe regresar al menú
        const res2 = await handleMessage(psid, '1');
        expect(res2).toContain('¿Qué deseas hacer?');
    });
});
