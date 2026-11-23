import {
    applyTagSelections,
    formatAmountNumber,
    getTagMembers,
    prettifyId
} from './data-store.js?v=6';

export const CALC_STORAGE_KEY = 'oni_calculator_state_v1';

let state = null;
let lastSyncedEncoded = null;

export function getLastSyncedEncoded() {
    return lastSyncedEncoded;
}

export function setLastSyncedEncoded(encoded) {
    lastSyncedEncoded = encoded || null;
}

function roundMultiplier(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.round(num * 1e8) / 1e8;
}

export function normalizeTagSelections(tagSelections) {
    if (!tagSelections || typeof tagSelections !== 'object') return {};
    const out = {};
    Object.keys(tagSelections).sort().forEach(k => {
        const v = tagSelections[k];
        if (typeof v === 'string' && v.trim() !== '') {
            out[k] = v.trim();
        }
    });
    return out;
}

export function makeRowId(recipeKey, tagSelections = {}) {
    const norm = normalizeTagSelections(tagSelections);
    const keys = Object.keys(norm);
    if (keys.length === 0) return recipeKey;
    const suffix = keys.map(k => `${k}=${norm[k]}`).join('&');
    return `${recipeKey}@@${suffix}`;
}

export function extractTagSelectionsFromRecipe(recipe) {
    const sels = {};
    if (!recipe) return sels;
    (recipe.consumed || []).concat(recipe.produced || []).forEach(entry => {
        if (entry && entry._fromTag && entry.element) {
            sels[entry._fromTag] = entry.element;
        }
    });
    return normalizeTagSelections(sels);
}

function getStorage() {
    try {
        if (typeof localStorage !== 'undefined') return localStorage;
    } catch {
        // Ignore storage restrictions
    }
    return null;
}

function notifyUpdated() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('calculatorupdated', {
            detail: { count: state ? state.rows.length : 0 }
        }));
    }
}

function persistState() {
    const storage = getStorage();
    if (!storage || !state) return;
    try {
        if (state.rows.length === 0 && state.showPower === true) {
            storage.removeItem(CALC_STORAGE_KEY);
        } else {
            storage.setItem(CALC_STORAGE_KEY, JSON.stringify({
                rows: state.rows.map(r => {
                    const out = {
                        recipeKey: r.recipeKey,
                        tagSelections: r.tagSelections,
                        multiplier: r.multiplier
                    };
                    if (r.autoTarget) out.autoTarget = r.autoTarget;
                    return out;
                }),
                showPower: state.showPower
            }));
        }
    } catch (err) {
        console.error('Failed to persist calculator state:', err);
    }
}

function sanitizeRows(rawRows) {
    const rows = [];
    const byId = new Map();
    const usedAutoTargets = new Set();
    if (!Array.isArray(rawRows)) return rows;

    for (const r of rawRows) {
        if (!r || typeof r.recipeKey !== 'string' || !r.recipeKey) continue;
        const tagSelections = normalizeTagSelections(r.tagSelections);
        const id = makeRowId(r.recipeKey, tagSelections);
        const mult = roundMultiplier(r.multiplier !== undefined ? r.multiplier : 1);
        let autoTarget = (typeof r.autoTarget === 'string' && r.autoTarget.trim() !== '') ? r.autoTarget.trim() : null;
        if (autoTarget && usedAutoTargets.has(autoTarget)) {
            autoTarget = null;
        }
        if (autoTarget) usedAutoTargets.add(autoTarget);

        if (byId.has(id)) {
            const existing = byId.get(id);
            existing.multiplier = roundMultiplier(existing.multiplier + mult);
            if (!existing.autoTarget && autoTarget) existing.autoTarget = autoTarget;
        } else {
            const clean = {
                id,
                recipeKey: r.recipeKey,
                tagSelections,
                multiplier: mult,
                autoTarget
            };
            byId.set(id, clean);
            rows.push(clean);
        }
    }
    return rows;
}

function ensureLoaded() {
    if (state) return state;
    state = { rows: [], showPower: true };
    const storage = getStorage();
    if (storage) {
        try {
            const raw = storage.getItem(CALC_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                state = {
                    rows: sanitizeRows(parsed.rows),
                    showPower: parsed.showPower !== undefined ? Boolean(parsed.showPower) : true
                };
            }
        } catch (err) {
            console.error('Failed to read calculator state from localStorage:', err);
        }
    }
    return state;
}

export function getCalculatorState() {
    ensureLoaded();
    return {
        rows: state.rows.map(r => ({
            ...r,
            tagSelections: { ...r.tagSelections }
        })),
        showPower: state.showPower
    };
}

export function getCalculatorRowCount() {
    ensureLoaded();
    return state.rows.length;
}

export function findCalculatorRow(recipeKey, tagSelections = {}) {
    ensureLoaded();
    const id = makeRowId(recipeKey, tagSelections);
    return state.rows.find(r => r.id === id) || null;
}

