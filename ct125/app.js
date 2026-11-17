// /ct125/app.js — the CT125 manual.
//
// One page, no build step of its own. Everything that differs between model
// years lives in a data file (data/<id>.json): tables, schedule, guides, part
// numbers, prices, the page index. To add a year, add its file and one line
// to MODELS — nothing below is specific to 2021.
//
// Honda's pages are never served from here. Every value cites its manual
// page; an owner who loads their own PDF sees that page (rendered on their
// device by pdf.js, kept in IndexedDB), everyone else sees the citation.
//
// What the owner does is saved on the device in localStorage: each bike has
// its name, model year, odometer and ticked jobs; owned tools are shared by
// the household; a loaded manual belongs to its model year.

const MODELS = [
    { id: '2021', label: '2020–2022 (JA55)', data: '/ct125/data/2021.json' },
    { id: '2023', label: '2023+ (JA65)', data: '/ct125/data/2023.json' },
];

// Referral links. Keyed by shop hostname; {url} is replaced by the encoded
// destination. Empty = plain links. When any is set, the footer says so.
const REFS = {};

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); navigator.storage?.persist?.(); } catch { /* private mode */ } },
};
const out = (u) => { try { const t = REFS[new URL(u).hostname]; return t ? t.replace('{url}', encodeURIComponent(u)) : u; } catch { return u; } };
const ext = (u, label, cls = '') => `<a class="${cls}" href="${esc(out(u))}" target="_blank" rel="noopener${REFS[hostOf(u)] ? ' sponsored' : ''}">${label}</a>`;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const money = (n) => '$' + n.toFixed(2);
const fmtDate = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    const f = (cal) => new Intl.DateTimeFormat('en-GB' + cal, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    try { return `${new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)} (${f('')})`; } catch { return f(''); }
};

