//import puppeteer from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
///import { Storage, PATH } from './storage.mjs';
import { Bot } from './bot.mjs';
import { WsHandlerInitiator } from './ws_handler.mjs';

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('iframe.contentWindow');
stealthPlugin.enabledEvasions.delete('media.codecs')
puppeteer.use(stealthPlugin);
const browser = await puppeteer.launch({
    headless: false,
    userDataDir: '.user_data',
    /*defaultViewport: {
        width: 800,
        height: 600
    },*/
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--auto-open-devtools-for-tabs',
        '--window-size=1400,800',
    ]
});
const page = await browser.newPage();
//await Storage.loadCookies(page);

const bot = new Bot(page);
//const bot = new Bot(page, 5000); // autoplay
await bot.init();
new WsHandlerInitiator(page); // will override WebSocket to trigger/handle bot commands

await page.goto('https://rollercoin.com/game/choose_game');
await page.evaluate(async () => { // Inject Pako
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js';
    document.head.appendChild(script);

    return new Promise((resolve) => script.onload = () => resolve());
});

// on navigate inject pako again
page.on('framenavigated', async () => {
    await page.evaluate(async () => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js';
        document.head.appendChild(script);

        return new Promise((resolve) => script.onload = () => resolve());
    });
});


// PAGE EVENTS
//page.on('close', async () => await Storage.saveCoockies(page));


