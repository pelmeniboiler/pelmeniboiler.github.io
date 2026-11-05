// build/emoji.mjs — our emoji, as inline SVG, everywhere.
//
// Browsers decide for themselves how to draw emoji: a character followed by
// U+FE0F, or any emoji outside a .symbol span (the body font stack has no
// emoji fonts), gets the OS colour font — Apple Color Emoji, Segoe UI Emoji —
// whatever the stylesheet says. So, like Twemoji, we take the decision away:
//
//   1. Scan the site's sources for emoji sequences (Extended_Pictographic,
//      with VS16 / ZWJ / skin-tone / keycap / flag sequences).
//   2. For each, take the glyph from the FIRST font in our --font-emoji stack
//      that has it (Symbola → Noto Emoji → Android Emoji → Twemoji B&W; ZWJ
//      sequences must be a single ligature glyph) and write its outline into
//      one SVG sprite: styles/emoji/sprite.svg (fill: currentColor, so every
//      theme and e-ink mode colour it).
//   3. styles/emoji/map.json maps each sequence (VS16/VS15 stripped) to its
//      sprite id and font metrics. scripts/emoji.js uses it at runtime (all
//      pages with site chrome); emojifyDocument() below does the same to the
//      generated pages at build time, so no-JS readers get it too.
//   4. styles/emoji/coverage.json lists every codepoint our stack can draw,
//      for the emoji viewer.
//
// Outputs are generated (gitignored); `npm run build` writes them.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as fontkit from 'fontkit';

export const STACK = [
    'Symbola-ModifiedNoRI.ttf',
    'NotoEmoji-Regular-NoRI.ttf',
    'AndroidEmojiNoRI.ttf',
    'TwitterBWEmoji.woff2',
];
const OUT_DIR = 'styles/emoji';
const SCAN_EXT = /\.(html|json|js|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'img', 'test', 'emoji', 'fonts', 'photos', 'sounds']);

// One emoji "cluster": flag pair | keycap | pictograph (+VS) (+skin tone) (ZWJ pictograph…)*
export const EMOJI_RE = /\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}[︎️]?\p{EMod}?(?:‍\p{Extended_Pictographic}[︎️]?\p{EMod}?)*/gu;
// Pictographic by Unicode's reckoning, but plain typography on this site.
const NOT_EMOJI = new Set(['©', '®', '™']);
export const keyOf = (seq) => seq.replace(/[︎️]/g, '');

async function walk(dir, out = []) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p, out);
        else if (SCAN_EXT.test(e.name)) out.push(p);
    }
    return out;
}

const idFor = (key) => 'e' + [...key].map((c) => c.codePointAt(0).toString(16)).join('-');
const r3 = (n) => Math.round(n * 1000) / 1000;
// Whole font units are far below a pixel at text size; rounding (and dropping
// the spaces SVG doesn't need) roughly halves the sprite.
const compactPath = (d) => d
    .replace(/-?\d*\.\d+/g, (n) => String(Math.round(parseFloat(n))))
    .replace(/ ?([MLQCZ]) ?/g, '$1')
    .replace(/ -/g, '-');

