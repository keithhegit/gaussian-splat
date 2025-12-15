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
    
    private isLoading: boolean = false;
    private isInside: boolean = false;
    private lastCameraLocalZ: number | null = null;
    private lastStencilEnabled: boolean = true;
    private lastDebugLogAtMs: number = 0;
    private readonly debugPortalEnabled: boolean =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('debugPortal') === '1';

    // Baseline mode (Option 1):
    // - Prioritize "always visible" splat like 88afca3
    // - No hider walls, no stencil clipping, no inside/outside state machine
    // - Keep door animation + scene switching UX
    // IMPORTANT: three.js Object3D.lookAt aligns the object's +Z toward the target.
    // With our `group.lookAt(camera)`, camera is on local +Z side (OUTSIDE).
    // Therefore, "inside" is local -Z, so we place the splat at negative Z behind the portal plane.
    private readonly viewerBehindDoorZ = -0.9; // put splat behind the door so user starts OUTSIDE
    // Portal opening size in meters (tuned to sit INSIDE the visible door frame)
    private readonly portalOpeningWidth = 0.68;
    private readonly portalOpeningHeight = 1.75;
    private readonly portalFitPadding = 0.92; // leave a little margin so splat doesn't touch the frame edges
    // Match 88a38b7 convention:
    // - Outside (in front of portal): cameraLocal.z > +threshold
    // - Inside  (behind portal):      cameraLocal.z < -threshold
    private readonly outsideThresholdZ = 0.12;
    private readonly insideThresholdZ = -0.12;

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false; // Hidden until placed

        // Portal Mask (88afca3 baseline): write stencil ref=1 for the door opening.
        // NOTE: This requires the renderer to be created with `{ stencil: true }`.
        const maskGeo = new THREE.PlaneGeometry(this.portalOpeningWidth, this.portalOpeningHeight);
        maskGeo.translate(0, this.portalOpeningHeight / 2, 0);
        const maskMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            colorWrite: false,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
            stencilWrite: true,
            stencilRef: 1,
            stencilFunc: THREE.AlwaysStencilFunc,
            stencilZPass: THREE.ReplaceStencilOp,
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

        // Placement always starts OUTSIDE.
        this.isInside = false;
        if (this.splatMesh) this.setSplatStencil(true);

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

        // Ensure matrices are current before converting coordinates
        this.group.updateMatrixWorld(true);

        // Minimal inside/outside switch:
        // - Outside (in front of portal): clip splat to the door opening (stencil)
        // - Inside  (behind portal): show full splat so the store doesn't "disappear"
        const cameraWorld = new THREE.Vector3();
        const effectiveCamera = (camera as any)?.isArrayCamera ? (camera as any).cameras?.[0] : camera;
        if (!effectiveCamera) return;
        effectiveCamera.updateMatrixWorld(true);
        effectiveCamera.getWorldPosition(cameraWorld);
        const cameraLocal = this.group.worldToLocal(cameraWorld);
        this.lastCameraLocalZ = cameraLocal.z;

        // Inside (behind the portal)
        if (cameraLocal.z < this.insideThresholdZ) {
            if (!this.isInside) {
                this.isInside = true;
                this.setSplatStencil(false);
            }
            this.maybeDebugLog('inside');
            return;
        }

        // Outside (in front of the portal)
        if (cameraLocal.z > this.outsideThresholdZ) {
            if (this.isInside) {
                this.isInside = false;
                this.setSplatStencil(true);
            }
            this.maybeDebugLog('outside');
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
                // Start in OUTSIDE mode (clipped to the door opening)
                this.isInside = false;
                this.setSplatStencil(true);
                this.fitSplatToPortal(viewer, this.splatMesh);
            }
        }).catch(err => {
            this.isLoading = false;
            console.error('[PortalSystem] Failed to load splat:', err);
            throw err;
        });
    }
    
    private fitSplatToPortal(viewer: THREE.Object3D, splatRoot: THREE.Object3D) {
        const bounds = new THREE.Box3().setFromObject(splatRoot);
        const size = new THREE.Vector3();
        bounds.getSize(size);

        if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) return;

        const scaleToFit =
            Math.min(this.portalOpeningWidth / size.x, this.portalOpeningHeight / size.y) * this.portalFitPadding;
        if (!Number.isFinite(scaleToFit) || scaleToFit <= 0) return;

        const clampedScale = THREE.MathUtils.clamp(scaleToFit, 0.01, 50);
        viewer.scale.setScalar(clampedScale);

        // Center X and align bottom to y=0 in portal space.
        // Viewer offsets are scaled-space, so multiply by clampedScale.
        const centerX = (bounds.min.x + bounds.max.x) / 2;
        const bottomY = bounds.min.y;

        viewer.position.x = -centerX * clampedScale;
        viewer.position.y = -bottomY * clampedScale;
        viewer.position.z = this.viewerBehindDoorZ;
    }

    private setSplatStencil(enable: boolean) {
        if (!this.splatMesh) return;
        this.lastStencilEnabled = enable;
        this.splatMesh.traverse((child: any) => {
            if (!child?.isMesh || !child.material) return;

            // Three.js only applies stencil state when stencilWrite is enabled.
            // When enabled, we keep stencil values unchanged while testing for ref=1.
            child.material.stencilWrite = enable;
            if (!enable) {
                // Important: don't leave EqualStencilFunc active when stencilWrite=false.
                // Some runtimes behave inconsistently; Always is the safest.
                child.material.stencilFunc = THREE.AlwaysStencilFunc;
                return;
            }

            child.material.stencilFunc = THREE.EqualStencilFunc;
            child.material.stencilRef = 1;
            child.material.stencilFail = THREE.KeepStencilOp;
            child.material.stencilZFail = THREE.KeepStencilOp;
            child.material.stencilZPass = THREE.KeepStencilOp;
        });
    }

    private maybeDebugLog(context: 'inside' | 'outside') {
        if (!this.debugPortalEnabled) return;
        const now = Date.now();
        if (now - this.lastDebugLogAtMs < 600) return; // throttle
        this.lastDebugLogAtMs = now;

        const viewer = this.viewer;
        console.log('[PortalDebug]', {
            context,
            isInside: this.isInside,
            cameraLocalZ: this.lastCameraLocalZ,
            thresholds: { outside: this.outsideThresholdZ, inside: this.insideThresholdZ },
            stencilEnabled: this.lastStencilEnabled,
            opening: { w: this.portalOpeningWidth, h: this.portalOpeningHeight, padding: this.portalFitPadding },
            viewer: viewer
                ? {
                      position: { x: viewer.position.x, y: viewer.position.y, z: viewer.position.z },
                      scale: { x: viewer.scale.x, y: viewer.scale.y, z: viewer.scale.z },
                  }
                : null,
        });
    }

    public debugDump() {
        const viewer = this.viewer;
        const splatMesh = this.splatMesh;
        const bounds = splatMesh ? new THREE.Box3().setFromObject(splatMesh) : null;

        return {
            isInside: this.isInside,
            cameraLocalZ: this.lastCameraLocalZ,
            thresholds: { outside: this.outsideThresholdZ, inside: this.insideThresholdZ },
            stencilEnabled: this.lastStencilEnabled,
            opening: { w: this.portalOpeningWidth, h: this.portalOpeningHeight, padding: this.portalFitPadding },
            viewer: viewer
                ? {
                      position: { x: viewer.position.x, y: viewer.position.y, z: viewer.position.z },
                      scale: { x: viewer.scale.x, y: viewer.scale.y, z: viewer.scale.z },
                  }
                : null,
            splatBounds: bounds
                ? {
                      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
                      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
                  }
                : null,
        };
    }

    public getSplatMesh() {
        return this.splatMesh;
    }
}
