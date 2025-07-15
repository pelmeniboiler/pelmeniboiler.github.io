/**
 * theme-loader.js
 *
 * This script is intended to be placed in the <head> of the document.
 * It's a self-executing function that runs immediately to prevent a "flash of unstyled content" (FOUC).
 * It reads the user's saved theme and mode from localStorage and applies the corresponding
 * classes to both the <html> and <body> elements before the page content is rendered.
 */
(function() {
    // Define the keys used for storing settings in localStorage.
    const THEME_KEY = 'pelmeniboiler-theme';
    const MODE_KEY = 'pelmeniboiler-mode';

    try {
        // Retrieve the saved theme and mode from localStorage.
        const savedTheme = localStorage.getItem(THEME_KEY);
        const savedMode = localStorage.getItem(MODE_KEY);

        // Determine the mode to apply, defaulting to 'lcd'.
        const mode = savedMode || 'lcd';
        let theme;

        // Logic to prevent color themes in e-ink mode.
        if (mode === 'eink') {
            theme = (savedTheme === 'dark') ? 'dark' : 'light';
        } else {
            // Fall back to OS preference, and finally default to 'light'.
            theme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        }
        
        // Get references to the root <html> and the <body> elements.
        const docEl = document.documentElement;
        
        // This is the crucial step that prevents FOUC.
        // We apply the classes immediately.
        docEl.classList.add(`${theme}-mode`, `${mode}-mode`);
        
        // **FIX:** We also need to apply the classes to the body as soon as it exists.
        // We use a simple interval check which is very fast and reliable.
        const bodyApplyInterval = setInterval(function() {
            if (document.body) {
                document.body.classList.add(`${theme}-mode`, `${mode}-mode`);
                clearInterval(bodyApplyInterval);
            }
        }, 1);


    } catch (e) {
        // If any error occurs (e.g., localStorage is disabled), log it.
        console.error("Failed to apply initial theme from theme-loader.js", e);
    }
})();