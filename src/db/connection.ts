import { Pool } from 'pg';

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export const dbReady = pool.connect().then(client => {
    client.release();
    return 'Conectado a PostgreSQL.';
}).catch((err: Error) => {
    console.error('Error conectando a PostgreSQL:', err.message);
    return 'Error conectando a la base de datos PostgreSQL.';
});

export const query = async (text: string, params: any[] = []): Promise<{ rows: any[], rowCount?: number }> => {
    const result = await pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
};
