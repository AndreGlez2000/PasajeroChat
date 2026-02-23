import { query, db, dbReady } from '../db/connection';

async function reset() {
    await dbReady;
    console.log('Limpiando datos operacionales...');

    await query('DELETE FROM confirmations');
    await query('DELETE FROM reports');

    // Reinicia los contadores de autoincremento
    await query("DELETE FROM sqlite_sequence WHERE name IN ('reports', 'confirmations')");

    console.log('✓ Reportes y confirmaciones eliminados. Rutas y paradas intactas.');
    db.close();
}

reset().catch((err) => {
    console.error('Error:', err);
    db.close();
});
