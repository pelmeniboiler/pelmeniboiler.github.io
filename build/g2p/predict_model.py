# build/g2p/predict_model.py — the model as a system for the grader.
#
#   npm run gt:eval -- --cmd "python3 build/g2p/predict_model.py g2p.pt cmudict.dict"
#   (on Windows: python, and npm.cmd from PowerShell, whose npm.ps1 eats the --)
#
# For each held-out article the grader gives TRAIN (her other articles) and TEST (this one's English).
# Her words from TRAIN are learned as in predict_rules.py; the pre-trained model is fine-tuned on them
# (mixed with some CMUdict so it keeps what it knew), then: her own spelling if she has written the
# word (or Latin, if she leaves it in Latin), else CMUdict through her rules, else the model.
# --model-first skips CMUdict and asks the model for every new word (worse on the P40: 85% vs 86%).
import json, os, re, sys, random, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu2slug_lib import slug, load_cmu
from g2p_model import load, train, predict
from predict_rules import learn, speller, spell_line, WORD

def main():
    ckpt, cmu_path = sys.argv[1], sys.argv[2]
    rules_first, epochs = '--model-first' not in sys.argv, int(os.environ.get('G2P_EPOCHS', '30'))
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    random.seed(0); torch.manual_seed(0)
    model, sv, tv, cfg = load(ckpt, device)
    cmu = load_cmu(cmu_path)
    train_lines = [json.loads(l) for l in open(os.environ['TRAIN'], encoding='utf-8') if l.strip()]
    hers, keep_latin = learn(train_lines)
    mine = [(w, s) for w, s in hers.items() if w.replace("'", '').isalpha()]
    keep = random.sample([(w, slug(p)) for w, p in cmu.items() if w.isalpha()], min(len(mine) * 2, 20000))
    train(model, mine * 4 + keep, sv, tv, epochs=epochs, lr=2e-4, batch=128, device=device, log=lambda s: None)
    tests = [json.loads(l) for l in open(os.environ['TEST'], encoding='utf-8') if l.strip()]
    words = sorted({m.group(0).lower().replace('’', "'") for t in tests for p in re.split(r'(<[^>]+>|&#?\w+;)', t['en']) if not p.startswith(('<', '&')) for m in WORD.finditer(p)})
    need = [w for w in words if w not in hers and w.replace("'", '') not in hers and w not in keep_latin and not (rules_first and w in cmu)]
    guessed = dict(zip(need, predict(model, need, sv, tv, device=device)))
    spell = speller(hers, keep_latin, cmu if rules_first else None, guessed)
    with open(os.environ['OUT'], 'w', encoding='utf-8') as out:
        for t in tests:
            out.write(json.dumps({'id': t['id'], 'slug': spell_line(t['en'], spell)}, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
