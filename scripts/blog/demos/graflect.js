/**
 * /scripts/blog/demos/graflect.js
 * * Contains all the JavaScript logic for the Graflect Transliteration Tool.
 * This script depends on graflect-data.js and dictionary-manager.js being loaded first.
 */
function initializeGraflectTool() {
    // --- DATA MAPPINGS (from graflect-data.js) ---
    // The `slugMap` and `diagnosticParagraph` are still defined here as they are
    // specific to this tool's UI and not part of the core dictionary data.
    const diagnosticParagraph = "I know that he and she will not go, but we can see what they do. So, all people have a time to find their own way. If you look for it, you may also get more than you think. This one man had a good day; his work was about to make a change. These other people came out from the house to use the long road and go down to the water. How did he know? It was the first time they had been over there. I will give him a call now.";

    // --- DOM ELEMENTS ---
    const inputEl = document.getElementById('english-input');
    const outputEl = document.getElementById('output');
    const transliterateBtn = document.getElementById('transliterate-btn');
    const diagnosticBtn = document.getElementById('diagnostic-btn');
    const activeDictNameEl = document.getElementById('active-dict-name');
    const showSlugCheckbox = document.getElementById('show-slug-checkbox');
    
    // Prompt Area
    const promptAreaEl = document.getElementById('prompt-area');
    const promptHeadingEl = promptAreaEl.querySelector('#prompt-heading');
    const promptInstructionEl = promptAreaEl.querySelector('#prompt-instruction');
    const promptButtonsEl = promptAreaEl.querySelector('#prompt-buttons-container');
    const rememberCheckbox = promptAreaEl.querySelector('#remember-choice-checkbox');
    const promptWordCheckboxEl = document.getElementById('prompt-word-for-checkbox');
    const directGraflectInput = document.getElementById('direct-graflect-input');
    const useDirectInputBtn = document.getElementById('use-direct-input-btn');

    // --- DICTIONARY MANAGER SETUP ---
    const dictionaryManager = new DictionaryManager({
        localStorageKey: 'graflectDictionaries',
        domElements: {
            notificationBannerEl: document.getElementById('notification-banner'),
            dictionaryManagerModal: document.getElementById('dictionary-manager-modal'),
            dictionaryEditorModal: document.getElementById('dictionary-editor-modal'),
            confirmationModal: document.getElementById('confirmation-modal'),
            newDictionaryModal: document.getElementById('new-dictionary-modal'),
            manageDictBtn: document.getElementById('manage-dict-btn'),
            closeModalManagerBtn: document.getElementById('close-manager-btn'),
            newDictBtn: document.getElementById('new-dict-btn'),
            importInput: document.getElementById('import-input'),
            closeEditorBtn: document.getElementById('close-editor-btn'),
            wordsTab: document.getElementById('words-tab'),
            graphemesTab: document.getElementById('graphemes-tab'),
            addGraphemeBtn: document.getElementById('add-grapheme-btn'),
            closeNewDictBtn: document.getElementById('close-new-dict-btn'),
            cancelNewDictBtn: document.getElementById('cancel-new-dict-btn'),
            saveNewDictBtn: document.getElementById('save-new-dict-btn'),
            confirmYesBtn: document.getElementById('confirm-yes-btn'),
            confirmNoBtn: document.getElementById('confirm-no-btn'),
            dictionaryListEl: document.getElementById('dictionary-list'),
            dictionaryEditorTitleEl: document.getElementById('dictionary-editor-title'),
            wordsEditorContent: document.getElementById('words-editor-content'),
            graphemesEditorContent: document.getElementById('graphemes-editor-content'),
            wordListEl: document.getElementById('word-list'),
            graphemeListEl: document.getElementById('grapheme-list'),
            newDictNameInput: document.getElementById('new-dict-name-input'),
            newDictAuthorInput: document.getElementById('new-dict-author-input'),
            confirmationMessageEl: document.getElementById('confirmation-message'),
        },
        onActiveDictionaryChange: (activeDict) => {
            if (activeDict && activeDictNameEl) {
                activeDictNameEl.textContent = activeDict.name;
            }
        }
    });

    // --- STATE ---
    let currentResolve;
    let lastRawOutput = '';

    // --- TRANSLITERATION LOGIC ---

    function convertGraflectToSlug(graflectText) {
        let slugText = '';
        // Uses the global slugMap from graflect-data.js
        for (const char of graflectText) {
            slugText += slugMap[char] || char;
        }
        return slugText;
    }

    function renderOutput() {
        if (!lastRawOutput) {
            outputEl.innerHTML = '';
            return;
        }
        if (showSlugCheckbox.checked) {
            const parts = lastRawOutput.split(/(\s+|[.,!?;:"()'-]|\d+)/g);
            let htmlOutput = '';
            for (const part of parts) {
                 if (!part) continue;
                 if (part.match(/(\s+|[.,!?;:"()'-]|\d+)/)) {
                    htmlOutput += part;
                 } else {
                    const slugWord = convertGraflectToSlug(part);
                    htmlOutput += `<ruby>${part}<rt>${slugWord}</rt></ruby>`;
                 }
            }
            outputEl.innerHTML = htmlOutput;
        } else {
            outputEl.textContent = lastRawOutput;
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
        const activeDict = dictionaryManager.getActiveDictionary();

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
            dictionaryManager.saveWord(lowerWord, finalGraflect);
        }
        return finalGraflect;
    }

    async function handleTransliterateClick() {
        transliterateBtn.disabled = true;
        transliterateBtn.textContent = "Processing...";
        outputEl.innerHTML = '';
        lastRawOutput = '';

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
            outputEl.textContent = rawOutput;
        }
        
        lastRawOutput = rawOutput;
        renderOutput();

        transliterateBtn.disabled = false;
        transliterateBtn.textContent = "Transliterate";
    }
    
    function handleDiagnosticClick() {
        inputEl.value = diagnosticParagraph;
    }

    // --- EVENT LISTENERS ---
    transliterateBtn?.addEventListener('click', handleTransliterateClick);
    diagnosticBtn?.addEventListener('click', handleDiagnosticClick);
    showSlugCheckbox?.addEventListener('change', renderOutput);
    
    // --- INITIALIZATION ---
    dictionaryManager.init();
}

document.addEventListener('modulesLoaded', initializeGraflectTool);