export function addCalculatorRecipe(recipeKey, tagSelections = {}, multiplier = 1, { autoTarget = null } = {}) {
    ensureLoaded();
    const normTags = normalizeTagSelections(tagSelections);
    const id = makeRowId(recipeKey, normTags);
    const addMult = roundMultiplier(multiplier);
    const cleanAuto = (typeof autoTarget === 'string' && autoTarget.trim() !== '') ? autoTarget.trim() : null;
    const existing = state.rows.find(r => r.id === id);

    if (cleanAuto) {
        state.rows.forEach(r => {
            if (r.id !== id && r.autoTarget === cleanAuto) r.autoTarget = null;
        });
    }

    if (existing) {
        if (cleanAuto) {
            existing.autoTarget = cleanAuto;
        } else {
            existing.autoTarget = null;
            existing.multiplier = roundMultiplier(existing.multiplier + (addMult > 0 ? addMult : 1));
        }
        persistState();
        notifyUpdated();
        return { row: { ...existing, tagSelections: { ...existing.tagSelections } }, merged: true };
    }

    const row = {
        id,
        recipeKey,
        tagSelections: normTags,
        multiplier: addMult,
        autoTarget: cleanAuto
    };
    state.rows.push(row);
    persistState();
    notifyUpdated();
    return { row: { ...row, tagSelections: { ...row.tagSelections } }, merged: false };
}

export function setCalculatorMultiplier(rowId, multiplier, { unlockAuto = true } = {}) {
    ensureLoaded();
    const row = state.rows.find(r => r.id === rowId);
    if (!row) return false;
    row.multiplier = roundMultiplier(multiplier);
    if (unlockAuto && row.autoTarget) {
        row.autoTarget = null;
    }
    persistState();
    notifyUpdated();
    return true;
}

export function setCalculatorRowAutoTarget(rowId, autoTargetOrNull) {
    ensureLoaded();
    const row = state.rows.find(r => r.id === rowId);
    if (!row) return false;
    const clean = (typeof autoTargetOrNull === 'string' && autoTargetOrNull.trim() !== '') ? autoTargetOrNull.trim() : null;
    if (clean) {
        state.rows.forEach(r => {
            if (r.id !== rowId && r.autoTarget === clean) r.autoTarget = null;
        });
    }
    row.autoTarget = clean;
    persistState();
    notifyUpdated();
    return true;
}

export function removeCalculatorRow(rowId) {
    ensureLoaded();
    const idx = state.rows.findIndex(r => r.id === rowId);
    if (idx === -1) return false;
    state.rows.splice(idx, 1);
    persistState();
    notifyUpdated();
    return true;
}

export function updateCalculatorRowTag(rowId, tagId, itemIdOrNull) {
    ensureLoaded();
    const idx = state.rows.findIndex(r => r.id === rowId);
    if (idx === -1) return null;

    const row = state.rows[idx];
    const nextTags = { ...row.tagSelections };
    if (itemIdOrNull) {
        nextTags[tagId] = itemIdOrNull;
    } else {
        delete nextTags[tagId];
    }
    const normTags = normalizeTagSelections(nextTags);
    const nextId = makeRowId(row.recipeKey, normTags);

    if (nextId === row.id) {
        return { rowId: row.id, merged: false };
    }

    const duplicate = state.rows.find(r => r.id === nextId);
    if (duplicate) {
        duplicate.multiplier = roundMultiplier(duplicate.multiplier + row.multiplier);
        state.rows.splice(idx, 1);
        persistState();
        notifyUpdated();
        return { rowId: duplicate.id, merged: true };
    }

    row.id = nextId;
    row.tagSelections = normTags;
    persistState();
    notifyUpdated();
    return { rowId: row.id, merged: false };
}

export function setCalculatorShowPower(showPower) {
    ensureLoaded();
    state.showPower = Boolean(showPower);
    persistState();
    notifyUpdated();
}

export function resetCalculatorState() {
    ensureLoaded();
    state.rows = [];
    const storage = getStorage();
    if (storage) {
        try {
            storage.removeItem(CALC_STORAGE_KEY);
        } catch {
            // ignore
        }
    }
    notifyUpdated();
}

// ============================================================================
// URL Serialization (UTF-8 safe Base64URL, matching Canvas URL sharing)
// ============================================================================

function toBase64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

export function encodeCalculatorState(targetState = getCalculatorState()) {
    if (!targetState || !Array.isArray(targetState.rows) || targetState.rows.length === 0) {
        return '';
    }
    const payload = {
        v: 1,
        p: targetState.showPower ? 1 : 0,
        r: targetState.rows.map(row => {
            const tags = normalizeTagSelections(row.tagSelections);
            const hasTags = Object.keys(tags).length > 0;
            if (row.autoTarget) {
                return [row.recipeKey, roundMultiplier(row.multiplier), tags, row.autoTarget];
            }
            return hasTags
                ? [row.recipeKey, roundMultiplier(row.multiplier), tags]
                : [row.recipeKey, roundMultiplier(row.multiplier)];
        })
    };
    return toBase64Url(JSON.stringify(payload));
}

export function decodeCalculatorState(encoded) {
    if (!encoded || typeof encoded !== 'string') return null;
    try {
        const json = fromBase64Url(encoded);
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.r)) {
            return null;
        }
        const rawRows = parsed.r
            .filter(entry => Array.isArray(entry) && typeof entry[0] === 'string')
            .map(entry => ({
                recipeKey: entry[0],
                multiplier: entry[1] !== undefined ? entry[1] : 1,
                tagSelections: entry[2] && typeof entry[2] === 'object' ? entry[2] : {},
                autoTarget: typeof entry[3] === 'string' && entry[3].trim() !== '' ? entry[3].trim() : null
            }));

        return {
            rows: sanitizeRows(rawRows),
            showPower: parsed.p !== undefined ? Boolean(parsed.p) : true
        };
    } catch (err) {
        console.error('Failed to decode calculator state from URL:', err);
        return null;
    }
}

