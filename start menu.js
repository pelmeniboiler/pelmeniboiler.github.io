// This script handles the draggable windows and the start menu functionality.
// It now waits for a 'modulesLoaded' event before initializing.

function initializeStartMenuFunctionality() {
    // --- Basic setup ---
    const startMenu = document.querySelector('.start-menu');
    if (!startMenu) {
        console.error("Start menu not found. Initialization aborted.");
        return;
    }
    
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
        windowToOpen.classList.remove('init-closed', 'swiped-away');
        windowToOpen.style.transform = ''; // Reset transform for swiped windows
        windowToOpen.style.opacity = '1';

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
        // Re-query for windows after they are loaded
        const allWindows = document.querySelectorAll('.window');
        
        allWindows.forEach((window) => {
            const titleBar = window.querySelector('.title-bar');
            
            // --- Desktop: Dragging and Closing ---
            if (!isMobile()) {
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
                    closeBtn.addEventListener('click', () => closeWindow(window, translations, lang));
                }
            // --- Mobile: Swiping to close ---
            } else {
                 if (!titleBar) return;
                 
                 let touchStartX = 0;
                 let touchCurrentX = 0;
                 let isDragging = false;
                 
                 titleBar.addEventListener('touchstart', (e) => {
                     touchStartX = e.touches[0].clientX;
                     isDragging = true;
                     window.style.transition = 'none'; // Disable transition while dragging
                 });
                 
                 titleBar.addEventListener('touchmove', (e) => {
                     if (!isDragging) return;
                     touchCurrentX = e.touches[0].clientX;
                     const diffX = touchCurrentX - touchStartX;
                     window.style.transform = `translateX(${diffX}px)`;
                 });

                 titleBar.addEventListener('touchend', (e) => {
                    if (!isDragging) return;
                    isDragging = false;
                    window.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out'; // Re-enable transition
                    const diffX = touchCurrentX - touchStartX;

                    if (Math.abs(diffX) > window.offsetWidth / 3) {
                         window.classList.add('swiped-away');
                         setTimeout(() => {
                            closeWindow(window, translations, lang);
                            window.classList.remove('swiped-away');
                            window.style.transform = '';
                         }, 300);
                    } else {
                        window.style.transform = 'translateX(0)';
                    }
                 });
            }
        });
    }
    
    function setupStartMenu(translations, lang) {
        if (isMobile() && startButton) {
            startButton.addEventListener('click', () => {
                startMenu.classList.toggle('open');
            });
        }
    }

    // --- Main Initialization Logic ---

    function initializeStartMenu(translations, lang) {
        const allWindows = document.querySelectorAll('.window');
        
        allWindows.forEach(win => {
            const isExplicitlyClosed = win.classList.contains('init-closed');
            const isVisuallyHidden = getComputedStyle(win).display === 'none';

            if ((isExplicitlyClosed || isVisuallyHidden) && !closedWindows.includes(win)) {
                closedWindows.push(win);
            }
        });

        setupWindowInteractions(translations, lang);
        setupStartMenu(translations, lang);
        updateWindowList(translations, lang);
    }
    
    // Listen for the custom event that signals translations are ready.
    document.addEventListener('translationsReady', (event) => {
        const { translations, lang } = event.detail;
        initializeStartMenu(translations, lang);

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
}

// Wait for modules to be loaded before running the main function
document.addEventListener('modulesLoaded', initializeStartMenuFunctionality, { once: true });