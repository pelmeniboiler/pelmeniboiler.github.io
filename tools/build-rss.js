// A command-line script to generate multi-lingual RSS feeds.
// To run: `node tools/build-rss.js` from the project root.
//
// REQUIRES: `jsdom` to be installed (`npm install jsdom`)

const fs = require('fs').promises;
const path = require('path');
const { JSDOM } = require('jsdom');

// --- Configuration ---
// These paths are relative to the project root.
const ROOT_DIR = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const LOCALIZATION_DIR = path.join(ROOT_DIR, 'localization');
const OUTPUT_DIR = ROOT_DIR; // Feeds will be saved in the project's root folder.

/**
 * Main function to orchestrate the feed generation.
 */
async function main() {
    console.log("Starting RSS feed generation...");

    try {
        // Load all data in parallel
        const [localizationData, blogPostPaths] = await Promise.all([
            loadLocalizationFiles(),
            loadBlogFiles()
        ]);
        
        console.log(`Found ${blogPostPaths.length} blog posts and localization data.`);

        // Get all unique language codes from all translation files
        const allLanguages = new Set();
        Object.values(localizationData).forEach(fileContent => {
            Object.keys(fileContent).forEach(langCode => allLanguages.add(langCode));
        });
        console.log(`Found languages: ${Array.from(allLanguages).join(', ')}`);

        // Generate a feed for each language
        for (const langCode of allLanguages) {
            await generateFeedForLanguage(langCode, localizationData, blogPostPaths);
        }

        console.log("\n✅ All RSS feeds generated successfully!");

    } catch (error) {
        console.error("\n❌ An error occurred during feed generation:", error);
        process.exit(1); // Exit with an error code
    }
}

/**
 * Scans the localization directory and loads all .json files.
 * @returns {Promise<object>} An object containing the parsed data from all JSON files.
 */
async function loadLocalizationFiles() {
    const localizationFiles = await fs.readdir(LOCALIZATION_DIR);
    const localizationData = {};

    for (const fileName of localizationFiles) {
        if (fileName.endsWith('.json')) {
            const filePath = path.join(LOCALIZATION_DIR, fileName);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const key = fileName.replace('.json', '');
            localizationData[key] = JSON.parse(fileContent);
        }
    }
    return localizationData;
}

/**
 * Scans the blog directory for all .html files.
 * @returns {Promise<string[]>} A list of full paths to blog post files.
 */
async function loadBlogFiles() {
    const files = await fs.readdir(BLOG_DIR);
    return files
        .filter(file => file.endsWith('.html'))
        .map(file => path.join(BLOG_DIR, file));
}

/**
 * Generates and saves a single RSS feed for a given language.
 * @param {string} langCode The language code (e.g., 'en', 'ru').
 * @param {object} localizationData The master localization object.
 * @param {string[]} blogPostPaths A list of paths to the blog posts.
 */
async function generateFeedForLanguage(langCode, localizationData, blogPostPaths) {
    console.log(`\n-- Generating feed for: ${langCode.toUpperCase()} --`);
    
    // Helper to find a global translation key (like site_title)
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
        link: "https://pelmeniboiler.github.io/",
        language: langCode,
        lastBuildDate: new Date().toUTCString(),
        generator: 'Node.js RSS Generator'
    };

    const translatedItems = [];
    for (const postPath of blogPostPaths) {
        const htmlContent = await fs.readFile(postPath, 'utf-8');
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;
        
        const translationSourceEl = doc.querySelector('meta[name="translation-source"]');
        if (!translationSourceEl) {
            console.warn(`  [SKIP] ${path.basename(postPath)}: Missing <meta name="translation-source">`);
            continue;
        }
        const translationSource = translationSourceEl.getAttribute('content');
        const translationTable = localizationData[translationSource]?.[langCode];

        if (translationTable) {
            // Translate all elements with a data-key attribute
            doc.querySelectorAll('[data-key]').forEach(el => {
                const key = el.dataset.key;
                if (translationTable[key]) {
                    el.innerHTML = translationTable[key];
                }
            });

            const title = doc.querySelector('title')?.textContent || 'Untitled';
            const description = doc.querySelector('article.content')?.innerHTML || 'No content found.';
            const pubDateEl = doc.querySelector('meta[name="pubDate"]');
            const pubDate = pubDateEl ? new Date(pubDateEl.getAttribute('content')).toUTCString() : new Date().toUTCString();
            const link = `${channel.link}blog/${path.basename(postPath)}`;

            translatedItems.push({ title, link, description, pubDate, guid: link });
            console.log(`  [OK] Processed ${path.basename(postPath)} for ${langCode}`);
        }
    }

    if (translatedItems.length > 0) {
        // Sort items by date, newest first
        translatedItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        const rssFeed = buildRssFeed(channel, translatedItems);
        const outputFilename = `rss_${langCode}.xml`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);
        
        await fs.writeFile(outputPath, rssFeed);
        console.log(`  [SAVE] Successfully saved feed to ${outputFilename}`);
    } else {
        console.warn(`  [WARN] No articles found for language '${langCode}'. Feed not generated.`);
    }
}

/**
 * Builds the final RSS XML string from channel and item data.
 */
function buildRssFeed(channel, items) {
    const itemXml = items.map(item => `
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
    <generator>${channel.generator}</generator>
    <lastBuildDate>${channel.lastBuildDate}</lastBuildDate>
    <atom:link href="${channel.link}rss_${channel.language}.xml" rel="self" type="application/rss+xml" />${itemXml}
</channel>
</rss>`;
}

/**
 * Escapes special XML characters.
 */
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'}[c]));
}

// --- Run the main function ---
main();
