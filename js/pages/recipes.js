import { createElement } from '../utils.js?v=3';

const DATA_VERSION = '4';

let configData = null;
let recipesData = null;
let allItems = null;
let allTags = null;
let tagToItems = null;

const FALLBACK_IMG_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='8' fill='%23333'/><text x='32' y='34' fill='%23ccc' font-size='28' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>?</text></svg>";

function attachImgFallback(img) {
    img.onerror = () => {
        if (img.src !== FALLBACK_IMG_SVG) {
            img.src = FALLBACK_IMG_SVG;
        }
    };
    return img;
}

function prettifyId(id) {
    return String(id || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase());
}

async function loadData() {
    if (!allItems) {
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
            // Adding a new object with `"tags": ["filter"]` automatically populates
            // every recipe referencing `"tag": "filter"` with zero changes to recipes.json.
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

        } catch (error) {
            console.error("Failed to load data:", error);
        }
    }
}

function getTagMembers(tagId) {
    return tagToItems[tagId] || [];
}

function entryMatchesItem(entry, item) {
    if (!entry || !item) return false;
    if (entry.element === item.id) return true;
    if (entry.tag && Array.isArray(item.tags) && item.tags.includes(entry.tag)) return true;
    return false;
}

function recipeHasTag(recipe) {
    return (recipe.consumed || []).some(c => Boolean(c.tag)) ||
        (recipe.produced || []).some(p => Boolean(p.tag));
}

