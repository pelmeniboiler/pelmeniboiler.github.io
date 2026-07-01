// /scripts/blog-loader.js
// This script fetches the blog manifest, creates filter buttons, and dynamically populates the blog window.
// It now also handles the logic for the RSS feed dropdown menu.

document.addEventListener('DOMContentLoaded', () => {
    const filterContainer = document.getElementById('blog-filter-container');
    const postsListContainer = document.getElementById('blog-posts-list');
    let allPosts = [];

    if (!filterContainer || !postsListContainer) {
        return;
    }

    /**
     * The language currently in effect on the hub (it stays a single page and
     * switches language in place). Used to point post links at the matching
     * pre-built /blog/<slug>/<lang>/ page.
     */
    const currentLang = () =>
        (window.translationsData && window.translationsData.lang) ||
        localStorage.getItem('pelmeniboiler-lang') ||
        document.documentElement.lang ||
        'en';

    /**
     * Root-relative URL of a post's pre-built page in the given language, falling
     * back to English (then any available language) when that post hasn't been
     * translated into the requested one. Falls back to the legacy flat URL only
     * if the manifest lacks slug/language data.
     */
    const postUrl = (post, lang) => {
        if (!post.slug || !Array.isArray(post.languages) || post.languages.length === 0) {
            return post.link;
        }
        const target = post.languages.includes(lang)
            ? lang
            : (post.languages.includes('en') ? 'en' : post.languages[0]);
        return `/blog/${post.slug}/${target}/`;
    };

    /** Re-point already-rendered post links when the hub language changes. */
    const updateRenderedLinks = (lang) => {
        postsListContainer.querySelectorAll('a[data-slug]').forEach((a) => {
            const languages = a.dataset.langs ? a.dataset.langs.split(',') : [];
            const target = languages.includes(lang)
                ? lang
                : (languages.includes('en') ? 'en' : languages[0] || '');
            if (target) a.href = `/blog/${a.dataset.slug}/${target}/`;
        });
    };

    /**
     * Human-facing dates: Anno Mundi (Hebrew calendar) by default, Japanese era
     * for ja. Mirrors formatDisplayDate() in build/build.mjs. Machine dates
     * elsewhere (RSS/JSON-LD) stay ISO/RFC — this only touches what people read.
     */
    const formatDisplayDate = (date, lang) => {
        const d = new Date(date);
        try {
            if (lang === 'ja') {
                return new Intl.DateTimeFormat('ja-u-ca-japanese', { era: 'short', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
            }
            const loc = ({ he: 'he', de: 'de', ru: 'ru' })[lang] || 'en';
            return new Intl.DateTimeFormat(`${loc}-u-ca-hebrew`, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
        } catch (_) {
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
    };
    /** Re-format the (baked) card dates for the active language. */
    const updateDates = (lang) => {
        postsListContainer.querySelectorAll('.post-date[data-date]').forEach((el) => {
            el.textContent = formatDisplayDate(el.dataset.date, lang);
        });
    };

    document.addEventListener('translationsReady', (e) => {
        updateRenderedLinks(e.detail.lang);
        updateDates(e.detail.lang);
    });

    /**
     * Re-applies translations to a specific container.
     * Needed after filtering to translate newly added elements.
     * @param {object} translations - The loaded translation data.
     * @param {string} lang - The current language code.
     * @param {string} scopeSelector - A CSS selector for the container to translate.
     */
    function applyTranslationsToScope(translations, lang, scopeSelector) {
        const scope = document.querySelector(scopeSelector);
        if (!scope) return;
        
        if (!translations[lang]) lang = 'en'; // Fallback to English
        scope.querySelectorAll('[data-key]').forEach(elem => {
            const key = elem.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) {
                elem.innerHTML = translations[lang][key];
            }
        });
    }

    /**
     * Renders a given array of posts to the DOM.
     * It sets up the elements with data-keys, allowing the main translation script to populate them,
     * and adds a separate "read more" link that won't be overwritten.
     * @param {Array} postsToRender - The array of post objects to display.
     */
    const renderPosts = (postsToRender) => {
        postsListContainer.innerHTML = '';
        
        if (postsToRender.length === 0) {
            postsListContainer.innerHTML = '<p data-key="blog_no_posts_filter">No posts match the selected keyword.</p>';
            if (window.translationsData) {
                const { translations, lang } = window.translationsData;
                applyTranslationsToScope(translations, lang, '#blog-posts-list');
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        postsToRender.forEach(post => {
            const postArticle = document.createElement('article');
            postArticle.className = 'blog-post';
            
            // --- Title and Date elements (unchanged) ---
            const titleElement = document.createElement('h3');
            const linkElement = document.createElement('a');
            const href = postUrl(post, currentLang());
            linkElement.href = href;
            if (post.slug) linkElement.dataset.slug = post.slug;
            if (Array.isArray(post.languages)) linkElement.dataset.langs = post.languages.join(',');
            linkElement.setAttribute('data-key', post.titleKey);
            linkElement.textContent = post.title; // Set default text
            titleElement.appendChild(linkElement);

            const date = new Date(post.date);
            const dateElement = document.createElement('p');
            dateElement.className = 'post-date';
            dateElement.textContent = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // --- Description and "Read More" link (MODIFIED) ---
            
            // 1. Create the description paragraph. This will be targeted by the translation script.
            const descriptionElement = document.createElement('p');
            descriptionElement.setAttribute('data-key', post.descriptionKey);
            descriptionElement.textContent = post.description;

            // 2. Create a *separate* paragraph for the "read more" link.
            //    This element has no data-key and will not be touched by the translation script.
            const readMoreElement = document.createElement('p');
            const langsAttr = Array.isArray(post.languages) ? post.languages.join(',') : '';
            readMoreElement.innerHTML = `<i><a href="${href}" data-slug="${post.slug || ''}" data-langs="${langsAttr}">read more &rarr;</a></i>`;

            // Append all elements to the article
            postArticle.appendChild(titleElement);
            postArticle.appendChild(dateElement);
            postArticle.appendChild(descriptionElement);
            postArticle.appendChild(readMoreElement); // Add the link element after the description
            
            fragment.appendChild(postArticle);
        });
        postsListContainer.appendChild(fragment);

        // If translations are already loaded (e.g., when re-filtering), apply them.
        if (window.translationsData) {
            const { translations, lang } = window.translationsData;
            applyTranslationsToScope(translations, lang, '#blog-posts-list');
        }
    };

    const setupFilters = (posts) => {
        const keywords = new Set(posts.flatMap(p => p.keywords || []));
        
        const allButton = document.createElement('button');
        allButton.className = 'filter-btn active';
        allButton.innerHTML = `<span class="symbol">✧</span> All`;
        allButton.dataset.keyword = 'All';
        filterContainer.appendChild(allButton);

        const keywordIconMap = {
            "Language": "▤", "Photos": "🖻", "Projects": "🗀", "Keyboards": "⌨", "Meta" : "♻"
        };
        keywords.forEach(keyword => {
            const button = document.createElement('button');
            button.className = 'filter-btn';
            const icon = keywordIconMap[keyword] || '◆';
            button.innerHTML = `<span class="symbol">${icon}</span> ${keyword}`;
            button.dataset.keyword = keyword;
            filterContainer.appendChild(button);
        });

        filterContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.filter-btn');
            if (!clickedButton) return;

            filterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            clickedButton.classList.add('active');

            const selectedKeyword = clickedButton.dataset.keyword;
            const postsToRender = (selectedKeyword === 'All')
                ? allPosts
                : allPosts.filter(post => post.keywords && post.keywords.includes(selectedKeyword));
            
            renderPosts(postsToRender);
        });
    };
    
    const setupRssDropdown = () => {
        const rssButton = document.querySelector('.rss-btn');
        const rssDropdown = document.querySelector('.rss-dropdown-content');

        if (rssButton && rssDropdown) {
            rssButton.addEventListener('click', (event) => {
                event.stopPropagation();
                rssDropdown.classList.toggle('show');
            });
            
            window.addEventListener('click', function(event) {
                if (rssDropdown.classList.contains('show') && !event.target.closest('.rss-dropdown-container')) {
                    rssDropdown.classList.remove('show');
                }
            });
        }
    }

    // When the blog list is baked into the HTML at build time, don't fetch or
    // rebuild it — just wire the (already-rendered) filter buttons to show/hide
    // the (already-rendered) cards by their data-keywords. No manifest fetch.
    const setupBakedFiltering = () => {
        filterContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;
            filterContainer.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const kw = btn.dataset.keyword;
            postsListContainer.querySelectorAll('.blog-post').forEach((card) => {
                const kws = (card.dataset.keywords || '').split(',').filter(Boolean);
                card.style.display = (kw === 'All' || kws.includes(kw)) ? '' : 'none';
            });
        });
    };

    const loadBlogPosts = async () => {
        try {
            postsListContainer.innerHTML = '<p data-key="blog_loading">Loading posts...</p>';
            const response = await fetch('/blog/blog-manifest.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            allPosts = await response.json();
            
            allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (!allPosts || allPosts.length === 0) {
                postsListContainer.innerHTML = '<p data-key="blog_no_posts">No posts found.</p>';
                return;
            }

            setupFilters(allPosts);
            renderPosts(allPosts);
            setupRssDropdown();

        } catch (error) {
            console.error('Failed to load blog posts:', error);
            if (postsListContainer) {
                postsListContainer.innerHTML = '<p style="color: red;" data-key="blog_error">Could not load blog posts.</p>';
            }
        }
    };

    // If the blog list was baked in at build time, enhance it in place (no fetch);
    // otherwise fall back to fetching the manifest and rendering client-side.
    if (postsListContainer.querySelector('.blog-post')) {
        setupBakedFiltering();
        setupRssDropdown();
        // Format the baked dates + links for the current language right away;
        // the translationsReady listener above keeps them in sync on switches.
        updateRenderedLinks(currentLang());
        updateDates(currentLang());
    } else {
        loadBlogPosts();
    }
});
