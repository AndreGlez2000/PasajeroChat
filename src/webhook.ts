import 'dotenv/config';
import express, { Request, Response } from 'express';
import { handleMessage } from './fsm/stateMachine';
import { dbReady } from './db/connection';

const app = express();
app.use(express.json());

const VERIFY_TOKEN    = process.env.VERIFY_TOKEN    ?? '';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN ?? '';
const PORT            = Number(process.env.WEBHOOK_PORT) || 4000;

// ── Verification ──────────────────────────────────────────────────────────────
// Facebook sends a GET to confirm the URL before activating the webhook.

app.get('/webhook', (req: Request, res: Response) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[Webhook] Verificación exitosa');
        res.status(200).send(challenge);
    } else {
        console.warn('[Webhook] Verificación fallida — token incorrecto');
        res.sendStatus(403);
    }
});

// ── Incoming messages ─────────────────────────────────────────────────────────

app.post('/webhook', async (req: Request, res: Response) => {
    const body = req.body;

    if (body.object !== 'page') {
        res.sendStatus(404);
        return;
    }

    // Acknowledge immediately — Facebook requires < 5 s response
    res.sendStatus(200);

    for (const entry of body.entry ?? []) {
        for (const event of entry.messaging ?? []) {
            const psid = event.sender?.id as string | undefined;

            // Skip delivery/read receipts and other non-text events
            if (!psid || !event.message?.text) continue;

            const text = (event.message.text as string).trim();
            console.log(`[Webhook] psid=${psid} texto="${text}"`);

            try {
                const reply = await handleMessage(psid, text);
                await sendMessage(psid, reply);
            } catch (err) {
                console.error(`[Webhook] Error procesando mensaje de ${psid}:`, err);
            }
        }
    }
});

// ── Send API ──────────────────────────────────────────────────────────────────

async function sendMessage(psid: string, text: string): Promise<void> {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn('[Webhook] PAGE_ACCESS_TOKEN no configurado — respuesta no enviada');
        return;
    }

    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

    const body = {
        recipient: { id: psid },
        message:   { text },
    };

    const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        console.error(`[Webhook] Send API error ${res.status}:`, err);
    }
}

// ── Start ─────────────────────────────────────────────────────────────────────

dbReady.then(() => {
    app.listen(PORT, () => {
        console.log(`\n  Webhook → http://localhost:${PORT}/webhook\n`);
        console.log(`  VERIFY_TOKEN: ${VERIFY_TOKEN}`);
        if (!PAGE_ACCESS_TOKEN) {
            console.warn('  ⚠  PAGE_ACCESS_TOKEN no configurado en .env\n');
        }
    });
});
