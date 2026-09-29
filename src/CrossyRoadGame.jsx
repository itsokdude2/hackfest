import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { X, RotateCcw, Play } from 'lucide-react';

/**
 * CONFIGURATION
 */
const C = {
    TILE: 15,
    WORLD_W: 1200,
    GAME_W: 340,
    HOP_SPEED: 0.12,     
    MOVE_COOLDOWN: 0.18, 
    SCALE: 0.75,
    MAX_LANES: 40, // Reduced from 55 for performance
    // Camera Settings
    ZOOM_DESKTOP: 55,
    ZOOM_MOBILE: 85, 
    COLORS: {
        SKY: 0xc2e9fb,
        GRASS_1: 0x4caf50,
        GRASS_2: 0x66bb6a,
        TUFT: 0x81c784,
        ROAD: 0x455a64,
        WATER: 0x4fc3f7,
        RAIL: 0x795548,
        CHICKEN: 0xffffff,
        LOG: 0x8d6e63,
        LOG_DARK: 0x5d4037
    }
};

const rInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const rFloat = (min, max) => Math.random() * (max - min) + min;

/**
 * ASSETS
 */
const Geo = {
    geomCache: {
        box: new THREE.BoxGeometry(1, 1, 1),
        cyl: new THREE.CylinderGeometry(1, 1, 1, 8)
    },
    matCache: {},

    getMat: (color) => {
        if (!Geo.matCache[color]) {
            Geo.matCache[color] = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
        }
        return Geo.matCache[color];
    },

    // Standard Box
    box: (w, h, d, color, x=0, y=0, z=0) => {
        const m = new THREE.Mesh(Geo.geomCache.box, Geo.getMat(color));
        m.scale.set(w, h, d);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    },

    // Cylinder Helper for Logs
    cylinder: (radius, length, color, x=0, y=0, z=0) => {
        const m = new THREE.Mesh(Geo.geomCache.cyl, Geo.getMat(color));
        m.scale.set(radius, length, radius);
        m.rotation.z = Math.PI / 2; // Lay flat
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    },

    createCar: (type) => {
        const car = new THREE.Group();
        const mainCol = [0xc0392b, 0x2980b9, 0xf1c40f, 0xe67e22, 0x8e44ad][rInt(0, 4)];

        if (type === 'sedan') {
            car.add(Geo.box(28, 9, 14, mainCol, 0, 4.5, 0));
            car.add(Geo.box(16, 6, 12, 0x34495e, -2, 12, 0));
        } else if (type === 'truck') {
            car.add(Geo.box(30, 11, 14, mainCol, 0, 5.5, 0));
            car.add(Geo.box(10, 8, 14, 0xbdc3c7, 8, 15, 0));
            car.add(Geo.box(16, 8, 12, 0x34495e, -6, 15, 0));
        }

        // Wheels - Instancing would be better but reusing mat/geo is good enough for now
        const wheelMat = Geo.getMat(0x1e272e);
        [[-8, 2.5, 7.5], [8, 2.5, 7.5], [-8, 2.5, -7.5], [8, 2.5, -7.5]].forEach(pos => {
            const w = new THREE.Mesh(Geo.geomCache.box, wheelMat);
            w.scale.set(5, 5, 2);
            w.position.set(...pos);
            car.add(w);
        });

        car.add(Geo.box(1, 2, 3, 0xffff00, 14.6, 6, 4));
        car.add(Geo.box(1, 2, 3, 0xffff00, 14.6, 6, -4));
        return car;
    },

    createTrain: () => {
        const train = new THREE.Group();
        const col = 0xc0392b;

        train.add(Geo.box(40, 16, 11, col, 130, 8, 0));
        train.add(Geo.box(12, 8, 9, 0xbdc3c7, 140, 20, 0));
        train.add(Geo.box(6, 10, 5, 0x2c3e50, 120, 21, 0));

        for(let i=1; i<=6; i++) {
            const offset = 130 - (i * 44);
            train.add(Geo.box(40, 14, 11, col, offset, 7, 0));
            train.add(Geo.box(38, 1, 12, 0x333333, offset, 14, 0));
        }
        return train;
    }
};

/**
 * JOYSTICK COMPONENT
 */
