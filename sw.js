// /sw.js — Pelmeniboiler service worker.
// Makes the site installable and readable offline. Pure, hand-written, no
// dependencies. The VERSION below is stamped by the build (build/build.mjs)
// with the same content hash used for ?v= asset cache-busting, so every deploy
// that changes an asset also retires the old cache.

const VERSION = '350f96cf';
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
    '/scripts/eink-dither.js',
    '/scripts/notify-bell.js',
    '/scripts/zman-clock.js',
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

// --- New-post notifications (opt-in via the bell in the installed app) ---
// Serverless: no push service, no subscription database. The worker simply
// re-reads our own static blog-manifest.json when the browser wakes it
// (periodic background sync, Chromium/installed only) or when the open app
// asks, and compares against what it last saw. Prefs + last-seen live in the
// Cache API because service workers can't touch localStorage.

const META_CACHE = 'pelmeniboiler-meta'; // survives version bumps on purpose

async function readMeta(key, fallback) {
    try {
        const cache = await caches.open(META_CACHE);
        const hit = await cache.match(key);
        return hit ? await hit.json() : fallback;
    } catch { return fallback; }
}

async function writeMeta(key, value) {
    const cache = await caches.open(META_CACHE);
    await cache.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
}

async function checkForNewPosts() {
    const prefs = await readMeta('/notify-prefs', null);
    if (!prefs || !prefs.enabled) return;

    let manifest;
    try {
        manifest = await (await fetch('/blog/blog-manifest.json', { cache: 'no-store' })).json();
    } catch { return; } // offline — try again next wake
    if (!Array.isArray(manifest)) return;

    const seen = await readMeta('/notify-seen', null);
    const current = manifest.map((p) => p.filename);
    if (seen === null) {
        // First run: baseline silently so enabling the bell doesn't spam
        // notifications for every post that already exists.
        await writeMeta('/notify-seen', current);
        return;
    }

    const seenSet = new Set(seen);
    const fresh = manifest.filter((p) => !seenSet.has(p.filename))
        .filter((p) => prefs.all || (p.keywords || []).some((k) => prefs.keywords.includes(k)));

    for (const post of fresh.slice(0, 3)) { // cap a burst of posts at 3 notes
        await self.registration.showNotification(post.title, {
            body: post.description || 'New post on Pelmeniboiler',
            icon: '/logo/icon-192.png',
            tag: `pelmeniboiler-${post.slug}`,
            data: { url: `/blog/${post.slug}/en/` },
        });
    }
    await writeMeta('/notify-seen', current);
}

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-new-posts') event.waitUntil(checkForNewPosts());
});

self.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'notify-prefs') {
        event.waitUntil(writeMeta('/notify-prefs', msg.prefs).then(() => checkForNewPosts()));
    } else if (msg.type === 'check-new-posts') {
        event.waitUntil(checkForNewPosts());
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(self.clients.openWindow(url));
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // only cache our own site

    if (req.mode === 'navigate') {
        // Pages: network-first so content is always fresh online, with the
        // cached copy as the offline fallback (and the hub as a last resort).
        // IMPORTANT: cache:'no-store' bypasses the *browser's* HTTP cache.
        // GitHub Pages serves HTML with max-age=600, so a plain fetch() would
        // return a page up to 10 minutes stale — exactly why the screensaver
        // kept showing an old version after a deploy. no-store forces a real
        // network round-trip; offline still falls back to the cached copy.
        event.respondWith(
            fetch(req, { cache: 'no-store' })
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
