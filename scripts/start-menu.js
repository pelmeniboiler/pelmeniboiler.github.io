// start-menu.js
// This script also has its DOMContentLoaded wrapper removed.
// It will now correctly listen for the 'translationsReady' event dispatched by settings.js.

function setupStartMenu() {
    // --- Basic setup ---
    const startMenu = document.querySelector('.start-menu');
    if (!startMenu) {
        return;
    }

    const startButton = startMenu.querySelector('.start-button');
    const windows = document.querySelectorAll('.window');
    const windowList = startMenu.querySelector('.window-list');
    let closedWindows = [];

    // **UPDATED:** Initialize highestZIndex from the CSS variable to ensure consistency.
    // We use a default of 10 just in case the variable isn't found.
    let highestZIndex = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--z-window-active')) || 10;

    const isMobile = () => window.innerWidth <= 768;
    // Tiled (tmux) desktop: CSS grid owns layout, so no placement or dragging.
    const isTiled = () => document.documentElement.classList.contains('tiling') && !!document.getElementById('desktop');

    // --- Tray (wide screens) ---
    // Windows that STARTED open dock to the tray as icons when closed;
    // init-closed windows (settings etc.) keep using the start-menu list.
    // Initial state is recorded up-front because openWindow strips init-closed.
    const trayIconsEl = document.getElementById('tray-icons');
    const trayClockEl = document.getElementById('tray-clock');
    windows.forEach((win) => {
        if (!('startedOpen' in win.dataset)) {
            win.dataset.startedOpen = win.classList.contains('init-closed') ? '0' : '1';
        }
    });
    let lastTranslations = null, lastLang = null;

    function windowIcon(win) {
        const titleEl = win.querySelector('.title-bar .title');
        const sym = titleEl?.querySelector('.symbol')?.textContent?.trim();
        if (sym) return sym;
        const text = titleEl?.textContent?.trim() || '❒';
        return [...text][0];
    }

    function renderTray(trayWindows, translations, lang) {
        if (!trayIconsEl) return;
        trayIconsEl.innerHTML = '';
        trayWindows.forEach((win) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'tray-icon';
            btn.innerHTML = `<span class="symbol">${windowIcon(win)}</span>`;
            btn.title = win.querySelector('.title-bar .title')?.textContent?.trim() || 'window';
            btn.addEventListener('click', () => openWindow(win, translations, lang));
            li.appendChild(btn);
            trayIconsEl.appendChild(li);
        });
    }

    // Tray clock: Hebrew-calendar date by default, Japanese era on ja pages.
    // When zman-clock.js is loaded it provides a sunset-adjusted Hebrew date
    // (the Torah day begins at sunset) — prefer it over the midnight-flipping
    // Intl default.
    function updateTrayClock() {
        if (!trayClockEl) return;
        const now = new Date();
        const lang = document.documentElement.lang || 'en';
        let dateText;
        try {
            if (lang === 'ja') {
                dateText = new Intl.DateTimeFormat('ja-u-ca-japanese', { era: 'short', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
            } else if (typeof window.zmanHebrewDate === 'function') {
                dateText = window.zmanHebrewDate(now).replace(/^[^,]+,\s*/, ''); // drop weekday for the tray
            } else {
                dateText = new Intl.DateTimeFormat(`${lang === 'he' ? 'he' : 'en'}-u-ca-hebrew`, { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
            }
        } catch (_) {
            dateText = now.toLocaleDateString();
        }
        // Hebrew time of day (hour-letter + chalakim, from zman-clock.js) — not
        // the civil clock. Falls back to HH:MM only before zman-clock loads.
        const time = (typeof window.zmanTime === 'function' && window.zmanTime())
            || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        trayClockEl.textContent = `${dateText} · ${time}`;
    }
    updateTrayClock();
    setInterval(updateTrayClock, 30000);
    document.addEventListener('translationsReady', updateTrayClock);

    // Pinned tray settings button (the tray is the launcher on wide screens).
    document.getElementById('tray-settings')?.addEventListener('click', () => {
        const settingsWin = document.getElementById('settings-main-window');
        if (settingsWin) openWindow(settingsWin, lastTranslations, lastLang);
    });

    let trayResizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(trayResizeTimer);
        trayResizeTimer = setTimeout(() => {
            updateWindowList(lastTranslations, lastLang);
            // Pull any window the resize left off-screen back into view.
            if (!isMobile() && !isTiled()) {
                windows.forEach((w) => {
                    if (!w.style.left || getComputedStyle(w).display === 'none') return;
                    const p = clampPosition(w, parseFloat(w.style.left), parseFloat(w.style.top));
                    w.style.left = `${p.x}px`; w.style.top = `${p.y}px`;
                });
            }
        }, 200);
    });

    // --- Function Definitions ---

    function updateWindowList(translations, lang) {
        if (!windowList) return;
        lastTranslations = translations; lastLang = lang;
        windowList.innerHTML = '';

        // On wide screens the tray IS the launcher: every closed window docks
        // there as an icon — except settings and the zmanim clock, which have
        // pinned tray buttons of their own. The start-menu list serves mobile.
        const PINNED = ['settings-main-window', 'zman-clock-window'];
        const toTray = closedWindows.filter((w) => !isMobile() && !PINNED.includes(w.id));
        const toList = closedWindows.filter((w) => !toTray.includes(w));
        renderTray(toTray, translations, lang);

        toList.forEach((closedItemWindow) => {
            const listItem = document.createElement('li');
            listItem.setAttribute('tabindex', '0');
            listItem.setAttribute('role', 'button');
            const titleElement = closedItemWindow.querySelector('.title');

            const titleKey = titleElement ? titleElement.getAttribute('data-key') : null;
            const titleText = (titleKey && translations && translations[lang] && translations[lang][titleKey]) ?
                translations[lang][titleKey] :
                (titleElement ? titleElement.textContent.trim() : 'Untitled Window');

            listItem.innerHTML = titleText;

            const openHandler = (e) => {
                e.preventDefault();
                openWindow(closedItemWindow, translations, lang);
                if (isMobile() && startMenu.classList.contains('open')) {
                    startMenu.classList.remove('open');
                }
            };

            listItem.addEventListener('click', openHandler);
            listItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    openHandler(e);
                }
            });

            windowList.appendChild(listItem);
        });
    }

    function openWindow(windowToOpen, translations, lang) {
        // On mobile, the nav window is handled separately. Clicking it in the start menu should expand it.
        if (isMobile() && windowToOpen.id === 'nav-window') {
            if (!windowToOpen.classList.contains('expanded')) {
                windowToOpen.classList.add('expanded');
                document.body.classList.add('body-no-scroll');
            }
            return;
        }

        windowToOpen.style.display = 'flex';
        windowToOpen.classList.remove('init-closed');

        if (!isMobile()) {
            highestZIndex++;
            windowToOpen.style.zIndex = highestZIndex;
        }

        closedWindows = closedWindows.filter((win) => win !== windowToOpen);
        updateWindowList(translations, lang);
        saveLayout();
    }

    function closeWindow(windowToClose, translations, lang) {
        // On mobile, the nav window is only collapsed, not truly "closed".
        if (isMobile() && windowToClose.id === 'nav-window') {
            windowToClose.classList.remove('expanded');
            document.body.classList.remove('body-no-scroll');
            // IMPORTANT: Do not add it to the closedWindows array.
            return;
        }

        windowToClose.style.display = 'none';
        if (!closedWindows.includes(windowToClose)) {
            closedWindows.push(windowToClose);
        }
        updateWindowList(translations, lang);
        saveLayout();
    }

    /**
     * UPDATED: Handles the special behavior of the navigation window on mobile devices.
     * It now uses a single event handler on the window itself.
     */
    function setupMobileNav() {
        if (!isMobile()) return;

        const navWindow = document.getElementById('nav-window');
        if (!navWindow) return;

        // Use a data attribute to prevent attaching listeners multiple times.
        if (navWindow.dataset.mobileNavSetup) return;
        navWindow.dataset.mobileNavSetup = 'true';

        const closeBtn = navWindow.querySelector('.close-btn');

        // This class triggers the CSS to turn it into a button.
        navWindow.classList.add('nav-pendant');
        navWindow.style.display = 'flex'; // Ensure it's visible

        // Add a single click handler to the nav window.
        const navClickHandler = (event) => {
            // If the click is on the close button, collapse the menu.
            if (closeBtn && closeBtn.contains(event.target)) {
                event.stopPropagation();
                navWindow.classList.remove('expanded');
                document.body.classList.remove('body-no-scroll');
                return;
            }

            // If the menu is NOT expanded, any other click should expand it.
            if (!navWindow.classList.contains('expanded')) {
                event.stopPropagation();
                navWindow.classList.add('expanded');
                document.body.classList.add('body-no-scroll');
            }
        };

        navWindow.addEventListener('click', navClickHandler);
    }

    function setupWindowInteractions(translations, lang) {
        windows.forEach((window) => {
            // Mobile nav window has its own logic, so we skip it here.
            if (isMobile() && window.id === 'nav-window') {
                return;
            }

            const titleBar = window.querySelector('.title-bar');
            const closeBtn = window.querySelector('.close-btn');

            if (closeBtn) {
                const newBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newBtn, closeBtn);
                newBtn.addEventListener('click', () => closeWindow(window, translations, lang));
            }

            if (!isMobile() && !isTiled() && titleBar) {
                // Pointer events: mouse, pen and touch (large tablets) alike.
                // Handlers are assigned as properties so re-initialising is idempotent.
                titleBar.style.touchAction = 'none';
                titleBar.onpointerdown = (e) => {
                    if (e.button !== 0 || e.target.closest('button, a, input, select, .rss-dropdown-container')) return;
                    e.preventDefault();
                    raise(window);
                    const rect = window.getBoundingClientRect();
                    const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
                    try { titleBar.setPointerCapture(e.pointerId); } catch (_) { /* synthetic event */ }
                    titleBar.onpointermove = (ev) => {
                        const p = clampPosition(window, ev.clientX - offX, ev.clientY - offY);
                        window.style.left = `${p.x}px`;
                        window.style.top = `${p.y}px`;
                    };
                    titleBar.onpointerup = titleBar.onpointercancel = () => {
                        titleBar.onpointermove = titleBar.onpointerup = titleBar.onpointercancel = null;
                        saveLayout();
                    };
                };
            }

            // Any click or focus inside a window brings it to the front.
            window.addEventListener('pointerdown', () => raise(window), true);
            window.addEventListener('focusin', () => raise(window));
        });
    }

    // --- Window manager helpers -------------------------------------------

    function raise(win) {
        if (isMobile() || isTiled()) return;
        if (String(win.style.zIndex) === String(highestZIndex)) return;
        highestZIndex++;
        win.style.zIndex = highestZIndex;
    }

    /** Keep at least 80px of a window and its whole title bar on screen. */
    function clampPosition(win, x, y) {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const w = win.offsetWidth;
        const barH = win.querySelector('.title-bar')?.offsetHeight || 32;
        return {
            x: Math.round(Math.min(Math.max(x, 80 - w), vw - 80)),
            y: Math.round(Math.min(Math.max(y, 0), vh - barH)),
        };
    }

    // Positions and closed windows persist per page (localStorage; the reset
    // button in settings clears every pelmeniboiler-* key).
    const LAYOUT_KEY = `pelmeniboiler-layout:${location.pathname}`;
    function loadLayout() {
        try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (_) { return {}; }
    }
    function saveLayout() {
        if (isMobile() || isTiled()) return;
        const pos = {};
        windows.forEach((w) => {
            if (w.id && w.style.left && w.style.top && getComputedStyle(w).display !== 'none') {
                pos[w.id] = [parseFloat(w.style.left), parseFloat(w.style.top)];
            }
        });
        const closed = closedWindows.filter((w) => w.id && w.dataset.startedOpen === '1').map((w) => w.id);
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ pos, closed })); } catch (_) { /* storage unavailable */ }
    }
    function applySavedLayout() {
        const { pos = {}, closed = [] } = loadLayout();
        windows.forEach((w) => {
            if (!w.id) return;
            if (closed.includes(w.id) && w.dataset.startedOpen === '1') {
                w.style.display = 'none';
                if (!closedWindows.includes(w)) closedWindows.push(w);
            } else if (pos[w.id]) {
                const p = clampPosition(w, pos[w.id][0], pos[w.id][1]);
                w.style.left = `${p.x}px`;
                w.style.top = `${p.y}px`;
            }
        });
    }

    /** Accessible names and roles; decorative icon glyphs hidden from screen readers. */
    function labelWindows() {
        windows.forEach((w, i) => {
            const title = w.querySelector('.title-bar .title');
            if (title) {
                if (!title.id) title.id = `${w.id || `window-${i}`}-title`;
                w.setAttribute('role', 'region');
                w.setAttribute('aria-labelledby', title.id);
            }
            const close = w.querySelector('.close-btn');
            if (close && !close.hasAttribute('aria-label')) close.setAttribute('aria-label', 'Close');
        });
        document.querySelectorAll('.title .symbol, .filter-btn .symbol, .app-list .symbol, .app-folder summary .symbol, #tmux-bar .symbol')
            .forEach((sym) => sym.setAttribute('aria-hidden', 'true'));
    }

    /**
     * tmux keys for the tiled desktop: Ctrl-b, then
     *   0-5 jump to pane · n/→/↓ next · p/←/↑ previous · z zoom/unzoom.
     */
    function setupTmuxKeys() {
        if (!isTiled() || document.body.dataset.tmuxKeys) return;
        document.body.dataset.tmuxKeys = '1';
        const panes = () => [...document.querySelectorAll('#tmux-bar a[href^="#"]:not(.tmux-session)')]
            .map((a) => document.querySelector(a.getAttribute('href')))
            .filter((w) => w && getComputedStyle(w).display !== 'none');
        const focusPane = (w) => {
            if (!w) return;
            const target = w.querySelector('.content, .music-content') || w;
            if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
            target.focus();
        };
        // The "current" pane: the one holding focus, else the one last clicked.
        let lastPane = null;
        document.addEventListener('pointerdown', (e) => {
            lastPane = e.target.closest?.('#desktop > .window') || lastPane;
        });
        let armed = false, timer = null;
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                armed = true;
                clearTimeout(timer);
                timer = setTimeout(() => { armed = false; }, 2000);
                return;
            }
            if (!armed) return;
            armed = false;
            const list = panes();
            if (!list.length) return;
            let cur = list.findIndex((w) => w.contains(document.activeElement));
            if (cur < 0) cur = list.indexOf(lastPane);
            if (/^[0-9]$/.test(e.key)) {
                const all = [...document.querySelectorAll('#tmux-bar a[href^="#"]:not(.tmux-session)')];
                focusPane(document.querySelector(all[+e.key]?.getAttribute('href') || '#none'));
            } else if (e.key === 'z') {
                const w = list[Math.max(cur, 0)];
                location.hash = location.hash === `#${w.id}` ? '#desktop' : `#${w.id}`;
                focusPane(w);
            } else if (['n', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
                focusPane(list[(cur + 1) % list.length]);
            } else if (['p', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
                focusPane(list[(cur - 1 + list.length) % list.length]);
            } else {
                return;
            }
            e.preventDefault();
        });
    }

    function setupMobileMenu() {
        if (isMobile()) {
            startButton.addEventListener('click', () => {
                startMenu.classList.toggle('open');
            });
        }
    }

    function initialize(translations, lang) {
        windows.forEach(win => {
            const isExplicitlyClosed = win.classList.contains('init-closed');
            const isVisuallyHidden = getComputedStyle(win).display === 'none';
            if ((isExplicitlyClosed || isVisuallyHidden) && !closedWindows.includes(win)) {
                closedWindows.push(win);
            }
        });

        if (!isMobile() && !isTiled()) {
            const openWindows = Array.from(windows).filter(win => !closedWindows.includes(win));
            const placedRects = [];
            const margin = 15;

            const doRectsOverlap = (r1, r2) => !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);

            openWindows.forEach(win => {
                win.style.position = 'absolute';
                win.style.visibility = 'hidden';
                win.style.display = 'flex';

                let currentRect = win.getBoundingClientRect();
                let newRect = { left: currentRect.left, top: currentRect.top, width: currentRect.width, height: currentRect.height };
                let hasCollision;

                do {
                    hasCollision = false;
                    for (const placedRect of placedRects) {
                        const potentialRect = { left: newRect.left, top: newRect.top, right: newRect.left + newRect.width, bottom: newRect.top + newRect.height };
                        if (doRectsOverlap(potentialRect, placedRect)) {
                            hasCollision = true;
                            newRect.top = placedRect.bottom + margin;
                            break;
                        }
                    }
                } while (hasCollision);

                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;

                if (newRect.top + 50 > viewportHeight || newRect.left + 50 > viewportWidth) {
                    win.style.display = 'none';
                    win.style.visibility = 'visible';
                    closedWindows.push(win);
                } else {
                    win.style.left = `${newRect.left}px`;
                    win.style.top = `${newRect.top}px`;
                    win.style.visibility = 'visible';

                    placedRects.push({
                        left: newRect.left,
                        top: newRect.top,
                        right: newRect.left + newRect.width,
                        bottom: newRect.top + newRect.height
                    });
                }
            });
        }

        if (!isMobile() && !isTiled()) applySavedLayout();
        labelWindows();
        setupWindowInteractions(translations, lang);
        setupTmuxKeys();
        setupMobileMenu();
        setupMobileNav();
        updateWindowList(translations, lang);
    }

    // --- Event Listener ---
    document.addEventListener('translationsReady', (event) => {
        const { translations, lang } = event.detail;
        initialize(translations, lang);

        let wasMobile = isMobile();
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const isNowMobile = isMobile();
                if (isNowMobile !== wasMobile) {
                    location.reload();
                }
            }, 250);
        });
    }, { once: true });

    if (window.translationsData) {
        const { translations, lang } = window.translationsData;
        initialize(translations, lang);
    }
}

setupStartMenu();
