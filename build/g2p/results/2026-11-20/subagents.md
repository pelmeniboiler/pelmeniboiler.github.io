# Claude in Kanna's place, 2026-11-20

Graded leaving one article out; G2P_EPOCHS=10; Kanna is g2p.pt; each model ran as a Claude Code subagent (haiku, sonnet, opus), at its default effort, not through the API. Fable could not run: it needs usage credits this plan doesn't have. Every run is listed.

| | contestant | words right | lines exact | hers: in her other articles | cmu: only CMUdict knows | unknown: nobody knows |
|---|---|---|---|---|---|---|
| A | the rules alone | 5758/6167 (93.4%) | 187/419 | 97.6% of 4549 | 70.6% of 1831 | 12.2% of 222 |
| haiku | the rules, then haiku | 5781/6167 (93.7%) | 191/419 | 97.6% of 4549 | 70.6% of 1831 | 22.5% of 222 |
| haiku+ | haiku before CMUdict | 5622/6167 (91.2%) | 163/419 | 97.6% of 4549 | 62.4% of 1831 | 22.5% of 222 |
| sonnet | the rules, then sonnet | 5787/6167 (93.8%) | 193/419 | 97.5% of 4549 | 70.6% of 1831 | 25.2% of 222 |
| sonnet+ | sonnet before CMUdict | 5807/6167 (94.2%) | 189/419 | 97.5% of 4549 | 72.4% of 1831 | 25.2% of 222 |
| opus | the rules, then opus | 5786/6167 (93.8%) | 191/419 | 97.5% of 4549 | 70.6% of 1831 | 27.0% of 222 |
| opus+ | opus before CMUdict | 5868/6167 (95.2%) | 212/419 | 97.5% of 4549 | 75.8% of 1831 | 27.0% of 222 |

Groups count every English word in it, Latin ones included, so they are for comparing contestants, not totals.
For "only CMUdict knows", the fair Kanna is C' or D': Kanna herself has memorized CMUdict.

How: `LLM_EXPORT` wrote one request per held-out article (only her other articles' words in it), each model read it
as a subagent with no other file, no commands and no web, and wrote its answers to `subagent-answers/<model>/<article>.json`;
then `LLM_ANSWERS` graded them (build/g2p/subagents.md). Each model gave one answer per word, used in both rows.

Examples, CMUdict through her rules against Opus:
- Opus right, CMUdict wrong: sphere sfīr (CMUdict sfir), detail dītēl (ditēl), breakfast brekfist (brekfxst),
  monitor mánitr (mánxtr), incredibly inkrediblī (inkredxblī).
- CMUdict right, Opus wrong: cherries cerīz (Opus c4īz), turbine trbain (trbin), poor pür (pōr), newer nür (nüwr),
  vibrant vaibrxnt (vaibrint).
On the words only CMUdict knows, Opus was right on 151 where CMUdict was wrong, and wrong on 56 where CMUdict was right.
