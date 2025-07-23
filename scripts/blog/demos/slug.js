/**
 * /scripts/blog/demos/slug.js
 * * Contains the JavaScript logic for a mass Graflect-to-Slug converter.
 * This script is designed to be loaded as part of a module. It initializes
 * itself by listening for the 'modulesLoaded' custom event.
 * * This script depends on `graflect-data.js` being loaded first to provide the `slugMap`.
 */

/**
 * Initializes the slug converter tool, attaching all necessary event listeners.
 * This function is designed to be called after its corresponding HTML module is loaded.
 */
function initializeSlugConverter() {
    // --- VALIDATION ---
    // Ensure the required data from graflect-data.js is available.
    if (typeof slugMap === 'undefined') {
        console.error("Error: slug.js requires graflect-data.js to be loaded first.");
        const converterBody = document.getElementById('converter-body');
        if(converterBody) {
            converterBody.innerHTML = '<p class="text-red-500 font-bold">Error: Required data file (graflect-data.js) is not loaded. The converter cannot function.</p>';
        }
        return;
    }

    // --- DOM ELEMENTS ---
    const graflectInputEl = document.getElementById('graflect-input');
    const slugOutputEl = document.getElementById('slug-output');
    const copyBtn = document.getElementById('copy-btn');
    const clearBtn = document.getElementById('clear-btn');
    const notificationBannerEl = document.getElementById('notification-banner');

    let notificationTimeout;

    // --- CORE FUNCTIONS ---

    /**
     * Shows a short-lived notification message.
     * @param {string} message - The message to display.
     */
    function showNotification(message) {
        if (!notificationBannerEl) return;
        if (notificationTimeout) clearTimeout(notificationTimeout);
        notificationBannerEl.textContent = message;
        notificationBannerEl.classList.remove('hidden');
        notificationTimeout = setTimeout(() => {
            notificationBannerEl.classList.add('hidden');
        }, 3000);
    }

    /**
     * Converts a string of Graflect text into its "slug" representation.
     * @param {string} graflectText - The input text in the Graflect font.
     * @returns {string} The converted text in a readable format.
     */
    function convertGraflectToSlug(graflectText) {
        let slugText = '';
        for (const char of graflectText) {
            slugText += slugMap[char] || char;
        }
        return slugText;
    }

    /**
     * Handles the live conversion as the user types.
     */
    function handleLiveConversion() {
        const inputText = graflectInputEl.value;
        const outputText = convertGraflectToSlug(inputText);
        slugOutputEl.value = outputText;
    }

    /**
     * Copies the content of the output textarea to the clipboard.
     */
    function handleCopy() {
        if (!slugOutputEl.value) {
            showNotification('Nothing to copy!');
            return;
        }
        navigator.clipboard.writeText(slugOutputEl.value).then(() => {
            showNotification('Copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showNotification('Copy failed. See console for details.');
        });
    }

    /**
     * Clears both the input and output text areas.
     */
    function handleClear() {
        graflectInputEl.value = '';
        slugOutputEl.value = '';
        showNotification('Cleared text areas.');
    }

    // --- EVENT LISTENERS ---
    if (graflectInputEl) {
        graflectInputEl.addEventListener('input', handleLiveConversion);
    } else {
        console.error("Input element with id 'graflect-input' not found.");
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', handleCopy);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', handleClear);
    }

}

// Add the event listener to automatically initialize the tool when the parent page signals it's ready.
document.addEventListener('modulesLoaded', initializeSlugConverter);
