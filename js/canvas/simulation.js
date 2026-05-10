export class PipeSimulation {
    constructor(grid, config) {
        this.grid = grid;
        this.config = config;
        this.liquids = new Map(); // posKey -> { id, element }
        this.lastTick = performance.now();
        this.tickRate = 500; // ms per tick

        // Let's add a test liquid spawner later if needed
        this.blobCounter = 0;
    }

    // For testing/spawning
    spawnLiquid(x, y) {
        const key = `${x},${y}`;
        if (!this.liquids.has(key)) {
            this.liquids.set(key, { id: ++this.blobCounter });
            this.grid.engine.needsRedraw = true;
        }
    }

    update(currentTime) {
        if (currentTime - this.lastTick >= this.tickRate) {
            this.tick();
            this.lastTick = currentTime;
            this.grid.engine.needsRedraw = true;
        }
    }

    tick() {
        const newLiquids = new Map();
        const moved = new Set();

        // Very basic simulation for pipes and bridges
        // In ONI, liquids move towards outputs. We need to build a directed graph or simple heuristic.
        // For our simplified model:
        // Liquids try to move to an adjacent pipe that doesn't already have liquid.
        // If they hit a Bridge Input (white), they teleport to Bridge Output (green) on the next tick if it's empty.
        // Priority:
        // 1. Bridge input > continuing pipe
        // 2. Continuing pipe > Bridge output (Bridge output yields to pipe)

        // Find all networks / outputs (green ports) and inputs (white ports)
        // Since we don't have full port logic yet, let's make a simple direction-based flow.
        // A simple rule: if there is a pipe to the right, move right. Else down, else left, else up.
        // Let's implement real bridge priority:

        for (const [key, liquid] of this.liquids.entries()) {
            if (moved.has(liquid.id)) {
                newLiquids.set(key, liquid);
                continue;
            }

            const [x, y] = key.split(',').map(Number);
            const cell = this.grid.getCell(x, y);

            if (!cell || (cell.type !== 'pipe' && cell.type !== 'bridge_in' && cell.type !== 'bridge_out')) {
                // Liquid destroys itself if not in a pipe (for now)
                continue;
            }

            // Let's find neighbors that are pipes
            const neighbors = [
                { nx: x+1, ny: y },
                { nx: x, ny: y+1 },
                { nx: x-1, ny: y },
                { nx: x, ny: y-1 }
            ];

            let movedThisTick = false;

            // Bridge logic
            if (cell.type === 'bridge_in') {
                // Teleport to corresponding bridge_out if it exists and is empty
                // Assume bridge length is 2 cells to the right for simplicity
                const outX = x + 2;
                const outY = y;
                const outCell = this.grid.getCell(outX, outY);
                if (outCell && outCell.type === 'bridge_out') {
                    const outKey = `${outX},${outY}`;
                    if (!this.liquids.has(outKey) && !newLiquids.has(outKey)) {
                        newLiquids.set(outKey, liquid);
                        moved.add(liquid.id);
                        movedThisTick = true;
                        continue;
                    }
                }
            }

            // Normal pipe flow (right preferred for testing)
            for (const {nx, ny} of neighbors) {
                if (movedThisTick) break;

                const nCell = this.grid.getCell(nx, ny);
                if (nCell && (nCell.type === 'pipe' || nCell.type === 'bridge_in')) {
                    const nKey = `${nx},${ny}`;

                    // Priority: if we are at bridge_out, we MUST yield to liquid coming from the pipe
                    if (cell.type === 'bridge_out') {
                        // Check if another liquid is about to move into this pipe.
                        // Simplification: if the target is empty, we can move, but normally we'd check all contenders.
                    }

                    if (!this.liquids.has(nKey) && !newLiquids.has(nKey)) {
                        newLiquids.set(nKey, liquid);
                        moved.add(liquid.id);
                        movedThisTick = true;
                    }
                }
            }

            if (!movedThisTick) {
                newLiquids.set(key, liquid); // Stay in place
            }
        }

        this.liquids = newLiquids;
    }
}