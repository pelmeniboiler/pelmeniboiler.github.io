// build/vault-check.mjs — check every translation against the author's preferences.
//
//   npm run vault:check            list what breaks a rule in vault/rules.json
//
// A rule either forbids a pattern in a language, compares punctuation with
// the English it was translated from ("added": don't introduce it; "kept": don't
// drop it), or ("ending") keeps the English ending of a dotted name like
// system.settings. Rules with "gt": true also check Graflect. Approved exceptions live in vault/ok.json as "file:key:lang" under
// the rule's id, so a flag is either fixed or consciously accepted. Terms in
// vault/terms.json are checked too: where the English uses one, each
// translation must use its agreed form.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOC = path.join(ROOT, 'localization');
const read = async (p, d) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return d; } };
// \b that knows Cyrillic and Hebrew letters (JavaScript's \b only knows ASCII).
const B = '(?:(?<=[\\p{L}\\p{M}])(?![\\p{L}\\p{M}])|(?<![\\p{L}\\p{M}])(?=[\\p{L}\\p{M}]))';
const re = (src) => new RegExp(src.replace(/\\b/g, B), 'gu');
const text = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, ' ');
const count = (s, chars) => [...s].filter((c) => chars.includes(c)).length;

/** Which rules a translated line breaks, given its English. */
export function judge(rules, lang, en, raw) {
    const t = text(raw), e = text(en), hits = [];
    for (const r of rules) {
        if (r.lang !== '*' && r.lang !== lang) continue;
        let hit = null;
        if (r.term) { if (r.term.en && e.includes(r.term.en) && r.term[lang] && !t.includes(r.term[lang])) hit = `should use ${r.term[lang]}`; }
        else if (r.forbid) { const m = t.match(re(r.forbid)); if (m) hit = m.join(', '); }
        else if (r.added && count(t, r.added) > count(e, r.added)) hit = `${r.added} not in the English`;
        else if (r.kept && count(e, r.kept) > count(t, r.kept + (r.same || ''))) hit = `${r.kept} dropped`;
        else if (r.ending) {
            // name.ending, not a web address (www.x, x.com, en.wikipedia.org) or an initialism (U.S., P.S.)
            const gone = [...e.matchAll(/(?<![\w.])([A-Za-z][\w-]+)\.([a-z]{2,})(?![\w.])/g)]
                .filter((m) => m[1] !== 'www' && !/^(?:com|org|net|io|htm|html|php|gov|edu)$/i.test(m[2]))
                .filter((m) => !t.includes(`.${m[2]}`)).map((m) => m[0]);
            if (gone.length) hit = `${gone.join(', ')}: keep the ending in English`;
        }
        if (hit) hits.push({ rule: r.id, hit, text: t });
    }
    return hits;
}

export async function loadRules() {
    const rules = await read(path.join(ROOT, 'vault/rules.json'), []);
    for (const [name, t] of Object.entries(await read(path.join(ROOT, 'vault/terms.json'), {}))) rules.push({ id: `term:${name}`, lang: '*', term: t });
    return rules;
}

export async function check() {
    const rules = await loadRules(), ok = await read(path.join(ROOT, 'vault/ok.json'), {});
    const flags = [];
    for (const file of (await fs.readdir(LOC)).filter((f) => f.endsWith('.json') && f !== 'tl-status.json')) {
        const d = await read(path.join(LOC, file), null);
        if (!d || !d.en) continue;
        const name = file.replace(/\.json$/, '');
        for (const [lang, values] of Object.entries(d)) {
            if (lang === 'en' || typeof values !== 'object') continue;
            const these = lang === 'gt' ? rules.filter((r) => r.gt) : rules;
            for (const [key, raw] of Object.entries(values)) {
                if (d.en[key] == null) continue;
                const id = `${name}:${key}:${lang}`;
                for (const h of judge(these, lang, d.en[key], raw)) if (!(ok[h.rule] || []).includes(id)) flags.push({ id, ...h });
            }
        }
    }
    return flags;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const flags = await check();
    for (const f of flags) console.log(`${f.id}  [${f.rule}] ${f.hit}\n    ${f.text.slice(0, 160)}`);
    console.log(flags.length ? `\n${flags.length} to fix or approve (vault/ok.json).` : 'Every translation follows the vault.');
}
