// test/site.test.mjs
// Browser smoke tests for the built site. Run `npm run build` first, then
// `npm test`. Drives real headless Chromium (Playwright) against a throwaway
// local server and asserts the behaviors we've shipped keep working:
// language routing, no-clobber hydration, favicon theming, e-ink dithering,
// offline PWA, share, print, zine, canonical links, the notify bell, etc.
//
// CHROMIUM_PATH env var overrides the browser binary (useful in sandboxes);
// otherwise Playwright's own installed Chromium is used.

import { chromium } from 'playwright';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Tests run against the built site (npm run build), not the sources.
const ROOT = path.join(process.cwd(), '_site');
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.xml': 'application/xml', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf', '.otf': 'font/otf',
};

function startServer() {
    const server = http.createServer(async (req, res) => {
        try {
            let urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
            if (urlPath.endsWith('/')) urlPath += 'index.html';
            const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
            if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            const data = await fs.readFile(filePath);
            res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
            res.end(data);
        } catch {
            res.writeHead(404); res.end('not found');
        }
    });
    return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { (cond ? pass++ : fail++); console.log(`${cond ? '✅' : '❌'} ${msg}`); };

const server = await startServer();
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
    // ============ HUB ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForSelector('#blog-posts-list a[data-slug]', { timeout: 10000 });

        const href = await page.getAttribute('#blog-posts-list a[data-slug="sunshine"]', 'href');
        ok(href === '/blog/sunshine/en/', `Hub: sunshine link defaults to English page (got ${href})`);

        const cardCount = await page.locator('#blog-posts-list .blog-post').count();
        ok(cardCount >= 6, `Hub: blog list is baked static HTML (${cardCount} cards)`);

        await page.evaluate(() => document.querySelector('.filter-btn[data-keyword="Photos"]').click());
        const hidden = await page.evaluate(() => {
            const card = document.querySelector('#blog-posts-list a[data-slug="sunshine"]')?.closest('.blog-post');
            return card && getComputedStyle(card).display === 'none';
        });
        ok(hidden, 'Hub: keyword filter hides non-matching cards');
        await page.evaluate(() => document.querySelector('.filter-btn[data-keyword="All"]').click());

        const dateText = (await page.textContent('#blog-posts-list .post-date'))?.trim();
        ok(/57\d\d/.test(dateText), `Hub: dates render Anno Mundi (got "${dateText}")`);

        const about = await page.evaluate(() => document.querySelector('[data-key="about_p"]')?.textContent || '');
        ok(about.startsWith('Interlinked interdisciplinary'), `Hub: inter-wordplay about text baked (got "${about.slice(0, 40)}…")`);

        await page.evaluate(() => document.querySelector('.custom-dropdown-item[data-value="ja"]').click());
        await page.waitForFunction(() =>
            document.querySelector('#blog-posts-list a[data-slug="sunshine"]')?.getAttribute('href') === '/blog/sunshine/ja/',
            { timeout: 10000 }).catch(() => {});
        const jaHref = await page.getAttribute('#blog-posts-list a[data-slug="sunshine"]', 'href');
        ok(jaHref === '/blog/sunshine/ja/', `Hub: switching to JA re-points links (got ${jaHref})`);
        const jaDate = (await page.textContent('#blog-posts-list .post-date'))?.trim();
        ok(/令和|平成/.test(jaDate), `Hub: JA dates use the imperial era (got "${jaDate}")`);
        await ctx.close();
    }

    // ============ ARTICLE (fully baked, no demos) ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        let locReqs = 0;
        page.on('request', (r) => { if (r.url().includes('/localization/')) locReqs++; });

        await page.goto(`${BASE}/blog/sunshine/ja/`, { waitUntil: 'load' });
        await page.waitForTimeout(600);
        ok(locReqs === 0, `Article JA (no demos): zero localization fetches (got ${locReqs})`);

        const h1 = (await page.textContent('#title'))?.trim();
        ok(/[぀-ヿ一-鿿]/.test(h1 || ''), `Article JA: heading stays Japanese (got "${h1}")`);
        ok(await page.getAttribute('html', 'lang') === 'ja', 'Article JA: <html lang> is ja');

        const chrome = await page.evaluate(() => document.querySelector('[data-key="win_settings_title"]')?.innerHTML || '');
        ok(/システム/.test(chrome), 'Article JA: baked settings chrome is localized');

        await page.evaluate(() => document.querySelector('.custom-dropdown-item[data-value="en"]').click());
        await page.waitForURL('**/blog/sunshine/en/', { timeout: 10000 }).catch(() => {});
        ok(new URL(page.url()).pathname === '/blog/sunshine/en/', `Article: language switch NAVIGATES (${page.url()})`);
        await ctx.close();
    }

    // ============ RTL + demo pages still fetch ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        let locReqs = 0;
        page.on('request', (r) => { if (r.url().includes('/localization/')) locReqs++; });
        await page.goto(`${BASE}/blog/graflect/he/`, { waitUntil: 'load' });
        await page.waitForTimeout(600);
        ok(await page.getAttribute('html', 'dir') === 'rtl', 'Article HE: <html dir> is rtl');
        ok(locReqs > 0, `Article with demos: DOES fetch localization (got ${locReqs})`);
        await ctx.close();
    }

    // ============ E-INK: theme lock + true dithering ============
    {
        const ctx = await browser.newContext();
        await ctx.addInitScript(() => {
            localStorage.setItem('pelmeniboiler-mode', 'eink');
            localStorage.setItem('pelmeniboiler-theme', 'light');
        });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        await page.waitForTimeout(600);

        const funkyDisabled = await page.evaluate(() =>
            document.querySelector('input[name="theme"][value="funky"]')?.disabled === true);
        ok(funkyDisabled, 'E-ink on load: colour presets disabled without toggling');

        await page.waitForFunction(() => document.querySelector('article.content img.dithered'), { timeout: 10000 }).catch(() => {});
        const dither = await page.evaluate(() => {
            const img = document.querySelector('article.content img.dithered');
            if (!img) return null;
            const c = document.createElement('canvas');
            const w = c.width = Math.min(200, img.naturalWidth); const h = c.height = Math.min(200, img.naturalHeight);
            const x = c.getContext('2d'); x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, w, h).data;
            let bw = 0, other = 0;
            for (let i = 0; i < d.length; i += 4) {
                const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
                if ((r === g && g === b) && (r < 8 || r > 247)) bw++; else other++;
            }
            return { bw, other, src: img.currentSrc || img.src };
        });
        ok(dither && /\/img\/photos\/.+-eink\.png$/.test(dither.src) && dither.bw > dither.other * 20,
            `E-ink: photos use the build-time 1-bit dither (bw=${dither?.bw}, other=${dither?.other}, src=${dither?.src.split('/').pop()})`);
        await ctx.close();
    }

    // ============ FAVICON theming ============
    {
        const ctx = await browser.newContext();
        await ctx.addInitScript(() => {
            localStorage.setItem('pelmeniboiler-mode', 'eink');
            localStorage.setItem('pelmeniboiler-theme', 'dark');
        });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        await page.waitForFunction(() =>
            document.getElementById('dynamic-favicon')?.getAttribute('href')?.startsWith('data:image/png'),
            { timeout: 5000 }).catch(() => {});
        const fav = await page.evaluate(async () => {
            const href = document.getElementById('dynamic-favicon')?.getAttribute('href') || '';
            if (!href.startsWith('data:image/png')) return null;
            const img = new Image();
            await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = href; });
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const x = c.getContext('2d'); x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            let dark = 0, light = 0;
            for (let i = 0; i < d.length; i += 4) {
                const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
                if (l < 96) dark++; else if (l > 160) light++;
            }
            return { dark, light };
        });
        ok(fav && fav.dark > 50 && fav.light > 50, `Favicon (dark theme): dark tile + light logo (${JSON.stringify(fav)})`);
        await ctx.close();
    }

    // ============ PRINT styles ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });
        const r = await page.evaluate(() => ({
            nav: getComputedStyle(document.querySelector('#nav-window')).display,
            pos: getComputedStyle(document.querySelector('#gallery-window')).position,
        }));
        ok(r.nav === 'none' && r.pos === 'static', `Print: chrome hidden, article reflows (${JSON.stringify(r)})`);
        await ctx.close();
    }

    // ============ SHARE (single chain button, copies highlight link) ============
    {
        const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        await page.waitForTimeout(400);
        const btns = await page.locator('#gallery-window .title-bar .share-titlebar-btn').count();
        ok(btns === 1, `Share: exactly one titlebar share button (got ${btns})`);
        await page.evaluate(() => {
            const el = document.querySelector('article.content p');
            const r = document.createRange(); r.selectNodeContents(el);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
        await page.waitForSelector('#share-copy-url-btn', { state: 'visible', timeout: 3000 });
        await page.click('#share-copy-url-btn');
        await page.waitForTimeout(500);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok(clip.includes('#highlight='), 'Share: chain button copies precise highlight link');
        await ctx.close();
    }

    // ============ ZINE ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE}/zine/en/`, { waitUntil: 'load' });
        const arts = await page.locator('.zine-article').count();
        const firstDateAfterCover = await page.evaluate(() => document.querySelector('.zine-article .post-date')?.textContent || '');
        ok(arts >= 6, `Zine: contains all articles (${arts})`);
        ok(/57\d\d/.test(firstDateAfterCover), `Zine: Anno Mundi dates (got "${firstDateAfterCover}")`);
        const jaZine = await page.goto(`${BASE}/zine/ja/`, { waitUntil: 'load' });
        ok(jaZine.ok() && await page.getAttribute('html', 'lang') === 'ja', 'Zine: per-language editions exist');
        await ctx.close();
    }

    // ============ CANONICAL on legacy flat pages ============
    {
        const html = await fs.readFile(path.join(ROOT, 'blog/sunshine.html'), 'utf-8');
        const m = html.match(/<link rel="canonical" href="([^"]+)"/);
        ok(m && m[1].endsWith('/blog/sunshine/en/'), `Legacy page canonical → per-language URL (got ${m && m[1]})`);
    }

    // ============ NOTIFY BELL (dev-forced standalone) ============
    {
        const ctx = await browser.newContext({ permissions: ['notifications'] });
        await ctx.addInitScript(() => localStorage.setItem('pelmeniboiler-force-bell', '1'));
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForSelector('#notify-bell-btn', { timeout: 5000 }).catch(() => {});
        ok(await page.locator('#notify-bell-btn').count() === 1, 'Bell: appears in (forced) standalone mode');

        await page.click('#notify-bell-btn');
        const rows = await page.locator('.notify-dropdown .notify-row').count();
        ok(rows >= 3, `Bell: dropdown offers All + categories (${rows} rows)`);

        await page.check('#notify-enabled');
        await page.waitForTimeout(800);
        const prefs = await page.evaluate(async () => {
            const cache = await caches.open('pelmeniboiler-meta');
            const hit = await cache.match('/notify-prefs');
            return hit ? await hit.json() : null;
        });
        ok(prefs && prefs.enabled === true, `Bell: prefs reach the service worker store (${JSON.stringify(prefs)})`);

        // Baseline was written on enable; simulate a NEW post by removing one
        // from "seen", ask the worker to check, and expect seen to be restored.
        const recheck = await page.evaluate(async () => {
            const cache = await caches.open('pelmeniboiler-meta');
            const seen = await (await cache.match('/notify-seen')).json();
            const removed = seen.slice(1);
            await cache.put('/notify-seen', new Response(JSON.stringify(removed)));
            const reg = await navigator.serviceWorker.ready;
            reg.active.postMessage({ type: 'check-new-posts' });
            // Poll rather than sleep a fixed 1.2 s: CI runners are slower than a laptop.
            let after = removed;
            for (let i = 0; i < 50 && after.length !== seen.length; i++) {
                await new Promise((r) => setTimeout(r, 200));
                after = await (await cache.match('/notify-seen')).json();
            }
            return { before: seen.length, mid: removed.length, after: after.length };
        });
        ok(recheck.after === recheck.before, `Bell: worker detects new posts and re-baselines (${JSON.stringify(recheck)})`);
        await ctx.close();
    }

    // ============ BELL ABSENT in a normal tab ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        ok(await page.locator('#notify-bell-btn').count() === 0, 'Bell: hidden in a plain browser tab');
        await ctx.close();
    }

    // ============ THEMED MANIFEST (icon follows theme at install time) ============
    {
        const ctx = await browser.newContext();
        await ctx.addInitScript(() => {
            localStorage.setItem('pelmeniboiler-mode', 'lcd');
            localStorage.setItem('pelmeniboiler-theme', 'techelet');
        });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        const mhref = await page.getAttribute('link[rel="manifest"]', 'href');
        ok(mhref === '/manifest-techelet.json', `Manifest follows theme (got ${mhref})`);
        const mResp = await page.evaluate(async () => (await fetch('/manifest-techelet.json')).json());
        ok(mResp.theme_color === '#4169E1' && mResp.icons[0].src.includes('techelet'),
            `Techelet manifest carries themed colours + icons (${mResp.theme_color})`);
        await ctx.close();
    }

    // ============ SOFRUT multiplex (no page scroll on wide screens) ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/tools/sofrut.html`, { waitUntil: 'load' });
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => ({
            display: getComputedStyle(document.querySelector('.forge')).display,
            pageScroll: document.scrollingElement.scrollHeight - window.innerHeight,
            panes: document.querySelectorAll('.forge > .window').length,
        }));
        ok(r.display === 'grid' && r.panes === 6 && r.pageScroll <= 1,
            `Sofrut: 6 panes multiplexed in a grid, no page scroll (${JSON.stringify(r)})`);
        await ctx.close();
    }

    // ============ APP LIBRARY (baked) ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        const lib = await page.evaluate(() => {
            const demosFolder = document.querySelector('#app-library .app-folder-demos');
            return {
                exists: !!document.getElementById('app-library'),
                // hoi4 folder: a top-level folder that isn't the demos container.
                hoiItems: [...document.querySelectorAll('#app-library .app-folder .app-list a')]
                    .filter((a) => !a.closest('.app-folder-demos')).length,
                // demos.from.articles: each host article is its own nested folder.
                demoArticleFolders: demosFolder ? demosFolder.querySelectorAll('.app-folder').length : 0,
                demos: demosFolder ? demosFolder.querySelectorAll('.app-list a').length : 0,
                workbench: document.getElementById('app-library').textContent.includes('graflect.workbench'),
            };
        });
        ok(lib.exists && lib.hoiItems === 2 && lib.demoArticleFolders >= 1 && lib.demos >= 3 && !lib.workbench,
            `App library: hoi4 folder + per-article demo folders, graflect.workbench suppressed (${JSON.stringify(lib)})`);
        await ctx.close();
    }

    // ============ TRAY: minimized windows + calendar clock ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(800); // modules + start-menu wiring

        const clock = (await page.textContent('#tray-clock').catch(() => '')) || '';
        ok(/57\d\d/.test(clock) && /[א-ת]{1,2}׳/.test(clock) && /ח/.test(clock) && !/\d{2}:\d{2}/.test(clock),
            `Tray clock: Anno Mundi date + HEBREW time of day, no civil HH:MM (got "${clock}")`);

        // Close a window that started open → docks to tray as an icon.
        await page.evaluate(() => {
            const win = document.getElementById('about-window');
            win.querySelector('.close-btn').click();
        });
        await page.waitForTimeout(300);
        const trayCount = await page.locator('#tray-icons .tray-icon').count();
        ok(trayCount === 1, `Tray: closed started-open window docks as icon (${trayCount})`);

        await page.click('#tray-icons .tray-icon');
        await page.waitForTimeout(300);
        const reopened = await page.evaluate(() =>
            getComputedStyle(document.getElementById('about-window')).display !== 'none');
        const trayAfter = await page.locator('#tray-icons .tray-icon').count();
        ok(reopened && trayAfter === 0, 'Tray: clicking the icon restores the window');
        await ctx.close();
    }

    // ============ TRAY IS THE LAUNCHER (wide): logo, settings, clock window ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(800);

        const launcher = await page.evaluate(() => ({
            startMenuHidden: getComputedStyle(document.querySelector('.start-menu')).display === 'none',
            logo: !!document.getElementById('tray-logo'),
            settings: !!document.getElementById('tray-settings'),
        }));
        ok(launcher.startMenuHidden && launcher.logo && launcher.settings,
            `Tray is the launcher on wide: start-menu hidden, ShZh + ⚙ present (${JSON.stringify(launcher)})`);

        // Custom themed SVG cursors: default on the page, yod-pointer on links,
        // move on title bars — all baked data-URIs (no fallback to a keyword).
        const cursors = await page.evaluate(() => {
            const c = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).cursor : ''; };
            return { body: c('body'), link: c('a'), titlebar: c('.title-bar') };
        });
        ok(/^url\("data:image\/svg/.test(cursors.body) && /^url\("data:image\/svg/.test(cursors.link)
            && /^url\("data:image\/svg/.test(cursors.titlebar),
            `Custom SVG cursors applied (default/pointer/move are data-URIs)`);

        await page.click('#tray-settings');
        await page.waitForTimeout(300);
        const settingsOpen = await page.evaluate(() =>
            getComputedStyle(document.getElementById('settings-main-window')).display !== 'none');
        ok(settingsOpen, 'Tray ⚙ opens the settings window');

        // Zmanim clock: click the tray clock, verify the window + live values.
        await page.click('#tray-clock');
        await page.waitForTimeout(600);
        const zman = await page.evaluate(() => ({
            open: getComputedStyle(document.getElementById('zman-clock-window')).display !== 'none',
            chalakim: parseInt(document.getElementById('zman-chalakim').textContent, 10),
            heb: document.getElementById('zman-hebdate').textContent,
            letters: document.querySelectorAll('#zman-letters text').length,
            hand: document.getElementById('zman-hand').getAttribute('transform') || '',
            // The day/night indicator must be an SVG shape, NOT an OS colour emoji.
            dnSvg: document.querySelectorAll('#zman-daynight circle, #zman-daynight path, #zman-daynight line').length,
            dnText: (document.getElementById('zman-daynight')?.textContent || '').trim(),
            loc: document.getElementById('zman-loc-label')?.textContent || '',
            zmanim: document.querySelectorAll('#zman-list li').length,
            zmanNext: document.querySelectorAll('#zman-list li.zman-next').length,
            zmanimText: (document.getElementById('zman-list')?.textContent || '').trim(),
            zmarks: document.querySelectorAll('#zman-zmarks circle').length,
            zmanTableFolded: !document.querySelector('.zman-details')?.open,
            molad: (document.getElementById('zman-molad')?.textContent || '').trim(),
        }));
        const regaimA = await page.textContent('#zman-regaim');
        await page.waitForTimeout(250);
        const regaimB = await page.textContent('#zman-regaim');
        ok(zman.open && zman.letters === 12 && zman.chalakim >= 0 && zman.chalakim < 1080,
            `Zmanim clock opens: 12 Hebrew hour letters, chalakim in range (${zman.chalakim})`);
        ok(/57\d\d|5\d{3}/.test(zman.heb) && /Yom|Shabbat/.test(zman.heb) && !/[A-Z][a-z]+day/.test(zman.heb),
            `Zmanim clock: sunset-adjusted date with transliterated weekday (got "${zman.heb}")`);
        ok(/rotate\(-/.test(zman.hand), `Zmanim clock: hour hand runs COUNTERCLOCKWISE (${zman.hand})`);
        ok(zman.dnSvg >= 1 && zman.dnText === '',
            `Zmanim clock: day/night drawn as monochrome SVG, no emoji glyph (shapes=${zman.dnSvg})`);
        ok(zman.loc === 'Jerusalem', `Zmanim clock: default location localized in the geo button (got "${zman.loc}")`);
        ok(zman.zmanim === 8 && zman.zmarks === 6 && zman.zmanTableFolded && zman.zmanNext <= 1
            && !/\d{2}:\d{2}/.test(zman.zmanimText) && /Molad/i.test(zman.molad) && /Yom|Shabbat/.test(zman.molad),
            `Zmanim clock: 6 dial dots + foldaway 8-row table in sha'ot zmaniyot (no civil time) + molad (marks=${zman.zmarks}, folded=${zman.zmanTableFolded})`);
        ok(regaimA !== regaimB, `Zmanim clock: regaim tick live in LCD (${regaimA} → ${regaimB})`);

        // Sha'ot zmaniyot: in Israel's summer the DAYTIME hours run longer than
        // the nighttime hours (and the reverse in winter) — the whole point.
        const dayNight = await page.evaluate(() => ({
            summer: window.zmanPeriodLengths(new Date('2026-07-03T09:00:00Z')),
            winter: window.zmanPeriodLengths(new Date('2026-01-03T09:00:00Z')),
        }));
        ok(dayNight.summer.day > dayNight.summer.night && dayNight.winter.day < dayNight.winter.night,
            `Sha'ot zmaniyot: summer day-hours > night-hours, winter reversed (${Math.round(dayNight.summer.day / 60000)}m vs ${Math.round(dayNight.summer.night / 60000)}m)`);

        const subs = await page.evaluate(() => ({
            chCoarse: document.getElementById('zman-sub-ch-coarse')?.getAttribute('transform') || '',
            chFine: document.getElementById('zman-sub-ch-fine')?.getAttribute('transform') || '',
            rg: document.getElementById('zman-sub-rg')?.getAttribute('transform') || '',
            ticks: document.querySelectorAll('#zman-ch-ticks .zman-subtick').length,
            labels: [...document.querySelectorAll('.zman-units [data-key]')].map((e) => e.dataset.key),
        }));
        ok(/rotate\(-/.test(subs.chCoarse) && /rotate\(-/.test(subs.chFine) && /rotate\(-/.test(subs.rg)
            && subs.ticks === 12 && subs.labels.length === 2,
            `Zmanim clock: two-hand chalakim register (12 marks) + regaim subdial turning, labels localized (${JSON.stringify(subs.labels)})`);

        // E-INK: the clock must NOT animate — regaim frozen between samples.
        const einkCtx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        await einkCtx2.addInitScript(() => localStorage.setItem('pelmeniboiler-mode', 'eink'));
        const einkPage = await einkCtx2.newPage();
        await einkPage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await einkPage.waitForTimeout(800);
        await einkPage.click('#tray-clock');
        await einkPage.waitForTimeout(400);
        const eA = await einkPage.textContent('#zman-regaim');
        await einkPage.waitForTimeout(500);
        const eB = await einkPage.textContent('#zman-regaim');
        ok(eA === eB && eA !== '–', `Zmanim clock: NO animation in e-ink mode (${eA} = ${eB})`);
        await einkCtx2.close();

        // REDUCED MOTION: prefers-reduced-motion halts the needle too (like e-ink).
        const rmCtx = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
        const rmPage = await rmCtx.newPage();
        await rmPage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await rmPage.waitForTimeout(800);
        await rmPage.click('#tray-clock');
        await rmPage.waitForTimeout(400);
        const rA = await rmPage.textContent('#zman-regaim');
        await rmPage.waitForTimeout(500);
        const rB = await rmPage.textContent('#zman-regaim');
        ok(rA === rB && rA !== '–', `Zmanim clock: NO animation with prefers-reduced-motion (${rA} = ${rB})`);
        await rmCtx.close();

        // About window: description wraps at the heading's width.
        const about = await page.evaluate(() => {
            const h2 = document.querySelector('#about-window h1').getBoundingClientRect().width;
            const p = document.querySelector('#about-window p').getBoundingClientRect().width;
            return { h2: Math.round(h2), p: Math.round(p) };
        });
        ok(about.p <= about.h2 + 2, `About: description no wider than the name heading (${JSON.stringify(about)})`);
        await ctx.close();
    }

    // ============ RESET BUTTON: clears state + caches ============
    {
        const ctx = await browser.newContext();
        await ctx.addInitScript(() => {
            window.confirm = () => true;
            // Init scripts run on EVERY navigation — including the post-reset
            // reload — so seed the state to be cleared only once.
            if (!sessionStorage.getItem('reset-test-seeded')) {
                sessionStorage.setItem('reset-test-seeded', '1');
                localStorage.setItem('pelmeniboiler-theme', 'akai');
                localStorage.setItem('pelmeniboiler-liquid-glass', '1');
            }
        });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForSelector('#reset-site-btn', { state: 'attached', timeout: 8000 });
        // The button exists once the module HTML is injected, but its handler is
        // bound by settings.js — wait for settings to finish wiring first.
        await page.waitForFunction(() => window.translationsData, { timeout: 10000 });
        await page.evaluate(() => document.getElementById('reset-site-btn').click());
        await page.waitForTimeout(1500); // reset + reload
        const after = await page.evaluate(() => ({
            theme: localStorage.getItem('pelmeniboiler-theme'),
            glass: localStorage.getItem('pelmeniboiler-liquid-glass'),
            glassClass: document.documentElement.classList.contains('liquid-glass'),
        }));
        ok(after.theme === null && after.glass === null && !after.glassClass,
            `Reset button clears saved state and reloads clean (${JSON.stringify(after)})`);
        await ctx.close();
    }

    // ============ FONTS: every face loads, WOFF2 only, emoji monochrome ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const fontUrls = [];
        page.on('request', (r) => { if (r.resourceType() === 'font') fontUrls.push(r.url()); });
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        const r = await page.evaluate(async () => {
            const faces = [...document.fonts];
            await Promise.all(faces.map((f) => f.load().catch(() => {})));
            const declared = new Set(faces.map((f) => f.family.replace(/["']/g, '')));
            const stack = getComputedStyle(document.documentElement).getPropertyValue('--font-emoji');
            const named = [...stack.matchAll(/'([^']+)'/g)].map((m) => m[1]);
            const c = document.createElement('canvas'); c.width = c.height = 80;
            const g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 80);
            g.font = '64px TwitterBWEmoji'; g.fillStyle = '#000'; g.textBaseline = 'top';
            g.fillText('\u{1F339}', 4, 4); // rose: red + green in the colour font
            const d = g.getImageData(0, 0, 80, 80).data;
            let ink = 0, colour = 0;
            for (let i = 0; i < d.length; i += 4) {
                const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
                if (R < 200) ink++;
                if (Math.max(R, G, B) - Math.min(R, G, B) > 40) colour++;
            }
            return {
                failed: faces.filter((f) => f.status !== 'loaded').map((f) => f.family),
                undeclared: named.filter((n) => !declared.has(n)),
                ink, colour,
            };
        });
        ok(r.failed.length === 0, `Fonts: every @font-face loads (failed: ${JSON.stringify(r.failed)})`);
        ok(r.undeclared.length === 0, `Fonts: every --font-emoji name is a declared face (undeclared: ${JSON.stringify(r.undeclared)})`);
        ok(fontUrls.length > 0 && fontUrls.every((u) => u.endsWith('.woff2')),
            `Fonts: browsers fetch WOFF2, never TTF (${fontUrls.map((u) => u.split('/').pop()).join(', ')})`);
        ok(r.ink > 200 && r.colour === 0, `Fonts: Twemoji renders monochrome (ink=${r.ink}, colour=${r.colour})`);
        await ctx.close();
    }

    // ============ IMAGES: <picture>, modern formats, sizes, e-ink never fetches originals ============
    {
        const fetched = async (mode) => {
            const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
            await ctx.addInitScript((m) => localStorage.setItem('pelmeniboiler-mode', m), mode);
            const page = await ctx.newPage();
            const urls = [];
            page.on('request', (r) => { if (r.resourceType() === 'image') urls.push(decodeURI(new URL(r.url()).pathname)); });
            await page.goto(`${BASE}/blog/elizabeth_park/en/`, { waitUntil: 'load' });
            await page.waitForTimeout(800);
            const info = await page.evaluate(() => {
                const imgs = [...document.querySelectorAll('article.content img[src^="/photos/"]')];
                return {
                    total: imgs.length,
                    inPicture: imgs.filter((i) => i.parentElement.tagName === 'PICTURE').length,
                    sized: imgs.filter((i) => i.getAttribute('width') && i.getAttribute('height')).length,
                    lazy: imgs.filter((i) => i.loading === 'lazy').length,
                    first: imgs[0]?.currentSrc || '',
                };
            });
            await ctx.close();
            return { urls, info };
        };
        const lcd = await fetched('lcd');
        ok(lcd.info.total > 10 && lcd.info.inPicture === lcd.info.total && lcd.info.sized === lcd.info.total,
            `Images: every photo is a sized <picture> (${JSON.stringify(lcd.info)})`);
        ok(lcd.info.lazy === lcd.info.total - 1, `Images: all but the first photo lazy-load (${lcd.info.lazy}/${lcd.info.total})`);
        ok(/\.avif$/.test(lcd.info.first) && !lcd.urls.some((u) => u.startsWith('/photos/')),
            `Images: LCD mode loads AVIF and never the original PNGs (first=${lcd.info.first.split('/').pop()})`);
        // Alt text: every article image in every built language page has some.
        const missing = [];
        for (const dir of await fs.readdir(path.join(ROOT, 'blog'), { withFileTypes: true })) {
            if (!dir.isDirectory()) continue;
            for (const lang of await fs.readdir(path.join(ROOT, 'blog', dir.name)).catch(() => [])) {
                const html = await fs.readFile(path.join(ROOT, 'blog', dir.name, lang, 'index.html'), 'utf8').catch(() => '');
                for (const m of html.matchAll(/<img\b[^>]*>/g)) {
                    if (!/\balt="[^"]+"/.test(m[0]) && /\/photos\//.test(m[0])) missing.push(`${dir.name}/${lang}`);
                }
            }
        }
        ok(missing.length === 0, `Images: every article photo has alt text in every language page (${missing.length} missing${missing.length ? ': ' + [...new Set(missing)].join(', ') : ''})`);

        const eink = await fetched('eink');
        ok(eink.urls.some((u) => u.endsWith('-eink.png')) && !eink.urls.some((u) => u.startsWith('/photos/')),
            `Images: e-ink mode loads pre-dithered files, never the original PNGs (${eink.urls.filter((u) => u.startsWith('/photos/')).length} originals)`);
    }

    // ============ TILED DESKTOP: no-JS layout + hidden developer preview ============
    {
        const PANES = ['blog-window', 'app-library', 'music-window', 'logo-window', 'about-window'];
        const layout = (page) => page.evaluate((ids) => {
            const vw = innerWidth, vh = innerHeight;
            const rects = ids.map((id) => {
                const el = document.getElementById(id);
                const r = el.getBoundingClientRect();
                return { id, shown: getComputedStyle(el).display !== 'none', l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width };
            });
            let overlaps = 0;
            const shown = rects.filter((r) => r.shown);
            for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
                const a = shown[i], b = shown[j];
                if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) overlaps++;
            }
            const bar = document.getElementById('tile-bar');
            return {
                shown: shown.length, overlaps,
                inView: shown.every((r) => r.l >= 0 && r.r <= vw + 1 && r.b <= vh + 1),
                hScroll: document.documentElement.scrollWidth > vw + 1,
                bar: getComputedStyle(bar).display !== 'none' ? bar.querySelectorAll('a').length : 0,
                closeBtns: [...document.querySelectorAll('#desktop > .window .close-btn')].filter((b) => getComputedStyle(b).display !== 'none').length,
                rects: Object.fromEntries(rects.map((r) => [r.id, { ...r, h: r.b - r.t }])),
                logo: (() => {
                    const c = document.querySelector('#logo-window > .content'), i = c.querySelector('img, svg');
                    const cr = c.getBoundingClientRect(), ir = i.getBoundingClientRect();
                    return { slackX: Math.round(cr.width - ir.width), slackY: Math.round(cr.height - ir.height) };
                })(),
            };
        }, PANES);

        // No JS, wide: six panes in a grid, nothing overlapping, all on screen.
        const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        let L = await layout(page);
        ok(L.shown === 5 && L.overlaps === 0 && L.inView, `No-JS hub: 5 tiled panes, no overlap, all on screen (${JSON.stringify({ shown: L.shown, overlaps: L.overlaps, inView: L.inView })})`);
        ok(L.bar === 6 && L.closeBtns === 0, `No-JS hub: window bar (6 links), no dead close buttons (bar=${L.bar}, close=${L.closeBtns})`);
        // Content-aware sizing: the blog gets the most room; logo and music hug their content.
        const R = L.rects;
        ok(R['blog-window'].w * R['blog-window'].h > Math.max(...PANES.filter((p) => p !== 'blog-window').map((p) => R[p].w * R[p].h)) * 1.5,
            `No-JS hub: blog pane is clearly the largest (${Math.round(R['blog-window'].w)}×${Math.round(R['blog-window'].h)})`);
        ok(L.logo.slackX < 24 || L.logo.slackY < 24, `No-JS hub: logo pane hugs the logo (slack ${L.logo.slackX}×${L.logo.slackY}px)`);
        const music = await page.evaluate(() => {
            const a = document.querySelector('#music-window a.normal-btn'), b = document.querySelector('#music-window button.normal-btn');
            return { link: a && getComputedStyle(a).display !== 'none' ? a.getAttribute('href') : null, button: getComputedStyle(b).display, controls: document.getElementById('audio').controls };
        });
        ok(music.link === 'sounds/telstar.ogg' && music.button === 'none' && !music.controls,
            `No-JS hub: ▶ is a styled link to the track, no unstyled native player (${JSON.stringify(music)})`);

        // Status bar zooms a pane via :target.
        await page.click('#tile-bar a[href="#blog-window"]');
        L = await layout(page);
        ok(L.shown === 1 && L.rects['blog-window'].w > 1200, `No-JS hub: window-bar entry zooms its pane (shown=${L.shown}, width=${Math.round(L.rects['blog-window'].w)})`);
        await page.click('#tile-bar .tile-all');
        L = await layout(page);
        ok(L.shown === 5, `No-JS hub: ▦ shows all panes again (shown=${L.shown})`);

        // CSS-only blog filter.
        await page.click('label[for="bf-Photos"]');
        const vis = await page.evaluate(() => [...document.querySelectorAll('#blog-posts-list .blog-post')]
            .filter((p) => getComputedStyle(p).display !== 'none').map((p) => p.dataset.keywords));
        ok(vis.length > 0 && vis.every((k) => k.includes('Photos')), `No-JS hub: Photos filter shows only photo posts (${vis.length})`);
        await ctx.close();

        // No JS, phone: panes stack, no sideways scroll.
        const pctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
        const ppage = await pctx.newPage();
        await ppage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        L = await layout(ppage);
        ok(L.overlaps === 0 && !L.hScroll, `No-JS phone: panes stack without overlap or sideways scroll (${JSON.stringify({ overlaps: L.overlaps, hScroll: L.hScroll })})`);
        await pctx.close();

        // No JS, article: plain language links, current one marked.
        const actx = await browser.newContext({ javaScriptEnabled: false });
        const apage = await actx.newPage();
        await apage.goto(`${BASE}/blog/sunshine/he/`, { waitUntil: 'load' });
        const langs = await apage.evaluate(() => {
            const nav = document.querySelector('.lang-links');
            return nav && getComputedStyle(nav).display !== 'none'
                ? { n: nav.querySelectorAll('a').length, cur: nav.querySelector('[aria-current]')?.getAttribute('href') } : null;
        });
        ok(langs && langs.n >= 6 && langs.cur === '/blog/sunshine/he/', `No-JS article: language links visible, current marked (${JSON.stringify(langs)})`);
        await actx.close();

        // JS on, default: floating desktop, no window bar, no visible tiles option.
        const fctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const fpage = await fctx.newPage();
        await fpage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await fpage.waitForTimeout(800);
        const floating = await fpage.evaluate(() => ({
            pos: getComputedStyle(document.getElementById('blog-window')).position,
            bar: getComputedStyle(document.getElementById('tile-bar')).display,
            devTabHidden: document.getElementById('settings-nav-dev')?.hidden,
        }));
        const playJs = await fpage.evaluate(() => [...document.querySelectorAll('#music-window .normal-btn')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.tagName));
        ok(JSON.stringify(playJs) === '["BUTTON"]', `JS hub: music shows exactly one ▶, the JS button (${JSON.stringify(playJs)})`);
        ok(floating.pos === 'absolute' && floating.bar === 'none' && floating.devTabHidden === true,
            `JS hub (default): floating windows, no window bar, developer tab hidden (${JSON.stringify(floating)})`);

        // Triple-clicking the tray's ⚙ opens settings on the developer tab.
        await fpage.click('#tray-settings', { clickCount: 3 });
        await fpage.waitForTimeout(200);
        const dev = await fpage.evaluate(() => ({
            tab: !document.getElementById('settings-nav-dev').hidden,
            page: document.getElementById('settings-page-dev').classList.contains('active'),
            toggle: !!document.getElementById('dev-tiles-toggle'),
        }));
        ok(dev.tab && dev.page && dev.toggle, `Settings: triple-click ⚙ reveals the developer tab (${JSON.stringify(dev)})`);
        await fctx.close();

        // Themes are foldered; the folder holding the current theme opens.
        const thctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await thctx.addInitScript(() => { localStorage.setItem('pelmeniboiler-mode', 'lcd'); localStorage.setItem('pelmeniboiler-theme', 'akai'); });
        const thpage = await thctx.newPage();
        await thpage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await thpage.waitForTimeout(800);
        const folders = await thpage.evaluate(() => {
            const f = [...document.querySelectorAll('#theme-setting-group details.theme-folder')];
            const vals = (d) => [...d.querySelectorAll('input[name="theme"]')].map((i) => i.value);
            const top = [...document.querySelectorAll('#theme-setting-group > label input[name="theme"]')].map((i) => i.value);
            return { top, colors: vals(f[0]), silly: vals(f[1]), open: f.map((d) => d.open) };
        });
        ok(JSON.stringify(folders.top) === '["light","dark","zikit"]' && folders.colors.includes('akai') && folders.silly[0] === 'funky' && folders.silly.includes('wordart')
            && folders.open[0] === true && folders.open[1] === false,
            `Settings: themes foldered (Funky in silly), current theme's folder open (${JSON.stringify(folders)})`);
        await thctx.close();

        // Developer preview on: same tiles with JS, dragging disabled, settings gets a tall row.
        const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await tctx.addInitScript(() => localStorage.setItem('pelmeniboiler-dev-tiles', '1'));
        const tpage = await tctx.newPage();
        await tpage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await tpage.waitForTimeout(800);
        L = await layout(tpage);
        ok(L.shown === 5 && L.overlaps === 0 && L.inView && L.bar === 6, `Dev tiles: 5 panes, no overlap, window bar (${JSON.stringify({ shown: L.shown, overlaps: L.overlaps, bar: L.bar })})`);
        const before = L.rects['about-window'];
        const tb = await tpage.locator('#about-window .title-bar').boundingBox();
        await tpage.mouse.move(tb.x + 20, tb.y + 10); await tpage.mouse.down();
        await tpage.mouse.move(tb.x - 200, tb.y - 200, { steps: 5 }); await tpage.mouse.up();
        L = await layout(tpage);
        ok(Math.abs(L.rects['about-window'].l - before.l) < 1 && Math.abs(L.rects['about-window'].t - before.t) < 1, 'Dev tiles: title-bar drag does not move panes');
        await tpage.click('#tray-settings');
        await tpage.waitForTimeout(200);
        const st = await tpage.evaluate(() => {
            const r = document.getElementById('settings-main-window').getBoundingClientRect();
            return { h: Math.round(r.height), w: Math.round(r.width), devTab: !document.getElementById('settings-nav-dev').hidden };
        });
        ok(st.h >= 320 && st.w > 1000 && st.devTab, `Dev tiles: settings opens as a tall full-width pane, dev tab stays visible (${JSON.stringify(st)})`);
        await tctx.close();
    }

    // ============ WINDOW MANAGER: pointer drag, clamp, raise, persistence, a11y ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(800);
        const box = (id) => page.evaluate((i) => {
            const el = document.getElementById(i); const r = el.getBoundingClientRect();
            return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), z: +getComputedStyle(el).zIndex || 0, shown: getComputedStyle(el).display !== 'none' };
        }, id);
        const drag = async (id, dx, dy) => {
            const tb = await page.locator(`#${id} .title-bar .title`).boundingBox();
            await page.mouse.move(tb.x + 10, tb.y + 8); await page.mouse.down();
            await page.mouse.move(tb.x + 10 + dx, tb.y + 8 + dy, { steps: 6 }); await page.mouse.up();
        };

        const a0 = await box('about-window');
        await drag('about-window', 120, 60);
        const a1 = await box('about-window');
        ok(Math.abs(a1.x - a0.x - 120) <= 2 && Math.abs(a1.y - a0.y - 60) <= 2, `WM: pointer drag moves a window (${a0.x},${a0.y} → ${a1.x},${a1.y})`);

        await drag('about-window', -3000, -3000);
        const a2 = await box('about-window');
        ok(a2.y >= 0 && a2.x + a2.w >= 80, `WM: dragging off-screen is clamped (title bar stays reachable: x=${a2.x}, y=${a2.y})`);

        const before = await box('logo-window');
        await page.click('#logo-window .content');
        const after = await box('logo-window');
        const maxZ = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#desktop > .window')].map((w) => +getComputedStyle(w).zIndex || 0)));
        ok(after.z === maxZ && after.z > before.z, `WM: clicking inside a window raises it (z ${before.z} → ${after.z}, max ${maxZ})`);

        await page.click('#music-window .close-btn');
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(800);
        const a3 = await box('about-window');
        const music = await box('music-window');
        const trayHasMusic = await page.evaluate(() => [...document.querySelectorAll('#tray-icons .tray-icon')].some((b) => /music/.test(b.title)));
        ok(Math.abs(a3.x - a2.x) <= 2 && Math.abs(a3.y - a2.y) <= 2 && !music.shown && trayHasMusic,
            `WM: positions and closed windows survive a reload (about ${a3.x},${a3.y}; music closed=${!music.shown}, in tray=${trayHasMusic})`);

        const a11y = await page.evaluate(() => {
            const wins = [...document.querySelectorAll('#desktop > .window:not(.init-closed)')];
            return {
                named: wins.filter((w) => ['region', 'main'].includes(w.getAttribute('role')) && document.getElementById(w.getAttribute('aria-labelledby'))?.textContent.trim()).length,
                total: wins.length,
                closeLabelled: [...document.querySelectorAll('.close-btn')].every((b) => b.getAttribute('aria-label')),
                iconsHidden: [...document.querySelectorAll('.title .symbol')].every((s) => s.getAttribute('aria-hidden') === 'true'),
            };
        });
        ok(a11y.named === a11y.total && a11y.closeLabelled && a11y.iconsHidden, `WM: windows are named regions, close buttons labelled, title icons hidden from screen readers (${JSON.stringify(a11y)})`);
        await ctx.close();
    }

    // ============ EMOJI: our glyphs as SVG, never the OS colour font ============
    {
        const EXT = /\p{Extended_Pictographic}/u;
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addInitScript(() => localStorage.setItem('pelmeniboiler-mode', 'lcd'));
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.classList.contains('emoji-svg'), null, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(600);
        const hub = await page.evaluate((src) => {
            const ext = new RegExp(src, 'u');
            const skip = (el) => el.closest('script,style,textarea,input,option,title,code,pre,svg,noscript,.emoji-t,.no-emoji');
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            const bare = [];
            while (w.nextNode()) {
                const n = w.currentNode;
                if (!ext.test(n.data) || skip(n.parentElement)) continue;
                const t = n.data.replace(/[©®™]/g, '');
                if (ext.test(t) && n.parentElement.getClientRects().length) bare.push(t.trim().slice(0, 12));
            }
            const uses = [...document.querySelectorAll('.emoji > svg')];
            // Only glyphs actually on screen (closed windows and folders measure 0).
            const shown = uses.filter((s) => s.getClientRects().length && s.getBoundingClientRect().width > 0);
            const drawn = shown.filter((s) => { try { return s.querySelector('use').getBBox().width > 0; } catch { return false; } }).length;
            return { svgs: uses.length, shown: shown.length, drawn, bare, blogTitle: document.querySelector('#blog-window .title').textContent };
        }, EXT.source);
        ok(hub.svgs > 20 && hub.bare.length === 0, `Emoji: hub draws every emoji as SVG, none left to the OS font (${hub.svgs} svg; bare: ${JSON.stringify(hub.bare)})`);
        ok(hub.shown > 5 && hub.drawn === hub.shown, `Emoji: every on-screen SVG glyph resolves in the sprite (${hub.drawn}/${hub.shown})`);
        ok(hub.blogTitle.includes('\u{1F4D3}'), `Emoji: the character stays in the text for copy/search (${JSON.stringify(hub.blogTitle)})`);
        await ctx.close();

        const nctx = await browser.newContext({ javaScriptEnabled: false });
        const npage = await nctx.newPage();
        await npage.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        const art = await npage.evaluate(() => document.querySelectorAll('.emoji > svg use[href*="/styles/emoji/"]').length);
        ok(art > 5, `Emoji: built pages arrive with SVG emoji for no-JS readers (${art})`);
        await nctx.close();

        const vctx = await browser.newContext();
        const vpage = await vctx.newPage();
        await vpage.goto(`${BASE}/tools/emojiviewer.html`, { waitUntil: 'load' });
        await vpage.waitForSelector('.symbol-item', { timeout: 8000 }).catch(() => {});
        const ev = await vpage.evaluate(async () => {
            // Every character the viewer shows must be one our font stack draws:
            // no tofu, and nothing left for the OS emoji font to fill in.
            const cov = await (await fetch('/styles/emoji/coverage.json')).json();
            const has = (cp) => cov.some(([a, b]) => cp >= a && cp <= b);
            const cps = [...document.querySelectorAll('.symbol-item .glyph')].flatMap((s) => [...s.textContent].map((c) => c.codePointAt(0)));
            const missing = [...new Set(cps.filter((cp) => !has(cp)))].map((cp) => 'U+' + cp.toString(16).toUpperCase());
            // Layers: the losers on the left must each be a different font from
            // the winner, and the page may use only the theme's two colours.
            const sample = [...document.querySelectorAll('.symbol-item')].find((i) => i.querySelectorAll('.stack span').length >= 2);
            const fams = sample ? [sample.querySelector('.glyph'), ...sample.querySelectorAll('.stack span')].map((e) => getComputedStyle(e).fontFamily) : [];
            const root = getComputedStyle(document.documentElement);
            const probe = document.createElement('span'); document.body.append(probe);
            const rgb = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
            const allowed = new Set([rgb(root.getPropertyValue('--text-color')), rgb(root.getPropertyValue('--bg-color')), rgb(root.getPropertyValue('--win-bg-color')), 'rgba(0, 0, 0, 0)']);
            probe.remove();
            const offTheme = new Set();
            for (const el of document.querySelectorAll('body, .container *')) {
                const cs = getComputedStyle(el);
                for (const v of [cs.color, cs.backgroundColor, cs.borderTopColor]) if (!allowed.has(v)) offTheme.add(v);
                if (cs.boxShadow !== 'none' || parseFloat(cs.borderTopLeftRadius) > 0) offTheme.add('shadow/radius on ' + el.className);
            }
            return { family: getComputedStyle(document.querySelector('.symbol-item .glyph')).fontFamily, shown: cps.length, missing,
                layers: document.querySelectorAll('.symbol-item .stack span').length, distinct: new Set(fams).size === fams.length && fams.length >= 3, offTheme: [...offTheme].slice(0, 5) };
        });
        ok(!/Color Emoji|Segoe UI Emoji/i.test(ev.family) && /SymbolaNoRI/.test(ev.family) && ev.shown > 2000 && ev.missing.length === 0,
            `Emoji viewer: our stack only, every character shown is one our fonts draw (${ev.shown} shown; missing: ${JSON.stringify(ev.missing.slice(0, 20))}${ev.missing.length > 20 ? '…' : ''})`);
        ok(ev.layers > 1000 && ev.distinct, `Emoji viewer: each character shows the rest of the font stack beside the winner (${ev.layers} layers)`);
        ok(ev.offTheme.length === 0, `Emoji viewer: theme colours only, no shadows or rounded corners (${JSON.stringify(ev.offTheme)})`);
        await vctx.close();
    }

    // ============ EMOJI FONTS STAY ON THE SHELF ============
    // With every symbol drawn from the sprite, ordinary pages must never
    // download an emoji font (they are megabytes each).
    {
        for (const url of ['/', '/blog/sunshine/en/', '/screensaver/']) {
            const ctx = await browser.newContext({ serviceWorkers: 'block' });
            const page = await ctx.newPage();
            const fonts = [];
            page.on('request', (r) => { if (/Symbola|Emoji|Gaps/.test(r.url())) fonts.push(r.url().split('/').pop()); });
            await page.route(/youtube/, (r) => r.abort());
            await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
            await page.waitForTimeout(2500);
            ok(fonts.length === 0, `Emoji fonts: ${url} downloads none (${fonts.join(', ') || 'none'})`);
            await ctx.close();
        }
    }

    // ============ KEYBOARD ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('#blog-window > .title-bar')?.tabIndex === 0, null, { timeout: 8000 });
        const at = () => page.evaluate(() => document.activeElement?.closest('.window')?.id || null);
        const shown = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i)).display !== 'none', id);

        await page.keyboard.press('w');
        const first = await at();
        const inverted = await page.evaluate(() => { const b = document.activeElement, w = getComputedStyle(b.closest('.window')), cs = getComputedStyle(b); return cs.outlineStyle === 'none' && cs.backgroundColor !== getComputedStyle(document.querySelector('.window:not(:focus-within) > .title-bar')).backgroundColor; });
        await page.keyboard.press('w');
        const second = await at();
        await page.keyboard.press('Shift+W');
        ok(first && second && first !== second && (await at()) === first, `Keys: W / Shift+W walk the open windows (${first} → ${second} → back)`);
        ok(inverted, 'Keys: the focused title bar inverts its colours instead of drawing an outline');

        const before = await page.evaluate(() => document.activeElement.closest('.window').getBoundingClientRect().left);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        const after = await page.evaluate(() => document.activeElement.closest('.window').getBoundingClientRect().left);
        ok(Math.round(after - before) === 120, `Keys: arrows on a focused title bar move the window (${Math.round(after - before)}px)`);

        await page.keyboard.press('Escape');
        ok(!(await shown(first)) && (await at()) !== first && (await at()) !== null, `Keys: Esc closes the focused window and focus moves on (now ${await at()})`);

        await page.keyboard.press('?');
        const keysOpen = (await shown('keys-window')) && (await at()) === 'keys-window';
        await page.keyboard.press('s');
        const settingsOpen = (await shown('settings-main-window')) && (await at()) === 'settings-main-window';
        ok(keysOpen && settingsOpen, `Keys: ? opens the key list and S opens settings, each taking focus (${keysOpen}, ${settingsOpen})`);

        const theme0 = await page.evaluate(() => document.querySelector('input[name="theme"]:checked')?.value);
        await page.keyboard.press('t');
        const theme1 = await page.evaluate(() => document.querySelector('input[name="theme"]:checked')?.value);
        await page.keyboard.press('e');
        const eink = await page.evaluate(() => document.documentElement.classList.contains('eink-mode'));
        await page.keyboard.press('e');
        ok(theme0 !== theme1 && eink, `Keys: T steps the theme (${theme0} → ${theme1}) and E toggles e-ink (${eink})`);

        // Off switch (WCAG 2.1.4) and never while typing.
        await page.evaluate(() => document.getElementById('keys-toggle').click());
        const theme2 = await page.evaluate(() => document.querySelector('input[name="theme"]:checked')?.value);
        await page.keyboard.press('t');
        const theme3 = await page.evaluate(() => document.querySelector('input[name="theme"]:checked')?.value);
        const here = await at();
        await page.keyboard.press('w');
        ok(theme2 === theme3 && (await at()) === here, `Keys: letter keys can be switched off (${theme2} = ${theme3}, focus stayed on ${here})`);
        await ctx.close();
    }

    // ============ ONLY THE SLICES A PAGE NEEDS ============
    // Garamond and FairfaxHD are cut into unicode-range slices, and the emoji
    // sprite into a shared core plus a per-page set (build/font-slices.py,
    // build/emoji.mjs splitSprites).
    {
        const load = async (url) => {
            const ctx = await browser.newContext({ serviceWorkers: 'block' });
            const page = await ctx.newPage();
            const got = [];
            page.on('request', (r) => { const u = new URL(r.url()).pathname; if (/\/fonts\/|\/styles\/emoji\/.*\.svg/.test(u)) got.push(u.split('/').pop()); });
            await page.route(/youtube/, (r) => r.abort());
            await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
            await page.waitForTimeout(2500);
            const drawn = await page.evaluate(() => [...document.querySelectorAll('.emoji > svg')].filter((s) => s.getBoundingClientRect().width > 0).every((s) => { try { return s.querySelector('use').getBBox().width > 0; } catch { return false; } }));
            await ctx.close();
            return { got, drawn };
        };
        const gt = await load('/blog/dixie_and_vegas/gt/');
        ok(gt.got.includes('FairfaxHD-graflect.woff2') && !gt.got.some((f) => /FairfaxHD-rest|EBGaramond/.test(f)),
            `Fonts: a Graflect page fetches the Graflect slice, not the whole font (${gt.got.filter((f) => /woff2/.test(f)).join(', ')})`);
        const ru = await load('/blog/elizabeth_park/ru/');
        ok(ru.got.includes('EBGaramond-cyrillic.woff2') && !ru.got.some((f) => /EBGaramond-(latin|rest|greek)|FairfaxHD/.test(f)),
            `Fonts: a Russian page fetches only the Cyrillic slice (${ru.got.filter((f) => /woff2/.test(f)).join(', ')})`);
        const sprites = [...gt.got, ...ru.got].filter((f) => /\.svg$/.test(f));
        ok(sprites.length > 0 && sprites.every((f) => /^(core|set)-[0-9a-f]{8}\.svg$/.test(f)) && gt.drawn && ru.drawn,
            `Emoji: pages use the core + per-page sprites, never the full one, and every glyph draws (${[...new Set(sprites)].join(', ')})`);

        // Icons inside windows that start closed wait for the window to open.
        {
            const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
            const page = await ctx.newPage();
            const got = [];
            page.on('request', (r) => { const u = new URL(r.url()).pathname; if (/\/styles\/emoji\/lazy-/.test(u)) got.push(u); });
            await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
            await page.waitForTimeout(1500);
            const early = got.length;
            const parked = await page.evaluate(() => document.querySelectorAll('#settings-main-window use[data-href]').length);
            await page.keyboard.press('s');
            await page.waitForTimeout(1200);
            const after = await page.evaluate(() => {
                const uses = [...document.querySelectorAll('#settings-main-window .emoji use')];
                const seen = uses.filter((u) => u.getClientRects().length);
                return { left: uses.filter((u) => u.hasAttribute('data-href')).length, drawn: seen.length > 0 && seen.every((u) => { try { return u.getBBox().width > 0; } catch { return false; } }) };
            });
            ok(early === 0 && parked > 0 && got.length === 1 && after.left === 0 && after.drawn,
                `Emoji: settings icons load when settings opens, not before (early=${early}, parked=${parked}, fetched=${got.length}, ${JSON.stringify(after)})`);
            await ctx.close();
        }
    }

    // ============ THE HUB TRAVELS LIGHT ============
    // Pre-rendered in English with its chrome baked in: an English visitor
    // fetches no translations, no modules, and only the one text font. The
    // gallery background uses the encoded photos, never the originals.
    {
        const ctx = await browser.newContext({ serviceWorkers: 'block' });
        const page = await ctx.newPage();
        const hits = [];
        page.on('request', (r) => { const u = new URL(r.url()).pathname; if (/^\/(localization|modules)\/|Garamond|Fairfax/.test(u)) hits.push(u); });
        await page.goto(`${BASE}/`, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        const hub = await page.evaluate(() => ({ tray: !!document.getElementById('tray'), settings: !!document.getElementById('settings-main-window'), main: document.querySelectorAll('[role="main"], main:not([role="none"])').length }));
        ok(hits.length === 0 && hub.tray && hub.settings, `Hub: chrome is baked in and nothing extra is fetched (${hits.join(', ') || 'none'}; ${JSON.stringify(hub)})`);
        ok(hub.main === 1, `Hub: exactly one main landmark (${hub.main})`);
        const photos = (await (await fetch(`${BASE}/screensaver/photos.json`)).json()).photos;
        ok(photos.length > 10 && photos.every((p) => /^\/img\/.*\.webp$/.test(p.src) && p.full), `Gallery/screensaver: every photo is served as an encoded WebP (${photos.length} photos)`);
        await ctx.close();
    }

    // ============ LEGACY ROOT URLS + HUB HEAD ============
    {
        const ctx = await browser.newContext({ javaScriptEnabled: false });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/dixie_and_vegas.html`, { waitUntil: 'load' });
        await page.waitForURL('**/blog/dixie_and_vegas/en/', { timeout: 5000 }).catch(() => {});
        ok(page.url().endsWith('/blog/dixie_and_vegas/en/'), `Legacy /dixie_and_vegas.html redirects without JS (got ${page.url()})`);
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        const head = await page.evaluate(() => ({
            charsetFirst: document.head.firstElementChild?.getAttribute('charset')?.toLowerCase() === 'utf-8',
            desc: !!document.querySelector('meta[name="description"]')?.content,
            og: document.querySelector('meta[property="og:image"]')?.content || '',
            audioInBody: !!document.querySelector('body audio#audio') && !document.querySelector('head audio'),
        }));
        ok(head.charsetFirst && head.desc && /\.png$/.test(head.og) && head.audioInBody,
            `Hub head: charset first, description, PNG og:image, <audio> in body (${JSON.stringify(head)})`);
        await ctx.close();
    }

    // ============ OFFLINE PWA ============
    {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`, { waitUntil: 'load' });
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForTimeout(800);
        await page.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        await ctx.setOffline(true);
        await page.reload({ waitUntil: 'load' }).catch(() => {});
        const h1 = (await page.textContent('#title').catch(() => ''))?.trim();
        ok(h1 === 'Sunshine Experimental Keyboard', `Offline: cached article still reads (got "${h1}")`);
        await page.goto(`${BASE}/`, { waitUntil: 'load' }).catch(() => {});
        const cards = await page.locator('#blog-posts-list .blog-post').count().catch(() => 0);
        ok(cards >= 6, `Offline: hub renders from cache (${cards} cards)`);
        await ctx.close();
    }
} finally {
    // --- ARIA stamped by build/aria.mjs, kept live by the runtime ---
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`, { waitUntil: 'load' });
        await page.waitForSelector('#settings-main-window', { state: 'attached', timeout: 8000 });
        const st = await page.evaluate(() => {
            const wins = [...document.querySelectorAll('.window')];
            const q = (s) => document.querySelector(s);
            return {
                unlabelled: wins.filter((w) => w.id && !document.getElementById(w.getAttribute('aria-labelledby') || '')).map((w) => w.id),
                close: [...document.querySelectorAll('.close-btn')].every((b) => b.getAttribute('aria-label')),
                tabs: document.querySelectorAll('.settings-nav [role="tab"][aria-controls]').length,
                listbox: q('.custom-dropdown-menu')?.getAttribute('role'),
                expanded: q('.custom-dropdown-toggle')?.getAttribute('aria-expanded'),
                pressed: [...document.querySelectorAll('button.filter-btn')].map((b) => b.getAttribute('aria-pressed')).join(','),
            };
        });
        ok(st.unlabelled.length === 0 && st.close, `ARIA: every window is labelled by its title and every close button is named (unlabelled: ${st.unlabelled.join(',') || 'none'})`);
        ok(st.tabs >= 3 && st.listbox === 'listbox' && st.expanded === 'false', `ARIA: settings tabs + language listbox are stamped (${JSON.stringify(st)})`);
        ok(/^true(,false)+$/.test(st.pressed), `ARIA: filter buttons carry aria-pressed (${st.pressed})`);

        // Read the dropdown straight away: any later click on the page closes it.
        const opened = await page.evaluate(() => {
            const t = document.querySelector('.custom-dropdown-toggle');
            t.click();
            return t.getAttribute('aria-expanded');
        });
        await page.evaluate(() => {
            document.querySelector('#settings-tab-theme').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            document.querySelectorAll('button.filter-btn')[1].click();
        });
        const live = await page.evaluate(() => ({
            expanded: document.querySelector('.custom-dropdown-toggle').getAttribute('aria-expanded'),
            tab: document.querySelector('#settings-tab-theme').getAttribute('aria-selected'),
            panel: document.querySelector('#settings-page-theme').classList.contains('active'),
            pressed: [...document.querySelectorAll('button.filter-btn')].map((b) => b.getAttribute('aria-pressed')).slice(0, 2).join(','),
        }));
        ok(opened === 'true' && live.expanded === 'false' && live.tab === 'true' && live.panel && live.pressed === 'false,true',
            `ARIA: states follow the UI — dropdown, keyboard tab switch, filter toggle (${JSON.stringify(live)})`);
        await ctx.close();
    }

    // ============ /ct125/: the manual app ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        const errors = [], imgs = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('request', (r) => { if (r.resourceType() === 'image' && !/icon|favicon|logo|bike\.svg|^blob:|^data:/.test(r.url())) imgs.push(r.url()); });
        await page.goto(`${BASE}/ct125/`, { waitUntil: 'load' });
        await page.waitForSelector('.quick button');
        const manifest = await page.evaluate(() => document.querySelector('link[rel="manifest"]').getAttribute('href'));
        ok(manifest === '/ct125/manifest.json', `CT125: keeps its own app manifest (${manifest})`);

        await page.fill('#q', 'bash plate');
        await page.waitForSelector('#v-search .card');
        const found = await page.evaluate(() => [...document.querySelectorAll('#v-search .card h3')].map((h) => h.textContent).join(' | '));
        ok(/under cover/i.test(found), `CT125: an owner's word finds Honda's ("bash plate" → ${found.slice(0, 80)})`);

        // Every torque and spec row cites a manual page.
        await page.click('.tabs [data-v=torque]');
        const cited = await page.evaluate(() => { const rows = [...document.querySelectorAll('#v-torque .tq:last-of-type .row:not(.hd)')]; return { rows: rows.length, cited: rows.filter((r) => r.querySelector('.pg')).length }; });
        ok(cited.rows > 80 && cited.rows === cited.cited, `CT125: every specified torque cites its page (${cited.cited}/${cited.rows})`);

        // Odometer and ticks are kept on the device.
        await page.click('.tabs [data-v=service]');
        await page.click('#bedit'); await page.fill('#odo', '7450'); await page.click('#bsave');
        await page.click('.chk input');
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('.odometer');
        const kept = await page.evaluate(() => ({ odo: (document.querySelector('.odometer')?.getAttribute('aria-label') || ''), ticks: document.querySelectorAll('.chk input:checked').length, title: document.querySelector('.box .bh h3').textContent }));
        ok(/^7,450 mi/.test(kept.odo) && kept.ticks === 1 && /8,000/.test(kept.title), `CT125: odometer, due service and ticked jobs survive a reload (${JSON.stringify(kept)})`);

        // A second bike keeps its own odometer and ticks; the first is untouched.
        await page.click('#bedit'); await page.fill('#bname', 'Red'); await page.click('#bsave');
        await page.click('#bpick .custom-dropdown-toggle'); await page.click('#bpick .custom-dropdown-item[data-value="new"]');
        await page.waitForFunction(() => document.querySelector('#bike.editing') && document.querySelector('#odo').value === '');
        await page.click('#bsave');
        await page.waitForFunction(() => document.querySelectorAll('#bpick .custom-dropdown-item').length === 4);
        const second = await page.evaluate(() => ({ ticks: document.querySelectorAll('.chk input:checked').length, names: [...document.querySelectorAll('#bpick .custom-dropdown-item')].map((o) => o.textContent) }));
        await page.click('#bpick .custom-dropdown-toggle'); await page.click('#bpick .custom-dropdown-item >> text=Red');
        await page.waitForFunction(() => /^7,450/.test((document.querySelector('.odometer')?.getAttribute('aria-label') || '')));
        const first = await page.evaluate(() => ({ name: document.querySelector('.bike-name').textContent, ticks: document.querySelectorAll('.chk input:checked').length }));
        ok(second.ticks === 0 && first.name === 'Red' && first.ticks === 1, `CT125: each bike has its own name, odometer and ticks (${JSON.stringify({ second, first })})`);

        // A tick is dated, and the bike can switch to kilometres: the reading converts and the service list leads with km.
        {
            const tick = await page.evaluate(() => document.querySelector('.chk .tick-date')?.dataset.value);
            await page.click('#bedit'); await page.click('#bunit .custom-dropdown-toggle'); await page.click('#bunit .custom-dropdown-item[data-value="km"]');
            const field = await page.inputValue('#odo');
            await page.click('#bsave');
            await page.waitForFunction(() => /km/.test(document.querySelector('.odometer')?.getAttribute('aria-label') || ''));
            await page.click('.tabs [data-v=service]');
            const km = await page.evaluate(() => ({ odo: document.querySelector('.odometer').getAttribute('aria-label'), first: document.querySelector('.ms button b').textContent, under: document.querySelector('.ms button span').textContent }));
            ok(/^\d{4}-\d\d-\d\d$/.test(tick || '') && field === '11990' && /^11,990 km/.test(km.odo) && km.first === '1,000' && km.under === '600 mi', `CT125: ticks are dated; a bike can switch to km (${JSON.stringify({ tick, field, ...km })})`);
            await page.click('#bedit'); await page.click('#bunit .custom-dropdown-toggle'); await page.click('#bunit .custom-dropdown-item[data-value="mi"]'); await page.click('#bsave');
            await page.waitForFunction(() => /mi/.test(document.querySelector('.odometer')?.getAttribute('aria-label') || ''));
        }

        // History opens as a printable page; share bike makes a link and QR code that bring the bike to another device.
        {
            await page.click('.tabs [data-v=service]');
            await page.click('#hist');
            const hist = await page.evaluate(() => ({ shown: !document.querySelector('#histwin').hidden, services: document.querySelectorAll('#hbody section').length, jobs: document.querySelectorAll('#hbody li').length, rules: document.querySelectorAll('#hbody .blank').length, sign: /Owner's signature/.test(document.querySelector('#hbody').textContent), logo: !!document.querySelector('#hbody .doc-logo') }));
            await page.waitForSelector('#hqr svg');
            await page.click('#hclose');
            await page.click('#bshare');
            await page.waitForSelector('#qr svg');
            const url = await page.inputValue('#shareurl');
            await page.click('#shareclose');
            const other = await browser.newContext();
            const p4 = await other.newPage();
            // (the link names the public site; open it on the test server)
            await p4.goto(url.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'load' });
            await p4.waitForSelector('#sharewin:not([hidden]) [data-imp=add]');
            await p4.click('[data-imp=add]');
            await p4.waitForFunction(() => document.querySelector('.bike-name')?.textContent === 'Red' && /7,450/.test(document.querySelector('.odometer')?.getAttribute('aria-label') || ''));
            const recs = await p4.evaluate(() => Object.keys(localStorage).filter((k) => /:chk:/.test(k)).length);
            await other.close();
            ok(hist.shown && hist.services >= 1 && hist.jobs >= 1 && hist.rules > hist.jobs && hist.sign && hist.logo && /^https:\/\/pelmeniboiler\.github\.io\/ct125\/#bike=/.test(url) && recs >= 1, `CT125: history page and share-bike link round trip (${JSON.stringify({ ...hist, recs, len: url.length })})`);
        }

        // A photo on a ticked job travels in the bike file, is checked against its fingerprint, and imports read-only.
        {
            await page.click('.tabs [data-v=service]');
            for (let i = 0; i < 7 && !(await page.$('.addph')); i++) await page.click(`.ms button >> nth=${i}`);
            const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } });
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.addph')]);
            await chooser.setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: shot });
            await page.waitForFunction(() => document.querySelector('.thumb img')?.naturalWidth > 0);
            const dated = /^added \d/.test(await page.getAttribute('.thumb', 'title'));
            await page.click('#bshare');
            await page.waitForFunction(() => /photo\)/.test(document.querySelector('#sharefile')?.textContent || ''));
            const note = await page.textContent('#sharebody');
            const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sharefile')]);
            const file = await dl.path();
            await page.click('#shareclose');
            const other = await browser.newContext();
            const p5 = await other.newPage();
            await p5.goto(`${BASE}/ct125/`, { waitUntil: 'load' });
            await p5.waitForSelector('#bpick');
            await p5.setInputFiles('#bikefilepick', file);
            await p5.waitForSelector('#sharewin:not([hidden]) [data-imp=add]');
            const imp = await p5.evaluate(() => ({ text: document.querySelector('#sharebody').textContent, ro: document.querySelector('#impro').getAttribute('aria-pressed') === 'true' }));
            await p5.click('[data-imp=add]');
            await p5.waitForFunction(() => /🔒/.test(document.querySelector('.bike-year')?.textContent || ''));
            await p5.click('.tabs [data-v=service]');
            for (let i = 0; i < 7 && !(await p5.$('.thumb')); i++) await p5.click(`.ms button >> nth=${i}`);
            await p5.waitForFunction(() => document.querySelector('.thumb img')?.naturalWidth > 0, null, { timeout: 10000 }).catch(() => {});
            const got = await p5.evaluate(() => ({ year: document.querySelector('.bike-year').textContent, locked: document.querySelectorAll('.chk input[type=checkbox]:disabled').length, photo: document.querySelector('.thumb img')?.naturalWidth > 0, add: document.querySelectorAll('.addph').length }));
            await other.close();
            ok(dated && /use the bike file/.test(note) && /matches its fingerprint/.test(imp.text) && imp.ro && /🔒/.test(got.year) && got.locked > 0 && got.photo && got.add === 0,
                `CT125: a job's photo travels in the bike file, matches its fingerprint, and imports read-only (${JSON.stringify({ ro: imp.ro, ...got })})`);
        }

        // Upload for 72 hours (Litterbox, mocked): the link names the file, and a fresh device fetches the photos
        // and checks them against their fingerprints. Once the upload has expired, the link says so.
        {
            let uploaded = '', form = '';
            const litter = async (route) => {
                const req = route.request();
                if (req.method() === 'POST') { form = req.postData() || ''; uploaded = form.slice(form.indexOf('<!DOCTYPE html>'), form.lastIndexOf('</html>') + 7); return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'https://litter.catbox.moe/ab12cd.html' }); }
                return uploaded && /ab12cd\.html$/.test(req.url()) ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: uploaded }) : route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
            };
            await page.context().route(/catbox\.moe/, (r) => r.abort('namenotresolved'));
            await page.click('#bshare');
            await page.waitForSelector('#shareup');
            const ways = await page.textContent('#sharebody');
            await page.click('#shareup');
            await page.click('#upgo');
            await page.waitForSelector('#upback');
            const blocked = await page.textContent('#sharebody');
            await page.click('#upback');
            await page.click('#shareclose');
            await page.context().unroute(/catbox\.moe/);
            await page.context().route(/catbox\.moe/, litter);
            await page.click('#bshare');
            await page.waitForSelector('#shareup');
            await page.click('#shareup');
            const warn = await page.textContent('#sharebody');
            await page.click('#upgo');
            await page.waitForFunction(() => /online until/.test(document.querySelector('#sharebody')?.textContent || ''));
            const url = await page.inputValue('#shareurl'), noUp = !(await page.$('#shareup'));
            await page.click('#shareclose');
            const other = await browser.newContext();
            await other.route(/catbox\.moe/, litter);
            const p7 = await other.newPage();
            await p7.goto(url.replace('https://pelmeniboiler.github.io', BASE), { waitUntil: 'load' });
            await p7.waitForSelector('#sharewin:not([hidden]) [data-imp=add]');
            const imp = await p7.textContent('#sharebody');
            await p7.click('[data-imp=add]');
            await p7.waitForFunction(() => /🔒/.test(document.querySelector('.bike-year')?.textContent || ''));
            await p7.click('.tabs [data-v=service]');
            for (let i = 0; i < 7 && !(await p7.$('.thumb')); i++) await p7.click(`.ms button >> nth=${i}`);
            await p7.waitForFunction(() => document.querySelector('.thumb img')?.naturalWidth > 0, null, { timeout: 10000 }).catch(() => {});
            const photo = await p7.evaluate(() => document.querySelector('.thumb img')?.naturalWidth > 0);
            const p8 = await other.newPage();
            await p8.goto(url.replace('https://pelmeniboiler.github.io', BASE).replace(/until=\d+/, 'until=1000000000'), { waitUntil: 'load' });
            await p8.waitForSelector('#sharewin:not([hidden]) [data-imp]');
            const gone = await p8.textContent('#sharebody');
            await other.close();
            await page.context().unroute(/catbox\.moe/);
            ok(/third party/.test(ways) && /couldn’t reach Litterbox/.test(blocked) && /Is this okay\?/.test(warn) && /Litterbox/.test(warn) && /can’t be taken down/.test(warn) && /time"\r?\n\r?\n72h/.test(form) && /&file=ab12cd\.html&until=\d+$/.test(url) && noUp && /matches its fingerprint/.test(imp) && photo && /online until/.test(gone) && !/matches/.test(gone),
                `CT125: upload for 72 hours brings the photos along by link, and says when it has expired (${JSON.stringify({ url: url.slice(-40), noUp, photo, imp: imp.slice(0, 120), gone: gone.slice(0, 160) })})`);
        }

        // On a phone the share window stays centred and whole (the site's phone layout pins .window to the corner).
        {
            const ph = await browser.newContext({ viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true });
            const pp = await ph.newPage();
            await pp.goto(`${BASE}/ct125/`, { waitUntil: 'load' });
            await pp.click('#bshare');
            await pp.waitForSelector('#shareurl');
            const r = await pp.evaluate(() => { const b = document.querySelector('#sharewin').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); });
            await ph.close();
            ok(r[0] >= 0 && r[1] >= 0 && r[2] <= 412 && r[3] <= 839, `CT125: the share window fits a phone screen (${r})`);
        }

        // Owners: an earlier owner can be added; back-filling an old service takes its mileage, leaves the date open,
        // and is credited to whoever owned the bike then. Services after the current owner's handover don't ask.
        {
            const o2 = await browser.newContext();
            const p6 = await o2.newPage();
            await p6.goto(`${BASE}/ct125/`, { waitUntil: 'load' });
            await p6.waitForSelector('#bedit');
            await p6.click('#bedit'); await p6.fill('#odo', '6971');
            await p6.click('#addowner'); await p6.fill('.owner-row:last-child .ow-n', 'W.S. Zhulkovsky'); await p6.fill('.owner-row:last-child .ow-o', '1500');
            await p6.click('#addowner'); await p6.fill('.owner-row:last-child .ow-n', 'Charles Doe'); await p6.fill('.owner-row:last-child .ow-o', '0');
            await p6.click('#bsave');
            await p6.waitForFunction(() => /Zhulkovsky’s/.test(document.querySelector('.bike-year')?.textContent || ''));
            await p6.click('.tabs [data-v=service]'); await p6.click('.ms button >> nth=0');
            await p6.click('.chk input[type=checkbox] >> nth=0');
            const old = await p6.evaluate(() => ({ odo: document.querySelector('.tick-odo').value, date: document.querySelector('.tick-date').dataset.value, by: document.querySelector('.by-dd .custom-dropdown-toggle')?.textContent.trim() }));
            await p6.click('.ms button >> nth=2'); await p6.click('.chk input[type=checkbox] >> nth=0');
            const fresh = await p6.evaluate(() => ({ pickers: document.querySelectorAll('.by-dd').length, date: document.querySelector('.tick-date').dataset.value }));
            await p6.click('#bedit'); await p6.click('#bro'); await p6.click('#bsave');
            const count = await p6.evaluate(() => document.querySelector('.owner-count')?.textContent);
            const chuck = await p6.evaluate(() => /formerly Chuck’s/.test(document.querySelector('.bike-year').textContent));
            const look = await p6.evaluate(() => ({ worth: /no date/.test(document.querySelector('.ro-note')?.textContent || ''), tip: !!document.querySelector('.look') }));
            await p6.goto(`${BASE}/ct125/#page=2-16`, { waitUntil: 'load' });
            await p6.waitForFunction(() => !document.querySelector('#viewer').hidden);
            const cited = await p6.evaluate(() => [...document.querySelectorAll('#vpanel .gbtn')].map((b) => b.textContent).join('|'));
            await o2.close();
            ok(count === '2 owners' && chuck && look.worth && look.tip && /Valve clearance/.test(cited) && old.odo === '600' && old.date === '' && /Charles Doe/.test(old.by) && fresh.pickers === 0 && /^\d{4}-/.test(fresh.date), `CT125: owner history and who did each job (${JSON.stringify({ old, fresh, count, chuck, look, cited })})`);
        }

        // Dates use the app's own calendar (two colours, no browser picker), and number fields have no spinners.
        {
            const native = await page.evaluate(() => document.querySelectorAll('#v-service input[type=date]').length);
            await page.click('.chk .tick-date');
            await page.waitForSelector('.cal');
            await page.click('.cal-foot button >> text=Today');
            const picked = await page.evaluate(() => ({ open: !!document.querySelector('.cal'), value: document.querySelector('.chk .tick-date').dataset.value, spin: getComputedStyle(document.querySelector('.tick-odo')).appearance }));
            ok(native === 0 && !picked.open && /^\d{4}-\d\d-\d\d$/.test(picked.value) && picked.spin === 'textfield', `CT125: dates use the app's calendar; numbers have no spinners (${JSON.stringify({ native, ...picked })})`);
        }

        // Things people do by accident or on purpose.
        {
            const probe = async (opts, fn) => { const cx = await browser.newContext(opts); const pp = await cx.newPage(); const errs = []; pp.on('pageerror', (e) => errs.push(e.message)); try { return { ...(await fn(pp)), errs: errs.length }; } finally { await cx.close(); } };
            const proto = await probe({}, async (pp) => { await pp.goto(`${BASE}/ct125/#tab=__proto__`, { waitUntil: 'load' }); await pp.waitForSelector('.quick button'); return { ok: true }; });
            const late = await probe({ timezoneId: 'America/Los_Angeles' }, async (pp) => {
                await pp.clock.setFixedTime(new Date('2026-11-17T20:30:00-08:00'));
                await pp.goto(`${BASE}/ct125/#tab=service`, { waitUntil: 'load' }); await pp.waitForSelector('.chk input');
                await pp.click('.chk input[type=checkbox] >> nth=0');
                return { day: await pp.getAttribute('.tick-date', 'data-value') };
            });
            const odo = await probe({}, async (pp) => {
                await pp.goto(`${BASE}/ct125/`, { waitUntil: 'load' }); await pp.waitForSelector('#bedit');
                await pp.click('#bedit'); await pp.fill('#odo', '12345678'); await pp.click('#bsave');
                const big = await pp.getAttribute('.odometer', 'aria-label');
                await pp.click('#bedit'); await pp.fill('#odo', '-50'); await pp.click('#bsave');
                return { big, neg: await pp.getAttribute('.odometer', 'aria-label') };
            });
            const bad = await probe({}, async (pp) => { await pp.goto(`${BASE}/ct125/#bike=zAAAA`, { waitUntil: 'load' }); await pp.waitForSelector('#sharewin:not([hidden])'); return { text: await pp.textContent('#sharebody') }; });
            const visit = await probe({}, async (pp) => { await pp.goto(`${BASE}/ct125/#year=2023&tab=service`, { waitUntil: 'load' }); await pp.waitForSelector('.chk input'); return { locked: await pp.$eval('.chk input[type=checkbox]', (x) => x.disabled) }; });
            ok(proto.errs === 0 && late.day === '2026-11-17' && /^12,345,678 mi/.test(odo.big) && /^0 mi/.test(odo.neg) && /incomplete or damaged/.test(bad.text) && visit.locked,
                `CT125: odd links, a US evening, huge or negative odometers, broken share links, and a year opened from a link (${JSON.stringify({ proto, late, odo, bad: !!bad.text, visit })})`);
        }

        // Tools owned counts every tool on the list, not only the priced ones.
        await page.click('.tabs [data-v=tools]');
        const tools = await page.evaluate(() => ({ shown: document.querySelector('.tl-sum b').textContent, rows: document.querySelector('#v-tools .box').querySelectorAll('.trow').length, opt: document.querySelector('#v-tools .box').querySelectorAll('.tag2').length }));
        ok(tools.shown === `0 / ${tools.rows - tools.opt}` && tools.rows > 8, `CT125: tools owned is out of all listed tools (${JSON.stringify(tools)})`);
        await page.click('.tabs [data-v=service]');
        const inst = await page.evaluate(() => { const b = document.querySelector('#install'); b.click(); return { shown: !b.hidden, how: document.querySelector('#installhow').textContent }; });
        ok(inst.shown && /Install app|Home Screen/i.test(inst.how), `CT125: Install is offered at the top and says where to find it when the browser has no prompt (${inst.how})`);

        // The 2023+ (JA65) year: km schedule with the oil filter, its own part numbers and prices, both code systems.
        {
            const p2 = await ctx.newPage();
            p2.on('dialog', (d) => d.accept()); // (changing the model of a bike with ticks asks first)
            await p2.goto(`${BASE}/ct125/`, { waitUntil: 'load' });
            await p2.waitForSelector('#bedit');
            await p2.click('#bedit');
            const labels = await p2.evaluate(() => [...document.querySelectorAll('#byear .custom-dropdown-item')].map((o) => o.textContent).join(' / '));
            await p2.click('#byear .custom-dropdown-toggle'); await p2.click('#byear .custom-dropdown-item[data-value="2023:2024"]'); await p2.click('#bsave');
            await p2.waitForFunction(() => /JA65/.test(document.querySelector('.bike-year')?.textContent || '') && /2023/.test(document.querySelector('#sub').textContent));
            await p2.click('.tabs [data-v=service]');
            const y = await p2.evaluate(() => ({ unit: document.querySelector('.box .bh h3').textContent, filter: [...document.querySelectorAll('.chk .nm2')].some((n) => /oil filter$/i.test(n.firstChild.textContent.trim())), pn: document.querySelector('#shopbox')?.textContent.includes('15412-MGS-D21'), tools: !document.querySelector('.tabs [data-v=tools]').hidden }));
            y.labels = labels;
            await p2.click('.tabs [data-v=codes]');
            const codes = await p2.evaluate(() => document.querySelectorAll('#v-codes .dt').length);
            ok(/^(12,000 km|7,500 mi)$/.test(y.unit) && y.filter && y.pn && y.tools && codes === 3 && /2022 \(JA55\) \/ 2023 \(JA65\)/.test(y.labels), `CT125: the 2023+ year has its km schedule, oil filter part, tools and both code tables (${JSON.stringify({ ...y, codes })})`);
            await p2.click('#bedit'); await p2.click('#byear .custom-dropdown-toggle'); await p2.click('#byear .custom-dropdown-item[data-value="2021:2021"]'); await p2.click('#bsave');
            await p2.waitForFunction(() => /2021/.test(document.querySelector('#sub').textContent));
            await p2.close();
        }

        // Links open what they name, and the address follows what is on screen.
        {
            const p3 = await ctx.newPage();
            await p3.goto(`${BASE}/ct125/#year=2023&guide=engine-oil-filter`, { waitUntil: 'load' });
            await p3.waitForFunction(() => !document.querySelector('#guide').hidden);
            const g = await p3.evaluate(() => ({ title: document.querySelector('#gtitle').textContent, year: document.querySelector('.bike-year').textContent }));
            await p3.click('#gclose');
            await p3.click('.tabs [data-v=specs]');
            await p3.fill('#sf', 'fork');
            await p3.waitForFunction(() => /tab=specs&q=fork/.test(location.hash));
            ok(g.title === 'Engine oil filter' && /JA65/.test(g.year), `CT125: a link opens its guide and year, and the address tracks the view (${JSON.stringify(g)})`);
            await p3.close();
        }

        // No page of Honda's manual is ever served: a citation opens as text.
        await page.click('.chk .pg');
        const cite = await page.evaluate(() => ({ nopdf: document.querySelector('#viewer').classList.contains('nopdf'), load: !!document.querySelector('#vpanel [data-do=pick]'), img: !document.querySelector('#vimg').hidden }));
        ok(cite.nopdf && cite.load && !cite.img && imgs.length === 0 && errors.length === 0, `CT125: without the owner's PDF a page is a citation, no scans requested (${JSON.stringify(cite)}, images=${imgs.length}, errors=${errors.join(';') || 'none'})`);
        await page.keyboard.press('Escape');

        // The owner's own PDF, read on their device, fills the viewer and is remembered.
        const mk = await ctx.newPage();
        await mk.setContent(Array.from({ length: 3 }, (_, i) => `<div style="page-break-after:always;font:90px sans-serif">PDF ${i + 1}</div>`).join(''));
        const pdfBytes = await mk.pdf({ width: '8.5in', height: '11in' });
        await mk.close();
        await page.click('.tabs [data-v=pages]');
        await page.setInputFiles('#pdfpick', { name: 'mine.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
        await page.waitForFunction(() => document.querySelector('.prow img')?.src.startsWith('blob:'), null, { timeout: 20000 });
        await page.reload({ waitUntil: 'load' });
        const again = await page.waitForFunction(() => document.querySelector('.prow img')?.src.startsWith('blob:'), null, { timeout: 20000 }).then(() => true, () => false);
        await page.click('.prow');
        const shown = await page.waitForFunction(() => !document.querySelector('#vimg').hidden && document.querySelector('#vimg').naturalWidth > 1000, null, { timeout: 20000 }).then(() => true, () => false);
        const warn = await page.evaluate(() => !!document.querySelector('#v-pages .flag'));
        ok(again && shown && warn, `CT125: a loaded PDF renders pages, is remembered, and a wrong page count is flagged (remembered=${again}, shown=${shown}, flagged=${warn})`);
        // A PDF whose fingerprint the year's data lists is recognised and gets its page offset.
        {
            await page.keyboard.press('Escape');
            const fp = (await import('node:crypto')).createHash('sha256').update(pdfBytes).digest('hex').slice(0, 16);
            const shown1 = await page.textContent('#v-pages .bar');
            const fc = await browser.newContext({ serviceWorkers: 'block' });
            await fc.route(/\/ct125\/data\/\d+\.json$/, async (r) => { const res = await r.fetch(); const d = await res.json(); d.source.files = [{ fp, shift: 2 }]; r.fulfill({ response: res, json: d }); });
            const pf = await fc.newPage();
            await pf.goto(`${BASE}/ct125/`, { waitUntil: 'load' });
            await pf.click('.tabs [data-v=pages]');
            await pf.setInputFiles('#pdfpick', { name: 'mine.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
            await pf.waitForFunction(() => /indexed copy/.test(document.querySelector('#v-pages .bar')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
            const got = await pf.evaluate(() => ({ bar: document.querySelector('#v-pages .bar').textContent.replace(/\s+/g, ' '), flag: !!document.querySelector('#v-pages .flag') }));
            await fc.close();
            ok(shown1.includes(`fingerprint ${fp}`) && /✓ indexed copy/.test(got.bar) && /Page offset\s*−\s*2\s*\+/.test(got.bar) && !got.flag,
                `CT125: a PDF shows its fingerprint, and a listed one is recognised with its page offset (${JSON.stringify({ fp, ...got })})`);
        }
        await ctx.close();
    }

    // Roundup: page-level regressions found by a sweep of every page, theme and screen size.
    {
        const lum = (c) => { const m = c.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/); const v = m ? m.slice(1, 4).map(Number) : c.match(/[\d.]+/g).slice(0, 3).map((x) => x / 255); return v.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const themed = async (theme, view = { viewport: { width: 1280, height: 800 } }) => { const c = await browser.newContext({ ...view, serviceWorkers: 'block' }); await c.addInitScript((t) => { localStorage.setItem('pelmeniboiler-theme', t); localStorage.setItem('pelmeniboiler-mode', 'lcd'); }, theme); return c; };
        const phone = { viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true };

        // The build puts its theme <script> after real stylesheet links only, never inside a script's text.
        const c1 = await browser.newContext({ serviceWorkers: 'block' }); const errs = [];
        for (const u of ['/tools/sofrut.html', '/tools/sofrut2.html']) { const p = await c1.newPage(); p.on('pageerror', (e) => errs.push(`${u}: ${e.message}`)); await p.goto(`${BASE}${u}`, { waitUntil: 'load' }); await p.close(); }
        ok(errs.length === 0, `Roundup: sofrut tools load without script errors (${errs.join('; ') || 'none'})`);
        // The zine fits its column on a phone.
        const pz = await (await browser.newContext({ ...phone, serviceWorkers: 'block' })).newPage();
        await pz.goto(`${BASE}/zine/en/`, { waitUntil: 'load' });
        const zw = await pz.evaluate(() => document.documentElement.scrollWidth);
        await pz.context().close(); await c1.close();
        ok(zw <= 412, `Roundup: the zine's pictures fit a phone screen (page ${zw}px wide)`);
        // Pages that once ran wider than a phone: Graflect text (its own word space now wraps) and three tools.
        const pw2 = await browser.newContext({ ...phone, serviceWorkers: 'block' }); const widths = {};
        for (const u of ['/blog/graflect.html', '/tools/gt.html', '/tools/editor.html', '/tools/definitionviewer.html']) { const p = await pw2.newPage(); await p.goto(`${BASE}${u}`, { waitUntil: 'load' }); widths[u] = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('aside')].map((a) => a.scrollWidth - a.clientWidth + 412))); await p.close(); }
        await pw2.close();
        ok(Object.values(widths).every((w) => w <= 412), `Roundup: Graflect text and the tools fit a phone (${JSON.stringify(widths)})`);
        // Right-to-left: the RSS menu opens inwards in Hebrew instead of widening the page.
        const ph = await browser.newContext({ ...phone, serviceWorkers: 'block' }); await ph.addInitScript(() => localStorage.setItem('pelmeniboiler-lang', 'he'));
        const pr = await ph.newPage(); await pr.goto(`${BASE}/`, { waitUntil: 'load' }); await pr.click('#blog-window .rss-btn'); await pr.waitForTimeout(300);
        const rw = await pr.evaluate(() => { const r = document.querySelector('#blog-window .rss-dropdown-content').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, left: Math.round(r.left) }; });
        await ph.close();
        ok(rw.sw <= 412 && rw.left >= 0, `Roundup: the RSS menu stays on screen in Hebrew (${JSON.stringify(rw)})`);
        // Moroz: title text readable on its frosted bar.
        const cm = await themed('moroz'); const pm = await cm.newPage(); await pm.goto(`${BASE}/`, { waitUntil: 'load' });
        const mz = await pm.evaluate(() => { const t = document.querySelector('.title-bar'); return [getComputedStyle(t).color, getComputedStyle(t).backgroundColor]; });
        await cm.close();
        ok(ratio(...mz) >= 3, `Roundup: Moroz title bars are readable (contrast ${ratio(...mz).toFixed(2)})`);
        // WordArt: the launcher bar fits a phone.
        const cw = await themed('wordart', phone); const pw = await cw.newPage(); await pw.goto(`${BASE}/`, { waitUntil: 'load' });
        const ww = await pw.evaluate(() => document.querySelector('.start-menu').getBoundingClientRect().right);
        await cw.close();
        ok(ww <= 412, `Roundup: WordArt's launcher fits a phone (right edge ${Math.round(ww)}px)`);
        // Funky: every random palette keeps title-bar text and body text readable.
        const cf = await themed('funky'); const pf = await cf.newPage(); let worst = 99;
        for (let i = 0; i < 30; i++) { await pf.goto(`${BASE}/`, { waitUntil: 'load' }); const [bar, text, bg] = await pf.evaluate(() => { const t = getComputedStyle(document.querySelector('.title-bar')); return [t.backgroundColor, getComputedStyle(document.body).color, getComputedStyle(document.body).backgroundColor].concat([t.color]); }).then((v) => [[v[3], v[0]], [v[1], v[2]]]).then(([a, b]) => [ratio(...a), ratio(...b), 0]); worst = Math.min(worst, bar, text); }
        await cf.close();
        ok(worst >= 3, `Roundup: Funky's random palettes stay readable (worst contrast over 30 draws ${worst.toFixed(2)})`);
        // Editor: the two export buttons keep their own colours.
        const ce = await browser.newContext({ serviceWorkers: 'block' }); const pe = await ce.newPage(); await pe.goto(`${BASE}/tools/editor.html`, { waitUntil: 'load' });
        const eb = await pe.evaluate(() => ['export-button', 'json-button'].map((id) => { const c = getComputedStyle(document.getElementById(id)); return [c.color, c.backgroundColor]; }));
        await ce.close();
        ok(eb.every((x) => ratio(...x) >= 4.5), `Roundup: the editor's export buttons are readable (${eb.map((x) => ratio(...x).toFixed(1)).join(', ')})`);
    }

    // A link to a window opens it: the clock link in the proportional-hours post, and arriving at /index.html#zman-clock-window.
    {
        const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
        const p = await c.newPage();
        const isOpen = () => p.evaluate(() => { const w = document.getElementById('zman-clock-window'); return !!w && getComputedStyle(w).display !== 'none' && !w.classList.contains('init-closed'); });
        await p.goto(`${BASE}/blog/you-should-sometimes-tell-time-using-proportional-hours.html`, { waitUntil: 'load' });
        await p.waitForSelector('a[href="#zman-clock-window"]');
        const before = await isOpen();
        await p.click('a[href="#zman-clock-window"]'); await p.waitForTimeout(300);
        const fromLink = await isOpen();
        await p.goto(`${BASE}/index.html#zman-clock-window`, { waitUntil: 'load' }); await p.waitForTimeout(800);
        const onArrival = await isOpen();
        await c.close();
        ok(!before && fromLink && onArrival, `Window links: the clock link opens shaon.zmanim, and so does arriving with its hash (${JSON.stringify({ before, fromLink, onArrival })})`);
    }

    // The vault: a translation that makes the author a man, adds a dash she didn't write, drops her
    // semicolon, or misnames a settled term is caught; a faithful one isn't.
    {
        const { judge, loadRules } = await import('../build/vault-check.mjs');
        const rules = await loadRules();
        const rulesOf = (lang, en, t) => judge(rules, lang, en, t).map((h) => h.rule).sort();
        const bad = {
            masc: rulesOf('ru', 'I was sure.', 'Я был уверен.'),
            mascHe: rulesOf('he', "I'm glad.", 'אני שמח.'),
            dash: rulesOf('de', 'Motorcycles are great, mostly.', 'Motorräder sind toll — meistens.'),
            semi: rulesOf('ja', 'It works; mostly.', 'うまくいきます。だいたいは。'),
            term: rulesOf('de', 'The Great Escape', 'Die große Flucht'),
            claude: rulesOf('ru', 'Claude', 'Клод'),
        };
        const good = [rulesOf('ru', 'I was sure.', 'Я была уверена.'), rulesOf('he', "I'm glad.", 'אני שמחה.'), rulesOf('de', 'The Great Escape', 'Gesprengte Ketten'), rulesOf('ru', 'Washington', 'Вашингтон')];
        const caught = bad.masc.includes('author-feminine') && bad.mascHe.includes('author-feminine') && bad.dash.includes('no-new-dash')
            && bad.semi.includes('keep-semicolons') && bad.term.some((r) => r.startsWith('term:')) && bad.claude.includes('claude-latin') && good.every((g) => g.length === 0);
        // ...and the Graflect dictionary ships the words learned from her articles.
        const gd = await fs.readFile(path.join(ROOT, 'scripts/blog/demos/graflect-data.js'), 'utf-8');
        const learned = Object.keys(JSON.parse((gd.match(/const articleWordMap = (\{.*\});/) || [, '{}'])[1])).length;
        ok(caught && learned > 1000, `Vault rules catch the wrong lines and pass the right ones; Graflect learned ${learned} words from the articles (${JSON.stringify({ bad, good })})`);
        // The Graflect grader: leave one article out, score against her own Graflect. The dictionary is the floor.
        const ev = await import('../build/gt-eval.mjs');
        const rows = await ev.evaluate(ev.dictionarySystem(await ev.graflectData()));
        const right = rows.reduce((a, r) => a + r.right, 0), words = rows.reduce((a, r) => a + r.words, 0);
        ok(rows.length >= 8 && right / words >= 0.6, `Graflect grader: the dictionary spells ${(100 * right / words).toFixed(0)}% of held-out words as she does, over ${rows.length} articles`);
    }

    // The Graflect queue: lines with no Graflect, drafted from the dictionary, published (mocked) as one commit.
    {
        const c = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
        const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
        let tree = null;
        await c.route('https://api.github.com/**', async (route) => {
            const req = route.request(), u = new URL(req.url());
            const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
            const m = u.pathname.match(/\/contents\/(.+)$/);
            if (m) return j({ content: Buffer.from(await fs.readFile(path.join(ROOT, m[1]), 'utf-8'), 'utf8').toString('base64') });
            if (/ref\/heads\/main$/.test(u.pathname)) return j({ object: { sha: 'base1' } });
            if (/git\/refs$/.test(u.pathname)) return j({}, 201);
            if (/git\/commits\/base1$/.test(u.pathname)) return j({ tree: { sha: 't0' } });
            if (/git\/trees$/.test(u.pathname)) { tree = JSON.parse(req.postData()); return j({ sha: 't1' }); }
            if (/git\/commits$/.test(u.pathname)) return j({ sha: 'c1' });
            if (/git\/refs\/heads\//.test(u.pathname)) return j({});
            if (/pulls$/.test(u.pathname)) return j({ html_url: 'https://github.com/x/y/pull/1' });
            return j({ message: 'unexpected' }, 500);
        });
        await p.goto(`${BASE}/tools/gt.html`, { waitUntil: 'load' });
        await p.waitForSelector('#queue-list button');
        await p.click('#queue-list button:has-text("sunshine")');
        const first = await p.evaluate(() => ({ slug: document.getElementById('slug-input').value, gt: document.getElementById('graflect-input').value, latin: document.getElementById('queue-status').textContent }));
        let n = 0; while (await p.evaluate(() => !document.getElementById('submit-btn').hidden) && n < 40) { await p.click('#submit-btn'); n++; }
        await p.fill('#gh-token', 'test-token'); await p.dispatchEvent('#gh-token', 'change');
        await p.click('#queue-publish-btn'); await p.waitForFunction(() => /published|✗/.test(document.getElementById('queue-pub-status').textContent));
        const committed = tree ? tree.tree.map((t) => t.path).sort() : [];
        const sun = tree && JSON.parse(tree.tree.find((t) => t.path === 'localization/sunshine.json').content);
        const left = await p.evaluate(() => localStorage.getItem('pelmeniboiler-gt-queue'));
        await c.close();
        ok(/[-]/.test(first.gt) && /‹[^›]+›/.test(first.slug) && /Left in Latin/.test(first.latin)
            && JSON.stringify(committed) === JSON.stringify(['localization/sunshine.json', 'localization/tl-status.json'])
            && sun && Object.keys(sun.gt).filter((k) => k.startsWith('sunshine_alt')).length === 8 && left === '{}' && !errs.length,
            `Graflect queue: drafts lines in SLUG from the dictionary, marks Latin, publishes the file and the tracker in one commit (${JSON.stringify({ n, committed, left, errs })})`);
    }

    // Translation review: lines with back-translations, questions with options; her answers go back as one commit.
    {
        const c = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
        const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
        p.on('dialog', (d) => d.accept('Is this the right word for tyres?'));
        let tree = null;
        const reviewFile = await fs.readFile(path.join(process.cwd(), 'vault/reviews/ct125.json'), 'utf-8');
        await c.route('https://api.github.com/**', async (route) => {
            const req = route.request(), u = new URL(req.url());
            const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
            if (/\/contents\/vault\/reviews\/ct125\.json/.test(u.pathname)) return j({ content: Buffer.from(reviewFile, 'utf8').toString('base64') });
            if (/ref\/heads\/main$/.test(u.pathname) && req.method() === 'GET') return j({ object: { sha: 'base1' } });
            if (/git\/commits\/base1$/.test(u.pathname)) return j({ tree: { sha: 't0' } });
            if (/git\/trees$/.test(u.pathname)) { tree = JSON.parse(req.postData()); return j({ sha: 't1' }); }
            if (/git\/commits$/.test(u.pathname)) return j({ sha: 'c1' });
            if (/git\/refs\/heads\/main$/.test(u.pathname)) return j({});
            return j({ message: 'unexpected' }, 500);
        });
        await p.goto(`${BASE}/tools/review.html?article=ct125`, { waitUntil: 'load' });
        await p.waitForSelector('.line .back');
        const shown = await p.evaluate(() => ({ lines: document.querySelectorAll('.line').length, backs: document.querySelectorAll('.back').length, qs: document.querySelectorAll('.q[data-id]').length, en: document.querySelector('.line .en').textContent }));
        const firstQ = await p.$eval('.q[data-id]', (q) => q.dataset.id);
        await p.click(`.q[data-id="${firstQ}"] .opt[data-pick="1"]`);
        await p.fill(`.q[data-id="${firstQ}"] textarea[data-field="note"]`, 'This one, please.');
        await p.click('.line [data-ask]');
        await p.click('details.gh summary'); await p.fill('#gh-token', 'test-token'); await p.dispatchEvent('#gh-token', 'change');
        await p.click('#send'); await p.waitForFunction(() => /Sent|✗/.test(document.getElementById('status').textContent));
        const sent = tree && JSON.parse(tree.tree[0].content);
        const q = sent && sent.questions.find((x) => x.id === firstQ), asked = sent && sent.questions.at(-1);
        await c.close();
        ok(shown.lines > 20 && shown.backs > 40 && shown.qs > 5 && shown.en.trim() && tree && tree.tree[0].path === 'vault/reviews/ct125.json'
            && q.status === 'answered' && q.answer.pick === 1 && q.thread.at(-1).who === 'wendy' && asked.thread[0].text === 'Is this the right word for tyres?' && !errs.length,
            `Translation review: shows lines, back-translations and questions; sends her pick, note and new question as one commit (${JSON.stringify({ shown: { ...shown, en: undefined }, errs })})`);
    }

    // The daylight figure: the north pole turns the axis through the year, dated in the Hebrew calendar.
    {
        const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
        const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`${BASE}/blog/you-should-sometimes-tell-time-using-proportional-hours.html`, { waitUntil: 'load' });
        await p.waitForSelector('#zh-daylight .zh-knob');
        const read = () => p.evaluate(() => ({ date: document.querySelector('#zh-daylight .zh-knob').getAttribute('aria-valuetext'), text: document.querySelector('#zh-daylight .zh-scene').textContent }));
        const caption = await p.evaluate(() => !!document.querySelector('#zh-daylight')?.closest('figure')?.querySelector('figcaption'));
        // Drag the pole to the far right of its track: the June solstice.
        await p.$eval('#zh-daylight', (s) => s.scrollIntoView({ block: 'center' }));
        // LCD: on screen, it walks through the year by itself.
        const w0 = (await read()).date; await p.waitForTimeout(1200); const w1 = (await read()).date;
        const right = await p.evaluate(() => { const s = document.getElementById('zh-daylight'); const pt = new DOMPoint(175 + 168 * Math.sin(23.44 * Math.PI / 180), 67).matrixTransform(s.getScreenCTM()); return [pt.x, pt.y]; });
        // hover() waits for the walking handle to hold still between steps, so the press lands on it.
        await p.locator('#zh-daylight .zh-knob').hover(); await p.mouse.down(); await p.mouse.move(right[0], right[1], { steps: 10 }); await p.mouse.up();
        const june = await read();
        await p.waitForTimeout(800); const held = (await read()).date === june.date; // grabbed: it stays put
        await p.focus('#zh-daylight .zh-knob'); await p.keyboard.press('PageUp'); await p.keyboard.press('ArrowRight');
        const later = await read();
        // The hours figure: clock times wander through the year; proportional ones stay 0 / 6 / 12.
        const hours = () => p.evaluate(() => { const t = document.querySelector('#zh-hours .zh-scene').textContent; return { date: document.querySelector('#zh-hours .zh-knob').getAttribute('aria-valuetext'), noon: (t.match(/midday (\d+:\d\d)/) || [])[1] }; });
        await p.focus('#zh-hours .zh-knob'); await p.keyboard.press('Home'); const h0 = await hours();
        for (let i = 0; i < 6; i++) await p.keyboard.press('PageUp');
        const h1 = await hours();
        // E-ink: buttons appear and step the date; LCD: they don't.
        const lcdButtons = await p.$eval('.zh-steps[data-for="zh-hours"]', (e) => getComputedStyle(e).display);
        await p.evaluate(() => localStorage.setItem('pelmeniboiler-mode', 'eink')); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('#zh-hours .zh-knob');
        await p.$eval('#zh-hours', (s) => s.scrollIntoView({ block: 'center' }));
        const e0 = await hours(); await p.waitForTimeout(800); const einkStill = (await hours()).date === e0.date;
        await p.click('.zh-steps[data-for="zh-hours"] button[data-step="30"]'); const e1 = await hours();
        const einkButtons = await p.$eval('.zh-steps[data-for="zh-hours"]', (e) => getComputedStyle(e).display);
        await p.evaluate(() => localStorage.removeItem('pelmeniboiler-mode'));
        // The zine keeps the figures and drops their controls; the Time filter has its own icon.
        await p.goto(`${BASE}/zine/en/index.html`, { waitUntil: 'load' });
        const zine = await p.evaluate(() => ({ figs: document.querySelectorAll('.zine-article .zh-fig').length, controls: document.querySelectorAll('.zine-article [data-zine="drop"], .zine-article .zh-steps').length }));
        await p.goto(`${BASE}/blog/index.html`, { waitUntil: 'load' });
        const timeIcon = await p.$eval('[data-keyword="Time"] .symbol', (s) => s.textContent.trim());
        await c.close();
        ok(h0.noon && h1.noon && h0.noon !== h1.noon && h0.date !== h1.date && lcdButtons === 'none' && einkButtons === 'flex' && einkStill && e0.date !== e1.date
            && zine.figs === 2 && zine.controls === 0 && timeIcon === '⌛',
            `Hours figure: midday moves through the year, e-ink buttons step the date, the zine drops the controls, Time has ⌛ (${JSON.stringify({ h0, h1, lcdButtons, einkButtons, einkStill, e0: e0.date, e1: e1.date, zine, timeIcon })})`);
        ok(!caption && w0 !== w1 && held && /^\d+ (Sivan|Tamuz|Tammuz) 57\d\d$/.test(june.date) && /several weeks/.test(june.text) && /Stockholm.*18 h/.test(june.text)
            && later.date !== june.date && !/several weeks/.test(later.text) && !errs.length,
            `Daylight figure: walks through the year until grabbed; dragging the pole right gives the June solstice; keys move the date (${JSON.stringify({ caption, w0, w1, held, june: june.date, later: later.date, errs })})`);
    }

    // Sofrut II: inline tags start and stop at the caret, notes for Claude stay out of the article,
    // one click publishes both files to GitHub (mocked), and pasted translation replies survive prose and fences.
    {
        const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
        const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
        let tree = null; const calls = [];
        await c.route('https://api.github.com/**', async (route) => {
            const req = route.request(), u = new URL(req.url()); calls.push(`${req.method()} ${u.pathname}`);
            const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
            if (/ref\/heads\/main$/.test(u.pathname)) return j({ object: { sha: 'base1' } });
            if (/ref\/heads\/sofrut\//.test(u.pathname)) return j({ message: 'Not Found' }, 404);
            if (/git\/refs$/.test(u.pathname)) return j({}, 201);
            if (/git\/commits\/base1$/.test(u.pathname)) return j({ tree: { sha: 'tree0' } });
            if (/git\/trees$/.test(u.pathname)) { tree = JSON.parse(req.postData()); return j({ sha: 'tree1' }, 201); }
            if (/git\/commits$/.test(u.pathname)) return j({ sha: 'c1', html_url: 'https://github.com/o/r/commit/c1' }, 201);
            if (/git\/refs\/heads\//.test(u.pathname)) return j({});
            if (/\/pulls$/.test(u.pathname)) return j({ html_url: 'https://github.com/pelmeniboiler/pelmeniboiler.github.io/pull/999' }, 201);
            return j({ message: 'unexpected' }, 500);
        });
        await p.goto(`${BASE}/tools/sofrut2.html`, { waitUntil: 'load' });
        await p.waitForFunction(() => document.querySelectorAll('#kw-pool .chip').length > 0, null, { timeout: 5000 }).catch(() => {});
        const startsWithProps = await p.isVisible('#dlg-props');
        await p.fill('#title', 'Gear Test');
        const prefix = await p.inputValue('#prefix');
        await p.click('#dlg-props .chip[data-close]');
        const tag = (name) => p.click(`#tb button[data-name="${name}"]`);
        await p.click('#doc'); await p.keyboard.type('E=mc');
        await tag('Superscript'); await p.keyboard.type('2'); await tag('Superscript'); await p.keyboard.type(' and ');
        await tag('Code'); await p.keyboard.type('ls'); await tag('Code'); await p.keyboard.type(' done');
        await p.keyboard.press('Enter'); await tag('Note for Claude'); await p.keyboard.type('pun on Zen and the Art');
        await p.keyboard.press('Enter'); await p.keyboard.type('Back to prose.');
        await p.click('.menubar .top:has-text("View")'); await p.click('[data-act=files]');
        const html = await p.inputValue('#out-html'), json = JSON.parse(await p.inputValue('#out-json'));
        await p.keyboard.press('Escape');
        const en = Object.values(json.en).join(' | ');
        ok(startsWithProps && prefix !== 'gt' && /E=mc<sup>2<\/sup> and <code>ls<\/code> done/.test(en) && /Back to prose\./.test(en) && !/pun on Zen/.test(en) && html.includes('<!-- note for Claude: pun on Zen and the Art -->'),
            `Sofrut II: tags start and stop at the caret, a note for Claude stays out of the article (${JSON.stringify({ startsWithProps, prefix, en })})`);
        await p.click('.menubar .top:has-text("File")'); await p.click('[data-act=publish]');
        await p.waitForSelector('#dlg-github:not([hidden])'); await p.fill('#gh-token', 'github_pat_test'); await p.click('#gh-save');
        await p.click('.menubar .top:has-text("File")'); await p.click('[data-act=publish]');
        await p.waitForFunction(() => /published|✗/.test(document.querySelector('#pub-status').textContent), null, { timeout: 10000 });
        const pub = await p.textContent('#pub-status');
        ok(/pull\/999/.test(pub) && tree && tree.tree.map((x) => x.path).join() === `blog/gear-test.html,localization/${prefix}.json` && calls.some((x) => /POST .*\/pulls$/.test(x)),
            `Sofrut II: publish puts both files in one commit and opens a pull request (${pub}; ${calls.length} calls)`);
        // A translator note on a phrase: kept out of the English, saved beside it, published with it, kept in the draft.
        await p.evaluate(() => { const t = [...document.querySelectorAll('#doc p')].find((x) => /Back to prose/.test(x.textContent)).firstChild; const r = document.createRange(); r.setStart(t, 8); r.setEnd(t, 13); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        await tag('Note for translators');
        await p.fill('#askf-note', 'keep the pun'); await p.press('#askf-note', 'Enter');
        await p.click('.menubar .top:has-text("View")'); await p.click('[data-act=files]');
        const en2 = JSON.parse(await p.inputValue('#out-json')).en, notes = JSON.parse(await p.inputValue('#out-notes') || '{}');
        await p.keyboard.press('Escape');
        await p.click('.menubar .top:has-text("File")'); await p.click('[data-act=publish]');
        await p.waitForFunction(() => /published|✗/.test(document.querySelector('#pub-status').textContent) && !/publishing/.test(document.querySelector('#pub-status').textContent), null, { timeout: 10000 });
        const paths = tree.tree.map((x) => x.path);
        await p.reload({ waitUntil: 'load' });
        const kept = await p.evaluate(() => document.querySelectorAll('#doc span[data-tl]').length);
        await c.close();
        const noteKey = Object.keys(notes)[0];
        ok(noteKey && notes[noteKey][0].text === 'prose' && notes[noteKey][0].note === 'keep the pun' && /Back to prose\./.test(en2[noteKey]) && !/data-tl|span/.test(JSON.stringify(en2)) && paths.includes(`localization/notes/${prefix}.json`) && kept === 1 && errs.length === 0,
            `Sofrut II: a translator note stays out of the English, goes to localization/notes/ and is published with it (${JSON.stringify({ notes, paths, kept, errs })})`);
    }

    // Sofrut II, round two: description, the site's calendar (never the browser's), shortcuts, undo,
    // source view that can't run code, themed cursors, and a sheet the window manager leaves alone.
    {
        const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
        await c.addInitScript(() => { localStorage.setItem('pelmeniboiler-theme', 'moroz'); localStorage.setItem('pelmeniboiler-mode', 'lcd'); });
        const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
        await p.goto(`${BASE}/tools/sofrut2.html`, { waitUntil: 'load' });
        await p.waitForSelector('#dlg-props:not([hidden])');
        const native = await p.evaluate(() => document.querySelectorAll('input[type=date], input[type=time], input[type=datetime-local]').length);
        await p.fill('#title', 'Calendar Test'); await p.fill('#desc', 'A "quoted" <description>');
        await p.click('#date'); await p.waitForSelector('.cal');
        await p.click('.cal [data-step="-1"]'); await p.click('.cal .cal-day >> nth=14');
        const picked = await p.getAttribute('#date', 'data-value'), dateText = await p.textContent('#date');
        await p.click('#dlg-props .chip[data-close]');
        const mod = await p.evaluate(() => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Meta' : 'Control'));
        await p.click('#doc'); await p.keyboard.type('Water is H');
        await p.keyboard.press(`${mod}+Comma`); await p.keyboard.type('2'); await p.keyboard.press(`${mod}+Comma`); await p.keyboard.type('O on ');
        await p.click('#tb button[data-name="Date"]'); await p.waitForSelector('.cal'); await p.click('.cal-foot button:has-text("Today")');
        await p.keyboard.type(' and ');
        await p.keyboard.press(`${mod}+KeyB`); await p.keyboard.type('bold'); await p.keyboard.press(`${mod}+KeyB`);
        await p.keyboard.press(`${mod}+Alt+Digit2`);
        const afterKeys = await p.$eval('#doc', (d) => d.innerHTML.replace(/\u200B/g, '').replace(/&nbsp;/g, ' '));
        await p.keyboard.press(`${mod}+KeyZ`);
        const afterUndo = await p.$eval('#doc', (d) => d.innerHTML);
        await p.keyboard.press(`${mod}+Shift+KeyZ`);
        const afterRedo = await p.$eval('#doc', (d) => d.innerHTML);
        // Source view: a would-be script and an image error handler must never run.
        await p.evaluate(() => { window.__ran = 0; });
        await p.keyboard.press(`${mod}+Slash`);
        await p.fill('#src', '<p>safe</p><img src="x" onerror="window.__ran=1"><script>window.__ran=2<\/script><style>p{}</style><a href="javascript:window.__ran=3">x</a>');
        await p.keyboard.press(`${mod}+Slash`); await p.waitForTimeout(300);
        const ran = await p.evaluate(() => window.__ran), cleaned = await p.$eval('#doc', (d) => d.innerHTML);
        await p.click('.menubar .top:has-text("View")'); await p.click('[data-act=files]');
        const html = await p.inputValue('#out-html'), en = JSON.parse(await p.inputValue('#out-json')).en;
        await p.keyboard.press('Escape');
        const look = await p.evaluate(() => {
            const cur = (el) => { const v = getComputedStyle(el).cursor; return v.startsWith('url') ? decodeURIComponent((v.match(/fill%3D'([^']+)'/) || [])[1] || '') : v; };
            return { doc: cur(document.querySelector('#doc')) || 'svg', dlgBar: getComputedStyle(document.querySelector('#dlg-props .title-bar')).cursor.slice(0, 3), body: cur(document.body), sheetIsWindow: document.querySelector('.pane-doc').classList.contains('window') };
        });
        await c.close();
        ok(native === 0 && /^\d{4}-\d\d-15$/.test(picked) && /15 /.test(dateText) && html.includes(`<meta name="pubDate" content="${picked}T00:00:00Z">`),
            `Sofrut II: dates come from the site's calendar, never the browser's (${JSON.stringify({ native, picked, dateText })})`);
        ok(html.includes('<meta name="description" content="A &quot;quoted&quot; &lt;description&gt;">') && en.ct_desc === '<i>A &quot;quoted&quot; &lt;description&gt;</i>' && /data-key="ct_title"><\/h1>\s*<p data-key="ct_desc">/.test(html),
            `Sofrut II: the description is the meta description and the italic first paragraph (${JSON.stringify(en.ct_desc)})`);
        ok(/H<sub>2<\/sub>O on <time datetime="\d{4}-\d\d-\d\d">\d+ \w+ \d{4}<\/time>/.test(afterKeys) && /<b>bold<\/b>/.test(afterKeys) && /^<h2>/.test(afterKeys) && /^<p>/.test(afterUndo) && /^<h2>/.test(afterRedo),
            `Sofrut II: shortcuts, the 📅 tag and undo/redo work (${JSON.stringify({ afterKeys: afterKeys.slice(0, 160), undo: afterUndo.slice(0, 12), redo: afterRedo.slice(0, 12) })})`);
        ok(ran === 0 && !/script|style|onerror|javascript:/i.test(cleaned) && /safe/.test(cleaned),
            `Sofrut II: HTML from source view is cleaned before it can run (${JSON.stringify({ ran, cleaned })})`);
        ok(look.doc && /17303F/i.test(look.body) && look.dlgBar === 'url' && !look.sheetIsWindow && errs.length === 0,
            `Sofrut II: themed cursors everywhere, no plain OS arrow on dialog title bars (${JSON.stringify({ ...look, errs })})`);
    }

    // Sofrut II, found by trying to break it: formatting across paragraphs, dialogs keeping the selection
    // (links, abbreviations), and blocks nested by broken source.
    {
        const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
        const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`${BASE}/tools/sofrut2.html`, { waitUntil: 'load' }); await p.waitForSelector('#dlg-props:not([hidden])');
        await p.fill('#title', 'Break Test'); await p.click('#dlg-props .chip[data-close]');
        const tag = (n) => p.click(`#tb button[data-name="${n}"]`);
        const sel = (a, ai, z, zi) => p.evaluate(([a, ai, z, zi]) => { const ps = [...document.querySelectorAll('#doc > *')]; const tn = (el) => document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); const r = document.createRange(); r.setStart(tn(ps[a]), ai); r.setEnd(tn(ps[z]), zi); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, [a, ai, z, zi]);
        await p.click('#doc'); await p.keyboard.type('the GRA says to read the manual'); await p.keyboard.press('Enter'); await p.keyboard.type('Second paragraph here.');
        await sel(0, 4, 0, 7); await tag('Abbreviation'); await p.fill('#askf-title', 'Vilna Gaon'); await p.press('#askf-title', 'Enter');
        await p.evaluate(() => { const w = document.createTreeWalker(document.querySelector('#doc p'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && !n.data.includes('manual')); const i = n.data.indexOf('manual'), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        await tag('Link'); await p.fill('#askf-href', 'https://example.com/m'); await p.press('#askf-href', 'Enter');
        await p.evaluate(() => { const ps = document.querySelectorAll('#doc > p'), r = document.createRange(); r.setStart(ps[0], 0); r.setEnd(document.createTreeWalker(ps[1], NodeFilter.SHOW_TEXT).nextNode(), 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        await tag('Italic');
        const across = await p.$eval('#doc', (d) => d.innerHTML.replace(/​/g, ''));
        await p.keyboard.press('Control+Slash'); await p.fill('#src', '<h2><b>head<p>para</p></b></h2><aside><p>one</p><p>two</p></aside>'); await p.keyboard.press('Control+Slash');
        const nested = await p.$eval('#doc', (d) => d.innerHTML);
        await c.close();
        ok(/<abbr title="Vilna Gaon">GRA<\/abbr>/.test(across) && /<a href="https:\/\/example.com\/m">manual<\/a>/.test(across) && (across.match(/<i>/g) || []).length === 2 && /<\/i><\/p><p><i>/.test(across) && !/<(p|h2)\b[^>]*>[^<]*<(b|i)>[^<]*<p>/.test(nested) && /<aside>one<br>two<\/aside>/.test(nested) && errs.length === 0,
            `Sofrut II: formatting across paragraphs, dialogs keep the selection, nested blocks unwrapped (${JSON.stringify({ across: across.slice(0, 220), nested })})`);
    }

    await browser.close();
    server.close();
}

console.log(`\n${fail === 0 ? '🎉 ALL PASS' : '⚠️  FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