export function loadCalculatorStateFromEncoded(encoded, { persist = true } = {}) {
    const decoded = decodeCalculatorState(encoded);
    if (!decoded) return false;
    state = decoded;
    if (persist) {
        persistState();
    }
    notifyUpdated();
    return true;
}

// ============================================================================
// Calculator Computation & Formatting Engine
// ============================================================================

function normalizeFlowEntry(entry, rawRecipe, sign, multiplier, allItems) {
    let basis = 'event';
    let timeScale = 1;
    let derivedFromTime = null;

    if (entry.per === 's') {
        basis = 'rate';
        timeScale = 1;
    } else if (entry.per === 'cycle') {
        basis = 'rate';
        timeScale = 1 / 600;
    } else if (entry.per === '150 cycles') {
        basis = 'rate';
        timeScale = 1 / 90000;
    } else if (!entry.per && rawRecipe.time > 0) {
        // User preference: divide fixed craft-time recipes by time -> continuous /s rate (100% uptime)
        basis = 'rate';
        timeScale = 1 / rawRecipe.time;
        derivedFromTime = rawRecipe.time;
    } else if (entry.per) {
        basis = entry.per;
        timeScale = 1;
    }

    const concreteEl = entry.element && allItems ? allItems[entry.element] : null;
    let dim = `raw:${entry.unit || ''}`;
    let unitScale = 1;

    if (concreteEl && concreteEl.kcalPerKg > 0 && (entry.unit === 'g' || entry.unit === 'kcal')) {
        // Unify food mass (g) and calories (kcal) into canonical grams so food chains sum cleanly!
        dim = 'food_g';
        unitScale = entry.unit === 'kcal' ? (1000 / concreteEl.kcalPerKg) : 1;
    } else if (entry.unit === 'g') {
        dim = 'mass_g';
        unitScale = 1;
    } else if (entry.unit === 'kg') {
        dim = 'mass_g';
        unitScale = 1000;
    } else if (entry.unit === 'g of stored Nectar') {
        dim = 'nectar_g';
        unitScale = 1;
    }

    const rawMin = entry.amountMin !== undefined ? entry.amountMin : entry.amount;
    const rawMax = entry.amountMax !== undefined ? entry.amountMax : entry.amount;
    const effMult = entry.unit === '% mass' ? (multiplier > 0 ? 1 : 0) : multiplier;
    const scale = timeScale * unitScale * effMult;

    const a = sign * rawMin * scale;
    const b = sign * rawMax * scale;
    const min = Math.min(a, b);
    const max = Math.max(a, b);

    return {
        bucketKey: `${dim}|${basis}`,
        dim,
        basis,
        min,
        max,
        derivedFromTime,
        isRange: entry.amountMin !== undefined && entry.amountMax !== undefined && entry.amountMin !== entry.amountMax,
        rawMin,
        rawMax,
        rawUnit: entry.unit || '',
        rawPer: entry.per || null,
        sign
    };
}

function addToBucketMap(bucketMap, flow) {
    let bucket = bucketMap.get(flow.bucketKey);
    if (!bucket) {
        bucket = {
            bucketKey: flow.bucketKey,
            dim: flow.dim,
            basis: flow.basis,
            min: 0,
            max: 0,
            maxMag: 0,
            hasPos: false,
            hasNeg: false,
            parts: []
        };
        bucketMap.set(flow.bucketKey, bucket);
    }
    bucket.min += flow.min;
    bucket.max += flow.max;
    bucket.maxMag = Math.max(bucket.maxMag, Math.abs(flow.min), Math.abs(flow.max));
    if (flow.max > 0) bucket.hasPos = true;
    if (flow.min < 0) bucket.hasNeg = true;
    bucket.parts.push(flow);
}

function snapNearZero(val, bucket) {
    if (Math.abs(val) < 1e-12) return 0;
    if (bucket.hasPos && bucket.hasNeg && bucket.maxMag > 0 && Math.abs(val) <= bucket.maxMag * 1e-5) {
        return 0;
    }
    return val;
}