const VirtualJoystick = ({ onInput, onStop }) => {
    const knobRef = useRef(null);
    const containerRef = useRef(null);
    const [active, setActive] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const origin = useRef({ x: 0, y: 0 });

    const handleStart = (e) => {
        e.stopPropagation();
        
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        origin.current = { x: centerX, y: centerY };
        setActive(true);
        handleMove(e);
    };

    const handleMove = (e) => {
        if (!active && e.type !== 'touchstart' && e.type !== 'mousedown') return;
        e.stopPropagation();
        
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        const dx = touch.clientX - origin.current.x;
        const dy = touch.clientY - origin.current.y;
        
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 35;
        
        let clampedX = dx;
        let clampedY = dy;
        
        if (distance > maxDist) {
            const angle = Math.atan2(dy, dx);
            clampedX = Math.cos(angle) * maxDist;
            clampedY = Math.sin(angle) * maxDist;
        }

        setPos({ x: clampedX, y: clampedY });

        if (distance > 30) {
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            let direction = null;

            if (angle > -135 && angle < -45) direction = { x: 0, z: 1 };
            else if (angle > 45 && angle < 135) direction = { x: 0, z: -1 };
            else if (Math.abs(angle) > 135) direction = { x: 1, z: 0 };
            else direction = { x: -1, z: 0 };

            if (onInput) onInput(direction);
        }
    };

    const handleEnd = (e) => {
        e.stopPropagation();
        setActive(false);
        setPos({ x: 0, y: 0 });
        if (onStop) onStop();
    };

    return (
        <div 
            ref={containerRef}
            className="absolute bottom-8 right-8 w-36 h-36 z-50 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 touch-none flex items-center justify-center shadow-2xl"
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
        >
            <div 
                ref={knobRef}
                className="w-14 h-14 bg-white/90 rounded-full shadow-lg transition-transform duration-75"
                style={{
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    backgroundColor: active ? '#2ecc71' : 'white'
                }}
            />
        </div>
    );
};

class Input {
    constructor() {
        this.q = [];
        this.activeKeys = [];
        this.timers = {};
        this.locked = false;
        
        this.joystickVector = null;
        this.joystickTimer = 0;

        this.map = {
            'ArrowUp':{x:0,z:1}, 'w':{x:0,z:1},
            'ArrowDown':{x:0,z:-1}, 's':{x:0,z:-1},
            'ArrowLeft':{x:1,z:0}, 'a':{x:1,z:0},
            'ArrowRight':{x:-1,z:0}, 'd':{x:-1,z:0}
        };

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);

        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    handleKeyDown(e) {
        if (this.locked) return;
        const k = e.key;
        if (this.map[k]) {
            if (!this.activeKeys.includes(k)) {
                const newDir = this.map[k];
                if (this.activeKeys.length > 0) {
                     const lastKey = this.activeKeys[this.activeKeys.length-1];
                     const lastDir = this.map[lastKey];
                     if (lastDir.x !== newDir.x || lastDir.z !== newDir.z) {
                         this.q = []; 
                     }
                }
                
                this.activeKeys.push(k);
                this.timers[k] = 0;
                
                if (this.q.length < 2) {
                    this.q.push(this.map[k]);
                }
            }
        }
    }

    handleKeyUp(e) {
        if (this.map[e.key]) {
            this.activeKeys = this.activeKeys.filter(key => key !== e.key);
            this.timers[e.key] = 0;

            const releasedDir = this.map[e.key];
            this.q = this.q.filter(m => !(m.x === releasedDir.x && m.z === releasedDir.z));

            if (this.activeKeys.length > 0) {
                const nextKey = this.activeKeys[this.activeKeys.length - 1];
                this.timers[nextKey] = C.MOVE_COOLDOWN + 0.1; 
            }
        }
    }

    handleTouchStart(e) {
        if (this.locked) return;
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        if (this.q.length >= 2) return; 

        const t = e.changedTouches[0];
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        if (t.clientY < h * 0.4) this.q.push({x:0,z:1});
        else if (t.clientX < w * 0.5) this.q.push({x:1,z:0});
        else this.q.push({x:-1,z:0});
    }

    attachTouch(element) {
        element.addEventListener('touchstart', this.handleTouchStart, {passive: false});
    }

    setJoystickInput(vector) {
        if (this.locked) return;
        
        if (vector && (!this.joystickVector || this.joystickVector.x !== vector.x || this.joystickVector.z !== vector.z)) {
             if (this.q.length < 2) {
                 this.q.push(vector);
                 this.joystickTimer = 0;
             }
        }
        this.joystickVector = vector;
    }

    clearJoystick() {
        this.joystickVector = null;
        this.joystickTimer = 0;
    }

