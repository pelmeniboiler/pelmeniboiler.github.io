// build/images.mjs — responsive + pre-dithered variants of every photo.
//
//   npm run images        (also runs as part of `npm run build`)
//
// For each PNG/JPEG under /photos/ this writes, into the gitignored /img/ tree:
//   <name>-<w>.avif / <name>-<w>.webp   at 800 px and 1600 px wide (never upscaled)
//   <name>-eink.png                     1-bit Floyd–Steinberg dither, ≤1400 px wide
//
// The e-ink dither is the same algorithm (same luminance weights, same error
// kernel, same 1400 px cap) scripts/eink-dither.js used to run on a <canvas> in
// the reader's browser — now done once at build time instead of on every page
// view, on the slowest devices that visit the site.
//
// Outputs are cached by content hash: an image is only re-encoded when its
// source bytes change (CI restores /img/ from actions/cache between runs).
// The returned manifest is used by build.mjs to rewrite <img> into <picture>.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import sharp from 'sharp';

export const WIDTHS = [800, 1600];
export const EINK_MAX_W = 1400;
const SOURCE_DIR = 'photos';
const OUT_DIR = 'img';
const CACHE_FILE = 'manifest.json';

async function walk(dir, out = []) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p, out);
        else if (/\.(png|jpe?g)$/i.test(e.name)) out.push(p);
    }
    return out;
}

/** Floyd–Steinberg to 1-bit, identical to the old runtime canvas version. */
export function ditherLuminance(rgba, w, h) {
    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; p < w * h; i += 4, p++) {
        lum[p] = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = y * w + x;
            const old = lum[p];
            const val = old < 128 ? 0 : 255;
            const err = old - val;
            lum[p] = val;
            if (x + 1 < w) lum[p + 1] += err * 7 / 16;
            if (y + 1 < h) {
                if (x > 0) lum[p + w - 1] += err * 3 / 16;
                lum[p + w] += err * 5 / 16;
                if (x + 1 < w) lum[p + w + 1] += err * 1 / 16;
            }
        }
    }
    const out = Buffer.alloc(w * h);
    for (let p = 0; p < w * h; p++) out[p] = lum[p];
    return out;
}

async function writeEink(src, dest, width) {
    const w = Math.min(width, EINK_MAX_W);
    const { data, info } = await sharp(src).resize({ width: w }).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    const bw = ditherLuminance(data, info.width, info.height);
    let hasAlpha = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { hasAlpha = true; break; }
    if (hasAlpha) {
        // Keep transparency: grey+alpha, greys are already pure 0/255.
        const ga = Buffer.alloc(info.width * info.height * 2);
        for (let p = 0; p < info.width * info.height; p++) { ga[2 * p] = bw[p]; ga[2 * p + 1] = data[4 * p + 3]; }
        await sharp(ga, { raw: { width: info.width, height: info.height, channels: 2 } })
            .png({ compressionLevel: 9 }).toFile(dest);
    } else {
        await sharp(bw, { raw: { width: info.width, height: info.height, channels: 1 } })
            .png({ palette: true, colours: 2, bitdepth: 1, dither: 0, compressionLevel: 9 }).toFile(dest);
    }
}

const urlOf = (rootDir, file) => '/' + path.relative(rootDir, file).split(path.sep).join('/');

