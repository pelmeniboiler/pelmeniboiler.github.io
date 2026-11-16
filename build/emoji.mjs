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
//   4. styles/emoji/coverage.json lists every codepoint our stack can draw;
//      styles/emoji/stack.json lists them per font, in stack order, for the
//      emoji viewer (tools/emojiviewer.html).
//   5. emojifySourceFiles() swaps emoji in the hand-written pages and modules
//      too (in the staged copy under /_site, never in the sources), so no page ever paints an emoji as text and the emoji
//      FONTS are never downloaded just to draw an icon.
//
// Outputs are generated (gitignored); `npm run build` writes them.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as fontkit from 'fontkit';
import { JSDOM } from 'jsdom';

// CSS family name of each STACK entry (styles/pelmeni2025.css, --font-emoji).
export const FAMILIES = [
    'SymbolaNoRI', 'Noto EmojiNoRI', 'Android EmojiNoRI', 'TwitterBWEmoji',
    'Noto Sans Symbols 2 Gaps', 'Noto Sans Math Gaps', 'Unifont Gaps', 'Unifont Upper Gaps',
];
export const STACK = [
    'Symbola-ModifiedNoRI.ttf',
    'NotoEmoji-Regular-NoRI.ttf',
    'AndroidEmojiNoRI.ttf',
    'TwitterBWEmoji.woff2',
    // Gap fillers: subset to only what the fonts above lack (build/fonts.py).
    'NotoSansSymbols2-Gaps.woff2',
    'NotoSansMath-Gaps.woff2',
    'Unifont-Gaps.woff2',
    'UnifontUpper-Gaps.woff2',
];
const OUT_DIR = 'styles/emoji';
const SCAN_EXT = /\.(html|json|js|mjs)$/;
const SKIP_DIRS = new Set(['_site', 'node_modules', '.git', '.github', 'img', 'test', 'emoji', 'fonts', 'photos', 'sounds']);

// Besides Unicode's own emoji we also take every other symbol from U+2190 up
// (arrows, geometric shapes, dingbats, music, 🗀 🖻 🙾 …: categories So and Sm,
// plus the ornamental brackets ❨–❵, which Unicode files under punctuation).
// The site uses those as icons just as much, and any one of them left as text
// makes the browser download the whole emoji font stack to find its glyph.
// One emoji "cluster": flag pair | keycap | pictograph (+VS) (+skin tone) (ZWJ pictograph…)*
export const EMOJI_RE = /\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}[︎️]?\p{EMod}?(?:‍\p{Extended_Pictographic}[︎️]?\p{EMod}?)*|(?![\u0000-\u218F])[\p{So}\p{Sm}\u2768-\u2775][\uFE0E\uFE0F]?/gu;
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

