// Re-runs the rules system the way build/gt-eval.mjs does (leave one article out) and saves everything:
//   node collect.mjs REPO NAME OUTDIR -- <cmd...>        (cmd gets TRAIN, TEST, OUT, DUMP)
// REPO's own build/gt-eval.mjs supplies SLUG, so each commit is graded as it was. See README.md.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [REPO, NAME, OUTDIR] = process.argv.slice(2, 5);
process.env.GT_EVAL_IMPORT = '1';
const CMD = process.argv.slice(process.argv.indexOf('--') + 1);
const LOC = path.join(REPO, 'localization');
const isGlyph = (c) => { const n = c.codePointAt(0); return n >= 0xE000 && n <= 0xF8FF; };

const evalMod = await import(pathToFileURL(path.join(REPO, 'build', 'gt-eval.mjs')).href), { graflectData } = evalMod;
async function articles() {
    // Lines a machine wrote aren't hers (build/g2p/machine-lines.json); older checkouts have none.
    const out = {}, machine = evalMod.machineLines ? await evalMod.machineLines(REPO) : () => false;
    for (const f of (await fs.readdir(LOC)).filter((n) => n.endsWith('.json') && n !== 'tl-status.json').sort()) {
        let d; try { d = JSON.parse(await fs.readFile(path.join(LOC, f), 'utf8')); } catch { continue; }
        if (!d || !d.en || !d.gt) continue;
        const lines = Object.keys(d.gt).filter((k) => d.en[k] && /[\u{E000}-\u{F8FF}]/u.test(d.gt[k])).map((k) => ({ id: `${f.replace(/\.json$/, '')}:${k}`, en: d.en[k], gt: d.gt[k] })).filter((l) => !machine(l.id, l.gt));
        if (lines.length) out[f.replace(/\.json$/, '')] = lines;
    }
    return out;
}
const gwords = (s) => s.replace(/<[^>]+>/g, ' ').split(/[^\u{E000}-\u{F8FF}\p{L}]+/u).filter(Boolean);
function lcs(a, b) {
    const dp = Array(b.length + 1).fill(0);
    for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = x === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = t; } }
    return dp[b.length];
}

const data = await graflectData();
const all = await articles();
const dir = path.join(OUTDIR, NAME); await fs.mkdir(dir, { recursive: true });
const result = { name: NAME, cmd: CMD.join(' '), articles: [] };
for (const [name, test] of Object.entries(all)) {
    const train = Object.entries(all).filter(([n]) => n !== name).flatMap(([, l]) => l);
    const ad = path.join(dir, name); await fs.mkdir(ad, { recursive: true });
    const TRAIN = path.join(ad, 'train.jsonl'), TEST = path.join(ad, 'test.jsonl'), OUT = path.join(ad, 'out.jsonl'), DUMP = path.join(ad, 'dump.jsonl');
    await fs.writeFile(TRAIN, train.map((l) => JSON.stringify({ en: l.en, gt: l.gt, slug: data.slug(l.gt) })).join('\n'));
    await fs.writeFile(TEST, test.map((l) => JSON.stringify({ id: l.id, en: l.en })).join('\n'));
    const t0 = Date.now();
    execFileSync(CMD[0], CMD.slice(1), { stdio: 'inherit', env: { ...process.env, TRAIN, TEST, OUT, DUMP } });
    const outs = Object.fromEntries((await fs.readFile(OUT, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((o) => [o.id, o.gt ?? data.unslug(o.slug || '')]));
    const toks = (await fs.readFile(DUMP, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const g = (s) => (s == null ? null : data.unslug(s));
    const lines = test.map((l) => {
        const ref = gwords(l.gt).filter((w) => [...w].every(isGlyph)), out = outs[l.id] || '';
        const tokens = toks.filter((t) => t.id === l.id).sort((a, b) => a.i - b.i).map((t) => {
            const key = t.en.toLowerCase().replace(/’/g, "'");
            return {
                en: t.en, src: t.src, group: t.group, out: gwords(g(t.slug)),
                cmu: t.cmu_slug == null ? null : g(t.cmu_slug), cmuAlt: t.cmu_alt.map(g), inCmu: t.in_cmu,
                votes: Object.fromEntries(Object.entries(t.votes).map(([s, n]) => [g(s), n])),
                dict: data.words[key] ?? data.words[key.replace(/'/g, '')] ?? null,
            };
        });
        return { id: l.id, en: l.en, gt: l.gt, out, ref, hits: lcs(ref, gwords(out)), exact: out.replace(/\s+/g, ' ').trim() === l.gt.replace(/\s+/g, ' ').trim(), tokens };
    });
    const hits = lines.reduce((a, l) => a + l.hits, 0), words = lines.reduce((a, l) => a + l.ref.length, 0);
    console.log(`${NAME} ${name.padEnd(14)} words ${hits}/${words}  exact ${lines.filter((l) => l.exact).length}/${lines.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    result.articles.push({ name, lines });
}
await fs.writeFile(path.join(OUTDIR, `${NAME}.json`), JSON.stringify(result));
const L = result.articles.flatMap((a) => a.lines);
console.log(`${NAME} all words ${L.reduce((a, l) => a + l.hits, 0)}/${L.reduce((a, l) => a + l.ref.length, 0)}  exact ${L.filter((l) => l.exact).length}/${L.length}`);
