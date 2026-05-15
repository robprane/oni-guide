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

    let filterButtonsHtml = `<button class="filter-btn active" data-filter="all" aria-pressed="true">All</button>`;
    if (configData) {
        configData.forEach(category => {
            if (category.isFilter) {
                filterButtonsHtml += `\n                <button class="filter-btn" data-filter="${category.id}" aria-pressed="false">${category.label}</button>`;
            }
        });
    }

    container.innerHTML = `
        <div class="container" style="display: flex; flex-direction: column; gap: 1rem;">
            <h2>Recipes Database</h2>
            <input type="search" id="recipe-search" aria-label="Search materials, buildings, or recipes" placeholder="Search materials, buildings, or recipes..." style="padding: 0.5rem; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--input-text);">
            <div id="recipe-filters" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                ${filterButtonsHtml}
            </div>
            <div id="recipe-results" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem;">
                Loading...
            </div>
        </div>
    `;

    const searchInput = document.getElementById('recipe-search');
    const resultsContainer = document.getElementById('recipe-results');
    const filterBtns = document.querySelectorAll('.filter-btn');
    let currentFilter = 'all';

    function renderResults(query = '') {
        resultsContainer.innerHTML = '';
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

        if (matchedItems.length === 0) {
            const escapeHtml = (unsafe) => {
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };
            resultsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-color); opacity: 0.7;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; opacity: 0.5;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">No results found ${q ? `for "<strong>${escapeHtml(q)}</strong>"` : ''}</p>
                    <p style="font-size: 0.9rem; margin-bottom: 1.5rem;">Try adjusting your search term or using a different filter.</p>
                    <button class="clear-search-btn" style="padding: 0.5rem 1rem; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); border-radius: 4px; cursor: pointer; transition: background 0.2s;">Clear Search & Filters</button>
                </div>
            `;

            const clearBtn = resultsContainer.querySelector('.clear-search-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    currentFilter = 'all';
                    filterBtns.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    const allBtn = Array.from(filterBtns).find(b => b.dataset.filter === 'all');
                    if (allBtn) {
                        allBtn.classList.add('active');
                        allBtn.setAttribute('aria-pressed', 'true');
                    }
                    renderResults('');
                });
            }
            return;
        }

        matchedItems.forEach(item => {
            const card = document.createElement('div');
            card.style.cssText = `
                background: var(--card-bg);
                padding: 1rem;
                border-radius: 8px;
                border: 1px solid var(--border-color);
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                transition: transform 0.2s;
            `;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.onmouseenter = () => card.style.transform = 'scale(1.05)';
            card.onmouseleave = () => card.style.transform = 'scale(1)';
            card.onfocus = () => card.style.transform = 'scale(1.05)';
            card.onblur = () => card.style.transform = 'scale(1)';

            card.innerHTML = `
                <img src="/images/${item.image}" alt="" aria-hidden="true" style="width: 64px; height: 64px; object-fit: contain; margin-bottom: 0.5rem;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'64\\' height=\\'64\\'><rect width=\\'64\\' height=\\'64\\' fill=\\'%23333\\'/><text x=\\'32\\' y=\\'32\\' fill=\\'white\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>?</text></svg>'">
                <h3 style="margin: 0; font-size: 1.1rem;">${item.name}</h3>
                <span style="font-size: 0.8rem; color: #888; text-transform: capitalize;">${item._type}</span>
            `;

            card.addEventListener('click', () => {
                showDetailModal(item);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
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

    const style = document.createElement('style');
    style.textContent = `
        .filter-btn { padding: 0.5rem 1rem; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); border-radius: 4px; cursor: pointer; transition: background 0.2s; }
        .filter-btn:hover, .clear-search-btn:hover { background: var(--nav-hover) !important; }
        .filter-btn.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
        #detail-dialog::backdrop { background: rgba(0,0,0,0.5); }
    `;
    container.appendChild(style);

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

    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
        const dialog = document.getElementById('detail-dialog');
        if (dialog) {
            if (dialog.open) dialog.close();
            dialog.remove();
        }
    };
}

function showDetailModal(item) {
    // If the hash is not already for this item, update it. This might trigger routeupdate.
    if (window.location.hash !== '#/recipes/' + item.id) {
        window.location.hash = '#/recipes/' + item.id;
        // Don't return, as we need to render the modal contents now or let the route update do it.
        // But actually, updating the hash will trigger routeupdate which we will handle to call showDetailModal.
        // Wait, if it's called from click, updating hash triggers hashchange -> routeupdate -> we call showDetailModal(item).
        // Let's just render the dialog here. If hash is updated, we do it. If it was already correct, it renders.
    }

    let dialog = document.getElementById('detail-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'detail-dialog';
        dialog.style.cssText = `
            background: var(--bg-color);
            padding: 2rem;
            border-radius: 8px;
            max-width: 800px;
            width: 90%;
            max-height: 90vh;
            border: 1px solid var(--border-color);
            color: var(--text-color);
            margin: auto;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
        `;


        // Close when clicking outside the dialog or pressing Esc
        dialog.addEventListener('click', (e) => {
            const rect = dialog.getBoundingClientRect();
            const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
                && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
            if (!isInDialog) {
                closeModal();
            }
        });

        // The native <dialog> closes on Esc by default. We should intercept it to update the hash.
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault(); // Prevent default close so we can update the hash, which will trigger close via routeupdate
            closeModal();
        });

        document.body.appendChild(dialog);
    }

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <img src="/images/${item.image}" alt="" aria-hidden="true" style="width: 64px; height: 64px; object-fit: contain;">
                <div>
                    <h2 style="margin: 0;">${item.name}</h2>
                    <span style="font-size: 0.9rem; color: #888; text-transform: capitalize;">${item._type}</span>
                </div>
            </div>
            <button aria-label="Close modal" onclick="window.closeModal()" style="cursor:pointer; background:none; border:none; color:var(--text-color); font-size:1.5rem;">&times;</button>
        </div>
        ${item.description ? `<p><i>${item.description}</i></p>` : ''}
    `;

    // Show specific properties if available
    if (item.type) html += `<p><strong>Type:</strong> ${item.type}</p>`;
    if (item.category && item.category !== 'unknown' && item.category !== item._type) html += `<p><strong>Category:</strong> ${item.category}</p>`;
    if (item.power_consumption) html += `<p><strong>Power:</strong> ${item.power_consumption} W</p>`;
    if (item.freezing_point !== undefined) html += `<p><strong>Freezing Point:</strong> ${item.freezing_point}°C (Forms: ${item.freezing_product || '?'})</p>`;
    if (item.melting_point !== undefined) html += `<p><strong>Melting Point:</strong> ${item.melting_point}°C (Forms: ${item.melting_product || '?'})</p>`;
    if (item.boiling_point !== undefined) html += `<p><strong>Boiling Point:</strong> ${item.boiling_point}°C (Forms: ${item.boiling_product || '?'})</p>`;

    // Find related recipes
    let sourceRecipes = recipesData.filter(r => r.source === item.id);
    let consumesRecipes = recipesData.filter(r => (r.consumed || []).some(c => c.element === item.id));
    let producesRecipes = recipesData.filter(r => (r.produced || []).some(p => p.element === item.id));

    const formatAmount = (item) => {
        if (!item.per) return `${item.amount}${item.unit.includes('%') ? '' : ' '}${item.unit}`;
        if (item.unit.includes(' ') || item.per.includes(' ')) return `${item.amount}${item.unit.includes('%') ? '' : ' '}${item.unit} per ${item.per}`;
        return `${item.amount}${item.unit.includes('%') ? '' : ' '}${item.unit}/${item.per}`;
    };

    const renderRecipe = (r) => {
        let rHtml = `<div style="background: var(--input-bg); padding: 0.5rem; border-radius: .25em; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">`;

        if (r.source) {
            let src = allItems[r.source];
            rHtml += `<div style="display:flex; align-items:center; gap:0.2rem;"><img src="/images/${src ? src.image : ''}" alt="" aria-hidden="true" style="width:1.5em; height:1.5em;" title="${src ? src.name : r.source}"> <strong>${src ? src.name : r.source}</strong></div>`;
        }

        if (r.consumed && r.consumed.length > 0) {
            rHtml += `<span style="color:#888;">consumes</span>`;
            r.consumed.forEach(c => {
                let el = allItems[c.element];
                rHtml += `<div style="display:flex; align-items:center; gap:0.2rem; background: rgba(255,0,0,0.1); padding: 0.2rem 0.4rem; border-radius: .25em;"><img src="/images/${el ? el.image : ''}" alt="" aria-hidden="true" style="width:auto; height:1em;" title="${el ? el.name : c.element}"> ${formatAmount(c)} ${el ? el.name : c.element}</div>`;
            });
        }

        if (r.produced && r.produced.length > 0) {
            rHtml += `<span style="color:#888;">produces</span>`;
            r.produced.forEach(p => {
                let el = allItems[p.element];
                rHtml += `<div style="display:flex; align-items:center; gap:0.2rem; background: rgba(0,255,0,0.1); padding: 0.2rem 0.4rem; border-radius: .25em;"><img src="/images/${el ? el.image : ''}" alt="" aria-hidden="true" style="width:auto; height:1em;" title="${el ? el.name : p.element}"> ${formatAmount(p)} ${el ? el.name : p.element}</div>`;
            });
        }

        rHtml += `</div>`;
        return rHtml;
    };

    if (sourceRecipes.length > 0) {
        html += `<h3 style="margin-top: 1.5rem; padding-bottom: 0.5rem;">Recipes</h3>`;
        sourceRecipes.forEach(r => { html += renderRecipe(r); });
    }

    if (consumesRecipes.length > 0) {
        html += `<h3 style="margin-top: 1.5rem; padding-bottom: 0.5rem;">Used as Ingredient In</h3>`;
        consumesRecipes.forEach(r => { html += renderRecipe(r); });
    }

    if (producesRecipes.length > 0) {
        html += `<h3 style="margin-top: 1.5rem; padding-bottom: 0.5rem;">Produced By</h3>`;
        producesRecipes.forEach(r => { html += renderRecipe(r); });
    }

    if (sourceRecipes.length === 0 && consumesRecipes.length === 0 && producesRecipes.length === 0) {
        html += `<p style="margin-top: 1rem; color: #888;">No known recipes.</p>`;
    }

    dialog.innerHTML = html;
    if (!dialog.open) {
        dialog.showModal();
    }
}

function closeModal() {
    if (window.location.hash !== '#/recipes') {
        window.location.hash = '#/recipes';
        // When hash changes to #/recipes, routeupdate will close it.
        // But let's also close it here just in case.
    }

    const dialog = document.getElementById('detail-dialog');
    if (dialog && dialog.open) {
        dialog.close();
    }
}
window.closeModal = closeModal;
