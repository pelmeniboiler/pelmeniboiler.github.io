# Training the Graflect model on Geniza: a briefing

For a Claude session on Geniza (Wendy's PC, Nvidia P40). Read all of this before running anything.

## What this is

Graflect is Wendy's phonetic script; her articles on this site have Graflect versions she wrote by hand
(`localization/*.json`, the `gt` key, private-use glyphs U+E000–F8FF). SLUG is the Latin stand-in for the glyphs
(`build/g2p/slugmap.py`): always talk about Graflect spellings in SLUG. In SLUG, "·" marks a boundary
between two glyphs that would otherwise read as one (r·r is two r glyphs, rr is the trilled r; w·ī, r·ä likewise),
"yu" means yü, ‹…› is Latin she kept.

The goal: spell English the way she does. The grader (`npm run gt:eval`) holds out one article at a time,
lets the system learn from her other articles, spells the held-out article's English, and counts words spelled
exactly as she did.

## Where things stand (v14)

The rules system, `build/g2p/predict_rules.py`, spells each word with:
1. her own spelling, if she has written the word in another article (or Latin, if she keeps it in Latin);
2. else CMUdict through her rules (`build/g2p/cmu2slug_lib.py`);
3. else the English word, left in Latin.

Then two context rules: "the" is dhī before a vowel (or a Latin name starting with one), "have to" is hæf tü.
Words she hasn't written stay Latin before step 2 if they have two or more capitals (PCB, KiCad) or are the ending
of a dotted name (system.settings): `latin_name` in `predict_rules.py`, her decision after v15.

Score: **5648 of 6091 words (92.7%), 165 of 405 lines exact.** That's the number to beat.

Where the 444 misses come from (`build/g2p/misses`, v14):

| Kind | Misses | What it is |
|---|---|---|
| CMUdict ≠ her | 248 | 135 only the unstressed vowel (x or i); the rest her accent: dikšin4ī, sfīr, práblim |
| Unknown word, left in Latin | 94 | not in CMUdict, not in her other articles: pinkies, glyphs, encoders, plushies |
| Her own spellings disagree | 50 | read/use/a by context; 21 words she usually keeps in Latin but spelled once |
| Structure and context | 29 | lines she rewrote instead of transliterating |
| Another CMUdict pronunciation | 23 | CMUdict lists one that matches hers; the rules picked another |

**The model's job is mainly the 94 unknown words.** In the default rules-first mode it is only asked for words that
neither her articles nor CMUdict know. It might also help with the x/i vowel.

History: v0, her hand-made dictionary, scored 44.9%; the first rules system 85.6%; proofreading her articles and
rules from three review rounds took it to 92.7%. The last model run (before these changes, at 85.9% for rules) added
39 words and pretrained to 65% of held-out CMUdict words exact.

## Why it has to be retrained

The rules changed a lot since `g2p.pt` was made, and pretraining data is CMUdict *through her rules*: -ing is
īngg, w then ī is the wī glyph, i before a final d/z/n/t/s, CMUdict now prefers the pronunciation with unstressed
IH, and SLUG has "·". The old checkpoint has no "·" in its vocabulary. Delete or ignore any old `g2p.pt`.

**Round 3 is open** (`vault/reviews/graflect-3.json`, "Graflect habits": ī before r, yü for a weak u, and others).
Her answers will change the rules again. Don't apply them yourself; the main session does that. Train now anyway:
pretraining takes about 10 minutes, so retraining after round 3 is cheap.

## Setup (Windows, PowerShell)

- `git pull` on `main` in the repo folder. Node and npm work; use `npm.cmd`, not `npm` (PowerShell's npm.ps1 eats `--`).
- Python is `python`, not `python3`. Torch: the cu118 build works on the P40 (sm_61):
  `pip install torch --index-url https://download.pytorch.org/whl/cu118`. The cu126 build failed on driver 537.13.
- With two GPUs, pick the P40: `$env:CUDA_DEVICE_ORDER="PCI_BUS_ID"; $env:CUDA_VISIBLE_DEVICES="<its index>"`.
  `pretrain.py` prints the device name: make sure it says P40.
- CMUdict: if it isn't on Geniza already, download
  `https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict`. Below, `CMU` is its path.
- In `--cmd "..."` use forward slashes in paths.

## Steps

1. **Check the baseline** (no GPU):
   `npm.cmd run gt:eval -- --cmd "python build/g2p/predict_rules.py CMU"` → must print 92% (5648/6091), 165/405.
   If it doesn't, stop and say so: something differs between Geniza and the repo.
2. **Pretrain**: `python build/g2p/pretrain.py CMU g2p.pt`. Note the held-out exact % it prints and the time.
   While it runs, `nvidia-smi -l 1` in another window: report GPU-Util and power draw (a P40 tops out at 250 W).
3. **Grade the model**, rules-first (the default):
   `npm.cmd run gt:eval -- --cmd "python build/g2p/predict_model.py g2p.pt CMU"`.
   Then `--model-first` (append it after CMU) for comparison. The fine-tuning epochs per article come from
   `G2P_EPOCHS` (default 30). Try 10 and 60 too, once each. No more than that, and report all of them: every
   setting tried and kept for being best makes the score a little flattering.
4. **Miss report for the best setting** (sorts every miss by kind; `build/g2p/misses/README.md`):
   ```
   node build/g2p/misses/collect.mjs . v15 runs -- python build/g2p/misses/dump.py . CMU --model g2p.pt
   node build/g2p/misses/collect.mjs . v14 runs -- python build/g2p/misses/dump.py . CMU
   node build/g2p/misses/analyze.mjs . runs v14 v15
   ```
   (add `--model-first` to the first if that was best; set `G2P_EPOCHS` the same as in step 3). The collect line
   must print the same score as step 3. `model_oov` is the model guessing an unknown word wrong; compare it with the 94.

## Things to watch

- **Names she keeps in Latin.** The model gives glyphs to every unknown word, including names she would leave in
  Latin. The word score doesn't count her Latin words, but exact lines drop, and "the" before them can become dhī
  wrongly (the `context` kind in the report). A smoke test with a useless model went 165 → 151 exact lines for this
  reason. Report how often it happens; don't change the rule. It's her decision.
- **GPU.** Pretraining batch is 512, a small model on short words: the GPU is busy but probably not full. If
  GPU-Util is low, say so; don't change batch size or model size for the comparison run.
- Don't edit her articles, rules, dictionary or SLUG, and don't decide any spelling: those are her calls, asked in
  the review page or in chat. If something looks like her slip, list it in SLUG.

## Bring back

On a new branch `geniza/training-<date>` (never `main`), commit only `build/g2p/results/<date>/`:
- `summary.md`: setup (torch, CUDA, GPU), pretraining time and held-out %, every grade from step 3 (words and lines),
  GPU-Util and power, the miss-report counts for v14 and v15 side by side, 10–20 examples of the model's unknown-word
  guesses against hers (SLUG), and anything odd;
- `breakdown.json` and `misses-v15.tsv` from `runs/`.

Push the branch. Don't commit `g2p.pt` or `runs/` (they're big; `*.pt` is git-ignored). Tell Wendy briefly what
it scored, in plain words.
