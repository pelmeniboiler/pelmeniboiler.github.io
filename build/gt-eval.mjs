// build/gt-eval.mjs — grade an English→Graflect system against her own Graflect.
//
//   npm run gt:eval                         grade the dictionary (the baseline)
//   npm run gt:eval -- --cmd "python3 predict.py"
//                                           grade any other system (a model on the P40, say)
//   npm run gt:eval -- --export DIR         write the training data and stop
//
// Leave one article out: for each article with Graflect, the system learns
// from every other article and sees only this article's English; its output is
// scored against her Graflect for it, which it never sees.
//
// A --cmd system is run once per article with three paths in its environment:
//   TRAIN  JSON lines {en, gt, slug}   her lines from the other articles
//   TEST   JSON lines {id, en}         the held-out English
//   OUT    JSON lines {id, gt} or {id, slug}   what it writes back (glyphs or SLUG)
//
// Scores: words spelled as she spells them (in order), and lines exactly right.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { learnWords } from './graflect-words.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOC = path.join(ROOT, 'localization');
const isGlyph = (c) => { const n = c.codePointAt(0); return n >= 0xE000 && n <= 0xF8FF; };

export async function graflectData() {
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(`${await fs.readFile(path.join(ROOT, 'scripts/blog/demos/graflect-data.js'), 'utf8')};this.words=defaultWordMap;this.slug=slugMap;`, ctx);
    // SLUG ↔ glyphs. "·" marks a boundary where two glyphs would otherwise read as one (r·r is two r
    // glyphs, rr is the trilled r); "yu" is typed for yü. ‹Latin›, tags, entities and lone digits pass through.
    const yu = Object.entries(ctx.slug).find(([, v]) => v === 'yü');
    // The Graflect space glyph is written ␣ in SLUG, so it isn't mistaken for an ordinary space.
    const sp = Object.entries(ctx.slug).find(([, v]) => v === ' ');
    const toGlyph = [...Object.entries(ctx.slug).filter(([, v]) => v.trim()), ...(yu ? [[yu[0], 'yu']] : []), ...(sp ? [[sp[0], '␣']] : [])].sort((a, b) => b[1].length - a[1].length);
    const unslug = (s) => {
        let out = '', i = 0;
        while (i < s.length) {
            const keep = s.slice(i).match(/^(?:‹[^›]*›|<[^>]+>|&#?\w+;)/);
            if (keep) { out += keep[0].startsWith('‹') ? keep[0].slice(1, -1) : keep[0]; i += keep[0].length; continue; }
            if (s[i] === '·') { i++; continue; }
            const letterAround = /\p{L}/u.test(s[i - 1] || '') || /\p{L}/u.test(s[i + 1] || '');
            if (/\d/.test(s[i]) && !letterAround) { out += s[i++]; continue; }
            const m = toGlyph.find(([, v]) => s.startsWith(v, i));
            if (m && !/\s/.test(s[i])) { out += m[0]; i += m[1].length; } else out += s[i++];
        }
        return out;
    };
    const isG = (c) => c in ctx.slug;
    return {
        words: { ...ctx.words },
        slug: (g) => {
            // Latin she kept stays marked ‹…›, so it reads back as Latin.
            let out = '', prev = null, latin = '';
            const flush = () => { if (latin) { out += `‹${latin}›`; latin = ''; } };
            for (const c of g) {
                if (!isG(c) && /\p{L}/u.test(c)) { latin += c; prev = null; continue; }
                flush();
                const u = ctx.slug[c] === ' ' ? '␣' : (ctx.slug[c] ?? c);
                if (prev && isG(c) && unslug(prev[1] + u) !== prev[0] + c) out += '·';
                out += u; prev = isG(c) ? [c, u] : null;
            }
            flush();
            return out;
        },
        unslug,
    };
}

async function articles() {
    const out = {};
    for (const f of (await fs.readdir(LOC)).filter((n) => n.endsWith('.json') && n !== 'tl-status.json').sort()) {
        let d; try { d = JSON.parse(await fs.readFile(path.join(LOC, f), 'utf8')); } catch { continue; }
        if (!d || !d.en || !d.gt) continue;
        const lines = Object.keys(d.gt).filter((k) => d.en[k] && /[-]/.test(d.gt[k])).map((k) => ({ id: `${f.replace(/\.json$/, '')}:${k}`, en: d.en[k], gt: d.gt[k] }));
        if (lines.length) out[f.replace(/\.json$/, '')] = lines;
    }
    return out;
}

// Graflect words in order (anything that isn't glyphs, like Latin left in, is a miss).
const gwords = (s) => s.replace(/<[^>]+>/g, ' ').split(/[^-\p{L}]+/u).filter(Boolean);
function lcs(a, b) {
    const dp = Array(b.length + 1).fill(0);
    for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = x === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = t; } }
    return dp[b.length];
}

