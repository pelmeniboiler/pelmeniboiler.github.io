# build/g2p/draft.py — Graflect drafts for the queue in tools/gt.html, from the rules system
# (her words from every article, then CMUdict through her rules, then the model if given).
#
#   python3 build/g2p/draft.py cmudict.dict _site/tools/gt-drafts.json [--only eink,history]
#   python3 build/g2p/draft.py cmudict.dict drafts.json --model g2p.pt     (on Geniza)
#
# With --model, the model (fine-tuned once on all her words) spells the queue's words that neither her
# articles nor CMUdict know, and those spellings are saved to build/g2p/model-words.json (commit it).
# Without --model, that file is used if it's there: so GitHub's build, which has no GPU, gets them too.
#
# The queue drafts each line in pieces: the text between the line's top-level HTML elements.
# So the drafts are keyed by that text, exactly as the browser reads it, and the queue uses one
# whenever it has it (else it drafts from her word list, as before). The build workflow runs this
# after `npm run build`; Fine-tuning only happens with --model (on Geniza; G2P_EPOCHS, default 10).
import json, os, re, sys, glob
from html.parser import HTMLParser
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, HERE)
from cmu2slug_lib import slug, load_cmu
from slugmap import to_slug
from predict_rules import learn, speller, spell_line, WORD

SKIP = {'tl-status', 'coal', 'gtgr'}   # as the queue (build/graflect-words.mjs)
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

class Pieces(HTMLParser):
    """Text nodes directly in <body>, as DOMParser + body.childNodes gives them to the queue."""
    def __init__(self):
        super().__init__(convert_charrefs=True); self.depth, self.out, self.buf = 0, [], ''
    def handle_starttag(self, tag, attrs):
        if self.depth == 0: self.flush()
        if tag not in VOID: self.depth += 1
    def handle_startendtag(self, tag, attrs):
        if self.depth == 0: self.flush()
    def handle_endtag(self, tag):
        if tag not in VOID and self.depth: self.depth -= 1
    def handle_data(self, d):
        if self.depth == 0: self.buf += d
    def flush(self):
        if self.buf.strip(): self.out.append(self.buf)
        self.buf = ''

def pieces(html):
    p = Pieces(); p.feed(html); p.close(); p.flush(); return p.out

def main():
    cmu_path, out_path = sys.argv[1], sys.argv[2]
    opt = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
    only = set(opt('--only').split(',')) if opt('--only') else None
    train, queue = [], {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'localization', '*.json'))):
        name = os.path.basename(f)[:-5]
        if name in SKIP: continue
        try: d = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        en, gt = d.get('en') or {}, d.get('gt') or {}
        for k, e in en.items():
            g = str(gt.get(k) or '')
            if g.strip() and re.search('[-]', g): train.append({'en': e, 'gt': g, 'slug': to_slug(g)})
            elif str(e).strip() and not g.strip() and (only is None or name in only): queue.setdefault(name, []).append(e)
    hers, keep_latin = learn(train)
    cmu = load_cmu(cmu_path)
    segs = sorted({s for lines in queue.values() for e in lines for s in pieces(str(e))})
    words_path = os.path.join(HERE, 'model-words.json')
    guessed = {}
    if not opt('--model') and os.path.exists(words_path):
        guessed = json.load(open(words_path, encoding='utf-8')).get('words', {})
    if opt('--model'):
        # The model, fine-tuned once on all her words, for words neither her articles nor CMUdict know.
        import random, torch
        from g2p_model import load, train as tune, predict
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        random.seed(0); torch.manual_seed(0)
        model, sv, tv, cfg = load(opt('--model'), device)
        mine = [(w, x) for w, x in hers.items() if w.replace("'", '').isalpha()]
        some = random.sample([(w, slug(p)) for w, p in cmu.items() if w.isalpha()], min(len(mine) * 2, 20000))
        tune(model, mine * 4 + some, sv, tv, epochs=int(os.environ.get('G2P_EPOCHS', '10')), lr=2e-4, batch=128, device=device, log=lambda s: None)
        words = sorted({m.group(0).lower().replace('’', "'") for s in segs for m in WORD.finditer(s)})
        need = [w for w in words if w not in hers and w.replace("'", '') not in hers and w not in keep_latin and w not in cmu]
        guessed = dict(zip(need, predict(model, need, sv, tv, device=device)))
        old = json.load(open(words_path, encoding='utf-8')).get('words', {}) if os.path.exists(words_path) else {}
        json.dump({'note': 'The model\'s spellings (SLUG) of queue words that neither her articles nor CMUdict know; made by draft.py --model.',
                   'words': dict(sorted({**old, **guessed}.items()))}, open(words_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    spell = speller(hers, keep_latin, cmu, guessed)
    drafts = {s: spell_line(s, spell) for s in segs}
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    used = sorted({w for s in segs for w in (m.group(0).lower().replace('’', "'") for m in WORD.finditer(s)) if w in guessed and w not in hers and w not in cmu})
    json.dump({'segments': drafts, 'files': sorted(queue), 'model_words': used}, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(drafts)} draft pieces for {sum(len(v) for v in queue.values())} lines in {len(queue)} file(s) → {out_path}'
          + (f'; {len(used)} words spelled by the model' if used else ''))

if __name__ == '__main__':
    main()
