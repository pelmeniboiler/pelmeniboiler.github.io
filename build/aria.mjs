// build/aria.mjs — accessibility attributes, stamped at build time.
//
//   Runs as part of `npm run build`, on the output in /_site.
//
// The site's chrome is hand-written <div>s dressed up as a desktop: windows,
// title bars, a custom dropdown, tab-like settings nav, toggle-like filter
// buttons, and a lot of decorative symbols. None of that means anything to a
// screen reader unless it is told. Rather than hand-maintain ARIA across every
// page (and forget it on the next one), the rules live here, once:
//
//   .window                → role="region", labelled by its title bar text
//   the content window     → role="main" (one per page)
//   .close-btn             → aria-label="Close" (otherwise read as "times")
//   .symbol beside a label → aria-hidden (decoration; the label says it all)
//   symbol in a titled span → role="img", named by that title
//   icon-only button/link  → aria-label from its title (unless translated at runtime)
//   .custom-dropdown       → button[aria-haspopup=listbox][aria-expanded] + listbox/options
//   .settings-nav          → tablist / tab / tabpanel, wired to each other
//   .filter-btn            → aria-pressed
//   .folder-crumbs         → aria-label="Breadcrumb"
//
// Every rule only ever ADDS an attribute that is not already there, so the
// step is idempotent and anything written by hand in the source wins.
//
// Two ways in:
//   ariaDocument(doc)      for pages the build generates through jsdom anyway.
//   ariaSourceFiles(root)  for hand-written pages and modules. These are
//                          patched in place by splicing the new attributes into
//                          the original start tags — the rest of the file is
//                          left byte-for-byte alone (no jsdom re-serialising).
//
// State (aria-expanded / aria-selected / aria-pressed) is given its initial
// value here and kept current by scripts/settings.js and scripts/blog-loader.js.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const INTERACTIVE = 'button, a[href], summary, [role="button"]';

/**
 * Apply the rules to a DOM document. Returns Map<Element, [name, value][]> of
 * exactly what was added (used by the source patcher).
 */
