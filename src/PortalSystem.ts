import * as THREE from 'three';
import { DropInViewer } from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PortalSystem {
    public group: THREE.Group;
    private frame: THREE.Object3D | null = null;
    private viewer: DropInViewer | null = null;
    private splatMesh: THREE.Mesh | null = null;
    private mixer: THREE.AnimationMixer | null = null;
    private storedAction: THREE.AnimationAction | null = null;
    
    private isLoading: boolean = false;

    // Baseline mode (Option 1):
    // - Prioritize "always visible" splat like 88afca3
    // - No hider walls, no stencil clipping, no inside/outside state machine
    // - Keep door animation + scene switching UX
    private readonly viewerBehindDoorZ = 0.9; // put splat behind the door so user starts OUTSIDE

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false; // Hidden until placed

        // Determine Assets URLs
        // Priority:
        // 1. Full URL from Env Var (VITE_SPLAT_URL / VITE_DOOR_URL)
        // 2. Constructed from VITE_ASSETS_URL + Default Filename
        // 3. Default CDN URLs (Hardcoded fallback)
        
        const DEFAULT_SPLAT_URL = 'https://glb.keithhe.com/ar/door/store-hywbtsc9s9.spz';
        const DEFAULT_DOOR_URL = 'https://glb.keithhe.com/ar/door/door-84s5k3c8k4.glb';

        let splatUrl = import.meta.env.VITE_SPLAT_URL;
        let doorUrl = import.meta.env.VITE_DOOR_URL;

        // If specific URLs are not set, try to construct from ASSETS_URL or use defaults
        if (!splatUrl) {
            const baseUrl = import.meta.env.VITE_ASSETS_URL;
            if (baseUrl) {
                const slash = baseUrl.endsWith('/') ? '' : '/';
                splatUrl = `${baseUrl}${slash}store.spz`; // Fallback to standard name if using generic asset base
            } else {
                splatUrl = DEFAULT_SPLAT_URL;
            }
        }

        if (!doorUrl) {
            const baseUrl = import.meta.env.VITE_ASSETS_URL;
            if (baseUrl) {
                const slash = baseUrl.endsWith('/') ? '' : '/';
                doorUrl = `${baseUrl}${slash}door_frame.glb`; // Fallback to standard name if using generic asset base
            } else {
                doorUrl = DEFAULT_DOOR_URL;
            }
        }
        
        console.log(`[PortalSystem] Loading Splat from: ${splatUrl}`);
        console.log(`[PortalSystem] Loading Door from: ${doorUrl}`);

        // Viewer (splat container) - we will load the splat via XRManager (scene selection)
        this.createFreshViewer();

        // 3. Frame (The "Door") - Load GLB
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(doorUrl, (gltf) => {
            this.frame = gltf.scene;
            this.frame.renderOrder = 2;
            
            // Animation Setup
            if (gltf.animations && gltf.animations.length > 0) {
                console.log(`[PortalSystem] Found ${gltf.animations.length} animations in door model.`);
                this.mixer = new THREE.AnimationMixer(this.frame);
                // Setup the first animation but DO NOT play it yet
                const action = this.mixer.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.timeScale = 1.0; // Normal speed (faster than 0.5)
                
                // Reset to frame 0 and stop
                action.reset();
                action.stop();
                
                this.storedAction = action;
            }

            this.frame.traverse((child: any) => {
                 if (child.isMesh) {
                     child.renderOrder = 2;
                     if (child.material) {
                         child.material.depthTest = true;
                     }
                 }
            });
            
            // Put the visible door slightly toward the camera (portal plane is around z=0)
            // After `lookAt(camera)`, camera is on local -Z side; so negative z is "toward camera".
            this.frame.position.z = -0.02;
            this.group.add(this.frame);
        }, undefined, (error) => {
             console.warn("Failed to load door_frame.glb, falling back to wireframe", error);
             // Fallback to wireframe
             const frameGeo = new THREE.BoxGeometry(1.1, 2.1, 0.1);
             frameGeo.translate(0, 1.05, 0);
             const frameMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
             this.frame = new THREE.Mesh(frameGeo, frameMat);
             this.frame.renderOrder = 2;
             this.group.add(this.frame);
        });
    }

    private createFreshViewer() {
        if (this.viewer) this.group.remove(this.viewer);

        this.viewer = new DropInViewer({
            sharedMemoryForWorkers: false,
        });

        // Align to Y-up. (Old -90deg caused "ceiling view")
        this.viewer.rotation.x = 0;
        // Put the splat behind the door by default to avoid starting "inside" the splat
        this.viewer.position.set(0, 0, this.viewerBehindDoorZ);
        this.group.add(this.viewer);
    }

    public place(position: THREE.Vector3, camera: THREE.Camera) {
        this.group.position.copy(position);
        this.group.visible = true;

        // Y-Axis Billboarding
        const targetPos = new THREE.Vector3();
        camera.getWorldPosition(targetPos);
        targetPos.y = position.y; // Keep target on same level as portal

        this.group.lookAt(targetPos);

        // Play Door Animation if available
        this.playDoorAnimation();
    }

    private playDoorAnimation() {
        if (this.storedAction) {
            this.storedAction.reset();
            this.storedAction.play();
        }
    }

    public update(_camera: THREE.Camera) {
        // Update Animation
        if (this.mixer) {
            this.mixer.update(0.016); // Approximate delta time (60fps)
        }
    }
    
    public loadSplat(url: string): Promise<void> {
        if (this.isLoading) {
            console.warn('[PortalSystem] Load already in progress, ignoring request.');
            return Promise.resolve();
        }
        this.isLoading = true;

        console.log(`[PortalSystem] Loading Splat from: ${url}`);
        
        // Baseline approach: recreate viewer per scene switch to avoid internal state corruption.
        this.createFreshViewer();
        const viewer = this.viewer;
        if (!viewer) {
            this.isLoading = false;
            return Promise.reject('Viewer not initialized');
        }
        
        return viewer.addSplatScene(url, {
            'showLoadingUI': false
        }).then(() => {
            this.isLoading = false;
            console.log('[PortalSystem] Splat loaded');
            this.splatMesh = viewer.splatMesh;
            
            if (this.splatMesh) {
                this.splatMesh.frustumCulled = false;
                // Keep same ordering as 88afca3: splat < door frame
                this.splatMesh.renderOrder = 1;
            }
        }).catch(err => {
            this.isLoading = false;
            console.error('[PortalSystem] Failed to load splat:', err);
            throw err;
        });
    }
    
    public getSplatMesh() {
        return this.splatMesh;
    }
}
