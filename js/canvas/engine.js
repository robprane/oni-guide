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

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverGridPos = null;
            this.needsRedraw = true;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const world = this.screenToWorld(e.clientX, e.clientY);
            const gridPos = this.worldToGrid(world.x, world.y);

            if (!this.hoverGridPos || this.hoverGridPos.x !== gridPos.x || this.hoverGridPos.y !== gridPos.y) {
                this.hoverGridPos = gridPos;
                this.needsRedraw = true;
            }

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


    getSolidBitmask(x, y) {
        const hoverState = this.hoverGridPos ? { x: this.hoverGridPos.x, y: this.hoverGridPos.y, tool: this.currentTool } : null;

        const isSolid = (nx, ny) => {
            if (hoverState && hoverState.x === nx && hoverState.y === ny) {
                if (hoverState.tool === 'solid') return true;
                if (hoverState.tool === 'erase') return false;
            }
            const cell = this.grid.getCell(nx, ny);
            return cell && cell.type === 'solid';
        };

        let bitmask = 0;
        if (isSolid(x, y - 1)) bitmask |= 1; // Top
        if (isSolid(x + 1, y)) bitmask |= 2; // Right
        if (isSolid(x, y + 1)) bitmask |= 4; // Bottom
        if (isSolid(x - 1, y)) bitmask |= 8; // Left
        return bitmask;
    }

    drawCells() {
        const cs = this.config.CELL_SIZE;
        const bitmaskToTile = {
            0: {cx: 1, cy: 5},
            1: {cx: 1, cy: 3},
            2: {cx: 3, cy: 5},
            3: {cx: 3, cy: 3},
            4: {cx: 1, cy: 1},
            5: {cx: 1, cy: 2},
            6: {cx: 3, cy: 1},
            7: {cx: 3, cy: 2},
            8: {cx: 5, cy: 5},
            9: {cx: 5, cy: 3},
            10: {cx: 4, cy: 5},
            11: {cx: 4, cy: 3},
            12: {cx: 5, cy: 1},
            13: {cx: 5, cy: 2},
            14: {cx: 4, cy: 1},
            15: {cx: 4, cy: 2}
        };

        // Draw entities
        for (const [key, cell] of this.grid.cells.entries()) {
            const [x, y] = key.split(',').map(Number);
            const wx = x * cs;
            const wy = y * cs;

            if (cell.type === 'solid') {
                if (this.images.tile && this.images.tile.complete) {
                    const bitmask = this.getSolidBitmask(x, y);
                    const t = bitmaskToTile[bitmask];
                    this.ctx.drawImage(this.images.tile, t.cx * 200, t.cy * 200, 200, 200, wx, wy, cs, cs);
                } else {
                    this.ctx.fillStyle = this.config.COLORS.SOLID_TILE;
                    this.ctx.fillRect(wx, wy, cs, cs);
                    this.ctx.strokeStyle = '#000';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(wx, wy, cs, cs);
                }
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



        // Draw hover preview
        if (this.hoverGridPos && this.currentTool === 'solid') {
            const hx = this.hoverGridPos.x;
            const hy = this.hoverGridPos.y;
            const wx = hx * cs;
            const wy = hy * cs;

            this.ctx.globalAlpha = 0.75; // 25% transparent
            if (this.images.tile && this.images.tile.complete) {
                const bitmask = this.getSolidBitmask(hx, hy);
                const t = bitmaskToTile[bitmask];
                this.ctx.drawImage(this.images.tile, t.cx * 200, t.cy * 200, 200, 200, wx, wy, cs, cs);
            } else {
                this.ctx.fillStyle = this.config.COLORS.SOLID_TILE;
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

            this.ctx.globalAlpha = 0.75;
            if (this.images.sweeper && this.images.sweeper.complete) {
                this.ctx.save();
                this.ctx.translate(wx + cs/2, wy + cs/2);
                if (orientation === 'vertical') {
                    this.ctx.rotate(Math.PI / 2);
                }
                this.ctx.drawImage(this.images.sweeper, -cs * 1.5, -cs * 1.5, cs * 3, cs * 3);
                this.ctx.restore();
            } else {
                this.ctx.fillStyle = this.config.COLORS.SWEEPER || 'orange';
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

        if (this.needsRedraw) {
            this.draw();
            this.needsRedraw = false;
        }
        this.animationFrameId = requestAnimationFrame(this.loop);
    }
}
