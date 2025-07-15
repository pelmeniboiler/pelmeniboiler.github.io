/**
 * theme-loader.js
 *
 * This script is intended to be placed in the <head> of the document.
 * It's a self-executing function that runs immediately to prevent a "flash of unstyled content" (FOUC).
 * It reads the user's saved theme and mode from localStorage and applies the corresponding
 * classes to the <html> element before the page content is rendered.
 */
(function() {
    // Define the keys used for storing settings in localStorage.
    const THEME_KEY = 'pelmeniboiler-theme';
    const MODE_KEY = 'pelmeniboiler-mode';

    try {
        // Retrieve the saved theme and mode from localStorage.
        const savedTheme = localStorage.getItem(THEME_KEY);
        const savedMode = localStorage.getItem(MODE_KEY);

        // Determine the theme to apply.
        // It falls back to checking the user's OS preference, and finally defaults to 'light'.
        const theme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        // Determine the mode to apply, defaulting to 'eink'.
        const mode = savedMode || 'eink';

        // Get a reference to the root <html> element.
        const docEl = document.documentElement;

        // Add the theme and mode classes. This is the crucial step that prevents FOUC.
        // CSS can now use selectors like `.dark-mode` or `.eink-mode` to apply styles instantly.
        docEl.classList.add(`${theme}-mode`, `${mode}-mode`);

    } catch (e) {
        // If any error occurs (e.g., localStorage is disabled in private browsing),
        // log the error and allow the page to load with default styles.
        console.error("Failed to apply initial theme from theme-loader.js", e);
    }
})();
