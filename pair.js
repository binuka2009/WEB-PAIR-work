// pair.js
const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
let router = express.Router()
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

// Replit Secret වෙතින් OWNER_NUMBER එක ලබා ගනියි.
// මෙය අනිවාර්යයෙන්ම Replit Secrets වල තිබිය යුතුයි.
const OWNER_NUMBER = process.env.OWNER_NUMBER || '';

// OWNER_NUMBER එක ජාත්‍යන්තර ආකෘතියේ JID බවට පත් කරයි (උදා: 9477xxxxxxx@s.whatsapp.net)
const ownerJid = OWNER_NUMBER ? jidNormalizedUser(OWNER_NUMBER + '@s.whatsapp.net') : null;

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// ෂෝන් කෙරූ කේතයේ තිබූ randomMegaId function එක මෙහිදී නැවතත් භාවිතා කරයි
function randomMegaId(length = 6, numberLength = 4) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const number = Math.floor(Math.random() * Math.pow(10, numberLength));
    return `${result}${number}`;
}


router.get('/', async (req, res) => {
    let num = req.query.number; 

    async function DanuwaPair() {
        const auth_path = './session/';
        const { state, saveCreds } = await useMultiFileAuthState(auth_path); 

        try {
            let DanuwaPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            if (!DanuwaPairWeb.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');

                const code = await DanuwaPairWeb.requestPairingCode(num);

                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            DanuwaPairWeb.ev.on('creds.update', saveCreds);

            DanuwaPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log("✅ Device Successfully Paired! Starting MEGA Upload...");
                    try {
                        await delay(5000); // Wait for credentials to save fully

                        // Session ගොනුව MEGA වෙත යැවීම
                        const fileName = `${randomMegaId()}.json`;
                        const mega_url = await upload(fs.createReadStream(auth_path + 'creds.json'), fileName);

                        const string_session = mega_url.replace('https://mega.nz/file/', '');
                        const sid = string_session;

                        console.log(`✅ Session ID generated and uploaded to MEGA: ${sid}`);

                        // Session ID එක OWNER_NUMBER එකට යැවීම
                        if (ownerJid) {
                            await DanuwaPairWeb.sendMessage(ownerJid, {
                                text: `⭐ Session ID එක සාර්ථකව Generate වී MEGA වෙත Upload විය. String Session එක:\n\n**Zanta-MD Session id👇*${sid}*\n\nMEGA Link: ${mega_url}`
                            });
                            console.log(`✅ Confirmation message sent to Owner Number: ${OWNER_NUMBER}`);
                        } else {
                            console.log("⚠️ OWNER_NUMBER configured නැති නිසා Session ID එක WhatsApp හරහා යැවිය නොහැක. Console එකෙන් ලබා ගන්න.");
                        }

                    } catch (e) {
                        console.error("❌ MEGA upload or Message send failed:", e);
                        // ඔබට මෙහිදි 'pm2 restart' එකක් අවශ්‍ය නම් තබා ගන්න.
                        // exec('pm2 restart danuwa'); 
                    } 
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    // 401 (Logged Out) නොවන error එකකදී නැවත සම්බන්ධ වීමට උත්සාහ කරයි
                    await delay(10000);
                    DanuwaPair();
                } else if (connection === "close" && lastDisconnect.error.output.statusCode === 401) {
                    // Logged Out නම් temp session එක delete කරයි
                    console.log("❌ Logged out. Removing session files.");
                    removeFile(auth_path); 
                }
            });
        } catch (err) {
            console.error("❌ Pairing process failed:", err.message);
            // exec('pm2 restart danuwa-md'); // අවශ්‍ය නම් pm2 restart
            await removeFile('./session');
            if (!res.headersSent) {
                await res.send({ code: "Service Unavailable" });
            }
        }
    }
    return await DanuwaPair();
});

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
    // exec('pm2 restart danuwa'); // අවශ්‍ය නම් pm2 restart
});


module.exports = router;
