let materialsData = null;
let buildingsData = null;
let recipesData = null;

async function loadData() {
    if (!materialsData || !buildingsData || !recipesData) {
        try {
            const [materialsRes, buildingsRes, recipesRes] = await Promise.all([
                fetch('/data/materials.json'),
                fetch('/data/buildings.json'),
                fetch('/data/recipes.json')
            ]);
            materialsData = await materialsRes.json();
            buildingsData = await buildingsRes.json();
            recipesData = await recipesRes.json();
        } catch (error) {
            console.error("Failed to load data:", error);
        }
    }
}

function getImagePath(name) {
    if (!name) return '';
    return `/images/${name.replace(/\s+/g, '').replace(/'/g, '')}.png`;
}

export async function renderRecipes(container, currentPath) {
    container.innerHTML = `
        <div class="container" style="display: flex; flex-direction: column; gap: 1rem;">
            <h2>Database</h2>
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                <button class="filter-btn active" data-filter="recipes">Recipes</button>
                <button class="filter-btn" data-filter="materials">Materials</button>
                <button class="filter-btn" data-filter="buildings">Buildings</button>
            </div>
            <input type="text" id="recipe-search" placeholder="Search..." style="padding: 0.5rem; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--input-text);">

            <div id="recipe-results" style="display: flex; flex-direction: column; gap: 1rem;">
                Loading...
            </div>
        </div>
    `;

    await loadData();

    const searchInput = document.getElementById('recipe-search');
    const resultsContainer = document.getElementById('recipe-results');
    const filterBtns = document.querySelectorAll('.filter-btn');
    let currentFilter = 'recipes';


    function renderResults(query = '') {
        resultsContainer.innerHTML = '';
        const q = query.toLowerCase();

        resultsContainer.style.display = 'grid';
        resultsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';

        let results = [];

        if (currentFilter === 'recipes') {
            let filteredRecipes = recipesData;
            if (q) {
                filteredRecipes = recipesData.filter(item => {
                    let text = (item.source || '').toLowerCase();
                    if (item.consumed) {
                        item.consumed.forEach(c => text += ' ' + (c.element || '').toLowerCase());
                    }
                    if (item.produced) {
                        item.produced.forEach(p => text += ' ' + (p.element || '').toLowerCase());
                    }
                    return text.includes(q);
                });
            }
            results = results.concat(filteredRecipes.map((item, idx) => ({...item, id: 'recipe_' + idx, name: item.source, _type: 'recipe'})));
        }

        if (currentFilter === 'materials') {
            const m = materialsData.filter(item => item.name.toLowerCase().includes(q));
            results = results.concat(m.map(item => ({...item, _type: 'material'})));
        }

        if (currentFilter === 'buildings') {
            const b = buildingsData.filter(item => item.name.toLowerCase().includes(q));
            results = results.concat(b.map(item => ({...item, _type: 'building'})));
        }

        if (results.length === 0) {
            resultsContainer.innerHTML = '<p>No results found.</p>';
            return;
        }

        results.forEach(item => {
            const card = document.createElement('div');
            card.style.cssText = `
                background: var(--card-bg);
                padding: 1rem;
                border-radius: 8px;
                border: 1px solid var(--border-color);
                cursor: pointer;
            `;

            if (item._type === 'recipe') {
                let headerExtra = '';
                if (item.temp !== undefined) {
                    headerExtra = `<p style="font-size: 0.9rem; color: #888;">Target Temp: ${item.temp}°C</p>`;
                }
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <img src="${getImagePath(item.source)}" alt="${item.source}" style="width: 32px; height: 32px; object-fit: contain;">
                        <h3 style="margin: 0;">${item.source} <span style="font-size: 0.8rem; color: #888;">(Recipe)</span></h3>
                    </div>
                    ${headerExtra}
                `;
            } else if (item._type === 'material') {
                card.innerHTML = `
                    <h3>${item.name} <span style="font-size: 0.8rem; color: #888;">(Material)</span></h3>
                    <p>Type: ${item.type}</p>
                    <p>${item.description}</p>
                `;
            } else {
                card.innerHTML = `
                    <h3>${item.name} <span style="font-size: 0.8rem; color: #888;">(Building)</span></h3>
                    <p>Category: ${item.category}</p>
                    <p>${item.description}</p>
                `;
            }

            card.addEventListener('click', () => {
                showDetailModal(item);
            });

            resultsContainer.appendChild(card);
        });
    }

    searchInput.addEventListener('input', (e) => renderResults(e.target.value));

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderResults(searchInput.value);
        });
    });

    // Add some simple CSS for filter buttons inline for now
    const style = document.createElement('style');
    style.textContent = `
        .filter-btn { padding: 0.5rem 1rem; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); border-radius: 4px; cursor: pointer; }
        .filter-btn.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
    `;
    container.appendChild(style);

    renderResults();

    // Check if deep linked (e.g., /recipes/water)
    const pathParts = currentPath.split('/');
    if (pathParts.length > 2 && pathParts[2]) {
        const id = pathParts[2];
        const item = materialsData.find(m => m.id === id) || buildingsData.find(b => b.id === id);
        if (item) {
            item._type = materialsData.find(m => m.id === id) ? 'material' : 'building';
            showDetailModal(item);
        }
    }
}


function showDetailModal(item) {
    let modal = document.getElementById('detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detail-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;
            z-index: 1000;
        `;
        const content = document.createElement('div');
        content.id = 'modal-content';
        content.style.cssText = `
            background: var(--bg-color); padding: 2rem; border-radius: 8px;
            max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;
            border: 1px solid var(--border-color);
        `;
        modal.appendChild(content);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.body.appendChild(modal);
    }

    const content = modal.querySelector('#modal-content');

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
    `;

    if (item._type === 'recipe') {
        html += `<img src="${getImagePath(item.source)}" alt="${item.source}" style="width: 32px; height: 32px; object-fit: contain;">`;
    }

    html += `
            ${item.name}</h2>
            <button onclick="document.getElementById('detail-modal').style.display='none'" style="cursor:pointer; background:none; border:none; color:var(--text-color); font-size:1.5rem;">&times;</button>
        </div>
    `;

    if (item.description) {
        html += `<p><i>${item.description}</i></p>`;
    }

    if (item._type === 'material') {
        html += `
            <div style="margin-top: 1rem;">
                <p><strong>Type:</strong> ${item.type}</p>
        `;
        if (item.freezing_point !== undefined) html += `<p><strong>Freezing Point:</strong> ${item.freezing_point}°C (Forms: ${item.freezing_product})</p>`;
        if (item.melting_point !== undefined) html += `<p><strong>Melting Point:</strong> ${item.melting_point}°C (Forms: ${item.melting_product})</p>`;
        if (item.boiling_point !== undefined) html += `<p><strong>Boiling Point:</strong> ${item.boiling_point}°C (Forms: ${item.boiling_product})</p>`;
        html += `</div>`;
    } else if (item._type === 'building') {
        html += `
            <div style="margin-top: 1rem;">
                <p><strong>Category:</strong> ${item.category}</p>
                <p><strong>Power:</strong> ${item.power_consumption ? item.power_consumption + ' W' : 'None'}</p>

                <h4 style="margin-top: 1rem;">Inputs</h4>
                <ul>
                    ${item.inputs ? item.inputs.map(i => `<li>${i.amount} ${i.unit} of ${i.material}</li>`).join('') : 'None'}
                </ul>

                <h4 style="margin-top: 1rem;">Outputs</h4>
                <ul>
                    ${item.outputs ? item.outputs.map(o => `<li>${o.amount} ${o.unit} of ${o.material}</li>`).join('') : 'None'}
                </ul>
            </div>
        `;
    } else if (item._type === 'recipe') {
        let consumedHtml = '';
        if (item.consumed && item.consumed.length > 0) {
            consumedHtml = item.consumed.map(c => `
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <img src="${getImagePath(c.element)}" alt="${c.element}" style="width: 24px; height: 24px; object-fit: contain;">
                    <span style="color: #e74c3c;">${c.volume} ${c.unit}${c.per ? '/' + c.per : ''} ${c.element}</span>
                </div>
            `).join('');
        } else {
            consumedHtml = '<p style="color: #888; font-style: italic;">None</p>';
        }

        let producedHtml = '';
        if (item.produced && item.produced.length > 0) {
            producedHtml = item.produced.map(p => `
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <img src="${getImagePath(p.element)}" alt="${p.element}" style="width: 24px; height: 24px; object-fit: contain;">
                    <span style="color: #2ecc71;">${p.volume} ${p.unit}${p.per ? '/' + p.per : ''} ${p.element}</span>
                </div>
            `).join('');
        } else {
            producedHtml = '<p style="color: #888; font-style: italic;">None</p>';
        }

        let headerExtra = '';
        if (item.temp !== undefined) {
            headerExtra = `<p style="margin-top: 1rem; font-size: 0.9rem; color: #888;">Target Temp: ${item.temp}°C</p>`;
        }

        html += `
            ${headerExtra}
            <div style="display: flex; margin-top: 1rem; gap: 1rem;">
                <div style="flex: 1;">
                    <h4 style="margin-bottom: 0.5rem; margin-top: 0;">Consumed:</h4>
                    ${consumedHtml}
                </div>
                <div style="flex: 1;">
                    <h4 style="margin-bottom: 0.5rem; margin-top: 0;">Produced:</h4>
                    ${producedHtml}
                </div>
            </div>
        `;
    }

    content.innerHTML = html;
    modal.style.display = 'flex';

    content.querySelector('button').onclick = closeModal;
}

function closeModal() {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.style.display = 'none';

}
// Expose for inline onclick
window.closeModal = closeModal;
