# build/g2p/sentbench.py — the sentence bench: whole passages, spelled in context, for Fafnir and its rivals.
#
# The passages (tools/sentbench-passages.json): Jane Eyre, Tefilat HaDerech in Hebrew and English, Eco,
# Calvino, Nabokov, Mishima, and two lines of Trava u Doma with a nudnik. Context words (the leads, read),
# names, Hebrew, Russian. Every contestant answers first, sealed; then Wendy spells every line blind on
# /tools/sentbench.html, which commits build/g2p/sentbench/wendy.json.
#
#   python3 build/g2p/sentbench.py check                   the passages never write G-d out (also run by the tests)
#   python3 build/g2p/sentbench.py request                 write request.md: what each language model gets
#   python3 build/g2p/sentbench.py rules cmudict.dict      the rules system, line by line
#   python build/g2p/sentbench.py model cmudict.dict tohru2.pt tohru2   on Geniza: a model before CMUdict
#       (fine-tuned on her words as spelltest.py does; G2P_ANCHOR=build/g2p/tohru/teacher.json for Tohru)
#   python3 build/g2p/sentbench.py seal NAME answers.json  a language model's answers ({line id: SLUG}), sealed
#   python3 build/g2p/sentbench.py grade                   results.md, once wendy.json is in
#
# Everyone learns from the same thing: every line she has written in Graflect (not lines a machine wrote) and
# her hand-made dictionary. Graded as the articles are: her words in order, matched as glyphs, so a word
# counts only where it stands; and lines exactly right.
import base64, hashlib, json, os, re, sys, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DIR = os.path.join(HERE, 'sentbench'); SEALED = os.path.join(DIR, 'answers.sealed.json')
PASSAGES = os.path.join(ROOT, 'tools', 'sentbench-passages.json')
sys.path.insert(0, HERE)

def passages():
    return json.load(open(PASSAGES, encoding='utf-8'))['passages']

def lines():
    """[(id, text)] in order: eyre:1, eyre:2, derech:1, …"""
    return [(f'{p["id"]}:{i + 1}', l) for p in passages() for i, l in enumerate(p['lines'])]

# She never writes G-d out: not God in English, not the Name or Elohim in Hebrew (written with ק instead).
def written_out(text):
    he = ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c))
    return re.findall(r'\bGods?\b|\bGod[’\']s\b', text) + re.findall(r'יהוה|(?<![א-ת])[ו]?(?:ה|ב|ל|מ|כ)?אלה(?:ים|ינו|י|יך|יכם)(?![א-ת])', he)

def check():
    bad = [(i, w) for i, l in lines() for w in written_out(l)]
    if bad: sys.exit('G-d written out: ' + ', '.join(f'{i} ({w})' for i, w in bad))
    print(f'{len(lines())} lines in {len(passages())} passages; G-d is never written out.')

def hers():
    """Her words (word → SLUG), the words she keeps in Latin, and her lines as examples."""
    from second_opinion import lines as her_lines
    from predict_rules import learn
    from draft import hand_words
    hl, _ = her_lines(); h, keep = learn(hl); h.update(hand_words())
    return h, keep, hl

NOTES = '''- Each line is one passage line. Spell every English word in SLUG the way she would say it, in context: the
  same letters can be two words (the leads of a roof are ledz; read can be rīd or red).
- Hebrew is read in Israeli pronunciation, Russian in Russian, Yiddish as she would say it, all in the same
  SLUG letters. Words that are Hebrew in English letters (Machanayim, Sefirot, tikkun) are said the Hebrew way.
- Keep the line's punctuation. Where the line has Hebrew and then its English after a dash, keep the dash.
- She never writes G-d out. Write it the way she would, with the hyphen.
- A word she keeps in Latin goes in ‹›, as in her lines.'''

def request(h, hl):
    from llm_speller import system
    ex = '\n'.join(f'{re.sub(r"<[^>]+>", "", l["en"])}\n{re.sub(r"<[^>]+>", "", l["slug"])}\n' for l in hl)
    todo = '\n'.join(f'{i}\t{t}' for i, t in lines())
    return (system(h) + '\n\nSome of her lines, English and then her SLUG, to show how she writes whole sentences:\n\n' + ex
            + '\n---\n\nSpell each of these lines in SLUG, the way she would.\n' + NOTES
            + '\n\nAnswer with one JSON object mapping each line id (before the tab) to its SLUG, and nothing else.\n\n' + todo + '\n')

def sealed():
    return json.load(open(SEALED, encoding='utf-8')) if os.path.exists(SEALED) else {'note': 'The contestants\' answers, base64 so they can\'t be read at a glance before she answers. sentbench.py grade opens them.', 'answers': {}}

