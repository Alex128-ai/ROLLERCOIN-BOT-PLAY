
/**
 * @typedef {import('puppeteer').Page} Page
 * 
 * @typedef {Object} Offset
 * @property {number} x
 * @property {number} y
 */

export class SolverResultOffsets {
    avoidDebugCanvas = false;
    /** @type {Offset[]} */
    self = [];
    /** @type {Offset[]} */
    clicks = [];
    /** @type {Offset[]} */
    targets = [];
    /** @type {Offset[]} */
    dangers = [];

    /** @param {'self' | 'click' | 'target' | 'danger'} type @param {Offset} offset */
    add(type, offset) {
        switch (type) {
            case 'self': this.self.push(offset); break;
            case 'click': this.clicks.push(offset); break;
            case 'target': this.targets.push(offset); break;
            case 'danger': this.dangers.push(offset); break;
        }
    }
}

export class Dimensions {
    /** @type {number} The width of the game canvas */
    width;
    /** @type {number} The height of the game canvas */
    height;
    /** @type {number} The width ratio of the game (rendered canvas width / canvas width) */
    widthRatio;
    /** @type {number} The height ratio of the game (rendered canvas height / canvas height) */
    heightRatio;
    /** @type {number} The width of the temporary canvas */
    tempCanvasWidth;
    /** @type {number} The height of the temporary canvas */
    tempCanvasHeight;
    /** @type {number} The scale factor of the game temp canvas (tempCanvasWidth / canvas width) */
    scaleFactor;
    /** @type {number} The source X ratio of the capture zone, 0.1 means 10% of the canvas width */
    sxR;
    /** @type {number} The source Y ratio of the capture zone, 0.1 means 10% of the canvas height */
    syR;
    /** @type {number} The source width ratio of the capture zone, 0.5 means 50% of the canvas width */
    swR;
    /** @type {number} The source height ratio of the capture zone, 0.5 means 50% of the canvas height */
    shR;
}

export class Scanner {
    /**
     * @param {number[]} rgba The color to find
     * @param {number[][]} rowsArray The canvas data array
     * @param {number} rectX The width of the rectangle control
     * @param {number} rectY The height of the rectangle control
     * @param {number} tol The tolerance of the color
     * @param {'top'|'bottom'} start The starting point of the search
     * */
    static findFirstGroupPixelsOf(rgba = [0, 0, 0, 0], rowsArray, rectX = 2, rectY = 2, tol = 0, start = 'top') {
        let y = start === 'top' ? 0 : rowsArray.length - rectX;
        while (start === 'top' ? y < rowsArray.length - rectX : y >= 0) {
            for (let x = 0; x < rowsArray[y].length - rectY; x++) {
                if (!this.controlRectColor(rgba, rowsArray, x, y, rectX, rectY, tol)) continue;

                return {
                    x: x + Math.floor(rectX / 2),
                    y: y + Math.floor(rectY / 2)
                };
            }
            y += start === 'top' ? 1 : -1;
        }
        return null;
    }
    /** @param {number[]} rgba @param {number[][]} rowsArray @param {number} rectX @param {number} rectY @param {number} tol @param {'top'|'bottom'} start */
    static findAllGroupsPixelsOf(rgba = [0, 0, 0, 0], rowsArray, rectX = 2, rectY = 2, tol = 0, start = 'top') {
        let y = start === 'top' ? 0 : rowsArray.length - rectX;
        const groups = [];
        while (start === 'top' ? y < rowsArray.length - rectX : y >= 0) {
            for (let x = 0; x < rowsArray[y].length - rectY; x++) {
                if (!this.controlRectColor(rgba, rowsArray, x, y, rectX, rectY, tol)) continue;

                groups.push({
                    x: x + Math.floor(rectX / 2),
                    y: y + Math.floor(rectY / 2)
                });
            }
            y += start === 'top' ? 1 : -1;
        }
        return groups;
    }
    static controlRectColor(rgba = [0,0,0,0], rowsArray, x, y, rectX, rectY, tol) {
        let conform = true;
        for (let i = 0; i < rectY; i++) {
            for (let j = 0; j < rectX; j++) {
                const pixel = rowsArray[y + i]?.[x + j];
                if (!pixel) { conform = false; break; }
                for (let k = 0; k < 3; k++) {
                    if (pixel[k] < rgba[k] - tol || pixel[k] > rgba[k] + tol) conform = false; break;
                }
                if (!conform) break;
            }
            if (!conform) break;
        }
        return conform;
    }
}

export class Solver {
    /** @type {'idle'|'starting'|'playing'} */
    state = 'idle';
    page;
    //exposed = false;
    startBtnColor = [3, 225, 228, 255];

    captureZoneCoefs = {
        starting: { sxR: 0, syR: 0, swR: 1, shR: 1, scaleFactor: 1 },
        playing: { sxR: 0, syR: 0, swR: 1, shR: 1, scaleFactor: 1 }
    };
    rndDelay = [20, 300];

