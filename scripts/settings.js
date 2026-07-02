// This version is updated to manage theme/mode classes on both <html> and <body>
// to ensure consistency and support for existing CSS rules.
// It also includes logic to dynamically update the favicon color based on the theme.
// **REMOVED:** The redundant updateWelcomeText() function.

function setupSettings() {
    // Helper to quickly get elements by their ID
    const getElement = (id) => document.getElementById(id);

    // --- DOM ELEMENT REFERENCES ---
    const body = document.body;
    const docEl = document.documentElement; // Reference to <html> element

    // Pre-rendered ("built") per-language pages declare their baked-in language,
    // the base path shared by their sibling-language versions, and which
    // languages exist for that post. On these pages the text is already in the
    // DOM, so we must NOT re-fetch and re-translate (that would clobber it), and
    // the language switcher navigates between sibling pages instead of swapping
    // text in place. The hub has none of these metas and keeps its old behavior.
    const builtLang = document.querySelector('meta[name="built-lang"]')?.content || null;
    const pageBase = document.querySelector('meta[name="page-base"]')?.content || null;
    const pageLangs = (document.querySelector('meta[name="page-langs"]')?.content || '')
        .split(',').map((s) => s.trim()).filter(Boolean);

    // Language dropdown elements
    const langDropdown = getElement('language-select-custom');
    const langDropdownToggle = langDropdown?.querySelector('.custom-dropdown-toggle');
    const langDropdownValue = getElement('language-select-value');
    const langDropdownMenu = langDropdown?.querySelector('.custom-dropdown-menu');
    const langDropdownItems = langDropdown?.querySelectorAll('.custom-dropdown-item');

    // Theme and mode control elements
    const einkToggle = getElement('eink-toggle');
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    const settingsNavItems = document.querySelectorAll('.settings-nav li');

    // --- LOCALSTORAGE KEYS ---
    const THEME_KEY = 'pelmeniboiler-theme';
    const MODE_KEY = 'pelmeniboiler-mode';
    const LANG_KEY = 'pelmeniboiler-lang';
    const LAST_COLOR_THEME_KEY = 'pelmeniboiler-last-color-theme'; // To remember the last used color theme when switching back from e-ink mode

    // --- THEME CONFIGURATION ---
    const colorThemes = {
        funky: { random: true } // 'funky' is a special case that generates random colors
    };

    // --- STATE ---
    let loadedTranslations = {}; // To store all loaded language data

    // --- UPDATED FAVICON LOGIC ---
    /**
     * Replace the favicon <link> with a fresh node carrying `href`. Browsers
     * don't reliably repaint the tab icon when an existing link's href is just
     * mutated, so we swap the element each time (keeping its id).
     * @param {string} href - The new icon href (data URI or path).
     */
    function setFaviconHref(href) {
        const old = document.getElementById('dynamic-favicon');
        const link = document.createElement('link');
        link.id = 'dynamic-favicon';
        link.rel = 'icon';
        link.href = href;
        if (old) old.replaceWith(link);
        else document.head.appendChild(link);
    }

    /**
     * Updates the site's favicon based on the current theme's text color.
     * This version parses the SVG and directly manipulates its path elements
     * for a more robust result than regex replacement.
     */
    async function updateFavicon() {
        const faviconLink = document.getElementById('dynamic-favicon');
        if (!faviconLink) return; // Exit if the favicon link isn't in the HTML

        try {
            // Read the active theme's colours.
            const cs = getComputedStyle(document.documentElement);
            const textColor = cs.getPropertyValue('--text-color').trim() || '#000000';
            const bgColor = (cs.getPropertyValue('--win-bg-color').trim() ||
                             cs.getPropertyValue('--bg-color').trim() || '#ffffff');
            const borderColor = cs.getPropertyValue('--border-color').trim() || textColor;

            // Default: bg tile with the logo in the text colour. For these themes,
            // invert the relationship — border colour tile, logo in the bg colour.
            const FAVICON_SWAP_THEMES = ['techelet', 'zelyonny', 'akai'];
            const swap = FAVICON_SWAP_THEMES.some((t) => document.documentElement.classList.contains(`${t}-mode`));
            const tileColor = swap ? borderColor : bgColor;
            const logoColor = swap ? bgColor : textColor;

            // Fetch and parse the SVG logo.
            const response = await fetch('/logo/shzh.svg');
            if (!response.ok) throw new Error('Could not fetch SVG logo.');
            const svgDoc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
            const svgElement = svgDoc.querySelector('svg');
            if (!svgElement) throw new Error('No SVG element found in the fetched file.');

            // IMPORTANT: the logo ships with an internal <style>.s0{fill:#000}</style>
            // and class="s0" paths. A stylesheet rule beats the fill *attribute* in
            // the SVG cascade, so setting fill alone left the mark stuck black (and
            // therefore invisible in dark mode). Strip the style + class so the
            // theme colour actually applies.
            svgElement.querySelectorAll('style').forEach((s) => s.remove());
            svgElement.querySelectorAll('path').forEach((path) => {
                path.removeAttribute('class');
                path.setAttribute('fill', logoColor);
            });

            const svgUri = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svgElement))}`;

            // Rasterize onto a canvas and export a PNG. PNG favicons render in every
            // browser (SVG data-URI favicons are flaky, e.g. Safari). We paint the
            // theme background first (so colour themes like Funky get a matching
            // tile and the mark is always visible regardless of the tab-bar colour),
            // then draw the text-coloured logo with a little padding.
            const size = 64;
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Could not rasterize SVG.'));
                img.src = svgUri;
            });
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = tileColor;
            ctx.fillRect(0, 0, size, size);
            const pad = Math.round(size * 0.08);
            ctx.drawImage(img, pad, pad, size - 2 * pad, size - 2 * pad);
            setFaviconHref(canvas.toDataURL('image/png'));

        } catch (error) {
            console.error('Failed to update favicon:', error);
            // If anything goes wrong, fall back to the OS-adaptive static favicon.
            setFaviconHref('/logo/favicon.svg');
        }
    }
    // --- END UPDATED FAVICON LOGIC ---

    /**
     * Injects an SVG file's content directly into the DOM, replacing an <img> element.
     * This allows the SVG's colors to be manipulated with CSS variables.
     * @param {HTMLElement} imgElement - The <img> element to replace.
     * @param {string} svgPath - The path to the .svg file.
     */
    async function injectSVG(imgElement, svgPath) {
        if (!imgElement) return;
        try {
            const response = await fetch(svgPath);
            if (!response.ok) throw new Error(`SVG not found at ${svgPath}`);
            const svgText = await response.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgElement = svgDoc.querySelector('svg');
            if (svgElement) {
                // Copy ID and classes from the original image to the new SVG element
                svgElement.id = imgElement.id;
                imgElement.classList.forEach(c => svgElement.classList.add(c));
                imgElement.parentElement.replaceChild(svgElement, imgElement);
            }
        } catch (error) {
            console.error('Failed to inject SVG:', error);
        }
    }

    // Setup navigation tabs within the settings window
    if (settingsNavItems.length > 0) {
        settingsNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetId = `settings-page-${item.dataset.target}`;
                // Deactivate current tab and page
                document.querySelectorAll('.settings-page.active, .settings-nav li.active').forEach(activeEl => {
                    activeEl.classList.remove('active');
                });
                // Activate new tab and page
                const targetPage = getElement(targetId);
                if (targetPage) targetPage.classList.add('active');
                item.classList.add('active');
            });
        });
    }

    /**
     * Enable/disable (and dim) the colour theme presets. Colour themes are only
     * valid in LCD mode, so they're disabled while e-ink mode is active. Called
     * both when the mode is toggled and on initial load (otherwise a page that
     * loads already in e-ink mode would show the colour presets selectable until
     * the toggle was flipped once).
     * @param {boolean} isEink - Whether e-ink mode is currently active.
     */
    function updateColorThemeAvailability(isEink) {
        const themeSettingGroup = getElement('theme-setting-group');
        if (!themeSettingGroup) return;
        themeSettingGroup.querySelectorAll('.color-theme').forEach(label => {
            label.style.opacity = isEink ? '0.5' : '1';
            const radio = label.querySelector('input');
            if (radio) radio.disabled = isEink;
        });
    }

    /**
     * Applies the display mode (e-ink or lcd) to the page.
     * @param {string} mode - The mode to apply ('eink' or 'lcd').
     */
    function applyMode(mode) {
        const isEink = mode === "eink";
        
        // **FIX:** Apply mode classes to BOTH <html> and <body> for consistency.
        // This ensures that CSS rules targeting either element will work correctly.
        docEl.classList.toggle("eink-mode", isEink);
        body.classList.toggle("eink-mode", isEink);
        docEl.classList.toggle("lcd-mode", !isEink);
        body.classList.toggle("lcd-mode", !isEink);

        if (einkToggle) einkToggle.checked = isEink;

        // Disable color theme options when in e-ink mode.
        updateColorThemeAvailability(isEink);

        const currentTheme = localStorage.getItem(THEME_KEY) || 'light';
        const isCurrentThemeColor = colorThemes.hasOwnProperty(currentTheme) || !['light', 'dark'].includes(currentTheme);

        // If switching to e-ink mode while a color theme is active, default to 'light' theme.
        if (isEink && isCurrentThemeColor) {
            applyTheme('light');
        } else if (!isEink && (docEl.classList.contains('light-mode') || docEl.classList.contains('dark-mode'))) {
             // If switching back to LCD from a monochrome theme, restore the last used color theme.
             const lastColorTheme = localStorage.getItem(LAST_COLOR_THEME_KEY) || 'funky';
             applyTheme(lastColorTheme);
        }

        localStorage.setItem(MODE_KEY, mode);

        // Let listeners (e.g. the e-ink ditherer) react to the mode change.
        document.dispatchEvent(new CustomEvent('einkmodechange', { detail: { isEink } }));
    }

    if (einkToggle) {
        einkToggle.addEventListener('change', () => {
            applyMode(einkToggle.checked ? "eink" : "lcd");
        });
    }

    /**
     * Applies a specific theme to the page.
     * @param {string} theme - The name of the theme to apply (e.g., 'dark', 'funky').
     */
    function applyTheme(theme) {
        // Helper to get all theme-related classes from an element's class list.
        const themeClassesToRemove = (target) => 
            [...target.classList].filter(c => c.endsWith('-mode') && !['eink-mode', 'lcd-mode'].includes(c));

        // **FIX:** Remove old theme classes from both <html> and <body>.
        docEl.classList.remove(...themeClassesToRemove(docEl));
        body.classList.remove(...themeClassesToRemove(body));
        
        // **FIX:** Add the new theme class to both <html> and <body>.
        docEl.classList.add(`${theme}-mode`);
        body.classList.add(`${theme}-mode`);
        
        // Special handling for the 'funky' theme to generate random colors.
        if (theme === 'funky') {
            const randomHue = () => Math.floor(Math.random() * 360);
            const baseHue = randomHue();
            const accentHue = (baseHue + 150) % 360;
            const bgLightness = 20 + Math.random() * 60;
            const textLightness = bgLightness > 50 ? 15 : 85;

            // Set CSS custom properties for the funky theme.
            docEl.style.setProperty('--theme-bg-color', `hsl(${baseHue}, 50%, ${bgLightness}%)`);
            docEl.style.setProperty('--theme-text-color', `hsl(${baseHue}, 15%, ${textLightness}%)`);
            docEl.style.setProperty('--theme-border-color', `hsl(${accentHue}, 80%, 70%)`);
            docEl.style.setProperty('--theme-accent-color', `hsl(${accentHue}, 70%, 55%)`);
            localStorage.setItem(LAST_COLOR_THEME_KEY, theme);
        } else {
            // Clear any inline styles from the funky theme when switching to another theme.
            docEl.style.removeProperty('--theme-bg-color');
            docEl.style.removeProperty('--theme-text-color');
            docEl.style.removeProperty('--theme-border-color');
            docEl.style.removeProperty('--theme-accent-color');
            
            // If the new theme is a color theme, save it as the last used one.
            if (theme !== 'light' && theme !== 'dark') {
                localStorage.setItem(LAST_COLOR_THEME_KEY, theme);
            }
        }
        
        // Update the radio button selection in the UI.
        const radioToCheck = document.querySelector(`input[name="theme"][value="${theme}"]`);
        if(radioToCheck) radioToCheck.checked = true;
        
        // Save the theme choice to localStorage.
        localStorage.setItem(THEME_KEY, theme);

        // Call the new function to update the favicon after the theme has been applied.
        updateFavicon();
    }

    if (themeRadios.length > 0) {
        themeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if(e.target.checked) applyTheme(e.target.value);
            });
        });
    }

    // Easter egg: triple-click the Funky preset to toggle a "liquid glass" look.
    // (A click event's `detail` is the consecutive-click count, so 3 == triple.)
    const funkyLabel = document.querySelector('input[name="theme"][value="funky"]')?.closest('.radio-label');
    if (funkyLabel) {
        funkyLabel.addEventListener('click', (e) => {
            if (e.detail !== 3) return;
            const on = document.documentElement.classList.toggle('liquid-glass');
            try { localStorage.setItem('pelmeniboiler-liquid-glass', on ? '1' : '0'); } catch (_) { /* ignore */ }
        });
    }

    /**
     * Deeply merges translation data from multiple sources.
     * @param {object} target - The object to merge into.
     * @param {object} source - The object to merge from.
     * @returns {object} The merged object.
     */
    function deepMerge(target, source) {
        if (!source) return target;
        for (const lang in source) {
            if (source.hasOwnProperty(lang)) {
                if (!target[lang]) target[lang] = {};
                Object.assign(target[lang], source[lang]);
            }
        }
        return target;
    }

    /**
     * Applies the loaded translations to all elements on the page with a 'data-key'.
     * @param {object} translations - The complete translation data object.
     * @param {string} lang - The language code to apply (e.g., 'en', 'he').
     */
    function applyTranslationsToPage(translations, lang) {
        if (!translations[lang]) lang = 'en'; // Fallback to English if the language is not found.
        
        // Translate elements with data-key for their innerHTML.
        document.querySelectorAll('[data-key]').forEach(elem => {
            const key = elem.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) elem.innerHTML = translations[lang][key];
        });
        
        // Translate elements with data-title-key for their 'title' attribute (tooltips).
        document.querySelectorAll('[data-title-key]').forEach(elem => {
            const key = elem.getAttribute('data-title-key');
            if (translations[lang] && translations[lang][key]) elem.title = translations[lang][key];
        });

        // Set the language and direction on the root element for CSS and accessibility.
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';

        // Update the language dropdown display.
        if (langDropdownValue && langDropdownMenu) {
            const selectedItem = langDropdownMenu.querySelector(`.custom-dropdown-item[data-value="${lang}"]`);
            if (selectedItem) langDropdownValue.textContent = selectedItem.textContent;
        }

        // Save language choice and dispatch an event for other scripts to use the loaded translations.
        localStorage.setItem(LANG_KEY, lang);
        window.translationsData = { translations, lang };
        document.dispatchEvent(new CustomEvent('translationsReady', { detail: { translations, lang } }));
    }

    /**
     * Loads all necessary translation JSON files.
     * @param {string} lang - The target language to apply after loading.
     */
    async function loadAndSetLanguage(lang) {
        try {
            const globalTranslationsPath = '/localization/global.json';
            const pageSourceName = document.querySelector('meta[name="translation-source"]')?.content;
            const pageTranslationsPath = pageSourceName ? `/localization/${pageSourceName}.json` : null;

            // Start fetching the primary translation files.
            const globalPromise = fetch(globalTranslationsPath);
            const pagePromise = pageTranslationsPath ? fetch(pageTranslationsPath) : Promise.resolve(null);
            
            // Also fetch the blog manifest to discover other translation files needed for the blog list.
            const blogManifestPromise = fetch('/blog/blog-manifest.json').catch(() => null);
            const blogManifestRes = await blogManifestPromise;
            let blogTranslationPromises = [];
            if (blogManifestRes && blogManifestRes.ok) {
                const blogManifest = await blogManifestRes.json();
                if(Array.isArray(blogManifest)) {
                    const blogTranslationSources = [...new Set(blogManifest.map(post => post.translationSource).filter(Boolean))];
                    blogTranslationPromises = blogTranslationSources.map(source => fetch(`/localization/${source}.json`).catch(() => null));
                }
            }

            // Wait for all fetches to complete.
            const allResponses = await Promise.all([globalPromise, pagePromise, ...blogTranslationPromises]);
            const successfulResponses = allResponses.filter(Boolean).filter(res => res.ok);
            const allJsonData = await Promise.all(successfulResponses.map(res => res.json()));

            // Merge all loaded JSON data into a single object.
            loadedTranslations = allJsonData.reduce((acc, data) => deepMerge(acc, data), {});
            
            // Apply the final merged translations to the page.
            applyTranslationsToPage(loadedTranslations, lang);
        } catch (error) {
            console.error("Error loading translations:", error);
            applyTranslationsToPage({}, 'en'); // Fallback to empty English on error.
        }
    }

    /**
     * Determines the initial language from URL parameters, localStorage, or browser settings.
     * @returns {string} The language code to use.
     */
    function getInitialLanguage() {
        const urlParams = new URLSearchParams(window.location.search);
        const langFromUrl = urlParams.get('l');
        if (langFromUrl) {
            localStorage.setItem(LANG_KEY, langFromUrl);
            return langFromUrl;
        }
        return localStorage.getItem(LANG_KEY) || navigator.language.split('-')[0] || 'en';
    }

    /**
     * The main initialization function for the settings script.
     */
    async function initialize() {
        // Asynchronously inject SVGs.
        await Promise.all([
            injectSVG(getElement('logo-img'), '/logo/shzh.svg'),
            injectSVG(getElement('start-menu-logo'), '/logo/shzh.svg')
        ]);
        
        // Sync UI controls to match the state already set by theme-loader.js.
        const isEink = docEl.classList.contains('eink-mode');
        if (einkToggle) einkToggle.checked = isEink;
        // Sync the colour-theme availability to the loaded mode (not just on toggle).
        updateColorThemeAvailability(isEink);

        const currentThemeClass = [...docEl.classList].find(c => c.endsWith('-mode') && !['eink-mode', 'lcd-mode'].includes(c));
        if (currentThemeClass) {
            const themeValue = currentThemeClass.replace('-mode', '');
            const radioToCheck = document.querySelector(`input[name="theme"][value="${themeValue}"]`);
            if(radioToCheck) radioToCheck.checked = true;

            // Re-apply funky theme if it was the last one to get random colors.
            if (themeValue === 'funky') {
                applyTheme('funky');
            }
        }
        
        // Load and apply the initial language.
        if (builtLang && !document.querySelector('meta[name="runtime-modules"]')) {
            // Fully pre-rendered page: both the article body AND the chrome
            // (settings / start-menu / share) are baked in `builtLang`, and there
            // are no runtime-injected demo modules needing translation. So we skip
            // the localization fetch entirely and just sync the UI state and
            // notify dependent scripts (e.g. share.js highlight restoration).
            docEl.lang = builtLang;
            docEl.dir = builtLang === 'he' ? 'rtl' : 'ltr';
            if (langDropdownValue && langDropdownMenu) {
                const selectedItem = langDropdownMenu.querySelector(`.custom-dropdown-item[data-value="${builtLang}"]`);
                if (selectedItem) langDropdownValue.textContent = selectedItem.textContent;
            }
            window.translationsData = { translations: {}, lang: builtLang };
            document.dispatchEvent(new CustomEvent('translationsReady', { detail: { translations: {}, lang: builtLang } }));
        } else {
            // Hub, or a built page that still has runtime demo modules to
            // translate: run the full pass. On a built page we force `builtLang`
            // (the URL fixes the language); re-applying it to the already-baked
            // body/chrome is idempotent, while the injected demos get translated.
            const initialLang = builtLang || getInitialLanguage();
            await loadAndSetLanguage(initialLang);
        }

        // Update the favicon on initial page load
        await updateFavicon();
    }
    
    // Setup the language dropdown interactivity.
    if (langDropdown) {
        langDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdownMenu.classList.toggle('show');
        });
        langDropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = item.dataset.value;
                langDropdownMenu.classList.remove('show');
                if (pageBase) {
                    // Built per-language page: navigate to the sibling-language
                    // page. If this post isn't translated into `lang`, fall back
                    // to English (or do nothing if even that doesn't exist).
                    if (pageLangs.length && !pageLangs.includes(lang)) {
                        if (pageLangs.includes('en')) window.location.href = `${pageBase}en/`;
                    } else {
                        window.location.href = `${pageBase}${lang}/`;
                    }
                } else {
                    // Hub: swap text in place (lazy translation).
                    loadAndSetLanguage(lang);
                }
            });
        });
        window.addEventListener('click', () => {
            if (langDropdownMenu.classList.contains('show')) {
                langDropdownMenu.classList.remove('show');
            }
        });
    }

    // Run the main initialization.
    initialize();

    // Make the playAudio function globally available if the music player exists.
    if(getElement('music-play-btn')) {
        window.playAudio = function() {
            const audioPlayer = getElement("audio");
            if (audioPlayer) {
                audioPlayer.play().catch(e => console.error("Audio play failed:", e));
            }
        }
    }
}

// This script waits for the 'modulesLoaded' event from module-loader.js before running.
// This ensures that all HTML placeholders have been filled.
document.addEventListener('modulesLoaded', setupSettings);
