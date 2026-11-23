export const DATA_VERSION = '8';

export const FALLBACK_IMG_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='8' fill='%23333'/><text x='32' y='34' fill='%23ccc' font-size='28' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>?</text></svg>";

let configData = null;
let recipesData = null;
let allItems = null;
let allTags = null;
let tagToItems = null;
let recipesByKey = null;
let loadPromise = null;

export function attachImgFallback(img) {
    img.onerror = () => {
        if (img.src !== FALLBACK_IMG_SVG) {
            img.src = FALLBACK_IMG_SVG;
        }
    };
    return img;
}

export function prettifyId(id) {
    return String(id || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase());
}

export function getRecipeKey(recipe) {
    if (!recipe) return '';
    if (recipe._key) return recipe._key;
    const c = (recipe.consumed || [])
        .map(x => (x.tag ? `t:${x.tag}` : `e:${x.element}`))
        .join(',');
    const p = (recipe.produced || [])
        .map(x => (x.tag ? `t:${x.tag}` : `e:${x.element}`))
        .join(',');
    const temp = recipe.temp !== undefined ? `|T:${recipe.temp}` : '';
    return `${recipe.source}|${c}>${p}${temp}`;
}

export async function loadData() {
    if (allItems) {
        return getData();
    }
    if (loadPromise) {
        return loadPromise;
    }

    loadPromise = (async () => {
        try {
            const vq = `?v=${DATA_VERSION}`;
            const configRes = await fetch(`/data/config.json${vq}`);
            configData = await configRes.json();

            const hasTagInConfig = configData.some(c => c.id === 'tag');
            const fetchPromises = configData.map(category =>
                fetch(`/data/${category.file}${vq}`).then(res => res.json())
            );
            const tagsPromise = hasTagInConfig
                ? Promise.resolve(null)
                : fetch(`/data/tags.json${vq}`).then(res => (res.ok ? res.json() : [])).catch(() => []);

            const [results, standaloneTags] = await Promise.all([
                Promise.all(fetchPromises),
                tagsPromise
            ]);

            allItems = {};
            allTags = {};
            tagToItems = {};
            recipesData = [];
            recipesByKey = new Map();

            if (Array.isArray(standaloneTags)) {
                standaloneTags.forEach(tag => {
                    allTags[tag.id] = tag;
                    tagToItems[tag.id] = [];
                });
            }

            configData.forEach((category, index) => {
                const dataArray = results[index];
                if (category.id === 'recipe') {
                    recipesData = dataArray || [];
                } else if (category.id === 'tag') {
                    (dataArray || []).forEach(tag => {
                        allTags[tag.id] = tag;
                        tagToItems[tag.id] = [];
                    });
                } else {
                    (dataArray || []).forEach(item => {
                        item._type = category.id;
                        allItems[item.id] = item;
                    });
                }
            });

            // Build live tag -> items index directly from each item's `tags` array.
            Object.values(allItems).forEach(item => {
                if (item.is_disabled === true || item.is_hidden === true) return;
                (item.tags || []).forEach(tagId => {
                    if (!allTags[tagId]) {
                        allTags[tagId] = {
                            id: tagId,
                            name: prettifyId(tagId),
                            image: item.image || ''
                        };
                    }
                    if (!tagToItems[tagId]) {
                        tagToItems[tagId] = [];
                    }
                    tagToItems[tagId].push(item);
                });
            });

            Object.keys(tagToItems).forEach(tagId => {
                tagToItems[tagId].sort((a, b) => a.name.localeCompare(b.name));
            });

            // Assign deterministic content-based keys to all recipes
            const keyCounts = new Map();
            recipesData.forEach(r => {
                const baseKey = getRecipeKey(r);
                const count = keyCounts.get(baseKey) || 0;
                keyCounts.set(baseKey, count + 1);
                const uniqueKey = count === 0 ? baseKey : `${baseKey}#${count}`;
                r._key = uniqueKey;
                recipesByKey.set(uniqueKey, r);
            });
        } catch (error) {
            console.error('Failed to load data:', error);
            loadPromise = null;
        }
        return getData();
    })();

    return loadPromise;
}

