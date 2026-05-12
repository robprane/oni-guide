import { Router } from './router.js';

// Main application entry point
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Router
    const router = new Router();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration);

                // Optional: Update when a new service worker is available
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Automatically reload to apply the new worker
                            window.location.reload();
                        }
                    });
                });

            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }

    console.log('ONI Guide initialized.');
});