export function formatFlowBucket(bucket, concreteEl, unitSettings) {
    let min = snapNearZero(bucket.min, bucket);
    let max = snapNearZero(bucket.max, bucket);
    let unit = '';
    let per = null;

    const settings = unitSettings || { temp: 'C', time: 's', mass: 'g', food: 'mass' };

    if (bucket.dim === 'food_g') {
        if (settings.food === 'kcal' && concreteEl && concreteEl.kcalPerKg > 0) {
            const factor = concreteEl.kcalPerKg / 1000;
            min *= factor;
            max *= factor;
            unit = 'kcal';
        } else if (settings.mass === 'kg') {
            min /= 1000;
            max /= 1000;
            unit = 'kg';
        } else {
            unit = 'g';
        }
    } else if (bucket.dim === 'mass_g') {
        if (settings.mass === 'kg') {
            min /= 1000;
            max /= 1000;
            unit = 'kg';
        } else {
            unit = 'g';
        }
    } else if (bucket.dim === 'nectar_g') {
        if (settings.mass === 'kg') {
            min /= 1000;
            max /= 1000;
            unit = 'kg of stored Nectar';
        } else {
            unit = 'g of stored Nectar';
        }
    } else if (bucket.dim.startsWith('raw:')) {
        unit = bucket.dim.slice(4);
    }

    if (bucket.basis === 'rate') {
        if (settings.time === 'cycle') {
            min *= 600;
            max *= 600;
            per = 'cycle';
        } else {
            per = 's';
        }
    } else if (bucket.basis !== 'event') {
        per = bucket.basis;
    }

    let unitText = unit ? `${unit.includes('%') ? '' : ' '}${unit}` : '';
    if (per) {
        if (unit.includes(' ') || per.includes(' ')) {
            unitText += ` per ${per}`;
        } else {
            unitText += `/${per}`;
        }
    }

    const isRange = Math.abs(max - min) > Math.max(Math.abs(min), Math.abs(max), 1) * 1e-6;
    let text;
    let cssClass;

    if (!isRange) {
        const v = Math.abs(min) < 1e-12 ? 0 : min;
        if (v > 0) {
            text = `+${formatAmountNumber(v)}${unitText}`;
            cssClass = 'amount-positive';
        } else if (v < 0) {
            text = `-${formatAmountNumber(Math.abs(v))}${unitText}`;
            cssClass = 'amount-negative';
        } else {
            text = `0${unitText}`;
            cssClass = 'amount-neutral';
        }
    } else if (min >= 0 && max > 0) {
        text = `+${formatAmountNumber(min)}–${formatAmountNumber(max)}${unitText}`;
        cssClass = 'amount-positive';
    } else if (max <= 0 && min < 0) {
        text = `-${formatAmountNumber(Math.abs(min))} .. -${formatAmountNumber(Math.abs(max))}${unitText}`;
        cssClass = 'amount-negative';
    } else {
        text = `-${formatAmountNumber(Math.abs(min))} .. +${formatAmountNumber(max)}${unitText}`;
        cssClass = 'amount-mixed';
    }

    return { text, cssClass, min, max, isRange };
}

export function formatWatts(watts) {
    const clean = Math.abs(watts) < 1e-6 ? 0 : watts;
    if (clean > 0) {
        return { text: `+${formatAmountNumber(clean)} W`, cssClass: 'amount-positive', value: clean };
    }
    if (clean < 0) {
        return { text: `-${formatAmountNumber(Math.abs(clean))} W`, cssClass: 'amount-negative', value: clean };
    }
    return { text: '0 W', cssClass: 'amount-neutral', value: 0 };
}

