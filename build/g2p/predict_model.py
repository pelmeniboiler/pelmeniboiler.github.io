# build/g2p/predict_model.py — the model as a system for the grader.
#
#   npm run gt:eval -- --cmd "python3 build/g2p/predict_model.py g2p.pt cmudict.dict"
#
# For each held-out article the grader gives TRAIN (her other articles) and TEST (this one's English).
# Her words from TRAIN are learned as in predict_rules.py; the pre-trained model is fine-tuned on them
# (mixed with some CMUdict so it keeps what it knew), then: her own spelling if she has written the
# word, else the model. --rules-first uses CMUdict through her rules before the model.
import json, os, re, sys, random, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu2slug_lib import slug, load_cmu
from g2p_model import load, train, predict
from predict_rules import learn

def main():
    ckpt, cmu_path = sys.argv[1], sys.argv[2]
    rules_first, epochs = '--rules-first' in sys.argv, int(os.environ.get('G2P_EPOCHS', '30'))
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    random.seed(0); torch.manual_seed(0)
    model, sv, tv, cfg = load(ckpt, device)
    cmu = load_cmu(cmu_path)
    train_lines = [json.loads(l) for l in open(os.environ['TRAIN'], encoding='utf-8') if l.strip()]
    hers = {w: s for w, s in learn(train_lines).items() if w.replace("'", '').isalpha()}
    mine = list(hers.items())
    keep = random.sample([(w, slug(p)) for w, p in cmu.items() if w.isalpha()], min(len(mine) * 2, 20000))
    train(model, mine * 4 + keep, sv, tv, epochs=epochs, lr=2e-4, batch=128, device=device, log=lambda s: None)
    tests = [json.loads(l) for l in open(os.environ['TEST'], encoding='utf-8') if l.strip()]
    words = sorted({m.group(0).lower().replace('’', "'") for t in tests for p in re.split(r'(<[^>]+>|&#?\w+;)', t['en']) if not p.startswith(('<', '&')) for m in re.finditer(r"[A-Za-z][A-Za-z'’]*", p)})
    need = [w for w in words if w not in hers and w.replace("'", '') not in hers and not (rules_first and w in cmu)]
    guessed = dict(zip(need, predict(model, need, sv, tv, device=device)))
    def word(m):
        k = m.group(0).lower().replace('’', "'")
        if k in hers: return hers[k]
        if k.replace("'", '') in hers: return hers[k.replace("'", '')]
        if rules_first and k in cmu: return slug(cmu[k])
        return guessed.get(k) or '‹' + m.group(0) + '›'
    with open(os.environ['OUT'], 'w', encoding='utf-8') as out:
        for t in tests:
            s = ''.join(p if re.match(r'<[^>]+>|&#?\w+;', p) else re.sub(r"[A-Za-z][A-Za-z'’]*", word, p) for p in re.split(r'(<[^>]+>|&#?\w+;)', t['en']))
            out.write(json.dumps({'id': t['id'], 'slug': s}, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