// The baseline: her dictionary plus the words learned from the other articles; unknown words stay Latin.
export function dictionarySystem(data) {
    return (train, test) => {
        const words = { ...learnWords(train), ...data.words };
        return test.map(({ id, en }) => ({ id, gt: en.replace(/[A-Za-z][A-Za-z'’]*/g, (w) => { const k = w.toLowerCase().replace(/’/g, "'"); return words[k] ?? words[k.replace(/'/g, '')] ?? w; }) }));
    };
}

function commandSystem(cmd, data) {
    return async (train, test) => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-eval-'));
        const TRAIN = path.join(dir, 'train.jsonl'), TEST = path.join(dir, 'test.jsonl'), OUT = path.join(dir, 'out.jsonl');
        await fs.writeFile(TRAIN, train.map((l) => JSON.stringify({ en: l.en, gt: l.gt, slug: data.slug(l.gt) })).join('\n'));
        await fs.writeFile(TEST, test.map((l) => JSON.stringify({ id: l.id, en: l.en })).join('\n'));
        execSync(cmd, { stdio: 'inherit', env: { ...process.env, TRAIN, TEST, OUT } });
        const out = (await fs.readFile(OUT, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
        await fs.rm(dir, { recursive: true, force: true });
        return out.map((o) => ({ id: o.id, gt: o.gt ?? data.unslug(o.slug || '') }));
    };
}

export async function evaluate(system) {
    const all = await articles(), rows = [];
    for (const [name, test] of Object.entries(all)) {
        const train = Object.entries(all).filter(([n]) => n !== name).flatMap(([, l]) => l);
        const got = Object.fromEntries((await system(train, test.map(({ id, en }) => ({ id, en })))).map((o) => [o.id, o.gt || '']));
        let hit = 0, total = 0, exact = 0;
        for (const l of test) {
            const g = gwords(l.gt).filter((w) => [...w].every(isGlyph)), h = gwords(got[l.id] || '');
            hit += lcs(g, h); total += g.length;
            if ((got[l.id] || '').replace(/\s+/g, ' ').trim() === l.gt.replace(/\s+/g, ' ').trim()) exact++;
        }
        rows.push({ name, lines: test.length, exact, words: total, right: hit });
    }
    return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    const data = await graflectData();
    if (opt('--export')) {
        const dir = opt('--export'); await fs.mkdir(dir, { recursive: true });
        const all = await articles();
        await fs.writeFile(path.join(dir, 'lines.jsonl'), Object.values(all).flat().map((l) => JSON.stringify({ ...l, slug: data.slug(l.gt) })).join('\n'));
        const learned = { ...learnWords(Object.values(all).flat()), ...data.words };
        await fs.writeFile(path.join(dir, 'words.tsv'), Object.entries(learned).map(([w, g]) => `${w}\t${data.slug(g)}`).join('\n'));
        console.log(`wrote ${dir}/lines.jsonl and ${dir}/words.tsv (${Object.keys(learned).length} words)`);
    } else {
        const rows = await evaluate(opt('--cmd') ? commandSystem(opt('--cmd'), data) : dictionarySystem(data));
        const pct = (a, b) => `${(100 * a / Math.max(b, 1)).toFixed(0)}%`.padStart(4);
        for (const r of rows) console.log(`${r.name.padEnd(14)} words ${pct(r.right, r.words)} (${r.right}/${r.words})   lines exact ${pct(r.exact, r.lines)} (${r.exact}/${r.lines})`);
        const s = rows.reduce((a, r) => ({ right: a.right + r.right, words: a.words + r.words, exact: a.exact + r.exact, lines: a.lines + r.lines }), { right: 0, words: 0, exact: 0, lines: 0 });
        console.log(`${'all'.padEnd(14)} words ${pct(s.right, s.words)} (${s.right}/${s.words})   lines exact ${pct(s.exact, s.lines)} (${s.exact}/${s.lines})`);
    }
}
