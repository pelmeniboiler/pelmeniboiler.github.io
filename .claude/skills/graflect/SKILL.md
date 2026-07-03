---
name: graflect
description: Use when writing, transliterating, or validating text in Graflect — the featural phonetic script (Unicode Private Use Area, U+EC70–U+ECEF) used on pelmeniboiler.github.io. Trigger for localizing the site's `gt` strings, filling Graflect placeholders in localization/*.json, or checking that a string is valid Graflect.
---

# Graflect

Graflect is a **featural phonetic alphabet** (designed by Aaron, a friend of the
site's author — not the author) encoded in the Unicode Private Use Area
(**U+EC70–U+ECEF**). It renders **pronunciation, not spelling**: transcribe how a
word *sounds* in English, then map each phoneme to its glyph. It is NOT Japanese
and NOT romaji — the site's `romaji.js` is a Graflect input method, not a
Japanese tool.

## Hard rules

- Use **only** glyphs from the chart below. Never leave Latin, Cyrillic, or other
  letters/digits **inside** a Graflect word.
- Transcribe the **pronunciation**, not the orthography (e.g. "phone" → f-ō-n).
- Preserve any HTML tags, entities, and markup exactly where they are.
- Proper nouns with no established Graflect form may stay in Latin as their own
  token (the repo does this for "Harvard", font names, etc.) — but never mix
  scripts *within* a single word.

## The method (the author's "whine loop")

Prompt engineering alone will NOT stop a model from sneaking in non-Graflect
glyphs. The only reliable method:

1. Give the model the **full glyph chart** (below).
2. Ask it to render the **English pronunciation** using ONLY these glyphs.
3. **Validate** (see below).
4. If it slipped non-Graflect characters in, paste the **exact offending
   characters** back at it and ask it to redo using only the chart. Repeat until
   clean. Pasting the specific offenders back is what makes it converge.

## Validation

- Graflect codepoints occupy **U+EC70–U+ECEF**.
- Reject a value if any whitespace-delimited "word" contains **both** a Graflect
  glyph **and** any other letter or digit (mixed-script word = wrong).
- Reject a value that should be Graflect but contains **no** Graflect glyph.
- This repo automates exactly this in `build/tl-auto.mjs` (`gtGlyphsOk()`,
  `isGraflect()`, and the one-retry whine loop) and `build/validate-gt.mjs`.

## Chart (glyph = romanization)

Each line is one glyph followed by its romanization / phoneme:

```
 = p
 = b
 = t
 = d
 = k
 = g
 = f
 = v
 = th
 = dh
 = s
 = z
 = š
 = ž
 = h
 = m
 = n
 = ng
 = l
 = r
 = w
 = y
 = ī
 = i
 = u
 = ü
 = e
 = æ
 = x
 = á
 = ē
 = ä
 = ai
 = ow
 = ō
 = õ
 = ö
 = 4
 = c
 = j
 = yü
 = wī
 = yh
 = kh
 = rr
 = rh
 = rä
```

## In this repository

- **Source of truth** for the chart: `scripts/blog/demos/graflect-data.js`
  (the `slugMap` export) — regenerate this skill from it if glyphs change.
- `gt` translations live in `localization/*.json`; auto-translate stale ones with
  `npm run tl:auto` (Gemini), which embeds this chart and runs the whine loop.
- Missing `gt` keys fall back to the English source at build time, so an
  untranslated Graflect string shows Latin until a human (Sofrut) or the auto
  pass fills it — never a blank.
