# build/g2p/cmu2slug_lib.py — ARPAbet → SLUG with her rules (shared by cmu2slug.py and the predictors).
C = dict(B='b', CH='c', D='d', DH='dh', F='f', G='g', HH='h', JH='j', K='k', L='l', M='m', N='n', NG='ng', P='p', R='r', S='s', SH='š', T='t', TH='th', V='v', W='w', Y='y', Z='z', ZH='ž')
V = dict(AA='á', AE='æ', AH='x', AO='á', AW='ow', AY='ai', EH='e', ER='r', EY='ē', IH='i', IY='ī', OW='ō', OY='õī', UH='u', UW='ü')

def slug(phones):
    out, ph = [], [p.rstrip('012') for p in phones]
    stress = [p[-1] if p[-1] in '012' else '' for p in phones]
    i = 0
    while i < len(ph):
        p, nxt = ph[i], (ph[i + 1] if i + 1 < len(ph) else '')
        if p == 'T' and nxt == 'R': out.append('c'); i += 1; continue          # trip → crip (t before r is c)
        if p == 'EH' and nxt == 'R' and (i + 2 == len(ph) or ph[i + 2] not in V_SET): out.append('4'); i += 2; continue  # where → w4, pair → p4 (the air sound carries the r); very stays verī
        if p == 'NG' and nxt == 'G': out.append('ng'); i += 2; continue        # english → ingliš
        if p == 'Y' and nxt == 'UW': out.append('yü'); i += 2; continue
        if p == 'AE' and nxt in ('N', 'M'): out.append('ä'); i += 1; continue   # man → män
        if p in ('AO', 'AA') and nxt == 'R': out.append('ō' if p == 'AO' else 'á'); i += 1; continue
        if p == 'AH' and stress[i] == '0' and nxt == 'L' and i + 2 == len(ph) and i > 0 and ph[i - 1] == 'B': i += 1; continue  # table → tēbl, but people → pīpxl
        out.append(C.get(p) or V.get(p, '?')); i += 1
    return ''.join(out)

V_SET = set(V)

def load_cmu(path):
    """First pronunciation of each word: {word: [phones]}."""
    cmu = {}
    for line in open(path, encoding='utf-8'):
        w, *ph = line.split('#')[0].split()
        if '(' not in w: cmu.setdefault(w.lower(), ph)
    return cmu

