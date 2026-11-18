// build/build.mjs
//
// Platform-agnostic port of the `buildFeeds` command from the old VS Code
// extension (pelmeniboiler-rss/src/extension.ts). Generates:
//   - blog/blog-manifest.json
//   - rss/<lang>/feed.xml   (one per language found in the localization files)
//
// Run from the repo root:  npm run build
// The logic is a faithful port; the only changes are dropping the VS Code shell
// (workspace folders, progress UI, notification popups) for plain Node + console.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import { processImages, pictureize } from './images.mjs';
import { buildEmoji, emojifyDocument, emojifySourceFiles, splitSprites } from './emoji.mjs';
import { ariaDocument, ariaSourceFiles } from './aria.mjs';
import { splitThemeCss } from './css-split.mjs';

// Set once per build by main(): theme name → its split-out stylesheet URL.
let THEME_CSS = {};
// Set once per build by main(): our emoji glyphs as an SVG sprite + map.
let EMOJI_MAP = null;
/** Swap emoji in an HTML document or fragment string for our SVG glyphs. */
function emojifyHtml(html, { fragment = false } = {}) {
    const dom = new JSDOM(fragment ? `<!DOCTYPE html><body>${html}</body>` : html);
    emojifyDocument(dom.window.document, EMOJI_MAP);
    ariaDocument(dom.window.document);
    return fragment ? dom.window.document.body.innerHTML : dom.serialize();
}

// Sources are read from the repository; everything the build produces goes to
// OUT_DIR (/_site, gitignored). The build never writes to a source file: it
// first stages a copy of the sources there, then every step below works on
// that copy. /_site is what gets tested, link-checked and deployed.
const SRC_DIR = process.cwd();
const OUT_DIR = path.join(SRC_DIR, '_site');
const ROOT_DIR = OUT_DIR;

// Not part of the site: tooling, repo metadata, notes.
const NOT_SITE = new Set(['_site', 'node_modules', 'build', 'test', 'package.json', 'package-lock.json',
    'LICENSE', 'plan.md', 'graflect-plan.md', 'README.md', 'CLAUDE.md']);
// Output of older in-place builds that may still be lying around in a working
// tree. Never copy it: the build regenerates all of it in /_site.
const STALE_OUTPUT = [/^sitemap\.xml$/, /^rss$/, /^zine$/, /^img$/, /^styles\/emoji$/, /^blog\/blog-manifest\.json$/,
    /^blog\/[^/]+$/ /* per-language page folders; real posts are blog/<name>.html */];
// Kept between builds: encoded photos are slow to make and cached by content hash.
const KEEP_IN_OUT = new Set(['img']);

async function stageSources() {
    await fs.mkdir(OUT_DIR, { recursive: true });
    for (const name of await fs.readdir(OUT_DIR)) {
        if (!KEEP_IN_OUT.has(name)) await fs.rm(path.join(OUT_DIR, name), { recursive: true, force: true });
    }
    for (const ent of await fs.readdir(SRC_DIR, { withFileTypes: true })) {
        if (ent.name.startsWith('.') || NOT_SITE.has(ent.name)) continue;
        await fs.cp(path.join(SRC_DIR, ent.name), path.join(OUT_DIR, ent.name), {
            recursive: true,
            filter: async (src) => {
                const rel = path.relative(SRC_DIR, src).split(path.sep).join('/');
                if (path.basename(src).startsWith('.')) return false;
                if (!STALE_OUTPUT.some((re) => re.test(rel))) return true;
                // blog/<name>.html is a post; blog/<name>/ is stale output.
                return rel.startsWith('blog/') && rel !== 'blog/blog-manifest.json' && !(await fs.stat(src)).isDirectory();
            },
        });
    }
}
// pdf.js for /ct125/ (renders the manual PDF an owner loads from their own
// device). Copied from node_modules so the library is never checked in.
async function vendorPdfJs() {
    const from = path.join(SRC_DIR, 'node_modules', 'pdfjs-dist', 'build');
    const to = path.join(OUT_DIR, 'ct125', 'vendor');
    await fs.mkdir(to, { recursive: true });
    // Renamed .mjs → .js: not every static host serves .mjs as JavaScript.
    for (const f of ['pdf.min', 'pdf.worker.min']) await fs.copyFile(path.join(from, f + '.mjs'), path.join(to, f + '.js'));
    // and the QR code generator for "share bike"
    await fs.copyFile(path.join(SRC_DIR, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.mjs'), path.join(to, 'qrcode.js'));
}
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const LOCALIZATION_DIR = path.join(ROOT_DIR, 'localization');
const RSS_OUTPUT_DIR = path.join(ROOT_DIR, 'rss');
const SITE_URL = 'https://pelmeniboiler.github.io/';

/**
 * Auto-generate a themed index.html for every public folder that lacks one, so a
 * bare folder URL (e.g. /tools/) shows a listing of the pages and sub-folders it
 * contains instead of the 404. Generated pages carry a FOLDER-INDEX marker so a
 * re-run refreshes them and never clobbers a hand-written index.html.
 */
async function generateFolderIndexes(rootDir, manifestItems, localizationData) {
    const SKIP = new Set(['node_modules', '.git', '.github', 'build', 'test', 'scripts',
        'styles', 'localization', 'logo', 'rss', 'modules', 'inprogress', 'img']);
    const stripHtml = (s) => s.replace(/<[^>]+>/g, '').trim();
    const titleOf = async (fp, fallback) => {
        try {
            const html = await fs.readFile(fp, 'utf8');
            const t = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
                || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
            return t ? stripHtml(t) : fallback;
        } catch { return fallback; }
    };
    const crumbs = (parts) => {
        const segs = ['<a href="/"><span class="symbol">🏠</span> home</a>'];
        parts.forEach((name, i) => {
            const href = `/${parts.slice(0, i + 1).join('/')}/`;
            segs.push(i === parts.length - 1 ? `<span>${name}</span>` : `<a href="${href}">${name}</a>`);
        });
        return `<nav class="folder-crumbs">${segs.join(' <span class="crumb-sep">/</span> ')}</nav>`;
    };

    const page = ({ parts, titleText, icon, width, bodyInner, titleBarExtra = '', extraScripts = '' }) => `<!DOCTYPE html>
<html lang="en" translate="no">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>${icon} ${titleText}</title>
    <link rel="icon" href="/logo/favicon.svg">
    <script src="/scripts/theme-loader.js"></script>
    <link rel="stylesheet" href="/styles/pelmeni2025.css">
</head>
<body>
    <!--FOLDER-INDEX: generated by build/build.mjs; do not edit by hand-->
    <div class="window" style="top: 10%; left: ${width >= 560 ? 20 : 30}%; width: min(${width}px, 90vw); max-height: 80vh; display: flex; flex-direction: column;">
        <div class="title-bar">
            <span class="title"><span class="symbol">${icon}</span> ${titleText}</span>${titleBarExtra}
            <button class="close-btn" onclick="window.location.href='/'">&times;</button>
        </div>
        <div class="content" style="overflow-y: auto;">
            ${crumbs(parts)}
            ${bodyInner}
        </div>
    </div>
    <script src="/scripts/module-loader.js" defer></script>${extraScripts}
</body>
</html>
`;

    let made = 0;
    async function walk(dir, parts) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name));
        for (const d of subdirs) await walk(path.join(dir, d.name), [...parts, d.name]);
        if (!parts.length) return; // never touch the site root

        const idxPath = path.join(dir, 'index.html');
        let existing = null;
        try { existing = await fs.readFile(idxPath, 'utf8'); } catch { /* none */ }
        if (existing && !existing.includes('FOLDER-INDEX')) return; // hand-written index — leave it

        const isBlogRoot = parts.length === 1 && parts[0] === 'blog';
        let bodyInner, width, icon = '🗀', titleText = `/${parts.join('/')}/`;
        let titleBarExtra = '', extraScripts = '';

        if (isBlogRoot && manifestItems?.length) {
            // The /blog/ folder is the real blog.posts window from the hub: the
            // same RSS dropdown, filter buttons and post cards, enhanced in place
            // by scripts/blog-loader.js (filtering, language-aware links/dates).
            const { filtersHtml, postsHtml } = buildBlogListMarkup(manifestItems, localizationData);
            bodyInner = `<div id="blog-filter-container">${filtersHtml}</div>
            <div id="blog-posts-list">\n${postsHtml}\n</div>`;
            width = 560; icon = '📓'; titleText = 'blog.posts';
            titleBarExtra = `\n            ${RSS_DROPDOWN_HTML}`;
            extraScripts = '\n    <script src="/scripts/blog-loader.js" defer></script>';
        } else {
            const items = [];
            for (const d of subdirs) items.push({ icon: '🗀', label: `${d.name}/`, href: `/${[...parts, d.name].join('/')}/` });
            for (const f of entries.filter((e) => e.isFile() && e.name.endsWith('.html') && e.name !== 'index.html')) {
                items.push({ icon: '🖹', label: await titleOf(path.join(dir, f.name), f.name), href: `/${[...parts, f.name].join('/')}` });
            }
            // Photo folders hold only images; list them so the folder URL isn't a 404.
            for (const f of entries.filter((e) => e.isFile() && /\.(png|jpe?g|gif|svg)$/i.test(e.name))) {
                items.push({ icon: '🖻', label: f.name, href: `/${[...parts, f.name].join('/')}` });
            }
            for (const i of items) i.href = i.href.split('/').map(encodeURIComponent).join('/');
            if (!items.length) { if (existing) await fs.unlink(idxPath); return; } // nothing to list
            bodyInner = `<ul class="app-list">\n${items.map((i) => `                <li><a href="${i.href}"><span class="symbol">${i.icon}</span> ${i.label}</a></li>`).join('\n')}\n            </ul>`;
            width = 440;
        }

        await fs.writeFile(idxPath, emojifyHtml(page({ parts, titleText, icon, width, bodyInner, titleBarExtra, extraScripts })));
        made++;
    }
    await walk(rootDir, []);
    console.log(`  → generated ${made} folder index page(s).`);
}

