import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/* --- CONFIGURATION --- */
const CONFIG = {
    hexSides: 6,
    baseSpeed: 2.5,
    rotationSpeed: 0.025,
    playerRadiusBase: 70, // Base size, scales with screen
    wallDepthBase: 40,    // Base size, scales with screen
    centerSizeBase: 35,   // Base size, scales with screen
    spawnRate: 100,       // Frames between spawns (decreases with difficulty)
    difficultyScale: 1500,// Score needed to double speed
    playerHitboxWidth: 0.09, // Collision forgiveness
    playerRadialInner: 12,
    playerRadialOuter: 15
};

const PALETTES = [
    { bg: '#f8fafc', even: '#e0e7ff', odd: '#f1f5f9', wall: '#4f46e5', center: '#4338ca', player: '#1e1b4b', root: 55.00 },
    { bg: '#faf5ff', even: '#f3e8ff', odd: '#faf5ff', wall: '#9333ea', center: '#7e22ce', player: '#3b0764', root: 65.41 },
    { bg: '#fdf2f8', even: '#fce7f3', odd: '#fdf2f8', wall: '#db2777', center: '#be185d', player: '#831843', root: 41.20 },
    { bg: '#f0fdf4', even: '#dcfce7', odd: '#f0fdf4', wall: '#16a34a', center: '#15803d', player: '#14532d', root: 49.00 }
];

/* --- AUDIO ENGINE --- */
const Audio = {
    ctx: null,
    nextNoteTime: 0,
    sequencerStep: 0,
    tempo: 120,
    lookahead: 25.0,
    scheduleAheadTime: 0.1,
    paletteIndex: 0,
    running: false,
    timeoutId: null,

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playKick(time) {
        if(!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(1.0, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        osc.start(time);
        osc.stop(time + 0.5);
    },

    playBass(time, freq) {
        if(!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 6, time);
        filter.frequency.exponentialRampToValueAtTime(freq, time + 0.2);
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.linearRampToValueAtTime(0, time + 0.2);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.25);
    },

    playHiHat(time) {
        if(!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;
        const gain = this.ctx.createGain();
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        noise.start(time);
    },

    playScoreSound() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
    },

    playCrash() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.6);
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.6);
        osc.start(t);
        osc.stop(t + 0.6);
    },

    scheduleNote(step, time) {
        if (!this.running) return;
        const root = PALETTES[this.paletteIndex].root;
        if (step % 4 === 0) this.playKick(time);
        if (step % 4 === 2) this.playBass(time, root);
        if (step % 2 === 0) this.playHiHat(time);
    },

    nextNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.sequencerStep = (this.sequencerStep + 1) % 16;
    },

    scheduler() {
        if (!this.running || !this.ctx) return;
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.sequencerStep, this.nextNoteTime);
            this.nextNote();
        }
        this.timeoutId = setTimeout(() => this.scheduler(), this.lookahead);
    },

    start(paletteIndex) {
        this.init();
        this.paletteIndex = paletteIndex;
        this.running = true;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.sequencerStep = 0;
        if(this.timeoutId) clearTimeout(this.timeoutId);
        this.scheduler();
    },

    stop() {
        this.running = false;
        if(this.timeoutId) clearTimeout(this.timeoutId);
    }
};

