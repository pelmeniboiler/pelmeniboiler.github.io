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
import { JSDOM } from 'jsdom';

const ROOT_DIR = process.cwd();
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const LOCALIZATION_DIR = path.join(ROOT_DIR, 'localization');
const RSS_OUTPUT_DIR = path.join(ROOT_DIR, 'rss');
const SITE_URL = 'https://pelmeniboiler.github.io/';

async function main() {
    await fs.mkdir(RSS_OUTPUT_DIR, { recursive: true });

    console.log('Loading files...');
    const [localizationData, blogPostPaths] = await Promise.all([
        loadLocalizationFiles(LOCALIZATION_DIR),
        loadBlogFiles(BLOG_DIR),
    ]);

    const processedPosts = await processAllPosts(blogPostPaths);

    console.log('Generating blog manifest...');
    await generateBlogManifest(processedPosts, localizationData, BLOG_DIR);

    console.log('Generating per-language article pages...');
    const pageUrls = await generateLanguagePages(processedPosts, localizationData, BLOG_DIR);

    console.log('Generating sitemap...');
    await generateSitemap(pageUrls, processedPosts, ROOT_DIR);

    console.log('Determining languages...');
    const allLanguages = new Set();
    Object.values(localizationData).forEach((fileContent) => {
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
}

// --- Per-language static page generation (new) ---

// hreflang only accepts valid BCP-47 tags. Graflect ("gt") is a private
// constructed script with no valid tag, so we still build its page and link it
// from the in-page switcher, but omit it from hreflang (Google would ignore it).
const INVALID_HREFLANG = new Set(['gt']);
const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur']);

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
async function generateLanguagePages(processedPosts, localizationData, blogDir) {
    const globalData = localizationData.global || {};
    const builtUrls = [];

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

            // Head metadata: canonical, hreflang alternates, build markers.
            const selfUrl = `${SITE_URL}blog/${slug}/${lang}/`;
            const headBits = [];
            headBits.push(`<link rel="canonical" href="${selfUrl}">`);
            for (const l of hreflangLangs) {
                headBits.push(`<link rel="alternate" hreflang="${l}" href="${SITE_URL}blog/${slug}/${l}/">`);
            }
            if (hreflangLangs.includes('en')) {
                headBits.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}blog/${slug}/en/">`);
            }
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

            const outDir = path.join(blogDir, slug, lang);
            await fs.mkdir(outDir, { recursive: true });
            await fs.writeFile(path.join(outDir, 'index.html'), dom.serialize());
            builtUrls.push({ loc: selfUrl, pubDate: post.pubDate });
        }
    }

    console.log(`  → built ${builtUrls.length} language pages.`);
    return builtUrls;
}

/**
 * Emit a sitemap.xml covering the homepage and every built per-language page.
 */
async function generateSitemap(pageUrls, processedPosts, rootDir) {
    const urls = [
        `  <url><loc>${SITE_URL}</loc></url>`,
        ...pageUrls.map(({ loc, pubDate }) => {
            const lastmod = new Date(pubDate).toISOString().slice(0, 10);
            return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`;
        }),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
