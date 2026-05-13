import re

with open('js/router.js', 'r') as f:
    content = f.read()

# We need to add state to remember the current base route
# and check if the base route is the same as before

new_handle_route = """    // Handles the actual routing logic based on the current URL
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
    }"""

content = re.sub(r"    // Handles the actual routing logic based on the current URL\n    handleRoute\(\) \{.*?\n        this\.attachLinkListeners\(\);\n    \}", new_handle_route, content, flags=re.DOTALL)

with open('js/router.js', 'w') as f:
    f.write(content)
