// Line of sight and coverage calculations
export function calculateSweeperCoverage(cx, cy, radius, grid, sweeperOrientation = 'horizontal') {
    const coverage = new Set();
    const blocked = new Set();

    // The sweeper covers a square shape relative to the center.
    // For a radius of 4 (5 cells including center), the coverage is a 9x9 square.
    // The sweeper itself occupies 1x3, but LoS calculation originates from the center tile.

    // We need to identify all cells belonging to this specific sweeper so we don't treat them as solid.
    // However, sweeper cells are not solid anyway. If the user places solid blocks OVER the sweeper,
    // they should block, except the starting cell. The starting cell doesn't block.

    // Actually, in ONI, the LoS originates from the center of the 1x3 structure.
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

        // If we hit a solid block, it covers the surface of the solid block,
        // meaning the solid block ITSELF is included in coverage, but anything BEHIND it is blocked.
        // Therefore, we only fail LoS if a PREVIOUS step in the path was solid.
        // We will restructure this slightly to allow the first solid block to be visible, but block further.

        // Wait, Bresenham's line checks intermediate points.
        // If an intermediate point (which is not the starting point and not the target point) is solid,
        // then the target point is blocked.
        if ((cx !== x0 || cy !== y0) && (cx !== x1 || cy !== y1) && isSolid(cx, cy, grid)) {
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