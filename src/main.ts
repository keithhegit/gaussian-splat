import { XRManager } from './XRManager';
import VConsole from 'vconsole';

// Initialize vConsole for mobile debugging
const vConsole = new VConsole();
console.log('vConsole initialized version:', vConsole.version);

const app = new XRManager();
app.start();
