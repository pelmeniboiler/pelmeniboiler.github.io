# build/g2p/predict_rules.py — a Graflect system for the grader, no model:
#   1. words she has written in the training articles (as build/graflect-words.mjs learns them),
#      and words she leaves in Latin there (names, labels) stay Latin,
#   2. else CMUdict through her rules (cmu2slug_lib.py),
#   3. else the English word, left in Latin.
#   Names stay Latin before step 2: two or more capitals (PCB, KiCad), and the ending of a dotted name (system.settings).
#   Then "the" before a vowel becomes dhī, as she writes it.
# Usage (on Windows: python, and npm.cmd from PowerShell):
#   npm run gt:eval -- --cmd "python3 build/g2p/predict_rules.py path/to/cmudict.dict"
import json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu2slug_lib import slug, load_cmu

def strip(s): return re.sub(r'&\w+;', ' ', re.sub(r'<[^>]+>', ' ', s))
def sentences(s): return re.split(r'[.!?;:]+\s', strip(s))
WORD = re.compile(r"[A-Za-z][A-Za-z'’]*")
NAME = re.compile(r"[A-Za-z][A-Za-z0-9'’]*(?:[-.][A-Za-z0-9]+)*")   # a word, a hyphenated name, or a dotted name

def kept_compound(m, keep_latin):
    """Is this word part of a hyphenated name she keeps in Latin (E-Ink, also in E-Ink-like)?"""
    s, a, b = m.string, m.start(), m.end()
    while a > 0 and (s[a - 1].isalnum() or s[a - 1] == '-'): a -= 1
    while b < len(s) and (s[b].isalnum() or s[b] == '-'): b += 1
    parts = s[a:b].strip('-').lower().split('-')
    if len(parts) < 2: return False
    here = s[a:m.start()].strip('-').count('-') + (1 if s[a:m.start()].strip('-') else 0)
    return any('-'.join(parts[i:j]) in keep_latin for i in range(len(parts)) for j in range(i + 2, len(parts) + 1) if i <= here < j)
VOWELS = tuple('aeiouxæäáōõöīüē4')

def learn(lines):
    """Her spellings from aligned training lines (SLUG), kept when 60% of occurrences agree,
    and the words she leaves in Latin more often than she spells them."""
    votes, latin = collections.defaultdict(collections.Counter), collections.Counter()
    for l in lines:
        es, gs = sentences(l['en']), sentences(l['slug'])
        if len(es) != len(gs): es, gs = [strip(l['en'])], [strip(l['slug'])]
        for e, g in zip(es, gs):
            ew, gw = e.split(), g.split()
            if len(ew) != len(gw): continue
            for a, b in zip(ew, gw):
                if '‹' in b: continue   # Latin she kept: learned below, not as a spelling
                a = re.sub(r"[^A-Za-z']", '', a).lower(); b = re.sub(r'[^\w\u00C0-\u024F4·␣]', '', b).strip('·')
                if a and b: votes[a][b] += 1
        # Latin she kept: English words that appear as-is in her Graflect line. A hyphenated name is kept
        # whole (E-Ink, not "ink"); a dotted name (program.launcher) teaches nothing: the dotted rule has it.
        kept = set()
        for t in NAME.findall(re.sub(r'<[^>]+>|&\w+;', ' ', l['gt'])):
            if '.' not in t and (len(t) > 1 or '-' in t): kept.add(t.lower())
        for t in NAME.findall(strip(l['en'])):
            if '.' in t: continue
            if t.lower() in kept: latin[t.lower()] += 1
            elif '-' not in t and t.lower().replace('’', "'") in kept: latin[t.lower()] += 1
            elif '-' in t: latin.update(p for p in t.lower().split('-') if p in kept)
    hers = {}
    for w, c in votes.items():
        b, n = c.most_common(1)[0]
        if n / sum(c.values()) >= 0.6: hers[w] = b
    keep_latin = {w for w, n in latin.items() if n >= sum(votes[w].values())}
    return hers, keep_latin

def spell_line(en, spell):
    """Spell the words of one English line (outside tags and entities), then her context rules."""
    out = ''.join(p if re.match(r'<[^>]+>|&#?\w+;', p) else WORD.sub(spell, p) for p in re.split(r'(<[^>]+>|&#?\w+;)', en))
    # "the" before a vowel is dhī; "have to" is hæf tü.
    # Also before a name kept in Latin that starts with a vowel (the Iris, the <abbr>IPA</abbr>).
    out = re.sub(r'(?<![^\W\d_])dhx(\s+)(?=(?:<[^>]+>)*(?:[' + ''.join(VOWELS) + ']|‹[AEIOUaeiou]))', r'dhī\1', out)
    return re.sub(r'(?<![^\W\d_])hæv(\s+)(?=tü(?![^\W\d_]))', r'hæf\1', out)

def latin_place(m):
    """Latin wherever it stands, even a word she spells elsewhere: the ending of a dotted name
    (system.settings, eink.article, music.ogg), and code after @ (@media)."""
    i, s = m.start(), m.string
    if i >= 1 and s[i - 1] == '@': return True
    return i >= 2 and s[i - 1] == '.' and s[i - 2].isalnum()

def latin_name(m):
    """A word she hasn't written stays Latin with two or more capitals (PCB, KiCad, MuseScore), or in a Latin place."""
    return sum(c.isupper() for c in m.group(0)) >= 2 or latin_place(m)

def speller(hers, keep_latin, cmu=None, guessed=None):
    def spell(m):
        w = m.group(0); k = w.lower().replace('’', "'")
        if k in keep_latin or kept_compound(m, keep_latin) or latin_place(m): return '‹' + w + '›'
        if k in hers: return hers[k]
        if k.replace("'", '') in hers: return hers[k.replace("'", '')]
        if latin_name(m): return '‹' + w + '›'
        if cmu is not None and k in cmu: return slug(cmu[k])
        if guessed and guessed.get(k): return guessed[k]
        return '‹' + w + '›'
    return spell

def main():
    cmu = load_cmu(sys.argv[1])
    train = [json.loads(l) for l in open(os.environ['TRAIN'], encoding='utf-8') if l.strip()]
    hers, keep_latin = learn(train)
    spell = speller(hers, keep_latin, cmu)
    with open(os.environ['OUT'], 'w', encoding='utf-8') as out:
        for l in open(os.environ['TEST'], encoding='utf-8'):
            if not l.strip(): continue
            t = json.loads(l)
            out.write(json.dumps({'id': t['id'], 'slug': spell_line(t['en'], spell)}, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
