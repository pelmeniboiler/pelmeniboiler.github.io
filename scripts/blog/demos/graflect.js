/**
 * /scripts/blog/demos/graflect.js
 * * Contains all the JavaScript logic for the Graflect Transliteration Tool.
 * This script should be loaded by any page that includes the graflectsubstitution.html module.
 * The main logic is wrapped in the initializeGraflectTool function, which is called
 * by an event listener on the parent page once the module's HTML is loaded.
 */
function initializeGraflectTool() {
    // --- DATA MAPPINGS ---
    const defaultWordMap = {
        'a': '', 'an': '', 'and': '', 'are': '', 'as': '',
        'at': '', 'be': '', 'because': '', 'been': '',
        'before': '', 'but': '', 'by': '', 'call': '',
        'can': '', 'change': '', 'come': '', 'could': '',
        'day': '', 'do': '', 'down': '', 'each': '',
        'even': '', 'first': '', 'find': '', 'for': '',
        'from': '', 'get': '', 'give': '', 'go': '',
        'good': '', 'great': '', 'had': '', 'has': '',
        'have': '', 'he': '', 'her': '', 'here': '',
        'him': '', 'his': '', 'how': '', 'i': '', 'if': '',
        'in': '', 'into': '', 'is': '', 'it': '', 'its': '',
        'just': '', 'know': '', 'like': '', 'long': '',
        'look': '', 'made': '', 'make': '', 'man': '',
        'may': '', 'me': '', 'more': '', 'most': '',
        'my': '', 'new': '', 'not': '', 'now': '', 'of': '',
        'on': '', 'one': '', 'only': '', 'or': '',
        'other': '', 'out': '', 'over': '', 'people': '',
        'place': '', 'said': '', 'same': '', 'see': '',
        'she': '', 'so': '', 'some': '', 'take': '',
        'than': '', 'that': '', 'the': '', 'their': '',
        'them': '', 'then': '', 'there': '', 'these': '',
        'they': '', 'thing': '', 'think': '', 'this': '',
        'those': '', 'time': '', 'to': '', 'two': '',
        'up': '', 'use': '', 'very': '', 'want': '',
        'was': '', 'water': '', 'way': '', 'we': '',
        'well': '', 'were': '', 'what': '', 'when': '',
        'where': '', 'which': '', 'who': '', 'why': '',
        'will': '', 'with': '', 'work': '', 'would': '',
        'year': '', 'you': '', 'your': '', 'own': '',
        'also': '', 'about': '', 'came': '',
        'house': '', 'road': '', 'did': '', 'ball': '',
        'session': '', 'all': ''
    };
    
    const vowelPool = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const defaultGraphemeMap = {
        'tious': '', 'cious': '', 'ssion': '', 'stle': '',
        'sion': ['', ''], 'tion': '', 'cian': '',
        'tial': '', 'cial': '', 'sure': '', 'ture': '',
        'dge': '', 'eigh': '', 'igh': '', 'tch': '', 'age': ['', ''],
        'ex': ['', '', '', ''], 'nge': '', 'que': '', 'lk': '', 'lm': '',
        'mb': '', 'bt': '', 'ps': '', 'pn': '', 'rh': '',
        'sch': ['', ''], 'sci': ['', ''], 'eau': ['', ''],
        'sc': ['', ''], 'gu': ['', ''], 'ck': '', 'qu': '',
        'th': ['', ''], 'sh': '', 'ch': ['', '', '', ''],
        'ng': '', 'ph': '', 'kn': '', 'wr': '', 'gh': ['', '', ''],
        'oo': ['', '', ''], 'ee': ['', ''], 'ea': ['', '', ''],
        'ou': ['', '', '', ''], 'ow': ['', '', ''],
        'ew': ['', ''], 'au': '', 'oi': '', 'oy': '',
        'ai': ['', ''], 'ay': '', 'll': '', 'ss': ['', ''], 'ff': '',
        'rr': '', 'pp': '', 'bb': '', 'dd': '', 'tt': '', 'mm': '',
        'nn': '', 'a': vowelPool, 'e': vowelPool, 'i': vowelPool,
        'o': vowelPool, 'u': vowelPool, 'y': vowelPool,
        's': ['', ''], 'g': ['', ''],
        'c': ['', ''], 'x': ['', ''], 'p': '', 'b': '',
        't': '', 'h': ['', ''], 'l': '', 'w': '',
        'r': ['', '', '', ''], 'j': '', 'd': '', 'f': '',
        'k': '', 'm': '', 'n': '', 'v': '', 'z': '', 'tr': ''
    };
    
    const slugMap = {
        '': 'p', '': 'b', '': 't', '': 'd', '': 'k', '': 'g',
        '': 'f', '': 'v', '': 'th', '': 'dh', '': 's', '': 'z',
        '': 'š', '': 'ž', '': 'h', '': 'm', '': 'n', '': 'ng',
        '': 'l', '': 'r', '': 'w', '': 'y', '': 'ī', '': 'i',
        '': 'u', '': 'ü', '': 'e', '': 'æ', '': 'x', '': 'á',
        '': 'ē', '': 'ä', '': 'ai', '': 'ow', '': 'ō', '': 'õ',
        '': 'ö', '': '4', '': 'c', '': 'j', '': 'yü', '': 'wī',
        '': 'yh', '': 'kh', '': 'rr', '': 'rh', '' : 'rä',
    };

    const diagnosticParagraph = "I know that he and she will not go, but we can see what they do. So, all people have a time to find their own way. If you look for it, you may also get more than you think. This one man had a good day; his work was about to make a change. These other people came out from the house to use the long road and go down to the water. How did he know? It was the first time they had been over there. I will give him a call now.";

    // --- DOM ELEMENTS ---
    const inputEl = document.getElementById('english-input');
    const outputEl = document.getElementById('output');
    const transliterateBtn = document.getElementById('transliterate-btn');
    const diagnosticBtn = document.getElementById('diagnostic-btn');
    const manageDictBtn = document.getElementById('manage-dict-btn');
    const activeDictNameEl = document.getElementById('active-dict-name');
    const showSlugCheckbox = document.getElementById('show-slug-checkbox');
    
    // Modals
    const dictionaryManagerModal = document.getElementById('dictionary-manager-modal');
    const dictionaryEditorModal = document.getElementById('dictionary-editor-modal');
    const confirmationModal = document.getElementById('confirmation-modal');
    const newDictionaryModal = document.getElementById('new-dictionary-modal');
    
    const closeModalManagerBtn = document.getElementById('close-manager-btn');
    const closeEditorBtn = document.getElementById('close-editor-btn');
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    const confirmNoBtn = document.getElementById('confirm-no-btn');
    const confirmationMessageEl = document.getElementById('confirmation-message');

    // Dictionary Manager Elements
    const dictionaryListEl = document.getElementById('dictionary-list');
    const newDictBtn = document.getElementById('new-dict-btn');
    const importInput = document.getElementById('import-input');

    // Dictionary Editor Elements
    const dictionaryEditorTitleEl = document.getElementById('dictionary-editor-title');
    const wordsTab = document.getElementById('words-tab');
    const graphemesTab = document.getElementById('graphemes-tab');
    const wordsEditorContent = document.getElementById('words-editor-content');
    const graphemesEditorContent = document.getElementById('graphemes-editor-content');
    const wordListEl = document.getElementById('word-list');
    const graphemeListEl = document.getElementById('grapheme-list');
    const addGraphemeBtn = document.getElementById('add-grapheme-btn');

    // New Dictionary Modal Elements
    const closeNewDictBtn = document.getElementById('close-new-dict-btn');
    const cancelNewDictBtn = document.getElementById('cancel-new-dict-btn');
    const saveNewDictBtn = document.getElementById('save-new-dict-btn');
    const newDictNameInput = document.getElementById('new-dict-name-input');
    const newDictAuthorInput = document.getElementById('new-dict-author-input');

    // Notification Banner
    const notificationBannerEl = document.getElementById('notification-banner');

    // Inline Prompt Area
    const promptAreaEl = document.getElementById('prompt-area');
    const promptHeadingEl = promptAreaEl.querySelector('#prompt-heading');
    const promptInstructionEl = promptAreaEl.querySelector('#prompt-instruction');
    const promptButtonsEl = promptAreaEl.querySelector('#prompt-buttons-container');
    const rememberCheckbox = promptAreaEl.querySelector('#remember-choice-checkbox');
    const promptWordCheckboxEl = document.getElementById('prompt-word-for-checkbox');
    const directGraflectInput = document.getElementById('direct-graflect-input');
    const useDirectInputBtn = document.getElementById('use-direct-input-btn');

    // --- STATE ---
    let dictionaries = [];
    let activeDictionaryIndex = 0;
    let currentResolve;
    let confirmationCallback;
    let notificationTimeout;
    let currentlyEditingDictIndex = -1;
    let lastRawOutput = ''; // UPDATED: State to hold the last result

    // --- FUNCTIONS ---

    function showNotification(message) {
        if (!notificationBannerEl) return;
        if (notificationTimeout) clearTimeout(notificationTimeout);
        notificationBannerEl.textContent = message;
        notificationBannerEl.classList.remove('hidden');
        notificationTimeout = setTimeout(() => {
            notificationBannerEl.classList.add('hidden');
        }, 3000);
    }

    function showConfirmation(message, onConfirm) {
        if (!confirmationModal || !confirmationMessageEl) return;
        confirmationMessageEl.textContent = message;
        confirmationModal.classList.remove('hidden');
        confirmationCallback = onConfirm;
    }

    function getActiveDictionary() {
        return dictionaries[activeDictionaryIndex];
    }
    
    function convertGraflectToSlug(graflectText) {
        let slugText = '';
        for (const char of graflectText) {
            if (slugMap.hasOwnProperty(char)) {
                slugText += slugMap[char];
            } else {
                slugText += char;
            }
        }
        return slugText;
    }

    // NEW: Renders the output based on the last raw result and checkbox state
    function renderOutput() {
        if (!lastRawOutput) {
            outputEl.innerHTML = '';
            return;
        }

        // If the checkbox is checked, build and render the HTML with ruby tags
        if (showSlugCheckbox.checked) {
            const parts = lastRawOutput.split(/(\s+|[.,!?;:"()'-]|\d+)/g);
            let htmlOutput = '';
            for (const part of parts) {
                 if (!part) continue;
                 // If it's not a word (e.g., space, punctuation), add it directly
                 if (part.match(/(\s+|[.,!?;:"()'-]|\d+)/)) {
                    htmlOutput += part;
                 } else {
                    // Otherwise, it's a word; create a ruby element for it
                    const slugWord = convertGraflectToSlug(part);
                    htmlOutput += `<ruby>${part}<rt>${slugWord}</rt></ruby>`;
                 }
            }
            outputEl.innerHTML = htmlOutput;
        } else {
            // Otherwise, just render the plain text
            outputEl.textContent = lastRawOutput;
        }
    }

    function createDefaultDictionary() {
        return {
            name: "Wendy's Accent",
            author: "Wendy Zhulkovsky",
            description: "Default dictionary with common English words.",
            words: { ...defaultWordMap },
            graphemes: { ...defaultGraphemeMap }
        };
    }

    function loadDictionaries() {
        const storedDicts = localStorage.getItem('graflectDictionaries');
        const storedIndex = localStorage.getItem('graflectActiveDictIndex');
        let parsedDicts = [];
        try {
            if (storedDicts) parsedDicts = JSON.parse(storedDicts);
        } catch (e) {
            console.error("Could not parse dictionaries from localStorage:", e);
            parsedDicts = [];
        }

        if (parsedDicts.length > 0) {
            dictionaries = parsedDicts.map(dict => {
                const newDict = { ...dict };
                if (!newDict.graphemes || Object.keys(newDict.graphemes).length === 0) {
                    newDict.graphemes = { ...defaultGraphemeMap };
                }
                return newDict;
            });
            activeDictionaryIndex = storedIndex ? parseInt(storedIndex, 10) : 0;
        } else {
            dictionaries = [createDefaultDictionary()];
            activeDictionaryIndex = 0;
        }
        updateActiveDictDisplay();
        saveAllDictionaries();
    }

    function saveAllDictionaries() {
        localStorage.setItem('graflectDictionaries', JSON.stringify(dictionaries));
        localStorage.setItem('graflectActiveDictIndex', activeDictionaryIndex);
    }
    
    function updateActiveDictDisplay() {
        const activeDict = getActiveDictionary();
        if (activeDict && activeDictNameEl) {
            activeDictNameEl.textContent = activeDict.name;
        }
    }
    
    async function promptForChoice(word, grapheme, options, index) {
        transliterateBtn.disabled = true;
        const highlightedWord = `${word.substring(0, index)}<span class="prompt-word-highlight">${grapheme}</span>${word.substring(index + grapheme.length)}`;
        promptHeadingEl.innerHTML = `Ambiguity in "${word}"`;
        promptInstructionEl.innerHTML = `Choose the sound for the highlighted part: ${highlightedWord}`;
        promptWordCheckboxEl.textContent = word;
        promptButtonsEl.innerHTML = '';
        directGraflectInput.value = '';

        const allOptions = [...new Set([...options, ''])]; 

        allOptions.forEach(graflect => {
            if (graflect === undefined) return;
            const button = document.createElement('button');
            button.className = 'normal-btn';
            button.innerHTML = graflect ? `<span class="graflect-font">${graflect}</span>` : 'Silent → (nothing)';
            button.onclick = () => {
                if (currentResolve) {
                    currentResolve(graflect);
                    currentResolve = null;
                }
                promptAreaEl.classList.add('hidden');
                transliterateBtn.disabled = false;
            };
            promptButtonsEl.appendChild(button);
        });

        useDirectInputBtn.onclick = () => {
             if (currentResolve) {
                currentResolve(directGraflectInput.value);
                currentResolve = null;
            }
            promptAreaEl.classList.add('hidden');
            transliterateBtn.disabled = false;
        };

        promptAreaEl.classList.remove('hidden');
        return new Promise(resolve => {
            currentResolve = resolve;
        });
    }

    async function processWord(word) {
        const lowerWord = word.toLowerCase();
        const activeDict = getActiveDictionary();

        if (activeDict && activeDict.words[lowerWord]) {
            return activeDict.words[lowerWord];
        }
        
        let finalGraflect = '';
        let remaining = lowerWord;
        let originalIndex = 0;
        let wasPrompted = false;

        const graphemeMap = activeDict.graphemes || {};
        const graphemeKeys = Object.keys(graphemeMap).sort((a, b) => b.length - a.length);

        const findLongestMatch = (text) => {
            for (const key of graphemeKeys) {
                if (text.startsWith(key)) return key;
            }
            return null;
        };

        while (remaining.length > 0) {
            const grapheme = findLongestMatch(remaining);
            if (!grapheme) {
                console.error(`No grapheme rule found for character: "${remaining[0]}" in word "${word}"`);
                finalGraflect += remaining[0];
                remaining = remaining.substring(1);
                continue;
            }

            const graflectOptions = graphemeMap[grapheme];

            if (typeof graflectOptions === 'string') {
                finalGraflect += graflectOptions;
            } else if (Array.isArray(graflectOptions)) {
                wasPrompted = true;
                const choice = await promptForChoice(word, grapheme, graflectOptions, originalIndex);
                finalGraflect += choice;
            }
            remaining = remaining.substring(grapheme.length);
            originalIndex += grapheme.length;
        }

        if (rememberCheckbox.checked && wasPrompted) {
            activeDict.words[lowerWord] = finalGraflect;
            saveAllDictionaries();
        }
        return finalGraflect;
    }

    async function handleTransliterateClick() {
        transliterateBtn.disabled = true;
        transliterateBtn.textContent = "Processing...";
        outputEl.innerHTML = '';
        lastRawOutput = ''; // Clear previous result

        const text = inputEl.value;
        const parts = text.split(/(\s+|[.,!?;:"()'-])/g);
        let rawOutput = '';

        for (const part of parts) {
            if (!part) continue;
            if (part.match(/(\s+|[.,!?;:"()'-]|\d+)/)) {
                rawOutput += part;
            } else {
                const word = part;
                const graflectWord = await processWord(word);
                rawOutput += graflectWord;
            }
            // Temporarily update with raw text for responsiveness during long prompts
            outputEl.textContent = rawOutput;
        }
        
        lastRawOutput = rawOutput; // Store the final raw result
        renderOutput(); // Render the final output correctly

        transliterateBtn.disabled = false;
        transliterateBtn.textContent = "Transliterate";
    }

    function handleExportClick(dictIndex) {
        const dictionary = dictionaries[dictIndex];
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
        showNotification(`Dictionary "${dictionary.name}" exported!`);
    }

    function handleImportChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedDict = JSON.parse(e.target.result);
                if (typeof importedDict !== 'object' || !importedDict.name || !importedDict.words) {
                    throw new Error("Invalid format. File must be a valid dictionary object.");
                }
                importedDict.graphemes = importedDict.graphemes || { ...defaultGraphemeMap };
                dictionaries.push(importedDict);
                saveAllDictionaries();
                populateDictionaryManager();
                showNotification(`Dictionary "${importedDict.name}" imported successfully!`);
            } catch (error) {
                showNotification("Error: Could not import file. " + error.message);
            } finally {
                importInput.value = '';
            }
        };
        reader.readAsText(file);
    }
    
    function handleDiagnosticClick() {
        inputEl.value = diagnosticParagraph;
        showNotification("Diagnostic paragraph inserted.");
    }

    function openDictionaryManager() {
        populateDictionaryManager();
        dictionaryManagerModal.classList.remove('hidden');
    }

    function populateDictionaryManager() {
        dictionaryListEl.innerHTML = '';
        dictionaries.forEach((dict, index) => {
            const li = document.createElement('li');
            const infoDiv = document.createElement('div');
            infoDiv.className = 'dict-info';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = dict.name + (index === activeDictionaryIndex ? ' (Active)' : '');

            const authorSpan = document.createElement('span');
            authorSpan.className = 'author';
            authorSpan.textContent = ` by ${dict.author}`;

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(authorSpan);
            
            const buttonDiv = document.createElement('div');
            
            const selectBtn = document.createElement('button');
            selectBtn.textContent = 'Select';
            selectBtn.className = 'dict-btn select normal-btn';
            selectBtn.disabled = index === activeDictionaryIndex;
            selectBtn.onclick = () => {
                activeDictionaryIndex = index;
                saveAllDictionaries();
                updateActiveDictDisplay();
                populateDictionaryManager();
                showNotification(`"${dict.name}" is now the active dictionary.`);
            };

            const exportBtn = document.createElement('button');
            exportBtn.textContent = 'Export';
            exportBtn.className = 'dict-btn normal-btn';
            exportBtn.onclick = () => handleExportClick(index);

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'dict-btn normal-btn';
            editBtn.onclick = () => openDictionaryEditor(index);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'dict-btn delete normal-btn';
            deleteBtn.onclick = () => {
                showConfirmation(`Are you sure you want to delete the "${dict.name}" dictionary? This cannot be undone.`, () => {
                    const deletedName = dictionaries[index].name;
                    dictionaries.splice(index, 1);

                    if (dictionaries.length === 0) {
                        dictionaries.push(createDefaultDictionary());
                        activeDictionaryIndex = 0;
                    } else {
                        if (activeDictionaryIndex >= index) {
                            activeDictionaryIndex = Math.max(0, activeDictionaryIndex - 1);
                        }
                    }

                    saveAllDictionaries();
                    updateActiveDictDisplay();
                    populateDictionaryManager();
                    showNotification(`Deleted "${deletedName}".`);
                });
            };

            buttonDiv.appendChild(selectBtn);
            buttonDiv.appendChild(exportBtn);
            buttonDiv.appendChild(editBtn);
            buttonDiv.appendChild(deleteBtn);
            
            li.appendChild(infoDiv);
            li.appendChild(buttonDiv);
            dictionaryListEl.appendChild(li);
        });
    }
    
    function handleCreateNewDictionary() {
        const name = newDictNameInput.value.trim();
        const author = newDictAuthorInput.value.trim();

        if (!name || !author) {
            showNotification("Both dictionary name and author are required.");
            return;
        }

        const newDict = createDefaultDictionary();
        newDict.name = name;
        newDict.author = author;
        newDict.words = {};

        dictionaries.push(newDict);
        activeDictionaryIndex = dictionaries.length - 1;
        saveAllDictionaries();
        updateActiveDictDisplay();
        populateDictionaryManager();
        
        newDictionaryModal.classList.add('hidden');
        newDictNameInput.value = '';
        newDictAuthorInput.value = '';
        
        showNotification(`Created and selected new dictionary: "${name}"`);
    }

    function openDictionaryEditor(dictIndex) {
        currentlyEditingDictIndex = dictIndex;
        dictionaryEditorTitleEl.textContent = `Editing: ${dictionaries[dictIndex].name}`;
        
        wordsTab.classList.add('active');
        graphemesTab.classList.remove('active');
        wordsEditorContent.classList.remove('hidden');
        graphemesEditorContent.classList.add('hidden');

        populateWordList(dictIndex);
        populateGraphemeList(dictIndex);

        dictionaryManagerModal.classList.add('hidden');
        dictionaryEditorModal.classList.remove('hidden');
    }

    function populateWordList(dictIndex) {
        wordListEl.innerHTML = '';
        const dictionary = dictionaries[dictIndex];
        const sortedWords = Object.keys(dictionary.words || {}).sort();
        
        sortedWords.forEach(word => {
            const li = createEditableListItem(word, dictionary.words[word], dictIndex, 'word');
            wordListEl.appendChild(li);
        });
    }

    function populateGraphemeList(dictIndex) {
        graphemeListEl.innerHTML = '';
        const dictionary = dictionaries[dictIndex];
        const graphemes = dictionary.graphemes || {};
        const sortedGraphemes = Object.keys(graphemes).sort((a,b) => b.length - a.length || a.localeCompare(b));

        addGraphemeBtn.onclick = () => {
            const newLi = createEditableListItem('', '', dictIndex, 'grapheme', true);
            graphemeListEl.prepend(newLi);
            newLi.querySelector('.english-font-input').focus();
        };

        sortedGraphemes.forEach(grapheme => {
            const li = createEditableListItem(grapheme, graphemes[grapheme], dictIndex, 'grapheme');
            graphemeListEl.appendChild(li);
        });
    }

    function createEditableListItem(key, value, dictIndex, type, isNew = false) {
        const li = document.createElement('li');
        const textDiv = document.createElement('div');
        textDiv.style.display = 'flex';
        textDiv.style.gap = '1em';
        textDiv.style.alignItems = 'center';
        textDiv.style.flexGrow = '1';

        const buttonDiv = document.createElement('div');
        const dictionary = dictionaries[dictIndex];
        const dataMap = type === 'word' ? dictionary.words : dictionary.graphemes;

        const renderDisplayMode = (currentKey, currentValue) => {
            textDiv.innerHTML = '';
            buttonDiv.innerHTML = '';

            const keySpan = document.createElement('span');
            keySpan.className = type === 'word' ? 'dictionary-word' : 'grapheme-key';
            keySpan.textContent = type === 'word' ? currentKey : `"${currentKey}"`;

            const valueSpan = document.createElement('span');
            valueSpan.className = `graflect-font ${type === 'word' ? 'dictionary-graflect' : 'grapheme-output'}`;
            let displayValue = currentValue;
            if (Array.isArray(displayValue)) {
                displayValue = `[${displayValue.map(v => `'${v}'`).join(', ')}]`;
            }
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
                saveAllDictionaries();
                li.remove();
                showNotification(`Rule for "${currentKey}" removed.`);
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
            let displayValue = currentValue;
            if (Array.isArray(displayValue)) {
                displayValue = `[${displayValue.map(v => `'${v}'`).join(', ')}]`;
            }
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
                    showNotification("Grapheme/word cannot be empty.");
                    return;
                }

                if (newValue.startsWith('[') && newValue.endsWith(']')) {
                    try {
                        const arrayValue = JSON.parse(newValue.replace(/'/g, '"'));
                        if (Array.isArray(arrayValue)) {
                            newValue = arrayValue;
                        }
                    } catch(e) {
                        showNotification("Invalid array format. Use single quotes, e.g., ['', '']");
                        return;
                    }
                }

                if (!isNew && newKey !== currentKey) {
                    delete dataMap[currentKey];
                }
                
                dataMap[newKey] = newValue;
                saveAllDictionaries();
                
                if (isNew) {
                    type === 'word' ? populateWordList(dictIndex) : populateGraphemeList(dictIndex);
                } else {
                    renderDisplayMode(newKey, newValue);
                }
                showNotification(`Rule for "${newKey}" saved.`);
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

    // --- EVENT LISTENERS ---
    if (transliterateBtn) transliterateBtn.addEventListener('click', handleTransliterateClick);
    if (diagnosticBtn) diagnosticBtn.addEventListener('click', handleDiagnosticClick);
    if (manageDictBtn) manageDictBtn.addEventListener('click', openDictionaryManager);
    if (importInput) importInput.addEventListener('change', handleImportChange);
    // UPDATED: Add event listener for the checkbox to re-render the output
    if (showSlugCheckbox) showSlugCheckbox.addEventListener('change', renderOutput);

    if (newDictBtn) newDictBtn.addEventListener('click', () => newDictionaryModal.classList.remove('hidden'));
    if (closeModalManagerBtn) closeModalManagerBtn.addEventListener('click', () => dictionaryManagerModal.classList.add('hidden'));
    
    if (closeEditorBtn) closeEditorBtn.addEventListener('click', () => {
        dictionaryEditorModal.classList.add('hidden');
        openDictionaryManager();
    });
    if (wordsTab) wordsTab.addEventListener('click', () => {
        wordsTab.classList.add('active');
        graphemesTab.classList.remove('active');
        wordsEditorContent.classList.remove('hidden');
        graphemesEditorContent.classList.add('hidden');
    });
    if (graphemesTab) graphemesTab.addEventListener('click', () => {
        graphemesTab.classList.add('active');
        wordsTab.classList.remove('active');
        graphemesEditorContent.classList.remove('hidden');
        wordsEditorContent.classList.add('hidden');
    });
    
    if (confirmNoBtn) confirmNoBtn.addEventListener('click', () => {
        confirmationModal.classList.add('hidden');
        confirmationCallback = null;
    });
    if (confirmYesBtn) confirmYesBtn.addEventListener('click', () => {
        if (typeof confirmationCallback === 'function') {
            confirmationCallback();
        }
        confirmationModal.classList.add('hidden');
        confirmationCallback = null;
    });

    const closeAndClearNewDictModal = () => {
        newDictionaryModal.classList.add('hidden');
        newDictNameInput.value = '';
        newDictAuthorInput.value = '';
    };
    if (saveNewDictBtn) saveNewDictBtn.addEventListener('click', handleCreateNewDictionary);
    if (cancelNewDictBtn) cancelNewDictBtn.addEventListener('click', closeAndClearNewDictModal);
    if (closeNewDictBtn) closeNewDictBtn.addEventListener('click', closeAndClearNewDictModal);
    
    // --- INITIALIZATION ---
    loadDictionaries();
}

// Add the event listener to automatically initialize the tool.
document.addEventListener('modulesLoaded', initializeGraflectTool);