export async function buildEmoji(rootDir, { log = console.log } = {}) {
    const fonts = STACK.map((f) => fontkit.openSync(path.join(rootDir, 'styles/fonts', f)));

    // 1. Collect sequences used anywhere in the site's sources.
    const keys = new Set();
    for (const file of await walk(rootDir)) {
        const text = await fs.readFile(file, 'utf8');
        for (const m of text.matchAll(EMOJI_RE)) {
            const key = keyOf(m[0]);
            if (!key || NOT_EMOJI.has(key)) continue;
            keys.add(key);
            // Components too, as a fallback when no font ligates the sequence.
            if ([...key].length > 1) {
                for (const c of key) if (/\p{Extended_Pictographic}/u.test(c) && !NOT_EMOJI.has(c)) keys.add(c);
            }
        }
    }

    // 2. First font in the stack that draws the whole key as one glyph.
    const symbols = [];
    const glyphs = {};
    const missing = [];
    for (const key of [...keys].sort()) {
        let done = false;
        for (const font of fonts) {
            let run;
            try { run = font.layout(key); } catch { continue; }
            if (run.glyphs.length !== 1 || run.glyphs[0].id === 0) continue;
            const g = run.glyphs[0];
            const upm = font.unitsPerEm, asc = font.ascent, desc = font.descent; // desc < 0
            const adv = g.advanceWidth || upm;
            const id = idFor(key);
            symbols.push(`<symbol id="${id}" viewBox="0 ${-asc} ${adv} ${asc - desc}" overflow="visible"><path transform="scale(1,-1)" d="${compactPath(g.path.toSVG())}"/></symbol>`);
            glyphs[key] = [id, r3(adv / upm), r3((asc - desc) / upm), r3(desc / upm)];
            done = true;
            break;
        }
        if (!done) missing.push(key);
    }

    const sprite = `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
    const hash = crypto.createHash('sha1').update(sprite).digest('hex').slice(0, 8);
    await fs.mkdir(path.join(rootDir, OUT_DIR), { recursive: true });
    await fs.writeFile(path.join(rootDir, OUT_DIR, 'sprite.svg'), sprite);
    const map = { sprite: `/${OUT_DIR}/sprite.svg?v=${hash}`, glyphs };
    await fs.writeFile(path.join(rootDir, OUT_DIR, 'map.json'), JSON.stringify(map));

    // 4. Coverage ranges for the emoji viewer.
    const cps = new Set();
    for (const f of fonts) for (const cp of f.characterSet) cps.add(cp);
    const sorted = [...cps].sort((a, b) => a - b);
    const ranges = [];
    for (const cp of sorted) {
        const last = ranges[ranges.length - 1];
        if (last && cp === last[1] + 1) last[1] = cp; else ranges.push([cp, cp]);
    }
    await fs.writeFile(path.join(rootDir, OUT_DIR, 'coverage.json'), JSON.stringify(ranges));

    log(`  → ${Object.keys(glyphs).length} emoji as SVG (${(sprite.length / 1024).toFixed(0)} KB sprite)` +
        (missing.length ? `; not in our fonts, left as text: ${missing.join(' ')}` : ''));
    return map;
}

// --- Build-time replacement (mirrors scripts/emoji.js) ---------------------

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'TITLE', 'CODE', 'PRE', 'SVG', 'NOSCRIPT']);

/** Swap emoji text in `doc` for <svg><use> from the sprite. Idempotent. */
export function emojifyDocument(doc, map) {
    if (!map || !doc.body) return 0;
    const win = doc.defaultView;
    const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            for (let el = node.parentElement; el; el = el.parentElement) {
                if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.classList.contains('emoji') || el.classList.contains('no-emoji')) {
                    return win.NodeFilter.FILTER_REJECT;
                }
            }
            // Non-global twin: a /g regex's lastIndex would make the matchAll()
            // below start after the first emoji.
            return new RegExp(EMOJI_RE.source, 'u').test(node.data) ? win.NodeFilter.FILTER_ACCEPT : win.NodeFilter.FILTER_SKIP;
        },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let n = 0;
    for (const node of nodes) {
        const frag = doc.createDocumentFragment();
        let last = 0;
        const text = node.data;
        for (const m of text.matchAll(EMOJI_RE)) {
            const parts = glyphsFor(m[0], map.glyphs);
            if (!parts) continue;
            if (m.index > last) frag.append(text.slice(last, m.index));
            for (const p of parts) {
                if (typeof p === 'string') { frag.append(p); continue; }
                frag.append(emojiElement(doc, map.sprite, p.g, p.text));
                n++;
            }
            last = m.index + m[0].length;
        }
        if (last === 0) continue;
        if (last < text.length) frag.append(text.slice(last));
        node.replaceWith(frag);
    }
    return n;
}

/** A sequence → [{g, text}] (whole ligature) or per-component, or null. */
export function glyphsFor(seq, glyphs) {
    const key = keyOf(seq);
    if (glyphs[key]) return [{ g: glyphs[key], text: seq }];
    const comps = [...key].filter((c) => c !== '‍');
    if (comps.length > 1 && comps.every((c) => glyphs[c] || !/\p{Extended_Pictographic}/u.test(c))) {
        return comps.map((c) => (glyphs[c] ? { g: glyphs[c], text: c } : c));
    }
    return null;
}

export function emojiElement(doc, sprite, [id, w, h, va], text) {
    const SVG = 'http://www.w3.org/2000/svg';
    const wrap = doc.createElement('span');
    wrap.className = 'emoji';
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('style', `width:${w}em;height:${h}em;vertical-align:${va}em`);
    const use = doc.createElementNS(SVG, 'use');
    use.setAttribute('href', `${sprite}#${id}`);
    svg.append(use);
    // The character itself stays in the text (clipped from view) so copy,
    // search, screen readers and textContent all still see it.
    const t = doc.createElement('span');
    t.className = 'emoji-t';
    t.textContent = text;
    wrap.append(svg, t);
    return wrap;
}
