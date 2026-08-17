// ============================================================
// sw.js  --  Order2Me Service Worker
// ============================================================
// Provides:
//   1. PWA shell caching (app shell strategy)
//   2. Offline fallback for cached assets
// ============================================================

const CACHE_NAME = 'order2me-v22';

// Assets to cache on install (app shell)
const APP_SHELL = [
    './',
    './index.html',
    './login.html',
    './signup.html',
    './customer.html',
    './owner.html',
    './history.html',
    './admin.html',
    './pending.html',
    './manifest.json',
    './css/style.css',
    './images/logo.png',
    './js/supabase.js',
    './js/auth.js',
    './js/profile.js',
    './js/notification-permissions.js',
    './js/customer.js',
    './js/owner.js',
    './js/history.js',
    './js/admin.js',
    './js/pending.js',
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
});

// ── Activate: remove old caches ──────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            ),
        ])
    );
});

// ── Fetch: network-first, cache fallback ─────────────────────
self.addEventListener('fetch', (event) => {
    // Skip non-GET and cross-origin requests (e.g. Supabase API)
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname === '/api/config') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Update cache with fresh response
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) =>
                        cache.put(event.request, clone)
                    );
                }
                return response;
            })
            .catch(() =>
                // Network failed → serve from cache
                caches.match(event.request)
            )
    );
});

// ── Notifications: focus an existing app window or open one ──
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = new URL(
        event.notification.data?.url || './customer.html',
        self.location.origin
    ).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                const existingClient = windowClients.find((client) =>
                    client.url.startsWith(self.location.origin)
                );

                if (existingClient) {
                    return existingClient.focus().then((client) => {
                        if ('navigate' in client) return client.navigate(targetUrl);
                        return client;
                    });
                }

                return clients.openWindow(targetUrl);
            })
    );
});
