import { renderHome } from './pages/home.js';
import { renderCanvas } from './pages/canvas.js';
import { renderRecipes } from './pages/recipes.js';

const routes = {
    '/': renderRecipes,
    '/canvas': renderCanvas,
    '/recipes': renderRecipes
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

        // Find base route and handler
        let routeHandler = routes[path];
        let baseRoute = path;

        if (!routeHandler) {
            baseRoute = Object.keys(routes).find(r => path.startsWith(r) && r !== '/');
            if (baseRoute) {
                routeHandler = routes[baseRoute];
            } else {
                // Fallback to home
                baseRoute = '/';
                routeHandler = routes['/'];
                path = '/';
            }
        }

        // Update active class on navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            const route = link.getAttribute('data-route');
            if (route === path || (path.startsWith(route) && route !== '/')) {
                link.classList.add('active');
            }
        });

        // If base route is the same, just dispatch a routeupdate event
        if (this.currentBaseRoute === baseRoute) {
            const event = new CustomEvent('routeupdate', { detail: { path: path } });
            window.dispatchEvent(event);
            return;
        }

        this.currentBaseRoute = baseRoute;

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
        const newHash = url.startsWith('#') ? url : '#' + url;
        if (window.location.hash === newHash) {
            // If the hash isn't changing, hashchange won't fire, so manually handle route
            this.handleRoute();
        } else {
            window.location.hash = newHash;
        }
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