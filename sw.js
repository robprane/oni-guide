const CACHE_NAME = 'oni-guide-v4';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css?v=3',
    '/css/themes.css?v=3',
    '/js/main.js?v=3',
    '/js/theme.js?v=3',
    '/js/router.js?v=3',
    '/js/pages/recipes.js?v=3',
    '/js/utils.js?v=3',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Delete old caches when a new service worker is activated
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Network First strategy: revalidate HTML/JS/CSS/JSON against server (ETag/304)
    // so deploys never mix stale cached scripts with newly deployed JSON data.
    const url = new URL(e.request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const isImage = isSameOrigin && url.pathname.startsWith('/images/');
    const networkRequest = (isSameOrigin && e.request.method === 'GET' && !isImage)
        ? new Request(e.request, { cache: 'no-cache' })
        : e.request;

    e.respondWith(
        fetch(networkRequest).then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
            }

            // Clone the response because it's a stream and can only be consumed once
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
                .then((cache) => {
                    // Only cache GET requests (avoid caching API calls, POSTs etc if they were present, though it's mainly static here)
                    if (e.request.method === 'GET' && e.request.url.startsWith(self.location.origin)) {
                        cache.put(e.request, responseToCache);
                    }
                });

            return response;
        }).catch(() => {
            // If network fails, fallback to cache
            return caches.match(e.request);
        })
    );
});