function getRecipeConcreteItemIds(recipe) {
    const ids = new Set();
    if (recipe.source && allItems[recipe.source]) ids.add(recipe.source);
    const collect = (list) => {
        (list || []).forEach(entry => {
            if (entry.element && allItems[entry.element]) {
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

function levenshtein(a, b) {
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

function getMatchLevel(q, t) {
    q = q.toLowerCase();
    t = t.toLowerCase();
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

function evaluateQuery(q) {
    let scores = {};
    let directMatch = {};
    let tagDirectMatch = {};

    Object.values(allTags).forEach(tag => {
        tagDirectMatch[tag.id] = getMatchLevel(q, tag.name);
    });

    Object.values(allItems).forEach(item => {
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

    recipesData.forEach(recipe => {
        let bestLvl = Infinity;
        const itemIds = getRecipeConcreteItemIds(recipe);

        itemIds.forEach(id => {
            if (directMatch[id] < bestLvl) bestLvl = directMatch[id];
        });

        // Check direct match on any tag referenced by the recipe
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

// Compute mass in grams of a concrete consumed entry (used for amountRatioFromConsumed)
function getEntryMassInGrams(entry) {
    if (!entry) return null;
    if (entry.unit === 'g') return entry.amount;
    if (entry.unit === 'kg') return entry.amount * 1000;
    if (entry.unit === 'kcal' && entry.element) {
        const el = allItems[entry.element];
        if (el && el.kcalPerKg > 0) {
            return (entry.amount / el.kcalPerKg) * 1000;
        }
    }
    return null;
}

// Resolve dynamic amount fields (e.g. amountRatioFromConsumed) given current consumed entries
function resolveRecipeEntries(recipe) {
    const consumed = (recipe.consumed || []).map(c => ({ ...c }));
    const firstConsumedMassG = consumed.length > 0 ? getEntryMassInGrams(consumed[0]) : null;

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

// When viewing a specific item (e.g. Sand or Barbeque), materialize matching tag slots to that item
function materializeRecipeForItem(recipe, contextItem) {
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

// Expand 1 tag-grouped JSON recipe into concrete recipes
function expandGroupedRecipe(recipe, maxCombinations = 150) {
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

function getExpandedRecipeCount(recipe) {
    let total = 1;
    (recipe.consumed || []).concat(recipe.produced || []).forEach(entry => {
        if (entry.tag) {
            total *= Math.max(getTagMembers(entry.tag).length, 1);
        }
    });
    return total;
}

function formatAmountNumber(num) {
    if (num === 0) return '0';
    let absNum = Math.abs(num);
    if (absNum < 0.01) {
        return Number(Number(num).toPrecision(2)).toString();
    }
    return (Math.round((num + Math.sign(num) * Number.EPSILON) * 100) / 100).toString();
}

function formatAmount(itemData, isProducedFlag) {
    let amount = itemData.amount;
    let unit = itemData.unit || '';
    let per = itemData.per;

    if (window.unitSettings) {
        const concreteEl = itemData.element ? allItems[itemData.element] : null;

        // Food unit conversion: g <-> kcal (only for concrete food items with kcalPerKg)
        if (concreteEl && concreteEl.kcalPerKg > 0) {
            if (window.unitSettings.food === 'kcal' && unit === 'g') {
                amount = (amount / 1000) * concreteEl.kcalPerKg;
                unit = 'kcal';
            } else if (window.unitSettings.food === 'mass' && unit === 'kcal') {
                amount = (amount / concreteEl.kcalPerKg) * 1000;
                unit = 'g';
            }
        }

        // Mass: g -> kg
        if (window.unitSettings.mass === 'kg' && unit === 'g') {
            amount = amount / 1000;
            unit = 'kg';
        } else if (window.unitSettings.mass === 'kg' && unit === 'g of stored Nectar') {
            amount = amount / 1000;
            unit = 'kg of stored Nectar';
        }

        // Time: s -> cycle
        if (window.unitSettings.time === 'cycle' && per === 's') {
            amount = amount * 600;
            per = 'cycle';
        }
    }

    let numStr = formatAmountNumber(amount);
    let sign = isProducedFlag ? '+' : '-';
    let amountText = amount > 0 ? sign + numStr : (amount < 0 ? numStr : '0');

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

function formatTemperature(tempC) {
    let displayTemp = tempC;
    let unit = '°C';
    if (window.unitSettings && window.unitSettings.temp === 'F') {
        displayTemp = (displayTemp * 9 / 5) + 32;
        unit = '°F';
    }
    return `${(Math.round(displayTemp * 10) / 10).toString()} ${unit}`;
}

export async function renderRecipes(container, currentPath) {
    await loadData();

    container.textContent = '';

    const filterBtnsContainer = createElement('div', { id: 'recipe-filters', class: 'recipe-filters' });

    const allBtn = createElement('button', {
        class: 'filter-btn active',
        dataset: { filter: 'all' },
        'aria-pressed': 'true',
        textContent: 'All'
    });
    filterBtnsContainer.appendChild(allBtn);

    if (configData) {
        configData.forEach(category => {
            if (category.isFilter) {
                const btn = createElement('button', {
                    class: 'filter-btn',
                    dataset: { filter: category.id },
                    'aria-pressed': 'false',
                    textContent: category.label
                });
                filterBtnsContainer.appendChild(btn);
            }
        });
    }

    const searchInput = createElement('input', {
        type: 'search',
        id: 'recipe-search',
        'aria-label': 'Search materials, buildings, tags, or recipes',
        placeholder: 'Search materials, buildings, tags, or recipes...',
        class: 'recipe-search-input'
    });

    const resultsContainer = createElement('div', { id: 'recipe-results', class: 'recipe-results', textContent: 'Loading...' });

    const layout = createElement('div', { class: 'container recipes-container' }, [
        createElement('h2', { textContent: 'Recipes Database' }),
        searchInput,
        filterBtnsContainer,
        resultsContainer
    ]);

    container.appendChild(layout);

    const filterBtns = filterBtnsContainer.querySelectorAll('.filter-btn');
    let currentFilter = 'all';

    function renderResults(query = '') {
        resultsContainer.textContent = '';
        const q = query.trim();

        let matchedItems = [];

        if (q.length === 0) {
            matchedItems = Object.values(allItems).filter(item => {
                return currentFilter === 'all' || item._type === currentFilter;
            });
            matchedItems.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            let finalScores = {};
            let fullQueryScores = evaluateQuery(q);

            Object.keys(allItems).forEach(id => {
                if (fullQueryScores[id] <= 6) {
                    finalScores[id] = fullQueryScores[id];
                }
            });

            let words = q.split(/\s+/);
            if (words.length > 1) {
                words.forEach((word, wordIndex) => {
                    let wordScores = evaluateQuery(word);
                    Object.keys(allItems).forEach(id => {
                        let wordScore = wordScores[id];
                        if (wordScore <= 6) {
                            let adjustedScore = 6 + (wordScore - 1) * words.length + wordIndex + 1;
                            if (!finalScores[id] || adjustedScore < finalScores[id]) {
                                finalScores[id] = adjustedScore;
                            }
                        }
                    });
                });
            }

            matchedItems = Object.values(allItems).filter(item => {
                if (currentFilter !== 'all' && item._type !== currentFilter) return false;
                return finalScores[item.id] !== undefined;
            });

            matchedItems.sort((a, b) => {
                let scoreA = finalScores[a.id];
                let scoreB = finalScores[b.id];
                if (scoreA !== scoreB) {
                    return scoreA - scoreB;
                }
                return a.name.localeCompare(b.name);
            });
        }

        matchedItems = matchedItems.filter(item => {
            return item._type !== 'special' && item.is_disabled !== true && item.is_hidden !== true;
        });

        if (matchedItems.length === 0) {
            const noResultsTitle = createElement('p', { class: 'no-results-title' }, ['No results found']);
            if (q) {
                noResultsTitle.appendChild(document.createTextNode(' for "'));
                noResultsTitle.appendChild(createElement('strong', { textContent: q }));
                noResultsTitle.appendChild(document.createTextNode('"'));
            }

            const clearBtn = createElement('button', { class: 'clear-search-btn', textContent: 'Clear Search & Filters' });

            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                currentFilter = 'all';
                filterBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                const allBtnNode = Array.from(filterBtns).find(b => b.dataset.filter === 'all');
                if (allBtnNode) {
                    allBtnNode.classList.add('active');
                    allBtnNode.setAttribute('aria-pressed', 'true');
                }
                renderResults('');
            });

            const noResults = createElement('div', { class: 'no-results' }, [
                createElement('div', { class: 'no-results-icon' }),
                createElement('div', { class: 'no-results-text-group' }, [
                    noResultsTitle,
                    createElement('p', { class: 'no-results-subtitle', textContent: 'Try adjusting your search term or using a different filter.' })
                ]),
                clearBtn
            ]);

            resultsContainer.appendChild(noResults);
            return;
        }

        const frag = document.createDocumentFragment();
        matchedItems.forEach(item => {
            const img = attachImgFallback(createElement('img', {
                src: `/images/${item.image}`,
                alt: item.name,
                loading: 'lazy',
                class: 'recipe-card-img'
            }));

            const card = createElement('div', { class: 'recipe-card', role: 'button', tabindex: '0' }, [
                img,
                createElement('h3', { class: 'recipe-card-title', textContent: item.name }),
                createElement('span', { class: 'recipe-card-type', textContent: item._type })
            ]);

            card.addEventListener('click', () => showDetailModal(item));
            card.addEventListener('keydown', (e) => {
                if (e.code === 'Enter' || e.code === 'Space') {
                    e.preventDefault();
                    showDetailModal(item);
                }
            });

            frag.appendChild(card);
        });
        resultsContainer.appendChild(frag);
    }

    searchInput.addEventListener('input', (e) => renderResults(e.target.value));

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            e.target.classList.add('active');
            e.target.setAttribute('aria-pressed', 'true');
            currentFilter = e.target.dataset.filter;
            renderResults(searchInput.value);
        });
    });

    renderResults();

    // Deep links: #/recipes/<item_id> OR #/recipes/tag/<tag_id>
    const handlePath = (path) => {
        const pathParts = path.split('/').filter(Boolean);
        // pathParts[0] === 'recipes'
        if (pathParts.length >= 3 && pathParts[1] === 'tag') {
            const tagId = pathParts[2];
            const tag = allTags[tagId];
            if (tag) {
                showTagModal(tag);
            } else {
                closeModal();
            }
        } else if (pathParts.length >= 2) {
            const id = pathParts[1];
            const item = allItems[id];
            if (item) {
                showDetailModal(item);
            } else {
                closeModal();
            }
        } else {
            closeModal();
        }
    };

    handlePath(currentPath);

    const onRouteUpdate = (e) => {
        if (e.detail.path.startsWith('/recipes')) {
            handlePath(e.detail.path);
        }
    };
    window.addEventListener('routeupdate', onRouteUpdate);

    const onSettingsUpdate = () => {
        renderResults(searchInput.value || '');
        const dialog = document.getElementById('detail-dialog');
        if (dialog && dialog.open) {
            const currentHashPath = window.location.hash.slice(1) || '/recipes';
            handlePath(currentHashPath);
        }
    };
    window.addEventListener('settingsupdated', onSettingsUpdate);

    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
        window.removeEventListener('settingsupdated', onSettingsUpdate);

        const dialog = document.getElementById('detail-dialog');
        if (dialog) {
            if (dialog.open) dialog.close();
            dialog.remove();
        }
    };
}

function getOrCreateDetailDialog() {
    let dialog = document.getElementById('detail-dialog');
    if (!dialog) {
        dialog = createElement('dialog', { id: 'detail-dialog', class: 'detail-dialog-content' });

        dialog.addEventListener('click', (e) => {
            const rect = dialog.getBoundingClientRect();
            const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
                && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
            if (!isInDialog) {
                closeModal();
            }
        });

        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            closeModal();
        });

        document.body.appendChild(dialog);
    }
    dialog.textContent = '';
    return dialog;
}

function createModalHeaderButtons() {
    return createElement('div', { class: 'button-group' }, [
        createElement('button', {
            class: 'nav-btn',
            'aria-label': 'Settings',
            onclick: () => document.getElementById('settings-dialog').showModal()
        }, [
            createElement('svg', {
                class: 'icon',
                xmlns: 'http://www.w3.org/2000/svg',
                viewBox: '0 0 640 640'
            }, [
                createElement('path', {
                    fill: 'currentColor',
                    d: 'M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z'
                })
            ])
        ]),
        createElement('button', {
            class: 'nav-btn',
            'aria-label': 'Close modal',
            onclick: () => window.closeModal()
        }, [
            createElement('svg', {
                class: 'icon',
                xmlns: 'http://www.w3.org/2000/svg',
                viewBox: '0 0 384 512'
            }, [
                createElement('path', {
                    fill: 'currentColor',
                    d: 'M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z'
                })
            ])
        ])
    ]);
}

function createArrow() {
    return createElement('div', { class: 'recipe-arrow' });
}

function renderTagMosaic(tagId) {
    const members = getTagMembers(tagId);
    const preview = members.slice(0, 4);
    if (preview.length >= 2) {
        return createElement(
            'div',
            { class: `recipe-tag-mosaic count-${preview.length}` },
            preview.map(m => attachImgFallback(createElement('img', {
                src: `/images/${m.image}`,
                alt: m.name,
                title: m.name,
                class: 'recipe-tag-mosaic-img'
            })))
        );
    }
    const tag = allTags[tagId];
    const imgSrc = preview[0]?.image || tag?.image;
    if (imgSrc) {
        return attachImgFallback(createElement('img', {
            src: `/images/${imgSrc}`,
            alt: tag?.name || tagId,
            class: 'recipe-item-img'
        }));
    }
    return createElement('div', { class: 'recipe-item-placeholder' });
}

function renderRecipeItem(data, isProducedFlag, onTagToggle) {
    const amountStr = formatAmount(data, isProducedFlag);
    const amountClass = isProducedFlag ? 'amount-positive' : 'amount-negative';

    // Tag slot (grouped ingredient/product)
    if (data.tag) {
        const tag = allTags[data.tag] || { id: data.tag, name: prettifyId(data.tag) };
        const members = getTagMembers(data.tag);
        const wrapper = createElement('div', { class: 'recipe-tag-slot-wrapper' });

        const slotBtn = createElement('button', {
            type: 'button',
            class: 'recipe-item-link recipe-tag-slot',
            title: `Click to expand ${tag.name} (${members.length} items)`
        }, [
            renderTagMosaic(data.tag),
            createElement('span', { class: 'recipe-item-name recipe-tag-name' }, [
                tag.name,
                createElement('span', { class: 'recipe-tag-count', textContent: String(members.length) })
            ]),
            createElement('span', { class: `recipe-item-amount ${amountClass}`, textContent: amountStr })
        ]);

        if (onTagToggle) {
            slotBtn.addEventListener('click', onTagToggle);
        } else {
            slotBtn.addEventListener('click', () => {
                window.location.hash = `#/recipes/tag/${data.tag}`;
            });
        }

        const tagLink = createElement('a', {
            href: `#/recipes/tag/${data.tag}`,
            class: 'recipe-tag-open-link',
            title: `View all ${tag.name} items`,
            textContent: `#${tag.name}`
        });

        wrapper.appendChild(slotBtn);
        wrapper.appendChild(tagLink);
        return wrapper;
    }

    // Concrete item slot
    const el = allItems[data.element];
    if (el) {
        const link = createElement('a', { href: `#/recipes/${el.id}`, class: 'recipe-item-link' }, [
            attachImgFallback(createElement('img', { src: `/images/${el.image}`, class: 'recipe-item-img', title: el.name, alt: el.name })),
            createElement('span', { class: 'recipe-item-name muted', textContent: el.name }),
            createElement('span', { class: `recipe-item-amount ${amountClass}`, textContent: amountStr })
        ]);

        // If materialized from a tag on an item's modal, show subtle "via #Tag (+N)" badge
        if (data._fromTag && !data._inExpandedRow) {
            const tag = allTags[data._fromTag];
            const memberCount = getTagMembers(data._fromTag).length;
            if (tag && memberCount > 1) {
                return createElement('div', { class: 'recipe-materialized-wrapper' }, [
                    link,
                    createElement('a', {
                        href: `#/recipes/tag/${tag.id}`,
                        class: 'recipe-via-tag-pill',
                        title: `Part of "${tag.name}" group (${memberCount} items)`,
                        textContent: `${tag.name} (+${memberCount - 1})`
                    })
                ]);
            }
        }

        return link;
    }

    return createElement('div', { class: 'recipe-item-link no-hover' }, [
        createElement('div', { class: 'recipe-item-placeholder' }),
        createElement('span', { class: 'recipe-item-name muted', textContent: data.element || 'Unknown' }),
        createElement('span', { class: `recipe-item-amount ${amountClass}`, textContent: amountStr })
    ]);
}

function renderRecipeRowLayout(r, onTagToggle) {
    const layoutChildren = [];

    // Left: Consumed
    if (r.consumed && r.consumed.length > 0) {
        const consumedItems = r.consumed.map(c => renderRecipeItem(c, false, onTagToggle));
        layoutChildren.push(createElement('div', { class: 'recipe-items-block' }, consumedItems));
    }

    // Center: Source
    if (r.source !== 'emit') {
        if (r.consumed && r.consumed.length > 0) {
            layoutChildren.push(createArrow());
        }

        const src = allItems[r.source];
        let sourceLink;
        if (r.source === 'heat' || r.source === 'cool') {
            let tempText = 'Phase Change';
            const rawTemp = r.temp !== undefined ? r.temp : r.temperature;
            if (rawTemp !== undefined) {
                tempText = formatTemperature(rawTemp);
            }
            sourceLink = createElement('div', { class: 'recipe-item-link no-hover' }, [
                src
                    ? attachImgFallback(createElement('img', { src: `/images/${src.image}`, class: 'recipe-item-img', title: src.name, alt: src.name }))
                    : createElement('div', { class: 'recipe-item-placeholder' }),
                createElement('span', { class: 'recipe-item-name', textContent: tempText })
            ]);
        } else if (src) {
            sourceLink = createElement('a', { href: `#/recipes/${src.id}`, class: 'recipe-item-link' }, [
                attachImgFallback(createElement('img', { src: `/images/${src.image}`, class: 'recipe-item-img', title: src.name, alt: src.name })),
                createElement('span', { class: 'recipe-item-name', textContent: src.name })
            ]);
        } else {
            sourceLink = createElement('div', { class: 'recipe-item-link no-hover' }, [
                createElement('div', { class: 'recipe-item-placeholder' }),
                createElement('span', { class: 'recipe-item-name', textContent: r.source })
            ]);
        }

        layoutChildren.push(createElement('div', { class: 'recipe-source-block' }, [sourceLink]));
    }

    // Right: Produced
    if (r.produced && r.produced.length > 0) {
        if ((r.consumed && r.consumed.length > 0) || r.source !== 'emit') {
            layoutChildren.push(createArrow());
        }
        const producedItems = r.produced.map(p => renderRecipeItem(p, true, onTagToggle));
        layoutChildren.push(createElement('div', { class: 'recipe-items-block' }, producedItems));
    }

    return createElement('div', { class: 'recipe-layout' }, layoutChildren);
}

function renderRecipeCard(rawRecipe, contextItem = null) {
    const r = materializeRecipeForItem(rawRecipe, contextItem);
    const hasTag = recipeHasTag(r);

    if (!hasTag) {
        return createElement('div', { class: 'recipe-container' }, [
            renderRecipeRowLayout(r, null)
        ]);
    }

    // Tag-grouped recipe card: 1 JSON recipe that expands in-place into the full group of concrete recipes
    const expandedCount = getExpandedRecipeCount(r);
    let isExpanded = false;
    let drawerBuilt = false;

    const container = createElement('div', { class: 'recipe-container recipe-group-container' });
    const drawer = createElement('div', { class: 'recipe-group-drawer hidden' });

    const toggleBtn = createElement('button', {
        type: 'button',
        class: 'recipe-group-toggle',
        'aria-expanded': 'false',
        textContent: `Show ${expandedCount} grouped recipes ▾`
    });

    const buildDrawer = () => {
        if (drawerBuilt) return;
        drawerBuilt = true;

        const { items: concreteRecipes, totalCount, truncated } = expandGroupedRecipe(r, 150);
        const listEl = createElement('div', { class: 'recipe-group-expanded-list' });

        const renderExpandedList = (filterText = '') => {
            listEl.textContent = '';
            const q = filterText.trim().toLowerCase();
            const filtered = q
                ? concreteRecipes.filter(cr => {
                    const allNames = (cr.consumed || []).concat(cr.produced || [])
                        .map(x => allItems[x.element]?.name || x.element || '')
                        .join(' ')
                        .toLowerCase();
                    return allNames.includes(q);
                })
                : concreteRecipes;

            if (filtered.length === 0) {
                listEl.appendChild(createElement('p', { class: 'muted recipe-group-empty', textContent: 'No matching variants.' }));
                return;
            }

            const frag = document.createDocumentFragment();
            filtered.forEach(cr => {
                const tagged = {
                    ...cr,
                    consumed: cr.consumed.map(x => ({ ...x, _inExpandedRow: true })),
                    produced: cr.produced.map(x => ({ ...x, _inExpandedRow: true }))
                };
                const row = createElement('div', { class: 'recipe-group-subrow' }, [
                    renderRecipeRowLayout(tagged, null)
                ]);
                frag.appendChild(row);
            });
            listEl.appendChild(frag);
        };

        if (concreteRecipes.length > 8) {
            const filterInput = createElement('input', {
                type: 'search',
                class: 'recipe-search-input recipe-group-filter',
                placeholder: `Filter ${concreteRecipes.length} variants...`
            });
            filterInput.addEventListener('input', (e) => renderExpandedList(e.target.value));
            drawer.appendChild(filterInput);
        }

        renderExpandedList('');
        drawer.appendChild(listEl);

        if (truncated) {
            drawer.appendChild(createElement('p', {
                class: 'muted recipe-group-note',
                textContent: `Showing first ${concreteRecipes.length} of ${totalCount} combinations.`
            }));
        }
    };

    const toggleExpand = () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            buildDrawer();
            drawer.classList.remove('hidden');
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.textContent = `Hide ${expandedCount} grouped recipes ▴`;
            container.classList.add('is-expanded');
        } else {
            drawer.classList.add('hidden');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.textContent = `Show ${expandedCount} grouped recipes ▾`;
            container.classList.remove('is-expanded');
        }
    };

    toggleBtn.addEventListener('click', toggleExpand);

    container.appendChild(renderRecipeRowLayout(r, toggleExpand));
    container.appendChild(toggleBtn);
    container.appendChild(drawer);

    return container;
}

function renderRecipeCategory(title, recipes, contextItem = null) {
    if (recipes.length === 0) return null;

    const list = createElement(
        'div',
        { class: 'recipe-category-list' },
        recipes.map(r => renderRecipeCard(r, contextItem))
    );

    return createElement('div', { class: 'recipe-category-card' }, [
        createElement('h3', { class: 'recipe-category-title', textContent: `${title} (${recipes.length})` }),
        list
    ]);
}

function showDetailModal(item) {
    if (window.location.hash !== '#/recipes/' + item.id) {
        window.location.hash = '#/recipes/' + item.id;
    }

    const dialog = getOrCreateDetailDialog();
    const container = createElement('div', { class: 'detail-container' });
    dialog.appendChild(container);

    const header = createElement('div', { class: 'detail-header' }, [
        createElement('div', { class: 'detail-title-group' }, [
            attachImgFallback(createElement('img', { src: `/images/${item.image}`, alt: item.name, class: 'recipe-card-img' })),
            createElement('div', {}, [
                createElement('h2', { textContent: item.name }),
                createElement('span', { class: 'recipe-card-type', textContent: item._type })
            ])
        ]),
        createModalHeaderButtons()
    ]);

    container.appendChild(header);

    if (item.description) {
        const iEl = createElement('i', { textContent: item.description });
        container.appendChild(createElement('p', {}, [iEl]));
    }

    const contentWrapper = createElement('div', { class: 'detail-properties' });

    const addProp = (label, value) => {
        const p = createElement('p');
        p.appendChild(createElement('strong', { textContent: label + ': ' }));
        p.appendChild(document.createTextNode(value));
        contentWrapper.appendChild(p);
    };

    if (item.type) addProp('Type', item.type);
    if (item.category && item.category !== 'unknown' && item.category !== item._type) addProp('Category', item.category);
    if (item.kcalPerKg) addProp('Calories', `${item.kcalPerKg} kcal/kg`);
    if (item.power_consumption) addProp('Power Consumption', `${item.power_consumption} W`);
    if (item.power_generation) addProp('Power Generation', `${item.power_generation} W`);
    if (item.freezing_point !== undefined) addProp('Freezing Point', `${formatTemperature(item.freezing_point)} (Forms: ${item.freezing_product || '?'})`);
    if (item.melting_point !== undefined) addProp('Melting Point', `${formatTemperature(item.melting_point)} (Forms: ${item.melting_product || '?'})`);
    if (item.boiling_point !== undefined) addProp('Boiling Point', `${formatTemperature(item.boiling_point)} (Forms: ${item.boiling_product || '?'})`);

    // Render clickable tag chips on the item
    if (Array.isArray(item.tags) && item.tags.length > 0) {
        const chips = item.tags.map(tid => {
            const tag = allTags[tid] || { id: tid, name: prettifyId(tid) };
            const count = getTagMembers(tid).length;
            return createElement('a', {
                href: `#/recipes/tag/${tid}`,
                class: 'detail-tag-chip',
                textContent: `${tag.name} (${count})`
            });
        });
        const tagRow = createElement('div', { class: 'detail-tags-row' }, [
            createElement('strong', { textContent: 'Tags: ' }),
            createElement('div', { class: 'detail-tags-list' }, chips)
        ]);
        contentWrapper.appendChild(tagRow);
    }

    // Find all related recipes (direct element match OR via any of the item's tags!)
    const allRelatedRecipes = recipesData.filter(r =>
        r.source === item.id ||
        (r.consumed || []).some(c => entryMatchesItem(c, item)) ||
        (r.produced || []).some(p => entryMatchesItem(p, item))
    );

    const stateTransitions = [];
    const emissions = [];
    const sourceRecipes = [];
    const produced = [];
    const consumed = [];

    allRelatedRecipes.forEach(r => {
        if (r.source === 'heat' || r.source === 'cool') {
            stateTransitions.push(r);
        } else if (r.source === 'emit') {
            emissions.push(r);
        } else if (r.source === item.id) {
            sourceRecipes.push(r);
        } else {
            const isProd = (r.produced || []).some(p => entryMatchesItem(p, item));
            const isCons = (r.consumed || []).some(c => entryMatchesItem(c, item));
            if (isProd) produced.push(r);
            if (isCons) consumed.push(r);
        }
    });

    container.appendChild(contentWrapper);

    const categoriesContainer = createElement('div', { class: 'recipe-categories-container' }, [
        renderRecipeCategory('Processes & Recipes', sourceRecipes, item),
        renderRecipeCategory('State Transitions', stateTransitions, item),
        renderRecipeCategory('Emission', emissions, item),
        renderRecipeCategory('Produced By', produced, item),
        renderRecipeCategory('Consumed By', consumed, item)
    ]);

    container.appendChild(categoriesContainer);

    if (allRelatedRecipes.length === 0) {
        container.appendChild(createElement('p', { class: 'muted', textContent: 'No known recipes.' }));
    }

    if (!dialog.open) {
        dialog.showModal();
    }
}

function showTagModal(tag) {
    if (window.location.hash !== '#/recipes/tag/' + tag.id) {
        window.location.hash = '#/recipes/tag/' + tag.id;
    }

    const dialog = getOrCreateDetailDialog();
    const container = createElement('div', { class: 'detail-container' });
    dialog.appendChild(container);

    const members = getTagMembers(tag.id);

    const header = createElement('div', { class: 'detail-header' }, [
        createElement('div', { class: 'detail-title-group' }, [
            renderTagMosaic(tag.id),
            createElement('div', {}, [
                createElement('h2', { textContent: tag.name }),
                createElement('span', { class: 'recipe-card-type', textContent: `Tag · ${members.length} items` })
            ])
        ]),
        createModalHeaderButtons()
    ]);

    container.appendChild(header);

    // Members grid
    if (members.length > 0) {
        const membersList = createElement('div', { class: 'tag-members-grid' }, members.map(m =>
            createElement('a', { href: `#/recipes/${m.id}`, class: 'tag-member-pill' }, [
                attachImgFallback(createElement('img', { src: `/images/${m.image}`, alt: m.name, class: 'tag-member-img' })),
                createElement('span', { textContent: m.name })
            ])
        ));

        container.appendChild(createElement('div', { class: 'recipe-category-card' }, [
            createElement('h3', { class: 'recipe-category-title', textContent: `Items with tag "${tag.name}" (${members.length})` }),
            membersList
        ]));
    }

    // Recipes referencing this tag
    const producedByTag = recipesData.filter(r => (r.produced || []).some(p => p.tag === tag.id));
    const consumedByTag = recipesData.filter(r => (r.consumed || []).some(c => c.tag === tag.id));

    const categoriesContainer = createElement('div', { class: 'recipe-categories-container' }, [
        renderRecipeCategory('Recipes Producing This Tag', producedByTag, null),
        renderRecipeCategory('Recipes Consuming This Tag', consumedByTag, null)
    ]);

    container.appendChild(categoriesContainer);

    if (!dialog.open) {
        dialog.showModal();
    }
}

function closeModal() {
    if (window.location.hash !== '#/recipes') {
        window.location.hash = '#/recipes';
    }

    const dialog = document.getElementById('detail-dialog');
    if (dialog && dialog.open) {
        dialog.close();
    }
}
window.closeModal = closeModal;
