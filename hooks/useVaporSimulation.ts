// Fix: Import React to make the React namespace available for type annotations like React.RefObject.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Stats, SubtitleState, Crystal, VaporParticle } from '../types';
import { 
    BOWL_RADIUS, STEM_RADIUS, STEM_LENGTH, MOUTH_RADIUS, ROOM_TEMP, MELTING_TEMP, 
    RECRYSTALLIZATION_TEMP, SUBLIMATION_TEMP, KNOCK_TIME, INITIAL_SHARD_SIZE,
    MAX_VAPOR, MAX_RESIDUE, MODEL_DATA_BASE64
} from '../constants';

// Tone.js is loaded from a CDN, so we declare its type here.
declare const Tone: any;

export const useVaporSimulation = (mountRef: React.RefObject<HTMLDivElement>) => {
    const [stats, setStats] = useState<Stats>({
        bowlTemp: ROOM_TEMP,
        vaporCount: 0,
        residueCount: 0,
        pipeRotation: 0,
        isHeating: false,
        isInhaling: false,
    });
    const [stimulationLevel, setStimulationLevel] = useState(0);
    const [subtitle, setSubtitle] = useState<SubtitleState>({ text: '', visible: false });

    const stateRef = useRef({
        knockTimer: 0,
        knockSoundPlayed: false,
        isHeating: false,
        isInhaling: false,
        isLighterHeld: false,
        pipeTargetRotationX: 0,
        stimulationLevel: 0,
        liquidPool: { volume: 0, temperature: ROOM_TEMP },
        crystals: [] as Crystal[],
        vaporParticles: [] as VaporParticle[],
        residueCount: 0
    }).current;

    const threeRef = useRef<any>({}).current; // To hold all three.js objects
    
    const onShardSizeChange = useCallback((size: number) => {
        stateRef.crystals.forEach(c => { 
            threeRef.pipeGroup.remove(c.mesh); 
            c.mesh.geometry.dispose(); 
        });
        stateRef.crystals = [];
        stateRef.liquidPool.volume = 0;
        stateRef.liquidPool.temperature = ROOM_TEMP;
        if(threeRef.liquidPoolMesh) threeRef.liquidPoolMesh.visible = false;
        
        const crystalMaterial = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.1 });
        
        for (let i = 0; i < 25; i++) {
            const points = [];
            for (let j = 0; j < 10; j++) {
                points.push(new THREE.Vector3((Math.random()-0.5)*size, (Math.random()-0.5)*size, (Math.random()-0.5)*size));
            }
            const crystalMesh = new THREE.Mesh(new ConvexGeometry(points), crystalMaterial);
            stateRef.crystals.push({
                mesh: crystalMesh, state: 'solid',
                position: new THREE.Vector3((Math.random()-0.5)*0.5, -BOWL_RADIUS+0.5+Math.random()*0.5, (Math.random()-0.5)*0.5),
                velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(),
                temperature: ROOM_TEMP, size: size,
            });
            threeRef.pipeGroup.add(crystalMesh);
        }
    }, [threeRef, stateRef]);

    const showSubtitle = useCallback((text: string) => {
        setSubtitle({ text, visible: true });
        setTimeout(() => {
            setSubtitle(s => ({ ...s, visible: false }));
        }, 3500);
    }, []);

    const playKnock = useCallback(() => {
        if (!threeRef.knockSynth) return;
        const now = Tone.now();
        threeRef.knockSynth.triggerAttackRelease("C2", "8n", now);
        threeRef.knockSynth.triggerAttackRelease("C2", "8n", now + 0.15);
        threeRef.knockSynth.triggerAttackRelease("C2", "8n", now + 0.3);
    }, [threeRef]);
    
    const animate = useCallback(() => {
        if (!threeRef.renderer) return;

        threeRef.animationFrameId = requestAnimationFrame(animate);
        const delta = threeRef.clock.getDelta();
        const globalGravity = new THREE.Vector3(0, -0.001, 0);

        // Knock timer logic
        if (stateRef.isInhaling) {
            stateRef.knockTimer += delta;
            if (stateRef.knockTimer > KNOCK_TIME && !stateRef.knockSoundPlayed) {
                playKnock();
                showSubtitle("Come on. What are you doing in there?");
                stateRef.knockSoundPlayed = true;
            }
        } else {
            stateRef.knockTimer = 0;
            stateRef.knockSoundPlayed = false;
        }

        threeRef.orbitControls.update();
        threeRef.pipeGroup.rotation.x = THREE.MathUtils.lerp(threeRef.pipeGroup.rotation.x, stateRef.pipeTargetRotationX, 0.05);

        // Heating check
        const lighterFlamePos = new THREE.Vector3();
        threeRef.flame.getWorldPosition(lighterFlamePos);
        const bowlWorldPos = threeRef.bowl.getWorldPosition(new THREE.Vector3());
        const distance = lighterFlamePos.distanceTo(bowlWorldPos);
        stateRef.isHeating = stateRef.isLighterHeld && distance < (BOWL_RADIUS * threeRef.pipeGroup.scale.x) + 1.0;
        
        // --- Physics Updates ---
        const localGravity = globalGravity.clone().applyQuaternion(threeRef.pipeGroup.quaternion.clone().invert());
        
        // Crystals
        stateRef.crystals.forEach(c => {
            if(c.state === 'solid') { c.velocity.add(localGravity); c.position.add(c.velocity); }
        });
        const collisionIterations = 4;
        for (let iter = 0; iter < collisionIterations; iter++) {
            stateRef.crystals.forEach(c => {
                if(c.state !== 'solid') return;
                const collisionBoundary = BOWL_RADIUS - c.size / 2;
                if (c.position.length() > collisionBoundary) {
                    const normal = c.position.clone().normalize();
                    c.velocity.reflect(normal).multiplyScalar(0.1);
                    c.position.copy(normal.multiplyScalar(collisionBoundary));
                }
            });
             for (let i = 0; i < stateRef.crystals.length; i++) {
                const c1 = stateRef.crystals[i];
                if(c1.state !== 'solid') continue;
                for (let j = i + 1; j < stateRef.crystals.length; j++) {
                    const c2 = stateRef.crystals[j];
                    if(c2.state !== 'solid') continue;
                    const distVec = c2.position.clone().sub(c1.position);
                    const dist = distVec.length();
                    const min_dist = (c1.size / 2) + (c2.size / 2);
                    if (dist < min_dist) {
                        const overlap = min_dist - dist; const normal = distVec.normalize();
                        c1.position.add(normal.clone().multiplyScalar(-overlap * 0.5));
                        c2.position.add(normal.clone().multiplyScalar(overlap * 0.5));
                        const v1 = c1.velocity; const v2 = c2.velocity; const dot1 = v1.dot(normal); const dot2 = v2.dot(normal);
                        const optimizedP = (2.0 * (dot1 - dot2)) / 2.0;
                        c1.velocity.sub(normal.clone().multiplyScalar(optimizedP)).multiplyScalar(0.75);
                        c2.velocity.sub(normal.clone().multiplyScalar(-optimizedP)).multiplyScalar(0.75);
                    }
                }
            }
        }
        stateRef.crystals.forEach(c => {
            if(c.state !== 'solid') return;
            c.velocity.multiplyScalar(0.97); c.angularVelocity.multiplyScalar(0.95);
            c.mesh.position.copy(c.position);
            const deltaRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.angularVelocity.x, c.angularVelocity.y, c.angularVelocity.z));
            c.mesh.quaternion.premultiply(deltaRotation);
            if (stateRef.isHeating) {
                const crystalWorldPos = c.mesh.getWorldPosition(new THREE.Vector3());
                const distToFlame = crystalWorldPos.distanceTo(lighterFlamePos);
                c.temperature += 60 / (1 + distToFlame * distToFlame);
            }
            c.temperature = THREE.MathUtils.lerp(c.temperature, ROOM_TEMP, 0.01);
            if (c.temperature > MELTING_TEMP) {
                c.state = 'liquid'; c.mesh.visible = false;
                const oldVolume = stateRef.liquidPool.volume; const crystalVolume = c.size ** 3; const newVolume = oldVolume + crystalVolume;
                stateRef.liquidPool.temperature = newVolume > 0 ? ((stateRef.liquidPool.temperature * oldVolume) + (c.temperature * crystalVolume)) / newVolume : c.temperature;
                stateRef.liquidPool.volume = newVolume;
            }
        });
        
        // Liquid Pool
        if (stateRef.liquidPool.volume > 0) {
            threeRef.liquidPoolMesh.visible = true;
            if (threeRef.liquidPoolMesh.geometry) threeRef.liquidPoolMesh.geometry.dispose();
            const liquidDepth = Math.max(0.01, Math.cbrt(stateRef.liquidPool.volume) * 0.2);
            if (liquidDepth < BOWL_RADIUS * 2) {
                const points = []; const segments = 16; const surfaceY = -BOWL_RADIUS + liquidDepth;
                points.push(new THREE.Vector2(0, -BOWL_RADIUS));
                for (let i = 1; i <= segments; i++) {
                    const y = -BOWL_RADIUS + (liquidDepth * i / segments);
                    const x = Math.sqrt(BOWL_RADIUS * BOWL_RADIUS - y * y);
                    points.push(new THREE.Vector2(x, y));
                }
                points.push(new THREE.Vector2(0, surfaceY));
                threeRef.liquidPoolMesh.geometry = new THREE.LatheGeometry(points, 32);
            }
            const up = new THREE.Vector3(0, 1, 0);
            const targetUp = localGravity.clone().normalize().multiplyScalar(-1);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, targetUp);
            threeRef.liquidPoolMesh.quaternion.slerp(quaternion, 0.1);
            if (stateRef.isHeating) {
                const liquidWorldPos = threeRef.liquidPoolMesh.getWorldPosition(new THREE.Vector3());
                const distToFlame = liquidWorldPos.distanceTo(lighterFlamePos);
                stateRef.liquidPool.temperature += 100 / (1 + distToFlame * distToFlame);
            }
            stateRef.liquidPool.temperature = THREE.MathUtils.lerp(stateRef.liquidPool.temperature, ROOM_TEMP, 0.005);

            if (stateRef.liquidPool.temperature < RECRYSTALLIZATION_TEMP && stateRef.liquidPool.volume > 0) {
                if (Math.random() < 0.05 && stateRef.crystals.filter(c => c.state === 'solid').length < 30) {
                     const size = (Math.random() * 0.4) + 0.3; 
                     const crystalVolume = size ** 3;
                     if (stateRef.liquidPool.volume >= crystalVolume) {
                         stateRef.liquidPool.volume -= crystalVolume;
                         const spawnPosition = localGravity.clone().normalize().multiplyScalar(-(BOWL_RADIUS - size * 1.5)).add(new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2));
                         const points = [];
                         for (let j = 0; j < 10; j++) { points.push(new THREE.Vector3((Math.random()-0.5)*size, (Math.random()-0.5)*size, (Math.random()-0.5)*size));}
                         const crystalMesh = new THREE.Mesh(new ConvexGeometry(points), new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.1 }));
                         stateRef.crystals.push({ mesh: crystalMesh, state: 'solid', position: spawnPosition, velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), temperature: stateRef.liquidPool.temperature, size: size });
                         threeRef.pipeGroup.add(crystalMesh);
                     }
                }
            }
        } else {
            threeRef.liquidPoolMesh.visible = false;
        }

        // Vapor
        let activeVapor = 0;
        if (stateRef.liquidPool.volume > 0 && stateRef.liquidPool.temperature > SUBLIMATION_TEMP && stateRef.vaporParticles.length < MAX_VAPOR) {
            const volumeFactor = THREE.MathUtils.clamp(stateRef.liquidPool.volume / 4.0, 0.1, 1.0);
            const emissionRate = Math.floor((stateRef.liquidPool.temperature - SUBLIMATION_TEMP) / 1.5) * 100 * volumeFactor;
            for (let i = 0; i < emissionRate; i++) {
                if (stateRef.vaporParticles.length >= MAX_VAPOR) break;
                const liquidDepth = Math.max(0.01, Math.cbrt(stateRef.liquidPool.volume) * 0.2);
                const surfaceRadius = Math.sqrt(liquidDepth * (2 * BOWL_RADIUS - liquidDepth));
                const surfaceY = -BOWL_RADIUS + liquidDepth;
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * surfaceRadius;
                const startPos = new THREE.Vector3(Math.cos(angle) * radius, surfaceY, Math.sin(angle) * radius);
                startPos.applyQuaternion(threeRef.liquidPoolMesh.quaternion);
                stateRef.vaporParticles.push({
                    position: startPos,
                    velocity: new THREE.Vector3((Math.random()-0.5)*0.005, (Math.random()-0.5)*0.005, (Math.random()-0.5)*0.005),
                    lifespan: Math.random() * 500 + 500,
                });
            }
        }
        for (let i = stateRef.vaporParticles.length - 1; i >= 0; i--) {
            const p = stateRef.vaporParticles[i];
            p.velocity.y += 0.00005; p.velocity.x += (Math.random() - 0.5) * 0.004; p.velocity.z += (Math.random() - 0.5) * 0.004;
            if (stateRef.isInhaling) {
                const mouthpiecePos = new THREE.Vector3(threeRef.mouthpiece.position.x, 0, 0);
                const direction = mouthpiecePos.clone().sub(p.position).normalize();
                p.velocity.add(direction.multiplyScalar(0.008 / (1 + p.position.distanceTo(mouthpiecePos) * 0.2)));
            }
            p.position.add(p.velocity); p.lifespan--;
            
            // Collisions
            let hasCollided = false;
            const isNearStemOpening = (p.position.x > BOWL_RADIUS * 0.6 && Math.sqrt(p.position.y**2 + p.position.z**2) < STEM_RADIUS * 1.1);
            if (p.position.length() > BOWL_RADIUS && !isNearStemOpening) {
                const normal = p.position.clone().normalize();
                p.velocity.reflect(normal).multiplyScalar(-0.3);
                p.position.copy(normal.multiplyScalar(BOWL_RADIUS * 0.99));
                hasCollided = true;
            }
            const stemStart = BOWL_RADIUS - 0.2;
            if (p.position.x > stemStart && p.position.x < threeRef.mouthpiece.position.x) {
                const radialDist = Math.sqrt(p.position.y**2 + p.position.z**2);
                if (radialDist > STEM_RADIUS) {
                    const normal = new THREE.Vector3(0, p.position.y, p.position.z).normalize();
                    p.velocity.reflect(normal).multiplyScalar(-0.3);
                    p.position.y = normal.y * STEM_RADIUS * 0.99; p.position.z = normal.z * STEM_RADIUS * 0.99;
                    hasCollided = true;
                }
            }
            if (p.position.x > threeRef.mouthpiece.position.x) {
                p.lifespan = 0;
                stateRef.stimulationLevel = Math.min(100, stateRef.stimulationLevel + 0.05);
            }
            
            if (hasCollided) {
                if (Math.random() < 0.015 && stateRef.residueCount < MAX_RESIDUE) {
                    threeRef.residuePositions.set([p.position.x, p.position.y, p.position.z], stateRef.residueCount * 3);
                    stateRef.residueCount++;
                    threeRef.residueSystem.geometry.setDrawRange(0, stateRef.residueCount);
                    threeRef.residueSystem.geometry.attributes.position.needsUpdate = true;
                    p.lifespan = 0;
                }
            }
            
            if (p.lifespan <= 0) {
                stateRef.vaporParticles.splice(i, 1);
            } else {
                threeRef.vaporPositions.set([p.position.x, p.position.y, p.position.z], activeVapor * 3);
                activeVapor++;
            }
        }
        threeRef.vaporSystem.geometry.setDrawRange(0, activeVapor);
        threeRef.vaporSystem.geometry.attributes.position.needsUpdate = true;


        // Stimulation
        if (!stateRef.isInhaling) {
            stateRef.stimulationLevel = Math.max(0, stateRef.stimulationLevel - 0.05);
        }
        setStimulationLevel(stateRef.stimulationLevel);

        // --- Visuals & UI ---
        threeRef.flame.position.copy(threeRef.lighterGroup.position).y += 2.1;
        threeRef.flameLight.position.copy(threeRef.lighterGroup.position).y += 2.1;
        threeRef.flameLight.intensity = THREE.MathUtils.lerp(threeRef.flameLight.intensity, stateRef.isHeating ? 5 : 0, 0.2);
        threeRef.flame.visible = stateRef.isHeating;
        if (stateRef.isHeating) {
            threeRef.flame.scale.set(1+Math.cos(Date.now()*0.15)*0.1, 1+Math.sin(Date.now()*0.2)*0.1, 1+Math.cos(Date.now()*0.15)*0.1);
        }

        // Update stats (throttled implicitly by requestAnimationFrame)
        setStats({
            bowlTemp: stateRef.liquidPool.temperature,
            vaporCount: stateRef.vaporParticles.length,
            residueCount: stateRef.residueCount,
            pipeRotation: THREE.MathUtils.radToDeg(threeRef.pipeGroup.rotation.x),
            isHeating: stateRef.isHeating,
            isInhaling: stateRef.isInhaling,
        });

        threeRef.renderer.render(threeRef.scene, threeRef.camera);
    }, [threeRef, stateRef, playKnock, showSubtitle]);

    useEffect(() => {
        if (!mountRef.current) return;

        // --- Scene Setup ---
        const scene = new THREE.Scene();
        threeRef.scene = scene;
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 15);
        camera.lookAt(0, 2, 0);
        threeRef.camera = camera;
        
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        mountRef.current.appendChild(renderer.domElement);
        threeRef.renderer = renderer;

        const orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.target.set(0, 2, 0);
        orbitControls.enableDamping = true;
        orbitControls.minDistance = 5;
        orbitControls.maxDistance = 20;
        threeRef.orbitControls = orbitControls;
        
        threeRef.clock = new THREE.Clock();
        
        // --- Lighting & Environment ---
        scene.add(new THREE.AmbientLight(0x404040, 2.5));
        const bulbLight = new THREE.PointLight(0xffddaa, 5, 25, 1.5);
        bulbLight.position.set(0, 7, 0);
        scene.add(bulbLight);

        // Bathroom environment (simplified functions from original)
        const createGrittyTexture = (w: number, h: number, bc: string, gc: any) => new THREE.CanvasTexture(document.createElement('canvas'));
        const wallMat = new THREE.MeshStandardMaterial({color: '#b2afa4'});
        const floorMat = new THREE.MeshStandardMaterial({color: '#333'});
        const roomSize = 25, wallHeight = 10;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), floorMat);
        floor.rotation.x = -Math.PI / 2; floor.position.y = -wallHeight;
        const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight * 2), wallMat);
        wallBack.position.z = -roomSize / 2;
        scene.add(floor, wallBack);

        // --- Person Model ---
        const personGroup = new THREE.Group();
        scene.add(personGroup);
        const loader = new GLTFLoader();
        const decodedData = Uint8Array.from(atob(MODEL_DATA_BASE64), c => c.charCodeAt(0));
        loader.parse(decodedData.buffer, '', (gltf) => {
            const model = gltf.scene;
            model.scale.set(4, 4, 4);
            model.position.y = -10;
            model.rotation.y = Math.PI / 2;
            model.traverse((child: any) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({ color: 0xDEB887, roughness: 0.8, metalness: 0.1 });
                }
            });
            personGroup.add(model);
        });
        
        // --- Pipe Geometry ---
        const pipeGroup = new THREE.Group();
        threeRef.pipeGroup = pipeGroup;
        const glassMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, shininess: 100, side: THREE.DoubleSide });
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(BOWL_RADIUS, 32, 32), glassMaterial);
        threeRef.bowl = bowl;
        pipeGroup.add(bowl);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(STEM_RADIUS, STEM_RADIUS, STEM_LENGTH, 32), glassMaterial);
        stem.rotation.z = Math.PI / 2; stem.position.x = BOWL_RADIUS - 0.2 + STEM_LENGTH / 2;
        pipeGroup.add(stem);
        const mouthpiece = new THREE.Mesh(new THREE.SphereGeometry(MOUTH_RADIUS, 32, 32), glassMaterial);
        mouthpiece.position.x = stem.position.x + STEM_LENGTH / 2;
        pipeGroup.add(mouthpiece);
        threeRef.mouthpiece = mouthpiece;
        pipeGroup.scale.set(0.3, 0.3, 0.3); pipeGroup.position.set(0, 2.5, 2);
        personGroup.add(pipeGroup);
        
        // --- Torch Lighter ---
        const lighterGroup = new THREE.Group();
        lighterGroup.position.y = -4;
        const lighterBody = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 32), new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.3, metalness: 0.1 }));
        lighterGroup.add(lighterBody);
        const metalTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.1, metalness: 0.9 }));
        metalTop.position.y = 1.25;
        lighterGroup.add(metalTop);
        scene.add(lighterGroup);
        threeRef.lighterGroup = lighterGroup;
        
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.2, 16), new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
        flame.visible = false;
        scene.add(flame);
        threeRef.flame = flame;
        const flameLight = new THREE.PointLight(0x88aaff, 0, 10);
        scene.add(flameLight);
        threeRef.flameLight = flameLight;
        
        const dragControls = new DragControls([lighterGroup], camera, renderer.domElement);
        dragControls.addEventListener('dragstart', () => { orbitControls.enabled = false; stateRef.isLighterHeld = true; });
        dragControls.addEventListener('dragend', () => { orbitControls.enabled = true; stateRef.isLighterHeld = false; });
        threeRef.dragControls = dragControls;
        
        // --- Liquid & Particles ---
        threeRef.liquidPoolMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xf5f5f4, transparent: true, opacity: 0.6, roughness: 0.1 }));
        threeRef.liquidPoolMesh.visible = false;
        pipeGroup.add(threeRef.liquidPoolMesh);
        
        const vaporGeometry = new THREE.BufferGeometry();
        threeRef.vaporPositions = new Float32Array(MAX_VAPOR * 3);
        vaporGeometry.setAttribute('position', new THREE.BufferAttribute(threeRef.vaporPositions, 3));
        threeRef.vaporSystem = new THREE.Points(vaporGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
        pipeGroup.add(threeRef.vaporSystem);

        const residueGeometry = new THREE.BufferGeometry();
        threeRef.residuePositions = new Float32Array(MAX_RESIDUE * 3);
        residueGeometry.setAttribute('position', new THREE.BufferAttribute(threeRef.residuePositions, 3));
        threeRef.residueSystem = new THREE.Points(residueGeometry, new THREE.PointsMaterial({ color: 0x4d443a, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
        pipeGroup.add(threeRef.residueSystem);
        
        // --- Event Listeners ---
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') stateRef.isInhaling = true;
            if (e.key === 'q' || e.key === 'Q') stateRef.pipeTargetRotationX = (stateRef.pipeTargetRotationX === Math.PI / 4) ? 0 : Math.PI / 4;
            if (e.key === 'e' || e.key === 'E') stateRef.pipeTargetRotationX = (stateRef.pipeTargetRotationX === -Math.PI / 4) ? 0 : -Math.PI / 4;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') stateRef.isInhaling = false;
        };
        
        const initAudio = () => {
             Tone.start();
             threeRef.knockSynth = new Tone.MembraneSynth({
                 pitchDecay: 0.01,
                 octaves: 2,
                 envelope: { attack: 0.001, decay: 0.5, sustain: 0 }
             }).toDestination();
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', initAudio, { once: true });
        
        // --- Initial Setup ---
        onShardSizeChange(INITIAL_SHARD_SIZE);
        animate();

        // --- Cleanup ---
        return () => {
            cancelAnimationFrame(threeRef.animationFrameId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', initAudio);
            dragControls.dispose();
            renderer.dispose();
            mountRef.current?.removeChild(renderer.domElement);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { stats, stimulationLevel, subtitle, handleShardSizeChange: onShardSizeChange };
};