import readline from 'readline';
import { handleMessage } from './fsm/stateMachine';
import { dbReady } from './db/connection';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const TEST_PSID = 'terminal_user_123';


console.log('PasajeroChat');
console.log('====================================');
console.log('Escribe "salir" para terminar.\n');

async function startChat() {
    const dbStatus = await dbReady;

    // Mensaje inicial
    const initialResponse = await handleMessage(TEST_PSID, '');
    console.clear();
    console.log(`\nBot:\n${dbStatus}\n\n${initialResponse}\n`);

    const askQuestion = () => {
        rl.question('Tú: ', async (answer) => {
            if (answer.toLowerCase() === 'salir') {
                rl.close();
                process.exit(0);
            }

            const response = await handleMessage(TEST_PSID, answer);
            console.clear();
            console.log(`\nBot:\n${response}\n`);
            askQuestion();
        });
    };

    askQuestion();
}

startChat();