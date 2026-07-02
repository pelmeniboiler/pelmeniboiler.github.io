// /scripts/eink-dither.js
// True 1-bit Floyd–Steinberg dithering for e-ink mode. Replaces the old
// grayscale+contrast crush with a genuine halftone: each raster image is
// redrawn on a canvas, luminance-quantized to pure black/white with error
// diffusion, and swapped in. Originals are kept so switching back to LCD is
// lossless. Pure vanilla, no dependencies; if anything fails (e.g. a tainted
// canvas), the image is left alone and the CSS filter fallback still applies.

(function () {
    const DITHERED = 'dithered';
    const MAX_W = 1400; // cap working size to bound CPU on large photos

    function isRaster(img) {
        const src = img.currentSrc || img.src || '';
        if (!src || src.startsWith('data:image/svg') || /\.svg(\?|#|$)/i.test(src)) return false;
        return true;
    }

    function ditherImage(img) {
        if (img.classList.contains(DITHERED) || !isRaster(img)) return;
        if (!img.complete || !img.naturalWidth) {
            img.addEventListener('load', () => scheduleRun(), { once: true });
            return;
        }
        try {
            const scale = Math.min(1, MAX_W / img.naturalWidth);
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const d = imageData.data;

            // Luminance buffer, then Floyd–Steinberg error diffusion to 1-bit.
            const lum = new Float32Array(w * h);
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            }
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const p = y * w + x;
                    const old = lum[p];
                    const val = old < 128 ? 0 : 255;
                    const err = old - val;
                    lum[p] = val;
                    if (x + 1 < w) lum[p + 1] += err * 7 / 16;
                    if (y + 1 < h) {
                        if (x > 0) lum[p + w - 1] += err * 3 / 16;
                        lum[p + w] += err * 5 / 16;
                        if (x + 1 < w) lum[p + w + 1] += err * 1 / 16;
                    }
                }
            }
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                d[i] = d[i + 1] = d[i + 2] = lum[p]; // alpha untouched
            }
            ctx.putImageData(imageData, 0, 0);

            if (!img.dataset.origSrc) img.dataset.origSrc = img.src;
            img.src = canvas.toDataURL('image/png');
            img.classList.add(DITHERED);
        } catch (e) {
            // Tainted canvas or decode issue: leave the image to the CSS fallback.
            console.warn('eink-dither: skipped an image', e);
        }
    }

    function restoreImage(img) {
        if (img.dataset.origSrc) {
            img.src = img.dataset.origSrc;
            delete img.dataset.origSrc;
        }
        img.classList.remove(DITHERED);
    }

    function run() {
        const isEink = document.documentElement.classList.contains('eink-mode');
        document.querySelectorAll('img').forEach((img) => {
            if (isEink) ditherImage(img); else restoreImage(img);
        });
    }

    let queued = false;
    function scheduleRun() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; run(); });
    }

    document.addEventListener('modulesLoaded', scheduleRun);
    document.addEventListener('einkmodechange', scheduleRun);
    window.addEventListener('load', scheduleRun);
})();