export function computeCalculatorTable(targetState, data, unitSettings) {
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};
    const recipesByKey = data.recipesByKey || new Map();

    const columnsMap = new Map();
    const totalsMap = new Map();
    const computedRows = [];

    let totalPowerW = 0;
    let totalPowerMaxMag = 0;
    let totalPowerHasPos = false;
    let totalPowerHasNeg = false;
    let anyRowHasPower = false;

    const ensureColumn = (entry) => {
        if (entry.tag) {
            const colKey = `tag:${entry.tag}`;
            if (!columnsMap.has(colKey)) {
                const tag = allTags[entry.tag] || { id: entry.tag, name: prettifyId(entry.tag), image: '' };
                columnsMap.set(colKey, {
                    key: colKey,
                    isTag: true,
                    id: entry.tag,
                    name: tag.name,
                    image: tag.image || '',
                    item: null,
                    tag
                });
                totalsMap.set(colKey, new Map());
            }
            return colKey;
        }
        const colKey = `el:${entry.element}`;
        if (!columnsMap.has(colKey)) {
            const item = allItems[entry.element] || { id: entry.element, name: prettifyId(entry.element), image: '' };
            columnsMap.set(colKey, {
                key: colKey,
                isTag: false,
                id: entry.element,
                name: item.name,
                image: item.image || '',
                item,
                tag: null
            });
            totalsMap.set(colKey, new Map());
        }
        return colKey;
    };

    for (const row of (targetState.rows || [])) {
        const rawRecipe = recipesByKey.get(row.recipeKey);
        if (!rawRecipe) continue;

        const resolvedRecipe = applyTagSelections(rawRecipe, row.tagSelections, allItems);
        const sourceItem = allItems[rawRecipe.source] || null;

        // Tag slots metadata from the base recipe for inline switching
        const tagSlots = [];
        const seenTagSlots = new Set();
        (rawRecipe.consumed || []).concat(rawRecipe.produced || []).forEach(entry => {
            if (entry.tag && !seenTagSlots.has(entry.tag)) {
                seenTagSlots.add(entry.tag);
                const tagObj = allTags[entry.tag] || { id: entry.tag, name: prettifyId(entry.tag) };
                tagSlots.push({
                    tagId: entry.tag,
                    tagName: tagObj.name,
                    selectedItemId: (row.tagSelections && row.tagSelections[entry.tag]) || '',
                    members: getTagMembers(entry.tag)
                });
            }
        });

        // Power computation for building sources
        let powerW = null;
        if (sourceItem && (sourceItem.power_consumption || sourceItem.power_generation)) {
            anyRowHasPower = true;
            powerW = ((sourceItem.power_generation || 0) - (sourceItem.power_consumption || 0)) * row.multiplier;
            totalPowerW += powerW;
            totalPowerMaxMag = Math.max(totalPowerMaxMag, Math.abs(powerW));
            if (powerW > 0) totalPowerHasPos = true;
            if (powerW < 0) totalPowerHasNeg = true;
        }

        const cellBuckets = new Map();

        const processEntries = (list, sign) => {
            (list || []).forEach(entry => {
                const colKey = ensureColumn(entry);
                const flow = normalizeFlowEntry(entry, rawRecipe, sign, row.multiplier, allItems);

                if (!cellBuckets.has(colKey)) {
                    cellBuckets.set(colKey, new Map());
                }
                addToBucketMap(cellBuckets.get(colKey), flow);
                addToBucketMap(totalsMap.get(colKey), flow);
            });
        };

        processEntries(resolvedRecipe.consumed, -1);
        processEntries(resolvedRecipe.produced, +1);

        // Format each cell's buckets
        const cells = {};
        cellBuckets.forEach((bMap, colKey) => {
            const col = columnsMap.get(colKey);
            const lines = [];
            const tooltipParts = [];

            bMap.forEach(bucket => {
                const fmt = formatFlowBucket(bucket, col.item, unitSettings);
                lines.push(fmt);

                bucket.parts.forEach(part => {
                    if (part.derivedFromTime) {
                        tooltipParts.push(`Batch: ${part.sign > 0 ? '+' : '-'}${formatAmountNumber(part.rawMin)} ${part.rawUnit} / ${part.derivedFromTime} s`);
                    }
                });
                if (bucket.hasPos && bucket.hasNeg) {
                    tooltipParts.push('Net of consumed & produced in this recipe');
                }
            });

            cells[colKey] = {
                lines,
                tooltip: tooltipParts.join(' · ')
            };
        });

        computedRows.push({
            id: row.id,
            recipeKey: row.recipeKey,
            multiplier: row.multiplier,
            autoTarget: row.autoTarget || null,
            tagSelections: { ...row.tagSelections },
            rawRecipe,
            resolvedRecipe,
            sourceItem,
            tagSlots,
            power: powerW !== null ? formatWatts(powerW) : null,
            cells
        });
    }

    const columns = Array.from(columnsMap.values());
    const totals = {};
    columns.forEach(col => {
        const bMap = totalsMap.get(col.key);
        const lines = [];
        let deficit = null;
        bMap.forEach(bucket => {
            const fmt = formatFlowBucket(bucket, col.item, unitSettings);
            lines.push(fmt);
            // Identify resolvable negative rate deficits (exact or negative-average range)
            if (!deficit && bucket.basis === 'rate') {
                const avg = (bucket.min + bucket.max) / 2;
                const snappedAvg = snapNearZero(avg, bucket);
                if (snappedAvg < -1e-9) {
                    deficit = {
                        colKey: col.key,
                        bucketKey: bucket.bucketKey,
                        dim: bucket.dim,
                        basis: bucket.basis,
                        amount: -snappedAvg,
                        isTag: col.isTag,
                        id: col.id,
                        name: col.name,
                        formattedText: fmt.text
                    };
                }
            }
        });
        totals[col.key] = { lines, deficit };
    });

    const snappedTotalPower = (totalPowerHasPos && totalPowerHasNeg && Math.abs(totalPowerW) <= totalPowerMaxMag * 1e-6)
        ? 0
        : totalPowerW;

    return {
        rows: computedRows,
        columns,
        totals,
        showPowerColumn: Boolean(targetState.showPower) && computedRows.length > 0,
        anyRowHasPower,
        totalPower: formatWatts(snappedTotalPower)
    };
}

// ============================================================================
// Producer Discovery, Linear Auto-Balance Solver & Unambiguous Chain Expansion
// ============================================================================

export function formatMultiplierDisplay(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return '0';
    if (Math.abs(num - Math.round(num)) < 1e-5) {
        return String(Math.round(num));
    }
    const decimals = num < 0.05 ? 3 : 2;
    return String(parseFloat(num.toFixed(decimals)));
}

function getEntryColKey(entry) {
    if (!entry) return null;
    return entry.tag ? `tag:${entry.tag}` : `el:${entry.element}`;
}

/**
 * Computes unit net flow (at multiplier = 1) for every (colKey, bucketKey) produced/consumed by a recipe.
 * Returns Map<colKey, Map<bucketKey, { avg, min, max, dim, basis }>>.
 */
function getUnitFlowMapForRecipe(rawRecipe, tagSelections, allItems) {
    const resolved = applyTagSelections(rawRecipe, tagSelections, allItems);
    const out = new Map();

    const addSide = (list, sign) => {
        (list || []).forEach(entry => {
            const colKey = getEntryColKey(entry);
            if (!colKey) return;
            const flow = normalizeFlowEntry(entry, rawRecipe, sign, 1, allItems);
            if (!out.has(colKey)) out.set(colKey, new Map());
            const bMap = out.get(colKey);
            let b = bMap.get(flow.bucketKey);
            if (!b) {
                b = { min: 0, max: 0, avg: 0, dim: flow.dim, basis: flow.basis, bucketKey: flow.bucketKey };
                bMap.set(flow.bucketKey, b);
            }
            b.min += flow.min;
            b.max += flow.max;
            b.avg = (b.min + b.max) / 2;
        });
    };

    addSide(resolved.consumed, -1);
    addSide(resolved.produced, +1);
    return out;
}

