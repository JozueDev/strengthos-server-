const CACHE_NAME = 'strengthos-cache-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/calendar.html',
    '/progress.html',
    '/security.html',
    '/admin.html',
    '/admin-routines.html',
    '/admin-progress.html',
    '/styles.css',
    '/script.js',
    '/dashboard.js',
    '/calendar.js',
    '/progress.js',
    '/admin.js',
    '/admin-routines.js',
    '/admin-progress.js',
    '/images/logo.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))
        )
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