def save(name, answers):
    os.makedirs(DIR, exist_ok=True)
    ids = {i for i, _ in lines()}; answers = {k: v for k, v in answers.items() if k in ids}
    raw = json.dumps(dict(sorted(answers.items())), ensure_ascii=False, sort_keys=True)
    d = sealed(); d['answers'][name] = {'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'base64': base64.b64encode(raw.encode()).decode()}
    json.dump(d, open(SEALED, 'w', encoding='utf-8'), indent=1)
    print(f'{len(answers)} of {len(ids)} lines from {name}, sealed in {os.path.relpath(SEALED, ROOT)}')

def opened():
    return {n: json.loads(base64.b64decode(v['base64'])) for n, v in sealed()['answers'].items()}

PUNCT = '.,;:!?"“”‘’\'()[]{}…—–-·/«»'
def words(slug):
    """Glyph words in order, punctuation dropped; ‹Latin› stays Latin."""
    from slugmap import to_glyph
    out = []
    for t in to_glyph(slug or '').split():
        t = t.strip(PUNCT)
        if t: out.append(t)
    return out

def lcs(a, b):
    dp = [0] * (len(b) + 1)
    for x in a:
        prev = 0
        for j in range(1, len(b) + 1):
            t = dp[j]; dp[j] = prev + 1 if x == b[j - 1] else max(dp[j], dp[j - 1]); prev = t
    return dp[-1]

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'check': check()
    elif cmd == 'request':
        check(); h, _, hl = hers(); os.makedirs(DIR, exist_ok=True)
        open(os.path.join(DIR, 'request.md'), 'w', encoding='utf-8').write(request(h, hl))
        print('wrote', os.path.relpath(os.path.join(DIR, 'request.md'), ROOT))
    elif cmd == 'rules':
        from cmu2slug_lib import load_cmu
        from predict_rules import speller, spell_line
        h, keep, _ = hers(); spell = speller(h, keep, load_cmu(sys.argv[2]))
        save('rules', {i: spell_line(t, spell) for i, t in lines()})
    elif cmd == 'model':
        # A model before CMUdict (kanna_vs_rules.py's C): her words, then the model for every other word.
        import json as _j, random, torch
        from cmu2slug_lib import load_cmu, slug
        from g2p_model import load, train as tune, predict
        from predict_rules import speller, spell_line, WORD
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print('device:', device, torch.cuda.get_device_name(0) if device == 'cuda' else '')
        random.seed(0); torch.manual_seed(0)
        model, sv, tv, _ = load(sys.argv[3], device)
        h, keep, _ = hers(); cmu = load_cmu(sys.argv[2])
        mine = [(w, x) for w, x in h.items() if w.replace("'", '').isalpha()]
        pool = list(_j.load(open(os.environ['G2P_ANCHOR'], encoding='utf-8'))['words'].items()) if os.environ.get('G2P_ANCHOR') else [(w, slug(p)) for w, p in cmu.items() if w.isalpha()]
        some = random.sample([(w, x) for w, x in pool if w.isalpha() and w not in h], min(len(mine) * 2, 20000))
        tune(model, mine * 4 + some, sv, tv, epochs=int(os.environ.get('G2P_EPOCHS', '10')), lr=2e-4, batch=128, device=device, log=lambda s: None)
        need = sorted({m.group(0).lower().replace('’', "'") for _, t in lines() for m in WORD.finditer(t)} - set(h))
        guessed = dict(zip(need, predict(model, [w.replace("'", '') for w in need], sv, tv, device=device)))
        spell = speller(h, keep, None, guessed)
        save(sys.argv[4] if len(sys.argv) > 4 else 'model', {i: spell_line(t, spell) for i, t in lines()})
    elif cmd == 'seal':
        save(sys.argv[2], json.load(open(sys.argv[3], encoding='utf-8')))
    elif cmd == 'grade':
        path = os.path.join(DIR, 'wendy.json')
        if not os.path.exists(path): sys.exit('No wendy.json yet: she answers on /tools/sentbench.html.')
        her = json.load(open(path, encoding='utf-8'))['answers']; got = opened(); names = sorted(got)
        L = [(i, t) for i, t in lines() if her.get(i)]
        rows = []
        for n in names:
            per = {}
            for i, _ in L:
                ref, out = words(her[i]), words(got[n].get(i))
                p = per.setdefault(i.split(':')[0], [0, 0, 0, 0]); p[0] += lcs(out, ref); p[1] += len(ref); p[2] += out == ref; p[3] += 1
            rows.append((n, per))
        tot = lambda per: [sum(v[k] for v in per.values()) for k in range(4)]
        rows.sort(key=lambda r: -tot(r[1])[0])
        ids = [p['id'] for p in passages()]
        md = ['# The sentence bench: results', '', f'{len(L)} of {len(lines())} lines answered. Her words in order, matched as glyphs; a line counts if every word matches.', '',
              '| contestant | words right | lines exact | ' + ' | '.join(ids) + ' |', '|---|---|---|' + '---|' * len(ids)]
        for n, per in rows:
            w, of, ex, ln = tot(per)
            md.append(f'| {n} | {w}/{of} ({100 * w / max(of, 1):.1f}%) | {ex}/{ln} | ' + ' | '.join(f'{per[p][0]}/{per[p][1]}' if p in per else '–' for p in ids) + ' |')
        md += ['', '## Every line', '']
        for i, t in L:
            md += [f'**{i}** {t}', '', f'- Wendy: {her[i]}'] + [f'- {n}: {got[n].get(i) or "–"}{" ✓" if words(got[n].get(i)) == words(her[i]) else ""}' for n in names] + ['']
        open(os.path.join(DIR, 'results.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
        json.dump([{'name': n, 'passages': per} for n, per in rows], open(os.path.join(DIR, 'results.json'), 'w', encoding='utf-8'), indent=1)
        print('\n'.join(md[:6 + len(rows)]))
    else:
        sys.exit(__doc__ if __doc__ else 'usage: sentbench.py check | request | rules CMU | model CMU ckpt name | seal NAME file | grade')

if __name__ == '__main__':
    main()
