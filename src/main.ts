import { XRManager } from './XRManager';
import VConsole from 'vconsole';

// Initialize vConsole for mobile debugging
const vConsole = new VConsole();
console.log('vConsole initialized version:', vConsole.version);

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
    }
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