export function ariaDocument(doc) {
    const changes = new Map();
    const root = doc.body || doc;
    const set = (el, name, value) => {
        if (!el || el.hasAttribute(name)) return false;
        el.setAttribute(name, value);
        if (!changes.has(el)) changes.set(el, []);
        changes.get(el).push([name, value]);
        return true;
    };
    const usedIds = new Set([...root.querySelectorAll('[id]')].map((e) => e.id));
    const ensureId = (el, wanted) => {
        if (el.id) return el.id;
        if (!wanted || usedIds.has(wanted)) return null;
        usedIds.add(wanted);
        set(el, 'id', wanted);
        return wanted;
    };

    // Windows: a labelled region, named by its own title bar.
    for (const win of root.querySelectorAll('.window')) {
        const title = win.querySelector(':scope > .title-bar .title');
        const titleId = title && win.id ? ensureId(title, `${win.id}-title`) : (title && title.id) || null;
        if (titleId) set(win, 'aria-labelledby', titleId);
        // <nav class="window"> etc. already have a landmark role of their own.
        if (titleId && /^(DIV|SECTION)$/.test(win.tagName)) set(win, 'role', 'region');
    }

    // One main landmark per page: the window that holds the content people came
    // for (the post list on the hub, the article elsewhere).
    // (The settings window's inner <main> is layout, not the page's main.)
    for (const m of root.querySelectorAll('.settings-window main')) set(m, 'role', 'none');
    if (!root.querySelector('main:not([role="none"]), [role="main"]')) {
        const mainWin = [...root.querySelectorAll('.window')].find((w) => w.querySelector('#blog-posts-list, article'));
        if (mainWin && mainWin.getAttribute('role') === 'region') mainWin.setAttribute('role', 'main');
        else if (mainWin) set(mainWin, 'role', 'main');
        if (mainWin && changes.has(mainWin)) changes.set(mainWin, changes.get(mainWin).map(([n, v]) => (n === 'role' ? [n, 'main'] : [n, v])));
    }

    // "×" is announced as "times" / "multiplication sign".
    for (const btn of root.querySelectorAll('.close-btn')) set(btn, 'aria-label', 'Close');

    // Symbols: decoration when a text label sits beside them; otherwise the
    // control's title becomes its name.
    for (const sym of root.querySelectorAll('.symbol')) {
        if (sym.closest('[aria-hidden="true"]')) continue;
        const parent = sym.parentElement;
        if (!parent) continue;
        const own = sym.textContent;
        const beside = parent.textContent.replace(own, '').trim();
        if (beside) {
            // <span title="sunrise">🌅 06:12</span>: here the symbol IS the label
            // and the text beside it is only a value, so name it, don't hide it.
            if (parent.getAttribute('title') && !parent.matches(INTERACTIVE)) {
                if (set(sym, 'role', 'img')) set(sym, 'aria-label', parent.getAttribute('title'));
                continue;
            }
            // Only a LEADING icon is decoration ("🛠 system.settings"). A symbol
            // in the middle of a sentence ("open ⚙ to change…") is content.
            let leading = true;
            for (let n = sym.previousSibling; n; n = n.previousSibling) {
                if (n.textContent.trim()) { leading = false; break; }
            }
            if (leading) set(sym, 'aria-hidden', 'true');
            continue;
        }
        const control = sym.closest(INTERACTIVE);
        // A title that is translated at runtime (data-title-key) already names
        // the control in the reader's language; a baked aria-label would
        // override it with stale English.
        if (control && control.getAttribute('title') && !control.hasAttribute('data-title-key')
            && control.textContent.trim() === own.trim()) {
            if (set(control, 'aria-label', control.getAttribute('title'))) set(sym, 'aria-hidden', 'true');
        }
    }

    // Custom dropdown → button + listbox.
    for (const dd of root.querySelectorAll('.custom-dropdown')) {
        const toggle = dd.querySelector('.custom-dropdown-toggle');
        const menu = dd.querySelector('.custom-dropdown-menu');
        if (!toggle || !menu) continue;
        set(toggle, 'aria-haspopup', 'listbox');
        set(toggle, 'aria-expanded', menu.classList.contains('show') ? 'true' : 'false');
        const menuId = ensureId(menu, dd.id ? `${dd.id}-menu` : null);
        if (menuId) set(toggle, 'aria-controls', menuId);
        set(menu, 'role', 'listbox');
        for (const arrow of dd.querySelectorAll('.custom-dropdown-arrow')) set(arrow, 'aria-hidden', 'true');
        for (const item of menu.querySelectorAll('.custom-dropdown-item')) set(item, 'role', 'option');
    }

    // Settings nav → tabs.
    for (const nav of root.querySelectorAll('.settings-nav')) {
        const list = nav.querySelector('ul');
        if (!list) continue;
        set(list, 'role', 'tablist');
        for (const tab of list.querySelectorAll(':scope > li[data-target]')) {
            const target = tab.dataset.target;
            const panel = doc.getElementById(`settings-page-${target}`);
            set(tab, 'role', 'tab');
            set(tab, 'tabindex', '0');
            set(tab, 'aria-selected', tab.classList.contains('active') ? 'true' : 'false');
            const tabId = ensureId(tab, `settings-tab-${target}`);
            if (!panel) continue;
            set(tab, 'aria-controls', panel.id);
            set(panel, 'role', 'tabpanel');
            if (tabId) set(panel, 'aria-labelledby', tabId);
        }
    }

    // Filter buttons are toggles.
    for (const btn of root.querySelectorAll('button.filter-btn')) {
        set(btn, 'aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    }

    for (const nav of root.querySelectorAll('nav.folder-crumbs')) {
        if (!nav.hasAttribute('aria-labelledby')) set(nav, 'aria-label', 'Breadcrumb');
    }

    return changes;
}

const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Apply the rules to an HTML source string (a whole page or a fragment) and
 * return it with only the new attributes spliced into the affected start tags.
 */
export function ariaSource(html) {
    const dom = new JSDOM(html, { includeNodeLocations: true });
    const changes = ariaDocument(dom.window.document);
    const edits = [];
    for (const [el, attrs] of changes) {
        const loc = dom.nodeLocation(el);
        if (!loc || !loc.startTag) continue; // implied by the parser; nothing to patch
        let at = loc.startTag.endOffset - 1; // the '>'
        if (html[at] !== '>') continue;
        if (html[at - 1] === '/') at -= 1;
        edits.push([at, attrs.map(([n, v]) => ` ${n}="${escAttr(v)}"`).join('')]);
    }
    edits.sort((a, b) => b[0] - a[0]);
    let out = html;
    for (const [at, text] of edits) out = out.slice(0, at) + text + out.slice(at);
    return { html: out, added: edits.length };
}

// Hand-written sources. Generated pages (blog/<slug>/<lang>/, zines, folder
// indexes) get ariaDocument() from build.mjs instead.
const SOURCE_DIRS = ['.', 'modules', 'modules/blog/demos', 'tools', 'screensaver', 'inprogress'];

export async function ariaSourceFiles(rootDir, { log = console.log } = {}) {
    let files = 0;
    let added = 0;
    for (const dir of SOURCE_DIRS) {
        let names;
        try { names = await fs.readdir(path.join(rootDir, dir)); } catch { continue; }
        for (const name of names.filter((n) => n.endsWith('.html')).sort()) {
            const file = path.join(rootDir, dir, name);
            const src = await fs.readFile(file, 'utf8');
            const res = ariaSource(src);
            if (!res.added) continue;
            await fs.writeFile(file, res.html);
            files += 1;
            added += res.added;
        }
    }
    log(`  → ${added ? `added ARIA to ${added} element(s) in ${files} hand-written page(s)` : 'nothing to add'}.`);
    return { files, added };
}
