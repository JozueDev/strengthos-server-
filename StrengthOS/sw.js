const CACHE_NAME = 'strengthos-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/admin.html',
    '/styles.css',
    '/script.js',
    '/dashboard.js',
    '/admin.js',
    '/images/logo.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
