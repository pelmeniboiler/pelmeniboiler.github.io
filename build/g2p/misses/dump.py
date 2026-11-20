# Like the P40 report's g2p_dump.py, for any version of build/g2p/predict_rules.py:
# OUT is exactly what that version writes; DUMP says where each English word's spelling came from.
#   python3 dump.py REPO CMU                                   the rules system
#   python3 dump.py REPO CMU --model g2p.pt [--model-first]    the model, as build/g2p/predict_model.py runs it
#                                                              (fine-tuned on TRAIN; G2P_EPOCHS as there)
#   python3 dump.py REPO CMU --model g2p.pt --model-only       the model spells every word: no lookups, no rules
#   python3 dump.py REPO CMU --llm opus [--model-first]        a large language model in Kanna's place (../llm_speller.py)
# Each word also gets a group, whatever spelled it: hers (in her other articles), cmu (only CMUdict knows it),
# unknown (neither), or kept (she keeps it in Latin). build/g2p/kanna_vs_rules.py scores by group.
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

# The model: fine-tuned on her words exactly as predict_model.py does, then asked for the words it would be asked for.
guessed, MODEL_ONLY = {}, '--model-only' in sys.argv
MODEL_FIRST = '--model-first' in sys.argv or MODEL_ONLY
def asked_for():
    tests = [json.loads(l) for l in open(os.environ['TEST'], encoding='utf-8') if l.strip()]
    ws = sorted({m.group(0).lower().replace('’', "'") for t in tests for p in re.split(r'(<[^>]+>|&#?\w+;)', t['en']) if not p.startswith(('<', '&')) for m in re.finditer(r"[A-Za-z][A-Za-z'’]*", p)})
    return ws if MODEL_ONLY else [w for w in ws if w not in hers and w.replace("'", '') not in hers and w not in keep and (MODEL_FIRST or w not in cmu)]
if '--llm' in sys.argv:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    from llm_speller import spell_words
    article = json.loads(next(l for l in open(os.environ['TEST'], encoding='utf-8') if l.strip()))['id'].split(':')[0]
    guessed = spell_words(sys.argv[sys.argv.index('--llm') + 1], asked_for(), hers, article)
if '--model' in sys.argv:
    import random, torch
    from g2p_model import load, train as tune, predict
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    random.seed(0); torch.manual_seed(0)
    model, sv, tv, cfg = load(sys.argv[sys.argv.index('--model') + 1], device)
    mine = [(w, x) for w, x in hers.items() if w.replace("'", '').isalpha()]
    some = random.sample([(w, slug(p)) for w, p in cmu.items() if w.isalpha()], min(len(mine) * 2, 20000))
    tune(model, mine * 4 + some, sv, tv, epochs=int(os.environ.get('G2P_EPOCHS', '30')), lr=2e-4, batch=128, device=device, log=lambda s: None)
    tests = [json.loads(l) for l in open(os.environ['TEST'], encoding='utf-8') if l.strip()]
    ws = sorted({m.group(0).lower().replace('’', "'") for t in tests for p in re.split(r'(<[^>]+>|&#?\w+;)', t['en']) if not p.startswith(('<', '&')) for m in re.finditer(r"[A-Za-z][A-Za-z'’]*", p)})
    need = ws if MODEL_ONLY else [w for w in ws if w not in hers and w.replace("'", '') not in hers and w not in keep and (MODEL_FIRST or w not in cmu)]
    guessed = dict(zip(need, predict(model, need, sv, tv, device=device)))

def group(w):
    k = w.lower().replace('’', "'")
    if k in keep: return 'kept'
    if k in hers or k.replace("'", '') in hers: return 'hers'
    return 'cmu' if k in cmu else 'unknown'

