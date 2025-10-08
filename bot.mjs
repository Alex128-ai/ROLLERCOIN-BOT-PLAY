import fs from 'fs';
import pako from 'pako';
import { createCanvas, ImageData } from 'canvas';
//import Solvers from './games-solvers.mjs';
import { CoinClickSolver } from './solvers/CoinClick.mjs';
import { TokenBlasterSolver } from './solvers/TokenBlaster.mjs';
import { CryptoMatchSolver } from './solvers/solver_4.mjs';
import { CoinFisherSolver } from './solvers/CoinFisher.mjs';
import { CryptonoidSolver } from './solvers/Cryptonoid.mjs';
import { ModalHandler } from './modals-handler.mjs';
import { Storage } from './storage.mjs';

/**
 * @typedef {import('./games-solvers.mjs').Solver} Solver
 * @typedef {import('./games-solvers.mjs').SolverResultOffsets} SolverResultOffsets
 * @typedef {import('puppeteer').Page} Page
 * 
 * @typedef {Object} GameData
 * @property {string} name
 * @property {number} divIndex
 * @property {Solver} solver
 * 
 * @typedef {Object} Dimensions
 * @property {number} width
 * @property {number} height
 * @property {number} widthRatio
 * @property {number} heightRatio
 */

/** @type {Object<number, GameData>} */
const GAMES = { // KEY: GAME_NUMBER (from websocket msg)
    15: { name: 'Crypto Hex', divIndex: 0, solver: undefined },
    1: { name: 'CoinClick', divIndex: 1, solver: CoinClickSolver },
    9: { name: 'Dr.Hamster', divIndex: 2, solver: undefined },
    5: { name: 'Crypto Match', divIndex: 3, solver: CryptoMatchSolver},
    10: { name: 'Token Surfer: Snow Ride', divIndex: 4, solver: undefined },
    2: { name: 'Token Blaster', divIndex: 5, solver: TokenBlasterSolver },
    13: { name: 'Coin Fisher', divIndex: 6, solver: CoinFisherSolver },
    12: { name: 'Hamster Climber', divIndex: 7, solver: undefined },
    3: { name: 'Flappy Rocket', divIndex: 8, solver: undefined },
    14: { name: 'Mission Hamspossible', divIndex: 9, solver: undefined },
    6: { name: 'Crypto Hamster', divIndex: 10, solver: undefined },
    7: { name: '2048 Coins', divIndex: 11, solver: undefined },
    4: { name: 'Cryptonoid', divIndex: 12, solver: CryptonoidSolver },
    8: { name: 'Coin-Flip', divIndex: 13, solver: undefined },
    11: { name: 'Lambo Rider', divIndex: 14, solver: undefined }
};

class Game {
    divIndex; // the index of the div corresponding to the "start game" button
    game_number; // correspond to the websocket msg associated game_number
    max_cooldown = 60;
    readyToPlay = false;
    playingUntilDeath = false;
    timeouts = {};
    solver;

    /** @param {number} divIndex @param {number} game_number @param {number} cool_down @param {Solver} [solver] */
    constructor(divIndex = 0, game_number = 1, cool_down = 0, solver) {
        this.divIndex = divIndex;
        this.game_number = game_number;
        this.solver = solver;
        this.updateCoolDown(cool_down);
    }

    updateCoolDown(cool_down = 0) {
        this.readyToPlay = cool_down === 0;
        if (cool_down === 0) return;

        if (this.timeouts.cool_down) clearTimeout(this.timeouts.cool_down);
        this.timeouts.cool_down = setTimeout(() => this.readyToPlay = true, cool_down * 1000);
    }
}

export class Bot {
    /** @type {'idle' | 'playing'} */
    state = 'idle';
    playingMovie;
    abortMoviePlayingRequest = false;
    debugCanvasEnabled = false;

    autoPlay;
    autoPlayGames = {
        'Crypto Hex': false,
        'CoinClick': true,
        'Dr.Hamster': false,
        'Crypto Match': false,
        'Token Surfer: Snow Ride': false,
        'Token Blaster': true,
        'Coin Fisher': true,
        'Hamster Climber': false,
        'Flappy Rocket': false,
        'Mission Hamspossible': false,
        'Crypto Hamster': false,
        '2048 Coins': false,
        'Cryptonoid': true,
        'Coin-Flip': false,
        'Lambo Rider': false
    }

