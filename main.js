import * as THREE from 'three';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {ARButton} from 'three/addons/webxr/ARButton.js';
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {FontLoader} from "three/addons";

class ARAnimalApp {
    constructor() {
        this.ARContainer = null;
        this.camera = null;
        this.renderer = null;
        this.scene = null;
        this.controller = null;
        this.reticle = null;
        this.animalScene = null;
        this.animalInfoCard = null;
        this.animalSound = null;

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
        this.setupResizeListener();
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
        this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.ARContainer.appendChild(this.renderer.domElement);
    }

    setupARButton() {
        const arButton = ARButton.createButton(this.renderer, {requiredFeatures: ['hit-test']});
        document.body.appendChild(arButton);
    }

    createAudio() {
        const audioListener = new THREE.AudioListener();
        this.camera.add(audioListener);

        const animalSound = new THREE.Audio(audioListener);
        this.animalSound = animalSound;
        this.scene.add(animalSound);
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
        if (this.animalInfoCard) {
            return this.hideAnimalInfo();
        }

        const controllerPos = new THREE.Vector3().setFromMatrixPosition(this.controller.matrixWorld);
        const controllerDir = new THREE.Vector3(0, 0, -1).transformDirection(this.controller.matrixWorld);
        const raycaster = new THREE.Raycaster(controllerPos, controllerDir);

        const intersects = raycaster.intersectObjects(this.animalScene ? [this.animalScene] : []);

        if (intersects.length > 0) {
            return this.displayAnimalInfo();
        } else if (this.reticle.visible) {
            return this.loadNextAnimal();
        }
    }

    displayAnimalInfo() {
        const loader = new FontLoader();

        loader.load('fonts/Lemon_Regular.json', (font) => {
            const animalSelected = ANIMALS[this.animalSelectedIndex];

            const textGeometry = new TextGeometry(`${animalSelected.name}\n\n${animalSelected.description}`, {
                font: font,
                size: 0.003,
                height: 0.001,
            });

            const textMaterial = new THREE.MeshBasicMaterial({
                color: 0xFFFFFF,
                transparent: true,
                opacity: 0.8,
            });

            const textMesh = new THREE.Mesh(textGeometry, textMaterial);

            const backgroundGeometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
            const backgroundMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.7,
            });

            const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);

            const textBoundingBox = new THREE.Box3().setFromObject(textMesh);
            textMesh.position.set(
                -textBoundingBox.max.x / 2,
                0.1,
                0
            );

            this.animalInfoCard = new THREE.Object3D(); // Utilisez un objet de référence
            this.animalInfoCard.add(textMesh);
            this.animalInfoCard.add(backgroundMesh);

            this.scene.add(this.animalInfoCard);
        });
    }

    hideAnimalInfo() {
        this.scene.remove(this.animalInfoCard);
        this.animalInfoCard = null;
    }

    updateAnimalInfoPosition() {
        if (this.animalInfoCard) {
            // Mettez à jour la position en fonction de la caméra
            this.animalInfoCard.position.set(0, 0, -0.2).applyMatrix4(this.camera.matrixWorld);
            this.animalInfoCard.quaternion.setFromRotationMatrix(this.camera.matrixWorld);
        }
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

    setupResizeListener() {
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
                session.requestHitTestSource({space: referenceSpace}).then((source) => {
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

        this.updateAnimalInfoPosition();
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

                if (speechResult.toLowerCase().includes(animalSelected.name.toLowerCase())) {
                    const audioLoader = new THREE.AudioLoader();

                    audioLoader.load(`./sounds/${animalSelected.file}.mp3`, (buffer) => {
                        this.animalSound.stop();
                        this.animalSound.setBuffer(buffer);
                        this.animalSound.setLoop(false);
                        this.animalSound.position.copy(this.animalScene.position);
                        this.animalSound.play();
                    });
                }
            };

            recognition.onend = () => {
                recognition.start();
            };

            recognition.onerror = () => {
                recognition.start();
            };

            recognition.start();
        }
    }
}

const CONTROLLER_TOUCH_ID = 0;

const ANIMALS = [
    {
        name: 'Renard',
        description: 'Animal très malin et rusé,\n souvent représenté comme un voleur de poules.\n Il mesure entre 60 et 90 cm de long,\n et pèse entre 5 et 10 kg.\n Il vit dans les forêts ou les champs.',
        scale: 0.1,
        file: 'fox'
    },
    {
        name: 'Cerf',
        description: 'Le cerf est un animal majestueux,\n qui vit dans les forêts.\n Il mesure entre 1,5 et 2 mètres de long,\n et pèse entre 100 et 200 kg. Il est herbivore,\n et se nourrit de feuilles, de fruits et de\n champignons.',
        scale: 0.8,
        file: 'deer'
    },
    {
        name: 'Chat',
        description: 'Le chat est un animal domestique,\n qui vit dans les maisons.\n Il mesure entre 30 et 40 cm de long,\n et pèse entre 3 et 5 kg.\n Il est carnivore, et se nourrit de viande\n et de poisson.',
        scale: 0.001,
        file: 'cat'
    },
    {
        name: 'Poisson',
        description: 'Les poissons sont des animaux aquatiques,\n qui vivent dans les mers et les océans.\n Ils se nourrissent de plancton.',
        scale: 0.1,
        file: 'fish'
    },
    {
        name: 'Cheval',
        description: 'Le cheval est un animal domestique,\n qui vit dans les écuries.\n Il mesure entre 1,4 et 1.7 mètres de long,\n et pèse entre 500 et 1000 kg. Il est herbivore,\n et se nourrit d\'herbe et de foin.',
        scale: 0.1,
        file: 'horse'
    }
];

new ARAnimalApp();
