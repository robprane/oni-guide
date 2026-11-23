import { CanvasEngine } from '../canvas/engine.js';
import { createElement } from '../utils.js?v=6';
import { createSvgIcon } from '../icons.js?v=8';

let engineInstance = null;

function createToolButton(tool, label, iconNode, isActive = false, isHidden = false) {
    const cls = `tool-btn${isActive ? ' active' : ''}${isHidden ? ' hidden' : ''}`;
    return createElement('button', {
        type: 'button',
        class: cls,
        dataset: { tool },
        title: label,
        'aria-label': label
    }, [
        iconNode,
        createElement('span', { class: 'tool-btn-label', textContent: label })
    ]);
}

function createToolSprite(src, alt) {
    return createElement('img', { src, alt, class: 'tool-btn-img' });
}

export async function renderCanvas(container, path) {
    container.textContent = ''; // Clear container

    const copyLinkBtn = createElement('button', {
        type: 'button',
        id: 'copy-link-btn',
        class: 'utility-btn icon-only-btn',
        title: 'Copy link',
        'aria-label': 'Copy link'
    }, [createSvgIcon('link', 'btn-svg-icon')]);

    const toolbar = createElement('div', { id: 'toolbar', class: 'canvas-toolbar' }, [
        createToolButton('solid', 'Solid Tile', createToolSprite('/images/Tile.png', 'Solid Tile'), true),
        createToolButton('sweeper', 'Auto-Sweeper', createToolSprite('/images/AutoSweeper.png', 'Auto-Sweeper')),
        createToolButton('building', 'Building', createToolSprite('/images/StorageBin.png', 'Building')),
        // Hidden to focus on Auto-Sweeper
        createToolButton('pipe', 'Pipe', createToolSprite('/images/LiquidPipe.png', 'Pipe'), false, true),
        createToolButton('bridge', 'Bridge', createToolSprite('/images/LiquidBridge.png', 'Bridge'), false, true),
        createToolButton('spawn_liquid', 'Spawn Liquid', createToolSprite('/images/Water.png', 'Spawn Liquid'), false, true),
        createToolButton('erase', 'Eraser', createSvgIcon('eraser', 'tool-btn-svg')),
        createElement('div', { class: 'toolbar-spacer', style: 'flex-grow: 1;' }),
        copyLinkBtn
    ]);

    const canvasEl = createElement('canvas', { id: 'oni-canvas', class: 'oni-canvas' });
    const canvasContainer = createElement('div', { class: 'canvas-container' }, [canvasEl]);


    const secondaryToolbar = createElement('div', { id: 'secondary-toolbar', class: 'canvas-toolbar secondary-toolbar' }, [
        createElement('button', { id: 'orientation-btn', class: 'utility-btn hidden', textContent: 'Rotate (Horizontal)' }),
        createElement('div', { id: 'building-colors', class: 'color-picker hidden' }, [
            createElement('button', { class: 'color-btn active', dataset: { color: 'red' }, style: 'background-color: #ff4d4d;' }),
            createElement('button', { class: 'color-btn', dataset: { color: 'yellow' }, style: 'background-color: #ffcc00;' }),
            createElement('button', { class: 'color-btn', dataset: { color: 'green' }, style: 'background-color: #33cc33;' }),
            createElement('button', { class: 'color-btn', dataset: { color: 'blue' }, style: 'background-color: #3399ff;' })
        ])
    ]);
    const wrapper = createElement('div', { class: 'canvas-wrapper' }, [toolbar, secondaryToolbar, canvasContainer]);

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
        const btn = container.querySelector('#orientation-btn');
        if (btn) {
            btn.textContent = currentOrientation === 'horizontal' ? 'Rotate (Horizontal)' : 'Rotate (Vertical)';
        }
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

        const orientationBtn = container.querySelector('#orientation-btn');
        const buildingColors = container.querySelector('#building-colors');

        if (orientationBtn && buildingColors) {
            if (toolName === 'sweeper') {
                orientationBtn.classList.remove('hidden');
                buildingColors.classList.add('hidden');
            } else if (toolName === 'building') {
                orientationBtn.classList.add('hidden');
                buildingColors.classList.remove('hidden');
            } else {
                orientationBtn.classList.add('hidden');
                buildingColors.classList.add('hidden');
            }
        }

    }

    // Setup building color logic
    const colorBtns = container.querySelectorAll('.color-btn');
    engineInstance.currentBuildingColor = 'red';

    colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const color = btn.dataset.color;
            engineInstance.currentBuildingColor = color;
            colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    setActiveToolBtn('solid');

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



    // console.log(path);

    // Handle initial state from URL
    if (path && path.startsWith('/canvas/')) {
        const encodedState = path.substring('/canvas/'.length);
        if (encodedState) {
            try {
                // Support base64url decoding
                const base64 = encodedState.replace(/-/g, '+').replace(/_/g, '/');
                const jsonState = atob(base64);
                const data = JSON.parse(jsonState);
                engineInstance.grid.deserialize(data);
            } catch (e) {
                console.error("Failed to decode canvas state from URL", e);
            }
        }
    }

    // URL Update Logic on Canvas Changes
    let updateUrlTimeout = null;
    function handleGridUpdated() {
        if (updateUrlTimeout) clearTimeout(updateUrlTimeout);
        updateUrlTimeout = setTimeout(() => {
            if (!engineInstance || !engineInstance.grid) return;
            const data = engineInstance.grid.serialize();
            if (data && Object.keys(data).length > 0) {
                const jsonState = JSON.stringify(data);
                // Create base64url string to be URL-safe and avoid slashes
                const encodedState = btoa(jsonState).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const newHash = `#/canvas/${encodedState}`;
                if (window.location.hash !== newHash) {
                    history.replaceState(null, '', newHash);
                }
            } else {
                const newHash = `#/canvas`;
                if (window.location.hash !== newHash) {
                    history.replaceState(null, '', newHash);
                }
            }
        }, 500); // 500ms debounce
    }
    canvasEl.addEventListener('grid-updated', handleGridUpdated);

    // Setup Copy Link button (icon-only with checkmark feedback)
    const copyBtn = toolbar.querySelector('#copy-link-btn');
    let copyResetTimer = null;
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                copyBtn.textContent = '';
                copyBtn.appendChild(createSvgIcon('check', 'btn-svg-icon'));
                copyBtn.classList.add('is-copied');
                copyBtn.title = 'Copied!';
                if (copyResetTimer) clearTimeout(copyResetTimer);
                copyResetTimer = setTimeout(() => {
                    copyBtn.textContent = '';
                    copyBtn.appendChild(createSvgIcon('link', 'btn-svg-icon'));
                    copyBtn.classList.remove('is-copied');
                    copyBtn.title = 'Copy link';
                }, 2000);
            }).catch(err => {
                console.error("Failed to copy link", err);
            });
        });
    }

    // Return cleanup function for the router
    return () => {
        window.removeEventListener('keydown', handleKeydown);
        canvasEl.removeEventListener('grid-updated', handleGridUpdated);
        if (updateUrlTimeout) clearTimeout(updateUrlTimeout);
        if (copyResetTimer) clearTimeout(copyResetTimer);
        if (engineInstance) {
            engineInstance.destroy();
            engineInstance = null;
        }
    };
}