// Collect the photos shown in the "Photos"-keyword articles into a small manifest
// the e-ink screensaver reads: it picks one at random and re-draws it as a halftone
// mosaic built out of the ShZh logo. We keep only reasonably large images (real
// photos, not tiny inline crops/icons) so the mosaic has something to work with.
async function generatePhotoScreensaverManifest(manifestItems, blogDir, rootDir, localizationData, imageManifest = {}) {
    const photoPosts = manifestItems.filter((p) => (p.keywords || []).includes('Photos'));
    const stripTags = (s) => s.replace(/<[^>]+>/g, '');
    const decode = (s) => s
        .replace(/&nbsp;|&emsp;|&ensp;|&thinsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;|&rsquo;|&lsquo;|&apos;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
        .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rarr;/g, '→').replace(/&hellip;/g, '…')
        .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(+n))
        .replace(/&[a-z]+;/gi, ' ');
    // Also drop Unicode bidi/formatting marks so RTL snippets don't carry stray control chars.
    const clean = (s) => decode(stripTags(s)).replace(/[​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
    const cleanTitle = (s) => clean(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
    // Reject snippets that are really filenames, URLs, or audio/asset captions.
    const isJunk = (s) => /https?:|[_/\\]|\.(ogg|mp3|png|jpe?g|svg|gif|webp|html)\b|[♩♪♫♬]/i.test(s);

    // Pull short human-readable snippets from a language's localized article
    // strings: whole short paragraphs, or sentences split out of longer ones
    // (handling Latin/CJK terminators). Filtered to a legible length and capped.
    const excerptsFromLoc = (loc) => {
        const out = [];
        for (const val of Object.values(loc || {})) {
            if (typeof val !== 'string') continue;
            const c = clean(val);
            if (!c || isJunk(c)) continue;
            if (c.length >= 25 && c.length <= 220) { out.push(c); continue; }
            for (const sent of c.split(/(?<=[.!?。！？])/)) {
                const s = sent.trim();
                if (s.length >= 25 && s.length <= 220 && !isJunk(s)) out.push(s);
            }
        }
        return [...new Set(out)].slice(0, 40);
    };
    // English fallback straight from the article HTML (captions + sentences), in
    // case a localization source is sparse.
    const excerptsFromHtml = (html) => {
        const out = [];
        for (const m of html.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi)) {
            const t = clean(m[1]); if (t.length >= 12 && t.length <= 220 && !isJunk(t)) out.push(t);
        }
        for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
            for (const sent of clean(m[1]).split(/(?<=[.!?])\s+/)) {
                if (sent.length >= 30 && sent.length <= 220 && !isJunk(sent)) out.push(sent);
            }
        }
        return [...new Set(out)].slice(0, 40);
    };

    const seen = new Set();
    const photos = [];
    const articles = {};
    for (const post of photoPosts) {
        let html;
        try { html = await fs.readFile(path.join(blogDir, post.filename), 'utf8'); } catch { continue; }
        const slug = post.slug;
        const loc = (localizationData && localizationData[post.translationSource]) || {};
        // Per-language title + excerpts, so the screensaver shows the caption in
        // whatever language the visitor has selected (falling back to English).
        const titles = {}, excerpts = {};
        for (const lang of Object.keys(loc)) {
            titles[lang] = cleanTitle(loc[lang]?.[post.titleKey] || post.title || slug);
            excerpts[lang] = excerptsFromLoc(loc[lang]);
        }
        titles.en = titles.en || cleanTitle(post.title || slug);
        if (!excerpts.en || !excerpts.en.length) excerpts.en = excerptsFromHtml(html);
        articles[slug] = { titles, excerpts };
        for (const m of html.matchAll(/(?:src|href)="(\/photos\/[^"]+\.(?:png|jpe?g|webp))"/gi)) {
            const src = m[1];
            if (seen.has(src)) continue;
            seen.add(src);
            try {
                const { size } = await fs.stat(path.join(rootDir, src.replace(/^\//, '')));
                if (size >= 250_000) {
                    // Serve the encoded variant (WebP, widest: every browser that
                    // runs this reads it), not the multi-megabyte original. The
                    // original stays available as `full`.
                    const enc = imageManifest[src] || imageManifest[encodeURI(src)];
                    const small = enc && enc.webp.length ? enc.webp[enc.webp.length - 1][0] : src;
                    photos.push({ src: small, full: src, slug });
                }
            } catch { /* referenced file missing — skip */ }
        }
    }
    // Per-language UI strings for the LCD (motion) screensaver's windows, pulled
    // straight from the shared localization so the standalone page (no runtime
    // translator) can still show them in the visitor's language.
    const g = (localizationData && localizationData.global) || {};
    const ui = {};
    for (const lang of Object.keys(g)) {
        // Titles are stored as ready-to-insert HTML with their icons already
        // drawn as SVG: the screensaver builds its windows from strings, and a
        // bare ❈ or ◈ there used to pull in a whole emoji font to draw it.
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        ui[lang] = {
            logo: emojifyHtml(g[lang]?.win_logo_title || '<span class="symbol">❈</span> logo.canvas', { fragment: true }),
            exitTitle: emojifyHtml(esc(g[lang]?.ss_exit_title || '◈ exit.screensaver'), { fragment: true }),
            exitHint: g[lang]?.ss_exit_hint || '',
        };
    }

    const outDir = path.join(rootDir, 'screensaver');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'photos.json'), JSON.stringify({ photos, articles, ui }, null, 2));
    console.log(`  → wrote ${photos.length} screensaver photos + excerpts from ${photoPosts.length} photo article(s).`);
}

