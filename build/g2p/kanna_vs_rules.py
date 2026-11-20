# build/g2p/kanna_vs_rules.py — Kanna (the model, g2p.pt) against the rules system, on Geniza.
#
#   python build/g2p/kanna_vs_rules.py cmudict.dict            all contestants (an hour or so on the P40)
#   options: --no-git, --only A,D (some contestants), --kanna path.pt (default g2p.pt), --tiny (a CPU smoke test)
#
# Every contestant is graded the same way as everything else (build/gt-eval.mjs, through
# build/g2p/misses/collect.mjs): each article is left out in turn, the system learns her other articles and
# spells the held-out English. Same words, same G2P_EPOCHS (default 10) for all, and every run is reported.
#
#   A  the rules alone           her words, then CMUdict through her rules, else Latin
#   B  the rules, then Kanna     as the site does now: Kanna only for words neither knows
#   C  Kanna before CMUdict      her words, then Kanna for every other word
#   D  Kanna alone               Kanna spells every word: no lookups, no rules
#   C', D'  the same with g2p-blind.pt, a model pretrained without any CMUdict word she has written
#
# Scores are split by kind of word, whatever spelled it:
#   hers     she wrote it in another article (the rules copy her; Kanna learned it in fine-tuning)
#   cmu      only CMUdict knows it: her accent, the fair fight. Kanna has memorized CMUdict, so C' and D'
#            (the blind model, which never saw these words) are the fair Kanna here.
#   unknown  nobody knows it: Kanna against Latin
# Writes build/g2p/results/<date>/kanna-vs-rules.md and .json, commits them on geniza/kanna-<date>, pushes.
import collections, datetime, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from second_opinion import git, make_blind

CONTESTANTS = [
    ('A', 'the rules alone', None, []),
    ('B', 'the rules, then Kanna', 'kanna', []),
    ('C', 'Kanna before CMUdict', 'kanna', ['--model-first']),
    ('D', 'Kanna alone', 'kanna', ['--model-only']),
    ("C'", 'Kanna before CMUdict, blind', 'blind', ['--model-first']),
    ("D'", 'Kanna alone, blind', 'blind', ['--model-only']),
]
GROUPS = [('hers', 'in her other articles'), ('cmu', 'only CMUdict knows'), ('unknown', 'nobody knows')]

def by_group(run):
    """Words right and words in all, per group, aligning each word to hers in order as the grader does."""
    right, total = collections.Counter(), collections.Counter()
    for a in run['articles']:
        for l in a['lines']:
            toks, ref = l['tokens'], l['ref']
            for t in toks: total[t.get('group')] += 1
            n, m = len(toks), len(ref)
            eq = lambda i, j: len(toks[i]['out']) == 1 and toks[i]['out'][0] == ref[j]
            dp = [[0] * (m + 1) for _ in range(n + 1)]
            for i in range(n - 1, -1, -1):
                for j in range(m - 1, -1, -1):
                    dp[i][j] = dp[i + 1][j + 1] + 1 if eq(i, j) else max(dp[i + 1][j], dp[i][j + 1])
            i = j = 0
            while i < n and j < m:
                if eq(i, j) and dp[i][j] == dp[i + 1][j + 1] + 1: right[toks[i].get('group')] += 1; i += 1; j += 1
                elif dp[i + 1][j] >= dp[i][j + 1]: i += 1
                else: j += 1
    return right, total