export async function processImages(rootDir, { log = console.log } = {}) {
    const outRoot = path.join(rootDir, OUT_DIR);
    await fs.mkdir(outRoot, { recursive: true });
    const cachePath = path.join(outRoot, CACHE_FILE);
    let cache = {};
    try { cache = JSON.parse(await fs.readFile(cachePath, 'utf8')); } catch { /* first run */ }

    const manifest = {};
    let encoded = 0;
    const sources = await walk(path.join(rootDir, SOURCE_DIR));
    async function one(src) {
        const url = urlOf(rootDir, src);
        // Content hash, not mtime: a fresh CI checkout resets every mtime.
        const stamp = crypto.createHash('sha1').update(await fs.readFile(src)).digest('hex').slice(0, 16);
        const rel = path.relative(rootDir, src);
        const base = path.join(outRoot, rel.replace(/\.[^.]+$/, ''));
        const prev = cache[url];

        const outputsExist = async (entry) => {
            for (const v of [...entry.avif, ...entry.webp, [entry.eink]]) {
                try { await fs.access(path.join(rootDir, decodeURI(v[0] ?? v))); } catch { return false; }
            }
            return true;
        };
        if (prev && prev.stamp === stamp && await outputsExist(prev)) { manifest[url] = prev; return; }

        const meta = await sharp(src).metadata();
        const widths = [...new Set(WIDTHS.map((w) => Math.min(w, meta.width)))];
        await fs.mkdir(path.dirname(base), { recursive: true });
        const entry = { stamp, width: meta.width, height: meta.height, avif: [], webp: [], eink: '' };
        for (const w of widths) {
            const resized = sharp(src).resize({ width: w });
            await resized.clone().avif({ quality: 55, effort: 4 }).toFile(`${base}-${w}.avif`);
            await resized.clone().webp({ quality: 80 }).toFile(`${base}-${w}.webp`);
            entry.avif.push([urlOf(rootDir, `${base}-${w}.avif`), w]);
            entry.webp.push([urlOf(rootDir, `${base}-${w}.webp`), w]);
        }
        await writeEink(src, `${base}-eink.png`, meta.width);
        entry.eink = urlOf(rootDir, `${base}-eink.png`);
        manifest[url] = entry;
        encoded++;
    }
    // Small worker pool: AVIF encoding is mostly single-threaded per image.
    const queue = [...sources];
    const workers = Array.from({ length: Math.max(1, Math.min(os.cpus().length, 6)) }, async () => {
        while (queue.length) await one(queue.shift());
    });
    await Promise.all(workers);
    // Stable key order so the cache file doesn't churn.
    const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
    for (const k of Object.keys(manifest)) delete manifest[k];
    Object.assign(manifest, sorted);
    await fs.writeFile(cachePath, JSON.stringify(manifest, null, 1));
    log(`  → ${sources.length} photos (${encoded} re-encoded, ${sources.length - encoded} cached).`);
    return manifest;
}

/**
 * Rewrite every <img> that points at a processed photo into a <picture> with
 * AVIF/WebP sources, intrinsic size, lazy loading and an e-ink variant.
 * The original PNG stays as the <img src> fallback.
 */
export function pictureize(doc, manifest, { sizes = '(max-width: 768px) 100vw, 800px' } = {}) {
    const enc = (u) => encodeURI(u);
    let n = 0;
    for (const img of doc.querySelectorAll('img[src]')) {
        let key;
        try { key = decodeURI(new URL(img.getAttribute('src'), 'https://x.invalid/').pathname); } catch { continue; }
        const m = manifest[key];
        if (!m) continue;
        if (!img.hasAttribute('width')) img.setAttribute('width', m.width);
        if (!img.hasAttribute('height')) img.setAttribute('height', m.height);
        // The first photo on a page is usually above the fold: let it load eagerly.
        img.setAttribute('loading', n === 0 ? 'eager' : 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('data-eink-src', enc(m.eink));
        n++;
        if (img.parentElement?.tagName === 'PICTURE') continue;
        const pic = doc.createElement('picture');
        const source = (type, list, media) => {
            const s = doc.createElement('source');
            if (media) s.setAttribute('media', media);
            if (type) s.setAttribute('type', type);
            s.setAttribute('srcset', list);
            if (!media) s.setAttribute('sizes', sizes);
            return s;
        };
        const set = (arr) => arr.map(([u, w]) => `${enc(u)} ${w}w`).join(', ');
        // Panels that report themselves as monochrome get the dither even without JS.
        pic.append(
            source(null, enc(m.eink), '(monochrome)'),
            source('image/avif', set(m.avif)),
            source('image/webp', set(m.webp)),
        );
        img.replaceWith(pic);
        pic.append(img);
    }
    return n;
}
