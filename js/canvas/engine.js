import { Grid } from './grid.js';
import { calculateSweeperCoverage } from './los.js';
import { PipeSimulation } from './simulation.js';

export class CanvasEngine {
    constructor(canvasEl, config) {
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        this.config = config;

        this.camera = { x: 0, y: 0, zoom: 1 };

        // Keyboard panning state
        this.keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };

        // Pointer state
        this.pointers = new Map(); // Keep track of active pointers
        this.isPanning = false; // Are we panning with middle-click/shift+drag or 2 fingers?
        this.wasMultiTouch = false; // If there were 2 fingers, stay in pan mode until all are released
        this.lastPanPoint = { x: 0, y: 0 };
        this.initialPinchDistance = 0;
        this.initialPinchZoom = 1;

        // Deferred drawing state
        this.pointerDownEvent = null;
        this.pointerDownPoint = null;
        this.isDrawingDrag = false;

        this.tintCanvas = document.createElement('canvas');
        this.tintCtx = this.tintCanvas.getContext('2d');

        this.grid = new Grid(this);
        this.simulation = new PipeSimulation(this.grid, this.config);
        this.currentTool = null;
        this.needsRedraw = true;
        this.hoverGridPos = null;

        this.images = {};
        this.loadImages();

        this.setupEvents();
        this.resize();

        this.resizeHandler = this.resize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        this.loop = this.loop.bind(this);
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    loadImages() {
        const imageSources = {
            tile: 'images/tileset/tile.png',
            sweeper: 'images/tileset/autosweeper.png'
        };

        for (const [key, src] of Object.entries(imageSources)) {
            const img = new Image();
            img.onload = () => {
                this.needsRedraw = true;
            };
            img.src = src;
            this.images[key] = img;
        }
    }

