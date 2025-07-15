// start-menu.js
// This script also has its DOMContentLoaded wrapper removed.
// It will now correctly listen for the 'translationsReady' event dispatched by settings.js.

function setupStartMenu() {
    // --- Basic setup ---
    const startMenu = document.querySelector('.start-menu');
    if (!startMenu) {
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
            const titleText = (titleKey && translations && translations[lang] && translations[lang][titleKey]) ?
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
        // On mobile, the nav window is handled separately. Clicking it in the start menu should expand it.
        if (isMobile() && windowToOpen.id === 'nav-window') {
            if (!windowToOpen.classList.contains('expanded')) {
                windowToOpen.classList.add('expanded');
                document.body.classList.add('body-no-scroll');
            }
            return;
        }

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
        // On mobile, the nav window is only collapsed, not truly "closed".
        if (isMobile() && windowToClose.id === 'nav-window') {
            windowToClose.classList.remove('expanded');
            document.body.classList.remove('body-no-scroll');
            // IMPORTANT: Do not add it to the closedWindows array.
            return;
        }

        windowToClose.style.display = 'none';
        if (!closedWindows.includes(windowToClose)) {
            closedWindows.push(windowToClose);
        }
        updateWindowList(translations, lang);
    }

    /**
     * UPDATED: Handles the special behavior of the navigation window on mobile devices.
     * It now uses a single event handler on the window itself.
     */
    function setupMobileNav() {
        if (!isMobile()) return;

        const navWindow = document.getElementById('nav-window');
        if (!navWindow) return;

        // Use a data attribute to prevent attaching listeners multiple times.
        if (navWindow.dataset.mobileNavSetup) return;
        navWindow.dataset.mobileNavSetup = 'true';

        const closeBtn = navWindow.querySelector('.close-btn');

        // This class triggers the CSS to turn it into a button.
        navWindow.classList.add('nav-pendant');
        navWindow.style.display = 'flex'; // Ensure it's visible

        // Add a single click handler to the nav window.
        const navClickHandler = (event) => {
            // If the click is on the close button, collapse the menu.
            if (closeBtn && closeBtn.contains(event.target)) {
                event.stopPropagation();
                navWindow.classList.remove('expanded');
                document.body.classList.remove('body-no-scroll');
                return;
            }

            // If the menu is NOT expanded, any other click should expand it.
            if (!navWindow.classList.contains('expanded')) {
                event.stopPropagation();
                navWindow.classList.add('expanded');
                document.body.classList.add('body-no-scroll');
            }
        };

        navWindow.addEventListener('click', navClickHandler);
    }

    function setupWindowInteractions(translations, lang) {
        windows.forEach((window) => {
            // Mobile nav window has its own logic, so we skip it here.
            if (isMobile() && window.id === 'nav-window') {
                return;
            }

            const titleBar = window.querySelector('.title-bar');
            const closeBtn = window.querySelector('.close-btn');

            if (closeBtn) {
                const newBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newBtn, closeBtn);
                newBtn.addEventListener('click', () => closeWindow(window, translations, lang));
            }

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

    function initialize(translations, lang) {
        windows.forEach(win => {
            const isExplicitlyClosed = win.classList.contains('init-closed');
            const isVisuallyHidden = getComputedStyle(win).display === 'none';
            if ((isExplicitlyClosed || isVisuallyHidden) && !closedWindows.includes(win)) {
                closedWindows.push(win);
            }
        });

        if (!isMobile()) {
            const openWindows = Array.from(windows).filter(win => !closedWindows.includes(win));
            const placedRects = [];
            const margin = 15;

            const doRectsOverlap = (r1, r2) => !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);

            openWindows.forEach(win => {
                win.style.position = 'absolute';
                win.style.visibility = 'hidden';
                win.style.display = 'flex';

                let currentRect = win.getBoundingClientRect();
                let newRect = { left: currentRect.left, top: currentRect.top, width: currentRect.width, height: currentRect.height };
                let hasCollision;
                
                do {
                    hasCollision = false;
                    for (const placedRect of placedRects) {
                        const potentialRect = { left: newRect.left, top: newRect.top, right: newRect.left + newRect.width, bottom: newRect.top + newRect.height };
                        if (doRectsOverlap(potentialRect, placedRect)) {
                            hasCollision = true;
                            newRect.top = placedRect.bottom + margin;
                            break; 
                        }
                    }
                } while (hasCollision);

                win.style.left = `${newRect.left}px`;
                win.style.top = `${newRect.top}px`;
                win.style.visibility = 'visible';

                placedRects.push({ left: newRect.left, top: newRect.top, right: newRect.left + newRect.width, bottom: newRect.top + newRect.height });
            });
        }

        setupWindowInteractions(translations, lang);
        setupMobileMenu();
        setupMobileNav(); // Handles the nav pendant
        updateWindowList(translations, lang);
    }
    
    // --- Event Listener ---
    document.addEventListener('translationsReady', (event) => {
        const { translations, lang } = event.detail;
        initialize(translations, lang);

        let wasMobile = isMobile(); 
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const isNowMobile = isMobile();
                if (isNowMobile !== wasMobile) {
                    location.reload();
                }
            }, 250);
        });
    }, { once: true });

    if (window.translationsData) {
        const { translations, lang } = window.translationsData;
        initialize(translations, lang);
    }
}

setupStartMenu();
