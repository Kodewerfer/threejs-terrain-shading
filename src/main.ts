import './style.css';

import * as THREE from 'three';

import {Timer} from "three/examples/jsm/misc/Timer.js";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {mergeVertices} from "three/addons/utils/BufferGeometryUtils.js";
import {Mesh, Scene, TextureLoader} from "three";
import GUI from 'lil-gui'

import {RGBELoader} from 'three/addons/loaders/RGBELoader.js'
import injectShaderCode from "./injectShader.ts";
import makeTextureRepeat from "./utils.ts";
import injectShaderSplattingMap from "./injectShader-splattingMap.ts";

(() => {
    
    let mainCanvas = document.querySelector('.main-render');
    if (!mainCanvas) return;
    
    let mainRenderer = new THREE.WebGLRenderer({antialias: true, canvas: mainCanvas});
    mainRenderer.setSize(window.innerWidth, window.innerHeight);
    mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    const params = {
        cam: {
            fov: 75,
            aspect: window.innerWidth / window.innerHeight,
            near: .1,
            far: 1000,
            position: {
                x: 0,
                y: 0,
                z: 0,
            },
        }
    }
    
    const mainScene = new THREE.Scene();
    
    const rgbeLoader = new RGBELoader()
    rgbeLoader.load('./static/aristea_wreck_1k.hdr', (environmentMap: any) => {
        environmentMap.mapping = THREE.EquirectangularReflectionMapping
        
        // mainScene.background = environmentMap
        mainScene.environment = environmentMap
    })
    
    let perspectiveCamera = new THREE.PerspectiveCamera(params.cam.fov, params.cam.aspect, params.cam.near, params.cam.far);
    perspectiveCamera.position.set(params.cam.position.x, params.cam.position.y, params.cam.position.z);
    mainScene.add(perspectiveCamera);
    
    const controls = new OrbitControls(perspectiveCamera, (mainCanvas as HTMLCanvasElement));
    controls.enableDamping = true;
    
    const textureLoader = new TextureLoader();
    
    
    // Ambient light
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.5);
    mainScene.add(ambientLight);
    
    // Directional light
    const directionalLight = new THREE.DirectionalLight('#ffffff', 3.5);
    directionalLight.castShadow = true;
    // directionalLight.position.set(3, 2, -8);
    directionalLight.position.set(0.25, 2, -2.25);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    directionalLight.shadow.camera.far = 15;
    directionalLight.shadow.normalBias = 0.05;
    mainScene.add(directionalLight);
    
    window.addEventListener('resize', () => {
        // Update camera
        perspectiveCamera.aspect = window.innerWidth / window.innerHeight
        perspectiveCamera.updateProjectionMatrix()
        
        // Update renderer
        mainRenderer.setSize(window.innerWidth, window.innerHeight)
        mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    });
    
    mainRenderer.shadowMap.enabled = true
    mainRenderer.shadowMap.type = THREE.PCFSoftShadowMap
    mainRenderer.toneMapping = THREE.ACESFilmicToneMapping
    mainRenderer.toneMappingExposure = 1
    mainRenderer.render(mainScene, perspectiveCamera);
    
    // DEMO related
    let debugUI = new GUI({width: 325});
    let demoObject = 0;
    
    makePlaneAndAdd(mainScene, textureLoader, perspectiveCamera, debugUI);
    
    document.querySelector("#switch-demo")?.addEventListener("click", () => {
        resetDemo(mainScene, debugUI);
        debugUI = new GUI({width: 325});
        if (demoObject === 0) {
            demoObject = 1;
            makeTerrainAndAdd(mainScene, textureLoader, perspectiveCamera, debugUI);
        } else {
            demoObject = 0;
            makePlaneAndAdd(mainScene, textureLoader, perspectiveCamera, debugUI);
        }
    });
    
    const mainTimer = new Timer();
    const tick = (timestamp: number) => {
        controls.update();
        mainTimer.update(timestamp);
        // let elapsed = mainTimer.getElapsed();
        
        mainRenderer.render(mainScene, perspectiveCamera);
        
        requestAnimationFrame(tick);
    };
    
    requestAnimationFrame(tick);
    
})();

