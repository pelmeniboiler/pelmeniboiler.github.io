/**
 * /scripts/blog/demos/dictionary-manager.js
 * * Contains all the shared JavaScript logic for managing Graflect dictionaries.
 * This script depends on graflect-data.js being loaded first.
 */
class DictionaryManager {
    /**
     * Initializes the DictionaryManager.
     * @param {object} config - The configuration object.
     * @param {object} config.domElements - A map of required DOM elements.
     * @param {string} config.localStorageKey - The key for storing data in localStorage.
     * @param {function} [config.onActiveDictionaryChange] - Optional callback for when the active dictionary changes.
     */
    constructor(config) {
        // Ensure the global data from graflect-data.js is available
        if (typeof defaultWordMap === 'undefined' || typeof defaultGraphemeMap === 'undefined') {
            throw new Error("DictionaryManager requires graflect-data.js to be loaded first.");
        }

        this.dom = config.domElements;
        this.localStorageKey = config.localStorageKey;
        this.onActiveDictionaryChange = config.onActiveDictionaryChange;

        // --- STATE ---
        this.dictionaries = [];
        this.activeDictionaryIndex = 0;
        this.confirmationCallback = null;
        this.notificationTimeout = null;
        this.currentlyEditingDictIndex = -1;

        this._bindEssentialDOMEvents();
    }

    // --- PUBLIC API ---

    /**
     * Loads dictionaries from localStorage and sets up the initial state.
     */
    init() {
        this._loadDictionaries();
    }

    /**
     * Returns the currently active dictionary object.
     * @returns {object|null} The active dictionary or null if none is active.
     */
    getActiveDictionary() {
        if (this.dictionaries.length > 0 && this.activeDictionaryIndex < this.dictionaries.length) {
            return this.dictionaries[this.activeDictionaryIndex];
        }
        return null;
    }

    /**
     * Saves a new word-to-graflect mapping to the active dictionary.
     * @param {string} word - The English word (will be converted to lowercase).
     * @param {string} graflect - The corresponding Graflect transliteration.
     */
    saveWord(word, graflect) {
        const activeDict = this.getActiveDictionary();
        if (activeDict && word && graflect) {
            activeDict.words[word.toLowerCase()] = graflect;
            this._saveAllDictionaries();
        }
    }

    /**
     * Opens the main dictionary manager modal.
     */
    openManager() {
        this._populateDictionaryManager();
        this.dom.dictionaryManagerModal.classList.remove('hidden');
    }

    // --- PRIVATE HELPER METHODS ---

    _showNotification(message) {
        if (!this.dom.notificationBannerEl) return;
        if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
        this.dom.notificationBannerEl.textContent = message;
        this.dom.notificationBannerEl.classList.remove('hidden');
        this.dom.notificationBannerEl.classList.add('visible');
        this.notificationTimeout = setTimeout(() => {
            this.dom.notificationBannerEl.classList.add('hidden');
            this.dom.notificationBannerEl.classList.remove('visible');
        }, 3000);
    }

    _showConfirmation(message, onConfirm) {
        if (!this.dom.confirmationModal || !this.dom.confirmationMessageEl) return;
        this.dom.confirmationMessageEl.textContent = message;
        this.dom.confirmationModal.classList.remove('hidden');
        this.confirmationCallback = onConfirm;
    }

    /**
     * Creates a new dictionary object with default values from graflect-data.js.
     * @returns {object} A new dictionary object.
     */
    _createDefaultDictionary() {
        return {
            name: "Wendy's Accent",
            author: "Wendy Zhulkovsky",
            description: "Default dictionary with common English words.",
            words: { ...defaultWordMap },
            graphemes: { ...defaultGraphemeMap }
        };
    }

    _loadDictionaries() {
        const storedDicts = localStorage.getItem(this.localStorageKey);
        const storedIndex = localStorage.getItem(`${this.localStorageKey}_active_index`);
        let parsedDicts = [];
        try {
            if (storedDicts) parsedDicts = JSON.parse(storedDicts);
        } catch (e) {
            console.error("Could not parse dictionaries from localStorage:", e);
            parsedDicts = [];
        }

        if (parsedDicts.length > 0) {
            this.dictionaries = parsedDicts.map(dict => {
                const newDict = { ...dict };
                if (!newDict.graphemes || Object.keys(newDict.graphemes).length === 0) {
                    newDict.graphemes = { ...defaultGraphemeMap };
                }
                return newDict;
            });
            this.activeDictionaryIndex = storedIndex ? parseInt(storedIndex, 10) : 0;
            if (this.activeDictionaryIndex >= this.dictionaries.length) {
                this.activeDictionaryIndex = 0;
            }
        } else {
            this.dictionaries = [this._createDefaultDictionary()];
            this.activeDictionaryIndex = 0;
        }
        
        if (this.onActiveDictionaryChange) {
            this.onActiveDictionaryChange(this.getActiveDictionary());
        }
        this._saveAllDictionaries();
    }

