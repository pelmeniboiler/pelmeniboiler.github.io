// /scripts/module-loader.js
// This script loads HTML modules into placeholders and then loads the dependent scripts.

document.addEventListener('DOMContentLoaded', () => {
    console.log("Module Loader: DOMContentLoaded event fired. Starting module loading process.");

    // Defines which modules to load and where to put them.
    const modules = [
        { id: 'settings-module-placeholder', path: '/modules/settings-module.html' },
        { id: 'start-menu-module-placeholder', path: '/modules/start-menu-module.html' },
        { id: 'share-module-placeholder', path: '/modules/share-module.html' },
        { id: 'chirper-demo-placeholder', path: '/modules/blog/demos/replab.html' },
        { id: 'graflect-module-placeholder', path: '/modules/blog/demos/graflectsubstitution.html' },
        { id: 'slug-module-placeholder', path: '/modules/blog/demos/slug.html' },
        { id: 'romaji-module-placeholder', path: '/modules/blog/demos/romaji.html' },
        { id: 'filtertakeout-module-placeholder', path: '/modules/blog/demos/filtertakeout.html' }
    ];

    // Defines the scripts that depend on the modules being loaded first.
    const dependentScripts = [
        '/scripts/settings.js',
        '/scripts/start-menu.js',
        '/scripts/share.js'
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
            return;
        }
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to fetch module: ${response.status} ${response.statusText}`);
            }
            const html = await response.text();
            placeholder.outerHTML = html;
        } catch (error) {
            console.error(`Module Loader: Error loading module for '${id}' from '${path}'.`);
            if (placeholder) {
                 placeholder.innerHTML = `<p style="color: red;">Error loading component.</p>`;
            }
            throw error;
        }
    };

    /**
     * UPDATED: Appends a script and returns a Promise that resolves when the script is loaded.
     * @param {string} src - The source path of the script.
     * @returns {Promise<void>}
     */
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            console.log(`Module Loader: Appending script '${src}'.`);
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.onload = () => {
                console.log(`Module Loader: Script '${src}' has loaded successfully.`);
                resolve();
            };
            script.onerror = () => {
                console.error(`Module Loader: Failed to load script '${src}'.`);
                reject(new Error(`Script load error for ${src}`));
            };
            document.body.appendChild(script);
        });
    };

    /**
     * Main function to load all modules and then all dependent scripts.
     */
    const initialize = async () => {
        console.log("Module Loader: Initializing modules...");
        const modulePromises = modules.map(module => loadModule(module.id, module.path));
        
        const results = await Promise.allSettled(modulePromises);
        
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(`Module Loader: Module '${modules[index].path}' failed to load. This might be okay if the module isn't needed on this page.`);
            }
        });

        console.log("Module Loader: All modules settled. Waiting for dependent scripts to load...");
        
        // UPDATED: Wait for all dependent scripts to finish loading before proceeding.
        try {
            await Promise.all(dependentScripts.map(scriptSrc => loadScript(scriptSrc)));
            console.log("Module Loader: All dependent scripts have loaded.");
        } catch (error) {
            console.error("Module Loader: A critical dependent script failed to load. Halting execution.", error);
            return; // Stop if a script fails
        }
        
        console.log("Module Loader: Firing 'modulesLoaded' event.");
        document.dispatchEvent(new CustomEvent('modulesLoaded'));
        console.log("Module Loader: 'modulesLoaded' event has been dispatched.");
    };

    // Start the process.
    initialize();
});