async function main() {
    console.log('Staging sources into /_site...');
    await stageSources();
    await vendorPdfJs();

    console.log('Splitting the stylesheet per theme...');
    THEME_CSS = await splitThemeCss(ROOT_DIR);

    await fs.mkdir(RSS_OUTPUT_DIR, { recursive: true });

    console.log('Loading files...');
    const [localizationData, blogPostPaths] = await Promise.all([
        loadLocalizationFiles(LOCALIZATION_DIR),
        loadBlogFiles(BLOG_DIR),
    ]);

    const processedPosts = await processAllPosts(blogPostPaths);
    console.log('Extracting emoji glyphs from our fonts...');
    // Scan the SOURCES for emoji (incl. the icons named in build/*.mjs).
    EMOJI_MAP = await buildEmoji(ROOT_DIR, { scanRoot: SRC_DIR });

    // After the sprite is written: its content is part of the version, so a
    // new emoji retires the old cached sprite + map like any other asset.
    const assetVersion = await computeAssetVersion(ROOT_DIR);

    console.log('Encoding photos (AVIF/WebP + pre-dithered e-ink)...');
    const imageManifest = await processImages(ROOT_DIR);

    console.log('Generating blog manifest...');
    const manifestItems = await generateBlogManifest(processedPosts, localizationData, BLOG_DIR);

    console.log('Baking blog list into the hub...');
    await bakeBlogList(manifestItems, localizationData, ROOT_DIR);

    console.log('Baking app library into the hub...');
    await bakeAppLibrary(ROOT_DIR, manifestItems);

    console.log('Baking the chrome and English text into the hub...');
    await bakeHub(ROOT_DIR, localizationData, manifestItems);

    console.log('Inlining emoji in hand-written pages and modules...');
    await emojifySourceFiles(ROOT_DIR, EMOJI_MAP);

    console.log('Stamping ARIA onto hand-written pages and modules...');
    await ariaSourceFiles(ROOT_DIR);

    await versionHubAssets(ROOT_DIR, assetVersion);
    await stampServiceWorker(ROOT_DIR, assetVersion);

    console.log('Generating per-language article pages...');
    const { builtUrls: pageUrls, zineArticles } =
        await generateLanguagePages(processedPosts, localizationData, BLOG_DIR, assetVersion, imageManifest);

    console.log('Generating zines...');
    await generateZines(zineArticles, ROOT_DIR, assetVersion);

    console.log('Letting Graflect text wrap...');
    await wrapGraflectSpaces(ROOT_DIR);

    console.log('Stamping canonical links on legacy article pages...');
    await injectLegacyCanonicals(processedPosts, BLOG_DIR);

    console.log('Generating sitemap...');
    await generateSitemap(pageUrls, processedPosts, ROOT_DIR);

    console.log('Generating the translation status page...');
    await generateTranslationReport(ROOT_DIR, localizationData);

    console.log('Generating folder index pages...');
    await generateFolderIndexes(ROOT_DIR, manifestItems, localizationData);

    console.log('Generating e-ink screensaver photo manifest...');
    await generatePhotoScreensaverManifest(manifestItems, BLOG_DIR, ROOT_DIR, localizationData, imageManifest);

    console.log('Determining languages...');
    const allLanguages = new Set();
    // tl-status.json keys are post names (translation bookkeeping), not languages.
    Object.entries(localizationData).forEach(([name, fileContent]) => {
        if (name === 'tl-status') return;
        Object.keys(fileContent).forEach((langCode) => allLanguages.add(langCode));
    });

    let generatedCount = 0;
    for (const langCode of allLanguages) {
        console.log(`Processing ${langCode.toUpperCase()}...`);
        const success = await generateFeedForLanguage(
            langCode, localizationData, processedPosts, RSS_OUTPUT_DIR,
        );
        if (success) generatedCount++;
    }

    console.log('Splitting the emoji sprite per page...');
    await splitSprites(ROOT_DIR);

    console.log('Inlining the theme loader into every page...');
    await inlineThemeLoader(ROOT_DIR);

    console.log(`\n✅ Generated ${generatedCount} RSS feeds and blog-manifest.json.`);
}

// --- Core logic (ported verbatim from extension.ts) ---

async function loadLocalizationFiles(localizationDir) {
    const files = await fs.readdir(localizationDir);
    const localizationData = {};
    for (const fileName of files) {
        if (fileName.endsWith('.json')) {
            const filePath = path.join(localizationDir, fileName);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const key = fileName.replace('.json', '');
            localizationData[key] = JSON.parse(fileContent);
        }
    }
    return localizationData;
}

async function loadBlogFiles(blogDir) {
    const files = await fs.readdir(blogDir);
    return files
        .filter((file) => file.endsWith('.html'))
        .map((file) => path.join(blogDir, file));
}

async function processAllPosts(postPaths) {
    const postPromises = postPaths.map(async (postPath) => {
        const htmlContent = await fs.readFile(postPath, 'utf-8');
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;
        const pubDateEl = doc.querySelector('meta[name="pubDate"]');
        const translationSourceEl = doc.querySelector('meta[name="translation-source"]');
        const pubDate = pubDateEl
            ? new Date(pubDateEl.getAttribute('content')).toUTCString()
            : new Date().toUTCString();

        return {
            filename: path.basename(postPath),
            pubDate,
            translationSource: translationSourceEl?.getAttribute('content') || null,
            author: doc.querySelector('meta[name="author"]')?.getAttribute('content') || 'Wendy Zhulkovsky',
            image: doc.querySelector('article.content img')?.getAttribute('src') || null,
            doc,
            html: htmlContent,
        };
    });
    return Promise.all(postPromises);
}

