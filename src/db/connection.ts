import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../pasajerochat.sqlite');

export const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error conectando a SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
    }
});

// Helper para usar promesas con SQLite
export const query = (text: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        // Convertir sintaxis de PostgreSQL ($1, $2) a SQLite (?, ?)
        const sqliteText = text.replace(/\$\d+/g, '?');
        
        if (sqliteText.trim().toUpperCase().startsWith('SELECT')) {
            db.all(sqliteText, params, (err, rows) => {
                if (err) reject(err);
                else resolve({ rows });
            });
        } else {
            db.run(sqliteText, params, function(err) {
                if (err) reject(err);
                else resolve({ rows: [{ id: this.lastID }], changes: this.changes });
            });
        }
    });
};