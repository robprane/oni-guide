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
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }

    console.log('ONI Guide initialized.');
});