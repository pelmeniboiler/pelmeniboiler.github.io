// /scripts/emoji.js — draw emoji with OUR glyphs, never the OS colour font.
//
// build/emoji.mjs extracts every emoji the site uses from our font stack
// (Symbola → Noto Emoji → Android Emoji → Twemoji B&W) into one SVG sprite
// plus a map. This swaps emoji text for <svg><use> into that sprite — on
// load and whenever content changes (translations, blog list, tray, …). The
// glyphs are fill: currentColor, so themes and e-ink colour them like text.
// The character stays in the DOM, clipped from view, for copy, search,
// screen readers and textContent. Build-generated pages already arrive
// converted, so no-JS readers get the same glyphs.
(function () {
    const RE = /\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}[︎️]?\p{EMod}?(?:‍\p{Extended_Pictographic}[︎️]?\p{EMod}?)*|(?![\u0000-\u218F])[\p{So}\p{Sm}\u2768-\u2775][\uFE0E\uFE0F]?/gu;
    // Non-global twin for quick tests: a /g regex's lastIndex would make the
    // following matchAll() start after the first emoji.
    const HAS = new RegExp(RE.source, 'u');
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'TITLE', 'CODE', 'PRE', 'svg', 'SVG', 'NOSCRIPT']);
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let map = null;
    // glyph id → sprite file already referenced by this page (build/emoji.mjs splitSprites).
    const local = new Map();
    const learn = () => document.querySelectorAll('.emoji use').forEach((u) => { const [file, id] = (u.getAttribute('href') || '').split('#'); if (id && !local.has(id)) local.set(id, file); });

    const keyOf = (s) => s.replace(/[︎️]/g, '');
    function glyphsFor(seq) {
        const key = keyOf(seq);
        if (map.glyphs[key]) return [{ g: map.glyphs[key], text: seq }];
        const comps = [...key].filter((c) => c !== '‍');
        if (comps.length > 1 && comps.every((c) => map.glyphs[c] || !/\p{Extended_Pictographic}/u.test(c))) {
            return comps.map((c) => (map.glyphs[c] ? { g: map.glyphs[c], text: c } : c));
        }
        return null;
    }
    function element([id, w, h, va], text) {
        const wrap = document.createElement('span');
        wrap.className = 'emoji';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('style', `width:${w}em;height:${h}em;vertical-align:${va}em`);
        const use = document.createElementNS(SVG_NS, 'use');
        // The page's own (small) sprite files if they already hold this glyph;
        // the full sprite only for one that first turns up at runtime.
        use.setAttribute('href', `${local.get(id) || map.sprite}#${id}`);
        svg.append(use);
        const t = document.createElement('span');
        t.className = 'emoji-t';
        t.textContent = text;
        wrap.append(svg, t);
        return wrap;
    }
    function skipped(node) {
        for (let el = node.parentElement; el; el = el.parentElement) {
            if (SKIP.has(el.tagName) || el.isContentEditable) return true;
            if (el.classList.contains('emoji') || el.classList.contains('no-emoji')) return true;
        }
        return false;
    }
    function convertText(node) {
        const text = node.data;
        if (!HAS.test(text) || skipped(node)) return;
        const frag = document.createDocumentFragment();
        let last = 0;
        for (const m of text.matchAll(RE)) {
            const parts = glyphsFor(m[0]);
            if (!parts) continue;
            if (m.index > last) frag.append(text.slice(last, m.index));
            for (const p of parts) frag.append(typeof p === 'string' ? p : element(p.g, p.text));
            last = m.index + m[0].length;
        }
        if (last === 0) return;
        if (last < text.length) frag.append(text.slice(last));
        node.replaceWith(frag);
    }
    function convert(root) {
        if (!root) return;
        if (root.nodeType === Node.TEXT_NODE) { convertText(root); return; }
        if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(convertText);
    }

    async function start() {
        try {
            const res = await fetch('/styles/emoji/map.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.status);
            map = await res.json();
        } catch (_) {
            // Offline without a cached map: text emoji it is. Lift the CSS
            // hold on symbols so the emoji fonts draw them.
            document.documentElement.classList.remove('emoji-pending');
            return;
        }
        learn();
        convert(document.body);
        // Translations, the blog list, the tray etc. rewrite content later.
        let pending = new Set();
        const flush = () => { const batch = pending; pending = new Set(); batch.forEach(convert); };
        new MutationObserver((records) => {
            for (const r of records) {
                if (r.type === 'characterData') pending.add(r.target);
                else r.addedNodes.forEach((n) => pending.add(n));
            }
            queueMicrotask(flush);
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
        // Synchronous entry point for scripts that insert text and want it
        // drawn before the next layout (the observer above runs a tick later).
        window.pbEmoji = { convert };
        document.documentElement.classList.add('emoji-svg');
        document.documentElement.classList.remove('emoji-pending');
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
