import * as THREE from 'three';
import {ARButton} from 'three/addons/webxr/ARButton.js';
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

const animals = [
    {
        name: 'Fox 🦊',
        scale: 0.1,
        model: 'fox.glb'
    }, {
        name: 'Deer 🦌',
        scale: 0.8,
        model: 'deer.glb'
    }, {
        name: 'Cat 🐈',
        scale: 0.001,
        model: 'cat.glb'
    }, {
        name: 'Fish 🐟',
        scale: 0.05,
        model: 'fish.glb'
    }, {
        name: 'Horse 🐴',
        scale: 0.1,
        model: 'horse.glb'
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

    function onSelect() {
        if (reticle.visible) {
            const animalSelected = animals[animalSelectedIndex];
            const loader = new GLTFLoader();
            loader.load(`./animals/${animalSelected.model}`, function (gltf) {
                if (animalScene) {
                    scene.remove(animalScene);
                }
                animalScene = gltf.scene;
                reticle.matrix.decompose(gltf.scene.position, gltf.scene.quaternion, gltf.scene.scale);
                animalScene.scale.set(animalSelected.scale, animalSelected.scale, animalSelected.scale);
                scene.add(gltf.scene);
            });

            // update animal index to next
            animalSelectedIndex = (animalSelectedIndex + 1) % animals.length;
        }
    }

    controller = renderer.xr.getController(0);
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