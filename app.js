import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, avatar;
let recognition, mappingData = {};
let isLoaded = false;
let isAnimating = false;
let animationQueue = [];

const container = document.getElementById('canvas-container');
// UPDATED: 'speech-box' is now 'output'
const speechBox = document.getElementById('output'); 
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const langSelect = document.getElementById('lang-select');

async function init() {
    try {
        const response = await fetch('./mapping.json');
        mappingData = await response.json();
        console.log("✅ Mapping Loaded. Words mapped:", Object.keys(mappingData).length);
    } catch (error) {
        console.error("❌ Failed to load mapping.json", error);
        if(speechBox) speechBox.innerText = "Error: mapping.json not found.";
    }

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
        // UPDATED: Added safety check for speechBox
        if(speechBox) speechBox.innerText = "Avatar Ready. Click Start.";
        console.log("✅ Avatar Loaded");
    });
}

function setupSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;

    startBtn.addEventListener('click', () => {
        // UPDATED: Handle CSS classes for the new styling
        startBtn.classList.add('active');
        startBtn.classList.remove('idle');
        startBtn.innerText = "Listening...";
        
        recognition.lang = langSelect.value;
        recognition.start();
        if(speechBox) speechBox.innerText = "Listening...";
    });

    stopBtn.addEventListener('click', () => {
        // UPDATED: Reset button appearance
        startBtn.classList.remove('active');
        startBtn.classList.add('idle');
        startBtn.innerText = "Start Recognition";
        
        recognition.stop();
        if(speechBox) speechBox.innerText = "Stopped.";
    });

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        if(speechBox) speechBox.innerText = transcript; // Clean display for transcription

        const words = transcript.replace(/[.,!?]/g, '').split(' ');
        
        words.forEach(word => {
            if (mappingData[word]) {
                animationQueue.push(word);
            }
        });

        processQueue();
    };
}

// ... (Rest of your processQueue, playAnimation, applyFrame functions remain the same) ...

async function processQueue() {
    if (isAnimating || animationQueue.length === 0) return;
    isAnimating = true;
    const currentWord = animationQueue.shift(); 
    await playAnimation(currentWord); 
    await new Promise(res => setTimeout(res, 300)); 
    isAnimating = false;
    processQueue(); 
}

async function playAnimation(word) {
    return new Promise(async (resolve) => {
        try {
            const animPath = `./animations/${mappingData[word]}`;
            const response = await fetch(animPath);
            const frames = await response.json();
            let currentFrame = 0;
            const fps = 30; 
            const frameInterval = 1000 / fps;

            const timer = setInterval(() => {
                if (currentFrame >= frames.length) {
                    clearInterval(timer);
                    resetToTPose();
                    resolve();
                    return;
                }
                applyFrame(frames[currentFrame]);
                currentFrame++;
            }, frameInterval);
        } catch (error) {
            console.error(`❌ Error playing: ${word}`, error);
            resolve();
        }
    });
}

function applyFrame(frameData) {
    if (!avatar) return;
    for (const [boneName, rot] of Object.entries(frameData)) {
        const bone = avatar.getObjectByName(boneName);
        if (bone) {
            bone.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
        }
    }
    avatar.traverse(c => { if (c.isSkinnedMesh) c.skeleton.update(); });
}

function resetToTPose() {
    if (!avatar) return;
    avatar.traverse(child => {
        if (child.isBone) child.rotation.set(0, 0, 0);
    });
    avatar.traverse(c => { if (c.isSkinnedMesh) c.skeleton.update(); });
}

function animate() {
    requestAnimationFrame(animate);
    if (renderer) renderer.render(scene, camera);
}

init();