// Some glyphs are drawn for poster size: Symbola's world map 🗺 is 1,468
// path commands of coastline, 22 KB of the sprite, to be shown at 16–40 px.
// For heavy glyphs only, the outline is simplified: curves are flattened,
// each contour is reduced with Douglas–Peucker to within 0.35% of the em
// (about a tenth of a pixel at 32 px), and contours smaller than 1.2% of the
// em are dropped. It is the same drawing with fewer points. Light glyphs are
// left exactly as the font has them.
const HEAVY_COMMANDS = 300;
function simplifyHeavy(d, upm) {
    if ((d.match(/[MLQCZ]/g) || []).length < HEAVY_COMMANDS) return d;
    const tol = upm * 0.0035, minSize = upm * 0.012;
    const toks = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g) || [];
    const contours = []; let cur = null, i = 0, pos = [0, 0];
    const num = () => Number(toks[i++]);
    while (i < toks.length) {
        const c = toks[i++];
        if (c === 'M') { cur = [[num(), num()]]; contours.push(cur); pos = cur[0]; }
        else if (c === 'L') { pos = [num(), num()]; cur.push(pos); }
        else if (c === 'Q') { const [x1, y1, x, y] = [num(), num(), num(), num()], p0 = pos; for (let t = 1; t <= 4; t++) { const u = t / 4, v = 1 - u; cur.push([v * v * p0[0] + 2 * v * u * x1 + u * u * x, v * v * p0[1] + 2 * v * u * y1 + u * u * y]); } pos = [x, y]; }
        else if (c === 'C') { const [x1, y1, x2, y2, x, y] = [num(), num(), num(), num(), num(), num()], p0 = pos; for (let t = 1; t <= 6; t++) { const u = t / 6, v = 1 - u; cur.push([v * v * v * p0[0] + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x, v * v * v * p0[1] + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y]); } pos = [x, y]; }
        // Z: contours are closed when written out
    }
    const dp = (pts) => {
        if (pts.length < 3) return pts;
        const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
        const stack = [[0, pts.length - 1]];
        while (stack.length) {
            const [a, b] = stack.pop(); let worst = 0, at = -1;
            const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
            for (let k = a + 1; k < b; k++) { const dist = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / len; if (dist > worst) { worst = dist; at = k; } }
            if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
        }
        return pts.filter((_, k) => keep[k]);
    };
    let out = '';
    for (const pts of contours) {
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        if (Math.max(...xs) - Math.min(...xs) < minSize && Math.max(...ys) - Math.min(...ys) < minSize) continue;
        // Split the closed contour at its farthest point so Douglas–Peucker has two real ends.
        let far = 0, fd = -1; for (let k = 1; k < pts.length; k++) { const dd = Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]); if (dd > fd) { fd = dd; far = k; } }
        const s = [...dp(pts.slice(0, far + 1)), ...dp(pts.slice(far)).slice(1)].map(([x, y]) => [Math.round(x), Math.round(y)]);
        if (s.length < 3) continue;
        out += `M${s[0][0]} ${s[0][1]}`;
        // Relative line-tos: small numbers, and "-" doubles as the separator.
        let seg = 'l';
        for (let k = 1; k < s.length; k++) { const dx = s[k][0] - s[k - 1][0], dy = s[k][1] - s[k - 1][1]; if (!dx && !dy) continue; seg += `${seg.length > 1 && dx >= 0 ? ' ' : ''}${dx}${dy >= 0 ? ' ' : ''}${dy}`; }
        out += `${seg}z`;
    }
    return out;
}

