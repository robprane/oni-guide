import {
    applyTagSelections,
    formatAmountNumber,
    getTagMembers,
    prettifyId
} from './data-store.js?v=7';

export const CALC_STORAGE_KEY = 'oni_calculator_state_v1';
export const CALC_SAVED_BUILDS_KEY = 'oni_calculator_saved_v1';
export const MAX_BUILD_NAME_LEN = 100;
export const MAX_BUILD_DESC_LEN = 1000;

let state = null;
let savedBuildsCache = null;
let lastSyncedEncoded = null;
let persistRequested = false;
let driverSeqCounter = 1;

function isUniqueResourceAutoTarget(target) {
    return Boolean(target && target !== 'root' && !target.startsWith('row:'));
}

export function sanitizeBuildName(val) {
    return String(val || '').replace(/\s+/g, ' ').trim().slice(0, MAX_BUILD_NAME_LEN).trim();
}

export function sanitizeBuildDescription(val) {
    return String(val || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_BUILD_DESC_LEN).trim();
}

function requestPersistentStorageOnce() {
    if (persistRequested) return;
    persistRequested = true;
    try {
        if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
            navigator.storage.persist().catch(() => {});
        }
    } catch {
        // Ignore
    }
}

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

function serializeRowsForStorage(rows) {
    return (rows || []).map(r => {
        const out = {
            recipeKey: r.recipeKey,
            tagSelections: normalizeTagSelections(r.tagSelections),
            multiplier: roundMultiplier(r.multiplier)
        };
        if (r.autoTarget) out.autoTarget = r.autoTarget;
        return out;
    });
}

function persistState() {
    const storage = getStorage();
    if (!storage || !state) return;
    try {
        const hasMeta = Boolean(state.name || state.description || state.activeBuildId);
        if (state.rows.length === 0 && state.showPower === true && !hasMeta) {
            storage.removeItem(CALC_STORAGE_KEY);
        } else {
            const payload = {
                rows: serializeRowsForStorage(state.rows),
                showPower: state.showPower
            };
            if (state.activeBuildId) payload.activeBuildId = state.activeBuildId;
            if (state.name) payload.name = state.name;
            if (state.description) payload.description = state.description;
            storage.setItem(CALC_STORAGE_KEY, JSON.stringify(payload));
        }
    } catch (err) {
        console.error('Failed to persist calculator state:', err);
    }
}

function ensureSavedBuildsLoaded() {
    if (savedBuildsCache) return savedBuildsCache;
    savedBuildsCache = [];
    const storage = getStorage();
    if (!storage) return savedBuildsCache;
    try {
        const raw = storage.getItem(CALC_SAVED_BUILDS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                savedBuildsCache = parsed
                    .filter(b => b && typeof b.id === 'string' && b.id)
                    .map(b => ({
                        id: b.id,
                        name: sanitizeBuildName(b.name) || 'Untitled Build',
                        description: sanitizeBuildDescription(b.description),
                        showPower: b.showPower !== undefined ? Boolean(b.showPower) : true,
                        rows: sanitizeRows(b.rows),
                        updatedAt: Number.isFinite(Number(b.updatedAt)) ? Number(b.updatedAt) : Date.now()
                    }));
            }
        }
    } catch (err) {
        console.error('Failed to read saved calculator builds:', err);
        savedBuildsCache = [];
    }
    return savedBuildsCache;
}

function persistSavedBuilds() {
    const storage = getStorage();
    if (!storage || !savedBuildsCache) return;
    try {
        if (savedBuildsCache.length === 0) {
            storage.removeItem(CALC_SAVED_BUILDS_KEY);
        } else {
            storage.setItem(CALC_SAVED_BUILDS_KEY, JSON.stringify(
                savedBuildsCache.map(b => ({
                    id: b.id,
                    name: b.name,
                    description: b.description || undefined,
                    showPower: b.showPower,
                    rows: serializeRowsForStorage(b.rows),
                    updatedAt: b.updatedAt
                }))
            ));
        }
    } catch (err) {
        console.error('Failed to persist saved calculator builds:', err);
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
        if (isUniqueResourceAutoTarget(autoTarget)) {
            if (usedAutoTargets.has(autoTarget)) {
                autoTarget = null;
            } else {
                usedAutoTargets.add(autoTarget);
            }
        }

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
                autoTarget,
                driverSeq: autoTarget === 'root' ? ++driverSeqCounter : 0,
                manualPinned: false,
                lastAutoTarget: null
            };
            byId.set(id, clean);
            rows.push(clean);
        }
    }
    return rows;
}

