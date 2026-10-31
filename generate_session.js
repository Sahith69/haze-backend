import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'readline';

const apiId = 19300364;
const apiHash = '';
const stringSession = new StringSession('');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('==================================================');
    console.log('   HAZE Telegram Userbot Session Generator        ');
    console.log('==================================================\n');

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await question('📱 Enter your phone number (with country code, e.g. +91...): '),
        password: async () => await question('🔑 Enter your 2FA password (leave empty if none): '),
        phoneCode: async () => await question('📩 Enter the 5-digit login code from your Telegram app: '),
        onError: (err) => console.error('Authentication Error:', err.message),
    });

    console.log('\n✨ Successfully logged in as Telegram user!');
    const savedSession = client.session.save();
    console.log('\n================ YOUR SESSION STRING ================\n');
    console.log(savedSession);
    console.log('\n====================================================\n');
    console.log('Save this string! We will set it as TELEGRAM_USER_SESSION on Render.');

    await client.disconnect();
    rl.close();
    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
