import { Router } from './router.js?v=6';
import { getCalculatorRowCount } from './calculator-state.js?v=6';

function updateNavCalcBadge() {
    const badge = document.getElementById('nav-calc-badge');
    if (!badge) return;
    const count = getCalculatorRowCount();
    if (count > 0) {
        badge.textContent = String(count);
        badge.classList.remove('hidden');
    } else {
        badge.textContent = '';
        badge.classList.add('hidden');
    }
}

// Main application entry point
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Router
    const router = new Router();

    // Keep calculator badge in navbar synced
    updateNavCalcBadge();
    window.addEventListener('calculatorupdated', updateNavCalcBadge);

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