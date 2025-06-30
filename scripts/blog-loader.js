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
            linkElement.href = post.link;
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
            readMoreElement.innerHTML = `<i><a href="${post.link}">read more &rarr;</a></i>`;

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

    // Run the main loader function.
    loadBlogPosts();

    // REMOVED: The event listener for 'translationsReady' is no longer needed with this approach.
});
