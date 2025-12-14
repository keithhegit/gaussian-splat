import * as THREE from 'three';
import { SpzLoader } from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PortalSystem {
    public group: THREE.Group;
    private mask: THREE.Mesh;
    private frame: THREE.Object3D | null = null;
    private splatMesh: THREE.Object3D | null = null;
    
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
            color: 0xff00ff, // Color doesn't matter, colorWrite is false
            colorWrite: false,
            stencilWrite: true,
            stencilRef: 1,
            stencilFunc: THREE.AlwaysStencilFunc,
            stencilZPass: THREE.ReplaceStencilOp,
        });

        this.mask = new THREE.Mesh(maskGeo, maskMat);
        this.mask.renderOrder = 0;
        this.group.add(this.mask);

        // Determine Assets URL
        // If VITE_ASSETS_URL is set (e.g. from Cloudflare), use it.
        // Otherwise fallback to local 'assets/'
        let baseUrl = import.meta.env.VITE_ASSETS_URL || 'assets/';
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        
        console.log(`[PortalSystem] Loading assets from: ${baseUrl}`);

        // 2. Load Splat (SPZ)
        const loader = new SpzLoader();
        loader.load(`${baseUrl}store.spz`, (splat: any) => {
            this.splatMesh = splat;
            
            // Critical Hooks (must execute)
            this.splatMesh!.frustumCulled = false;
            this.splatMesh!.renderOrder = 1;
            
            // Adjust Splat rotation/position
            // Spec says usually -90 deg on X
            this.splatMesh!.rotation.x = -Math.PI / 2;
            this.splatMesh!.position.set(0, 0, 0); // Ensure it's at origin of group

            // Initial Stencil Config (Outside state)
            this.setSplatStencil(true);

            this.group.add(this.splatMesh!);
        });

        // 3. Frame (The "Door") - Load GLB
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(`${baseUrl}door_frame.glb`, (gltf) => {
            this.frame = gltf.scene;
            this.frame.renderOrder = 2;
            
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
    }
    
    public update(camera: THREE.Camera) {
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
    
    private setSplatStencil(enable: boolean) {
        if (!this.splatMesh) return;
        this.splatMesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                child.material.stencilWrite = enable;
                if (enable) {
                    child.material.stencilFunc = THREE.EqualStencilFunc;
                    child.material.stencilRef = 1;
                }
            }
        });
    }

    public getSplatMesh() {
        return this.splatMesh;
    }
}
