// /module-loader.js
// This script loads HTML modules into placeholders and then loads the dependent scripts.

document.addEventListener('DOMContentLoaded', () => {
    // Defines which modules to load and where to put them.
    const modules = [
        { id: 'settings-module-placeholder', path: 'modules/settings-module.html' },
        { id: 'start-menu-module-placeholder', path: 'modules/start-menu-module.html' }
    ];

    // Defines the scripts that depend on the modules being loaded first.
    const dependentScripts = [
        'scripts/settings.js',
        'scripts/start menu.js'
    ];

    /**
     * Fetches the HTML content for a single module and injects it into the DOM.
     * @param {string} id - The ID of the placeholder element.
     * @param {string} path - The path to the module's HTML file.
     * @returns {Promise<void>} A promise that resolves when the module is loaded.
     */
    const loadModule = async (id, path) => {
        const placeholder = document.getElementById(id);
        if (!placeholder) {
            console.error(`Module placeholder #${id} not found.`);
            return;
        }
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to fetch module from ${path}: ${response.statusText}`);
            }
            const html = await response.text();
            placeholder.outerHTML = html; // Replace placeholder with the module content
        } catch (error) {
            console.error(`Error loading module ${path}:`, error);
            // Optional: display an error message in the placeholder
            if (placeholder) {
                 placeholder.innerHTML = `<p style="color: red;">Error loading component.</p>`;
            }
        }
    };

    /**
     * Appends a script to the document's body.
     * @param {string} src - The source path of the script.
     */
    const loadScript = (src) => {
        const script = document.createElement('script');
        script.src = src;
        script.defer = true; // Ensure scripts are executed in order after parsing
        document.body.appendChild(script);
    };

    /**
     * Main function to load all modules and then all dependent scripts.
     */
    const initialize = async () => {
        // Create an array of promises for loading all modules concurrently.
        const modulePromises = modules.map(module => loadModule(module.id, module.path));
        
        // Wait for all HTML modules to be fetched and injected.
        await Promise.all(modulePromises);
        
        // Once modules are loaded, load and execute the dependent JavaScript files.
        dependentScripts.forEach(scriptSrc => loadScript(scriptSrc));
    };

    // Start the process.
    initialize();
});
