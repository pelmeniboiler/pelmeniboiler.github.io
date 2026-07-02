// /scripts/notify-bell.js
// Opt-in new-post notifications for the installed app. The bell only appears
// when the site is running as an installed PWA (standalone display mode) — a
// browser tab never sees it, and nobody is ever popup-begged: permission is
// requested only when the user flips the toggle themselves.
//
// Serverless by design: the service worker re-reads /blog/blog-manifest.json on
// periodic background wake (Chromium/installed; other engines simply don't show
// the bell) and on app launch, and notifies about posts it hasn't seen that
// match the chosen categories. RSS remains the universal fallback.
//
// Dev override for testing in a plain tab: localStorage 'pelmeniboiler-force-bell' = '1'.

(function () {
    const PREFS_KEY = 'pelmeniboiler-notify-prefs';

    const isStandalone = () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        localStorage.getItem('pelmeniboiler-force-bell') === '1';

    if (!isStandalone()) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

    const readPrefs = () => {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || { enabled: false, all: true, keywords: [] }; }
        catch { return { enabled: false, all: true, keywords: [] }; }
    };
    const prefs = readPrefs();

    async function pushPrefsToWorker() {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'notify-prefs', prefs });
    }

    async function enableNotifications() {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;
        const reg = await navigator.serviceWorker.ready;
        try {
            // Periodic background wake (~daily; the browser decides exact timing).
            await reg.periodicSync.register('check-new-posts', { minInterval: 24 * 60 * 60 * 1000 });
        } catch (_) {
            // No periodicSync (or permission denied): we still check on every
            // app launch via the message below. Graceful degrade.
        }
        return true;
    }

    function savePrefs() {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        pushPrefsToWorker();
    }

    function buildBell() {
        const titleBar = document.querySelector('.rss-dropdown-container')?.parentElement;
        if (!titleBar || document.getElementById('notify-bell-btn')) return;

        const container = document.createElement('div');
        container.className = 'rss-dropdown-container notify-bell-container';

        const btn = document.createElement('button');
        btn.id = 'notify-bell-btn';
        btn.className = 'rss-btn';
        btn.title = 'New-post notifications';
        btn.innerHTML = `<span class="symbol">${prefs.enabled ? '🔔' : '🕭'}</span>`;

        const dropdown = document.createElement('div');
        dropdown.className = 'rss-dropdown-content notify-dropdown';

        const keywords = [...document.querySelectorAll('#blog-filter-container .filter-btn[data-keyword]')]
            .map((b) => b.dataset.keyword).filter((k) => k && k !== 'All');

        const row = (label, checked, disabled) =>
            `<label class="notify-row"><input type="checkbox" data-kw="${label}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${label === '__all__' ? 'All posts' : label}</label>`;
        const render = () => {
            dropdown.innerHTML =
                `<label class="notify-row notify-master"><input type="checkbox" id="notify-enabled" ${prefs.enabled ? 'checked' : ''}> Notify me</label>` +
                row('__all__', prefs.all, !prefs.enabled) +
                keywords.map((k) => row(k, !prefs.all && prefs.keywords.includes(k), !prefs.enabled || prefs.all)).join('');
        };
        render();

        dropdown.addEventListener('change', async (e) => {
            const input = e.target;
            if (input.id === 'notify-enabled') {
                if (input.checked) {
                    const ok = await enableNotifications();
                    prefs.enabled = ok;
                } else {
                    prefs.enabled = false;
                }
            } else if (input.dataset.kw === '__all__') {
                prefs.all = input.checked;
                if (input.checked) prefs.keywords = [];
            } else if (input.dataset.kw) {
                const kw = input.dataset.kw;
                prefs.keywords = input.checked
                    ? [...new Set([...prefs.keywords, kw])]
                    : prefs.keywords.filter((k) => k !== kw);
            }
            btn.querySelector('.symbol').textContent = prefs.enabled ? '🔔' : '🕭';
            savePrefs();
            render();
        });

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        window.addEventListener('click', (e) => {
            if (dropdown.classList.contains('show') && !e.target.closest('.notify-bell-container')) {
                dropdown.classList.remove('show');
            }
        });

        container.appendChild(btn);
        container.appendChild(dropdown);
        const closeBtn = titleBar.querySelector('.close-btn');
        titleBar.insertBefore(container, closeBtn);
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildBell();
        // On every app launch, let the worker check for new posts (covers
        // engines without periodic background sync, and shortens the wait).
        if (prefs.enabled) {
            navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'check-new-posts' }));
        }
    });
})();
