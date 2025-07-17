/**
 * /scripts/slug.js
 * Contains the JavaScript logic for the Graflect-to-SLUG converter module.
 * This script should be loaded on any page that includes the SLUG converter module.
 * The main logic is wrapped in the initializeSlugConverter function, which is called
 * by an event listener once the module's HTML is loaded.
 */
function initializeSlugConverter() {
    // Find the SLUG converter module on the page using its unique ID.
    // If it's not there, do nothing.
    const slugModule = document.getElementById('slug-converter-module');
    if (!slugModule) {
        return; // Exit if the converter module isn't on this page.
    }

    // The mapping from Graflect characters to SLUG characters.
    const slugMap = {
        '': 'p', '': 'b', '': 't', '': 'd', '': 'k', '': 'g',
        '': 'f', '': 'v', '': 'th', '': 'dh', '': 's', '': 'z',
        '': 'š', '': 'ž', '': 'h', '': 'm', '': 'n', '': 'ng',
        '': 'l', '': 'r', '': 'w', '': 'y', '': 'ī', '': 'i',
        '': 'u', '': 'ü', '': 'e', '': 'æ', '': 'x', '': 'á',
        '': 'ē', '': 'ä', '': 'ai', '': 'ow', '': 'ō', '': 'aw',
        '': 'ö', '': '4', '': 'c', '': 'j', '': 'yü', '': 'we',
        '': 'yh', '': 'kh', '': 'rr', '': 'rh',
        // Punctuation and special characters
        '': ' '
    };

    // Getting references to the HTML elements within the module
    const clearBtn = slugModule.querySelector('#clear-slug-btn');
    const graflectInput = slugModule.querySelector('#graflect-input');
    const slugOutput = slugModule.querySelector('#slug-output');

    // Check if all required elements are present before adding listeners
    if (!graflectInput || !slugOutput || !clearBtn) {
        console.error("SLUG Converter: Could not find all required elements (input, output, or clear button).");
        return;
    }

    // Function to perform the conversion
    function convertText() {
        const inputText = graflectInput.value;
        let outputText = '';
        // Iterate over each character in the input text
        for (const char of inputText) {
            // Check if the character exists as a key in our map
            if (slugMap.hasOwnProperty(char)) {
                outputText += slugMap[char];
            } else {
                // If not in the map (like spaces, newlines), keep it as is.
                outputText += char;
            }
        }
        slugOutput.value = outputText;
    }

    // Event listener for the "Clear" button
    clearBtn.addEventListener('click', () => {
        graflectInput.value = '';
        slugOutput.value = '';
    });

    // Automatically convert as the user types for a real-time experience
    graflectInput.addEventListener('input', convertText);
    
    console.log("SLUG Converter module initialized successfully.");
}

// This event listener ensures that the script only runs after the module
// loader has finished injecting the HTML content into the page.
document.addEventListener('modulesLoaded', initializeSlugConverter);
