// /scripts/zman-clock.js
// A Torah-accurate clock: time as sha'ot zmaniyot — the daylight (sunrise→
// sunset) divided into 12 variable hours, and likewise the night — with the
// Talmudic subdivisions: 1080 chalakim per hour, 76 regaim per chelek, and the
// Onah Ketana (24 per hour = 45 chalakim), a small "minute" for finer reading
// (Rambam, Hilchot Kiddush HaChodesh; a rega ≈ 44ms). The dial runs
// COUNTERCLOCKWISE with Hebrew-letter hour markers, in homage to Konstantin
// Chaykin's Decalogue — Hebrew reads right to left, and so does this clock.
// Solar position uses the standard NOAA/SunCalc equations. Pure vanilla.
//
// All indicators are drawn as SVG (sun, moon phase, hands) so they stay
// monochrome and theme-coloured — never the OS's garish colour emoji.

(function () {
    const win = document.getElementById('zman-clock-window');
    if (!win) return;

    const $ = (id) => document.getElementById(id);
    const LOC_KEY = 'pelmeniboiler-clock-loc';
    // Jerusalem; label is localized in the DOM. tz makes the sun/zmanim times
    // read in the LOCATION's clock, not the viewer's (device location has none —
    // "here" is wherever the device already is, so its own tz is correct).
    const DEFAULT_LOC = { lat: 31.778, lon: 35.235, tz: 'Asia/Jerusalem' };
    const HOUR_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב'];

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

    // Location: Jerusalem by default; device location only on explicit click.
    // The visible place name lives (localized) in the DOM; we read it once.
    const locLabel = $('zman-loc-label');
    const DEFAULT_LABEL = (locLabel && locLabel.textContent.trim()) || 'Jerusalem';
    const hereEl = $('zman-here-label');
    const HERE_LABEL = (hereEl && hereEl.textContent.trim()) || 'My location';

    let loc = { ...DEFAULT_LOC };
    try {
        const stored = JSON.parse(localStorage.getItem(LOC_KEY));
        if (stored && typeof stored.lat === 'number') loc = stored;
    } catch (_) { /* default */ }

    function setLocLabel() {
        if (locLabel) locLabel.textContent = loc.here ? HERE_LABEL : DEFAULT_LABEL;
    }
    setLocLabel();

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

    // Daytime vs nighttime zmanit-hour lengths for a date (exposed for tests /
    // curiosity): in summer the day-hours are longer, in winter the night-hours.
    window.zmanPeriodLengths = (date) => {
        const d = date || new Date();
        const today = sunTimes(d, loc.lat, loc.lon);
        if (!today) return null;
        const next = sunTimes(new Date(d.valueOf() + dayMs), loc.lat, loc.lon);
        return { day: today.sunset - today.sunrise, night: next ? next.sunrise - today.sunset : null };
    };

    // Hebrew weekdays, transliterated per interface language — never "Friday",
    // never "Monday". After sunset the base date is already advanced, so Friday
    // evening correctly reads Shabbat. gt (Graflect) falls back to the Latin
    // transliteration, as its Hebrew-calendar date does.
    const YOM = {
        en: ['Yom Rishon', 'Yom Sheni', 'Yom Shlishi', 'Yom Revii', 'Yom Chamishi', 'Yom Shishi', 'Shabbat'],
        he: ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'],
        ru: ['Йом Ришон', 'Йом Шени', 'Йом Шлиши', 'Йом Ревии', 'Йом Хамиши', 'Йом Шиши', 'Шаббат'],
        de: ['Jom Rischon', 'Jom Scheni', 'Jom Schlischi', 'Jom Rewi’i', 'Jom Chamischi', 'Jom Schischi', 'Schabbat'],
        ja: ['ヨム・リショーン', 'ヨム・シェニー', 'ヨム・シュリシー', 'ヨム・レヴィイー', 'ヨム・ハミシー', 'ヨム・シシー', 'シャバット'],
    };
    const docLang = () => {
        const l = (document.documentElement.lang || 'en').slice(0, 2);
        return YOM[l] ? l : 'en';
    };

    // Intl.DateTimeFormat construction is expensive — the Hebrew calendar
    // especially — so build each formatter once and reuse it. Rebuilding them
    // inside the animation loop is what made the clock crawl on mobile.
    const _fmt = new Map();
    const getFmt = (key, make) => { let f = _fmt.get(key); if (!f) _fmt.set(key, f = make()); return f; };

    // Day-of-week in the LOCATION's timezone (not the viewer's), so the weekday
    // and the sunset-adjusted date agree with the place the clock is set to.
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function weekdayIndex(date) {
        try {
            const f = getFmt(`wd|${loc.tz || ''}`, () => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: loc.tz }));
            return WD.indexOf(f.format(date));
        } catch (_) { return date.getDay(); }
    }
    // Format an absolute instant as HH:MM in the location's clock.
    const fmtTime = (d) => getFmt(`t|${loc.tz || ''}`, () =>
        new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: loc.tz })).format(d);

    /** Hebrew-calendar date string; the Torah day begins at sunset. */
    function hebrewDate(now) {
        const today = sunTimes(now, loc.lat, loc.lon);
        const base = (today && now >= today.sunset) ? new Date(now.valueOf() + dayMs) : now;
        const lang = docLang();
        let datePart;
        try {
            datePart = getFmt(`heb|${lang}|${loc.tz || ''}`, () =>
                new Intl.DateTimeFormat(`${lang}-u-ca-hebrew`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: loc.tz })).format(base);
        } catch (_) { datePart = base.toDateString(); }
        return `${YOM[lang][weekdayIndex(base)]}, ${datePart}`;
    }
    // The tray clock (start-menu.js) prefers this over its midnight-flipping default.
    window.zmanHebrewDate = (now) => hebrewDate(now || new Date());

    // Moon phase (synodic month 29.53059d from the 2000-01-06 18:14 UTC new moon)
    // as a fraction: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter.
    const SYNODIC = 29.530588853 * dayMs;
    const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
    const moonPhase = (now) => ((((now - NEW_MOON_EPOCH) % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;

    // The lit portion of the disc as an SVG path: outer limb on the lit side +
    // the terminator (a semi-ellipse whose x-radius shrinks to 0 at the quarters
    // and grows to R at new/full). Waxing lights the right; waning the left.
    function moonPath(phase, R) {
        const waxing = phase < 0.5;
        const cos = Math.cos(phase * 2 * Math.PI); // +1 at new, -1 at full
        const rx = (Math.abs(cos) * R).toFixed(2);
        const outer = waxing ? 1 : 0;                  // which limb is lit
        const term = (waxing === (cos > 0)) ? 0 : 1;   // crescent vs gibbous bulge
        return `M 0 ${-R} A ${R} ${R} 0 0 ${outer} 0 ${R} A ${rx} ${R} 0 0 ${term} 0 ${-R} Z`;
    }

    // Day: an SVG sun (disc + 8 rays). Night: the moon at its actual phase.
    function daynightSVG(now, day) {
        if (day) {
            let rays = '';
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                rays += `<line x1="${(Math.cos(a) * 8).toFixed(1)}" y1="${(Math.sin(a) * 8).toFixed(1)}" x2="${(Math.cos(a) * 11).toFixed(1)}" y2="${(Math.sin(a) * 11).toFixed(1)}"/>`;
            }
            return `<g class="dn-sun"><circle r="5.5"/>${rays}</g>`;
        }
        return `<circle r="8" class="dn-moon-disc"/><path class="dn-moon-lit" d="${moonPath(moonPhase(now), 8)}"/>`;
    }

    // --- The named zmanim (GRA scheme: proportions of netz→shkia) --------------
    // Every one derives purely from sunrise, sunset and the sha'ah zmanit, so
    // they're unambiguous under the scheme this clock already uses. Alot/tzet are
    // deliberately omitted — they depend on a chosen shittah (degrees/minutes).
    // Shown in SHA'OT ZMANIYOT — the dial's own unit — not civil clock time
    // (that would be a sha'ah shava, the very thing this clock isn't about). Each
    // GRA zman is a fixed count of zmanit hours into the day, so it reads straight
    // off the same scale as the hand — and the six between netz and shkia are
    // dotted on the dial itself. netz(0)/shkia(12) sit at the dial's top seam.
    const ZMAN_KEYS = [
        ['netz', 0, '0'], ['shema', 3, '3'], ['tefila', 4, '4'], ['chatzot', 6, '6'],
        ['mgedola', 6.5, '6½'], ['mketana', 9.5, '9½'], ['plag', 10.75, '10¾'], ['shkia', 12, '12'],
    ];
    const ZMAN_LABELS = {
        he: { netz: 'הנץ', shema: 'סוף ק״ש', tefila: 'סוף תפילה', chatzot: 'חצות', mgedola: 'מנחה גדולה', mketana: 'מנחה קטנה', plag: 'פלג המנחה', shkia: 'שקיעה' },
        tl: { netz: 'Netz', shema: 'Sof Shema', tefila: 'Sof Tefila', chatzot: 'Chatzot', mgedola: 'Mincha Gedola', mketana: 'Mincha Ketana', plag: 'Plag HaMincha', shkia: 'Shkia' },
    };
    const zmanLabel = (key) => (docLang() === 'he' ? ZMAN_LABELS.he : ZMAN_LABELS.tl)[key];
    const zmaniyotTitle = () => (docLang() === 'he' ? 'שעות זמניות' : "Sha'ot Zmaniyot");
    function zmanimFor(sun) {
        const shz = (sun.sunset - sun.sunrise) / 12;
        return ZMAN_KEYS.map(([key, h, disp]) => ({ key, disp, t: new Date(sun.sunrise.valueOf() + h * shz) }));
    }

    // --- The molad (mean lunar conjunction, Rambam Kiddush HaChodesh) ----------
    // One synodic month = 765433 chalakim (29d 12h 793ch); a chelek = 1/1080 hr.
    // Anchored on the (validated) molad of Tishrei 5785 — Thursday 9h 391ch — and
    // stepped by whole months. Day-of-week + hours-from-6pm + chalakim are exact
    // integer arithmetic (the form announced in shul); the absolute instant is
    // used only to name the month and place it on the civil calendar.
    const CHELEK_MS = 3600000 / 1080, MOLAD_MONTH_CH = 765433, MOLAD_MONTH_MS = MOLAD_MONTH_CH * CHELEK_MS;
    const MOLAD_ANCHOR_CH = 54758342911, MOLAD_ANCHOR_MS = Date.UTC(2024, 9, 3, 0, 21, 0);
    function nextMolad(now) {
        const k = Math.ceil((now.valueOf() - MOLAD_ANCHOR_MS) / MOLAD_MONTH_MS);
        const total = MOLAD_ANCHOR_CH + k * MOLAD_MONTH_CH;
        const within = total % 25920; // chalakim into the (6pm-based) day
        return {
            dow: Math.floor(total / 25920) % 7,
            hours: Math.floor(within / 1080),   // from 6pm
            chalakim: within % 1080,
            abs: new Date(MOLAD_ANCHOR_MS + k * MOLAD_MONTH_MS),
        };
    }

    /** Zmanit time snapshot; also feeds the tray via window.zmanTime. */
    function zmanNow(now) {
        const p = currentPeriod(now);
        if (!p) return null;
        const frac = (now - p.start) / (p.end - p.start);
        const hourF = Math.min(11.9999, frac * 12);
        const hour = Math.floor(hourF);
        const chalakim = (hourF - hour) * 1080;     // 0..1080 into the current hour
        return { p, hourF, hour, chalakim, regaim: (chalakim % 1) * 76 };
    }
    window.zmanTime = (now) => {
        const t = zmanNow(now || new Date());
        if (!t) return '';
        return `${HOUR_LETTERS[t.hour]}׳ ${String(Math.floor(t.chalakim)).padStart(4, '0')}ח`;
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
    // Chalakim subdial ticks: 12 marks of 90 chalakim (1080 ÷ 12), echoing the
    // 12 sha'ot — the coarse hand's scale for reading the chelek count.
    const chTicks = $('zman-ch-ticks');
    if (chTicks && !chTicks.childElementCount) {
        for (let i = 0; i < 12; i++) {
            const a = (-i * 30 - 90) * rad;
            const r2 = (i % 6 === 0) ? 13 : 16; // longer marks at 0 and the halfway (540)
            chTicks.insertAdjacentHTML('beforeend',
                `<line x1="${(Math.cos(a) * 19).toFixed(1)}" y1="${(Math.sin(a) * 19).toFixed(1)}" x2="${(Math.cos(a) * r2).toFixed(1)}" y2="${(Math.sin(a) * r2).toFixed(1)}" class="zman-subtick"/>`);
        }
    }
    // Dots at the daytime zmanim positions (the six between netz and shkia), on
    // the same scale as the hand: a zman at h zmanit hours sits where the hand
    // points at hour h. Chatzot (midday) gets a slightly larger dot.
    const zMarks = $('zman-zmarks');
    if (zMarks && !zMarks.childElementCount) {
        for (const [key, h] of ZMAN_KEYS) {
            if (h <= 0 || h >= 12) continue; // netz/shkia share the dial's top seam
            const a = (-h * 30 - 90) * rad;
            zMarks.insertAdjacentHTML('beforeend',
                `<circle cx="${(Math.cos(a) * 83).toFixed(1)}" cy="${(Math.sin(a) * 83).toFixed(1)}" r="${key === 'chatzot' ? 3 : 2.1}" class="zman-zmark"/>`);
        }
    }

    // --- Live update ---
    // LCD: smooth requestAnimationFrame. E-INK: no animation at all — a slow
    // interval repaints the readouts every 20s, which suits the medium.
    const hand = $('zman-hand');
    const chCoarse = $('zman-sub-ch-coarse'), chFine = $('zman-sub-ch-fine');
    const subRg = $('zman-sub-rg'), dn = $('zman-daynight');
    const zmanList = $('zman-list'), moladEl = $('zman-molad');
    const isEink = () => document.documentElement.classList.contains('eink-mode');
    // Respect the OS "reduce motion" setting: like e-ink, drop the smooth needle
    // and just repaint slowly — no continuous animation.
    const reduceMotionMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const still = () => isEink() || (reduceMotionMq && reduceMotionMq.matches);
    let rafId = null, slowTimer = null;

    let lastSlow = 0;
    function render() {
        const now = new Date();
        const t = zmanNow(now);
        // --- Per frame: only the moving needles + the fast numeric readouts.
        // These are cheap (trig + a couple of setAttribute/textContent).
        if (t) {
            if (hand) hand.setAttribute('transform', `rotate(${(-t.hourF * 30).toFixed(3)})`);
            // Chalakim read like hours+minutes: the coarse hand counts 90-chalakim
            // blocks (one turn per hour, 12 ticks — echoing the 12 sha'ot); the fine
            // hand runs 0–90 within the block. Coarse block + fine = the exact chelek.
            if (chCoarse) chCoarse.setAttribute('transform', `rotate(${(-(t.chalakim / 1080) * 360).toFixed(2)})`);
            if (chFine) chFine.setAttribute('transform', `rotate(${(-((t.chalakim % 90) / 90) * 360).toFixed(2)})`);
            // Regaim subdial: one full turn per chelek.
            if (subRg) subRg.setAttribute('transform', `rotate(${(-(t.regaim / 76) * 360).toFixed(2)})`);
            $('zman-chalakim').textContent = String(Math.floor(t.chalakim)).padStart(4, '0');
            $('zman-regaim').textContent = String(Math.floor(t.regaim)).padStart(2, '0');
        }
        // --- Throttled (~1/s): everything slow-changing or Intl-heavy (the Hebrew
        // date, sun times, zmanim, molad, sun/moon). Decoupled from the 60fps
        // needle so mobile isn't rebuilding calendar formatters every frame.
        if (now - lastSlow < 950) return;
        lastSlow = +now;
        if (t) {
            const dnKey = t.p.day ? 'sun' : 'moon' + Math.round(moonPhase(now) * 48);
            if (dn && dn.dataset.dn !== dnKey) { dn.innerHTML = daynightSVG(now, t.p.day); dn.dataset.dn = dnKey; }
            if (zMarks) zMarks.style.display = t.p.day ? '' : 'none'; // day zmanim only
            $('zman-hour').textContent = `${HOUR_LETTERS[t.hour]}׳`;
            $('zman-sunrise').textContent = fmtTime(t.p.sun.sunrise);
            $('zman-sunset').textContent = fmtTime(t.p.sun.sunset);
            renderZmanim(now, t.p.sun);
        } else {
            $('zman-hour').textContent = '— polar —'; // no sunrise/sunset here today
        }
        renderMolad(now);
        $('zman-hebdate').textContent = hebrewDate(now);
    }

    // The named zmanim list — rebuilt only when the day or the "next" one changes.
    const zTitle = $('zman-z-title');
    function renderZmanim(now, sun) {
        if (!zmanList) return;
        const zs = zmanimFor(sun);
        const nextIdx = zs.findIndex((z) => z.t > now);
        const sig = `${sun.sunrise.valueOf()}|${nextIdx}|${docLang()}`;
        if (zmanList.dataset.sig === sig) return;
        if (zTitle) zTitle.textContent = zmaniyotTitle();
        zmanList.innerHTML = zs.map((z, i) =>
            `<li${i === nextIdx ? ' class="zman-next"' : ''}><span>${zmanLabel(z.key)}</span><b>${z.disp}</b></li>`).join('');
        zmanList.dataset.sig = sig;
    }

    // The upcoming molad — rebuilt monthly.
    function renderMolad(now) {
        if (!moladEl) return;
        const m = nextMolad(now);
        const lang = docLang();
        const sig = `${m.abs.valueOf()}|${lang}|${loc.tz || ''}`;
        if (moladEl.dataset.sig === sig) return;
        let month = '';
        try { month = getFmt(`mo|${lang}|${loc.tz || ''}`, () => new Intl.DateTimeFormat(`${lang}-u-ca-hebrew`, { month: 'long', timeZone: loc.tz })).format(new Date(m.abs.valueOf() + dayMs)); } catch (_) { /* skip */ }
        const civil = `${String((m.hours + 18) % 24).padStart(2, '0')}:${String(Math.floor(m.chalakim / 18)).padStart(2, '0')}`;
        const word = lang === 'he' ? 'מולד' : 'Molad';
        const tip = lang === 'he'
            ? 'מולד הלבנה — רגע החידוש הממוצע, מוכרז לפני ראש חודש'
            : 'Molad — the mean "birth" of the new moon, announced before Rosh Chodesh';
        moladEl.innerHTML = `<span title="${tip}">${word} ${month}</span><b>${YOM[lang][m.dow]} ${civil}</b><span class="zman-molad-parts">${m.hours}ש ${m.chalakim}ח</span>`;
        moladEl.dataset.sig = sig;
    }

    function loop() { render(); rafId = requestAnimationFrame(loop); }
    function start() {
        stop();
        render();
        if (still()) slowTimer = setInterval(render, 20000);
        else rafId = requestAnimationFrame(loop);
    }
    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (slowTimer !== null) { clearInterval(slowTimer); slowTimer = null; }
    }
    // Re-pick the engine when e-ink or reduce-motion changes while the clock is open.
    const repick = () => { if (win.style.display === 'flex') start(); };
    document.addEventListener('einkmodechange', repick);
    if (reduceMotionMq) reduceMotionMq.addEventListener('change', repick);

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

    // Tap the location button (pin + name) to use this device's position.
    $('zman-geo')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, here: true };
            try { localStorage.setItem(LOC_KEY, JSON.stringify(loc)); } catch (_) { /* ignore */ }
            setLocLabel();
            render();
        }, () => { /* declined — stay on default */ });
    });
})();
