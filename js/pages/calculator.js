import { createElement } from '../utils.js?v=6';
import { createSvgIcon } from '../icons.js?v=6';
import {
    attachImgFallback,
    formatTemperature,
    getData,
    getMatchLevel,
    getTagMembers,
    loadData,
    prettifyId
} from '../data-store.js?v=6';
import {
    addCalculatorRecipe,
    computeCalculatorTable,
    encodeCalculatorState,
    findCalculatorRow,
    findProducersForColumn,
    formatMultiplierDisplay,
    getCalculatorState,
    getLastSyncedEncoded,
    getUnambiguousProducer,
    loadCalculatorStateFromEncoded,
    materializeTagColumn,
    recomputeAutoMultipliers,
    removeCalculatorRow,
    resetCalculatorState,
    resolveDeficitWithProducer,
    setCalculatorMultiplier,
    setCalculatorRowAutoTarget,
    setCalculatorShowPower,
    setLastSyncedEncoded,
    updateCalculatorRowTag
} from '../calculator-state.js?v=7';

function renderSmallTagMosaic(tagId, data) {
    const members = getTagMembers(tagId);
    const preview = members.slice(0, 4);
    if (preview.length >= 2) {
        return createElement(
            'div',
            { class: `calc-tag-mosaic count-${preview.length}` },
            preview.map(m => attachImgFallback(createElement('img', {
                src: `/images/${m.image}`,
                alt: m.name,
                class: 'calc-tag-mosaic-img'
            })))
        );
    }
    const tag = (data.allTags || {})[tagId];
    const imgSrc = preview[0]?.image || tag?.image;
    if (imgSrc) {
        return attachImgFallback(createElement('img', {
            src: `/images/${imgSrc}`,
            alt: tag?.name || tagId,
            class: 'calc-col-img'
        }));
    }
    return createElement('div', { class: 'calc-img-placeholder' });
}

function getSourceDisplay(rawRecipe, data) {
    const allItems = data.allItems || {};
    const src = allItems[rawRecipe.source];
    if (rawRecipe.source === 'heat' || rawRecipe.source === 'cool') {
        const rawTemp = rawRecipe.temp !== undefined ? rawRecipe.temp : rawRecipe.temperature;
        const label = rawRecipe.source === 'heat' ? 'Heat' : 'Cool';
        const tempStr = rawTemp !== undefined ? ` (${formatTemperature(rawTemp)})` : '';
        return {
            name: `${label}${tempStr}`,
            image: src ? src.image : null,
            href: null
        };
    }
    if (rawRecipe.source === 'emit') {
        return {
            name: 'Emission',
            image: src ? src.image : null,
            href: null
        };
    }
    if (src) {
        return {
            name: src.name,
            image: src.image,
            href: `#/recipes/${src.id}`
        };
    }
    return {
        name: prettifyId(rawRecipe.source),
        image: null,
        href: null
    };
}

function getRecipeBriefSummary(resolvedRecipe, data) {
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};
    const labelEntry = (e) => {
        if (e.tag) {
            return `#${allTags[e.tag]?.name || prettifyId(e.tag)}`;
        }
        return allItems[e.element]?.name || prettifyId(e.element);
    };
    const left = (resolvedRecipe.consumed || []).map(labelEntry).join(', ');
    const right = (resolvedRecipe.produced || []).map(labelEntry).join(', ');
    if (left && right) return `${left} → ${right}`;
    if (left) return `Uses ${left}`;
    if (right) return `Produces ${right}`;
    return '';
}

function renderFlowCellContent(cellEl, cellData) {
    cellEl.textContent = '';
    if (!cellData || !cellData.lines || cellData.lines.length === 0) {
        cellEl.removeAttribute('title');
        cellEl.appendChild(createElement('span', { class: 'calc-empty-dash', textContent: '—' }));
        return;
    }
    if (cellData.tooltip) {
        cellEl.setAttribute('title', cellData.tooltip);
    } else {
        cellEl.removeAttribute('title');
    }
    cellData.lines.forEach(line => {
        cellEl.appendChild(createElement('div', {
            class: `calc-flow-line ${line.cssClass}`,
            textContent: line.text
        }));
    });
}

function renderPowerCellContent(cellEl, powerObj) {
    cellEl.textContent = '';
    if (!powerObj) {
        cellEl.appendChild(createElement('span', { class: 'calc-empty-dash', textContent: '—' }));
        return;
    }
    cellEl.appendChild(createElement('div', {
        class: `calc-flow-line ${powerObj.cssClass}`,
        textContent: powerObj.text
    }));
}