/* --- GAME COMPONENT --- */
const HexUltraGame = ({ onExit, onGameOver }) => {
    const canvasRef = useRef(null);
    const frameIdRef = useRef(null);
    const scoreSpanRef = useRef(null);
    const scaleRef = useRef(1.0); // Mobile scaling factor

    // Game Logic State (Refs for performance in loop)
    const stateRef = useRef({
        running: false,
        score: 0,
        scoringStarted: false,
        walls: [],
        playerAngle: 0,
        worldAngle: 0,
        difficultyMult: 1,
        pulse: 0,
        paletteIndex: 0,
        shake: 0,
        frame: 0
    });

    // Inputs Ref (To avoid closure staleness in loop)
    const inputsRef = useRef({ left: false, right: false });
    
    // Timing Refs
    const lastTimeRef = useRef(0);
    const accumulatorRef = useRef(0);
    const TIME_STEP = 1000 / 60;

    // React State for UI
    const [gameState, setGameState] = useState('start'); // start, playing, over
    const [score, setScore] = useState(0);

    /* --- INITIALIZATION & RESIZE --- */
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
                
                // Dynamic scaling for mobile/desktop consistency
                // Base resolution approx 800px.
                const minDim = Math.min(window.innerWidth, window.innerHeight);
                scaleRef.current = Math.max(0.6, minDim / 800);
                
                if (!stateRef.current.running) draw();
            }
        };
        
        window.addEventListener('resize', handleResize);
        handleResize(); // Init

        return () => {
            window.removeEventListener('resize', handleResize);
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
            Audio.stop();
        };
    }, []);

    /* --- INPUT HANDLING --- */
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && gameState !== 'playing') startGame();
            
            // Fix: Use e.code to detect physical keys correctly
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') inputsRef.current.left = true;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') inputsRef.current.right = true;
        };

        const handleKeyUp = (e) => {
            // Fix: Use e.code here as well
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') inputsRef.current.left = false;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') inputsRef.current.right = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [gameState]);
    const setInput = (side, val) => {
        if(side === 'left') inputsRef.current.left = val;
        if(side === 'right') inputsRef.current.right = val;
    };

    /* --- GAME LOGIC --- */
    const startGame = () => {
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);

        // Reset State
        stateRef.current = {
            running: true,
            score: 0,
            scoringStarted: false,
            walls: [],
            playerAngle: 0,
            worldAngle: 0,
            difficultyMult: 1,
            pulse: 0,
            paletteIndex: 0,
            shake: 0,
            frame: 0
        };

        inputsRef.current = { left: false, right: false };
        setScore(0);
        setGameState('playing');

        Audio.start(0);

        lastTimeRef.current = performance.now();
        accumulatorRef.current = 0;

        loop(performance.now());
    };

    const handleExit = () => {
        Audio.stop();
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
        if (onExit) onExit();
    };

    const spawnPattern = () => {
        const gap = Math.floor(Math.random() * CONFIG.hexSides);
        // Spawn distance adjusted by scale so walls don't appear inside the player on small screens
        // or take forever on large screens. We perform logic in "Scaled Units" mostly.
        const dist = (Math.max(window.innerWidth, window.innerHeight) / 2) + 200;
        const logicalDist = dist / scaleRef.current;

        for (let i = 0; i < CONFIG.hexSides; i++) {
            if (i !== gap) {
                // Randomly skip some walls for easier patterns
                if (Math.random() > 0.2) {
                    stateRef.current.walls.push({ side: i, dist: logicalDist });
                }
            }
        }
    };

    const update = () => {
        const state = stateRef.current;
        if (!state.running) return;

        // 1. Scoring Logic
        if (state.scoringStarted) {
            state.score += 10 / 45; 
        }

        // 2. Difficulty & Speed
        state.difficultyMult = 1 + (state.score / CONFIG.difficultyScale);
        const speed = CONFIG.baseSpeed * state.difficultyMult;
        const rotSpeed = CONFIG.rotationSpeed * state.difficultyMult;
        
        // Spawn Rate increases (lower frames between spawns)
        const spawnRate = Math.max(45, CONFIG.spawnRate - (state.score / 40));

        state.frame++;

        // 3. Beat Pulse
        if (state.frame % 30 === 0) state.pulse = 15;
        state.pulse *= 0.90;
        
        // 4. Screenshake Decay
        if (state.shake > 0) state.shake *= 0.85;

        // 5. Player Movement
        const moveSpeed = 0.085;
        if (inputsRef.current.left) state.playerAngle -= moveSpeed;
        if (inputsRef.current.right) state.playerAngle += moveSpeed;
        
        // Normalize Angle
        state.playerAngle = (state.playerAngle + Math.PI * 2) % (Math.PI * 2);

        // 6. World Rotation
        const rotDir = (Math.floor(state.score / 200) % 2 === 0) ? 1 : -1;
        state.worldAngle += rotSpeed * rotDir;

        // 7. Palette
        state.paletteIndex = Math.floor(state.score / 150) % PALETTES.length;
        Audio.paletteIndex = state.paletteIndex;

        // 8. Spawning
        if (state.frame % Math.floor(spawnRate) === 0) spawnPattern();

        // 9. Wall Logic (Movement & Collision)
        const sectorSize = (Math.PI * 2) / CONFIG.hexSides;
        const pRadius = CONFIG.playerRadiusBase;
        const wDepth = CONFIG.wallDepthBase;
        const centerLimit = CONFIG.centerSizeBase;

        for (let i = state.walls.length - 1; i >= 0; i--) {
            let w = state.walls[i];
            w.dist -= speed;

            // Collision Bounds
            const playerInner = pRadius - CONFIG.playerRadialInner;
            const playerOuter = pRadius + CONFIG.playerRadialOuter;
            const wallInner = w.dist;
            const wallOuter = w.dist + wDepth;

            // Check Radial Overlap
            if ((wallInner < playerOuter) && (wallOuter > playerInner)) {
                // Check Angular Overlap
                const wallCenterAngle = (w.side * sectorSize) + (sectorSize / 2);
                let diff = (state.playerAngle - wallCenterAngle + Math.PI) % (Math.PI * 2) - Math.PI;
                if (diff < -Math.PI) diff += Math.PI * 2;
                
                const distToWallCenter = Math.abs(diff);
                const collisionThreshold = (sectorSize / 2) + CONFIG.playerHitboxWidth;

                if (distToWallCenter < collisionThreshold) {
                    gameOver();
                }
            }

            // Check Passed Center
            if (w.dist < centerLimit) {
                state.walls.splice(i, 1);
                if (!state.scoringStarted) state.scoringStarted = true;
                Audio.playScoreSound();
            }
        }
    };

    const gameOver = () => {
        stateRef.current.running = false;
        stateRef.current.shake = 40;
        Audio.playCrash();
        Audio.stop();

        const finalScore = Math.floor(stateRef.current.score);
        setScore(finalScore);
        setGameState('over');
        if (onGameOver) onGameOver(finalScore);

        draw(); // Final draw for impact
    };

    const loop = (timestamp) => {
        if (!stateRef.current.running) return;

        const deltaTime = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;
        accumulatorRef.current += deltaTime;

        // Fixed Time Step Loop
        while (accumulatorRef.current >= TIME_STEP) {
            update();
            accumulatorRef.current -= TIME_STEP;
        }

        draw();

        // Direct DOM update for Score (Perf optimization)
        if (scoreSpanRef.current) {
            scoreSpanRef.current.innerText = Math.floor(stateRef.current.score);
        }

        frameIdRef.current = requestAnimationFrame(loop);
    };

    /* --- RENDERING --- */
    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        const state = stateRef.current;
        const pal = PALETTES[state.paletteIndex];
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const sectorAngle = (Math.PI * 2) / CONFIG.hexSides;
        
        // Mobile Scaling
        const s = scaleRef.current;

        // Clear BG
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        
        // Apply Screenshake
        const sx = (Math.random() - 0.5) * state.shake;
        const sy = (Math.random() - 0.5) * state.shake;
        ctx.translate(cx + sx, cy + sy);
        
        // World Rotation
        ctx.rotate(state.worldAngle);
        
        // Draw Hexagon Background
        const maxDist = Math.max(canvas.width, canvas.height);
        for (let i = 0; i < CONFIG.hexSides; i++) {
            ctx.fillStyle = (i % 2 === 0) ? pal.even : pal.odd;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxDist * Math.cos(i * sectorAngle), maxDist * Math.sin(i * sectorAngle));
            ctx.lineTo(maxDist * Math.cos((i + 1) * sectorAngle), maxDist * Math.sin((i + 1) * sectorAngle));
            ctx.fill();
        }

        // Apply visual scale for game objects
        ctx.scale(s, s);

        // Draw Center Pulse
        const centerSize = CONFIG.centerSizeBase;
        const pulseR = centerSize + state.pulse;
        ctx.fillStyle = pal.center;
        ctx.shadowBlur = 30 + state.pulse * 3;
        ctx.shadowColor = pal.center;
        ctx.beginPath();
        for (let i = 0; i <= CONFIG.hexSides; i++) {
            let th = i * sectorAngle;
            ctx.lineTo(pulseR * Math.cos(th), pulseR * Math.sin(th));
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw Walls
        const wallDepth = CONFIG.wallDepthBase;
        ctx.fillStyle = pal.wall;
        state.walls.forEach(w => {
            let startA = w.side * sectorAngle;
            let endA = (w.side + 1) * sectorAngle;
            
            // Logic distance is already calculated relative to scale, 
            // but since we scaled the context (ctx.scale), we draw raw values.
            const d = w.dist;

            ctx.beginPath();
            ctx.moveTo(d * Math.cos(startA), d * Math.sin(startA));
            ctx.lineTo(d * Math.cos(endA), d * Math.sin(endA));
            ctx.lineTo((d + wallDepth) * Math.cos(endA), (d + wallDepth) * Math.sin(endA));
            ctx.lineTo((d + wallDepth) * Math.cos(startA), (d + wallDepth) * Math.sin(startA));
            ctx.fill();
        });

        // Draw Player
        ctx.rotate(state.playerAngle);
        ctx.translate(CONFIG.playerRadiusBase, 0);

        ctx.fillStyle = pal.player;
        ctx.beginPath();
        const pScale = 1.0;
        ctx.moveTo(15 * pScale, 0);
        ctx.lineTo(-10 * pScale, 10 * pScale);
        ctx.lineTo(-5 * pScale, 0);
        ctx.lineTo(-10 * pScale, -10 * pScale);
        ctx.closePath();
        ctx.fill();

        // Player Dot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 3 * pScale, 0, Math.PI*2);
        ctx.fill();

        // Player Trail
        ctx.shadowBlur = 15;
        ctx.shadowColor = pal.wall;
        ctx.fillStyle = pal.wall;
        ctx.beginPath();
        ctx.moveTo(-6 * pScale, 0);
        ctx.lineTo(-15 * pScale, 4 * pScale);
        ctx.lineTo(-15 * pScale, -4 * pScale);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    };

