import fs from 'fs';
import path from 'path';

export class PATH {
    static STORAGE_DIR = './storage';
    static USER_DATA_DIR = './storage/user_data';
    static COOCKIES_FILE = 'cookies.json';
}

export class Storage {
    static async saveCoockies(page) {
        const cookies = await page.cookies();
        const cookiesFilePath = path.join(PATH.STORAGE_DIR, PATH.COOCKIES_FILE);
        fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies));
    }
    static async loadCookies(page) {
        const cookiesFilePath = path.join(PATH.STORAGE_DIR, PATH.COOCKIES_FILE);
        if (!fs.existsSync(cookiesFilePath)) return;
        const cookies = JSON.parse(fs.readFileSync(cookiesFilePath));
        await page.setCookie(...cookies);
    }
}