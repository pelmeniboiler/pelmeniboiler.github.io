# pelmeniboiler.github.io

A static site: plain HTML, CSS and vanilla JS, plus a Node build. No framework.

## Work on it

```
npm ci
npm run build      # sources → _site/   (first run ~1 min: photo encoding)
npm run preview    # serves _site/ on :8000
npm test           # browser tests against _site/  (set CHROMIUM_PATH if needed)
```

Edit the sources. Never edit `_site/`: it is rebuilt from scratch and it is
what gets deployed. A push to `main` builds, checks links and deploys.

## Where things are

| | |
|---|---|
| `index.html`, `blog/*.html`, `tools/`, `modules/` | pages, written by hand |
| `localization/*.json` | every translated string (`en he ru de ja gt`) |
| `styles/`, `scripts/` | one stylesheet, small scripts, no bundler |
| `build/` | the build; `build.mjs` is the entry point |
| `test/site.test.mjs` | the tests |

## Written by scripts, not by hand

- The `CURSORS` block in the stylesheet: `npm run cursors`
- The `FONT-SLICES` block and `styles/fonts/slices/`: `npm run fonts` (needs Python `fonttools`, `brotli`)
- Anything under `_site/`

## House rules

- Colour: only the theme's text and background colours. No greys (except disabled), no shadows, no opacity. The gimmick themes are the exception.
- E-ink mode: no motion, no colour, ever.
- No explanatory copy. If a design needs a caption, fix the design.
- Graflect text must stay valid: `npm run lint:gt`.

## Translations

`npm run tl:status`, or `/tools/translations.html` on the built site.