    cleanup() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    update(dt) {
        if (this.locked) return;

        if (this.activeKeys.length > 0) {
            const latestKey = this.activeKeys[this.activeKeys.length - 1];
            this.timers[latestKey] += dt;
            
            if (this.timers[latestKey] > C.MOVE_COOLDOWN) {
                if (this.q.length < 2) {
                    this.q.push(this.map[latestKey]);
                    this.timers[latestKey] = 0;
                }
            }
        }

        if (this.joystickVector) {
            this.joystickTimer += dt;
            if (this.joystickTimer > C.MOVE_COOLDOWN) { 
                if (this.q.length < 2) {
                    this.q.push(this.joystickVector);
                    this.joystickTimer = 0;
                }
            }
        }
    }

    pop() { return this.q.shift(); }
    clear() { this.q = []; this.activeKeys = []; this.joystickVector = null; }
}

class Chicken {
    constructor(scene, gameInstance) {
        this.scene = scene;
        this.game = gameInstance;
        this.mesh = new THREE.Group();
        
        this.busyTime = 0; 

        const body = Geo.box(10, 10, 10, C.COLORS.CHICKEN, 0, 5, 0);
        const comb = Geo.box(3, 4, 6, 0xe74c3c, 0, 12, 2);
        const beak = Geo.box(4, 3, 4, 0xf1c40f, 0, 6, 6);
        const eyeL = Geo.box(2, 2, 2.2, 0x2c3e50, 4.1, 7, 3);
        const eyeR = Geo.box(2, 2, 2.2, 0x2c3e50, -4.1, 7, 3);
        const wingL = Geo.box(2, 5, 6, 0xecf0f1, 5.5, 4, 0);
        const wingR = Geo.box(2, 5, 6, 0xecf0f1, -5.5, 4, 0);
        const legL = Geo.box(2, 3, 2, 0xe67e22, 2, 0, 0);
        const legR = Geo.box(2, 3, 2, 0xe67e22, -2, 0, 0);

        this.mesh.add(body, comb, beak, eyeL, eyeR, wingL, wingR, legL, legR);
        this.scene.add(this.mesh);
        this.reset();
    }

    reset() {
        this.grid = { x: 0, z: 0 };
        this.mesh.position.set(0,0,0);
        this.mesh.rotation.y = 0;
        this.mesh.visible = true;
        this.mesh.scale.set(C.SCALE, C.SCALE, C.SCALE);

        this.moving = false;
        this.moveTime = 0;
        this.busyTime = 0;
        this.start = new THREE.Vector3();
        this.end = new THREE.Vector3();
        this.log = null;
        this.logOffset = 0;
    }

    isBusy() { return this.busyTime > 0; }

    move(dir) {
        if (this.busyTime > 0) return;
        if (this.game.world.isRiver(this.grid.z) && this.moving) return;

        const tx = this.grid.x + dir.x;
        const tz = this.grid.z + dir.z;

        if (Math.abs(tx * C.TILE) > C.GAME_W / 2) return;
        if (this.game.world.isBlocked(tx, tz)) return;

        this.game.playTone(400 + Math.random()*200, 'sine', 0.1, 0.1);
        
        this.moving = true;
        this.moveTime = 0;
        this.busyTime = C.MOVE_COOLDOWN; 
        
        this.start.copy(this.mesh.position);

        if(this.log) {
            this.start.x = Math.round(this.mesh.position.x / C.TILE) * C.TILE;
            this.start.z = Math.round(this.mesh.position.z / C.TILE) * C.TILE;
        }

        this.end.set(tx * C.TILE, 0, tz * C.TILE);
        this.grid = { x: tx, z: tz };
        this.log = null;

        const r = this.mesh.rotation.y;
        const targetR = dir.z===1?0 : dir.z===-1?Math.PI : dir.x===1?Math.PI/2 : -Math.PI/2;
        this.mesh.rotation.y = targetR;
    }

    update(dt) {
        if (this.busyTime > 0) {
            this.busyTime -= dt;
            if (this.busyTime < 0) this.busyTime = 0;
        }

        if (this.moving) {
            this.moveTime += dt;
            let t = this.moveTime / C.HOP_SPEED;
            if (t > 1) t = 1;

            this.mesh.position.lerpVectors(this.start, this.end, t);
            this.mesh.position.y = Math.sin(t * Math.PI) * 10;

            const s = 1.0 + Math.sin(t * Math.PI) * 0.2;
            this.mesh.scale.set(C.SCALE/s, C.SCALE*s, C.SCALE/s);

            if (t === 1) {
                this.moving = false;
                this.mesh.position.y = 0;
                this.mesh.scale.set(C.SCALE, C.SCALE, C.SCALE);
            }
        } else {
            if (this.log) {
                this.mesh.position.x = this.log.mesh.position.x + this.logOffset;
                this.grid.x = Math.round(this.mesh.position.x / C.TILE);
                this.mesh.position.y = 5.5;
            } else {
                const gx = this.grid.x * C.TILE;
                const d = gx - this.mesh.position.x;
                this.mesh.position.x += d * 15 * dt;
                this.mesh.position.y = 0;
            }
        }
    }
}

