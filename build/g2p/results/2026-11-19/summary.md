# Geniza training results, 2026-11-19 (v15)

**Best: rules-first with 10 fine-tuning epochs: 5688 of 6091 words (93.4%), 157 of 405 lines exact.**
That's +40 words over v14 rules (5648, 92.7%), but −8 exact lines (165 → 157). The model was asked about
unknown words only, and it cut that bucket from 94 misses to 54.

## Setup

- Geniza: Windows 11, Tesla P40 (24 GB, sm_61) at index 0, plus a GTX 970 (display); NVIDIA driver 537.13 (CUDA 12.2).
- Python 3.12.6 venv, torch 2.7.1+cu118 (cu126 fails on this driver, as before). Node 22.12.0, `npm.cmd`.
- `CUDA_DEVICE_ORDER=PCI_BUS_ID`, `CUDA_VISIBLE_DEVICES=0`; `pretrain.py` printed `device: cuda Tesla P40`.
- Repo at `main` 8d838be. CMUdict from cmusphinx master, at the repo root (git-ignored).

## Baseline (v14, no GPU)

`predict_rules.py`: **5648/6091 words, 165/405 lines exact**, as the briefing expects (the grader prints 93% from rounding).

## Pretraining

- 122,926 CMUdict words through her rules, 5.6M parameters, 20 epochs, batch 512; final loss 0.846.
- **Held-out CMUdict words reproduced exactly: 66%** (the previous checkpoint: 65%).
- **10.2 min.** P40 while training (1 s samples, 559 busy samples): GPU-Util mean 96% (71–98%),
  power mean 143 W, peak 169 W of 250 W. The GPU is busy, but it isn't drawing full power on a small model.

## Grades (all settings tried, each once)

| Setting | Words | Lines exact |
|---|---|---|
| v14 rules (no model) | 5648 (92.7%) | 165 |
| rules-first, `G2P_EPOCHS=10` | **5688 (93.4%)** | 157 |
| rules-first, `G2P_EPOCHS=30` (default) | 5684 (93.3%) | 158 |
| rules-first, `G2P_EPOCHS=60` | 5682 (93.3%) | 157 |
| `--model-first`, 30 epochs | 5551 (91.1%) | 145 |

The three rules-first settings are within 6 words of each other: epochs barely matter, and 10 is the cheapest.
Model-first loses 97 words to v14, because the model is worse than the CMUdict lookup on words CMUdict has.
The four grades ran at the same time on the P40, so their wall times (20, 48, 59 and 48 min) are slower than a run alone.
The miss report's collect step, rerun alone at 10 epochs, reproduced 5688/157 exactly.

## Miss report, v14 vs v15 (`build/g2p/misses`, rules-first, 10 epochs)

| Kind | v14 | v15 |
|---|---|---|
| `cmu_differs` CMUdict through her rules ≠ her | 248 | 248 |
| `latin` left in Latin | 115 | 24 |
| `model_oov` model guessed an unknown word wrong | — | 51 |
| `cmu_alt` another CMUdict pronunciation matches hers | 23 | 23 |
| `hers_new` / `hers_variant` / `seen_unlearned` | 16 / 10 / 3 | 16 / 11 / 3 |
| `count_mismatch` / `extra` | 23 / 5 | 23 / 4 |
| `context` | 1 | 1 |
| **Total (aligned)** | **444** | **404** |

The `latin` bucket in v14 is the briefing's 94 unknown words plus the 21 words she usually keeps in Latin
but spelled once. In v15, 24 remain in Latin, mostly from those 21 (Wendy, system, program, chart,
article); the model isn't asked about words she keeps in Latin. So the unknown words went **94 → 54** (51 wrong
guesses + 3), which accounts for the +40 words. The other buckets are unchanged, since the model isn't asked about them.

## The model's unknown-word guesses (SLUG)

Right, among the graded words (47 tokens): plushies `plxšīz`, keymap `kīmæp`, encoders `inkōdrz`,
pinkies `pīngkīz`, grapheme `græfīm`, digraphs `daigræfs`, rhotic `rátik`, netizens `netizinz`,
featural `fīcrxl`, swirly `swrlī`, cityscapes `sitīskēps`, silkscreen `silkskrīn`, spacebar `spēsbár`,
wasteboard `wēstbōrd`, lubing `lübīngg`, zmanim `zmänim`, lossy `lásī`.

Wrong (model → hers):

| English | Model | Hers |
|---|---|---|
| Transliteration | cränzlitrēšin | cränzlitxrēšxn |
| Transliterations | cränzlitxrēšxnz | cränzlitrēšinz |
| phonologically | fxnálxjiklī | fōnxlájikxlī |
| Romanization | rōmxnxzēšin | rōminaizēšin |
| horrifically | hōrifikxlī | hōrifiklī |
| Aquisition | xkwizišin | ækwizišin |
| purpley | prplī | prpxlī |
| Rosehips | rōšips | rōzhips |
| Postface | pástfēs | pōstfēs |
| lossless | láslis | lásles |
| Bubblegum | bxbligxm | bxbxlgxm |
| Shoshana | šōšánx | šōšáná |
| chalakim | cxlákīm | khälxkīm |
| Techelet | tekxlet | tkhelet |
| Zelyonny | zelīánī | zelyōnī |
| Rindswurst | rindswrts | rhindsvxrhst |
| AAAAAH | xxxxhá | áááááh |

Many wrong guesses are one vowel off (the x/i question again). The Hebrew, Russian and German names (chalakim,
Techelet, Zelyonny, Rindswurst) use sounds her rules never produce from CMUdict (kh, rh), so pretraining never showed the model those spellings.

## Things to watch

- **Names she keeps in Latin (the briefing's watch item).** The model gave glyphs to 116 word tokens that she
  keeps in Latin in that line: acronyms and product names, mostly in `sunshine` (PCB, QMK, KiCad, Kailh,
  Ergodox, Colemak, TRRS), `dixie` (NIKKOR, KommandoStore, MuseScore), `graflect_ipa` (Unicode, UCSUR,
  MayCXC) and `tbns` (Substack, CSS). These cost no words, but lines that are right except for her kept
  Latin rose from 56 to 71 (of these, she kept Latin in 50 → 65), which explains the 165 → 157 drop in exact lines.
  `context` ("the" → dhī before a Latin name) stayed at 1, so the effect on "the" is negligible.
  The rule wasn't changed, since that's her decision.
- **Markup splits words.** In `graflect_ipa:slug_section_p1`, `<b>S</b>tandardized <b>L</b>atin…` reaches the
  speller as `tandardized`, `atin`, `nderstudies`, `raflect`. She keeps these in Latin, so nothing is lost here.
  Any system that spells words in pieces split by tags will do this.
- **English typos in her articles** reach the model as unknown words: Aquisition, suprising, accomodations,
  accidentially. Her Graflect for them is fine. This is only why CMUdict can't help with them.
- The analyzer prints `x â†’ her` in PowerShell. That's only how the Windows console decodes the UTF-8 →
  character; the files are UTF-8.
