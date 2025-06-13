// This script handles the draggable windows and the start menu functionality.
// It uses a robust "check-then-listen" pattern to handle asynchronous translation loading.

document.addEventListener('DOMContentLoaded', () => {
    // --- Basic setup ---
    const startMenu = document.querySelector('.start-menu');
    if (!startMenu) return;

    const windows = document.querySelectorAll('.window');
    const windowList = startMenu.querySelector('.window-list');
    let closedWindows = [];
    let highestZIndex = 10;
    
    // --- Function Definitions ---

    function updateWindowList(translations, lang) {
        if (!windowList) return;
        windowList.innerHTML = '';

        closedWindows.forEach((closedItemWindow) => {
            const listItem = document.createElement('li');
            listItem.setAttribute('tabindex', '0');
            const titleElement = closedItemWindow.querySelector('.title');
            
            const titleKey = titleElement ? titleElement.getAttribute('data-key') : null;
            const titleText = (titleKey && translations[lang] && translations[lang][titleKey]) 
                ? translations[lang][titleKey] 
                : (titleElement ? titleElement.textContent.trim() : 'Untitled Window');
            
            listItem.innerHTML = titleText;

            listItem.addEventListener('click', (e) => {
                e.preventDefault();
                openWindow(closedItemWindow, translations, lang);
            });

            listItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    openWindow(closedItemWindow, translations, lang);
                }
            });

            windowList.appendChild(listItem);
        });
    }

    function openWindow(windowToOpen, translations, lang) {
        windowToOpen.style.display = 'flex';
        windowToOpen.classList.remove('init-closed');

        highestZIndex++;
        windowToOpen.style.zIndex = highestZIndex;

        closedWindows = closedWindows.filter((win) => win !== windowToOpen);
        updateWindowList(translations, lang);
    }

    function setupWindowInteractions(translations, lang) {
        // Initialize z-index and make windows draggable/closable
        windows.forEach((window) => {
            const currentZ = parseInt(window.style.zIndex, 10);
            if (!isNaN(currentZ) && currentZ > highestZIndex) {
                highestZIndex = currentZ;
            }

            const titleBar = window.querySelector('.title-bar');
            const closeBtn = window.querySelector('.close-btn');
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

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    window.style.display = 'none';
                    if (!closedWindows.includes(window)) {
                        closedWindows.push(window);
                    }
                    updateWindowList(translations, lang);
                });
            }
        });
    }

    // --- Main Initialization Logic ---

    // This is the core function that populates the menu.
    function initializeStartMenu(translations, lang) {
        // Detect which windows are initially closed.
        windows.forEach(win => {
            const isExplicitlyClosed = win.classList.contains('init-closed');
            const isVisuallyHidden = getComputedStyle(win).display === 'none';

            if (isExplicitlyClosed || isVisuallyHidden) {
                if (!closedWindows.includes(win)) {
                    closedWindows.push(win);
                }
            }
        });

        // Setup dragging, closing, etc.
        setupWindowInteractions(translations, lang);
        
        // Render the list for the first time.
        updateWindowList(translations, lang);
    }

    // --- The "Check-Then-Listen" Pattern ---
    // This robustly handles the script execution order race condition.

    // First, check if settings.js has ALREADY finished and left the data for us.
    if (window.translationsData) {
        // It's ready! Initialize immediately.
        initializeStartMenu(window.translationsData.translations, window.translationsData.lang);
    } else {
        // It's not ready. We need to wait for the 'translationsReady' event.
        document.addEventListener('translationsReady', (event) => {
            initializeStartMenu(event.detail.translations, event.detail.lang);
        }, { once: true }); // { once: true } is a good practice here
    }
});
