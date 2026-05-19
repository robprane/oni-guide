export function createElement(tag, attributes = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(attributes || {})) {
        if (key === 'className' || key === 'class') {
            el.className = value;
        } else if (key === 'dataset') {
            for (const [dKey, dValue] of Object.entries(value)) {
                el.dataset[dKey] = dValue;
            }
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (key === 'textContent' || key === 'innerText') {
            el[key] = value;
        } else {
            el.setAttribute(key, value);
        }
    }

    if (!Array.isArray(children)) {
        children = [children];
    }

    for (const child of children) {
        if (child == null) continue;
        if (typeof child === 'string' || typeof child === 'number') {
            el.appendChild(document.createTextNode(child.toString()));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    }

    return el;
}
