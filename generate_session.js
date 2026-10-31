import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import qrcode from 'qrcode-terminal';
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
    console.log('       HAZE Telegram Session Generator            ');
    console.log('==================================================\n');
    console.log('Choose login method:');
    console.log('1. [RECOMMENDED] QR Code (Instant scan with Telegram camera - NO SMS/codes needed)');
    console.log('2. Phone Number & OTP (Direct DC 5 connection)\n');

    const choice = await question('Select option (1 or 2, default is 1): ');

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    if (choice.trim() === '2') {
        // Direct DC 5 connection for Indian numbers (+91)
        client.session.setDC(5, '91.108.56.186', 443);
        await client.start({
            phoneNumber: async () => await question('📱 Enter your phone number (with country code, e.g. +91...): '),
            password: async () => await question('🔑 Enter your 2FA password (leave empty if none): '),
            phoneCode: async (isCodeViaApp) => {
                if (isCodeViaApp) {
                    console.log('\n🔔 The code was sent directly inside your TELEGRAM APP!');
                    console.log('👉 Open your Telegram app -> Chats -> Official Telegram service chat.\n');
                } else {
                    console.log('\n📲 The code was sent via SMS.\n');
                }
                return await question('📩 Enter the 5-digit login code: ');
            },
            onError: (err) => console.error('Authentication Error:', err.message),
        });
    } else {
        console.log('\nConnecting to Telegram servers...');
        await client.connect();

        console.log('\n📲 GENERATING LOGIN QR CODE...\n');
        console.log('Instructions:');
        console.log('1. Open Telegram on your phone.');
        console.log('2. Go to Settings ➔ Devices ➔ Link Desktop Device.');
        console.log('3. Point your camera at the QR code below:\n');

        const user = await client.signInUserWithQrCode(
            { apiId, apiHash },
            {
                onError: async (err) => {
                    console.error('QR Login Error:', err.message);
                    return true;
                },
                qrCode: async (code) => {
                    const tokenStr = Buffer.from(code.token).toString('base64url');
                    const loginUrl = `tg://login?token=${tokenStr}`;
                    console.log('\nScan this QR code:');
                    qrcode.generate(loginUrl, { small: true });
                    console.log('\nWaiting for you to scan the QR code in Telegram...');
                },
                password: async (hint) => {
                    console.log(`\n🔑 2FA Password Required (hint: ${hint || 'none'})`);
                    return await question('Enter your 2FA password: ');
                },
            }
        );

        console.log(`\n Logged in as: ${user?.firstName || 'User'} (${user?.id})`);
    }

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
