// build/check-links.mjs — fail the build on broken internal links.
//
//   npm run build && npm run check:links            (internal only, fast)
//   npm run check:links -- --external               (also HEAD-check off-site links; report only)
//
// Walks every HTML page in the built tree (sources + generated per-language
// pages), plus every href/src inside localization/*.json (the hub swaps those
// in at runtime, so they never appear in a built file). Each internal URL must
// resolve to a real file — a directory resolves to its index.html — and a
// #fragment must match an id/name on the target page.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://pelmeniboiler.github.io';
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', '.claude', 'test']);
const CHECK_EXTERNAL = process.argv.includes('--external');

async function walk(dir, out = []) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p, out);
        else out.push(p);
    }
    return out;
}

const exists = async (p) => fs.stat(p).then((s) => s, () => null);

/** Map a site URL path to the file that GitHub Pages would serve. */
async function resolveFile(urlPath) {
    let p = path.join(ROOT, decodeURIComponent(urlPath));
    const st = await exists(p);
    if (st?.isDirectory()) p = path.join(p, 'index.html');
    else if (!st && !path.extname(p)) p += '.html'; // Pages serves /foo as /foo.html
    return (await exists(p))?.isFile() ? p : null;
}

const idCache = new Map();
async function idsOf(file) {
    if (!idCache.has(file)) {
        const html = await fs.readFile(file, 'utf8');
        idCache.set(file, new Set([...html.matchAll(/\b(?:id|name)=(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2])));
    }
    return idCache.get(file);
}

const broken = [];
const external = new Map(); // url -> first source

async function checkUrl(raw, fromFile, fromUrl) {
    if (!raw || /^(mailto:|tel:|javascript:|data:|blob:|about:)/i.test(raw)) return;
    if (raw.includes('${') || raw.includes('{{')) return; // template placeholders in JS-built markup
    let url;
    try { url = new URL(raw, fromUrl); } catch { broken.push([fromFile, raw, 'unparseable']); return; }
    if (url.origin !== SITE && url.origin !== 'null') {
        if (/^https?:$/.test(url.protocol) && !external.has(url.href)) external.set(url.href, fromFile);
        return;
    }
    const target = await resolveFile(url.pathname);
    if (!target) { broken.push([fromFile, raw, 'no such file']); return; }
    const frag = decodeURIComponent(url.hash.slice(1));
    // Fragments starting with ":~:" are text fragments; others must be real anchors.
    if (frag && !frag.startsWith(':~:') && target.endsWith('.html') && !(await idsOf(target)).has(frag)) {
        broken.push([fromFile, raw, `no #${frag} on page`]);
    }
}

const rel = (f) => path.relative(ROOT, f);
const files = await walk(ROOT);
let count = 0;

for (const file of files.filter((f) => f.endsWith('.html'))) {
    const urlPath = '/' + rel(file).split(path.sep).join('/');
    const doc = new JSDOM(await fs.readFile(file, 'utf8')).window.document;
    for (const el of doc.querySelectorAll('a[href], link[href], script[src], img[src], audio[src], source[src], iframe[src], video[src]')) {
        const v = el.getAttribute('href') ?? el.getAttribute('src');
        if (el.tagName === 'A' && v.startsWith('#') && v.length === 1) continue;
        count++;
        await checkUrl(v.trim(), rel(file), SITE + urlPath);
    }
    for (const el of doc.querySelectorAll('img[srcset], source[srcset]')) {
        for (const part of el.getAttribute('srcset').split(',')) {
            count++;
            await checkUrl(part.trim().split(/\s+/)[0], rel(file), SITE + urlPath);
        }
    }
}

// Localization strings are injected into the hub (/) and article pages at runtime.
for (const file of files.filter((f) => /localization[\\/][^\\/]+\.json$/.test(f))) {
    const text = await fs.readFile(file, 'utf8');
    for (const m of text.matchAll(/\b(?:href|src)=\\?["']([^"'\\]+)\\?["']/g)) {
        count++;
        await checkUrl(m[1], rel(file), SITE + '/');
    }
}

if (CHECK_EXTERNAL) {
    console.log(`Checking ${external.size} external links (report only)...`);
    const results = await Promise.all([...external].map(async ([u, from]) => {
        try {
            const r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
            return r.status >= 400 && r.status !== 405 && r.status !== 403 ? [from, u, `HTTP ${r.status}`] : null;
        } catch (e) { return [from, u, e.name]; }
    }));
    for (const r of results.filter(Boolean)) console.log(`  ⚠️  ${r[0]}: ${r[1]} (${r[2]})`);
}

const unique = [...new Map(broken.map((b) => [b.join('|'), b])).values()];
if (unique.length) {
    console.error(`❌ ${unique.length} broken internal link(s) (of ${count} checked):`);
    for (const [from, url, why] of unique) console.error(`  ${from}: ${url}  — ${why}`);
    process.exit(1);
}
console.log(`✅ ${count} internal links OK`);
