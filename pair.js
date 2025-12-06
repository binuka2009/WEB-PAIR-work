const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
let router = express.Router();
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


// 🔥 OWNER NUMBER — site එකෙන් user enter කරන එකෙන් ගන්නවා
// Example: /?number=9477xxxxxxx&owner=9471xxxxxxx
function getOwnerJID(req) {
    const owner = req.query.owner;  // user enter කරන owner number
    if (!owner) return null;

    const cleaned = owner.replace(/[^0-9]/g, ''); 
    if (!cleaned) return null;

    return jidNormalizedUser(cleaned + '@s.whatsapp.net');
}


// Delete folder
function removeFile(path) {
    if (fs.existsSync(path)) {
        fs.rmSync(path, { recursive: true, force: true });
    }
}


// Random ID for MEGA file
function randomMegaId(length = 6, numberLength = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let txt = '';
    for (let i = 0; i < length; i++) txt += chars[Math.floor(Math.random() * chars.length)];
    const number = Math.floor(Math.random() * Math.pow(10, numberLength));
    return `${txt}${number}`;
}



// ===================== ROUTE HANDLER =====================

router.get('/', async (req, res) => {

    let num = req.query.number;       // pairing number
    let ownerJid = getOwnerJID(req);  // owner to send session

    if (!num) return res.send({ error: "Missing ?number=" });
    if (!ownerJid) console.log("⚠️ Owner Number Missing: no WhatsApp sendback.");

    async function DanuwaPair() {

        const auth_path = './session/';
        const { state, saveCreds } = await useMultiFileAuthState(auth_path);

        try {
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
                },
                printQRInTerminal: false,
                browser: Browsers.macOS("Safari"),
                logger: pino({ level: "fatal" })
            });


            // ================== PAIR CODE ======================
            if (!sock.authState.creds.registered) {

                await delay(1500);
                num = num.replace(/[^0-9]/g, '');

                const code = await sock.requestPairingCode(num);

                if (!res.headersSent) {
                    return res.send({ code });
                }
            }


            // save credentials
            sock.ev.on("creds.update", saveCreds);


            // ================== CONNECTION HANDLER ======================
            sock.ev.on("connection.update", async (update) => {

                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("✅ Device Paired! Uploading session to MEGA...");

                    try {
                        await delay(5000); // allow writing creds file

                        const fileName = `${randomMegaId()}.json`;
                        const filePath = auth_path + "creds.json";

                        const megaUrl = await upload(fs.createReadStream(filePath), fileName);

                        const sid = megaUrl.replace("https://mega.nz/file/", "");

                        console.log("🔥 MEGA Session Uploaded:", sid);


                        // SEND TO OWNER
                        if (ownerJid) {
                            await sock.sendMessage(ownerJid, {
                                text:
`⭐ *Zanta-MD Session ID Successfully Generated!*

Session ID:
_${sid}_

MEGA Link:
${megaUrl}`
                            });

                            console.log("📨 Sent session to owner:", ownerJid);
                        } else {
                            console.log("⚠️ No Owner: Session can't be sent by WhatsApp.");
                        }

                    } catch (err) {
                        console.error("❌ MEGA Upload / Send Error:", err);
                    }
                }


                // retry connection
                if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode !== 401) {
                        console.log("♻️ Reconnecting in 10s...");
                        await delay(10000);
                        return DanuwaPair();
                    } else {
                        console.log("❌ Logged out. Removing session.");
                        removeFile(auth_path);
                    }
                }

            });


        } catch (err) {
            console.log("❌ Pairing Error:", err.message);
            removeFile('./session');

            if (!res.headersSent) {
                return res.send({ code: "Service Unavailable" });
            }
        }
    }

    return await DanuwaPair();
});


// Global errors
process.on("uncaughtException", (err) => {
    console.log("Unhandled Error:", err);
});


module.exports = router;
