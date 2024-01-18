import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Text } from 'troika-three-text';

class ARAnimalApp {
    constructor() {
        this.ARContainer = null;
        this.camera = null;
        this.renderer = null;
        this.scene = null;
        this.controller = null;
        this.reticle = null;
        this.animalScene = null;
        this.animalText = null;

        this.animalSelectedIndex = 0;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;

        this.init();
        this.animate();
    }

    init() {
        this.createARContainer();
        this.createScene();
        this.createLight();
        this.createRenderer();
        this.setupARButton();
        this.createAudio();
        this.createController();
        this.createReticle();
        this.setupEventListeners();
        this.setupSpeechRecognition();
    }

    createARContainer() {
        this.ARContainer = document.createElement('div');
        document.body.appendChild(this.ARContainer);
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    }

    createLight() {
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
        light.position.set(0.5, 1, 0.25);
        this.scene.add(light);
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.ARContainer.appendChild(this.renderer.domElement);
    }

    setupARButton() {
        const arButton = ARButton.createButton(this.renderer, { requiredFeatures: ['hit-test'] });
        document.body.appendChild(arButton);
    }

    createAudio() {
        const audioListener = new THREE.AudioListener();
        this.camera.add(audioListener);

        const oceanAmbientSound = new THREE.Audio(audioListener);
        this.scene.add(oceanAmbientSound);
    }

    createController() {
        this.controller = this.renderer.xr.getController(CONTROLLER_TOUCH_ID);

        this.controller.addEventListener('select', () => this.onSelect());
        this.scene.add(this.controller);
    }

    createReticle() {
        this.reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial()
        );
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    onSelect() {
        const controllerPos = new THREE.Vector3().setFromMatrixPosition(this.controller.matrixWorld);
        const controllerDir = new THREE.Vector3(0, 0, -1).transformDirection(this.controller.matrixWorld);
        const raycaster = new THREE.Raycaster(controllerPos, controllerDir);

        const intersects = raycaster.intersectObjects(this.animalScene ? [this.animalScene] : []);

        if (intersects.length > 0) {
            this.displayAnimalText(intersects);
        } else if (this.reticle.visible) {
            this.loadNextAnimal();
        }
    }

    displayAnimalText() {
        const animalSelected = ANIMALS[this.animalSelectedIndex];

        if (this.animalText) {
            this.scene.remove(this.animalText);
        }

        this.animalText = new Text();
        this.animalText.text = animalSelected.name;
        this.animalText.fontSize = 0.1;
        this.animalText.color = 0x9966FF;

        const boundingBox = new THREE.Box3().setFromObject(this.animalScene);
        const height = boundingBox.max.y - boundingBox.min.y;

        this.animalText.position.set(
            this.animalScene.position.x + 0.2,
            this.animalScene.position.y + height,
            this.animalScene.position.z
        );
        this.animalText.sync();
        this.scene.add(this.animalText);
    }

    loadNextAnimal() {
        this.animalSelectedIndex = (this.animalSelectedIndex + 1) % ANIMALS.length;
        const animalSelected = ANIMALS[this.animalSelectedIndex];
        const loader = new GLTFLoader();

        loader.load(`./animals/${animalSelected.file}.glb`, (gltf) => {
            if (this.animalScene) {
                this.scene.remove(this.animalScene);
            }
            this.animalScene = gltf.scene;
            this.reticle.matrix.decompose(gltf.scene.position, gltf.scene.quaternion, gltf.scene.scale);
            this.animalScene.scale.set(animalSelected.scale, animalSelected.scale, animalSelected.scale);
            this.scene.add(gltf.scene);
        });
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        this.renderer.setAnimationLoop((timestamp, frame) => this.render(timestamp, frame));
    }

    render(timestamp, frame) {
        if (!frame) {
            return;
        }

        const referenceSpace = this.renderer.xr.getReferenceSpace();
        const session = this.renderer.xr.getSession();

        if (this.hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    this.hitTestSource = source;
                });
            });

            session.addEventListener('end', () => {
                this.hitTestSourceRequested = false;
                this.hitTestSource = null;
            });

            this.hitTestSourceRequested = true;
        }

        if (this.hitTestSource) {
            const hitTestResults = frame.getHitTestResults(this.hitTestSource);

            if (hitTestResults.length) {
                const hit = hitTestResults[0];
                this.reticle.visible = true;
                this.reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                this.reticle.visible = false;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    setupSpeechRecognition() {
        if (window.SpeechRecognition || window.webkitSpeechRecognition) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.lang = 'fr-FR';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event) => {
                if (!this.animalScene) {
                    return;
                }

                const speechResult = event.results[0][0].transcript;
                const animalSelected = ANIMALS[this.animalSelectedIndex];

                if (speechResult.toLowerCase().includes(animalSelected.speech.toLowerCase())) {
                    const audioLoader = new THREE.AudioLoader();

                    audioLoader.load(`./sounds/${animalSelected.file}.mp3`, (buffer) => {
                        const oceanAmbientSound = new THREE.Audio(this.camera.children[0]);
                        oceanAmbientSound.setBuffer(buffer);
                        oceanAmbientSound.position.copy(this.animalScene.position);
                        oceanAmbientSound.play();
                    });
                }
            };

            recognition.onend = () => {
                recognition.start();
            };

            recognition.start();
        }
    }
}

const CONTROLLER_TOUCH_ID = 0;

const ANIMALS = [
    {
        name: 'Fox 🦊',
        speech: 'renard',
        scale: 0.1,
        file: 'fox'
    },
    {
        name: 'Deer 🦌',
        speech: 'cerf',
        scale: 0.8,
        file: 'deer'
    },
    {
        name: 'Cat 🐈',
        speech: 'chat',
        scale: 0.001,
        file: 'cat'
    },
    {
        name: 'Fish 🐟',
        speech: 'poisson',
        scale: 0.05,
        file: 'fish'
    },
    {
        name: 'Horse 🐴',
        speech: 'cheval',
        scale: 0.1,
        file: 'horse'
    }
];

new ARAnimalApp();
