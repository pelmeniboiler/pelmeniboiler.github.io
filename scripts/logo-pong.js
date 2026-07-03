// /scripts/logo-pong.js
// Easter egg: triple-click the ShZh in the tray and the logo.canvas window is
// launched loose — it caroms off the screen edges and every other open window,
// pong/breakout style. Respects reduce-motion and e-ink (both skip the physics).
// Pure vanilla; no dependency.

(function () {
    const prefersStill = () =>
        document.documentElement.classList.contains('eink-mode') ||
        (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    const logoWindow = () => document.getElementById('logo-img')?.closest('.window');

    let raf = null;
    function launch() {
        const el = logoWindow();
        if (!el || raf !== null) return; // already bouncing (or no logo window)

        // Make sure it's open and switch to absolute pixel positioning.
        el.classList.remove('init-closed');
        el.style.display = 'flex';
        const r = el.getBoundingClientRect();
        let x = r.left, y = r.top;
        Object.assign(el.style, { position: 'fixed', left: `${x}px`, top: `${y}px`,
            transform: 'none', margin: '0', transition: 'none', zIndex: 9999 });

        const speed = 4.2;
        let vx = (Math.random() < 0.5 ? -1 : 1) * speed;
        let vy = (Math.random() < 0.5 ? -1 : 1) * speed;
        const bricks = () => [...document.querySelectorAll('.window')]
            .filter((w) => w !== el && getComputedStyle(w).display !== 'none');

        function step() {
            if (getComputedStyle(el).display === 'none') { raf = null; return; } // closed → stop
            const w = el.offsetWidth, h = el.offsetHeight;
            x += vx; y += vy;
            if (x <= 0) { x = 0; vx = Math.abs(vx); }
            else if (x + w >= innerWidth) { x = innerWidth - w; vx = -Math.abs(vx); }
            if (y <= 0) { y = 0; vy = Math.abs(vy); }
            else if (y + h >= innerHeight) { y = innerHeight - h; vy = -Math.abs(vy); }

            const me = { l: x, t: y, r: x + w, b: y + h };
            for (const o of bricks()) {
                const b = o.getBoundingClientRect();
                if (me.r <= b.left || me.l >= b.right || me.b <= b.top || me.t >= b.bottom) continue;
                // Resolve along the axis of least penetration and reverse it.
                const ox = Math.min(me.r - b.left, b.right - me.l);
                const oy = Math.min(me.b - b.top, b.bottom - me.t);
                if (ox < oy) { vx = -vx; x += (me.r - b.left < b.right - me.l ? -ox : ox); }
                else { vy = -vy; y += (me.b - b.top < b.bottom - me.t ? -oy : oy); }
            }
            el.style.left = `${x}px`; el.style.top = `${y}px`;
            raf = requestAnimationFrame(step);
        }
        raf = requestAnimationFrame(step);
    }

    // Triple-click detection on the tray ShZh. It's an <a href="/">, so we take
    // over its clicks: 1–2 clicks still go home (after a short delay), 3 launches.
    let clicks = 0, timer = null;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#tray-logo')) return;
        e.preventDefault();
        clicks += 1;
        clearTimeout(timer);
        if (clicks >= 3) { clicks = 0; if (!prefersStill()) launch(); return; }
        timer = setTimeout(() => { const n = clicks; clicks = 0; if (n < 3) location.href = '/'; }, 380);
    });
})();
