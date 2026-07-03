// /scripts/zman-clock.js
// A Torah-accurate clock: time as sha'ot zmaniyot — the daylight (sunrise→
// sunset) divided into 12 variable hours, and likewise the night — with the
// Talmudic subdivisions: 1080 chalakim per hour, 76 regaim per chelek
// (Rambam, Hilchot Kiddush HaChodesh; a rega ≈ 44ms). The dial runs
// COUNTERCLOCKWISE with Hebrew-letter hour markers, in homage to Konstantin
// Chaykin's Decalogue — Hebrew reads right to left, and so does this clock.
// Solar position uses the standard NOAA/SunCalc equations. Pure vanilla.

(function () {
    const win = document.getElementById('zman-clock-window');
    if (!win) return;

    const $ = (id) => document.getElementById(id);
    const LOC_KEY = 'pelmeniboiler-clock-loc';
    const DEFAULT_LOC = { lat: 31.778, lon: 35.235, label: 'ירושלים' };
    const HOUR_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב'];

    let loc = DEFAULT_LOC;
    try { loc = JSON.parse(localStorage.getItem(LOC_KEY)) || DEFAULT_LOC; } catch (_) { /* default */ }

    // --- Solar times (SunCalc-derived; returns sunrise/sunset Dates or null) ---
    const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
    const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
    const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
    function sunTimes(date, lat, lon) {
        const lw = rad * -lon, phi = rad * lat;
        const d = toJulian(date) - J2000;
        const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
        const ds = 0.0009 + lw / (2 * Math.PI) + n;
        const M = rad * (357.5291 + 0.98560028 * ds);
        const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
        const L = M + C + rad * 102.9372 + Math.PI;
        const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
        const Jtransit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
        const cosH = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        if (cosH < -1 || cosH > 1) return null; // polar day/night
        const w = Math.acos(cosH) / (2 * Math.PI);
        return { sunrise: fromJulian(Jtransit - w), sunset: fromJulian(Jtransit + w) };
    }

    /** The current zmanit period: start, end, and whether it's day. */
    function currentPeriod(now) {
        const today = sunTimes(now, loc.lat, loc.lon);
        if (!today) return null;
        if (now < today.sunrise) {
            const y = sunTimes(new Date(now.valueOf() - dayMs), loc.lat, loc.lon);
            return y && { start: y.sunset, end: today.sunrise, day: false, sun: today };
        }
        if (now < today.sunset) return { start: today.sunrise, end: today.sunset, day: true, sun: today };
        const t = sunTimes(new Date(now.valueOf() + dayMs), loc.lat, loc.lon);
        return t && { start: today.sunset, end: t.sunrise, day: false, sun: today };
    }

    // Hebrew weekdays — never "Friday", never "Monday". After sunset the base
    // date is already advanced, so Friday evening correctly reads שבת.
    const HEB_WEEKDAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];

    /** Hebrew-calendar date string; the Torah day begins at sunset. */
    function hebrewDate(now) {
        const today = sunTimes(now, loc.lat, loc.lon);
        const base = (today && now >= today.sunset) ? new Date(now.valueOf() + dayMs) : now;
        const lang = (document.documentElement.lang === 'he') ? 'he' : 'en';
        let datePart;
        try {
            datePart = new Intl.DateTimeFormat(`${lang}-u-ca-hebrew`, { day: 'numeric', month: 'long', year: 'numeric' }).format(base);
        } catch (_) { datePart = base.toDateString(); }
        return `${HEB_WEEKDAYS[base.getDay()]}, ${datePart}`;
    }
    // The tray clock (start-menu.js) prefers this over its midnight-flipping default.
    window.zmanHebrewDate = (now) => hebrewDate(now || new Date());

    // Moon phase glyph for the actual current phase (synodic month 29.53059d
    // from the 2000-01-06 18:14 UTC new moon) — not a decorative crescent.
    const SYNODIC = 29.530588853 * dayMs;
    const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
    const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    function moonGlyph(now) {
        const phase = (((now - NEW_MOON_EPOCH) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
        return MOONS[Math.round(phase * 8) % 8];
    }

    /** Zmanit time snapshot; also feeds the tray via window.zmanTime. */
    function zmanNow(now) {
        const p = currentPeriod(now);
        if (!p) return null;
        const frac = (now - p.start) / (p.end - p.start);
        const hourF = Math.min(11.9999, frac * 12);
        const hour = Math.floor(hourF);
        const chalakim = (hourF - hour) * 1080;
        return { p, hourF, hour, chalakim, regaim: (chalakim % 1) * 76 };
    }
    window.zmanTime = (now) => {
        const t = zmanNow(now || new Date());
        if (!t) return '';
        const glyph = t.p.day ? '☀' : moonGlyph(now || new Date());
        return `${HOUR_LETTERS[t.hour]}׳ ${String(Math.floor(t.chalakim)).padStart(4, '0')}ח ${glyph}`;
    };

    // --- Dial construction: counterclockwise, Hebrew letters, א at the top ---
    const marks = $('zman-marks'), letters = $('zman-letters');
    if (marks && !marks.childElementCount) {
        for (let i = 0; i < 12; i++) {
            // Counterclockwise: hour i sits at -i * 30° from 12 o'clock.
            const a = (-i * 30 - 90) * rad;
            const x1 = Math.cos(a) * 96, y1 = Math.sin(a) * 96;
            const x2 = Math.cos(a) * 88, y2 = Math.sin(a) * 88;
            marks.insertAdjacentHTML('beforeend',
                `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="zman-tick"/>`);
            const lx = Math.cos(a) * 74, ly = Math.sin(a) * 74;
            letters.insertAdjacentHTML('beforeend',
                `<text x="${lx.toFixed(1)}" y="${(ly + 5).toFixed(1)}" text-anchor="middle" class="zman-letter">${HOUR_LETTERS[i]}</text>`);
        }
    }

    // --- Live update ---
    // LCD: smooth requestAnimationFrame (the regaim needle spins ~once per
    // 3.3s chelek). E-INK: no animation at all — a slow interval repaints the
    // readouts every 20s, which suits the medium and the site's look.
    const hand = $('zman-hand'), subCh = $('zman-sub-ch'), subRg = $('zman-sub-rg');
    const isEink = () => document.documentElement.classList.contains('eink-mode');
    let rafId = null, slowTimer = null;

    function render() {
        const now = new Date();
        const t = zmanNow(now);
        if (t) {
            // Counterclockwise everywhere: main hand, chalakim + regaim subdials.
            if (hand) hand.setAttribute('transform', `rotate(${(-t.hourF * 30).toFixed(3)})`);
            if (subCh) subCh.setAttribute('transform', `rotate(${(-(t.chalakim / 1080) * 360).toFixed(2)})`);
            if (subRg) subRg.setAttribute('transform', `rotate(${(-(t.regaim / 76) * 360).toFixed(2)})`);
            $('zman-hour').textContent = `${HOUR_LETTERS[t.hour]}׳ ${t.p.day ? '☀' : moonGlyph(now)}`;
            $('zman-chalakim').textContent = String(Math.floor(t.chalakim)).padStart(4, '0');
            $('zman-regaim').textContent = String(Math.floor(t.regaim)).padStart(2, '0');
            $('zman-daynight').textContent = t.p.day ? '☀' : moonGlyph(now);
            const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            $('zman-sunrise').textContent = fmt(t.p.sun.sunrise);
            $('zman-sunset').textContent = fmt(t.p.sun.sunset);
        } else {
            $('zman-hour').textContent = '— polar —'; // no sunrise/sunset here today
        }
        $('zman-hebdate').textContent = hebrewDate(now);
    }

    function loop() { render(); rafId = requestAnimationFrame(loop); }
    function start() {
        stop();
        render();
        if (isEink()) slowTimer = setInterval(render, 20000);
        else rafId = requestAnimationFrame(loop);
    }
    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (slowTimer !== null) { clearInterval(slowTimer); slowTimer = null; }
    }
    // Re-pick the engine when the user flips e-ink mode while the clock is open.
    document.addEventListener('einkmodechange', () => {
        if (win.style.display === 'flex') start();
    });

    // Open from the tray clock; animate only while the window is visible.
    function openClock() {
        win.classList.remove('init-closed');
        win.style.display = 'flex';
        const z = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--z-window-active')) || 10;
        win.style.zIndex = z + 50;
        start();
    }
    document.getElementById('tray-clock')?.addEventListener('click', openClock);
    win.querySelector('.close-btn')?.addEventListener('click', stop);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else if (win.style.display === 'flex') start();
    });

    // Location: Jerusalem by default; device location only on explicit click.
    $('zman-loc-label').textContent = loc.label;
    $('zman-geo')?.addEventListener('click', () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: '📍 כאן' };
            try { localStorage.setItem(LOC_KEY, JSON.stringify(loc)); } catch (_) { /* ignore */ }
            $('zman-loc-label').textContent = loc.label;
        }, () => { /* declined — stay on default */ });
    });
})();