    comeBackToGamesMenuAfterGameWinLoopState = 'disabled';
    /** @type {Object<number, Game>} */
    games = {};
    page;
    modalHandler; // will auto click on modals

    /** @param {Page} page @param {number} [autoPlay] the number of the game to auto play */
    constructor(page, autoPlay = 0) {
        this.page = page;
        this.autoPlay = autoPlay;
        this.modalHandler = new ModalHandler(page);
    }
    async init() {
        await this.page.exposeFunction('wsMessageHandler', this.wsMessageHandler);
        await this.page.exposeFunction('wsSendHandler', this.wsSendHandler);
        await this.page.exposeFunction('addAutoPlayTokens', this.addAutoPlayTokens.bind(this));

        // DEV EXPOSURE
        await this.page.exposeFunction('recordGame', this.recordGame.bind(this));
        await this.page.exposeFunction('playTestCanvasMovie', this.playTestCanvasMovie.bind(this));
        await this.page.exposeFunction('startGame', this.startGame.bind(this));
        await this.page.exposeFunction('resolveGameWhenReady', this.resolveGameWhenReady.bind(this));
        await this.page.exposeFunction('createTestCanvas', this.createTestCanvas.bind(this));
        await this.page.exposeFunction('autoClickTestScreen', this.autoClickTestScreen.bind(this));
        await this.page.exposeFunction('autoClickTestCanvas', this.autoClickTestCanvas.bind(this));
        await this.page.exposeFunction('comeBackToGamesMenuAfterGameWinLoop', this.comeBackToGamesMenuAfterGameWinLoop.bind(this));

        this.#consumeAutoPlayTokensLoop();
    }
    #updateState(newState, log = true) {
        if (log) console.info(`State change: ${this.state} -> ${newState}`);
        this.state = newState;
        this.modalHandler.evalBusy = newState !== 'idle';
    }
    #initGame(game_number, cool_down = 0, log = true) {
        if (this.games[game_number]) return;
        const solver = GAMES[game_number]?.solver ? new GAMES[game_number].solver(this.page) : undefined;
        const divIndex = GAMES[game_number]?.divIndex;
        if (isNaN(divIndex)) console.error(`divIndex not found for game_number ${game_number}`);
        if (isNaN(divIndex)) return;

        this.games[game_number] = new Game(divIndex, game_number, cool_down, solver);
        if (!solver) return;

        //this.page.exposeFunction(`solveGame${game_number}`, solver.solve.bind(solver));
        //solver.exposed = true;
        if (log) console.info(`Game ${GAMES[game_number].name} initialized ${solver ? 'with' : 'without'} solver`);

        return true
    }
    wsMessageHandler = async (data) => {
        if (typeof data.cmd !== 'string') return;
        const val = data.cmdval;
        switch (data.cmd) {
            case 'games_data_response':
                console.log(val);
                for (const gameInfo of val) {
                    const game_number = gameInfo.game_number;
                    const cool_down_max = gameInfo.cool_down_max;
                    const cool_down = gameInfo.cool_down;
                    if (isNaN(game_number)) continue;

                    if (!this.games[game_number] && !this.#initGame(game_number, cool_down)) continue;

                    this.games[game_number].max_cooldown = cool_down_max;
                    this.games[game_number].updateCoolDown(cool_down);
                }
                break;
            default:
                break;
        }
    }
    /*gameFinishedHandler = async () => { // DEPRECATED
        this.#updateState('waitingEndGame');
        await new Promise(resolve => setTimeout(resolve, 5000)); // TODO
        this.#updateState('idle');
    }*/
    wsSendHandler = async (data) => {
        if (typeof data.cmd !== 'string') return;
        //console.log(data.cmd);
    }
    /** @param {string} gameName Name of the folder to save the screenshots */
    async recordGame(gameName = 'CoinClick') {
        this.#updateState('recording');
        let screenshotIndex = 0;
        let dimensionsFileCreated = false;
        while(true) {
            try {
                await this.page.waitForSelector('#phaserGame canvas', { timeout: 10000 });
                if (!fs.existsSync('record')) fs.mkdirSync('record');
                if (!fs.existsSync(`record/${gameName}`)) fs.mkdirSync(`record/${gameName}`);

                const gameCanvasData = await this.page.evaluate(async () => {
                    /** @type {HTMLCanvasElement} */
                    const gameCanvas = document.querySelector('#phaserGame canvas');
                    const { width, height } = gameCanvas;
                    const context = gameCanvas.getContext('2d', { willReadFrequently: true });
                    let pixelData;

                    while(!pixelData || pixelData.length === 0) {
                        if (context) { 
                            pixelData = context.getImageData(0, 0, width, height).data;
                        } else {
                            const contextWebgl = gameCanvas.getContext('webgl', { willReadFrequently: true });
                            if (!contextWebgl) continue;
                            pixelData = new Uint8Array(width * height * 4);
                            contextWebgl.readPixels(0, 0, width, height, contextWebgl.RGBA, contextWebgl.UNSIGNED_BYTE, pixelData);
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    const dataArray = Array.from(pixelData);
                    return { dataArray, width, height };
                });

                if (!dimensionsFileCreated) {
                    const dimensions = { width: gameCanvasData.width, height: gameCanvasData.height };
                    fs.writeFileSync(`record/${gameName}/dimensions.json`, JSON.stringify(dimensions));
                    dimensionsFileCreated = true;
                }

                const canvas = createCanvas(gameCanvasData.width, gameCanvasData.height);
                const context = canvas.getContext('2d');
                const dataFromArray = new Uint8ClampedArray(gameCanvasData.dataArray);
                const imageData = new ImageData(dataFromArray, gameCanvasData.width, gameCanvasData.height);
                context.putImageData(imageData, 0, 0);
                const img = canvas.toBuffer();
                fs.writeFileSync(`record/${gameName}/${screenshotIndex.toString().padStart(6, '0')}.png`, img);
                screenshotIndex++;
            } catch (error) { console.error(error.message); break; } // stop if error

            await new Promise(resolve => setTimeout(resolve, 60));
        }

        console.log(`Recording finished, ${screenshotIndex} screenshots saved`);
        this.#updateState('idle');
    }
    /** @param {string} gameName @param {number} [fps] */
    async playTestCanvasMovie(gameName = 'CoinClick', fps = 2) { // a good one! (use recordGame before)
        const folder = `record/${gameName}`;
        if (!fs.existsSync(folder)) return console.error('Folder not found');

        if (this.playingMovie) {
            this.abortMoviePlayingRequest = true;
            while (this.playingMovie) await new Promise(resolve => setTimeout(resolve, 200));
            this.abortMoviePlayingRequest = false;
        }
        
        this.playingMovie = gameName;
        try {
            const files = fs.readdirSync(folder);
            if (files.length === 0) return console.error('No files found in the folder');
            
            let dimensions = { width: 840, height: 640 };
            try {
                const loadedDims = JSON.parse(fs.readFileSync(`${folder}/dimensions.json`));
                if (loadedDims && loadedDims.width && loadedDims.height) dimensions = loadedDims;
            } catch (error) { console.info('No dimensions file found, using default dimensions'); }

            await this.createTestCanvas(dimensions.width, dimensions.height); // create a fake gameCanvas

            for (let i = 0; i < files.length; i++) {
                if (this.abortMoviePlayingRequest) break;
                
                const img = fs.readFileSync(`${folder}/${files[i]}`);
                await this.page.evaluate(async (imgSrc) => {
                    /** @type {HTMLCanvasElement} */
                    const gameCanvas = document.querySelector('#phaserGame canvas');
                    const { width, height } = gameCanvas;

                    /** @type {CanvasRenderingContext2D} */
                    const context = gameCanvas.getContext('2d', { willReadFrequently: true });
                    const img = new Image();
                    img.src = imgSrc;
                    img.onload = () => context.drawImage(img, 0, 0, width, height);
                }, 'data:image/png;base64,' + img.toString('base64'));

                await new Promise(resolve => setTimeout(resolve, 1000 / fps));
            }
    
            // destruct fake gameCanvas
            await this.page.evaluate(() => {
                const gameCanvas = document.querySelector('#phaserGame canvas');
                gameCanvas.remove();
            });
        } catch (error) {
            console.error('Error in playTestCanvasMovie', error.message);
        }

        this.playingMovie = false;
    }
    async autoClickTestCanvas(repeat = 20, frequency = 400) {
        for (let i = 0; i < repeat; i++) {
            const mousePos = await this.page.evaluate(async () => {
                /** @type {HTMLCanvasElement} */
                const gameCanvas = document.querySelector('#phaserGame canvas');
                const { x, y, width, height } = gameCanvas.getBoundingClientRect();
                const result = { x: 0, y: 0 };
                const callback = async (event) => {
                    // if out canvas don't update
                    if (event.clientX < x || event.clientX > x + width) return;
                    if (event.clientY < y || event.clientY > y + height) return;
                    result.x = Math.round(event.clientX - x);
                    result.y = Math.round(event.clientY - y);
                }
                document.addEventListener('mousemove', callback);
                while(!result.x || !result.y) await new Promise(resolve => setTimeout(resolve, 10));
                document.removeEventListener('mousemove', callback);
                return result;
            });
            
            const offset = { x: mousePos.x, y: mousePos.y };
            // show click
            await this.page.evaluate(async (offset) => {
                const gameCanvas = document.querySelector('#phaserGame canvas');
                const { width, height } = gameCanvas.getBoundingClientRect();
                let debugCanvas = document.querySelector('#debugCanvas');
                if (!debugCanvas) {
                    debugCanvas = document.createElement('canvas');
                    debugCanvas.id = 'debugCanvas';
                    debugCanvas.width = width;
                    debugCanvas.height = height;
                    debugCanvas.style.pointerEvents = 'none';
                    debugCanvas.style.position = 'absolute';
                    debugCanvas.style.top = '0';
                    debugCanvas.style.left = '0';
                    //debugCanvas.style.backgroundColor = 'rgba(0, 133, 2, .5)'; // for debug
                    document.querySelector('#phaserGame').appendChild(debugCanvas);
                }

                const context = debugCanvas.getContext('2d', { willReadFrequently: true });
                context.strokeStyle = 'red';
                context.lineWidth = 6;
                //context.clearRect(0, 0, width, height);
                context.strokeRect(offset.x -10, offset.y -10, 20, 20);
            }, offset);

            //await this.page.click('#phaserGame canvas', offset);
            console.log('Clicked at', offset);
            await new Promise(resolve => setTimeout(resolve, frequency));
        }

        console.log('Auto click test finished');
    }
    async autoClickTestScreen(repeat = 10, frequency = 500) {
        for (let i = 0; i < repeat; i++) {
            // click at mouse position using puppeteer
            const mousePos = await this.page.evaluate(async () => {
                const mousePosition = { x: 0, y: 0 };
                function callback(event) {
                    mousePosition.x = event.clientX;
                    mousePosition.y = event.clientY;
                }
                document.addEventListener('mousemove', callback);
                while(!mousePosition.x || !mousePosition.y) await new Promise(resolve => setTimeout(resolve, 10));
                document.removeEventListener('mousemove', callback);
                return mousePosition;
            });
            
            const offset = { x: mousePos.x, y: mousePos.y };
            await this.page.mouse.click(offset.x, offset.y);
            console.log('Clicked at', offset);
            await new Promise(resolve => setTimeout(resolve, frequency));
        }
        console.log('Auto click test finished');
    }
    async createTestCanvas(width = 840, height = 640, type = '2d') {
        console.log(`Creating test canvas ${width}x${height}`);
        const imgSrc = 'data:image/png;base64,' + fs.readFileSync('test.png', 'base64');
        await this.page.evaluate(async (imgSrc, width, height) => {
            // create a fake gameCanvas
            const div = document.createElement('div');
            div.id = 'phaserGame';
            div.style.position = 'fixed';
            div.style.top = '100px';
            div.style.left = '100px';
            div.style.zIndex = '10000';

            const gameCanvas = document.createElement('canvas');
            gameCanvas.width = width;
            gameCanvas.height = height;
            gameCanvas.style.width = '698px';
            gameCanvas.style.height = '531.81px';

            const ctx = gameCanvas.getContext('2d');
            const img = new Image();
            img.src = imgSrc;
            img.onload = () => ctx.drawImage(img, 0, 0, gameCanvas.width, gameCanvas.height);
            div.appendChild(gameCanvas);
            document.body.appendChild(div);
        }, imgSrc, width, height);
    }

    /** @param {string} gameName */
    async startGame(gameName = 'CoinClick') {
        console.info(`Starting game ${gameName}`);
        const game_number = Object.keys(GAMES).find(key => GAMES[key].name === gameName);
        if (!this.games[game_number]) return console.error('Game not found');
        if (this.games[game_number]?.divIndex === undefined) return console.error('Game divIndex not found');

        // AWAITS UNTIL GAME IS READY TO PLAY (cool_down)
        this.#updateState(`waitingGameReady: (${gameName})`);
        while (!this.games[game_number].readyToPlay) await new Promise(resolve => setTimeout(resolve, 500));

        while (true) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const started = await this.page.evaluate(async (index) => {
                if (document.querySelector('#phaserGame canvas')) return true; // game already started

                const gamesContainers = document.getElementsByClassName('choose-game-item-container');
                if (gamesContainers.length <= index) return;

                const gameBtnDiv = gamesContainers[index]?.getElementsByClassName('game-start-button')[0]
                if (!gameBtnDiv) return;

                console.log(`Game ${index+1} found, clicking on it start button`);
                gameBtnDiv.getElementsByTagName('button')[0].click();
            }, this.games[game_number]?.divIndex);

            if (started) break;
        }
    }
    /** @param {string} gameName @param {number} [targetFps] @param {number} [maxCps] */
    async resolveGameWhenReady(gameName = 'CoinClick', targetFps = 60, maxCps = 5, debug = true) {
        const game_number = Object.keys(GAMES).find(key => GAMES[key].name === gameName);
        /** @type {Solver} */
        const gameSolver = this.games[game_number]?.solver;
        //if (!gameSolver || !gameSolver.exposed) return console.error(`Solver not ${gameSolver ? 'found' : 'exposed'}`);
        if (!gameSolver) return console.error(`Solver not found for ${gameName}`);
        
        try { await this.page.waitForSelector('#phaserGame');
        } catch (error) { return console.error('#phaserGame div not found!'); }

        this.#updateState('playing');
        gameSolver.start();

        while(true) {
            const startTime = Date.now();
            const captureZoneCoefs = gameSolver.captureZoneCoefs[gameSolver.state];
            if (!captureZoneCoefs) return console.error('Capture zone coefs not found');

            const res = await this.page.evaluate(async (captureZoneCoefs) => {
                /** @type {HTMLCanvasElement} */
                const gameCanvas = document.querySelector('#phaserGame canvas');
                if (!gameCanvas) return false;

                const { sxR, syR, swR, shR, scaleFactor } = captureZoneCoefs;
                const sx = gameCanvas.width * sxR;
                const sy = gameCanvas.height * syR;
                const sw = gameCanvas.width * swR;
                const sh = gameCanvas.height * shR;
                
                const canvasType = gameCanvas.getContext('2d', { willReadFrequently: true }) ? '2d' : 'webgl';
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = sw * scaleFactor;
                tempCanvas.height = sh * scaleFactor;
                const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });
                
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = sw;
                cropCanvas.height = sh;
                const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });

                // CROP
                /** @type {ImageData} */
                let crop;
                if (canvasType === '2d') {
                    const gameContext = gameCanvas.getContext('2d', { willReadFrequently: true });
                    crop = gameContext.getImageData(sx, sy, sw, sh);
                } else {
                    const gameContext = gameCanvas.getContext('webgl', { willReadFrequently: true });
                    const pixelData = new Uint8Array(sw * sh * 4);
                    gameContext.readPixels(sx, sy, sw, sh, gameContext.RGBA, gameContext.UNSIGNED_BYTE, pixelData);
                    crop = new ImageData(new Uint8ClampedArray(pixelData), sw, sh);
                }

                cropContext.putImageData(crop, 0, 0);
                
                // REDUCE RESOLUTION
                tempContext.drawImage(cropCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
                const data = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
                const dataUint8Array = new Uint8Array(data.buffer);
                const compressed = pako.deflate(dataUint8Array, { level: 1 });
                const dataArray = Array.from(compressed);
                //const dataArray = Array.from(data);
                
                const { bottom, height, left, right, top, width, x, y } = gameCanvas.getBoundingClientRect();
                const dimensions = {
                    width: gameCanvas.width,
                    height: gameCanvas.height,
                    widthRatio: width / gameCanvas.width, // width / canvas.width, like 698 / 840 = 0.831
                    heightRatio: height / gameCanvas.height, // height / canvas.height, like 531 / 640 = 0.829
                    tempCanvasWidth: tempCanvas.width,
                    tempCanvasHeight: tempCanvas.height,
                    scaleFactor, sxR, syR, swR, shR
                };
                return { dimensions, dataArray };
            }, captureZoneCoefs);

            if (!res || !res.dimensions || !res.dataArray) break;

            const dataArray = Array.from(pako.inflate(res.dataArray));
            const solverResult = await gameSolver.solve(res.dimensions, dataArray);
            const avoidDebugCanvas = gameSolver.avoidDebugCanvas || false;

            if (debug && !avoidDebugCanvas) { // CLICKED -> SHOW ON CANVAS
                await this.page.evaluate((sr, captureZoneCoefs) => {
                    const gameCanvas = document.querySelector('#phaserGame canvas');
                    if (!gameCanvas) return;
                    const { width, height, top, left } = gameCanvas.getBoundingClientRect();

                    let debugCanvas = document.querySelector('#debugCanvas');
                    if (!debugCanvas) {
                        debugCanvas = document.createElement('canvas');
                        debugCanvas.id = 'debugCanvas';
                        debugCanvas.style.pointerEvents = 'none';
                        debugCanvas.style.position = 'fixed';
                        debugCanvas.style.zIndex = '10001';
                        document.querySelector('#phaserGame').parentElement.appendChild(debugCanvas);
                    }

                    if (debugCanvas.width !== width) debugCanvas.width = width;
                    if (debugCanvas.height !== height) debugCanvas.height = height;
                    if (debugCanvas.style.top !== `${top}px`) debugCanvas.style.top = `${top}px`;
                    if (debugCanvas.style.left !== `${left}px`) debugCanvas.style.left = `${left}px`;
                    
                    /** @type {CanvasRenderingContext2D} */
                    const context = debugCanvas.getContext('2d', { willReadFrequently: true });
                    //context.fillStyle = 'rgba(0, 0, 0, 0)';
                    
                    // DRAW RECTANGLE CORRESPONDING TO THE CAPTURE ZONE
                    const { sxR, syR, swR, shR } = captureZoneCoefs;
                    context.strokeStyle = 'yellow';
                    context.lineWidth = 2;
                    context.strokeRect(debugCanvas.width * sxR - 2, debugCanvas.height * syR - 2, debugCanvas.width * swR + 4, debugCanvas.height * shR + 4);

                    /** @type {SolverResultOffsets | null} */
                    const solverResult = sr;
                    if (!solverResult) return;

                    for (const offset of solverResult.self) {
                        console.log('Self Offset: ', offset);
                        context.strokeStyle = 'white'; context.lineWidth = 3;
                        context.strokeRect(offset.x - 10, offset.y - 10, 20, 20); // square
                    }
                    
                    for (const offset of solverResult.dangers) {
                        console.log('Danger Offset: ', offset);
                        context.strokeStyle = 'red'; context.lineWidth = 2;
                        context.moveTo(offset.x, offset.y - 10);
                        context.lineTo(offset.x + 10, offset.y + 10); context.lineTo(offset.x - 10, offset.y + 10);
                        context.closePath(); context.stroke();
                    }

                    for (const offset of solverResult.targets) {
                        console.log('Target Offset: ', offset);
                        context.strokeStyle = 'green'; context.lineWidth = 2;
                        context.beginPath(); context.arc(offset.x, offset.y, 8, 0, 2 * Math.PI); context.closePath(); context.stroke();
                    }

                    for (const offset of solverResult.clicks) {
                        //console.log('Click Offset: ', offset);
                        context.clearRect(offset.x - 10, offset.y - 10, 20, 20);
                        context.strokeStyle = 'yellow'; context.lineWidth = 2;
                        context.beginPath(); context.arc(offset.x, offset.y, 6, 0, 2 * Math.PI); context.closePath(); context.stroke();
                    }
                }, solverResult, captureZoneCoefs);

                const delay = Math.max(Math.round((1000 / maxCps) - (Date.now() - startTime)), 0);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const elapsedTime = Date.now() - startTime;
            console.log('Solving time:', elapsedTime);
            const delay = Math.max(Math.round((1000 / targetFps) - elapsedTime), 0);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        gameSolver.stop();
        this.#updateState('idle');
    }
    async comeBackToGamesMenuAfterGameWinLoop() {
        if (this.comeBackToGamesMenuAfterGameWinLoopState === 'enabled') return;
        this.comeBackToGamesMenuAfterGameWinLoopState = 'enabled';

        while (true) {
            try {
                await this.page.evaluate(async () => {
                        for (let i = 0; i < 10; i++) {
                        const a = document.querySelectorAll('a');
                        // when there is 2 button containing the href="/game/choose_game" then click on the second one
                        const choose_game_btns = Array.from(a).filter(e => e.href.includes('/game/choose_game'));
                        if (choose_game_btns.length < 2) { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    
                        await new Promise(resolve => setTimeout(resolve, 10000)); // time to confirm game win
                        choose_game_btns[1].click();
                    }
                });
            } catch (error) {
                console.error('Error in comeBackToGamesMenuAfterGameWinLoop', error.message);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    async #pickNextReadyGame() {
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            for (const game_number in this.games) {
                const name = GAMES[game_number]?.name;
                if (!this.autoPlayGames[name]) continue;
                if (!this.games[game_number].readyToPlay ) continue;
                if (!this.games[game_number].solver) continue;
                return { game_number, gameName: name };
            }
        }
    }
    async #consumeAutoPlayTokensLoop() {
        let firstAutoGame = true;
        
        while(true) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (this.autoPlay <= 0) { this.modalHandler.disable(); continue }
            
            if (firstAutoGame) {
                this.modalHandler.enable();
                console.info(`AUTO PLAY ACTIVATED FOR ${this.autoPlay} GAMES, STARTING IN 10 SECONDS`);
                await new Promise(resolve => setTimeout(resolve, 10000)); // wait for the page to load
                this.comeBackToGamesMenuAfterGameWinLoop();
                firstAutoGame = false;
            }
        
            // PICK NEXT READY GAME
            const { game_number, gameName } = await this.#pickNextReadyGame();
            console.info(`STARTING NEW GAME, REMAINING: ${this.autoPlay}`);

            // START
            try { await this.startGame(gameName) }
            catch (error) { console.error('Error in #consumeAutoPlayTokensLoop', error.stack) }
    
            // PLAY
            try { await this.resolveGameWhenReady(gameName, 60, 5, this.debugCanvasEnabled) }
            catch (error) { console.error('Error in #consumeAutoPlayTokensLoop', error.stack) }

            this.games[game_number].updateCoolDown(this.games[game_number].max_cooldown); // set cool_down (should be overriden by wsMessageHandler)
            this.autoPlay--;
        }
    }
    addAutoPlayTokens(tokens = 1, debugCanvasEnabled = false) {
        this.debugCanvasEnabled = debugCanvasEnabled;
        if (this.autoPlay < 0) this.autoPlay = 0;
        this.autoPlay += tokens;
    }
}