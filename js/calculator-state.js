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
    return Math.round(num * 1e6) / 1e6;
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
                rows: state.rows.map(r => ({
                    recipeKey: r.recipeKey,
                    tagSelections: r.tagSelections,
                    multiplier: r.multiplier
                })),
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
    if (!Array.isArray(rawRows)) return rows;

    for (const r of rawRows) {
        if (!r || typeof r.recipeKey !== 'string' || !r.recipeKey) continue;
        const tagSelections = normalizeTagSelections(r.tagSelections);
        const id = makeRowId(r.recipeKey, tagSelections);
        const mult = roundMultiplier(r.multiplier !== undefined ? r.multiplier : 1);
        if (byId.has(id)) {
            byId.get(id).multiplier = roundMultiplier(byId.get(id).multiplier + mult);
        } else {
            const clean = {
                id,
                recipeKey: r.recipeKey,
                tagSelections,
                multiplier: mult
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

export function addCalculatorRecipe(recipeKey, tagSelections = {}, multiplier = 1) {
    ensureLoaded();
    const normTags = normalizeTagSelections(tagSelections);
    const id = makeRowId(recipeKey, normTags);
    const addMult = roundMultiplier(multiplier);
    const existing = state.rows.find(r => r.id === id);

    if (existing) {
        existing.multiplier = roundMultiplier(existing.multiplier + (addMult > 0 ? addMult : 1));
        persistState();
        notifyUpdated();
        return { row: { ...existing, tagSelections: { ...existing.tagSelections } }, merged: true };
    }

    const row = {
        id,
        recipeKey,
        tagSelections: normTags,
        multiplier: addMult
    };
    state.rows.push(row);
    persistState();
    notifyUpdated();
    return { row: { ...row, tagSelections: { ...row.tagSelections } }, merged: false };
}

export function setCalculatorMultiplier(rowId, multiplier) {
    ensureLoaded();
    const row = state.rows.find(r => r.id === rowId);
    if (!row) return false;
    row.multiplier = roundMultiplier(multiplier);
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
            return Object.keys(tags).length > 0
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
                tagSelections: entry[2] && typeof entry[2] === 'object' ? entry[2] : {}
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
    if (bucket.hasPos && bucket.hasNeg && bucket.maxMag > 0 && Math.abs(val) <= bucket.maxMag * 1e-6) {
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
        bMap.forEach(bucket => {
            lines.push(formatFlowBucket(bucket, col.item, unitSettings));
        });
        totals[col.key] = { lines };
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
