import re

with open('js/pages/recipes.js', 'r') as f:
    content = f.read()

# Let's replace the detail modal code.
# The original code looks like:
# function showDetailModal(item) {
#     let modal = document.getElementById('detail-modal');
#     if (!modal) {
#         modal = document.createElement('div');
# ...

# We need to rewrite `showDetailModal`, `closeModal`, and we also need to change how clicks open it.
# Wait, let's write a python script to parse and replace the relevant parts.

def replace_block(pattern, replacement, string):
    return re.sub(pattern, replacement, string, flags=re.DOTALL)

# Let's find showDetailModal and closeModal
# And replace them entirely

new_funcs = """function showDetailModal(item) {
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
        `;

        // Ensure backdrop styling is consistent
        const style = document.createElement('style');
        style.textContent = `
            #detail-dialog::backdrop {
                background: rgba(0,0,0,0.5);
            }
        `;
        document.head.appendChild(style);

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
                <img src="/images/${item.image}" alt="${item.name}" style="width: 64px; height: 64px; object-fit: contain;">
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
            rHtml += `<div style="display:flex; align-items:center; gap:0.2rem;"><img src="/images/${src ? src.image : ''}" style="width:1.5em; height:1.5em;" title="${src ? src.name : r.source}"> <strong>${src ? src.name : r.source}</strong></div>`;
        }

        if (r.consumed && r.consumed.length > 0) {
            rHtml += `<span style="color:#888;">consumes</span>`;
            r.consumed.forEach(c => {
                let el = allItems[c.element];
                rHtml += `<div style="display:flex; align-items:center; gap:0.2rem; background: rgba(255,0,0,0.1); padding: 0.2rem 0.4rem; border-radius: .25em;"><img src="/images/${el ? el.image : ''}" style="width:auto; height:1em;" title="${el ? el.name : c.element}"> ${formatAmount(c)} ${el ? el.name : c.element}</div>`;
            });
        }

        if (r.produced && r.produced.length > 0) {
            rHtml += `<span style="color:#888;">produces</span>`;
            r.produced.forEach(p => {
                let el = allItems[p.element];
                rHtml += `<div style="display:flex; align-items:center; gap:0.2rem; background: rgba(0,255,0,0.1); padding: 0.2rem 0.4rem; border-radius: .25em;"><img src="/images/${el ? el.image : ''}" style="width:auto; height:1em;" title="${el ? el.name : p.element}"> ${formatAmount(p)} ${el ? el.name : p.element}</div>`;
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
window.closeModal = closeModal;"""

content = re.sub(r"function showDetailModal\(item\) \{.*?window\.closeModal = closeModal;", new_funcs, content, flags=re.DOTALL)

with open('js/pages/recipes.js', 'w') as f:
    f.write(content)
