/**
 * /scripts/blog/demos/romaji.js
 * * Contains all the JavaScript logic for the Romaji IME tool.
 * This script is designed to be loaded as part of a module. It initializes
 * itself by listening for the 'modulesLoaded' custom event.
 * * This script depends on graflect-data.js and dictionary-manager.js being loaded first.
 */
function initializeRomajiIME() {
    // --- VALIDATION ---
    // Note: The 'vowelPool' variable is expected to be defined in 'graflect-data.js'.
    if (typeof DictionaryManager === 'undefined' || typeof slugMap === 'undefined' || typeof vowelPool === 'undefined') {
        console.error("Romaji IME requires graflect-data.js (including 'vowelPool') and dictionary-manager.js to be loaded first.");
        return;
    }

    // --- DOM ELEMENTS ---
    const romajiModuleEl = document.getElementById('romaji-ime-module');
    if (!romajiModuleEl) {
        // If the module's HTML isn't on the page, don't try to run the script.
        return; 
    }
    const outputContainerEl = romajiModuleEl.querySelector('#output-container');
    const imeFloaterEl = romajiModuleEl.querySelector('#ime-floater');
    const romajiSuggestionsEl = romajiModuleEl.querySelector('#suggestions-dropdown');
    const romajiOutputDisplayEl = romajiModuleEl.querySelector('#romaji-output-display');
    const romajiOutputEditorEl = romajiModuleEl.querySelector('#romaji-output-editor');
    const builderEnglishEl = romajiModuleEl.querySelector('#builder-english');
    const builderGraflectEl = romajiModuleEl.querySelector('#builder-graflect');
    const copyBtn = romajiModuleEl.querySelector('#copy-btn');

    // --- DICTIONARY MANAGER SETUP ---
    // Note: We are scoping the DOM element search within the romajiModuleEl to avoid conflicts.
    const dictionaryManager = new DictionaryManager({
        localStorageKey: 'graflectDictionaries',
        domElements: {
            notificationBannerEl: romajiModuleEl.querySelector('#notification-banner'),
            dictionaryManagerModal: romajiModuleEl.querySelector('#dictionary-manager-modal'),
            dictionaryEditorModal: romajiModuleEl.querySelector('#dictionary-editor-modal'),
            confirmationModal: romajiModuleEl.querySelector('#confirmation-modal'),
            newDictionaryModal: romajiModuleEl.querySelector('#new-dictionary-modal'),
            manageDictBtn: romajiModuleEl.querySelector('#manage-dict-btn'),
            closeModalManagerBtn: romajiModuleEl.querySelector('#dictionary-manager-modal .modal-close-btn'),
            newDictBtn: romajiModuleEl.querySelector('#new-dict-btn'),
            importInput: romajiModuleEl.querySelector('#import-input'),
            importBtn: romajiModuleEl.querySelector('#import-btn'),
            closeEditorBtn: romajiModuleEl.querySelector('#dictionary-editor-modal .modal-close-btn'),
            wordsTab: romajiModuleEl.querySelector('#words-tab'),
            graphemesTab: romajiModuleEl.querySelector('#graphemes-tab'),
            addGraphemeBtn: romajiModuleEl.querySelector('#add-grapheme-btn'),
            closeNewDictBtn: romajiModuleEl.querySelector('#new-dictionary-modal .modal-close-btn'),
            cancelNewDictBtn: romajiModuleEl.querySelector('#cancel-new-dict-btn'),
            saveNewDictBtn: romajiModuleEl.querySelector('#save-new-dict-btn'),
            confirmYesBtn: romajiModuleEl.querySelector('#confirm-yes-btn'),
            confirmNoBtn: romajiModuleEl.querySelector('#confirm-no-btn'),
            dictionaryListEl: romajiModuleEl.querySelector('#dictionary-list'),
            dictionaryEditorTitleEl: romajiModuleEl.querySelector('#dictionary-editor-title'),
            wordsEditorContent: romajiModuleEl.querySelector('#words-editor-content'),
            graphemesEditorContent: romajiModuleEl.querySelector('#graphemes-editor-content'),
            wordListEl: romajiModuleEl.querySelector('#word-list'),
            graphemeListEl: romajiModuleEl.querySelector('#grapheme-list'),
            newDictNameInput: romajiModuleEl.querySelector('#new-dict-name-input'),
            newDictAuthorInput: romajiModuleEl.querySelector('#new-dict-author-input'),
            confirmationMessageEl: romajiModuleEl.querySelector('#confirmation-message'),
        }
    });

    // --- STATE ---
    let activeSuggestionIndex = -1;
    let currentSuggestions = [];
    let builderState = { isActive: false, originalWord: '', wordStartPosition: 0, addSpaceOnFinish: false, processedEnglish: '', graflectResult: '', remainingEnglish: '' };

    // --- FUNCTIONS ---
    function convertGraflectToSlug(graflectText) {
        let slugText = '';
        for (const char of graflectText) {
            slugText += slugMap[char] || char;
        }
        return slugText;
    }

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
        const activeDict = dictionaryManager.getActiveDictionary();
        if (!activeDict) { return; }
        romajiOutputEditorEl.disabled = true;
        builderState = { 
            isActive: true, 
            originalWord: word, 
            wordStartPosition: position, 
            addSpaceOnFinish: addSpaceOnFinish,
            processedEnglish: '',
            graflectResult: '',
            remainingEnglish: word.toLowerCase()
        };
        renderOutput();
        const lowerWord = word.toLowerCase();
        if (activeDict.words[lowerWord]) {
            promptWithDictOption(word, activeDict.words[lowerWord]);
        } else {
            startManualBuilder();
        }
    }
    
    function startManualBuilder() {
        processNextChunk();
    }

    function promptWithDictOption(word, dictGraflect) {
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
        const activeDict = dictionaryManager.getActiveDictionary();
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
        dictionaryManager.saveWord(originalWord, finalGraflect);
        dictionaryManager._showNotification(`Saved "${originalWord}" to dictionary.`);
        resetBuilder();
        renderOutput(newCursorPos);
    }

    function resetBuilder() {
        builderState.isActive = false;
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
        suggestions.forEach((s, index) => {
            const item = document.createElement('div');
            if (s.graflect === 'divider') {
                item.className = 'suggestion-item divider';
            } else {
                item.className = 'suggestion-item';
                item.innerHTML = `<div class="suggestion-content"><span class="graflect-font">${s.graflect || '(silent)'}</span><span class="slug-text">(${s.slug || '...'})</span></div>`;
                item.addEventListener('click', () => handleSuggestionClick(s));
                item.addEventListener('mouseover', () => {
                    // The index from the forEach loop corresponds to the full `currentSuggestions` array
                    activeSuggestionIndex = index;
                    updateHighlight();
                });
            }
            romajiSuggestionsEl.appendChild(item);
        });
        const tracker = document.getElementById('cursor-tracker');
        if (tracker) {
            imeFloaterEl.style.top = (tracker.offsetTop + tracker.offsetHeight + 5 - romajiOutputEditorEl.scrollTop) + 'px';
            imeFloaterEl.style.left = (tracker.offsetLeft - romajiOutputEditorEl.scrollLeft) + 'px';
            imeFloaterEl.classList.remove('hidden');
        } else {
            resetBuilder();
        }
        activeSuggestionIndex = 0;
        if(romajiSuggestionsEl.children[0]?.classList.contains('divider')) {
            activeSuggestionIndex = 1;
        }
        updateHighlight();
    }

    function updateHighlight() {
        romajiSuggestionsEl.childNodes.forEach((child, index) => {
            const isActive = index === activeSuggestionIndex;
            child.classList.toggle('active', isActive);
            if (isActive) {
                // When an item is highlighted, scroll it into view if it's not visible.
                // This ensures the user can always see the currently selected item.
                child.scrollIntoView({ block: 'nearest' });
            }
        });
    }
    
    function handleSuggestionClick(suggestion) {
        if (suggestion.type === 'dict') {
            finishWord(suggestion.english, suggestion.graflect);
        } else if (suggestion.type === 'manual') {
            startManualBuilder();
        } else {
            selectChoice(suggestion.english, suggestion.graflect);
        }
    }

    function handleCopy() {
        // Using document.execCommand as a fallback for broader compatibility in restricted environments like iframes.
        const textarea = document.createElement('textarea');
        textarea.value = romajiOutputEditorEl.value;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            dictionaryManager._showNotification('Copied to clipboard!');
        } catch (err) {
            dictionaryManager._showNotification('Copy failed. See console for details.');
            console.error('Clipboard copy failed:', err);
        }
        document.body.removeChild(textarea);
    }

    // --- EVENT LISTENERS ---
    document.addEventListener('keydown', (e) => {
        if (builderState.isActive) {
            // We are capturing these events to control the suggestion dropdown.
            // Stop the event from propagating to other listeners or the browser default action.
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const direction = e.key === 'ArrowDown' ? 1 : -1;
                const items = Array.from(romajiSuggestionsEl.children);
                if(items.length === 0) return;

                // Find the next non-divider item to highlight
                let nextIndex = activeSuggestionIndex;
                do {
                    nextIndex = (nextIndex + direction + items.length) % items.length;
                } while (items[nextIndex].classList.contains('divider'));
                
                activeSuggestionIndex = nextIndex;
                updateHighlight();

            } else if (e.key === 'Enter') {
                if (activeSuggestionIndex > -1) {
                     // --- BUG FIX ---
                     // The bug was here. The original code filtered `currentSuggestions` before selecting
                     // an item, which created a new array. This caused `activeSuggestionIndex` (which is
                     // the index for the *original* array) to point to the wrong item if a divider
                     // was present.
                     // The fix is to use `activeSuggestionIndex` on the original `currentSuggestions` array.
                     const selectedData = currentSuggestions[activeSuggestionIndex];

                     // The arrow key logic already prevents the active index from landing on a divider,
                     // but this check is a good safety measure.
                     if (selectedData && selectedData.graflect !== 'divider') {
                        handleSuggestionClick(selectedData);
                     }
                }
            } else if (e.key === 'Escape') {
                resetBuilder();
                renderOutput(romajiOutputEditorEl.selectionStart);
            }
        }
    }, true); // Use capture phase to ensure this runs before other listeners.
    
    romajiOutputEditorEl.addEventListener('input', () => renderOutput());
    romajiOutputEditorEl.addEventListener('scroll', () => {
        // Sync the scroll position of the display and the editor
        romajiOutputDisplayEl.scrollTop = romajiOutputEditorEl.scrollTop;
        romajiOutputDisplayEl.scrollLeft = romajiOutputEditorEl.scrollLeft;
    });
    
    romajiOutputEditorEl.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            if (builderState.isActive) return; // Don't trigger if the builder is active
            
            e.preventDefault(); // Prevent default space/enter behavior
            const text = romajiOutputEditorEl.value;
            const cursorPos = romajiOutputEditorEl.selectionStart;
            const textBeforeCursor = text.slice(0, cursorPos);
            
            // Find the last sequence of English letters before the cursor
            const lastWordMatch = textBeforeCursor.match(/([a-zA-Z]+)$/);

            if (lastWordMatch) {
                // If a word is found, start the builder for it
                startBuilder(lastWordMatch[1], lastWordMatch.index, e.key === ' ');
            } else {
                // If no word is found, just insert a space or newline
                const start = romajiOutputEditorEl.selectionStart;
                const end = romajiOutputEditorEl.selectionEnd;
                romajiOutputEditorEl.value = text.slice(0, start) + (e.key === ' ' ? ' ' : '\n') + text.slice(end);
                renderOutput(start + 1);
            }
        }
    });
    
    romajiOutputEditorEl.addEventListener('focus', () => outputContainerEl.classList.add('is-focused'));
    romajiOutputEditorEl.addEventListener('blur', () => {
        outputContainerEl.classList.remove('is-focused');
        // If the user clicks away, reset the builder
        if (builderState.isActive) {
            resetBuilder();
            renderOutput();
        }
    });

    copyBtn.addEventListener('click', handleCopy);

    // --- INITIALIZATION ---
    dictionaryManager.init();
    renderOutput();
}

// Add the event listener to automatically initialize the tool when the parent page signals it's ready.
document.addEventListener('modulesLoaded', initializeRomajiIME);
