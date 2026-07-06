/**
 * theme-loader.js (Robust Version)
 *
 * This script runs immediately to prevent a "flash of unstyled content" (FOUC).
 * It reads the user's saved theme and mode from localStorage and applies the corresponding
 * classes to both the <html> and <body> elements.
 *
 * This version is designed to be robust and will REMOVE any hardcoded theme/mode
 * classes from the <body> tag to ensure the user's settings are always respected.
 */
(function() {
    // Define the keys used for storing settings in localStorage.
    const THEME_KEY = 'pelmeniboiler-theme';
    const MODE_KEY = 'pelmeniboiler-mode';

    try {
        // Retrieve the saved theme and mode from localStorage.
        const savedTheme = localStorage.getItem(THEME_KEY);
        const savedMode = localStorage.getItem(MODE_KEY);

        // Determine the mode to apply, defaulting to 'lcd' if no setting is found.
        const mode = savedMode || 'lcd';
        let theme;

        // Prevent color themes from being applied in e-ink mode.
        if (mode === 'eink') {
            // If mode is 'eink', the theme can only be 'light' or 'dark'.
            theme = (savedTheme === 'dark') ? 'dark' : 'light';
        } else {
            // If mode is 'lcd', use any saved theme, fall back to OS preference, then default to 'light'.
            theme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        }
        
        const docEl = document.documentElement;
        const correctThemeClass = `${theme}-mode`;
        const correctModeClass = `${mode}-mode`;

        // Apply correct classes to the <html> element immediately.
        docEl.classList.add(correctThemeClass, correctModeClass);

        // Restore the "liquid glass" easter-egg look if it was toggled on.
        if (localStorage.getItem('pelmeniboiler-liquid-glass') === '1') {
            docEl.classList.add('liquid-glass');
        }

        // Point the PWA manifest at the current theme's variant so an install
        // picks up a matching icon + colours. (Installed apps keep the icon
        // they were installed with — the platform offers no way to change it
        // afterwards — so this decides the icon at install time.)
        const THEMED_MANIFESTS = ['light', 'dark', 'champagne', 'bubblegum', 'techelet', 'zelyonny', 'akai', 'rindswurst', 'tapuz'];
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (manifestLink && THEMED_MANIFESTS.includes(theme)) {
            manifestLink.href = `/manifest-${theme}.json`;
        }

        /**
         * This function finds the <body> tag, removes any outdated theme or mode classes
         * that might be hardcoded in the HTML, and applies the correct ones from localStorage.
         */
        const fixBodyClasses = () => {
            if (!document.body) return; // Body element doesn't exist yet.

            // Find all classes on the body that end with '-mode'.
            const classesToRemove = [...document.body.classList].filter(c => c.endsWith('-mode'));
            
            // Remove any incorrect classes.
            if (classesToRemove.length > 0) {
                document.body.classList.remove(...classesToRemove);
            }

            // Add the correct, user-selected classes.
            document.body.classList.add(correctThemeClass, correctModeClass);
        };

        // A MutationObserver is the modern, efficient way to wait for the <body> to be added to the DOM.
        // It's faster and more reliable than using setInterval.
        const observer = new MutationObserver((mutations, obs) => {
            if (document.body) {
                fixBodyClasses();
                obs.disconnect(); // We've done our job, so we can stop observing.
            }
        });

        // Start observing the document for changes.
        observer.observe(document.documentElement, { childList: true, subtree: true });

    } catch (e) {
        console.error("Failed to apply initial theme from theme-loader.js", e);
    }

    // Register the service worker (PWA: installable + offline reading). This
    // script is on every page, so registration is site-wide. Deferred to the
    // load event so it never competes with rendering the page.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            // updateViaCache:'none' — never serve /sw.js itself from the HTTP
            // cache (GitHub Pages sets max-age=600 on it), so a new worker
            // version is picked up on the very next visit instead of up to 10
            // minutes later. Paired with the no-store navigation fetch in sw.js,
            // this makes stale pages after a deploy essentially impossible.
            navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
                .catch(() => { /* offline support is optional */ });
        });
    }
})();
