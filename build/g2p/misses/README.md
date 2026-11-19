# Miss report

Why the rules system misses the words it misses, at any commit. From the P40 report, made to
work with every version of `build/g2p/predict_rules.py`.

    node build/g2p/misses/collect.mjs REPO NAME RUNS -- python3 build/g2p/misses/dump.py REPO cmudict.dict
    node build/g2p/misses/collect.mjs REPO NAME RUNS -- python3 build/g2p/misses/dump.py REPO cmudict.dict --model g2p.pt   # the model (see ../TRAINING.md)
    node build/g2p/misses/collect.mjs REPO NAME RUNS -- node build/g2p/misses/dumpdict.mjs REPO dict|learn   # the dictionary system
    node build/g2p/misses/analyze.mjs REPO RUNS NAME...     # breakdown.json and misses-NAME.tsv in RUNS
    node build/g2p/misses/sources.mjs RUNS NAME...        # right words by source; CMUdict misses by size

REPO is a checkout (a `git worktree` for an old commit), graded with its own articles, system and SLUG.
`inprogress/graflect-graded.html` charts these at each step.
