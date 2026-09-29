import React, { useState, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { X, RefreshCw, ArrowUp } from 'lucide-react';

const GlassAscentGame = ({ onExit, onGameOver }) => {
    const canvasRef = useRef(null);
    const [score, setScore] = useState(0);
    const [bestScore, setBestScore] = useState(0); // Should be passed in or managed via props ideally, but local for now or props if available
    const [gameState, setGameState] = useState('playing'); // playing, gameover
    const [finalScore, setFinalScore] = useState(0);

    // Refs for game state to avoid closure staleness in loop
    const engineRef = useRef(null);
    const renderRef = useRef(null);
    const runnerRef = useRef(null);
    const loopRef = useRef(null);

    // Game Logic Refs
    const stateRef = useRef({
        active: false,
        score: 0,
        highScore: 0,
        cameraY: 0,
        lavaY: 0,
        lavaSpeed: 0,
        highestY: 0,
        baseAltitude: 0,
        keys: { left: false, right: false, jump: false, jumpPressed: false, jumpHeld: false, jumpHoldStart: 0 },
        particles: []
    });

    const playerRef = useRef({
        body: null,
        isGrounded: false,
        wasGrounded: false,
        facing: 1,
        energy: 40,
        trail: [],
        airborneFrames: 0,
        state: 'IDLE',
        stateTime: 0,
        scaleX: 1, scaleY: 1,
        targetScaleX: 1, targetScaleY: 1,
        legPhase: 0, landingTimer: 0,
        currentLean: 0,
        currentLeftLegX: -5, currentLeftLegY: 22,
        currentRightLegX: 5, currentRightLegY: 22,
        currentArmX: 5, currentArmY: 8,
        currentHeadBob: 0
    });

    const C = {
        GRAVITY: 0.8,
        MOVE_SPEED: 6,
        JUMP_FORCE: 20,
        AIR_JUMP_FORCE: 15,
        ENERGY: { MAX: 40, COST: 10, REGEN: 4.0, HOLD_JUMP_COST: .75 },
        PLAYER: { w: 26, h: 50 },
        LAVA: { baseSpeed: 0.6, maxSpeed: 8, buffer: 400, catchUp: 0.010, altitudeFactor: 0.0001 },
        GEN: { chunkH: 600, minGap: 100, maxGap: 200 },
        COLORS: {
            BG: 'transparent',
            PLAT_STATIC_FILL: 'rgba(79, 70, 229, 0.1)',
            PLAT_STATIC_STROKE: '#4f46e5',
            PLAT_MOVE_FILL: 'rgba(219, 39, 119, 0.1)',
            PLAT_MOVE_STROKE: '#db2777',
            HERO_BODY: '#1e293b',
            HERO_CAPE: '#6366f1',
            ENERGY_FULL: '#06b6d4',
            ENERGY_LOW: '#ef4444',
            LAVA_TOP: '#f43f5e',
            LAVA_BOT: '#881337'
        }
    };

    // Sound System
    const soundRef = useRef({
        ctx: null,
        enabled: true,
        init() {
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                this.enabled = false;
            }
        },
        play(type) {
            if (!this.enabled || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            switch (type) {
                case 'jump':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(280, now);
                    osc.frequency.exponentialRampToValueAtTime(560, now + 0.1);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                    break;
                case 'doubleJump':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
                    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.12);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                    break;
                case 'land':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
                case 'die':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                    osc.start(now);
                    osc.stop(now + 0.5);
                    break;
                default: break;
            }
        }
    });

    useEffect(() => {
        soundRef.current.init();

        // Matter.js Aliases
        const Engine = Matter.Engine,
            Render = Matter.Render,
            Runner = Matter.Runner,
            Bodies = Matter.Bodies,
            Body = Matter.Body,
            Composite = Matter.Composite,
            Events = Matter.Events,
            Query = Matter.Query;

        // Init Engine
        const engine = Engine.create();
        engine.world.gravity.y = C.GRAVITY;
        engineRef.current = engine;

        // Init Render
        const render = Render.create({
            element: canvasRef.current,
            engine: engine,
            options: {
                width: window.innerWidth,
                height: window.innerHeight,
                wireframes: false,
                background: 'transparent',
                pixelRatio: window.devicePixelRatio
            }
        });
        renderRef.current = render;

        // Helper Functions
        const createParticles = (x, y, count, color) => {
            for (let i = 0; i < count; i++) {
                stateRef.current.particles.push({
                    x, y, color,
                    vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
                    life: 1.0
                });
            }
        };

        const drawParticles = (ctx) => {
            for (let i = stateRef.current.particles.length - 1; i >= 0; i--) {
                const p = stateRef.current.particles[i];
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                if (p.life <= 0) { stateRef.current.particles.splice(i, 1); continue; }
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y + stateRef.current.cameraY, 3, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        };

        const CyberShaft = {
            vanishY: -500,
            gridSpacing: 100,
            draw(ctx, camY) {
                const w = window.innerWidth;
                const h = window.innerHeight;
                const centerX = w / 2;

                ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                const rails = 12;
                for (let i = -rails / 2; i <= rails / 2; i++) {
                    const bottomX = centerX + (i * (w / 4));
                    ctx.moveTo(centerX, this.vanishY);
                    ctx.lineTo(bottomX, h + 100);
                }
                ctx.stroke();

                ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                const modY = camY % this.gridSpacing;
                for (let i = 0; i < 20; i++) {
                    let screenY = (i * this.gridSpacing) + modY;
                    let progress = (screenY + 200) / (h + 200);
                    if (progress < 0) progress = 0;
                    if (progress > 1) progress = 1;
                    let curvedY = (progress * progress) * (h - 100) + 100;
                    ctx.globalAlpha = (1 - progress) * 0.4;
                    const widthAtY = w * (0.2 + (progress * 0.8));
                    const startX = centerX - (widthAtY / 2);
                    const endX = centerX + (widthAtY / 2);
                    ctx.moveTo(startX, curvedY);
                    ctx.lineTo(endX, curvedY);
                }
                ctx.stroke();
                ctx.globalAlpha = 1.0;

                const grad = ctx.createRadialGradient(centerX, 0, 0, centerX, 0, 500);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h / 2);
            }
        };

        const PlayerLogic = {
            create(x, y) {
                const group = Body.nextGroup(true);
                const p = playerRef.current;
                p.body = Bodies.rectangle(x, y, C.PLAYER.w, C.PLAYER.h, {
                    collisionFilter: { group: group },
                    inertia: Infinity, friction: 0, frictionAir: 0.02, restitution: 0,
                    chamfer: { radius: 12 }, render: { visible: false }, label: 'player'
                });
                Composite.add(engine.world, p.body);
                this.resetAnimState();
            },
            resetAnimState() {
                const p = playerRef.current;
                p.state = 'IDLE'; p.stateTime = 0; p.scaleX = 1; p.scaleY = 1;
                p.targetScaleX = 1; p.targetScaleY = 1; p.legPhase = 0; p.landingTimer = 0;
                p.currentLean = 0; p.currentLeftLegX = -5; p.currentLeftLegY = 22;
                p.currentRightLegX = 5; p.currentRightLegY = 22;
                p.currentArmX = 5; p.currentArmY = 8; p.currentHeadBob = 0;
            },
            update() {
                if (!stateRef.current.active) return;
                const p = playerRef.current;
                const vel = p.body.velocity;
                const pos = p.body.position;
                p.wasGrounded = p.isGrounded;

                const sensorMin = { x: pos.x - 12, y: pos.y + C.PLAYER.h / 2 - 2 };
                const sensorMax = { x: pos.x + 12, y: pos.y + C.PLAYER.h / 2 + 8 };
                const platforms = Composite.allBodies(engine.world).filter(b => b.label === 'platform' || b.label === 'moving' || b.label === 'breakable');
                const collisions = Query.region(platforms, { min: sensorMin, max: sensorMax });

                p.isGrounded = collisions.length > 0 && vel.y >= -1;

                if (p.isGrounded && !p.wasGrounded) {
                    this.onLand();
                }

                if (p.isGrounded) {
                    p.airborneFrames = 0;
                    p.energy = Math.min(p.energy + C.ENERGY.REGEN, C.ENERGY.MAX);
                    collisions.forEach(c => {
                        if (c.label === 'breakable') {
                            Composite.remove(engine.world, c);
                            createParticles(c.position.x, c.position.y, 10, C.COLORS.PLAT_STATIC_STROKE);
                        }
                    });
                } else {
                    p.airborneFrames++;
                }

                let targetX = 0;
                if (stateRef.current.keys.left) { targetX = -C.MOVE_SPEED; p.facing = -1; }
                if (stateRef.current.keys.right) { targetX = C.MOVE_SPEED; p.facing = 1; }

                const lerp = p.isGrounded ? 0.2 : 0.08;
                Body.setVelocity(p.body, { x: vel.x + (targetX - vel.x) * lerp, y: vel.y });
                if (vel.y > 18) Body.setVelocity(p.body, { x: vel.x, y: 18 });

                if (Math.abs(vel.x) > 0.5 || p.airborneFrames > 3) {
                    p.trail.unshift({ x: pos.x - (p.facing * 5), y: pos.y - 15 });
                }
                if (p.trail.length > 12) p.trail.pop();

                this.updateAnimState(vel);
            },
            updateAnimState(vel) {
                const p = playerRef.current;
                const prevState = p.state;
                if (p.isGrounded) {
                    p.state = Math.abs(vel.x) > 0.5 ? 'RUN' : 'IDLE';
                } else {
                    p.state = vel.y < -2 ? 'JUMP' : 'FALL';
                }
                if (p.state !== prevState) p.stateTime = 0;
                p.stateTime++;
                p.scaleX += (p.targetScaleX - p.scaleX) * 0.15;
                p.scaleY += (p.targetScaleY - p.scaleY) * 0.15;
                p.targetScaleX += (1 - p.targetScaleX) * 0.08;
                p.targetScaleY += (1 - p.targetScaleY) * 0.08;
                if (p.landingTimer > 0) p.landingTimer--;
            },
            onLand() {
                const p = playerRef.current;
                p.targetScaleX = 1.3; p.targetScaleY = 0.7; p.landingTimer = 15; p.legPhase = 0;
                createParticles(p.body.position.x, p.body.position.y + C.PLAYER.h / 2, 6, '#94a3b8');
                soundRef.current.play('land');
            },
            jump() {
                const p = playerRef.current;
                if (p.isGrounded) {
                    Body.setVelocity(p.body, { x: p.body.velocity.x, y: -C.JUMP_FORCE });
                    p.targetScaleX = 0.7; p.targetScaleY = 1.4;
                    createParticles(p.body.position.x, p.body.position.y + C.PLAYER.h / 2, 8, '#94a3b8');
                    soundRef.current.play('jump');
                } else if (p.energy >= C.ENERGY.COST) {
                    Body.setVelocity(p.body, { x: p.body.velocity.x, y: -C.AIR_JUMP_FORCE });
                    p.energy -= C.ENERGY.COST;
                    p.targetScaleX = 0.8; p.targetScaleY = 1.3;
                    createParticles(p.body.position.x, p.body.position.y + C.PLAYER.h / 2, 5, C.COLORS.ENERGY_FULL);
                    soundRef.current.play('doubleJump');
                }
            },
            draw(ctx) {
                const p = playerRef.current;
                const pos = p.body.position;
                const x = pos.x;
                const y = pos.y + stateRef.current.cameraY;
                const vel = p.body.velocity;
                const t = Date.now() / 1000;

                let targetLean = 0;
                if (p.state === 'RUN') targetLean = vel.x * 0.04;
                else if (p.state === 'JUMP') targetLean = vel.x * 0.03 + p.facing * 0.2;
                else if (p.state === 'FALL') targetLean = vel.x * 0.02 - p.facing * 0.08;
                p.currentLean += (targetLean - p.currentLean) * 0.12;

                ctx.beginPath();
                ctx.moveTo(x - (p.facing * 5), y - 10);
                if (p.trail.length > 3) {
                    const p1 = p.trail[Math.floor(p.trail.length * 0.33)];
                    const p2 = p.trail[Math.floor(p.trail.length * 0.66)];
                    const end = p.trail[p.trail.length - 1];
                    ctx.bezierCurveTo(p1.x, p1.y + stateRef.current.cameraY, p2.x, p2.y + stateRef.current.cameraY, end.x, end.y + stateRef.current.cameraY);
                } else {
                    ctx.quadraticCurveTo(x - p.facing * 15, y + 5, x - (p.facing * 25), y + 15 + Math.sin(t * 3) * 3);
                }
                const capeGrad = ctx.createLinearGradient(x, y - 10, x - p.facing * 20, y + 20);
                capeGrad.addColorStop(0, C.COLORS.HERO_CAPE);
                capeGrad.addColorStop(1, '#818cf8');
                ctx.strokeStyle = capeGrad;
                ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(p.currentLean);
                ctx.scale(p.scaleX, p.scaleY);
                ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;

                ctx.fillStyle = C.COLORS.HERO_BODY;
                ctx.beginPath(); ctx.moveTo(-11, -16); ctx.lineTo(11, -16); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill();

                ctx.strokeStyle = C.COLORS.HERO_BODY; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
                let tlX, tlY, trX, trY;
                if (p.state === 'RUN') {
                    p.legPhase += 0.25;
                    const swing = Math.sin(p.legPhase) * 12;
                    tlX = -5 + swing; tlY = 22 - Math.abs(swing) * 0.3;
                    trX = 5 - swing; trY = 22 - Math.abs(swing) * 0.3;
                } else if (p.state === 'JUMP') {
                    const tuck = Math.min(p.stateTime * 0.15, 1);
                    tlX = -10 - tuck * 3; tlY = 14 + tuck * 4; trX = 10 + tuck * 3; trY = 14 + tuck * 4;
                } else if (p.state === 'FALL') {
                    const extend = Math.min(p.stateTime * 0.1, 1);
                    tlX = -4 - extend * 2; tlY = 20 + extend * 8; trX = 4 + extend * 2; trY = 20 + extend * 8;
                } else {
                    p.legPhase *= 0.9; tlX = -5; tlY = 22; trX = 5; trY = 22;
                }
                p.currentLeftLegX += (tlX - p.currentLeftLegX) * 0.15; p.currentLeftLegY += (tlY - p.currentLeftLegY) * 0.15;
                p.currentRightLegX += (trX - p.currentRightLegX) * 0.15; p.currentRightLegY += (trY - p.currentRightLegY) * 0.15;
                ctx.moveTo(-4, 6); ctx.lineTo(p.currentLeftLegX, p.currentLeftLegY);
                ctx.moveTo(4, 6); ctx.lineTo(p.currentRightLegX, p.currentRightLegY);
                ctx.stroke();

                let thb = 0;
                if (p.state === 'RUN') thb = Math.sin(p.legPhase * 2) * 1.5;
                else if (p.state === 'IDLE') thb = Math.sin(t * 2) * 0.5;
                else if (p.state === 'JUMP') thb = -2;
                else if (p.state === 'FALL') thb = 1.5;
                p.currentHeadBob += (thb - p.currentHeadBob) * 0.12;

                ctx.fillStyle = C.COLORS.HERO_BODY; ctx.beginPath(); ctx.arc(0, -21 + p.currentHeadBob, 10, 0, Math.PI * 2); ctx.fill();

                ctx.fillStyle = C.COLORS.ENERGY_FULL; ctx.shadowBlur = 8; ctx.shadowColor = C.COLORS.ENERGY_FULL;
                let ew = 8, eh = 3, ey = -23 + p.currentHeadBob;
                if (p.state === 'FALL') { eh = 4; ew = 9; } else if (p.state === 'JUMP') { eh = 2.5; }
                ctx.beginPath(); ctx.roundRect(p.facing === 1 ? -1 : -ew + 1, ey, ew, eh, 2); ctx.fill(); ctx.shadowBlur = 0;

                ctx.strokeStyle = C.COLORS.HERO_BODY; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 4;
                let taX, taY;
                if (p.state === 'JUMP') { taX = p.facing * 20; taY = -28; }
                else if (p.state === 'FALL') { taX = p.facing * 12 + Math.sin(t * 6) * 4; taY = -2 + Math.sin(t * 5) * 3; }
                else if (p.state === 'RUN') { const as = Math.sin(p.legPhase + Math.PI) * 8; taX = p.facing * 6 + as; taY = 5 - Math.abs(as) * 0.3; }
                else { taX = p.facing * 5; taY = 8 + Math.sin(t * 1.5) * 1; }
                p.currentArmX += (taX - p.currentArmX) * 0.15; p.currentArmY += (taY - p.currentArmY) * 0.15;
                ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(p.currentArmX, p.currentArmY); ctx.stroke();
                ctx.restore();

                const pct = p.energy / C.ENERGY.MAX;
                const rCol = pct > 0.3 ? C.COLORS.ENERGY_FULL : C.COLORS.ENERGY_LOW;
                const rY = y - 45;
                ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 3; ctx.arc(x, rY, 16, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.strokeStyle = rCol; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowColor = rCol; ctx.shadowBlur = pct > 0.3 ? 8 : 4;
                ctx.arc(x, rY, 16, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * pct)); ctx.stroke(); ctx.shadowBlur = 0;
            }
        };

        const LevelGen = {
            init() {
                stateRef.current.highestY = window.innerHeight;
                this.addPlatform(window.innerWidth / 2, window.innerHeight - 10, window.innerWidth, 40, 'platform', C.COLORS.PLAT_STATIC_FILL, C.COLORS.PLAT_STATIC_STROKE);
                this.genChunk(window.innerHeight - C.GEN.chunkH);
            },
            update() {
                if (playerRef.current.body.position.y < stateRef.current.highestY + C.GEN.chunkH * 1.5) {
                    this.genChunk(stateRef.current.highestY - C.GEN.chunkH);
                }
                Composite.allBodies(engine.world).forEach(b => {
                    if ((b.label === 'platform' || b.label === 'moving' || b.label === 'breakable') && b.position.y > stateRef.current.lavaY + 400) {
                        Composite.remove(engine.world, b);
                    }
                });
            },
            genChunk(targetY) {
                let y = stateRef.current.highestY;
                const w = window.innerWidth;
                const types = [
                    { t: 'platform', f: C.COLORS.PLAT_STATIC_FILL, s: C.COLORS.PLAT_STATIC_STROKE },
                    { t: 'moving', f: C.COLORS.PLAT_MOVE_FILL, s: C.COLORS.PLAT_MOVE_STROKE },
                    { t: 'breakable', f: C.COLORS.PLAT_STATIC_FILL, s: C.COLORS.PLAT_STATIC_STROKE }
                ];
                y -= (C.GEN.minGap + Math.random() * (C.GEN.maxGap - C.GEN.minGap));
                while (y > targetY) {
                    const pW = 80 + Math.random() * 120;
                    const pX = Math.random() * (w - pW - 40) + pW / 2 + 20;
                    const roll = Math.random();
                    let tc;
                    if (roll < 0.60) tc = types[0]; else if (roll < 0.85) tc = types[1]; else tc = types[2];
                    this.addPlatform(pX, y, pW, 20, tc.t, tc.f, tc.s);
                    y -= (C.GEN.minGap + Math.random() * (C.GEN.maxGap - C.GEN.minGap));
                }
                stateRef.current.highestY = targetY;
            },
            addPlatform(x, y, w, h, label, fill, stroke) {
                const p = Bodies.rectangle(x, y, w, h, {
                    isStatic: true, friction: 1, chamfer: { radius: 6 },
                    render: { fill: fill, stroke: stroke, lineWidth: 2, visible: false },
                    label: label
                });
                p.w = w; p.h = h;
                if (label === 'moving') {
                    p.startX = x; p.speed = 1 + Math.random() * 2; p.range = 50 + Math.random() * 80; p.offset = Math.random() * 100;
                }
                Composite.add(engine.world, p);
            }
        };

        const initGame = () => {
            Composite.clear(engine.world);
            Engine.clear(engine);
            engine.world.gravity.y = C.GRAVITY;

            stateRef.current.active = true;
            stateRef.current.score = 0;
            stateRef.current.cameraY = 0;
            stateRef.current.lavaY = window.innerHeight + 200;
            stateRef.current.lavaSpeed = C.LAVA.baseSpeed;
            stateRef.current.particles = [];
            stateRef.current.highestY = window.innerHeight;
            stateRef.current.baseAltitude = window.innerHeight;

            playerRef.current.energy = C.ENERGY.MAX;
            playerRef.current.trail = [];
            playerRef.current.airborneFrames = 0;

            stateRef.current.keys = { left: false, right: false, jump: false, jumpPressed: false, jumpHeld: false };

            setGameState('playing');
            setScore(0);

            PlayerLogic.create(window.innerWidth / 2, window.innerHeight - 100);
            LevelGen.init();
        };

        const die = () => {
            stateRef.current.active = false;
            createParticles(playerRef.current.body.position.x, playerRef.current.body.position.y, 50, C.COLORS.LAVA_TOP);
            Composite.remove(engine.world, playerRef.current.body);
            soundRef.current.play('die');

            setFinalScore(stateRef.current.score);
            if (stateRef.current.score > bestScore) {
                setBestScore(stateRef.current.score);
            }
            setGameState('gameover');
            if(onGameOver) onGameOver(stateRef.current.score);
        };

        // Assign helper methods to stateRef for access from UI
        stateRef.current.jumpAction = () => {
            if (stateRef.current.active) {
                PlayerLogic.jump();
                stateRef.current.keys.jumpPressed = true;
                stateRef.current.keys.jumpHeld = true;
            }
        };
        stateRef.current.resetGame = initGame;

        // Render Loop
        Events.on(render, 'afterRender', () => {
            const ctx = render.context;
            const cam = stateRef.current.cameraY;

            CyberShaft.draw(ctx, cam);
            drawParticles(ctx);

            Composite.allBodies(engine.world).forEach(b => {
                if (b.label === 'platform' || b.label === 'moving' || b.label === 'breakable') {
                    const x = b.position.x - b.w / 2;
                    const y = b.position.y - b.h / 2 + cam;
                    if (y > window.innerHeight || y + b.h < 0) return;

                    const fill = b.render.fill || C.COLORS.PLAT_STATIC_FILL;
                    const stroke = b.render.stroke || C.COLORS.PLAT_STATIC_STROKE;
                    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.roundRect(x, y, b.w, b.h, 4); ctx.fill();
                    ctx.shadowColor = stroke; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.moveTo(x, y + b.h); ctx.lineTo(x + b.w, y); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
                }
            });

            if (stateRef.current.active) PlayerLogic.draw(ctx);

            const ly = stateRef.current.lavaY + cam;
            if (ly < window.innerHeight) {
                const grad = ctx.createLinearGradient(0, ly, 0, ly + 300);
                grad.addColorStop(0, C.COLORS.LAVA_TOP);
                grad.addColorStop(1, C.COLORS.LAVA_BOT);
                ctx.fillStyle = grad;
                ctx.beginPath();
                const t = Date.now() / 200;
                ctx.moveTo(0, ly);
                for (let i = 0; i <= window.innerWidth; i += 20) ctx.lineTo(i, ly + Math.sin(i * 0.03 + t) * 15);
                ctx.lineTo(window.innerWidth, window.innerHeight); ctx.lineTo(0, window.innerHeight); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
                for (let i = 0; i <= window.innerWidth; i += 20) ctx.lineTo(i, ly + Math.sin(i * 0.03 + t) * 15);
                ctx.stroke();
            }
        });

        // Game Loop
        const updateGame = () => {
            if (!stateRef.current.active) return;
            PlayerLogic.update();
            LevelGen.update();

            const time = Date.now() / 1000;
            Composite.allBodies(engine.world).forEach(b => {
                if (b.label === 'moving') {
                    const dx = Math.sin(time * b.speed + b.offset) * b.range;
                    Body.setPosition(b, { x: b.startX + dx, y: b.position.y });
                }
            });

            const pY = playerRef.current.body.position.y;
            const dist = stateRef.current.lavaY - pY;
            let targetSpeed = C.LAVA.baseSpeed;
            if (dist > C.LAVA.buffer) targetSpeed += (dist - C.LAVA.buffer) * C.LAVA.catchUp;
            const ascended = Math.max(0, stateRef.current.baseAltitude - pY);
            targetSpeed += ascended * C.LAVA.altitudeFactor;
            if (targetSpeed > C.LAVA.maxSpeed) targetSpeed = C.LAVA.maxSpeed;
            stateRef.current.lavaSpeed += (targetSpeed - stateRef.current.lavaSpeed) * 0.05;
            stateRef.current.lavaY -= stateRef.current.lavaSpeed;

            if (pY > stateRef.current.lavaY - 15) die();

            const targetCam = -pY + window.innerHeight * 0.6;
            stateRef.current.cameraY += (targetCam - stateRef.current.cameraY) * 0.1;

            const alt = Math.floor((window.innerHeight - pY) / 20);
            if (alt > stateRef.current.score) {
                stateRef.current.score = alt;
                setScore(alt);
            }
        };

        // Start Loop
        runnerRef.current = Runner.create();
        Runner.run(runnerRef.current, engine);
        Render.run(render);

        const loop = () => {
            updateGame();
            loopRef.current = requestAnimationFrame(loop);
        };
        loop();
        initGame();

        // Input Handling
        const jumpAction = () => {
            if (stateRef.current.active) {
                PlayerLogic.jump();
                stateRef.current.keys.jumpPressed = true;
                stateRef.current.keys.jumpHeld = true;
            }
        };

        const handleKeyDown = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') stateRef.current.keys.left = true;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') stateRef.current.keys.right = true;
            if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') {
                if (!stateRef.current.keys.jumpPressed) jumpAction();
                stateRef.current.keys.jumpHeld = true;
            }
        };
        const handleKeyUp = (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') stateRef.current.keys.left = false;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') stateRef.current.keys.right = false;
            if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') {
                stateRef.current.keys.jumpPressed = false;
                stateRef.current.keys.jumpHeld = false;
            }
        };
        const handleResize = () => {
            render.canvas.width = window.innerWidth;
            render.canvas.height = window.innerHeight;
            render.options.width = window.innerWidth;
            render.options.height = window.innerHeight;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(loopRef.current);
            Runner.stop(runnerRef.current);
            Render.stop(render);
            Composite.clear(engine.world);
            Engine.clear(engine);
            if (render.canvas) render.canvas.remove();
        };
    }, []);

    // Clean, direct handlers are used inline in the JSX below via stateRef.

    return (
        <div className="relative w-full h-full bg-zinc-900 overflow-hidden font-sans select-none">
            {/* Background Gradient & Noise */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 opacity-100" />
            <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")`
            }} />

            <div ref={canvasRef} className="absolute inset-0 z-10" />

            {/* HUD */}
            <div className="absolute top-6 left-6 z-20 bg-white/40 backdrop-blur-md border border-white/60 shadow-sm rounded-2xl px-6 py-3 flex flex-col">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Altitude</span>
                <span className="text-3xl font-black text-slate-800 leading-none">{score}m</span>
            </div>

            {/* Close Button */}
             <button
                onClick={(e) => { e.stopPropagation(); onExit(); }}
                className="absolute top-6 right-6 z-50 p-3 bg-white hover:bg-zinc-100 text-zinc-800 rounded-full shadow-md transition-all"
            >
                <X size={24} />
            </button>

            {/* Mobile Controls */}
            <div className="absolute bottom-8 left-0 w-full px-8 flex justify-between items-end z-30 pointer-events-none md:hidden">
                <div className="flex gap-4 pointer-events-auto">
                    <button
                        onTouchStart={(e) => { e.preventDefault(); stateRef.current.keys.left = true; }}
                        onTouchEnd={(e) => { e.preventDefault(); stateRef.current.keys.left = false; }}
                        className="w-16 h-16 rounded-full bg-white/50 backdrop-blur border border-white/80 shadow-sm flex items-center justify-center text-indigo-600 font-bold text-2xl active:bg-indigo-600 active:text-white transition-all"
                    >
                        ←
                    </button>
                    <button
                        onTouchStart={(e) => { e.preventDefault(); stateRef.current.keys.right = true; }}
                        onTouchEnd={(e) => { e.preventDefault(); stateRef.current.keys.right = false; }}
                        className="w-16 h-16 rounded-full bg-white/50 backdrop-blur border border-white/80 shadow-sm flex items-center justify-center text-indigo-600 font-bold text-2xl active:bg-indigo-600 active:text-white transition-all"
                    >
                        →
                    </button>
                </div>
                <button
                    onTouchStart={(e) => { e.preventDefault(); stateRef.current.jumpAction?.(); }}
                    onTouchEnd={(e) => {
                        e.preventDefault();
                        stateRef.current.keys.jumpPressed = false;
                        stateRef.current.keys.jumpHeld = false;
                    }}
                    className="w-24 h-24 rounded-3xl bg-indigo-600/90 text-white shadow-lg backdrop-blur flex flex-col items-center justify-center pointer-events-auto active:scale-95 transition-transform"
                >
                    <ArrowUp size={32} strokeWidth={3} />
                    <span className="text-xs font-bold uppercase tracking-widest mt-1">Ascend</span>
                </button>
            </div>

            {/* Game Over Screen */}
            {gameState === 'gameover' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="text-center">
                        <h1 className="text-6xl md:text-8xl font-black text-indigo-600 uppercase tracking-tighter mb-2 drop-shadow-sm">Terminated</h1>
                        <p className="text-2xl text-slate-600 font-bold mb-8">Max Height: {finalScore}m</p>

                        <div className="flex justify-center gap-4">
                            <button
                                onClick={onExit}
                                className="px-8 py-4 bg-slate-200 text-slate-700 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-300 transition-colors"
                            >
                                Exit
                            </button>
                            <button
                                onClick={() => {
                                    // Trigger reset
                                    stateRef.current.resetGame?.();
                                }}
                                className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center gap-2"
                            >
                                <RefreshCw size={20} /> Reboot System
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlassAscentGame;