class Lane {
    constructor(id, type, scene, gameInstance) {
        this.id = id;
        this.type = type;
        this.scene = scene;
        this.game = gameInstance;
        this.mesh = new THREE.Group();
        this.mesh.position.z = id * C.TILE;
        this.obs = [];
        this.trees = new Set();
        this.trainActive = false;
        this.trainTimer = 0;

        const diffScore = this.game.rawScoreVal || 0;
        const level = Math.floor(diffScore / 20);
        const speedMult = 1.0 + (level * 0.1);

        let col, y = -10;
        if (type === 'grass') col = (id % 2) ? C.COLORS.GRASS_1 : C.COLORS.GRASS_2;
        else if (type === 'road') col = C.COLORS.ROAD;
        else if (type === 'rail') col = C.COLORS.GRASS_1;
        else if (type === 'river') { col = C.COLORS.WATER; y = -12; }

        const floor = Geo.box(C.WORLD_W, 20, C.TILE, col, 0, y, 0);
        this.mesh.add(floor);

        if (type === 'grass') {
            const tuftCount = rInt(3, 8); // Reduced for performance
            for(let i=0; i<tuftCount; i++) {
                const rx = rInt(-C.GAME_W/2, C.GAME_W/2);
                const rz = rFloat(-C.TILE/2 + 2, C.TILE/2 - 2);
                const size = rFloat(1.5, 2.5);
                const tuft = Geo.box(size, size, size, C.COLORS.TUFT, rx, 1, rz);
                tuft.rotation.y = Math.random();
                this.mesh.add(tuft);
            }

            const count = rInt(1, 4);
            for(let i=0; i<count; i++) {
                const tx = rInt(-12, 12);
                if (id < 3 && Math.abs(tx) < 3) continue;
                if (!this.trees.has(tx)) {
                    this.trees.add(tx);
                    this.addTree(tx * C.TILE);
                }
            }
            for(let x=13; x<35; x++) { this.addTree(x*C.TILE); this.addTree(-x*C.TILE); }
        }
        else if (type === 'road') {
            const baseSpeed = rFloat(80, 150);
            this.speed = baseSpeed * speedMult;
            this.dir = Math.random()>0.5 ? 1 : -1;

            let numCars = rInt(2, 4);
            for(let i=0; i<numCars; i++) {
                const carType = Math.random()>0.65?'truck':'sedan';
                const spacing = 300 - (level * 10);
                const safeSpacing = Math.max(150, spacing);
                const o = new Obstacle(carType, this.speed*this.dir, (i*safeSpacing) + rInt(0, 20), this.dir);
                this.obs.push(o);
                this.mesh.add(o.mesh);
            }
            this.mesh.add(Geo.box(C.WORLD_W, 1, 1, 0xffffff, 0, 0.1, 7.5));
            this.mesh.add(Geo.box(C.WORLD_W, 1, 1, 0xffffff, 0, 0.1, -7.5));
        }
        else if (type === 'river') {
            this.speed = rFloat(50, 80) * speedMult;
            this.dir = Math.random()>0.5 ? 1 : -1;

            let num = rInt(12, 15);
            for(let i=0; i<num; i++) {
                const len = rInt(4, 7);
                const spacing = 50 + rInt(0, 40);
                const startX = (i * (spacing + (len*C.TILE))) - 500;
                const o = new Obstacle('log', this.speed*this.dir, startX, 1, len);
                this.obs.push(o);
                this.mesh.add(o.mesh);
            }
        }
        else if (type === 'rail') {
            const sleepers = new THREE.Group();
            for(let x=-C.WORLD_W/2; x<C.WORLD_W/2; x+=14) {
                sleepers.add(Geo.box(6, 2, 14, 0x3e2723, x, 1, 0));
            }
            const r1 = Geo.box(C.WORLD_W, 3, 2, 0x7f8c8d, 0, 3, -3);
            const r2 = Geo.box(C.WORLD_W, 3, 2, 0x7f8c8d, 0, 3, 3);
            this.mesh.add(sleepers, r1, r2);

            this.light = Geo.box(4, 15, 4, 0x2c3e50, 60, 7, 10);
            this.bulb = Geo.box(5, 5, 5, 0x222222, 60, 14, 10);
            this.mesh.add(this.light, this.bulb);
        }

        this.scene.add(this.mesh);
    }

