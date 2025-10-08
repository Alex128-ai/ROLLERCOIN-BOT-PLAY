
/**
 * @typedef {import('puppeteer').Page} Page
 */

export class WsHandlerInitiator {
    page;
    
    /** @param {Page} page */
    constructor(page) {
        this.page = page;
        this.#handlePerfectTimingToInject();
    }

    async #handlePerfectTimingToInject() {
        await this.page.setRequestInterception(true);
        let done = false;
        this.page.on('request', async (request) => {
            if (!done && request.resourceType() === 'script') {
                done = true;
                await this.#webSocketHandlerInjection();
            }
            
            request.continue();
        });
    }
    async #webSocketHandlerInjection() {
        await this.page.evaluate(async () => {
            const originalWebSocket = window.WebSocket;
            function newWebSocket(...args) {
                const ws = new originalWebSocket(...args);
                const originalOnMessage = ws.onmessage;
                ws.onmessage = function(event) {
                    const data = JSON.parse(event.data);
                    if (window.wsMessageHandler) window.wsMessageHandler(data);
                    if (originalOnMessage) originalOnMessage.apply(this, arguments);
                };
        
                const originalSend = ws.send;
                ws.send = function(data) {
                    if (window.wsSendHandler) window.wsSendHandler(data);
                    return originalSend.apply(this, arguments);
                };
        
                return ws;
            }
            window.WebSocket = newWebSocket;
            console.info('WebSocket handler injected');
        });
    }
}