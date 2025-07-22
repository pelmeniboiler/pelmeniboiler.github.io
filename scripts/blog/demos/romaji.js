document.addEventListener('DOMContentLoaded', () => {

        // --- DATA MAPPINGS ---
        const defaultWordMap = { 'a': '', 'an': '', 'and': '', 'are': '', 'as': '', 'at': '', 'be': '', 'because': '', 'been': '', 'before': '', 'but': '', 'by': '', 'call': '', 'can': '', 'change': '', 'come': '', 'could': '', 'day': '', 'do': '', 'down': '', 'each': '', 'even': '', 'first': '', 'find': '', 'for': '', 'from': '', 'get': '', 'give': '', 'go': '', 'good': '', 'great': '', 'had': '', 'has': '', 'have': '', 'he': '', 'her': '', 'here': '', 'him': '', 'his': '', 'how': '', 'i': '', 'if': '', 'in': '', 'into': '', 'is': '', 'it': '', 'its': '', 'just': '', 'know': '', 'like': '', 'long': '', 'look': '', 'made': '', 'make': '', 'man': '', 'may': '', 'me': '', 'more': '', 'most': '', 'my': '', 'new': '', 'not': '', 'now': '', 'of': '', 'on': '', 'one': '', 'only': '', 'or': '', 'other': '', 'out': '', 'over': '', 'people': '', 'place': '', 'said': '', 'same': '', 'see': '', 'she': '', 'so': '', 'some': '', 'take': '', 'than': '', 'that': '', 'the': '', 'their': '', 'them': '', 'then': '', 'there': '', 'these': '', 'they': '', 'thing': '', 'think': '', 'this': '', 'those': '', 'time': '', 'to': '', 'two': '', 'up': '', 'use': '', 'very': '', 'want': '', 'was': '', 'water': '', 'way': '', 'we': '', 'well': '', 'were': '', 'what': '', 'when': '', 'where': '', 'which': '', 'who': '', 'why': '', 'will': '', 'with': '', 'work': '', 'would': '', 'year': '', 'you': '', 'your': '', 'own': '', 'also': '', 'about': '', 'came': '', 'house': '', 'road': '', 'did': '', 'ball': '', 'session': '', 'all': '' };
        const vowelPool = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        const defaultGraphemeMap = { 'tious': '', 'cious': '', 'ssion': '', 'stle': '', 'sion': ['', ''], 'tion': '', 'cian': '', 'tial': '', 'cial': '', 'sure': '', 'ture': '', 'dge': '', 'eigh': '', 'igh': '', 'tch': '', 'age': ['', ''], 'ex': ['', '', '', ''], 'nge': '', 'que': '', 'lk': '', 'lm': '', 'mb': '', 'bt': '', 'ps': '', 'pn': '', 'rh': '', 'sch': ['', ''], 'sci': ['', ''], 'eau': ['', ''], 'sc': ['', ''], 'gu': ['', ''], 'ck': '', 'qu': '', 'th': ['', ''], 'sh': '', 'ch': ['', '', '', ''], 'ng': '', 'ph': '', 'kn': '', 'wr': '', 'gh': ['', '', ''], 'oo': ['', '', ''], 'ee': ['', ''], 'ea': ['', '', ''], 'ou': ['', '', '', ''], 'ow': ['', '', ''], 'ew': ['', ''], 'au': '', 'oi': '', 'oy': '', 'ai': ['', ''], 'ay': '', 'll': '', 'ss': ['', ''], 'ff': '', 'rr': '', 'pp': '', 'bb': '', 'dd': '', 'tt': '', 'mm': '', 'nn': '', 'a': ['', '', '', '', ''], 'e': ['', '', ''], 'i': ['', '', ''], 'o': ['', '', '', '', ''], 'u': ['', '', '', ''], 'y': ['', '', ''], 's': ['', ''], 'g': ['', ''], 'c': ['', ''], 'x': ['', ''], 'p': '', 'b': '', 't': '', 'h': ['', ''], 'l': '', 'w': '', 'r': ['', '', '', ''], 'j': '', 'd': '', 'f': '', 'k': '', 'm': '', 'n': '', 'v': '', 'z': '', 'tr': '' };
        const slugMap = { '': 'p', '': 'b', '': 't', '': 'd', '': 'k', '': 'g', '': 'f', '': 'v', '': 'th', '': 'dh', '': 's', '': 'z', '': 'š', '': 'ž', '': 'h', '': 'm', '': 'n', '': 'ng', '': 'l', '': 'r', '': 'w', '': 'y', '': 'ī', '': 'i', '': 'u', '': 'ü', '': 'e', '': 'æ', '': 'x', '': 'á', '': 'ē', '': 'ä', '': 'ai', '': 'ow', '': 'ō', '': 'õ', '': 'ö', '': '4', '': 'c', '': 'j', '': 'yü', '': 'wī', '': 'yh', '': 'kh', '': 'rr', '': 'rh', '' : 'rä', };

        // --- DOM ELEMENTS ---
        const outputContainerEl = document.getElementById('output-container');
        const imeFloaterEl = document.getElementById('ime-floater');
        const romajiSuggestionsEl = document.getElementById('suggestions-dropdown');
        const romajiOutputDisplayEl = document.getElementById('romaji-output-display');
        const romajiOutputEditorEl = document.getElementById('romaji-output-editor');
        const notificationBannerEl = document.getElementById('notification-banner');
        const builderDisplayEl = document.getElementById('builder-display');
        const builderEnglishEl = document.getElementById('builder-english');
        const builderGraflectEl = document.getElementById('builder-graflect');
        const manageDictBtn = document.getElementById('manage-dict-btn');
        const copyBtn = document.getElementById('copy-btn');
        
        // Modal Elements
        const dictionaryManagerModal = document.getElementById('dictionary-manager-modal');
        const dictionaryEditorModal = document.getElementById('dictionary-editor-modal');
        const newDictionaryModal = document.getElementById('new-dictionary-modal');
        const confirmationModal = document.getElementById('confirmation-modal');
        const dictionaryListEl = document.getElementById('dictionary-list');
        const newDictBtn = document.getElementById('new-dict-btn');
        const newDictForm = document.getElementById('new-dict-form');
        const importBtn = document.getElementById('import-btn');
        const importInput = document.getElementById('import-input');
        const dictionaryEditorTitleEl = document.getElementById('dictionary-editor-title');
        const wordsTab = document.getElementById('words-tab');
        const graphemesTab = document.getElementById('graphemes-tab');
        const wordsEditorContent = document.getElementById('words-editor-content');
        const graphemesEditorContent = document.getElementById('graphemes-editor-content');
        const wordListEl = document.getElementById('word-list');
        const graphemeListEl = document.getElementById('grapheme-list');
        const addGraphemeBtn = document.getElementById('add-grapheme-btn');
        const newDictNameInput = document.getElementById('new-dict-name-input');
        const newDictAuthorInput = document.getElementById('new-dict-author-input');
        const saveNewDictBtn = document.getElementById('save-new-dict-btn');
        const cancelNewDictBtn = document.getElementById('cancel-new-dict-btn');
        const confirmationMessageEl = document.getElementById('confirmation-message');
        const confirmYesBtn = document.getElementById('confirm-yes-btn');
        const confirmNoBtn = document.getElementById('confirm-no-btn');

        // --- STATE ---
        let dictionaries = [], activeDictionaryIndex = 0, notificationTimeout, confirmationCallback;
        let activeSuggestionIndex = -1, currentSuggestions = [], currentlyEditingDictIndex = -1;
        let builderState = { isActive: false, originalWord: '', wordStartPosition: 0, addSpaceOnFinish: false, processedEnglish: '', graflectResult: '', remainingEnglish: '' };

        // --- DICTIONARY & UTILITY FUNCTIONS ---
        function showNotification(message) {
            if (notificationTimeout) clearTimeout(notificationTimeout);
            notificationBannerEl.textContent = message;
            notificationBannerEl.classList.add('visible');
            notificationTimeout = setTimeout(() => {
                notificationBannerEl.classList.remove('visible');
            }, 2500);
        }
        function getActiveDictionary() { return dictionaries[activeDictionaryIndex]; }
        function convertGraflectToSlug(graflectText) {
            let slugText = '';
            for (const char of graflectText) {
                slugText += slugMap[char] || char;
            }
            return slugText;
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
        function saveAllDictionaries() {
            try {
                localStorage.setItem('graflectDictionaries', JSON.stringify(dictionaries));
                localStorage.setItem('graflectActiveDictIndex', activeDictionaryIndex);
            } catch (e) {
                console.error("Could not save dictionaries to localStorage:", e);
                showNotification("Error: Could not save dictionary.");
            }
        }
        function loadDictionaries() {
            const storedDicts = localStorage.getItem('graflectDictionaries');
            const storedIndex = localStorage.getItem('graflectActiveDictIndex');
            let parsedDicts = [];
            try {
                if (storedDicts) parsedDicts = JSON.parse(storedDicts);
            } catch (e) { console.error("Could not parse dictionaries from localStorage:", e); parsedDicts = []; }

            if (parsedDicts.length > 0) {
                dictionaries = parsedDicts.map(dict => ({ ...dict, graphemes: dict.graphemes || { ...defaultGraphemeMap } }));
                let newIndex = storedIndex ? parseInt(storedIndex, 10) : 0;
                activeDictionaryIndex = (newIndex >= 0 && newIndex < dictionaries.length) ? newIndex : 0;
            } else {
                dictionaries = [createDefaultDictionary()];
                activeDictionaryIndex = 0;
            }
        }
        
        // --- INTERACTIVE BUILDER & OUTPUT LOGIC ---
        function renderOutput(cursorPos = -1) {
            const plainText = romajiOutputEditorEl.value;
            let html = '';

            if (builderState.isActive) {
                const before = plainText.substring(0, builderState.wordStartPosition);
                const after = plainText.substring(builderState.wordStartPosition + builderState.originalWord.length);
                html = generateRubyHtml(before)
                     + `<span id="cursor-tracker">${builderState.originalWord}</span>`
                     + generateRubyHtml(after);
            } else {
                html = generateRubyHtml(plainText);
            }
            
            romajiOutputDisplayEl.innerHTML = html;
            
            if (cursorPos > -1) {
                romajiOutputEditorEl.selectionStart = romajiOutputEditorEl.selectionEnd = cursorPos;
            }
        }

        function generateRubyHtml(text) {
            const parts = text.split(/([ \n\t]+)/);
            let html = '';
            parts.forEach(part => {
                if (part.match(/[ \n\t]+/)) {
                    html += part;
                } else if (part) {
                    const slug = convertGraflectToSlug(part);
                    html += `<ruby>${part}<rt>${slug}</rt></ruby>`;
                }
            });
            return html;
        }

        function startBuilder(word, position, addSpaceOnFinish) {
            if (!word) return;
            const activeDict = getActiveDictionary();
            if (!activeDict) { console.error("No active dictionary found."); return; }
            const lowerWord = word.toLowerCase();
            
            romajiOutputEditorEl.disabled = true;

            // *** CRITICAL FIX: Set the builder to active BEFORE rendering ***
            // This ensures the #cursor-tracker span is created.
            builderState = { 
                ...builderState, 
                isActive: true, 
                originalWord: word, 
                wordStartPosition: position, 
                addSpaceOnFinish: addSpaceOnFinish 
            };
            
            // Now that state is active, render the output to create the tracker span
            renderOutput();

            // Proceed with dictionary lookup and suggestions
            if (activeDict.words[lowerWord]) {
                promptWithDictOption(word, activeDict.words[lowerWord]);
            } else {
                startManualBuilder();
            }
        }
        
        function startManualBuilder() {
            // State is already set, just reset progress and start chunking
            builderState.processedEnglish = '';
            builderState.graflectResult = '';
            builderState.remainingEnglish = builderState.originalWord.toLowerCase();
            processNextChunk();
        }

        function promptWithDictOption(word, dictGraflect) {
            // State is already set, just build suggestions
            currentSuggestions = [
                { type: 'dict', english: word, graflect: dictGraflect, slug: convertGraflectToSlug(dictGraflect) },
                { type: 'manual', english: word, graflect: 'Build Manually...', slug: '...' }
            ];
            displayChunkSuggestions(currentSuggestions);
        }

        function processNextChunk() {
            updateBuilderDisplay();
            if (builderState.remainingEnglish.length === 0) {
                finishWord(builderState.originalWord, builderState.graflectResult);
                return;
            }
            const activeDict = getActiveDictionary();
            const graphemeKeys = Object.keys(activeDict.graphemes).sort((a, b) => b.length - a.length);
            let matchFound = false;
            for (const key of graphemeKeys) {
                if (builderState.remainingEnglish.startsWith(key)) {
                    const options = activeDict.graphemes[key];
                    matchFound = true;
                    if (Array.isArray(options)) {
                        promptForChoice(key, options);
                    } else {
                        selectChoice(key, options);
                    }
                    break;
                }
            }
            if (!matchFound) {
                const unprocessedChar = builderState.remainingEnglish[0];
                selectChoice(unprocessedChar, unprocessedChar);
            }
        }

        function promptForChoice(englishChunk, graflectOptions) {
            let finalOptions = [...graflectOptions];
            if (!finalOptions.includes('')) {
                finalOptions.unshift('');
            }
            if (['a', 'e', 'i', 'o', 'u', 'y'].includes(englishChunk)) {
                const prioritized = new Set(finalOptions);
                const remainingFromPool = vowelPool.filter(v => !prioritized.has(v));
                if (remainingFromPool.length > 0) {
                    finalOptions.push('divider', ...remainingFromPool);
                }
            }
            currentSuggestions = finalOptions.map(g => ({
                type: 'chunk',
                english: englishChunk,
                graflect: g,
                slug: g === 'divider' ? '' : convertGraflectToSlug(g)
            }));
            displayChunkSuggestions(currentSuggestions);
            updateBuilderDisplay(englishChunk);
        }

        function selectChoice(englishChunk, graflectChoice) {
            builderState.processedEnglish += englishChunk;
            builderState.graflectResult += graflectChoice;
            builderState.remainingEnglish = builderState.remainingEnglish.substring(englishChunk.length);
            romajiSuggestionsEl.innerHTML = '';
            activeSuggestionIndex = -1;
            currentSuggestions = [];
            setTimeout(processNextChunk, 0);
        }

        function finishWord(originalWord, finalGraflect) {
            const editor = romajiOutputEditorEl;
            const start = builderState.wordStartPosition;
            const end = start + originalWord.length;
            const text = editor.value;
            const newText = text.slice(0, start) + finalGraflect + (builderState.addSpaceOnFinish ? ' ' : '') + text.slice(end);
            editor.value = newText;
            const newCursorPos = start + finalGraflect.length + (builderState.addSpaceOnFinish ? 1 : 0);
            
            const activeDict = getActiveDictionary();
            activeDict.words[originalWord.toLowerCase()] = finalGraflect;
            saveAllDictionaries();
            showNotification(`Saved "${originalWord}" to dictionary.`);
            
            resetBuilder();
            renderOutput(newCursorPos);
        }

        function resetBuilder() {
            builderState = { isActive: false, originalWord: '', wordStartPosition: 0, addSpaceOnFinish: false, processedEnglish: '', graflectResult: '', remainingEnglish: '' };
            imeFloaterEl.classList.add('hidden');
            romajiOutputEditorEl.disabled = false;
            romajiOutputEditorEl.focus();
        }

        function updateBuilderDisplay(promptChunk = '') {
            const processed = builderState.processedEnglish;
            const remaining = builderState.remainingEnglish;
            let promptHtml = '';
            if (promptChunk) {
                promptHtml = `<span class="builder-prompt">${promptChunk}</span>` + remaining.substring(promptChunk.length);
            }
            builderEnglishEl.innerHTML = `<span class="builder-processed">${processed}</span>${promptHtml || remaining}`;
            builderGraflectEl.textContent = builderState.graflectResult;
        }

        function displayChunkSuggestions(suggestions) {
            romajiSuggestionsEl.innerHTML = '';
            if (suggestions.length === 0) {
                imeFloaterEl.classList.add('hidden');
                return;
            }
            suggestions.forEach((s) => {
                const item = document.createElement('div');
                if (s.graflect === 'divider') {
                    item.className = 'suggestion-item divider';
                } else {
                    item.className = 'suggestion-item';
                    item.innerHTML = `<div class="suggestion-content"><span class="graflect-font">${s.graflect || '(silent)'}</span><span class="slug-text">(${s.slug || '...'})</span></div>`;
                    item.addEventListener('click', () => handleSuggestionClick(s));
                    item.addEventListener('mouseover', () => {
                        const allItems = Array.from(romajiSuggestionsEl.children);
                        activeSuggestionIndex = allItems.indexOf(item);
                        updateHighlight();
                    });
                }
                romajiSuggestionsEl.appendChild(item);
            });
            
            const tracker = document.getElementById('cursor-tracker');
            if (tracker) {
                const scrollTop = romajiOutputEditorEl.scrollTop;
                const scrollLeft = romajiOutputEditorEl.scrollLeft;
                imeFloaterEl.style.top = (tracker.offsetTop + tracker.offsetHeight + 5 - scrollTop) + 'px';
                imeFloaterEl.style.left = (tracker.offsetLeft - scrollLeft) + 'px';
                imeFloaterEl.classList.remove('hidden');
            } else {
                console.error("Could not find #cursor-tracker to position the IME floater.");
                resetBuilder(); // Reset if the tracker isn't found, to prevent getting stuck
            }

            activeSuggestionIndex = 0;
            if(romajiSuggestionsEl.children[0] && romajiSuggestionsEl.children[0].classList.contains('divider')) {
                activeSuggestionIndex = 1;
            }
            updateHighlight();
        }

        function updateHighlight() {
            romajiSuggestionsEl.childNodes.forEach((child, index) => {
                child.classList.toggle('active', index === activeSuggestionIndex);
            });
        }
        
        function handleSuggestionClick(suggestion) {
            if (suggestion.type === 'dict') {
                finishWord(suggestion.english, suggestion.graflect);
            } else if (suggestion.type === 'manual') {
                startManualBuilder();
            } else { // chunk
                selectChoice(suggestion.english, suggestion.graflect);
            }
        }

        // --- DICTIONARY MANAGER LOGIC ---
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
                infoDiv.innerHTML = `<span class="name">${dict.name}${index === activeDictionaryIndex ? ' (Active)' : ''}</span><br><span class="author">by ${dict.author}</span>`;
                
                const buttonDiv = document.createElement('div');
                buttonDiv.className = 'dict-btn-group';
                
                const selectBtn = document.createElement('button');
                selectBtn.textContent = 'Select';
                selectBtn.disabled = index === activeDictionaryIndex;
                selectBtn.onclick = () => {
                    activeDictionaryIndex = index;
                    saveAllDictionaries();
                    populateDictionaryManager();
                    showNotification(`"${dict.name}" is now active.`);
                };

                const exportBtn = document.createElement('button');
                exportBtn.textContent = 'Export';
                exportBtn.onclick = () => handleExportClick(index);

                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.onclick = () => openDictionaryEditor(index);

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => {
                    showConfirmation(`Delete "${dict.name}"? This cannot be undone.`, () => {
                        dictionaries.splice(index, 1);
                        if (dictionaries.length === 0) { dictionaries.push(createDefaultDictionary()); }
                        if (activeDictionaryIndex >= index) { activeDictionaryIndex = Math.max(0, activeDictionaryIndex - 1); }
                        saveAllDictionaries();
                        populateDictionaryManager();
                        showNotification(`Deleted "${dict.name}".`);
                    });
                };

                buttonDiv.append(selectBtn, exportBtn, editBtn, deleteBtn);
                li.append(infoDiv, buttonDiv);
                dictionaryListEl.appendChild(li);
            });
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
                newLi.querySelector('.dict-edit-input').focus();
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
                let displayValue = Array.isArray(currentValue) ? `[${currentValue.map(v => `'${v}'`).join(', ')}]` : currentValue;
                textDiv.innerHTML = `<span>${type === 'word' ? currentKey : `"${currentKey}"`}</span> <span class="graflect-font">→ ${displayValue}</span>`;
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                const removeBtn = document.createElement('button');
                removeBtn.textContent = 'Remove';
                buttonDiv.append(editBtn, removeBtn);
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
                keyInput.className = 'dict-edit-input';
                keyInput.value = currentKey;
                keyInput.readOnly = !isNew;
                const valueInput = document.createElement('input');
                valueInput.type = 'text';
                valueInput.className = 'dict-edit-input graflect-font';
                valueInput.value = Array.isArray(currentValue) ? `[${currentValue.map(v => `'${v}'`).join(', ')}]` : currentValue;
                textDiv.append(keyInput, valueInput);
                const saveBtn = document.createElement('button');
                saveBtn.textContent = 'Save';
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = 'Cancel';
                buttonDiv.append(saveBtn, cancelBtn);
                
                saveBtn.onclick = () => {
                    const newKey = keyInput.value.trim().toLowerCase();
                    let newValue = valueInput.value.trim();
                    if (!newKey) { showNotification("Key cannot be empty."); return; }
                    if (newValue.startsWith('[') && newValue.endsWith(']')) {
                        try {
                            newValue = JSON.parse(newValue.replace(/'/g, '"'));
                        } catch(e) { showNotification("Invalid array format."); return; }
                    }
                    if (!isNew && newKey !== currentKey) { delete dataMap[currentKey]; }
                    dataMap[newKey] = newValue;
                    saveAllDictionaries();
                    if (isNew) { type === 'word' ? populateWordList(dictIndex) : populateGraphemeList(dictIndex); } 
                    else { renderDisplayMode(newKey, newValue); }
                    showNotification(`Rule for "${newKey}" saved.`);
                };
                cancelBtn.onclick = () => {
                    if(isNew) { li.remove(); } else { renderDisplayMode(currentKey, currentValue); }
                };
            };

            if (isNew) { renderEditMode('', ''); } else { renderDisplayMode(key, value); }
            li.append(textDiv, buttonDiv);
            return li;
        }
        
        function handleCreateNewDictionary() {
            const name = newDictNameInput.value.trim();
            const author = newDictAuthorInput.value.trim();
            if (!name || !author) {
                showNotification("Name and author are required.");
                return;
            }
            const newDict = createDefaultDictionary();
            newDict.name = name;
            newDict.author = author;
            newDict.words = {};
            dictionaries.push(newDict);
            saveAllDictionaries();
            newDictionaryModal.classList.add('hidden');
            openDictionaryManager();
        }

        function showConfirmation(message, onConfirm) {
            confirmationMessageEl.textContent = message;
            confirmationModal.classList.remove('hidden');
            confirmationCallback = onConfirm;
        }

        // --- IMPORT/EXPORT LOGIC ---
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
                        throw new Error("Invalid format.");
                    }
                    importedDict.graphemes = importedDict.graphemes || { ...defaultGraphemeMap };
                    dictionaries.push(importedDict);
                    saveAllDictionaries();
                    populateDictionaryManager();
                    showNotification(`Dictionary "${importedDict.name}" imported.`);
                } catch (error) {
                    showNotification("Error: " + error.message);
                } finally {
                    importInput.value = '';
                }
            };
            reader.readAsText(file);
        }

        function handleCopy() {
            const plainText = romajiOutputEditorEl.value;
            navigator.clipboard.writeText(plainText).then(() => {
                showNotification('Copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy: ', err);
                showNotification('Copy failed. See console for details.');
            });
        }


        // --- EVENT LISTENERS ---
        document.addEventListener('keydown', (e) => {
            if (builderState.isActive) {
                e.preventDefault();
                e.stopPropagation();
                if (romajiSuggestionsEl.classList.contains('hidden')) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    const direction = e.key === 'ArrowDown' ? 1 : -1;
                    const items = Array.from(romajiSuggestionsEl.children);
                    if(items.length === 0) return;
                    let nextIndex = activeSuggestionIndex;
                    do {
                        nextIndex = (nextIndex + direction + items.length) % items.length;
                    } while (items[nextIndex].classList.contains('divider'));
                    activeSuggestionIndex = nextIndex;
                    updateHighlight();
                } else if (e.key === 'Enter') {
                    if (activeSuggestionIndex > -1) {
                         const selectableSuggestions = currentSuggestions.filter(s => s.graflect !== 'divider');
                         const selectedData = selectableSuggestions[activeSuggestionIndex];
                         if(selectedData) {
                            handleSuggestionClick(selectedData);
                         }
                    }
                } else if (e.key === 'Escape') {
                    resetBuilder();
                    renderOutput(romajiOutputEditorEl.selectionStart);
                }
            }
        }, true);
        
        romajiOutputEditorEl.addEventListener('input', () => renderOutput());
        
        romajiOutputEditorEl.addEventListener('scroll', () => {
            romajiOutputDisplayEl.scrollTop = romajiOutputEditorEl.scrollTop;
            romajiOutputDisplayEl.scrollLeft = romajiOutputEditorEl.scrollLeft;
        });
        
        romajiOutputEditorEl.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                if (builderState.isActive) return;
                const text = romajiOutputEditorEl.value;
                const cursorPos = romajiOutputEditorEl.selectionStart;
                const textBeforeCursor = text.slice(0, cursorPos);
                const lastWordMatch = textBeforeCursor.match(/([a-zA-Z]+)$/);
                if (lastWordMatch) {
                    const word = lastWordMatch[1];
                    const wordStartPos = lastWordMatch.index;
                    startBuilder(word, wordStartPos, e.key === ' ');
                } else {
                    const start = romajiOutputEditorEl.selectionStart;
                    const end = romajiOutputEditorEl.selectionEnd;
                    const insertedChar = e.key === ' ' ? ' ' : '\n';
                    romajiOutputEditorEl.value = text.slice(0, start) + insertedChar + text.slice(end);
                    const newCursorPos = start + 1;
                    renderOutput(newCursorPos);
                }
            }
        });
        
        romajiOutputEditorEl.addEventListener('focus', () => outputContainerEl.classList.add('is-focused'));
        romajiOutputEditorEl.addEventListener('blur', () => outputContainerEl.classList.remove('is-focused'));

        // Modal Listeners
        manageDictBtn.addEventListener('click', openDictionaryManager);
        copyBtn.addEventListener('click', handleCopy);
        document.querySelectorAll('.modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal-overlay');
                modal.classList.add('hidden');
                if(modal.id === 'dictionary-editor-modal' || modal.id === 'new-dictionary-modal' || modal.id === 'confirmation-modal') {
                    openDictionaryManager();
                }
            });
        });
        
        newDictBtn.addEventListener('click', () => {
            dictionaryManagerModal.classList.add('hidden');
            newDictForm.reset();
            newDictionaryModal.classList.remove('hidden');
        });
        saveNewDictBtn.addEventListener('click', handleCreateNewDictionary);
        cancelNewDictBtn.addEventListener('click', () => {
            newDictionaryModal.classList.add('hidden');
            openDictionaryManager();
        });
        
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', handleImportChange);

        wordsTab.addEventListener('click', () => {
            wordsTab.classList.add('active');
            graphemesTab.classList.remove('active');
            wordsEditorContent.classList.remove('hidden');
            graphemesEditorContent.classList.add('hidden');
        });
        graphemesTab.addEventListener('click', () => {
            graphemesTab.classList.add('active');
            wordsTab.classList.remove('active');
            graphemesEditorContent.classList.remove('hidden');
            wordsEditorContent.classList.add('hidden');
        });

        confirmYesBtn.addEventListener('click', () => {
            if (typeof confirmationCallback === 'function') confirmationCallback();
            confirmationModal.classList.add('hidden');
        });
        confirmNoBtn.addEventListener('click', () => confirmationModal.classList.add('hidden'));

        // --- INITIALIZATION ---
        loadDictionaries();
        renderOutput();
    });