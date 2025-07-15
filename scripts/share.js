// /scripts/share.js
// This script handles the logic for the share module.

function setupShareTools() {
    // --- Element References ---
    const sharePopup = document.getElementById('share-popup');
    if (!sharePopup) { return; }
    const shareCopyUrlBtn = document.getElementById('share-copy-url-btn');
    let currentSelectionRange = null;

    // --- Clipboard Logic (unchanged) ---
    function copyToClipboard(text, message = 'Copied to clipboard!') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => console.log(message))
            .catch(err => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }
    function fallbackCopy(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            console.log('Fallback: Copied to clipboard!');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
    }

    // --- Popup on Text Selection Logic (unchanged) ---
    document.addEventListener('mouseup', (e) => {
        if (sharePopup.contains(e.target)) return;
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText.length > 2) {
            currentSelectionRange = selection.getRangeAt(0);
            const rect = currentSelectionRange.getBoundingClientRect();
            sharePopup.style.left = `${rect.left + (rect.width / 2) - (sharePopup.offsetWidth / 2)}px`;
            let popupTop = window.scrollY + rect.top - sharePopup.offsetHeight - 15;
            if (popupTop < window.scrollY) {
                popupTop = window.scrollY + rect.bottom + 10;
            }
            sharePopup.style.top = `${popupTop}px`;
            sharePopup.style.display = 'flex';
        } else {
            if (!sharePopup.contains(e.target)) {
                 sharePopup.style.display = 'none';
            }
            currentSelectionRange = null;
        }
    });

    shareCopyUrlBtn.addEventListener('click', () => {
        if (currentSelectionRange) {
            const selectedText = currentSelectionRange.toString().trim();
            if (!selectedText) return;
            const lang = localStorage.getItem('pelmeniboiler-lang') || 'en';
            const baseUrl = window.location.href.split('?')[0].split('#')[0];
            const urlToCopy = `${baseUrl}?l=${lang}#:~:text=${encodeURIComponent(selectedText)}`;
            copyToClipboard(urlToCopy, 'Link to selection copied!');
            sharePopup.style.display = 'none';
        }
    });

    /**
     * The title bar button is a single-click action.
     */
    function initializeStaticShareButtons() {
        const galleryWindows = document.querySelectorAll('#gallery-window');
        galleryWindows.forEach(win => {
            const titleBar = win.querySelector('.title-bar');
            const closeButton = titleBar ? titleBar.querySelector('.close-btn') : null;

            if (!titleBar || !closeButton || titleBar.querySelector('.share-titlebar-btn')) {
                return;
            }
            
            const button = document.createElement('button');
            button.className = 'share-titlebar-btn';
            button.title = 'Copy link to page'; // Default tooltip
            
            // UPDATED: Using 'data-title-key' for the tooltip translation.
            button.setAttribute('data-title-key', 'share_copy_page_link_tooltip');
            button.innerHTML = `<span class="symbol">🔗</span>`;

            titleBar.insertBefore(button, closeButton);

            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const lang = localStorage.getItem('pelmeniboiler-lang') || 'en';
                const baseUrl = window.location.href.split('?')[0].split('#')[0];
                const urlToCopy = `${baseUrl}?l=${lang}`;
                copyToClipboard(urlToCopy, 'Page link with language copied!');
                
                const originalText = button.innerHTML;
                button.innerHTML = '✓';
                setTimeout(() => { button.innerHTML = originalText; }, 1000);
            });
        });
    }
    
    initializeStaticShareButtons();
    document.addEventListener('contentUpdated', initializeStaticShareButtons);
}

document.addEventListener('modulesLoaded', setupShareTools);
