// This script manages all user-configurable settings including theme, mode, and language.
// It is designed to be portable and can be included in any page on the site.

// This script manages all user-configurable settings including theme, mode, and language.
// It now correctly shares translation data with other scripts.

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
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
        const newSrc = theme === 'dark' || theme === 'funky' ? 'shzh-white.svg' : 'shzh.svg';
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
        
        // ** THE CRITICAL FIX IS HERE **
        // After applying, we store the data globally and then dispatch the event.
        window.translationsData = { translations, lang };
        document.dispatchEvent(new CustomEvent('translationsReady', { detail: { translations, lang } }));
    }

    async function loadAndSetLanguage(lang) {
        try {
            const globalTranslationsPath = 'localization/global.json';
            const pageSourceName = document.querySelector('meta[name="translation-source"]')?.content;
            const pageTranslationsPath = pageSourceName ? `localization/${pageSourceName}.json` : null;
            const fetchPromises = [fetch(globalTranslationsPath)];
            if (pageTranslationsPath) {
                fetchPromises.push(fetch(pageTranslationsPath));
            }
            const responses = await Promise.all(fetchPromises);
            responses.forEach(res => {
                if (!res.ok) throw new Error(`Failed to fetch ${res.url}: ${res.statusText}`);
            });
            const jsonPromises = responses.map(res => res.json());
            const [globalData, pageData] = await Promise.all(jsonPromises);
            
            loadedTranslations = deepMerge(globalData, pageData || {});
            
            applyTranslationsToPage(loadedTranslations, lang);
        } catch (error) {
            console.error("Error loading translations:", error);
            applyTranslationsToPage({}, 'en');
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

    // Make the audio player globally accessible
    if(getElement('music-play-btn')) {
        window.playAudio = function() {
            const audioPlayer = getElement("audio");
            if (audioPlayer) {
                audioPlayer.play().catch(e => console.error("Audio play failed:", e));
            }
        }
    }
    
});