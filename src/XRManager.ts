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
    // (kept for future platform-specific UI, but unused right now)
    // private readonly isAndroid: boolean =
    //     typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

    // Config for scenes
    private readonly SCENES: Record<string, string> = {
        cthulhu_hall: 'https://glb.keithhe.com/ar/spz/cthulhu_hall.spz',
        planet: 'https://glb.keithhe.com/ar/spz/planet.spz',
        'color-trees': 'https://glb.keithhe.com/ar/spz/color-trees.spz',
        'game-snow': 'https://glb.keithhe.com/ar/spz/game-snow.spz',
        'sci-fi-pryamid': 'https://glb.keithhe.com/ar/spz/sci-fi-pryamid.spz',
        throne: 'https://glb.keithhe.com/ar/spz/throne.spz',
        wedding: 'https://glb.keithhe.com/ar/spz/wedding.spz',
        xmas_tree: 'https://glb.keithhe.com/ar/spz/xmas_tree.spz',
    };

    constructor() {
        // 1. Setup Scene
        this.scene = new THREE.Scene();

        // 2. Setup Camera
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        // 3. Setup Renderer
        // IMPORTANT: enable stencil buffer for "portal mask" clipping (88afca3 baseline behavior)
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
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

        // Optional debugging from vConsole:
        // - Add `?debugPortal=1` to enable periodic logs
        // - Call `window.__portalDebug.dump()` anytime
        if (typeof window !== 'undefined') {
            // @ts-ignore
            window.__portalDebug = {
                dump: () => {
                    // In this three.js version, getCamera() takes no args and returns the XR ArrayCamera.
                    const xrCamera = this.renderer.xr.getCamera() as unknown as THREE.Camera;
                    // Force one update tick so cameraLocalZ is fresh
                    this.portalSystem.update(xrCamera);
                    const state = this.portalSystem.debugDump();
                    console.log('[PortalDebug][dump]', state);
                    return state;
                },
            };
        }

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
        const startPrompt = document.getElementById('start-prompt') as HTMLElement | null;
        const startButton = document.getElementById('start-ar') as HTMLButtonElement | null;
        const startError = document.getElementById('start-error') as HTMLElement | null;

        const handleShowStartError = (msg: string) => {
            console.error('[XRManager] AR start failed:', msg);
            if (!startError) return;
            startError.style.display = 'block';
            startError.textContent = msg;
        };

        const handleHideStartError = () => {
            if (!startError) return;
            startError.style.display = 'none';
            startError.textContent = '';
        };

        const handleStartAR = async () => {
            handleHideStartError();

            const xr = (navigator as any)?.xr;
            console.log('[XRManager] UA:', navigator.userAgent);
            console.log('[XRManager] userActivation:', (navigator as any)?.userActivation);

            if (!xr) {
                handleShowStartError(
                    'WebXR 不可用。\nAndroid: 请确认使用 HTTPS、Chrome 支持 WebXR，并安装 Google Play Services for AR。\niOS: 请使用 WebXR Viewer。'
                );
                return;
            }

            // Prefer direct requestSession from a trusted user gesture (fixes Android where synthetic click may fail).
            const sessionInit: any = {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: overlay! },
            };

            try {
                const supported = await xr.isSessionSupported?.('immersive-ar');
                console.log('[XRManager] isSessionSupported(immersive-ar):', supported);
            } catch (e) {
                console.log('[XRManager] isSessionSupported check failed:', e);
            }

            try {
                const session = await xr.requestSession('immersive-ar', sessionInit);
                await this.renderer.xr.setSession(session);
                if (startPrompt) startPrompt.style.display = 'none';
                return;
            } catch (err) {
                console.error('[XRManager] requestSession failed, falling back to ARButton:', err);
            }

            // Fallback: try ARButton click (some runtimes/polyfills)
            try {
                arButton.click();
                if (startPrompt) startPrompt.style.display = 'none';
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                handleShowStartError(`无法启动 AR：${msg}`);
            }
        };

        if (startButton) {
            startButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleStartAR();
            });
        } else if (startPrompt) {
            // Safety fallback
            startPrompt.addEventListener('click', () => void handleStartAR());
        }

        // 9. Event Listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // 10. UI Binding
        this.setupUI();
        this.setupSceneSelection();
    }

    private setupSceneSelection() {
        const cards = document.querySelectorAll('.scene-card');
        const actions = document.querySelectorAll('.scene-action');
        const selectionScreen = document.getElementById('scene-selection-screen');
        const loadingScreen = document.getElementById('loading-screen');
        const loadingText = loadingScreen?.querySelector('.loading-text') as HTMLElement | null;
        const arUi = document.getElementById('ar-ui');
        const sceneSelector = document.getElementById('scene-selector') as HTMLSelectElement;

        const handlePickScene = async (sceneKey: string) => {
            if (!sceneKey) return;

            // Show Loading
            if (selectionScreen) selectionScreen.style.display = 'none';
            if (loadingScreen) loadingScreen.style.display = 'flex';
            if (loadingText) loadingText.textContent = '平行宇宙正在加载中...';

            // Update internal state and AR UI selector
            if (sceneSelector) sceneSelector.value = sceneKey;

            try {
                await this.handleSceneChange(sceneKey);
                if (loadingScreen) loadingScreen.style.display = 'none';
                if (arUi) arUi.style.display = 'block';
            } catch (err) {
                console.error('[XRManager] Scene load failed:', err);
                if (loadingText) {
                    const msg = err instanceof Error ? err.message : String(err);
                    loadingText.textContent = `加载失败：${msg}\n点击返回`;
                }
                if (loadingScreen) {
                    loadingScreen.onclick = () => {
                        loadingScreen.style.display = 'none';
                        if (selectionScreen) selectionScreen.style.display = 'flex';
                        loadingScreen.onclick = null;
                    };
                } else if (selectionScreen) {
                    selectionScreen.style.display = 'flex';
                }
            }
        };

        cards.forEach(card => {
            card.addEventListener('click', async () => {
                const sceneKey = card.getAttribute('data-scene') ?? '';
                await handlePickScene(sceneKey);
            });
        });

        actions.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sceneKey = (btn as HTMLElement).getAttribute('data-scene') ?? '';
                await handlePickScene(sceneKey);
            });
        });
    }

    private setupUI() {
        const selector = document.getElementById('scene-selector') as HTMLSelectElement;
        if (selector) {
            selector.addEventListener('change', async (e) => {
                const value = (e.target as HTMLSelectElement).value;
                const loadingScreen = document.getElementById('loading-screen');
                const loadingText = loadingScreen?.querySelector('.loading-text') as HTMLElement | null;
                if (loadingScreen) loadingScreen.style.display = 'flex';
                if (loadingText) loadingText.textContent = '平行宇宙正在加载中...';
                try {
                    await this.handleSceneChange(value);
                    if (loadingScreen) loadingScreen.style.display = 'none';
                } catch (err) {
                    console.error('[XRManager] Scene switch failed:', err);
                    if (loadingText) {
                        const msg = err instanceof Error ? err.message : String(err);
                        loadingText.textContent = `切换失败：${msg}\n点击关闭`;
                    }
                    if (loadingScreen) {
                        loadingScreen.onclick = () => {
                            loadingScreen.style.display = 'none';
                            loadingScreen.onclick = null;
                        };
                    }
                }
            });
        }
    }

    private async handleSceneChange(sceneKey: string) {
        console.log(`[XRManager] Switching to scene: ${sceneKey}`);
        
        // @ts-ignore
        const url = this.SCENES[sceneKey];
        if (url) {
            await this.portalSystem.loadSplat(url);
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

        // In WebXR, `this.camera` (the base camera) does NOT reliably track the XR viewer pose.
        // Use the XR camera (ArrayCamera) so portal inside/outside logic works correctly.
        // In this three.js version, getCamera() takes no args and returns the XR ArrayCamera.
        const xrCamera = this.renderer.xr.getCamera() as unknown as THREE.Camera;
        this.portalSystem.update(xrCamera);
        this.renderer.render(this.scene, this.camera);
    }

    public getReticle(): THREE.Mesh {
        return this.reticle;
    }
}
