// Mandarin Master — Service Worker
// Provides offline caching for the PWA shell and HSK data

const CACHE_NAME = 'mandarin-master-v1';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/js/supabase.js',
    '/js/auth.js',
    '/data/hsk1.js',
    '/data/hsk2.js',
    '/data/hsk3.js',
    '/data/hsk4.js',
    '/data/hsk5.js',
    '/data/hsk6.js',
    '/manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching app shell');
            return cache.addAll(SHELL_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network-first for API/auth, Cache-first for static assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and Supabase/PayPal API calls
    if (event.request.method !== 'GET') return;
    if (url.hostname.includes('supabase') || url.hostname.includes('paypal')) return;

    // For CDN resources (HanziWriter, html2canvas, Supabase SDK) — network first, cache fallback
    if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('unpkg.com')) {
        event.respondWith(
            fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // For local assets — cache first, network fallback
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            }).catch(() => {
                // Return offline fallback for navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            })
        );
    }
});
