---
name: graflect
description: Use when writing, transliterating, reading, or validating text in Graflect — the featural phonetic script (Unicode Private Use Area, U+EC70–U+ECEF) used on pelmeniboiler.github.io. Trigger for localizing the site's `gt` strings, filling Graflect placeholders in localization/*.json, or checking a string is valid Graflect.
---

# Graflect

Graflect is a **featural phonetic alphabet** by **Aaron Paterson** (MayCXC) —
a friend of the site's author, who did NOT design it. It is encoded in the
Unicode Private Use Area (**U+EC70–U+ECEF**) and displayed with the **FairfaxHD**
font (Rebecca Bettencourt, Kreative Korp), per the UCSUR registry. It is **not
Japanese**; the site's `romaji.js` is a Graflect *input method*, not a Japanese tool.

## The one thing to understand

Graflect spells **sound, not spelling**. You do NOT map English letters to glyphs.
You **pronounce** the word (in a chosen accent), break it into **phonemes**, and
write one glyph per phoneme. Homophones look identical; the same word in two
accents is written differently — that is the point (it renders the writer's accent).

So: **English → IPA → glyphs.** The IPA column below is the ground truth. The
"slug" column is only a lossy ASCII nickname (e.g. `š`, `4`, `ai`) — do not
reason from slugs alone, they do not tell you the sound. Read the IPA.

## Chart — glyph | IPA | slug

Ordered as consonants, then vowels, then other. `x` is /ʌ/~/ə/ (the schwa), which
is extremely common in unstressed syllables.

| glyph | IPA | slug |
|-------|-----|------|
|  | /p/ | p |
|  | /b/ | b |
|  | /t/ | t |
|  | /d/ | d |
|  | /k/ | k |
|  | /ɡ/ | g |
|  | /f/ | f |
|  | /v/ | v |
|  | /θ/ | th |
|  | /ð/ | dh |
|  | /s/ | s |
|  | /z/ | z |
|  | /ʃ/ | š |
|  | /ʒ/ | ž |
|  | /h/ | h |
|  | /m/ | m |
|  | /n/ | n |
|  | /ŋ/ | ng |
|  | /l/ | l |
|  | /r/ | r |
|  | /w/ | w |
|  | /j/ | y |
|  | /iː/ | ī |
|  | /ɪ/ | i |
|  | /ʊ/ | u |
|  | /u/ | ü |
|  | /ɛ/ | e |
|  | /æ/ | æ |
|  | /ʌ/ or /ə/ | x |
|  | /ɑ/ | á |
|  | /eɪ/ | ē |
|  | /ɛə/ | ä |
|  | /aɪ/ | ai |
|  | /aʊ/ | ow |
|  | /oʊ/ | ō |
|  | /ɔ/ | õ |
|  | /ɜː/ | ö |
|  | /ɛər/ | 4 |
|  | /tʃ/ | c |
|  | /dʒ/ | j |
|  | /ju/ | yü |
|  | /wi/ | wī |
|  | /ɥi/ | yh |
|  | /x/ | kh |
|  | /ɾ/ | rr |
|  | /ʁ/ | rh |

## Example words per phoneme (from the site's own IPA guide)

- p in plan
- b in band
- t in tend
- d in lend
- k in kick, c in cool
- g in gone
- f in fail
- v in vine
- th in think
- th in this
- s in south
- z in zone
- sh in shut
- s in occasion
- h in home
- m in man
- n in north
- ng in long
- l in lend
- r in rope (American R)
- w in woman
- y in your
- ea in lean
- i in in
- oo in good
- oo in school
- e in lend
- a in accent
- u in tug (also used for schwa)
- o in soft
- a in game
- a in ant
- ye in bye
- ou in south
- o in home
- o in hole
- ur in nurse but with a British Accent
- air in air
- ch in chase
- j in jump
- you in you
- we in we
- French: ui in huit
- German: ch in Bach
- Spanish: Flapped r in pero
- German: Guttural r in Rammstein

## How to write a word (worked method)

1. Say the word in the target accent (the site author writes a New York accent
   with Israeli/Russian family influence — e.g. `r`-ful, `á`=/ɑ/ in "possible").
2. Transcribe to **phonemes/IPA**, not letters. "once" = /wʌns/, "you" = /ju/,
   "become" = /bɪˈkʌm/, "nation" = /ˈneɪʃən/.
3. Map each phoneme to its glyph via the IPA column. /w ʌ n s/ → w-x-n-s.
4. A whole word contains **only** Graflect glyphs (plus spacing/punctuation).
   Never leave Latin letters inside a Graflect word. Proper nouns with no
   settled form may stay in Latin as their **own** token (the article keeps
   "Aaron Paterson", "MayCXC", "FairfaxHD" in Latin), but never mix scripts
   *within* one word.

## Worked examples (author's own Graflect)

**Passage 1 (author, decoded to romanization):**

>  , . . , , , , , , .

romanization: `wxns yü bīkxm fxmilyr with græflekt, yü wil faind it pásibl tü hīr mai æksent in mai raiting. ai wxz bōrn in nü yōrk tü izrēlī änd rxšin p4ints. mai fämxlī spīks 4xbik, jrmin, īnggliš, hībrü, rxšin, änd yidiš, änd ai grü xp in kxnetikit.`

**Passage 2 (author, decoded to romanization):**

>   .    ,    :

romanization: `ai xsüm dhis ál inflüensiz how ai spīk änd rait in græflekt. græflekt iz imenslī powrfl fōr raiting dhī æksents xv pīpl hü hæv spōkn īnggliš dh4 hōl laivz, bxt its álsō ēbl tü rndr dhōs xv pīpl hü lrnd īnggliš æz ē sekind längwj:`

**Passage 3 (author, decoded to romanization):**

>  ,    

romanization: `fōrh īnstxnz, dīs īz khow mai īzrhelī fámīlī tōk án zī fōn`

Notice from these: "graflect" = `græflekt`, "you" = `yü` (/ju/), the schwa `x`
everywhere in unstressed syllables ("familiar" = `fxmilyr`), "-tion/-ture" go
through /tʃ/ = `c` ("featural" ≈ `fīcrl`), and "are/air" uses the `4` = /ɛər/ glyph.

## Validating Graflect

- Every glyph must be in **U+EC70–U+ECEF**.
- Reject any whitespace-delimited word that mixes a Graflect glyph with a Latin/
  Cyrillic letter or digit (mixed-script word = wrong).
- Reject a string that should be Graflect but has no Graflect glyph.
- This repo automates it: `build/validate-gt.mjs` and `gtGlyphsOk()` in
  `build/tl-auto.mjs`.

## Notes for this repo

- `gt` strings live in `localization/*.json`; missing keys fall back to the
  English source at build time (so an untranslated string shows Latin, never a blank).
- Chart source of truth: `scripts/blog/demos/graflect-data.js` (`slugMap`) and the
  glyph→IPA table in `blog/graflect.html`; regenerate this skill if glyphs change.
- A capable model can transcribe Graflect **directly** from the IPA chart above.
  Only weaker models need the crutch of pasting their stray non-Graflect glyphs
  back for a redo (the automated `tl:auto` loop does this) — it is a fallback,
  not the method.