// Bikes. (The first version kept one unnamed bike per model year under
// ct125:<model>:…; that is carried over once.)
let bikes = ls.get('ct125:bikes', null);
if (!bikes) {
    const old = MODELS.find((m) => m.id === ls.get('ct125:model')) || MODELS[0];
    bikes = [{ id: 'b1', name: '', model: old.id }];
    try {
        const pre = `ct125:${old.id}:`;
        Object.keys(localStorage).filter((k) => k.startsWith(pre)).forEach((k) => {
            const key = k.slice(pre.length), v = localStorage.getItem(k);
            const to = /^(odo|svcCol|svcAt|chk:)/.test(key) ? 'ct125:b:b1:' + key : /^pdf/.test(key) ? `ct125:m:${old.id}:${key}` : 'ct125:' + key;
            localStorage.setItem(to, v); localStorage.removeItem(k);
        });
    } catch { /* private mode */ }
    ls.set('ct125:bikes', bikes);
}
// Links. Everything a reader can open has an address in the hash:
//   #year=2023&tab=specs&q=fork        a tab, with its search or filter text
//   #year=2021&guide=valve-clearance    a guide
//   #year=2021&page=2-16                a manual page (the reader's own PDF, or its summary)
//   #tab=service&at=8000                a service in the checklist
// "year" picks the model: one of the reader's bikes of that year if they have
// one, otherwise the year is shown without touching their bikes.
const LINK = Object.fromEntries(new URLSearchParams((location.hash || '').replace(/^#/, '')));
const linkYear = MODELS.find((m) => m.id === LINK.year || m.label.toLowerCase().includes(`(${(LINK.year || '').toLowerCase()})`));
let BIKE = bikes.find((b) => b.id === ls.get('ct125:bike')) || bikes[0];
if (linkYear && linkYear.id !== BIKE.model) BIKE = bikes.find((b) => b.model === linkYear.id) || { id: 'visit-' + linkYear.id, name: '', model: linkYear.id, visit: true };
const MODEL = MODELS.find((m) => m.id === BIKE.model) || MODELS[0];
const modelId = MODEL.id;
const saveBikes = () => ls.set('ct125:bikes', bikes);
// Where each kind of saved thing lives.
const SCOPE = (k) => (/^(odo|svcCol|svcAt|chk:)/.test(k) ? `ct125:b:${BIKE.id}:` : /^pdf/.test(k) ? `ct125:m:${modelId}:` : 'ct125:') + k;
const store = { get: (k, d) => ls.get(SCOPE(k), d), set: (k, v) => ls.set(SCOPE(k), v) };

const D = await (await fetch(MODEL.data)).json();
const PAGES = D.pages, BYP = {}; PAGES.forEach((p) => { BYP[p.p] = p; });
const LAST = PAGES.length;
const mp2p = (mp) => D.mp[mp];
const pgBtn = (mp) => (mp2p(mp) ? `<button class="pg" data-open="${mp2p(mp)}" type="button">${esc(mp)}</button>` : `<span class="pg">${esc(mp)}</span>`);
const partUrl = (pn) => (D.partStore ? D.partStore + pn : '');
const priced = !!D.prices.on;
const priceNote = () => `${fmtDate(D.prices.on)}${D.prices.src ? ', ' + D.prices.src : ''}`;
// Shop lists (parts, supplies, tools) exist only where someone has compiled them.
const hasShop = Object.keys(D.supplies).length + Object.keys(D.jobTools).length > 0;
// Extra code tables a model may carry (the 2023 manual lists Korea's P-codes separately).
const DTC_EXTRA = D.dtc.extra || [];
const dtcTable = (sys) => (sys.startsWith('x') ? DTC_EXTRA[+sys.slice(1)].rows : D.dtc[sys]);

/* ---------- the owner's own PDF ---------- */
const idb = (mode, fn) => new Promise((res, rej) => {
    const open = indexedDB.open('ct125', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => rej(open.error);
    open.onsuccess = () => { const tx = open.result.transaction('files', mode); const rq = fn(tx.objectStore('files')); tx.oncomplete = () => res(rq.result); tx.onerror = () => rej(tx.error); };
});
const pdf = { doc: null, n: 0, shift: store.get('pdfShift', 0), urls: new Map(), queue: Promise.resolve() };
const hasPdf = () => !!pdf.doc;
async function openPdf(blob) {
    const lib = await import('/ct125/vendor/pdf.min.js');
    lib.GlobalWorkerOptions.workerSrc = '/ct125/vendor/pdf.worker.min.js';
    pdf.doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
    pdf.n = pdf.doc.numPages;
    pdf.urls.forEach((u) => URL.revokeObjectURL(u)); pdf.urls.clear();
}
// A manual page as an image URL, rendered once per size and kept (a few).
function pageImg(n, width) {
    const real = n + pdf.shift, key = real + '@' + width;
    if (!hasPdf() || real < 1 || real > pdf.n) return Promise.resolve(null);
    if (pdf.urls.has(key)) return Promise.resolve(pdf.urls.get(key));
    const job = pdf.queue.then(async () => {
        if (pdf.urls.has(key)) return pdf.urls.get(key);
        const page = await pdf.doc.getPage(real);
        const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const url = URL.createObjectURL(blob);
        pdf.urls.set(key, url);
        if (pdf.urls.size > 40) { const [k, u] = pdf.urls.entries().next().value; URL.revokeObjectURL(u); pdf.urls.delete(k); }
        return url;
    });
    pdf.queue = job.catch(() => null);
    return job;
}
const lazy = 'IntersectionObserver' in window ? new IntersectionObserver((seen) => seen.forEach((e) => {
    if (!e.isIntersecting) return;
    lazy.unobserve(e.target);
    pageImg(+e.target.dataset.pg, +e.target.dataset.w).then((u) => { if (u) e.target.src = u; });
}), { rootMargin: '300px' }) : null;
const fillImages = (root) => root.querySelectorAll('img[data-pg]').forEach((img) => (lazy ? lazy.observe(img) : pageImg(+img.dataset.pg, +img.dataset.w).then((u) => { if (u) img.src = u; })));
async function loadPdfFile(file) {
    await openPdf(file);
    await idb('readwrite', (s) => s.put(file, 'pdf:' + modelId));
    store.set('pdfName', file.name);
    refresh();
}
async function forgetPdf() {
    await idb('readwrite', (s) => s.delete('pdf:' + modelId));
    pdf.doc = null; pdf.n = 0; store.set('pdfName', null);
    refresh();
}
$('#pdfpick').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) loadPdfFile(f).catch(() => alert('That file could not be read as a PDF.')); };

/* ---------- search ---------- */
const SYN = [
    ['skid plate', 'bash plate', 'bash guard', 'sump guard', 'under cover'],
    ['crash bar', 'crash bars', 'engine guard', 'guard bar', 'guard bars', 'crash guard', 'engine bars', 'under cover pipe'],
    ['footpeg', 'foot peg', 'footpegs', 'pegs', 'foot rest', 'footrest', 'step bar'],
    ['rack', 'luggage rack', 'rear rack', 'rear carrier'],
    ['kickstand', 'side stand', 'sidestand'],
    ['center stand', 'centre stand', 'centerstand'],
    ['rotor', 'brake rotor', 'disc', 'brake disc'],
    ['banjo', 'banjo bolt', 'oil bolt', 'brake hose oil bolt'],
    ['crush washer', 'sealing washer'],
    ['front sprocket', 'countershaft sprocket', 'drive sprocket'],
    ['rear sprocket', 'driven sprocket'],
    ['triple clamp', 'triple tree', 'top bridge', 'bottom bridge', 'bridge'],
    ['ecu', 'ecm'],
    ['oxygen sensor', 'o2 sensor', 'o2'],
    ['plug', 'spark plug'],
    ['air filter', 'air cleaner'],
    ['gas tank', 'fuel tank'],
    ['gas cap', 'fuel cap', 'filler cap'],
    ['header', 'headers', 'exhaust pipe', 'exhaust'],
    ['silencer', 'muffler'],
    ['mudguard', 'fender'],
    ['blinker', 'blinkers', 'indicator', 'turn signal'],
    ['flasher', 'turn signal light relay', 'turn signal relay'],
    ['oil filter', 'centrifugal filter', 'strainer screen'],
    ['stator', 'alternator'],
    ['pickup', 'pick up', 'ckp'],
    ['tps', 'tp sensor', 'throttle position'],
    ['check engine', 'mil', 'fault code', 'error code', 'trouble code', 'dtc'],
    ['bleeder', 'bleed valve'],
    ['clutch cover', 'right crankcase cover'],
    ['stator cover', 'left crankcase cover'],
    ['swing arm', 'swingarm'],
    ['shocks', 'shock', 'shock absorber'],
    ['front fork', 'front forks', 'forks', 'fork'],
    ['bars', 'handlebars', 'handlebar'],
    ['valve lash', 'tappet', 'tappets', 'valve clearance', 'valve adjustment'],
    ['cct', 'cam chain tensioner'],
    ['kill switch', 'engine stop switch'],
    ['key switch', 'ignition switch'],
    ['dash', 'gauge cluster', 'cluster', 'speedo', 'speedometer'],
    ['license plate', 'number plate'],
    ['chain guard', 'drive chain case'],
    ['case saver', 'sprocket cover', 'drive sprocket cover'],
    ['spark arrestor', 'spark arrester'],
    ['tyre', 'tire'],
    ['wheel bearing', 'wheel bearings', 'hub bearing'],
    ['head bearings', 'steering head bearings', 'steering stem'],
    ['motor mount', 'engine mount', 'engine hanger'],
    ['axle nut', 'axle'],
    ['pinch bolt', 'pinch bolts'],
    ['tire pressure', 'tyre pressure', 'cold tire pressure'],
    ['schematic', 'wiring diagram'],
    ['abs ring', 'tone ring', 'pulser ring'],
    ['brake lever', 'lever'],
    ['oil capacity', 'engine oil capacity', 'how much oil'],
];
const STOP = new Set('a an the for of to on in and or my how what is do does i with value values me show find where which are it at by from'.split(' '));
const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/[·×]/g, ' ').replace(/(\d)\s*mm\b/g, '$1 mm').replace(/[^a-z0-9.\-/ ]+/g, ' ').replace(/(^|\s)[.\-/]+|[.\-/]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const PHRASES = SYN.flatMap((g) => g.map((p) => [p, g])).sort((a, b) => b[0].length - a[0].length);
function concepts(q) {
    let s = norm(q); const res = [];
    for (const [p, g] of PHRASES) {
        const key = ' ' + p + ' ';
        if (s.includes(key)) { res.push({ alts: g, label: p }); s = s.replace(key, ' '); }
    }
    s.trim().split(/\s+/).filter(Boolean).forEach((t) => {
        if (STOP.has(t)) return;
        const alts = [t];
        if (t.length > 3 && t.endsWith('es')) alts.push(t.slice(0, -2));
        if (t.length > 3 && t.endsWith('s')) alts.push(t.slice(0, -1));
        res.push({ alts, label: t });
    });
    return res;
}
const hit = (field, alt) => field.includes(' ' + alt);
function scoreDoc(doc, cs, mode) {
    let total = 0, matched = 0;
    for (const c of cs) {
        let best = 0;
        for (const [f, w] of doc.f) for (const a of c.alts) if (w > best && hit(f, a)) best = w;
        if (best) { matched++; total += best; } else if (mode === 'and') return 0;
    }
    return matched ? total * (matched / cs.length) : 0;
}
const DOCS = [];
PAGES.forEach((p) => {
    if (!p.t || /blank/i.test(p.t)) return;
    const figs = (p.f || []).map((f) => f.c + ' ' + f.parts).join(' ');
    const body = [p.s, (p.n || []).join(' '), (p.tq || []).join(' '), p.tq ? 'torque' : '', p.ch].join(' ');
    const w = p.table ? 0.55 : 1;
    DOCS.push({ k: 'page', p, f: [[norm(p.t), 10 * w], [norm((p.k || []).join(' , ')), 7 * w], [norm(figs), 4 * w], [norm(body), 2 * w], [norm(p.mp), 3 * w]] });
});
D.torque.forEach((r, i) => DOCS.push({ k: 'torque', i, f: [[norm(r[1]), 8], [norm(r[0]), 5], [norm(`torque ${r[3]} mm ${r[3]}mm ${r[7]}`), 2]] }));
D.specs.forEach((r, i) => DOCS.push({ k: 'spec', i, f: [[norm(r[2]), 8], [norm(r[1]), 5], [norm(r[0] + ' spec specification'), 2], [norm(r[3] + ' ' + r[4]), 1]] }));
D.dtc.pgmfi.forEach((r, i) => DOCS.push({ k: 'dtc', sys: 'pgmfi', i, f: [[norm('dtc ' + r[0] + ' code'), 9], [norm(r[1]), 6], [norm(r[2] + ' fi fuel injection mil check engine'), 2]] }));
DTC_EXTRA.forEach((tb, t) => tb.rows.forEach((r, i) => DOCS.push({ k: 'dtc', sys: 'x' + t, i, f: [[norm('dtc ' + r[0] + ' code'), 9], [norm(r[1]), 6], [norm(r[2] + ' fi fuel injection mil check engine'), 2]] })));
D.dtc.abs.forEach((r, i) => DOCS.push({ k: 'dtc', sys: 'abs', i, f: [[norm('dtc abs ' + r[0] + ' code'), 9], [norm(r[1]), 6], [norm(r[4] + ' abs indicator'), 2]] }));
D.guides.forEach((gd, i) => DOCS.push({ k: 'guide', i, f: [[norm(gd.item + ' how to guide'), 10], [norm((gd.pages || []).flatMap((mp) => (BYP[mp2p(mp)] || {}).k || []).join(' , ')), 6], [norm(gd.why + ' ' + gd.when), 3], [norm(gd.steps.map((s) => s[0]).join(' ') + ' ' + gd.parts.map((p) => p.name + ' ' + p.pn).join(' ')), 2]] }));
function search(q) {
    const cs = concepts(q);
    if (!cs.length) return null;
    let mode = 'and';
    let res = DOCS.map((d) => ({ d, s: scoreDoc(d, cs, mode) })).filter((x) => x.s > 0);
    if (!res.length) { mode = 'or'; res = DOCS.map((d) => ({ d, s: scoreDoc(d, cs, mode) })).filter((x) => x.s > 0); }
    res.sort((a, b) => b.s - a.s);
    return { cs, mode, res };
}
function hl(text, cs) {
    const s = esc(text);
    if (!cs) return s;
    const alts = [...new Set(cs.flatMap((c) => c.alts))].filter((a) => a.length > 1).sort((a, b) => b.length - a.length);
    if (!alts.length) return s;
    const re = new RegExp('(^|[^a-z0-9])(' + alts.map((a) => a.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|') + ')', 'gi');
    return s.replace(re, (m, pre, w) => pre + '<mark>' + w + '</mark>');
}

/* ---------- rows and cards ---------- */
function cropHTML(p, box) {
    const [x, y, w, h] = box;
    const ar = w / (h * p.ar);
    return `<div class="crop" style="aspect-ratio:${ar.toFixed(4)}"><img data-pg="${p.p}" data-w="900" alt="" style="width:${(100 / w).toFixed(3)}%;left:${(-x / w * 100).toFixed(3)}%;top:${(-y / h * 100).toFixed(3)}%"></div>`;
}
function torqueRow(r, cs) {
    const [sec, item, qty, dia, nm, kg, lb, rem, pg] = r;
    const meta = [cs ? esc(sec) : '', dia && !isNaN(+dia) ? `Ø ${dia} mm` : esc(dia), qty ? `× ${qty}` : '', kg ? `${kg} kgf·m` : '', rem ? `<span class="${/misprint/i.test(rem) ? 'flag' : ''}">${esc(rem)}</span>` : '', pgBtn(pg)].filter(Boolean).join(' ');
    return `<div class="row"><div class="item"><b>${hl(item, cs)}</b><div class="meta">${meta}</div></div>${nm ? `<div class="nm num">${nm}<small>N·m</small></div><div class="lb num">${lb}<small>lbf·ft</small></div>` : `<div class="none" style="grid-column:2/4">${pgBtn(pg)}</div>`}</div>`;
}
const specVal = (v) => { const m = v.match(/^(.*?)\s*\[(.*)\]$/); return m ? `${esc(m[1])}<span class="fix flag">${esc(m[2])}</span>` : esc(v); };
function specRow(r, cs) {
    const [, grp, item, std, lim, pg] = r;
    return `<div class="row"><div class="it">${hl(item, cs)}${cs ? `<div class="sm">${esc(grp.toLowerCase())}</div>` : ''}</div><div class="val">${std ? '<span class="lbl">Standard</span>' + specVal(std) : ''}</div><div class="lim">${lim ? '<span class="lbl">Limit</span>' + specVal(lim) : ''}</div><div class="pgc">${pgBtn(pg)}</div></div>`;
}
function dtcRow(sys, r, cs) {
    if (sys !== 'abs') return `<div class="row"><div class="code num">${esc(r[0])}</div><div>${hl(r[1], cs)}</div><div class="sym sm">${esc(r[2])}</div><div>${pgBtn(r[3])}</div></div>`;
    return `<div class="row"><div class="code num">${esc(r[0])}</div><div>${hl(r[1], cs)}<div class="sm">${[r[2] && 'at key-on check', r[3] && 'while riding'].filter(Boolean).join(', ')}</div></div><div class="sym sm">${esc(r[4])}</div><div>${pgBtn(r[5])}</div></div>`;
}
function pageCard(p, cs) {
    let fig = null;
    if (cs && p.f && p.f.length) {
        let best = -1;
        p.f.forEach((f) => { const t = norm(f.c + ' ' + f.parts); const sc = cs.reduce((a, c) => a + (c.alts.some((x) => hit(t, x)) ? 1 : 0), 0); if (sc > best) { best = sc; fig = f; } });
    } else if (p.f && p.f.length) fig = p.f[0];
    const tq = (p.tq || []).slice(0, 4).map((t) => `<span>${esc(t.replace(/ — .*/, ''))}</span>`).join('');
    return `<button class="card" type="button" data-open="${p.p}" data-fig="${fig ? p.f.indexOf(fig) : -1}">
        ${hasPdf() ? `<div class="fig">${cropHTML(p, fig ? fig.box : [0, 0, 1, 1])}</div>` : ''}
        <div class="body"><div class="crumb"><span class="num">${esc(p.mp)}</span><span>${esc(p.ch)}</span></div>
        <h3>${hl(p.t, cs)}</h3>${fig ? `<div>${hl(fig.c, cs)}</div>` : ''}<p>${hl(p.s, cs)}</p>${tq ? `<div class="tqchips">${tq}</div>` : ''}</div></button>`;
}
const stdTorque = () => `<div class="tbl tq"><div class="row hd"><div>Thread</div><div style="text-align:right">N·m</div><div style="text-align:right">lbf·ft</div></div>${D.torque.filter((r) => r[0] === 'STANDARD').map((r) => `<div class="row"><div class="item"><b>${esc(r[1])}</b></div><div class="nm num">${r[4]}<small>N·m</small></div><div class="lb num">${r[6]}<small>lbf·ft</small></div></div>`).join('')}</div>`;
const sec = (title, count = '') => `<h2 class="sec"><span>${title}</span><span class="count">${count}</span></h2>`;
const guideCards = (list) => `<div class="gidx">${list.map((gd) => `<button class="gcard" type="button" data-guide="${esc(gd.item)}"><b>${esc(gd.item)}</b><span>${esc(gd.level)} · ${esc(gd.time)}</span></button>`).join('')}</div>`;

/* ---------- search view ---------- */
function renderSearch() {
    const q = $('#q').value.trim();
    const v = $('#v-search');
    if (!q) {
        v.innerHTML = `<div class="chips">${D.examples.map((e) => `<button type="button" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div>
            <div class="quick">${D.quick.map(([k, v2, s, pg]) => `<button type="button" data-open="${mp2p(pg)}"><span class="sm">${esc(k)}</span><span class="v num">${esc(v2)}</span><span class="sm">${esc(s)} · p. ${esc(pg)}</span></button>`).join('')}</div>`;
        return;
    }
    const r = search(q);
    if (!r || !r.res.length) { v.innerHTML = `<div class="empty">Nothing matches “${esc(q)}”.</div>`; return; }
    const groups = { page: [], torque: [], spec: [], dtc: [], guide: [] };
    r.res.forEach((x) => groups[x.d.k].push(x));
    const top = (k) => (groups[k].length ? groups[k][0].s : 0);
    const order = ['guide', ...['page', 'torque', 'spec', 'dtc'].sort((a, b) => top(b) * (b === 'page' ? 1.08 : 1) - top(a) * (a === 'page' ? 1.08 : 1))];
    const cs = r.cs; let html = '';
    const lim = { page: 8, torque: 10, spec: 10, dtc: 8, guide: 4 };
    for (const k of order) {
        const g = groups[k]; if (!g.length) continue;
        const list = v.dataset['all' + k] === q ? g : g.slice(0, lim[k]);
        const more = g.length > list.length ? `<div><button type="button" data-more="${k}">All ${g.length}</button></div>` : '';
        if (k === 'guide') html += sec('Guides', g.length) + guideCards(list.map((x) => D.guides[x.d.i])) + more;
        if (k === 'page') html += sec('Pages', g.length) + `<div class="cards">${list.map((x) => pageCard(x.d.p, cs)).join('')}</div>${more}`;
        if (k === 'torque') html += sec('Torque', g.length) + `<div class="tbl tq">${list.map((x) => torqueRow(D.torque[x.d.i], cs)).join('')}</div>${more}`;
        if (k === 'spec') html += sec('Specs', g.length) + `<div class="tbl sp">${list.map((x) => specRow(D.specs[x.d.i], cs)).join('')}</div>${more}`;
        if (k === 'dtc') html += sec('Fault codes', g.length) + `<div class="tbl sp dt">${list.map((x) => dtcRow(x.d.sys, dtcTable(x.d.sys)[x.d.i], cs)).join('')}</div>${more}`;
    }
    // Asked for a torque that has no entry of its own: the standard chart applies.
    if (/\b(torque|nm|n m)\b/i.test(q) && !groups.torque.length) html += sec('Standard torque', 'p. 1-12') + stdTorque();
    v.innerHTML = html;
    fillImages(v);
}

/* ---------- torque and specs ---------- */
function filtered(v, id, placeholder, draw) {
    if (!v.querySelector('#' + id)) {
        v.innerHTML = `<input class="filter" id="${id}" type="search" placeholder="${placeholder}" aria-label="Filter"><div class="view"></div>`;
        v.querySelector('#' + id).addEventListener('input', () => { draw(); setLink(); });
    }
    const f = v.querySelector('#' + id).value.trim();
    return { cs: f ? concepts(f) : null, body: v.querySelector('.view') };
}
function renderTorque() {
    const { cs, body } = filtered($('#v-torque'), 'tf', 'caliper, axle, 8 mm', renderTorque);
    const rows = D.torque.filter((r) => r[0] !== 'STANDARD').filter((r) => !cs || cs.every((c) => c.alts.some((a) => hit(norm(r[1] + ' ' + r[0] + ' ' + r[7] + ' ' + r[3] + ' mm'), a))));
    let html = sec('Standard torque', 'p. 1-12') + stdTorque() + (D.torqueNote ? `<p class="sm">${esc(D.torqueNote)}</p>` : '');
    let last = '';
    html += sec('Specified torque', rows.length) + `<div class="tbl tq"><div class="row hd"><div>Fastener</div><div style="text-align:right">N·m</div><div style="text-align:right">lbf·ft</div></div>`;
    rows.forEach((r) => { if (r[0] !== last) { html += `<div class="grp">${esc(r[0])}</div>`; last = r[0]; } html += torqueRow(r, null); });
    body.innerHTML = html + '</div>';
}
function renderSpecs() {
    const { cs, body } = filtered($('#v-specs'), 'sf', 'piston, fork, battery', renderSpecs);
    const rows = D.specs.filter((r) => !cs || cs.every((c) => c.alts.some((a) => hit(norm(r.slice(0, 5).join(' ')), a))));
    let html = `<div class="tbl sp"><div class="row hd"><div>Item</div><div>Standard</div><div>Limit</div><div></div></div>`;
    let last = '';
    rows.forEach((r) => { const g = r[0].replace(' SPECIFICATIONS', '') + ' · ' + r[1]; if (g !== last) { html += `<div class="grp">${esc(g)}</div>`; last = g; } html += specRow(r, null); });
    body.innerHTML = rows.length ? html + '</div>' : '';
}

/* ---------- service ---------- */
const M = D.maint, SUP = D.supplies, TOOLS = D.tools, JT = D.jobTools, PRICE = D.prices.parts;
const UNIT = D.unit, KM = UNIT === 'mi' ? 1.609344 : 1;
const ACT = { I: 'Inspect', C: 'Clean', R: 'Replace', A: 'Adjust', L: 'Lubricate' };
const STEPS = M['intervals_' + UNIT], CYCLE = STEPS[STEPS.length - 1], EVERY = STEPS[1];
const GBY = {}; D.guides.forEach((gd) => { GBY[gd.item] = gd; });
// supply row: [name, detail, page, kind, partNumber, tier, {p price, q qty, u url, src, note, stock}]
const rowX = (r) => r[6] || {};
const rowUnit = (r) => (rowX(r).p != null ? rowX(r).p : PRICE[r[4]] != null ? PRICE[r[4]] : null);
const rowCost = (r) => (rowX(r).stock || rowUnit(r) == null ? 0 : rowUnit(r) * (rowX(r).q || 1));
function rowPrice(r) {
    const x = rowX(r), p = rowUnit(r), q = x.q || 1;
    return p == null ? '' : `<span class="price">${x.stock ? money(p) : q > 1 ? `${money(p)} × ${q} = ${money(p * q)}` : money(p)}</span>`;
}
const toolPrice = (id) => ((TOOLS[id].links || [])[0] || [])[2];
const owned = () => store.get('ownTools', {});
const TIERS = [['need', 'Replace'], ['ifbad', 'If inspection fails']];
const dueItems = (col) => M.items.map((it) => ({ it, a: it.every ? 'L' : it.sched[col] })).filter((x) => x.a);
const sum = (rows, tier) => rows.filter((x) => x.r[5] === tier).reduce((a, x) => a + rowCost(x.r), 0);
function shopData(items, done) {
    const rows = [], tl = [], tmap = {};
    items.forEach(({ it, a }) => {
        (SUP[it.item]?.[a] || []).forEach((r) => rows.push({ r, job: it.item }));
        (JT[it.item] || []).forEach((id) => { if (!tmap[id]) { tmap[id] = []; tl.push(id); } tmap[id].push(it.item); });
    });
    return { rows, tl, tmap, open: rows.filter((x) => !done[x.job]), fin: rows.filter((x) => done[x.job]) };
}
function shopHTML(items, done) {
    const { tl, tmap, open, fin, rows } = shopData(items, done);
    const ow = owned();
    tl.sort((x, y) => (!!ow[x]) - (!!ow[y]));
    const toBuy = tl.filter((id) => !ow[id] && toolPrice(id) != null && !TOOLS[id].opt), toBuyCost = toBuy.reduce((a, id) => a + toolPrice(id), 0);
    const cost = !priced ? '' : `<div class="cost"><div><b class="num">${money(sum(rows, 'need'))}</b><span>parts</span></div><div><b class="num">+${money(sum(rows, 'ifbad'))}</b><span>if every inspection fails</span></div>${toBuy.length ? `<div><b class="num">${money(toBuyCost)}</b><span>tools not owned</span></div>` : ''}<p>Prices ${priceNote()}, before shipping.</p></div>`;
    const pli = ({ r, job }) => { const [n, d, pg, kind, pn] = r, x = rowX(r); return `<li><span><span class="kind">${kind}</span><span class="job">${esc(job)}</span><br><b>${esc(n)}</b>${rowPrice(r)}<small>${esc(d)}</small>${pn ? `<small>${(partUrl(pn) ? ext(partUrl(pn), pn, 'num') : `<span class="num">${esc(pn)}</span>`)}</small>` : ''}${x.u ? `<small>${ext(x.u, esc((x.note ? x.note + ' · ' : '') + x.src))}</small>` : ''}${D.prices.warn[pn] ? `<small class="flag">${esc(D.prices.warn[pn])}</small>` : ''}</span>${pgBtn(pg)}</li>`; };
    const tools = tl.length ? `<details class="tier t-tool" id="toolsd"${store.get('toolsOpen', false) ? ' open' : ''}><summary class="th"><b>Tools · ${tl.length}</b><span>${toBuy.length ? `${toBuy.length} to buy · ${money(toBuyCost)}` : ''}</span></summary><ul>${tl.map((id) => { const tt = TOOLS[id], own = !!ow[id]; return `<li class="${own ? 'own' : ''}"><span><span class="job">${tmap[id].map(esc).join(' · ')}</span><br><b>${esc(tt.n)}</b><small>${esc(tt.d)}</small>${own ? '' : (tt.links || []).map(([l, u, p]) => `<small>${ext(u, esc(l) + (p != null ? ' · ' + money(p) : ''))}</small>`).join('')}</span>${tt.pg ? pgBtn(tt.pg) : '<span class="pgph"></span>'}</li>`; }).join('')}</ul></details>` : '';
    const tiers = TIERS.map(([tk, name]) => { const rs = open.filter((x) => x.r[5] === tk); return rs.length ? `<div class="tier t-${tk}"><div class="th"><b>${name}</b><span>${rs.length}</span></div><ul>${rs.map(pli).join('')}</ul></div>` : ''; }).join('');
    const doneB = fin.length ? `<div class="tier t-done"><div class="th"><b>Done</b><span>${fin.length}</span></div><ul>${fin.map(pli).join('')}</ul></div>` : '';
    return cost + tools + tiers + doneB;
}
function milestoneFor(odo) {
    if (odo < STEPS[0]) return { at: STEPS[0], col: 0 };
    const next = Math.ceil(odo / EVERY) * EVERY || EVERY;
    return { at: next, col: STEPS.indexOf(((next - EVERY) % CYCLE) + EVERY) };
}
let svcCol = store.get('svcCol', 1), svcAt = store.get('svcAt', null);
const setSvc = (col, at) => { svcCol = col; svcAt = at; store.set('svcCol', col); store.set('svcAt', at); ; if (typeof view !== 'undefined' && view === 'service') setLink(); };
const other = (n) => (UNIT === 'mi' ? `${(M.intervals_km?.[STEPS.indexOf(n)] ?? Math.round(n * KM)).toLocaleString()} km` : '');
function renderService() {
    const v = $('#v-service');
    const col = svcCol, label = svcAt || STEPS[col];
    const key = 'chk:' + label;
    const done = store.get(key, {});
    const items = dueItems(col);
    v.innerHTML = `
        <div class="svc-top">
            <div class="field"><span class="lab">Service</span><div class="ms">${STEPS.map((m, i) => `<button type="button" class="num" data-col="${i}" aria-pressed="${!svcAt && i === col}"><b>${m.toLocaleString()}</b><span>${other(m)}</span></button>`).join('')}</div></div>
        </div>
        <div class="svc-grid"${hasShop ? '' : ' style="grid-template-columns:minmax(0,1fr)"'}>
            <div class="box"><div class="bh"><h3 class="num">${label.toLocaleString()} ${UNIT}${svcAt ? ` = ${STEPS[col].toLocaleString()} ${UNIT} list` : ''}</h3><button type="button" id="clr">Clear</button></div>
                ${items.map(({ it, a }, i) => { const on = !!done[it.item]; return `<label class="chk ${on ? 'done' : ''}" for="c${i}"><input type="checkbox" id="c${i}" data-item="${esc(it.item)}" ${on ? 'checked' : ''}><span class="nm2">${esc(it.item)}${it.star ? ` ${it.star}` : ''}<small>${[it.every, it.regular && 'Also replace every ' + it.regular, it.note && M.notes[it.note]].filter(Boolean).map(esc).join(' · ')}</small></span><span class="side">${GBY[it.item] ? `<button type="button" data-guide="${esc(it.item)}">Guide</button>` : ''}<span class="act ${a}">${ACT[a]}</span>${it.ref ? pgBtn(it.ref) : '<span class="pgph"></span>'}</span></label>`; }).join('')}
            </div>
            ${hasShop ? `<div class="box shop"><div class="bh"><h3>Parts &amp; tools</h3><button type="button" id="copy">Copy</button></div>
                <div id="shopbox">${shopHTML(items, done)}</div>
            </div>` : ''}
        </div>
        <div class="legend"><span><b>*</b> dealer job unless you have the tools and data</span><span><b>**</b> Honda recommends a dealer</span><span>p. ${esc(M.page)}</span></div>
        ${sec('Guides', D.guides.length)}${guideCards(D.guides)}`;
    v.querySelectorAll('.ms button').forEach((b) => { b.onclick = () => { setSvc(+b.dataset.col, null); renderService(); }; });
    v.querySelectorAll('.chk input').forEach((c) => { c.onchange = () => { const d = store.get(key, {}); d[c.dataset.item] = c.checked; store.set(key, d); c.closest('.chk').classList.toggle('done', c.checked); if (hasShop) v.querySelector('#shopbox').innerHTML = shopHTML(items, d); }; });
    v.querySelector('#clr').onclick = () => { store.set(key, {}); renderService(); };
    if (hasShop) v.querySelector('#copy').onclick = async (e) => {
        const sd = shopData(items, store.get(key, {}));
        const txt = `${D.name} — ${label.toLocaleString()} ${UNIT} service\n` + (sd.tl.length ? '\nTOOLS\n' + sd.tl.map((id) => `- ${TOOLS[id].n}`).join('\n') + '\n' : '') + TIERS.map(([tk, name]) => { const rs = sd.open.filter((x) => x.r[5] === tk); return rs.length ? `\n${name.toUpperCase()}\n` + rs.map(({ r: [n, d, pg, , pn], job }) => `- ${n}${pn ? ' — Honda ' + pn : ''} (${d}) [${job}, p. ${pg}]`).join('\n') : ''; }).join('\n');
        try { await navigator.clipboard.writeText(txt); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Not copied'; }
        setTimeout(() => { e.target.textContent = 'Copy'; }, 1800);
    };
}
document.addEventListener('toggle', (e) => { if (e.target.id === 'toolsd') store.set('toolsOpen', e.target.open); }, true);

/* ---------- tools & costs ---------- */
function renderTools() {
    const v = $('#v-tools'), ow = owned();
    const need = {};
    STEPS.forEach((m, col) => dueItems(col).forEach(({ it }) => (JT[it.item] || []).forEach((id) => { (need[id] = need[id] || { cols: new Set(), jobs: new Set() }); need[id].cols.add(col); need[id].jobs.add(it.item); })));
    const ids = Object.keys(TOOLS).filter((id) => need[id]).sort((a, b) => Math.min(...need[a].cols) - Math.min(...need[b].cols) || (toolPrice(b) || 0) - (toolPrice(a) || 0));
    const priced = ids.filter((id) => toolPrice(id) != null && !TOOLS[id].opt);
    const left = priced.filter((id) => !ow[id]);
    const basic = ids.filter((id) => !TOOLS[id].opt);
    const stocks = []; Object.values(SUP).forEach((o) => Object.values(o).forEach((rs) => rs.forEach((r) => { if (rowX(r).stock && !stocks.some((s) => s[0] === r[0])) stocks.push(r); })));
    const costs = STEPS.map((m, col) => { const { rows } = shopData(dueItems(col), {}); return { m, col, need: sum(rows, 'need'), ifbad: sum(rows, 'ifbad') }; });
    const firstNew = {}; ids.forEach((id) => { const c = Math.min(...need[id].cols); (firstNew[c] = firstNew[c] || []).push(id); });
    v.innerHTML = `
        <div class="tl-sum">
            <div><b class="num">${basic.filter((id) => ow[id]).length} / ${basic.length}</b><span>tools owned</span></div>
            <div><b class="num">${money(left.reduce((a, id) => a + toolPrice(id), 0))}</b><span>tools to buy</span></div>
            <div><b class="num">${money(costs.reduce((a, c) => a + c.need, 0))}</b><span>parts, ${STEPS[0].toLocaleString()}–${CYCLE.toLocaleString()} ${UNIT}</span></div>
        </div>
        ${sec('Tools', 'tick what you own')}
        <div class="box">${ids.map((id) => { const tt = TOOLS[id], n = need[id], on = !!ow[id]; return `<label class="trow ${on ? 'own' : ''}"><input type="checkbox" data-own="${id}" ${on ? 'checked' : ''}><span><b>${esc(tt.n)}</b>${tt.opt ? '<span class="tag2 ifbad">if needed</span>' : ''}<small>${esc(tt.d)}</small><small class="num">${[...n.cols].sort((a, b) => a - b).map((c) => STEPS[c].toLocaleString()).join(' · ')} ${UNIT} · ${[...n.jobs].map(esc).join(', ')}</small>${(tt.links || []).map(([l, u, p]) => `<small>${ext(u, esc(l) + (p != null ? ' · ' + money(p) : ''))}</small>`).join('')}</span><span class="num">${toolPrice(id) != null ? money(toolPrice(id)) : ''}</span></label>`; }).join('')}</div>
        ${sec('Supplies')}
        <div class="box">${stocks.map((r) => { const x = rowX(r), id = 'sup:' + r[0], on = !!ow[id]; return `<label class="trow ${on ? 'own' : ''}"><input type="checkbox" data-own="${esc(id)}" ${on ? 'checked' : ''}><span><b>${esc(r[0])}</b><small>${esc(x.note || '')}</small>${x.u ? `<small>${ext(x.u, esc(x.src))}</small>` : ''}</span><span class="num">${money(x.p)}</span></label>`; }).join('')}</div>
        ${sec('Parts cost by service', `prices ${priceNote()}, before shipping`)}
        <div class="box"><table class="ctab"><thead><tr><th>Service</th><th>Replace</th><th>If inspections fail</th><th>New tools</th></tr></thead><tbody>${costs.map((c) => { const nt = (firstNew[c.col] || []).filter((id) => toolPrice(id) != null && !ow[id] && !TOOLS[id].opt); return `<tr><td><button type="button" class="linkbtn num" data-svc="${c.col}">${c.m.toLocaleString()} ${UNIT}</button></td><td class="num">${money(c.need)}</td><td class="num">+${money(c.ifbad)}</td><td>${nt.map((id) => `${esc(TOOLS[id].n)} <span class="num">${money(toolPrice(id))}</span>`).join('<br>')}</td></tr>`; }).join('')}</tbody></table></div>`;
    v.querySelectorAll('[data-own]').forEach((c) => { c.onchange = () => { const o = owned(); o[c.dataset.own] = c.checked; store.set('ownTools', o); renderTools(); }; });
    v.querySelectorAll('[data-svc]').forEach((b) => { b.onclick = () => { setSvc(+b.dataset.svc, null); show('service'); }; });
}

/* ---------- fault codes ---------- */
function renderCodes() {
    const head = '<div class="row hd"><div>Code</div><div>Fault</div><div class="sym">Symptom</div><div></div></div>';
    $('#v-codes').innerHTML = `
        ${sec('Fuel injection', 'p. ' + esc(D.dtc.page))}
        <div class="tbl sp dt">${head}${D.dtc.pgmfi.map((r) => dtcRow('pgmfi', r)).join('')}</div>
        ${(D.dtc.notes?.pgmfi || []).map((t) => `<p class="sm">${esc(t)}</p>`).join('')}
        ${DTC_EXTRA.map((tb, t) => sec(esc(tb.title), 'p. ' + esc(tb.page)) + `<div class="tbl sp dt">${head}${tb.rows.map((r) => dtcRow('x' + t, r)).join('')}</div>`).join('')}
        ${sec('ABS', 'p. ' + esc(D.dtc.abs_page))}
        <div class="tbl sp dt">${head}${D.dtc.abs.map((r) => dtcRow('abs', r)).join('')}</div>
        ${(D.dtc.notes?.abs || []).map((t) => `<p class="sm">${esc(t)}</p>`).join('')}`;
}

/* ---------- pages ---------- */
let installEvent = null;
function renderPages() {
    const chs = [...new Set(PAGES.map((p) => p.ch))];
    const name = store.get('pdfName', null);
    const off = hasPdf() && pdf.n !== D.source.pdfPages;
    $('#v-pages').innerHTML = `
        <div class="bar">
            <button type="button" data-do="pick">${hasPdf() ? 'Change manual PDF' : 'Load your manual PDF'}</button>
            ${hasPdf() ? `<span class="sm num">${esc(name || '')} · ${pdf.n} pages${off ? ` <span class="flag">${D.source.pdfPages} expected</span>` : ''}</span>
            <span class="bar"><span class="sm">Page offset</span><button type="button" data-do="shift" data-by="-1" aria-label="Offset down">−</button><b class="num">${pdf.shift}</b><button type="button" data-do="shift" data-by="1" aria-label="Offset up">+</button></span>
            <button type="button" data-do="forget">Remove</button>` : ''}
        </div>
        <div class="bar">
            <button type="button" data-do="backup">Back up my data</button>
            <button type="button" data-do="restore">Restore</button>
        </div>
        ${chs.map((ch) => { const ps = PAGES.filter((p) => p.ch === ch); return sec(esc(ch), ps.length) + `<div class="plist">${ps.map((p) => `<button class="prow" type="button" data-open="${p.p}">${hasPdf() ? `<span class="th"><img data-pg="${p.p}" data-w="120" alt=""></span>` : ''}<span><span class="m">${esc(p.mp)}</span><br><span class="t">${esc(p.t)}</span></span></button>`).join('')}</div>`; }).join('')}`;
    fillImages($('#v-pages'));
}
function backup() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('ct125:')) data[k] = localStorage.getItem(k); }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'ct125', saved: new Date().toISOString(), data }, null, 1)], { type: 'application/json' }));
    a.download = 'ct125-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#restorepick').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'ct125') throw new Error('not a backup');
        Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith('ct125:')) localStorage.setItem(k, v); });
        location.reload();
    } catch { alert('That file is not a CT125 backup.'); }
};
// Install: the browser's own prompt where it offers one, otherwise where to
// find the command (iOS and some Android browsers never offer a prompt).
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('#install').hidden = standalone();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
window.addEventListener('appinstalled', () => { installEvent = null; $('#install').hidden = true; $('#installhow').hidden = true; });
$('#install').onclick = async () => {
    if (installEvent) { const ev = installEvent; installEvent = null; ev.prompt(); await ev.userChoice; return; }
    const how = $('#installhow');
    how.textContent = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        ? 'Safari: Share, then Add to Home Screen.'
        : 'Browser menu, then Install app or Add to Home screen.';
    how.hidden = !how.hidden;
};
const DO = {
    pick: () => $('#pdfpick').click(),
    forget: () => forgetPdf(),
    shift: (b) => { pdf.shift += +b.dataset.by; store.set('pdfShift', pdf.shift); refresh(); },
    backup,
    restore: () => $('#restorepick').click(),
};

/* ---------- page viewer ---------- */
let cur = null, zoom = 1;
const vs = $('#vscroll'), vimg = $('#vimg');
function setZoom(z, cx, cy) {
    const rect = vs.getBoundingClientRect();
    cx = cx ?? rect.width / 2; cy = cy ?? rect.height / 2;
    const fx = (vs.scrollLeft + cx) / Math.max(1, vimg.offsetWidth), fy = (vs.scrollTop + cy) / Math.max(1, vimg.offsetHeight);
    zoom = Math.max(0.5, Math.min(5, z));
    vimg.style.width = (zoom * 100) + '%';
    requestAnimationFrame(() => { vs.scrollLeft = fx * vimg.offsetWidth - cx; vs.scrollTop = fy * vimg.offsetHeight - cy; });
}
function zoomToBox(box) {
    const [x, y, w, h] = box, rect = vs.getBoundingClientRect();
    zoom = Math.max(1, Math.min(4, Math.min(1 / w, (rect.height / rect.width) / (h * BYP[cur].ar)) * 0.98));
    vimg.style.width = (zoom * 100) + '%';
    requestAnimationFrame(() => { vs.scrollLeft = x * vimg.offsetWidth - (rect.width - w * vimg.offsetWidth) / 2; vs.scrollTop = y * vimg.offsetHeight - 8; });
}
function openPage(n, figIdx) {
    n = +n; const p = BYP[n]; if (!p) return;
    cur = n; $('#viewer').hidden = false; document.body.style.overflow = 'hidden';
    $('#vtitle').textContent = p.t;
    $('#vsub').textContent = `p. ${p.mp} · ${p.ch}${hasPdf() ? ` · PDF ${n + pdf.shift} / ${pdf.n}` : ''}`;
    $('#viewer').querySelectorAll('[data-pdf]').forEach((b) => { b.hidden = !hasPdf(); });
    vimg.hidden = true; vimg.removeAttribute('src'); vimg.alt = p.t;
    $('#viewer').classList.toggle('nopdf', !hasPdf());
    zoom = 1; vimg.style.width = '100%'; vs.scrollTop = 0; vs.scrollLeft = 0;
    const fig = hasPdf() ? (f, i) => `<button class="figbtn" type="button" data-zoom="${i}"><b>${esc(f.c)}</b><small>${esc(f.parts)}</small></button>` : (f) => `<div class="figbtn"><b>${esc(f.c)}</b><small>${esc(f.parts)}</small></div>`;
    $('#vpanel').innerHTML = `${hasPdf() ? '' : `<div class="bar"><b class="num">${esc(D.source.title)}, p. ${esc(p.mp)}</b><button type="button" data-do="pick">Load your manual PDF</button></div>`}<h3>${esc(p.t)}</h3><p>${esc(p.s)}</p>
        ${p.f && p.f.length ? `<h4>Diagrams</h4>${p.f.map(fig).join('')}` : ''}
        ${p.tq && p.tq.length ? `<h4>Torque</h4><ul class="num">${p.tq.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${p.n && p.n.length ? `<h4>Notes</h4><ul>${p.n.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${(p.r || []).length ? `<h4>See also</h4><div class="xref">${p.r.map(pgBtn).join('')}</div>` : ''}`;
    $('#vpanel').scrollTop = 0;
    if (hasPdf()) pageImg(n, 1800).then((u) => {
        if (cur !== n || !u) return;
        vimg.onload = () => { vimg.onload = null; const f = p.f && p.f[figIdx]; if (f && f.box.join() !== '0,0,1,1') zoomToBox(f.box); };
        vimg.src = u; vimg.hidden = false;
    });
    $('#vclose').focus({ preventScroll: true });
    setLink();
}
function closeViewer() { $('#viewer').hidden = true; if ($('#guide').hidden) document.body.style.overflow = ''; cur = null; setLink(); }
$('#vclose').onclick = closeViewer;
$('#vprev').onclick = () => cur > 1 && openPage(cur - 1);
$('#vnext').onclick = () => cur < LAST && openPage(cur + 1);
$('#vzi').onclick = () => setZoom(zoom * 1.4);
$('#vzo').onclick = () => setZoom(zoom / 1.4);
$('#vfit').onclick = () => { zoom = 1; vimg.style.width = '100%'; };
$('#vinfo').onclick = () => { const v = $('#viewer'); v.classList.toggle('hide-info'); store.set('hideInfo', v.classList.contains('hide-info')); };
if (store.get('hideInfo', false)) $('#viewer').classList.add('hide-info');
vs.addEventListener('dblclick', (e) => { if (vimg.hidden) return; const r = vs.getBoundingClientRect(); setZoom(zoom > 1.2 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top); });
$('#vpanel').addEventListener('click', (e) => { const b = e.target.closest('[data-zoom]'); if (b) zoomToBox(BYP[cur].f[+b.dataset.zoom].box); });
document.addEventListener('keydown', (e) => {
    if ($('#viewer').hidden && !$('#guide').hidden) { if (e.key === 'Escape') closeGuide(); return; }
    if ($('#viewer').hidden) { if (e.key === '/' && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); } return; }
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowLeft' && cur > 1) openPage(cur - 1);
    else if (e.key === 'ArrowRight' && cur < LAST) openPage(cur + 1);
    else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.4);
    else if (e.key === '-') setZoom(zoom / 1.4);
});

/* ---------- guides ---------- */
const CONF = { us24: '2024 US catalog', fiche: '2022 catalog', standard: 'standard Honda part', seller: 'listed for 2021-22', likely: 'likely, check diagram', check: 'confirm' };
const NEEDT = { need: 'Replace', ifbad: 'If inspection fails', alt: 'Alternative' };
function openGuide(name) {
    const gd = GBY[name]; if (!gd) return;
    $('#gtitle').textContent = gd.item;
    const parts = gd.parts.length ? `<div class="plist2">${gd.parts.map((pt) => `<div class="pr ${pt.need || ''}"><span><b>${esc(pt.name)}</b>${pt.qty ? ` × ${esc(pt.qty)}` : ''}${NEEDT[pt.need] ? `<span class="tag2 ${pt.need}">${NEEDT[pt.need]}</span>` : ''}${pt.pn ? `<small class="num">Honda ${esc(pt.pn)}${CONF[pt.conf] ? ` <span class="${/likely|check/.test(pt.conf) ? 'flag' : ''}">${CONF[pt.conf]}</span>` : ''}${PRICE[pt.pn] != null ? ' · ' + money(PRICE[pt.pn]) : ''}</small>` : ''}${pt.note ? `<small>${esc(pt.note)}</small>` : ''}</span>${pt.pn && partUrl(pt.pn) ? ext(partUrl(pt.pn), 'Buy') : pt.url ? ext(pt.url, 'Buy') : ''}</div>`).join('')}</div>` : '';
    const links = (arr, fn) => (arr && arr.length ? `<div class="links">${arr.map(fn).join('')}</div>` : '');
    const vids = links(gd.videos, (v) => ext(v.url, `<b>${esc(v.title)}</b><small>${esc(v.by)}${v.note ? ' · ' + esc(v.note) : ''}</small>`));
    const fr = links(gd.forum, (f) => ext(f.url, `<b>${esc(f.title)}</b>${f.note ? `<small>${esc(f.note)}</small>` : ''}`));
    const dg = links(gd.diagrams, (d2) => ext(d2.url, `<b>${esc(d2.name)}</b>`));
    const block = (title, html) => (html ? `<div><h3>${title}</h3>${html}</div>` : '');
    const list = (arr) => (arr.length ? `<ul class="plain">${arr.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '');
    $('#gbody').innerHTML = `
        <div class="col">
            <div class="meta3"><span>${esc(gd.level)}</span><span>${esc(gd.time)}</span>${(gd.pages || []).map(pgBtn).join('')}</div>
            ${block('Why', `<p>${esc(gd.why)}</p>`)}
            ${block('When', `<p>${esc(gd.when)}</p>`)}
            ${block('Steps', `<ol class="steps">${gd.steps.map(([s, pg]) => `<li><span>${esc(s)}</span>${pg ? pgBtn(pg) : ''}</li>`).join('')}</ol>`)}
            ${block('Specs', list(gd.checks))}
            ${block('Watch out for', list(gd.pitfalls))}
        </div>
        <div class="col">
            ${block('Parts', parts + (parts && priced ? `<p class="sm">Prices ${priceNote()}.</p>` : ''))}
            ${block('Tools', list(gd.tools))}
            ${block('Videos', vids)}
            ${block('Forum threads', fr)}
            ${block('Parts diagrams', dg)}
            ${gd.owner && D.ownerManual ? `<p class="sm">${ext(D.ownerManual, "Honda owner's manual")} · ${esc(gd.owner.replace(/^Owner's manual\s*/i, ''))}</p>` : ''}
        </div>`;
    $('#guide').hidden = false; $('#guide').scrollTop = 0; document.body.style.overflow = 'hidden';
    $('#gclose').focus({ preventScroll: true });
    setLink();
}
function closeGuide() { $('#guide').hidden = true; if ($('#viewer').hidden) document.body.style.overflow = ''; setLink(); }
$('#gclose').onclick = closeGuide;

/* ---------- wiring ---------- */
const RENDER = { search: renderSearch, torque: renderTorque, specs: renderSpecs, service: renderService, tools: renderTools, codes: renderCodes, pages: renderPages };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Keep the address bar pointing at what is on screen, so it can be copied.
function setLink() {
    const p = new URLSearchParams({ year: modelId });
    if (!$('#guide').hidden && $('#gtitle').textContent) p.set('guide', slug($('#gtitle').textContent));
    else if (cur) p.set('page', BYP[cur].mp);
    else {
        p.set('tab', view);
        const f = view === 'search' ? $('#q').value.trim() : view === 'torque' ? $('#tf')?.value.trim() : view === 'specs' ? $('#sf')?.value.trim() : '';
        if (f) p.set('q', f);
        if (view === 'service') p.set('at', svcAt || STEPS[svcCol]);
    }
    history.replaceState(null, '', '#' + p.toString().replace(/\+/g, '%20'));
}
let view = 'search';
function show(v) {
    view = v;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.v === v));
    document.querySelectorAll('section.view').forEach((s) => { s.hidden = s.id !== 'v-' + v; });
    RENDER[v](); store.set('tab', v); setLink();
}
// The PDF came or went: redraw whatever is showing.
function refresh() { RENDER[view](); if (cur) openPage(cur); }
document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => show(b.dataset.v); });
let t;
$('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { if (view === 'search') { renderSearch(); setLink(); } else show('search'); }, 90); });
document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-do]');
    if (act) { e.preventDefault(); DO[act.dataset.do](act); return; }
    const gb = e.target.closest('[data-guide]');
    if (gb) { e.preventDefault(); openGuide(gb.dataset.guide); return; }
    const o = e.target.closest('[data-open]');
    if (o && !e.target.closest('.chk input')) { e.preventDefault(); openPage(o.dataset.open, o.dataset.fig != null ? +o.dataset.fig : null); return; }
    const c = e.target.closest('[data-q]');
    if (c) { $('#q').value = c.dataset.q; show('search'); return; }
    const m = e.target.closest('[data-more]');
    if (m) { $('#v-search').dataset['all' + m.dataset.more] = $('#q').value.trim(); renderSearch(); }
});

$('#sub').textContent = `${D.name} · ${D.code}`;
if (!Object.keys(TOOLS).length) $('.tabs [data-v=tools]').hidden = true;
document.title = `CT125 Manual · ${D.name}`;
/* ---------- my bike ---------- */
// The bike reads like a nameplate: its name, its year, and an odometer. The
// pencil turns the plate into fields; the floppy saves them. Other bikes, and
// a new one, are in the menu beside it.
const ICON = {
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-5L16 4l4 4L9 19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 7l4 4M4 20l5-1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    floppy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 3v6h8V3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="12" y="4.5" width="2.5" height="3" fill="currentColor"/><rect x="7" y="13" width="10" height="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};
const odoDigits = (n) => String(Math.max(0, Math.floor(+n || 0))).padStart(6, '0').slice(-7);
// Each wheel shows its digit with the neighbours peeking at the edges, like a drum.
const odometer = (n) => `<span class="odometer" role="img" aria-label="${(+n || 0).toLocaleString()} ${UNIT}">${[...odoDigits(n)].map((d) => `<span class="wheel"><span>${(+d + 9) % 10}</span><span>${d}</span><span>${(+d + 1) % 10}</span></span>`).join('')}</span><span class="odo-unit">${UNIT}</span>`;
let editing = false;
function renderBike() {
    const el = $('#bike');
    const pick = `<select id="bpick" aria-label="Bike">${bikes.map((b, i) => `<option value="${b.id}"${b.id === BIKE.id ? ' selected' : ''}>${esc(b.name || 'Bike ' + (i + 1))}</option>`).join('')}${BIKE.visit ? `<option value="${BIKE.id}" selected>${esc(MODEL.label)}</option>` : ''}<option value="new">+ Add new bike</option></select>`;
    const odo = store.get('odo', '');
    el.classList.toggle('editing', editing);
    el.innerHTML = editing ? `<span class="pic" role="img" aria-label="CT125"></span>
        <div class="plate">
            <input id="bname" type="text" placeholder="Name" aria-label="Bike name" value="${esc(BIKE.name)}" autocomplete="off">
            <select id="byear" aria-label="Model year">${MODELS.map((m) => `<option value="${m.id}"${m.id === modelId ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
        </div>
        <label class="odo-edit"><input id="odo" class="num" type="number" inputmode="numeric" min="0" step="1" aria-label="Odometer" value="${esc(odo)}"><span>${UNIT}</span></label>
        <span class="bike-tools"><button type="button" id="bsave" class="icon" title="Save" aria-label="Save">${ICON.floppy}</button>${bikes.length > 1 && !BIKE.visit ? '<button type="button" id="bdel">Remove</button>' : ''}</span>`
        : `<span class="pic" role="img" aria-label="CT125"></span>
        <div class="plate"><span class="bike-name">${esc(BIKE.name || (BIKE.visit ? 'CT125' : 'My bike'))}</span><span class="bike-year">${esc(MODEL.label)}</span></div>
        <button type="button" class="odo-view" id="odoview" title="Edit odometer">${odometer(odo)}</button>
        <span class="bike-tools"><button type="button" id="bedit" class="icon" title="Edit bike" aria-label="Edit bike">${ICON.pencil}</button>${pick}</span>`;
    if (!editing) {
        $('#bedit').onclick = $('#odoview').onclick = () => { editing = true; renderBike(); ($('#bname').value ? $('#odo') : $('#bname')).focus(); };
        $('#bpick').onchange = (e) => {
            if (e.target.value === 'new') {
                const id = 'b' + Date.now().toString(36);
                bikes.push({ id, name: '', model: modelId }); saveBikes(); ls.set('ct125:bike', id); ls.set('ct125:editNew', true);
            } else ls.set('ct125:bike', e.target.value);
            location.hash = ''; location.reload();
        };
        return;
    }
    const save = () => {
        const name = $('#bname').value.trim(), year = $('#byear').value, n = $('#odo').value;
        if (BIKE.visit) { delete BIKE.visit; BIKE.id = 'b' + Date.now().toString(36); bikes.push(BIKE); ls.set('ct125:bike', BIKE.id); }
        BIKE.name = name; const moved = year !== BIKE.model; BIKE.model = year; saveBikes();
        if (moved) { location.hash = ''; location.reload(); return; }
        store.set('odo', n);
        editing = false; renderBike();
        const k = parseInt(n, 10);
        if (!isNaN(k)) {
            const m = milestoneFor(k), at = m.at > CYCLE ? m.at : null;
            if (m.col !== svcCol || at !== svcAt) { setSvc(m.col, at); if (view === 'service') renderService(); }
        }
    };
    $('#bsave').onclick = save;
    el.querySelectorAll('input').forEach((i) => { i.onkeydown = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editing = false; renderBike(); } }; });
    if ($('#bdel')) $('#bdel').onclick = () => {
        if (!confirm(`Remove ${BIKE.name || 'this bike'} and its saved service history?`)) return;
        try { Object.keys(localStorage).filter((k) => k.startsWith(`ct125:b:${BIKE.id}:`)).forEach((k) => localStorage.removeItem(k)); } catch { /* private mode */ }
        bikes = bikes.filter((b) => b.id !== BIKE.id); saveBikes(); ls.set('ct125:bike', bikes[0].id); location.reload();
    };
}
if (ls.get('ct125:editNew', false)) { editing = true; ls.set('ct125:editNew', false); }
renderBike();
$('#foot').innerHTML = [...D.source.notes, Object.keys(REFS).length ? 'Shop links are referral links: buying through them supports this page at no cost to you.' : '', 'Not affiliated with Honda.'].filter(Boolean).map((s) => `<div>${esc(s)}</div>`).join('');
const okTab = (t) => RENDER[t] && !(t === 'tools' && !Object.keys(TOOLS).length);
if (LINK.at && STEPS.includes(+LINK.at)) setSvc(STEPS.indexOf(+LINK.at), null);
const startTab = okTab(LINK.tab) ? LINK.tab : okTab(store.get('tab', 'search')) ? store.get('tab', 'search') : 'search';
if (LINK.q && startTab === 'search') $('#q').value = LINK.q;
show(startTab);
if (LINK.q && (startTab === 'torque' || startTab === 'specs')) { const f = $(startTab === 'torque' ? '#tf' : '#sf'); f.value = LINK.q; f.dispatchEvent(new Event('input')); }
if (LINK.guide) { const g = D.guides.find((x) => slug(x.item) === slug(LINK.guide)); if (g) openGuide(g.item); }
if (LINK.page && mp2p(LINK.page)) openPage(mp2p(LINK.page));
const h = (location.hash || '').match(/^#p(\d{1,3})$/);
if (h) openPage(+h[1]);
window.addEventListener('hashchange', () => location.reload());
// The manual the owner loaded last time.
idb('readonly', (s) => s.get('pdf:' + modelId)).then((blob) => blob && openPdf(blob).then(refresh)).catch(() => {});
