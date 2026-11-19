// node sources.mjs NAME... (run inside RUNSDIR): right words by where they came from; CMUdict misses by how far off.
// Per step: correct words by where the spelling came from; CMUdict misses by how far off they are.
import fs from 'node:fs';
const steps = process.argv.slice(2), out = {};
for (const s of steps) {
  const run = JSON.parse(fs.readFileSync(`runs/${s}.json`, 'utf8')), lines = run.articles.flatMap((a) => a.lines);
  const hits = {}; let total = 0;
  for (const l of lines) {
    total += l.ref.length;
    // greedy in-order match of single-word tokens to her words, as the grader's LCS does
    const n = l.tokens.length, m = l.ref.length, eq = (i, j) => l.tokens[i].out.length === 1 && l.tokens[i].out[0] === l.ref[j];
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (eq(i, j) && dp[i][j] === dp[i + 1][j + 1] + 1) { const k = l.tokens[i].src; hits[k] = (hits[k] || 0) + 1; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  }
  const tsv = fs.readFileSync(`runs/misses-${s}.tsv`, 'utf8').trim().split('\n').slice(1).map((r) => r.split('\t'));
  const sub = { vowel_xi: 0, one: 0, more: 0 };
  for (const [, cat, en, sys, her] of tsv) {
    if (cat !== 'cmu_differs') continue;
    const A = [...sys.replace(/·/g, '')], B = [...her.replace(/·/g, '')];
    // edit distance on SLUG letters is a fair proxy here; x/i-only differences are the unstressed vowel
    const strip = (x) => x.join('').replace(/[xi]/g, '');
    if (strip(A) === strip(B) && A.length === B.length) sub.vowel_xi++;
    else { const d = lev(A, B); d <= 1 ? sub.one++ : sub.more++; }
  }
  out[s] = { total, hits, sub };
}
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
console.log(JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"'));
