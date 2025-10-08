

/**
 * @typedef {import('puppeteer').Page} Page
 */

export class ModalHandler {
    evalBusy = false;
    active;
    page;
    
    /** @param {Page} page */
    constructor(page, active = true) {
        this.active = active;
        this.page = page;
        this.#handleModalsLoop();
    }

    async #handleModal() {
        this.page.evaluate(async () => {
            const modal = document.getElementsByClassName('modal')[0];
            if (!modal) return;

            const collectBtn = modal.getElementsByClassName('collect-button')[0];
            if (collectBtn) collectBtn.click();

            const claimBtn = modal.getElementsByClassName('roller-button default cyan accept-button')[0];
            const isClaimRewardBtn = claimBtn?.getElementsByClassName('roller-button-text')[0].innerText?.toUpperCase() === 'CLAIM REWARD';
            if (isClaimRewardBtn) claimBtn.click();

            const getItBtn = claimBtn?.getElementsByClassName('roller-button-text')[0].innerText?.toUpperCase() === 'GET IT!';
            if (getItBtn) getItBtn.click();
            
            const closeMenuBtn = modal.getElementsByClassName('close-menu-btn')[0];
            if (closeMenuBtn) closeMenuBtn.click();

            const closeModalBtn = modal.getElementsByClassName('modal-close-btn')[0];
            if (closeModalBtn) closeModalBtn.click();

            // class: complete-game-button-wrapper
            const completeGameBtn = modal.getElementsByClassName('complete-game-button-wrapper')[0]?.getElementsByTagName('button')[0];
            if (completeGameBtn) completeGameBtn.click();
        });
    }
    
    async #handleModalsLoop() {
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!this.active || this.evalBusy) continue;

            try {
                await this.page.waitForSelector('.modal', { timeout: 1000 });
                if (this.evalBusy) continue;
                await this.#handleModal();
            } catch {}
        }
    }
    enable() { this.active = true }
    disable() { this.active = false }
}