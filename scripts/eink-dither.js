// /scripts/eink-dither.js
// True 1-bit ordered (Bayer) dithering for e-ink mode. Replaces the old
// grayscale+contrast crush with a genuine halftone: each raster image is
// redrawn on a canvas, luminance-quantized to pure black/white against a
// repeating threshold grid, and swapped in. Originals are kept so switching back to LCD is
// lossless. Pure vanilla, no dependencies; if anything fails (e.g. a tainted
// canvas), the image is left alone and the CSS filter fallback still applies.
//
// Photos are now dithered at BUILD time (build/images.mjs) and carry the result
// in data-eink-src; for those we just swap the file in (and park the <picture>
// AVIF/WebP sources so they don't win over it). The canvas path below remains
// for any other raster image that has no pre-built variant.

(function () {
    const DITHERED = 'dithered';
    const BAYER8 = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
    const MAX_W = 1400; // cap working size to bound CPU on large photos

    function isRaster(img) {
        const src = img.currentSrc || img.src || '';
        if (!src || src.startsWith('data:image/svg') || /\.svg(\?|#|$)/i.test(src)) return false;
        return true;
    }

    function pictureSources(img) {
        const pic = img.parentElement;
        return pic && pic.tagName === 'PICTURE' ? pic.querySelectorAll('source') : [];
    }

    function usePrebuilt(img) {
        if (!img.dataset.origSrc) img.dataset.origSrc = img.getAttribute('src');
        pictureSources(img).forEach((s) => {
            if (s.hasAttribute('srcset')) { s.dataset.srcset = s.getAttribute('srcset'); s.removeAttribute('srcset'); }
        });
        img.src = img.dataset.einkSrc;
        img.classList.add(DITHERED);
    }

    function ditherImage(img) {
        if (img.classList.contains(DITHERED) || !isRaster(img)) return;
        if (img.dataset.einkSrc) { usePrebuilt(img); return; }
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

            // Ordered (Bayer) dither to 1-bit: the same look as the photos the
            // build pre-dithers (build/images.mjs).
            for (let y = 0, p = 0; y < h; y++) {
                for (let x = 0; x < w; x++, p++) {
                    const i = p * 4;
                    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                    d[i] = d[i + 1] = d[i + 2] = lum > (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) * 4 ? 255 : 0; // alpha untouched
                }
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
        pictureSources(img).forEach((s) => {
            if (s.dataset.srcset) { s.setAttribute('srcset', s.dataset.srcset); delete s.dataset.srcset; }
        });
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
