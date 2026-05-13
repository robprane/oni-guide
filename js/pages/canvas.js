import { CanvasEngine } from '../canvas/engine.js';

let engineInstance = null;

export async function renderCanvas(container) {
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: calc(100vh - 60px); width: 100%;">
            <div id="toolbar" style="padding: 10px; background: var(--nav-bg); border-bottom: 1px solid var(--border-color); display: flex; gap: 10px;">
                <button class="tool-btn active" data-tool="solid">Solid Tile</button>
                <button class="tool-btn" data-tool="sweeper">Auto-Sweeper</button>
                <!-- Hidden to focus on Auto-Sweeper -->
                <button class="tool-btn" data-tool="pipe" style="display: none;">Pipe</button>
                <button class="tool-btn" data-tool="bridge" style="display: none;">Bridge</button>
                <button class="tool-btn" data-tool="spawn_liquid" style="display: none;">Spawn Liquid</button>
                <button class="tool-btn" data-tool="erase">Eraser</button>
                <button id="orientation-btn" class="tool-btn" style="display: none; border-color: var(--primary-color);">Rotate (O)</button>
                <div style="margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
                    <span>Shift+Drag or Middle-Click to pan. Scroll to zoom.</span>
                </div>
            </div>
            <div style="flex: 1; position: relative; overflow: hidden;">
                <canvas id="oni-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
            </div>
        </div>
    `;

    // Add basic styles for toolbar buttons
    const style = document.createElement('style');
    style.textContent = `
        .tool-btn { padding: 5px 10px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); border-radius: 4px; cursor: pointer; }
        .tool-btn.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
    `;
    container.appendChild(style);

    // Load config
    const configRes = await fetch('/js/canvas/config.json');
    const config = await configRes.json();

    const canvasEl = document.getElementById('oni-canvas');
    engineInstance = new CanvasEngine(canvasEl, config);
    engineInstance.setTool('solid'); // Default tool

    // Setup toolbar
    const btns = container.querySelectorAll('.tool-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engineInstance.setTool(btn.dataset.tool);
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

    function handleKeydown(e) {
        if (e.code === 'KeyO') {
            if (engineInstance && engineInstance.currentTool === 'sweeper') {
                toggleOrientation();
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
            orientationBtn.style.display = 'block';
        } else {
            orientationBtn.style.display = 'none';
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