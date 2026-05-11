
// Line of sight and coverage calculations
export function calculateSweeperCoverage(cx, cy, radius, grid, sweeperOrientation = 'horizontal') {
    const coverage = new Set();
    const blocked = new Set();

    // The sweeper covers a square shape relative to the center.
    // For a radius of 4 (5 cells including center), the coverage is a 9x9 square.
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            const targetX = cx + dx;
            const targetY = cy + dy;

            if (hasLineOfSight(cx, cy, targetX, targetY, grid)) {
                coverage.add(`${targetX},${targetY}`);
            } else {
                blocked.add(`${targetX},${targetY}`);
            }
        }
    }

    return { coverage, blocked };
}

function isSolid(x, y, grid) {
    const cell = grid.getCell(x, y);
    // Sweeper parts do not block LoS. Only solid tiles and doors do.
    return cell && (cell.type === 'solid' || cell.type === 'door');
}

function lineIntersectsSquare(tx, ty, sx, sy, halfSize) {
    let minX = sx - halfSize;
    let maxX = sx + halfSize;
    let minY = sy - halfSize;
    let maxY = sy + halfSize;

    // Line from (0,0) to (tx, ty)
    // Ray: P = t * (tx, ty) for t in [0, 1]

    // Intersection with AABB
    let tmin = 0.0;
    let tmax = 1.0;

    if (Math.abs(tx) < 1e-8) {
        if (0 < minX || 0 > maxX) return false;
    } else {
        let t1 = (minX - 0) / tx;
        let t2 = (maxX - 0) / tx;
        if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
    }

    if (Math.abs(ty) < 1e-8) {
        if (0 < minY || 0 > maxY) return false;
    } else {
        let t1 = (minY - 0) / ty;
        let t2 = (maxY - 0) / ty;
        if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
    }

    return true;
}

// 3x3 sub-grid algorithm matching ONI exactly
function hasLineOfSight(x0, y0, x1, y1, grid) {
    if (x0 === x1 && y0 === y1) return true;

    let tx = x1 - x0;
    let ty = y1 - y0;

    let minX = Math.min(0, tx);
    let maxX = Math.max(0, tx);
    let minY = Math.min(0, ty);
    let maxY = Math.max(0, ty);

    // 1/3 of cell size, so half size is 1/6.
    // Epsilon added to strictly allow touching the edge of the 1/3 box.
    // If it touches the edge, it should not be blocked.
    // So we use a slightly smaller halfSize to avoid floating point issues when it exactly passes through the corner of the 1/3 box.
    let halfSize = 1/6 - 1e-5;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            if (x === 0 && y === 0) continue;
            if (x === tx && y === ty) continue;

            let absX = x0 + x;
            let absY = y0 + y;

            if (isSolid(absX, absY, grid)) {
                if (lineIntersectsSquare(tx, ty, x, y, halfSize)) {
                    return false;
                }
            }
        }
    }
    return true;
}
