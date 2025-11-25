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

// MEGA හෝ OWNER_NUMBER අවශ්‍ය නොවේ.

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    let num = req.query.number; // Webview එකේ ඇතුළත් කරන දුරකථන අංකය
    
    // num එක ජාත්‍යන්තර ආකෘතියේ JID බවට පත් කරයි
    const pairJid = num ? jidNormalizedUser(num.replace(/[^0-9]/g, '') + '@s.whatsapp.net') : null;

    if (!pairJid) {
        return res.status(400).send({ error: "Invalid number provided." });
    }

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
                
                // Pair Code එක ඉල්ලීම
                const code = await DanuwaPairWeb.requestPairingCode(num.replace(/[^0-9]/g, ''));

                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            DanuwaPairWeb.ev.on('creds.update', saveCreds);

            DanuwaPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log("✅ Device Successfully Paired! Encoding Base64 Session..."); 
                    try {
                        await delay(5000); // Wait for credentials to save fully
                        
                        // 1. creds.json file එකේ content එක කියවීම
                        const credsJson = fs.readFileSync(auth_path + 'creds.json'); 
                        
                        // 2. එම content එක Base64 String එකක් බවට පත් කිරීම (දිගු Session String එක)
                        const finalBase64String = Buffer.from(credsJson).toString('base64');
                        
                        console.log(`✅ Session ID generated and Encoded. Sending to Pairing Number: ${num}`);

                        // Session ID එක Pair Code එක දුන් අංකයටම යැවීම
                        await DanuwaPairWeb.sendMessage(pairJid, {
                            text: `⭐ Session ID එක සාර්ථකව Generate විය. *මෙය ඔබගේ Deploy Bot එකේ SESSION_ID ලෙස යොදන්න.*:\n\n*Zanta-MD Base64 Session id👇*\n\n${finalBase64String}` 
                        });
                        console.log(`✅ Confirmation message sent to Pairing Number: ${num}`);
                        
                        // වැඩ අවසන් වූ පසු Bot එක Close කර Session Files ඉවත් කරයි
                        await delay(5000);
                        await DanuwaPairWeb.end('Session sent successfully');
                        removeFile(auth_path); 

                    } catch (e) {
                        console.error(`❌ Base64 Encoding or Message send failed to ${num}:`, e);
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
});

module.exports = router;
