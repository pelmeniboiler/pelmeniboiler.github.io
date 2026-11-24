// /scripts/tooltip.js — the site's own tooltips, in place of the system's.
//
// Anything with a title (an HTML title attribute, or an SVG <title> child)
// gets a label in the theme's two colours that rides beside the cursor, clear
// of it, instead of the operating system's yellow or grey box that the custom
// cursor sits on top of. Started by theme-loader.js on every page.
//
// To keep the system's tooltip from showing as well, the title is lifted off
// the element while the pointer is on it, and put back the moment the pointer
// leaves, a key is pressed or a button goes down (so nothing that saves or
// copies the page in that moment sees it missing). Touch is left alone:
// browsers show no tooltips for it.
(() => {
    if (window.__pelmeniTip) return;
    window.__pelmeniTip = true;

    const DELAY = 350;  // ms of resting on something before its label shows
    const WARM = 600;   // ms after a label hides during which the next shows at once
    // Beside the cursor: every cursor in the set ends within 15px right of its hotspot.
    const RIGHT = 18, DOWN = 2, LEFT = 12, EDGE = 4;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const lifted = new Map();  // element → its title text, while lifted
    let host = null, text = '', tip = null, timer = 0, warmUntil = 0, dismissed = false, shown = false;
    let x = 0, y = 0, frame = 0;

    // While a title is lifted, scripts still read it where it was.
    const E = Element.prototype, get = E.getAttribute, has = E.hasAttribute;
    const hasTitle = (el) => has.call(el, 'title');
    {
        const held = (el, name) => lifted.has(el) && el.namespaceURI !== SVG_NS && String(name).toLowerCase() === 'title' && !has.call(el, 'title');
        E.getAttribute = function (name) { return held(this, name) ? lifted.get(this) : get.call(this, name); };
        E.hasAttribute = function (name) { return held(this, name) || has.call(this, name); };
        const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'title');
        if (d && d.get) Object.defineProperty(HTMLElement.prototype, 'title', { ...d, get() { return held(this, 'title') ? lifted.get(this) : d.get.call(this); } });
    }

    const titleChild = (el) => {
        if (el.namespaceURI !== SVG_NS) return null;
        for (const c of el.children) if (c.localName === 'title' && c.namespaceURI === SVG_NS) return c;
        return null;
    };
    // The title an element would show, whether it is still on the element or lifted.
    function own(el) {
        if (lifted.has(el)) return lifted.get(el);
        if (el.localName === 'iframe') return ''; // its title names the frame; browsers don't show it
        if (el.namespaceURI === SVG_NS) { const t = titleChild(el); return t ? t.textContent.trim() : ''; }
        return hasTitle(el) ? get.call(el, 'title') : '';
    }
    // The nearest element with a title, from the one under the pointer outwards.
    function owner(el) {
        for (; el && el.nodeType === 1; el = el.parentElement || (el.parentNode && el.parentNode.host)) {
            if (own(el)) return el;
        }
        return null;
    }
    // Lift every title from the owner outwards: an outer one would show natively otherwise.
    function lift(from) {
        for (let el = from; el && el.nodeType === 1; el = el.parentElement) {
            if (lifted.has(el)) {
                // Something set a new title while it was lifted (a translation, say): take that one.
                if (el.namespaceURI !== SVG_NS && hasTitle(el)) { lifted.set(el, get.call(el, 'title')); el.removeAttribute('title'); }
                continue;
            }
            const t = own(el);
            if (!t) continue;
            lifted.set(el, t);
            if (el.namespaceURI === SVG_NS) titleChild(el).textContent = '';
            else el.removeAttribute('title');
        }
    }
    function putBack() {
        for (const [el, t] of lifted) {
            if (el.namespaceURI === SVG_NS) { const c = titleChild(el); if (c && !c.textContent) c.textContent = t; }
            else if (!hasTitle(el)) el.setAttribute('title', t);
        }
        lifted.clear();
    }

    function make() {
        tip = document.createElement('div');
        tip.className = 'tip';
        tip.setAttribute('aria-hidden', 'true'); // the title itself stays the accessible name
        tip.dir = 'auto';
        tip.hidden = true;
        document.body.appendChild(tip);
    }
    function place() {
        frame = 0;
        if (!tip || tip.hidden) return;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let left = x + RIGHT, top = y + DOWN;
        if (left + w > innerWidth - EDGE) left = x - LEFT - w;
        left = Math.max(EDGE, left);
        top = Math.max(EDGE, Math.min(top, innerHeight - EDGE - h));
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    }
    function show() {
        timer = 0;
        if (!host || dismissed || !text || !document.body) return;
        if (!tip || !tip.isConnected) make();
        if (tip.textContent !== text) tip.textContent = text;
        tip.hidden = false;
        shown = true;
        place();
    }
    function hide() {
        clearTimeout(timer); timer = 0;
        if (shown) warmUntil = Date.now() + WARM;
        shown = false;
        if (tip) tip.hidden = true;
    }
    function leave() {
        hide();
        putBack();
        host = null; text = ''; dismissed = false;
    }
    function enter(el) {
        host = el; text = own(el); dismissed = false;
        lift(el);
        clearTimeout(timer);
        if (Date.now() < warmUntil) show(); else timer = setTimeout(show, DELAY);
    }

    const eink = () => document.documentElement.classList.contains('eink-mode');
    document.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch') return;
        x = e.clientX; y = e.clientY;
        const el = owner(e.target);
        if (el === host) return;
        leave();
        if (el) enter(el);
    }, true);
    document.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || !host) return;
        x = e.clientX; y = e.clientY;
        if (!lifted.size || (host.namespaceURI !== SVG_NS && hasTitle(host))) {
            // Put back by a key or a click, or retitled by a script: lift it again.
            lift(host);
            const t = own(host);
            if (t !== text) { text = t; if (shown) show(); }
        }
        // E-ink: the label stays where it first appeared (every move would be a refresh).
        if (shown && !eink() && !frame) frame = requestAnimationFrame(place);
    }, true);
    document.addEventListener('pointerout', (e) => { if (!e.relatedTarget && host) leave(); }, true);
    // As the system's do: a click or a key dismisses the label until the pointer moves on.
    const dismiss = () => { if (!host) return; dismissed = true; hide(); putBack(); };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
    addEventListener('wheel', dismiss, { capture: true, passive: true });
    addEventListener('scroll', () => { if (shown) dismiss(); }, true);
    addEventListener('blur', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
    addEventListener('pagehide', putBack);
})();
