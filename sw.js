// Mandarin Master — Service Worker v8
// Network-first for app files, cache as fallback for offline

const CACHE_NAME = 'mandarin-master-v8';
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
            console.log('[SW] Caching app shell v3');
            return cache.addAll(SHELL_ASSETS);
        })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate: delete ALL old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => {
                    console.log('[SW] Deleting old cache:', key);
                    return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim(); // Take control immediately
});

// Fetch: NETWORK-FIRST for local assets (always get latest code)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and external API calls
    if (event.request.method !== 'GET') return;
    if (url.hostname.includes('supabase') || url.hostname.includes('paypal')) return;

    // CDN resources — network first, cache fallback
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

    // Local assets — NETWORK FIRST, cache fallback (ensures updates are seen)
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request).then(response => {
                // Update cache with fresh response
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => {
                // Network failed — serve from cache (offline support)
                return caches.match(event.request, { ignoreSearch: true }).then(cached => {
                    if (cached) return cached;
                    // Navigation fallback
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
            })
        );
    }
});