    addTree(x) {
        const tree = new THREE.Group();
        tree.position.x = x;
        tree.add(Geo.box(8, 10, 8, 0x4e342e, 0, 5, 0));
        tree.add(Geo.box(16, 12, 16, 0x1b5e20, 0, 11, 0));
        tree.add(Geo.box(12, 10, 12, 0x2e7d32, 0, 18, 0));
        this.mesh.add(tree);
    }

    update(dt) {
        if (this.type === 'grass') return;

        const limit = C.WORLD_W / 2 + 100;

        if (this.type === 'rail') {
            this.trainTimer += dt;
            const diffScore = this.game.rawScoreVal || 0;
            const level = Math.floor(diffScore / 30);
            const waitTime = Math.max(1.5, rFloat(3, 6) - level);

            if (!this.trainActive && this.trainTimer > waitTime) {
                this.trainActive = true;
                const blink = Math.floor(Date.now() / 100) % 2;
                this.bulb.material.color.setHex(blink ? 0xe74c3c : 0x222222);

                setTimeout(() => {
                    const trainSpeed = 900 + (level * 100);
                    const train = new Obstacle('train', trainSpeed, -1200, 1);
                    this.obs.push(train);
                    this.mesh.add(train.mesh);
                }, 800);
            } else if (this.trainActive && this.obs.length === 0) {
                 this.bulb.material.color.setHex(0x222222);
            } else if (this.trainActive) {
                const blink = Math.floor(Date.now() / 100) % 2;
                this.bulb.material.color.setHex(blink ? 0xe74c3c : 0x222222);
            }
        }

        for(let i=this.obs.length-1; i>=0; i--) {
            const o = this.obs[i];
            o.mesh.position.x += o.speed * dt;

            if (this.type === 'rail') {
                if (o.mesh.position.x > 1500) {
                    this.mesh.remove(o.mesh);
                    this.obs.splice(i, 1);
                    this.trainActive = false;
                    this.trainTimer = 0;
                    this.bulb.material.color.setHex(0x222222);
                }
            } else {
                if (o.speed > 0 && o.mesh.position.x > limit) o.mesh.position.x = -limit;
                if (o.speed < 0 && o.mesh.position.x < -limit) o.mesh.position.x = limit;
            }
        }
    }
}

class Obstacle {
    constructor(type, speed, x, dir, len=3) {
        this.type = type;
        this.speed = speed;
        this.mesh = new THREE.Group();
        this.mesh.position.x = x;
        this.width = 0;

        if (type === 'log') {
            this.width = len * C.TILE;
            const radius = 6;
            const log = Geo.cylinder(radius, this.width, C.COLORS.LOG, 0, 0, 0);
            const capR = 0.5;
            const cap1 = Geo.cylinder(radius-0.5, capR, C.COLORS.LOG_DARK, -this.width/2 - capR/2, 0, 0);
            const cap2 = Geo.cylinder(radius-0.5, capR, C.COLORS.LOG_DARK, this.width/2 + capR/2, 0, 0);
            const moss = Geo.box(4, 2, 4, C.COLORS.TUFT, rInt(-5,5), radius, 0);
            this.mesh.add(log, cap1, cap2, moss);
        }
        else if (type === 'train') {
            this.width = 18 * C.TILE;
            const trainGeo = Geo.createTrain();
            if (speed < 0) trainGeo.rotation.y = Math.PI;
            this.mesh.add(trainGeo);
        }
        else {
            this.width = type==='truck'?32:24;
            const car = Geo.createCar(type);
            if (dir < 0) car.rotation.y = Math.PI;
            this.mesh.add(car);
        }
    }
}

class World {
    constructor(scene, gameInstance) {
        this.scene = scene;
        this.game = gameInstance;
        this.lanes = [];
        this.map = {};
        for(let i=-6; i<20; i++) this.addLane(i, i<3?'grass':null);
    }

