import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { PortalSystem } from './PortalSystem';

export class XRManager {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    
    private reticle: THREE.Mesh;
    private hitTestSource: any = null; // XRHitTestSource type definition might be missing in basic types
    private hitTestSourceRequested: boolean = false;
    private hasPlaced: boolean = false; // Flag for auto-placement
    
    private portalSystem: PortalSystem;
    private controller: THREE.XRTargetRaySpace;

    // Config for scenes
    private readonly SCENES = {
        store: 'https://glb.keithhe.com/ar/door/store-hywbtsc9s9.spz',
        hall: 'https://glb.keithhe.com/ar/spz/cathulu_hall.spz',
        town: 'https://glb.keithhe.com/ar/spz/ancient_town.spz',
        planet: 'https://glb.keithhe.com/ar/spz/planet.spz'
    };

    constructor() {
        // 1. Setup Scene
        this.scene = new THREE.Scene();

        // 2. Setup Camera
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        // 3. Setup Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // 4. Setup Lighting
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        light.position.set(0.5, 1, 0.25);
        this.scene.add(light);

        // 5. Setup Reticle
        this.reticle = this.createReticle();
        this.scene.add(this.reticle);
        
        // 6. Setup Portal System
        this.portalSystem = new PortalSystem();
        this.scene.add(this.portalSystem.group);

        // 7. Setup Controller (Input)
        this.controller = this.renderer.xr.getController(0);
        this.controller.addEventListener('select', this.onSelect.bind(this));
        this.scene.add(this.controller);

        // 8. Setup AR Button with DOM Overlay (Hidden, driven by custom UI)
        const overlay = document.getElementById('overlay');
        const arButton = ARButton.createButton(this.renderer, { 
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: overlay! }
        });
        
        // Hide default button
        arButton.style.display = 'none';
        document.body.appendChild(arButton);

        // Custom Start Logic
        const startPrompt = document.getElementById('start-prompt');
        if (startPrompt) {
            startPrompt.addEventListener('click', () => {
                // Programmatically trigger AR session
                // We simulate a click on the hidden ARButton or call logic directly if exposed
                // Since ARButton logic is internal, we can try to click it
                arButton.click();
                startPrompt.style.display = 'none';
            });
        }

        // 9. Event Listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // 10. UI Binding
        this.setupUI();
    }

    private setupUI() {
        const selector = document.getElementById('scene-selector') as HTMLSelectElement;
        if (selector) {
            selector.addEventListener('change', (e) => {
                const value = (e.target as HTMLSelectElement).value;
                this.handleSceneChange(value);
            });
        }
    }

    private handleSceneChange(sceneKey: string) {
        console.log(`[XRManager] Switching to scene: ${sceneKey}`);
        
        // @ts-ignore
        const url = this.SCENES[sceneKey];
        if (url) {
            this.portalSystem.loadSplat(url);
        } else {
            console.warn(`[XRManager] Unknown scene key: ${sceneKey}`);
        }
    }

    private onSelect() {
        if (this.reticle.visible) {
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(this.reticle.matrix);
            this.portalSystem.place(position, this.camera);
        }
    }

    private createReticle(): THREE.Mesh {
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green
        const reticle = new THREE.Mesh(geometry, material);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        return reticle;
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public start() {
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    private render(_timestamp: number, frame: any) {
        if (frame) {
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const session = this.renderer.xr.getSession() as any;

            if (this.hitTestSourceRequested === false && session) {
                session.requestReferenceSpace('viewer').then((referenceSpace: any) => {
                    session.requestHitTestSource({ space: referenceSpace }).then((source: any) => {
                        this.hitTestSource = source;
                    });
                });

                session.addEventListener('end', () => {
                    this.hitTestSourceRequested = false;
                    this.hitTestSource = null;
                });

                this.hitTestSourceRequested = true;
            }

            if (this.hitTestSource && referenceSpace) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);

                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const pose = hit.getPose(referenceSpace);
                    
                    if (pose) {
                        // this.reticle.visible = true;
                        // this.reticle.matrix.fromArray(pose.transform.matrix);
                        
                        // Auto-place if not yet placed
                        if (!this.hasPlaced) {
                            this.hasPlaced = true;
                            const position = new THREE.Vector3();
                            // Use the hit test pose directly for placement, no need for reticle
                            const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
                            position.setFromMatrixPosition(matrix);
                            
                            this.portalSystem.place(position, this.camera);
                        }
                    }
                }
            }
        }

        this.portalSystem.update(this.camera);
        this.renderer.render(this.scene, this.camera);
    }

    public getReticle(): THREE.Mesh {
        return this.reticle;
    }
}