function searchRecipesForCalculator(query, data, limit = 18) {
    const q = String(query || '').trim();
    const recipesData = data.recipesData || [];
    const allItems = data.allItems || {};
    const allTags = data.allTags || {};

    if (!q) {
        // Curated set of common starter recipes when focused with empty query
        const starterRules = [
            r => r.source === 'duplicant' && (r.consumed || []).some(c => c.tag === 'edible'),
            r => r.source === 'duplicant' && (r.consumed || []).some(c => c.element === 'oxygen'),
            r => r.source === 'electrolyzer',
            r => r.source === 'bionic_duplicant',
            r => r.source === 'oxygen_diffuser',
            r => r.source === 'deodorizer',
            r => r.source === 'water_sieve',
            r => r.source === 'carbon_skimmer',
            r => r.source === 'coal_generator',
            r => r.source === 'hydrogen_generator',
            r => r.source === 'natural_gas_generator',
            r => r.source === 'hatch'
        ];
        const picks = [];
        const seenKeys = new Set();
        for (const matchFn of starterRules) {
            const match = recipesData.find(r => !seenKeys.has(r._key) && matchFn(r));
            if (match) {
                seenKeys.add(match._key);
                picks.push({ rawRecipe: match, tagSelections: {}, score: 0 });
            }
            if (picks.length >= 12) break;
        }
        return picks;
    }

    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];
    const seenIds = new Set();

    const pushResult = (rawRecipe, tagSelections, score) => {
        const key = `${rawRecipe._key}@@${JSON.stringify(tagSelections)}`;
        if (seenIds.has(key)) return;
        seenIds.add(key);
        results.push({ rawRecipe, tagSelections, score });
    };

    const scoreText = (text) => {
        if (!text) return Infinity;
        const full = getMatchLevel(q, text);
        if (full < Infinity) return full;
        if (words.length > 1) {
            let sum = 0;
            for (const w of words) {
                const lvl = getMatchLevel(w, text);
                if (lvl === Infinity) return Infinity;
                sum += lvl;
            }
            return 2 + sum / words.length;
        }
        return Infinity;
    };

    for (const r of recipesData) {
        const srcDisplay = getSourceDisplay(r, data);
        const srcScore = scoreText(srcDisplay.name);

        let entryBest = Infinity;
        let tagBest = Infinity;
        const concreteTagMatches = [];

        const allEntries = (r.consumed || []).concat(r.produced || []);
        for (const e of allEntries) {
            if (e.element) {
                const el = allItems[e.element];
                if (el) {
                    const s = scoreText(el.name);
                    if (s < entryBest) entryBest = s;
                }
            } else if (e.tag) {
                const tag = allTags[e.tag];
                if (tag) {
                    const ts = scoreText(tag.name);
                    if (ts < tagBest) tagBest = ts;
                }
                // Check if query directly matches concrete members of this tag (e.g. "sand" -> Deodorizer [Sand])
                const members = getTagMembers(e.tag);
                for (const m of members) {
                    const ms = getMatchLevel(q, m.name);
                    if (ms <= 2) {
                        concreteTagMatches.push({ tagId: e.tag, member: m, score: ms });
                    }
                }
            }
        }

        // Combined multi-word match across full recipe description (e.g. "rock crusher salt", "hatch coal")
        let comboScore = Infinity;
        if (words.length > 1) {
            const parts = [srcDisplay.name];
            for (const e of allEntries) {
                if (e.element && allItems[e.element]) parts.push(allItems[e.element].name);
                else if (e.tag && allTags[e.tag]) parts.push(allTags[e.tag].name);
            }
            const joined = parts.join(' ').toLowerCase();
            if (words.every(w => joined.includes(w))) {
                comboScore = 1.5;
            }
        }

        const baseBest = Math.min(
            srcScore,
            comboScore,
            entryBest + 0.5,
            tagBest + 0.8
        );

        // Surface concrete tag-materialized variants when query directly matches a tag member
        if (concreteTagMatches.length > 0) {
            concreteTagMatches.sort((a, b) => a.score - b.score || a.member.name.localeCompare(b.member.name));
            const topMembers = concreteTagMatches.slice(0, 3);
            for (const tm of topMembers) {
                pushResult(r, { [tm.tagId]: tm.member.id }, tm.score + 0.4);
            }
        }

        if (baseBest <= 3.5) {
            pushResult(r, {}, baseBest);
        }
    }

    results.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        const nameA = getSourceDisplay(a.rawRecipe, data).name;
        const nameB = getSourceDisplay(b.rawRecipe, data).name;
        return nameA.localeCompare(nameB);
    });

    return results.slice(0, limit);
}

