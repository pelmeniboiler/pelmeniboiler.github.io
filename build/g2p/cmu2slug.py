# build/g2p/cmu2slug.py — CMUdict (ARPAbet) → SLUG, compared with her spellings.
# Usage: python3 build/g2p/cmu2slug.py cmudict.dict words.tsv   (words.tsv from: npm run gt:eval -- --export DIR)
# Step 1 of the P40 plan: a big pronunciation dictionary in her Graflect, for a model to learn from.
import sys, collections
CMU, WORDS = sys.argv[1], sys.argv[2]
C = dict(B='b', CH='c', D='d', DH='dh', F='f', G='g', HH='h', JH='j', K='k', L='l', M='m', N='n', NG='ng', P='p', R='r', S='s', SH='š', T='t', TH='th', V='v', W='w', Y='y', Z='z', ZH='ž')
V = dict(AA='á', AE='æ', AH='x', AO='á', AW='ow', AY='ai', EH='e', ER='r', EY='ē', IH='i', IY='ī', OW='ō', OY='õī', UH='u', UW='ü')

def slug(phones):
    out, ph = [], [p.rstrip('012') for p in phones]
    stress = [p[-1] if p[-1] in '012' else '' for p in phones]
    i = 0
    while i < len(ph):
        p, nxt = ph[i], (ph[i + 1] if i + 1 < len(ph) else '')
        if p == 'T' and nxt == 'R': out.append('c'); i += 2; continue          # trip → cip
        if p == 'Y' and nxt == 'UW': out.append('yü'); i += 2; continue
        if p == 'AE' and nxt in ('N', 'M'): out.append('ä'); i += 1; continue   # man → män
        if p in ('AO', 'AA') and nxt == 'R': out.append('ō' if p == 'AO' else 'á'); i += 1; continue
        if p == 'AH' and stress[i] == '0' and nxt == 'L' and i + 2 == len(ph): i += 1; continue  # people → pīpl
        out.append(C.get(p) or V.get(p, '?')); i += 1
    return ''.join(out)

cmu = {}
for line in open(CMU, encoding='utf-8'):
    w, *ph = line.split('#')[0].split()
    if '(' not in w: cmu.setdefault(w.lower(), ph)
hers = dict(l.rstrip('\n').split('\t') for l in open(WORDS, encoding='utf-8') if '\t' in l)
same = diff = missing = 0
pairs = collections.Counter()
examples = collections.defaultdict(list)
for w, s in hers.items():
    if w not in cmu: missing += 1; continue
    m = slug(cmu[w])
    if m == s: same += 1; continue
    diff += 1
    # Where do they part? Report the first differing stretch as a pattern.
    import difflib
    for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, m, s).get_opcodes():
        if op != 'equal':
            pairs[(m[a1:a2], s[b1:b2])] += 1
            if len(examples[(m[a1:a2], s[b1:b2])]) < 4: examples[(m[a1:a2], s[b1:b2])].append(f'{w} {m}→{s}')
print(f'her words in CMUdict: {same + diff}; converted exactly as she spells: {same} ({100 * same / (same + diff):.0f}%); not in CMUdict: {missing}')
for (a, b), n in pairs.most_common(22):
    print(f'{n:4}  {a or "∅"} → {b or "∅"}   e.g. {", ".join(examples[(a, b)])}')
