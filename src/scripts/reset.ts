import { query, pool } from '../db/connection';

async function reset() {
    console.log('Limpiando datos operacionales...');

    await query('TRUNCATE reports, confirmations RESTART IDENTITY CASCADE');

    console.log('✓ Reportes y confirmaciones eliminados. Rutas y paradas intactas.');
    await pool.end();
}

reset().catch(async (err) => {
    console.error('Error:', err);
    await pool.end();
});
