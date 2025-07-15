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

        // --- NEW: Arrange initially open windows to prevent overlap on desktop ---
        if (!isMobile()) {
            const openWindows = Array.from(windows).filter(win => !closedWindows.includes(win));
            const placedRects = [];
            const margin = 15; // The pixel space to leave between windows

            // Helper function to check for overlap between two rectangles
            const doRectsOverlap = (r1, r2) => {
                return !(r1.right < r2.left || 
                         r1.left > r2.right || 
                         r1.bottom < r2.top || 
                         r1.top > r2.bottom);
            };

            openWindows.forEach(win => {
                // To get accurate dimensions, the window must be positioned absolutely and be part of the layout.
                // We make it invisible initially to avoid a flash of content at the wrong position.
                win.style.position = 'absolute';
                win.style.visibility = 'hidden';
                win.style.display = 'flex'; // Ensure it's displayed to get dimensions

                let currentRect = win.getBoundingClientRect();
                
                // We'll work with a mutable copy of the rectangle's properties.
                let newRect = {
                    left: currentRect.left,
                    top: currentRect.top,
                    width: currentRect.width,
                    height: currentRect.height,
                };

                let hasCollision;
                // Keep checking for collisions and moving the window until it's in a free spot.
                do {
                    hasCollision = false;
                    for (const placedRect of placedRects) {
                        const potentialRect = {
                            left: newRect.left,
                            top: newRect.top,
                            right: newRect.left + newRect.width,
                            bottom: newRect.top + newRect.height,
                        };

                        if (doRectsOverlap(potentialRect, placedRect)) {
                            hasCollision = true;
                            // Collision detected! Move the current window down, just below the one it collided with.
                            newRect.top = placedRect.bottom + margin;
                            // Break the inner loop and re-check against ALL previously placed windows
                            // from the new position, as it might cause a new collision.
                            break; 
                        }
                    }
                } while (hasCollision);

                // Once we have a collision-free position, apply it to the window and make it visible.
                win.style.left = `${newRect.left}px`;
                win.style.top = `${newRect.top}px`;
                win.style.visibility = 'visible';

                // Add the final, confirmed position to our array of placed rectangles for checking subsequent windows.
                placedRects.push({
                    left: newRect.left,
                    top: newRect.top,
                    right: newRect.left + newRect.width,
                    bottom: newRect.top + newRect.height,
                });
            });
        }
        // --- End of new section ---

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
