// /scripts/share.js
// This script handles the logic for the share module with improved highlight linking.

function setupShareTools() {
    // --- Element References ---
    const sharePopup = document.getElementById('share-popup');
    if (!sharePopup) { return; }
    const shareCopyUrlBtn = document.getElementById('share-copy-url-btn');
    let currentSelectionRange = null;

    // --- Clipboard Logic ---
    // This section is unchanged. It handles copying text to the clipboard.
    function copyToClipboard(text, message = 'Copied to clipboard!') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                console.log(message);
            }).catch(err => {
                console.error('Async copy failed, falling back.', err);
                fallbackCopy(text);
            });
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

    // --- Popup on Text Selection Logic ---
    // This section is unchanged. It shows the share popup when text is selected.
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

    // --- Share Button Logic (unchanged) ---
    shareCopyUrlBtn.addEventListener('click', () => {
        if (!currentSelectionRange) return;

        const selectedText = currentSelectionRange.toString().trim();
        if (!selectedText) return;

        let anchorElement = currentSelectionRange.commonAncestorContainer;
        if (anchorElement.nodeType !== Node.ELEMENT_NODE) {
            anchorElement = anchorElement.parentElement;
        }
        while (anchorElement && !anchorElement.hasAttribute('data-key')) {
            anchorElement = anchorElement.parentElement;
        }

        const lang = localStorage.getItem('pelmeniboiler-lang') || 'en';
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        let urlToCopy;

        if (anchorElement) {
            const dataKey = anchorElement.getAttribute('data-key');
            
            const preRange = document.createRange();
            preRange.selectNodeContents(anchorElement);
            preRange.setEnd(currentSelectionRange.startContainer, currentSelectionRange.startOffset);
            
            const start = preRange.toString().length;
            const end = start + currentSelectionRange.toString().length;

            urlToCopy = `${baseUrl}?l=${lang}#highlight=${dataKey},${start},${end}`;
            copyToClipboard(urlToCopy, 'Precise link to selection copied!');
        } else {
            console.warn("No parent with data-key found for selection. Falling back to text-based fragment.");
            urlToCopy = `${baseUrl}?l=${lang}#:~:text=${encodeURIComponent(selectedText)}`;
            copyToClipboard(urlToCopy, 'Link to selection copied (fallback)!');
        }
        
        sharePopup.style.display = 'none';
        currentSelectionRange = null;
    });

    // --- [UPDATED] Highlighting Logic on Page Load ---
    // This function now applies a permanent style using the .shared-highlight class.
    function applyHighlightFromUrl() {
        const hash = window.location.hash;
        if (!hash.startsWith('#highlight=')) return;

        try {
            const params = hash.substring('#highlight='.length).split(',');
            if (params.length !== 3) return;

            const [dataKey, startStr, endStr] = params;
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);

            if (isNaN(start) || isNaN(end)) return;

            const targetElement = document.querySelector(`[data-key="${dataKey}"]`);
            if (!targetElement) {
                console.warn(`Highlight target with data-key "${dataKey}" not found.`);
                return;
            }

            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const walker = document.createTreeWalker(targetElement, NodeFilter.SHOW_TEXT, null, false);
            
            let charCount = 0;
            let startNode, endNode, startOffset, endOffset;
            let currentNode;

            while (currentNode = walker.nextNode()) {
                const nodeLength = currentNode.textContent.length;
                
                if (startNode === undefined && start < charCount + nodeLength) {
                    startNode = currentNode;
                    startOffset = start - charCount;
                }

                if (endNode === undefined && end <= charCount + nodeLength) {
                    endNode = currentNode;
                    endOffset = end - charCount;
                    break;
                }
                charCount += nodeLength;
            }

            if (startNode && endNode) {
                const range = document.createRange();
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);

                // **MODIFIED**: Create a <span> with the .shared-highlight class from your CSS.
                // This makes the highlight permanent and theme-aware.
                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'shared-highlight';
                
                try {
                    // Wrap the selected text range with the new span.
                    range.surroundContents(highlightSpan);
                } catch (e) {
                    // Fallback if surroundContents fails (e.g., range crosses complex element boundaries)
                    // Just select the text instead.
                    console.error("Could not wrap range with highlight span, falling back to selection.", e);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            } else {
                console.warn("Could not resolve the highlight range from URL parameters.");
            }
        } catch (e) {
            console.error("Error applying highlight from URL:", e);
        }
    }

    // --- Static Share Button Logic (unchanged) ---
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
            button.title = 'Copy link to page';
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
    
    // --- Initializations (unchanged) ---
    initializeStaticShareButtons();
    document.addEventListener('contentUpdated', initializeStaticShareButtons);
    document.addEventListener('translationsReady', applyHighlightFromUrl);
}

document.addEventListener('modulesLoaded', setupShareTools);
