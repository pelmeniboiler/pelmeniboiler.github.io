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
            return { bw, other, src: img.src.slice(0, 22) };
        });
        ok(dither && dither.src.startsWith('data:image/png') && dither.bw > dither.other * 20,
            `E-ink: images truly 1-bit dithered (bw=${dither?.bw}, other=${dither?.other})`);
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
            await new Promise((r) => setTimeout(r, 1200));
            const after = await (await cache.match('/notify-seen')).json();
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
        const lib = await page.evaluate(() => ({
            exists: !!document.getElementById('app-library'),
            folderItems: document.querySelectorAll('#app-library .app-folder .app-list a').length,
            demos: [...document.querySelectorAll('#app-library .app-section ~ .app-list a')].length,
            workbench: document.getElementById('app-library').textContent.includes('graflect.workbench'),
        }));
        ok(lib.exists && lib.folderItems === 2 && lib.demos >= 3 && !lib.workbench,
            `App library: hoi4 folder + demos, graflect.workbench suppressed (${JSON.stringify(lib)})`);
        await ctx.close();
    }

    // ============ TRAY: minimized windows + calendar clock ============
    {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(800); // modules + start-menu wiring

        const clock = (await page.textContent('#tray-clock').catch(() => '')) || '';
        ok(/57\d\d/.test(clock) && /\d{2}:\d{2}/.test(clock), `Tray clock shows Anno Mundi date + time (got "${clock}")`);

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
        }));
        const regaimA = await page.textContent('#zman-regaim');
        await page.waitForTimeout(250);
        const regaimB = await page.textContent('#zman-regaim');
        ok(zman.open && zman.letters === 12 && zman.chalakim >= 0 && zman.chalakim < 1080,
            `Zmanim clock opens: 12 Hebrew hour letters, chalakim in range (${zman.chalakim})`);
        ok(/57\d\d|5\d{3}/.test(zman.heb), `Zmanim clock: sunset-adjusted Hebrew date (got "${zman.heb}")`);
        ok(/rotate\(-/.test(zman.hand), `Zmanim clock: hand runs COUNTERCLOCKWISE (${zman.hand})`);
        ok(regaimA !== regaimB, `Zmanim clock: regaim tick live (${regaimA} → ${regaimB})`);

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
