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
        // Only serialize core objects to keep size minimal.
        // We exclude 'sweeper_part' because it's derived from 'sweeper'.
        const data = [];
        for (const [key, cell] of this.cells.entries()) {
            if (cell.type === 'sweeper_part') continue;

            const [x, y] = key.split(',').map(Number);
            // Compact structure: [x, y, type_code, orientation_code(optional)]
            // Using 1 for solid, 2 for sweeper to save space, but let's keep it simple with strings or short strings first.
            // Actually, we can just use an array: [x, y, type, orientation]
            const item = [x, y, cell.type];
            if (cell.type === 'sweeper' && cell.meta && cell.meta.orientation) {
                item.push(cell.meta.orientation === 'horizontal' ? 'h' : 'v');
            }
            data.push(item);
        }
        return data;
    }

    deserialize(data) {
        this.cells.clear();
        if (!Array.isArray(data)) return;

        // Ensure we suppress notifyChange until the end
        const originalNotify = this._notifyChange;
        let needsRedraw = false;
        this._notifyChange = () => { needsRedraw = true; };

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

        this._notifyChange = originalNotify;
        if (needsRedraw) {
            this._notifyChange();
        }
    }
}