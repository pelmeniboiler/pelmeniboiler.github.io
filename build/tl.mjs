// build/tl.mjs
//
// Translation staleness tracker. Every translated value is a "target" built from
// an English "source"; when the English changes, the translation is stale until
// re-done — the same idea as gettext's fuzzy flag or Make's timestamp deps.
//
//   npm run tl:status              report stale / missing / untracked translations
//   npm run tl:stamp -- [prefix] [lang]
//                                  record the current translations as up-to-date
//                                  (bootstrap existing work, or after re-translating)
//
// State lives in localization/tl-status.json (committed): for each localization
// file, key, and language, the hash of the English it was last translated from.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LOC = path.join(process.cwd(), 'localization');
const STATUS_PATH = path.join(LOC, 'tl-status.json');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);

async function loadJson(p, fallback) {
    try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}

async function localizationFiles() {
    const files = await fs.readdir(LOC);
    return files.filter((f) => f.endsWith('.json') && f !== 'tl-status.json');
}

const hasText = (v) => v != null && String(v).trim() !== '';

async function cmdStatus() {
    const status = await loadJson(STATUS_PATH, {});
    let totals = { stale: 0, missing: 0, untracked: 0 };

    for (const file of await localizationFiles()) {
        const prefix = file.replace(/\.json$/, '');
        const data = await loadJson(path.join(LOC, file), {});
        const en = data.en || {};
        const langs = Object.keys(data).filter((l) => l !== 'en');
        if (!langs.length || !Object.keys(en).length) continue;

        const st = status[prefix] || {};
        const rows = [];
        for (const lang of langs) {
            const t = data[lang] || {};
            const stale = [], missing = [], untracked = [];
            for (const key of Object.keys(en)) {
                if (!hasText(t[key])) { missing.push(key); continue; }
                const stamped = st[key]?.[lang];
                if (!stamped) untracked.push(key);
                else if (stamped !== hash(en[key])) stale.push(key);
            }
            totals.stale += stale.length; totals.missing += missing.length; totals.untracked += untracked.length;
            if (stale.length || missing.length || untracked.length) rows.push({ lang, stale, missing, untracked });
        }

        if (rows.length) {
            console.log(`\n${file}`);
            for (const r of rows) {
                const bits = [];
                if (r.stale.length) bits.push(`${r.stale.length} stale`);
                if (r.missing.length) bits.push(`${r.missing.length} missing`);
                if (r.untracked.length) bits.push(`${r.untracked.length} untracked`);
                console.log(`  ${r.lang}: ${bits.join(', ')}`);
                if (r.stale.length) console.log(`      stale → ${r.stale.join(', ')}`);
                if (r.missing.length) console.log(`      missing → ${r.missing.join(', ')}`);
            }
        }
    }

    console.log(`\nTotal: ${totals.stale} stale, ${totals.missing} missing, ${totals.untracked} untracked.`);
    if (!totals.stale && !totals.missing && !totals.untracked) console.log('✅ All tracked translations are current.');
    else if (totals.untracked) console.log('Tip: run `npm run tl:stamp` to baseline untracked translations as current.');
}

async function cmdStamp(argPrefix, argLang) {
    const status = await loadJson(STATUS_PATH, {});
    let stamped = 0;

    for (const file of await localizationFiles()) {
        const prefix = file.replace(/\.json$/, '');
        if (argPrefix && prefix !== argPrefix) continue;
        const data = await loadJson(path.join(LOC, file), {});
        const en = data.en || {};
        const langs = Object.keys(data).filter((l) => l !== 'en' && (!argLang || l === argLang));
        if (!langs.length) continue;

        status[prefix] = status[prefix] || {};
        for (const lang of langs) {
            const t = data[lang] || {};
            for (const key of Object.keys(en)) {
                if (!hasText(t[key])) continue; // only stamp what's actually translated
                (status[prefix][key] = status[prefix][key] || {})[lang] = hash(en[key]);
                stamped++;
            }
        }
    }

    // Keep the file tidy and stable-ordered.
    const sorted = {};
    for (const p of Object.keys(status).sort()) {
        sorted[p] = {};
        for (const k of Object.keys(status[p]).sort()) sorted[p][k] = status[p][k];
    }
    await fs.writeFile(STATUS_PATH, JSON.stringify(sorted, null, 2) + '\n');
    const scope = `${argPrefix ? ' for ' + argPrefix : ''}${argLang ? '/' + argLang : ''}`;
    console.log(`Stamped ${stamped} translation(s) as current${scope}.`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'status') await cmdStatus();
else if (cmd === 'stamp') await cmdStamp(a, b);
else { console.error('usage: node build/tl.mjs status | stamp [prefix] [lang]'); process.exit(1); }
