import readline from 'readline';
import { handleMessage } from './fsm/stateMachine';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const TEST_PSID = 'terminal_user_123';

console.log('=========================================');
console.log('🤖 PasajeroApp Bot - Terminal de Pruebas');
console.log('=========================================');
console.log('Escribe "salir" para terminar.\n');

async function startChat() {
    // Mensaje inicial
    const initialResponse = await handleMessage(TEST_PSID, '');
    console.log(`\nBot:\n${initialResponse}\n`);

    const askQuestion = () => {
        rl.question('Tú: ', async (answer) => {
            if (answer.toLowerCase() === 'salir') {
                rl.close();
                process.exit(0);
            }

            const response = await handleMessage(TEST_PSID, answer);
            console.log(`\nBot:\n${response}\n`);
            askQuestion();
        });
    };

    askQuestion();
}

startChat();