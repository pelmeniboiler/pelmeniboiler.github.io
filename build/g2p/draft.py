# build/g2p/draft.py — Graflect drafts for the queue in tools/gt.html, from the rules system
# (her hand-made dictionary and her words from every article, then CMUdict through her rules,
# then the model's words if there are any).
#
#   python3 build/g2p/draft.py cmudict.dict _site/tools/gt-drafts.json [--only eink,history]
#   python3 build/g2p/draft.py cmudict.dict drafts.json --model g2p.pt     (on Geniza)
#
# With --model, the model (fine-tuned once on all her words) spells the queue's words that neither her
# articles nor CMUdict know, and those spellings are saved to build/g2p/model-words.json (commit it).
# Without --model, that file is used if it's there: so GitHub's build, which has no GPU, gets them too.
# Fine-tuning epochs: G2P_EPOCHS (default 10).
#
# The queue drafts each line in pieces: each piece of text in it, at any depth, outside code and keys.
# So the drafts are keyed by that text, exactly as the browser reads it, and the queue uses one
# whenever it has it (else it drafts from her word list, as before). The build workflow runs this
# after `npm run build`. build/g2p/geniza.py uses the same pieces to write whole articles.
import hashlib, json, os, re, sys, glob
from html.parser import HTMLParser
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, HERE)
from cmu2slug_lib import slug, load_cmu
from slugmap import to_slug
from predict_rules import learn, speller, spell_line, WORD

SKIP = {'tl-status', 'coal', 'gtgr'}   # as the queue (build/graflect-words.mjs)
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
GLYPH = re.compile('[-]')
WORDS_PATH = os.path.join(HERE, 'model-words.json')
MACHINE_PATH = os.path.join(HERE, 'machine-lines.json')

def stamp(gt): return hashlib.sha256(str(gt).encode('utf-8')).hexdigest()[:12]

def machine_lines():
    """{'file:key': stamp} for lines a machine wrote (geniza.py); while unchanged they aren't hers."""
    try: return json.load(open(MACHINE_PATH, encoding='utf-8')).get('lines', {})
    except FileNotFoundError: return {}

class Pieces(HTMLParser):
    """Every text node of a line, at any depth, outside code and keyboard keys: the queue's segments."""
    SKIP_IN = {'code', 'pre', 'kbd', 'samp', 'script', 'style'}
    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack, self.out, self.buf = [], [], ''
    def handle_starttag(self, tag, attrs):
        self.flush()
        if tag not in VOID: self.stack.append(tag)
    def handle_startendtag(self, tag, attrs):
        self.flush()
    def handle_endtag(self, tag):
        self.flush()
        if tag in self.stack: del self.stack[len(self.stack) - 1 - self.stack[::-1].index(tag):]
    def handle_data(self, d):
        if not self.SKIP_IN.intersection(self.stack): self.buf += d
    def flush(self):
        if self.buf.strip(): self.out.append(self.buf)
        self.buf = ''

def spell_html(html, spell):
    """A whole line in SLUG: text spelled at any depth, tags kept, code and keyboard keys left as they are."""
    out, stack = [], []
    for part in re.split(r'(<[^>]+>)', str(html)):
        m = re.match(r'<(/?)([a-zA-Z0-9]+)', part)
        if m:
            tag = m.group(2).lower()
            if m.group(1): stack[:] = stack[:len(stack) - 1 - stack[::-1].index(tag)] if tag in stack else stack
            elif tag not in VOID and not part.endswith('/>'): stack.append(tag)
            out.append(part)
        else:
            out.append(part if Pieces.SKIP_IN.intersection(stack) else spell_line(part, spell))
    return ''.join(out)

def pieces(html):
    p = Pieces(); p.feed(html); p.close(); p.flush(); return p.out

