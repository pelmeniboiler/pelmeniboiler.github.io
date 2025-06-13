// This script handles the draggable windows and the start menu functionality.
// It uses a robust "check-then-listen" pattern to handle asynchronous translation loading.

document.addEventListener('DOMContentLoaded', () => {
    // --- Basic setup ---
    const startMenu = document.querySelector('.start-menu');
    if (!startMenu) return;
    
    const startButton = startMenu.querySelector('.start-button');
    const windows = document.querySelectorAll('.window');
    const windowList = startMenu.querySelector('.window-list');
    let closedWindows = [];
    let highestZIndex = 10;

    const isMobile = () => window.innerWidth <= 768;

    // --- Function Definitions ---

    function updateWindowList(translations, lang) {
        if (!windowList) return;
        windowList.innerHTML = '';

        closedWindows.forEach((closedItemWindow) => {
            const listItem = document.createElement('li');
            listItem.setAttribute('tabindex', '0');
            const titleElement = closedItemWindow.querySelector('.title');

            const titleKey = titleElement ? titleElement.getAttribute('data-key') : null;
            const titleText = (titleKey && translations[lang] && translations[lang][titleKey]) ?
                translations[lang][titleKey] :
                (titleElement ? titleElement.textContent.trim() : 'Untitled Window');

            listItem.innerHTML = titleText;

            const openHandler = (e) => {
                e.preventDefault();
                openWindow(closedItemWindow, translations, lang);
                if (isMobile() && startMenu.classList.contains('open')) {
                    startMenu.classList.remove('open');
                }
            };
            
            listItem.addEventListener('click', openHandler);
            listItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    openHandler(e);
                }
            });

            windowList.appendChild(listItem);
        });
    }

    function openWindow(windowToOpen, translations, lang) {
        windowToOpen.style.display = 'flex';
        windowToOpen.classList.remove('init-closed');

        if (!isMobile()) {
            highestZIndex++;
            windowToOpen.style.zIndex = highestZIndex;
        }

        closedWindows = closedWindows.filter((win) => win !== windowToOpen);
        updateWindowList(translations, lang);
    }

    function closeWindow(windowToClose, translations, lang) {
        windowToClose.style.display = 'none';
        if (!closedWindows.includes(windowToClose)) {
            closedWindows.push(windowToClose);
        }
        updateWindowList(translations, lang);
    }

    function setupWindowInteractions(translations, lang) {
        windows.forEach((window) => {
            const titleBar = window.querySelector('.title-bar');
            const closeBtn = window.querySelector('.close-btn');

            // --- Close button logic (works on mobile and desktop) ---
            if (closeBtn) {
                closeBtn.addEventListener('click', () => closeWindow(window, translations, lang));
            }

            // --- Desktop-only: Dragging logic ---
            if (!isMobile()) {
                let offsetX = 0, offsetY = 0;

                if (titleBar) {
                    titleBar.onmousedown = (e) => {
                        e.preventDefault();
                        highestZIndex++;
                        window.style.zIndex = highestZIndex;
                        const rect = window.getBoundingClientRect();
                        offsetX = e.clientX - rect.left;
                        offsetY = e.clientY - rect.top;
                        document.onmousemove = elementDrag;
                        document.onmouseup = closeDragElement;
                    };

                    function elementDrag(e) {
                        window.style.left = (e.clientX - offsetX) + "px";
                        window.style.top = (e.clientY - offsetY) + "px";
                    }

                    function closeDragElement() {
                        document.onmouseup = null;
                        document.onmousemove = null;
                    }
                }
            }
        });
    }
    
    function setupStartMenu() {
        if (isMobile()) {
            startButton.addEventListener('click', () => {
                startMenu.classList.toggle('open');
            });
        }
    }

    // --- Main Initialization Logic ---
    function initializeStartMenu(translations, lang) {
        windows.forEach(win => {
            const isExplicitlyClosed = win.classList.contains('init-closed');
            const isVisuallyHidden = getComputedStyle(win).display === 'none';

            if ((isExplicitlyClosed || isVisuallyHidden) && !closedWindows.includes(win)) {
                closedWindows.push(win);
            }
        });

        setupWindowInteractions(translations, lang);
        setupStartMenu(); // Setup mobile start menu toggle
        updateWindowList(translations, lang);
    }
    
    // Listen for the custom event that signals translations are ready.
    document.addEventListener('translationsReady', (event) => {
        const { translations, lang } = event.detail;
        initializeStartMenu(translations, lang);

        // Re-initialize on resize to switch between mobile/desktop modes
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                location.reload(); 
            }, 250);
        });
    }, { once: true });

    // Fallback if the event has already fired.
    if (window.translationsData) {
        initializeStartMenu(window.translationsData.translations, window.translationsData.lang);
    }
});