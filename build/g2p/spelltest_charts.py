# build/g2p/spelltest_charts.py — the spelling test's two figures in inprogress/graflect-graded.html, and the
# results paragraph (localization/gtgr.json), rebuilt from her answers and the sealed ones. Run after a change:
#   python3 build/g2p/spelltest_charts.py
import json, os, re, sys, base64, html
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from slugmap import to_glyph, to_slug
W = json.load(open(os.path.join(ROOT, 'tools/spelltest-words.json')))
her = json.load(open(os.path.join(HERE, 'spelltest/wendy.json'), encoding='utf-8'))['answers']
A = {n: json.loads(base64.b64decode(v['base64'])) for n, v in json.load(open(os.path.join(HERE, 'spelltest/answers.sealed.json')))['answers'].items()}
WHO = [('opus', 'Opus'), ('sonnet', 'Sonnet'), ('haiku', 'Haiku'), ('kanna', 'Kanna'), ('tohru', 'Tohru'), ('tohru-mix', 'Tohru with CMUdict'), ('tohru2', 'Tohru 2'), ('rules', 'The rules'), ('cmudict', 'CMUdict')]
norm = lambda s: to_slug(to_glyph(re.sub(r'\s+', '', s or '')))
def right(w, a): return bool(a) and any(norm(a) == norm(x) for x in her[w].split('/') if x.strip())
def lev(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, y in enumerate(b, 1): p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (x != y))
    return d[-1]
rows = []
for n, t in WHO:
    dist = [0 if right(w, A[n].get(w)) else (min(lev(norm(A[n].get(w)), norm(x)) for x in her[w].split('/')) if A[n].get(w) else 99) for w in W['order']]
    a = sum(d == 0 for w, d in zip(W['order'], dist) if w in W['nobody']); b = sum(d == 0 for w, d in zip(W['order'], dist) if w in W['cmudict'])
    rows.append((t, dist.count(0), dist.count(1), sum(x > 1 for x in dist), a, b))
def row(n, r, one, far, *_):
    return (f'<div class="gg-row gg-row3"><span class="gg-v">{n}</span><div><div class="gg-bar" style="width: 100%">'
            f'<span class="gg-seg gg-k-right" style="flex: {r} 1 0" title="{n}: right, {r}"></span>'
            f'<span class="gg-seg gg-k-alt" style="flex: {one} 1 0" title="{n}: one letter off, {one}"></span>'
            f'<span class="gg-seg gg-k-cmu" style="flex: {far} 1 0" title="{n}: further off or no answer, {far}"></span></div></div>'
            f'<span class="gg-p">{r}/80</span></div>')
fig1 = ('<figure class="gg-wide"><div class="gg-cap" id="gg-test-t">The spelling test: 80 words I spelled blind</div>'
        '<ul class="gg-legend"><li><span class="gg-seg gg-k-right"></span>Right</li><li><span class="gg-seg gg-k-alt"></span>One letter off</li><li><span class="gg-seg gg-k-cmu"></span>Further off, or no answer</li></ul>'
        '<div role="img" aria-labelledby="gg-test-t" aria-describedby="gg-test-d"><p hidden id="gg-test-d">Of 80 words: ' + ', '.join(f'{n} spelled {r}' for n, r, *_ in rows) + ' the way I did.</p>'
        + ''.join(row(*r) for r in rows) + '</div>'
        '<details class="gg-numbers"><summary>The numbers</summary><div><table><thead><tr><th scope="col">Who</th><th scope="col">Right</th><th scope="col">One letter off</th><th scope="col">Further off, or no answer</th><th scope="col">Words nobody knows</th><th scope="col">Words only CMUdict knows</th></tr></thead><tbody>'
        + ''.join(f'<tr><th scope="row">{n}</th><td>{r}</td><td>{o}</td><td>{f}</td><td>{x} of 40</td><td>{y} of 40</td></tr>' for n, r, o, f, x, y in rows)
        + '</tbody></table></div></details></figure>')
def cell(w, ans):
    if not ans: return '<td class="gg-none">–</td>'
    cmu = A.get('cmudict', {}).get(w)
    cls = 'gg-hit' if right(w, ans) else 'gg-ascmu' if cmu and norm(ans) == norm(cmu) else ''
    return f'<td class="{cls}" title="{html.escape(ans)}"><span>{html.escape(to_glyph(ans))}</span></td>'
def body(words, title):
    out = [f'<tr class="gg-set"><th colspan="{2 + len(WHO)}" scope="rowgroup">{title}</th></tr>']
    for w in sorted(words):
        out.append(f'<tr><th scope="row" lang="en">{w}</th><td class="gg-her" title="{html.escape(her[w])}">{html.escape(" / ".join(to_glyph(x) for x in her[w].split("/")))}</td>'
                   + ''.join(cell(w, A[n].get(w)) for n, _ in WHO) + '</tr>')
    return '<tbody>' + ''.join(out) + '</tbody>'
fig2 = ('<figure class="gg-wide gg-answers-fig"><div class="gg-cap" id="gg-answers-t">Every answer, all 80 words</div>'
        '<ul class="gg-legend"><li><span class="gg-seg gg-k-cmu"></span>Spelled the way I did</li><li><span class="gg-seg gg-k-ascmu"></span>Not my way, but CMUdict’s</li></ul>'
        '<div class="gg-answers-scroll"><table class="gg-answers" aria-labelledby="gg-answers-t"><thead><tr><th scope="col">Word</th><th scope="col">Me</th>'
        + ''.join(f'<th scope="col">{t}</th>' for _, t in WHO) + '</tr></thead>'
        + body(W['nobody'], 'Words nobody knows: not in CMUdict or my articles') + body(W['cmudict'], 'Words only CMUdict knows')
        + '</table></div></figure>')
p = os.path.join(ROOT, 'inprogress/graflect-graded.html'); s = open(p, encoding='utf-8').read()
for cap, fig in (('gg-test-t', fig1), ('gg-answers-t', fig2)):
    a = s.index(f'id="{cap}"'); a = s.rindex('<figure', 0, a); b = s.index('</figure>', a) + 9; s = s[:a] + fig + s[b:]
open(p, 'w', encoding='utf-8').write(s)
q = os.path.join(ROOT, 'localization/gtgr.json'); d = json.load(open(q, encoding='utf-8')); o = {r[0]: r for r in rows}
d['en']['gtgr_p13'] = (f'Opus wins again, with {o["Opus"][1]}, and gets {o["Opus"][1] + o["Opus"][2]} within one letter. Sonnet has {o["Sonnet"][1]}, Haiku {o["Haiku"][1]}, Kanna {o["Kanna"][1]}, and the rules {o["The rules"][1]}. '
                       f'CMUdict alone, through my rules, gets {o["CMUdict"][5]} of the 40 words it knows, the same as the rules: on words I’ve never written, the rules are CMUdict. '
                       f'On the words nobody knows, Kanna beats the rules, {o["Kanna"][4]} to {o["The rules"][4]}, but every Claude beats her. Everyone did worse than in the grading, because these words are new to everyone, me included.')
missed = sum(not any(right(w, A[n].get(w)) for n, _ in WHO) for w in W['order'])
d['en']['gtgr_p14'] = re.sub(r'^[^,]+ words, nobody got right\.', f'{missed} words, nobody got right.'.capitalize() if missed > 29 else ['Twenty', 'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four', 'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine'][missed - 20] + ' words, nobody got right.' if missed >= 20 else f'{missed} words, nobody got right.', d['en']['gtgr_p14'])
open(q, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print(rows, 'missed by all:', missed)
