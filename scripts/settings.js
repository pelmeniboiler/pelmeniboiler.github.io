// settings.js
// No longer needs a DOMContentLoaded wrapper, as scripts/module-loader.js ensures the DOM is ready.

// --- DOM Element References ---
// Encapsulate in a function to avoid polluting the global scope
function setupSettings() {
    const getElement = (id) => document.getElementById(id);
    const body = document.body;
    const welcomeText = getElement('welcome-text');
    const logoImg = getElement('logo-img');
    const startMenuLogo = getElement('start-menu-logo');
    const languageSelect = getElement('language-select');
    const einkToggle = getElement('eink-toggle');
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    const settingsNavItems = document.querySelectorAll('.settings-nav li');

    // --- Settings Keys ---
    const THEME_KEY = 'pelmeniboiler-theme';
    const MODE_KEY = 'pelmeniboiler-mode';
    const LANG_KEY = 'pelmeniboiler-lang';

    // Variable to hold translation data once it's fetched
    let loadedTranslations = {};

    // --- Settings Window Tab Navigation ---
    if (settingsNavItems.length > 0) {
        settingsNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetId = `settings-page-${item.dataset.target}`;
                // Deactivate current active elements
                document.querySelectorAll('.settings-page.active, .settings-nav li.active').forEach(activeEl => {
                    activeEl.classList.remove('active');
                });
                // Activate new target page and nav item
                const targetPage = getElement(targetId);
                if (targetPage) targetPage.classList.add('active');
                item.classList.add('active');
            });
        });
    }

    // --- Welcome Text Update Logic ---
    function updateWelcomeText() {
        if (!welcomeText) return;
        const mode = body.classList.contains('eink-mode') ? 'eink' : 'lcd';
        const lang = localStorage.getItem(LANG_KEY) || 'en';
        const welcomeKey = mode === 'eink' ? 'welcome_text_eink' : 'welcome_text_lcd';
        if (loadedTranslations[lang] && loadedTranslations[lang][welcomeKey]) {
            welcomeText.innerHTML = loadedTranslations[lang][welcomeKey];
        }
    }

    // --- E-ink / LCD Mode Logic ---
    function applyMode(mode) {
        if (mode === "lcd") {
            body.classList.add("lcd-mode");
            body.classList.remove("eink-mode");
            if (einkToggle) einkToggle.checked = false;
        } else {
            body.classList.remove("lcd-mode");
            body.classList.add("eink-mode");
            if (einkToggle) einkToggle.checked = true;
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
        body.classList.remove('light-mode', 'dark-mode', 'funky-mode');
        body.classList.add(`${theme}-mode`);
        
        const newSrc = theme === 'dark' || theme === 'funky' ? '/logo/shzh-white.svg' : '/logo/shzh.svg';
        
        if (logoImg) logoImg.src = newSrc;
        if (startMenuLogo) startMenuLogo.src = newSrc;
        if (theme === 'funky') {
            const randomHue = () => Math.floor(Math.random() * 360);
            const baseHue = randomHue();
            const accentHue = (baseHue + 150) % 360;
            document.documentElement.style.setProperty('--funky-bg-color', `hsl(${baseHue}, 20%, 10%)`);
            document.documentElement.style.setProperty('--funky-text-color', `hsl(${baseHue}, 15%, 85%)`);
            document.documentElement.style.setProperty('--funky-border-color', `hsl(${accentHue}, 80%, 70%)`);
            document.documentElement.style.setProperty('--funky-accent-color', `hsl(${accentHue}, 70%, 55%)`);
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

    // --- Language Logic ---
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
        if (!translations[lang]) lang = 'en'; // Fallback to English
        document.querySelectorAll('[data-key]').forEach(elem => {
            const key = elem.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) {
                if (elem.tagName === 'INPUT' && elem.type === 'radio') {
                    const label = elem.parentElement;
                    if (label.nodeName === 'LABEL') {
                        label.innerHTML = ''; 
                        label.appendChild(elem);
                        label.appendChild(document.createTextNode(' ' + translations[lang][key]));
                    }
                } else {
                    elem.innerHTML = translations[lang][key];
                }
            }
        });
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
        if (languageSelect) languageSelect.value = lang;
        localStorage.setItem(LANG_KEY, lang);
        
        window.translationsData = { translations, lang };
        document.dispatchEvent(new CustomEvent('translationsReady', { detail: { translations, lang } }));
    }

    async function loadAndSetLanguage(lang) {
        try {
            // Define paths for core translation files
            const globalTranslationsPath = '/localization/global.json';
            const pageSourceName = document.querySelector('meta[name="translation-source"]')?.content;
            const pageTranslationsPath = pageSourceName ? `/localization/${pageSourceName}.json` : null;

            // Start fetching core files and the blog manifest concurrently.
            const globalPromise = fetch(globalTranslationsPath);
            const pagePromise = pageTranslationsPath ? fetch(pageTranslationsPath) : Promise.resolve(null);
            const blogManifestPromise = fetch('/blog/blog-manifest.json').catch(e => {
                console.warn("Blog manifest not found. Blog post-specific translations will be unavailable.", e);
                return null; // Don't break if the manifest is missing
            });

            // Await the manifest first, as we need its content to know what else to fetch.
            const blogManifestRes = await blogManifestPromise;
            let blogTranslationPromises = [];

            if (blogManifestRes && blogManifestRes.ok) {
                const blogManifest = await blogManifestRes.json();
                if(Array.isArray(blogManifest)) {
                    // Get a unique set of translation source names from the blog posts.
                    const blogTranslationSources = [...new Set(blogManifest.map(post => post.translationSource).filter(Boolean))];
                    // Create fetch promises for each unique blog translation file.
                    blogTranslationPromises = blogTranslationSources.map(source =>
                        fetch(`/localization/${source}.json`).catch(e => {
                            console.warn(`Could not load translation source: ${source}.json`, e);
                            return null; // Return null on failure to not break Promise.all
                        })
                    );
                }
            }
            
            // Wait for ALL translation files (core and blog-specific) to finish loading.
            const allResponses = await Promise.all([
                globalPromise,
                pagePromise,
                ...blogTranslationPromises
            ]);
            
            // Filter out any failed or null fetches and check responses.
            const successfulResponses = allResponses.filter(Boolean);
            successfulResponses.forEach(res => {
                if (!res.ok) throw new Error(`Failed to fetch ${res.url}: ${res.statusText}`);
            });

            // Convert all successful responses to JSON.
            const allJsonData = await Promise.all(successfulResponses.map(res => res.json()));
            
            // Deep merge all translation objects into the master list, starting with an empty object.
            loadedTranslations = allJsonData.reduce((acc, data) => deepMerge(acc, data), {});
            
            // Finally, apply the fully merged translations to the page.
            applyTranslationsToPage(loadedTranslations, lang);

        } catch (error) {
            console.error("Error loading translations:", error);
            applyTranslationsToPage({}, 'en'); // Fallback to empty on error
        }
    }

    // --- Initialization ---
    async function initialize() {
        const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(savedTheme);

        const savedMode = localStorage.getItem(MODE_KEY) || 'eink';
        applyMode(savedMode);

        const savedLang = localStorage.getItem(LANG_KEY) || navigator.language.split('-')[0];
        await loadAndSetLanguage(savedLang);
    }

    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            loadAndSetLanguage(languageSelect.value);
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
setupSettings();
