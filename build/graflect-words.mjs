// build/graflect-words.mjs — the Graflect dictionary learns the author's own spellings.
//
// Every article written in Graflect (the "gt" language in localization/) is a
// list of English words with their Graflect spelling. Wherever a sentence has
// the same number of words in both, the words pair up; a pairing is kept when
// at least 60% of its occurrences agree. The result is appended to the staged
// scripts/blog/demos/graflect-data.js as articleWordMap, which fills the gaps
// in defaultWordMap. The hand-made defaultWordMap always wins: where the two
// disagree, that's for the author to settle (the build logs the words).

import { promises as fs } from 'node:fs';
import path from 'node:path';

const isGlyph = (c) => { const n = c.codePointAt(0); return n >= 0xE000 && n <= 0xF8FF; };
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ');
const sentences = (s) => strip(s).split(/[.!?;:]+\s/);

/** { word: graflect } from en/gt pairs: [{ en, gt }, ...]. */
export function learnWords(pairs) {
    const votes = new Map();
    for (const { en, gt } of pairs) {
        let es = sentences(en), gs = sentences(gt);
        if (es.length !== gs.length) { es = [strip(en)]; gs = [strip(gt)]; }
        es.forEach((e, i) => {
            const ew = e.split(/\s+/).filter(Boolean), gw = gs[i].split(/\s+/).filter(Boolean);
            if (ew.length !== gw.length) return;
            ew.forEach((w, j) => {
                const word = w.replace(/[^A-Za-z']/g, '').toLowerCase(), glyphs = [...gw[j]].filter(isGlyph).join('');
                if (!word || !glyphs) return;
                const v = votes.get(word) || new Map();
                v.set(glyphs, (v.get(glyphs) || 0) + 1);
                votes.set(word, v);
            });
        });
    }
    const out = {};
    for (const [word, v] of votes) {
        const [best, n] = [...v].sort((a, b) => b[1] - a[1])[0];
        const total = [...v.values()].reduce((a, b) => a + b, 0);
        if (n / total >= 0.6) out[word] = best;
    }
    return out;
}

export async function bakeGraflectWords(rootDir, { log = console.log } = {}) {
    const locDir = path.join(rootDir, 'localization'), dataFile = path.join(rootDir, 'scripts/blog/demos/graflect-data.js');
    const pairs = [];
    for (const f of (await fs.readdir(locDir)).filter((n) => n.endsWith('.json'))) {
        let d; try { d = JSON.parse(await fs.readFile(path.join(locDir, f), 'utf8')); } catch { continue; }
        if (!d || !d.gt || !d.en) continue;
        for (const [k, gt] of Object.entries(d.gt)) if (d.en[k] && gt) pairs.push({ en: d.en[k], gt });
    }
    const words = learnWords(pairs);
    let src = await fs.readFile(dataFile, 'utf8');
    const dict = Object.fromEntries([...src.match(/defaultWordMap = \{([\s\S]*?)\};/)[1].matchAll(/'([^']+)':\s*'([^']*)'/g)].map((m) => [m[1], m[2]]));
    const differ = Object.keys(words).filter((w) => w in dict && dict[w] !== words[w]);
    src += `\n// Learned from the Graflect articles at build time (build/graflect-words.mjs).\nconst articleWordMap = ${JSON.stringify(words)};\nfor (const [w, g] of Object.entries(articleWordMap)) if (!(w in defaultWordMap)) defaultWordMap[w] = g;\n`;
    await fs.writeFile(dataFile, src);
    log(`  → Graflect dictionary: ${Object.keys(words).filter((w) => !(w in dict)).length} words learned from ${pairs.length} article lines${differ.length ? `; spelled differently in the articles: ${differ.join(', ')}` : ''}.`);
    return words;
}

// The Graflect queue (tools/gt.html): every English line that has no Graflect
// yet, grouped by localization file. Coal is in progress, so it stays out.
const QUEUE_SKIP = new Set(['tl-status', 'coal', 'gtgr']);
export async function bakeGtQueue(rootDir, { log = console.log } = {}) {
    const locDir = path.join(rootDir, 'localization'), files = {};
    for (const f of (await fs.readdir(locDir)).filter((n) => n.endsWith('.json')).sort()) {
        const prefix = f.replace(/\.json$/, '');
        if (QUEUE_SKIP.has(prefix)) continue;
        let d; try { d = JSON.parse(await fs.readFile(path.join(locDir, f), 'utf8')); } catch { continue; }
        if (!d || !d.en) continue;
        const missing = Object.entries(d.en).filter(([k, v]) => String(v).trim() && !(d.gt && String(d.gt[k] || '').trim())).map(([key, en]) => ({ key, en }));
        if (missing.length) files[prefix] = missing;
    }
    await fs.writeFile(path.join(rootDir, 'tools', 'gt-queue.json'), JSON.stringify({ files }));
    log(`  → Graflect queue: ${Object.values(files).reduce((a, l) => a + l.length, 0)} lines missing in ${Object.keys(files).length} files.`);
}
