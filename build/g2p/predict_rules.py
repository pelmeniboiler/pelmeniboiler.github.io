# build/g2p/predict_rules.py — a Graflect system for the grader, no model:
#   1. words she has written in the training articles (as build/graflect-words.mjs learns them),
#   2. else CMUdict through her rules (cmu2slug.py),
#   3. else the English word, left in Latin.
# Usage: npm run gt:eval -- --cmd "python3 build/g2p/predict_rules.py path/to/cmudict.dict"
import json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu2slug_lib import slug, load_cmu

def strip(s): return re.sub(r'&\w+;', ' ', re.sub(r'<[^>]+>', ' ', s))
def sentences(s): return re.split(r'[.!?;:]+\s', strip(s))
def is_glyph(c): return 0xE000 <= ord(c) <= 0xF8FF

def learn(lines):
    """Her spellings from aligned training lines (SLUG), kept when 60% of occurrences agree."""
    votes = collections.defaultdict(collections.Counter)
    for l in lines:
        es, gs = sentences(l['en']), sentences(l['slug'])
        if len(es) != len(gs): es, gs = [strip(l['en'])], [strip(l['slug'])]
        for e, g in zip(es, gs):
            ew, gw = e.split(), g.split()
            if len(ew) != len(gw): continue
            for a, b in zip(ew, gw):
                a = re.sub(r"[^A-Za-z']", '', a).lower(); b = re.sub(r'[^\wÀ-ɏ4]', '', b)
                if a and b: votes[a][b] += 1
    out = {}
    for w, c in votes.items():
        b, n = c.most_common(1)[0]
        if n / sum(c.values()) >= 0.6: out[w] = b
    return out

def main():
    cmu = load_cmu(sys.argv[1])
    train = [json.loads(l) for l in open(os.environ['TRAIN'], encoding='utf-8') if l.strip()]
    hers = learn(train)
    def word(m):
        w = m.group(0); k = w.lower().replace('’', "'")
        if k in hers: return hers[k]
        if k.replace("'", '') in hers: return hers[k.replace("'", '')]
        if k in cmu: return slug(cmu[k])
        return '‹' + w + '›'
    with open(os.environ['OUT'], 'w', encoding='utf-8') as out:
        for l in open(os.environ['TEST'], encoding='utf-8'):
            if not l.strip(): continue
            t = json.loads(l)
            # Words outside tags and entities only; ‹Latin› stays Latin in the grader too.
            s = ''.join(p if re.match(r'<[^>]+>|&#?\w+;', p) else re.sub(r"[A-Za-z][A-Za-z'’]*", word, p) for p in re.split(r'(<[^>]+>|&#?\w+;)', t['en']))
            out.write(json.dumps({'id': t['id'], 'slug': s}, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