export function getData() {
    return {
        configData,
        recipesData,
        allItems,
        allTags,
        tagToItems,
        recipesByKey
    };
}

export function getTagMembers(tagId) {
    return (tagToItems && tagToItems[tagId]) || [];
}

export function entryMatchesItem(entry, item) {
    if (!entry || !item) return false;
    if (entry.element === item.id) return true;
    if (entry.tag && Array.isArray(item.tags) && item.tags.includes(entry.tag)) return true;
    return false;
}

export function recipeHasTag(recipe) {
    return (recipe.consumed || []).some(c => Boolean(c.tag)) ||
        (recipe.produced || []).some(p => Boolean(p.tag));
}

export function getRecipeConcreteItemIds(recipe) {
    const ids = new Set();
    if (recipe.source && allItems && allItems[recipe.source]) ids.add(recipe.source);
    const collect = (list) => {
        (list || []).forEach(entry => {
            if (entry.element && allItems && allItems[entry.element]) {
                ids.add(entry.element);
            } else if (entry.tag) {
                getTagMembers(entry.tag).forEach(m => ids.add(m.id));
            }
        });
    };
    collect(recipe.consumed);
    collect(recipe.produced);
    return ids;
}

export function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export function getMatchLevel(q, t) {
    q = String(q || '').toLowerCase();
    t = String(t || '').toLowerCase();
    if (!q || !t) return Infinity;
    if (q === t) return 1;
    if (t.includes(q)) return 2;
    if (q.length >= 3) {
        let maxDist = q.length <= 5 ? 1 : 2;
        if (levenshtein(q, t) <= maxDist) return 3;
        let tWords = t.split(/\s+/);
        for (let word of tWords) {
            if (word.length >= 3 && levenshtein(q, word) <= maxDist) return 3;
        }
    }
    return Infinity;
}

export function evaluateQuery(q) {
    let scores = {};
    let directMatch = {};
    let tagDirectMatch = {};

    Object.values(allTags || {}).forEach(tag => {
        tagDirectMatch[tag.id] = getMatchLevel(q, tag.name);
    });

    Object.values(allItems || {}).forEach(item => {
        let lvl = getMatchLevel(q, item.name);
        (item.tags || []).forEach(tid => {
            const tlvl = tagDirectMatch[tid];
            if (tlvl !== undefined && tlvl + 1 < lvl) {
                lvl = tlvl + 1;
            }
        });
        directMatch[item.id] = lvl;
        scores[item.id] = lvl;
    });

    (recipesData || []).forEach(recipe => {
        let bestLvl = Infinity;
        const itemIds = getRecipeConcreteItemIds(recipe);

        itemIds.forEach(id => {
            if (directMatch[id] < bestLvl) bestLvl = directMatch[id];
        });

        (recipe.consumed || []).concat(recipe.produced || []).forEach(entry => {
            if (entry.tag && tagDirectMatch[entry.tag] < bestLvl) {
                bestLvl = tagDirectMatch[entry.tag];
            }
        });

        if (bestLvl <= 3) {
            let rLvl = bestLvl + 3;
            if (recipe.source && allItems[recipe.source] && rLvl < scores[recipe.source]) {
                scores[recipe.source] = rLvl;
            }
            (recipe.consumed || []).concat(recipe.produced || []).forEach(entry => {
                if (entry.element && allItems[entry.element] && rLvl < scores[entry.element]) {
                    scores[entry.element] = rLvl;
                } else if (entry.tag) {
                    getTagMembers(entry.tag).forEach(m => {
                        if (rLvl < scores[m.id]) scores[m.id] = rLvl;
                    });
                }
            });
        }
    });

    return scores;
}

