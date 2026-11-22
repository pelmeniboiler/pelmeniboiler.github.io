# build/g2p/pretrain.py — pre-train the G2P model on CMUdict through her rules.
#
#   python3 build/g2p/pretrain.py cmudict.dict g2p.pt              # the real run (P40: minutes)
#   python3 build/g2p/pretrain.py cmudict.dict g2p.pt --small      # a smaller model a CPU can train in an hour or so
#   python3 build/g2p/pretrain.py cmudict.dict g2p.pt --tiny       # a smoke test on a CPU
#   (build/g2p/second_opinion.py calls pretrain() with words to leave out, so the model has never seen them)
#
# On the P40 (sm_61): the cu118 build works (pip install torch --index-url https://download.pytorch.org/whl/cu118).
# On driver 537.13 the cu126 build failed with cudaErrorDevicesUnavailable; newer builds may have dropped Pascal.
# With two GPUs, pick the P40: CUDA_DEVICE_ORDER=PCI_BUS_ID and CUDA_VISIBLE_DEVICES=<its index>.
# On Windows the command is python, not python3. P40 timing: 20 epochs ≈ 10 minutes, 65% of held-out words exact.
import os, sys, random, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu2slug_lib import slug, load_cmu
from g2p_model import Vocab, G2P, train, predict, save

def pretrain(cmu_path, out, tiny=False, small=False, exclude=(), pairs=None, epochs=None, extra=()):
    """pairs: [(word, SLUG)] to learn from instead of CMUdict through her rules (build/g2p/tohru.py);
    epochs: instead of 20 (8 with small); extra: more copies of some pairs, to weight them (never held out)."""
    exclude = set(exclude)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print('device:', device, torch.cuda.get_device_name(0) if device == 'cuda' else '')
    random.seed(0); torch.manual_seed(0)
    if pairs is None: pairs = [(w, slug(ph)) for w, ph in load_cmu(cmu_path).items()]
    pairs = [(w, s) for w, s in pairs if w.replace("'", '').isalpha() and len(w) <= 40 and w not in exclude]
    pairs = [(w, s) for w, s in pairs if '?' not in s]
    random.shuffle(pairs)
    held, pairs = pairs[:2000], pairs[2000:]
    held_words = {w for w, _ in held}
    if extra: pairs += [(w, s) for w, s in extra if w.isalpha() and w not in held_words and w not in exclude]; random.shuffle(pairs)
    if tiny: pairs, held = pairs[:3000], held[:200]
    letters = "abcdefghijklmnopqrstuvwxyz'"
    sv = Vocab(letters)
    # Every SLUG character she might need, not just the ones CMUdict produces.
    tv = Vocab(set(''.join(s for _, s in pairs)) | set('abcdefghijklmnopqrstuvwxyz4īüēäōõöáæšžx'))
    cfg = dict(d=64, heads=2, layers=1, ff=128) if tiny else dict(d=128, heads=4, layers=2, ff=512) if small else dict(d=256, heads=4, layers=3, ff=1024)
    model = G2P(len(sv.itos), len(tv.itos), **cfg).to(device)
    print(f'{len(pairs)} words, {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M parameters')
    train(model, pairs, sv, tv, epochs=1 if tiny else epochs or (8 if small else 20), batch=256 if tiny else 512, device=device)
    got = predict(model, [w for w, _ in held], sv, tv, device=device)
    print(f'held-out words reproduced exactly: {sum(g == s for g, (_, s) in zip(got, held)) / len(held):.0%}')
    save(out, model, sv, tv, cfg); print('saved', out)

def main():
    pretrain(sys.argv[1], sys.argv[2], tiny='--tiny' in sys.argv, small='--small' in sys.argv)

if __name__ == '__main__':
    main()