    _saveAllDictionaries() {
        localStorage.setItem(this.localStorageKey, JSON.stringify(this.dictionaries));
        localStorage.setItem(`${this.localStorageKey}_active_index`, this.activeDictionaryIndex);
    }
    
    _handleCreateNewDictionary() {
        const name = this.dom.newDictNameInput.value.trim();
        const author = this.dom.newDictAuthorInput.value.trim();

        if (!name || !author) {
            this._showNotification("Both dictionary name and author are required.");
            return;
        }

        const newDict = this._createDefaultDictionary();
        newDict.name = name;
        newDict.author = author;
        newDict.words = {};

        this.dictionaries.push(newDict);
        this.activeDictionaryIndex = this.dictionaries.length - 1;
        this._saveAllDictionaries();
        
        if (this.onActiveDictionaryChange) {
            this.onActiveDictionaryChange(this.getActiveDictionary());
        }
        
        this._populateDictionaryManager();
        
        this.dom.newDictionaryModal.classList.add('hidden');
        this.dom.newDictNameInput.value = '';
        this.dom.newDictAuthorInput.value = '';
        
        this._showNotification(`Created and selected new dictionary: "${name}"`);
    }
    
    _handleExportClick(dictIndex) {
        const dictionary = this.dictionaries[dictIndex];
        const dictionaryString = JSON.stringify(dictionary, null, 2);
        const blob = new Blob([dictionaryString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dictionary.name.replace(/\s+/g, '_')}_graflect.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this._showNotification(`Dictionary "${dictionary.name}" exported!`);
    }

    _handleImportChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedDict = JSON.parse(e.target.result);
                if (typeof importedDict !== 'object' || !importedDict.name || !importedDict.words) {
                    throw new Error("Invalid format. File must be a valid dictionary object.");
                }
                importedDict.graphemes = importedDict.graphemes || { ...defaultGraphemeMap };
                this.dictionaries.push(importedDict);
                this._saveAllDictionaries();
                this._populateDictionaryManager();
                this._showNotification(`Dictionary "${importedDict.name}" imported successfully!`);
            } catch (error) {
                this._showNotification("Error: Could not import file. " + error.message);
            } finally {
                this.dom.importInput.value = '';
            }
        };
        reader.readAsText(file);
    }
    
    _bindEssentialDOMEvents() {
        this.dom.manageDictBtn?.addEventListener('click', () => this.openManager());
        this.dom.closeModalManagerBtn?.addEventListener('click', () => this.dom.dictionaryManagerModal.classList.add('hidden'));
        this.dom.newDictBtn?.addEventListener('click', () => {
             this.dom.dictionaryManagerModal.classList.add('hidden');
             this.dom.newDictionaryModal.classList.remove('hidden');
        });
        this.dom.importInput?.addEventListener('change', (e) => this._handleImportChange(e));
        this.dom.importBtn?.addEventListener('click', () => this.dom.importInput.click());
        this.dom.saveNewDictBtn?.addEventListener('click', () => this._handleCreateNewDictionary());
        const closeAndClearNewDictModal = () => {
            this.dom.newDictionaryModal.classList.add('hidden');
            this.dom.newDictNameInput.value = '';
            this.dom.newDictAuthorInput.value = '';
        };
        this.dom.cancelNewDictBtn?.addEventListener('click', closeAndClearNewDictModal);
        this.dom.closeNewDictBtn?.addEventListener('click', closeAndClearNewDictModal);
        this.dom.confirmNoBtn?.addEventListener('click', () => {
            this.dom.confirmationModal.classList.add('hidden');
            this.confirmationCallback = null;
        });
        this.dom.confirmYesBtn?.addEventListener('click', () => {
            if (typeof this.confirmationCallback === 'function') this.confirmationCallback();
            this.dom.confirmationModal.classList.add('hidden');
            this.confirmationCallback = null;
        });
        this.dom.closeEditorBtn?.addEventListener('click', () => {
            this.dom.dictionaryEditorModal.classList.add('hidden');
            this.openManager();
        });
        this.dom.wordsTab?.addEventListener('click', () => {
            this.dom.wordsTab.classList.add('active');
            this.dom.graphemesTab.classList.remove('active');
            this.dom.wordsEditorContent.classList.remove('hidden');
            this.dom.graphemesEditorContent.classList.add('hidden');
        });
        this.dom.graphemesTab?.addEventListener('click', () => {
            this.dom.graphemesTab.classList.add('active');
            this.dom.wordsTab.classList.remove('active');
            this.dom.graphemesEditorContent.classList.remove('hidden');
            this.dom.wordsEditorContent.classList.add('hidden');
        });
    }
    
    _populateDictionaryManager() {
        this.dom.dictionaryListEl.innerHTML = '';
        this.dictionaries.forEach((dict, index) => {
            const li = document.createElement('li');
            const infoDiv = document.createElement('div');
            infoDiv.className = 'dict-info';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = dict.name + (index === this.activeDictionaryIndex ? ' (Active)' : '');
            const authorSpan = document.createElement('span');
            authorSpan.className = 'author';
            authorSpan.textContent = ` by ${dict.author}`;
            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(authorSpan);
            const buttonDiv = document.createElement('div');
            const selectBtn = document.createElement('button');
            selectBtn.textContent = 'Select';
            selectBtn.className = 'dict-btn select normal-btn';
            selectBtn.disabled = index === this.activeDictionaryIndex;
            selectBtn.onclick = () => {
                this.activeDictionaryIndex = index;
                this._saveAllDictionaries();
                if (this.onActiveDictionaryChange) this.onActiveDictionaryChange(this.getActiveDictionary());
                this._populateDictionaryManager();
                this._showNotification(`"${dict.name}" is now the active dictionary.`);
            };
            const exportBtn = document.createElement('button');
            exportBtn.textContent = 'Export';
            exportBtn.className = 'dict-btn normal-btn';
            exportBtn.onclick = () => this._handleExportClick(index);
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'dict-btn normal-btn';
            editBtn.onclick = () => this._openDictionaryEditor(index);
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'dict-btn delete normal-btn';
            deleteBtn.onclick = () => {
                this._showConfirmation(`Are you sure you want to delete the "${dict.name}" dictionary? This cannot be undone.`, () => {
                    const deletedName = this.dictionaries[index].name;
                    this.dictionaries.splice(index, 1);
                    if (this.dictionaries.length === 0) {
                        this.dictionaries.push(this._createDefaultDictionary());
                        this.activeDictionaryIndex = 0;
                    } else if (this.activeDictionaryIndex >= index) {
                        this.activeDictionaryIndex = Math.max(0, this.activeDictionaryIndex - 1);
                    }
                    this._saveAllDictionaries();
                    if (this.onActiveDictionaryChange) this.onActiveDictionaryChange(this.getActiveDictionary());
                    this._populateDictionaryManager();
                    this._showNotification(`Deleted "${deletedName}".`);
                });
            };
            buttonDiv.appendChild(selectBtn);
            buttonDiv.appendChild(exportBtn);
            buttonDiv.appendChild(editBtn);
            buttonDiv.appendChild(deleteBtn);
            li.appendChild(infoDiv);
            li.appendChild(buttonDiv);
            this.dom.dictionaryListEl.appendChild(li);
        });
    }
    
    _openDictionaryEditor(dictIndex) {
        this.currentlyEditingDictIndex = dictIndex;
        this.dom.dictionaryEditorTitleEl.textContent = `Editing: ${this.dictionaries[dictIndex].name}`;
        this.dom.wordsTab.classList.add('active');
        this.dom.graphemesTab.classList.remove('active');
        this.dom.wordsEditorContent.classList.remove('hidden');
        this.dom.graphemesEditorContent.classList.add('hidden');
        this._populateWordList(dictIndex);
        this._populateGraphemeList(dictIndex);
        this.dom.dictionaryManagerModal.classList.add('hidden');
        this.dom.dictionaryEditorModal.classList.remove('hidden');
    }

    _populateWordList(dictIndex) {
        this.dom.wordListEl.innerHTML = '';
        const dictionary = this.dictionaries[dictIndex];
        const sortedWords = Object.keys(dictionary.words || {}).sort();
        sortedWords.forEach(word => {
            const li = this._createEditableListItem(word, dictionary.words[word], dictIndex, 'word');
            this.dom.wordListEl.appendChild(li);
        });
    }

    _populateGraphemeList(dictIndex) {
        this.dom.graphemeListEl.innerHTML = '';
        const dictionary = this.dictionaries[dictIndex];
        const graphemes = dictionary.graphemes || {};
        const sortedGraphemes = Object.keys(graphemes).sort((a,b) => b.length - a.length || a.localeCompare(b));
        this.dom.addGraphemeBtn.onclick = () => {
            const newLi = this._createEditableListItem('', '', dictIndex, 'grapheme', true);
            this.dom.graphemeListEl.prepend(newLi);
            newLi.querySelector('.english-font-input').focus();
        };
        sortedGraphemes.forEach(grapheme => {
            const li = this._createEditableListItem(grapheme, graphemes[grapheme], dictIndex, 'grapheme');
            this.dom.graphemeListEl.appendChild(li);
        });
    }

    _createEditableListItem(key, value, dictIndex, type, isNew = false) {
        const li = document.createElement('li');
        const textDiv = document.createElement('div');
        textDiv.style.display = 'flex';
        textDiv.style.gap = '1em';
        textDiv.style.alignItems = 'center';
        textDiv.style.flexGrow = '1';
        const buttonDiv = document.createElement('div');
        const dictionary = this.dictionaries[dictIndex];
        const dataMap = type === 'word' ? dictionary.words : dictionary.graphemes;
        const renderDisplayMode = (currentKey, currentValue) => {
            textDiv.innerHTML = '';
            buttonDiv.innerHTML = '';
            const keySpan = document.createElement('span');
            keySpan.className = type === 'word' ? 'dictionary-word' : 'grapheme-key';
            keySpan.textContent = type === 'word' ? currentKey : `"${currentKey}"`;
            const valueSpan = document.createElement('span');
            valueSpan.className = `graflect-font ${type === 'word' ? 'dictionary-graflect' : 'grapheme-output'}`;
            let displayValue = Array.isArray(currentValue) ? `[${currentValue.map(v => `'${v}'`).join(', ')}]` : currentValue;
            valueSpan.textContent = `→ ${displayValue}`;
            const editBtn = document.createElement('button');
            editBtn.className = 'dict-btn edit normal-btn';
            editBtn.textContent = 'Edit';
            const removeBtn = document.createElement('button');
            removeBtn.className = 'dict-btn remove normal-btn';
            removeBtn.textContent = 'Remove';
            textDiv.appendChild(keySpan);
            textDiv.appendChild(valueSpan);
            buttonDiv.appendChild(editBtn);
            buttonDiv.appendChild(removeBtn);
            editBtn.onclick = () => renderEditMode(currentKey, currentValue);
            removeBtn.onclick = () => {
                delete dataMap[currentKey];
                this._saveAllDictionaries();
                li.remove();
                this._showNotification(`Rule for "${currentKey}" removed.`);
            };
        };
        const renderEditMode = (currentKey, currentValue) => {
            textDiv.innerHTML = '';
            buttonDiv.innerHTML = '';
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.className = 'dict-edit-input english-font-input';
            keyInput.value = currentKey;
            keyInput.placeholder = type;
            keyInput.readOnly = !isNew;
            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.className = 'dict-edit-input graflect-font-input';
            let displayValue = Array.isArray(currentValue) ? `[${currentValue.map(v => `'${v}'`).join(', ')}]` : currentValue;
            valueInput.value = displayValue;
            valueInput.placeholder = 'graflect output';
            textDiv.appendChild(keyInput);
            textDiv.appendChild(valueInput);
            if (!isNew) valueInput.focus(); else keyInput.focus();
            const saveBtn = document.createElement('button');
            saveBtn.className = 'dict-btn save normal-btn';
            saveBtn.textContent = 'Save';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'dict-btn normal-btn';
            cancelBtn.textContent = 'Cancel';
            buttonDiv.appendChild(saveBtn);
            buttonDiv.appendChild(cancelBtn);
            saveBtn.onclick = () => {
                const newKey = keyInput.value.trim().toLowerCase();
                let newValue = valueInput.value.trim();
                if (!newKey) {
                    this._showNotification("Grapheme/word cannot be empty.");
                    return;
                }
                if (newValue.startsWith('[') && newValue.endsWith(']')) {
                    try {
                        const arrayValue = JSON.parse(newValue.replace(/'/g, '"'));
                        if (Array.isArray(arrayValue)) newValue = arrayValue;
                    } catch(e) {
                        this._showNotification("Invalid array format. Use single quotes, e.g., ['', '']");
                        return;
                    }
                }
                if (!isNew && newKey !== currentKey) {
                    delete dataMap[currentKey];
                }
                dataMap[newKey] = newValue;
                this._saveAllDictionaries();
                if (isNew) {
                    type === 'word' ? this._populateWordList(dictIndex) : this._populateGraphemeList(dictIndex);
                } else {
                    renderDisplayMode(newKey, newValue);
                }
                this._showNotification(`Rule for "${newKey}" saved.`);
            };
            cancelBtn.onclick = () => {
                if(isNew) {
                    li.remove();
                } else {
                    renderDisplayMode(currentKey, currentValue);
                }
            };
        };
        if (isNew) {
            renderEditMode('', '');
        } else {
            renderDisplayMode(key, value);
        }
        li.appendChild(textDiv);
        li.appendChild(buttonDiv);
        return li;
    }
}
