// /sw.js — Pelmeniboiler service worker.
// Makes the site installable and readable offline. Pure, hand-written, no
// dependencies. The VERSION below is stamped by the build (build/build.mjs)
// with the same content hash used for ?v= asset cache-busting, so every deploy
// that changes an asset also retires the old cache.

const VERSION = '4f67a537';
const CACHE = `pelmeniboiler-${VERSION}`;

// The minimal shell needed to render pages offline. Everything else (articles,
// photos, localization) is cached on demand as you read it.
const PRECACHE = [
    '/',
    '/styles/pelmeni2025.css',
    '/scripts/theme-loader.js',
    '/scripts/module-loader.js',
    '/scripts/blog-loader.js',
    '/scripts/settings.js',
    '/scripts/start-menu.js',
    '/scripts/share.js',
    '/logo/favicon.svg',
    '/logo/shzh.svg',
    '/manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // only cache our own site

    if (req.mode === 'navigate') {
        // Pages: network-first so content is always fresh online, with the
        // cached copy as the offline fallback (and the hub as a last resort).
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy));
                    return res;
                })
                .catch(() =>
                    caches.match(req, { ignoreSearch: true })
                        .then((hit) => hit || caches.match('/'))),
        );
        return;
    }

    // Assets: cache-first (they carry ?v= content hashes, so a stale hit is
    // impossible across deploys — a new page references new URLs). ignoreSearch
    // lets a precached bare URL satisfy its ?v= variant and vice versa.
    event.respondWith(
        caches.match(req, { ignoreSearch: true }).then((hit) => {
            if (hit) return hit;
            return fetch(req).then((res) => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy));
                }
                return res;
            });
        }),
    );
});
