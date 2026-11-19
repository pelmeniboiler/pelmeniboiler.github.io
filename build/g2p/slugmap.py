# build/g2p/slugmap.py — SLUG ↔ Graflect glyphs, the same rules as build/gt-eval.mjs and tools/gt.html:
#   longest match first; "·" marks a boundary where two glyphs would otherwise read as one
#   (r·r is two r glyphs, rr the trilled r); "yu" is typed for yü; the space glyph is ␣;
#   ‹Latin› stays Latin; tags, entities and digits standing alone pass through.
import os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
_src = open(os.path.join(ROOT, 'scripts/blog/demos/graflect-data.js'), encoding='utf-8').read()
SLUG = dict(re.findall(r"'(.)'\s*:\s*'([^']*)'", _src[_src.index('slugMap'):]))
_g = {v: g for g, v in SLUG.items()}
KEYS = sorted([(v, g) for g, v in SLUG.items() if v.strip()] + [('yu', _g['yü']), ('␣', _g[' '])], key=lambda x: -len(x[0]))

def is_glyph(c): return c in SLUG

def to_glyph(s):
    out, i = '', 0
    while i < len(s):
        m = re.match(r'‹[^›]*›|<[^>]+>|&#?\w+;', s[i:])
        if m: t = m.group(0); out += t[1:-1] if t.startswith('‹') else t; i += len(t); continue
        if s[i] == '·': i += 1; continue
        if s[i].isdigit() and not (i and (s[i - 1].isalpha() or s[i - 1] == '·')) and not (i + 1 < len(s) and (s[i + 1].isalpha() or s[i + 1] == '·')): out += s[i]; i += 1; continue
        k = next(((v, g) for v, g in KEYS if s.startswith(v, i)), None)
        if k and not s[i].isspace(): out += k[1]; i += len(k[0])
        else: out += s[i]; i += 1
    return out

def join(units):
    """Join SLUG units, marking a boundary wherever two would read back as one glyph."""
    out, prev = '', None
    for u in units:
        if prev and to_glyph(prev + u) != to_glyph(prev + '·' + u): out += '·'
        out += u; prev = u
    return out

def to_slug(g):
    out, prev, latin = '', None, ''
    for c in re.findall(r'<[^>]+>|&#?\w+;|.', g, re.S):
        if len(c) > 1:
            if latin: out += f'‹{latin}›'; latin = ''
            out += c; prev = None; continue
        if not is_glyph(c) and c.isalpha(): latin += c; prev = None; continue
        if latin: out += f'‹{latin}›'; latin = ''
        u = '␣' if SLUG.get(c) == ' ' else SLUG.get(c, c)
        if prev and is_glyph(c) and to_glyph(prev[1] + u) != prev[0] + c: out += '·'
        out += u; prev = (c, u) if is_glyph(c) else None
    if latin: out += f'‹{latin}›'
    return out
