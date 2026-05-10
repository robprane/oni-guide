export class Grid {
    constructor(engine) {
        this.engine = engine;
        this.cells = new Map(); // key: "x,y", value: { type, meta }
    }

    getKey(x, y) {
        return `${x},${y}`;
    }

    setCell(x, y, type, meta = {}) {
        this.cells.set(this.getKey(x, y), { type, meta });
        this.engine.needsRedraw = true;
    }

    getCell(x, y) {
        return this.cells.get(this.getKey(x, y));
    }

    removeCell(x, y, type) {
        const key = this.getKey(x, y);
        const cell = this.cells.get(key);
        if (cell && cell.type === type) {
            this.cells.delete(key);
            this.engine.needsRedraw = true;
        } else if (cell && Array.isArray(cell.type)) {
            // Future-proofing for multi-layer (e.g. pipe under solid tile)
        }
    }

    clear() {
        this.cells.clear();
        this.engine.needsRedraw = true;
    }
}