    destroy() {
        window.removeEventListener('resize', this.resizeHandler);
        if (this.handleKeyDown) window.removeEventListener('keydown', this.handleKeyDown);
        if (this.handleKeyUp) window.removeEventListener('keyup', this.handleKeyUp);
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    resize() {
        if (!this.canvas || !this.canvas.parentElement) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.needsRedraw = true;
    }

    setupEvents() {
        // Disable native touch actions (pan, pinch zoom) on the canvas
        this.canvas.classList.add('oni-canvas');

        // Helper to get midpoint and distance of 2 pointers
        const getPinchData = () => {
            if (this.pointers.size < 2) return null;
            const pts = Array.from(this.pointers.values());
            const dx = pts[0].x - pts[1].x;
            const dy = pts[0].y - pts[1].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            return { distance, midX, midY };
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            this.canvas.setPointerCapture(e.pointerId);
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this.pointers.size === 2) {
                this.isPanning = true;
                this.wasMultiTouch = true;
                this.pointerDownEvent = null;
                this.pointerDownPoint = null;
                const pinch = getPinchData();
                this.initialPinchDistance = pinch.distance;
                this.initialPinchZoom = this.camera.zoom;
                this.lastPanPoint = { x: pinch.midX, y: pinch.midY };
                this.canvas.classList.add('grabbing');
            } else if (this.pointers.size === 1) {
                if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                    // Middle click or Shift+Left click to pan (Mouse)
                    this.isPanning = true;
                    this.lastPanPoint = { x: e.clientX, y: e.clientY };
                    this.canvas.classList.add('grabbing');
                } else if (e.button === 0 && this.currentTool && !this.wasMultiTouch) {
                    // Defer drawing for touch events, or apply immediately for mouse
                    if (e.pointerType === 'touch') {
                        this.pointerDownEvent = e;
                        this.pointerDownPoint = { x: e.clientX, y: e.clientY };
                        this.isDrawingDrag = false;
                    } else {
                        this.useTool(e);
                        this.isDrawingDrag = true;
                    }
                }
            }
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (this.pointers.has(e.pointerId)) {
                this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }

            // Always update hover
            const world = this.screenToWorld(e.clientX, e.clientY);
            const gridPos = this.worldToGrid(world.x, world.y);

            if (!this.hoverGridPos || this.hoverGridPos.x !== gridPos.x || this.hoverGridPos.y !== gridPos.y) {
                this.hoverGridPos = gridPos;
                this.needsRedraw = true;
            }

            if (this.pointers.size === 2) {
                // Pinch zoom & pan
                const pinch = getPinchData();

                // Panning
                const dx = pinch.midX - this.lastPanPoint.x;
                const dy = pinch.midY - this.lastPanPoint.y;
                this.camera.x += dx / this.camera.zoom;
                this.camera.y += dy / this.camera.zoom;
                this.lastPanPoint = { x: pinch.midX, y: pinch.midY };

                // Zooming
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = pinch.midX - rect.left;
                const mouseY = pinch.midY - rect.top;

                const worldX = (mouseX / this.camera.zoom) - this.camera.x;
                const worldY = (mouseY / this.camera.zoom) - this.camera.y;

                const zoomFactor = pinch.distance / this.initialPinchDistance;
                this.camera.zoom = this.initialPinchZoom * zoomFactor;
                this.camera.zoom = Math.max(0.2, Math.min(this.camera.zoom, 5));

                this.camera.x = (mouseX / this.camera.zoom) - worldX;
                this.camera.y = (mouseY / this.camera.zoom) - worldY;

                this.needsRedraw = true;

            } else if (this.isPanning) {
                // One finger/mouse pan
                if (this.pointers.size === 1) {
                    const dx = e.clientX - this.lastPanPoint.x;
                    const dy = e.clientY - this.lastPanPoint.y;
                    this.camera.x += dx / this.camera.zoom;
                    this.camera.y += dy / this.camera.zoom;
                    this.lastPanPoint = { x: e.clientX, y: e.clientY };
                    this.needsRedraw = true;
                }
            } else if (this.pointers.size === 1 && e.buttons === 1 && this.currentTool && !e.shiftKey && !this.wasMultiTouch) {
                // Drag to draw
                if (e.pointerType === 'touch' && this.pointerDownPoint && !this.isDrawingDrag) {
                    const dx = e.clientX - this.pointerDownPoint.x;
                    const dy = e.clientY - this.pointerDownPoint.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    // Threshold to start drawing on touch (distinguishes from tapping or intent to pan)
                    if (dist > 10) {
                        this.isDrawingDrag = true;
                        if (this.pointerDownEvent) {
                            this.useTool(this.pointerDownEvent); // draw at start point
                        }
                        this.useTool(e); // draw at current point
                    }
                } else if (this.isDrawingDrag) {
                    this.useTool(e);
                }
            }
        });

        const handlePointerEnd = (e) => {
            this.pointers.delete(e.pointerId);

            // Check if it was a single tap without dragging or multi-touch
            if (this.pointers.size === 0 && this.pointerDownEvent && !this.isDrawingDrag && !this.wasMultiTouch && this.currentTool) {
                this.useTool(this.pointerDownEvent);
            }

            if (this.pointers.size < 2) {
                // If 1 finger is left after pinch, update lastPanPoint to avoid jumping
                if (this.pointers.size === 1 && this.isPanning) {
                    const remainingPointer = Array.from(this.pointers.values())[0];
                    this.lastPanPoint = { x: remainingPointer.x, y: remainingPointer.y };
                }
            }

            if (this.pointers.size === 0) {
                this.isPanning = false;
                this.wasMultiTouch = false;
                this.pointerDownEvent = null;
                this.pointerDownPoint = null;
                this.isDrawingDrag = false;
                this.canvas.classList.remove('grabbing');
            }
        };

        this.canvas.addEventListener('pointerup', handlePointerEnd);
        this.canvas.addEventListener('pointercancel', handlePointerEnd);

        this.canvas.addEventListener('pointerleave', (e) => {
            handlePointerEnd(e);
            this.hoverGridPos = null;
            this.needsRedraw = true;
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            if (e.ctrlKey) {
                // Zoom
                const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;

                // Zoom towards mouse position
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Convert screen to world
                const worldX = (mouseX / this.camera.zoom) - this.camera.x;
                const worldY = (mouseY / this.camera.zoom) - this.camera.y;

                this.camera.zoom *= zoomAmount;
                this.camera.zoom = Math.max(0.2, Math.min(this.camera.zoom, 5));

                // Adjust camera to keep mouse over same world point
                this.camera.x = (mouseX / this.camera.zoom) - worldX;
                this.camera.y = (mouseY / this.camera.zoom) - worldY;
            } else {
                // Pan
                this.camera.x -= e.deltaX / this.camera.zoom;
                this.camera.y -= e.deltaY / this.camera.zoom;
            }

            this.needsRedraw = true;
        }, { passive: false });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Keyboard panning events
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code in this.keys) {
                this.keys[e.code] = true;
            }
        };

        const handleKeyUp = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code in this.keys) {
                this.keys[e.code] = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Cleanup handlers stored for destroy
        this.handleKeyDown = handleKeyDown;
        this.handleKeyUp = handleKeyUp;
    }

    screenToWorld(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (screenX - rect.left) / this.camera.zoom - this.camera.x;
        const y = (screenY - rect.top) / this.camera.zoom - this.camera.y;
        return { x, y };
    }

    worldToGrid(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.config.CELL_SIZE),
            y: Math.floor(worldY / this.config.CELL_SIZE)
        };
    }

    useTool(e) {
        const world = this.screenToWorld(e.clientX, e.clientY);
        const gridPos = this.worldToGrid(world.x, world.y);

        const cell = this.grid.getCell(gridPos.x, gridPos.y);
        if (this.currentTool === 'erase') {
            if (cell) this.grid.removeCell(gridPos.x, gridPos.y, cell.type);
        } else if (this.currentTool === 'sweeper') {
            const orientation = this.currentOrientation || 'horizontal';
            if (this.grid.canPlace(gridPos.x, gridPos.y, this.currentTool, orientation)) {
                this.grid.setCell(gridPos.x, gridPos.y, this.currentTool, { orientation });
            }
        } else if (this.currentTool === 'building') {
            const color = this.currentBuildingColor || 'red';
            if (this.grid.canPlace(gridPos.x, gridPos.y, this.currentTool)) {
                this.grid.setCell(gridPos.x, gridPos.y, this.currentTool, { color });
            }
        } else {
            if (this.grid.canPlace(gridPos.x, gridPos.y, this.currentTool)) {
                this.grid.setCell(gridPos.x, gridPos.y, this.currentTool);
            }
        }
    }

    setTool(toolName) {
        this.currentTool = toolName;
    }

    tintImage(image, color, x = 0, y = 0, w = image.width, h = image.height) {
        this.tintCanvas.width = w;
        this.tintCanvas.height = h;

        this.tintCtx.clearRect(0, 0, w, h);

        // Draw the original image snippet
        this.tintCtx.drawImage(image, x, y, w, h, 0, 0, w, h);

        // Multiply by red color
        this.tintCtx.globalCompositeOperation = 'source-atop';
        this.tintCtx.fillStyle = color;
        this.tintCtx.fillRect(0, 0, w, h);

        // Reset state
        this.tintCtx.globalCompositeOperation = 'source-over';

        return this.tintCanvas;
    }

    draw() {
        // Read theme dynamically from document
        const theme = document.documentElement.getAttribute('data-theme') || 'system';
        // For system, check prefers-color-scheme
        let isDark = false;
        if (theme === 'dark') {
            isDark = true;
        } else if (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            isDark = true;
        }

        this.ctx.fillStyle = isDark ? '#001223' : '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(this.camera.x, this.camera.y);

        this.drawGridLines();
        this.drawCells();

        this.ctx.restore();
    }

    drawGridLines() {
        const cs = this.config.CELL_SIZE;
        // Viewport bounds in world space
        const left = -this.camera.x;
        const top = -this.camera.y;
        const right = left + this.canvas.width / this.camera.zoom;
        const bottom = top + this.canvas.height / this.camera.zoom;

        const startX = Math.floor(left / cs) * cs;
        const startY = Math.floor(top / cs) * cs;

        this.ctx.strokeStyle = this.config.COLORS.GRID_LINE;
        this.ctx.lineWidth = 1 / this.camera.zoom; // Keep lines 1px visually

        this.ctx.beginPath();
        for (let x = startX; x < right; x += cs) {
            this.ctx.moveTo(x, top);
            this.ctx.lineTo(x, bottom);
        }
        for (let y = startY; y < bottom; y += cs) {
            this.ctx.moveTo(left, y);
            this.ctx.lineTo(right, y);
        }
        this.ctx.stroke();
    }


    getSolidBitmask(cx, cy, includeHover = false) {
        const hoverState = (includeHover && this.hoverGridPos) ? { x: this.hoverGridPos.x, y: this.hoverGridPos.y, tool: this.currentTool } : null;

        const isSolid = (nx, ny) => {
            if (hoverState && hoverState.x === nx && hoverState.y === ny) {
                if (hoverState.tool === 'solid') return true;
                if (hoverState.tool === 'erase') return false;
            }
            const cell = this.grid.getCell(nx, ny);
            return cell && cell.type === 'solid';
        };

        let bitmask = 0;
        if (isSolid(cx - 1, cy - 1)) bitmask |= 1; // NW
        if (isSolid(cx, cy - 1)) bitmask |= 2; // NE
        if (isSolid(cx - 1, cy)) bitmask |= 4; // SW
        if (isSolid(cx, cy)) bitmask |= 8; // SE
        return bitmask;
    }

    drawCells() {
        const cs = this.config.CELL_SIZE;

        const bitmaskToTile = {
            0: {cx: 0, cy: 3},
            1: {cx: 3, cy: 3},
            2: {cx: 0, cy: 2},
            3: {cx: 1, cy: 2},
            4: {cx: 0, cy: 0},
            5: {cx: 3, cy: 2},
            6: {cx: 2, cy: 3},
            7: {cx: 3, cy: 1},
            8: {cx: 1, cy: 3},
            9: {cx: 0, cy: 1},
            10: {cx: 1, cy: 0},
            11: {cx: 2, cy: 2},
            12: {cx: 3, cy: 0},
            13: {cx: 2, cy: 0},
            14: {cx: 1, cy: 1},
            15: {cx: 2, cy: 1}
        };

        // Draw entities (other than solid tiles)
        for (const [key, cell] of this.grid.cells.entries()) {
            const [x, y] = key.split(',').map(Number);
            const wx = x * cs;
            const wy = y * cs;

            if (cell.type === 'building') {
                const colorCode = cell.meta?.color || 'red';
                const colors = {
                    'red': '#ff4d4d',
                    'yellow': '#ffcc00',
                    'green': '#33cc33',
                    'blue': '#3399ff'
                };
                this.ctx.fillStyle = colors[colorCode] || colors['red'];
                this.ctx.fillRect(wx, wy, cs, cs);
                this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(wx, wy, cs, cs);
            } else if (cell.type === 'sweeper') {
                const orientation = cell.meta?.orientation || 'horizontal';
                if (this.images.sweeper && this.images.sweeper.complete) {
                    this.ctx.save();
                    // Move to center of sweeper
                    this.ctx.translate(wx + cs/2, wy + cs/2);
                    if (orientation === 'vertical') {
                        this.ctx.rotate(Math.PI / 2);
                    }
                    // The image is 600x600, which corresponds to 3x3 cells.
                    // We draw it centered. It covers from -1.5*cs to +1.5*cs in X and Y.
                    this.ctx.drawImage(this.images.sweeper, -cs * 1.5, -cs * 1.5, cs * 3, cs * 3);
                    this.ctx.restore();
                } else {
                    this.ctx.fillStyle = this.config.COLORS.SWEEPER;
                    if (orientation === 'horizontal') {
                        this.ctx.fillRect(wx - cs, wy, cs * 3, cs);
                    } else {
                        this.ctx.fillRect(wx, wy - cs, cs, cs * 3);
                    }
                }
            } else if (cell.type === 'pipe') {
                this.ctx.fillStyle = this.config.COLORS.PIPE || '#AAAAAA';
                this.ctx.fillRect(wx + cs*0.25, wy + cs*0.25, cs*0.5, cs*0.5);
            } else if (cell.type === 'bridge_in') {
                this.ctx.fillStyle = this.config.COLORS.BRIDGE_INPUT || '#FFFFFF';
                this.ctx.fillRect(wx + cs*0.1, wy + cs*0.1, cs*0.8, cs*0.8);
            } else if (cell.type === 'bridge_out') {
                this.ctx.fillStyle = this.config.COLORS.BRIDGE_OUTPUT || '#00FF00';
                this.ctx.fillRect(wx + cs*0.1, wy + cs*0.1, cs*0.8, cs*0.8);
            }
        }

        // Draw marching squares for solid tiles
        if (this.images.tile && this.images.tile.complete) {
            const left = -this.camera.x;
            const top = -this.camera.y;
            const right = left + this.canvas.width / this.camera.zoom;
            const bottom = top + this.canvas.height / this.camera.zoom;

            const startX = Math.floor(left / cs) - 1;
            const startY = Math.floor(top / cs) - 1;
            const endX = Math.ceil(right / cs) + 1;
            const endY = Math.ceil(bottom / cs) + 1;

            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen space

            // We iterate over intersections (cx, cy)
            for (let cy = startY; cy <= endY; cy++) {
                for (let cx = startX; cx <= endX; cx++) {
                    const bitmask = this.getSolidBitmask(cx, cy, false);
                    if (bitmask > 0) {
                        const t = bitmaskToTile[bitmask];

                        const leftWorld = cx * cs - cs / 2;
                        const topWorld = cy * cs - cs / 2;
                        const rightWorld = leftWorld + cs;
                        const bottomWorld = topWorld + cs;

                        const screenLeft = Math.round((leftWorld + this.camera.x) * this.camera.zoom);
                        const screenTop = Math.round((topWorld + this.camera.y) * this.camera.zoom);
                        const screenRight = Math.round((rightWorld + this.camera.x) * this.camera.zoom);
                        const screenBottom = Math.round((bottomWorld + this.camera.y) * this.camera.zoom);

                        const drawW = screenRight - screenLeft;
                        const drawH = screenBottom - screenTop;

                        this.ctx.drawImage(this.images.tile, t.cx * 256, t.cy * 256, 256, 256, screenLeft, screenTop, drawW, drawH);
                    }
                }
            }
            this.ctx.restore();
        } else {
            // Fallback for solid tiles if image not loaded
            for (const [key, cell] of this.grid.cells.entries()) {
                const [x, y] = key.split(',').map(Number);
                if (cell.type === 'solid') {
                    const wx = x * cs;
                    const wy = y * cs;
                    this.ctx.fillStyle = this.config.COLORS.SOLID_TILE;
                    this.ctx.fillRect(wx, wy, cs, cs);
                    this.ctx.strokeStyle = '#000';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(wx, wy, cs, cs);
                }
            }
        }

        // Draw hover preview for building tool
        if (this.hoverGridPos && this.currentTool === 'building') {
            const hx = this.hoverGridPos.x;
            const hy = this.hoverGridPos.y;
            const wx = hx * cs;
            const wy = hy * cs;
            const colorCode = this.currentBuildingColor || 'red';
            const colors = {
                'red': '#ff4d4d',
                'yellow': '#ffcc00',
                'green': '#33cc33',
                'blue': '#3399ff'
            };
            const canPlace = this.grid.canPlace(hx, hy, 'building');

            this.ctx.globalAlpha = 0.5;
            this.ctx.fillStyle = canPlace ? (colors[colorCode] || colors['red']) : 'red';
            this.ctx.fillRect(wx, wy, cs, cs);
            this.ctx.globalAlpha = 1.0;
        }

        // Draw hover preview for solid tool
        if (this.hoverGridPos && (this.currentTool === 'solid' || this.currentTool === 'erase')) {
            const hx = this.hoverGridPos.x;
            const hy = this.hoverGridPos.y;

            const canPlace = this.currentTool === 'erase' || this.grid.canPlace(hx, hy, 'solid');
            this.ctx.globalAlpha = 0.5; 

            if (this.images.tile && this.images.tile.complete) {
                const intersections = [
                    {cx: hx, cy: hy},
                    {cx: hx + 1, cy: hy},
                    {cx: hx, cy: hy + 1},
                    {cx: hx + 1, cy: hy + 1}
                ];

                if (this.currentTool === 'solid') {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

                    for (const pos of intersections) {
                        const cx = pos.cx;
                        const cy = pos.cy;
                        const bitmaskBase = this.getSolidBitmask(cx, cy, false);
                        const bitmaskHover = this.getSolidBitmask(cx, cy, true);

                        // If it changed, draw the hovered tile to preview it
                        if (bitmaskHover !== bitmaskBase && bitmaskHover > 0) {
                            const t = bitmaskToTile[bitmaskHover];

                            const leftWorld = cx * cs - cs / 2;
                            const topWorld = cy * cs - cs / 2;
                            const rightWorld = leftWorld + cs;
                            const bottomWorld = topWorld + cs;

                            const screenLeft = Math.round((leftWorld + this.camera.x) * this.camera.zoom);
                            const screenTop = Math.round((topWorld + this.camera.y) * this.camera.zoom);
                            const screenRight = Math.round((rightWorld + this.camera.x) * this.camera.zoom);
                            const screenBottom = Math.round((bottomWorld + this.camera.y) * this.camera.zoom);

                            const drawW = screenRight - screenLeft;
                            const drawH = screenBottom - screenTop;

                            if (!canPlace) {
                                // Draw the base tile first
                                this.ctx.drawImage(this.images.tile, t.cx * 256, t.cy * 256, 256, 256, screenLeft, screenTop, drawW, drawH);

                                // Clip to the exact hovered cell (hx, hy) to avoid bleeding into adjacent cells
                                const targetLeft = hx * cs;
                                const targetTop = hy * cs;
                                const screenTargetLeft = Math.round((targetLeft + this.camera.x) * this.camera.zoom);
                                const screenTargetTop = Math.round((targetTop + this.camera.y) * this.camera.zoom);
                                const screenTargetW = Math.round((targetLeft + cs + this.camera.x) * this.camera.zoom) - screenTargetLeft;
                                const screenTargetH = Math.round((targetTop + cs + this.camera.y) * this.camera.zoom) - screenTargetTop;

                                this.ctx.save();
                                this.ctx.beginPath();
                                this.ctx.rect(screenTargetLeft, screenTargetTop, screenTargetW, screenTargetH);
                                this.ctx.clip();

                                const tinted = this.tintImage(this.images.tile, 'red', t.cx * 256, t.cy * 256, 256, 256);
                                this.ctx.drawImage(tinted, 0, 0, 256, 256, screenLeft, screenTop, drawW, drawH);

                                this.ctx.restore();
                            } else {
                                this.ctx.drawImage(this.images.tile, t.cx * 256, t.cy * 256, 256, 256, screenLeft, screenTop, drawW, drawH);
                            }
                        }
                    }

                    this.ctx.restore();
                }
            } else {
                const wx = hx * cs;
                const wy = hy * cs;
                this.ctx.fillStyle = canPlace ? this.config.COLORS.SOLID_TILE : 'red';
                this.ctx.fillRect(wx, wy, cs, cs);
            }
            this.ctx.globalAlpha = 1.0;
        }

        // Draw sweeper hover preview
        if (this.hoverGridPos && this.currentTool === 'sweeper') {
            const hx = this.hoverGridPos.x;
            const hy = this.hoverGridPos.y;
            const wx = hx * cs;
            const wy = hy * cs;
            const orientation = this.currentOrientation || 'horizontal';

            let canPlace = this.grid.canPlace(hx, hy, 'sweeper', orientation);

            // Check if we are hovering exactly over an existing sweeper with the same orientation
            if (!canPlace) {
                const existingCenter = this.grid.getCell(hx, hy);
                if (existingCenter && existingCenter.type === 'sweeper' && existingCenter.meta.orientation === orientation) {
                    canPlace = true;
                }
            }

            this.ctx.globalAlpha = 0.5;
            if (this.images.sweeper && this.images.sweeper.complete) {
                this.ctx.save();
                this.ctx.translate(wx + cs/2, wy + cs/2);
                if (orientation === 'vertical') {
                    this.ctx.rotate(Math.PI / 2);
                }

                if (!canPlace) {
                    const tinted = this.tintImage(this.images.sweeper, 'red');
                    this.ctx.drawImage(tinted, -cs * 1.5, -cs * 1.5, cs * 3, cs * 3);
                } else {
                    this.ctx.drawImage(this.images.sweeper, -cs * 1.5, -cs * 1.5, cs * 3, cs * 3);
                }

                this.ctx.restore();
            } else {
                this.ctx.fillStyle = canPlace ? (this.config.COLORS.SWEEPER || 'orange') : 'red';
                if (orientation === 'horizontal') {
                    this.ctx.fillRect(wx - cs, wy, cs * 3, cs);
                } else {
                    this.ctx.fillRect(wx, wy - cs, cs, cs * 3);
                }
            }
            this.ctx.globalAlpha = 1.0;
        }

        // Draw liquids
        for (const [key, liquid] of this.simulation.liquids.entries()) {
            const [x, y] = key.split(',').map(Number);
            this.ctx.fillStyle = this.config.COLORS.LIQUID_BLOB || '#4da8da';
            this.ctx.beginPath();
            this.ctx.arc(x * cs + cs/2, y * cs + cs/2, cs*0.2, 0, Math.PI*2);
            this.ctx.fill();
        }

        // Combine coverage of all sweepers + hovered sweeper
        const allCoverage = new Set();
        const sweepersToCalculate = [];

        for (const [key, cell] of this.grid.cells.entries()) {
            if (cell.type === 'sweeper') {
                const [cx, cy] = key.split(',').map(Number);
                sweepersToCalculate.push({ x: cx, y: cy });
            }
        }

        if (this.hoverGridPos && this.currentTool === 'sweeper') {
            sweepersToCalculate.push({ x: this.hoverGridPos.x, y: this.hoverGridPos.y });
        }

        const radius = this.config.SWEEPER_RADIUS || 4;
        const hoverState = this.hoverGridPos ? { x: this.hoverGridPos.x, y: this.hoverGridPos.y, tool: this.currentTool } : null;

        for (const s of sweepersToCalculate) {
            const { coverage } = calculateSweeperCoverage(s.x, s.y, radius, this.grid, hoverState);
            for (const pos of coverage) {
                allCoverage.add(pos);
            }
        }

        if (allCoverage.size > 0) {
            // Draw greenish transparent fill
            this.ctx.fillStyle = 'rgba(100, 255, 100, 0.15)';
            for (const pos of allCoverage) {
                const [px, py] = pos.split(',').map(Number);
                this.ctx.fillRect(px * cs, py * cs, cs, cs);
            }

            // Calculate the outline and dots for the coverage area
            this.ctx.strokeStyle = '#32cd32';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([8, 8]); // Dashed gap border
            this.ctx.fillStyle = '#32cd32';
            const dotRadius = 3;

            for (const pos of allCoverage) {
                const [px, py] = pos.split(',').map(Number);
                const wx = px * cs;
                const wy = py * cs;

                const nTop = allCoverage.has(`${px},${py - 1}`);
                const nBottom = allCoverage.has(`${px},${py + 1}`);
                const nLeft = allCoverage.has(`${px - 1},${py}`);
                const nRight = allCoverage.has(`${px + 1},${py}`);

                this.ctx.beginPath();
                if (!nTop) {
                    this.ctx.moveTo(wx, wy);
                    this.ctx.lineTo(wx + cs, wy);
                }
                if (!nRight) {
                    this.ctx.moveTo(wx + cs, wy);
                    this.ctx.lineTo(wx + cs, wy + cs);
                }
                if (!nBottom) {
                    this.ctx.moveTo(wx + cs, wy + cs);
                    this.ctx.lineTo(wx, wy + cs);
                }
                if (!nLeft) {
                    this.ctx.moveTo(wx, wy + cs);
                    this.ctx.lineTo(wx, wy);
                }
                this.ctx.stroke();

                // Top-Left corner inner dot
                if (allCoverage.has(`${px - 1},${py}`) && allCoverage.has(`${px},${py - 1}`) && allCoverage.has(`${px - 1},${py - 1}`)) {
                    this.ctx.beginPath();
                    this.ctx.arc(wx, wy, dotRadius, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
            this.ctx.setLineDash([]); // Reset line dash
        }
    }

    loop(timestamp) {
        this.simulation.update(timestamp);

        // Handle keyboard panning
        const panSpeed = 20 / this.camera.zoom;
        let panned = false;
        if (this.keys.KeyW || this.keys.ArrowUp) { this.camera.y += panSpeed; panned = true; }
        if (this.keys.KeyS || this.keys.ArrowDown) { this.camera.y -= panSpeed; panned = true; }
        if (this.keys.KeyA || this.keys.ArrowLeft) { this.camera.x += panSpeed; panned = true; }
        if (this.keys.KeyD || this.keys.ArrowRight) { this.camera.x -= panSpeed; panned = true; }

        if (panned) {
            this.needsRedraw = true;
        }

        if (this.needsRedraw) {
            this.draw();
            this.needsRedraw = false;
        }
        this.animationFrameId = requestAnimationFrame(this.loop);
    }
}