def word(w, m=None):
    k = w.lower().replace('’', "'")
    if MODEL_ONLY: return (guessed.get(k) or '‹' + w + '›'), 'model'
    if k in keep or (m is not None and hasattr(pr, 'kept_compound') and (pr.kept_compound(m, keep) or pr.latin_place(m))): return '‹' + w + '›', 'latin'
    if k in hers: return hers[k], 'hers'
    if k.replace("'", '') in hers: return hers[k.replace("'", '')], 'hers'
    if m is not None and hasattr(pr, 'latin_name') and pr.latin_name(m): return '‹' + w + '›', 'latin'
    if not MODEL_FIRST and k in cmu: return slug(cmu[k]), 'cmu'
    if guessed.get(k): return guessed[k], 'model'
    if m is not None and hasattr(pr, 'speller'):   # a known word plus an ending, or two known words
        x = pr.speller(hers, keep, None if MODEL_FIRST else cmu, guessed)(m)
        if not x.startswith('‹'): return x, 'compound'
    return '‹' + w + '›', 'latin'

SPLIT = r'(<[^>]+>|&#?\w+;)'
with open(os.environ['OUT'], 'w', encoding='utf-8') as out, open(os.environ['DUMP'], 'w', encoding='utf-8') as dump:
    for l in open(os.environ['TEST'], encoding='utf-8'):
        if not l.strip(): continue
        t = json.loads(l)
        if MODEL_ONLY:
            line = ''.join(p if re.match(SPLIT, p) else re.sub(r"[A-Za-z][A-Za-z'’]*", lambda m: word(m.group(0))[0], p) for p in re.split(SPLIT, t['en']))
        elif hasattr(pr, 'spell_line'):
            line = pr.spell_line(t['en'], pr.speller(hers, keep, None if MODEL_FIRST else cmu, guessed))
        else:
            line = ''.join(p if re.match(SPLIT, p) else re.sub(r"[A-Za-z][A-Za-z'’]*", lambda m: word(m.group(0))[0], p) for p in re.split(SPLIT, t['en']))
        out.write(json.dumps({'id': t['id'], 'slug': line}, ensure_ascii=False) + '\n')
        toks = []
        for p in re.split(SPLIT, t['en']):
            if re.match(SPLIT, p): toks.append(None); continue
            pos = 0
            for m in re.finditer(r"[A-Za-z][A-Za-z'’]*", p):
                s, how = word(m.group(0), m); gap = p[pos:m.start()]; pos = m.end()
                toks.append({'en': m.group(0), 'slug': s, 'src': how, 'gap': gap})
        # Her context rules, as this version's spell_line applies them.
        LATIN_V = "‹[AEIOUaeiou]" in src   # this version also uses dhī before a Latin name starting with a vowel
        for i, tk in enumerate(toks):
            j = i + 1
            while j < len(toks) and toks[j] is None: j += 1   # tags between, as in the <abbr>IPA</abbr>
            nx = toks[j] if j < len(toks) else None
            if MODEL_ONLY: break
            if not tk or not nx or nx['gap'].strip() != '' or (not nx['gap'] and j == i + 1): continue
            if THE and tk['slug'] == 'dhx' and (nx['slug'].startswith(VOW) or (LATIN_V and re.match('‹[AEIOUaeiou]', nx['slug']))): tk['slug'], tk['src'] = THE, 'context'
            if HAEF and tk['slug'] == 'hæv' and nx['slug'] == 'tü': tk['slug'], tk['src'] = 'hæf', 'context'
        for i, tk in enumerate(x for x in toks if x):
            k = tk['en'].lower().replace('’', "'")
            v = votes.get(k) or votes.get(k.replace("'", '')) or {}
            dump.write(json.dumps({'id': t['id'], 'i': i, 'en': tk['en'], 'slug': tk['slug'], 'src': tk['src'], 'group': group(tk['en']), 'votes': dict(v), 'in_cmu': k in cmu,
                                   'cmu_slug': slug(cmu[k]) if k in cmu else None, 'cmu_alt': [slug(p) for p in prons.get(k, []) if k in cmu and p != cmu[k]]}, ensure_ascii=False) + '\n')
