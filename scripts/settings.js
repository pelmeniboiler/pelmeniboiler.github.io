// settings.js
// No longer needs a DOMContentLoaded wrapper, as scripts/module-loader.js ensures the DOM is ready.

// --- DOM Element References ---
// Encapsulate in a function to avoid polluting the global scope
function setupSettings() {
    const getElement = (id) => document.getElementById(id);
    const body = document.body;
    const docEl = document.documentElement; // Get reference to <html>
    const welcomeText = getElement('welcome-text');
    
    // --- Custom Language Dropdown Elements ---
    const langDropdown = getElement('language-select-custom');
    const langDropdownToggle = langDropdown?.querySelector('.custom-dropdown-toggle');
    const langDropdownValue = getElement('language-select-value');
    const langDropdownMenu = langDropdown?.querySelector('.custom-dropdown-menu');
    const langDropdownItems = langDropdown?.querySelectorAll('.custom-dropdown-item');

    const einkToggle = getElement('eink-toggle');
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    const settingsNavItems = document.querySelectorAll('.settings-nav li');

    // --- Settings Keys ---
    const THEME_KEY = 'pelmeniboiler-theme';
    const MODE_KEY = 'pelmeniboiler-mode';
    const LANG_KEY = 'pelmeniboiler-lang';
    const LAST_COLOR_THEME_KEY = 'pelmeniboiler-last-color-theme';


    // --- Color Theme Definitions ---
    // MODIFIED: Only the 'funky' theme needs a JS definition now.
    // The rest are handled by themes.css.
    const colorThemes = {
        funky: { random: true }
    };

    // Variable to hold translation data once it's fetched
    let loadedTranslations = {};

    /**
     * Fetches an SVG file and replaces an <img> element with its inline content.
     * This allows the SVG to be styled with CSS.
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
                svgElement.id = imgElement.id;
                imgElement.classList.forEach(c => svgElement.classList.add(c));
                imgElement.parentElement.replaceChild(svgElement, imgElement);
            }
        } catch (error) {
            console.error('Failed to inject SVG:', error);
        }
    }


    // --- Settings Window Tab Navigation ---
    if (settingsNavItems.length > 0) {
        settingsNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetId = `settings-page-${item.dataset.target}`;
                document.querySelectorAll('.settings-page.active, .settings-nav li.active').forEach(activeEl => {
                    activeEl.classList.remove('active');
                });
                const targetPage = getElement(targetId);
                if (targetPage) targetPage.classList.add('active');
                item.classList.add('active');
            });
        });
    }

    // --- Welcome Text Update Logic ---
    function updateWelcomeText() {
        if (!welcomeText) return;
        const mode = docEl.classList.contains('eink-mode') ? 'eink' : 'lcd';
        const lang = localStorage.getItem(LANG_KEY) || 'en';
        const welcomeKey = mode === 'eink' ? 'welcome_text_eink' : 'welcome_text_lcd';
        if (loadedTranslations[lang] && loadedTranslations[lang][welcomeKey]) {
            welcomeText.innerHTML = loadedTranslations[lang][welcomeKey];
        }
    }

     // --- E-ink / LCD Mode Logic ---
     function applyMode(mode) {
        const isEink = mode === "eink";
        // Use documentElement for class manipulation
        docEl.classList.toggle("eink-mode", isEink);
        docEl.classList.toggle("lcd-mode", !isEink);
        if (einkToggle) einkToggle.checked = isEink;

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

        if (isEink && isCurrentThemeColor) {
            applyTheme('light');
        } else if (!isEink && docEl.classList.contains('light-mode')) {
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

    // --- Theme Logic ---
    function applyTheme(theme) {
        // Remove all other theme classes from the <html> element
        const themeClasses = [...docEl.classList].filter(c => c.endsWith('-mode') && !['eink-mode', 'lcd-mode'].includes(c));
        docEl.classList.remove(...themeClasses);
        
        // Add the new theme class
        docEl.classList.add(`${theme}-mode`);
        
        // Special handling for the random 'funky' theme remains in JS
        if (theme === 'funky') {
            const randomHue = () => Math.floor(Math.random() * 360);
            const baseHue = randomHue();
            const accentHue = (baseHue + 150) % 360;
            const bgLightness = 20 + Math.random() * 60;
            const textLightness = bgLightness > 50 ? 15 : 85;

            docEl.style.setProperty('--theme-bg-color', `hsl(${baseHue}, 50%, ${bgLightness}%)`);
            docEl.style.setProperty('--theme-text-color', `hsl(${baseHue}, 15%, ${textLightness}%)`);
            docEl.style.setProperty('--theme-border-color', `hsl(${accentHue}, 80%, 70%)`);
            docEl.style.setProperty('--theme-accent-color', `hsl(${accentHue}, 70%, 55%)`);
            localStorage.setItem(LAST_COLOR_THEME_KEY, theme);
        } else {
            // For all other themes, clear the inline styles to let the CSS file take over.
            docEl.style.removeProperty('--theme-bg-color');
            docEl.style.removeProperty('--theme-text-color');
            docEl.style.removeProperty('--theme-border-color');
            docEl.style.removeProperty('--theme-accent-color');
            
            // If it's not a light/dark theme, save it as the last used color theme.
            if (theme !== 'light' && theme !== 'dark') {
                localStorage.setItem(LAST_COLOR_THEME_KEY, theme);
            }
        }
        
        const radioToCheck = document.querySelector(`input[name="theme"][value="${theme}"]`);
        if(radioToCheck) radioToCheck.checked = true;
        
        localStorage.setItem(THEME_KEY, theme);
    }

    if (themeRadios.length > 0) {
        themeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if(e.target.checked) applyTheme(e.target.value);
            });
        });
    }

    // --- Language Logic (No changes needed here) ---
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

    function applyTranslationsToPage(translations, lang) {
        if (!translations[lang]) lang = 'en';
        document.querySelectorAll('[data-key]').forEach(elem => {
            const key = elem.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) elem.innerHTML = translations[lang][key];
        });
        document.querySelectorAll('[data-title-key]').forEach(elem => {
            const key = elem.getAttribute('data-title-key');
            if (translations[lang] && translations[lang][key]) elem.title = translations[lang][key];
        });
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
        if (langDropdownValue && langDropdownMenu) {
            const selectedItem = langDropdownMenu.querySelector(`.custom-dropdown-item[data-value="${lang}"]`);
            if (selectedItem) langDropdownValue.textContent = selectedItem.textContent;
        }
        localStorage.setItem(LANG_KEY, lang);
        window.translationsData = { translations, lang };
        document.dispatchEvent(new CustomEvent('translationsReady', { detail: { translations, lang } }));
    }

    async function loadAndSetLanguage(lang) {
        try {
            const globalTranslationsPath = '/localization/global.json';
            const pageSourceName = document.querySelector('meta[name="translation-source"]')?.content;
            const pageTranslationsPath = pageSourceName ? `/localization/${pageSourceName}.json` : null;
            const globalPromise = fetch(globalTranslationsPath);
            const pagePromise = pageTranslationsPath ? fetch(pageTranslationsPath) : Promise.resolve(null);
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
            const allResponses = await Promise.all([globalPromise, pagePromise, ...blogTranslationPromises]);
            const successfulResponses = allResponses.filter(Boolean).filter(res => res.ok);
            const allJsonData = await Promise.all(successfulResponses.map(res => res.json()));
            loadedTranslations = allJsonData.reduce((acc, data) => deepMerge(acc, data), {});
            applyTranslationsToPage(loadedTranslations, lang);
        } catch (error) {
            console.error("Error loading translations:", error);
            applyTranslationsToPage({}, 'en');
        }
    }

    function getInitialLanguage() {
        const urlParams = new URLSearchParams(window.location.search);
        const langFromUrl = urlParams.get('l');
        if (langFromUrl) {
            localStorage.setItem(LANG_KEY, langFromUrl);
            return langFromUrl;
        }
        return localStorage.getItem(LANG_KEY) || navigator.language.split('-')[0] || 'en';
    }


    // --- Initialization ---
    async function initialize() {
        // Inject SVGs
        await Promise.all([
            injectSVG(getElement('logo-img'), '/logo/shzh.svg'),
            injectSVG(getElement('start-menu-logo'), '/logo/shzh.svg')
        ]);

        // The theme and mode are already applied by theme-loader.js.
        // We just need to sync the UI controls (radios, toggles) to match the state.
        const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const savedMode = localStorage.getItem(MODE_KEY) || 'lcd';
        
        // Sync UI without re-applying the whole theme logic
        if (einkToggle) einkToggle.checked = savedMode === 'eink';
        const radioToCheck = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
        if(radioToCheck) radioToCheck.checked = true;

        // If the saved theme was funky, we need to run applyTheme once to generate the colors.
        if (savedTheme === 'funky') {
            applyTheme('funky');
        }

        // Load language
        const initialLang = getInitialLanguage();
        await loadAndSetLanguage(initialLang);
    }
    
    // --- Custom Dropdown Logic (No changes needed) ---
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

    initialize();

    if(getElement('music-play-btn')) {
        window.playAudio = function() {
            const audioPlayer = getElement("audio");
            if (audioPlayer) {
                audioPlayer.play().catch(e => console.error("Audio play failed:", e));
            }
        }
    }
}

// Run the setup function
document.addEventListener('modulesLoaded', setupSettings);