export async function buildEmoji(rootDir, { log = console.log, scanRoot = rootDir } = {}) {
    const fonts = STACK.map((f) => fontkit.openSync(path.join(rootDir, 'styles/fonts', f)));

    // 1. Collect sequences used anywhere in the site's sources.
    const keys = new Set();
    for (const file of await walk(scanRoot)) {
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
            symbols.push(`<symbol id="${id}" viewBox="0 ${-asc} ${adv} ${asc - desc}" overflow="visible"><path transform="scale(1,-1)" d="${simplifyHeavy(compactPath(g.path.toSVG()), upm)}"/></symbol>`);
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

    // 5. The stack itself, font by font (first = highest priority), for the
    //    emoji viewer: it shows which fonts could draw a character and which
    //    one wins.
    const toRanges = (set) => {
        const out = [];
        for (const cp of [...set].sort((a, b) => a - b)) {
            const last = out[out.length - 1];
            if (last && cp === last[1] + 1) last[1] = cp; else out.push([cp, cp]);
        }
        return out;
    };
    const stack = fonts.map((f, i) => ({
        family: FAMILIES[i],
        name: STACK[i].replace(/\.(ttf|woff2)$/, ''),
        ranges: toRanges(new Set(f.characterSet.filter((cp) => cp >= 0x2000 && f.glyphForCodePoint(cp).id !== 0))),
    }));
    await fs.writeFile(path.join(rootDir, OUT_DIR, 'stack.json'), JSON.stringify(stack));

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

// --- Hand-written pages (the staged copy in /_site) ------------------------

const escText = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const emojiHtml = (sprite, [id, w, h, va], text) =>
    `<span class="emoji"><svg aria-hidden="true" focusable="false" style="width:${w}em;height:${h}em;vertical-align:${va}em"><use href="${sprite}#${id}"></use></svg><span class="emoji-t">${escText(text)}</span></span>`;

/**
 * Like emojifyDocument(), but on an HTML source string, replacing only the
 * text runs that hold emoji and leaving every other byte alone. Also points
 * already-converted emoji at the current sprite version. Idempotent.
 */
export function emojifySource(html, map) {
    const fresh = html.replace(/\/styles\/emoji\/sprite\.svg(?:\?v=[0-9a-f]+)?#/g, `${map.sprite}#`);
    const dom = new JSDOM(fresh, { includeNodeLocations: true });
    const doc = dom.window.document;
    const win = dom.window;
    if (!doc.body) return { html: fresh, added: 0 };
    const test = new RegExp(EMOJI_RE.source, 'u');
    const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT);
    const edits = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!test.test(node.data)) continue;
        let skip = false;
        for (let el = node.parentElement; el; el = el.parentElement) {
            if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.classList.contains('emoji') || el.classList.contains('no-emoji')) { skip = true; break; }
        }
        if (skip) continue;
        const loc = dom.nodeLocation(node);
        // Entities (&amp; …) make source offsets and text offsets disagree;
        // leave such runs to scripts/emoji.js at runtime.
        if (!loc || fresh.slice(loc.startOffset, loc.endOffset) !== node.data) continue;
        const text = node.data;
        let out = '';
        let last = 0;
        for (const m of text.matchAll(EMOJI_RE)) {
            const parts = glyphsFor(m[0], map.glyphs);
            if (!parts) continue;
            out += text.slice(last, m.index);
            for (const p of parts) out += typeof p === 'string' ? p : emojiHtml(map.sprite, p.g, p.text);
            last = m.index + m[0].length;
        }
        if (last === 0) continue;
        out += text.slice(last);
        edits.push([loc.startOffset, loc.endOffset, out]);
    }
    edits.sort((a, b) => b[0] - a[0]);
    let res = fresh;
    for (const [s, e, t] of edits) res = res.slice(0, s) + t + res.slice(e);
    return { html: res, added: edits.length };
}

const SOURCE_DIRS = ['.', 'modules', 'modules/blog/demos', 'tools', 'screensaver', 'inprogress'];

export async function emojifySourceFiles(rootDir, map, { log = console.log } = {}) {
    let files = 0;
    for (const dir of SOURCE_DIRS) {
        let names;
        try { names = await fs.readdir(path.join(rootDir, dir)); } catch { continue; }
        for (const name of names.filter((n) => n.endsWith('.html')).sort()) {
            const file = path.join(rootDir, dir, name);
            const src = await fs.readFile(file, 'utf8');
            if (src.includes('FOLDER-INDEX')) continue; // generated by build.mjs
            const res = emojifySource(src, map);
            if (res.html === src) continue;
            await fs.writeFile(file, res.html);
            files += 1;
        }
    }
    log(`  → ${files ? `inlined emoji in ${files} hand-written page(s)` : 'nothing to inline'}.`);
    return files;
}

