import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Trophy, X, Layers } from 'lucide-react';

// MUST MATCH THE CSS --block-height variable in index.html
const BLOCK_HEIGHT = 40;

// Generate vibrant, distinct colors
const getColor = (i) => {
  // Use a golden ratio offset for distinct colors or a nice spectrum walk
  const hue = 200 + (i * 12) % 360;
  // High saturation and lightness for that "toy block" feel
  return `hsl(${hue}, 85%, 65%)`;
};

const StackGame = ({ onExit, onGameOver }) => {
  const [gameState, setGameState] = useState('start');
  const [score, setScore] = useState(0);
  const [stack, setStack] = useState([]);
  const [debris, setDebris] = useState([]);

  // Refs for Game Loop Logic (avoiding closure staleness)
  const gameActiveRef = useRef(false);
  const reqRef = useRef(0);
  const scoreRef = useRef(0);
  const stackRef = useRef([]);
  const lastTimeRef = useRef(0);

  // Current moving block state
  const currentRef = useRef({
    x: 0,
    y: 0,
    z: 0,
    width: 200,
    depth: 200,
    direction: 'x',
    speed: 4, // Pixels per frame (normalized to 60fps)
    moveDir: 1, // 1 or -1
  });

  // Camera scroll
  const [cameraZ, setCameraZ] = useState(0);

  const startGame = () => {
    // 1. Reset Game State
    const baseBlock = {
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      width: 200,
      depth: 200,
      color: getColor(0)
    };

    setStack([baseBlock]);
    stackRef.current = [baseBlock];
    setDebris([]);
    setScore(0);
    scoreRef.current = 0;

    // Reset Camera
    setCameraZ(0);

    setGameState('playing');
    
    // START LOOP IMMEDIATELY, but flag input as disabled for a moment
    gameActiveRef.current = true;
    
    // Add a small delay before accepting input to prevent the "Start" tap from triggering placement
    setTimeout(() => {
        // We can add a separate ref for 'inputActive' if strictly needed,
        // but for now, just ensure game is active.
        // Actually, to fix the "loop doesn't run" bug, we must ensure loop() can run.
        // loop() checks gameActiveRef. So we set it true above.
    }, 300);

    // 2. Initialize first moving block
    currentRef.current = {
      x: -300,
      y: 0,
      z: 1,
      width: 200,
      depth: 200,
      direction: 'x',
      speed: 4, // Slightly faster start
      moveDir: 1
    };

    // 3. Start Loop
    if (reqRef.current) cancelAnimationFrame(reqRef.current);
    lastTimeRef.current = performance.now();
    loop();
  };

  const loop = () => {
    if (!gameActiveRef.current) return;

    const now = performance.now();
    // Delta time normalized to 60fps (approx 16.67ms)
    // We clamp dt to prevent spirals if the tab is inactive or frame rate drops massively
    let dt = (now - lastTimeRef.current) / 16.666;
    lastTimeRef.current = now;

    if (dt > 3) dt = 1; // Safety: if lag is huge, just step 1 frame to avoid teleporting
    if (dt < 0) dt = 0;

    const curr = currentRef.current;

    // Update Position with Delta Time for smoothness
    // Note: speed is pixels per "60hz frame".
    if (curr.direction === 'x') {
      curr.x += curr.speed * curr.moveDir * dt;
      if (curr.x > 280) {
          curr.x = 280;
          curr.moveDir = -1;
      }
      if (curr.x < -280) {
          curr.x = -280;
          curr.moveDir = 1;
      }
    } else {
      curr.y += curr.speed * curr.moveDir * dt;
      if (curr.y > 280) {
          curr.y = 280;
          curr.moveDir = -1;
      }
      if (curr.y < -280) {
          curr.y = -280;
          curr.moveDir = 1;
      }
    }

    // Direct DOM manipulation for smooth performance
    const movingBlockEl = document.getElementById('moving-block');
    if (movingBlockEl) {
      // Logic:
      // Block center is (x, y).
      // Top-Left corner is (x - width/2, y - depth/2).
      // Z-elevation is z * BLOCK_HEIGHT.
      movingBlockEl.style.transform = `translate3d(${curr.x - curr.width/2}px, ${curr.y - curr.depth/2}px, ${curr.z * BLOCK_HEIGHT}px)`;
    }

    reqRef.current = requestAnimationFrame(loop);
  };

  const handlePlaceBlock = useCallback(() => {
    if (!gameActiveRef.current) return;

    const prevBlock = stackRef.current[stackRef.current.length - 1];
    const curr = currentRef.current;

    let overlap = 0;
    let newWidth = curr.width;
    let newDepth = curr.depth;
    let newX = curr.x;
    let newY = curr.y;

    let debrisX = 0;
    let debrisY = 0;
    let debrisWidth = 0;
    let debrisDepth = 0;

    const TOLERANCE = 5; // Pixel tolerance for "Perfect" drops

    // --- Logic for X axis move ---
    if (curr.direction === 'x') {
      const delta = curr.x - prevBlock.x;

      // Perfect Drop Bonus
      if (Math.abs(delta) < TOLERANCE) {
          newX = prevBlock.x;
          newWidth = prevBlock.width;
          newDepth = prevBlock.depth;
          newY = prevBlock.y;
          // Bonus Score?
      } else {
          const overhang = Math.abs(delta);
          overlap = prevBlock.width - overhang;

          if (overlap <= 0) {
            gameOver();
            return;
          }

          newWidth = overlap;
          newDepth = curr.depth;
          newY = prevBlock.y;

          // Calculate Center and Debris
          if (curr.x > prevBlock.x) {
            // Block is to the RIGHT
            const prevEnd = prevBlock.x + prevBlock.width / 2;
            const currStart = curr.x - curr.width / 2;
            newX = (currStart + prevEnd) / 2;

            debrisWidth = overhang;
            debrisDepth = newDepth;
            debrisX = prevEnd + overhang / 2;
            debrisY = newY;
          } else {
            // Block is to the LEFT
            const prevStart = prevBlock.x - prevBlock.width / 2;
            const currEnd = curr.x + curr.width / 2;
            newX = (prevStart + currEnd) / 2;

            debrisWidth = overhang;
            debrisDepth = newDepth;
            debrisX = prevStart - overhang / 2;
            debrisY = newY;
          }
      }
    }
    // --- Logic for Y (Depth) axis move ---
    else {
      const delta = curr.y - prevBlock.y;

      if (Math.abs(delta) < TOLERANCE) {
          newY = prevBlock.y;
          newWidth = prevBlock.width;
          newDepth = prevBlock.depth;
          newX = prevBlock.x;
      } else {
          const overhang = Math.abs(delta);
          overlap = prevBlock.depth - overhang;

          if (overlap <= 0) {
            gameOver();
            return;
          }

          newWidth = curr.width;
          newDepth = overlap;
          newX = prevBlock.x;

          if (curr.y > prevBlock.y) {
            // Block is "Forward"
            const prevEnd = prevBlock.y + prevBlock.depth / 2;
            const currStart = curr.y - curr.depth / 2;
            newY = (currStart + prevEnd) / 2;

            debrisWidth = newWidth;
            debrisDepth = overhang;
            debrisX = newX;
            debrisY = prevEnd + overhang / 2;
          } else {
            // Block is "Behind"
            const prevStart = prevBlock.y - prevBlock.depth / 2;
            const currEnd = curr.y + curr.depth / 2;
            newY = (prevStart + currEnd) / 2;

            debrisWidth = newWidth;
            debrisDepth = overhang;
            debrisX = newX;
            debrisY = prevStart - overhang / 2;
          }
      }
    }

    // Add Valid Block
    const newBlock = {
      id: stackRef.current.length,
      x: newX,
      y: newY,
      z: stackRef.current.length,
      width: newWidth,
      depth: newDepth,
      color: getColor(stackRef.current.length)
    };

    // Calculate Score
    // Original was Volume / 10000. With 200x200x40 = 1,600,000 => 160 points.
    // User said "score isn't calculated properly" (maybe too high or weird).
    // Let's standardise: 1 point per 100 units of area?
    // Area = 40000. / 100 = 400.
    // Let's reduce it to match original scale better but be clean integers.
    const volume = newWidth * newDepth;
    // User Request: Score divided by 6
    const scoreToAdd = Math.floor((volume / 250) / 3);

    // Add Debris
    if (debrisWidth > 0 && debrisDepth > 0) {
        const newDebris = {
            id: Date.now(),
            x: debrisX,
            y: debrisY,
            z: stackRef.current.length,
            width: debrisWidth,
            depth: debrisDepth,
            color: newBlock.color
        };
        setDebris(prev => [...prev.slice(-5), newDebris]);
    }

    stackRef.current.push(newBlock);
    setStack([...stackRef.current]);

    // Update Score
    scoreRef.current += scoreToAdd;
    setScore(scoreRef.current);

    // Smooth Camera Follow
    // Move camera so the *current top* is near the center?
    // If we want to move "Up" the tower, we translateZ NEGATIVELY (into the screen/down).
    // Yes, translateZ moves the *world*.
    // If block is at Z=100. We want it at Z=0 relative to camera.
    // So translateZ(-100).
    const targetZ = (stackRef.current.length - 2) * BLOCK_HEIGHT;
    // Only start moving after a few blocks
    if (stackRef.current.length > 3) {
      setCameraZ(targetZ);
    }

    // Setup Next Block
    const nextDir = curr.direction === 'x' ? 'y' : 'x';
    const nextSpeed = Math.min(curr.speed + 0.15, 12);

    currentRef.current = {
      x: nextDir === 'x' ? -300 : newX,
      y: nextDir === 'y' ? -300 : newY,
      z: stackRef.current.length,
      width: newWidth,
      depth: newDepth,
      direction: nextDir,
      speed: nextSpeed,
      moveDir: 1
    };

  }, []);

  const gameOver = () => {
    setGameState('gameover');
    gameActiveRef.current = false;
    if (reqRef.current) cancelAnimationFrame(reqRef.current);
    if (onGameOver) onGameOver(scoreRef.current);
  };

useEffect(() => {
    const handleInput = (e) => {
        // 1. Handle Spacebar (Desktop)
        if (e.type === 'keydown' && e.code === 'Space') {
             e.preventDefault(); 
             if (gameActiveRef.current) {
                 handlePlaceBlock();
             }
        }
        
        // 2. Handle Touch (Mobile)
        if (e.type === 'touchstart') {
             // FIX: If the user tapped a button (Start, Exit, Try Again), 
             // let the browser handle it normally (don't preventDefault).
             if (e.target.closest('button')) {
                 return; 
             }

             // Otherwise, it's a game tap: stop scrolling and place block
             e.preventDefault();
             if (gameActiveRef.current) {
                 handlePlaceBlock();
             }
        }
    };

    window.addEventListener('keydown', handleInput);
    window.addEventListener('touchstart', handleInput, { passive: false });

    return () => {
        window.removeEventListener('keydown', handleInput);
        window.removeEventListener('touchstart', handleInput);
        cancelAnimationFrame(reqRef.current);
        gameActiveRef.current = false;
    };
  }, [handlePlaceBlock]);
  return (
    <div 
        className="relative w-full h-full bg-zinc-100 overflow-hidden flex flex-col items-center justify-center select-none cursor-pointer"
        style={{ touchAction: 'none' }}
    >

      {/* UI Overlay - Positioned Relative to this container, ensuring fit */}
      <div className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-6 md:p-10">

        {/* Top Bar */}
        <div className="flex justify-between items-start w-full pointer-events-auto">
            <div className="flex flex-col drop-shadow-sm">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Score</span>
                <span className="text-4xl md:text-5xl font-black text-zinc-800 leading-none">{score.toLocaleString()}</span>
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); onExit(); }}
                className="p-3 bg-white hover:bg-zinc-100 text-zinc-800 rounded-full shadow-md transition-all z-50"
                title="Exit Game"
            >
                <X size={24} />
            </button>
        </div>

        {/* Start Screen */}
        {gameState === 'start' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-white/30 backdrop-blur-[2px] z-40 animate-in fade-in duration-500">
                <div className="text-center mb-8">
                     <Layers size={64} className="text-indigo-600 mx-auto mb-4 drop-shadow-md" />
                     <h1 className="text-5xl md:text-6xl font-black text-zinc-900 mb-2 tracking-tight drop-shadow-sm">Stacker 3D</h1>
                     <p className="text-zinc-600 font-medium text-lg">Stack max volume to win</p>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); startGame(); }}
                    className="flex items-center gap-3 px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold text-xl hover:scale-105 hover:bg-zinc-800 transition-all shadow-xl animate-bounce"
                >
                    <Play size={24} className="fill-current" />
                    Start Game
                </button>
            </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'gameover' && (
             <div className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto z-50 animate-in fade-in zoom-in-95 duration-300">
                <Trophy size={64} className="text-amber-500 mb-4 drop-shadow-lg" />
                <h2 className="text-4xl font-black text-zinc-900 mb-2">Game Over</h2>
                <div className="bg-white px-8 py-4 rounded-2xl shadow-sm border border-zinc-100 mb-8 text-center">
                    <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">Final Score</p>
                    <p className="text-4xl font-black text-zinc-800">{score.toLocaleString()}</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={(e) => { e.stopPropagation(); onExit(); }}
                        className="px-6 py-3 bg-zinc-200 text-zinc-700 rounded-xl font-bold hover:bg-zinc-300 transition-colors"
                    >
                        Exit
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); startGame(); }}
                        className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-700 transition-colors shadow-lg"
                    >
                        <RotateCcw size={18} />
                        Try Again
                    </button>
                </div>
            </div>
        )}

        {/* Footer Hint */}
        {gameState === 'playing' && (
             <div className="w-full text-center pointer-events-none mt-auto">
                 <p className="text-zinc-400 text-sm font-medium animate-pulse drop-shadow-sm">
                    Tap or Space to Place
                 </p>
             </div>
        )}
      </div>

      {/* 3D Scene Container */}
      {/* Scaled down slightly to ensure fits on all screens */}
      <div className="relative w-full h-full flex items-center justify-center perspective-[1000px] overflow-visible">
        <div className="scale-[0.5] md:scale-[0.8] lg:scale-100 transition-transform duration-500">
            {/* World with Smooth Scroll Logic */}
            <div
                className="isometric-scene relative w-0 h-0 transition-transform duration-500 ease-out"
                style={{
                    /* Note: translateZ moves the world "down" as we stack "up" */
                    /* RotateX 60deg looks better for top-down isometric */
                    transform: `rotateX(60deg) rotateZ(45deg) translateZ(-${cameraZ}px)`
                }}
            >
                {/* Initial Base - Rendered slightly differently to look like a floor */}
                <div
                    className="cube"
                    style={{
                        width: '300px',
                        height: '300px',
                        transform: `translate3d(-150px, -150px, -${BLOCK_HEIGHT}px)`,
                        color: '#e4e4e7' // zinc-200
                    }}
                >
                    <div className="cube-face cube-top"></div>
                    <div className="cube-face cube-south"></div>
                    <div className="cube-face cube-east"></div>
                </div>

                {/* Static Stack */}
                {stack.map(block => (
                    <div
                        key={block.id}
                        className="cube transition-all duration-300"
                        style={{
                            width: `${block.width}px`,
                            height: `${block.depth}px`,
                            transform: `translate3d(${block.x - block.width/2}px, ${block.y - block.depth/2}px, ${block.z * BLOCK_HEIGHT}px)`,
                            color: block.color
                        }}
                    >
                        <div className="cube-face cube-top"></div>
                        <div className="cube-face cube-south"></div>
                        <div className="cube-face cube-east"></div>
                    </div>
                ))}

                {/* Debris */}
                {debris.map(d => (
                     <div
                        key={d.id}
                        className="cube falling-animation"
                        style={{
                            width: `${d.width}px`,
                            height: `${d.depth}px`,
                            // CSS Variables for fall animation
                            // @ts-ignore
                            '--tx': `${d.x - d.width/2}px`,
                            '--ty': `${d.y - d.depth/2}px`,
                            '--tz': `${d.z * BLOCK_HEIGHT}px`,
                            color: d.color
                        }}
                    >
                        <div className="cube-face cube-top"></div>
                        <div className="cube-face cube-south"></div>
                        <div className="cube-face cube-east"></div>
                    </div>
                ))}

                {/* Current Moving Block */}
                {gameState === 'playing' && (
                    <div
                        id="moving-block"
                        className="cube"
                        style={{
                            width: `${currentRef.current.width}px`,
                            height: `${currentRef.current.depth}px`,
                            transform: `translate3d(${currentRef.current.x - currentRef.current.width/2}px, ${currentRef.current.y - currentRef.current.depth/2}px, ${currentRef.current.z * BLOCK_HEIGHT}px)`,
                            color: getColor(stack.length)
                        }}
                    >
                        <div className="cube-face cube-top"></div>
                        <div className="cube-face cube-south"></div>
                        <div className="cube-face cube-east"></div>
                    </div>
                )}

            </div>
        </div>
      </div>

    </div>
  );
};

export default StackGame;
