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
        } else {
            this.grid.setCell(gridPos.x, gridPos.y, this.currentTool);
        }
    }

    setTool(toolName) {
        this.currentTool = toolName;
    }

    draw() {
        this.ctx.fillStyle = this.config.COLORS.BACKGROUND;
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
                const { coverage, blocked } = calculateSweeperCoverage(cx, cy, radius, this.grid);

                this.ctx.fillStyle = this.config.COLORS.SWEEPER_AREA;
                for (const pos of coverage) {
                    const [px, py] = pos.split(',').map(Number);
                    this.ctx.fillRect(px * cs, py * cs, cs, cs);
                }

                // Optional: visualize blocked areas lightly
                // this.ctx.fillStyle = this.config.COLORS.SWEEPER_BLOCKED;
                // for (const pos of blocked) {
                //     const [px, py] = pos.split(',').map(Number);
                //     this.ctx.fillRect(px * cs, py * cs, cs, cs);
                // }
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
                this.ctx.fillStyle = this.config.COLORS.SWEEPER;
                this.ctx.beginPath();
                this.ctx.arc(wx + cs/2, wy + cs/2, cs*0.4, 0, Math.PI*2);
                this.ctx.fill();

                // Add center dot
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.arc(wx + cs/2, wy + cs/2, cs*0.1, 0, Math.PI*2);
                this.ctx.fill();
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