// start-menu.js
// This script also has its DOMContentLoaded wrapper removed.
// It will now correctly listen for the 'translationsReady' event dispatched by settings.js.

function setupStartMenu() {
    // --- Basic setup ---
    const startMenu = document.querySelector('.start-menu');
    // Important: check if the start menu exists before proceeding.
    if (!startMenu) {
        // console.log("Start menu not found on this page, skipping setup.");
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

            // Determine the window title using translation data
            const titleKey = titleElement ? titleElement.getAttribute('data-key') : null;
            const titleText = (titleKey && translations && translations[lang] && translations[lang][titleKey]) ?
                translations[lang][titleKey] :
                (titleElement ? titleElement.textContent.trim() : 'Untitled Window');

            listItem.innerHTML = titleText;

            const openHandler = (e) => {
                e.preventDefault();
                openWindow(closedItemWindow, translations, lang);
                // On mobile, close the start menu after opening a window
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
        windowToOpen.style.display = 'flex'; // Use flex to match your CSS
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

            // --- Close button logic ---
            if (closeBtn) {
                // To prevent multiple listeners, we replace the node
                const newBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newBtn, closeBtn);
                newBtn.addEventListener('click', () => closeWindow(window, translations, lang));
            }

            // --- Desktop-only: Dragging logic ---
            if (!isMobile() && titleBar) {
                let offsetX = 0, offsetY = 0;
                
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
        });
    }
    
    function setupMobileMenu() {
        if (isMobile()) {
            startButton.addEventListener('click', () => {
                startMenu.classList.toggle('open');
            });
        }
    }

    // --- Main Initialization Logic ---
    function initialize(translations, lang) {
        // Find all initially closed windows
        windows.forEach(win => {
            const isExplicitlyClosed = win.classList.contains('init-closed');
            const isVisuallyHidden = getComputedStyle(win).display === 'none';
            if ((isExplicitlyClosed || isVisuallyHidden) && !closedWindows.includes(win)) {
                closedWindows.push(win);
            }
        });

        setupWindowInteractions(translations, lang);
        setupMobileMenu();
        updateWindowList(translations, lang);
    }
    
    // --- Event Listener ---
    // This is the key part. We listen for the custom event from settings.js
    document.addEventListener('translationsReady', (event) => {
        const { translations, lang } = event.detail;
        initialize(translations, lang);

        // Re-initialize on resize to switch between mobile/desktop modes.
        // A full reload is a simple way to handle the complexity of changing modes.
        let wasMobile = isMobile(); 

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const isNowMobile = isMobile();
                // ONLY reload if the state has changed (e.g., portrait to landscape)
                if (isNowMobile !== wasMobile) {
                    location.reload();
                }
            }, 250);
        });
    }, { once: true }); // Use 'once' to ensure it only runs one time.

    // Fallback: If settings.js finishes before this script runs, the data will be on the window.
    if (window.translationsData) {
        const { translations, lang } = window.translationsData;
        initialize(translations, lang);
    }
}

// Run the setup function
setupStartMenu();
