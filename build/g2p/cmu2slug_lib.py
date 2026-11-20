# build/g2p/cmu2slug_lib.py — ARPAbet → SLUG with her rules (shared by cmu2slug.py and the predictors).
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slugmap import join
C = dict(B='b', CH='c', D='d', DH='dh', F='f', G='g', HH='h', JH='j', K='k', L='l', M='m', N='n', NG='ng', P='p', R='r', S='s', SH='š', T='t', TH='th', V='v', W='w', Y='y', Z='z', ZH='ž')
V = dict(AA='á', AE='æ', AH='x', AO='á', AW='ow', AY='ai', EH='e', ER='r', EY='ē', IH='i', IY='ī', OW='ō', OY='õī', UH='u', UW='ü')

def slug(phones):
    out, ph = [], [p.rstrip('012') for p in phones]
    stress = [p[-1] if p[-1] in '012' else '' for p in phones]
    i = 0
    while i < len(ph):
        p, nxt = ph[i], (ph[i + 1] if i + 1 < len(ph) else '')
        if i == 0 and p == 'ER' and stress[0] == '0' and nxt in V_SET: out += ['x', 'r']; i += 1; continue   # arranged → xrēnjd, originally → xrijinxlī
        if p == 'T' and nxt == 'R': out.append('c'); i += 1; continue          # trip → crip (t before r is c)
        if p == 'D' and nxt == 'R': out.append('j'); i += 1; continue          # dream → jrīm (d before r is j, and the r stays)
        if p == 'AE' and nxt in ('N', 'M'): out.append('ä'); i += 1; continue   # can, man, hand, translate, random → ä
        if p == 'IH' and nxt == 'NG': out.append('ī'); i += 1; continue          # -ing → īngg, think → thīngk, English → īngliš
        if p == 'IH' and stress[i] in '12' and nxt == 'R' and (i + 2 == len(ph) or ph[i + 2] not in V_SET): out.append('ī'); i += 1; continue  # CMUdict's "ear" is IH R: sphere → sfīr, year → yīr, clear → klīr
        if p == 'EH' and nxt == 'R' and (i + 2 == len(ph) or ph[i + 2] not in V_SET): out.append('4'); i += 2; continue  # where → w4, pair → p4 (the air sound carries the r); very stays verī
        if p == 'NG' and nxt == 'G': out.append('ng'); i += 2; continue        # English → īngliš (no strong g)
        if p == 'NG' and i and ph[i - 1] == 'IH' and (nxt == '' or (nxt == 'Z' and i + 2 == len(ph))): out += ['ng', 'g']; i += 1; continue  # -ing → īngg, thing → thīngg (ng then g)
        if p == 'Y' and nxt == 'UW': out.append('yü'); i += 2; continue
        if p in ('AO', 'AA') and nxt == 'R': out.append('ō' if p == 'AO' else 'á'); i += 1; continue
        if p == 'AH' and stress[i] == '0' and nxt in ('D', 'Z', 'N', 'T', 'S') and (i + 2 == len(ph) or (nxt == 'N' and i + 3 == len(ph) and ph[i + 2] == 'Z')): out.append('i'); i += 1; continue  # unstressed before a final d z n t s: aided → ēdid, services → srvisiz, garden → gárdin, edit → edit
        if p == 'AH' and stress[i] == '0' and nxt == 'L' and i + 2 == len(ph) and i > 0 and ph[i - 1] == 'B': i += 1; continue  # table → tēbl, but people → pīpxl
        out.append(C.get(p) or V.get(p, '?')); i += 1
    for j in range(len(out) - 1):                  # w then ī is the wī glyph (we, wheel, week, weird), r then ä the rä glyph (translate, program)
        if (out[j], out[j + 1]) in (('w', 'ī'), ('r', 'ä')): out[j:j + 2] = [out[j] + out[j + 1], '']
    return join([u for u in out if u])   # n·g, r·r…: separate glyphs where two would read as one

V_SET = set(V)

def load_cmu(path):
    """One pronunciation per word: {word: [phones]}. Where CMUdict lists several, the one with the most
    unstressed IH (services: S ER1 V IH0 S IH0 Z, not ...V AH0 S AH0 Z), as she says them; else the first."""
    alls = {}
    for line in open(path, encoding='utf-8'):
        w, *ph = line.split('#')[0].split()
        if ph: alls.setdefault(re.sub(r'\(\d+\)$', '', w).lower(), []).append(ph)
    # Only among pronunciations as long as the first, so a weak form (him: IH0 M) never wins.
    return {w: max((p for p in ps if len(p) == len(ps[0])), key=lambda ph: ph.count('IH0')) for w, ps in alls.items()}

