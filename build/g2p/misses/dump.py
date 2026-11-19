# Like the P40 report's g2p_dump.py (rules mode), for any version of build/g2p/predict_rules.py:
# OUT is exactly what that version writes; DUMP says where each English word's spelling came from.
#   python3 dump2.py REPO CMU
import json, os, re, sys, collections
REPO, CMU = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(REPO, 'build', 'g2p'))
import predict_rules as pr
from cmu2slug_lib import slug, load_cmu
src = open(pr.__file__, encoding='utf-8').read()
cmu = load_cmu(CMU)
train = [json.loads(l) for l in open(os.environ['TRAIN'], encoding='utf-8') if l.strip()]
L = pr.learn(train); hers, keep = L if isinstance(L, tuple) else (L, set())
THE = 'dhī' if "r'dhī\\1'" in src else 'dhi' if "r'dhi\\1'" in src else None
HAEF = "r'hæf\\1'" in src
VOW = tuple(getattr(pr, 'VOWELS', ()))

def votes_of(lines):
    votes = collections.defaultdict(collections.Counter)
    for l in lines:
        es, gs = pr.sentences(l['en']), pr.sentences(l['slug'])
        if len(es) != len(gs): es, gs = [pr.strip(l['en'])], [pr.strip(l['slug'])]
        for e, g in zip(es, gs):
            ew, gw = e.split(), g.split()
            if len(ew) != len(gw): continue
            for a, b in zip(ew, gw):
                if '‹' in b: continue
                a = re.sub(r"[^A-Za-z']", '', a).lower(); b = re.sub(r'[^\wÀ-ɏ4·␣]', '', b).strip('·')
                if a and b: votes[a][b] += 1
    return votes
prons = collections.defaultdict(list)
for line in open(CMU, encoding='utf-8'):
    w, *ph = line.split('#')[0].split()
    if ph: prons[re.sub(r'\(\d+\)$', '', w).lower()].append(ph)
votes = votes_of(train)

def word(w):
    k = w.lower().replace('’', "'")
    if k in keep: return '‹' + w + '›', 'latin'
    if k in hers: return hers[k], 'hers'
    if k.replace("'", '') in hers: return hers[k.replace("'", '')], 'hers'
    if k in cmu: return slug(cmu[k]), 'cmu'
    return '‹' + w + '›', 'latin'

SPLIT = r'(<[^>]+>|&#?\w+;)'
with open(os.environ['OUT'], 'w', encoding='utf-8') as out, open(os.environ['DUMP'], 'w', encoding='utf-8') as dump:
    for l in open(os.environ['TEST'], encoding='utf-8'):
        if not l.strip(): continue
        t = json.loads(l)
        if hasattr(pr, 'spell_line'):
            line = pr.spell_line(t['en'], pr.speller(hers, keep, cmu))
        else:
            line = ''.join(p if re.match(SPLIT, p) else re.sub(r"[A-Za-z][A-Za-z'’]*", lambda m: word(m.group(0))[0], p) for p in re.split(SPLIT, t['en']))
        out.write(json.dumps({'id': t['id'], 'slug': line}, ensure_ascii=False) + '\n')
        toks = []
        for p in re.split(SPLIT, t['en']):
            if re.match(SPLIT, p): toks.append(None); continue
            pos = 0
            for m in re.finditer(r"[A-Za-z][A-Za-z'’]*", p):
                s, how = word(m.group(0)); gap = p[pos:m.start()]; pos = m.end()
                toks.append({'en': m.group(0), 'slug': s, 'src': how, 'gap': gap})
        # Her context rules, as this version's spell_line applies them.
        LATIN_V = "‹[AEIOUaeiou]" in src   # this version also uses dhī before a Latin name starting with a vowel
        for i, tk in enumerate(toks):
            j = i + 1
            while j < len(toks) and toks[j] is None: j += 1   # tags between, as in the <abbr>IPA</abbr>
            nx = toks[j] if j < len(toks) else None
            if not tk or not nx or nx['gap'].strip() != '' or (not nx['gap'] and j == i + 1): continue
            if THE and tk['slug'] == 'dhx' and (nx['slug'].startswith(VOW) or (LATIN_V and re.match('‹[AEIOUaeiou]', nx['slug']))): tk['slug'], tk['src'] = THE, 'context'
            if HAEF and tk['slug'] == 'hæv' and nx['slug'] == 'tü': tk['slug'], tk['src'] = 'hæf', 'context'
        for i, tk in enumerate(x for x in toks if x):
            k = tk['en'].lower().replace('’', "'")
            v = votes.get(k) or votes.get(k.replace("'", '')) or {}
            dump.write(json.dumps({'id': t['id'], 'i': i, 'en': tk['en'], 'slug': tk['slug'], 'src': tk['src'], 'votes': dict(v), 'in_cmu': k in cmu,
                                   'cmu_slug': slug(cmu[k]) if k in cmu else None, 'cmu_alt': [slug(p) for p in prons.get(k, []) if k in cmu and p != cmu[k]]}, ensure_ascii=False) + '\n')
