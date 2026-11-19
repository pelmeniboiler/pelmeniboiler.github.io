// node analyze.mjs REPO RUNSDIR name1 name2 ...  → prints breakdown, writes RUNSDIR/breakdown.json and misses-<name>.tsv
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [REPO, RUNS, ...NAMES] = process.argv.slice(2);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(`${await fs.readFile(path.join(REPO, 'scripts/blog/demos/graflect-data.js'), 'utf8')};this.slug=slugMap;`, ctx);
const slugOf = (g) => [...g].map((c) => ctx.slug[c] ?? c).join('');
const glyphSlug = (c) => ctx.slug[c] ?? c;

const CATS = {
    latin: 'Left in Latin: not in CMUdict and not in her other articles',
    hers_variant: 'Learned from her other articles, but she uses more than one spelling (here she used another one she has used before)',
    hers_new: 'Learned from her other articles, but she spelled it a new way here',
    seen_unlearned: 'In her other articles, but her spellings disagree too much to learn (<60% agreement)',
    cmu_alt: 'New word; CMUdict lookup used the first pronunciation, hers matches an alternate CMUdict pronunciation',
    cmu_differs: 'New word; CMUdict through her rules differs from her spelling',
    model_vs_lookup: 'Model guessed a CMUdict word wrong where the CMUdict lookup was right',
    model_oov: 'Not in CMUdict; model guessed wrong',
    contraction: "Contraction: she keeps the apostrophe (it's → 2 Graflect words), the system writes one word",
    extra: 'Structure: she wrote words with no English counterpart here (numbers, symbols, added words)',
    count_mismatch: 'Structure: word counts differ in this stretch (she merged, split, added or dropped words)',
    context: 'A context rule (dhi/dhī before a vowel, hæf before tü) fired and was wrong here',
};

function align(tokens, ref) {
    // Token-level LCS: token i matches ref j when it produced exactly that one Graflect word.
    const n = tokens.length, m = ref.length, eq = (i, j) => tokens[i].out.length === 1 && tokens[i].out[0] === ref[j];
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const anchors = []; let i = 0, j = 0;
    while (i < n && j < m) { if (eq(i, j) && dp[i][j] === dp[i + 1][j + 1] + 1) { anchors.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    const gaps = []; let pi = 0, pj = 0;
    for (const [ai, aj] of [...anchors, [n, m]]) { if (ai > pi || aj > pj) gaps.push({ toks: tokens.slice(pi, ai), refs: ref.slice(pj, aj) }); pi = ai + 1; pj = aj + 1; }
    return { hits: anchors.length, gaps, anchors };
}

// Glyph alignment of system word a to her word b: [[sysGlyph|null, herGlyph|null, nextSysGlyph]]
function glyphPairs(a, b) {
    const A = [...a], B = [...b], d = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    const out = []; let i = A.length, j = B.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)) { out.push([A[i - 1], B[j - 1], A[i] ?? null]); i--; j--; }
        else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { out.push([A[i - 1], null, A[i] ?? null]); i--; }
        else { out.push([null, B[j - 1], A[i] ?? null]); j--; }
    }
    return { pairs: out.reverse(), dist: d[A.length][B.length] };
}

function category(t, r) {
    if (t.src === 'context') return 'context';
    if (t.src === 'latin') return 'latin';
    if (t.src === 'hers') return t.votes[r] ? 'hers_variant' : 'hers_new';
    if (Object.keys(t.votes).length) return 'seen_unlearned';
    if (t.src === 'model' && !t.inCmu) return 'model_oov';
    if (t.src === 'model' && t.cmu === r) return 'model_vs_lookup';
    return t.cmuAlt.includes(r) ? 'cmu_alt' : 'cmu_differs';
}

function glyphOps(a, b) { // edit ops turning a (system) into b (hers), glyph level, shown in SLUG
    const A = [...a], B = [...b], d = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    const ops = []; let i = A.length, j = B.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && d[i][j] === d[i - 1][j - 1]) { i--; j--; }
        else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { ops.push(`${glyphSlug(A[i - 1])}→${glyphSlug(B[j - 1])}`); i--; j--; }
        else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push(`drop ${glyphSlug(A[i - 1])}`); i--; }
        else { ops.push(`add ${glyphSlug(B[j - 1])}`); j--; }
    }
    return { ops, dist: d[A.length][B.length] };
}

