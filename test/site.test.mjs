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

const ROOT = process.cwd();
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

        const welcome = await page.evaluate(() => document.querySelector('.welcome-text-eink')?.textContent || '');
        ok(!welcome.includes('without JavaScript'), 'Hub: JS-availability note removed from welcome');
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

        // Close the welcome window (started open) → docks to tray as an icon.
        await page.evaluate(() => {
            const win = document.querySelector('[data-key="welcome_h1"]').closest('.window');
            win.querySelector('.close-btn').click();
        });
        await page.waitForTimeout(300);
        const trayCount = await page.locator('#tray-icons .tray-icon').count();
        ok(trayCount === 1, `Tray: closed started-open window docks as icon (${trayCount})`);

        await page.click('#tray-icons .tray-icon');
        await page.waitForTimeout(300);
        const reopened = await page.evaluate(() =>
            getComputedStyle(document.querySelector('[data-key="welcome_h1"]').closest('.window')).display !== 'none');
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
            const h2 = document.querySelector('#about-window h2').getBoundingClientRect().width;
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
        const PANES = ['welcome-window', 'blog-window', 'app-library', 'music-window', 'logo-window', 'about-window'];
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
        ok(L.shown === 6 && L.overlaps === 0 && L.inView, `No-JS hub: 6 tiled panes, no overlap, all on screen (${JSON.stringify({ shown: L.shown, overlaps: L.overlaps, inView: L.inView })})`);
        ok(L.bar === 7 && L.closeBtns === 0, `No-JS hub: window bar (7 links), no dead close buttons (bar=${L.bar}, close=${L.closeBtns})`);
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
        ok(L.shown === 6, `No-JS hub: ▦ shows all panes again (shown=${L.shown})`);

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
        ok(JSON.stringify(folders.top) === '["light","dark","funky","zikit"]' && folders.colors.includes('akai') && folders.silly.includes('wordart')
            && folders.open[0] === true && folders.open[1] === false,
            `Settings: themes foldered (Zikit beside Funky), current theme's folder open (${JSON.stringify(folders)})`);
        await thctx.close();

        // Developer preview on: same tiles with JS, dragging disabled, settings gets a tall row.
        const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await tctx.addInitScript(() => localStorage.setItem('pelmeniboiler-dev-tiles', '1'));
        const tpage = await tctx.newPage();
        await tpage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await tpage.waitForTimeout(800);
        L = await layout(tpage);
        ok(L.shown === 6 && L.overlaps === 0 && L.inView && L.bar === 7, `Dev tiles: 6 panes, no overlap, window bar (${JSON.stringify({ shown: L.shown, overlaps: L.overlaps, bar: L.bar })})`);
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
        await drag('about-window', 120, -60);
        const a1 = await box('about-window');
        ok(Math.abs(a1.x - a0.x - 120) <= 2 && Math.abs(a1.y - a0.y + 60) <= 2, `WM: pointer drag moves a window (${a0.x},${a0.y} → ${a1.x},${a1.y})`);

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
                named: wins.filter((w) => w.getAttribute('role') === 'region' && document.getElementById(w.getAttribute('aria-labelledby'))?.textContent.trim()).length,
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
        ok(hub.shown > 10 && hub.drawn === hub.shown, `Emoji: every on-screen SVG glyph resolves in the sprite (${hub.drawn}/${hub.shown})`);
        ok(hub.blogTitle.includes('\u{1F4D3}'), `Emoji: the character stays in the text for copy/search (${JSON.stringify(hub.blogTitle)})`);
        await ctx.close();

        const nctx = await browser.newContext({ javaScriptEnabled: false });
        const npage = await nctx.newPage();
        await npage.goto(`${BASE}/blog/sunshine/en/`, { waitUntil: 'load' });
        const art = await npage.evaluate(() => document.querySelectorAll('.emoji > svg use[href*="/styles/emoji/sprite.svg"]').length);
        ok(art > 5, `Emoji: built pages arrive with SVG emoji for no-JS readers (${art})`);
        await nctx.close();

        const vctx = await browser.newContext();
        const vpage = await vctx.newPage();
        await vpage.goto(`${BASE}/tools/emojiviewer.html`, { waitUntil: 'load' });
        await vpage.waitForSelector('.block-count', { timeout: 8000 }).catch(() => {});
        const ev = await vpage.evaluate(() => ({
            family: getComputedStyle(document.querySelector('.symbol-item .symbol')).fontFamily,
            counts: document.querySelectorAll('.block-count').length,
            missing: document.querySelectorAll('.symbol-item.not-ours').length,
        }));
        ok(!/Color Emoji|Segoe UI Emoji/i.test(ev.family) && /SymbolaNoRI/.test(ev.family) && ev.counts > 5 && ev.missing > 0,
            `Emoji viewer: our stack only, gaps marked instead of tofu (${JSON.stringify(ev)})`);
        await vctx.close();
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
    await browser.close();
    server.close();
}

console.log(`\n${fail === 0 ? '🎉 ALL PASS' : '⚠️  FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
