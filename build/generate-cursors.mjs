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
    // Yod-like: index finger extended, the other fingers retracted into the fist.
    pointer: { hot: [10, 2], fallback: 'pointer', svg: (k, h) =>
        `<path d='M10,2 c-0.83,0 -1.5,0.67 -1.5,1.5 V12.2 l-1.7,-2 c-0.5,-0.6 -1.45,-0.68 -2.05,-0.15 c-0.58,0.52 -0.64,1.4 -0.16,2 L6.7,18.7 c0.92,1.5 2.55,2.4 4.3,2.4 H14.2 c2.5,0 4.3,-2 4.3,-4.5 V11.6 c0,-0.66 -0.54,-1.2 -1.2,-1.2 c-0.2,0 -0.38,0.05 -0.55,0.13 c-0.06,-0.6 -0.57,-1.07 -1.18,-1.07 c-0.24,0 -0.46,0.07 -0.64,0.2 c-0.1,-0.55 -0.58,-0.97 -1.16,-0.97 c-0.22,0 -0.42,0.06 -0.6,0.16 V3.5 C11.5,2.67 10.83,2 10,2 Z' fill='${k}' stroke='${h}' stroke-width='0.9' stroke-linejoin='round'/>` },
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

async function main() {
    const css = await fs.readFile(CSS, 'utf8');

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

    const apply = `/* Apply the themed cursors by role (leaving the other ~30 native
   cursor types to the browser). */
html, body { cursor: var(--cur-default); }
a, button, summary, label, select, .normal-btn, .close-btn, [role="button"],
input[type="checkbox"], input[type="radio"], input[type="range"],
input[type="submit"], input[type="button"], .radio-label { cursor: var(--cur-pointer); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]),
textarea, [contenteditable="true"] { cursor: var(--cur-text); }
.title-bar { cursor: var(--cur-move); }
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
