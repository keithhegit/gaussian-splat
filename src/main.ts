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
        background: radial-gradient(1200px 800px at 50% -10%, rgba(255,255,255,0.08), rgba(0,0,0,0) 60%),
                    linear-gradient(180deg, #000 0%, #0a0a0a 60%, #000 100%);
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: 18px 0 24px 0;
        z-index: 3000;
    }

    .ui-topbar {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px 8px 16px;
    }
    .ui-logo {
        position: absolute;
        left: 16px;
        top: 10px;
        width: 44px;
        height: 44px;
        object-fit: contain;
        filter: drop-shadow(0 8px 20px rgba(0,0,0,0.6));
    }
    .ui-title {
        color: #fff;
        font-size: 34px;
        font-weight: 900;
        letter-spacing: 0.2px;
        text-align: center;
        text-shadow: 0 12px 28px rgba(0,0,0,0.65);
    }

    .ui-carousel {
        flex: 1;
        display: flex;
        gap: 16px;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        padding: 16px 7.5vw 24px 7.5vw; /* peek preview */
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
    }
    .ui-carousel::-webkit-scrollbar { display: none; }

    .scene-card {
        scroll-snap-align: center;
        flex: 0 0 85vw;
        height: 80vh;
        border-radius: 28px;
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.10);
        background: #0b0b0b;
        box-shadow: 0 20px 60px rgba(0,0,0,0.70);
        cursor: pointer;
        transition: transform 220ms ease, opacity 220ms ease, filter 220ms ease;
        transform: scale(0.92);
        opacity: 0.72;
        filter: saturate(0.9) brightness(0.9);
    }
    .scene-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: url("https://pub-c98d5902eedf42f6a9765dfad981fd88.r2.dev/Icon/loading/ugn_load_page.png");
        background-size: cover;
        background-position: center;
        transform: scale(1.08);
        filter: saturate(1.2) contrast(1.05) hue-rotate(var(--hue, 0deg));
    }
    .scene-card::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.92) 92%);
    }
    .scene-card.is-active {
        transform: scale(1);
        opacity: 1;
        filter: saturate(1.05) brightness(1);
    }
    .scene-card__content {
        position: absolute;
        inset: auto 0 0 0;
        padding: 18px;
        z-index: 2;
    }
    .scene-card__tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
    }
    .tag {
        display: inline-flex;
        align-items: center;
        height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        color: rgba(255,255,255,0.92);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2px;
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.14);
        backdrop-filter: blur(10px);
    }
    .scene-card__title {
        color: #fff;
        font-size: 30px;
        font-weight: 900;
        margin-bottom: 8px;
        text-shadow: 0 12px 28px rgba(0,0,0,0.65);
    }
    .scene-card__desc {
        color: rgba(255,255,255,0.78);
        font-size: 14px;
        line-height: 1.35;
        max-width: 34ch;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        margin-bottom: 14px;
    }
    .scene-card__actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .scene-action {
        height: 48px;
        border-radius: 999px;
        border: none;
        background: #EEDC9A;
        color: #161616;
        font-weight: 900;
        font-size: 15px;
        letter-spacing: 0.2px;
        box-shadow: 0 16px 30px rgba(0,0,0,0.45);
        cursor: pointer;
        transition: transform 140ms ease, filter 140ms ease;
    }
    .scene-action:active {
        transform: translateY(1px) scale(0.99);
        filter: brightness(0.96);
    }

    /* Loading Screen */
    #loading-screen {
        position: absolute;
        width: 100%;
        height: 100%;
        background-image: url("https://pub-c98d5902eedf42f6a9765dfad981fd88.r2.dev/Icon/loading/ugn_load_page.png");
        background-size: cover;
        background-position: center;
        pointer-events: auto;
        z-index: 4000;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .loading-splash {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 28px 18px;
    }
    .loading-splash__shade {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.85) 100%);
    }
    .loading-splash__text {
        position: relative;
        z-index: 2;
        text-align: center;
        width: min(520px, 92vw);
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(0,0,0,0.45);
        border: 1px solid rgba(255,255,255,0.10);
        backdrop-filter: blur(10px);
    }
    .loading-text {
        color: white;
        font-size: 18px;
        font-weight: 900;
        white-space: pre-line;
    }
    .loading-subtext {
        color: rgba(255,255,255,0.72);
        font-size: 12px;
        margin-top: 6px;
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
    .prompt-card {
        width: min(520px, 92vw);
        padding: 18px 18px;
        border-radius: 22px;
        background: rgba(0,0,0,0.62);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(12px);
        color: #fff;
        text-align: left;
        box-shadow: 0 24px 60px rgba(0,0,0,0.65);
    }
    .prompt-card__title {
        font-size: 20px;
        font-weight: 900;
        margin-bottom: 6px;
    }
    .prompt-card__desc {
        font-size: 13px;
        color: rgba(255,255,255,0.78);
        margin-bottom: 14px;
        line-height: 1.35;
    }
    .prompt-card__btn {
        width: 100%;
        height: 50px;
        border-radius: 999px;
        border: none;
        background: #EEDC9A;
        color: #161616;
        font-weight: 900;
        font-size: 16px;
        cursor: pointer;
    }
    .prompt-card__btn:active { filter: brightness(0.96); }
    .prompt-card__error {
        margin-top: 10px;
        font-size: 12px;
        color: rgba(255,255,255,0.85);
        white-space: pre-line;
    }
`;
document.head.appendChild(style);

const carousel = document.getElementById('scene-carousel');
if (carousel) {
    const cards = Array.from(carousel.querySelectorAll('.scene-card'));
    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const el = entry.target as HTMLElement;
                cards.forEach(c => c.classList.remove('is-active'));
                el.classList.add('is-active');
            }
        },
        { root: carousel, threshold: 0.62 }
    );
    cards.forEach(c => observer.observe(c));
}

const app = new XRManager();
app.start();
