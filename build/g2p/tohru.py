# build/g2p/tohru.py — Tohru, the next Graflect model: Kanna's network, taught by Opus instead of CMUdict.
#
# Kanna learned how English sounds from CMUdict through Wendy's rules, so where Wendy differs from CMUdict
# she repeats CMUdict's spelling. Opus spells far more like Wendy (the spelling test: 27 of the 40 words
# CMUdict knows, to CMUdict's 17). So Opus spells the most common English words her way, and Tohru learns
# from that instead.
#
#   python3 build/g2p/tohru.py words                 tohru/words.txt: the 20,000 most common words she hasn't written
#   python3 build/g2p/tohru.py requests DIR [500]    one request per batch of words, for Opus (as subagents)
#   python3 build/g2p/tohru.py merge DIR             their answers (DIR/answers/NNN.json) → tohru/teacher.json
#   python build/g2p/tohru.py train cmudict.dict tohru.pt [--mix]     on Geniza: pretrain Tohru
#
# Opus learns from her words minus the 80 spelling-test words, and the list leaves those out too, so the
# spelling test stays a fair test for Tohru. --mix: Opus's words, and CMUdict through her rules for every
# word Opus didn't spell (126,000 words instead of 20,000); without it, Opus's words only.
# Then grade Tohru like Kanna: kanna_vs_rules.py --kanna tohru.pt, spelltest.py kanna CMU tohru.pt tohru.
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DIR = os.path.join(HERE, 'tohru'); sys.path.insert(0, HERE)
N = 20000

def hers_for_teacher():
    """Her words (articles and dictionary), minus the spelling test's words, and the ones she keeps in Latin."""
    from spelltest import hers, words as test_words
    h, keep = hers(); test = set(test_words()['order'])
    return {w: s for w, s in h.items() if w not in test}, keep, test

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    os.makedirs(DIR, exist_ok=True)
    if cmd == 'words':
        from wordfreq import top_n_list
        h, keep, test = hers_for_teacher()
        known = set(h) | set(keep) | test | {w.replace("'", '') for w in h}
        out = []
        for w in top_n_list('en', 200000):
            if re.fullmatch(r'[a-z]{2,}', w) and w not in known: out.append(w)
            if len(out) == N: break
        open(os.path.join(DIR, 'words.txt'), 'w').write('\n'.join(out) + '\n')
        print(len(out), 'words →', os.path.relpath(os.path.join(DIR, 'words.txt'), ROOT))
    elif cmd == 'requests':
        from llm_speller import request
        h, _, _ = hers_for_teacher()
        d = sys.argv[2]; size = int(sys.argv[3]) if len(sys.argv) > 3 else 500
        ws = open(os.path.join(DIR, 'words.txt')).read().split()
        os.makedirs(os.path.join(d, 'tasks'), exist_ok=True); os.makedirs(os.path.join(d, 'answers'), exist_ok=True)
        for i in range(0, len(ws), size):
            open(os.path.join(d, 'tasks', f'{i // size:03d}.md'), 'w', encoding='utf-8').write(request(h, ws[i:i + size]))
        print((len(ws) + size - 1) // size, 'requests in', d)
    elif cmd == 'merge':
        from llm_speller import clean
        d = sys.argv[2]; ws = open(os.path.join(DIR, 'words.txt')).read().split(); got = {}
        for f in sorted(os.listdir(os.path.join(d, 'answers'))):
            got.update({k.lower(): clean(v) for k, v in json.load(open(os.path.join(d, 'answers', f), encoding='utf-8')).items()})
        teacher = {w: got[w] for w in ws if got.get(w)}
        json.dump({'note': 'Opus’s spellings, in SLUG, of the most common English words she hasn’t written (tohru.py).', 'words': teacher},
                  open(os.path.join(DIR, 'teacher.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(f'{len(teacher)} of {len(ws)} words spelled; missing {len(ws) - len(teacher)}')
    elif cmd == 'train':
        from pretrain import pretrain
        from cmu2slug_lib import load_cmu, slug
        teacher = json.load(open(os.path.join(DIR, 'teacher.json'), encoding='utf-8'))['words']
        pairs = list(teacher.items())
        if '--mix' in sys.argv: pairs += [(w, slug(p)) for w, p in load_cmu(sys.argv[2]).items() if w not in teacher]
        _, _, test = hers_for_teacher()
        pretrain(sys.argv[2], sys.argv[3], tiny='--tiny' in sys.argv, exclude=test, pairs=pairs)
    else:
        sys.exit('usage: tohru.py words | requests DIR [size] | merge DIR | train cmudict.dict tohru.pt [--mix]')

if __name__ == '__main__':
    main()
