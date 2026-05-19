import { createElement } from '../utils.js';

export function renderHome(container) {
    container.textContent = ''; // Clear container

    const content = createElement('div', { class: 'container home-container' }, [
        createElement('h1', { textContent: 'Welcome to ONI.guide' }),
        createElement('p', { textContent: 'Your interactive companion for Oxygen Not Included.' }),
        createElement('div', { class: 'home-grid' }, [
            createElement('div', { class: 'home-card' }, [
                createElement('h2', { textContent: 'Recipes Database' }),
                createElement('p', { textContent: 'Browse building requirements, material transitions, and production chains.' }),
                createElement('a', {
                    href: '#/recipes',
                    class: 'nav-link primary-link',
                    dataset: { route: '/recipes' },
                    textContent: 'View Recipes'
                })
            ]),
            createElement('div', { class: 'home-card' }, [
                createElement('h2', { textContent: 'Interactive Canvas' }),
                createElement('p', { textContent: 'Plan your Auto-Sweeper layouts with our interactive simulator.' }),
                createElement('a', {
                    href: '#/canvas',
                    class: 'nav-link primary-link',
                    dataset: { route: '/canvas' },
                    textContent: 'Open Canvas'
                })
            ])
        ])
    ]);

    container.appendChild(content);
}
