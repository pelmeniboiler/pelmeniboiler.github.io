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
            // ... (rest of the post rendering logic is unchanged)
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

    const setupFilters = (posts) => {
        const keywords = new Set(posts.flatMap(p => p.keywords || []));
        
        const allButton = document.createElement('button');
        allButton.className = 'filter-btn active';
        allButton.innerHTML = `<span class="symbol">✧</span> All`;
        allButton.dataset.keyword = 'All';
        filterContainer.appendChild(allButton);

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
            
            if (window.translationsData) {
                 const { translations, lang } = window.translationsData;
                 applyTranslationsToScope(translations, lang, '#blog-posts-list');
            }
        });
    };
    
    // NEW: Function to handle the RSS dropdown logic
    const setupRssDropdown = () => {
        const rssButton = document.querySelector('.rss-btn');
        const rssDropdown = document.querySelector('.rss-dropdown-content');

        if (rssButton && rssDropdown) {
            rssButton.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent the window click listener from immediately closing it
                rssDropdown.classList.toggle('show');
            });
            
            // Add a single global listener to close the dropdown if a click occurs outside
            window.addEventListener('click', function(event) {
                // Check if the dropdown is visible and the click was outside of its container
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
            
            // Call the function to set up the RSS dropdown after the blog window content is loaded
            setupRssDropdown();

        } catch (error) {
            console.error('Failed to load blog posts:', error);
            if (postsListContainer) {
                postsListContainer.innerHTML = '<p style="color: red;" data-key="blog_error">Could not load blog posts.</p>';
            }
        }
    };

    loadBlogPosts();
});
