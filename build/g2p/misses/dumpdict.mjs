// The dictionary system (build/gt-eval.mjs's baseline) with a DUMP, for the miss report:
//   node dumpdict.mjs REPO dict|learn     dict: her hand-made dictionary only; learn: + words learned from her other articles
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [REPO, MODE] = process.argv.slice(2);
const { graflectData } = await import(pathToFileURL(path.join(REPO, 'build/gt-eval.mjs')).href);
const data = await graflectData();
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const train = read(process.env.TRAIN), test = read(process.env.TEST);
let learned = {};
if (MODE === 'learn') learned = (await import(pathToFileURL(path.join(REPO, 'build/graflect-words.mjs')).href)).learnWords(train);
const out = [], dump = [];
for (const t of test) {
    let i = 0;
    const gt = t.en.split(/(<[^>]+>|&#?\w+;)/).map((p) => /^(<[^>]+>|&#?\w+;)$/.test(p) ? p : p.replace(/[A-Za-z][A-Za-z'’]*/g, (w) => {
        const k = w.toLowerCase().replace(/’/g, "'"), k2 = k.replace(/'/g, '');
        const [g, src] = data.words[k] ? [data.words[k], 'dict'] : data.words[k2] ? [data.words[k2], 'dict'] : learned[k] ? [learned[k], 'hers'] : learned[k2] ? [learned[k2], 'hers'] : [w, 'latin'];
        dump.push({ id: t.id, i: i++, en: w, slug: src === 'latin' ? `‹${w}›` : data.slug(g), src, votes: {}, in_cmu: false, cmu_slug: null, cmu_alt: [] });
        return g;
    })).join('');
    out.push({ id: t.id, gt });
}
fs.writeFileSync(process.env.OUT, out.map((o) => JSON.stringify(o)).join('\n'));
fs.writeFileSync(process.env.DUMP, dump.map((o) => JSON.stringify(o)).join('\n'));
