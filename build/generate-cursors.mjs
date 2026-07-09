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
// The author's pointing-hand design (viewBox 0 0 1080 1080; the hand's bbox is
// ~222,235 → 702,893). We crop to that bbox in the cursor and add a bg-colour
// halo under the text-colour fill (never a hardcoded #000 — the "black svg" bug).
const P_HAND = "m690.8 603.9l-49 201.1h-288.8v-265h93.29zm-291.27-287.01c-26.18 0-45.98-19.07-45.98-38.77 0-19.7 20.52-43.12 46.7-43.12 26.18 0 46.54 23.84 46.54 43.54 0 19.7-21.08 38.35-47.26 38.35zm47.34-39.38v262.49h-93.75v-262.49zm45.66 259.38c-26.18 0-45.98-19.07-45.98-38.77 0-19.7 20.53-43.12 46.71-43.12 26.18 0 46.53 23.84 46.53 43.54 0 19.7-21.08 38.35-47.26 38.35zm47.34-39.38v262.49h-93.74v-262.49zm46.65 56.38c-26.18 0-48.35-15.73-48.35-35.42 0-19.7 22.9-46.47 49.08-46.47 26.18 0 46.54 23.84 46.54 43.54 0 19.7-21.09 38.35-47.27 38.35zm47.35-39.38v262.49l-96.17-0.41c0 0-4.28-260.97-0.71-262.06zm29.75 85.54c-21.22 0-37.27-17.94-37.27-36.48 0-18.54 16.64-40.57 37.86-40.57 21.22 0 37.73 22.43 37.73 40.97 0 18.53-17.09 36.08-38.32 36.08zm38.38-37.05l-62.02 249.27h-76l62.02-249.27zm-60 239v91h-290v-91zm-353.17-232.19c-24.83 12.77-52.91 4.34-62.53-14.34-9.61-18.69-1.57-50.92 23.27-63.69 24.83-12.78 55.78-0.09 65.39 18.59 9.61 18.69-1.3 46.66-26.13 59.44zm25.7-60.45l128.06 249-88.93 45.73-128.06-248.99z";

// hotspot [x,y] is where the click actually lands. vb/w/h default to a 24×24 box.
const SHAPES = {
    default: { hot: [3, 2], fallback: 'auto', svg: (k, h) =>
        `<path d='M3,2 L3,20 L8,15.5 L11.5,22.5 L14.3,21.2 L10.9,14.6 L17,14.5 Z' fill='${k}' stroke='${h}' stroke-width='1.1' stroke-linejoin='round'/>` },
    // The author's pointing hand, cropped to its bbox, ink fill over a bg halo.
    pointer: { hot: [9, 2], fallback: 'pointer', vb: '176 188 572 752', w: 24, h: 32, svg: (k, h) =>
        `<path d='${P_HAND}' fill='${h}' stroke='${h}' stroke-width='58' stroke-linejoin='round'/><path d='${P_HAND}' fill='${k}'/>` },
    text: { hot: [12, 12], fallback: 'text', svg: (k, h) =>
        `<path d='M8,3 H16 M8,21 H16 M12,3 V21' stroke='${h}' stroke-width='3.4' fill='none' stroke-linecap='round'/><path d='M8,3 H16 M8,21 H16 M12,3 V21' stroke='${k}' stroke-width='1.5' fill='none' stroke-linecap='round'/>` },
    move: { hot: [12, 12], fallback: 'move', svg: (k, h) =>
        `<path d='M12,2 l3,3 h-2 v5 h5 v-2 l3,3 l-3,3 v-2 h-5 v5 h2 l-3,3 l-3,-3 h2 v-5 h-5 v2 l-3,-3 l3,-3 v2 h5 v-5 h-2 z' fill='${k}' stroke='${h}' stroke-width='1.1' stroke-linejoin='round'/>` },
    // Arrow plus the two-rectangle "copy" glyph.
    copy: { hot: [2, 1], fallback: 'copy', svg: (k, h) =>
        `<path d='M2,1 L2,13 L5.5,10 L8,15 L9.8,14.2 L7.3,9.3 L11.5,9.2 Z' fill='${k}' stroke='${h}' stroke-width='1' stroke-linejoin='round'/><rect x='13' y='13' width='8' height='9' rx='1.3' fill='${h}' stroke='${k}' stroke-width='1.3'/><rect x='11' y='11' width='8' height='9' rx='1.3' fill='${h}' stroke='${k}' stroke-width='1.3'/>` },
};

const uri = (name, ink, halo) => {
    const { hot, fallback, svg, vb = '0 0 24 24', w = 24, h = 24 } = SHAPES[name];
    const doc = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='${vb}'>${svg(ink, halo)}</svg>`;
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
        [':root.moroz-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.plastilin-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.win98-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.glass-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.y2k-mode', '--theme-text-color', '--theme-bg-color'],
        [':root.wordart-mode', '--theme-text-color', '--theme-bg-color'],
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