    addLane(i, type) {
        if (!type) {
            const r = Math.random();
            const prev = this.map[i-1];
            const diffScore = this.game.rawScoreVal || 0;
            const level = Math.floor(diffScore / 25);

            let roadRepeatChance = 0.6 + (level * 0.1);
            if (roadRepeatChance > 0.95) roadRepeatChance = 0.95;

            if (prev && prev.type === 'river' && prev.count < 1 && r<0.3) type = 'river';
            else if (prev && prev.type === 'road' && prev.count < 8 && r < roadRepeatChance) type = 'road';
            else {
                if (r < 0.3) type = 'grass';
                else if (r < 0.9) type = 'road';
                else if (r < 0.94) type = 'river';
                else type = 'rail';
            }
        }

        const l = new Lane(i, type, this.scene, this.game);
        l.count = (this.map[i-1] && this.map[i-1].type === type) ? this.map[i-1].count+1 : 1;
        this.lanes.push(l);
        this.map[i] = l;
    }

    update(dt, pZ) {
        const last = this.lanes[this.lanes.length-1].id;
        if (pZ > last - 25) this.addLane(last + 1);

        if (this.lanes.length > C.MAX_LANES) {
            const old = this.lanes.shift();
            this.scene.remove(old.mesh);
            delete this.map[old.id];
        }

        this.lanes.forEach(l => l.update(dt));
    }

    isBlocked(tx, tz) {
        const l = this.map[tz];
        return l ? l.trees.has(tx) : false;
    }

    isRiver(z) { return this.map[z] && this.map[z].type === 'river'; }

    checkCollisions(p) {
        const l = this.map[p.grid.z];
        if (!l) return;

        const px = p.mesh.position.x;

        if (l.type === 'road' || l.type === 'rail') {
            for(let o of l.obs) {
                if (px < o.mesh.position.x + o.width/2 + 2 &&
                    px > o.mesh.position.x - o.width/2 - 2) {
                    this.game.die();
                }
            }
        }
        else if (l.type === 'river') {
            if (p.moving) return;
            let safe = false;
            for(let o of l.obs) {
                if (px < o.mesh.position.x + o.width/2 &&
                    px > o.mesh.position.x - o.width/2) {
                    safe = true;
                    if (p.log !== o) {
                        p.log = o;
                        p.logOffset = px - o.mesh.position.x;
                    }
                    break;
                }
            }
            if (!safe) this.game.die('drown');
        }
    }
}

