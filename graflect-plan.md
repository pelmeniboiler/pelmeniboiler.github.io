# Plan: the living Graflect engine

> Turn the existing interactive transliterator (Aaron's Graflect design; Wendy's
> tool) from a siloed demo into a build-integrated system: one committed
> dictionary, seeded from the corpus you already wrote, that lets the site draft
> `gt` from English automatically — with you in the loop for anything ambiguous.
> Draft for review; nothing here is built yet.

## What already exists (so we build on it, not over it)

- `scripts/blog/demos/graflect.js` + `graflect-data.js` + `dictionarymanager.js`:
  an English→Graflect engine — longest-match **grapheme rules**, a per-word
  **dictionary** of overrides, **interactive disambiguation** for ambiguous
  clusters, and learn-and-remember. Named dictionaries ("Wendy's Accent"),
  import/export JSON, localStorage-persisted.
- `tools/gt.html`: a fuller workbench (SLUG↔Graflect both ways).
- `slugMap`: glyph ↔ romanization. `romaji.js`: the same architecture for Japanese.

**The gap:** the dictionary lives only in one browser's localStorage, and the
engine only runs in the standalone tool. It never touches the site pipeline.

## The core idea

1. **Commit the dictionary** as a versioned repo asset (`localization/graflect-dict.json`,
   in the DictionaryManager export format). One source of truth: backed up,
   shareable, diffable.
2. **Seed it from the corpus you already wrote.** Every article's localization has
   `en` and `gt` for each key — a large parallel corpus. Mine it into word-level
   pairs to pre-populate the dictionary (details below).
3. **Port the engine to run at build time** (pure logic over the data — no DOM) so
   the build can **draft `gt` from English**: words in the dictionary + unambiguous
   graphemes transliterate automatically; genuinely ambiguous/unknown words are
   **flagged for review** rather than guessed.
4. **Wire it into Sofrut and the staleness tracker.** Editing English re-drafts the
   changed keys; new/ambiguous words surface for you; confirmed choices feed back
   into the committed dictionary, which keeps getting smarter.

## Seeding from the corpus (the head start)

The corpus is aligned per **key** (whole sentences), not per word, so we extract
word pairs conservatively:

- For each key with both `en` and `gt`: split `en` into words and `gt` into
  space-separated Graflect words.
- **When the counts match**, pair them positionally → high-confidence word→Graflect
  entries. Cross-check with `slugMap` (romanize the Graflect, sanity-check it
  against the English word's rough shape) to catch misalignments.
- **When counts differ** (silent words, multi-word phrases, punctuation), skip and
  add to a review list rather than guessing.
- Output: proposed dictionary additions + a report ("N pairs auto-aligned, M keys
  need manual alignment"). You review, then merge. This alone should populate the
  dictionary with most of your actual vocabulary.

Command: `npm run gt:mine` → proposes additions; you approve into the dictionary.

## The key decision (needs your call)

**Is `gt` a *source* or a *build output*?**

- **A — gt stays hand-written, engine assists.** The engine drafts in Sofrut; you
  paste/refine; `gt` in the localization files stays authoritative. Lowest risk,
  keeps every hand-tuned line exactly as-is.
- **B — gt becomes generated** from `en` + the dictionary (with per-key manual
  overrides for anything the dictionary can't capture). This is what makes "edit
  English → Graflect updates automatically" fully real, but it means trusting the
  dictionary to reproduce your accent, and moving hand-tuned lines into overrides.

Recommendation: **start at A**, and let the dictionary grow from mining + Sofrut
use until its output reliably matches your hand versions; then opt into B
per-article when you're confident. The corpus-mining + a consistency check (below)
tell you exactly how close the engine's output is to what you already wrote.

## Components / phases

1. **Dictionary asset**: export current "Wendy's Accent" → `localization/graflect-dict.json`; commit.
2. **Corpus miner** (`build/gt-mine.mjs`, `npm run gt:mine`): en↔gt → proposed word pairs + review report.
3. **Node engine** (`build/graflect-engine.mjs`): the transliteration logic as pure Node, sharing `graflect-data.js`. Build-time flag (not prompt) on ambiguity.
4. **Consistency linter** (extends `validate-gt`): flag where the same English word was transliterated inconsistently across the corpus, or where the engine disagrees with your hand `gt` — a map of exactly where dictionary vs. hand-work diverge.
5. **Sofrut gt panel**: draft with the existing engine + disambiguation; confirmed choices append to the committed dictionary (downloadable to commit).
6. **`gt:draft` + staleness tracker**: on English edit, re-draft changed keys; drafts start "untracked" until blessed.
7. **Stretch — "read any page in Graflect"** live, once the dictionary is rich enough. Graflect becomes a language the whole site speaks, powered by your engine.
8. **The writeup** (see below).

## The writeup (worth doing)

A blog post: how a personal constructed-script transliterator went from a demo to a
living, build-integrated writing system — the corpus-mining bootstrap, the
human-in-the-loop dictionary, the "edit English, Graflect follows" loop. Genuinely
inspiring for anyone building a conlang, a personal orthography, or a hand-crafted
site. Keywords: `Meta`, `Language`. Credits Aaron's design explicitly.

## Open questions
- Dictionary location/format: `localization/graflect-dict.json` in the
  DictionaryManager export shape — good?
- Build-time ambiguity: flag-only, or a configurable default sound per grapheme?
- Corpus alignment: equal-word-count keys only (safe), or attempt fuzzier
  alignment with `slugMap` verification?
- Source vs. output for `gt` (decision A/B above).