async function generateBlogManifest(processedPosts, localizationData, blogDir) {
    const manifestItems = [];

    for (const post of processedPosts) {
        if (!post.translationSource) continue;

        const { titleKey, descriptionKey } = resolveContentKeys(post);
        const slug = post.filename.replace(/\.html$/, '');
        // The languages this post was actually translated into = the languages
        // for which a /blog/<slug>/<lang>/ page exists.
        const languages = Object.keys(localizationData[post.translationSource] || {});

        const englishTitle = post.doc.querySelector('title')?.textContent || 'Untitled';
        const englishDescription =
            post.doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
            'No description found.';

        const keywordsEl = post.doc.querySelector('meta[name="keywords"]');
        const keywords = keywordsEl
            ? keywordsEl.getAttribute('content')?.split(',').map((k) => k.trim()).filter((k) => k) || []
            : [];

        manifestItems.push({
            filename: post.filename,
            link: `/blog/${post.filename}`,
            slug,
            languages,
            date: post.pubDate,
            translationSource: post.translationSource,
            titleKey,
            title: englishTitle,
            descriptionKey,
            description: englishDescription,
            keywords,
        });
    }

    manifestItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const manifestPath = path.join(blogDir, 'blog-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifestItems, null, 2));
    return manifestItems;
}

const KEYWORD_ICONS = { Language: '▤', Photos: '🖻', Projects: '🗀', Keyboards: '⌨', Meta: '♻', Motorcycles: '🏍' };

// Static markup for the blog.posts window's guts: the filter buttons and the post
// cards. Shared by the hub (bakeBlogList) and the /blog/ folder page so both render
// the identical, already-filterable list that scripts/blog-loader.js enhances in
// place (no manifest fetch). Cards keep data-key (runtime translation), data-slug /
// data-langs (language-aware links) and data-keywords (filtering).
function buildBlogListMarkup(manifestItems, localizationData) {
    const enVal = (source, key, fallback) =>
        localizationData[source]?.en?.[key] ?? localizationData.global?.en?.[key] ?? fallback;

    const keywords = [...new Set(manifestItems.flatMap((p) => p.keywords || []))];
    const filterBtn = (kw, icon, active) =>
        `<button class="filter-btn${active ? ' active' : ''}" data-keyword="${kw}"><span class="symbol">${icon}</span> ${kw}</button>`;
    // No-JS twin of the buttons: radio + label pairs and one :has() rule per
    // keyword (styles/pelmeni2025.css shows these only under html:not(.js)).
    const slugKw = (kw) => kw.replace(/[^A-Za-z0-9_-]/g, '_');
    const filterRadio = (kw, icon, checked) =>
        `<input type="radio" class="bf-radio" name="blog-filter" id="bf-${slugKw(kw)}"${checked ? ' checked' : ''}>` +
        `<label class="filter-btn filter-label" for="bf-${slugKw(kw)}"><span class="symbol">${icon}</span> ${kw}</label>`;
    const noJsRules = keywords.map((kw) =>
        `html:not(.js) .window:has(#bf-${slugKw(kw)}:checked) .blog-post:not([data-keywords*="${kw}"]){display:none}`).join('\n');
    const filtersHtml = [filterBtn('All', '✧', true),
        ...keywords.map((kw) => filterBtn(kw, KEYWORD_ICONS[kw] || '◆', false)),
        filterRadio('All', '✧', true),
        ...keywords.map((kw) => filterRadio(kw, KEYWORD_ICONS[kw] || '◆', false)),
        `<style>\n${noJsRules}\n</style>`].join('');

    const postsHtml = manifestItems.map((p) => {
        const langs = (p.languages || []).join(',');
        const href = `/blog/${p.slug}/en/`;
        const title = enVal(p.translationSource, p.titleKey, p.title);      // localization HTML
        const desc = enVal(p.translationSource, p.descriptionKey, p.description);
        const isoDate = new Date(p.date).toISOString();
        const date = formatDisplayDate(p.date, 'en'); // baked default (Anno Mundi); JS re-formats per language
        const kws = (p.keywords || []).join(',');
        return `<article class="blog-post" data-keywords="${kws}">
  <h3 aria-level="2"><a href="${href}" data-key="${p.titleKey}" data-slug="${p.slug}" data-langs="${langs}">${title}</a></h3>
  <p class="post-date" data-date="${isoDate}">${date}</p>
  <p data-key="${p.descriptionKey}">${desc}</p>
  <p><i><a href="${href}" data-slug="${p.slug}" data-langs="${langs}">read more &rarr;</a></i></p>
</article>`;
    }).join('\n');

    return { filtersHtml, postsHtml, keywordCount: keywords.length + 1 };
}

// The RSS subscribe dropdown that sits in the blog.posts title bar (hub + /blog/).
const RSS_DROPDOWN_HTML = `<div class="rss-dropdown-container">
                <button class="rss-btn" title="Subscribe to rss feed" data-title-key="subscribe"><span class="symbol">📡</span></button>
                <div class="rss-dropdown-content">
                    <a href="https://pelmeniboiler.github.io/rss/en/feed.xml" target="_blank" rel="noopener noreferrer">English</a>
                    <a href="https://pelmeniboiler.github.io/rss/he/feed.xml" target="_blank" rel="noopener noreferrer">עברית</a>
                    <a href="https://pelmeniboiler.github.io/rss/ja/feed.xml" target="_blank" rel="noopener noreferrer">日本語</a>
                    <a href="https://pelmeniboiler.github.io/rss/de/feed.xml" target="_blank" rel="noopener noreferrer">Deutsch</a>
                    <a href="https://pelmeniboiler.github.io/rss/gt/feed.xml" target="_blank" rel="noopener noreferrer"></a>
                    <a href="https://pelmeniboiler.github.io/rss/ru/feed.xml" target="_blank" rel="noopener noreferrer">Русский</a>
                </div>
            </div>`;

// Native-script language names, read off the RSS dropdown so the Graflect
// (private-use) glyphs live in one place.
const LANG_NAMES = Object.fromEntries(
    [...RSS_DROPDOWN_HTML.matchAll(/rss\/([a-z]+)\/feed\.xml"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]));

// Human-facing dates: Anno Mundi (Hebrew calendar) by default, Japanese era for
// ja. Machine dates (RSS/JSON-LD/manifest) stay ISO/RFC — this is display only.
// (The same logic is mirrored in scripts/blog-loader.js for runtime re-formatting.)
function formatDisplayDate(date, lang) {
    const d = new Date(date);
    if (lang === 'ja') {
        return new Intl.DateTimeFormat('ja-u-ca-japanese', { era: 'short', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
    }
    const loc = ({ he: 'he', de: 'de', ru: 'ru' })[lang] || 'en';
    return new Intl.DateTimeFormat(`${loc}-u-ca-hebrew`, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/**
 * Render the blog filter buttons + post cards as static HTML and inject them into
 * the hub between the FILTERS/POSTS markers. The list only changes when a post is
 * published, so there's no reason to assemble it in every visitor's browser; the
 * cards are crawlable and don't pop in. blog-loader.js then only wires up the
 * (client-side) filtering. Cards keep data-key (runtime translation), data-slug /
 * data-langs (language-aware links), and data-keywords (filtering).
 */
async function bakeBlogList(manifestItems, localizationData, rootDir) {
    const hubPath = path.join(rootDir, 'index.html');
    let html;
    try { html = await fs.readFile(hubPath, 'utf-8'); } catch { return; }

    const { filtersHtml, postsHtml, keywordCount } = buildBlogListMarkup(manifestItems, localizationData);

    html = html.replace(/(<!--FILTERS:START-->)[\s\S]*?(<!--FILTERS:END-->)/, (_m, a, b) => a + emojifyHtml(filtersHtml, { fragment: true }) + b);
    html = html.replace(/(<!--POSTS:START-->)[\s\S]*?(<!--POSTS:END-->)/, (_m, a, b) => `${a}\n${emojifyHtml(postsHtml, { fragment: true })}\n${b}`);
    await fs.writeFile(hubPath, html);
    console.log(`  → baked ${manifestItems.length} blog cards + ${keywordCount} filters into the hub.`);
}

// --- Per-language static page generation (new) ---

// hreflang only accepts valid BCP-47 tags. Graflect ("gt") is a private
// constructed script with no valid tag, so we still build its page and link it
// from the in-page switcher, but omit it from hreflang (Google would ignore it).
const INVALID_HREFLANG = new Set(['gt']);
const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur']);
// OpenGraph wants ll_CC locales. gt has no real locale, so it's omitted.
const OG_LOCALE = { en: 'en_US', ja: 'ja_JP', he: 'he_IL', de: 'de_DE', ru: 'ru_RU' };
// PNG, not SVG: link-preview crawlers (Discord, iMessage, Slack) skip SVG images.
const DEFAULT_OG_IMAGE = `${SITE_URL}logo/icons/light-512.png`;

const jsonLdEscape = (s) => String(s).replace(/</g, '\\u003c'); // safe inside <script>
const attrEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Append a content-version query (?v=hash) to every /styles/*.css and /scripts/*.js
 * reference so a deploy that changes an asset is picked up immediately instead of
 * being served stale from cache. Idempotent: an existing ?v= is replaced.
 */
function versionAssets(html, version) {
    return html.replace(
        /((?:href|src)=")(\/?(?:styles|scripts)\/[^"?]+\.(?:css|js))(?:\?v=[a-f0-9]+)?(")/g,
        (_m, pre, ref, post) => `${pre}${ref}?v=${version}${post}`,
    );
}

// Standalone pages that carry their own inline behaviour (not just a reference to
// a versioned /scripts file). They must feed the version hash too, otherwise a
// change to one of them leaves VERSION unchanged, the service worker never
// reinstalls, and the old cached copy keeps being served (e.g. the screensaver
// showing a previous version after a deploy). These files carry no ?v= stamp of
// their own, so hashing them is stable (no chicken-and-egg with the version).
const VERSIONED_PAGES = ['screensaver/index.html'];

/** Short content hash of all CSS + JS (+ inline-logic pages), the cache-busting version. */
async function computeAssetVersion(rootDir) {
    const dirs = ['styles', 'scripts'];
    const parts = [];
    for (const d of dirs) {
        const base = path.join(rootDir, d);
        const walk = async (dir) => {
            for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) await walk(full);
                else if (/\.(css|js)$/.test(ent.name) || /^(sprite\.svg|map\.json)$/.test(ent.name)) parts.push(await fs.readFile(full));
            }
        };
        try { await walk(base); } catch { /* dir may not exist */ }
    }
    for (const rel of VERSIONED_PAGES) {
        try { parts.push(await fs.readFile(path.join(rootDir, rel))); } catch { /* optional */ }
    }
    return crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex').slice(0, 8);
}

// Curated standalone tools shown in the app library (deliberately not every
// file in /tools — authoring/internal tools stay unlisted). The HOI4 pair
// lives in its own nested "folder".
const APP_LIBRARY = {
    tools: [
        // graflect.workbench deliberately unlisted for now.
        { href: '/tools/emojiviewer.html', icon: '🙾', label: 'emoji.viewer' },
        { href: '/screensaver/', icon: '🖳', label: 'screensaver.dvd' },
        { href: '/ct125/', icon: '🏍', label: 'ct125.manual' },
    ],
    folders: [{
        icon: '🗺', label: 'hoi4.mapping',
        items: [
            { href: '/tools/definitionviewer.html', icon: '➮', label: 'Web-based Definition.csv Wizard' },
            { href: 'https://github.com/pelmeniboiler/hoi4-province-reassinger', icon: '➮', label: 'Province-Reassigning VSCode Extension' },
        ],
    }],
};

/**
 * Bake the "app library" window on the hub: the curated tools above, a nested
 * HOI4 folder, and — discovered automatically — every interactive demo that
 * lives inside an article. Demo registry comes from module-loader.js itself
 * (its id→path table is the runtime source of truth), the display name from
 * each demo module's own title bar, and the link from whichever article hosts
 * the placeholder. Adding a demo to a post makes it appear here on next build.
 */
async function bakeAppLibrary(rootDir, manifestItems) {
    const hubPath = path.join(rootDir, 'index.html');
    let html;
    try { html = await fs.readFile(hubPath, 'utf-8'); } catch { return; }

    // Demo id→path pairs from module-loader.js (skip the chrome modules).
    const loaderSrc = await fs.readFile(path.join(rootDir, 'scripts/module-loader.js'), 'utf-8');
    const demoDefs = [...loaderSrc.matchAll(/id:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'/g)]
        .map(([, id, p]) => ({ id, path: p }))
        .filter((d) => d.path.includes('/blog/demos/'));

    // Which article hosts which placeholder.
    const bySlug = Object.fromEntries(manifestItems.map((m) => [m.slug, m]));
    const hostOf = {};
    for (const m of manifestItems) {
        const src = await fs.readFile(path.join(rootDir, 'blog', m.filename), 'utf-8');
        for (const d of demoDefs) if (src.includes(`id="${d.id}"`)) hostOf[d.id] = m.slug;
    }

    const demoItems = [];
    for (const d of demoDefs) {
        const slug = hostOf[d.id];
        if (!slug) continue; // demo not embedded in any current article
        let title = d.id;
        try {
            const doc = new JSDOM(await fs.readFile(path.join(rootDir, d.path.replace(/^\//, '')), 'utf-8')).window.document;
            title = doc.querySelector('.title-bar .title')?.textContent.trim() || d.id;
        } catch { /* keep id as name */ }
        const chars = [...title];
        demoItems.push({
            slug,
            articleTitle: bySlug[slug]?.title || slug,
            href: `/blog/${slug}/en/`,
            icon: chars[0], label: chars.slice(1).join('').trim(),
        });
    }

    const li = (i) => `<li><a href="${i.href}"${i.tip ? ` title="${i.tip}"` : ''}><span class="symbol">${i.icon}</span> ${i.label}</a></li>`;
    const parts = [];
    parts.push(`<ul class="app-list">\n${APP_LIBRARY.tools.map(li).join('\n')}\n</ul>`);
    for (const f of APP_LIBRARY.folders) {
        parts.push(`<details class="app-folder"><summary><span class="symbol">${f.icon}</span> ${f.label}</summary>\n<ul class="app-list">\n${f.items.map(li).join('\n')}\n</ul>\n</details>`);
    }
    if (demoItems.length) {
        // Group demos by their host article — each article becomes its own nested
        // folder inside the demos.from.articles folder, mirroring the hoi4 folder.
        const byArticle = new Map();
        for (const d of demoItems) {
            if (!byArticle.has(d.slug)) byArticle.set(d.slug, { title: d.articleTitle, items: [] });
            byArticle.get(d.slug).items.push(d);
        }
        const articleFolders = [...byArticle.values()].map((a) => {
            // Article titles follow the site's "leading glyph = icon" convention
            // (like the demos), so the first char goes in the monochrome symbol font.
            const t = [...a.title];
            return `<details class="app-folder"><summary><span class="symbol">${t[0]}</span> ${t.slice(1).join('').trim()}</summary>\n<ul class="app-list">\n${a.items.map(li).join('\n')}\n</ul>\n</details>`;
        }).join('\n');
        parts.push(`<details class="app-folder app-folder-demos"><summary><span class="symbol">📚</span> <span data-key="applib_demos_h4">demos.from.articles</span></summary>\n${articleFolders}\n</details>`);
    }

    html = html.replace(/(<!--APPS:START-->)[\s\S]*?(<!--APPS:END-->)/, (_m, a, b) => `${a}\n${parts.join('\n')}\n${b}`);
    await fs.writeFile(hubPath, html);
    console.log(`  → baked app library: ${APP_LIBRARY.tools.length} tools, ${APP_LIBRARY.folders.length} folder(s), ${demoItems.length} demos.`);
}

/**
 * Stamp the service worker's cache version with the asset hash, in place
 * (idempotent). A deploy that changes any CSS/JS therefore also retires the old
 * offline cache — the SW and the ?v= cache-buster share one version.
 */
async function stampServiceWorker(rootDir, version) {
    const swPath = path.join(rootDir, 'sw.js');
    try {
        const src = await fs.readFile(swPath, 'utf-8');
        await fs.writeFile(swPath, src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
    } catch { /* no sw.js */ }
}

/** Apply the asset version to the hub's own CSS/JS references, in place. */
async function versionHubAssets(rootDir, version) {
    const hubPath = path.join(rootDir, 'index.html');
    try {
        const html = await fs.readFile(hubPath, 'utf-8');
        await fs.writeFile(hubPath, versionAssets(html, version));
    } catch { /* no hub */ }
}

/**
 * Resolve which data-key holds the post's title and description.
 * Shared by the manifest and the per-language page generator.
 */
function resolveContentKeys(post) {
    const preferredTitleKey = `${post.translationSource}_title`;
    let titleKey = post.doc.querySelector(`[data-key="${preferredTitleKey}"]`)
        ? preferredTitleKey
        : post.doc.querySelector('article.content h1[data-key]')?.getAttribute('data-key') || null;
    const descriptionKey =
        post.doc.querySelector('article.content p[data-key]')?.getAttribute('data-key') || null;
    return { titleKey, descriptionKey };
}

function stripHtml(value) {
    return value ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Bake translated text into an HTML fragment (a chrome module) for one language
 * and return the resulting HTML string, ready to replace a placeholder element.
 */
/**
 * /tools/translations.html — what `npm run tl:status` prints, as a page: every
 * key that has English text but no translation (missing), or whose English has
 * changed since it was translated (stale), per file and language, with the
 * English beside it. Same rules and the same stamp file as build/tl.mjs.
 */
async function generateTranslationReport(rootDir, localizationData) {
    const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
    const hasText = (v) => v != null && String(v).trim() !== '';
    const status = localizationData['tl-status'] || {};
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const plain = (s) => { const t = String(s).replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|ensp|emsp|thinsp);/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); return t.length > 160 ? `${t.slice(0, 157)}…` : t; };

    let missingTotal = 0, staleTotal = 0;
    const sections = [];
    for (const prefix of Object.keys(localizationData).sort()) {
        if (prefix === 'tl-status') continue;
        const data = localizationData[prefix] || {};
        const en = data.en || {};
        const langs = Object.keys(data).filter((l) => l !== 'en');
        if (!langs.length || !Object.keys(en).length) continue;
        const perLang = [];
        for (const lang of langs) {
            const t = data[lang] || {};
            const missing = [], stale = [];
            for (const key of Object.keys(en)) {
                if (!hasText(t[key])) { missing.push(key); continue; }
                const stamped = status[prefix]?.[key]?.[lang];
                if (stamped && stamped !== hash(en[key])) stale.push(key);
            }
            missingTotal += missing.length; staleTotal += stale.length;
            if (!missing.length && !stale.length) continue;
            const rows = (keys, mark) => keys.map((k) => `<li><span class="symbol">${mark}</span> <code>${esc(k)}</code> ${esc(plain(en[k]))}</li>`).join('\n');
            perLang.push(`<details class="app-folder"><summary>${lang} · ${missing.length + stale.length}</summary>
<ul class="tl-keys">
${rows(stale, '↻')}
${rows(missing, '∅')}
</ul></details>`);
        }
        if (perLang.length) sections.push(`<details class="app-folder"><summary><span class="symbol">🗀</span> ${prefix}.json</summary>\n${perLang.join('\n')}\n</details>`);
    }

    const html = `<!DOCTYPE html>
<html lang="en" translate="no">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>translation.status</title>
    <link rel="icon" href="/logo/favicon.svg">
    <script src="/scripts/theme-loader.js"></script>
    <link rel="stylesheet" href="/styles/pelmeni2025.css">
    <style>
        .tl-keys { list-style: none; margin: 4px 0 10px; padding-inline-start: 1.75em; display: flex; flex-direction: column; gap: 4px; }
        .tl-keys code { border: 1px solid var(--text-color); padding: 0 4px; }
        .tl-totals { display: flex; gap: 1.5em; margin: 0 0 10px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="window" style="top: 6%; left: 14%; width: min(760px, 92vw); max-height: 86vh; display: flex; flex-direction: column;">
        <div class="title-bar">
            <span class="title"><span class="symbol">▤</span> translation.status</span>
            <button class="close-btn" onclick="window.location.href='/'">&times;</button>
        </div>
        <div class="content" style="overflow-y: auto; max-height: none;">
            <p class="tl-totals"><span><span class="symbol">∅</span> missing ${missingTotal}</span><span><span class="symbol">↻</span> stale ${staleTotal}</span></p>
            ${sections.join('\n') || '<p><span class="symbol">✓</span></p>'}
        </div>
    </div>
    <script src="/scripts/module-loader.js" defer></script>
</body>
</html>
`;
    await fs.mkdir(path.join(rootDir, 'tools'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'tools', 'translations.html'), emojifyHtml(html));
    console.log(`  → ${missingTotal} missing, ${staleTotal} stale.`);
}

/**
 * theme-loader.js must run before first paint (it sets the theme classes), so
 * as an external file it is a render-blocking request on every page. It is
 * 3 KB: put it in the page instead. The file itself stays for anything that
 * still references it.
 */
async function inlineThemeLoader(rootDir) {
    const loaderPath = path.join(rootDir, 'scripts/theme-loader.js');
    // Fill in the theme → stylesheet table (see build/css-split.mjs).
    const filled = (await fs.readFile(loaderPath, 'utf-8')).replace('/*THEME-CSS*/{}', JSON.stringify(THEME_CSS));
    await fs.writeFile(loaderPath, filled);
    const code = filled.replace(/<\/script/gi, '<\\/script');
    // ...and have each page link the active theme's sheet right after the main one.
    // A script may hold such a <link> as text (sofrut's export template): skip whole scripts.
    const MAIN_CSS = /(<script\b[^>]*>[\s\S]*?<\/script>)|(<link\b[^>]*\bhref="[^"]*pelmeni2025\.css[^"]*"[^>]*>)(?!<script>window\.pbThemeLink)/g;
    const TAG = /<script\b[^>]*\bsrc="[^"]*\/?scripts\/theme-loader\.js[^"]*"[^>]*><\/script>/g;
    let n = 0;
    const walk = async (dir) => {
        for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) { if (ent.name !== 'img' && ent.name !== 'photos') await walk(full); continue; }
            if (!ent.name.endsWith('.html')) continue;
            const html = await fs.readFile(full, 'utf-8');
            if (!TAG.test(html)) continue;
            TAG.lastIndex = 0;
            await fs.writeFile(full, html.replace(TAG, () => `<script>${code}</script>`)
                .replace(MAIN_CSS, (m, script) => (script ? m : `${m}<script>window.pbThemeLink&&pbThemeLink()</script>`)));
            n += 1;
        }
    };
    await walk(rootDir);
    console.log(`  → inlined into ${n} page(s).`);
}

/**
 * Pre-render the hub the way article pages already are: put the settings,
 * start-menu and share modules straight into the page (instead of three
 * runtime fetches that make the tray pop in late) and fill every data-key
 * with its English text. scripts/settings.js then has nothing to fetch for an
 * English visitor; other languages still load their strings on demand.
 */
async function bakeHub(rootDir, localizationData, manifestItems) {
    const hubPath = path.join(rootDir, 'index.html');
    const dom = new JSDOM(await fs.readFile(hubPath, 'utf-8'));
    const doc = dom.window.document;
    // Same sources, same order, as the runtime merge in settings.js:
    // global, the page's own file, then every post's file (for the blog list).
    const pageSource = doc.querySelector('meta[name="translation-source"]')?.content;
    const sources = ['global', pageSource, ...new Set(manifestItems.map((p) => p.translationSource).filter(Boolean))].filter(Boolean);
    const en = {};
    for (const s of sources) Object.assign(en, localizationData[s]?.en || {});
    const lookup = (_lang, key) => en[key];

    const modulesDir = path.join(rootDir, 'modules');
    for (const [id, file] of [['settings-module-placeholder', 'settings-module.html'], ['start-menu-module-placeholder', 'start-menu-module.html'], ['share-module-placeholder', 'share-module.html']]) {
        const ph = doc.getElementById(id);
        if (ph) ph.outerHTML = bakeFragment(await fs.readFile(path.join(modulesDir, file), 'utf-8'), 'en', lookup);
    }
    doc.querySelectorAll('[data-key]').forEach((el) => {
        const val = en[el.getAttribute('data-key')];
        if (val != null) el.innerHTML = val;
    });
    doc.querySelectorAll('[data-title-key]').forEach((el) => {
        const val = en[el.getAttribute('data-title-key')];
        if (val != null) el.setAttribute('title', stripHtml(val));
    });
    doc.head.insertAdjacentHTML('beforeend', '    <meta name="baked-lang" content="en">\n');
    await fs.writeFile(hubPath, dom.serialize());
}

function bakeFragment(fragmentHtml, lang, lookup) {
    const doc = new JSDOM(`<!DOCTYPE html><body>${fragmentHtml}</body>`).window.document;
    doc.querySelectorAll('[data-key]').forEach((el) => {
        const val = lookup(lang, el.getAttribute('data-key'));
        if (val != null) el.innerHTML = val;
    });
    doc.querySelectorAll('[data-title-key]').forEach((el) => {
        const val = lookup(lang, el.getAttribute('data-title-key'));
        if (val != null) el.setAttribute('title', stripHtml(val));
    });
    return doc.body.innerHTML;
}

/**
 * For each post, emit one fully-rendered static HTML file per language it has
 * been translated into, at /blog/<slug>/<lang>/index.html. Text is baked in, so
 * crawlers and no-JS clients get real content. Returns the list of built page
 * URLs (root-relative) for the sitemap.
 */
async function generateLanguagePages(processedPosts, localizationData, blogDir, assetVersion, imageManifest = {}) {
    const globalData = localizationData.global || {};
    const builtUrls = [];
    const zineArticles = []; // per-language article content, reused by the zine

    // Universal chrome modules (identical on every page) get inlined at build
    // time with text baked in the page's language, so the runtime no longer has
    // to fetch + translate them. Keyed by the placeholder id they replace.
    // Demo modules are intentionally NOT baked: they're interactive apps with no
    // crawlable value, so module-loader.js still injects them at runtime.
    const modulesDir = path.join(blogDir, '..', 'modules');
    const chromeModules = {
        'settings-module-placeholder': await fs.readFile(path.join(modulesDir, 'settings-module.html'), 'utf-8'),
        'start-menu-module-placeholder': await fs.readFile(path.join(modulesDir, 'start-menu-module.html'), 'utf-8'),
        'share-module-placeholder': await fs.readFile(path.join(modulesDir, 'share-module.html'), 'utf-8'),
    };

    for (const post of processedPosts) {
        if (!post.translationSource) continue;
        const pageData = localizationData[post.translationSource];
        if (!pageData) continue;

        const slug = post.filename.replace(/\.html$/, '');
        const { titleKey, descriptionKey } = resolveContentKeys(post);
        // Languages this article is actually translated into.
        const langs = Object.keys(pageData);
        const hreflangLangs = langs.filter((l) => !INVALID_HREFLANG.has(l));

        // Per-key lookup with fallback: page[lang] -> global[lang] -> page[en] -> global[en].
        const lookup = (lang, key) =>
            pageData[lang]?.[key] ?? globalData[lang]?.[key] ??
            pageData.en?.[key] ?? globalData.en?.[key];

        for (const lang of langs) {
            const dom = new JSDOM(post.html);
            const doc = dom.window.document;
            const root = doc.documentElement;

            // Bake translated text into every keyed element.
            doc.querySelectorAll('[data-key]').forEach((el) => {
                const val = lookup(lang, el.getAttribute('data-key'));
                if (val != null) el.innerHTML = val;
            });
            doc.querySelectorAll('[data-title-key]').forEach((el) => {
                const val = lookup(lang, el.getAttribute('data-title-key'));
                if (val != null) el.setAttribute('title', stripHtml(val));
            });
            doc.querySelectorAll('[data-alt-key]').forEach((el) => {
                const val = lookup(lang, el.getAttribute('data-alt-key'));
                if (val != null) el.setAttribute('alt', stripHtml(val));
            });

            // Photos -> <picture> (AVIF/WebP, intrinsic size, lazy, e-ink variant).
            pictureize(doc, imageManifest);

            // Plain language links for readers without JS (the settings switcher
            // needs it). Hidden under html.js by the stylesheet.
            const navContent = doc.querySelector('#nav-window .content');
            if (navContent && langs.length > 1) {
                const links = langs.map((l) => `<a href="/blog/${slug}/${l}/"${l === 'gt' ? '' : ` hreflang="${l}" lang="${l}"`}${l === lang ? ' aria-current="page"' : ''}>${LANG_NAMES[l] || l}</a>`).join('');
                navContent.insertAdjacentHTML('beforeend', `\n<nav class="lang-links" aria-label="Languages">${links}</nav>\n`);
            }

            // Language + direction.
            root.setAttribute('lang', lang);
            root.setAttribute('dir', RTL_LANGS.has(lang) ? 'rtl' : 'ltr');

            // Localized <title> and <meta description>.
            const titleText = stripHtml(titleKey && lookup(lang, titleKey));
            if (titleText) {
                let titleEl = doc.querySelector('title');
                if (!titleEl) { titleEl = doc.createElement('title'); doc.head.appendChild(titleEl); }
                titleEl.textContent = titleText;
            }
            const descText = stripHtml(descriptionKey && lookup(lang, descriptionKey));
            if (descText) {
                let descEl = doc.querySelector('meta[name="description"]');
                if (!descEl) {
                    descEl = doc.createElement('meta');
                    descEl.setAttribute('name', 'description');
                    doc.head.appendChild(descEl);
                }
                descEl.setAttribute('content', descText);
            }

            // Collect the baked article body for the zine (clone, minus demo
            // placeholders — they're inert without their runtime modules).
            const contentEl = doc.querySelector('article.content');
            if (contentEl) {
                const clone = contentEl.cloneNode(true);
                clone.querySelectorAll('[id$="-placeholder"]').forEach((el) => el.remove());
                zineArticles.push({
                    slug, lang,
                    title: stripHtml(titleKey && lookup(lang, titleKey)) || slug,
                    pubDate: post.pubDate,
                    html: clone.innerHTML,
                });
            }

            // Head metadata: canonical, hreflang alternates, build markers.
            // Drop any canonical inherited from the source skeleton first (the
            // legacy flat pages now carry one pointing at their /en/ sibling).
            doc.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove());
            const selfUrl = `${SITE_URL}blog/${slug}/${lang}/`;
            const ogTitle = titleText || post.doc.querySelector('title')?.textContent || slug;
            const ogDesc = descText || '';
            const ogImage = post.image ? new URL(encodeURI(post.image), SITE_URL).href : DEFAULT_OG_IMAGE;
            const headBits = [];
            headBits.push(`<link rel="canonical" href="${selfUrl}">`);
            for (const l of hreflangLangs) {
                headBits.push(`<link rel="alternate" hreflang="${l}" href="${SITE_URL}blog/${slug}/${l}/">`);
            }
            if (hreflangLangs.includes('en')) {
                headBits.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}blog/${slug}/en/">`);
            }

            // OpenGraph + Twitter cards (so shared links render a preview).
            headBits.push(`<meta property="og:type" content="article">`);
            headBits.push(`<meta property="og:site_name" content="Pelmeniboiler">`);
            headBits.push(`<meta property="og:title" content="${attrEscape(ogTitle)}">`);
            if (ogDesc) headBits.push(`<meta property="og:description" content="${attrEscape(ogDesc)}">`);
            headBits.push(`<meta property="og:url" content="${selfUrl}">`);
            headBits.push(`<meta property="og:image" content="${attrEscape(ogImage)}">`);
            if (OG_LOCALE[lang]) headBits.push(`<meta property="og:locale" content="${OG_LOCALE[lang]}">`);
            for (const l of langs) if (l !== lang && OG_LOCALE[l]) {
                headBits.push(`<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`);
            }
            headBits.push(`<meta name="twitter:card" content="summary_large_image">`);
            headBits.push(`<meta name="twitter:title" content="${attrEscape(ogTitle)}">`);
            if (ogDesc) headBits.push(`<meta name="twitter:description" content="${attrEscape(ogDesc)}">`);
            headBits.push(`<meta name="twitter:image" content="${attrEscape(ogImage)}">`);

            // JSON-LD BlogPosting (machine-readable article record).
            const jsonLd = {
                '@context': 'https://schema.org', '@type': 'BlogPosting',
                headline: ogTitle, description: ogDesc || undefined,
                inLanguage: lang, datePublished: new Date(post.pubDate).toISOString(),
                author: { '@type': 'Person', name: post.author },
                image: ogImage, url: selfUrl, mainEntityOfPage: selfUrl,
                publisher: { '@type': 'Person', name: 'Wendy Zhulkovsky' },
            };
            headBits.push(`<script type="application/ld+json">${jsonLdEscape(JSON.stringify(jsonLd))}</script>`);

            // Markers for the runtime: which language is baked in, and the base
            // path the in-page language switcher should navigate within.
            headBits.push(`<meta name="built-lang" content="${lang}">`);
            headBits.push(`<meta name="page-base" content="/blog/${slug}/">`);
            headBits.push(`<meta name="page-langs" content="${langs.join(',')}">`);
            doc.head.insertAdjacentHTML('beforeend', '\n    ' + headBits.join('\n    ') + '\n');

            // Inline the universal chrome modules with text baked in this
            // language, replacing their placeholder divs. Demo placeholders are
            // left untouched for module-loader.js to inject at runtime.
            for (const [placeholderId, moduleHtml] of Object.entries(chromeModules)) {
                const ph = doc.getElementById(placeholderId);
                if (ph) ph.outerHTML = bakeFragment(moduleHtml, lang, lookup);
            }

            // Any placeholder still left after baking the chrome is a demo module
            // that module-loader.js will inject (and translate) at runtime. Mark
            // such pages so the runtime knows it must load translations; fully
            // baked pages (no demos) can skip the localization fetch entirely.
            if (doc.querySelector('[id$="-placeholder"]')) {
                doc.head.insertAdjacentHTML('beforeend', '\n    <meta name="runtime-modules" content="true">\n');
            }

            // Our emoji as SVG, so no-JS readers never get the OS colour font.
            emojifyDocument(doc, EMOJI_MAP);
            // Roles, names and states for the window chrome (build/aria.mjs).
            ariaDocument(doc);

            const outDir = path.join(blogDir, slug, lang);
            await fs.mkdir(outDir, { recursive: true });
            await fs.writeFile(path.join(outDir, 'index.html'), versionAssets(dom.serialize(), assetVersion));
            builtUrls.push({ loc: selfUrl, pubDate: post.pubDate, slug, lang, hreflangLangs });
        }
    }

    console.log(`  → built ${builtUrls.length} language pages.`);
    return { builtUrls, zineArticles };
}

/**
 * Graflect writes its word space as U+EC71, a private-use character browsers
 * treat as a letter, so a line of Graflect can only wrap at ordinary spaces
 * and runs off narrow screens. Add a <wbr> after each one in the page text of
 * the blog and zine output (never in scripts, styles, titles or attributes).
 */
async function wrapGraflectSpaces(rootDir) {
    const SKIP = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<title\b[\s\S]*?<\/title>|<textarea\b[\s\S]*?<\/textarea>|<[^>]*>)/i;
    let n = 0;
    const walk = async (dir) => {
        for (const ent of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) { await walk(full); continue; }
            if (!ent.name.endsWith('.html')) continue;
            const html = await fs.readFile(full, 'utf-8');
            if (!html.includes('\uEC71')) continue;
            const parts = html.split(SKIP);
            for (let i = 0; i < parts.length; i += 2) parts[i] = parts[i].replace(/\uEC71(?!<wbr>)/g, '\uEC71<wbr>');
            await fs.writeFile(full, parts.join(''));
            n += 1;
        }
    };
    await walk(path.join(rootDir, 'blog'));
    await walk(path.join(rootDir, 'zine'));
    console.log(`  → ${n} page(s).`);
}

/**
 * Emit one "zine" per language at /zine/<lang>/: the whole blog, oldest-first,
 * as a single clean document. On screen it's a simple scrollable page; printed
 * (via the print stylesheet + the page-break rules below) it becomes a booklet.
 * Chrome-free by design — just theme-loader for themes/offline, no modules.
 */
async function generateZines(zineArticles, rootDir, assetVersion) {
    const byLang = {};
    for (const a of zineArticles) (byLang[a.lang] = byLang[a.lang] || []).push(a);

    for (const [lang, articles] of Object.entries(byLang)) {
        articles.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
        const dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
        const langs = Object.keys(byLang);
        const toc = articles.map((a) =>
            `        <li><a href="#${a.slug}">${a.title}</a> <small>${formatDisplayDate(a.pubDate, lang)}</small></li>`).join('\n');
        const bodies = articles.map((a) => `
    <article class="zine-article" id="${a.slug}">
        <p class="post-date">${formatDisplayDate(a.pubDate, lang)}</p>
${a.html}
        <hr>
    </article>`).join('\n');

        const html = `<!DOCTYPE html>
<html lang="${lang}" translate="no" dir="${dir}">
<head>
    <link id="dynamic-favicon" rel="icon" href="/logo/favicon.svg">
    <link rel="manifest" href="/manifest.json">
    <script src="/scripts/theme-loader.js?v=${assetVersion}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Pelmeniboiler — zine (${lang})</title>
    <link rel="stylesheet" href="/styles/pelmeni2025.css?v=${assetVersion}">
    <style>
        body { overflow: auto; }
        .zine { max-width: 720px; margin: 0 auto; padding: 24px 16px 80px; }
        .zine-cover { text-align: center; margin-bottom: 3em; }
        .zine-cover img { width: 120px; height: 120px; }
        .zine nav ol { text-align: start; }
        .zine-article { margin-top: 3em; }
        .zine-article picture { display: block; }
        .zine-article img, .zine-article video, .zine-article iframe, .zine-article svg { max-width: 100%; height: auto; }
        .zine-article pre, .zine-article table { display: block; max-width: 100%; overflow-x: auto; }
    </style>
</head>
<body class="eink-mode light-mode">
    <div class="zine">
        <header class="zine-cover">
            <img src="/logo/shzh.svg" alt="Pelmeniboiler">
            <h1>Pelmeniboiler</h1>
            <p>the whole blog, in order · ${lang}</p>
            <p><small>${langs.map((l) => l === lang ? l : `<a href="/zine/${l}/">${l}</a>`).join(' · ')}</small></p>
            <nav><ol>
${toc}
            </ol></nav>
        </header>
${bodies}
    </div>
</body>
</html>`;

        const outDir = path.join(rootDir, 'zine', lang);
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(path.join(outDir, 'index.html'), emojifyHtml(html));
    }
    console.log(`  → built ${Object.keys(byLang).length} zines.`);
}

/**
 * Give each legacy flat article page (blog/<slug>.html — still served, still
 * linked from old bookmarks/feeds) a rel=canonical pointing at its pre-built
 * English page, so search engines fold the duplicate into the real URL.
 * In-place and idempotent, like the other build stamps.
 */
async function injectLegacyCanonicals(processedPosts, blogDir) {
    for (const post of processedPosts) {
        if (!post.translationSource) continue;
        const slug = post.filename.replace(/\.html$/, '');
        const filePath = path.join(blogDir, post.filename);
        let html = await fs.readFile(filePath, 'utf-8');
        if (html.includes('rel="canonical"')) continue;
        const canonical = `<link rel="canonical" href="${SITE_URL}blog/${slug}/en/">`;
        const anchor = '<link rel="manifest" href="/manifest.json">';
        if (html.includes(anchor)) {
            html = html.replace(anchor, `${anchor}\n    ${canonical}`);
        } else {
            html = html.replace('</head>', `    ${canonical}\n</head>`);
        }
        await fs.writeFile(filePath, html);
    }
}

/**
 * Emit a sitemap.xml covering the homepage and every built per-language page.
 * Each URL declares its sibling-language versions with xhtml:link alternates so
 * search engines understand the whole language cluster (like page hreflang, but
 * in the sitemap). gt is excluded from alternates (no valid hreflang tag).
 */
async function generateSitemap(pageUrls, processedPosts, rootDir) {
    // Sibling map: slug -> { lang -> loc } for valid-hreflang languages.
    const siblings = {};
    for (const u of pageUrls) {
        if (INVALID_HREFLANG.has(u.lang)) continue;
        (siblings[u.slug] = siblings[u.slug] || {})[u.lang] = u.loc;
    }

    const alternatesFor = (slug) => {
        const group = siblings[slug] || {};
        const links = Object.entries(group)
            .map(([l, loc]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${loc}"/>`);
        if (group.en) links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${group.en}"/>`);
        return links.length ? '\n' + links.join('\n') + '\n  ' : '';
    };

    const urls = [
        `  <url><loc>${SITE_URL}</loc></url>`,
        ...pageUrls.map(({ loc, pubDate, slug }) => {
            const lastmod = new Date(pubDate).toISOString().slice(0, 10);
            return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod>${alternatesFor(slug)}</url>`;
        }),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
    await fs.writeFile(path.join(rootDir, 'sitemap.xml'), xml);
}

function cleanHtmlForRss(doc, siteUrl) {
    const content = doc.querySelector('article.content');
    if (!content) return '';

    ['src', 'href'].forEach((attr) => {
        content.querySelectorAll(`[${attr}]`).forEach((el) => {
            const url = el.getAttribute(attr);
            if (url && url.startsWith('/')) {
                try {
                    const absoluteUrl = new URL(encodeURI(url), siteUrl).href;
                    el.setAttribute(attr, absoluteUrl);
                } catch (e) {
                    console.error(`Could not create absolute URL for: ${url}`);
                }
            }
        });
    });

    content.querySelectorAll('script, iframe, style').forEach((el) => el.remove());
    content.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));

    return content.innerHTML;
}

async function generateFeedForLanguage(langCode, localizationData, processedPosts, outputDir) {
    const getGlobalTranslation = (key, fallback) => {
        for (const sourceName in localizationData) {
            if (localizationData[sourceName][langCode]?.[key]) {
                return localizationData[sourceName][langCode][key];
            }
        }
        return fallback;
    };

    const channel = {
        title: getGlobalTranslation('site_title', `Pelmeniboiler (${langCode.toUpperCase()})`),
        description: getGlobalTranslation('site_description', 'Neat stuff I like.'),
        link: SITE_URL,
        language: langCode,
        lastBuildDate: new Date().toUTCString(),
        generator: 'Pelmeniboiler RSS Builder',
    };

    const translatedItems = [];
    for (const post of processedPosts) {
        if (!post.translationSource) continue;
        const translationTable = localizationData[post.translationSource]?.[langCode];
        if (!translationTable) continue;

        const docCopy = new JSDOM(post.doc.documentElement.outerHTML).window.document;
        docCopy.querySelectorAll('[data-key]').forEach((el) => {
            const key = el.dataset.key;
            if (key && translationTable[key]) {
                el.innerHTML = translationTable[key];
            }
        });

        const title =
            docCopy.querySelector('article.content h1')?.textContent ||
            docCopy.querySelector('title')?.textContent ||
            'Untitled';
        const description = cleanHtmlForRss(docCopy, channel.link);
        // Point each language's feed at that language's pre-built page.
        const slug = post.filename.replace(/\.html$/, '');
        const link = `${channel.link}blog/${slug}/${langCode}/`;
        translatedItems.push({ title, link, description, pubDate: post.pubDate, guid: link });
    }

    if (translatedItems.length === 0) return false;

    translatedItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    const rssFeed = buildRssFeed(channel, translatedItems);

    const langDir = path.join(outputDir, langCode);
    await fs.mkdir(langDir, { recursive: true });
    await fs.writeFile(path.join(langDir, 'feed.xml'), rssFeed);
    return true;
}

function buildRssFeed(channel, items) {
    const currentYear = new Date().getFullYear();
    const itemXml = items.map((item) => `
        <item>
            <title>${escapeXml(item.title)}</title>
            <link>${item.link}</link>
            <description><![CDATA[${item.description}]]></description>
            <pubDate>${item.pubDate}</pubDate>
            <guid isPermaLink="true">${item.guid}</guid>
        </item>`).join('');

    return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${channel.link}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${channel.language}</language>
    <copyright>2021-${currentYear} Wendy Zhulkovsky PIT License, Several Rights Reserved.</copyright>
    <ttl>60</ttl>
    <image>
        <url>https://pelmeniboiler.github.io/logo/shzh.svg</url>
        <title>${escapeXml(channel.title)}</title>
        <link>${channel.link}</link>
    </image>
    <generator>${escapeXml(channel.generator)}</generator>
    <lastBuildDate>${channel.lastBuildDate}</lastBuildDate>
    <atom:link href="${channel.link}rss/${channel.language}/feed.xml" rel="self" type="application/rss+xml" />${itemXml}
</channel>
</rss>`;
}

function escapeXml(unsafe) {
    const replacements = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
    return unsafe.replace(/[<>&'"]/g, (c) => replacements[c]);
}

main().catch((error) => {
    console.error(`❌ Build failed: ${error.message}`);
    process.exit(1);
});
