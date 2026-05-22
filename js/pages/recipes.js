import { createElement } from '../utils.js';

let configData = null;
let recipesData = null;
let allItems = null;

async function loadData() {
    if (!allItems) {
        try {
            const configRes = await fetch('/data/config.json');
            configData = await configRes.json();

            const fetchPromises = configData.map(category => fetch(`/data/${category.file}`).then(res => res.json()));
            const results = await Promise.all(fetchPromises);

            allItems = {};

            configData.forEach((category, index) => {
                const dataArray = results[index];
                if (category.id === 'recipe') {
                    recipesData = dataArray;
                } else {
                    dataArray.forEach(item => {
                        item._type = category.id;
                        allItems[item.id] = item;
                    });
                }
            });

        } catch (error) {
            console.error("Failed to load data:", error);
        }
    }
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
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
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
    Object.values(allItems).forEach(item => {
        let lvl = getMatchLevel(q, item.name);
        directMatch[item.id] = lvl;
        scores[item.id] = lvl;
    });

    recipesData.forEach(recipe => {
        let bestLvl = Infinity;
        let itemsInRecipe = [];
        if (recipe.source && allItems[recipe.source]) itemsInRecipe.push(recipe.source);
        (recipe.consumed || []).forEach(c => { if(allItems[c.element]) itemsInRecipe.push(c.element); });
        (recipe.produced || []).forEach(p => { if(allItems[p.element]) itemsInRecipe.push(p.element); });

        itemsInRecipe.forEach(id => {
            if (directMatch[id] < bestLvl) bestLvl = directMatch[id];
        });

        if (bestLvl <= 3) {
            let rLvl = bestLvl + 3;
            itemsInRecipe.forEach(id => {
                if (rLvl < scores[id]) scores[id] = rLvl;
            });
        }
    });

    return scores;
}

