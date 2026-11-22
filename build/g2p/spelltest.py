# build/g2p/spelltest.py — the spelling test: 80 words Wendy spells blind, and every contestant spells too.
#
# The words (tools/spelltest-words.json): 40 that neither CMUdict nor her articles know ("nobody"), Kanna's
# job, and 40 that CMUdict knows and she has never written ("cmudict"), the accent test. Everyday English,
# no names or loanwords. She types her answers on /tools/spelltest.html, which commits them to
# build/g2p/spelltest/wendy.json. The contestants' answers are committed before hers, sealed.
#
#   python3 build/g2p/spelltest.py request                 write request.md: what each language model gets
#   python3 build/g2p/spelltest.py rules cmudict.dict      the rules system's answers (her words, CMUdict, Latin)
#   python3 build/g2p/spelltest.py cmudict cmudict.dict    CMUdict through her rules alone (no answer where it has none)
#   python build/g2p/spelltest.py kanna cmudict.dict g2p.pt [name]   Kanna's answers (on Geniza; G2P_EPOCHS,
#                                                                    default 10); name: another model, e.g. tohru
#   python3 build/g2p/spelltest.py grade                   results.md, once wendy.json is in
#
# A language model's answers: give it request.md (and nothing else), save its {word: SLUG} as a file
# outside the repo, and seal it: python3 build/g2p/spelltest.py seal NAME that.json. All answers are kept
# in answers.sealed.json (base64, so she can't read them at a glance before she answers). Everyone learns from the same thing: every word she has spelled in her articles
# (not lines a machine wrote) and her hand-made dictionary. An answer counts if it is any of her spellings
# ("a/b" in her answer means both are fine), compared as glyphs, so r·ä and rä are the same if they look so.
import base64, hashlib, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DIR = os.path.join(HERE, 'spelltest'); SEALED = os.path.join(DIR, 'answers.sealed.json')
sys.path.insert(0, HERE)

def words():
    return json.load(open(os.path.join(ROOT, 'tools', 'spelltest-words.json'), encoding='utf-8'))

def hers():
    """Her words (word → SLUG) and the words she keeps in Latin, from her own lines and dictionary, without
    the 80 test words: her answers are in her dictionary now (graflect-data.js), and no contestant may learn them."""
    from second_opinion import lines
    from predict_rules import learn
    from draft import hand_words
    her_lines, _ = lines(); h, keep = learn(her_lines); h.update(hand_words())
    test = set(words()['order'])
    return {w: x for w, x in h.items() if w not in test}, keep - test if isinstance(keep, set) else keep

# The contestants' answers are sealed (base64) until she has answered, so a glance at the repository
# can't show them to her; the sha256 of each shows they weren't changed after hers came in.
def sealed():
    return json.load(open(SEALED, encoding='utf-8')) if os.path.exists(SEALED) else {'note': 'The contestants\' answers, base64 so they can\'t be read at a glance before she answers. spelltest.py grade opens them.', 'answers': {}}

