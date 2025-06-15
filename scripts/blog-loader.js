// /scripts/blog-loader.js
// This script fetches the blog manifest, creates filter buttons, and dynamically populates the blog window.

document.addEventListener('DOMContentLoaded', () => {
    const filterContainer = document.getElementById('blog-filter-container');
    const postsListContainer = document.getElementById('blog-posts-list');
    
    // Store all posts fetched from the manifest to avoid re-fetching on filter.
    let allPosts = [];

    // Exit if the required containers are not on the page.
    if (!filterContainer || !postsListContainer) {
        return;
    }

    /**
     * Re-applies translations to a specific part of the page. This is needed after filtering.
     * @param {object} translations - The loaded translation data from settings.js.
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
                // Use innerHTML to support potential HTML in translations.
                elem.innerHTML = translations[lang][key];
            }
        });
    }

    /**
     * Renders a given array of posts to the DOM.
     * @param {Array} postsToRender - The array of post objects to display.
     */
    const renderPosts = (postsToRender) => {
        // Clear previous posts.
        postsListContainer.innerHTML = '';
        
        if (postsToRender.length === 0) {
            postsListContainer.innerHTML = '<p data-key="blog_no_posts_filter">No posts match the selected keyword.</p>';
            // Manually trigger translation for this new element if translations are already loaded
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

            const titleElement = document.createElement('h3');
            const linkElement = document.createElement('a');
            linkElement.href = post.link;
            linkElement.setAttribute('data-key', post.titleKey);
            linkElement.textContent = post.title;
            titleElement.appendChild(linkElement);

            const date = new Date(post.date);
            const dateElement = document.createElement('p');
            dateElement.className = 'post-date';
            dateElement.textContent = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const descriptionElement = document.createElement('p');
            descriptionElement.setAttribute('data-key', post.descriptionKey);
            descriptionElement.textContent = post.description;

            postArticle.appendChild(titleElement);
            postArticle.appendChild(dateElement);
            postArticle.appendChild(descriptionElement);
            fragment.appendChild(postArticle);
        });
        postsListContainer.appendChild(fragment);
    };

    /**
     * Creates filter buttons based on keywords found in the posts.
     * @param {Array} posts - The array of all post objects.
     */
    const setupFilters = (posts) => {
        // Collect all unique keywords.
        const keywords = new Set(posts.flatMap(p => p.keywords || []));
        
        // Add "All" button first.
        const allButton = document.createElement('button');
        allButton.className = 'filter-btn active';
        allButton.innerHTML = `<span class="symbol">✧</span> All`;
        allButton.dataset.keyword = 'All';
        filterContainer.appendChild(allButton);

        // Create buttons for each keyword with appropriate icons.
        const keywordIconMap = {
            "Language": "▤", "Photos": "⌻", "Projects": "🗀", "Keyboards": "⌨"
        };
        keywords.forEach(keyword => {
            const button = document.createElement('button');
            button.className = 'filter-btn';
            const icon = keywordIconMap[keyword] || '◆';
            button.innerHTML = `<span class="symbol">${icon}</span> ${keyword}`;
            button.dataset.keyword = keyword;
            filterContainer.appendChild(button);
        });

        // Add a single event listener to the container for efficiency.
        filterContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.filter-btn');
            if (!clickedButton) return;

            // Update active state on buttons.
            filterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            clickedButton.classList.add('active');

            const selectedKeyword = clickedButton.dataset.keyword;

            // Filter and render posts based on the selected keyword.
            const postsToRender = (selectedKeyword === 'All')
                ? allPosts
                : allPosts.filter(post => post.keywords && post.keywords.includes(selectedKeyword));
            
            renderPosts(postsToRender);
            
            // Re-apply translations to the newly rendered content, as it was wiped by renderPosts.
            if (window.translationsData) {
                 const { translations, lang } = window.translationsData;
                 applyTranslationsToScope(translations, lang, '#blog-posts-list');
            }
        });
    };

    /**
     * Main function to fetch all posts and initialize the component.
     */
    const loadBlogPosts = async () => {
        try {
            postsListContainer.innerHTML = '<p data-key="blog_loading">Loading posts...</p>';
            const response = await fetch('/blog/blog-manifest.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            allPosts = await response.json();
            
            // Sort posts by date, newest first, for better user experience.
            allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (!allPosts || allPosts.length === 0) {
                postsListContainer.innerHTML = '<p data-key="blog_no_posts">No posts found.</p>';
                return;
            }

            setupFilters(allPosts);
            renderPosts(allPosts);

        } catch (error) {
            console.error('Failed to load blog posts:', error);
            if (postsListContainer) {
                postsListContainer.innerHTML = '<p style="color: red;" data-key="blog_error">Could not load blog posts.</p>';
            }
        }
    };

    // Run the main function.
    loadBlogPosts();
});