export async function renderRecipes(container, currentPath) {
    await loadData();

    container.textContent = ''; // Clear container

    const filterBtnsContainer = createElement('div', { id: 'recipe-filters', class: 'recipe-filters' });

    // Add "All" button
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
        'aria-label': 'Search materials, buildings, or recipes',
        placeholder: 'Search materials, buildings, or recipes...',
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
            return item._type !== 'special';
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

        matchedItems.forEach(item => {
            const img = createElement('img', {
                src: `/images/${item.image}`,
                alt: item.name,
                class: 'recipe-card-img'
            });
            img.onerror = () => {
                img.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%23333'/><text x='32' y='32' fill='white' text-anchor='middle' dominant-baseline='middle'>?</text></svg>";
            };

            const card = createElement('div', { class: 'recipe-card', role: 'button', tabindex: '0' }, [
                img,
                createElement('h3', { class: 'recipe-card-title', textContent: item.name }),
                createElement('span', { class: 'recipe-card-type', textContent: item._type })
            ]);

            card.addEventListener('click', () => {
                showDetailModal(item);
            });
            card.addEventListener('keydown', (e) => {
                if (e.code === 'Enter' || e.code === 'Space') {
                    e.preventDefault();
                    showDetailModal(item);
                }
            });

            resultsContainer.appendChild(card);
        });
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

    // Check if deep linked (e.g., /recipes/water)
    const handlePath = (path) => {
        const pathParts = path.split('/');
        if (pathParts.length > 2 && pathParts[2]) {
            const id = pathParts[2];
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
        renderResults(document.querySelector('.recipe-filters-container input')?.value || '');
        const dialog = document.getElementById('detail-dialog');
        if (dialog && dialog.open) {
            const currentItem = allItems[window.location.hash.split('/')[2]];
            if (currentItem) showDetailModal(currentItem);
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

function showDetailModal(item) {
    if (window.location.hash !== '#/recipes/' + item.id) {
        window.location.hash = '#/recipes/' + item.id;
    }

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

    dialog.textContent = ''; // clear

    const container = createElement('div', { class: 'detail-container' });

    dialog.appendChild(container);

    const header = createElement('div', { class: 'detail-header' }, [
        createElement('div', { class: 'detail-title-group' }, [
            createElement('img', { src: `/images/${item.image}`, alt: item.name, class: 'recipe-card-img' }),
            createElement('div', {}, [
                createElement('h2', { textContent: item.name }),
                createElement('span', { class: 'recipe-card-type', textContent: item._type })
            ])
        ]),
        createElement('button', {
            class: 'detail-close-btn',
            'aria-label': 'Close modal',
            textContent: '×',
            onclick: () => window.closeModal()
        })
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
    if (item.power_consumption) addProp('Power', item.power_consumption + ' W');
    if (item.freezing_point !== undefined) addProp('Freezing Point', `${item.freezing_point}°C (Forms: ${item.freezing_product || '?'})`);
    if (item.melting_point !== undefined) addProp('Melting Point', `${item.melting_point}°C (Forms: ${item.melting_product || '?'})`);
    if (item.boiling_point !== undefined) addProp('Boiling Point', `${item.boiling_point}°C (Forms: ${item.boiling_product || '?'})`);

    // Find related recipes
    let allRelatedRecipes = recipesData.filter(r =>
        r.source === item.id ||
        (r.consumed || []).some(c => c.element === item.id) ||
        (r.produced || []).some(p => p.element === item.id)
    );

    let stateTransitions = [];
    let emissions = [];
    let produced = [];
    let consumed = [];

    const isProduced = (r) => (r.produced || []).some(p => p.element === item.id);
    const isConsumed = (r) => (r.consumed || []).some(c => c.element === item.id);

    allRelatedRecipes.forEach(r => {
        if (r.source === 'heat' || r.source === 'cool') {
            stateTransitions.push(r);
        } else if (r.source === 'emit') {
            emissions.push(r);
        } else if (isProduced(r)) {
            produced.push(r);
        } else if (isConsumed(r) || r.source === item.id) {
            consumed.push(r);
        }
    });

    const formatAmountNumber = (num) => {
        if (num === 0) return '0';
        let absNum = Math.abs(num);
        if (absNum < 0.01) {
            return Number(Number(num).toPrecision(2)).toString();
        }
        return (Math.round((num + Math.sign(num) * Number.EPSILON) * 100) / 100).toString();
    };

        const formatAmount = (itemData, isProducedFlag) => {
        let amount = itemData.amount;
        let unit = itemData.unit;
        let per = itemData.per;

        // Apply settings transformations
        if (window.unitSettings) {
            // Mass: g -> kg
            if (window.unitSettings.mass === 'kg' && unit === 'g') {
                amount = amount / 1000;
                unit = 'kg';
            }

            // Food: Mass -> kcal
            if (window.unitSettings.food === 'kcal' && itemData.unit === 'g' && itemData.element && allItems[itemData.element] && allItems[itemData.element].kcalPerKg) {
                const item = allItems[itemData.element];
                // the raw amount is in g
                const amountInKg = itemData.amount / 1000;
                amount = amountInKg * item.kcalPerKg;
                unit = 'kcal';
            }

            // Time: s -> cycle
            if (window.unitSettings.time === 'cycle' && per === 's') {
                amount = amount * 600;
                per = 'cycle';
            }
        }

        let amountText = '';
        let numStr = formatAmountNumber(amount);
        let sign = isProducedFlag ? '+' : '-';
        if (amount > 0) amountText = sign + numStr;
        else if (amount < 0) amountText = isProducedFlag ? numStr : numStr;
        else amountText = '0';

        let unitText = `${unit.includes('%') ? '' : ' '}${unit}`;
        if (per) {
            if (unit.includes(' ') || per.includes(' ')) {
                unitText += ` per ${per}`;
            } else {
                unitText += `/${per}`;
            }
        }
        return `${amountText}${unitText}`;
    };

    const renderRecipeItem = (data, isProducedFlag) => {
        let el = allItems[data.element];
        let amountStr = formatAmount(data, isProducedFlag);
        let amountClass = isProducedFlag ? 'amount-positive' : 'amount-negative';

        if (el) {
            return createElement('a', { href: `#/recipes/${el.id}`, class: 'recipe-item-link' }, [
                createElement('img', { src: `/images/${el.image}`, class: 'recipe-item-img', title: el.name }),
                createElement('span', { class: 'recipe-item-name muted', textContent: el.name }),
                createElement('span', { class: `recipe-item-amount ${amountClass}`, textContent: amountStr })
            ]);
        } else {
            return createElement('div', { class: 'recipe-item-link no-hover' }, [
                createElement('div', { class: 'recipe-item-placeholder' }),
                createElement('span', { class: 'recipe-item-name muted', textContent: 'Unknown' }),
                createElement('span', { class: `recipe-item-amount ${amountClass}`, textContent: amountStr })
            ]);
        }
    };

    const createArrow = () => createElement('div', { class: 'recipe-arrow' });

    const renderRecipe = (r) => {
        const layoutChildren = [];

        // Left: Consumed
        if (r.consumed && r.consumed.length > 0) {
            const consumedItems = r.consumed.map(c => renderRecipeItem(c, false));
            layoutChildren.push(createElement('div', { class: 'recipe-items-block' }, consumedItems));
        }

        // Center: Source
        if (r.source !== 'emit') {
            if (r.consumed && r.consumed.length > 0) {
                layoutChildren.push(createArrow());
            }

            let src = allItems[r.source];
            let sourceLink;
            if (src) {
                if (r.source === 'heat' || r.source === 'cool') {
                                        let tempText = 'Phase Change';
                    if (r.temp !== undefined) {
                        let displayTemp = r.temp;
                        let unit = '°C';
                        if (window.unitSettings && window.unitSettings.temp === 'F') {
                            displayTemp = (displayTemp * 9/5) + 32;
                            unit = '°F';
                        }
                        tempText = `${(Math.round(displayTemp * 10) / 10).toString()} ${unit}`;
                    }
                    sourceLink = createElement('div', { class: 'recipe-item-link no-hover' }, [
                        createElement('img', { src: `/images/${src.image}`, class: 'recipe-item-img', title: src.name }),
                        createElement('span', { class: 'recipe-item-name', textContent: tempText })
                    ]);
                } else {
                    sourceLink = createElement('a', { href: `#/recipes/${src.id}`, class: 'recipe-item-link' }, [
                        createElement('img', { src: `/images/${src.image}`, class: 'recipe-item-img', title: src.name }),
                        createElement('span', { class: 'recipe-item-name', textContent: src.name })
                    ]);
                }
            } else {
                if (r.source === 'heat' || r.source === 'cool') {
                                        let tempText = 'Phase Change';
                    if (r.temp !== undefined) {
                        let displayTemp = r.temp;
                        let unit = '°C';
                        if (window.unitSettings && window.unitSettings.temp === 'F') {
                            displayTemp = (displayTemp * 9/5) + 32;
                            unit = '°F';
                        }
                        tempText = `${(Math.round(displayTemp * 10) / 10).toString()} ${unit}`;
                    }
                    sourceLink = createElement('div', { class: 'recipe-item-link no-hover' }, [
                        createElement('div', { class: 'recipe-item-placeholder' }),
                        createElement('span', { class: 'recipe-item-name', textContent: tempText })
                    ]);
                } else {
                    sourceLink = createElement('div', { class: 'recipe-item-link no-hover' }, [
                        createElement('div', { class: 'recipe-item-placeholder' }),
                        createElement('span', { class: 'recipe-item-name', textContent: r.source })
                    ]);
                }
            }

            layoutChildren.push(createElement('div', { class: 'recipe-source-block' }, [sourceLink]));
        }

        // Right: Produced
        if (r.produced && r.produced.length > 0) {
            if ((r.consumed && r.consumed.length > 0) || r.source !== 'emit') {
                layoutChildren.push(createArrow());
            }
            const producedItems = r.produced.map(p => renderRecipeItem(p, true));
            layoutChildren.push(createElement('div', { class: 'recipe-items-block' }, producedItems));
        }

        return createElement('div', { class: 'recipe-container' }, [
            createElement('div', { class: 'recipe-layout' }, layoutChildren)
        ]);
    };

    const renderCategory = (title, recipes) => {
        if (recipes.length === 0) return null;

        const list = createElement('div', { class: 'recipe-category-list' }, recipes.map(renderRecipe));

        return createElement('div', { class: 'recipe-category-card' }, [
            createElement('h3', { class: 'recipe-category-title', textContent: title }),
            list
        ]);
    };

    container.appendChild(contentWrapper);

    const categoriesContainer = createElement('div', { class: 'recipe-categories-container' }, [
        renderCategory('State Transitions', stateTransitions),
        renderCategory('Emission', emissions),
        renderCategory('Produced', produced),
        renderCategory('Consumed', consumed)
    ]);

    container.appendChild(categoriesContainer);

    if (allRelatedRecipes.length === 0) {
        container.appendChild(createElement('p', { class: 'muted', textContent: 'No known recipes.' }));
    }

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
