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
    await generateBlogManifest(processedPosts, BLOG_DIR);

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
        };
    });
    return Promise.all(postPromises);
}

async function generateBlogManifest(processedPosts, blogDir) {
    const manifestItems = [];

    for (const post of processedPosts) {
        if (!post.translationSource) continue;

        const prefix = post.translationSource;

        // Determine title key: prefer "<prefix>_title", else first h1[data-key].
        let titleKey = null;
        const preferredTitleKey = `${prefix}_title`;
        if (post.doc.querySelector(`[data-key="${preferredTitleKey}"]`)) {
            titleKey = preferredTitleKey;
        } else {
            const titleEl = post.doc.querySelector('article.content h1[data-key]');
            titleKey = titleEl?.getAttribute('data-key') || null;
        }

        const descriptionEl = post.doc.querySelector('article.content p[data-key]');
        const descriptionKey = descriptionEl?.getAttribute('data-key') || null;

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
        const link = `${channel.link}blog/${post.filename}`;
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
