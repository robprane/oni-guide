// Line of sight and coverage calculations
export function calculateSweeperCoverage(cx, cy, radius, grid) {
    const coverage = new Set();
    const blocked = new Set();

    // The sweeper covers a diamond shape.
    // Distance rule: |dx| + |dy| <= radius for a strict diamond,
    // but in ONI it's actually a square with corners cut off.
    // Technically it's an offset circle or specifically:
    // Max distance in X and Y is 4, but it can't reach the very corners (4,4), (4,3), (3,4), etc.
    // A simple approximation for ONI reach: |dx| + |dy| <= 4 works roughly for manhattan,
    // but actual ONI reach is x^2 + y^2 <= r^2 roughly. Let's use exact coordinates.
    // We'll use a simple threshold based on max dx, dy and skip corners.

    // ONI reach:
    // xxxxx
    // xxxxxxx
    // xxxxxxxxx
    // xxxxxxxxx
    // xxxxOxxxx
    // xxxxxxxxx
    // xxxxxxxxx
    // xxxxxxx
    // xxxxx

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            // Cut corners to make it an octagonal/diamond shape like ONI
            if (Math.abs(dx) + Math.abs(dy) > radius + 2) continue;
            if (Math.abs(dx) === radius && Math.abs(dy) >= radius - 1) continue;
            if (Math.abs(dy) === radius && Math.abs(dx) >= radius - 1) continue;

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