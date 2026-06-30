// build/validate-gt.mjs
//
// Platform-agnostic port of the `validateGtLocalization` command from the old
// VS Code extension. Scans every localization JSON file's "gt" (Graflect)
// section for words that mix Graflect Private-Use-Area codepoints
// (U+EC70–U+ECEF) with non-Graflect characters, which usually means a glyph
// was left untransliterated.
//
// Run from the repo root:  npm run lint:gt
// Exits non-zero when issues are found, so it can gate a CI build.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const LOCALIZATION_DIR = path.join(process.cwd(), 'localization');

function isGraflect(c) {
    return c >= 0xec70 && c <= 0xecef;
}

async function validateGtInFile(filePath) {
    const issues = [];
    const offendingGlyphs = new Set();
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    if (!data.gt) return { issues, glyphs: [] };

    const gtLocalization = data.gt;
    const lines = fileContent.split('\n');

    const gtBlockStartIndex = lines.findIndex((line) => line.trim().startsWith('"gt":'));
    if (gtBlockStartIndex === -1) return { issues, glyphs: [] };

    let braceCount = 0;
    let gtBlockEndIndex = -1;
    let firstBraceFound = false;
    for (let i = gtBlockStartIndex; i < lines.length; i++) {
        for (const char of lines[i]) {
            if (char === '{') { braceCount++; firstBraceFound = true; }
            else if (char === '}') { braceCount--; }
        }
        if (firstBraceFound && braceCount === 0) { gtBlockEndIndex = i; break; }
    }
    if (gtBlockEndIndex === -1) return { issues, glyphs: [] };

    for (const key of Object.keys(gtLocalization)) {
        const value = gtLocalization[key];
        const plainTextValue = value.replace(/<[^>]*>/g, ' ');
        const textWithPunctuationAsSpaces = plainTextValue.replace(/[.,;:'"!?()\[\]{}\-_*\\/–—&]/g, ' ');
        const words = textWithPunctuationAsSpaces.split(/\s+/);

        for (const word of words) {
            if (word.length === 0) continue;

            let hasGt = false;
            let hasNonGt = false;
            for (let i = 0; i < word.length; i++) {
                if (isGraflect(word.charCodeAt(i))) hasGt = true;
                else hasNonGt = true;
            }

            if (hasGt && hasNonGt) {
                for (const char of word) {
                    if (!isGraflect(char.charCodeAt(0))) offendingGlyphs.add(char);
                }

                let lineNum = -1;
                for (let i = gtBlockStartIndex; i <= gtBlockEndIndex; i++) {
                    if (lines[i].includes(`"${key}"`)) { lineNum = i; break; }
                }
                issues.push({
                    file: path.basename(filePath),
                    line: lineNum === -1 ? '?' : lineNum + 1,
                    key,
                    word,
                });
            }
        }
    }
    return { issues, glyphs: Array.from(offendingGlyphs) };
}

async function main() {
    const files = await fs.readdir(LOCALIZATION_DIR);
    const allIssues = [];
    const offendingGlyphs = new Set();

    for (const fileName of files) {
        if (!fileName.endsWith('.json')) continue;
        const { issues, glyphs } = await validateGtInFile(path.join(LOCALIZATION_DIR, fileName));
        glyphs.forEach((g) => offendingGlyphs.add(g));
        allIssues.push(...issues);
    }

    if (allIssues.length === 0) {
        console.log('✅ All Graflect definitions are valid.');
        return;
    }

    console.error(`⚠️  Found ${allIssues.length} potential Graflect issue(s):\n`);
    for (const issue of allIssues) {
        console.error(`  ${issue.file}:${issue.line}  key "${issue.key}"  →  offending word: "${issue.word}"`);
    }
    console.error('\nErroneous (non-Graflect) glyphs found inside gt words:');
    console.error('  ' + Array.from(offendingGlyphs).join(' '));
    process.exit(1);
}

main().catch((error) => {
    console.error(`❌ Validation failed: ${error.message}`);
    process.exit(1);
});
