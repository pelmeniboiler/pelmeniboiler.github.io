# build/g2p/geniza.py — give every article its Graflect, on Geniza.
#
#   python build/g2p/geniza.py cmudict.dict                      every line that has no Graflect yet
#   python build/g2p/geniza.py cmudict.dict --only eink,history  just these articles
#   options: --model g2p.pt (the default when g2p.pt is in the repo folder), --no-model, --no-git
#
# 1. Pulls main (the articles are the repo's localization/*.json, the same files the site is built from).
# 2. Spells each missing line with the rules system (her hand-made dictionary and her words from every
#    article, CMUdict through her rules, the name and context rules) and the model for words neither
#    knows; text inside links and other tags is spelled too, the tags themselves are kept.
# 3. Writes the lines into each file's "gt", stamps localization/tl-status.json, saves the model's words
#    (build/g2p/model-words.json) and a readable SLUG preview (build/g2p/results/<date>/graflect.md).
# 4. Commits on a new branch geniza/graflect-<date> and pushes it: open the pull request, read the
#    preview, fix what's wrong, merge. Nothing reaches the site until you merge.
import datetime, hashlib, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from draft import articles, system, WORDS_PATH
from predict_rules import spell_line
from slugmap import to_glyph

def git(*a, check=True):
    return subprocess.run(['git', *a], cwd=ROOT, check=check, capture_output=True, text=True).stdout.strip()

def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('--'): sys.exit('usage: python build/g2p/geniza.py cmudict.dict [--only a,b] [--model g2p.pt | --no-model] [--no-git]')
    cmu_path = os.path.abspath(args[0])
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    only = set(opt('--only').split(',')) if opt('--only') else None
    use_git = '--no-git' not in args
    ckpt = None if '--no-model' in args else (opt('--model') or (os.path.join(ROOT, 'g2p.pt') if os.path.exists(os.path.join(ROOT, 'g2p.pt')) else None))
    date = datetime.date.today().isoformat()
    branch = f'geniza/graflect-{date}'

    if use_git:
        if git('status', '--porcelain', '--untracked-files=no'): sys.exit('The repo has uncommitted changes; commit or stash them first.')
        git('checkout', 'main'); git('pull', '--ff-only')
        print('Pulled main:', git('log', '-1', '--format=%h %s'))

    _, missing = articles(only)
    if not missing: print('Every line already has Graflect.'); return
    texts = [e for lines in missing.values() for _, e in lines]
    print(f'{len(texts)} lines without Graflect in {len(missing)} file(s): ' + ', '.join(f'{f} ({len(l)})' for f, l in missing.items()))
    print('The model:', ckpt or 'not used (no g2p.pt); unknown words stay Latin')
    spell, used = system(cmu_path, texts, ckpt)

    status_path = os.path.join(ROOT, 'localization', 'tl-status.json')
    status = json.load(open(status_path, encoding='utf-8'))
    preview = [f'# Graflect from Geniza, {date}', '', 'Each line in SLUG (‹…› is Latin). Words the model spelled: ' + (', '.join(used(texts)) or 'none') + '.', '']
    for name, lines in missing.items():
        path = os.path.join(ROOT, 'localization', f'{name}.json')
        raw = open(path, encoding='utf-8').read(); d = json.loads(raw)
        gt = dict(d.get('gt') or {})
        preview += [f'## {name}', '', '| key | English | Graflect (SLUG) |', '|---|---|---|']
        for key, en in lines:
            s = spell_line(str(en), spell)
            gt[key] = to_glyph(s)
            status.setdefault(name, {}).setdefault(key, {})['gt'] = hashlib.sha256(str(en).encode('utf-8')).hexdigest()[:12]
            cell = lambda x: re.sub(r'<[^>]+>', '', x).replace('|', '\\|').replace('\n', ' ')
            preview.append(f'| {key} | {cell(str(en))} | {cell(s)} |')
        preview.append('')
        # Keep the English key order, then any keys only Graflect has.
        d['gt'] = {k: gt[k] for k in [*[k for k in d['en'] if k in gt], *[k for k in gt if k not in d['en']]]}
        open(path, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + ('\n' if raw.endswith('\n') else ''))
    status = {f: {k: status[f][k] for k in sorted(status[f])} for f in sorted(status)}
    open(status_path, 'w', encoding='utf-8').write(json.dumps(status, ensure_ascii=False, indent=2) + '\n')
    out_dir = os.path.join(HERE, 'results', date); os.makedirs(out_dir, exist_ok=True)
    preview_path = os.path.join(out_dir, 'graflect.md')
    open(preview_path, 'w', encoding='utf-8').write('\n'.join(preview))
    print(f'Wrote {len(texts)} lines; preview: {os.path.relpath(preview_path, ROOT)}')

    if use_git:
        git('checkout', '-B', branch)
        git('add', 'localization', os.path.relpath(preview_path, ROOT), *([os.path.relpath(WORDS_PATH, ROOT)] if os.path.exists(WORDS_PATH) else []))
        git('commit', '-m', f'Graflect from Geniza: {len(texts)} lines in {", ".join(missing)}')
        git('push', '-u', 'origin', branch)
        url = git('remote', 'get-url', 'origin').replace('.git', '').replace('git@github.com:', 'https://github.com/')
        print(f'Pushed {branch}. Open the pull request: {url}/compare/main...{branch}?expand=1')
        git('checkout', 'main')

if __name__ == '__main__':
    main()
