// build/css-split.mjs — one small stylesheet per theme.
//
// styles/pelmeni2025.css is written as a single file, which is the right way
// to edit it. But a visitor uses one theme at a time, and most of the file is
// the others: fifteen themes' baked cursors and the gimmick themes' rules.
// Measured, a page used 9% of it.
//
// So in the built site, every top-level rule whose selectors ALL belong to one
// of the themes below is moved to styles/themes/<theme>-<hash>.css. What stays
// is what every visitor needs: the layout, light, dark and e-ink.
// scripts/theme-loader.js links the active theme's file (after the base sheet,
// so the cascade is unchanged); scripts/settings.js links one on a switch.
//
// Only top-level style rules move. Anything inside @media / @supports stays.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SPLIT_THEMES = ['funky', 'zikit', 'champagne', 'bubblegum', 'techelet', 'zelyonny', 'akai',
    'rindswurst', 'tapuz', 'moroz', 'plastilin', 'win98', 'glass', 'y2k', 'wordart'];

/** Split CSS text into top-level chunks: { text, prelude } (prelude = selector or at-rule head). */
function topLevel(css) {
    const out = [];
    let i = 0, start = 0, depth = 0, preludeEnd = -1;
    const n = css.length;
    while (i < n) {
        const c = css[i];
        if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
        if (c === '"' || c === "'") { i++; while (i < n && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
        if (c === '{') { if (depth === 0) preludeEnd = i; depth++; }
        else if (c === '}') { depth--; if (depth === 0) { out.push({ text: css.slice(start, i + 1), prelude: css.slice(start, preludeEnd) }); start = i + 1; } }
        else if (c === ';' && depth === 0) { out.push({ text: css.slice(start, i + 1), prelude: null }); start = i + 1; } // @import / @charset
        i++;
    }
    if (start < n) out.push({ text: css.slice(start), prelude: null });
    return out;
}

/** Split a selector list on its top-level commas. */
function selectors(prelude) {
    const out = []; let depth = 0, cur = '';
    for (const c of prelude) {
        if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
        if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
}

export function splitCss(css) {
    const themeOf = (sel) => { const m = sel.match(/\.([a-z0-9]+)-mode\b/g) || []; const hits = [...new Set(m.map((x) => x.slice(1, -5)).filter((t) => SPLIT_THEMES.includes(t)))]; return hits.length === 1 ? hits[0] : null; };
    const base = [], themes = {};
    for (const chunk of topLevel(css)) {
        // Strip leading comments to look at the real prelude; they travel with the rule.
        const prelude = chunk.prelude == null ? null : chunk.prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        let theme = null;
        if (prelude && !prelude.startsWith('@')) {
            const ts = selectors(prelude).map(themeOf);
            if (ts.length && ts.every((t) => t && t === ts[0])) theme = ts[0];
        }
        if (theme) (themes[theme] ||= []).push(chunk.text.trim()); else base.push(chunk.text);
    }
    return { base: base.join(''), themes: Object.fromEntries(Object.entries(themes).map(([t, rules]) => [t, `${rules.join('\n')}\n`])) };
}

/** Split the built stylesheet in place; returns { theme: url }. */
export async function splitThemeCss(rootDir, { log = console.log } = {}) {
    const file = path.join(rootDir, 'styles', 'pelmeni2025.css');
    const css = await fs.readFile(file, 'utf8');
    const { base, themes } = splitCss(css);
    const dir = path.join(rootDir, 'styles', 'themes');
    await fs.mkdir(dir, { recursive: true });
    const map = {};
    for (const [theme, text] of Object.entries(themes)) {
        // url(...) in the stylesheet is relative to /styles/; these live one level down.
        const fixed = text.replace(/url\((['"]?)(?!data:|\/|https?:)/g, 'url($1../');
        const name = `${theme}-${crypto.createHash('sha1').update(fixed).digest('hex').slice(0, 8)}.css`;
        await fs.writeFile(path.join(dir, name), fixed);
        map[theme] = `/styles/themes/${name}`;
    }
    await fs.writeFile(file, base);
    const kb = (n) => (n / 1024).toFixed(0);
    log(`  → base ${kb(css.length)} KB → ${kb(base.length)} KB; ${Object.keys(map).length} theme files, ${kb(Object.values(themes).reduce((a, t) => a + t.length, 0) / Object.keys(map).length)} KB each on average.`);
    return map;
}