/**
 * Finds the primary positive rate bucket produced by a row for its autoTarget column.
 */
function findProducedRateBucket(flowMap, colKey, preferredBucketKey = null) {
    const bMap = flowMap.get(colKey);
    if (!bMap) return null;
    if (preferredBucketKey && bMap.has(preferredBucketKey)) {
        const b = bMap.get(preferredBucketKey);
        if (b.basis === 'rate' && b.avg > 1e-12) return b;
    }
    for (const b of bMap.values()) {
        if (b.basis === 'rate' && b.avg > 1e-12) return b;
    }
    return null;
}

/**
 * Solves A * x = b using Gaussian elimination with partial pivoting.
 * Returns array x or null if singular.
 */
function gaussianElimination(A, b) {
    const n = b.length;
    if (n === 0) return [];
    const M = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
        let pivotRow = col;
        let maxAbs = Math.abs(M[col][col]);
        for (let r = col + 1; r < n; r++) {
            const v = Math.abs(M[r][col]);
            if (v > maxAbs) {
                maxAbs = v;
                pivotRow = r;
            }
        }
        if (maxAbs < 1e-12) return null;
        if (pivotRow !== col) {
            const tmp = M[col];
            M[col] = M[pivotRow];
            M[pivotRow] = tmp;
        }
        const pivot = M[col][col];
        for (let r = col + 1; r < n; r++) {
            const factor = M[r][col] / pivot;
            if (Math.abs(factor) < 1e-15) continue;
            for (let c = col; c <= n; c++) {
                M[r][c] -= factor * M[col][c];
            }
        }
    }

    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = M[r][n];
        for (let c = r + 1; c < n; c++) {
            sum -= M[r][c] * x[c];
        }
        x[r] = sum / M[r][r];
        if (!Number.isFinite(x[r])) return null;
    }
    return x;
}

/**
 * Active-set non-negative linear solver for A * x = b (x >= 0).
 * Clamps surplus variables (x_i < 0) to 0 cleanly; falls back to damped Gauss-Seidel if singular.
 */
function solveNonNegativeSystem(A, b) {
    const n = b.length;
    if (n === 0) return [];

    const active = new Array(n).fill(true);
    let x = new Array(n).fill(0);

    for (let iter = 0; iter <= n; iter++) {
        const idx = [];
        for (let i = 0; i < n; i++) {
            if (active[i]) idx.push(i);
        }
        if (idx.length === 0) {
            x.fill(0);
            return x;
        }

        const subA = idx.map(r => idx.map(c => A[r][c]));
        const subB = idx.map(r => b[r]);
        const subX = gaussianElimination(subA, subB);

        if (!subX) {
            // Singular fallback: bounded Gauss-Seidel (safe on cycles & degenerate systems)
            const gs = new Array(n).fill(0);
            for (let pass = 0; pass < 32; pass++) {
                let maxDiff = 0;
                for (let i = 0; i < n; i++) {
                    const diag = A[i][i];
                    if (diag <= 1e-12) {
                        gs[i] = 0;
                        continue;
                    }
                    let rhs = b[i];
                    for (let j = 0; j < n; j++) {
                        if (j !== i) rhs -= A[i][j] * gs[j];
                    }
                    const next = Math.max(0, rhs / diag);
                    maxDiff = Math.max(maxDiff, Math.abs(next - gs[i]));
                    gs[i] = next;
                }
                if (maxDiff < 1e-9) break;
            }
            return gs;
        }

        x.fill(0);
        let minVal = 0;
        let minGlobalIdx = -1;
        for (let k = 0; k < idx.length; k++) {
            x[idx[k]] = subX[k];
            if (subX[k] < minVal - 1e-9) {
                minVal = subX[k];
                minGlobalIdx = idx[k];
            }
        }

        if (minGlobalIdx === -1) {
            return x.map(v => (v < 0 ? 0 : v));
        }
        active[minGlobalIdx] = false;
    }

    return x.map(v => (v < 0 ? 0 : v));
}

/**
 * Re-solves multipliers for all Auto-balanced rows in state.rows based on current Manual rows.
 * Handles trees, shared DAG intermediates, and closed resource loops cleanly.
 */
