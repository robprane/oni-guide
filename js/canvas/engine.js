import { Grid } from './grid.js';
import { calculateSweeperCoverage } from './los.js';
import { PipeSimulation } from './simulation.js';

export class CanvasEngine {
    constructor(canvasEl, config) {
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        this.config = config;

        this.camera = { x: 0, y: 0, zoom: 1 };
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };

        this.grid = new Grid(this);
        this.simulation = new PipeSimulation(this.grid, this.config);
        this.currentTool = null;
        this.needsRedraw = true;

        this.setupEvents();
        this.resize();

        this.resizeHandler = this.resize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        this.loop = this.loop.bind(this);
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    destroy() {
        window.removeEventListener('resize', this.resizeHandler);
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
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                // Middle click or Shift+Left click to pan
                this.isDragging = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.canvas.style.cursor = 'grabbing';
            } else if (e.button === 0 && this.currentTool) {
                this.useTool(e);
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.camera.x += dx / this.camera.zoom;
                this.camera.y += dy / this.camera.zoom;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.needsRedraw = true;
            } else if (e.buttons === 1 && this.currentTool && !e.shiftKey) {
                // Drag to draw
                this.useTool(e);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
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

            this.needsRedraw = true;
        }, { passive: false });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
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

        if (this.currentTool === 'erase') {
            const cell = this.grid.getCell(gridPos.x, gridPos.y);
            if (cell) this.grid.removeCell(gridPos.x, gridPos.y, cell.type);
        } else if (this.currentTool === 'spawn_liquid') {
            this.simulation.spawnLiquid(gridPos.x, gridPos.y);
        } else if (this.currentTool === 'bridge') {
            // A bridge spans 3 tiles horizontally for now: IN, PIPE, OUT
            this.grid.setCell(gridPos.x, gridPos.y, 'bridge_in');
            this.grid.setCell(gridPos.x + 1, gridPos.y, 'pipe');
            this.grid.setCell(gridPos.x + 2, gridPos.y, 'bridge_out');
        } else if (this.currentTool === 'sweeper') {
            this.grid.setCell(gridPos.x, gridPos.y, this.currentTool, { orientation: this.currentOrientation || 'horizontal' });
        } else {
            this.grid.setCell(gridPos.x, gridPos.y, this.currentTool);
        }
    }

    setTool(toolName) {
        this.currentTool = toolName;
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

    drawCells() {
        const cs = this.config.CELL_SIZE;

        // Draw Sweeper Coverage areas first so they are behind entities
        for (const [key, cell] of this.grid.cells.entries()) {
            if (cell.type === 'sweeper') {
                const [cx, cy] = key.split(',').map(Number);
                const radius = this.config.SWEEPER_RADIUS || 4;
                const { coverage } = calculateSweeperCoverage(cx, cy, radius, this.grid, cell.meta?.orientation);

                // Draw greenish transparent fill
                this.ctx.fillStyle = 'rgba(100, 255, 100, 0.15)';
                for (const pos of coverage) {
                    const [px, py] = pos.split(',').map(Number);
                    this.ctx.fillRect(px * cs, py * cs, cs, cs);
                }

                // Calculate the outline and dots for the coverage area
                this.ctx.strokeStyle = '#32cd32';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([8, 8]); // Dashed gap border

                this.ctx.fillStyle = '#32cd32';
                const dotRadius = 3;

                // For each cell in coverage, check its 4 neighbors to see if we need an edge border
                for (const pos of coverage) {
                    const [px, py] = pos.split(',').map(Number);
                    const wx = px * cs;
                    const wy = py * cs;

                    const nTop = coverage.has(`${px},${py - 1}`);
                    const nBottom = coverage.has(`${px},${py + 1}`);
                    const nLeft = coverage.has(`${px - 1},${py}`);
                    const nRight = coverage.has(`${px + 1},${py}`);

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

                    // Draw corner dots if the corner is internal (surrounded by covered cells)
                    // Basically, if the corner itself is an inner corner where we WOULD have drawn a corner line if it were convex,
                    // but it's concave, or simply at the corners of any interior cell that touches other covered cells.
                    // Wait, the prompt said: "Только те углы, где нет контура" (Only those corners where there is no border).
                    // So we check all 4 corners of the cell. If the corner does not lie on an edge of the coverage, we draw a dot.
                    // A corner is on the edge if ANY of the 3 adjacent cells (sharing that corner) is NOT in coverage.
                    // Actually, a corner is shared by 4 cells. If ALL 4 cells are in coverage, it's strictly internal, so no border passes through it.
                    // Let's just draw dots at corners where all 4 adjacent cells are covered.

                    // Top-Left corner: shared by (px,py), (px-1,py), (px,py-1), (px-1,py-1)
                    if (coverage.has(`${px - 1},${py}`) && coverage.has(`${px},${py - 1}`) && coverage.has(`${px - 1},${py - 1}`)) {
                        this.ctx.beginPath();
                        this.ctx.arc(wx, wy, dotRadius, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    // Bottom-Right corner: shared by (px,py), (px+1,py), (px,py+1), (px+1,py+1)
                    // We only need to check Top-Left for each cell to avoid drawing the same dot 4 times.
                }

                this.ctx.setLineDash([]); // Reset line dash
            }
        }

        // Draw entities
        for (const [key, cell] of this.grid.cells.entries()) {
            const [x, y] = key.split(',').map(Number);
            const wx = x * cs;
            const wy = y * cs;

            if (cell.type === 'solid') {
                this.ctx.fillStyle = this.config.COLORS.SOLID_TILE;
                this.ctx.fillRect(wx, wy, cs, cs);
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(wx, wy, cs, cs);
            } else if (cell.type === 'sweeper') {
                const orientation = cell.meta?.orientation || 'horizontal';
                this.ctx.fillStyle = this.config.COLORS.SWEEPER;

                if (orientation === 'horizontal') {
                    // Central circle
                    this.ctx.beginPath();
                    this.ctx.arc(wx + cs/2, wy + cs/2, cs*0.4, 0, Math.PI*2);
                    this.ctx.fill();
                    // Left arm
                    this.ctx.fillRect(wx - cs + cs*0.1, wy + cs*0.3, cs*0.9, cs*0.4);
                    // Right arm
                    this.ctx.fillRect(wx + cs*0.5, wy + cs*0.3, cs*0.9, cs*0.4);
                } else {
                    // Central circle
                    this.ctx.beginPath();
                    this.ctx.arc(wx + cs/2, wy + cs/2, cs*0.4, 0, Math.PI*2);
                    this.ctx.fill();
                    // Top arm
                    this.ctx.fillRect(wx + cs*0.3, wy - cs + cs*0.1, cs*0.4, cs*0.9);
                    // Bottom arm
                    this.ctx.fillRect(wx + cs*0.3, wy + cs*0.5, cs*0.4, cs*0.9);
                }

                // Add center dot
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.arc(wx + cs/2, wy + cs/2, cs*0.1, 0, Math.PI*2);
                this.ctx.fill();
            } else if (cell.type === 'sweeper_part') {
                // Not drawn explicitly, it's drawn by the center 'sweeper' cell
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

        // Draw liquids
        for (const [key, liquid] of this.simulation.liquids.entries()) {
            const [x, y] = key.split(',').map(Number);
            this.ctx.fillStyle = this.config.COLORS.LIQUID_BLOB || '#4da8da';
            this.ctx.beginPath();
            this.ctx.arc(x * cs + cs/2, y * cs + cs/2, cs*0.2, 0, Math.PI*2);
            this.ctx.fill();
        }
    }

    loop(timestamp) {
        this.simulation.update(timestamp);

        if (this.needsRedraw) {
            this.draw();
            this.needsRedraw = false;
        }
        this.animationFrameId = requestAnimationFrame(this.loop);
    }
}