function makeTerrainAndAdd(scene: Scene, textureLoader: TextureLoader, camera: THREE.PerspectiveCamera, gui: GUI) {
    
    const {
        baseColorTexture,
        aoMapTexture,
        normalMapTexture,
    } = loadPrimaryTextures(textureLoader);
    
    camera.position.set(80, 30, -205);
    
    const TerrainAlphaTexture = textureLoader.load("./static/Landscape_Terrain_PBR_Alpha.png");
    TerrainAlphaTexture.flipY = false;
    
    const gltfLoader = new GLTFLoader();
    gltfLoader.load("./static/Terrain-bare.glb", (gltf) => {
        let mesh = gltf.scene.children[0] as Mesh;
        // Notice: this mesh already had tangent computed in blender
        
        let terrainMat = new THREE.MeshStandardMaterial({
            map: baseColorTexture,
            normalMap: normalMapTexture,
            normalMapType: THREE.TangentSpaceNormalMap,
            aoMap: aoMapTexture,
            alphaMap: TerrainAlphaTexture,
            transparent: true,
            
        });
        
        injectShaderSplattingMap(terrainMat, textureLoader, gui, 15);
        
        // mesh.geometry.computeTangents();
        mesh.material = terrainMat;
        
        scene.add(gltf.scene.children[0]);
    });
}

function makePlaneAndAdd(scene: Scene, textureLoader: TextureLoader, camera: THREE.PerspectiveCamera, gui: GUI) {
    
    const {
        baseColorTexture,
        aoMapTexture,
        normalMapTexture,
    } = loadPrimaryTextures(textureLoader);
    
    camera.position.set(0, 0, 8);
    
    let planeGeo = new THREE.PlaneGeometry(10, 10, 100, 100);
    // @ts-ignore
    planeGeo = mergeVertices(planeGeo);
    planeGeo.computeTangents();
    
    const injectedMeshStandardMaterial = new THREE.MeshStandardMaterial({
        map: baseColorTexture,
        normalMap: normalMapTexture,
        normalMapType: THREE.TangentSpaceNormalMap,
        aoMap: aoMapTexture,
    });
    
    injectShaderCode(injectedMeshStandardMaterial, textureLoader, gui, 15);
    
    let planeTester = new THREE.Mesh(planeGeo, injectedMeshStandardMaterial);
    scene.add(planeTester);
    
    return planeTester;
}


// utils
function loadPrimaryTextures(textureLoader: TextureLoader) {
    const baseColorTexture = textureLoader.load("./static/terrainMaps/Canyon_Rocky_Ground_vbooeagg_1K_BaseColor.jpg");
    baseColorTexture.colorSpace = THREE.SRGBColorSpace;
    makeTextureRepeat(baseColorTexture);
    
    const aoMapTexture = textureLoader.load("./static/terrainMaps/Canyon_Rocky_Ground_vbooeagg_1K_AO.jpg");
    makeTextureRepeat(aoMapTexture, 15);
    
    const normalMapTexture = textureLoader.load("./static/terrainMaps/Canyon_Rocky_Ground_vbooeagg_1K_Normal.jpg");
    makeTextureRepeat(normalMapTexture);
    
    return {
        baseColorTexture,
        aoMapTexture,
        normalMapTexture,
    }
}

function resetDemo(mainScene: Scene, debugUI?: GUI) {
    
    if (debugUI) {
        debugUI.destroy();
    }
    
    let target = null;
    mainScene.traverse((object) => {
        if (object.type === 'Mesh') {
            target = object;
        }
    });
    
    if (!target) return;
    let meshObject = target as Mesh;
    mainScene.remove(target);
    meshObject.geometry.dispose();
    if (meshObject.material && !Array.isArray(meshObject.material)) {
        meshObject.material.dispose();
    }
}