export async function renderCalculator(container, currentPath) {
    await loadData();
    const data = getData();

    // Load from URL if it's a fresh/shared link; if it matches our own previous URL
    // (e.g. Browser Back after adding a recipe from Recipes), preserve the newer localStorage state.
    const applyPathState = (path) => {
        if (path && path.startsWith('/calculator/')) {
            const encoded = path.substring('/calculator/'.length);
            if (encoded && encoded !== getLastSyncedEncoded()) {
                loadCalculatorStateFromEncoded(encoded, { persist: true });
            }
        }
        recomputeAutoMultipliers(data);
    };
    applyPathState(currentPath);

    container.textContent = '';

    let urlSyncTimeout = null;
    const syncUrlNow = () => {
        if (urlSyncTimeout) {
            clearTimeout(urlSyncTimeout);
            urlSyncTimeout = null;
        }
        const encoded = encodeCalculatorState(getCalculatorState());
        setLastSyncedEncoded(encoded);
        const targetHash = encoded ? `#/calculator/${encoded}` : '#/calculator';
        if (window.location.hash !== targetHash) {
            history.replaceState(null, '', targetHash);
        }
    };

    const scheduleUrlSync = () => {
        if (urlSyncTimeout) clearTimeout(urlSyncTimeout);
        urlSyncTimeout = setTimeout(syncUrlNow, 300);
    };

    // Header & Toolbar
    const countBadge = createElement('span', { class: 'calc-count-pill', textContent: '0 recipes' });
    const powerCheckbox = createElement('input', {
        type: 'checkbox',
        id: 'calc-power-toggle',
        'aria-label': 'Toggle Power (W) column'
    });
    const powerLabel = createElement('label', {
        class: 'calc-power-toggle',
        title: 'Show/hide Power (W) column'
    }, [
        powerCheckbox,
        attachImgFallback(createElement('img', {
            src: '/images/PowerMenu.png',
            alt: 'Power (W)',
            class: 'calc-power-toggle-icon'
        }))
    ]);

    const copyLinkBtn = createElement('button', {
        type: 'button',
        id: 'calc-copy-link-btn',
        class: 'utility-btn icon-only-btn',
        title: 'Copy link',
        'aria-label': 'Copy link'
    }, [createSvgIcon('link', 'btn-svg-icon')]);

    const resetBtn = createElement('button', {
        type: 'button',
        id: 'calc-reset-btn',
        class: 'utility-btn calc-reset-btn',
        textContent: 'Reset'
    });

    const header = createElement('div', { class: 'calc-header' }, [
        createElement('div', { class: 'calc-title-group' }, [
            createElement('h2', { textContent: 'Recipe Calculator' }),
            countBadge
        ]),
        createElement('div', { class: 'calc-toolbar' }, [
            powerLabel,
            copyLinkBtn,
            resetBtn
        ])
    ]);

    const tableWrapper = createElement('div', { class: 'calc-table-wrapper' });
    const emptyHint = createElement('p', {
        class: 'calc-empty-hint muted',
        textContent: 'Use the search row above to add recipes directly, or click the calculator button on any recipe in the Recipes tab.'
    });

    // Floating dropdown for inline recipe search (outside overflow wrapper so never clipped)
    const searchDropdown = createElement('div', {
        id: 'calc-search-dropdown',
        class: 'calc-search-dropdown hidden',
        role: 'listbox'
    });

    // Floating popover for resolving material deficits / picking tag members
    const deficitPopover = createElement('div', {
        id: 'calc-deficit-popover',
        class: 'calc-deficit-popover hidden',
        role: 'dialog',
        'aria-label': 'Resolve material deficit'
    });

    const statusToast = createElement('div', {
        class: 'calc-toast hidden',
        role: 'status',
        'aria-live': 'polite'
    });

    // Confirmation dialog for Reset
    const resetDialogMsg = createElement('p', { class: 'calc-confirm-msg' });
    const cancelResetBtn = createElement('button', {
        type: 'button',
        class: 'utility-btn',
        textContent: 'Cancel'
    });
    const confirmResetBtn = createElement('button', {
        type: 'button',
        id: 'calc-confirm-reset-btn',
        class: 'utility-btn calc-reset-confirm-btn',
        textContent: 'Reset Table'
    });
    const resetDialog = createElement('dialog', {
        id: 'calc-reset-dialog',
        class: 'modal calc-confirm-modal'
    }, [
        createElement('div', { class: 'modal-content' }, [
            createElement('div', { class: 'modal-header' }, [
                createElement('h2', { textContent: 'Reset Calculator' })
            ]),
            createElement('div', { class: 'calc-confirm-body' }, [
                resetDialogMsg,
                createElement('div', { class: 'calc-confirm-actions' }, [
                    cancelResetBtn,
                    confirmResetBtn
                ])
            ])
        ])
    ]);

    const layout = createElement('div', { class: 'container calculator-container' }, [
        header,
        tableWrapper,
        emptyHint,
        searchDropdown,
        deficitPopover,
        statusToast,
        resetDialog
    ]);
    container.appendChild(layout);

    let toastTimer = null;
    const showToast = (msg) => {
        statusToast.textContent = msg;
        statusToast.classList.remove('hidden');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            statusToast.classList.add('hidden');
        }, 2200);
    };

    // References for fast in-place numeric updates (preserves multiplier input focus!)
    let activeRowRefs = new Map();
    let activeTotalRefs = new Map();
    let activePowerTotalCell = null;
    let activeSearchInput = null;
    let dropdownItems = [];
    let highlightedIndex = -1;
    let activeDeficitAnchor = null;
    let activePopoverNav = null;

    const closeDropdown = () => {
        searchDropdown.classList.add('hidden');
        searchDropdown.textContent = '';
        dropdownItems = [];
        highlightedIndex = -1;
    };

    const closeDeficitPopover = () => {
        deficitPopover.classList.add('hidden');
        deficitPopover.textContent = '';
        activeDeficitAnchor = null;
        activePopoverNav = null;
    };

    const positionDeficitPopover = () => {
        if (!activeDeficitAnchor || deficitPopover.classList.contains('hidden')) return;
        const rect = activeDeficitAnchor.getBoundingClientRect();
        const width = Math.min(340, window.innerWidth - 24);
        const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 12), window.innerWidth - width - 12);
        const spaceAbove = rect.top - 12;
        const spaceBelow = window.innerHeight - rect.bottom - 12;

        deficitPopover.style.width = `${width}px`;
        deficitPopover.style.left = `${left}px`;

        if (spaceAbove >= 220 || spaceAbove >= spaceBelow) {
            deficitPopover.style.top = 'auto';
            deficitPopover.style.bottom = `${window.innerHeight - rect.top + 6}px`;
            deficitPopover.style.maxHeight = `${Math.min(380, Math.max(160, spaceAbove))}px`;
        } else {
            deficitPopover.style.top = `${rect.bottom + 6}px`;
            deficitPopover.style.bottom = 'auto';
            deficitPopover.style.maxHeight = `${Math.min(380, Math.max(160, spaceBelow))}px`;
        }
    };

    const formatChainToast = (prefix, addedNames, updatedNames = []) => {
        const parts = [];
        if (addedNames.length > 0) {
            const shown = addedNames.slice(0, 4).join(', ');
            const extra = addedNames.length > 4 ? ` +${addedNames.length - 4}` : '';
            parts.push(`${prefix}: ${shown}${extra}`);
        } else if (updatedNames.length > 0) {
            parts.push(`Auto-balanced ${updatedNames.join(', ')}`);
        }
        return parts.join(' · ') || 'Updated chain';
    };

    const openDeficitPopover = (deficit, anchorBtn) => {
        closeDropdown();
        activeDeficitAnchor = anchorBtn;
        deficitPopover.textContent = '';

        const headerClose = createElement('button', {
            type: 'button',
            class: 'calc-popover-close',
            'aria-label': 'Close',
            textContent: '×'
        });
        headerClose.addEventListener('click', closeDeficitPopover);

        const titleText = deficit.isTag
            ? `Pick ${deficit.name}`
            : `Produce ${deficit.name}`;

        const headerEl = createElement('div', { class: 'calc-popover-header' }, [
            createElement('div', { class: 'calc-popover-title-wrap' }, [
                createElement('strong', { class: 'calc-popover-title', textContent: titleText }),
                createElement('span', { class: 'calc-popover-deficit amount-negative', textContent: deficit.formattedText })
            ]),
            headerClose
        ]);
        deficitPopover.appendChild(headerEl);

        const listEl = createElement('div', { class: 'calc-popover-list' });
        let popHighlightIdx = -1;

        const syncPopHighlight = (shouldScroll = true) => {
            const nodes = listEl.querySelectorAll('.calc-deficit-option');
            if (nodes.length === 0) {
                popHighlightIdx = -1;
                return;
            }
            if (popHighlightIdx < 0 || popHighlightIdx >= nodes.length) {
                popHighlightIdx = 0;
            }
            nodes.forEach((node, i) => {
                if (i === popHighlightIdx) {
                    node.classList.add('highlighted');
                    if (shouldScroll && typeof node.scrollIntoView === 'function') {
                        node.scrollIntoView({ block: 'nearest' });
                    }
                } else {
                    node.classList.remove('highlighted');
                }
            });
        };

        activePopoverNav = {
            move(delta) {
                const nodes = listEl.querySelectorAll('.calc-deficit-option');
                if (nodes.length === 0) return;
                if (popHighlightIdx < 0) {
                    popHighlightIdx = delta > 0 ? 0 : nodes.length - 1;
                } else {
                    popHighlightIdx = (popHighlightIdx + delta + nodes.length) % nodes.length;
                }
                syncPopHighlight(true);
            },
            confirm() {
                const nodes = listEl.querySelectorAll('.calc-deficit-option');
                if (nodes.length === 0) return;
                const idx = (popHighlightIdx >= 0 && popHighlightIdx < nodes.length) ? popHighlightIdx : 0;
                nodes[idx].click();
            }
        };

        const createFilterInput = (placeholder, onInput) => {
            const input = createElement('input', {
                type: 'search',
                class: 'recipe-search-input calc-popover-filter',
                placeholder,
                autocomplete: 'off'
            });
            input.addEventListener('input', () => onInput(input.value));
            return input;
        };

        const focusFilter = (input) => {
            if (!input || typeof input.focus !== 'function') return;
            try {
                input.focus({ preventScroll: true });
            } catch {
                input.focus();
            }
        };

        if (deficit.isTag) {
            const members = getTagMembers(deficit.id);
            const renderMembers = (filterText = '') => {
                listEl.textContent = '';
                const q = filterText.trim().toLowerCase();
                const filtered = q ? members.filter(m => m.name.toLowerCase().includes(q)) : members;
                if (filtered.length === 0) {
                    popHighlightIdx = -1;
                    listEl.appendChild(createElement('div', { class: 'calc-search-empty muted', textContent: 'No matching items' }));
                    return;
                }
                filtered.forEach((m, idx) => {
                    const btn = createElement('button', {
                        type: 'button',
                        class: 'calc-search-option calc-deficit-option'
                    }, [
                        m.image
                            ? attachImgFallback(createElement('img', { src: `/images/${m.image}`, alt: m.name, class: 'calc-option-img' }))
                            : createElement('div', { class: 'calc-option-img-placeholder' }),
                        createElement('div', { class: 'calc-option-text' }, [
                            createElement('div', { class: 'calc-option-title' }, [
                                createElement('span', { textContent: m.name })
                            ])
                        ])
                    ]);
                    btn.addEventListener('mouseenter', () => {
                        popHighlightIdx = idx;
                        syncPopHighlight(false);
                    });
                    btn.addEventListener('click', () => {
                        const res = materializeTagColumn(deficit.id, m.id, data, { autoExpand: true });
                        closeDeficitPopover();
                        renderTable();
                        scheduleUrlSync();
                        const extra = res.addedNames.length > 0 ? ` → +${res.addedNames.join(', ')}` : '';
                        showToast(`Selected ${m.name}${extra}`);
                    });
                    listEl.appendChild(btn);
                });
                popHighlightIdx = 0;
                syncPopHighlight(false);
            };

            let filterInput = null;
            if (members.length > 6) {
                filterInput = createFilterInput(`Filter ${members.length} options...`, renderMembers);
                deficitPopover.appendChild(filterInput);
            }

            renderMembers('');
            deficitPopover.appendChild(listEl);
            deficitPopover.classList.remove('hidden');
            positionDeficitPopover();
            focusFilter(filterInput);
            return;
        }

        const info = findProducersForColumn(deficit.colKey, deficit.bucketKey, deficit.amount, data);
        const allProducers = info.producers;

        const renderProducers = (filterText = '') => {
            listEl.textContent = '';
            const q = filterText.trim().toLowerCase();
            const filtered = q
                ? allProducers.filter(p => {
                    const srcName = getSourceDisplay(p.rawRecipe, data).name.toLowerCase();
                    const sum = getRecipeBriefSummary(p.rawRecipe, data).toLowerCase();
                    return srcName.includes(q) || sum.includes(q);
                })
                : allProducers;

            if (filtered.length === 0) {
                popHighlightIdx = -1;
                listEl.appendChild(createElement('div', { class: 'calc-search-empty muted', textContent: 'No matching producers' }));
                return;
            }

            let addedPhaseDivider = false;
            filtered.forEach((p, idx) => {
                if (p.isPhaseChange && !addedPhaseDivider) {
                    addedPhaseDivider = true;
                    listEl.appendChild(createElement('div', {
                        class: 'calc-popover-divider muted',
                        textContent: 'Phase changes'
                    }));
                }

                const srcDisplay = getSourceDisplay(p.rawRecipe, data);
                const resolvedPreview = {
                    ...p.rawRecipe,
                    consumed: (p.rawRecipe.consumed || []).map(e => (
                        e.tag && p.tagSelections[e.tag]
                            ? { ...e, element: p.tagSelections[e.tag], tag: undefined }
                            : e
                    )),
                    produced: (p.rawRecipe.produced || []).map(e => (
                        e.tag && p.tagSelections[e.tag]
                            ? { ...e, element: p.tagSelections[e.tag], tag: undefined }
                            : e
                    ))
                };
                const summary = getRecipeBriefSummary(resolvedPreview, data);
                const badges = [];
                if (p.alreadyInTable) {
                    badges.push(createElement('span', {
                        class: 'calc-option-badge is-added',
                        textContent: `→ ×${formatMultiplierDisplay(p.neededMult)}`
                    }));
                } else {
                    badges.push(createElement('span', {
                        class: 'calc-option-badge is-needed',
                        textContent: `×${formatMultiplierDisplay(p.neededMult)}`
                    }));
                }
                if (p.isGeyser) {
                    badges.push(createElement('span', {
                        class: 'calc-option-badge',
                        textContent: 'avg'
                    }));
                }

                const optEl = createElement('button', {
                    type: 'button',
                    class: 'calc-search-option calc-deficit-option'
                }, [
                    srcDisplay.image
                        ? attachImgFallback(createElement('img', {
                            src: `/images/${srcDisplay.image}`,
                            alt: srcDisplay.name,
                            class: 'calc-option-img'
                        }))
                        : createElement('div', { class: 'calc-option-img-placeholder' }),
                    createElement('div', { class: 'calc-option-text' }, [
                        createElement('div', { class: 'calc-option-title' }, [
                            createElement('span', { textContent: srcDisplay.name }),
                            ...badges
                        ]),
                        createElement('div', { class: 'calc-option-summary muted', textContent: summary })
                    ])
                ]);

                optEl.addEventListener('mouseenter', () => {
                    popHighlightIdx = idx;
                    syncPopHighlight(false);
                });

                optEl.addEventListener('click', () => {
                    const res = resolveDeficitWithProducer(deficit.colKey, p, data, { autoExpand: true });
                    closeDeficitPopover();
                    renderTable();
                    scheduleUrlSync();
                    showToast(formatChainToast('Added', res.addedNames, res.updatedNames));
                });

                listEl.appendChild(optEl);
            });
            popHighlightIdx = 0;
            syncPopHighlight(false);
        };

        let filterInput = null;
        if (allProducers.length > 6) {
            filterInput = createFilterInput(`Filter ${allProducers.length} producers...`, renderProducers);
            deficitPopover.appendChild(filterInput);
        }

        renderProducers('');
        deficitPopover.appendChild(listEl);
        deficitPopover.classList.remove('hidden');
        positionDeficitPopover();
        focusFilter(filterInput);
    };

    const handleDeficitAction = (deficit, anchorBtn) => {
        if (!deficit) return;
        if (!deficit.isTag) {
            const unique = getUnambiguousProducer(deficit.colKey, deficit.bucketKey, data);
            const canDirectAuto = unique && !(unique.existingRow && unique.existingRow.autoTarget && unique.existingRow.autoTarget !== deficit.colKey);
            if (canDirectAuto) {
                closeDeficitPopover();
                const res = resolveDeficitWithProducer(deficit.colKey, unique, data, { autoExpand: true });
                renderTable();
                scheduleUrlSync();
                showToast(formatChainToast('Auto-built', res.addedNames, res.updatedNames));
                return;
            }
        }
        openDeficitPopover(deficit, anchorBtn);
    };

    const renderTotalCellContent = (td, totalData, col) => {
        renderFlowCellContent(td, totalData);
        const deficit = totalData && totalData.deficit;
        if (!deficit) return;

        let canResolve = false;
        if (deficit.isTag) {
            canResolve = getTagMembers(deficit.id).length > 0;
        } else {
            canResolve = findProducersForColumn(deficit.colKey, deficit.bucketKey, deficit.amount, data).producers.length > 0;
        }
        if (!canResolve) return;

        const btn = createElement('button', {
            type: 'button',
            class: 'calc-deficit-btn',
            title: deficit.isTag
                ? `Pick a specific item for #${col.name}`
                : `Add producer to cover ${col.name} deficit`,
            'aria-label': deficit.isTag
                ? `Pick item for ${col.name}`
                : `Resolve ${col.name} deficit`,
            textContent: deficit.isTag ? '+ Pick' : '+ Add'
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeficitAction(deficit, btn);
        });
        td.appendChild(btn);
    };

    const positionDropdown = () => {
        if (!activeSearchInput || searchDropdown.classList.contains('hidden')) return;
        const rect = activeSearchInput.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;
        const width = Math.min(Math.max(rect.width, 360), window.innerWidth - 24);
        const left = Math.min(Math.max(rect.left, 12), window.innerWidth - width - 12);

        searchDropdown.style.width = `${width}px`;
        searchDropdown.style.left = `${left}px`;

        if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
            searchDropdown.style.top = `${rect.bottom + 4}px`;
            searchDropdown.style.bottom = 'auto';
            searchDropdown.style.maxHeight = `${Math.min(360, Math.max(160, spaceBelow))}px`;
        } else {
            searchDropdown.style.top = 'auto';
            searchDropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            searchDropdown.style.maxHeight = `${Math.min(360, Math.max(160, spaceAbove))}px`;
        }
    };

    const updateHighlight = () => {
        const nodes = searchDropdown.querySelectorAll('.calc-search-option');
        nodes.forEach((node, idx) => {
            if (idx === highlightedIndex) {
                node.classList.add('highlighted');
                if (typeof node.scrollIntoView === 'function') {
                    node.scrollIntoView({ block: 'nearest' });
                }
            } else {
                node.classList.remove('highlighted');
            }
        });
    };

    const selectSearchOption = (opt) => {
        if (!opt) return;
        const res = addCalculatorRecipe(opt.rawRecipe._key, opt.tagSelections, 1);
        recomputeAutoMultipliers(data);
        closeDropdown();
        closeDeficitPopover();
        renderTable();
        scheduleUrlSync();
        const srcName = getSourceDisplay(opt.rawRecipe, data).name;
        if (res.merged) {
            showToast(`${srcName} multiplier increased to ×${res.row.multiplier}`);
        } else {
            showToast(`Added ${srcName}`);
        }
        if (activeSearchInput) {
            activeSearchInput.value = '';
            activeSearchInput.focus();
        }
    };

    const renderDropdown = (query) => {
        dropdownItems = searchRecipesForCalculator(query, data, 18);
        highlightedIndex = dropdownItems.length > 0 ? 0 : -1;
        searchDropdown.textContent = '';

        if (dropdownItems.length === 0) {
            searchDropdown.appendChild(createElement('div', {
                class: 'calc-search-empty muted',
                textContent: `No recipes found for "${query}"`
            }));
            searchDropdown.classList.remove('hidden');
            positionDropdown();
            return;
        }

        dropdownItems.forEach((opt, idx) => {
            const srcDisplay = getSourceDisplay(opt.rawRecipe, data);
            // Build preview of concrete or tag entries
            const resolvedPreview = {
                ...opt.rawRecipe,
                consumed: (opt.rawRecipe.consumed || []).map(e => (
                    e.tag && opt.tagSelections[e.tag]
                        ? { ...e, element: opt.tagSelections[e.tag], tag: undefined }
                        : e
                )),
                produced: (opt.rawRecipe.produced || []).map(e => (
                    e.tag && opt.tagSelections[e.tag]
                        ? { ...e, element: opt.tagSelections[e.tag], tag: undefined }
                        : e
                ))
            };
            const summary = getRecipeBriefSummary(resolvedPreview, data);
            const existing = findCalculatorRow(opt.rawRecipe._key, opt.tagSelections);

            const badges = [];
            if (opt.rawRecipe.time) {
                badges.push(createElement('span', {
                    class: 'calc-option-badge',
                    textContent: `${opt.rawRecipe.time}s`
                }));
            }
            if (existing) {
                badges.push(createElement('span', {
                    class: 'calc-option-badge is-added',
                    textContent: `In table ×${existing.multiplier}`
                }));
            }

            const optionEl = createElement('button', {
                type: 'button',
                class: `calc-search-option${idx === highlightedIndex ? ' highlighted' : ''}`,
                role: 'option'
            }, [
                srcDisplay.image
                    ? attachImgFallback(createElement('img', {
                        src: `/images/${srcDisplay.image}`,
                        alt: srcDisplay.name,
                        class: 'calc-option-img'
                    }))
                    : createElement('div', { class: 'calc-option-img-placeholder' }),
                createElement('div', { class: 'calc-option-text' }, [
                    createElement('div', { class: 'calc-option-title' }, [
                        createElement('span', { textContent: srcDisplay.name }),
                        ...badges
                    ]),
                    createElement('div', { class: 'calc-option-summary muted', textContent: summary })
                ])
            ]);

            optionEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectSearchOption(opt);
            });
            optionEl.addEventListener('mouseenter', () => {
                highlightedIndex = idx;
                updateHighlight();
            });

            searchDropdown.appendChild(optionEl);
        });

        searchDropdown.classList.remove('hidden');
        positionDropdown();
    };

    const updateNumbersInPlace = (editedRowId = null) => {
        const model = computeCalculatorTable(getCalculatorState(), data, window.unitSettings);

        model.rows.forEach(row => {
            const refs = activeRowRefs.get(row.id);
            if (!refs) return;
            if (refs.multInput && row.autoTarget && row.id !== editedRowId) {
                refs.multInput.value = formatMultiplierDisplay(row.multiplier);
                refs.multInput.title = `Auto-balanced: ${row.multiplier}`;
            }
            if (refs.powerCell) {
                renderPowerCellContent(refs.powerCell, row.power);
            }
            model.columns.forEach(col => {
                const td = refs.materialCells.get(col.key);
                if (td) {
                    renderFlowCellContent(td, row.cells[col.key]);
                }
            });
        });

        if (activePowerTotalCell) {
            renderPowerCellContent(activePowerTotalCell, model.totalPower);
        }
        model.columns.forEach(col => {
            const td = activeTotalRefs.get(col.key);
            if (td) {
                renderTotalCellContent(td, model.totals[col.key], col);
            }
        });
    };

    const renderTable = () => {
        const st = getCalculatorState();
        const model = computeCalculatorTable(st, data, window.unitSettings);

        powerCheckbox.checked = st.showPower;
        powerLabel.classList.toggle('is-active', Boolean(st.showPower));
        const n = model.rows.length;
        countBadge.textContent = `${n} ${n === 1 ? 'recipe' : 'recipes'}`;
        resetBtn.disabled = n === 0;
        copyLinkBtn.disabled = n === 0;
        emptyHint.classList.toggle('hidden', n > 0);

        // Count how many rows share each source (to decide when to highlight recipe summary)
        const sourceCounts = new Map();
        model.rows.forEach(r => {
            sourceCounts.set(r.rawRecipe.source, (sourceCounts.get(r.rawRecipe.source) || 0) + 1);
        });

        activeRowRefs = new Map();
        activeTotalRefs = new Map();
        activePowerTotalCell = null;

        const prevSearchVal = activeSearchInput ? activeSearchInput.value : '';

        // Build thead: narrow sticky icon column (no title), Source / Recipe, Count, then Power & Materials
        const headCells = [
            createElement('th', { class: 'calc-col-icon', 'aria-label': 'Source icon' }),
            createElement('th', { class: 'calc-col-source', textContent: 'Source / Recipe' }),
            createElement('th', { class: 'calc-col-count', textContent: 'Count' })
        ];

        if (model.showPowerColumn) {
            headCells.push(createElement('th', { class: 'calc-col-power' }, [
                createElement('div', { class: 'calc-col-header-inner' }, [
                    attachImgFallback(createElement('img', {
                        src: '/images/PowerMenu.png',
                        alt: 'Power',
                        class: 'calc-col-img'
                    })),
                    createElement('span', { class: 'calc-col-name', textContent: 'Power' })
                ])
            ]));
        }

        model.columns.forEach(col => {
            const href = col.isTag ? `#/recipes/tag/${col.id}` : `#/recipes/${col.id}`;
            const iconEl = col.isTag
                ? renderSmallTagMosaic(col.id, data)
                : (col.image
                    ? attachImgFallback(createElement('img', {
                        src: `/images/${col.image}`,
                        alt: col.name,
                        class: 'calc-col-img'
                    }))
                    : createElement('div', { class: 'calc-img-placeholder' }));

            const labelText = col.isTag ? `#${col.name}` : col.name;
            headCells.push(createElement('th', { class: `calc-col-material${col.isTag ? ' is-tag-col' : ''}` }, [
                createElement('a', {
                    href,
                    class: 'calc-col-link',
                    title: labelText
                }, [
                    iconEl,
                    createElement('span', { class: 'calc-col-name', textContent: labelText })
                ])
            ]));
        });

        const thead = createElement('thead', {}, [createElement('tr', {}, headCells)]);

        // Build tbody
        const bodyRows = [];

        model.rows.forEach(row => {
            const srcDisplay = getSourceDisplay(row.rawRecipe, data);
            const srcIcon = srcDisplay.image
                ? attachImgFallback(createElement('img', {
                    src: `/images/${srcDisplay.image}`,
                    alt: srcDisplay.name,
                    class: 'calc-source-img'
                }))
                : createElement('div', { class: 'calc-source-img-placeholder' });

            const srcIconNode = srcDisplay.href
                ? createElement('a', {
                    href: srcDisplay.href,
                    class: 'calc-icon-link',
                    title: srcDisplay.name,
                    'aria-label': srcDisplay.name
                }, [srcIcon])
                : createElement('div', {
                    class: 'calc-icon-link no-hover',
                    title: srcDisplay.name
                }, [srcIcon]);

            const srcNameNode = srcDisplay.href
                ? createElement('a', {
                    href: srcDisplay.href,
                    class: 'calc-source-link',
                    title: srcDisplay.name
                }, [
                    createElement('span', { class: 'calc-source-name', textContent: srcDisplay.name })
                ])
                : createElement('div', {
                    class: 'calc-source-link no-hover',
                    title: srcDisplay.name
                }, [
                    createElement('span', { class: 'calc-source-name', textContent: srcDisplay.name })
                ]);

            // Multiplier controls
            const isAutoRow = Boolean(row.autoTarget);
            const multInput = createElement('input', {
                type: 'number',
                class: 'calc-mult-input',
                min: '0',
                step: 'any',
                value: isAutoRow ? formatMultiplierDisplay(row.multiplier) : String(row.multiplier),
                title: isAutoRow ? `Auto-balanced: ${row.multiplier}` : undefined,
                'aria-label': `Multiplier for ${srcDisplay.name}`
            });

            let multControlEl = null;
            let autoPillEl = null;
            let trEl = null;

            const applyMult = (val, updateInputEl = false) => {
                const clean = Math.max(0, Math.round(val * 1e6) / 1e6);
                setCalculatorMultiplier(row.id, clean, { unlockAuto: true });
                if (multControlEl && multControlEl.classList.contains('is-auto')) {
                    multControlEl.classList.remove('is-auto');
                }
                if (trEl && trEl.classList.contains('is-auto-row')) {
                    trEl.classList.remove('is-auto-row');
                }
                if (autoPillEl) {
                    autoPillEl.remove();
                    autoPillEl = null;
                }
                multInput.removeAttribute('title');
                recomputeAutoMultipliers(data);
                if (updateInputEl) {
                    multInput.value = String(clean);
                }
                updateNumbersInPlace(row.id);
                scheduleUrlSync();
            };

            const decBtn = createElement('button', {
                type: 'button',
                class: 'calc-mult-btn',
                title: 'Decrease multiplier (Shift for -0.5)',
                'aria-label': `Decrease multiplier for ${srcDisplay.name}`,
                textContent: '−'
            });
            decBtn.addEventListener('click', (e) => {
                const step = e.shiftKey ? 0.5 : 1;
                const cur = parseFloat(multInput.value);
                applyMult((Number.isFinite(cur) ? cur : row.multiplier) - step, true);
            });

            const incBtn = createElement('button', {
                type: 'button',
                class: 'calc-mult-btn',
                title: 'Increase multiplier (Shift for +0.5)',
                'aria-label': `Increase multiplier for ${srcDisplay.name}`,
                textContent: '+'
            });
            incBtn.addEventListener('click', (e) => {
                const step = e.shiftKey ? 0.5 : 1;
                const cur = parseFloat(multInput.value);
                applyMult((Number.isFinite(cur) ? cur : row.multiplier) + step, true);
            });

            multInput.addEventListener('input', () => {
                const raw = multInput.value.trim();
                if (raw === '') {
                    applyMult(0, false);
                    return;
                }
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed) && parsed >= 0) {
                    applyMult(parsed, false);
                }
            });

            multInput.addEventListener('blur', () => {
                const parsed = parseFloat(multInput.value);
                if (!Number.isFinite(parsed) || parsed < 0) {
                    applyMult(0, true);
                } else {
                    const clean = Math.round(parsed * 1e6) / 1e6;
                    multInput.value = String(clean);
                }
            });

            const removeBtn = createElement('button', {
                type: 'button',
                class: 'calc-remove-btn',
                title: 'Remove recipe',
                'aria-label': `Remove ${srcDisplay.name}`,
                textContent: '×'
            });
            removeBtn.addEventListener('click', () => {
                removeCalculatorRow(row.id);
                recomputeAutoMultipliers(data);
                closeDeficitPopover();
                renderTable();
                scheduleUrlSync();
            });

            const metaChildren = [];
            if (isAutoRow) {
                const targetIsTag = row.autoTarget.startsWith('tag:');
                const targetId = row.autoTarget.slice(row.autoTarget.indexOf(':') + 1);
                const targetName = targetIsTag
                    ? `#${data.allTags[targetId]?.name || prettifyId(targetId)}`
                    : (data.allItems[targetId]?.name || prettifyId(targetId));
                autoPillEl = createElement('button', {
                    type: 'button',
                    class: 'calc-auto-pill',
                    title: `Auto-balanced to cover ${targetName} (click to switch to manual)`,
                    textContent: `Auto → ${targetName}`
                });
                autoPillEl.addEventListener('click', () => {
                    setCalculatorRowAutoTarget(row.id, null);
                    renderTable();
                    scheduleUrlSync();
                    showToast(`${srcDisplay.name} switched to manual`);
                });
                metaChildren.push(autoPillEl);
            }

            const needsSubtitle = (sourceCounts.get(row.rawRecipe.source) || 0) > 1 ||
                row.rawRecipe.source === 'heat' ||
                row.rawRecipe.source === 'cool' ||
                row.rawRecipe.source === 'emit' ||
                Boolean(row.rawRecipe.time);

            if (needsSubtitle) {
                const brief = getRecipeBriefSummary(row.resolvedRecipe, data);
                const timeNote = row.rawRecipe.time ? ` (${row.rawRecipe.time}s → rate)` : '';
                if (brief || timeNote) {
                    metaChildren.push(createElement('div', {
                        class: 'calc-source-subtitle muted',
                        textContent: `${brief}${timeNote}`,
                        title: `${brief}${timeNote}`
                    }));
                }
            }

            // Inline tag variant selectors (User Choice A3!)
            if (row.tagSlots && row.tagSlots.length > 0) {
                const selectsRow = createElement('div', { class: 'calc-tag-selects' });
                row.tagSlots.forEach(slot => {
                    const selectEl = createElement('select', {
                        class: 'calc-tag-select',
                        'aria-label': `Select ${slot.tagName}`
                    });
                    selectEl.appendChild(createElement('option', {
                        value: '',
                        textContent: `#Any ${slot.tagName} (${slot.members.length})`
                    }));
                    slot.members.forEach(m => {
                        const opt = createElement('option', {
                            value: m.id,
                            textContent: m.name
                        });
                        selectEl.appendChild(opt);
                    });
                    selectEl.value = slot.selectedItemId || '';

                    selectEl.addEventListener('change', () => {
                        const res = updateCalculatorRowTag(row.id, slot.tagId, selectEl.value || null);
                        recomputeAutoMultipliers(data);
                        closeDeficitPopover();
                        renderTable();
                        scheduleUrlSync();
                        if (res && res.merged) {
                            showToast('Merged into existing matching recipe row');
                        }
                    });
                    selectsRow.appendChild(selectEl);
                });
                metaChildren.push(selectsRow);
            }

            multControlEl = createElement('div', {
                class: `calc-mult-control${isAutoRow ? ' is-auto' : ''}`
            }, [decBtn, multInput, incBtn]);

            const iconCell = createElement('td', { class: 'calc-icon-cell' }, [srcIconNode]);
            const nameCell = createElement('td', { class: 'calc-name-cell' }, [
                srcNameNode,
                ...(metaChildren.length > 0 ? [createElement('div', { class: 'calc-source-meta' }, metaChildren)] : [])
            ]);
            const countCell = createElement('td', { class: 'calc-count-cell' }, [
                createElement('div', { class: 'calc-row-controls' }, [
                    multControlEl,
                    removeBtn
                ])
            ]);

            const trCells = [iconCell, nameCell, countCell];
            const rowRef = { multInput, powerCell: null, materialCells: new Map() };

            if (model.showPowerColumn) {
                const powerTd = createElement('td', { class: 'calc-cell calc-power-cell' });
                renderPowerCellContent(powerTd, row.power);
                rowRef.powerCell = powerTd;
                trCells.push(powerTd);
            }

            model.columns.forEach(col => {
                const td = createElement('td', { class: 'calc-cell' });
                renderFlowCellContent(td, row.cells[col.key]);
                rowRef.materialCells.set(col.key, td);
                trCells.push(td);
            });

            activeRowRefs.set(row.id, rowRef);
            trEl = createElement('tr', {
                class: `calc-recipe-row${isAutoRow ? ' is-auto-row' : ''}`,
                dataset: { rowId: row.id }
            }, trCells);
            bodyRows.push(trEl);
        });

        // Inline empty search row inside tbody
        const searchInput = createElement('input', {
            type: 'search',
            id: 'calc-add-search',
            class: 'recipe-search-input calc-inline-search',
            placeholder: '+ Search & add recipe (building, critter, material, tag)...',
            autocomplete: 'off',
            'aria-label': 'Search and add recipe to calculator'
        });
        searchInput.value = prevSearchVal;
        activeSearchInput = searchInput;

        searchInput.addEventListener('focus', () => {
            renderDropdown(searchInput.value);
        });
        searchInput.addEventListener('input', () => {
            renderDropdown(searchInput.value);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (searchDropdown.classList.contains('hidden')) {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    renderDropdown(searchInput.value);
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (dropdownItems.length > 0) {
                    highlightedIndex = (highlightedIndex + 1) % dropdownItems.length;
                    updateHighlight();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (dropdownItems.length > 0) {
                    highlightedIndex = (highlightedIndex - 1 + dropdownItems.length) % dropdownItems.length;
                    updateHighlight();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlightedIndex >= 0 && dropdownItems[highlightedIndex]) {
                    selectSearchOption(dropdownItems[highlightedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown();
            }
        });
        searchInput.addEventListener('blur', () => {
            setTimeout(closeDropdown, 150);
        });

        const searchPlusBtn = createElement('button', {
            type: 'button',
            class: 'calc-search-plus-btn',
            title: 'Add recipe',
            'aria-label': 'Focus recipe search',
            textContent: '+'
        });
        searchPlusBtn.addEventListener('click', () => {
            searchInput.focus();
        });

        const searchRowCells = [
            createElement('td', { class: 'calc-icon-cell calc-search-icon-cell' }, [searchPlusBtn]),
            createElement('td', { class: 'calc-search-cell', colspan: '2' }, [searchInput])
        ];
        const extraColsCount = (model.showPowerColumn ? 1 : 0) + model.columns.length;
        if (extraColsCount > 0) {
            searchRowCells.push(createElement('td', {
                class: 'calc-search-spacer',
                colspan: String(extraColsCount)
            }));
        }
        bodyRows.push(createElement('tr', { class: 'calc-search-row' }, searchRowCells));

        const tbody = createElement('tbody', {}, bodyRows);

        const tableChildren = [thead, tbody];

        // Totals footer
        if (model.rows.length > 0) {
            const totalCells = [
                createElement('td', { class: 'calc-icon-cell calc-total-icon', title: 'Total' }, [
                    createElement('span', { textContent: 'Σ' })
                ]),
                createElement('td', { class: 'calc-name-cell calc-total-label' }, [
                    createElement('span', { textContent: 'Total' })
                ]),
                createElement('td', { class: 'calc-count-cell calc-total-count' })
            ];

            if (model.showPowerColumn) {
                const powerTotalTd = createElement('td', { class: 'calc-cell calc-total-cell calc-power-cell' });
                renderPowerCellContent(powerTotalTd, model.totalPower);
                activePowerTotalCell = powerTotalTd;
                totalCells.push(powerTotalTd);
            }

            model.columns.forEach(col => {
                const td = createElement('td', { class: 'calc-cell calc-total-cell' });
                renderTotalCellContent(td, model.totals[col.key], col);
                activeTotalRefs.set(col.key, td);
                totalCells.push(td);
            });

            tableChildren.push(createElement('tfoot', {}, [
                createElement('tr', { class: 'calc-total-row' }, totalCells)
            ]));
        }

        tableWrapper.textContent = '';
        tableWrapper.appendChild(createElement('table', { class: 'calc-table' }, tableChildren));
    };

    // Event wiring
    powerCheckbox.addEventListener('change', () => {
        setCalculatorShowPower(powerCheckbox.checked);
        renderTable();
        scheduleUrlSync();
    });

    let copyIconTimer = null;
    copyLinkBtn.addEventListener('click', () => {
        syncUrlNow();
        const urlToCopy = window.location.href;
        const flashCopied = () => {
            copyLinkBtn.textContent = '';
            copyLinkBtn.appendChild(createSvgIcon('check', 'btn-svg-icon'));
            copyLinkBtn.classList.add('is-copied');
            copyLinkBtn.title = 'Copied!';
            showToast('Link copied!');
            if (copyIconTimer) clearTimeout(copyIconTimer);
            copyIconTimer = setTimeout(() => {
                copyLinkBtn.textContent = '';
                copyLinkBtn.appendChild(createSvgIcon('link', 'btn-svg-icon'));
                copyLinkBtn.classList.remove('is-copied');
                copyLinkBtn.title = 'Copy link';
            }, 2000);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(urlToCopy).then(flashCopied).catch(() => {
                showToast('Failed to copy link');
            });
        } else {
            showToast('Clipboard unavailable');
        }
    });

    const closeResetDialog = () => {
        if (resetDialog.open) resetDialog.close();
    };

    resetBtn.addEventListener('click', () => {
        const count = getCalculatorState().rows.length;
        if (count === 0) return;
        resetDialogMsg.textContent = `Remove all ${count} ${count === 1 ? 'recipe' : 'recipes'} from the calculator? This will clear your saved table.`;
        resetDialog.showModal();
    });

    cancelResetBtn.addEventListener('click', closeResetDialog);
    confirmResetBtn.addEventListener('click', () => {
        resetCalculatorState();
        closeResetDialog();
        closeDeficitPopover();
        renderTable();
        syncUrlNow();
        showToast('Calculator cleared');
    });

    resetDialog.addEventListener('click', (e) => {
        const rect = resetDialog.getBoundingClientRect();
        const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!inDialog) closeResetDialog();
    });

    const onSettingsUpdate = () => {
        closeDeficitPopover();
        renderTable();
    };
    window.addEventListener('settingsupdated', onSettingsUpdate);

    const onRouteUpdate = (e) => {
        if (e.detail && e.detail.path && e.detail.path.startsWith('/calculator')) {
            applyPathState(e.detail.path);
            closeDeficitPopover();
            renderTable();
            syncUrlNow();
        }
    };
    window.addEventListener('routeupdate', onRouteUpdate);

    const onViewportChange = () => {
        positionDropdown();
        positionDeficitPopover();
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    const onOutsideClick = (e) => {
        if (deficitPopover.classList.contains('hidden')) return;
        const t = e.target;
        if (deficitPopover.contains && deficitPopover.contains(t)) return;
        if (activeDeficitAnchor && (t === activeDeficitAnchor || (activeDeficitAnchor.contains && activeDeficitAnchor.contains(t)))) return;
        closeDeficitPopover();
    };
    const onGlobalKeyDown = (e) => {
        if (deficitPopover.classList.contains('hidden')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeDeficitPopover();
        } else if (activePopoverNav) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activePopoverNav.move(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activePopoverNav.move(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                activePopoverNav.confirm();
            }
        }
    };
    window.addEventListener('mousedown', onOutsideClick);
    window.addEventListener('keydown', onGlobalKeyDown);

    renderTable();
    syncUrlNow();

    return () => {
        window.removeEventListener('settingsupdated', onSettingsUpdate);
        window.removeEventListener('routeupdate', onRouteUpdate);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        window.removeEventListener('mousedown', onOutsideClick);
        window.removeEventListener('keydown', onGlobalKeyDown);
        if (urlSyncTimeout) clearTimeout(urlSyncTimeout);
        if (toastTimer) clearTimeout(toastTimer);
        if (copyIconTimer) clearTimeout(copyIconTimer);
        closeResetDialog();
        closeDeficitPopover();
    };
}
