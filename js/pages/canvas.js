import { CanvasEngine } from '../canvas/engine.js';
import { createElement } from '../utils.js';

let engineInstance = null;

export async function renderCanvas(container) {
    container.textContent = ''; // Clear container

    const toolbar = createElement('div', { id: 'toolbar', class: 'canvas-toolbar' }, [
        createElement('button', { class: 'tool-btn active', dataset: { tool: 'solid' }, textContent: 'Solid Tile' }),
        createElement('button', { class: 'tool-btn', dataset: { tool: 'sweeper' }, textContent: 'Auto-Sweeper' }),
        // Hidden to focus on Auto-Sweeper
        createElement('button', { class: 'tool-btn hidden', dataset: { tool: 'pipe' }, textContent: 'Pipe' }),
        createElement('button', { class: 'tool-btn hidden', dataset: { tool: 'bridge' }, textContent: 'Bridge' }),
        createElement('button', { class: 'tool-btn hidden', dataset: { tool: 'spawn_liquid' }, textContent: 'Spawn Liquid' }),
        createElement('button', { class: 'tool-btn', dataset: { tool: 'erase' }, textContent: 'Eraser' }),
        createElement('button', { id: 'orientation-btn', class: 'utility-btn hidden', textContent: 'Rotate' })
    ]);

    const canvasEl = createElement('canvas', { id: 'oni-canvas', class: 'oni-canvas' });
    const canvasContainer = createElement('div', { class: 'canvas-container' }, [canvasEl]);

    const wrapper = createElement('div', { class: 'canvas-wrapper' }, [toolbar, canvasContainer]);

    container.appendChild(wrapper);

    // Load config
    const configRes = await fetch('/js/canvas/config.json');
    const config = await configRes.json();

    engineInstance = new CanvasEngine(canvasEl, config);
    engineInstance.setTool('solid'); // Default tool

    // Setup toolbar
    const btns = container.querySelectorAll('.tool-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const toolName = btn.dataset.tool;
            if (engineInstance.currentTool !== 'erase' && toolName === 'erase') {
                previousTool = engineInstance.currentTool;
            }
            setActiveToolBtn(toolName);
            engineInstance.setTool(toolName);
        });
    });

    // Setup orientation logic
    let currentOrientation = 'horizontal';
    const orientationBtn = document.getElementById('orientation-btn');

    function toggleOrientation() {
        currentOrientation = currentOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        engineInstance.currentOrientation = currentOrientation;
    }

    orientationBtn.addEventListener('click', toggleOrientation);

    let previousTool = 'solid';

    function setActiveToolBtn(toolName) {
        btns.forEach(b => {
            if (b.dataset.tool === toolName) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }

    function handleKeydown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.code === 'KeyO') {
            if (engineInstance && engineInstance.currentTool === 'sweeper') {
                toggleOrientation();
            }
        } else if (e.code === 'KeyC' || e.code === 'KeyX') {
            if (engineInstance && engineInstance.currentTool !== 'erase') {
                previousTool = engineInstance.currentTool;
                engineInstance.setTool('erase');
                setActiveToolBtn('erase');
            }
        } else if (e.code === 'KeyB') {
            if (engineInstance && engineInstance.currentTool === 'erase') {
                engineInstance.setTool(previousTool);
                setActiveToolBtn(previousTool);
            }
        }
    }
    window.addEventListener('keydown', handleKeydown);

    engineInstance.currentOrientation = currentOrientation;

    // Extend engineInstance.setTool to show/hide orientation button
    const originalSetTool = engineInstance.setTool.bind(engineInstance);
    engineInstance.setTool = function(toolName) {
        originalSetTool(toolName);
        if (toolName === 'sweeper') {
            orientationBtn.classList.remove('hidden');
        } else {
            orientationBtn.classList.add('hidden');
        }
    };
    engineInstance.setTool('solid'); // Trigger the UI update for default tool

    // Return cleanup function for the router
    return () => {
        window.removeEventListener('keydown', handleKeydown);
        if (engineInstance) {
            engineInstance.destroy();
            engineInstance = null;
        }
    };
}