    /** @param {Page} page */
    constructor(page) {
        this.page = page;
    }
    /** Generic solver
     * @param {Dimensions} dimensions
     * @param {Array} dataArray
     * 
     * @returns {Promise<SolverResultOffsets | null>}
     */
    async solve() { // JUST FOR CODE COMPLETION
        console.log('Solver.solve()'); // example
        const solverResult = new SolverResultOffsets();
        const offsetToClick = { x: 0, y: 0 }; // example
        await this.clickAt(offsetToClick, solverResult); // example

        return solverResult;
    }
    /** @param {Array} dataArray @param {number} width */
    dataArrayToRowsOfPixelsArray(dataArray, width) {
        const rowsArray = [];
        for (let i = 0; i < dataArray.length; i += width * 4) {
            const rowArray = [];
            for (let j = 0; j < width * 4; j += 4) rowArray.push(dataArray.slice(i + j, i + j + 4));
            rowsArray.push(rowArray);
        }
        return rowsArray;
    }
    normalizeOffset(offset, dimensions) {
        const scaleFactor = dimensions.scaleFactor;
        const xDecay = dimensions.width * dimensions.widthRatio * dimensions.sxR; // canvas x decay (69.8)
        const yDecay = dimensions.height * dimensions.heightRatio * dimensions.syR; // canvas y decay (159.54)
        const scaledX = offset.x / scaleFactor * dimensions.widthRatio;
        const scaledY = offset.y / scaleFactor * dimensions.heightRatio;
        return {
            x: Math.round(scaledX + xDecay),
            y: Math.round(scaledY + yDecay)
        };
    }

    /** @param {Dimensions} dimensions @param {Array} dataArray */
    findStartBtnOffset(dimensions, rowsArray) {
        const startBtnPos = Scanner.findFirstGroupPixelsOf(this.startBtnColor, rowsArray, 4, 4);
        if (!startBtnPos) return;

        return this.normalizeOffset(startBtnPos, dimensions); // scaled offset according to the DOM canvas dimensions
    }
    /** Dispatch a click event at the given offset, fill the solverEvents object if present
     * @param {Offset} offset
     * @param {SolverResultOffsets} [SolverResult]
     * @param {boolean} [applyRndDelay]
     * @param {boolean} [log] */
    async clickAt(offset, SolverResult, applyRndDelay = true, log = true) {
        if (!offset) return;
        if (log) console.log('Clicking at', offset);
        try {
            await this.page.waitForSelector('#phaserGame canvas', { timeout: 200 });
            await this.page.click('#phaserGame canvas', { offset });
            if (SolverResult) SolverResult.add('click', offset);
            if (applyRndDelay) await new Promise(resolve => setTimeout(resolve, applyRndDelay ? Math.random() * (this.rndDelay[1] - this.rndDelay[0]) + this.rndDelay[0] : 0));
        } catch (error) { return;}

        return offset;
    }
    /** Dispatch a move event at the given offset, fill the solverEvents object if present
     * @param {Offset} offset
     * @param {boolean} [relative]
     * @param {boolean} [applyRndDelay]
     * @param {boolean} [log] */
    async moveAt(offset, relative = false, applyRndDelay = true, log = true) {
        if (!offset) return;
        if (log) console.log('Moving at', offset);
        try {
            await this.page.waitForSelector('#phaserGame canvas', { timeout: 200 });
            if (!relative) 
                await this.page.mouse.move(offset.x, offset.y);
            else {
                const decay = await this.page.evaluate(() => {
                    const canvas = document.querySelector('#phaserGame canvas');
                    const rect = canvas.getBoundingClientRect();
                    return { x: rect.left, y: rect.top };
                });
                await this.page.mouse.move(decay.x + offset.x, decay.y + offset.y);
            }

            if (applyRndDelay) await new Promise(resolve => setTimeout(resolve, applyRndDelay ? Math.random() * (this.rndDelay[1] - this.rndDelay[0]) + this.rndDelay[0] : 0));
        } catch (error) { return;}

        return offset;
    }
    /** @param {number} [x] @param {number} [y] */
    async startGrab(x, y) { // not sure if it works
        try {
            await this.page.waitForSelector('#phaserGame canvas', { timeout: 200 });

            const options = {};
            if (!isNaN(x) && !isNaN(y)) options.offset = { x, y };
            await this.page.click('#phaserGame canvas', { offset });

            await new Promise(resolve => setTimeout(resolve, 400));

            await this.page.mouse.down();
            return true;
        } catch (error) { return; }
    }

    start() {
        this.state = 'starting';
    }
    stop() { // RESET ALL KEYPRESES
        this.page.keyboard.up('ArrowLeft');
        this.page.keyboard.up('ArrowRight');
        this.page.keyboard.up('ArrowUp');
        this.page.keyboard.up('ArrowDown');
        this.state = 'idle';
    }
}