// --- Per-page sprites -------------------------------------------------------
//
// sprite.svg holds every glyph the whole site uses; a page draws a few dozen.
// So once all pages are built, each is pointed at just what it needs:
//
//   core-<hash>.svg   glyphs visible on at least half the pages (the tray,
//                     title bars). One download, cached for every other page.
//   set-<hash>.svg    the rest of what this page shows on arrival. Pages with
//                     the same set (an article's language versions) share it.
//   lazy-<hash>.svg   glyphs that only appear inside windows that start
//                     closed — settings, the key list, the clock (title bars
//                     aside: the tray shows those). Their <use>
//                     carries data-href instead of href, so nothing is fetched
//                     until scripts/start-menu.js sees the window open.
//
// The full sprite stays: scripts/emoji.js falls back to it for a glyph that
// only turns up at runtime.
export async function splitSprites(rootDir, { log = console.log } = {}) {
    const dir = path.join(rootDir, OUT_DIR);
    const full = await fs.readFile(path.join(dir, 'sprite.svg'), 'utf8');
    const symbols = new Map([...full.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)].map((m) => [m[1], m[0]]));
    const REF = /(data-)?href=(\\?")\/styles\/emoji\/sprite\.svg(?:\?v=[0-9a-f]+)?#(e[0-9a-f-]+)/g;

    // Park the references inside windows that start closed.
    const park = (html) => {
        if (!html.includes('init-closed')) return html;
        const whole = /<html[\s>]/i.test(html);
        const dom = new JSDOM(whole ? html : `<!DOCTYPE html><body>${html}</body>`);
        // (Not the title bar's: the tray and start menu show a closed window's
        // title icon from the start.)
        const uses = [...dom.window.document.querySelectorAll('.window.init-closed use[href*="/styles/emoji/"]')].filter((u) => !u.closest('.title-bar'));
        if (!uses.length) return html;
        uses.forEach((u) => { u.setAttribute('data-href', u.getAttribute('href')); u.removeAttribute('href'); });
        return whole ? dom.serialize() : dom.window.document.body.innerHTML;
    };

    const pages = [];
    const walk = async (d) => {
        for (const ent of await fs.readdir(d, { withFileTypes: true })) {
            const p = path.join(d, ent.name);
            if (ent.isDirectory()) { if (!['img', 'photos', 'styles', 'scripts', 'sounds', 'logo'].includes(ent.name)) await walk(p); continue; }
            // (+ the screensaver's window titles, which live in a JSON file)
            if (!ent.name.endsWith('.html') && ent.name !== 'photos.json') continue;
            const html = ent.name.endsWith('.html') ? park(await fs.readFile(p, 'utf8')) : await fs.readFile(p, 'utf8');
            const eager = new Set(), lazy = new Set();
            for (const m of html.matchAll(REF)) if (symbols.has(m[3])) (m[1] ? lazy : eager).add(m[3]);
            if (eager.size || lazy.size) pages.push({ file: p, html, eager, lazy });
        }
    };
    await walk(rootDir);
    if (!pages.length) return;

    const count = new Map();
    for (const pg of pages) for (const id of pg.eager) count.set(id, (count.get(id) || 0) + 1);
    const core = new Set([...count].filter(([, n]) => n * 2 >= pages.length).map(([id]) => id));

    const written = new Map(); // file name → bytes
    const write = async (prefix, ids) => {
        const body = [...ids].sort().map((id) => symbols.get(id)).join('\n');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg">\n${body}\n</svg>\n`;
        const name = `${prefix}-${crypto.createHash('sha1').update(svg).digest('hex').slice(0, 8)}.svg`;
        if (!written.has(name)) { await fs.writeFile(path.join(dir, name), svg); written.set(name, svg.length); }
        return `/${OUT_DIR}/${name}`;
    };
    const coreUrl = core.size ? await write('core', core) : null;
    for (const pg of pages) {
        const extra = [...pg.eager].filter((id) => !core.has(id));
        const later = [...pg.lazy].filter((id) => !core.has(id) && !pg.eager.has(id));
        const setUrl = extra.length ? await write('set', extra) : null;
        const lazyUrl = later.length ? await write('lazy', later) : null;
        await fs.writeFile(pg.file, pg.html.replace(REF, (m, data, q, id) => (!symbols.has(id) ? m
            : `${data || ''}href=${q}${core.has(id) ? coreUrl : pg.eager.has(id) ? setUrl : lazyUrl}#${id}`)));
    }
    const kb = (n) => (n / 1024).toFixed(0);
    const of = (p) => [...written].filter(([n]) => n.startsWith(p));
    const avg = (list) => kb(list.reduce((a, [, n]) => a + n, 0) / (list.length || 1));
    log(`  → ${pages.length} pages: core ${core.size} glyphs (${kb(of('core-')[0]?.[1] || 0)} KB), ${of('set-').length} page set(s) ~${avg(of('set-'))} KB, ` +
        `${of('lazy-').length} lazy set(s) ~${avg(of('lazy-'))} KB; full sprite ${kb(full.length)} KB.`);
}