export function recomputeAutoMultipliers(data) {
    ensureLoaded();
    if (!data || !data.recipesByKey) return false;
    const allItems = data.allItems || {};
    const recipesByKey = data.recipesByKey;

    const autoEntries = [];
    const manualFlowMaps = [];

    for (const row of state.rows) {
        const rawRecipe = recipesByKey.get(row.recipeKey);
        if (!rawRecipe) continue;
        const flowMap = getUnitFlowMapForRecipe(rawRecipe, row.tagSelections, allItems);
        if (row.autoTarget) {
            const targetBucket = findProducedRateBucket(flowMap, row.autoTarget);
            if (!targetBucket) {
                // Tag or recipe changed and no longer produces autoTarget -> gracefully unlock to Manual
                row.autoTarget = null;
                manualFlowMaps.push({ row, flowMap });
            } else {
                autoEntries.push({
                    row,
                    flowMap,
                    targetColKey: row.autoTarget,
                    targetBucketKey: targetBucket.bucketKey
                });
            }
        } else {
            manualFlowMaps.push({ row, flowMap });
        }
    }

    if (autoEntries.length === 0) {
        return false;
    }

    const k = autoEntries.length;
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);

    for (let i = 0; i < k; i++) {
        const { targetColKey, targetBucketKey } = autoEntries[i];

        // Manual net contribution to targetColKey in targetBucketKey
        let manualNet = 0;
        for (const { row, flowMap } of manualFlowMaps) {
            const bObj = flowMap.get(targetColKey)?.get(targetBucketKey);
            if (bObj) {
                manualNet += bObj.avg * row.multiplier;
            }
        }
        b[i] = -manualNet;

        // Auto rows coefficient matrix
        for (let j = 0; j < k; j++) {
            const bObj = autoEntries[j].flowMap.get(targetColKey)?.get(targetBucketKey);
            if (bObj) {
                A[i][j] = bObj.avg;
            }
        }
    }

    const solved = solveNonNegativeSystem(A, b);
    let changed = false;
    for (let i = 0; i < k; i++) {
        const nextMult = roundMultiplier(solved[i]);
        if (Math.abs(autoEntries[i].row.multiplier - nextMult) > 1e-9) {
            autoEntries[i].row.multiplier = nextMult;
            changed = true;
        }
    }

    if (changed) {
        persistState();
    }
    return changed;
}

/**
 * Discovers all valid rate producers that can cover a deficit in `colKey` (`bucketKey`).
 * Filters out net-negative/self-consuming recipes and classifies primary vs geyser vs phase-change.
 */
export function findProducersForColumn(colKey, targetBucketKey, deficitAmount, data, existingRows = null) {
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};
    const recipesData = data.recipesData || [];
    const rows = existingRows || getCalculatorState().rows;

    const isTag = colKey.startsWith('tag:');
    const id = colKey.slice(colKey.indexOf(':') + 1);

    const existingById = new Map(rows.map(r => [r.id, r]));
    const producers = [];
    const seenRowIds = new Set();

    const tryCandidate = (rawRecipe, tagSelections) => {
        const normTags = normalizeTagSelections(tagSelections);
        const rowId = makeRowId(rawRecipe._key, normTags);
        if (seenRowIds.has(rowId)) return;

        const flowMap = getUnitFlowMapForRecipe(rawRecipe, normTags, allItems);
        const bObj = findProducedRateBucket(flowMap, colKey, targetBucketKey);
        if (!bObj || (targetBucketKey && bObj.bucketKey !== targetBucketKey)) return;

        seenRowIds.add(rowId);
        const srcItem = allItems[rawRecipe.source] || null;
        const isPhaseChange = rawRecipe.source === 'heat' || rawRecipe.source === 'cool';
        const isGeyser = Boolean(srcItem && srcItem._type === 'geyser');
        const existingRow = existingById.get(rowId) || null;
        const additionalNeeded = deficitAmount > 0 ? deficitAmount / bObj.avg : 0;
        const totalNeeded = existingRow ? existingRow.multiplier + additionalNeeded : additionalNeeded;

        producers.push({
            rawRecipe,
            tagSelections: normTags,
            rowId,
            existingRow,
            alreadyInTable: Boolean(existingRow),
            sourceItem: srcItem,
            isPhaseChange,
            isGeyser,
            ratePerUnit: bObj.avg,
            bucketKey: bObj.bucketKey,
            additionalMult: roundMultiplier(additionalNeeded),
            neededMult: roundMultiplier(totalNeeded)
        });
    };

    for (const r of recipesData) {
        for (const p of (r.produced || [])) {
            if (!isTag) {
                if (p.element === id) {
                    tryCandidate(r, {});
                } else if (p.tag) {
                    const members = getTagMembers(p.tag);
                    if (members.some(m => m.id === id)) {
                        tryCandidate(r, { [p.tag]: id });
                    }
                }
            } else if (p.tag === id) {
                tryCandidate(r, {});
            }
        }
    }

    // Sort: already-in-table first, then primary (fabricator/plant/critter/duplicant), then geyser, then phase-change
    const rankOf = (p) => {
        if (p.alreadyInTable) return 0;
        if (p.isPhaseChange) return 3;
        if (p.isGeyser) return 2;
        return 1;
    };
    producers.sort((a, b) => {
        const ra = rankOf(a);
        const rb = rankOf(b);
        if (ra !== rb) return ra - rb;
        // Prefer recipes with higher output rate (fewer units needed) among peers, then alphabetical
        const nameA = a.sourceItem ? a.sourceItem.name : a.rawRecipe.source;
        const nameB = b.sourceItem ? b.sourceItem.name : b.rawRecipe.source;
        if (Math.abs(a.neededMult - b.neededMult) > 1e-6 && ra === 1) {
            return a.neededMult - b.neededMult;
        }
        return nameA.localeCompare(nameB);
    });

    const tagMembers = isTag ? getTagMembers(id) : [];
    return {
        colKey,
        isTag,
        id,
        name: isTag ? (allTags[id]?.name || prettifyId(id)) : (allItems[id]?.name || prettifyId(id)),
        tagMembers,
        producers
    };
}