def save(name, answers):
    os.makedirs(DIR, exist_ok=True)
    raw = json.dumps(dict(sorted(answers.items())), ensure_ascii=False, sort_keys=True)
    d = sealed(); d['answers'][name] = {'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'base64': base64.b64encode(raw.encode()).decode()}
    json.dump(d, open(SEALED, 'w', encoding='utf-8'), indent=1)
    print(f'{len(answers)} answers from {name}, sealed in {os.path.relpath(SEALED, ROOT)}')

def opened():
    return {n: json.loads(base64.b64decode(v['base64'])) for n, v in sealed()['answers'].items()}

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    W = words()
    if cmd == 'request':
        from llm_speller import request
        h, _ = hers()
        os.makedirs(DIR, exist_ok=True)
        open(os.path.join(DIR, 'request.md'), 'w', encoding='utf-8').write(request(h, sorted(W['order'])))
        print('wrote', os.path.relpath(os.path.join(DIR, 'request.md'), ROOT))
    elif cmd == 'rules':
        from cmu2slug_lib import load_cmu
        from predict_rules import speller, WORD
        h, keep = hers(); spell = speller(h, keep, load_cmu(sys.argv[2]))
        save('rules', {w: spell(next(WORD.finditer(w))) for w in W['order']})
    elif cmd == 'cmudict':
        # CMUdict through her rules and nothing else: no words of hers, no Latin, nothing for words it lacks.
        from cmu2slug_lib import load_cmu, slug
        cmu = load_cmu(sys.argv[2])
        save('cmudict', {w: slug(cmu[w]) for w in W['order'] if w in cmu})
    elif cmd == 'kanna':
        # Kanna alone, as kanna_vs_rules.py's D: fine-tuned once on all her words, then spells every word.
        import random, torch
        from cmu2slug_lib import load_cmu, slug
        from g2p_model import load, train as tune, predict
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print('device:', device, torch.cuda.get_device_name(0) if device == 'cuda' else '')
        random.seed(0); torch.manual_seed(0)
        model, sv, tv, _ = load(sys.argv[3], device)
        h, _ = hers(); cmu = load_cmu(sys.argv[2])
        mine = [(w, x) for w, x in h.items() if w.replace("'", '').isalpha()]
        some = random.sample([(w, slug(p)) for w, p in cmu.items() if w.isalpha()], min(len(mine) * 2, 20000))
        tune(model, mine * 4 + some, sv, tv, epochs=int(os.environ.get('G2P_EPOCHS', '10')), lr=2e-4, batch=128, device=device, log=lambda s: None)
        save(sys.argv[4] if len(sys.argv) > 4 else 'kanna', dict(zip(W['order'], predict(model, W['order'], sv, tv, device=device))))
    elif cmd == 'seal':   # spelltest.py seal NAME answers.json: a language model's answers, sealed
        save(sys.argv[2], {k.lower(): v for k, v in json.load(open(sys.argv[3], encoding='utf-8')).items()})
    elif cmd == 'grade':
        from slugmap import to_glyph
        path = os.path.join(DIR, 'wendy.json')
        if not os.path.exists(path): sys.exit('No wendy.json yet: she answers on /tools/spelltest.html.')
        her = {k.lower(): v for k, v in json.load(open(path, encoding='utf-8'))['answers'].items()}
        g = lambda s: to_glyph(re.sub(r'\s+', '', s or ''))
        right = lambda w, a: any(g(a) == g(x) for x in her.get(w, '').split('/') if x.strip())
        got = {n: {k.lower(): v for k, v in a.items()} for n, a in opened().items()}; names = sorted(got)
        rows, table = [], []
        for n in names:
            score = {s: sum(right(w, got[n].get(w)) for w in W[s] if w in her) for s in ('nobody', 'cmudict')}
            of = {s: sum(w in her for w in W[s]) for s in ('nobody', 'cmudict')}
            rows.append((n, score, of))
        rows.sort(key=lambda r: -(r[1]['nobody'] + r[1]['cmudict']))
        md = ['# The spelling test: results', '', f'{len(her)} of {len(W["order"])} words answered. A word counts if it matches any of her spellings, as glyphs.', '',
              '| contestant | nobody knows (Kanna’s job) | CMUdict knows (the accent) | all |', '|---|---|---|---|']
        md += [f'| {n} | {s["nobody"]}/{o["nobody"]} | {s["cmudict"]}/{o["cmudict"]} | {s["nobody"] + s["cmudict"]}/{o["nobody"] + o["cmudict"]} |' for n, s, o in rows]
        md += ['', '## Every word', '', '| word | set | Wendy | ' + ' | '.join(names) + ' |', '|---|---|---|' + '---|' * len(names)]
        for w in W['order']:
            if w not in her: continue
            s = 'nobody' if w in W['nobody'] else 'cmudict'
            md.append(f'| {w} | {s} | {her[w]} | ' + ' | '.join(('**' if right(w, got[n].get(w)) else '') + (got[n].get(w) or '–') + ('**' if right(w, got[n].get(w)) else '') for n in names) + ' |')
        md += ['', 'Bold: spelled as she did.']
        open(os.path.join(DIR, 'results.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
        json.dump([{'name': n, 'score': s, 'of': o} for n, s, o in rows], open(os.path.join(DIR, 'results.json'), 'w', encoding='utf-8'), indent=1)
        print('\n'.join(md[:6 + len(rows)]))
    else:
        sys.exit(__doc__ if __doc__ else 'usage: spelltest.py request | rules CMU | kanna CMU g2p.pt | grade')

if __name__ == '__main__':
    main()
