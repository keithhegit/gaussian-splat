import { XRManager } from './XRManager';
import VConsole from 'vconsole';

// Initialize vConsole for mobile debugging
const vConsole = new VConsole();
console.log('vConsole initialized version:', vConsole.version);
console.log('[Build]', __BUILD_ID__);
// @ts-ignore
window.__buildId = __BUILD_ID__;

// Style setup for UI
const style = document.createElement('style');
style.textContent = `
    #overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* Scene Selection Screen */
    #scene-selection-screen {
        position: absolute;
        width: 100%;
        height: 100%;
        background: #1a1a1a;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 60px;
        z-index: 3000;
    }
    .title {
        color: white;
        margin-bottom: 40px;
        font-size: 32px;
    }
    .scene-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        padding: 0 20px;
        width: 100%;
        max-width: 600px;
        box-sizing: border-box;
    }
    .scene-card {
        background: #333;
        border: 2px solid #555;
        border-radius: 12px;
        height: 120px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: transform 0.2s, border-color 0.2s;
    }
    .scene-card:active {
        transform: scale(0.95);
        border-color: #00ff00;
    }
    .scene-name {
        color: white;
        font-size: 18px;
        font-weight: bold;
    }

    /* Loading Screen */
    #loading-screen {
        position: absolute;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        pointer-events: auto;
        z-index: 4000;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .loading-content {
        text-align: center;
    }
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #00ff00;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px auto;
    }
    .loading-text {
        color: white;
        font-size: 18px;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    /* AR UI */
    #ui-container {
        position: absolute;
        top: 20px;
        left: 20px;
        pointer-events: auto;
    }
    #scene-selector {
        padding: 10px;
        font-size: 16px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #ccc;
    }
    #start-prompt {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: auto;
        z-index: 2000;
    }
    .prompt-text {
        color: white;
        font-size: 24px;
        font-weight: bold;
        background: rgba(0, 0, 0, 0.7);
        padding: 20px 40px;
        border-radius: 12px;
        border: 2px solid white;
    }
`;
document.head.appendChild(style);

const app = new XRManager();
app.start();
