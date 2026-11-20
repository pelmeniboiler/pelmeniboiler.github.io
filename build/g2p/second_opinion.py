# build/g2p/second_opinion.py — the model's second opinion on the words CMUdict spelled for her, on Geniza.
#
#   python build/g2p/second_opinion.py cmudict.dict              about 15 minutes on the P40
#   options: --no-git, --reuse (keep an existing g2p-blind.pt), --folds 5, --tiny (a CPU smoke test)
#
# Geniza's articles have words she has never written, spelled from CMUdict through her rules. This asks the
# model about each of them, and first measures how much its answer is worth:
# 1. Pulls main. Her lines are every line except the ones still exactly as a Geniza run wrote them
#    (build/g2p/results/*/graflect.md); a line she has corrected is hers.
# 2. The words to ask about: in Geniza's lines, spelled from CMUdict, never written by her.
# 3. Pretrains a fresh model (g2p-blind.pt) on CMUdict without those words and without any word she has
#    written, so its opinion on them isn't just CMUdict remembered.
# 4. The test: her own words that CMUdict also has, in folds. The model learns her other words and spells
#    the fold. Where it disagrees with CMUdict, how often is it the model that matches her?
# 5. Learns all her words, and spells the words from step 2.
# 6. Writes build/g2p/results/<date>/second-opinion.md (read this) and .json, commits them on a new branch
#    geniza/second-opinion-<date>, and pushes it. The main session turns it into a review round.
import collections, datetime, glob, json, os, random, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from draft import hand_words, pieces, SKIP, GLYPH
from slugmap import to_slug
from cmu2slug_lib import slug, load_cmu
from predict_rules import learn, WORD, latin_name, latin_place, kept_compound

# Preview sections whose lines were hers all along (Geniza drafted Global's 15, but hers were kept).
HERS_ANYWAY = {'2026-11-19': {'global'}}

