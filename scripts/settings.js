// settings.js
// No longer needs a DOMContentLoaded wrapper, as scripts/module-loader.js ensures the DOM is ready.

// --- DOM Element References ---
// Encapsulate in a function to avoid polluting the global scope
function setupSettings() {
    const getElement = (id) => document.getElementById(id);
    const body = document.body;
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
    const colorThemes = {
        funky: { random: true }, // Special case
        champagne: { bg: '#F7E7CE', text: '#4A403A', border: '#D4AF37', accent: '#A47C48' },
        bubblegum: { bg: '#FBCFF3', text: '#A62675', border: '#DE3163', accent: '#FF69B4' },
        techelet: { bg: '#E6E6FA', text: '#001F3F', border: '#4169E1', accent: '#87CEEB' },
        zelyonny: { bg: '#DFF0D8', text: '#2E4620', border: '#3C763D', accent: '#5CB85C' },
        akai: { bg: '#FFEBEE', text: '#6D0000', border: '#C62828', accent: '#E53935' },
        rindswurst: { bg: '#F5E6E0', text: '#5D4037', border: '#8D6E63', accent: '#A1887F' }
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
                // Copy ID and classes from the original image to the new SVG element
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
        const isEink = mode === "eink";
        body.classList.toggle("eink-mode", isEink);
        body.classList.toggle("lcd-mode", !isEink);
        if (einkToggle) einkToggle.checked = isEink;

        const themeSettingGroup = getElement('theme-setting-group');
        themeSettingGroup.querySelectorAll('.color-theme').forEach(label => {
            label.style.opacity = isEink ? '0.5' : '1';
            const radio = label.querySelector('input');
            radio.disabled = isEink;
        });

        const currentTheme = localStorage.getItem(THEME_KEY) || 'light';
        const isCurrentThemeColor = colorThemes.hasOwnProperty(currentTheme);

        if (isEink && isCurrentThemeColor) {
            // If switching to e-ink from a color theme, fall back to light
            applyTheme('light');
        } else if (!isEink && !isCurrentThemeColor) {
             // If switching back to LCD from an e-ink theme, restore the last color theme
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
        // Remove all potential theme classes before adding the new one
        body.className = body.className.replace(/\b\w+-mode\b/g, '');
        body.classList.add(`${theme}-mode`);
        // Re-apply the display mode class (eink or lcd)
        body.classList.add(localStorage.getItem(MODE_KEY) === 'lcd' ? 'lcd-mode' : 'eink-mode');
        
        const themeColors = colorThemes[theme];
        if (themeColors) {
            if (themeColors.random) {
                const randomHue = () => Math.floor(Math.random() * 360);
                const baseHue = randomHue();
                const accentHue = (baseHue + 150) % 360;
                
                // Generate a random background lightness and a contrasting text lightness
                const bgLightness = 20 + Math.random() * 60; // Random lightness between 20% (dark) and 80% (light)
                const textLightness = bgLightness > 50 ? 15 : 85; // Ensure contrast

                document.documentElement.style.setProperty('--theme-bg-color', `hsl(${baseHue}, 50%, ${bgLightness}%)`);
                document.documentElement.style.setProperty('--theme-text-color', `hsl(${baseHue}, 15%, ${textLightness}%)`);
                document.documentElement.style.setProperty('--theme-border-color', `hsl(${accentHue}, 80%, 70%)`);
                document.documentElement.style.setProperty('--theme-accent-color', `hsl(${accentHue}, 70%, 55%)`);
            } else {
                 document.documentElement.style.setProperty('--theme-bg-color', themeColors.bg);
                 document.documentElement.style.setProperty('--theme-text-color', themeColors.text);
                 document.documentElement.style.setProperty('--theme-border-color', themeColors.border);
                 document.documentElement.style.setProperty('--theme-accent-color', themeColors.accent);
            }
            // Only save color themes to this key
            localStorage.setItem(LAST_COLOR_THEME_KEY, theme);
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
                 elem.innerHTML = translations[lang][key];
            }
        });
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
        
        // Update the custom dropdown display
        if (langDropdownValue && langDropdownMenu) {
            const selectedItem = langDropdownMenu.querySelector(`.custom-dropdown-item[data-value="${lang}"]`);
            if (selectedItem) {
                langDropdownValue.textContent = selectedItem.textContent;
            }
        }

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
        // Inject SVGs first
        const logoImg = getElement('logo-img');
        const startMenuLogo = getElement('start-menu-logo');
        if (logoImg) {
            await injectSVG(logoImg, '/logo/shzh.svg');
        }
        if (startMenuLogo) {
            await injectSVG(startMenuLogo, '/logo/shzh.svg');
        }

        const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const savedMode = localStorage.getItem(MODE_KEY) || 'eink';
        
        applyTheme(savedTheme);
        applyMode(savedMode);

        const savedLang = localStorage.getItem(LANG_KEY) || navigator.language.split('-')[0];
        await loadAndSetLanguage(savedLang);
    }
    
    // --- Custom Dropdown Logic ---
    if (langDropdown) {
        // Toggle dropdown visibility
        langDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent window click listener from firing immediately
            langDropdownMenu.classList.toggle('show');
        });

        // Handle language selection
        langDropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = item.dataset.value;
                loadAndSetLanguage(lang);
                langDropdownMenu.classList.remove('show');
            });
        });

        // Close dropdown if clicked outside
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
setupSettings();
