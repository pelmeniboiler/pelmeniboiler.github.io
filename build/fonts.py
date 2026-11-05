#!/usr/bin/env python3
"""build/fonts.py — regenerate the WOFF2 web fonts from the TTF sources.

    npm run fonts        (needs: pip install fonttools brotli)

WOFF2 is the same font, losslessly Brotli-compressed — typically 40–60 % of
the TTF. The stylesheet lists the .woff2 first and the .ttf as a fallback, so
very old browsers still work.

Twemoji is special: the upstream file carries two copies of every glyph — a
black-and-white outline set (`glyf`) and a full-colour SVG set (`SVG `).
Chrome can't read the SVG set and draws the outlines; Firefox and Safari CAN,
and drew colour emoji even in e-ink mode. We drop the SVG table so every
browser gets the monochrome outlines (and the file shrinks ~15 MB → ~2.5 MB).
The colour TTF is no longer kept in the repo; re-download it from
https://github.com/13rac1/twemoji-color-font if you ever need to rebuild.
"""
from pathlib import Path
import sys

try:
    from fontTools.ttLib import TTFont
    import brotli  # noqa: F401  (fontTools needs it for woff2)
except ImportError:
    sys.exit("fonts.py needs: pip install fonttools brotli")

FONTS = Path(__file__).resolve().parent.parent / "styles" / "fonts"

# Every face declared in styles/pelmeni2025.css.
SOURCES = [
    "FairfaxHD.ttf",
    "Selyodka_Proportional.ttf",
    "Symbola-ModifiedNoRI.ttf",
    "EBGaramond.ttf",
    "FrankRuhl.ttf",
    "NotoEmoji-Regular-NoRI.ttf",
    "AndroidEmojiNoRI.ttf",
]
TWEMOJI_COLOUR = "TwitterColorEmoji-SVGinOT.ttf"

# Gap fillers, appended to the end of --font-emoji. Each is subset to ONLY the
# codepoints nothing earlier in the stack draws, so glyphs the site already
# shows keep their look and the files stay small. All are SIL OFL 1.1
# (styles/fonts/OFL-Noto.txt, OFL-Unifont.txt), which allows subsetting.
# Sources are downloaded on demand into styles/fonts/_sources/ (gitignored);
# only the subsets are committed.
EMOJI_STACK = ["Symbola-ModifiedNoRI.ttf", "NotoEmoji-Regular-NoRI.ttf", "AndroidEmojiNoRI.ttf", "TwitterBWEmoji.woff2"]
SYMBOL_RANGES = [(0x2000, 0x2BFF), (0x1F000, 0x1FBFF)]
NOTO = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts"
UNIFONT = "https://unifoundry.com/pub/unifont/unifont-17.0.05/font-builds"
GAP_FILLERS = [
    # source file, download URL, output
    ("NotoSansSymbols2-Regular.ttf", f"{NOTO}/NotoSansSymbols2/unhinted/ttf/NotoSansSymbols2-Regular.ttf", "NotoSansSymbols2-Gaps.woff2"),
    ("NotoSansMath-Regular.ttf", f"{NOTO}/NotoSansMath/unhinted/ttf/NotoSansMath-Regular.ttf", "NotoSansMath-Gaps.woff2"),
    # GNU Unifont: the only monochrome font with Unicode 16's new symbols so far.
    ("unifont-17.0.05.otf", f"{UNIFONT}/unifont-17.0.05.otf", "Unifont-Gaps.woff2"),
    ("unifont_upper-17.0.05.otf", f"{UNIFONT}/unifont_upper-17.0.05.otf", "UnifontUpper-Gaps.woff2"),
]
TWEMOJI_BW = "TwitterBWEmoji.woff2"


def to_woff2(font: TTFont, out: Path) -> None:
    font.flavor = "woff2"
    font.save(out)
    print(f"  {out.name:34} {out.stat().st_size / 1e6:6.2f} MB")


def main() -> None:
    print("Writing WOFF2 fonts:")
    for name in SOURCES:
        to_woff2(TTFont(FONTS / name), FONTS / (Path(name).stem + ".woff2"))

    colour = FONTS / TWEMOJI_COLOUR
    if colour.exists():
        font = TTFont(colour)
        if "SVG " in font:
            del font["SVG "]  # keep only the monochrome outlines
        to_woff2(font, FONTS / TWEMOJI_BW)
    elif not (FONTS / TWEMOJI_BW).exists():
        sys.exit(f"Missing both {TWEMOJI_COLOUR} and {TWEMOJI_BW}")

    from fontTools import subset
    import urllib.request
    sources = FONTS / "_sources"
    sources.mkdir(exist_ok=True)
    covered = set()
    for name in EMOJI_STACK:
        covered |= set(TTFont(FONTS / name).getBestCmap())
    for src, url, out in GAP_FILLERS:
        path = sources / src
        if not path.exists():
            print(f"  downloading {src} ...")
            urllib.request.urlretrieve(url, path)
        cmap = TTFont(path).getBestCmap()
        want = sorted(cp for cp in cmap if cp not in covered and any(a <= cp <= b for a, b in SYMBOL_RANGES))
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]  # keep the copyright/licence records
        font = TTFont(path)
        sub = subset.Subsetter(options=opts)
        sub.populate(unicodes=want)
        sub.subset(font)
        font.flavor = "woff2"
        font.save(FONTS / out)
        covered |= set(want)
        print(f"  {out:34} {(FONTS / out).stat().st_size / 1e3:6.1f} KB  ({len(want)} gap glyphs)")

if __name__ == "__main__":
    main()
