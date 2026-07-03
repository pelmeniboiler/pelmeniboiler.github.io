// build/generate-cursors.mjs
// Generate the site's custom SVG cursor set, tinted to each theme's text colour
// (with a bg-colour halo so they stay legible on any background). Cursor url()s
// can't read CSS variables, so we bake one data-URI per theme and expose them as
// --cur-* custom properties; the element rules just reference those.
//
// Output is injected into styles/pelmeni2025.css between the CURSORS markers, so
// it rides the file's existing ?v= hash. Re-run (npm run cursors) if the theme
// palette or a shape changes.  Usage:  npm run cursors

import { promises as fs } from 'node:fs';
import path from 'node:path';

const CSS = path.join(process.cwd(), 'styles/pelmeni2025.css');

// --- Cursor shapes (24×24). Each is a function of (ink, halo) colours. ---------
// hotspot [x,y] is where the click actually lands.
const SHAPES = {
    default: { hot: [3, 2], fallback: 'auto', svg: (k, h) =>
        `<path d='M3,2 L3,20 L8,15.5 L11.5,22.5 L14.3,21.2 L10.9,14.6 L17,14.5 Z' fill='${k}' stroke='${h}' stroke-width='1.1' stroke-linejoin='round'/>` },
    // Yod-like: one long index finger, the rest retracted into a rounded fist
    // (composed from a fist, a finger and a thumb; a halo silhouette underneath).
    pointer: { hot: [10, 2], fallback: 'pointer', svg: (k, h) => {
        const parts = "<rect x='5.6' y='10.5' width='12.6' height='11' rx='3.6'/>"
            + "<rect x='8.2' y='2' width='3.4' height='11' rx='1.7'/>"
            + "<rect x='3.6' y='12' width='4.2' height='3.1' rx='1.55'/>";
        return `<g fill='${h}' stroke='${h}' stroke-width='2.2' stroke-linejoin='round'>${parts}</g><g fill='${k}'>${parts}</g>`;
    } },
    text: { hot: [12, 12], fallback: 'text', svg: (k, h) =>
        `<path d='M8,3 H16 M8,21 H16 M12,3 V21' stroke='${h}' stroke-width='3.4' fill='none' stroke-linecap='round'/><path d='M8,3 H16 M8,21 H16 M12,3 V21' stroke='${k}' stroke-width='1.5' fill='none' stroke-linecap='round'/>` },
    move: { hot: [12, 12], fallback: 'move', svg: (k, h) =>
        `<path d='M12,2 l3,3 h-2 v5 h5 v-2 l3,3 l-3,3 v-2 h-5 v5 h2 l-3,3 l-3,-3 h2 v-5 h-5 v2 l-3,-3 l3,-3 v2 h5 v-5 h-2 z' fill='${k}' stroke='${h}' stroke-width='1.1' stroke-linejoin='round'/>` },
    // Arrow plus the two-rectangle "copy" glyph.
    copy: { hot: [2, 1], fallback: 'copy', svg: (k, h) =>
        `<path d='M2,1 L2,13 L5.5,10 L8,15 L9.8,14.2 L7.3,9.3 L11.5,9.2 Z' fill='${k}' stroke='${h}' stroke-width='1' stroke-linejoin='round'/><rect x='13' y='13' width='8' height='9' rx='1.3' fill='${h}' stroke='${k}' stroke-width='1.3'/><rect x='11' y='11' width='8' height='9' rx='1.3' fill='${h}' stroke='${k}' stroke-width='1.3'/>` },
};

const uri = (name, ink, halo) => {
    const { hot, fallback, svg } = SHAPES[name];
    const doc = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${svg(ink, halo)}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(doc)}") ${hot[0]} ${hot[1]}, ${fallback}`;
};

const vars = (ink, halo) => Object.keys(SHAPES).map((n) => `    --cur-${n}: ${uri(n, ink, halo)};`).join('\n');

// Pull (text, bg) for a theme from a `:root...` block by its custom properties.
function colours(css, selector, textProp, bgProp) {
    const block = css.match(new RegExp(`${selector.replace(/[.*]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    if (!block) return null;
    const get = (p) => (block[1].match(new RegExp(`${p}\\s*:\\s*([^;]+);`)) || [])[1]?.trim();
    const text = get(textProp), bg = get(bgProp);
    return (text && bg) ? { text, bg } : null;
}

// Route every existing `cursor: <keyword>` through the themed variables, so
// class rules keep their specificity but pick up the custom cursor. Idempotent
// (already-var'd declarations don't match), and safe: it only touches actual
// `cursor:` declarations, never the --cur-* definitions or the ", pointer" fallbacks.
const varifyKeywords = (s) => s.replace(/cursor:\s*(pointer|default|move|text)\b/g, 'cursor: var(--cur-$1)');

async function main() {
    let css = varifyKeywords(await fs.readFile(CSS, 'utf8'));

    // Apply the same conversion to the other stylesheets (they share :root's vars).
    for (const rel of ['styles/article.css', 'styles/blog/demos/graflect/romaji.css']) {
        const fp = path.join(process.cwd(), rel);
        try {
            const before = await fs.readFile(fp, 'utf8');
            const after = varifyKeywords(before);
            if (after !== before) { await fs.writeFile(fp, after); console.log(`  ↻ var-ified cursors in ${rel}`); }
        } catch (_) { /* file optional */ }
    }

    // Which selector carries which theme's colours. funky is random per visit —
    // it just inherits the base cursor.
    const themes = [
        [':root', '--text-color', '--bg-color'],
        [':root.dark-mode', '--text-color', '--bg-color'],
        [':root.champagne-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.bubblegum-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.techelet-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.zelyonny-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.akai-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.rindswurst-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.tapuz-mode', '--theme-text-color', '--theme-bg-color'],
    ];

    const blocks = [];
    for (const [sel, tp, bp] of themes) {
        const c = colours(css, sel, tp, bp);
        if (!c) { console.warn(`  (skipped ${sel}: colours not found)`); continue; }
        blocks.push(`${sel} {\n${vars(c.text, c.bg)}\n}`);
    }

    // Base rules for elements that carry no explicit cursor of their own. The
    // existing keyword rules (cursor: pointer/default/move) are separately
    // rewritten to var(--cur-*) below, so THEY win at their own specificity —
    // this just covers plain <a>/<button>/text/inputs. The other ~30 native
    // cursor types are left to the browser.
    const apply = `html, body { cursor: var(--cur-default); }
a, button, summary, label, select, [role="button"],
input[type="checkbox"], input[type="radio"], input[type="range"],
input[type="submit"], input[type="button"] { cursor: var(--cur-pointer); }
p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, td, th, code, pre,
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]),
textarea, [contenteditable="true"] { cursor: var(--cur-text); }
.share-btn, #copy-btn { cursor: var(--cur-copy); }`;

    const generated = `/*CURSORS:START — generated by build/generate-cursors.mjs; do not edit by hand */\n${blocks.join('\n')}\n${apply}\n/*CURSORS:END*/`;

    let out;
    if (/\/\*CURSORS:START[\s\S]*?CURSORS:END\*\//.test(css)) {
        out = css.replace(/\/\*CURSORS:START[\s\S]*?CURSORS:END\*\//, generated);
    } else {
        out = `${css.replace(/\s*$/, '')}\n\n${generated}\n`;
    }
    await fs.writeFile(CSS, out);
    console.log(`✅ Generated cursors for ${blocks.length} themes → styles/pelmeni2025.css`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
