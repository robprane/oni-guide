const CACHE_NAME = 'oni-guide-v3';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/css/themes.css',
    '/js/main.js',
    '/js/theme.js',
    '/js/router.js',
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
    // Network First strategy
    e.respondWith(
        fetch(e.request).then((response) => {
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
