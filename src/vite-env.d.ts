/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_ASSETS_URL: string;
    readonly VITE_SPLAT_URL: string;
    readonly VITE_DOOR_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module '@mkkellogg/gaussian-splats-3d' {
    import * as THREE from 'three';
    
    export class KSplatLoader {
        load(
            url: string, 
            onLoad: (object: any) => void, 
            onProgress?: (event: ProgressEvent) => void, 
            onError?: (event: ErrorEvent) => void
        ): void;
    }

    export class SplatLoader {
        load(
            url: string, 
            onLoad: (object: any) => void, 
            onProgress?: (event: ProgressEvent) => void, 
            onError?: (event: ErrorEvent) => void
        ): void;
    }

    export class DropInViewer extends THREE.Group {
        constructor(options?: any);
        addSplatScene(path: string, options?: any): Promise<void>;
        getSplatScene(index: number): any;
        splatMesh: THREE.Mesh | null;
    }
    
    export class GaussianSplatMesh extends THREE.Mesh {
        constructor();
    }
}
