// scripts/blog/demos/daylight.js — the two figures in the proportional-hours post.
//
// zh-hours: one day in Jerusalem, in clock hours and in proportional hours, on
//   the same timeline. Move the sun along the year: the clock's sunrise, midday
//   and sunset wander (and jump when the clocks change); the proportional
//   hours stay put on the sun and stretch instead.
// zh-daylight: the earth, lit from the right. Move the north pole and the axis
//   turns through the year: each latitude line shows how much of its turn is
//   in daylight, and the boxes give the day and one proportional hour.
//
// Both are dragged (or focused and moved with the arrow keys, Page Up/Down for
// a month, Home for today); in e-ink mode, buttons under each step the date.
// Sun maths = scripts/zman-clock.js. The same code writes the static SVGs in
// the post (for no-JS readers and the zine): node loads this file and calls
// hoursFigure(date) and daylightFigure(date).
(function () {
    const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, EPS = 23.4397 * rad;
    const JLM = { lat: 31.778, lon: 35.235, tz: 'Asia/Jerusalem' };
    function sun(date, lon = 0) {
        const lw = rad * -lon, d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;
        const n = Math.round(d - 0.0009 - lw / (2 * Math.PI)), ds = 0.0009 + lw / (2 * Math.PI) + n;
        const M = rad * (357.5291 + 0.98560028 * ds);
        const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
        const L = M + C + rad * 102.9372 + Math.PI; // ecliptic longitude
        return { L, M, ds, dec: Math.asin(Math.sin(L) * Math.sin(EPS)) };
    }
    function hourAngle(dec, lat) {
        const phi = rad * lat, cosH = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        return cosH < -1 ? Math.PI : cosH > 1 ? 0 : Math.acos(cosH);
    }
    const daylightHours = (date, lat) => hourAngle(sun(date).dec, lat) / Math.PI * 24;
    function sunTimes(date, { lat, lon }) {
        const { L, M, ds, dec } = sun(date, lon), w = hourAngle(dec, lat) / (2 * Math.PI);
        const transit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
        const at = (j) => new Date((j + 0.5 - J1970) * dayMs);
        return { sunrise: at(transit - w), noon: at(transit), sunset: at(transit + w) };
    }
    const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    const f = (x) => (Math.round(x * 10) / 10).toString();
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
    const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
    const wrap = (text, n) => { const out = []; let line = ''; for (const w of text.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };
    const noonOf = (ms) => { const d = new Date(ms); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)); };
    const fmts = {};
    const fmt = (key, opts) => (fmts[key] ||= new Intl.DateTimeFormat(key.split('|')[0], opts));
    function hebrew(date) {
        try { return fmt('en-u-ca-hebrew|full', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date); }
        catch (_) { return date.toISOString().slice(0, 10); }
    }
    function hebrewParts(date) {
        const p = fmt('en-u-ca-hebrew|parts', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(date);
        const get = (t) => (p.find((x) => x.type === t) || {}).value;
        return { day: +get('day'), month: get('month') };
    }
    // Hours since local midnight on the location's clock (DST included).
    function clockHours(date, tz) {
        const p = fmt(`en-GB|clock|${tz}`, { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: tz }).formatToParts(date);
        const get = (t) => +(p.find((x) => x.type === t) || {}).value;
        return get('hour') + get('minute') / 60;
    }
    const clockText = (h) => { const m = Math.round(h * 60) % 1440; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

    // Shared look: the theme's two colours only. Inside each SVG, so the figures
    // carry it into the zine.
    const STYLE = `<style>
.zh-fig { display: block; width: 100%; height: auto; max-width: 640px; margin: 15px auto 5px; font-family: var(--font-body); font-size: 14px; }
.zh-fig text { fill: var(--text-color); }
.zh-fig .zh-b { font-weight: bold; }
.zh-fig .zh-s { font-size: 13px; }
.zh-fig .zh-bar, .zh-fig .zh-box { fill: var(--win-bg-color); stroke: var(--text-color); stroke-width: 2; }
.zh-fig .zh-frame { fill: none; stroke: var(--text-color); stroke-width: 2; }
.zh-fig .zh-tick { stroke: var(--text-color); stroke-width: 1.5; }
.zh-fig .zh-dash { fill: none; stroke: var(--text-color); stroke-width: 1; stroke-dasharray: 3 4; }
.zh-fig .zh-thin { fill: none; stroke: var(--text-color); stroke-width: 1.5; }
.zh-fig .zh-day { fill: var(--win-bg-color); }
.zh-fig .zh-hatch { stroke: var(--text-color); stroke-width: 1.5; }
.zh-fig .zh-halo { stroke: var(--win-bg-color); stroke-width: 9; }
.zh-fig .zh-rim { fill: none; stroke: var(--text-color); stroke-width: 2.5; }
.zh-fig .zh-chord { stroke: var(--text-color); stroke-width: 3; }
.zh-fig .zh-dot { fill: var(--text-color); }
.zh-fig .zh-knob { cursor: var(--cur-move, move); touch-action: none; outline: none; }
.zh-fig .zh-hit { fill: none; pointer-events: all; }
.zh-fig .zh-ring { fill: none; stroke: var(--text-color); stroke-width: 2; visibility: hidden; }
.zh-fig .zh-knob:focus-visible .zh-ring { visibility: visible; }
.zh-fig .zh-knob-t { fill: var(--win-bg-color); font-size: 11px; font-weight: bold; pointer-events: none; }
.zh-fig .zh-sun { fill: var(--win-bg-color); stroke: var(--text-color); stroke-width: 2.5; }
</style>`;
    const hatchDefs = (id, clip) => `<defs>${clip || ''}<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="zh-hatch" x1="0" y1="0" x2="0" y2="7"/></pattern></defs>`;
    const knobMarkup = (date, x, y, face) => `<g class="zh-knob" tabindex="0" role="slider" aria-label="Date" aria-valuetext="${esc(hebrew(date))}" transform="translate(${f(x)} ${f(y)})"><circle class="zh-hit" r="22"/><circle class="zh-ring" r="14"/>${face}</g>`;

    // ---------- zh-hours: clock hours against proportional hours ----------
    const HX0 = 40, HX1 = 600, HXS = (HX1 - HX0) / 24, HY = 226, HH = 262;
    const hx = (h) => HX0 + h * HXS;
    // One Hebrew year: where its months start and where the clocks change.
    const years = {};
    function hebrewYear(date) {
        let ms = date.valueOf();
        for (let i = 0; i < 400; i++) { const p = hebrewParts(new Date(ms)); if (p.day === 1 && /^Tis/.test(p.month)) break; ms -= dayMs; }
        if (years[ms]) return years[ms];
        const months = [], dst = [];
        let prevOff = null, i = 0;
        for (; i < 400; i++) {
            const d = new Date(ms + i * dayMs), p = hebrewParts(d);
            if (i > 0 && p.day === 1 && /^Tis/.test(p.month)) break;
            if (p.day === 1) months.push({ i, name: p.month });
            const off = clockHours(d, JLM.tz) - 12;
            if (prevOff !== null && off !== prevOff) dst.push({ i, delta: off - prevOff });
            prevOff = off;
        }
        return (years[ms] = { start: ms, days: i, months, dst });
    }
    const stripX = (y, i) => HX0 + (i + 0.5) / y.days * (HX1 - HX0);

    function hoursScene(date) {
        const t = sunTimes(date, JLM), rise = clockHours(t.sunrise, JLM.tz), set = clockHours(t.sunset, JLM.tz), noon = clockHours(t.noon, JLM.tz);
        const D = set - rise, N = 24 - D, hour = Math.round(D * 60 / 12);
        let g = `<text class="zh-b" x="${HX0}" y="24">${esc(hebrew(date))}</text><text class="zh-s" x="${HX1}" y="24" text-anchor="end">Jerusalem</text>`;
        const bar = (y) => `<rect fill="url(#zh-hours-hatch)" x="${HX0}" y="${y}" width="${HX1 - HX0}" height="26"/><rect class="zh-day" x="${f(hx(rise))}" y="${y}" width="${f(D * HXS)}" height="26"/>`;
        const tick = (h, y) => `<line class="zh-tick" x1="${f(hx(h))}" y1="${y}" x2="${f(hx(h))}" y2="${y + 26}"/>`;
        // Clock hours: the ticks stay, the sun moves across them.
        g += `<text class="zh-b" x="${HX0}" y="56">Clock hours</text><text x="${HX1}" y="56" text-anchor="end">sunrise ${clockText(rise)} · midday ${clockText(noon)} · sunset ${clockText(set)}</text>`;
        g += bar(64);
        for (let h = 1; h < 24; h++) g += tick(h, 64);
        g += `<line class="zh-tick" x1="${f(hx(rise))}" y1="64" x2="${f(hx(rise))}" y2="90"/><line class="zh-tick" x1="${f(hx(set))}" y1="64" x2="${f(hx(set))}" y2="90"/><rect class="zh-frame" x="${HX0}" y="64" width="${HX1 - HX0}" height="26"/>`;
        for (const h of [0, 6, 12, 18, 24]) g += `<text class="zh-s" x="${f(hx(h))}" y="106" text-anchor="middle">${h}:00</text>`;
        // Proportional hours: the ticks are tied to the sun, and stretch.
        g += `<text class="zh-b" x="${HX0}" y="140">Proportional hours</text><text x="${HX1}" y="140" text-anchor="end">one hour = ${hour} min</text>`;
        g += bar(148);
        for (let k = 0; k <= 12; k++) g += tick(rise + D * k / 12, 148);
        for (let k = 1; k < 12; k++) g += tick((set + N * k / 12) % 24, 148);
        g += `<rect class="zh-frame" x="${HX0}" y="148" width="${HX1 - HX0}" height="26"/>`;
        for (const [h, s] of [[rise, '0'], [noon, '6'], [set, '12']]) g += `<text class="zh-s" x="${f(hx(h))}" y="190" text-anchor="middle">${s}</text>`;
        // The year: months, and the days the clocks change.
        const y = hebrewYear(date);
        g += `<line class="zh-thin" x1="${HX0}" y1="${HY}" x2="${HX1}" y2="${HY}"/>`;
        y.months.forEach((m, k) => {
            const x0 = HX0 + m.i / y.days * (HX1 - HX0), next = y.months[k + 1] ? y.months[k + 1].i : y.days, xm = HX0 + (m.i + next) / 2 / y.days * (HX1 - HX0);
            const name = /^Adar/.test(m.name) ? m.name : m.name.slice(0, 3);
            g += `<line class="zh-thin" x1="${f(x0)}" y1="${HY - 6}" x2="${f(x0)}" y2="${HY + 6}"/><text class="zh-s" x="${f(xm)}" y="${HY + 24}" text-anchor="middle">${esc(name)}</text>`;
        });
        g += `<line class="zh-thin" x1="${HX1}" y1="${HY - 6}" x2="${HX1}" y2="${HY + 6}"/>`;
        for (const c of y.dst) g += `<text class="zh-s" x="${f(stripX(y, c.i))}" y="${HY - 12}" text-anchor="middle">${c.delta > 0 ? '+' : '−'}1 h</text>`;
        return g;
    }
    function hoursKnob(date) { const y = hebrewYear(date); return { x: stripX(y, Math.round((date - y.start) / dayMs)), y: HY }; }
    function hoursFigure(date) {
        const k = hoursKnob(date);
        return `<svg class="zh-fig" id="zh-hours" viewBox="0 0 640 ${HH}" role="group" aria-labelledby="zh-hours-t zh-hours-d"><title id="zh-hours-t">Clock hours and proportional hours</title><desc id="zh-hours-d">One day in Jerusalem on a 24-hour line, night hatched. Clock hours stay fixed while sunrise, midday and sunset move through the year and jump when the clocks change. Proportional hours start at sunrise, reach 6 at midday and end at sunset every day; only their length changes. Move the sun along the year to change the date.</desc>${STYLE}${hatchDefs('zh-hours-hatch')}<g class="zh-scene">${hoursScene(date)}</g>${knobMarkup(date, k.x, k.y, '<circle class="zh-sun" r="9"/><circle class="zh-dot" r="3.5"/>')}</svg>`;
    }

    // ---------- zh-daylight: latitude and the length of the day ----------
    // Orbit angle: 0 at the June solstice (pole towards the sun), a quarter turn per season.
    const theta = (date) => sun(date).L - Math.PI / 2;
    const cx = 175, cy = 235, R = 150, AX = R + 18;           // globe, axis half-length
    const TA = AX * Math.sin(EPS), TB = 16, TY = cy - AX;      // the pole's track: an ellipse seen from a little above
    const PL = [['Arctic Circle, 66.6°N', 66.56], ['Stockholm, 59.3°N', 59.33], ['Jerusalem, 31.8°N', 31.778], ['Equator', 0]];
    const BOX_X = 400, BOX_W = 230, CHARS = 28;
    const boxH = (lines) => 34 + lines * 18 + 8;
    // Tall enough for the Arctic box's four lines of midnight sun.
    const DH = 52 + boxH(4) + 3 * boxH(2) + 4 * 12 + 8;
    function daylightKnob(date) { const t = theta(date); return { x: cx + TA * Math.cos(t), y: TY + TB * Math.sin(t) }; }
    function daylightScene(date) {
        const { dec } = sun(date), k = daylightKnob(date);
        let g = `<text class="zh-b" x="10" y="24">${esc(hebrew(date))}</text>`;
        // The axis runs from the pole through the centre.
        g += `<line class="zh-thin" x1="${f(2 * cx - k.x)}" y1="${f(2 * cy - k.y)}" x2="${f(k.x)}" y2="${f(k.y)}"/>`;
        const ax = [Math.sin(dec), -Math.cos(dec)], bx = [Math.cos(dec), Math.sin(dec)];
        let by = 52;
        for (const [name, lat] of PL) {
            const s = Math.sin(lat * rad), hl = R * Math.cos(lat * rad), c0 = [cx + ax[0] * R * s, cy + ax[1] * R * s];
            const p1 = [c0[0] - bx[0] * hl, c0[1] - bx[1] * hl], p2 = [c0[0] + bx[0] * hl, c0[1] + bx[1] * hl];
            // The circle the place travels in one turn: thin over the night side, thick in the light.
            const seg = (a, b, night) => night
                ? `<line class="zh-halo" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/><line class="zh-thin" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`
                : `<line class="zh-chord" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`;
            if (p2[0] <= cx) g += seg(p1, p2, true);
            else if (p1[0] >= cx) g += seg(p1, p2, false);
            else { const tx = (cx - p1[0]) / (p2[0] - p1[0]), pm = [cx, p1[1] + (p2[1] - p1[1]) * tx]; g += seg(p1, pm, true) + seg(pm, p2, false); }
            const h = daylightHours(date, lat);
            const body = h >= 24
                ? ['One hour is probably like several weeks up here.', "Maybe don't use proportional hours for this."]
                : [`${hm(h)} of daylight.`, `One hour is ${Math.round(h * 60 / 12)} minutes.`];
            const lines = [].concat(...body.map((p) => wrap(p, CHARS)));
            g += `<rect class="zh-box" x="${BOX_X}" y="${by}" width="${BOX_W}" height="${boxH(lines.length)}"/><text class="zh-b" x="${BOX_X + 10}" y="${by + 22}">${esc(name)}</text>`;
            lines.forEach((l, i) => { g += `<text x="${BOX_X + 10}" y="${by + 42 + i * 18}">${esc(l)}</text>`; });
            g += `<polyline class="zh-thin" points="${f(p2[0])},${f(p2[1])} 380,${by + 18} ${BOX_X},${by + 18}"/><circle class="zh-dot" cx="${f(p2[0])}" cy="${f(p2[1])}" r="3.5"/>`;
            by += boxH(lines.length) + 12;
        }
        return g;
    }
    function daylightFigure(date) {
        const k = daylightKnob(date);
        let s = `<svg class="zh-fig" id="zh-daylight" viewBox="0 0 640 ${DH}" role="group" aria-labelledby="zh2-t zh2-d"><title id="zh2-t">How far north you are sets the length of the day</title><desc id="zh2-d">The earth, lit from the right; the night half is hatched. Each line is the circle a place travels in one turn, and the lit part is its day. Move the north pole to turn the axis through the year.</desc>${STYLE}`;
        s += hatchDefs('zh2-hatch', `<clipPath id="zh2-night"><rect x="0" y="0" width="${cx}" height="${DH}"/></clipPath>`);
        s += `<circle class="zh-day" cx="${cx}" cy="${cy}" r="${R}"/><circle fill="url(#zh2-hatch)" cx="${cx}" cy="${cy}" r="${R}" clip-path="url(#zh2-night)"/><line class="zh-thin" x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}"/><circle class="zh-rim" cx="${cx}" cy="${cy}" r="${R}"/>`;
        s += `<ellipse class="zh-dash" cx="${cx}" cy="${TY}" rx="${f(TA)}" ry="${TB}"/>`;
        s += `<text class="zh-s" x="${BOX_X}" y="30">sunlight comes from this side →</text>`;
        s += `<g class="zh-scene">${daylightScene(date)}</g>`;
        return s + knobMarkup(date, k.x, k.y, '<circle class="zh-dot" r="9"/><text class="zh-knob-t" y="4" text-anchor="middle">N</text>') + '</svg>';
    }

    if (typeof module === 'object' && module.exports) { module.exports = { hoursFigure, daylightFigure, daylightHours }; return; }

    // ---------- Wiring ----------
    const now = new Date(), today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
    function wire(id, scene, knobAt, fromPointer) {
        const svg = document.getElementById(id);
        if (!svg) return;
        const sceneEl = svg.querySelector('.zh-scene'), knob = svg.querySelector('.zh-knob');
        let date = today;
        function set(d) {
            date = noonOf(d.valueOf());
            sceneEl.innerHTML = scene(date);
            const k = knobAt(date);
            knob.setAttribute('transform', `translate(${f(k.x)} ${f(k.y)})`);
            knob.setAttribute('aria-valuetext', hebrew(date));
        }
        const step = (n) => set(new Date(date.valueOf() + n * dayMs));
        const svgPoint = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
        let dragging = false;
        knob.addEventListener('pointerdown', (e) => { dragging = true; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
        knob.addEventListener('pointermove', (e) => { if (dragging) set(fromPointer(svgPoint(e), date)); });
        const stop = () => { dragging = false; };
        knob.addEventListener('pointerup', stop);
        knob.addEventListener('pointercancel', stop);
        knob.addEventListener('keydown', (e) => {
            const n = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 30, PageDown: -30 }[e.key];
            if (n) step(n); else if (e.key === 'Home') set(today); else return;
            e.preventDefault();
        });
        document.querySelectorAll(`.zh-steps[data-for="${id}"] button[data-step]`).forEach((b) => b.addEventListener('click', () => step(+b.dataset.step)));
        set(today);
    }
    function init() {
        // Pointer → the nearest date whose pole sits at that angle on the track.
        wire('zh-daylight', daylightScene, daylightKnob, (p, date) => {
            const want = Math.atan2((p.y - TY) / TB, (p.x - cx) / TA);
            let d = date.valueOf();
            for (let i = 0; i < 3; i++) d += wrapPi(want - theta(new Date(d))) / (2 * Math.PI) * 365.2422 * dayMs;
            return new Date(d);
        });
        // Pointer → the day of this Hebrew year under it.
        wire('zh-hours', hoursScene, hoursKnob, (p, date) => {
            const y = hebrewYear(date), i = Math.max(0, Math.min(y.days - 1, Math.floor((p.x - HX0) / (HX1 - HX0) * y.days)));
            return new Date(y.start + i * dayMs);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