function ensureLoaded() {
    if (state) return state;
    state = { rows: [], showPower: true, activeBuildId: null, name: '', description: '' };
    const storage = getStorage();
    if (storage) {
        try {
            const raw = storage.getItem(CALC_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                state = {
                    rows: sanitizeRows(parsed.rows),
                    showPower: parsed.showPower !== undefined ? Boolean(parsed.showPower) : true,
                    activeBuildId: typeof parsed.activeBuildId === 'string' && parsed.activeBuildId ? parsed.activeBuildId : null,
                    name: sanitizeBuildName(parsed.name),
                    description: sanitizeBuildDescription(parsed.description)
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
        showPower: state.showPower,
        activeBuildId: state.activeBuildId || null,
        name: state.name || '',
        description: state.description || ''
    };
}

export function setCalculatorBuildMeta({ name, description, activeBuildId } = {}) {
    ensureLoaded();
    if (name !== undefined) state.name = sanitizeBuildName(name);
    if (description !== undefined) state.description = sanitizeBuildDescription(description);
    if (activeBuildId !== undefined) state.activeBuildId = activeBuildId || null;
    persistState();
    notifyUpdated();
}

export function getSavedBuilds() {
    const list = ensureSavedBuildsLoaded();
    return list
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(b => ({
            ...b,
            rows: b.rows.map(r => ({ ...r, tagSelections: { ...r.tagSelections } }))
        }));
}

export function getSavedBuildsCount() {
    return ensureSavedBuildsLoaded().length;
}

export function saveCurrentBuild({ name, description = '', overwriteId = null } = {}) {
    ensureLoaded();
    const list = ensureSavedBuildsLoaded();
    requestPersistentStorageOnce();

    const cleanName = sanitizeBuildName(name) || 'Untitled Build';
    const cleanDesc = sanitizeBuildDescription(description);
    const now = Date.now();
    const rowsCopy = sanitizeRows(serializeRowsForStorage(state.rows));

    let target = overwriteId ? list.find(b => b.id === overwriteId) : null;
    let isNew = false;

    if (target) {
        target.name = cleanName;
        target.description = cleanDesc;
        target.showPower = state.showPower;
        target.rows = rowsCopy;
        target.updatedAt = now;
    } else {
        isNew = true;
        target = {
            id: `b_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            name: cleanName,
            description: cleanDesc,
            showPower: state.showPower,
            rows: rowsCopy,
            updatedAt: now
        };
        list.push(target);
    }

    state.activeBuildId = target.id;
    state.name = target.name;
    state.description = target.description;
    persistSavedBuilds();
    persistState();
    notifyUpdated();

    return {
        build: { ...target, rows: target.rows.map(r => ({ ...r, tagSelections: { ...r.tagSelections } })) },
        isNew
    };
}

export function loadSavedBuild(buildId) {
    ensureLoaded();
    const list = ensureSavedBuildsLoaded();
    const found = list.find(b => b.id === buildId);
    if (!found) return null;

    state = {
        rows: sanitizeRows(serializeRowsForStorage(found.rows)),
        showPower: found.showPower,
        activeBuildId: found.id,
        name: found.name,
        description: found.description
    };
    persistState();
    notifyUpdated();
    return getCalculatorState();
}

export function deleteSavedBuild(buildId) {
    ensureLoaded();
    const list = ensureSavedBuildsLoaded();
    const idx = list.findIndex(b => b.id === buildId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    if (state.activeBuildId === buildId) {
        state.activeBuildId = null;
        persistState();
    }
    persistSavedBuilds();
    notifyUpdated();
    return true;
}

export function isActiveBuildDirty() {
    ensureLoaded();
    if (!state.activeBuildId) return false;
    const saved = ensureSavedBuildsLoaded().find(b => b.id === state.activeBuildId);
    if (!saved) return false;
    if (saved.name !== state.name || saved.description !== state.description || saved.showPower !== state.showPower) {
        return true;
    }
    const curSig = JSON.stringify(serializeRowsForStorage(state.rows));
    const savedSig = JSON.stringify(serializeRowsForStorage(saved.rows));
    return curSig !== savedSig;
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

    if (isUniqueResourceAutoTarget(cleanAuto)) {
        state.rows.forEach(r => {
            if (r.id !== id && r.autoTarget === cleanAuto) r.autoTarget = null;
        });
    }

    if (existing) {
        if (cleanAuto) {
            existing.autoTarget = cleanAuto;
            existing.manualPinned = false;
            if (cleanAuto === 'root') existing.driverSeq = ++driverSeqCounter;
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
        autoTarget: cleanAuto,
        driverSeq: cleanAuto === 'root' ? ++driverSeqCounter : 0,
        manualPinned: false,
        lastAutoTarget: null
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
        row.lastAutoTarget = row.autoTarget;
        row.autoTarget = null;
        row.manualPinned = true;
    } else if (row.autoTarget) {
        row.driverSeq = ++driverSeqCounter;
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
    if (isUniqueResourceAutoTarget(clean)) {
        state.rows.forEach(r => {
            if (r.id !== rowId && r.autoTarget === clean) r.autoTarget = null;
        });
    }
    if (!clean && row.autoTarget) {
        row.lastAutoTarget = row.autoTarget;
        row.manualPinned = true;
    } else if (clean) {
        row.manualPinned = false;
        if (clean === 'root') row.driverSeq = ++driverSeqCounter;
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
        if (!duplicate.autoTarget && row.autoTarget) {
            duplicate.autoTarget = row.autoTarget;
        }
        state.rows.forEach(r => {
            if (r.autoTarget === `row:${rowId}`) {
                r.autoTarget = `row:${duplicate.id}`;
            }
        });
        state.rows.splice(idx, 1);
        persistState();
        notifyUpdated();
        return { rowId: duplicate.id, merged: true };
    }

    row.id = nextId;
    row.tagSelections = normTags;
    state.rows.forEach(r => {
        if (r.autoTarget === `row:${rowId}`) {
            r.autoTarget = `row:${nextId}`;
        }
    });
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
    state.activeBuildId = null;
    state.name = '';
    state.description = '';
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
// URL Serialization (UTF-8 safe Base64URL + deflate-raw compression, v1 compat)
// ============================================================================

function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(encoded) {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toBase64Url(str) {
    return bytesToBase64Url(new TextEncoder().encode(str));
}

function fromBase64Url(encoded) {
    return new TextDecoder().decode(base64UrlToBytes(encoded));
}

async function streamTransformBytes(bytes, stream) {
    const writer = stream.writable.getWriter();
    const writePromise = writer.write(bytes).then(() => writer.close());
    const reader = stream.readable.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
    }
    await writePromise;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

function buildUrlPayload(targetState) {
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
    const cleanName = sanitizeBuildName(targetState.name);
    const cleanDesc = sanitizeBuildDescription(targetState.description);
    if (cleanName) payload.n = cleanName;
    if (cleanDesc) payload.d = cleanDesc;
    return payload;
}

function parseDecodedPayload(json) {
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
        showPower: parsed.p !== undefined ? Boolean(parsed.p) : true,
        activeBuildId: null,
        name: sanitizeBuildName(parsed.n),
        description: sanitizeBuildDescription(parsed.d)
    };
}

export function encodeCalculatorState(targetState = getCalculatorState()) {
    if (!targetState || !Array.isArray(targetState.rows) || targetState.rows.length === 0) {
        return '';
    }
    return toBase64Url(JSON.stringify(buildUrlPayload(targetState)));
}

export async function encodeCalculatorStateAsync(targetState = getCalculatorState()) {
    if (!targetState || !Array.isArray(targetState.rows) || targetState.rows.length === 0) {
        return '';
    }
    const json = JSON.stringify(buildUrlPayload(targetState));
    const rawBytes = new TextEncoder().encode(json);
    const rawEncoded = bytesToBase64Url(rawBytes);

    if (typeof CompressionStream !== 'undefined') {
        try {
            const compressed = await streamTransformBytes(rawBytes, new CompressionStream('deflate-raw'));
            const compEncoded = `z.${bytesToBase64Url(compressed)}`;
            if (compEncoded.length < rawEncoded.length) {
                return compEncoded;
            }
        } catch {
            // Fall back to uncompressed Base64URL
        }
    }
    return rawEncoded;
}

export function decodeCalculatorState(encoded) {
    if (!encoded || typeof encoded !== 'string') return null;
    if (encoded.startsWith('z.')) return null;
    try {
        return parseDecodedPayload(fromBase64Url(encoded));
    } catch (err) {
        console.error('Failed to decode calculator state from URL:', err);
        return null;
    }
}

export async function decodeCalculatorStateAsync(encoded) {
    if (!encoded || typeof encoded !== 'string') return null;
    if (encoded.startsWith('z.')) {
        if (typeof DecompressionStream === 'undefined') return null;
        try {
            const compBytes = base64UrlToBytes(encoded.slice(2));
            const rawBytes = await streamTransformBytes(compBytes, new DecompressionStream('deflate-raw'));
            return parseDecodedPayload(new TextDecoder().decode(rawBytes));
        } catch (err) {
            console.error('Failed to decompress calculator state from URL:', err);
            return null;
        }
    }
    return decodeCalculatorState(encoded);
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

export async function loadCalculatorStateFromEncodedAsync(encoded, { persist = true } = {}) {
    const decoded = await decodeCalculatorStateAsync(encoded);
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
    } else if (!entry.per && (rawRecipe.source === 'heat' || rawRecipe.source === 'cool')) {
        // Phase transitions (1000 g -> 1000 g) act as 1 kg/s throughput in flow chains (e.g. boilers, cooking Raw Egg)
        basis = 'rate';
        timeScale = 1;
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
        isVariantRange: Boolean(entry.isVariantRange),
        rawMin,
        rawMax,
        rawUnit: entry.unit || '',
        rawPer: entry.per || null,
        note: entry.note || null,
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
            hasVariantRange: false,
            parts: []
        };
        bucketMap.set(flow.bucketKey, bucket);
    }
    bucket.min += flow.min;
    bucket.max += flow.max;
    bucket.maxMag = Math.max(bucket.maxMag, Math.abs(flow.min), Math.abs(flow.max));
    if (flow.max > 0) bucket.hasPos = true;
    if (flow.min < 0) bucket.hasNeg = true;
    if (flow.isVariantRange) bucket.hasVariantRange = true;
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
            cssClass = bucket.hasVariantRange ? 'amount-mixed' : 'amount-positive';
        } else if (v < 0) {
            text = `-${formatAmountNumber(Math.abs(v))}${unitText}`;
            cssClass = bucket.hasVariantRange ? 'amount-mixed' : 'amount-negative';
        } else {
            text = `0${unitText}`;
            cssClass = 'amount-neutral';
        }
    } else if (min >= 0 && max > 0) {
        text = `+${formatAmountNumber(min)}–${formatAmountNumber(max)}${unitText}`;
        cssClass = bucket.hasVariantRange ? 'amount-mixed' : 'amount-positive';
    } else if (max <= 0 && min < 0) {
        text = `-${formatAmountNumber(Math.abs(min))} .. -${formatAmountNumber(Math.abs(max))}${unitText}`;
        cssClass = bucket.hasVariantRange ? 'amount-mixed' : 'amount-negative';
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

// ============================================================================
// Virtual Choice Recipes (Multi-Diet Critters & Single-Source Multi-Recipes)
// ============================================================================

export function isChoiceRecipeKey(recipeKey) {
    return typeof recipeKey === 'string' && recipeKey.startsWith('choice:');
}

/**
 * Returns all feeding/diet recipes for a critter source (excluding non-food passive converters
 * such as Gulp Fish's Polluted Water -> Water filter).
 */
export function getCritterDietRecipes(critterId, data) {
    if (!critterId || !data || !data.allItems || !data.recipesData) return [];
    const item = data.allItems[critterId];
    if (!item || item._type !== 'critter') return [];
    return data.recipesData.filter(r => {
        if (r.source !== critterId || !(r.consumed || []).length) return false;
        // Gulp Fish has an ElementConverter (Polluted Water -> Water) in addition to its 5 diets
        if (
            critterId === 'gulp_fish' &&
            r.consumed.length === 1 &&
            r.consumed[0].element === 'polluted_water' &&
            (r.produced || []).length === 1 &&
            r.produced[0].element === 'water'
        ) {
            return false;
        }
        return true;
    });
}

export function getChoiceCandidates(recipeKey, data) {
    if (!isChoiceRecipeKey(recipeKey) || !data || !data.recipesData) return [];
    if (recipeKey.startsWith('choice:diet:')) {
        const critterId = recipeKey.slice('choice:diet:'.length);
        return getCritterDietRecipes(critterId, data);
    }
    if (recipeKey.startsWith('choice:prod:')) {
        const rest = recipeKey.slice('choice:prod:'.length);
        const colon = rest.indexOf(':');
        if (colon === -1) return [];
        const sourceId = rest.slice(0, colon);
        const elementId = rest.slice(colon + 1);
        const allItems = data.allItems || {};
        return data.recipesData.filter(r => {
            if (r.source !== sourceId) return false;
            if (!(r.produced || []).some(p => p.element === elementId)) return false;
            const fm = getUnitFlowMapForRecipe(r, {}, allItems);
            return Boolean(findProducedRateBucket(fm, `el:${elementId}`));
        });
    }
    return [];
}

function unitAndPerFromDimBasis(dim, basis) {
    let unit = '';
    if (dim === 'mass_g' || dim === 'food_g') unit = 'g';
    else if (dim === 'nectar_g') unit = 'g of stored Nectar';
    else if (dim.startsWith('raw:')) unit = dim.slice(4);
    const per = basis === 'rate' ? 's' : (basis === 'event' ? undefined : basis);
    return { unit, per };
}

function getNormalizedCandidateFlows(cand, side, allItems) {
    const list = cand[side] || [];
    const out = [];
    for (const entry of list) {
        // Resolve amountRatioFromConsumed for unselected kcal tag diets (e.g. Hatch #Edible -> 75% Coal)
        if (side === 'produced' && entry.amountRatioFromConsumed !== undefined) {
            const c0 = (cand.consumed || [])[0];
            if (c0 && c0.tag && c0.unit === 'kcal') {
                const members = getTagMembers(c0.tag).filter(m => m.kcalPerKg > 0);
                if (members.length > 0) {
                    const kcals = members.map(m => m.kcalPerKg);
                    const minKcal = Math.min(...kcals);
                    const maxKcal = Math.max(...kcals);
                    const timeScale = c0.per === 'cycle' ? (1 / 600) : 1;
                    const rateKcalS = (c0.amount || 0) * timeScale;
                    const minG = (rateKcalS / maxKcal) * 1000 * entry.amountRatioFromConsumed;
                    const maxG = (rateKcalS / minKcal) * 1000 * entry.amountRatioFromConsumed;
                    out.push({
                        colKey: getEntryColKey(entry),
                        entry,
                        bucketKey: 'mass_g|rate',
                        dim: 'mass_g',
                        basis: 'rate',
                        min: minG,
                        max: maxG
                    });
                    continue;
                }
            }
        }
        const flow = normalizeFlowEntry(entry, cand, +1, 1, allItems);
        out.push({
            colKey: getEntryColKey(entry),
            entry,
            bucketKey: flow.bucketKey,
            dim: flow.dim,
            basis: flow.basis,
            min: Math.abs(flow.min),
            max: Math.abs(flow.max)
        });
    }
    return out;
}

function collectPreviewItemIds(candidates, side, limit = 4) {
    const ids = [];
    const seen = new Set();
    for (const c of candidates) {
        for (const e of (c[side] || [])) {
            if (ids.length >= limit) return ids;
            if (e.element && !seen.has(e.element)) {
                seen.add(e.element);
                ids.push(e.element);
            } else if (e.tag) {
                for (const m of getTagMembers(e.tag)) {
                    if (ids.length >= limit) return ids;
                    if (!seen.has(m.id)) {
                        seen.add(m.id);
                        ids.push(m.id);
                    }
                }
            }
        }
    }
    return ids;
}

export function getRecipeByKeyOrChoice(recipeKey, data) {
    if (!recipeKey || !data) return null;
    if (data.recipesByKey && data.recipesByKey.has(recipeKey)) {
        return data.recipesByKey.get(recipeKey);
    }
    if (!isChoiceRecipeKey(recipeKey)) return null;

    const candidates = getChoiceCandidates(recipeKey, data);
    if (candidates.length === 0) return null;

    const allItems = data.allItems || {};
    const isDiet = recipeKey.startsWith('choice:diet:');
    const source = candidates[0].source;
    const srcName = allItems[source]?.name || prettifyId(source);
    let targetElId = null;
    if (!isDiet) {
        const rest = recipeKey.slice('choice:prod:'.length);
        targetElId = rest.slice(rest.indexOf(':') + 1);
    }

    const candCons = candidates.map(c => getNormalizedCandidateFlows(c, 'consumed', allItems));
    const candProd = candidates.map(c => getNormalizedCandidateFlows(c, 'produced', allItems));

    const buildAggregatedSide = (candFlowsList, isConsumed) => {
        const totalCands = candFlowsList.length;
        // Count in how many candidates each (colKey, bucketKey) appears
        const statsByKey = new Map();
        candFlowsList.forEach((flows, cIdx) => {
            const perCand = new Map();
            flows.forEach(f => {
                if (!f.colKey) return;
                const k = `${f.colKey}||${f.bucketKey}`;
                if (!perCand.has(k)) {
                    perCand.set(k, { colKey: f.colKey, bucketKey: f.bucketKey, dim: f.dim, basis: f.basis, entry: f.entry, min: 0, max: 0 });
                }
                const acc = perCand.get(k);
                acc.min += f.min;
                acc.max += f.max;
            });
            perCand.forEach((acc, k) => {
                if (!statsByKey.has(k)) {
                    statsByKey.set(k, { ...acc, count: 0, allMin: Infinity, allMax: -Infinity, candIdxs: new Set() });
                }
                const st = statsByKey.get(k);
                st.count++;
                st.candIdxs.add(cIdx);
                st.allMin = Math.min(st.allMin, acc.min);
                st.allMax = Math.max(st.allMax, acc.max);
            });
        });

        const commonKeys = new Set();
        const resultEntries = [];

        statsByKey.forEach((st, k) => {
            if (st.count === totalCands) {
                commonKeys.add(k);
                const { unit, per } = unitAndPerFromDimBasis(st.dim, st.basis);
                const isVar = (st.allMax - st.allMin) > Math.max(st.allMax, 1e-9) * 1e-5;
                const base = st.entry.tag ? { tag: st.entry.tag } : { element: st.entry.element };
                resultEntries.push({
                    ...base,
                    amount: (st.allMin + st.allMax) / 2,
                    amountMin: st.allMin,
                    amountMax: st.allMax,
                    unit,
                    per,
                    isVariantRange: isVar,
                    note: isVar ? 'Range across recipe options — pick an option to lock exact rate' : undefined
                });
            }
        });

        // Collect remaining (varying) entries across candidates
        const varyingByBucket = new Map();
        let candsWithVarying = 0;
        const varyingPreviewIds = [];
        const seenPreview = new Set();
        const addPreview = (entry) => {
            if (varyingPreviewIds.length >= 4) return;
            if (entry.element && !seenPreview.has(entry.element)) {
                seenPreview.add(entry.element);
                varyingPreviewIds.push(entry.element);
            } else if (entry.tag) {
                for (const m of getTagMembers(entry.tag)) {
                    if (varyingPreviewIds.length >= 4) break;
                    if (!seenPreview.has(m.id)) {
                        seenPreview.add(m.id);
                        varyingPreviewIds.push(m.id);
                    }
                }
            }
        };

        candFlowsList.forEach(flows => {
            const perBucket = new Map();
            let hasAny = false;
            flows.forEach(f => {
                const k = `${f.colKey}||${f.bucketKey}`;
                if (commonKeys.has(k)) return;
                hasAny = true;
                addPreview(f.entry);
                if (!perBucket.has(f.bucketKey)) {
                    perBucket.set(f.bucketKey, { dim: f.dim, basis: f.basis, min: 0, max: 0 });
                }
                const acc = perBucket.get(f.bucketKey);
                acc.min += f.min;
                acc.max += f.max;
            });
            if (hasAny) {
                candsWithVarying++;
                perBucket.forEach((acc, bk) => {
                    if (!varyingByBucket.has(bk)) {
                        varyingByBucket.set(bk, { dim: acc.dim, basis: acc.basis, min: Infinity, max: -Infinity });
                    }
                    const vb = varyingByBucket.get(bk);
                    vb.min = Math.min(vb.min, acc.min);
                    vb.max = Math.max(vb.max, acc.max);
                });
            }
        });

        // For consumed: always show virtual input column if any inputs vary.
        // For produced: show virtual output column ONLY when EVERY candidate has a varying output
        // and there's no common output (e.g. Smooth Hatch -> 9 metals, Puft Prince -> Slime/Bleach/Oxylite).
        const shouldEmitVirtual = isConsumed
            ? varyingByBucket.size > 0
            : (varyingByBucket.size > 0 && resultEntries.length === 0 && candsWithVarying === totalCands);

        if (shouldEmitVirtual) {
            const colId = isConsumed
                ? `choicein:${recipeKey.slice('choice:'.length)}`
                : `choiceout:${recipeKey.slice('choice:'.length)}`;
            let colName;
            if (isDiet) {
                colName = isConsumed ? `${srcName} Diet` : `${srcName} Output`;
            } else if (source === 'egg_cracker' && isConsumed) {
                colName = 'Any Egg';
            } else {
                const targetName = targetElId ? (allItems[targetElId]?.name || prettifyId(targetElId)) : srcName;
                colName = isConsumed ? `${targetName} Input` : `${srcName} Output`;
            }

            varyingByBucket.forEach(vb => {
                const { unit, per } = unitAndPerFromDimBasis(vb.dim, vb.basis);
                resultEntries.push({
                    choiceCol: colId,
                    choiceName: colName,
                    choicePreviewIds: varyingPreviewIds,
                    choiceRowKey: recipeKey,
                    amount: (vb.min + vb.max) / 2,
                    amountMin: vb.min,
                    amountMax: vb.max,
                    unit,
                    per,
                    isVariantRange: true,
                    note: `Varies across ${totalCands} options — select a specific option`
                });
            });
        }

        return resultEntries;
    };

    const consumed = buildAggregatedSide(candCons, true);
    const produced = buildAggregatedSide(candProd, false);

    return {
        _key: recipeKey,
        isChoice: true,
        choiceKind: isDiet ? 'diet' : 'prod',
        source,
        consumed,
        produced,
        candidates,
        choicePreviewIds: collectPreviewItemIds(candidates, 'consumed', 4)
    };
}

/**
 * Builds structured option groups for a Choice Row (or switchable resolved row) dropdown & popover.
 * Each option value encodes either a concrete tag selection or a direct candidate recipe.
 */
export function getChoiceSelectGroups(choiceKey, data) {
    const candidates = getChoiceCandidates(choiceKey, data);
    if (candidates.length === 0) return { groups: [], flatOptions: [] };
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};
    const isDiet = choiceKey.startsWith('choice:diet:');

    // Identify common consumed element/tag keys across all candidates so option labels emphasize what differs
    const commonConsumed = new Set();
    if (candidates.length > 1) {
        const firstKeys = new Set((candidates[0].consumed || []).map(getEntryColKey).filter(Boolean));
        firstKeys.forEach(k => {
            if (candidates.every(c => (c.consumed || []).some(e => getEntryColKey(e) === k))) {
                commonConsumed.add(k);
            }
        });
    }

    const directOptions = [];
    const tagGroups = [];
    const flatOptions = [];

    const describeCandidateBrief = (cand) => {
        const consNames = (cand.consumed || [])
            .filter(e => !commonConsumed.has(getEntryColKey(e)) || (cand.consumed || []).length === 1)
            .map(e => (e.tag ? `#${allTags[e.tag]?.name || prettifyId(e.tag)}` : (allItems[e.element]?.name || prettifyId(e.element))));
        const prodNames = (cand.produced || [])
            .map(e => (e.tag ? `#${allTags[e.tag]?.name || prettifyId(e.tag)}` : (allItems[e.element]?.name || prettifyId(e.element))));
        if (!isDiet) {
            return consNames.join(' + ');
        }
        const distinctProds = new Set(candidates.map(c => (c.produced || []).map(p => p.element || p.tag).join(',')));
        if (distinctProds.size > 1 && prodNames.length > 0) {
            return `${consNames.join(' + ')} → ${prodNames.join(' + ')}`;
        }
        return consNames.join(' + ');
    };

    for (const cand of candidates) {
        const varyingCons = (cand.consumed || []).filter(e => !commonConsumed.has(getEntryColKey(e)));
        const tagEntry = varyingCons.find(e => e.tag);

        if (tagEntry) {
            const tagObj = allTags[tagEntry.tag] || { id: tagEntry.tag, name: prettifyId(tagEntry.tag) };
            const members = getTagMembers(tagEntry.tag);
            let groupLabel = `${tagObj.name} (${members.length})`;
            if (cand.source === 'egg_cracker') {
                const rawEggOut = (cand.produced || []).find(p => p.element === 'raw_egg');
                if (rawEggOut) {
                    const outStr = rawEggOut.amount >= 1000
                        ? `${formatAmountNumber(rawEggOut.amount / 1000)} kg`
                        : `${formatAmountNumber(rawEggOut.amount)} g`;
                    groupLabel = `${outStr} Raw Egg (${members.length})`;
                }
            }
            const groupOpts = [];
            const anyVal = `recipe::${cand._key}`;
            const anyOpt = {
                value: anyVal,
                label: `#Any ${tagObj.name} (${members.length})`,
                searchText: `${tagObj.name} any`,
                recipeKey: cand._key,
                tagSelections: {},
                itemId: null,
                tagId: tagEntry.tag,
                image: tagObj.image || ''
            };
            groupOpts.push(anyOpt);

            for (const m of members) {
                const val = `concrete::${cand._key}::${tagEntry.tag}::${m.id}`;
                const opt = {
                    value: val,
                    label: m.name,
                    searchText: `${m.name} ${tagObj.name}`.toLowerCase(),
                    recipeKey: cand._key,
                    tagSelections: { [tagEntry.tag]: m.id },
                    itemId: m.id,
                    tagId: tagEntry.tag,
                    image: m.image || ''
                };
                groupOpts.push(opt);
                flatOptions.push(opt);
            }
            tagGroups.push({ label: groupLabel, options: groupOpts });
        } else {
            const firstVar = varyingCons[0] || (cand.consumed || [])[0];
            const firstItem = firstVar && firstVar.element ? allItems[firstVar.element] : null;
            const val = `recipe::${cand._key}`;
            const label = describeCandidateBrief(cand) || (firstItem ? firstItem.name : cand._key);
            const opt = {
                value: val,
                label,
                searchText: label.toLowerCase(),
                recipeKey: cand._key,
                tagSelections: {},
                itemId: firstItem ? firstItem.id : null,
                tagId: null,
                image: firstItem ? (firstItem.image || '') : ''
            };
            directOptions.push(opt);
            flatOptions.push(opt);
        }
    }

    const groups = [];
    if (directOptions.length > 0) {
        groups.push({ label: tagGroups.length > 0 ? 'Direct options' : null, options: directOptions });
    }
    groups.push(...tagGroups);

    // Sort Egg Cracker groups by Raw Egg yield descending for clean browsing
    if (choiceKey === 'choice:prod:egg_cracker:raw_egg') {
        flatOptions.sort((a, b) => a.label.localeCompare(b.label));
    }

    return { groups, flatOptions };
}

/**
 * Determines whether a row (unresolved Choice Row OR an already-resolved multi-diet / single-source
 * variant row) can show a unified variant switcher <select>.
 */
export function getSwitchableChoiceGroup(row, data) {
    if (!row || !data) return null;
    const allItems = data.allItems || {};
    let choiceKey = null;

    if (isChoiceRecipeKey(row.recipeKey)) {
        choiceKey = row.recipeKey;
    } else {
        const raw = data.recipesByKey?.get(row.recipeKey);
        if (!raw) return null;
        const srcItem = allItems[raw.source];
        // Case 1: Critter feeding row for a multi-diet critter
        if (srcItem && srcItem._type === 'critter' && (raw.consumed || []).length > 0) {
            const diets = getCritterDietRecipes(raw.source, data);
            if (diets.length > 1 && diets.some(d => d._key === raw._key)) {
                choiceKey = `choice:diet:${raw.source}`;
            }
        }
        // Case 2: Single-source multi-recipe producer (e.g. Egg Cracker for Raw Egg, Microbe Musher for Berry Sludge, Kiln for Refined Carbon)
        if (!choiceKey && row.autoTarget && row.autoTarget.startsWith('el:')) {
            const targetEl = row.autoTarget.slice(3);
            const prodKey = `choice:prod:${raw.source}:${targetEl}`;
            const cands = getChoiceCandidates(prodKey, data);
            if (cands.length > 1 && cands.some(c => c._key === raw._key)) {
                choiceKey = prodKey;
            }
        }
    }

    if (!choiceKey) return null;
    const { groups, flatOptions } = getChoiceSelectGroups(choiceKey, data);
    if (groups.length === 0) return null;

    const isDiet = choiceKey.startsWith('choice:diet:');
    const srcId = isDiet
        ? choiceKey.slice('choice:diet:'.length)
        : choiceKey.slice('choice:prod:'.length).split(':')[0];
    const srcName = allItems[srcId]?.name || prettifyId(srcId);

    let anyLabel;
    if (isDiet) {
        anyLabel = `#Any ${srcName} Diet (${flatOptions.length})`;
    } else if (choiceKey === 'choice:prod:egg_cracker:raw_egg') {
        anyLabel = `#Any Egg (${flatOptions.length})`;
    } else {
        anyLabel = `#Any ${srcName} Option (${flatOptions.length})`;
    }

    // Determine currently selected value & which tagSlots on this row are covered by the switcher
    let currentValue = '';
    const coveredTagIds = new Set();
    if (!isChoiceRecipeKey(row.recipeKey)) {
        const raw = data.recipesByKey?.get(row.recipeKey);
        const allOptList = groups.flatMap(g => g.options);
        // Prefer exact concrete match first
        const concreteMatch = allOptList.find(o => {
            if (o.recipeKey !== row.recipeKey || !o.tagId) return false;
            return row.tagSelections && row.tagSelections[o.tagId] === o.itemId;
        });
        if (concreteMatch) {
            currentValue = concreteMatch.value;
            coveredTagIds.add(concreteMatch.tagId);
        } else {
            const recipeMatch = allOptList.find(o => o.recipeKey === row.recipeKey && !o.itemId);
            if (recipeMatch) {
                currentValue = recipeMatch.value;
                if (recipeMatch.tagId) coveredTagIds.add(recipeMatch.tagId);
            } else {
                const directMatch = allOptList.find(o => o.recipeKey === row.recipeKey);
                if (directMatch) currentValue = directMatch.value;
            }
        }
        if (raw && coveredTagIds.size === 0) {
            // Also check if current recipe uses a tag that was represented in the group
            const grpTag = allOptList.find(o => o.recipeKey === row.recipeKey && o.tagId)?.tagId;
            if (grpTag) coveredTagIds.add(grpTag);
        }
    }

    return {
        choiceKey,
        anyLabel,
        groups,
        flatOptions,
        currentValue,
        coveredTagIds
    };
}

export function computeCalculatorTable(targetState, data, unitSettings) {
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};

    const columnsMap = new Map();
    const totalsMap = new Map();
    const computedRows = [];

    let totalPowerW = 0;
    let totalPowerMaxMag = 0;
    let totalPowerHasPos = false;
    let totalPowerHasNeg = false;
    let anyRowHasPower = false;

    const ensureColumn = (entry) => {
        if (entry.choiceCol) {
            const colKey = entry.choiceCol;
            if (!columnsMap.has(colKey)) {
                columnsMap.set(colKey, {
                    key: colKey,
                    isTag: false,
                    isChoiceCol: true,
                    choiceKey: entry.choiceRowKey || null,
                    previewIds: entry.choicePreviewIds || [],
                    id: colKey,
                    name: entry.choiceName || prettifyId(colKey),
                    image: '',
                    item: null,
                    tag: null
                });
                totalsMap.set(colKey, new Map());
            }
            return colKey;
        }
        if (entry.tag) {
            const colKey = `tag:${entry.tag}`;
            if (!columnsMap.has(colKey)) {
                const tag = allTags[entry.tag] || { id: entry.tag, name: prettifyId(entry.tag), image: '' };
                columnsMap.set(colKey, {
                    key: colKey,
                    isTag: true,
                    isChoiceCol: false,
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
                isChoiceCol: false,
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
        const rawRecipe = getRecipeByKeyOrChoice(row.recipeKey, data);
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
                    if (part.note && !tooltipParts.includes(part.note)) {
                        tooltipParts.push(part.note);
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
            isChoiceRow: Boolean(rawRecipe.isChoice),
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
            // Identify resolvable negative rate deficits (or virtual choice input columns)
            if (!deficit && col.isChoiceCol && col.key.startsWith('choicein:')) {
                deficit = {
                    colKey: col.key,
                    bucketKey: bucket.bucketKey,
                    dim: bucket.dim,
                    basis: bucket.basis,
                    amount: Math.abs((bucket.min + bucket.max) / 2),
                    isTag: false,
                    isChoice: true,
                    choiceKey: col.choiceKey,
                    id: col.id,
                    name: col.name,
                    formattedText: fmt.text
                };
            } else if (!deficit && !col.isChoiceCol && bucket.basis === 'rate') {
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
                        isChoice: false,
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
// Producer Discovery, Bidirectional Linear Auto-Balance Solver & Chain Expansion
// ============================================================================

export function formatMultiplierDisplay(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return '0';
    if (Math.abs(num - Math.round(num)) < 1e-5) {
        return String(Math.round(num));
    }
    if (num < 0.005) {
        return String(Number(num.toPrecision(2)));
    }
    const decimals = num < 0.05 ? 3 : 2;
    return String(parseFloat(num.toFixed(decimals)));
}

function getEntryColKey(entry) {
    if (!entry) return null;
    if (entry.choiceCol) return entry.choiceCol;
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
 * Structured active-set non-negative linear solver for equations with explicit ownerIdx & isDriver flags.
 * Unlike index-coupled elimination, clamping variable j drops ONLY j's own non-driver constraint
 * (never dropping a driver equation x_d = val), and explicitly flags singular closed loops instead of zeroing.
 */
function solveStructuredSystem(k, equations) {
    if (k === 0) return { ok: true, singular: false, x: [] };
    if (equations.length !== k) return { ok: false, singular: true, x: null };

    const activeVars = new Array(k).fill(true);
    const driverIdxSet = new Set(equations.filter(eq => eq.isDriver).map(eq => eq.ownerIdx));

    for (let iter = 0; iter <= k; iter++) {
        const varIdx = [];
        for (let i = 0; i < k; i++) {
            if (activeVars[i]) varIdx.push(i);
        }
        if (varIdx.length === 0) {
            return { ok: true, singular: false, x: new Array(k).fill(0) };
        }

        // Keep all driver equations + non-driver equations whose owner variable is still active
        let activeEqs = equations.filter(eq => eq.isDriver || activeVars[eq.ownerIdx]);

        // If a clamped variable owned no constraint (e.g. 'root' when driver was elsewhere), drop one
        // non-driver equation that references it so the reduced system stays square.
        while (activeEqs.length > varIdx.length) {
            const dropIdx = activeEqs.findIndex(eq => !eq.isDriver);
            if (dropIdx === -1) break;
            activeEqs.splice(dropIdx, 1);
        }
        if (activeEqs.length !== varIdx.length) {
            return { ok: false, singular: true, x: null };
        }

        const subA = activeEqs.map(eq => varIdx.map(c => eq.vec[c]));
        const subB = activeEqs.map(eq => eq.rhs);
        const subX = gaussianElimination(subA, subB);
        if (!subX) {
            return { ok: false, singular: true, x: null };
        }

        const x = new Array(k).fill(0);
        let minVal = 0;
        let clampIdx = -1;
        for (let m = 0; m < varIdx.length; m++) {
            const vi = varIdx[m];
            x[vi] = subX[m];
            if (!driverIdxSet.has(vi) && subX[m] < minVal - 1e-9) {
                minVal = subX[m];
                clampIdx = vi;
            }
        }

        if (clampIdx === -1) {
            return { ok: true, singular: false, x: x.map(v => (v < 0 ? 0 : v)) };
        }
        activeVars[clampIdx] = false;
    }

    return { ok: false, singular: true, x: null };
}

/**
 * Re-solves multipliers for all Auto-balanced rows in state.rows based on current Manual rows.
 * Supports both resource-balancing targets ("el:...", "tag:...") and row-synced targets ("row:<parentRowId>").
 * Handles trees, shared DAG intermediates, synced critter diets, and closed resource loops cleanly.
 */
function findAnyRateBucket(flowMap, colKey, preferredBucketKey = null) {
    const bMap = flowMap.get(colKey);
    if (!bMap) return null;
    if (preferredBucketKey && bMap.has(preferredBucketKey)) {
        const b = bMap.get(preferredBucketKey);
        if (b.basis === 'rate' && Math.abs(b.avg) > 1e-12) return b;
    }
    // Prefer positive bucket first, else any non-zero rate bucket
    for (const b of bMap.values()) {
        if (b.basis === 'rate' && b.avg > 1e-12) return b;
    }
    for (const b of bMap.values()) {
        if (b.basis === 'rate' && Math.abs(b.avg) > 1e-12) return b;
    }
    return null;
}

/**
 * Analyzes all rows into connected Auto components and active constraints.
 * Used by both `recomputeAutoMultipliers` and `setCalculatorMultiplierAndSolve`.
 */
function analyzeAutoNetwork(data, { mutateInvalid = false } = {}) {
    const allItems = data.allItems || {};
    const existingRowIds = new Set(state.rows.map(r => r.id));

    const rowInfos = [];
    const byId = new Map();
    state.rows.forEach((row, tableIdx) => {
        const rawRecipe = getRecipeByKeyOrChoice(row.recipeKey, data);
        if (!rawRecipe) return;
        const flowMap = getUnitFlowMapForRecipe(rawRecipe, row.tagSelections, allItems);
        const info = { row, rawRecipe, flowMap, tableIdx };
        rowInfos.push(info);
        byId.set(row.id, info);
    });

    const constraints = [];
    const seenConstraintKeys = new Set();

    for (const info of rowInfos) {
        const row = info.row;
        if (!row.autoTarget || row.autoTarget === 'root') continue;

        if (row.autoTarget.startsWith('row:')) {
            const parentRowId = row.autoTarget.slice(4);
            if (!parentRowId || parentRowId === row.id || !existingRowIds.has(parentRowId)) {
                if (mutateInvalid) row.autoTarget = 'root';
                continue;
            }
            const cKey = `row:${row.id}->${parentRowId}`;
            if (!seenConstraintKeys.has(cKey)) {
                seenConstraintKeys.add(cKey);
                constraints.push({ kind: 'row', key: cKey, ownerRowId: row.id, parentRowId });
            }
            continue;
        }

        const colKey = row.autoTarget;
        const targetBucket = findAnyRateBucket(info.flowMap, colKey);
        if (!targetBucket) {
            // Tag/recipe changed and no longer touches autoTarget -> unlock to Manual
            if (mutateInvalid) row.autoTarget = null;
            continue;
        }

        // Verify at least one OTHER row has an opposite-sign rate in (colKey, targetBucket.bucketKey)
        const hasOppositePartner = rowInfos.some(other => {
            if (other.row.id === row.id) return false;
            const ob = other.flowMap.get(colKey)?.get(targetBucket.bucketKey);
            return ob && (ob.avg * targetBucket.avg < -1e-24);
        });

        if (!hasOppositePartner) {
            // Other side was deleted -> keep row as 'root' (preserves current count instead of zeroing out!)
            if (mutateInvalid) row.autoTarget = 'root';
            continue;
        }

        const cKey = `col:${colKey}|${targetBucket.bucketKey}`;
        if (!seenConstraintKeys.has(cKey)) {
            seenConstraintKeys.add(cKey);
            constraints.push({
                kind: 'col',
                key: cKey,
                ownerRowId: row.id,
                colKey,
                bucketKey: targetBucket.bucketKey
            });
        }
    }

    // Build undirected adjacency graph among Auto rows
    const autoInfos = rowInfos.filter(ri => Boolean(ri.row.autoTarget));
    const autoSet = new Set(autoInfos.map(ri => ri.row.id));
    const adj = new Map(autoInfos.map(ri => [ri.row.id, new Set()]));

    const linkAuto = (a, b) => {
        if (a !== b && autoSet.has(a) && autoSet.has(b)) {
            adj.get(a).add(b);
            adj.get(b).add(a);
        }
    };

    for (const eq of constraints) {
        if (eq.kind === 'row') {
            linkAuto(eq.ownerRowId, eq.parentRowId);
        } else if (eq.kind === 'col') {
            const participants = autoInfos
                .filter(ri => Math.abs(ri.flowMap.get(eq.colKey)?.get(eq.bucketKey)?.avg || 0) > 1e-12)
                .map(ri => ri.row.id);
            for (let i = 0; i < participants.length; i++) {
                for (let j = i + 1; j < participants.length; j++) {
                    linkAuto(participants[i], participants[j]);
                }
            }
        }
    }

    // Partition Auto rows into connected components
    const visited = new Set();
    const components = [];
    for (const ri of autoInfos) {
        if (visited.has(ri.row.id)) continue;
        const comp = [];
        const queue = [ri.row.id];
        visited.add(ri.row.id);
        while (queue.length > 0) {
            const cur = queue.shift();
            comp.push(byId.get(cur));
            for (const nxt of (adj.get(cur) || [])) {
                if (!visited.has(nxt)) {
                    visited.add(nxt);
                    queue.push(nxt);
                }
            }
        }
        const compIds = new Set(comp.map(x => x.row.id));
        const compEqs = constraints.filter(eq => compIds.has(eq.ownerRowId));
        components.push({ members: comp, memberIds: compIds, eqs: compEqs });
    }

    return { rowInfos, byId, components };
}

function buildComponentEquations(comp, rowInfos, byId) {
    const { members, memberIds, eqs } = comp;
    const k = members.length;
    const idxOf = new Map(members.map((m, idx) => [m.row.id, idx]));
    const outsideRows = rowInfos.filter(ri => !memberIds.has(ri.row.id));

    let activeEqs = eqs.slice();
    if (activeEqs.length > k) {
        activeEqs = activeEqs.slice(0, k);
    }

    const equations = [];
    for (const eq of activeEqs) {
        const ownerIdx = idxOf.get(eq.ownerRowId);
        const vec = new Array(k).fill(0);
        if (eq.kind === 'row') {
            vec[ownerIdx] = 1;
            if (idxOf.has(eq.parentRowId)) {
                vec[idxOf.get(eq.parentRowId)] = -1;
                equations.push({ vec, rhs: 0, ownerIdx, isDriver: false, rowId: eq.ownerRowId });
            } else {
                const parentInfo = byId.get(eq.parentRowId);
                equations.push({ vec, rhs: parentInfo ? parentInfo.row.multiplier : 0, ownerIdx, isDriver: false, rowId: eq.ownerRowId });
            }
        } else if (eq.kind === 'col') {
            let outsideNet = 0;
            for (const out of outsideRows) {
                const ob = out.flowMap.get(eq.colKey)?.get(eq.bucketKey);
                if (ob) outsideNet += ob.avg * out.row.multiplier;
            }
            for (let j = 0; j < k; j++) {
                const mb = members[j].flowMap.get(eq.colKey)?.get(eq.bucketKey);
                if (mb) vec[j] = mb.avg;
            }
            equations.push({ vec, rhs: -outsideNet, ownerIdx, isDriver: false, rowId: eq.ownerRowId });
        }
    }

    const dof = k - activeEqs.length;
    if (dof > 0) {
        const drivers = members
            .slice()
            .sort((x, y) => {
                const ds = (y.row.driverSeq || 0) - (x.row.driverSeq || 0);
                if (ds !== 0) return ds;
                const xr = x.row.autoTarget === 'root' ? 1 : 0;
                const yr = y.row.autoTarget === 'root' ? 1 : 0;
                if (yr !== xr) return yr - xr;
                return x.tableIdx - y.tableIdx;
            })
            .slice(0, dof);

        for (const drv of drivers) {
            const drvIdx = idxOf.get(drv.row.id);
            const vec = new Array(k).fill(0);
            vec[drvIdx] = 1;
            equations.push({ vec, rhs: drv.row.multiplier, ownerIdx: drvIdx, isDriver: true, rowId: drv.row.id });
        }
    }

    return equations;
}

function recomputeAutoMultipliersDetailed(data, { editedRowId = null } = {}) {
    ensureLoaded();
    if (!data || !data.recipesByKey) return { changed: false, hadSingularLoop: false, unlockedLoopRowIds: [] };

    if (editedRowId) {
        const edited = state.rows.find(r => r.id === editedRowId);
        if (edited && edited.autoTarget) {
            edited.driverSeq = ++driverSeqCounter;
        }
    }

    let changed = false;
    let hadSingularLoop = false;
    const unlockedLoopRowIds = [];

    // Up to 8 loop-breaking retries so a singular closed loop (e.g. Electrolyzer + Water Sieve + Shower)
    // NEVER collapses valid rows to 0; instead it unlocks the loop-closing row while preserving counts.
    for (let attempt = 0; attempt < 8; attempt++) {
        const { rowInfos, byId, components } = analyzeAutoNetwork(data, { mutateInvalid: true });
        let brokeLoopThisPass = false;

        for (const comp of components) {
            const { members, eqs } = comp;
            const k = members.length;

            if (k === 1 && eqs.length === 0) {
                if (members[0].row.autoTarget === 'root') {
                    members[0].row.autoTarget = null;
                    changed = true;
                }
                continue;
            }

            const equations = buildComponentEquations(comp, rowInfos, byId);
            const res = solveStructuredSystem(k, equations);

            if (!res.ok || res.singular) {
                // Closed zero-gain / contradictory resource loop detected!
                // Unlock the last non-driver constraint row in this component so remaining rows solve cleanly.
                const nonDriverEqs = equations.filter(e => !e.isDriver);
                const victim = nonDriverEqs[nonDriverEqs.length - 1];
                if (victim) {
                    const victimRow = state.rows.find(r => r.id === victim.rowId);
                    if (victimRow && victimRow.autoTarget) {
                        victimRow.lastAutoTarget = victimRow.autoTarget;
                        victimRow.autoTarget = null;
                        victimRow.manualPinned = true;
                        hadSingularLoop = true;
                        unlockedLoopRowIds.push(victimRow.id);
                        changed = true;
                        brokeLoopThisPass = true;
                        break;
                    }
                }
                continue;
            }

            for (let i = 0; i < k; i++) {
                const nextMult = roundMultiplier(res.x[i]);
                if (Math.abs(members[i].row.multiplier - nextMult) > 1e-9) {
                    members[i].row.multiplier = nextMult;
                    changed = true;
                }
            }
        }

        if (!brokeLoopThisPass) break;
    }

    if (changed) {
        persistState();
    }
    return { changed, hadSingularLoop, unlockedLoopRowIds };
}

/**
 * Re-solves multipliers for all Auto-balanced rows in state.rows.
 * Supports bidirectional all-Auto chains (editing ANY Auto row rescales its whole connected chain!),
 * Manual-pinned anchors, synced critter diets ("row:<parentRowId>"), virtual Choice Rows,
 * and safe singular closed-loop detection.
 */
export function recomputeAutoMultipliers(data, opts = {}) {
    return recomputeAutoMultipliersDetailed(data, opts).changed;
}

/**
 * Edits a row's Count. If the row is Auto and belongs to a bidirectional Auto component (dof > 0),
 * it STAYS Auto and rescales all linked Auto rows around the new Count!
 * Only unlocks to Manual if another row in the same component is already explicitly pinned Manual.
 */
export function setCalculatorMultiplierAndSolve(rowId, multiplier, data) {
    ensureLoaded();
    const row = state.rows.find(r => r.id === rowId);
    if (!row) return { stayedAuto: false };

    const clean = roundMultiplier(multiplier);
    if (!row.autoTarget) {
        row.multiplier = clean;
        recomputeAutoMultipliers(data);
        persistState();
        notifyUpdated();
        return { stayedAuto: false };
    }

    const { components } = analyzeAutoNetwork(data, { mutateInvalid: false });
    const comp = components.find(c => c.memberIds.has(row.id));
    const canDrive = Boolean(comp && comp.eqs.length < comp.members.length);

    if (canDrive) {
        row.multiplier = clean;
        row.driverSeq = ++driverSeqCounter;
        recomputeAutoMultipliers(data, { editedRowId: row.id });
        persistState();
        notifyUpdated();
        return { stayedAuto: true };
    }

    // Component is fully constrained by a Manual row -> unlock this edited row to Manual
    row.lastAutoTarget = row.autoTarget;
    row.autoTarget = null;
    row.manualPinned = true;
    row.multiplier = clean;
    recomputeAutoMultipliers(data);
    persistState();
    notifyUpdated();
    return { stayedAuto: false };
}

/**
 * Finds valid Auto-balance link candidates for a currently Manual row based on other rows in the table.
 */
export function findAutoLinkCandidatesForRow(rowId, data) {
    ensureLoaded();
    if (!rowId || !data) return [];
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};

    const targetRow = state.rows.find(r => r.id === rowId);
    if (!targetRow) return [];
    const targetRaw = getRecipeByKeyOrChoice(targetRow.recipeKey, data);
    if (!targetRaw) return [];
    const targetFlow = getUnitFlowMapForRecipe(targetRaw, targetRow.tagSelections, allItems);

    const otherInfos = [];
    const claimedColTargets = new Set();
    for (const r of state.rows) {
        if (r.id === rowId) continue;
        const raw = getRecipeByKeyOrChoice(r.recipeKey, data);
        if (!raw) continue;
        if (isUniqueResourceAutoTarget(r.autoTarget)) {
            claimedColTargets.add(r.autoTarget);
        }
        otherInfos.push({
            row: r,
            raw,
            flowMap: getUnitFlowMapForRecipe(raw, r.tagSelections, allItems)
        });
    }
    if (otherInfos.length === 0) return [];

    // 1. Check if an existing Auto component with dof === 0 (currently pinned by THIS Manual row)
    //    ALREADY constrains this row -> allow rejoining as bidirectional 'root'.
    const { components } = analyzeAutoNetwork(data, { mutateInvalid: false });
    const zeroDofRowIds = new Set();
    for (const c of components) {
        if (c.eqs.length >= c.members.length) {
            c.memberIds.forEach(id => zeroDofRowIds.add(id));
        }
    }
    const alreadyConstrainedByAuto = otherInfos.some(o => {
        if (!o.row.autoTarget || !zeroDofRowIds.has(o.row.id)) return false;
        if (o.row.autoTarget === `row:${rowId}`) return true;
        if (isUniqueResourceAutoTarget(o.row.autoTarget)) {
            const tb = findAnyRateBucket(targetFlow, o.row.autoTarget);
            const ob = tb ? o.flowMap.get(o.row.autoTarget)?.get(tb.bucketKey) : null;
            return Boolean(tb && ob && tb.avg * ob.avg < -1e-24);
        }
        return false;
    });

    if (alreadyConstrainedByAuto) {
        return [{ autoTarget: 'root', label: 'Join linked Auto chain', isRootJoin: true, unbalanced: false }];
    }

    const candidates = [];
    const seen = new Set();

    // 2. Critter row-sync candidate (same critter, egg/drop <-> diet)
    const srcItem = allItems[targetRaw.source];
    if (srcItem && srcItem._type === 'critter') {
        const isDiet = (targetRaw.consumed || []).length > 0;
        const partner = otherInfos.find(o => {
            if (o.raw.source !== targetRaw.source) return false;
            const oIsDiet = (o.raw.consumed || []).length > 0;
            return oIsDiet !== isDiet;
        });
        if (partner) {
            const at = `row:${partner.row.id}`;
            seen.add(at);
            candidates.push({
                autoTarget: at,
                label: `Sync count with ${srcItem.name}`,
                isRowSync: true,
                unbalanced: Math.abs(targetRow.multiplier - partner.row.multiplier) > 1e-5
            });
        }
    }

    // 3. Shared opposite-sign resource rate candidates (unclaimed by another Auto row)
    targetFlow.forEach((bMap, colKey) => {
        if (colKey.startsWith('choicein:') || colKey.startsWith('choiceout:')) return;
        if (claimedColTargets.has(colKey) || seen.has(colKey)) return;
        for (const [bucketKey, tb] of bMap.entries()) {
            if (tb.basis !== 'rate' || Math.abs(tb.avg) <= 1e-12) continue;
            const hasPartner = otherInfos.some(o => {
                const ob = o.flowMap.get(colKey)?.get(bucketKey);
                return ob && (ob.avg * tb.avg < -1e-24);
            });
            if (!hasPartner) continue;

            // Compute current net to prioritize unbalanced resources
            let net = tb.avg * targetRow.multiplier;
            otherInfos.forEach(o => {
                const ob = o.flowMap.get(colKey)?.get(bucketKey);
                if (ob) net += ob.avg * o.row.multiplier;
            });
            const isTag = colKey.startsWith('tag:');
            const id = colKey.slice(colKey.indexOf(':') + 1);
            const name = isTag ? `#${allTags[id]?.name || prettifyId(id)}` : (allItems[id]?.name || prettifyId(id));
            seen.add(colKey);
            candidates.push({
                autoTarget: colKey,
                label: name,
                unbalanced: Math.abs(net) > 1e-7
            });
            break;
        }
    });

    candidates.sort((a, b) => Number(b.unbalanced) - Number(a.unbalanced) || a.label.localeCompare(b.label));
    return candidates;
}

/**
 * Toggles Auto mode ON or OFF for any row.
 * When turning ON with multiple possible link targets, returns `{ needsChoice: true, candidates }`.
 */
export function toggleRowAuto(rowId, data, chosenAutoTarget = null) {
    ensureLoaded();
    const row = state.rows.find(r => r.id === rowId);
    if (!row) return { enabled: false };

    if (row.autoTarget) {
        row.lastAutoTarget = row.autoTarget;
        row.autoTarget = null;
        row.manualPinned = true;
        recomputeAutoMultipliers(data);
        persistState();
        notifyUpdated();
        return { enabled: false };
    }

    const candidates = findAutoLinkCandidatesForRow(rowId, data);
    if (candidates.length === 0) {
        return { enabled: false, noCandidates: true };
    }

    let picked = null;
    if (chosenAutoTarget) {
        picked = candidates.find(c => c.autoTarget === chosenAutoTarget) || null;
    } else if (row.lastAutoTarget) {
        picked = candidates.find(c => c.autoTarget === row.lastAutoTarget) || null;
    }
    if (!picked) {
        if (candidates.length === 1) {
            picked = candidates[0];
        } else {
            return { enabled: false, needsChoice: true, candidates };
        }
    }

    // Snapshot current multipliers & autoTargets so enabling Auto on a closed zero-gain loop
    // cleanly reverts instead of breaking the chain!
    const snapshot = state.rows.map(r => ({
        id: r.id,
        multiplier: r.multiplier,
        autoTarget: r.autoTarget,
        manualPinned: r.manualPinned,
        lastAutoTarget: r.lastAutoTarget,
        driverSeq: r.driverSeq
    }));

    row.manualPinned = false;
    row.autoTarget = picked.autoTarget;
    if (picked.autoTarget === 'root') {
        row.driverSeq = ++driverSeqCounter;
    }
    const solveRes = recomputeAutoMultipliersDetailed(data);
    if (solveRes.hadSingularLoop) {
        snapshot.forEach(s => {
            const target = state.rows.find(r => r.id === s.id);
            if (target) {
                target.multiplier = s.multiplier;
                target.autoTarget = s.autoTarget;
                target.manualPinned = s.manualPinned;
                target.lastAutoTarget = s.lastAutoTarget;
                target.driverSeq = s.driverSeq;
            }
        });
        persistState();
        notifyUpdated();
        return { enabled: false, singularLoop: true };
    }
    persistState();
    notifyUpdated();
    return { enabled: true, autoTarget: picked.autoTarget, label: picked.label };
}

/**
 * Checks whether the table already contains any feeding/diet recipe (concrete or choice) for `critterId`.
 */
export function hasCritterDietInTable(critterId, data, rows = null) {
    if (!critterId || !data) return false;
    const list = rows || getCalculatorState().rows;
    const choiceKey = `choice:diet:${critterId}`;
    return list.some(row => {
        if (row.recipeKey === choiceKey) return true;
        const raw = data.recipesByKey?.get(row.recipeKey);
        if (!raw || raw.source !== critterId || !(raw.consumed || []).length) return false;
        if (
            critterId === 'gulp_fish' &&
            raw.consumed.length === 1 &&
            raw.consumed[0].element === 'polluted_water'
        ) {
            return false;
        }
        return true;
    });
}

/**
 * Automatically attaches a critter's diet synced to the critter's count:
 * - Single-diet critter -> attaches exact diet recipe & queues its concrete inputs for upstream expansion.
 * - Multi-diet critter -> immediately attaches `choice:diet:<critterId>` (orange range + inline selector, no +Feed button!).
 */
function tryAutoAttachCritterDiet(critterRow, rawRecipe, data, addedNames, visitedCols) {
    const allItems = data.allItems || {};
    const srcItem = allItems[rawRecipe.source];
    if (!srcItem || srcItem._type !== 'critter') return [];
    if ((rawRecipe.consumed || []).length > 0) return [];
    if (hasCritterDietInTable(rawRecipe.source, data, state.rows)) return [];

    const diets = getCritterDietRecipes(rawRecipe.source, data);
    if (diets.length === 0) return [];

    if (diets.length === 1) {
        const diet = diets[0];
        const dietRes = addCalculatorRecipe(diet._key, {}, 0, { autoTarget: `row:${critterRow.id}` });
        if (!dietRes.merged) {
            addedNames.push(`${srcItem.name} (diet)`);
        }
        return (diet.consumed || [])
            .map(getEntryColKey)
            .filter(ck => ck && !ck.startsWith('tag:') && !ck.startsWith('choicein:') && !visitedCols.has(ck));
    }

    // Multi-diet critter -> immediately attach virtual choice diet row!
    const choiceKey = `choice:diet:${rawRecipe.source}`;
    const dietRes = addCalculatorRecipe(choiceKey, {}, 0, { autoTarget: `row:${critterRow.id}` });
    if (!dietRes.merged) {
        addedNames.push(`${srcItem.name} (diet)`);
    }
    return [];
}

/**
 * Promotes a lone unpinned Manual consumer/parent row to Auto ('root') when its first Auto child attaches,
 * turning the whole chain into a bidirectional Auto network automatically.
 */
function promoteStarterRowToRoot(colKey, addedRowId, data) {
    const allItems = data.allItems || {};
    if (colKey.startsWith('row:')) {
        const parentId = colKey.slice(4);
        const parent = state.rows.find(r => r.id === parentId);
        if (parent && !parent.autoTarget && !parent.manualPinned) {
            parent.autoTarget = 'root';
            parent.driverSeq = ++driverSeqCounter;
        }
        return;
    }

    const addedRow = state.rows.find(r => r.id === addedRowId);
    if (!addedRow) return;
    const addedRaw = getRecipeByKeyOrChoice(addedRow.recipeKey, data);
    if (!addedRaw) return;
    const addedFlow = getUnitFlowMapForRecipe(addedRaw, addedRow.tagSelections, allItems);
    const tb = findAnyRateBucket(addedFlow, colKey);
    if (!tb) return;

    const matchingManual = [];
    for (const r of state.rows) {
        if (r.id === addedRowId || r.autoTarget) continue;
        const raw = getRecipeByKeyOrChoice(r.recipeKey, data);
        if (!raw) continue;
        const fm = getUnitFlowMapForRecipe(raw, r.tagSelections, allItems);
        const ob = fm.get(colKey)?.get(tb.bucketKey);
        if (ob && ob.avg * tb.avg < -1e-24) {
            matchingManual.push(r);
        }
    }

    // Promote ONLY when there is a single unpinned Manual row driving this resource
    if (matchingManual.length === 1 && !matchingManual[0].manualPinned) {
        matchingManual[0].autoTarget = 'root';
        matchingManual[0].driverSeq = ++driverSeqCounter;
    }
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
        const isRepackage = rawRecipe.source === 'rehydrator';
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
            isRepackage,
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

    // Sort: already-in-table first, then primary (fabricator/plant/critter/duplicant), then geyser, then phase-change/repackage
    const rankOf = (p) => {
        if (p.alreadyInTable) return 0;
        if (p.isPhaseChange || p.isRepackage) return 3;
        if (p.isGeyser) return 2;
        return 1;
    };
    producers.sort((a, b) => {
        const ra = rankOf(a);
        const rb = rankOf(b);
        if (ra !== rb) return ra - rb;
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
 * Returns the single unambiguous producer for a concrete element column, OR a single-source
 * Choice Producer when all non-phase, non-geyser recipes belong to the same building/critter
 * (e.g. Egg Cracker for Raw Egg, Microbe Musher for Berry Sludge, Kiln for Refined Carbon).
 */
export function getUnambiguousProducer(colKey, targetBucketKey, data) {
    if (!colKey || colKey.startsWith('tag:') || colKey.startsWith('choicein:') || colKey.startsWith('choiceout:')) {
        return null;
    }
    const info = findProducersForColumn(colKey, targetBucketKey, 1, data);
    const nonPhase = info.producers.filter(p => !p.isPhaseChange && !p.isRepackage);
    if (nonPhase.length === 0) return null;
    if (nonPhase.some(p => p.isGeyser)) return null;

    if (nonPhase.length === 1) {
        return nonPhase[0];
    }

    // All non-phase producers come from ONE single building/critter -> synthesize Choice Producer!
    const sources = new Set(nonPhase.map(p => p.rawRecipe.source));
    if (sources.size === 1) {
        const sourceId = nonPhase[0].rawRecipe.source;
        const elId = colKey.slice(3);
        const choiceKey = `choice:prod:${sourceId}:${elId}`;
        const choiceRecipe = getRecipeByKeyOrChoice(choiceKey, data);
        if (choiceRecipe) {
            const existingRow = state.rows.find(r => r.id === choiceKey) || null;
            return {
                rawRecipe: choiceRecipe,
                tagSelections: {},
                rowId: choiceKey,
                existingRow,
                alreadyInTable: Boolean(existingRow),
                sourceItem: (data.allItems || {})[sourceId] || null,
                isPhaseChange: false,
                isGeyser: false,
                isChoiceProducer: true
            };
        }
    }
    return null;
}

/**
 * Infers tagSelections for a newly added recipe by matching any unselected consumed tag slot
 * against concrete elements currently in POSITIVE surplus in the table.
 * Safety guards:
 * - Auto-selects ONLY when exactly 1 member of the tag currently has a positive surplus in the matching unit bucket.
 * - Never auto-selects an element that the newly added recipe itself produces (avoids self-loops).
 * - Skips `#edible` on critter recipes so critters never silently hijack surplus human food (e.g. Barbeque).
 */
export function inferTagSelectionsFromSurplus(rawRecipe, existingTagSelections, data) {
    ensureLoaded();
    const base = normalizeTagSelections(existingTagSelections);
    if (!rawRecipe || !data || state.rows.length === 0) {
        return { tagSelections: base, autoPickedNames: [] };
    }
    const allItems = data.allItems || {};
    const srcItem = allItems[rawRecipe.source];
    const isCritter = Boolean(srcItem && srcItem._type === 'critter');

    const producedElIds = new Set(
        (rawRecipe.produced || [])
            .map(p => p.element)
            .filter(Boolean)
    );

    // Compute current table net flow per (colKey, bucketKey)
    const netByColBucket = new Map();
    const maxMagByColBucket = new Map();
    for (const row of state.rows) {
        const raw = getRecipeByKeyOrChoice(row.recipeKey, data);
        if (!raw) continue;
        const fm = getUnitFlowMapForRecipe(raw, row.tagSelections, allItems);
        fm.forEach((bMap, colKey) => {
            if (!colKey.startsWith('el:')) return;
            bMap.forEach((b, bk) => {
                const k = `${colKey}||${bk}`;
                const contrib = b.avg * row.multiplier;
                netByColBucket.set(k, (netByColBucket.get(k) || 0) + contrib);
                maxMagByColBucket.set(k, Math.max(maxMagByColBucket.get(k) || 0, Math.abs(contrib)));
            });
        });
    }

    const merged = { ...base };
    const autoPickedNames = [];
    const seenTags = new Set();

    for (const entry of (rawRecipe.consumed || [])) {
        if (!entry.tag || seenTags.has(entry.tag) || merged[entry.tag]) continue;
        seenTags.add(entry.tag);
        if (isCritter && entry.tag === 'edible') continue;

        const members = getTagMembers(entry.tag);
        const surplusMatches = [];
        for (const m of members) {
            if (producedElIds.has(m.id)) continue;
            const probe = { ...entry, element: m.id };
            delete probe.tag;
            const flow = normalizeFlowEntry(probe, rawRecipe, -1, 1, allItems);
            const k = `el:${m.id}||${flow.bucketKey}`;
            const net = netByColBucket.get(k) || 0;
            const maxMag = maxMagByColBucket.get(k) || 0;
            if (net > Math.max(1e-7, maxMag * 1e-5)) {
                surplusMatches.push(m);
            }
        }

        if (surplusMatches.length === 1) {
            merged[entry.tag] = surplusMatches[0].id;
            autoPickedNames.push(surplusMatches[0].name);
        }
    }

    return { tagSelections: normalizeTagSelections(merged), autoPickedNames };
}

/**
 * Recursively adds unambiguous & single-source upstream producers ONLY along the consumed inputs
 * of newly added rows, and immediately attaches critter diets (concrete or choice row).
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
            if (!def || def.isTag || def.isChoice) continue;
            if (visitedCols.has(colKey) || autoTargetsInTable.has(colKey)) continue;

            const unique = getUnambiguousProducer(colKey, def.bucketKey, data);
            if (!unique) continue;

            // Avoid hijacking a row that is already auto-balancing another column
            if (unique.existingRow && unique.existingRow.autoTarget && unique.existingRow.autoTarget !== colKey) {
                continue;
            }

            visitedCols.add(colKey);
            const inferred = unique.existingRow
                ? { tagSelections: unique.tagSelections, autoPickedNames: [] }
                : inferTagSelectionsFromSurplus(unique.rawRecipe, unique.tagSelections, data);
            const res = addCalculatorRecipe(unique.rawRecipe._key, inferred.tagSelections, 0, { autoTarget: colKey });
            if (!res.merged) {
                const nm = allItems[unique.rawRecipe.source]?.name || prettifyId(unique.rawRecipe.source);
                addedNames.push(inferred.autoPickedNames.length > 0 ? `${nm} (${inferred.autoPickedNames.join(', ')})` : nm);
            }

            const resolved = applyTagSelections(unique.rawRecipe, inferred.tagSelections, allItems);
            (resolved.consumed || []).forEach(c => {
                const ck = getEntryColKey(c);
                if (ck && !ck.startsWith('tag:') && !ck.startsWith('choicein:') && !visitedCols.has(ck)) {
                    nextFrontier.push(ck);
                }
            });

            const dietCols = tryAutoAttachCritterDiet(res.row, unique.rawRecipe, data, addedNames, visitedCols);
            nextFrontier.push(...dietCols);
        }

        frontier = Array.from(new Set(nextFrontier));
    }

    recomputeAutoMultipliers(data);
    return addedNames;
}

/**
 * Adds (or links as Auto) the chosen producer to cover `colKey`, promotes lone unpinned root to Auto,
 * then auto-expands all unambiguous & single-source upstream links + critter diets.
 */
export function resolveDeficitWithProducer(colKey, producer, data, { autoExpand = true } = {}) {
    ensureLoaded();
    if (!producer || !producer.rawRecipe) return { addedNames: [], updatedNames: [], loopFallback: false };
    const allItems = data.allItems || {};
    const srcName = allItems[producer.rawRecipe.source]?.name || prettifyId(producer.rawRecipe.source);

    // Estimate the standalone multiplier needed to cover the current deficit (used if a closed loop forces Manual)
    const fallbackMult = roundMultiplier(
        producer.additionalMult > 0
            ? producer.additionalMult
            : (producer.neededMult > 0 ? producer.neededMult : 1)
    );

    const inferred = producer.alreadyInTable
        ? { tagSelections: producer.tagSelections, autoPickedNames: [] }
        : inferTagSelectionsFromSurplus(producer.rawRecipe, producer.tagSelections, data);

    const res = addCalculatorRecipe(producer.rawRecipe._key, inferred.tagSelections, fallbackMult, { autoTarget: colKey });
    promoteStarterRowToRoot(colKey, res.row.id, data);

    const displayAdded = inferred.autoPickedNames.length > 0
        ? `${srcName} (${inferred.autoPickedNames.join(', ')})`
        : srcName;
    const addedNames = res.merged ? [] : [displayAdded];
    const updatedNames = res.merged ? [srcName] : [];

    // Test-solve right away to detect closed zero-gain or net-loss loops (e.g. Electrolyzer + Water Sieve + Shower)
    let loopFallback = false;
    const initialSolve = recomputeAutoMultipliersDetailed(data);
    const addedRef = state.rows.find(r => r.id === res.row.id);

    if (
        initialSolve.unlockedLoopRowIds.includes(res.row.id) ||
        (!res.merged && fallbackMult > 1e-6 && addedRef && addedRef.multiplier < 1e-9)
    ) {
        loopFallback = true;
        if (addedRef) {
            addedRef.lastAutoTarget = colKey;
            addedRef.autoTarget = null;
            addedRef.manualPinned = true;
            addedRef.multiplier = fallbackMult;
        }
        recomputeAutoMultipliersDetailed(data);
    }

    const visited = new Set([colKey]);
    if (autoExpand && !loopFallback) {
        const resolved = applyTagSelections(producer.rawRecipe, inferred.tagSelections, allItems);
        const seedCols = (resolved.consumed || [])
            .map(getEntryColKey)
            .filter(ck => ck && !ck.startsWith('tag:') && !ck.startsWith('choicein:'));
        const dietCols = tryAutoAttachCritterDiet(res.row, producer.rawRecipe, data, addedNames, visited);
        seedCols.push(...dietCols);
        const extra = expandUnambiguousDeficits(data, seedCols, visited, 8);
        addedNames.push(...extra);
    }

    persistState();
    notifyUpdated();
    return { addedNames, updatedNames, loopFallback, loopMult: fallbackMult, loopRowName: srcName };
}

/**
 * Resolves (or switches) a Choice Row or multi-variant row IN-PLACE to a specific recipe + tagSelections,
 * preserving row position, `autoTarget`, and child `row:` sync links, then auto-expands upstream.
 */
export function resolveChoiceRow(rowId, { recipeKey, tagSelections = {} }, data, { autoExpand = true } = {}) {
    ensureLoaded();
    const idx = state.rows.findIndex(r => r.id === rowId);
    if (idx === -1 || !recipeKey) return { addedNames: [], merged: false };

    const row = state.rows[idx];
    const allItems = data.allItems || {};
    const targetRaw = getRecipeByKeyOrChoice(recipeKey, data);
    // Preserve any existing tagSelections for common tags still used by the new recipe (e.g. #Grain on Berry Sludge)
    const targetTags = new Set(
        ((targetRaw?.consumed || []).concat(targetRaw?.produced || []))
            .map(e => e.tag)
            .filter(Boolean)
    );
    const mergedTagSelections = {};
    Object.entries(row.tagSelections || {}).forEach(([k, v]) => {
        if (targetTags.has(k)) mergedTagSelections[k] = v;
    });
    Object.entries(tagSelections || {}).forEach(([k, v]) => {
        if (v) mergedTagSelections[k] = v;
    });
    const normTags = normalizeTagSelections(mergedTagSelections);
    const nextId = makeRowId(recipeKey, normTags);

    let merged = false;
    let activeRow = row;

    if (nextId !== row.id) {
        const duplicate = state.rows.find(r => r.id === nextId);
        if (duplicate) {
            duplicate.multiplier = roundMultiplier(duplicate.multiplier + row.multiplier);
            if (!duplicate.autoTarget && row.autoTarget) duplicate.autoTarget = row.autoTarget;
            state.rows.forEach(r => {
                if (r.autoTarget === `row:${rowId}`) r.autoTarget = `row:${duplicate.id}`;
            });
            state.rows.splice(idx, 1);
            activeRow = duplicate;
            merged = true;
        } else {
            row.id = nextId;
            row.recipeKey = recipeKey;
            row.tagSelections = normTags;
            state.rows.forEach(r => {
                if (r.autoTarget === `row:${rowId}`) r.autoTarget = `row:${nextId}`;
            });
        }
    }

    recomputeAutoMultipliers(data);

    let addedNames = [];
    if (autoExpand && activeRow.autoTarget && !isChoiceRecipeKey(activeRow.recipeKey)) {
        const raw = getRecipeByKeyOrChoice(activeRow.recipeKey, data);
        if (raw) {
            const resolved = applyTagSelections(raw, activeRow.tagSelections, allItems);
            const seedCols = (resolved.consumed || [])
                .map(getEntryColKey)
                .filter(ck => ck && !ck.startsWith('tag:') && !ck.startsWith('choicein:'));
            if (seedCols.length > 0) {
                addedNames = expandUnambiguousDeficits(data, seedCols, new Set(), 8);
            }
        }
    }

    persistState();
    notifyUpdated();
    return { rowId: activeRow.id, addedNames, merged };
}

/**
 * Attaches a chosen diet recipe to a critter row, syncing its multiplier to the critter count,
 * and auto-expanding any unambiguous upstream producers for its consumed materials.
 */
export function attachCritterDiet(critterRowId, dietRecipe, data, { autoExpand = true } = {}) {
    ensureLoaded();
    if (!critterRowId || !dietRecipe) return { addedNames: [], updatedNames: [] };
    const allItems = data.allItems || {};
    const srcName = allItems[dietRecipe.source]?.name || prettifyId(dietRecipe.source);

    const res = addCalculatorRecipe(dietRecipe._key, {}, 0, { autoTarget: `row:${critterRowId}` });
    promoteStarterRowToRoot(`row:${critterRowId}`, res.row.id, data);
    const addedNames = res.merged ? [] : [`${srcName} (diet)`];
    const updatedNames = res.merged ? [`${srcName} (diet)`] : [];

    const visited = new Set();
    if (autoExpand) {
        const seedCols = (dietRecipe.consumed || [])
            .map(getEntryColKey)
            .filter(ck => ck && !ck.startsWith('tag:') && !ck.startsWith('choicein:'));
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
            const raw = getRecipeByKeyOrChoice(r.recipeKey, data);
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

/**
 * Auto-expands unambiguous upstream producers for a concrete element (e.g. after picking a specific
 * item in an inline tag dropdown on an Auto-balanced row).
 */
export function expandUnambiguousForElement(itemId, data) {
    ensureLoaded();
    if (!itemId || !data) return [];
    const visited = new Set();
    const addedNames = expandUnambiguousDeficits(data, [`el:${itemId}`], visited, 8);
    if (addedNames.length > 0) {
        persistState();
        notifyUpdated();
    }
    return addedNames;
}