return (
        <div className="relative w-full h-full font-mono text-[#1e1b4b] select-none bg-[#f8fafc] overflow-hidden">
            <canvas ref={canvasRef} className="block w-full h-full" />

            {/* Score Overlay & Exit (Z-INDEX INCREASED TO 30) */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-30 flex flex-col justify-between p-4">
                <div className="w-full flex justify-between items-start pointer-events-auto">
                    <div />
                    {gameState === 'playing' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleExit(); }}
                            className="p-3 bg-white/80 hover:bg-white text-[#1e1b4b] rounded-full shadow-md transition-all pointer-events-auto cursor-pointer"
                            title="Exit Game"
                        >
                            <X size={24} />
                        </button>
                    )}
                </div>

                <div className="absolute top-[10%] left-0 w-full text-center pointer-events-none -z-10">
                    <div ref={scoreSpanRef} className="text-[15vw] md:text-[6rem] font-black text-[#1e1b4b] opacity-90 tracking-tighter leading-none" style={{ textShadow: '0 4px 0 rgba(255,255,255,0.8)' }}>
                        0
                    </div>
                </div>
            </div>

            {/* Mobile Touch Controls Overlay (Z-INDEX 20) */}
            {gameState === 'playing' && (
                <div className="absolute inset-0 flex z-20">
                    <div 
                        className="flex-1 active:bg-white/10 transition-colors"
                        onTouchStart={(e) => { e.preventDefault(); setInput('left', true); }}
                        onTouchEnd={(e) => { e.preventDefault(); setInput('left', false); }}
                    />
                    <div 
                        className="flex-1 active:bg-white/10 transition-colors"
                        onTouchStart={(e) => { e.preventDefault(); setInput('right', true); }}
                        onTouchEnd={(e) => { e.preventDefault(); setInput('right', false); }}
                    />
                    
                    {/* Visual Arrows */}
                    <div className="absolute bottom-8 left-8 pointer-events-none opacity-40 text-white drop-shadow-md text-6xl">←</div>
                    <div className="absolute bottom-8 right-8 pointer-events-none opacity-40 text-white drop-shadow-md text-6xl">→</div>
                </div>
            )}

            {/* Menu Screens (Z-INDEX INCREASED TO 40) */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-40">
                {gameState === 'start' && (
                    <div className="bg-white/90 backdrop-blur-xl border border-white p-8 md:p-12 rounded-[40px] text-center pointer-events-auto shadow-2xl flex flex-col items-center transform transition-transform scale-90 md:scale-100 max-w-[90%]">
                        <h1 className="m-0 mb-4 text-5xl md:text-6xl font-black bg-gradient-to-br from-[#4f46e5] via-[#9333ea] to-[#ec4899] bg-clip-text text-transparent tracking-tighter uppercase leading-none">
                            HEX<br/>ULTRA
                        </h1>
                        <p className="text-slate-500 font-bold text-xl m-0 animate-pulse cursor-pointer" onClick={startGame}>TAP TO START</p>
                        <p className="text-sm mt-5 opacity-70">Use Left/Right Arrows or Touch Sides</p>
                        <button onClick={handleExit} className="mt-8 text-slate-400 underline text-xs hover:text-slate-600 cursor-pointer pointer-events-auto">Exit Game</button>
                    </div>
                )}

                {gameState === 'over' && (
                    <div className="bg-white/90 backdrop-blur-xl border border-white p-8 md:p-12 rounded-[40px] text-center pointer-events-auto shadow-2xl flex flex-col items-center scale-90 md:scale-100 max-w-[90%]">
                        <h1 className="text-5xl text-red-500 font-black mb-0">CRASH</h1>
                        <p className="mb-5 text-[#1e1b4b] text-5xl font-black">{score}</p>
                        <p className="text-slate-500 font-bold text-xl m-0 animate-pulse cursor-pointer" onClick={startGame}>TAP TO RETRY</p>
                        <button onClick={handleExit} className="mt-8 text-slate-400 underline text-xs hover:text-slate-600 cursor-pointer pointer-events-auto">Exit Game</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HexUltraGame;
