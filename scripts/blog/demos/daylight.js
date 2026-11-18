// scripts/blog/demos/daylight.js — the latitude figure in the proportional-hours post.
//
// The earth, lit from the right. Drag the north pole (or focus it and use the
// arrow keys) and the axis turns through the year: each latitude line shows
// how much of its turn is in daylight, and the boxes give the length of the
// day and of one proportional hour. Sun maths = scripts/zman-clock.js.
//
// The same code writes the static SVG in the post (so no-JS readers and the
// zine see the figure): node loads this file and calls figure(date).
(function () {
    const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, EPS = 23.4397 * rad;
    function sun(date) {
        const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;
        const n = Math.round(d - 0.0009), ds = 0.0009 + n, M = rad * (357.5291 + 0.98560028 * ds);
        const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
        const L = M + C + rad * 102.9372 + Math.PI; // ecliptic longitude
        return { L, dec: Math.asin(Math.sin(L) * Math.sin(EPS)) };
    }
    function daylightHours(date, lat) {
        const phi = rad * lat, { dec } = sun(date);
        const cosH = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        if (cosH < -1) return 24; if (cosH > 1) return 0; return Math.acos(cosH) / Math.PI * 24;
    }
    // Orbit angle: 0 at the June solstice (pole towards the sun), a quarter turn per season.
    const theta = (date) => sun(date).L - Math.PI / 2;
    const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    const f = (x) => (Math.round(x * 10) / 10).toString();
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
    const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
    const wrap = (text, n) => { const out = []; let line = ''; for (const w of text.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };
    function hebrew(date) {
        try { return new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date); }
        catch (_) { return date.toISOString().slice(0, 10); }
    }

    const cx = 175, cy = 235, R = 150, AX = R + 18;           // globe, axis half-length
    const TA = AX * Math.sin(EPS), TB = 16, TY = cy - AX;      // the pole's track: an ellipse seen from a little above
    const PL = [['Arctic Circle, 66.6°N', 66.56], ['Stockholm, 59.3°N', 59.33], ['Jerusalem, 31.8°N', 31.778], ['Equator', 0]];
    const BOX_X = 400, BOX_W = 230, CHARS = 28;
    const boxH = (lines) => 34 + lines * 18 + 8;
    // Tall enough for the Arctic box's four lines of midnight sun.
    const HEIGHT = 52 + boxH(4) + 3 * boxH(2) + 4 * 12 + 8;

    function knobAt(date) {
        const t = theta(date);
        return { x: cx + TA * Math.cos(t), y: TY + TB * Math.sin(t) };
    }

    /** Everything that changes with the date. */
    function scene(date) {
        const { dec } = sun(date), k = knobAt(date);
        let g = `<text class="zh-b" x="10" y="24">${esc(hebrew(date))}</text>`;
        // The axis runs from the pole through the centre.
        g += `<line class="zh-thin" x1="${f(2 * cx - k.x)}" y1="${f(2 * cy - k.y)}" x2="${f(k.x)}" y2="${f(k.y)}"/>`;
        const ax = [Math.sin(dec), -Math.cos(dec)], bx = [Math.cos(dec), Math.sin(dec)];
        let by = 52;
        for (const [name, lat] of PL) {
            const s = Math.sin(lat * rad), hl = R * Math.cos(lat * rad), c0 = [cx + ax[0] * R * s, cy + ax[1] * R * s];
            const p1 = [c0[0] - bx[0] * hl, c0[1] - bx[1] * hl], p2 = [c0[0] + bx[0] * hl, c0[1] + bx[1] * hl];
            // The circle the place travels in one turn: thin over the night side, thick in the light.
            const seg = (a, b, cls) => cls === 'night'
                ? `<line class="zh-halo" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/><line class="zh-thin" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`
                : `<line class="zh-chord" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`;
            if (p2[0] <= cx) g += seg(p1, p2, 'night');
            else if (p1[0] >= cx) g += seg(p1, p2, 'day');
            else { const tx = (cx - p1[0]) / (p2[0] - p1[0]), pm = [cx, p1[1] + (p2[1] - p1[1]) * tx]; g += seg(p1, pm, 'night') + seg(pm, p2, 'day'); }
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

    function figure(date) {
        const k = knobAt(date);
        let s = `<svg class="zh-fig" id="zh-daylight" viewBox="0 0 640 ${HEIGHT}" role="group" aria-labelledby="zh2-t zh2-d"><title id="zh2-t">How far north you are sets the length of the day</title><desc id="zh2-d">The earth, lit from the right; the night half is hatched. Each line is the circle a place travels in one turn, and the lit part is its day. Move the north pole to turn the axis through the year.</desc>`;
        s += `<defs><clipPath id="zh2-night"><rect x="0" y="0" width="${cx}" height="${HEIGHT}"/></clipPath><pattern id="zh2-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="zh-hatch" x1="0" y1="0" x2="0" y2="7"/></pattern></defs>`;
        s += `<circle class="zh-day" cx="${cx}" cy="${cy}" r="${R}"/><circle fill="url(#zh2-hatch)" cx="${cx}" cy="${cy}" r="${R}" clip-path="url(#zh2-night)"/><line class="zh-thin" x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}"/><circle class="zh-rim" cx="${cx}" cy="${cy}" r="${R}"/>`;
        s += `<ellipse class="zh-dash" cx="${cx}" cy="${TY}" rx="${f(TA)}" ry="${TB}"/>`;
        s += `<text class="zh-s" x="${BOX_X}" y="30">sunlight comes from this side →</text>`;
        s += `<g class="zh-scene">${scene(date)}</g>`;
        s += `<g class="zh-knob" tabindex="0" role="slider" aria-label="Date" aria-valuetext="${esc(hebrew(date))}" transform="translate(${f(k.x)} ${f(k.y)})"><circle class="zh-hit" r="22"/><circle class="zh-ring" r="13"/><circle class="zh-dot" r="9"/><text class="zh-knob-t" y="4" text-anchor="middle">N</text></g>`;
        return s + '</svg>';
    }

    if (typeof module === 'object' && module.exports) { module.exports = { figure, daylightHours }; return; }

    function init() {
        const svg = document.getElementById('zh-daylight');
        if (!svg) return;
        const sceneEl = svg.querySelector('.zh-scene'), knob = svg.querySelector('.zh-knob');
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
        let date = today;
        function set(d) {
            date = d;
            sceneEl.innerHTML = scene(date);
            const k = knobAt(date);
            knob.setAttribute('transform', `translate(${f(k.x)} ${f(k.y)})`);
            knob.setAttribute('aria-valuetext', hebrew(date));
        }
        const addDays = (n) => set(new Date(date.valueOf() + n * dayMs));
        // Pointer → the nearest date whose pole position has that angle on the track.
        function toward(e) {
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
            const want = Math.atan2((p.y - TY) / TB, (p.x - cx) / TA);
            let d = date.valueOf();
            for (let i = 0; i < 3; i++) d += wrapPi(want - theta(new Date(d))) / (2 * Math.PI) * 365.2422 * dayMs;
            const day = new Date(d);
            set(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12)));
        }
        let dragging = false;
        knob.addEventListener('pointerdown', (e) => { dragging = true; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
        knob.addEventListener('pointermove', (e) => { if (dragging) toward(e); });
        const stop = () => { dragging = false; };
        knob.addEventListener('pointerup', stop);
        knob.addEventListener('pointercancel', stop);
        knob.addEventListener('keydown', (e) => {
            const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 30, PageDown: -30 }[e.key];
            if (step) addDays(step);
            else if (e.key === 'Home') set(today);
            else return;
            e.preventDefault();
        });
        set(today);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
