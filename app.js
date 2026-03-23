import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, avatar;
let recognition, mappingData = {};
let isLoaded = false;
let isAnimating = false;
let animationQueue = []; // Queues words so they play one after another

const container = document.getElementById('canvas-container');
const speechBox = document.getElementById('speech-box');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const langSelect = document.getElementById('lang-select');

async function init() {
    // 1. LOAD THE MAPPING JSON FIRST
    try {
        const response = await fetch('./mapping.json');
        mappingData = await response.json();
        console.log("✅ Mapping Loaded. Words mapped:", Object.keys(mappingData).length);
    } catch (error) {
        console.error("❌ Failed to load mapping.json. Make sure it is in the same folder as app.js", error);
        speechBox.innerText = "Error: mapping.json not found.";
    }

    // 2. SETUP SCENE
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.2, 3.5);
    camera.lookAt(0, 1.0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 2, 5);
    scene.add(light);

    loadAvatar();
    setupSpeech();
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function loadAvatar() {
    const loader = new GLTFLoader();
    loader.load('./models/avatar.glb', (gltf) => {
        avatar = gltf.scene;
        avatar.rotation.y = Math.PI; 
        avatar.position.set(0, 0.2, 0); 
        
        avatar.traverse(n => { if (n.isBone) n.matrixAutoUpdate = true; });

        scene.add(avatar);
        isLoaded = true;
        speechBox.innerText = "Avatar and Mapping Ready. Click Start.";
        console.log("✅ Avatar Loaded");
    });
}

// --- SPEECH RECOGNITION & QUEUEING ---
function setupSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;

    startBtn.addEventListener('click', () => {
        recognition.lang = langSelect.value;
        recognition.start();
        speechBox.innerText = "Listening...";
        console.log("🎤 Mic Started");
    });

    stopBtn.addEventListener('click', () => {
        recognition.stop();
        speechBox.innerText = "Stopped.";
    });

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        speechBox.innerText = `Heard: "${transcript}"`;
        console.log("👂 Heard:", transcript);

        // Remove punctuation and split into words
        const words = transcript.replace(/[.,!?]/g, '').split(' ');
        
        // Check if words exist in mapping.json, if so, add to queue
        words.forEach(word => {
            if (mappingData[word]) {
                animationQueue.push(word);
            } else {
                console.log(`Word '${word}' not found in mapping.json`);
            }
        });

        // Start playing the queue if not already playing
        processQueue();
    };
}

// --- ANIMATION CONTROLLER ---
async function processQueue() {
    if (isAnimating || animationQueue.length === 0) return;
    
    isAnimating = true;
    const currentWord = animationQueue.shift(); // Take first word from queue
    
    await playAnimation(currentWord); // Wait for animation to finish
    
    // Quick pause between words
    await new Promise(res => setTimeout(res, 300)); 
    
    isAnimating = false;
    processQueue(); // Play next word if any
}

// --- FETCH AND PLAY JSON FRAMES ---
async function playAnimation(word) {
    return new Promise(async (resolve) => {
        try {
            // mappingData[word] looks like "A/apple.json"
            const animPath = `./animations/${mappingData[word]}`;
            const response = await fetch(animPath);
            const frames = await response.json();

            console.log(`🎬 Playing '${word}' (${frames.length} frames)`);

            let currentFrame = 0;
            const fps = 30; // Matches standard Colab export speed
            const frameInterval = 1000 / fps;

            const timer = setInterval(() => {
                if (currentFrame >= frames.length) {
                    clearInterval(timer);
                    resetToTPose(); // Go back to resting position
                    resolve(); // Tell the queue we are done
                    return;
                }

                applyFrame(frames[currentFrame]);
                currentFrame++;
            }, frameInterval);

        } catch (error) {
            console.error(`❌ Error playing animation for '${word}':`, error);
            resolve(); // Skip and continue if error occurs
        }
    });
}

function applyFrame(frameData) {
    if (!avatar) return;

    // Read every bone in the current frame and apply rotation
    for (const [boneName, rot] of Object.entries(frameData)) {
        const bone = avatar.getObjectByName(boneName);
        if (bone) {
            // Assuming your JSON exports Euler angles (x, y, z)
            bone.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
        }
    }
    
    // Force the skin/mesh to update to the new bone positions
    avatar.traverse(c => { if (c.isSkinnedMesh) c.skeleton.update(); });
}

function resetToTPose() {
    if (!avatar) return;
    // You can customize this if your resting pose isn't perfectly 0,0,0
    avatar.traverse(child => {
        if (child.isBone) {
            child.rotation.set(0, 0, 0);
        }
    });
    avatar.traverse(c => { if (c.isSkinnedMesh) c.skeleton.update(); });
}

function animate() {
    requestAnimationFrame(animate);
    if (renderer) renderer.render(scene, camera);
}

init();