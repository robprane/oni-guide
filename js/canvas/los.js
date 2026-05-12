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

// Ported from C# FastTestLineOfSightSolid
function hasLineOfSight(x, y, x2, y2, grid) {
    let value = x2 - x;
    let num = y2 - y;
    let num2 = 0;

    let num3 = Math.sign(value);
    let num4 = Math.sign(value);
    let num5 = Math.sign(num);
    let num6 = Math.abs(value);
    let num7 = Math.abs(num);

    if (num6 <= num7) {
        num6 = Math.abs(num);
        num7 = Math.abs(value);
        if (num < 0) {
            num2 = -1;
        } else if (num > 0) {
            num2 = 1;
        }
        num4 = 0;
    }

    let num8 = num6 >> 1;

    let cx = x;
    let cy = y;

    for (let i = 1; i < num6; i++) {
        num8 += num7;
        if (num8 < num6) {
            cx += num4;
            cy += num2;
        } else {
            num8 -= num6;
            cx += num3;
            cy += num5;
        }
        if (isSolid(cx, cy, grid)) {
            return false;
        }
    }
    return true;
}

function isSolid(x, y, grid) {
    const cell = grid.getCell(x, y);
    return cell && cell.type === 'solid';
}