document.addEventListener("DOMContentLoaded", () => {
    const loadModule = (url, container) => {
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${url}: ${response.statusText}`);
                }
                return response.text();
            })
            .then(data => {
                container.insertAdjacentHTML('beforeend', data);
            })
            .catch(error => console.error('Error loading module:', error));
    };

    const loadModules = async () => {
        const body = document.body;
        // The settings window needs to be loaded before the start menu
        await loadModule('modules/settings.html', body); 
        await loadModule('modules/start-menu.html', body);

        // Dispatch a custom event to signal that modules are loaded
        document.dispatchEvent(new CustomEvent('modulesLoaded'));
    };

    loadModules();
});