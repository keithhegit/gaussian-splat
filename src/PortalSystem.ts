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
    private isLoading: boolean = false;

    private hiderWalls: THREE.Group | null = null;
    private readonly debugEnabled: boolean =
        import.meta.env.VITE_DEBUG_PORTAL === 'true' ||
        (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'));

    // Portal convention (matching THREE.Object3D.lookAt):
    // - After `group.lookAt(camera)`, the group's -Z axis points toward the camera (OUTSIDE).
    // - Therefore, local z < 0 => camera is outside (in front of portal), local z > 0 => camera is inside.
    private readonly outsideThresholdZ = -0.1;
    private readonly insideThresholdZ = 0.1;

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false; // Hidden until placed

        // 1. Portal Mask (The "Hole")
        // 1x2m plane, invisible, writes to stencil buffer
        // Updated: Reduced size to 0.75x1.85 to fit inside door frame
        const maskGeo = new THREE.PlaneGeometry(0.75, 1.85); 
        // Shift center up by 0.925m so bottom is at 0
        maskGeo.translate(0, 0.925, 0); 

        const maskMat = new THREE.MeshBasicMaterial({
            color: 0x000000, 
            colorWrite: false, // Do not draw color
            depthWrite: false, // Do not write to depth (stencil-only)
            depthTest: false,  // Must always write stencil (avoid depth ordering issues)
            side: THREE.DoubleSide, // WebXR portals often face "backwards" due to lookAt using -Z
            // NOTE: We intentionally do NOT rely on stencil for WebXR portability.
            // Many WebXR runtimes (especially iOS) do not provide a stencil buffer in the XR framebuffer,
            // which makes "stencilFunc = Equal" silently fail and hides the splat completely.
            stencilWrite: false,
        });

        this.mask = new THREE.Mesh(maskGeo, maskMat);
        // Ensure stencil is written before any depth occluders/splats regardless of scene ordering
        this.mask.renderOrder = -10;
        this.group.add(this.mask);

        // 1.1 Hider Walls (Invisible Depth Mask)
        // Surrounds the door to occlude splat "leaking"
        this.createHiderWalls();

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
        
        // REMOVED: Do NOT auto-load splat here. 
        // We wait for explicit loadSplat call from XRManager.
        /*
        this.viewer.addSplatScene(splatUrl, {
            'showLoadingUI': false
        }).then(() => {
            // ...
        });
        */

        this.group.add(this.viewer);

        // 3. Frame (The "Door") - Load GLB
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(doorUrl, (gltf) => {
            this.frame = gltf.scene;
            // IMPORTANT:
            // Many door GLBs use alpha/cutout materials (or hidden geometry) for the "hole".
            // Forcing depthWrite=true + rendering before splats can accidentally write depth across the opening,
            // which makes the splat disappear completely.
            //
            // Safer strategy (8thwall-style):
            // - Use HiderWalls as the depth-only occluder for "outside the hole"
            // - Render the visible frame LAST so it always overlays the splat at the edges
            this.frame.renderOrder = 10;
            
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

            // Visible frame should NOT participate in stencil logic (stencil is owned by `mask` only).
            this.frame.traverse((child: any) => {
                 if (child.isMesh) {
                     child.renderOrder = 10;
                     if (child.material) {
                         // Do NOT force depthWrite here; render order handles visual priority.
                         // Leaving depthWrite off avoids "invisible portal" when the door uses cutouts/alpha.
                         child.material.depthWrite = false;
                         child.material.depthTest = true;
                         child.material.stencilWrite = false;
                     }
                 }
            });
            
            // Move frame slightly forward so it sits on top of Hider Walls (Z=0.01)
            this.frame.position.z = 0.06;
            this.group.add(this.frame);
        }, undefined, (error) => {
             console.warn("Failed to load door_frame.glb, falling back to wireframe", error);
             // Fallback to wireframe
             const frameGeo = new THREE.BoxGeometry(1.1, 2.1, 0.1);
             frameGeo.translate(0, 1.05, 0);
             const frameMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
             this.frame = new THREE.Mesh(frameGeo, frameMat);
             this.frame.renderOrder = 10;
             this.group.add(this.frame);
        });
    }

    private createHiderWalls() {
        this.hiderWalls = new THREE.Group();
        // RenderOrder 0: Same as Mask. Writes Depth.
        // We place it slightly in front of Z=0 (e.g. 0.01) to ensuring it occludes splats at Z=0?
        // Actually, if we want it to be a "Wall" that the door frame sits IN,
        // it should be at the same Z as the door frame roughly.
        
        const material = new THREE.MeshBasicMaterial({
            color: 0x000000, // Debug color (change to invisible later)
            colorWrite: false, // Invisible
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
        });

        // 4 Planes around the 0.75 x 1.85 opening
        // Top: Width 10m, Height 5m. Pos Y > 1.85
        const topGeo = new THREE.PlaneGeometry(10, 5);
        topGeo.translate(0, 1.85 + 2.5, 0); // Center at 1.85 + 2.5 = 4.35
        const topMesh = new THREE.Mesh(topGeo, material);
        topMesh.renderOrder = -5;
        this.hiderWalls.add(topMesh);

        // Bottom: Width 10m, Height 2m. Pos Y < 0.
        // Wait, door starts at 0. So bottom wall is below 0.
        const botGeo = new THREE.PlaneGeometry(10, 2);
        botGeo.translate(0, -1, 0); 
        const botMesh = new THREE.Mesh(botGeo, material);
        botMesh.renderOrder = -5;
        this.hiderWalls.add(botMesh);

        // Left: Width 5m, Height 10m. Pos X < -0.375
        const leftGeo = new THREE.PlaneGeometry(5, 10);
        leftGeo.translate(-0.375 - 2.5, 2.5, 0);
        const leftMesh = new THREE.Mesh(leftGeo, material);
        leftMesh.renderOrder = -5;
        this.hiderWalls.add(leftMesh);

        // Right: Width 5m, Height 10m. Pos X > 0.375
        const rightGeo = new THREE.PlaneGeometry(5, 10);
        rightGeo.translate(0.375 + 2.5, 2.5, 0);
        const rightMesh = new THREE.Mesh(rightGeo, material);
        rightMesh.renderOrder = -5;
        this.hiderWalls.add(rightMesh);

        // IMPORTANT: With our portal convention, OUTSIDE is -Z (toward camera).
        // HiderWalls must sit slightly toward the camera so they can occlude the splat outside the opening.
        this.hiderWalls.position.z = -0.03;
        
        // IMPORTANT: HiderWalls must render BEFORE splats to write depth
        this.hiderWalls.renderOrder = -5; // (group renderOrder doesn't affect meshes, but kept for clarity)
        
        this.group.add(this.hiderWalls);
    }

    public place(position: THREE.Vector3, camera: THREE.Camera) {
        this.group.position.copy(position);
        this.group.visible = true;

        // Y-Axis Billboarding
        const targetPos = new THREE.Vector3();
        camera.getWorldPosition(targetPos);
        targetPos.y = position.y; // Keep target on same level as portal

        this.group.lookAt(targetPos);

        // Reset portal state on placement: user starts OUTSIDE.
        this.isInside = false;
        if (this.hiderWalls) this.hiderWalls.visible = true;

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
        camera.getWorldPosition(localPos);
        this.group.worldToLocal(localPos);

        // State Machine with Hysteresis (8thwall-style)
        // - OUTSIDE  (in front of portal): local z < outsideThresholdZ => show HiderWalls (portal "hole")
        // - INSIDE   (behind portal):      local z > insideThresholdZ  => hide HiderWalls (full splat view)
        if (localPos.z > this.insideThresholdZ) {
            if (!this.isInside) {
                this.isInside = true;
                this.setSplatStencil(false);
                if (this.hiderWalls) this.hiderWalls.visible = false;
            }
            return;
        }

        if (localPos.z < this.outsideThresholdZ) {
            if (this.isInside) {
                this.isInside = false;
                this.setSplatStencil(true);
                if (this.hiderWalls) this.hiderWalls.visible = true;
            }
        }
    }
    
    public loadSplat(url: string): Promise<void> {
        if (this.isLoading) {
            console.warn('[PortalSystem] Load already in progress, ignoring request.');
            return Promise.resolve();
        }
        this.isLoading = true;

        console.log(`[PortalSystem] Loading Splat from: ${url}`);
        
        if (!this.viewer) {
             console.error('[PortalSystem] Viewer not initialized!');
             this.isLoading = false;
             return Promise.reject('Viewer not initialized');
        }

        // Strategy: Dispose OLD mesh from viewer scene if it exists, but KEEP the Viewer instance
        if (this.splatMesh) {
            this.splatMesh.geometry.dispose();
            // @ts-ignore
            if (this.splatMesh.material.dispose) this.splatMesh.material.dispose();
            this.viewer.remove(this.splatMesh);
            this.splatMesh = null;
        }

        // NOTE:
        // DropInViewer may own internal children; clearing all children can break rendering in some versions.
        // We only remove the previous splat mesh above.
        
        // Ensure viewer is positioned correctly for every load
        // Reverting to Z=0 because Z=-1.0 pushed it too far back and might be clipped by far plane or just misaligned.
        // In 88afca3 (which worked but had clipping), Z was 0.
        // The issue was clipping. HiderWalls are at Z=0.01.
        // If Splat is at Z=0, it is BEHIND HiderWalls.
        // So why was it clipping in 88afca3? 
        // Because Splat is a VOLUME. Some points have +Z (sticking out).
        // By moving Viewer to -1.0, we moved ALL points back. Maybe too far.
        // Let's try moving it just enough to clear the door frame, e.g. -0.5 or back to 0 but rely on HiderWalls better.
        // Actually, if it disappeared at -1.0, maybe the scale is small and -1.0 is huge?
        // Let's revert to 0 first to restore visibility, then verify HiderWalls logic.
        this.viewer.position.set(0, 0, 0);

        return this.viewer.addSplatScene(url, {
            'showLoadingUI': false
        }).then(() => {
            this.isLoading = false;
            console.log('[PortalSystem] Splat loaded');
            this.splatMesh = this.viewer!.splatMesh;
            
            if (this.splatMesh) {
                this.splatMesh.frustumCulled = false;
                // Render after depth occluders, before visible frame
                this.splatMesh.renderOrder = 0;
                // Ensure the splat participates in depth testing so HiderWalls can occlude it outside the opening.
                this.splatMesh.traverse((child: any) => {
                    if (child?.isMesh && child.material) {
                        child.material.depthTest = true;
                        child.material.depthWrite = false;
                    }
                });

                // Ensure splat content sits *behind* the portal plane (z <= 0 in portal local),
                // otherwise points that protrude forward can pass depth tests and "leak" through the frame.
                // We compute a conservative offset from the splat bounds and clamp it to avoid extreme jumps.
                const bounds = new THREE.Box3().setFromObject(this.splatMesh);
                const backMostZ = bounds.min.z;
                const viewer = this.viewer;
                // Portal convention: inside is +Z. Push the splat so its nearest point is behind the portal plane.
                if (Number.isFinite(backMostZ) && viewer) {
                    const margin = 0.08;
                    const rawOffset = Math.max(0, -backMostZ + margin);
                    const clampedOffset = THREE.MathUtils.clamp(rawOffset, 0.05, 4.0);
                    viewer.position.z = clampedOffset;
                }
                if (this.debugEnabled) {
                    console.log('[PortalSystem][debug] splat bounds:', bounds.min, bounds.max);
                    if (viewer) console.log('[PortalSystem][debug] viewer.position:', viewer.position);
                    const boxHelper = new THREE.Box3Helper(bounds, 0xff00ff);
                    // Make helper always visible (ignore depth), so we can confirm the splat is in front/behind
                    // even if it is being occluded.
                    // @ts-ignore
                    (boxHelper.material as any).depthTest = false;
                    // @ts-ignore
                    (boxHelper.material as any).depthWrite = false;
                    boxHelper.renderOrder = 999;
                    if (viewer) viewer.add(boxHelper);
                }

                this.setSplatStencil(!this.isInside);
            }
        }).catch(err => {
            this.isLoading = false;
            console.error('[PortalSystem] Failed to load splat:', err);
            throw err;
        });
    }
    
    private setSplatStencil(_enable: boolean) {
        if (!this.splatMesh) return;
        this.splatMesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                // WebXR-portable portal: do NOT depend on stencil. We use HiderWalls depth occlusion instead
                // (8thwall-style). This avoids "splat disappears" on XR framebuffers without a stencil buffer.
                child.material.stencilWrite = false;
                child.material.stencilFunc = THREE.AlwaysStencilFunc;
            }
        });
    }

    public getSplatMesh() {
        return this.splatMesh;
    }
}
