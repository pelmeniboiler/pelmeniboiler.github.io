/**
 * /scripts/blog/demos/graflect.js
 * * Contains all the JavaScript logic for the Graflect Transliteration Tool.
 * This script should be loaded by any page that includes the graflectsubstitution.html module.
 * The main logic is wrapped in the initializeGraflectTool function, which is called
 * by an event listener on the parent page once the module's HTML is loaded.
 */
function initializeGraflectTool() {
    // --- DATA MAPPINGS ---
    const graflectMap = {
        '/p/': '', '/b/': '', '/t/': '', '/d/': '', '/k/': '', '/ɡ/': '',
        '/f/': '', '/v/': '', '/θ/': '', '/ð/': '', '/s/': '', '/z/': '',
        '/ʃ/': '', '/ʒ/': '', '/h/': '', '/m/': '', '/n/': '', '/ŋ/': '',
        '/l/': '', '/r/': '', '/w/': '', '/j/': '', '/iː/': '', '/ɪ/': '',
        '/ʊ/': '', '/u/': '', '/ɛ/': '', '/æ/': '', '/ʌ/': '', '/ə/': '',
        '/ɑ/': '', '/eɪ/': '', '/ɛə/': '', '/aɪ/': '', '/aʊ/': '', '/oʊ/': '',
        '/ɔ/': '', '/ɜː/': '', '/ɛər/': '', '/tʃ/': '', '/dʒ/': '', '/ju/': '',
        '/wi/': '', '/ɥi/': '', '/x/': '', '/ɾ/': '', '/ʁ/': '',
        '/ks/': '', '/kw/': '', '/ɒ/': '', '/uː/': '',
        '/ɔɪ/': '', '/ʃən/': '', '/ʒən/': '', '/ʃəs/': '',
        '/ʃəl/': '', '/ʒər/': '', '/ʃʊər/': '', '/tʃər/': '',
        '/sk/': '', '/səl/': '', '/ɛks/': '',
        '/ɛɡz/': '', '/ɡw/': '', '/juː/': '', '/ndʒ/': '',
        '/ɔːl/': '' // NEW
    };

    const defaultWordMap = {
        'a': '', 'an': '',
        'and': '', 
        'are': '', 'as': '', 'at': '', 'be': '', 'because': '',
        'been': '', 'before': '', 'but': '', 'by': '',
        'call': '',
        'can': '',
        'change': '', 'come': '', 'could': '', 'day': '', 'do': '',
        'down': '',
        'each': '', 'even': '', 'first': '',
        'find': '',
        'for': '',
        'from': '', 'get': '', 'give': '',
        'go': '',
        'good': '',
        'great': '', 'had': '', 'has': '', 'have': '', 'he': '',
        'her': '',
        'here': '', 'him': '', 'his': '', 'how': '',
        'i': '', 'if': '', 'in': '', 'into': '',
        'is': '', 'it': '',
        'its': '', 'just': '', 'know': '',
        'like': '',
        'long': '',
        'look': '',
        'made': '', 'make': '',
        'man': '',
        'may': '',
        'me': '', 'more': '', 'most': '', 'my': '', 'new': '',
        'not': '',
        'now': '',
        'of': '', 'on': '',
        'one': '', 'only': '', 'or': '', 'other': '',
        'out': '',
        'over': '',
        'people': '', 'place': '',
        'said': '', 'same': '', 'see': '', 'she': '',
        'so': '',
        'some': '', 'take': '', 'than': '',
        'that': '', 'the': '',
        'their': '', 'them': '', 'then': '', 'there': '', 'these': '',
        'they': '', 'thing': '', 'think': '', 'this': '', 'those': '',
        'time': '', 'to': '', 'two': '', 'up': '', 'use': '',
        'very': '', 'want': '', 'was': '',
        'water': '',
        'way': '', 'we': '', 'well': '', 'were': '',
        'what': '',
        'when': '', 'where': '', 'which': '', 'who': '', 'why': '',
        'will': '', 'with': '', 'work': '',
        'would': '', 'year': '',
        'you': '', 'your': ''
    };

    // UPDATED: Added all single consonants and fixed other rules.
    const graphemeToIpa = {
        'tious': '/ʃəs/', 'cious': '/ʃəs/', 'ssion': '/ʃən/', 'stle': '/səl/',
        'sion': ['/ʃən/', '/ʒən/'], 'tion': '/ʃən/', 'cian': '/ʃən/',
        'tial': '/ʃəl/', 'cial': '/ʃəl/', 'sure': ['/ʒər/', '/ʃʊər/'],
        'ture': '/tʃər/', 'dge': '/dʒ/', 'eigh': '/eɪ/', 'igh': '/aɪ/',
        'tch': '/tʃ/', 'age': ['/ɪdʒ/', '/eɪdʒ/'], 'ex': ['/ɛks/', '/ɛɡz/'],
        'nge': '/ndʒ/', 'que': '/k/', 'lk': '/k/', 'lm': '/m/', 'mb': '/m/', 'bt': '/t/',
        'ps': '/s/', 'pn': '/n/', 'rh': '/r/',
        'sch': ['/sk/', '/ʃ/'], 'eau': ['/oʊ/', '/juː/'],
        'sc': ['/sk/', '/s/'], 'gu': ['/ɡ/', '/ɡw/'],
        'ck': '/k/', 'qu': '/kw/', 'th': ['/θ/', '/ð/'], 'sh': '/ʃ/',
        'ch': ['/tʃ/', '/k/', '/ʃ/', '/x/'], 
        'ng': '/ŋ/', 'ph': '/f/', 'kn': '/n/', 'wr': '/r/',
        'gh': ['/ɡ/', '/f/', ''], 'oo': ['/uː/', '/ʊ/', '/ʌ/'], 'ee': ['/iː/', '/ɪ/'],
        'ea': ['/iː/', '/ɛ/', '/eɪ/'], 'ou': ['/aʊ/', '/oʊ/', '/u/', '/ʌ/'],
        'ow': ['/aʊ/', '/oʊ/', '/u/'], 'ew': ['/ju/', '/uː/'],
        'au': '/ɔ/', 'oi': '/ɔɪ/', 'oy': '/ɔɪ/',
        'ai': ['/eɪ/', '/ɛ/'], 'ay': '/eɪ/',
        'all': '/ɔːl/',
        'll': '/l/', 'ss': '/s/', 'ff': '/f/', 'rr': '/r/', 'pp': '/p/', 'bb': '/b/', 
        'dd': '/d/', 'tt': '/t/', 'mm': '/m/', 'nn': '/n/',
        'a': ['/æ/', '/eɪ/', '/ɑ/', '/ə/', '/ɔ/', '/ɛə/', '/aɪ/'], 
        'e': ['/ɛ/', '/iː/', '/ə/', '/ɪ/', '/ɛə/'],
        'i': ['/ɪ/', '/aɪ/', '/iː/'], 
        'o': ['/ɒ/', '/oʊ/', '/ʌ/', '/u/', '/ɔ/'], 
        'u': ['/ʌ/', '/u/', '/ʊ/', '/ju/'], 'y': ['/ɪ/', '/aɪ/', '/iː/'],
        's': ['/s/', '/z/'], 'g': ['/ɡ/', '/dʒ/'], 'c': ['/k/', '/s/'], 'x': ['/ks/', '/z/'],
        'p': ['/p/'], 'b': ['/b/'], 't': ['/t/'], 'h': ['/h/', '/dʒ/'],
        'l': ['/l/'], 'w': ['/w/'], 'r': ['/r/', '/ɛər/', '/ɜː/', '/ʁ/'], 
        'j': '/dʒ/', 'd': '/d/', 'f': '/f/', 'k': '/k/', 'm': '/m/',
        'n': '/n/', 'v': '/v/', 'z': '/z/'
    };
    
    const diagnosticParagraph = "I know that he and she will not go, but we can see what they do. So, all people have a time to find their own way. If you look for it, you may also get more than you think. This one man had a good day; his work was about to make a change. These other people came out from the house to use the long road and go down to the water. How did he know? It was the first time they had been over there. I will give him a call now.";

    // --- DOM ELEMENTS ---
    const inputEl = document.getElementById('english-input');
    const outputEl = document.getElementById('output');
    const transliterateBtn = document.getElementById('transliterate-btn');
    const diagnosticBtn = document.getElementById('diagnostic-btn');
    const manageDictBtn = document.getElementById('manage-dict-btn');
    const activeDictNameEl = document.getElementById('active-dict-name');
    
    // Modals
    const dictionaryManagerModal = document.getElementById('dictionary-manager-modal');
    const wordEditorModal = document.getElementById('word-editor-modal');
    const confirmationModal = document.getElementById('confirmation-modal');
    const newDictionaryModal = document.getElementById('new-dictionary-modal');
    const closeModalManagerBtn = document.getElementById('close-manager-btn');
    const closeWordEditorBtn = document.getElementById('close-editor-btn');
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    const confirmNoBtn = document.getElementById('confirm-no-btn');
    const confirmationMessageEl = document.getElementById('confirmation-message');

    // Dictionary Manager Elements
    const dictionaryListEl = document.getElementById('dictionary-list');
    const wordListEl = document.getElementById('word-list');
    const wordEditorTitleEl = document.getElementById('word-editor-title');
    const newDictBtn = document.getElementById('new-dict-btn');
    const importInput = document.getElementById('import-input');

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
    const promptWordCheckboxEl = promptAreaEl.querySelector('#prompt-word-for-checkbox');
    const directGraflectInput = promptAreaEl.querySelector('#direct-graflect-input');
    const useDirectInputBtn = promptAreaEl.querySelector('#use-direct-input-btn');

    // --- STATE ---
    let dictionaries = [];
    let activeDictionaryIndex = 0;
    let currentResolve;
    let confirmationCallback;
    let notificationTimeout;
    const graphemeKeys = Object.keys(graphemeToIpa).sort((a, b) => b.length - a.length);
    const ipaKeys = Object.keys(graflectMap).sort((a, b) => b.length - a.length);

    // --- FUNCTIONS ---

    function showNotification(message) {
        if (!notificationBannerEl) return;
        
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }

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

    function createDefaultDictionary() {
        return {
            name: "Wendy's Accent",
            author: "Wendy Zhulkovsky",
            description: "Default dictionary with common English words.",
            words: { ...defaultWordMap }
        };
    }

    function loadDictionaries() {
        const storedDicts = localStorage.getItem('graflectDictionaries');
        const storedIndex = localStorage.getItem('graflectActiveDictIndex');
        let parsedDicts = [];
        try {
            if (storedDicts) {
                parsedDicts = JSON.parse(storedDicts);
            }
        } catch (e) {
            console.error("Could not parse dictionaries from localStorage:", e);
            parsedDicts = [];
        }

        if (parsedDicts.length > 0) {
            dictionaries = parsedDicts;
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

    function ipaToGraflect(ipaString) {
        if (!ipaString) return '';
        let result = '';
        let remainingIpa = ipaString;
        while (remainingIpa.length > 0) {
            let foundMatch = false;
            for (const key of ipaKeys) {
                if (remainingIpa.startsWith(key)) {
                    result += graflectMap[key];
                    remainingIpa = remainingIpa.substring(key.length);
                    foundMatch = true;
                    break;
                }
            }
            if (!foundMatch) {
                // UPDATED: Log error instead of passing through invalid characters
                console.error(`No Graflect mapping found for IPA segment: ${remainingIpa[0]}`);
                remainingIpa = remainingIpa.substring(1);
            }
        }
        return result;
    }

    function findLongestGrapheme(text) {
        for (const key of graphemeKeys) {
            if (text.startsWith(key)) return key;
        }
        return text[0];
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

        allOptions.forEach(ipa => {
            if (ipa === undefined) return;
            const button = document.createElement('button');
            button.className = 'normal-btn';
            const graflectChars = ipaToGraflect(ipa);
            button.innerHTML = ipa ? `${ipa} → <span class="graflect-font">${graflectChars}</span>` : 'Silent → (nothing)';
            button.onclick = () => {
                if (currentResolve) {
                    currentResolve({ type: 'ipa', value: ipa });
                    currentResolve = null;
                }
                promptAreaEl.classList.add('hidden');
                transliterateBtn.disabled = false;
            };
            promptButtonsEl.appendChild(button);
        });

        useDirectInputBtn.onclick = () => {
             if (currentResolve) {
                currentResolve({ type: 'direct', value: directGraflectInput.value });
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

        while (remaining.length > 0) {
            const grapheme = findLongestGrapheme(remaining);
            const ipaOptions = graphemeToIpa[grapheme];

            if (typeof ipaOptions === 'string') {
                finalGraflect += ipaToGraflect(ipaOptions);
            } else if (Array.isArray(ipaOptions)) {
                wasPrompted = true;
                const choice = await promptForChoice(word, grapheme, ipaOptions, originalIndex);
                let segmentGraflect = '';
                if (choice.type === 'ipa') {
                    segmentGraflect = ipaToGraflect(choice.value);
                } else { 
                    segmentGraflect = choice.value;
                }
                finalGraflect += segmentGraflect;
            } else {
                // UPDATED: Log error instead of passing through invalid characters
                console.error(`No IPA mapping found for grapheme: "${grapheme}" in word "${word}"`);
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
        outputEl.textContent = '';
        const text = inputEl.value;
        const parts = text.split(/(\s+|[.,!?;:"()'-])/g);
        let finalOutput = '';

        for (const part of parts) {
            if (!part) continue;
            if (part.match(/(\s+|[.,!?;:"()'-]|\d+)/)) {
                finalOutput += part;
            } else {
                const word = part;
                const graflectWord = await processWord(word);
                finalOutput += graflectWord;
            }
            outputEl.textContent = finalOutput;
        }
        
        // --- DEBUG CHECK for invalid characters ---
        const invalidChars = new Set();
        const allowedChars = new Set(".,!?;:\"()'- \n\t0123456789".split(''));
        for (const char of finalOutput) {
            const code = char.charCodeAt(0);
            const isGraflect = code >= 0xEC70 && code <= 0xECEF;
            const isAllowed = allowedChars.has(char);

            if (!isGraflect && !isAllowed) {
                invalidChars.add(char);
            }
        }

        if (invalidChars.size > 0) {
            // UPDATED: More explicit error message
            console.error(
                "DEBUG CHECK FAILED: Invalid characters found in final output.", 
                { invalidChars: Array.from(invalidChars) }
            );
        }

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
            editBtn.onclick = () => openWordEditor(index);

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

        const newDict = {
            name: name,
            author: author,
            description: "",
            words: {}
        };
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

    function openWordEditor(dictIndex) {
        wordEditorTitleEl.textContent = `Editing: ${dictionaries[dictIndex].name}`;
        wordListEl.innerHTML = '';
        
        const sortedWords = Object.keys(dictionaries[dictIndex].words).sort();
        sortedWords.forEach(word => {
            const li = document.createElement('li');
            const wordSpan = document.createElement('span');
            wordSpan.className = 'dictionary-word';
            wordSpan.textContent = word;

            const graflectSpan = document.createElement('span');
            graflectSpan.className = 'dictionary-graflect graflect-font';
            graflectSpan.textContent = dictionaries[dictIndex].words[word];

            const editBtn = document.createElement('button');
            editBtn.className = 'dict-btn edit normal-btn';
            editBtn.textContent = 'Edit';
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'dict-btn remove normal-btn';
            removeBtn.textContent = 'Remove';
            
            const textDiv = document.createElement('div');
            textDiv.style.display = 'flex';
            textDiv.style.gap = '1em';
            textDiv.style.alignItems = 'center';
            textDiv.appendChild(wordSpan);
            textDiv.appendChild(graflectSpan);

            const buttonDiv = document.createElement('div');
            buttonDiv.appendChild(editBtn);
            buttonDiv.appendChild(removeBtn);

            li.appendChild(textDiv);
            li.appendChild(buttonDiv);
            wordListEl.appendChild(li);

            removeBtn.onclick = () => {
                delete dictionaries[dictIndex].words[word];
                saveAllDictionaries();
                li.remove();
                showNotification(`'${word}' removed.`);
            };

            editBtn.onclick = () => {
                textDiv.innerHTML = '';
                const wordLabel = document.createElement('span');
                wordLabel.className = 'dictionary-word';
                wordLabel.textContent = word;

                const editInput = document.createElement('input');
                editInput.type = 'text';
                editInput.className = 'dict-edit-input graflect-font';
                editInput.value = dictionaries[dictIndex].words[word];
                
                textDiv.appendChild(wordLabel);
                textDiv.appendChild(editInput);
                editInput.focus();

                buttonDiv.innerHTML = '';
                const saveBtn = document.createElement('button');
                saveBtn.className = 'dict-btn save normal-btn';
                saveBtn.textContent = 'Save';
                
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'dict-btn normal-btn';
                cancelBtn.textContent = 'Cancel';

                buttonDiv.appendChild(saveBtn);
                buttonDiv.appendChild(cancelBtn);

                saveBtn.onclick = () => {
                    dictionaries[dictIndex].words[word] = editInput.value;
                    saveAllDictionaries();
                    openWordEditor(dictIndex); // Refresh list
                    showNotification(`'${word}' updated.`);
                };
                cancelBtn.onclick = () => {
                    openWordEditor(dictIndex); // Refresh list
                };
            };
        });

        dictionaryManagerModal.classList.add('hidden');
        wordEditorModal.classList.remove('hidden');
    }

    // --- EVENT LISTENERS ---
    if (transliterateBtn) transliterateBtn.addEventListener('click', handleTransliterateClick);
    if (diagnosticBtn) diagnosticBtn.addEventListener('click', handleDiagnosticClick);
    if (manageDictBtn) manageDictBtn.addEventListener('click', openDictionaryManager);
    if (importInput) importInput.addEventListener('change', handleImportChange);

    // Dictionary Manager Listeners
    if (newDictBtn) newDictBtn.addEventListener('click', () => newDictionaryModal.classList.remove('hidden'));
    if (closeModalManagerBtn) closeModalManagerBtn.addEventListener('click', () => dictionaryManagerModal.classList.add('hidden'));
    
    // Word Editor Listeners
    if (closeWordEditorBtn) closeWordEditorBtn.addEventListener('click', () => {
        wordEditorModal.classList.add('hidden');
        openDictionaryManager();
    });
    
    // Confirmation Modal Listeners
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

    // New Dictionary Modal Listeners
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
