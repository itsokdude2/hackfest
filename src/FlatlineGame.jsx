import React, { useEffect, useState, useRef } from 'react';
import { X, Trophy, Zap } from 'lucide-react';

/* --- 1. AUDIO ENGINE --- */
const Audio = {
    ctx: null,
    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    },
    playClick() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 0.05);
    },
    playPop() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(800, t); 
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15); 
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 0.15);
    },
    playError() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.2);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 0.2);
    }
};

/* --- 2. CONFIG & WORDS --- */
const COLORS = {
    bg: '#f8fafc',
    grid: '#e2e8f0', 
    textMain: '#0f172a', 
    textHighlight: '#3b82f6', 
    textTyped: '#cbd5e1', 
    fatalLine: '#ef4444', 
    combo: '#22c55e' 
};

const WORDS = [
    "void", "null", "grid", "data", "link", "node", "core", "byte", "root",
    "index", "query", "stack", "queue", "graph", "logic", "scope", "parse",
    "async", "await", "const", "class", "super", "yield", "throw", "catch",
    "debug", "trace", "error", "fatal", "abort", "retry", "merge", "split",
    "slice", "splice", "shift", "proxy", "token", "asset", "build", "deploy",
    "access", "action", "active", "adapt", "adjust", "agent", "alert", "align",
    "analog", "anchor", "angle", "apply", "array", "aspect", "atom", "audit",
    "auto", "axis", "backup", "badge", "band", "base", "batch", "beam",
    "bias", "bind", "bit", "block", "board", "boost", "boot", "bot",
    "bound", "box", "brain", "branch", "break", "brief", "buffer", "bug",
    "burst", "bus", "cache", "call", "case", "cast", "cell", "chain",
    "chart", "check", "chip", "chord", "chunk", "cipher", "clamp", "clean",
    "clear", "click", "client", "clip", "clock", "clone", "cloud", "code",
    "coil", "color", "column", "command", "commit", "common", "compile", "config",
    "connect", "console", "content", "context", "control", "convert", "cookie", "copy",
    "core", "count", "crash", "create", "credit", "crypto", "cursor", "curve",
    "cycle", "daemon", "damage", "dash", "data", "date", "debug", "decay",
    "decode", "define", "delay", "delete", "delta", "demo", "depth", "design",
    "detect", "device", "dial", "digit", "direct", "disk", "display", "divert",
    "domain", "dot", "double", "down", "drag", "drain", "draw", "drift",
    "drive", "drop", "drum", "dump", "dust", "echo", "edge", "edit",
    "effect", "eject", "element", "empty", "enable", "encode", "end", "energy",
    "engine", "enter", "entry", "equal", "erase", "error", "event", "exit",
    "expand", "export", "extend", "face", "fact", "fade", "fail", "false",
    "fast", "fault", "feed", "fetch", "field", "file", "fill", "filter",
    "final", "find", "fire", "firm", "flag", "flash", "flat", "flex",
    "flip", "float", "flood", "floor", "flow", "fluid", "flush", "flux",
    "focus", "fold", "font", "force", "form", "format", "frame", "free",
    "freq", "front", "fuel", "full", "func", "fuse", "gain", "game",
    "gate", "gauge", "gear", "gen", "ghost", "glass", "glitch", "global",
    "glow", "glyph", "goal", "grab", "grade", "graph", "grid", "ground",
    "group", "guard", "guide", "hack", "halt", "handle", "handy", "hard",
    "hash", "head", "heap", "heat", "heavy", "help", "hide", "high",
    "hint", "hold", "home", "hook", "host", "hover", "hub", "hull",
    "hunt", "hyper", "icon", "idle", "image", "impact", "import", "index",
    "info", "init", "input", "insert", "intel", "intro", "invert", "iron",
    "item", "jack", "java", "join", "jump", "junk", "kernel", "key",
    "kick", "kill", "kind", "kit", "knob", "knot", "know", "label",
    "lag", "lamp", "lane", "laser", "last", "latch", "late", "layer",
    "lead", "leak", "leap", "left", "level", "lever", "life", "lift",
    "light", "limit", "line", "link", "list", "load", "local", "lock",
    "log", "logic", "login", "loop", "loss", "loud", "low", "luck",
    "lumen", "macro", "magic", "magnet", "main", "make", "map", "mark",
    "mask", "master", "match", "math", "matrix", "max", "mean", "mech",
    "media", "mega", "melt", "memo", "menu", "merge", "mesh", "meta",
    "metal", "meter", "method", "micro", "midi", "mime", "min", "mind",
    "mine", "misc", "miss", "mix", "mode", "model", "modem", "module",
    "monitor", "mono", "motion", "motor", "mount", "mouse", "move", "movie",
    "mute", "name", "native", "nav", "near", "neat", "needle", "neon",
    "net", "neural", "neuron", "next", "node", "noise", "none", "norm",
    "note", "noun", "nova", "null", "number", "object", "octal", "off",
    "offset", "omit", "open", "optic", "option", "orbit", "order", "organ",
    "origin", "output", "over", "pack", "page", "paint", "pair", "panel",
    "paper", "param", "part", "pass", "paste", "path", "pause", "peak",
    "peer", "pen", "phase", "phone", "photo", "pick", "pile", "pilot",
    "pin", "ping", "pipe", "pixel", "plan", "plane", "plant", "plate",
    "play", "plot", "plug", "plus", "point", "poll", "poly", "pool",
    "pop", "port", "pose", "post", "power", "press", "prime", "print",
    "prior", "prism", "probe", "proc", "prof", "prog", "prom", "prop",
    "proto", "proxy", "public", "pull", "pulse", "pump", "punch", "purge",
    "push", "pyro", "quad", "quality", "quant", "query", "queue", "quick",
    "quiet", "quit", "quote", "race", "rack", "radar", "radio", "radius",
    "raid", "rail", "rain", "raise", "ram", "ramp", "rand", "range",
    "rank", "rapid", "rate", "ratio", "raw", "ray", "read", "ready",
    "real", "reboot", "recv", "redo", "ref", "region", "relay", "reload",
    "remote", "remove", "render", "repair", "repeat", "reply", "report", "reset",
    "result", "resume", "return", "rev", "rgb", "rich", "ride", "rig",
    "right", "ring", "risk", "robot", "role", "roll", "root", "rope",
    "rotate", "rotor", "route", "row", "rule", "run", "rust", "safe",
    "salt", "sample", "save", "scale", "scan", "scene", "schema", "scheme",
    "scope", "score", "screen", "script", "scroll", "scrub", "search", "seat",
    "sec", "sector", "seed", "seek", "select", "self", "send", "sensor",
    "serial", "server", "servo", "set", "shade", "shadow", "shape", "share",
    "sharp", "shear", "sheet", "shell", "shift", "shine", "ship", "shock",
    "shoot", "shop", "short", "shot", "show", "shut", "side", "sight",
    "sign", "signal", "silent", "silicon", "simple", "sine", "single", "sink",
    "site", "size", "skew", "skill", "skin", "skip", "slab", "slack",
    "slate", "slave", "sleep", "slice", "slide", "slot", "slow", "smart",
    "smash", "smooth", "snap", "socket", "soft", "solar", "solid", "solve",
    "sonar", "sonic", "sort", "sound", "source", "space", "span", "spark",
    "spawn", "speak", "spec", "speed", "spell", "spend", "sphere", "spin",
    "spiral", "spirit", "splash", "split", "spool", "spot", "spray", "spread",
    "sprite", "stack", "stage", "stamp", "stand", "star", "start", "state",
    "static", "stats", "status", "stay", "steam", "steel", "step", "stop",
    "store", "storm", "stream", "string", "strip", "stroke", "struct", "style",
    "sub", "submit", "sum", "super", "supply", "surge", "swap", "swarm",
    "sweep", "swift", "swim", "switch", "sync", "syntax", "synth", "sys",
    "system", "tab", "table", "tag", "tail", "take", "talk", "tank",
    "tape", "target", "task", "tcp", "team", "tech", "temp", "term",
    "test", "text", "texture", "theme", "theory", "thick", "thin", "thing",
    "thread", "time", "timer", "title", "toggle", "token", "tone", "tool",
    "top", "topic", "total", "touch", "tower", "trace", "track", "trail",
    "train", "trait", "trans", "trap", "trash", "tray", "tree", "trend",
    "trial", "trigger", "trim", "true", "tube", "tune", "turn", "tweak",
    "twin", "twist", "type", "udp", "ultra", "undo", "unit", "unix",
    "unlock", "update", "upload", "upper", "url", "usage", "user", "util",
    "valid", "value", "valve", "vapor", "var", "vector", "vent", "verb",
    "verify", "vertex", "video", "view", "vinyl", "virus", "vis", "vision",
    "void", "volt", "volume", "vote", "wait", "wake", "walk", "wall",
    "warn", "warp", "wash", "watch", "wave", "weak", "wear", "web",
    "weight", "wheel", "wide", "width", "wifi", "win", "wind", "window",
    "wing", "wipe", "wire", "wish", "with", "word", "work", "world",
    "wrap", "write", "wrong", "xenon", "xerox", "xml", "xor", "yard",
    "year", "yield", "zero", "zinc", "zone", "zoom"
];

