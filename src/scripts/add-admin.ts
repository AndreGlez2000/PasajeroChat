import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query, pool } from '../db/connection';

async function main() {
    const args = process.argv.slice(2);
    const uIdx = args.indexOf('--username');
    const pIdx = args.indexOf('--password');

    if (uIdx === -1 || pIdx === -1) {
        console.error('Usage: npm run add-admin -- --username <u> --password <p>');
        process.exit(1);
    }

    const username = args[uIdx + 1];
    const password = args[pIdx + 1];

    if (!username || !password) {
        console.error('Username and password values are required.');
        process.exit(1);
    }

    const hash = await bcrypt.hash(password, 12);

    try {
        await query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
            [username, hash]
        );
        console.log(`✓ Admin user "${username}" created successfully.`);
    } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
            console.error(`Error: user "${username}" already exists.`);
        } else {
            console.error('Error creating user:', err.message);
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
