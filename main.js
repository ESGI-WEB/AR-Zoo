import * as THREE from 'three';
import {ARButton} from 'three/addons/webxr/ARButton.js';
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {Text} from 'troika-three-text'

const CONTROLLER_TOUCH_ID = 0;
const animals = [
    {
        name: 'Fox 🦊',
        speech: 'renard',
        scale: 0.1,
        file: 'fox'
    }, {
        name: 'Deer 🦌',
        speech: 'cerf',
        scale: 0.8,
        file: 'deer'
    }, {
        name: 'Cat 🐈',
        speech: 'chat',
        scale: 0.001,
        file: 'cat'
    }, {
        name: 'Fish 🐟',
        speech: 'poisson',
        scale: 0.05,
        file: 'fish'
    }, {
        name: 'Horse 🐴',
        speech: 'cheval',
        scale: 0.1,
        file: 'horse'
    }
];
let animalSelectedIndex = 0;
let hitTestSource = null;
let hitTestSourceRequested = false;
let arContainer;
let camera, scene, renderer;
let controller;
let reticle;
let animalScene;
let animalText;


// Init the scene
init();
// Start the animation loop when everything has loaded
animate();

function init() {
    arContainer = document.createElement('div');
    document.body.appendChild(arContainer);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    arContainer.appendChild(renderer.domElement);

    const arButton = ARButton.createButton(renderer, {requiredFeatures: ['hit-test']});
    document.body.appendChild(arButton);

    // instantiate a listener
    const audioListener = new THREE.AudioListener();

// add the listener to the camera
    camera.add( audioListener );

// instantiate audio object
    const oceanAmbientSound = new THREE.Audio( audioListener );

// add the audio object to the scene
    scene.add( oceanAmbientSound );

    const raycaster = new THREE.Raycaster();
    const controllerPos = new THREE.Vector3(); // Vecteur pour stocker la position du contrôleur
    const controllerDir = new THREE.Vector3(); // Vecteur pour stocker la direction du contrôleur
    controller = renderer.xr.getController(CONTROLLER_TOUCH_ID);

    function onSelect() {
        controllerPos.setFromMatrixPosition(controller.matrixWorld);
        controllerDir.set(0, 0, -1).transformDirection(controller.matrixWorld);

        raycaster.set(controllerPos, controllerDir);

        const intersects = raycaster.intersectObjects(animalScene ? [animalScene] : []);
        // remove previous text if exists
        if (animalText) {
            scene.remove(animalText);
        }


        if (intersects.length > 0) {
            if (!animalScene) {
                return;
            }
            // display animal name over the animal
            const animalSelected = animals[animalSelectedIndex];

            animalText = new Text();
            animalText.text = animalSelected.name
            animalText.fontSize = 0.1
            animalText.color = 0x9966FF
            // set position of text over the animal
            // Get the bounding box of the loaded object
            const boundingBox = new THREE.Box3().setFromObject(animalScene);

            // Calculate the height of the bounding box
            const height = boundingBox.max.y - boundingBox.min.y;

            // Set the position of the text above the animalScene
            animalText.position.set(animalScene.position.x + 0.2, animalScene.position.y + height, animalScene.position.z);
            animalText.sync()
            scene.add(animalText)
        } else if (reticle.visible) {
            // update animal index to next
            animalSelectedIndex = (animalSelectedIndex + 1) % animals.length;
            const animalSelected = animals[animalSelectedIndex];
            const loader = new GLTFLoader();
            loader.load(`./animals/${animalSelected.file}.glb`, function (gltf) {
                if (animalScene) {
                    scene.remove(animalScene);
                }
                animalScene = gltf.scene;
                reticle.matrix.decompose(gltf.scene.position, gltf.scene.quaternion, gltf.scene.scale);
                animalScene.scale.set(animalSelected.scale, animalSelected.scale, animalSelected.scale);
                scene.add(gltf.scene);
            });

        }
    }

    controller.addEventListener('select', onSelect);
    scene.add(controller);

    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    window.addEventListener('resize', onWindowResize);

    // when voice recognition is available, try to recognize speech animal name and play sound
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = function(event) {
            if (!animalScene) {
                return;
            }
            
            const speechResult = event.results[0][0].transcript;
            const animalSelected = animals[animalSelectedIndex];
            console.log(speechResult, animalSelected.speech, speechResult.toLowerCase().includes(animalSelected.speech.toLowerCase()))
            if (speechResult.toLowerCase().includes(animalSelected.speech.toLowerCase())) {
                // play cat sound v1
                // const audio = new Audio('./sounds/cat.mp3');
                // audio.play();

                // v2
                // Charger et jouer le fichier audio associé à l'animal
                const audioLoader = new THREE.AudioLoader();

                // Assurez-vous de placer le fichier audio dans le dossier correct
                audioLoader.load(`./sounds/${animalSelected.file}.mp3`, function (buffer) {
                    oceanAmbientSound.setBuffer(buffer);
                    oceanAmbientSound.position.copy(animalScene.position);
                    oceanAmbientSound.play();
                });
            }
        };

        recognition.onend = function () {
            // Redémarrez la reconnaissance en cas d'erreur
            console.log('end')
            recognition.start();
        }

        recognition.start();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({space: referenceSpace}).then(function (source) {
                    hitTestSource = source;
                });
            });

            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
}