export function getEntryMassInGrams(entry, itemsMap = allItems) {
    if (!entry) return null;
    if (entry.unit === 'g') return entry.amount;
    if (entry.unit === 'kg') return entry.amount * 1000;
    if (entry.unit === 'kcal' && entry.element) {
        const el = itemsMap ? itemsMap[entry.element] : null;
        if (el && el.kcalPerKg > 0) {
            return (entry.amount / el.kcalPerKg) * 1000;
        }
    }
    return null;
}

export function resolveRecipeEntries(recipe, itemsMap = allItems) {
    const consumed = (recipe.consumed || []).map(c => ({ ...c }));
    const firstConsumedMassG = consumed.length > 0 ? getEntryMassInGrams(consumed[0], itemsMap) : null;

    const produced = (recipe.produced || []).map(p => {
        if (p.amountRatioFromConsumed !== undefined) {
            const baseUnit = p._baseUnit || (p.unit && p.unit !== '% mass' ? p.unit : 'g');
            const basePer = p._basePer !== undefined ? p._basePer : p.per;
            if (firstConsumedMassG !== null) {
                return {
                    ...p,
                    _baseUnit: baseUnit,
                    _basePer: basePer,
                    amount: firstConsumedMassG * p.amountRatioFromConsumed,
                    unit: baseUnit,
                    per: basePer || consumed[0].per
                };
            }
            return {
                ...p,
                _baseUnit: baseUnit,
                _basePer: basePer,
                amount: p.amountRatioFromConsumed * 100,
                unit: '% mass',
                per: undefined
            };
        }
        return { ...p };
    });

    return {
        ...recipe,
        consumed,
        produced
    };
}

export function applyTagSelections(rawRecipe, tagSelections = {}, itemsMap = allItems) {
    const mapEntry = (entry) => {
        if (entry.tag && tagSelections && tagSelections[entry.tag]) {
            const chosenId = tagSelections[entry.tag];
            const copy = { ...entry, element: chosenId, _fromTag: entry.tag };
            delete copy.tag;
            return copy;
        }
        return { ...entry };
    };

    return resolveRecipeEntries({
        ...rawRecipe,
        consumed: (rawRecipe.consumed || []).map(mapEntry),
        produced: (rawRecipe.produced || []).map(mapEntry)
    }, itemsMap);
}

export function materializeRecipeForItem(recipe, contextItem) {
    if (!contextItem || recipe.source === contextItem.id) {
        return resolveRecipeEntries(recipe);
    }

    const mapEntry = (entry) => {
        if (entry.tag && Array.isArray(contextItem.tags) && contextItem.tags.includes(entry.tag)) {
            const copy = { ...entry, element: contextItem.id, _fromTag: entry.tag };
            delete copy.tag;
            return copy;
        }
        return { ...entry };
    };

    return resolveRecipeEntries({
        ...recipe,
        consumed: (recipe.consumed || []).map(mapEntry),
        produced: (recipe.produced || []).map(mapEntry)
    });
}

export function expandGroupedRecipe(recipe, maxCombinations = 150) {
    const slots = [];
    (recipe.consumed || []).forEach((c, idx) => {
        if (c.tag) slots.push({ side: 'consumed', idx, tagId: c.tag, members: getTagMembers(c.tag) });
    });
    (recipe.produced || []).forEach((p, idx) => {
        if (p.tag) slots.push({ side: 'produced', idx, tagId: p.tag, members: getTagMembers(p.tag) });
    });

    if (slots.length === 0) return [resolveRecipeEntries(recipe)];

    let totalCombos = 1;
    for (const s of slots) {
        totalCombos *= Math.max(s.members.length, 1);
    }

    const results = [];
    const expandSlot = (slotIdx, currentRecipe) => {
        if (results.length >= maxCombinations) return;
        if (slotIdx >= slots.length) {
            results.push(resolveRecipeEntries(currentRecipe));
            return;
        }
        const slot = slots[slotIdx];
        const members = slot.members;
        if (members.length === 0) {
            expandSlot(slotIdx + 1, currentRecipe);
            return;
        }
        for (const member of members) {
            if (results.length >= maxCombinations) break;
            const next = {
                ...currentRecipe,
                consumed: currentRecipe.consumed.map(x => ({ ...x })),
                produced: currentRecipe.produced.map(x => ({ ...x }))
            };
            const target = next[slot.side][slot.idx];
            delete target.tag;
            target.element = member.id;
            target._fromTag = slot.tagId;
            expandSlot(slotIdx + 1, next);
        }
    };

    expandSlot(0, {
        ...recipe,
        consumed: (recipe.consumed || []).map(x => ({ ...x })),
        produced: (recipe.produced || []).map(x => ({ ...x }))
    });

    return { items: results, totalCount: totalCombos, truncated: totalCombos > results.length };
}

