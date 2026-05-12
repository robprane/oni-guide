// Line of sight and coverage calculations
export function calculateSweeperCoverage(cx, cy, radius, grid) {
    const coverage = new Set();
    const blocked = new Set();

    // The sweeper covers a square shape.
    // For a radius of 4, the coverage is a 9x9 square.
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            const targetX = cx + dx;
            const targetY = cy + dy;

            if (dx === 0 && dy === 0) {
                coverage.add(`${targetX},${targetY}`);
                continue;
            }

            // Check Line of Sight
            if (hasLineOfSight(cx, cy, targetX, targetY, grid)) {
                coverage.add(`${targetX},${targetY}`);
            } else {
                blocked.add(`${targetX},${targetY}`);
            }
        }
    }

    return { coverage, blocked };
}

// Bresenham's line algorithm variation for thick LoS checking
function hasLineOfSight(x0, y0, x1, y1, grid) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
        if (cx === x1 && cy === y1) return true;

        // Don't block on the starting cell itself
        if ((cx !== x0 || cy !== y0) && isSolid(cx, cy, grid)) {
            return false;
        }

        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
    }
}

function isSolid(x, y, grid) {
    const cell = grid.getCell(x, y);
    return cell && cell.type === 'solid';
}