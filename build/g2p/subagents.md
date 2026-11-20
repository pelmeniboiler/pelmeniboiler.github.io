# Claude in Kanna's place, without API keys

A Claude Code session can run the comparison on its plan, with subagents instead of API calls:

1. Write one request per held-out article (each holds only the words of her other articles):

       LLM_EXPORT=tasks python3 build/g2p/kanna_vs_rules.py cmudict.dict --no-git --only none --llms x --name export

2. For each model (haiku, sonnet, opus; fable if the plan has it) and each `tasks/<article>.md`, start a subagent
   with that model and this prompt: read only that one file, spell every word in its list in SLUG the way she would,
   write `answers/<model>/<article>.json` as one JSON object {word: SLUG}, open no other file, run no commands,
   don't search. (Anything else it reads could hold her spelling of the held-out words.)

3. Grade them:

       LLM_ANSWERS=answers python3 build/g2p/kanna_vs_rules.py cmudict.dict --no-git --only A --llms haiku,sonnet,opus --name subagents

Each model answers each word once; "the rules, then it" uses its answers for the words nobody knows, "it before
CMUdict" for every word she hasn't written. Subagents run at their default effort, which the API run can set.