export function getExpandedRecipeCount(recipe) {
    let total = 1;
    (recipe.consumed || []).concat(recipe.produced || []).forEach(entry => {
        if (entry.tag) {
            total *= Math.max(getTagMembers(entry.tag).length, 1);
        }
    });
    return total;
}

export function formatAmountNumber(num) {
    if (num === 0 || Object.is(num, -0)) return '0';
    let absNum = Math.abs(num);
    if (absNum < 0.01) {
        return Number(Number(num).toPrecision(2)).toString();
    }
    return (Math.round((num + Math.sign(num) * Number.EPSILON) * 100) / 100).toString();
}

export function formatAmount(itemData, isProducedFlag) {
    const hasRange = itemData.amountMin !== undefined && itemData.amountMax !== undefined;
    let amount = itemData.amount;
    let amountMin = hasRange ? itemData.amountMin : null;
    let amountMax = hasRange ? itemData.amountMax : null;
    let unit = itemData.unit || '';
    let per = itemData.per;

    const scaleValues = (factor) => {
        amount = amount * factor;
        if (hasRange) {
            amountMin = amountMin * factor;
            amountMax = amountMax * factor;
        }
    };

    if (window.unitSettings) {
        const concreteEl = itemData.element && allItems ? allItems[itemData.element] : null;

        if (concreteEl && concreteEl.kcalPerKg > 0) {
            if (window.unitSettings.food === 'kcal' && unit === 'g') {
                scaleValues(concreteEl.kcalPerKg / 1000);
                unit = 'kcal';
            } else if (window.unitSettings.food === 'mass' && unit === 'kcal') {
                scaleValues(1000 / concreteEl.kcalPerKg);
                unit = 'g';
            }
        }

        if (window.unitSettings.mass === 'kg' && unit === 'g') {
            scaleValues(1 / 1000);
            unit = 'kg';
        } else if (window.unitSettings.mass === 'kg' && unit === 'g of stored Nectar') {
            scaleValues(1 / 1000);
            unit = 'kg of stored Nectar';
        }

        if (window.unitSettings.time === 'cycle' && per === 's') {
            scaleValues(600);
            per = 'cycle';
        }
    }

    let sign = isProducedFlag ? '+' : '-';
    let amountText;
    if (hasRange) {
        amountText = `${sign}${formatAmountNumber(amountMin)}–${formatAmountNumber(amountMax)}`;
    } else {
        let numStr = formatAmountNumber(amount);
        amountText = amount > 0 ? sign + numStr : (amount < 0 ? numStr : '0');
    }

    let unitText = unit ? `${unit.includes('%') ? '' : ' '}${unit}` : '';
    if (per) {
        if (unit.includes(' ') || per.includes(' ')) {
            unitText += ` per ${per}`;
        } else {
            unitText += `/${per}`;
        }
    }
    return `${amountText}${unitText}`;
}

export function formatTemperature(tempC) {
    let displayTemp = tempC;
    let unit = '°C';
    if (window.unitSettings && window.unitSettings.temp === 'F') {
        displayTemp = (displayTemp * 9 / 5) + 32;
        unit = '°F';
    }
    return `${(Math.round(displayTemp * 10) / 10).toString()} ${unit}`;
}
