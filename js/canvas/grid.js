export class Grid {
    constructor(engine) {
        this.engine = engine;
        this.cells = new Map(); // key: "x,y", value: { type, meta }
        this.topologyVersion = 0;
    }

    _notifyChange() {
        this.topologyVersion++;
        this.engine.needsRedraw = true;
        if (this.engine.canvas) {
            this.engine.canvas.dispatchEvent(new CustomEvent('grid-updated'));
        }
    }

    getKey(x, y) {
        return `${x},${y}`;
    }

    canPlace(x, y, type, orientation = 'horizontal') {
        if (type === 'sweeper') {
            const parts = [];
            if (orientation === 'horizontal') {
                parts.push({px: x - 1, py: y});
                parts.push({px: x, py: y});
                parts.push({px: x + 1, py: y});
            } else {
                parts.push({px: x, py: y - 1});
                parts.push({px: x, py: y});
                parts.push({px: x, py: y + 1});
            }
            // Check if any part is occupied
            for (const p of parts) {
                if (this.getCell(p.px, p.py)) {
                    return false;
                }
            }
            return true;
        } else if (type === 'building') {
            const cell = this.getCell(x, y);
            return !cell || cell.type === 'building';
        } else {
            // For other structures, just check the single cell
            return !this.getCell(x, y);
        }
    }

    setCell(x, y, type, meta = {}) {
        if (type === 'sweeper') {
            const orientation = meta.orientation || 'horizontal';

            // Remove existing logic to prevent overlapping partial structures if needed
            // A sweeper occupies 3 tiles. We place the 'sweeper' object at the center tile.
            // And we can place 'sweeper_part' at the adjacent tiles.
            const parts = [];
            if (orientation === 'horizontal') {
                parts.push({px: x - 1, py: y});
                parts.push({px: x, py: y, isCenter: true});
                parts.push({px: x + 1, py: y});
            } else {
                parts.push({px: x, py: y - 1});
                parts.push({px: x, py: y, isCenter: true});
                parts.push({px: x, py: y + 1});
            }

            // First, clear these cells
            for (const p of parts) {
                const existing = this.getCell(p.px, p.py);
                if (existing) this.removeCell(p.px, p.py, existing.type);
            }

            // Then place the sweeper parts
            for (const p of parts) {
                if (p.isCenter) {
                    this.cells.set(this.getKey(p.px, p.py), { type: 'sweeper', meta: { ...meta, orientation, center: {x, y} } });
                } else {
                    this.cells.set(this.getKey(p.px, p.py), { type: 'sweeper_part', meta: { center: {x, y} } });
                }
            }
        } else {
            this.cells.set(this.getKey(x, y), { type, meta });
        }
        this._notifyChange();
    }

    getCell(x, y) {
        return this.cells.get(this.getKey(x, y));
    }

    removeCell(x, y, type) {
        const key = this.getKey(x, y);
        const cell = this.cells.get(key);
        if (!cell) return;

        if (cell.type === 'sweeper' || cell.type === 'sweeper_part') {
            // Remove the whole sweeper
            const cx = cell.meta.center.x;
            const cy = cell.meta.center.y;
            const centerCell = this.cells.get(this.getKey(cx, cy));

            if (centerCell && centerCell.type === 'sweeper') {
                const orientation = centerCell.meta.orientation;
                const parts = orientation === 'horizontal' ?
                    [{px: cx - 1, py: cy}, {px: cx, py: cy}, {px: cx + 1, py: cy}] :
                    [{px: cx, py: cy - 1}, {px: cx, py: cy}, {px: cx, py: cy + 1}];

                for (const p of parts) {
                    const pKey = this.getKey(p.px, p.py);
                    const pCell = this.cells.get(pKey);
                    if (pCell && (pCell.type === 'sweeper' || pCell.type === 'sweeper_part')) {
                        this.cells.delete(pKey);
                    }
                }
            } else {
                // Fallback in case state is corrupted
                this.cells.delete(key);
            }
            this._notifyChange();
        } else if (cell.type === type) {
            this.cells.delete(key);
            this._notifyChange();
        } else if (Array.isArray(cell.type)) {
            // Future-proofing for multi-layer
        }
    }

    clear() {
        this.cells.clear();
        this._notifyChange();
    }

    serialize() {
        const data = {};
        const solidCells = [];
        const sweeperCells = [];
        const buildingCells = [];

        for (const [key, cell] of this.cells.entries()) {
            if (cell.type === 'sweeper_part') continue;
            const [x, y] = key.split(',').map(Number);
            if (cell.type === 'solid') {
                solidCells.push({x, y});
            } else if (cell.type === 'sweeper') {
                const orientation = cell.meta && cell.meta.orientation === 'vertical' ? 'v' : undefined;
                if (orientation) sweeperCells.push([x, y, orientation]);
                else sweeperCells.push([x, y]);
            } else if (cell.type === 'building') {
                const colorCode = cell.meta && cell.meta.color ? cell.meta.color[0] : 'r'; // r, y, g, b
                buildingCells.push([x, y, colorCode]);
            }
        }

        if (solidCells.length > 0) {
            solidCells.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

            const lines = [];
            let currentLine = null;
            for (const c of solidCells) {
                if (!currentLine) {
                    currentLine = {x1: c.x, x2: c.x, y: c.y};
                } else if (c.y === currentLine.y && c.x === currentLine.x2 + 1) {
                    currentLine.x2 = c.x;
                } else {
                    lines.push(currentLine);
                    currentLine = {x1: c.x, x2: c.x, y: c.y};
                }
            }
            if (currentLine) lines.push(currentLine);

            const rects = [];
            const usedLines = new Set();

            for (let i = 0; i < lines.length; i++) {
                if (usedLines.has(i)) continue;
                const line = lines[i];
                let currentRect = {x1: line.x1, y1: line.y, x2: line.x2, y2: line.y};
                usedLines.add(i);

                let nextY = line.y + 1;
                while (true) {
                    let foundMatch = false;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (usedLines.has(j)) continue;
                        const nextLine = lines[j];
                        if (nextLine.y > nextY) break;
                        if (nextLine.y === nextY && nextLine.x1 === currentRect.x1 && nextLine.x2 === currentRect.x2) {
                            currentRect.y2 = nextY;
                            usedLines.add(j);
                            nextY++;
                            foundMatch = true;
                            break;
                        }
                    }
                    if (!foundMatch) break;
                }

                if (currentRect.x1 === currentRect.x2 && currentRect.y1 === currentRect.y2) {
                    rects.push([currentRect.x1, currentRect.y1]);
                } else {
                    rects.push([currentRect.x1, currentRect.y1, currentRect.x2, currentRect.y2]);
                }
            }
            data.s = rects;
        }

        if (sweeperCells.length > 0) {
            data.w = sweeperCells;
        }

        if (buildingCells.length > 0) {
            data.b = buildingCells;
        }

        return data;
    }

    deserialize(data) {
        this.cells.clear();
        if (!data) return;

        const originalNotify = this._notifyChange;
        let needsRedraw = false;
        this._notifyChange = () => { needsRedraw = true; };

        // Legacy support (Array format)
        if (Array.isArray(data)) {
            for (const item of data) {
                if (Array.isArray(item) && item.length >= 3) {
                    const [x, y, type, orientationCode] = item;
                    const meta = {};
                    if (type === 'sweeper') {
                        meta.orientation = orientationCode === 'v' ? 'vertical' : 'horizontal';
                    }
                    this.setCell(x, y, type, meta);
                }
            }
        } else {
            // New dictionary format
            if (data.s) {
                for (const rect of data.s) {
                    if (rect.length === 2) {
                        this.setCell(rect[0], rect[1], 'solid', {});
                    } else if (rect.length === 4) {
                        for (let y = rect[1]; y <= rect[3]; y++) {
                            for (let x = rect[0]; x <= rect[2]; x++) {
                                this.setCell(x, y, 'solid', {});
                            }
                        }
                    }
                }
            }
            if (data.w) {
                for (const sweep of data.w) {
                    const x = sweep[0];
                    const y = sweep[1];
                    const orientation = sweep[2] === 'v' ? 'vertical' : 'horizontal';
                    this.setCell(x, y, 'sweeper', {orientation});
                }
            }
            if (data.b) {
                const colorMap = { 'r': 'red', 'y': 'yellow', 'g': 'green', 'b': 'blue' };
                for (const b of data.b) {
                    const x = b[0];
                    const y = b[1];
                    const color = colorMap[b[2]] || 'red';
                    this.setCell(x, y, 'building', { color });
                }
            }
        }

        this._notifyChange = originalNotify;
        if (needsRedraw) {
            this._notifyChange();
        }
    }
}