const CrossyRoadGame = ({ onExit, onGameOver }) => {
    const containerRef = useRef(null);
    const [gameState, setGameState] = useState('start');
    const [score, setScore] = useState(0);

    const gameRef = useRef({
        active: false,
        scoreVal: 0,
        rawScoreVal: 0, 
        timeSinceLastForward: 0, // Track time since forward move
        scene: null,
        camera: null,
        renderer: null,
        sun: null,
        world: null,
        player: null,
        input: null,
        clock: null,
        audioCtx: null,

        init(container, updateScore, setGameState) {
            this.updateScoreUI = updateScore;
            this.setGameStateUI = setGameState;

            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { console.error(e); }

            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(C.COLORS.SKY);
            this.scene.fog = new THREE.Fog(C.COLORS.SKY, 100, 280); // Reduced far plane

            const width = window.innerWidth;
            const height = window.innerHeight;
            const aspect = width / height;
            
            const isMobile = width < 1024;
            const d = isMobile ? C.ZOOM_MOBILE : C.ZOOM_DESKTOP;

            // FIX: Changed near clipping from 1 to -100 to fix bottom clipping
            this.camera = new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, -100, 1000);
            this.camera.position.set(-50, 60, -50);
            this.camera.lookAt(0,0,0);

            // OPTIMIZATION: Disabled antialias and changed power preference
            this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "default" });
            this.renderer.setSize(width, height);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFShadowMap; // Faster than Soft

            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

            while(container.firstChild) container.removeChild(container.firstChild);
            container.appendChild(this.renderer.domElement);

            const amb = new THREE.HemisphereLight(0xffffff, 0xb0bec5, 1.2);
            this.scene.add(amb);

            this.sun = new THREE.DirectionalLight(0xffffff, 1.3);
            this.sun.position.set(-80, 150, 50);
            this.sun.castShadow = true;
            this.sun.shadow.mapSize.set(1024, 1024); // Reduced shadow map size
            this.sun.shadow.camera.left = -300; // Increased shadow render distance
            this.sun.shadow.camera.right = 300;
            this.sun.shadow.camera.top = 300;
            this.sun.shadow.camera.bottom = -300;
            this.scene.add(this.sun);

            this.input = new Input();
            this.input.attachTouch(container);
            this.clock = new THREE.Clock();

            this.handleResize = () => {
                 const w = window.innerWidth;
                 const h = window.innerHeight;
                 const asp = w / h;
                 const isMob = w < 1024;
                 const newD = isMob ? C.ZOOM_MOBILE : C.ZOOM_DESKTOP;
                 
                 this.camera.left = -newD * asp;
                 this.camera.right = newD * asp;
                 this.camera.top = newD;
                 this.camera.bottom = -newD;
                 this.camera.updateProjectionMatrix();
                 this.renderer.setSize(w, h);
            };
            window.addEventListener('resize', this.handleResize);

            this.reset();
        },

        startLoop() {
             if (this.reqId) cancelAnimationFrame(this.reqId);
             this.loop();
        },

        stopLoop() {
             if (this.reqId) cancelAnimationFrame(this.reqId);
        },

        playTone(freq, type, duration, vol=0.1) {
            if (!this.audioCtx) return;
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
            gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        },

        reset() {
            this.active = false;
            this.scoreVal = 0;
            this.rawScoreVal = 0;
            this.timeSinceLastForward = 0; // Reset decay timer
            this.updateScoreUI(0);

            if (this.world) this.world.lanes.forEach(l => this.scene.remove(l.mesh));
            if (this.player) this.scene.remove(this.player.mesh);

            this.input.clear();
            this.input.locked = true;

            this.world = new World(this.scene, this);
            this.player = new Chicken(this.scene, this);

            this.camera.position.set(-50, 60, -50);
            this.sun.position.set(-80, 150, 50);

            setTimeout(() => {
                this.active = true;
                this.input.locked = false;
            }, 400);
        },

        die(type) {
            if (!this.active) return;
            this.active = false;

            if (type === 'drown') {
                this.player.mesh.position.y = -15;
                this.playTone(150, 'sawtooth', 0.5, 0.3);
            } else {
                this.player.mesh.scale.y = 0.1;
                this.player.mesh.scale.x = 1.5;
                this.player.mesh.scale.z = 1.5;
                this.playTone(100, 'sawtooth', 0.3, 0.2);
            }

            this.setGameStateUI('gameover');
            if (onGameOver) onGameOver(Math.floor(this.scoreVal));
        },

        loop() {
            this.reqId = requestAnimationFrame(() => this.loop());

            const dt = Math.min(this.clock.getDelta(), 0.05);

            if (this.active) {
                this.input.update(dt);
                
                if (!this.player.isBusy()) {
                    const move = this.input.pop();
                    if (move) this.player.move(move);
                }

                this.timeSinceLastForward += dt;

                if (this.player.grid.z > this.rawScoreVal) {
                    const diff = this.player.grid.z - this.rawScoreVal;
                    this.scoreVal += diff * 8;
                    this.rawScoreVal = this.player.grid.z;
                    this.timeSinceLastForward = 0; // Reset decay timer on forward progress
                    this.updateScoreUI(Math.floor(this.scoreVal));
                    this.playTone(600 + (this.rawScoreVal * 2), 'triangle', 0.1, 0.05);
                }

                // SCORE DECAY LOGIC
                if (this.timeSinceLastForward >= 1.0) {
                    this.timeSinceLastForward -= 1.0;
                    if (this.scoreVal > 0) {
                        this.scoreVal = Math.max(0, this.scoreVal - 0.05*this.scoreVal);
                        this.updateScoreUI(Math.floor(this.scoreVal));
                    }
                }

                this.player.update(dt);
                this.world.update(dt, this.player.grid.z);
                this.world.checkCollisions(this.player);

                const tx = this.player.mesh.position.x - 30;
                const tz = this.player.mesh.position.z - 30;
                this.camera.position.x += (tx - this.camera.position.x) * 0.1;
                this.camera.position.z += (tz - this.camera.position.z) * 0.1;

                this.sun.position.x = this.player.mesh.position.x - 80;
                this.sun.position.z = this.player.mesh.position.z + 50;

                if (this.player.mesh.position.z < this.camera.position.z + 10 ||
                    Math.abs(this.player.mesh.position.x) > C.GAME_W/2 + 20) {
                    this.die();
                }
            }

            this.renderer.render(this.scene, this.camera);
        },

        cleanup() {
            window.removeEventListener('resize', this.handleResize);
            if (this.reqId) cancelAnimationFrame(this.reqId);
            this.input.cleanup();
            if (this.renderer) this.renderer.dispose();
        }
    });

    useEffect(() => {
        if (!containerRef.current) return;
        gameRef.current.init(containerRef.current, setScore, setGameState);

        // Start locked
        gameRef.current.input.locked = true;

        gameRef.current.startLoop();
        return () => {
            gameRef.current.cleanup();
        };
    }, []);

    const handleStart = () => {
        setGameState('playing');
        gameRef.current.reset();
        // Unlock input explicitly after reset logic runs (reset also has a timeout, but we ensure start state)
        setTimeout(() => {
             if (gameRef.current && gameRef.current.input) gameRef.current.input.locked = false;
        }, 100);
    };

    const handleRetry = () => {
        setGameState('playing');
        gameRef.current.reset();
    };

    const handleJoystickInput = (vector) => {
        if (gameRef.current && gameRef.current.input) {
            gameRef.current.input.setJoystickInput(vector);
        }
    };

    const handleJoystickStop = () => {
        if (gameRef.current && gameRef.current.input) {
            gameRef.current.input.clearJoystick();
        }
    };

    return (
        <div className="relative w-full h-full bg-zinc-900 overflow-hidden">
            <div ref={containerRef} className="w-full h-full block" />
            
            {gameState === 'playing' && (
                <div className="lg:hidden block">
                    <VirtualJoystick 
                        onInput={handleJoystickInput} 
                        onStop={handleJoystickStop} 
                    />
                </div>
            )}

            <div className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-6 md:p-10">
                <div className="flex justify-between items-start w-full pointer-events-auto">
                    <div className="flex flex-col drop-shadow-sm">
                        <span className="text-white/60 text-xs font-bold uppercase tracking-widest">Score</span>
                        <span className="text-4xl md:text-5xl font-black text-white leading-none drop-shadow-lg">{score}</span>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onExit(); }}
                        className="p-3 bg-white hover:bg-zinc-100 text-zinc-800 rounded-full shadow-md transition-all z-50"
                        title="Exit Game"
                    >
                        <X size={24} />
                    </button>
                </div>

                {gameState === 'start' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-500">
                        <div className="text-center mb-8">
                             <h1 className="text-5xl md:text-6xl font-black text-white mb-2 tracking-tight drop-shadow-lg text-shadow-xl" style={{ textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>Crossy Road</h1>
                             <p className="text-white/90 font-medium text-lg drop-shadow-md">Log Update</p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleStart(); }}
                            className="flex items-center gap-3 px-8 py-4 bg-[#2ecc71] text-white rounded-full font-black text-xl hover:scale-105 hover:bg-[#27ae60] transition-all shadow-[0_6px_0_#27ae60] active:shadow-none active:translate-y-[6px]"
                        >
                            <Play size={24} className="fill-current" />
                            START HOPPING
                        </button>
                    </div>
                )}

                {gameState === 'gameover' && (
                     <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto z-50 animate-in fade-in zoom-in-95 duration-300 rounded-3xl m-4 md:m-12 shadow-2xl">
                        <h2 className="text-5xl font-black text-[#e74c3c] mb-2 uppercase">Wasted</h2>
                        <div className="bg-zinc-100 px-8 py-4 rounded-2xl border border-zinc-200 mb-8 text-center min-w-[200px]">
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Score</p>
                            <p className="text-4xl font-black text-zinc-800">{score}</p>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={(e) => { e.stopPropagation(); onExit(); }}
                                className="px-6 py-3 bg-zinc-200 text-zinc-700 rounded-xl font-bold hover:bg-zinc-300 transition-colors uppercase tracking-wide"
                            >
                                Exit
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                                className="flex items-center gap-2 px-8 py-3 bg-[#2ecc71] text-white rounded-xl font-bold hover:bg-[#27ae60] transition-colors shadow-lg uppercase tracking-wide"
                            >
                                <RotateCcw size={18} />
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {gameState === 'playing' && (
                     // FIX: Added pb-6 to prevent text hitting bottom of screen
                     <div className="w-full text-center pointer-events-none mt-auto pb-6">
                         <p className="text-white/60 text-sm font-bold uppercase tracking-widest drop-shadow-md lg:block hidden">
                            Tap / WASD / Arrows
                         </p>
                         <p className="text-white/60 text-sm font-bold uppercase tracking-widest drop-shadow-md lg:hidden block">
                            Tap or Use Joystick
                         </p>
                     </div>
                )}
            </div>
        </div>
    );
};

export default CrossyRoadGame;
