require("dotenv").config();
const mega = require("megajs");

const auth = {
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

const upload = (data, name) => {
    return new Promise((resolve, reject) => {
        try {
            const storage = new mega.Storage(auth, () => {
                const up = storage.upload({
                    name: name,
                    allowUploadBuffering: true
                });

                data.pipe(up);

                up.on('complete', (file) => {
                    file.link((err, url) => {
                        if (err) return reject(err);
                        storage.close();
                        resolve(url);
                    });
                });
            });

            storage.on("error", (err) => {
                reject(err);
            });

        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { upload };
