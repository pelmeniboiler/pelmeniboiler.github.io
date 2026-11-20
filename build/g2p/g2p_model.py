# build/g2p/g2p_model.py — a small character transformer: English spelling → SLUG.
#
# Pre-trained once on CMUdict through her rules (pretrain.py), then fine-tuned on her own words
# (predict_model.py does that per article, from the training articles only, so the grade stays fair).
# Sized for a Tesla P40 (24 GB, fp32: the P40 has no fast fp16), but it runs on a CPU too, slowly.
import math, random, torch, torch.nn as nn

PAD, BOS, EOS = 0, 1, 2

class Vocab:
    def __init__(self, chars): self.itos = ['<pad>', '<s>', '</s>'] + sorted(set(chars)); self.stoi = {c: i for i, c in enumerate(self.itos)}
    def encode(self, s, eos=True): return [self.stoi[c] for c in s if c in self.stoi] + ([EOS] if eos else [])
    def decode(self, ids): return ''.join(self.itos[i] for i in ids if i > EOS)
    def state(self): return self.itos
    @classmethod
    def load(cls, itos): v = cls([]); v.itos = itos; v.stoi = {c: i for i, c in enumerate(itos)}; return v

class G2P(nn.Module):
    def __init__(self, n_src, n_tgt, d=256, heads=4, layers=3, ff=1024, drop=0.1, max_len=48):
        super().__init__()
        self.src_emb, self.tgt_emb = nn.Embedding(n_src, d, padding_idx=PAD), nn.Embedding(n_tgt, d, padding_idx=PAD)
        self.pos = nn.Parameter(torch.randn(max_len + 2, d) * 0.02)
        self.tf = nn.Transformer(d, heads, layers, layers, ff, drop, batch_first=True)
        self.out = nn.Linear(d, n_tgt); self.d = d
    def forward(self, src, tgt_in):
        s = self.src_emb(src) * math.sqrt(self.d) + self.pos[: src.size(1)]
        t = self.tgt_emb(tgt_in) * math.sqrt(self.d) + self.pos[: tgt_in.size(1)]
        mask = self.tf.generate_square_subsequent_mask(tgt_in.size(1)).to(src.device)
        h = self.tf(s, t, tgt_mask=mask, src_key_padding_mask=src == PAD, tgt_key_padding_mask=tgt_in == PAD, memory_key_padding_mask=src == PAD)
        return self.out(h)

def pad(seqs):
    n = max(len(s) for s in seqs); return torch.tensor([s + [PAD] * (n - len(s)) for s in seqs])

def batches(pairs, sv, tv, size, shuffle=True):
    pairs = list(pairs)
    if shuffle: random.shuffle(pairs)
    for i in range(0, len(pairs), size):
        chunk = pairs[i:i + size]
        src = pad([sv.encode(w) for w, _ in chunk])
        tgt = [tv.encode(s) for _, s in chunk]
        yield src, pad([[BOS] + t[:-1] for t in tgt]), pad(tgt)

def train(model, pairs, sv, tv, epochs, lr=5e-4, batch=256, device='cpu', log=print):
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    loss_fn = nn.CrossEntropyLoss(ignore_index=PAD, label_smoothing=0.1)
    model.train()
    for ep in range(epochs):
        total = n = 0
        for src, tin, tout in batches(pairs, sv, tv, batch):
            src, tin, tout = src.to(device), tin.to(device), tout.to(device)
            loss = loss_fn(model(src, tin).reshape(-1, len(tv.itos)), tout.reshape(-1))
            opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step()
            total += loss.item() * src.size(0); n += src.size(0)
        log(f'  epoch {ep + 1}/{epochs}: loss {total / max(n, 1):.3f}')

@torch.no_grad()
def predict(model, words, sv, tv, device='cpu', batch=512, max_len=40):
    model.eval(); out = []
    for i in range(0, len(words), batch):
        chunk = words[i:i + batch]
        src = pad([sv.encode(w) for w in chunk]).to(device)
        ys = torch.full((len(chunk), 1), BOS, device=device)
        done = torch.zeros(len(chunk), dtype=torch.bool, device=device)
        for _ in range(max_len):
            nxt = model(src, ys)[:, -1].argmax(-1)
            ys = torch.cat([ys, nxt[:, None]], 1); done |= nxt == EOS
            if done.all(): break
        for row in ys.tolist():
            row = row[1:]; out.append(tv.decode(row[: row.index(EOS)] if EOS in row else row))
    return out

@torch.no_grad()
def score(model, pairs, sv, tv, device='cpu', batch=512):
    """How likely the model finds each (word, SLUG) spelling: the summed log-probability of its characters."""
    model.eval(); out = []
    for src, tin, tout in batches(pairs, sv, tv, batch, shuffle=False):
        src, tin, tout = src.to(device), tin.to(device), tout.to(device)
        lp = torch.log_softmax(model(src, tin), -1).gather(-1, tout[..., None])[..., 0]
        out += (lp * (tout != PAD)).sum(-1).tolist()
    return out

def save(path, model, sv, tv, cfg): torch.save({'model': model.state_dict(), 'src': sv.state(), 'tgt': tv.state(), 'cfg': cfg}, path)
def load(path, device='cpu'):
    ck = torch.load(path, map_location=device)
    sv, tv = Vocab.load(ck['src']), Vocab.load(ck['tgt'])
    model = G2P(len(sv.itos), len(tv.itos), **ck['cfg']).to(device); model.load_state_dict(ck['model'])
    return model, sv, tv, ck['cfg']
