// settings.js
// This version is updated to manage theme/mode classes on both <html> and <body>
// to ensure consistency and support for existing CSS rules.

function setupSettings() {
    // Helper to quickly get elements by their ID
    const getElement = (id) => document.getElementById(id);

    // --- DOM ELEMENT REFERENCES ---
    const body = document.body;
    const docEl = document.documentElement; // Reference to <html> element
    const welcomeText = getElement('welcome-text');
    
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
     * Updates the welcome text on the main page based on the current mode (e-ink/lcd).
     */
    function updateWelcomeText() {
        if (!welcomeText) return;
        const mode = docEl.classList.contains('eink-mode') ? 'eink' : 'lcd';
        const lang = localStorage.getItem(LANG_KEY) || 'en';
        const welcomeKey = mode === 'eink' ? 'welcome_text_eink' : 'welcome_text_lcd';
        if (loadedTranslations[lang] && loadedTranslations[lang][welcomeKey]) {
            welcomeText.innerHTML = loadedTranslations[lang][welcomeKey];
        }
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

        // Disable color theme options when in e-ink mode
        const themeSettingGroup = getElement('theme-setting-group');
        if (themeSettingGroup) {
            themeSettingGroup.querySelectorAll('.color-theme').forEach(label => {
                label.style.opacity = isEink ? '0.5' : '1';
                const radio = label.querySelector('input');
                if (radio) radio.disabled = isEink;
            });
        }

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
        updateWelcomeText();
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
    }

    if (themeRadios.length > 0) {
        themeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if(e.target.checked) applyTheme(e.target.value);
            });
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
        const initialLang = getInitialLanguage();
        await loadAndSetLanguage(initialLang);
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
                loadAndSetLanguage(lang);
                langDropdownMenu.classList.remove('show');
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
