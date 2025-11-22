const mega = require('megajs');

async function uploadToMega(filePath) {
    const storage = new mega.Storage({
        email: process.env.MEGA_EMAIL,
        password: process.env.MEGA_PASSWORD,
    });

    return new Promise((resolve, reject) => {
        storage.on('ready', () => {
            const file = storage.upload({ name: filePath.split('/').pop() }, filePath);

            file.on('complete', () => {
                resolve(file.link());
            });

            file.on('error', reject);
        });

        storage.on('error', reject);
    });
}

module.exports = { uploadToMega };
