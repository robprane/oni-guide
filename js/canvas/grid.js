export class Grid {
    constructor(engine) {
        this.engine = engine;
        this.cells = new Map(); // key: "x,y", value: { type, meta }
    }

    getKey(x, y) {
        return `${x},${y}`;
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
        this.engine.needsRedraw = true;
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
            this.engine.needsRedraw = true;
        } else if (cell.type === type) {
            this.cells.delete(key);
            this.engine.needsRedraw = true;
        } else if (Array.isArray(cell.type)) {
            // Future-proofing for multi-layer
        }
    }

    clear() {
        this.cells.clear();
        this.engine.needsRedraw = true;
    }
}