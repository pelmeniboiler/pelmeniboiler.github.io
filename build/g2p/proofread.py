# build/g2p/proofread.py — a Graflect proofreading round for tools/review.html.
#
#   python3 build/g2p/proofread.py cmudict.dict vault/reviews/graflect-<n>.json
#
# One question per word worth a look in her Graflect articles:
#   - she has spelled it more than one way, or
#   - she has spelled it one way, and CMUdict through her rules disagrees by more than
#     the unstressed i/x vowel (which she chooses by context).
# Options: her spellings (with counts) and CMUdict's; the draft pick is her most-used one.
# Words whose spelling depends on context are listed as settled, with the rule.
# Answers are applied by hand (aligned respelling of the articles, then the dictionary).
import json, os, re, sys, glob, difflib, collections
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, HERE)
from cmu2slug_lib import slug, load_cmu

src = open(os.path.join(ROOT, 'scripts/blog/demos/graflect-data.js'), encoding='utf-8').read()
SLUG = dict(re.findall(r"'(.)':\s*'([^']*)'", src[src.index('slugMap'):]))
TO_GLYPH = sorted(((v, g) for g, v in SLUG.items() if v.strip()), key=lambda x: -len(x[0]))
def is_glyph(c): return 0xE000 <= ord(c) <= 0xF8FF
def to_slug(g): return ''.join(SLUG.get(c, c) for c in g)
def to_glyph(s):
    out, i = '', 0
    while i < len(s):
        m = next(((v, g) for v, g in TO_GLYPH if s.startswith(v, i) and v not in ('rr', 'rä') and (v != 'wī' or s == 'wī')), None)
        if m: out += m[1]; i += len(m[0])
        else: out += s[i]; i += 1
    return out
def strip(s): return re.sub(r'&\w+;', ' ', re.sub(r'<[^>]+>', ' ', s))
def sentences(s): return re.split(r'[.!?;:]+\s', strip(s))

CONTEXT = {
    'the': 'dhx before a consonant, dhi before a vowel (the build and the queue do this for you).',
    'a': 'x, and ē when you stress it: for emphasis or contrast (“a cat, not the cat”), when you pause after it, or say it on its own.',
    'read': 'rīd now, red in the past (same spelling in English, different words).',
    'use': 'yüz the verb (“I use it”), yüs the noun (“a use for it”).',
    'used': 'yüzd “used it”, yüst “used to”.',
}

def main():
    cmu = load_cmu(sys.argv[1]); out_path = sys.argv[2]
    seen, where = collections.defaultdict(collections.Counter), {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'localization', '*.json'))):
        if f.endswith('tl-status.json'): continue
        try: d = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        for k, g in (d.get('gt') or {}).items():
            e = (d.get('en') or {}).get(k)
            if not e: continue
            es, gs = sentences(e), sentences(g)
            if len(es) != len(gs): es, gs = [strip(e)], [strip(g)]
            for x, y in zip(es, gs):
                ew, gw = x.split(), y.split()
                if len(ew) != len(gw): continue
                for a, b in zip(ew, gw):
                    w = re.sub(r"[^A-Za-z']", '', a).lower(); s = to_slug(''.join(c for c in b if is_glyph(c)))
                    if w and s and w.replace("'", '').isalpha():
                        seen[w][s] += 1
                        where.setdefault(w, (os.path.basename(f)[:-5], k, e, g))
    def only_xi(a, b):
        return all(set(a[i1:i2] + b[j1:j2]) <= set('xi') for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b).get_opcodes() if op != 'equal')
    lines, questions, n = {}, [], 0
    for w, v in sorted(seen.items(), key=lambda x: -sum(x[1].values())):
        conv = slug(cmu[w]) if w in cmu else None
        mine = [s for s, _ in v.most_common()]
        if w in CONTEXT: kind = 'context'
        elif len(v) > 1: kind = 'inconsistent'
        elif conv and conv != mine[0] and not only_xi(mine[0], conv): kind = 'disputed'
        else: continue
        file, key, en, gt = where[w]
        hi = re.sub(rf'(?i)\b({re.escape(w)})\b', r'<u>\1</u>', en, count=1)
        lines[w] = {'en': f'<span class="key">{file}</span> {hi}', 'gt': {'text': gt, 'back': to_slug(re.sub(r'&\w+;', ' ', re.sub(r'<[^>]+>', '', gt))).strip()}}
        opts = [{'text': f'{s}   {to_glyph(s)}', 'why': f'yours, {v[s]}×'} for s in mine]
        if conv and conv not in v: opts.append({'text': f'{conv}   {to_glyph(conv)}', 'why': 'CMUdict through your rules'})
        n += 1
        q = {'id': f'g{n}', 'kind': kind, 'key': w, 'lang': 'gt', 'ask': f'“{w}”: which spelling?', 'options': opts, 'pick': 0, 'status': 'open', 'thread': []}
        if kind == 'context':
            q.update(status='settled', ask=f'“{w}” depends on context', why=CONTEXT[w], options=opts)
            q['thread'].append({'who': 'claude', 'round': 1, 'text': CONTEXT[w]})
        elif kind == 'inconsistent':
            q['why'] = f'You have written it {len(v)} ways.' + (f' CMUdict through your rules: {conv}.' if conv else '')
        else:
            q['why'] = f'You always write {mine[0]}; CMUdict through your rules says {conv}. Keep yours unless it was a slip.'
        questions.append(q)
    review = {'article': os.path.basename(out_path)[:-5], 'kind': 'graflect', 'title': 'Graflect proofreading', 'round': 1, 'langs': ['gt'], 'lines': lines, 'questions': questions}
    json.dump(review, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(out_path, 'a').write('\n')
    c = collections.Counter(q['kind'] for q in questions)
    print(f'{len(questions)} words: {dict(c)} → {out_path}')

if __name__ == '__main__':
    main()
