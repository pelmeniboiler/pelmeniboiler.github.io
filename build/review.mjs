// build/review.mjs — translating together, in rounds.
//
// vault/reviews/<article>.json is the conversation about one article:
//   lines      { key: { en, <lang>: { text, back } } }   back = literal English back-translation
//   questions  [{ id, key, lang, ask, why?, options: [{ text, why }], pick, status, answer?, thread }]
//              status: open → answered (by her, in tools/review.html) → settled (agreed)
//              thread: [{ who: "claude" | "wendy", round, text }]
//   round      bumps each time Claude replies
//
// The loop:
//   1. Claude drafts: the article against the vault (rules, terms, ok, past
//      reviews); facts it can't vouch for get looked up first. Only real
//      decisions become questions, each with options and why.
//   2. She answers in tools/review.html (pick, write her own, comment, or ask
//      about any line) and sends it: a commit to vault/reviews/.
//   3. Claude runs `npm run review` to see what's new, replies in each thread,
//      revises the lines, settles what's agreed, records lasting choices in the
//      vault (terms.json, rules.json, ok.json), and bumps the round.
//   4. Repeat until nothing is open, then `npm run review -- apply <article>`
//      writes the lines into localization/ and stamps the staleness tracker;
//      vault:check has the last word.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'vault', 'reviews');
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);

async function reviews() {
    try { return (await fs.readdir(DIR)).filter((f) => f.endsWith('.json')).sort(); } catch { return []; }
}

/** Copy the reviews into the built site for tools/review.html, with an index. */
export async function stageReviews(rootDir) {
    const out = path.join(rootDir, 'localization', 'reviews'), index = [];
    await fs.mkdir(out, { recursive: true });
    for (const f of await reviews()) {
        const r = await read(path.join(DIR, f));
        await fs.writeFile(path.join(out, f), JSON.stringify(r));
        index.push({ article: r.article, title: r.title, round: r.round, open: r.questions.filter((q) => q.status !== 'settled').length });
    }
    await fs.writeFile(path.join(out, 'index.json'), JSON.stringify(index));
    return index;
}

async function status() {
    for (const f of await reviews()) {
        const r = await read(path.join(DIR, f));
        const open = r.questions.filter((q) => q.status !== 'settled');
        const answered = open.filter((q) => q.status === 'answered' || (q.thread.at(-1) || {}).who === 'wendy');
        console.log(`${r.article}: round ${r.round}, ${open.length} open, ${answered.length} answered and waiting for Claude`);
        for (const q of answered) {
            const a = q.answer || {};
            const said = [a.pick != null && q.options[a.pick] ? `picked “${q.options[a.pick].text}”` : '', a.own ? `own: “${a.own}”` : '', ...q.thread.filter((t) => t.who === 'wendy' && t.round === r.round).map((t) => `said: “${t.text}”`)].filter(Boolean);
            console.log(`  ${q.id} [${q.key} ${q.lang}] ${q.ask}\n     ${said.join('; ') || '(no answer)'}`);
        }
    }
}

async function apply(article, force) {
    const r = await read(path.join(DIR, `${article}.json`));
    if (r.kind === 'graflect') { console.log('A Graflect round is applied word by word to the articles (aligned respelling), not with apply.'); process.exitCode = 1; return; }
    const open = r.questions.filter((q) => q.status !== 'settled');
    if (open.length && !force) { console.log(`${open.length} question(s) still open: ${open.map((q) => q.id).join(', ')}. Settle them first (or --force).`); process.exitCode = 1; return; }
    const locPath = path.join(ROOT, 'localization', `${article}.json`), statusPath = path.join(ROOT, 'localization', 'tl-status.json');
    const raw = await fs.readFile(locPath, 'utf8'), loc = JSON.parse(raw), st = await read(statusPath);
    let n = 0;
    for (const lang of r.langs) {
        const t = { ...(loc[lang] || {}) };
        for (const [key, line] of Object.entries(r.lines)) if (line[lang]?.text != null && loc.en[key] != null) { t[key] = line[lang].text; ((st[article] ||= {})[key] ||= {})[lang] = hash(loc.en[key]); n++; }
        loc[lang] = Object.fromEntries([...Object.keys(loc.en).filter((k) => k in t), ...Object.keys(t).filter((k) => !(k in loc.en))].map((k) => [k, t[k]]));
    }
    await fs.writeFile(locPath, JSON.stringify(loc, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
    const sorted = {};
    for (const p of Object.keys(st).sort()) { sorted[p] = {}; for (const k of Object.keys(st[p]).sort()) sorted[p][k] = st[p][k]; }
    await fs.writeFile(statusPath, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`Wrote ${n} line(s) into localization/${article}.json. Now: npm run vault:check`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [cmd, arg] = process.argv.slice(2);
    if (cmd === 'apply') await apply(arg, process.argv.includes('--force'));
    else await status();
}
