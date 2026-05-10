import { renderHome } from './pages/home.js';
import { renderCanvas } from './pages/canvas.js';
import { renderRecipes } from './pages/recipes.js';
import { renderDocs } from './pages/docs.js';

const routes = {
    '/': renderHome,
    '/canvas': renderCanvas,
    '/recipes': renderRecipes,
    '/docs': renderDocs
};

export class Router {
    constructor() {
        this.appContent = document.getElementById('app-content');

        // Handle hashchange events (back/forward browser buttons)
        window.addEventListener('hashchange', this.handleRoute.bind(this));

        // Initialize routing
        this.handleRoute();
    }

    // Handles the actual routing logic based on the current URL
    handleRoute() {
        let path = window.location.hash.slice(1) || '/';

        // Basic handler for sub-routes, treating e.g. /recipes/water as /recipes
        let routeHandler = routes[path];

        if (!routeHandler) {
            // Find base route
            const baseRoute = Object.keys(routes).find(r => path.startsWith(r) && r !== '/');
            if (baseRoute) {
                routeHandler = routes[baseRoute];
            } else {
                // Fallback to home
                routeHandler = routes['/'];
                path = '/';
            }
        }

        // Update active class on navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === path || (path.startsWith(link.getAttribute('href')) && link.getAttribute('href') !== '/')) {
                link.classList.add('active');
            }
        });

        // Destroy old page resources if any
        if (this.currentCleanup) {
            this.currentCleanup();
            this.currentCleanup = null;
        }

        // Render the page
        const cleanup = routeHandler(this.appContent, path);
        if (cleanup && typeof cleanup === 'function') {
            this.currentCleanup = cleanup;
        } else if (cleanup instanceof Promise) {
            cleanup.then(fn => {
                if (typeof fn === 'function') this.currentCleanup = fn;
            });
        }

        // Re-attach link event listeners for any new links rendered
        this.attachLinkListeners();
    }

    // Navigate programmatically
    navigate(url) {
        if (url.startsWith('#')) {
            window.location.hash = url;
        } else {
            window.location.hash = '#' + url;
        }
        // hashchange event will trigger handleRoute
    }

    // Intercept clicks on local links
    attachLinkListeners() {
        const links = document.querySelectorAll('a[data-route]');
        links.forEach(link => {
            // Prevent multiple attachments
            if (link.dataset.routerAttached) return;

            link.addEventListener('click', (e) => {
                const url = link.getAttribute('data-route');
                if (url) {
                    e.preventDefault();
                    this.navigate(url);
                }
            });
            link.dataset.routerAttached = true;
        });
    }
}