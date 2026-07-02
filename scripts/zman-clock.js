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

    /** Hebrew-calendar date string; the Torah day begins at sunset. */
    function hebrewDate(now) {
        const today = sunTimes(now, loc.lat, loc.lon);
        const base = (today && now >= today.sunset) ? new Date(now.valueOf() + dayMs) : now;
        const lang = (document.documentElement.lang === 'he') ? 'he' : 'en';
        try {
            return new Intl.DateTimeFormat(`${lang}-u-ca-hebrew`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(base);
        } catch (_) { return base.toDateString(); }
    }
    // The tray clock (start-menu.js) prefers this over its midnight-flipping default.
    window.zmanHebrewDate = (now) => hebrewDate(now || new Date());

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
    const hand = $('zman-hand');
    let rafId = null;
    function tick() {
        const now = new Date();
        const p = currentPeriod(now);
        if (p) {
            const frac = (now - p.start) / (p.end - p.start);     // 0..1 through the period
            const hourF = frac * 12;                              // zmaniyot hours elapsed
            const hour = Math.min(11, Math.floor(hourF));
            const inHour = hourF - hour;
            const chalakim = inHour * 1080;
            const regaim = (chalakim % 1) * 76;

            // Counterclockwise sweep: negative rotation.
            if (hand) hand.setAttribute('transform', `rotate(${(-hourF * 30).toFixed(3)})`);
            $('zman-hour').textContent = `${HOUR_LETTERS[hour]}׳ ${p.day ? '☀' : '🌙'}`;
            $('zman-chalakim').textContent = String(Math.floor(chalakim)).padStart(4, '0');
            $('zman-regaim').textContent = String(Math.floor(regaim)).padStart(2, '0');
            $('zman-daynight').textContent = p.day ? '☀' : '🌙';
            const t = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            $('zman-sunrise').textContent = t(p.sun.sunrise);
            $('zman-sunset').textContent = t(p.sun.sunset);
            win.classList.toggle('zman-night', !p.day);
        } else {
            $('zman-hour').textContent = '— polar —'; // no sunrise/sunset here today
        }
        $('zman-hebdate').textContent = hebrewDate(now);
        rafId = requestAnimationFrame(tick);
    }
    function running() { return rafId !== null; }
    function start() { if (!running()) tick(); }
    function stop() { if (running()) { cancelAnimationFrame(rafId); rafId = null; } }

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
