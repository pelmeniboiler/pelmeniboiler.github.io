// build/generate-icons.mjs
// One-time (rerunnable) generator for the PWA icons and per-theme manifests.
// Rasterizes the שЖ monogram via headless-Chromium canvas — no image library.
// Run `npm run icons` after changing theme colours in the CSS, then commit the
// regenerated logo/icons/*.png and manifest-*.json.
//
// Requires the playwright devDependency. CHROMIUM_PATH overrides the binary.

import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Theme palette, mirroring styles/pelmeni2025.css. For techelet/zelyonny/akai
// the favicon convention is inverted (border-colour tile, bg-colour glyph),
// matching updateFavicon() in settings.js. funky is random per visit, so it
// keeps the default manifest.
const THEMES = {
    light:      { tile: '#ffffff', glyph: '#000000', bg: '#ffffff' },
    dark:       { tile: '#000000', glyph: '#ffffff', bg: '#000000' },
    champagne:  { tile: '#F7E7CE', glyph: '#4A403A', bg: '#F7E7CE' },
    bubblegum:  { tile: '#FBCFF3', glyph: '#A62675', bg: '#FBCFF3' },
    techelet:   { tile: '#4169E1', glyph: '#E6E6FA', bg: '#E6E6FA' },
    zelyonny:   { tile: '#3C763D', glyph: '#DFF0D8', bg: '#DFF0D8' },
    akai:       { tile: '#C62828', glyph: '#FFEBEE', bg: '#FFEBEE' },
    rindswurst: { tile: '#F5E6E0', glyph: '#5D4037', bg: '#F5E6E0' },
    tapuz:      { tile: '#E8590C', glyph: '#FFF3E0', bg: '#FFF3E0' },
};

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await (await browser.newContext()).newPage();

const svgText = await fs.readFile(path.join(ROOT, 'logo/shzh.svg'), 'utf-8');
await page.setContent('<!DOCTYPE html><body></body>');

const makeIcons = await page.evaluate(async ({ svgText, themes }) => {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    svg.querySelectorAll('style').forEach((s) => s.remove());
    const paths = svg.querySelectorAll('path');

    const out = {};
    for (const [name, { tile, glyph }] of Object.entries(themes)) {
        paths.forEach((p) => { p.removeAttribute('class'); p.setAttribute('fill', glyph); });
        const uri = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        const img = new Image();
        await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = uri; });
        const draw = (size, padFrac) => {
            const c = document.createElement('canvas'); c.width = c.height = size;
            const x = c.getContext('2d');
            x.fillStyle = tile; x.fillRect(0, 0, size, size);
            const pad = Math.round(size * padFrac);
            x.drawImage(img, pad, pad, size - 2 * pad, size - 2 * pad);
            return c.toDataURL('image/png');
        };
        out[name] = { i192: draw(192, 0.08), i512: draw(512, 0.08), mask: draw(512, 0.22) };
    }
    return out;
}, { svgText, themes: THEMES });

await fs.mkdir(path.join(ROOT, 'logo/icons'), { recursive: true });
for (const [theme, icons] of Object.entries(makeIcons)) {
    for (const [key, file] of [['i192', `${theme}-192.png`], ['i512', `${theme}-512.png`], ['mask', `${theme}-mask-512.png`]]) {
        await fs.writeFile(path.join(ROOT, 'logo/icons', file), Buffer.from(icons[key].split(',')[1], 'base64'));
    }
    const manifest = {
        name: 'Pelmeniboiler',
        short_name: 'Pelmeniboiler',
        description: 'Neat stuff I like. Keyboards, language, photos, projects.',
        start_url: '/', scope: '/', display: 'standalone',
        background_color: THEMES[theme].bg,
        theme_color: THEMES[theme].tile,
        icons: [
            { src: `/logo/icons/${theme}-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `/logo/icons/${theme}-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `/logo/icons/${theme}-mask-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
    await fs.writeFile(path.join(ROOT, `manifest-${theme}.json`), JSON.stringify(manifest, null, 4) + '\n');
}

console.log(`Generated ${Object.keys(makeIcons).length} theme icon sets + manifests.`);
await browser.close();