def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('--'): sys.exit('usage: python build/g2p/kanna_vs_rules.py cmudict.dict [--no-git] [--only A,D] [--kanna g2p.pt] [--tiny]')
    cmu_path = os.path.abspath(args[0]); use_git = '--no-git' not in args; tiny = '--tiny' in args
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    only = set(opt('--only').split(',')) if opt('--only') else None
    kanna = os.path.abspath(opt('--kanna') or os.path.join(ROOT, 'g2p.pt'))
    blind = os.path.join(ROOT, 'g2p-blind.pt')
    date = datetime.date.today().isoformat(); branch = f'geniza/kanna-{date}'
    if use_git:
        if git('status', '--porcelain', '--untracked-files=no'): sys.exit('The repo has uncommitted changes; commit or stash them first.')
        git('checkout', 'main'); git('pull', '--ff-only'); print('Pulled main:', git('log', '-1', '--format=%h %s'))
    todo = [c for c in CONTESTANTS if only is None or c[0] in only]
    if any(c[2] == 'kanna' for c in todo) and not os.path.exists(kanna): sys.exit(f'Kanna is not at {kanna}; pass --kanna path.pt')
    if any(c[2] == 'blind' for c in todo) and not os.path.exists(blind): make_blind(cmu_path, blind, tiny)
    env = {**os.environ, 'G2P_EPOCHS': os.environ.get('G2P_EPOCHS', '1' if tiny else '10')}
    runs = os.path.join(ROOT, 'runs', 'kanna'); os.makedirs(runs, exist_ok=True)
    results = []
    for key, title, model, flags in todo:
        name = 'contestant-' + key.replace("'", 'b')
        cmd = [sys.executable, os.path.join(HERE, 'misses', 'dump.py'), ROOT, cmu_path, *(['--model', kanna if model == 'kanna' else blind] if model else []), *flags]
        print(f'\n{key}: {title}')
        subprocess.run(['node', os.path.join(HERE, 'misses', 'collect.mjs'), ROOT, name, runs, '--', *cmd], cwd=ROOT, env=env, check=True)
        run = json.load(open(os.path.join(runs, f'{name}.json'), encoding='utf-8'))
        lines = [l for a in run['articles'] for l in a['lines']]
        right, total = by_group(run)
        results.append({'key': key, 'title': title, 'model': model, 'words': sum(l['hits'] for l in lines), 'of': sum(len(l['ref']) for l in lines),
                        'exact': sum(l['exact'] for l in lines), 'lines': len(lines),
                        'groups': {g: {'right': right[g], 'of': total[g]} for g, _ in GROUPS}})
        r = results[-1]; print(f'{key}: {r["words"]}/{r["of"]} words, {r["exact"]}/{r["lines"]} lines exact')

    pc = lambda a, b: f'{100 * a / b:.1f}%' if b else '—'
    md = [f'# Kanna against the rules, {date}', '',
          f'Graded leaving one article out; G2P_EPOCHS={env["G2P_EPOCHS"]}; Kanna is {os.path.basename(kanna)}. Every run is listed.', '',
          '| | contestant | words right | lines exact | ' + ' | '.join(f'{g}: {d}' for g, d in GROUPS) + ' |',
          '|---|---|---|---|' + '---|' * len(GROUPS)]
    for r in results:
        md.append(f'| {r["key"]} | {r["title"]} | {r["words"]}/{r["of"]} ({pc(r["words"], r["of"])}) | {r["exact"]}/{r["lines"]} | '
                  + ' | '.join(f'{pc(r["groups"][g]["right"], r["groups"][g]["of"])} of {r["groups"][g]["of"]}' for g, _ in GROUPS) + ' |')
    md += ['', 'Groups count every English word in it, Latin ones included, so they are for comparing contestants, not totals.',
           'For "only CMUdict knows", the fair Kanna is C\' or D\': Kanna herself has memorized CMUdict.']
    out_dir = os.path.join(HERE, 'results', date); os.makedirs(out_dir, exist_ok=True)
    json.dump(results, open(os.path.join(out_dir, 'kanna-vs-rules.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(out_dir, 'kanna-vs-rules.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    print('\n' + '\n'.join(md))
    if use_git:
        git('checkout', '-B', branch)
        git('add', os.path.join(os.path.relpath(out_dir, ROOT), 'kanna-vs-rules.md'), os.path.join(os.path.relpath(out_dir, ROOT), 'kanna-vs-rules.json'))
        git('commit', '-m', 'Kanna against the rules: ' + ', '.join(f'{r["key"]} {pc(r["words"], r["of"])}' for r in results))
        git('push', '-u', 'origin', branch)
        url = re.sub(r'\.git$', '', git('remote', 'get-url', 'origin')).replace('git@github.com:', 'https://github.com/')
        print(f'Pushed {branch}: {url}/tree/{branch}'); git('checkout', 'main')

if __name__ == '__main__':
    main()
