import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const WhackAMoleGame = ({ onExit, onGameOver }) => {
    // --- State ---
    const [gameState, setGameState] = useState('start'); // start, playing, gameover
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [energy, setEnergy] = useState(5);
    const [holes, setHoles] = useState([]);

    // --- Constants ---
    const CONFIG = {
        rows: 3, cols: 3,
        spaceX: 250, spaceY: 180,
        depthY: 200,
        popY: 0,
        maxEnergy: 5
    };

    // --- Refs for Game Loop & Logic ---
    const activeRef = useRef(false);
    const scoreRef = useRef(0);
    const streakRef = useRef(0);
    const energyRef = useRef(5);
    const holesRef = useRef([]); 
    const loopTimerRef = useRef(null);
    const audioCtxRef = useRef(null);
    const hammerRef = useRef(null);
    const hammerPivotRef = useRef(null);
    const stageRef = useRef(null);

    // --- Difficulty Calculation (Target: Max Difficulty at 900 Score) ---
    const getDifficulty = (currentScore) => {
        // Snap score to floor 100, Cap at 900 (Human Limit)
        const s = Math.min(900, Math.floor(currentScore / 100) * 100);

        let spawnInterval, stayDuration;

        if (s < 300) {
            // STAGE 1: Tutorial -> Warmup (Score 0-300)
            const t = s / 300;
            spawnInterval = 1000 - (400 * t); // 1.0s -> 0.6s
            stayDuration = 2000 - (600 * t);  // 2.0s -> 1.4s
        } 
        else if (s < 600) {
            // STAGE 2: Warmup -> Arcade (Score 300-600)
            const t = (s - 300) / 300;
            spawnInterval = 600 - (150 * t);  // 0.6s -> 0.45s
            stayDuration = 1400 - (500 * t);  // 1.4s -> 0.9s
        } 
        else {
            // STAGE 3: Arcade -> Human Limit (Score 600-900)
            const t = (s - 600) / 300;
            spawnInterval = 450 - (130 * t);  // 0.45s -> 0.32s
            stayDuration = 900 - (450 * t);   // 0.9s -> 0.45s
        }

        return { spawnInterval, stayDuration };
    };

    // --- Audio System ---
    const initAudio = () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
    };

    const playSound = (type) => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === 'pop') {
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.linearRampToValueAtTime(500, t + 0.05);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.linearRampToValueAtTime(0.001, t + 0.05);
            osc.start(); osc.stop(t + 0.05);
        } else if (type === 'hit') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'miss') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.linearRampToValueAtTime(50, t + 0.2);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.linearRampToValueAtTime(0.001, t + 0.2);
            osc.start(); osc.stop(t + 0.2);
        }
        osc.connect(gain);
        gain.connect(ctx.destination);
    };

    // --- Initialization ---
    useEffect(() => {
        const newHoles = [];
        const startX = -((CONFIG.cols - 1) * CONFIG.spaceX) / 2;
        const startY = -((CONFIG.rows - 1) * CONFIG.spaceY) / 2;

        for (let r = 0; r < CONFIG.rows; r++) {
            for (let c = 0; c < CONFIG.cols; c++) {
                newHoles.push({
                    id: r * CONFIG.cols + c,
                    x: startX + c * CONFIG.spaceX,
                    y: startY + r * CONFIG.spaceY,
                    status: 'IDLE',
                });
            }
        }
        setHoles(newHoles);
        holesRef.current = newHoles.map(h => ({ ...h, timer: null, el: null, anim: null }));

        return () => {
            stopGame();
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
    }, []);

    // --- Game Logic ---
    const startGame = () => {
        initAudio();
        activeRef.current = true;
        scoreRef.current = 0;
        streakRef.current = 0;
        energyRef.current = CONFIG.maxEnergy;

        setScore(0);
        setStreak(0);
        setEnergy(CONFIG.maxEnergy);
        setGameState('playing');

        holesRef.current.forEach(h => {
            if (h.timer) clearTimeout(h.timer);
            if (h.anim) h.anim.cancel();
            h.status = 'IDLE';
            updateHoleVisuals(h);
        });

        loop();
    };

    const stopGame = () => {
        activeRef.current = false;
        if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
        holesRef.current.forEach(h => {
            if (h.timer) clearTimeout(h.timer);
            if (h.anim) h.anim.cancel();
        });
    };

    const gameOver = () => {
        stopGame();
        setGameState('gameover');
        if (onGameOver) onGameOver(scoreRef.current);
    };

    const loop = () => {
        if (!activeRef.current) return;

        // 1. Calculate difficulty (scales 0 -> 900)
        const { spawnInterval, stayDuration } = getDifficulty(scoreRef.current);

        spawn(stayDuration);
        loopTimerRef.current = setTimeout(loop, spawnInterval);
    };

    const spawn = (stayDuration) => {
        const avail = holesRef.current.filter(h => h.status === 'IDLE');
        if (avail.length === 0) return;
        const hole = avail[Math.floor(Math.random() * avail.length)];

        hole.status = 'UP';
        updateHoleVisuals(hole);
        playSound('pop');

        const el = document.getElementById(`mole-${hole.id}`);
        if (el) {
             hole.anim = el.animate([
                { transform: `translate(0, ${CONFIG.depthY}px)` },
                { transform: `translate(0, ${CONFIG.popY}px)` }
            ], { duration: 300, easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)', fill: 'forwards' });
        }

        hole.timer = setTimeout(() => retreat(hole), stayDuration);
    };

    const retreat = (hole) => {
        if (!activeRef.current || hole.status !== 'UP') return;
        if (hole.anim) hole.anim.cancel();

        const el = document.getElementById(`mole-${hole.id}`);
        if (el) {
            hole.anim = el.animate([
                { transform: `translate(0, ${CONFIG.popY}px)` },
                { transform: `translate(0, ${CONFIG.depthY}px)` }
            ], { duration: 150, easing: 'ease-in', fill: 'forwards' });

            hole.anim.onfinish = () => {
                if (hole.status === 'UP' && activeRef.current) loseEnergy();
                hole.status = 'IDLE';
            };
        }
    };

    const attemptWhack = (id) => {
        const hole = holesRef.current[id];
        if (hole.status !== 'UP') return;

        hole.status = 'HIT';
        if(hole.timer) clearTimeout(hole.timer);
        playSound('hit');
        swingHammer();

        // --- SCORING LOGIC UPDATED ---
        // Target: ~900-950 Score at 100 Streak
        streakRef.current++;
        
        // Base: 5 points
        // Bonus: +1 point per 10 streaks
        // Avg points per hit over 100 streak is ~9.5
        const points = 5 + Math.floor(streakRef.current / 10);
        
        scoreRef.current += points;

        setScore(scoreRef.current);
        setStreak(streakRef.current);

        // Visuals
        const el = document.getElementById(`mole-${hole.id}`);
        const face = document.getElementById(`face-${hole.id}`);
        const eyes = document.getElementById(`eyes-${hole.id}`);

        if (face) face.setAttribute("opacity", 1);
        if (eyes) eyes.setAttribute("opacity", 0);

        if (hole.anim) hole.anim.cancel();

        if (el) {
             const squash = el.animate([
                { transform: `translate(0, ${CONFIG.popY}px) scale(1)` },
                { transform: `translate(0, ${CONFIG.popY + 20}px) scale(1.1, 0.9)` }
            ], { duration: 80, fill: 'forwards' });

            squash.onfinish = () => {
                hole.anim = el.animate([
                    { transform: `translate(0, ${CONFIG.popY + 20}px)` },
                    { transform: `translate(0, ${CONFIG.depthY}px)` }
                ], { duration: 150, fill: 'forwards' });
                hole.anim.onfinish = () => {
                    hole.status = 'IDLE';
                    updateHoleVisuals(hole);
                };
            };
        }
    };

    const loseEnergy = () => {
        energyRef.current--;
        setEnergy(energyRef.current);
        playSound('miss');

        if (streakRef.current > 0) {
            streakRef.current = 0;
            setStreak(0);
        }

        if (energyRef.current <= 0) {
            gameOver();
        }
    };

    const updateHoleVisuals = (hole) => {
        const el = document.getElementById(`mole-${hole.id}`);
        const face = document.getElementById(`face-${hole.id}`);
        const eyes = document.getElementById(`eyes-${hole.id}`);

        if (!el || !face || !eyes) return;

        if (hole.status === 'IDLE') {
             el.style.transform = `translate(0, ${CONFIG.depthY}px)`;
             face.setAttribute("opacity", 0);
             eyes.setAttribute("opacity", 1);
        } else if (hole.status === 'UP') {
             face.setAttribute("opacity", 0);
             eyes.setAttribute("opacity", 1);
        }
    };

    const swingHammer = () => {
        if (hammerPivotRef.current) {
            hammerPivotRef.current.animate([
                { transform: 'rotate(0deg)' },
                { transform: 'rotate(-40deg)' },
                { transform: 'rotate(10deg)' },
                { transform: 'rotate(0deg)' }
            ], { duration: 100 });
        }
    };

    const handleHammerMove = (e) => {
        if (!hammerRef.current) return;
        hammerRef.current.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`;
    };

    const handleBgClick = () => {
        if (!activeRef.current) return;
        swingHammer();
        if (streakRef.current > 0) {
             streakRef.current = 0;
             setStreak(0);
        }
    };

    useEffect(() => {
        window.addEventListener('mousemove', handleHammerMove);
        return () => window.removeEventListener('mousemove', handleHammerMove);
    }, []);

    return (
        <div
            className="relative w-full h-full bg-indigo-50 overflow-hidden flex flex-col items-center justify-center cursor-none select-none"
            style={{
                background: 'linear-gradient(135deg, #e0e7ff, #f3e8ff)',
                touchAction: 'none'
            }}
        >
             {/* UI Layer */}
             <div className="absolute top-4 w-[96%] max-w-[800px] flex justify-between items-start pointer-events-none z-50">
                 {/* Score */}
                 <div className="bg-white/90 backdrop-blur-md border-2 border-white rounded-2xl px-5 py-2 shadow-sm flex flex-col items-center min-w-[100px]">
                     <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Score</span>
                     <span className="text-3xl font-black text-indigo-600 leading-none">{score}</span>
                     <span className="text-[10px] text-slate-400 font-bold">
                        +{5 + Math.floor(streak / 10)} per hit
                     </span>
                 </div>

                 {/* Streak */}
                 <div className="bg-white/90 backdrop-blur-md border-2 border-white rounded-2xl px-5 py-2 shadow-sm flex flex-col items-center min-w-[100px]">
                     <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Streak</span>
                     <div className="flex items-center gap-2">
                         <span className="text-3xl font-black text-amber-500 leading-none">{streak}</span>
                         {streak > 1 && (
                            <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold animate-in zoom-in">
                                {5 + Math.floor(streak / 10)} pts
                            </span>
                         )}
                     </div>
                 </div>

                 {/* Energy */}
                 <div className="bg-white/90 backdrop-blur-md border-2 border-white rounded-2xl px-5 py-2 shadow-sm flex flex-col items-center min-w-[100px]">
                     <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Energy</span>
                     <div className="flex gap-1 mt-1">
                         {[...Array(CONFIG.maxEnergy)].map((_, i) => (
                             <div
                                key={i}
                                className={`w-4 h-2 rounded-sm transform -skew-x-12 transition-all ${
                                    i < energy ? 'bg-emerald-500' : 'bg-slate-300 opacity-50 scale-90'
                                }`}
                             />
                         ))}
                     </div>
                 </div>
             </div>

             {/* Exit Button (Mid-Game) */}
             {gameState === 'playing' && (
                <button
                    onClick={(e) => { e.stopPropagation(); onExit(); }}
                    className="absolute top-4 right-4 z-[60] p-3 bg-white/80 backdrop-blur hover:bg-white text-slate-800 rounded-full shadow-md transition-all"
                    style={{ cursor: 'pointer' }}
                >
                    <X size={24} />
                </button>
             )}

             {/* SVG Stage */}
             <svg
                ref={stageRef}
                viewBox="0 0 1000 800"
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full max-w-[100vw] max-h-[100vh] block"
             >
                <defs>
                    <radialGradient id="hole-grad" cx="50%" cy="50%" r="50%">
                        <stop offset="60%" stopColor="#2d1b15"/>
                        <stop offset="95%" stopColor="#050302"/>
                    </radialGradient>

                    <linearGradient id="mole-skin" x1="0" y1="0" x2="0.3" y2="1">
                        <stop offset="0%" stopColor="#8d6e63"/>
                        <stop offset="100%" stopColor="#5d4037"/>
                    </linearGradient>

                    <filter id="inner-shadow">
                        <feOffset dx="0" dy="5"/>
                        <feGaussianBlur stdDeviation="5" result="offset-blur"/>
                        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
                        <feFlood floodColor="black" floodOpacity="0.7" result="color"/>
                        <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
                        <feComposite operator="over" in="shadow" in2="SourceGraphic"/>
                    </filter>

                    <clipPath id="mole-mask">
                        <path d="M -90 -600 L 90 -600 L 90 0 A 90 25 0 0 1 -90 0 Z" />
                    </clipPath>
                </defs>

                {/* Background Trigger */}
                <rect
                    width="100%" height="100%" fill="transparent"
                    onMouseDown={handleBgClick}
                    onTouchStart={(e) => { e.preventDefault(); handleBgClick(); }}
                />

                <g transform="translate(500, 420)">
                    {holes.map((h, i) => (
                        <g key={h.id} transform={`translate(${h.x},${h.y})`}>
                            {/* Pit */}
                            <ellipse rx="90" ry="25" fill="url(#hole-grad)" filter="url(#inner-shadow)" />

                            {/* Mask Group */}
                            <g clipPath="url(#mole-mask)">
                                <g id={`mole-${h.id}`} transform={`translate(0, ${CONFIG.depthY})`}>
                                    {/* Body */}
                                    <path d="M -65 50 L -65 -80 Q -65 -140 0 -140 Q 65 -140 65 -80 L 65 50 Z" fill="url(#mole-skin)"/>
                                    <path d="M -35 50 L -35 -60 Q -35 -90 35 -90 Q 35 -60 35 50 Z" fill="rgba(255,255,255,0.15)"/>
                                    <ellipse cx="0" cy="-80" rx="18" ry="12" fill="#3e2723"/>
                                    <ellipse cx="-5" cy="-83" rx="6" ry="3" fill="rgba(255,255,255,0.3)"/>

                                    {/* Normal Eyes */}
                                    <g id={`eyes-${h.id}`} className="eyes">
                                        <ellipse cx="-20" cy="-100" rx="7" ry="11" fill="#111"/>
                                        <circle cx="-22" cy="-104" r="2.5" fill="white"/>
                                        <ellipse cx="20" cy="-100" rx="7" ry="11" fill="#111"/>
                                        <circle cx="18" cy="-104" r="2.5" fill="white"/>
                                    </g>

                                    {/* Hit Face */}
                                    <g id={`face-${h.id}`} opacity="0">
                                        <path d="M -25 -105 L -15 -95 M -15 -105 L -25 -95" stroke="#111" strokeWidth="4"/>
                                        <path d="M 15 -105 L 25 -95 M 25 -105 L 15 -95" stroke="#111" strokeWidth="4"/>
                                        <circle cx="0" cy="-70" r="12" fill="#111"/>
                                    </g>

                                    {/* Hitbox */}
                                    <rect
                                        x="-80" y="-160" width="160" height="170" fill="transparent"
                                        style={{ cursor: 'pointer' }}
                                        onMouseDown={(e) => { e.stopPropagation(); attemptWhack(i); }}
                                        onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); attemptWhack(i); }}
                                    />
                                </g>
                            </g>

                            {/* Rim */}
                            <path d="M -90 0 A 90 25 0 0 0 90 0" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="5" />
                        </g>
                    ))}
                </g>
             </svg>

             {/* Start Screen */}
             {gameState === 'start' && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-md flex flex-col justify-center items-center z-[100]">
                    <div className="bg-white p-10 rounded-[30px] border-4 border-white shadow-2xl text-center max-w-sm">
                        <h1 className="text-5xl font-black bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent mb-4">
                            READY?
                        </h1>
                        <p className="text-slate-500 font-semibold mb-8">
                            Hit the moles. Build your streak. Watch your energy.
                        </p>
                        <button
                            onClick={startGame}
                            className="bg-indigo-600 text-white px-12 py-4 rounded-full text-xl font-bold shadow-xl hover:scale-105 active:scale-95 transition-all"
                        >
                            PLAY
                        </button>
                        <button
                            onClick={onExit}
                            className="block mt-4 text-slate-400 font-bold hover:text-slate-600 text-sm"
                        >
                            Back to Arcade
                        </button>
                    </div>
                </div>
             )}

             {/* Game Over Screen */}
            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-md flex flex-col justify-center items-center z-[100] animate-in fade-in duration-300">
                    <div className="bg-white p-10 rounded-[30px] border-4 border-white shadow-2xl text-center max-w-sm">
                        <h2 className="text-4xl font-black text-slate-800 mb-2">GAME OVER</h2>
                        <div className="my-6">
                            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Final Score</span>
                            <div className="text-5xl font-black text-indigo-600">{score}</div>
                            <span className="text-slate-500 text-sm font-semibold mt-2 block">Highest Streak: {streak}</span>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={startGame}
                                className="bg-indigo-600 text-white px-10 py-3 rounded-full text-lg font-bold shadow-lg hover:bg-indigo-700 transition-all"
                            >
                                TRY AGAIN
                            </button>
                            <button
                                onClick={onExit}
                                className="bg-slate-100 text-slate-600 px-10 py-3 rounded-full text-lg font-bold hover:bg-slate-200 transition-all"
                            >
                                EXIT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hammer Cursor */}
            <svg
                ref={hammerRef}
                viewBox="0 0 100 100"
                style={{
                    position: 'fixed', top: 0, left: 0,
                    width: '120px', height: '120px',
                    pointerEvents: 'none', zIndex: 999
                }}
                className="hidden md:block filter drop-shadow-lg will-change-transform"
            >
                <g ref={hammerPivotRef} style={{ transformOrigin: '50px 90px' }}>
                    <rect x="44" y="25" width="12" height="70" rx="6" fill="#94a3b8" stroke="#64748b" strokeWidth="2"/>
                    <g transform="translate(15, 10)">
                        <rect width="70" height="40" rx="10" fill="#6366f1" stroke="#312e81" strokeWidth="2"/>
                        <path d="M 10 10 L 60 10" stroke="rgba(255,255,255,0.3)" strokeWidth="4" strokeLinecap="round"/>
                        <ellipse cx="0" cy="20" rx="6" ry="14" fill="#1e1b4b"/>
                        <ellipse cx="70" cy="20" rx="6" ry="14" fill="#1e1b4b"/>
                    </g>
                </g>
            </svg>
        </div>
    );
};

export default WhackAMoleGame;