/**
 * Returns the single unambiguous producer for a concrete element column, or null if ambiguous / geyser / phase-only.
 */
export function getUnambiguousProducer(colKey, targetBucketKey, data) {
    if (!colKey || colKey.startsWith('tag:')) return null;
    const info = findProducersForColumn(colKey, targetBucketKey, 1, data);
    const nonPhase = info.producers.filter(p => !p.isPhaseChange);
    if (nonPhase.length !== 1) return null;
    if (nonPhase[0].isGeyser) return null;
    return nonPhase[0];
}

/**
 * Recursively adds unambiguous upstream producers ONLY along the consumed inputs of newly added rows
 * (so deleting an unrelated row on another branch is never unexpectedly resurrected).
 */
function expandUnambiguousDeficits(data, seedCols, visitedCols, maxDepth = 8) {
    const addedNames = [];
    const allItems = data.allItems || {};
    let frontier = Array.from(new Set(seedCols || []));

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
        recomputeAutoMultipliers(data);
        const model = computeCalculatorTable(getCalculatorState(), data, { temp: 'C', time: 's', mass: 'g', food: 'mass' });
        const autoTargetsInTable = new Set(state.rows.map(r => r.autoTarget).filter(Boolean));

        const nextFrontier = [];
        for (const colKey of frontier) {
            const def = model.totals[colKey]?.deficit;
            if (!def || def.isTag) continue;
            if (visitedCols.has(colKey) || autoTargetsInTable.has(colKey)) continue;

            const unique = getUnambiguousProducer(colKey, def.bucketKey, data);
            if (!unique) continue;

            // Avoid hijacking a row that is already auto-balancing another column
            if (unique.existingRow && unique.existingRow.autoTarget && unique.existingRow.autoTarget !== colKey) {
                continue;
            }

            visitedCols.add(colKey);
            const res = addCalculatorRecipe(unique.rawRecipe._key, unique.tagSelections, 0, { autoTarget: colKey });
            if (!res.merged) {
                const nm = allItems[unique.rawRecipe.source]?.name || prettifyId(unique.rawRecipe.source);
                addedNames.push(nm);
            }

            const resolved = applyTagSelections(unique.rawRecipe, unique.tagSelections, allItems);
            (resolved.consumed || []).forEach(c => {
                const ck = getEntryColKey(c);
                if (ck && !ck.startsWith('tag:') && !visitedCols.has(ck)) {
                    nextFrontier.push(ck);
                }
            });
        }

        frontier = Array.from(new Set(nextFrontier));
    }

    recomputeAutoMultipliers(data);
    return addedNames;
}

/**
 * Adds (or links as Auto) the chosen producer to cover `colKey`, then auto-expands all unambiguous upstream links.
 */
export function resolveDeficitWithProducer(colKey, producer, data, { autoExpand = true } = {}) {
    ensureLoaded();
    if (!producer || !producer.rawRecipe) return { addedNames: [], updatedNames: [] };
    const allItems = data.allItems || {};
    const srcName = allItems[producer.rawRecipe.source]?.name || prettifyId(producer.rawRecipe.source);

    const res = addCalculatorRecipe(producer.rawRecipe._key, producer.tagSelections, 0, { autoTarget: colKey });
    const addedNames = res.merged ? [] : [srcName];
    const updatedNames = res.merged ? [srcName] : [];

    const visited = new Set([colKey]);
    if (autoExpand) {
        const resolved = applyTagSelections(producer.rawRecipe, producer.tagSelections, allItems);
        const seedCols = (resolved.consumed || [])
            .map(getEntryColKey)
            .filter(ck => ck && !ck.startsWith('tag:'));
        const extra = expandUnambiguousDeficits(data, seedCols, visited, 8);
        addedNames.push(...extra);
    } else {
        recomputeAutoMultipliers(data);
    }

    persistState();
    notifyUpdated();
    return { addedNames, updatedNames };
}

/**
 * Materializes an unselected tag column (e.g. #Grain -> Sleet Wheat Grain) across rows using that tag,
 * then auto-expands if the newly materialized item has an unambiguous producer.
 */
export function materializeTagColumn(tagId, memberId, data, { autoExpand = true } = {}) {
    ensureLoaded();
    if (!tagId || !memberId) return { addedNames: [], updatedCount: 0 };

    const matchingRowIds = state.rows
        .filter(r => {
            const raw = data.recipesByKey?.get(r.recipeKey);
            if (!raw) return false;
            const usesTag = (raw.consumed || []).concat(raw.produced || []).some(e => e.tag === tagId);
            return usesTag && !(r.tagSelections && r.tagSelections[tagId]);
        })
        .map(r => r.id);

    let updatedCount = 0;
    for (const rid of matchingRowIds) {
        if (state.rows.some(r => r.id === rid)) {
            updateCalculatorRowTag(rid, tagId, memberId);
            updatedCount++;
        }
    }

    let addedNames = [];
    if (autoExpand && updatedCount > 0) {
        const visited = new Set();
        addedNames = expandUnambiguousDeficits(data, [`el:${memberId}`], visited, 8);
    } else {
        recomputeAutoMultipliers(data);
    }

    persistState();
    notifyUpdated();
    return { addedNames, updatedCount };
}