const summary = {};
for (const name of NAMES) {
    const run = JSON.parse(await fs.readFile(path.join(RUNS, `${name}.json`), 'utf8'));
    const lines = run.articles.flatMap((a) => a.lines);
    const total = lines.reduce((a, l) => a + l.ref.length, 0), graderHits = lines.reduce((a, l) => a + l.hits, 0);
    const counts = Object.fromEntries(Object.keys(CATS).map((k) => [k, 0])), misses = [], ops = {};
    let alignHits = 0, dictFix = 0, dictWrong = 0, near = 0;
    const schwa = {}; // her glyph where the CMUdict rules write x, by the next glyph the rules write (paired cmu tokens, hit or miss)
    const tallySchwa = (t, r) => {
        if (t.src !== 'cmu' || t.out.length !== 1) return;
        const { pairs, dist } = glyphPairs(t.out[0], r); if (dist > 2) return;
        for (const [s, h, nx] of pairs) if (s && glyphSlug(s) === 'x') { const k = nx ? glyphSlug(nx) : 'END'; schwa[k] = schwa[k] || {}; const v = h ? glyphSlug(h) : '(none)'; schwa[k][v] = (schwa[k][v] || 0) + 1; }
    };
    for (const l of lines) {
        const { hits, gaps, anchors } = align(l.tokens, l.ref); alignHits += hits;
        for (const [ti, rj] of anchors) tallySchwa(l.tokens[ti], l.ref[rj]);
        const herLatin = new Set((l.gt.replace(/<[^>]+>|&#?\w+;/g, ' ').match(/[A-Za-z][A-Za-z'’]*/g) || []).map((w) => w.toLowerCase()));
        for (const g0 of gaps) {
            // Words she left in Latin aren't graded words; drop them from the stretch.
            const g = { toks: g0.toks.filter((t) => !herLatin.has(t.en.toLowerCase())), refs: g0.refs };
            if (!g.refs.length) continue;
            // Contractions: a token with an apostrophe stands for (apostrophes + 1) of her words.
            const parts = (t) => (t.en.match(/['’]/g) || []).length + 1;
            if (g.toks.some((t) => parts(t) > 1) && g.toks.reduce((a, t) => a + parts(t), 0) === g.refs.length) {
                let j = 0;
                for (const t of g.toks) {
                    const k = parts(t);
                    if (k > 1) { counts.contraction += k; misses.push({ id: l.id, cat: 'contraction', en: t.en, out: t.out.map(slugOf).join('+'), her: g.refs.slice(j, j + k).map(slugOf).join(' ') }); }
                    else { const r = g.refs[j], c = category(t, r); counts[c]++; if (t.dict === r) dictFix++; else if (t.dict) dictWrong++; tallySchwa(t, r); misses.push({ id: l.id, cat: c, en: t.en, out: t.out.map(slugOf).join('+'), her: slugOf(r), cmu: t.cmu ? slugOf(t.cmu) : '', dict: t.dict ? slugOf(t.dict) : '', votes: Object.entries(t.votes).map(([s, n]) => `${slugOf(s)}×${n}`).join(' ') }); }
                    j += k;
                }
                continue;
            }
            if (!g.toks.length) { counts.extra += g.refs.length; misses.push({ id: l.id, cat: 'extra', en: '', out: '', her: g.refs.map(slugOf).join(' ') }); continue; }
            if (g.toks.length !== g.refs.length) { counts.count_mismatch += g.refs.length; misses.push({ id: l.id, cat: 'count_mismatch', en: g.toks.map((t) => t.en).join(' '), out: g.toks.map((t) => t.out.map(slugOf).join('+')).join(' '), her: g.refs.map(slugOf).join(' ') }); continue; }
            g.toks.forEach((t, k) => {
                const r = g.refs[k], c = category(t, r); counts[c]++; tallySchwa(t, r);
                if (t.dict === r) dictFix++; else if (t.dict) dictWrong++;
                const o = t.out.join('');
                if (['cmu_differs', 'hers_new', 'model_oov', 'model_vs_lookup', 'seen_unlearned', 'hers_variant'].includes(c) && t.out.length === 1) {
                    const { ops: e, dist } = glyphOps(o, r); if (dist === 1) near++;
                    if (c === 'cmu_differs') for (const x of e) ops[x] = (ops[x] || 0) + 1; // rules vs her: candidate rule fixes
                }
                misses.push({ id: l.id, cat: c, en: t.en, out: t.out.map(slugOf).join('+'), her: slugOf(r), cmu: t.cmu ? slugOf(t.cmu) : '', dict: t.dict ? slugOf(t.dict) : '', votes: Object.entries(t.votes).map(([s, n]) => `${slugOf(s)}×${n}`).join(' ') });
            });
        }
    }
    // Lines: why not exact
    const exact = lines.filter((l) => l.exact).length;
    const allWordsNotExact = lines.filter((l) => !l.exact && l.hits === l.ref.length);
    const keepsLatin = allWordsNotExact.filter((l) => /[A-Za-z]/.test(l.gt.replace(/<[^>]+>|&#?\w+;/g, '')));
    const missCount = total - alignHits;
    const byWord = {};
    for (const m of misses.filter((m) => m.en)) { const k = `${m.cat}\t${m.en.toLowerCase()}\t${m.out}\t${m.her}`; byWord[k] = (byWord[k] || 0) + 1; }
    summary[name] = {
        total, graderHits, alignHits, missCount, counts, dictFix, dictWrong, near,
        ruleOps: Object.entries(ops).sort((a, b) => b[1] - a[1]).slice(0, 25),
        schwa: Object.entries(schwa).map(([nx, v]) => ({ next: nx, total: Object.values(v).reduce((a, b) => a + b, 0), x: v.x || 0, i: v.i || 0, other: v })).sort((a, b) => b.total - a.total),
        lines: lines.length, exact, linesWithMisses: lines.filter((l) => l.hits < l.ref.length).length, allWordsNotExact: allWordsNotExact.length, keepsLatin: keepsLatin.length,
        allWordsNotExactExamples: allWordsNotExact.slice(0, 6).map((l) => ({ id: l.id, out: l.out, gt: l.gt })),
        topByCat: Object.fromEntries(Object.keys(CATS).map((c) => [c, Object.entries(byWord).filter(([k]) => k.startsWith(c + '\t')).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => { const [, en, out, her] = k.split('\t'); return { en, out, her, n }; })])),
        structExamples: misses.filter((m) => m.cat === 'count_mismatch' || m.cat === 'extra').slice(0, 10),
    };
    await fs.writeFile(path.join(RUNS, `misses-${name}.tsv`), ['id\tcategory\tenglish\tsystem_slug\ther_slug\tcmu_rules_slug\tdictionary_slug\ther_other_spellings', ...misses.map((m) => [m.id, m.cat, m.en, m.out, m.her, m.cmu ?? '', m.dict ?? '', m.votes ?? ''].join('\t'))].join('\n'));
    const s = summary[name], pct = (x) => `${(100 * x / s.missCount).toFixed(1)}%`;
    console.log(`\n=== ${name}: grader ${graderHits}/${total}, aligned ${alignHits}/${total}, misses ${s.missCount}`);
    for (const [k, v] of Object.entries(counts)) if (v) console.log(`  ${String(v).padStart(4)} ${pct(v).padStart(6)}  ${k}`);
    console.log(`  hand-made dictionary has her spelling for ${dictFix} misses (disagrees on ${dictWrong}); ${near} misses are one glyph off`);
    console.log(`  lines exact ${exact}/${lines.length}; with a word miss ${s.linesWithMisses}; all words right but not exact ${s.allWordsNotExact} (she kept Latin words in ${s.keepsLatin})`);
    console.log('  rules x → her:', s.schwa.slice(0, 10).map((r) => `before ${r.next}: x${r.x} i${r.i} of ${r.total}`).join(' | '));
}
await fs.writeFile(path.join(RUNS, 'breakdown.json'), JSON.stringify({ CATS, summary }, null, 1));
