# Pelmeniboiler Site Architecture — Status

> Living status doc. The original plan was "stop rebuilding every page in the
> browser; move that work to a build step." Most of it is now done. Updated 2026-06.

## The core idea (delivered)

The site used to ship **empty HTML skeletons** and rebuild every page **in the
browser**: fetch modules, fetch every localization JSON, merge, and stamp text
into `data-key` elements. Crawlers/LLMs saw blank pages, first paint flashed, and
the homepage downloaded every post's translations on every visit.

That `data-key` → JSON → merge → stamp logic now runs **once at build time** and
emits finished HTML. Same source of truth (the localization JSONs), different
place of execution.

**Guiding principles**
1. Indexable content exists as real text in the shipped HTML.
2. The browser never reconstructs a page it could be handed finished.
3. Localization JSONs stay the single source of truth, consumed at build.
4. Don't ship a language a visitor isn't reading.
5. Keep the site's identity: windowed desktop UI, themes, fonts, e-ink mode,
   manifest-driven blog.

---

## Done

### Build tooling (was a VS Code extension → now a Node CLI)
- `npm run build` → `blog/blog-manifest.json`, `rss/<lang>/feed.xml`,
  per-language article pages, and `sitemap.xml`.
- `npm run lint:gt` → Graflect glyph validation (non-zero exit gates CI).
- Faithful port of the old `pelmeniboiler-rss` extension; `jsdom` retained.
- **GitHub Actions** (`.github/workflows/deploy.yml`) runs lint + build and
  deploys to Pages on every push to `main`. (Pages Source must be "GitHub
  Actions".) No more manual, stale builds.

### Per-language article pages
- `/blog/<slug>/<lang>/index.html`, one per language a post is translated into.
- Text baked in; correct `<html lang>` + `dir` (rtl for he); localized `<title>`
  / `<meta description>`; `rel=canonical` + `hreflang` (x-default → en; `gt`
  omitted as it has no valid BCP-47 tag).
- The universal **chrome** (settings / start-menu / share modules) is baked in
  too, in the page's language. **Demos are left as runtime placeholders**
  (interactive apps, no crawl value) and still injected by `module-loader.js`.

### Runtime behaviour
- Language switch on an article **navigates** to the sibling `/blog/<slug>/<lang>/`
  page (hub keeps in-place switching; build pages carry `built-lang` / `page-base`
  / `page-langs` markers to drive this).
- Built pages don't re-hydrate (no clobber). Fully-baked pages (no demos) skip the
  localization fetch entirely; pages with demos still fetch to translate them.
- Hub blog list links point at the per-language pages for the active language.

### Generated output is build-only
- Per-language pages, `sitemap.xml`, **RSS feeds, and `blog-manifest.json`** are
  gitignored and built fresh in CI. No generated files churn in git.

### Polish / fixes
- RSS feeds point at the per-language pages.
- `robots.txt`: dropped the obsolete "JS required, download the JSON" note; added
  the sitemap.
- Favicon: `logo/favicon.svg` is an OS-adaptive static mark (white under
  `prefers-color-scheme: dark`) for the no-JS case; `updateFavicon()` rasterizes
  the theme-coloured logo to a PNG via canvas and swaps the `<link>` node so the
  tab actually repaints. Fixed the long-standing bug where the logo's internal
  `<style>.s0{fill:#000}</style>` overrode the fill and left it stuck black.
- Fixed the e-ink theme lock (colour presets are now disabled on initial load,
  not only after toggling the checkbox).

### Verification
- A headless-browser smoke test (Playwright) covers the language flow, no-clobber,
  fetch-skip, chrome localization, favicon pixels, and the e-ink theme lock —
  currently 15 assertions. (Lives in scratch; could move into the repo as
  `test/` if we want it in CI.)

---

## Not done / deliberately deferred

- **Hub is still runtime-hydrated.** Baking its English content was deferred on
  purpose (it stays a single page with in-place language switching).
- **Accessibility / no-JS layout.** Article content + chrome are already baked, so
  no-JS readers get real text. Outstanding: make the windowed desktop a
  progressive enhancement — fall back to a clean linear "stacked divs" document
  when JS is off (the mobile CSS already stacks windows; gate the floating/
  absolute layout on a `.js` flag), and offer the language switcher as plain
  links. Feasible; not yet done.
- **MTPE translation tooling.** The current localization workflow is manual,
  glossary-driven, multi-pass MTPE with an LLM. Candidate build-tool support:
  a jargon **glossary file**, an incremental "translate only English keys that
  changed" pass, structure/placeholder/glyph validation (reusing `validate-gt`,
  with auto-retry on glyph errors), and a deterministic IPA→Graflect transliterator
  so glyph choice stops depending on the model. Sketch only; not built.

---

## Pointers
- Build tool: `build/build.mjs`, `build/validate-gt.mjs`
- Runtime: `scripts/` (`settings.js`, `blog-loader.js`, `module-loader.js`,
  `theme-loader.js`, `start-menu.js`, `share.js`)
- Chrome modules: `modules/`  ·  Localization: `localization/*.json`
- Deploy: `.github/workflows/deploy.yml`