def articles(only=None):
    """(train, missing): her Graflect lines as {en, gt, slug} (not ones a machine wrote), and {file: [(key, en)]} still without Graflect."""
    train, missing, machine = [], {}, machine_lines()
    for f in sorted(glob.glob(os.path.join(ROOT, 'localization', '*.json'))):
        name = os.path.basename(f)[:-5]
        if name in SKIP: continue
        try: d = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        en, gt = d.get('en') or {}, d.get('gt') or {}
        for k, e in en.items():
            g = str(gt.get(k) or '')
            if g.strip() and machine.get(f'{name}:{k}') == stamp(g): continue   # a machine's line, not hers
            if g.strip() and GLYPH.search(g): train.append({'en': e, 'gt': g, 'slug': to_slug(g)})
            elif str(e).strip() and not g.strip() and (only is None or name in only): missing.setdefault(name, []).append((k, e))
    return train, missing

def hand_words():
    """Her hand-made dictionary (defaultWordMap in graflect-data.js), in SLUG. It wins, as on the site."""
    src = open(os.path.join(ROOT, 'scripts/blog/demos/graflect-data.js'), encoding='utf-8').read()
    i = src.index('const defaultWordMap = {'); body = src[i:src.index('};', i)]
    return {w: to_slug(g) for w, g in re.findall(r"'([a-z']+)':\s*'([^']*)'", body) if g.strip()}

def system(cmu_path, texts, ckpt=None):
    """The speller for these texts: her words (hand-made first), CMUdict through her rules, the model's words."""
    train, _ = articles()
    hers, keep_latin = learn(train)
    hers.update(hand_words())
    cmu = load_cmu(cmu_path)
    guessed = json.load(open(WORDS_PATH, encoding='utf-8')).get('words', {}) if os.path.exists(WORDS_PATH) else {}
    if ckpt:
        # The model, fine-tuned once on all her words, for words neither her articles nor CMUdict know.
        import random, torch
        from g2p_model import load, train as tune, predict
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        random.seed(0); torch.manual_seed(0)
        model, sv, tv, cfg = load(ckpt, device)
        mine = [(w, x) for w, x in hers.items() if w.replace("'", '').isalpha()]
        some = random.sample([(w, slug(p)) for w, p in cmu.items() if w.isalpha()], min(len(mine) * 2, 20000))
        tune(model, mine * 4 + some, sv, tv, epochs=int(os.environ.get('G2P_EPOCHS', '10')), lr=2e-4, batch=128, device=device, log=lambda s: None)
        words = sorted({m.group(0).lower().replace('’', "'") for t in texts for m in WORD.finditer(re.sub(r'<[^>]+>|&#?\w+;', ' ', t))})
        need = [w for w in words if w not in hers and w.replace("'", '') not in hers and w not in keep_latin and w not in cmu]
        new = dict(zip(need, predict(model, need, sv, tv, device=device)))
        guessed = {**guessed, **new}
        json.dump({'note': 'The model\'s spellings (SLUG) of words that neither her articles nor CMUdict know; made on Geniza.',
                   'words': dict(sorted(guessed.items()))}, open(WORDS_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    spell = speller(hers, keep_latin, cmu, guessed)
    def used(ts):
        """The words the model's spelling was actually used for (not ones a rule kept in Latin)."""
        out = set()
        for t in ts:
            for part in re.split(r'<[^>]+>|&#?\w+;', str(t)):
                for m in WORD.finditer(part):
                    k = m.group(0).lower()
                    if k in guessed and k not in hers and k not in cmu and spell(m) == guessed[k]: out.add(k)
        return sorted(out)
    return spell, used

def main():
    cmu_path, out_path = sys.argv[1], sys.argv[2]
    opt = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
    only = set(opt('--only').split(',')) if opt('--only') else None
    _, missing = articles(only)
    segs = sorted({s for lines in missing.values() for _, e in lines for s in pieces(str(e))})
    spell, used = system(cmu_path, segs, opt('--model'))
    drafts = {s: spell_line(s, spell) for s in segs}
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    json.dump({'segments': drafts, 'files': sorted(missing), 'model_words': used(segs)}, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(drafts)} draft pieces for {sum(len(v) for v in missing.values())} lines in {len(missing)} file(s) → {out_path}'
          + (f'; {len(used(segs))} words spelled by the model' if used(segs) else ''))

if __name__ == '__main__':
    main()
