# build/g2p/cmu2slug.py — CMUdict (ARPAbet) → SLUG, compared with her spellings.
# Usage: python3 build/g2p/cmu2slug.py cmudict.dict words.tsv   (words.tsv from: npm run gt:eval -- --export DIR)
# Step 1 of the P40 plan: a big pronunciation dictionary in her Graflect, for a model to learn from.
import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu2slug_lib import slug, load_cmu
CMU, WORDS = sys.argv[1], sys.argv[2]
cmu = load_cmu(CMU)
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
