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


if __name__ == "__main__":
    main()