const FlatlineGame = ({ onExit, onGameOver }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const frameIdRef = useRef(null);
    const mobileInputRef = useRef(null);

    const gameRef = useRef({
        active: false,
        lastTime: 0,
        spawnTimer: 0,
        words: [],     
        particles: [],
        score: 0,
        combo: 0,
        shake: 0,
        gridOffset: 0, 
        
        // --- BASE SETTINGS ---
        fallSpeed: 60, 
        spawnRate: 2000,
        
        // Stats
        totalKeystrokes: 0,
        correctKeystrokes: 0,
        fontSize: 30, 
    });

    const [gameState, setGameState] = useState('start');
    const [stats, setStats] = useState({ score: 0, combo: 0 });
    const [endStats, setEndStats] = useState({ score: 0, acc: 0, final: 0 });
    const [flash, setFlash] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const { clientWidth: w, clientHeight: h } = containerRef.current;
                const dpr = window.devicePixelRatio || 1;
                
                canvasRef.current.width = w * dpr;
                canvasRef.current.height = h * dpr;
                canvasRef.current.style.width = `${w}px`;
                canvasRef.current.style.height = `${h}px`;
                
                const ctx = canvasRef.current.getContext('2d');
                ctx.scale(dpr, dpr);

                // --- MOBILE FONT SCALING ---
                const isMobile = w < 600;
                gameRef.current.fontSize = isMobile ? Math.min(w / 6, 60) : Math.max(30, w / 25);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(frameIdRef.current);
        };
    }, []);

    const startGame = () => {
        Audio.init();
        if(Audio.ctx && Audio.ctx.state === 'suspended') Audio.ctx.resume();

        const state = gameRef.current;
        state.words = [];
        state.particles = [];
        state.score = 0;
        state.combo = 0;
        state.active = true;
        state.fallSpeed = 60; 
        state.spawnRate = 2000;
        state.spawnTimer = 0;
        state.lastTime = performance.now();
        state.totalKeystrokes = 0;
        state.correctKeystrokes = 0;

        setGameState('playing');
        setStats({ score: 0, combo: 0 });
        
        if(mobileInputRef.current) {
            mobileInputRef.current.value = "";
            mobileInputRef.current.focus();
        }

        spawnWord();
        requestAnimationFrame(gameLoop);
    };

    const spawnWord = () => {
        const state = gameRef.current;
        const text = WORDS[Math.floor(Math.random() * WORDS.length)];
        const ctx = canvasRef.current.getContext('2d');
        
        ctx.font = `bold ${state.fontSize}px monospace`;
        const width = ctx.measureText(text).width;

        const w = containerRef.current.clientWidth;
        const x = Math.random() * (w - width - 40) + 20;

        state.words.push({
            text,
            x,
            y: -100, // Start higher up
            typedIndex: 0,
            width
        });
    };

    const handleInput = (char) => {
        if (!char) return;
        const lowerChar = char.toLowerCase();
        const state = gameRef.current;
        state.totalKeystrokes++;

        if (state.words.length === 0) return;

        // Target lowest word
        const sorted = [...state.words].sort((a, b) => b.y - a.y);
        const target = sorted[0];

        if (target.text[target.typedIndex] === lowerChar) {
            state.correctKeystrokes++;
            target.typedIndex++;
            Audio.playClick();
            
            const charW = target.width / target.text.length;
            createBurst(target.x + (target.typedIndex * charW), target.y + state.fontSize/2, COLORS.textHighlight, 4);
            state.shake = 2; 

            if (target.typedIndex >= target.text.length) {
                completeWord(target);
            }
        } else {
            state.combo = 0;
            state.shake = 10; 
            Audio.playError();
            triggerFlash();
            updateStats();
        }
    };

    const completeWord = (wordObj) => {
        const state = gameRef.current;
        Audio.playPop();
        createBurst(wordObj.x + wordObj.width/2, wordObj.y + state.fontSize/2, COLORS.textMain, 20);
        
        state.words = state.words.filter(w => w !== wordObj);
        
        /* 
           --- NEW SCORING ---
           Base 5 points.
           Combo bonus is gentle (0.5 points per combo).
           This makes "300" a meaningful milestone that takes time to reach.
        */
        const points = 5 + Math.floor(state.combo * 0.5);
        state.score += points;
        state.combo++;

        /* 
           --- NEW DIFFICULTY PACING ---
           Goal: Hard at 300, Very Hard at 600, Impossible at 1200.
           
           Spawn Rate (ms): 
           Starts at 2000ms. 
           Drops aggressively to reach ~500ms by score 1200.
           Formula: 2000 - (score * 1.25)
           - Score 300: 2000 - 375 = 1625 (Wait, we need Harder at 300)
           
           Revised Aggressive Curve:
           Spawn Rate: Math.max(500, 2000 - (state.score * 1.3))
           Fall Speed: 60 + (state.score * 0.1)
           
           Check:
           300 Pts: Rate 1610ms, Speed 90 (1.5x speed) -> Moderate/Hard transition
           600 Pts: Rate 1220ms, Speed 120 (2.0x speed) -> Very Hard
           1200 Pts: Rate 500ms (Cap), Speed 180 (3.0x speed) -> Impossible
        */
        
        state.spawnRate = Math.max(500, 2000 - (state.score * 1.3));
        state.fallSpeed = 60 + (state.score * 0.1);

        updateStats();
    };

    const createBurst = (x, y, color, count) => {
        const state = gameRef.current;
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 200 + 50; 
            state.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color,
                size: Math.random() * 5 + 2 
            });
        }
    };

    const drawGrid = (ctx, w, h, offset) => {
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const gridSize = 100;
        for (let x = 0; x <= w; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        const scrollY = offset % gridSize;
        for (let y = scrollY; y <= h; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
    };

    const gameLoop = (time) => {
        const state = gameRef.current;
        if (!state.active) return;

        const dt = (time - state.lastTime) / 1000;
        state.lastTime = time;
        const cvs = canvasRef.current;
        const ctx = cvs.getContext('2d');
        const { clientWidth: w, clientHeight: h } = containerRef.current;

        // 1. Background
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, w, h);
        state.gridOffset += dt * 30; 
        drawGrid(ctx, w, h, state.gridOffset);

        ctx.save();

        // 2. Shake
        if (state.shake > 0) {
            const dx = (Math.random() - 0.5) * state.shake;
            const dy = (Math.random() - 0.5) * state.shake;
            ctx.translate(dx, dy);
            state.shake = Math.max(0, state.shake - dt * 30);
        }

        // 3. Spawning
        state.spawnTimer += dt * 1000;
        if (state.spawnTimer > state.spawnRate) {
            spawnWord();
            state.spawnTimer = 0;
        }

        // 4. Words
        ctx.font = `bold ${state.fontSize}px monospace`;
        ctx.textBaseline = 'top';
        const killY = h - (h * 0.15); 

        for (let i = state.words.length - 1; i >= 0; i--) {
            const word = state.words[i];
            word.y += state.fallSpeed * dt;

            if (word.y > killY) {
                gameOver();
                ctx.restore();
                return;
            }

            const isTarget = state.words.reduce((prev, curr) => (curr.y > prev.y ? curr : prev), state.words[0]) === word;

            let cursorX = word.x;
            
            // Draw Typed
            if (word.typedIndex > 0) {
                ctx.fillStyle = COLORS.textTyped;
                const str = word.text.substring(0, word.typedIndex);
                ctx.fillText(str, cursorX, word.y);
                cursorX += ctx.measureText(str).width;
            }

            // Draw Next
            const remaining = word.text.substring(word.typedIndex);
            if (remaining.length > 0) {
                if (isTarget) {
                    ctx.fillStyle = COLORS.textHighlight;
                    const char = remaining[0];
                    ctx.fillText(char, cursorX, word.y);
                    cursorX += ctx.measureText(char).width;
                    
                    ctx.fillStyle = COLORS.textMain;
                    ctx.fillText(remaining.substring(1), cursorX, word.y);
                } else {
                    ctx.fillStyle = COLORS.textMain;
                    ctx.fillText(remaining, cursorX, word.y);
                }
            }
        }

        // 5. Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life -= dt * 2;
            if (p.life <= 0) {
                state.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();
        frameIdRef.current = requestAnimationFrame(gameLoop);
    };

    const gameOver = () => {
        const state = gameRef.current;
        state.active = false;
        Audio.playError();
        let acc = state.totalKeystrokes > 0 ? state.correctKeystrokes / state.totalKeystrokes : 0;
        const finalScore = Math.floor(state.score * acc); // Penalty for bad accuracy
        setEndStats({ score: state.score, acc: Math.floor(acc * 100), final: finalScore });
        setGameState('over');
        if (onGameOver) onGameOver(finalScore);
    };

    // --- INPUT ---
    useEffect(() => {
        const onKey = (e) => {
            if (gameState !== 'playing') {
                if (e.key === 'Enter') startGame();
                return;
            }
            if(e.key === ' ' || e.key === 'Enter') e.preventDefault();
            if (/^[a-z]$/i.test(e.key)) handleInput(e.key);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [gameState]);

    const handleMobileInput = (e) => {
        const val = e.target.value;
        if (val.length > 0) {
            handleInput(val.slice(-1));
            e.target.value = "";
        }
    };

    const triggerFlash = () => {
        setFlash(true);
        setTimeout(() => setFlash(false), 50);
    };

    const refocusMobile = () => {
        if (gameState === 'playing' && mobileInputRef.current) mobileInputRef.current.focus();
    };

    const updateStats = () => setStats({ score: gameRef.current.score, combo: gameRef.current.combo });

    return (
        <div ref={containerRef} className="relative w-full h-full bg-slate-50 overflow-hidden select-none font-mono" onClick={refocusMobile}>
            <canvas ref={canvasRef} className="block" />

            <input 
                ref={mobileInputRef} 
                type="text" 
                className="absolute top-0 left-0 opacity-0 w-full h-full cursor-default z-0" 
                autoComplete="off" 
                autoCorrect="off" 
                autoCapitalize="off" 
                spellCheck="false" 
                onInput={handleMobileInput} 
                disabled={gameState !== 'playing'} 
            />

            <div className="absolute inset-0 bg-red-500 pointer-events-none transition-opacity duration-75 z-20" style={{ opacity: flash ? 0.3 : 0 }} />

            {/* HUD */}
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none z-10">
                <div className="border-l-4 border-slate-900 pl-4 bg-white/50 backdrop-blur-sm pr-6 py-2 rounded-r-lg">
                    <div className="text-xs font-bold text-slate-500 tracking-widest uppercase mb-1">SCORE</div>
                    <div className="text-4xl font-black text-slate-900 leading-none">{stats.score}</div>
                    <div className={`mt-2 flex items-center gap-1 transition-opacity duration-300 ${stats.combo > 1 ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Zap size={10} fill="currentColor" />
                            {stats.combo} COMBO
                        </div>
                    </div>
                </div>
                
                <button onClick={(e) => { e.stopPropagation(); onExit(); }} className="pointer-events-auto p-2 bg-white/90 rounded-full shadow hover:bg-white text-slate-800 transition-colors">
                    <X size={24} />
                </button>
            </div>

            {/* Fatal Line */}
            <div className="absolute bottom-[15%] left-0 w-full border-t-2 border-red-400 border-dashed opacity-60 pointer-events-none z-0">
                <span className="absolute -top-6 left-4 text-[10px] font-bold text-red-500 bg-slate-50 px-2 rounded border border-red-200">FATAL THRESHOLD</span>
            </div>

            {gameState === 'start' && (
                <div className="absolute inset-0 bg-slate-50/95 flex flex-col justify-center items-center z-30 p-4">
                    <div className="text-center max-w-md">
                        <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter mb-4">FLATLINE</h1>
                        <p className="text-slate-600 mb-8 text-lg md:text-xl">Type the lowest word. Don't let them breach the line.</p>
                        <button onClick={startGame} className="bg-slate-900 text-white px-12 py-5 text-xl font-bold rounded-sm hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-300">
                            INITIALIZE SYSTEM
                        </button>
                    </div>
                </div>
            )}

            {gameState === 'over' && (
                <div className="absolute inset-0 bg-slate-50/95 flex flex-col justify-center items-center z-30 p-4">
                    <h1 className="text-5xl md:text-7xl font-black text-red-500 tracking-tighter mb-8">SYSTEM FAILURE</h1>
                    <div className="bg-white border-2 border-slate-900 p-8 w-full max-w-sm shadow-[8px_8px_0px_rgba(15,23,42,0.1)] mb-8 rounded-sm">
                        <div className="flex justify-between items-end mb-2 text-slate-600 border-b border-slate-100 pb-2">
                            <span className="text-sm font-bold uppercase tracking-wider">Raw Score</span>
                            <span className="text-xl font-mono">{endStats.score}</span>
                        </div>
                        <div className="flex justify-between items-end mb-6 text-slate-600 border-b border-slate-100 pb-2">
                            <span className="text-sm font-bold uppercase tracking-wider">Accuracy</span>
                            <span className={`text-xl font-mono ${endStats.acc > 90 ? 'text-green-600' : 'text-slate-900'}`}>{endStats.acc}%</span>
                        </div>
                        <div className="flex justify-between items-center text-3xl font-black text-slate-900">
                            <span className="flex items-center gap-2"><Trophy size={28} /> FINAL</span>
                            <span>{endStats.final}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 w-full max-w-sm">
                        <button onClick={startGame} className="w-full bg-slate-900 text-white py-4 font-bold rounded-sm hover:bg-black transition-colors shadow-lg">
                            REBOOT
                        </button>
                        <button onClick={onExit} className="w-full bg-white border-2 border-slate-200 text-slate-600 py-4 font-bold rounded-sm hover:bg-slate-50 transition-colors">
                            ABORT
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlatlineGame;