def git(*a):
    import subprocess
    return subprocess.run(['git', *a], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()

def machine_lines():
    """{(file, key)} for lines still exactly as a Geniza run wrote them."""
    cell = lambda x: re.sub(r'<[^>]+>', '', x).replace('|', '\\|').replace('\n', ' ')
    norm = lambda x: re.sub(r"[·‹›'’\\\s]|&#?\w+;", '', x)
    out = set()
    for md in sorted(glob.glob(os.path.join(HERE, 'results', '*', 'graflect.md'))):
        date = os.path.basename(os.path.dirname(md)); cur = None
        for l in open(md, encoding='utf-8'):
            if l.startswith('## '): cur = l[3:].strip()
            elif cur and l.startswith('| ') and not l.startswith(('| key', '|---')) and cur not in HERS_ANYWAY.get(date, ()):
                parts = re.split(r'(?<!\\) \| ', l.strip()[2:-2])
                try: gt = json.load(open(os.path.join(ROOT, 'localization', f'{cur}.json'), encoding='utf-8'))['gt']
                except Exception: continue
                if parts[0] in gt and norm(cell(to_slug(gt[parts[0]]))) == norm(parts[-1]): out.add((cur, parts[0]))
    return out

def lines():
    """(hers, geniza): her lines as {en, gt, slug}; Geniza's as (file, key, English)."""
    mine, hers, geniza = machine_lines(), [], []
    for f in sorted(glob.glob(os.path.join(ROOT, 'localization', '*.json'))):
        name = os.path.basename(f)[:-5]
        if name in SKIP: continue
        d = json.load(open(f, encoding='utf-8')); en, gt = d.get('en') or {}, d.get('gt') or {}
        for k, e in en.items():
            g = str(gt.get(k) or '')
            if (name, k) in mine: geniza.append((name, k, str(e)))
            elif g.strip() and GLYPH.search(g): hers.append({'en': e, 'gt': g, 'slug': to_slug(g)})
    return hers, geniza

def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('--'): sys.exit('usage: python build/g2p/second_opinion.py cmudict.dict [--no-git] [--reuse] [--folds 5] [--tiny]')
    cmu_path = os.path.abspath(args[0]); use_git = '--no-git' not in args; tiny = '--tiny' in args
    folds = int(args[args.index('--folds') + 1]) if '--folds' in args else 5
    date = datetime.date.today().isoformat(); branch = f'geniza/second-opinion-{date}'
    if use_git:
        if git('status', '--porcelain', '--untracked-files=no'): sys.exit('The repo has uncommitted changes; commit or stash them first.')
        git('checkout', 'main'); git('pull', '--ff-only'); print('Pulled main:', git('log', '-1', '--format=%h %s'))

    import torch
    from g2p_model import load, train as tune, predict, score
    from pretrain import pretrain
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print('device:', device, torch.cuda.get_device_name(0) if device == 'cuda' else '')

    her_lines, geniza = lines()
    hers, keep_latin = learn(her_lines); hers.update(hand_words())
    cmu = load_cmu(cmu_path)

    # The words to ask about, and where each is used.
    asked = collections.defaultdict(list)
    for name, key, en in geniza:
        for piece in pieces(en):
            for part in re.split(r'&#?\w+;', piece):
                for m in WORD.finditer(part):
                    k = m.group(0).lower().replace('’', "'")
                    if k in keep_latin or kept_compound(m, keep_latin) or latin_place(m): continue
                    if k in hers or k.replace("'", '') in hers or latin_name(m): continue
                    if k in cmu and k.replace("'", '').isalpha(): asked[k].append(name)
    tested = sorted(w for w in hers if w in cmu and w.isalpha() and w not in keep_latin)
    print(f'{len(her_lines)} of her lines, {len(geniza)} of Geniza\'s; {len(asked)} words to ask about; {len(tested)} of her words to test on')

    # A model that has never seen any of these words.
    ckpt = os.path.join(ROOT, 'g2p-blind.pt')
    if not ('--reuse' in args and os.path.exists(ckpt)):
        print('Pretraining g2p-blind.pt without them (about 10 minutes on the P40)...')
        pretrain(cmu_path, ckpt, tiny=tiny, exclude=set(asked) | set(tested))
    blind = set(asked) | set(tested)
    pool = [(w, slug(p)) for w, p in cmu.items() if w.isalpha() and w not in blind]
    epochs = 1 if tiny else int(os.environ.get('G2P_EPOCHS', '10'))

    def learned(words):
        """The blind model, after learning these words of hers (and some CMUdict, as the graded system does)."""
        random.seed(0); torch.manual_seed(0)
        model, sv, tv, _ = load(ckpt, device)
        mine = [(w, hers[w]) for w in words]
        tune(model, mine * 4 + random.sample(pool, min(len(mine) * 2, 20000, len(pool))), sv, tv, epochs=epochs, lr=2e-4, batch=128, device=device, log=lambda s: None)
        return model, sv, tv

    def ask(model, sv, tv, words):
        got = predict(model, words, sv, tv, device=device)
        c = [slug(cmu[w]) for w in words]
        sm, sc = score(model, list(zip(words, got)), sv, tv, device=device), score(model, list(zip(words, c)), sv, tv, device=device)
        return [{'word': w, 'cmudict': ci, 'model': g, 'margin': round(a - b, 2)} for w, g, ci, a, b in zip(words, got, c, sm, sc)]

    # The test on her words: does the model know her better than CMUdict does?
    random.seed(1); order = random.sample(tested, len(tested)); trial = []
    others = [w for w in hers if w.replace("'", '').isalpha() and w not in keep_latin]
    for i in range(folds):
        fold = set(order[i::folds])
        print(f'Test fold {i + 1}/{folds}: {len(fold)} of her words')
        model, sv, tv = learned([w for w in others if w not in fold])
        for r in ask(model, sv, tv, sorted(fold)): trial.append({**r, 'hers': hers[r['word']]})
    dis = [r for r in trial if r['model'] != r['cmudict']]
    tally = lambda rs: (sum(r['model'] == r['hers'] for r in rs), sum(r['cmudict'] == r['hers'] for r in rs), len(rs))
    agree = [r for r in trial if r['model'] == r['cmudict']]
    print('Disagreements: model right %d, CMUdict right %d, of %d' % tally(dis))

    # The real question.
    model, sv, tv = learned(others)
    answers = ask(model, sv, tv, sorted(asked))
    for r in answers: r.update(count=len(asked[r['word']]), articles=sorted(set(asked[r['word']])))

    out_dir = os.path.join(HERE, 'results', date); os.makedirs(out_dir, exist_ok=True)
    json.dump({'test': trial, 'answers': answers}, open(os.path.join(out_dir, 'second-opinion.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    md = [f'# The model\'s second opinion, {date}', '',
          f'Device: {device}. Words to ask about: {len(asked)} (spelled from CMUdict in Geniza\'s lines, never written by her). '
          f'The model was pretrained without them and without her {len(tested)} test words.', '',
          '## The test: her own words', '',
          f'Her words that CMUdict also has, in {folds} folds; for each, the model learned her other words. '
          'Margin is how much more likely the model finds its own spelling than CMUdict\'s (0 when they agree).', '',
          '| | words | model = her | CMUdict = her | neither |', '|---|---|---|---|---|']
    def row(label, rs):
        m, c, n = tally(rs); return f'| {label} | {n} | {m} | {c} | {n - len([r for r in rs if r["model"] == r["hers"] or r["cmudict"] == r["hers"]])} |'
    md += [row('model and CMUdict agree', agree), row('they disagree', dis)]
    for t in (2, 5, 10): md.append(row(f'they disagree, margin over {t}', [r for r in dis if r['margin'] > t]))
    md += ['', 'Examples where they disagree (SLUG): ' + '; '.join(f'{r["word"]}: her {r["hers"]}, model {r["model"]}, CMUdict {r["cmudict"]}' for r in sorted(dis, key=lambda r: -r['margin'])[:15]), '',
           '## The answers', '', f'{sum(r["model"] != r["cmudict"] for r in answers)} of {len(answers)} words where the model disagrees with CMUdict, most sure first:', '',
           '| word | used | CMUdict | model | margin | articles |', '|---|---|---|---|---|---|']
    md += [f'| {r["word"]} | {r["count"]} | {r["cmudict"]} | {r["model"]} | {r["margin"]} | {", ".join(r["articles"])} |' for r in sorted(answers, key=lambda r: -r['margin']) if r['model'] != r['cmudict']]
    open(os.path.join(out_dir, 'second-opinion.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    print(f'Wrote {os.path.relpath(out_dir, ROOT)}/second-opinion.md')

    if use_git:
        git('checkout', '-B', branch); git('add', os.path.relpath(out_dir, ROOT)); git('commit', '-m', f'Second opinion from Geniza: {len(answers)} CMUdict words')
        git('push', '-u', 'origin', branch)
        url = re.sub(r'\.git$', '', git('remote', 'get-url', 'origin')).replace('git@github.com:', 'https://github.com/')
        print(f'Pushed {branch}: {url}/tree/{branch}'); git('checkout', 'main')

if __name__ == '__main__':
    main()
