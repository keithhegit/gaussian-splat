import * as THREE from 'three';
import { DropInViewer } from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PortalSystem {
    public group: THREE.Group;
    private mask: THREE.Mesh;
    private frame: THREE.Object3D | null = null;
    private viewer: DropInViewer | null = null;
    private splatMesh: THREE.Mesh | null = null;
    private mixer: THREE.AnimationMixer | null = null;
    private storedAction: THREE.AnimationAction | null = null;
    
    // State tracking
    private isInside: boolean = false;

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false; // Hidden until placed

        // 1. Portal Mask (The "Hole")
        // 1x2m plane, invisible, writes to stencil buffer
        const maskGeo = new THREE.PlaneGeometry(1, 2); 
        // Shift center up by 1m so bottom is at 0
        maskGeo.translate(0, 1, 0); 

        const maskMat = new THREE.MeshBasicMaterial({
            color: 0x000000, 
            colorWrite: false, // Do not draw color
            depthWrite: false, // Do not write to depth (let splats draw over it if needed, though they are usually behind)
            stencilWrite: true,
            stencilRef: 1,
            stencilFunc: THREE.AlwaysStencilFunc, // Always pass stencil test
            stencilZPass: THREE.ReplaceStencilOp, // Replace stencil value with 1
        });

        this.mask = new THREE.Mesh(maskGeo, maskMat);
        this.mask.renderOrder = 0;
        this.group.add(this.mask);

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

        // 2. Load Splat (Using DropInViewer)
        this.viewer = new DropInViewer({
            'sharedMemoryForWorkers': false // Disable shared memory for broader compatibility
        });
        
        // Adjust Viewer rotation/position to match spec
        // Update: User feedback indicates -90 deg X rotation causes "ceiling view".
        // Setting to 0 should align standard Y-up models correctly with gravity.
        this.viewer.rotation.x = 0; 
        this.viewer.position.set(0, 0, 0);
        
        this.viewer.addSplatScene(splatUrl, {
            'showLoadingUI': false
        }).then(() => {
            console.log('[PortalSystem] Splat loaded');
            this.splatMesh = this.viewer!.splatMesh;
            
            if (this.splatMesh) {
                // Critical Hooks (must execute)
                this.splatMesh.frustumCulled = false;
                this.splatMesh.renderOrder = 1;

                // Initial Stencil Config (Outside state)
                this.setSplatStencil(true);
            }
        });

        this.group.add(this.viewer);

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

            // Traverse to ensure depth write is true for frame (occlusion)
            this.frame.traverse((child: any) => {
                 if (child.isMesh) {
                     child.renderOrder = 2;
                     child.material.depthWrite = true;
                     child.material.stencilWrite = true;
                     child.material.stencilFunc = THREE.AlwaysStencilFunc;
                     child.material.stencilRef = 1;
                 }
            });
            
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

    public update(camera: THREE.Camera) {
        // Update Animation
        if (this.mixer) {
            this.mixer.update(0.016); // Approximate delta time (60fps)
        }

        if (!this.group.visible || !this.splatMesh) return;

        // Calculate local position of camera relative to the portal group
        // We need to convert camera world position to group local space
        const localPos = new THREE.Vector3();
        localPos.copy(camera.position);
        this.group.worldToLocal(localPos);

        // State Machine with Hysteresis
        // Z < -0.1 : Inside (Behind the door) -> Disable Stencil (Full View)
        // Z > 0.1  : Outside (In front of door) -> Enable Stencil (Masked View)
        
        if (localPos.z < -0.1) {
            if (!this.isInside) {
                this.isInside = true;
                this.setSplatStencil(false);
            }
        } else if (localPos.z > 0.1) {
             if (this.isInside) {
                 this.isInside = false;
                 this.setSplatStencil(true);
             }
        }
    }
    
    public loadSplat(url: string): Promise<void> {
        // Cleanup existing viewer/splat
        if (this.viewer) {
            this.group.remove(this.viewer);
            // viewer.dispose() is not strictly exposed but removing from scene stops rendering
            // For proper cleanup we might need to look into DropInViewer's internals or just recreate it
            this.viewer = null;
            this.splatMesh = null;
        }

        console.log(`[PortalSystem] Loading Splat from: ${url}`);

        // Re-create Viewer
        this.viewer = new DropInViewer({
            'sharedMemoryForWorkers': false
        });
        
        // Setting to 0 should align standard Y-up models correctly with gravity.
        this.viewer.rotation.x = 0; 
        this.viewer.position.set(0, 0, 0);
        
        this.group.add(this.viewer);

        return this.viewer.addSplatScene(url, {
            'showLoadingUI': false
        }).then(() => {
            console.log('[PortalSystem] Splat loaded');
            this.splatMesh = this.viewer!.splatMesh;
            
            if (this.splatMesh) {
                this.splatMesh.frustumCulled = false;
                this.splatMesh.renderOrder = 1;
                
                // If currently "inside", we want stencil disabled (full view)
                // If "outside", we want stencil enabled (masked view)
                // This preserves the state even after switching scenes
                
                // IMPORTANT: The splat mesh must ALWAYS be visible if stencil is disabled.
                // If stencil is enabled, it should only be visible where stencil value matches.
                // The issue "spz content is not visible until camera enters" suggests stencil ref/func logic is too strict
                // or the mask isn't writing to stencil buffer correctly before splat renders.
                
                // Ensure mask renders FIRST (order 0) -> writes 1 to stencil
                // Splat renders SECOND (order 1) -> draws only where stencil == 1
                
                this.setSplatStencil(!this.isInside);
            }
        });
    }
    
    private setSplatStencil(enable: boolean) {
        if (!this.splatMesh) return;
        this.splatMesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                child.material.stencilWrite = enable;
                if (enable) {
                    // Only draw where stencil value is 1 (where the mask is)
                    child.material.stencilFunc = THREE.EqualStencilFunc;
                    child.material.stencilRef = 1;
                    child.material.stencilOp = THREE.KeepStencilOp;
                    child.material.stencilFail = THREE.KeepStencilOp;
                    child.material.stencilZFail = THREE.KeepStencilOp;
                } else {
                    // If disabled (inside portal), just draw everything
                     child.material.stencilWrite = false;
                }
            }
        });
    }

    public getSplatMesh() {
        return this.splatMesh;
    }
}
