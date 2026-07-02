// build/tl-auto.mjs
// Auto-localize STALE translations via the Gemini API — the MTPE draft pass,
// automated, with the guards we already built:
//
//   - Only STALE keys (an existing translation whose English changed). Never
//     missing/new content, and never the in-progress prefixes below — drafting
//     unfinished articles is the author's call, not a build side-effect.
//   - Responses are validated before touching disk: key parity, HTML-tag-count
//     preservation, and the Graflect PUA glyph check for gt. Rejected keys
//     simply stay stale for the human loop (Sofrut).
//   - Values are applied by verbatim string replacement (formatting-preserving)
//     and stamped in tl-status.json, so the tracker stays truthful.
//
// Usage:  GEM_API_KEY=...  npm run tl:auto        (real run)
//         npm run tl:auto                          (no key -> dry-run listing)
// Env:    GEM_MODEL (default gemini-2.0-flash), GEM_FAKE_RESPONSE (JSON, testing)
//
// The API key belongs in GitHub Actions repository secrets (GEM_API_KEY) — it
// is never committed, and Actions masks it in logs. See workflows/translate.yml.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LOC = path.join(process.cwd(), 'localization');
const STATUS_PATH = path.join(LOC, 'tl-status.json');
const EXCLUDED_PREFIXES = ['coal']; // in-progress content: hands off
const LANG_NAMES = { he: 'Hebrew', ru: 'Russian', de: 'German', ja: 'Japanese', gt: 'Graflect' };
const MODEL = process.env.GEM_MODEL || 'gemini-2.0-flash';
const API_KEY = process.env.GEM_API_KEY;

const hash12 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
const tagCount = (s) => (String(s).match(/<[^>]+>/g) || []).length;
const isGraflect = (c) => c >= 0xec70 && c <= 0xecef;

function gtGlyphsOk(value) {
    for (const word of String(value).replace(/<[^>]*>/g, ' ').split(/\s+/)) {
        let g = 0, n = 0;
        for (const ch of word) {
            if (isGraflect(ch.charCodeAt(0))) g++;
            else if (/[\p{L}\p{N}]/u.test(ch)) n++;
        }
        if (g && n) return false;
    }
    return true;
}

async function geminiTranslate(lang, entries) {
    const prompt = [
        `You are localizing a personal blog from English into ${LANG_NAMES[lang] || lang} (code "${lang}").`,
        'Rules:',
        "- Localize, do not translate. Avoid translatese; preserve the author's voice.",
        '- Keep every HTML tag and entity (<br>, <span ...>, <strong>, &nbsp;) exactly where it is.',
        '- Output ONLY valid JSON: the same keys, values translated. No commentary, no code fences.',
        ...(lang === 'gt' ? [
            '- Graflect is a featural phonetic script in Unicode Private Use Area U+EC70–U+ECEF.',
            '  Render the ENGLISH pronunciation in Graflect glyphs ONLY — never Latin/Cyrillic letters inside a word.',
        ] : []),
        '', 'English source:', JSON.stringify(entries, null, 2),
    ].join('\n');

    if (process.env.GEM_FAKE_RESPONSE) return JSON.parse(process.env.GEM_FAKE_RESPONSE);

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
            }),
        },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text.replace(/^```(json)?|```$/gm, '').trim());
}

async function main() {
    const status = JSON.parse(await fs.readFile(STATUS_PATH, 'utf8'));

    // Collect stale work per (prefix, lang).
    const work = []; // { prefix, lang, keys: {key: enValue} }
    for (const file of await fs.readdir(LOC)) {
        if (!file.endsWith('.json') || file === 'tl-status.json') continue;
        const prefix = file.replace(/\.json$/, '');
        if (EXCLUDED_PREFIXES.includes(prefix)) continue;
        const data = JSON.parse(await fs.readFile(path.join(LOC, file), 'utf8'));
        if (!data.en) continue;
        for (const lang of Object.keys(data).filter((l) => l !== 'en')) {
            const stale = {};
            for (const key of Object.keys(data.en)) {
                const cur = data[lang]?.[key];
                if (cur == null || String(cur).trim() === '') continue; // missing ≠ stale
                const stamped = status[prefix]?.[key]?.[lang];
                if (stamped && stamped !== hash12(data.en[key])) stale[key] = data.en[key];
            }
            if (Object.keys(stale).length) work.push({ prefix, lang, keys: stale });
        }
    }

    if (!work.length) { console.log('✅ Nothing stale (outside excluded prefixes) — no API calls made.'); return; }

    for (const w of work) console.log(`stale: ${w.prefix}/${w.lang} → ${Object.keys(w.keys).join(', ')}`);
    if (!API_KEY && !process.env.GEM_FAKE_RESPONSE) {
        console.log('\n(dry run — set GEM_API_KEY to translate. In CI this comes from repository secrets.)');
        return;
    }

    let applied = 0, rejected = 0;
    for (const { prefix, lang, keys } of work) {
        let out;
        try { out = await geminiTranslate(lang, keys); }
        catch (e) { console.error(`✗ ${prefix}/${lang}: ${e.message}`); rejected += Object.keys(keys).length; continue; }

        const filePath = path.join(LOC, `${prefix}.json`);
        let raw = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);

        for (const [key, en] of Object.entries(keys)) {
            const val = out[key];
            const reject = (why) => { console.warn(`  ✗ ${prefix}/${lang}/${key}: ${why} — left stale for Sofrut`); rejected++; };
            if (typeof val !== 'string' || !val.trim()) { reject('missing in response'); continue; }
            if (tagCount(val) !== tagCount(en)) { reject('HTML tags not preserved'); continue; }
            const hasGraflect = [...String(val)].some((ch) => isGraflect(ch.charCodeAt(0)));
            if (lang === 'gt' && (!hasGraflect || !gtGlyphsOk(val))) {
                reject('not Graflect (missing PUA glyphs or mixed-script words)'); continue;
            }

            // Formatting-preserving apply: replace the old JSON-encoded value verbatim.
            const oldEnc = JSON.stringify(String(data[lang][key])).slice(1, -1);
            const newEnc = JSON.stringify(val).slice(1, -1);
            if (!raw.includes(oldEnc)) { reject('old value not found verbatim'); continue; }
            raw = raw.replace(oldEnc, newEnc);
            data[lang][key] = val;
            (status[prefix][key] = status[prefix][key] || {})[lang] = hash12(en);
            applied++;
            console.log(`  ✓ ${prefix}/${lang}/${key}`);
        }
        await fs.writeFile(filePath, raw);
    }

    await fs.writeFile(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');
    console.log(`\nApplied ${applied}, rejected ${rejected} (rejected keys stay stale for human review).`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
