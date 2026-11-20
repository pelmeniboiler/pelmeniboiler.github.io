# build/g2p/llm_speller.py — a large language model doing Kanna's job: spelling words in Graflect, in her voice.
#
# Used by build/g2p/misses/dump.py --llm NAME (and so by kanna_vs_rules.py --llms ...). The model gets:
# the SLUG table from the Graflect article, her rules, and every word she has spelled in the articles it may
# learn from (word → SLUG); then a list of words to spell. Nothing else: no CMUdict, no context.
#
#   NAME    model                        key
#   haiku   claude-haiku-5-5             ANTHROPIC_API_KEY (or the proxy's)
#   sonnet  claude-sonnet-5-5
#   opus    claude-opus-5-5
#   fable   claude-fable-5-2
#   flash   $GEM_MODEL (gemini-2.5-flash)  GEMINI_API_KEY (or the proxy's), sent as x-goog-api-key
#
# Without API keys, as subagents in a Claude Code session (build/g2p/subagents.md):
#   LLM_EXPORT=dir   write dir/<article>.md, the whole request for each held-out article, and ask nothing
#   LLM_ANSWERS=dir  read the answers from dir/<name>/<article>.json ({word: SLUG}) instead of an API
#
# Effort: LLM_EFFORT (default high) for every Claude model, so the tiers are compared at the same setting.
# Answers are kept in runs/llm-cache/, so a rerun costs nothing. No refusal fallback: a fallback model would
# answer in another model's place and spoil the comparison, so a refusal is counted (and the words left Latin).
import hashlib, json, os, re, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MODELS = {'haiku': 'claude-haiku-5-5', 'sonnet': 'claude-sonnet-5-5', 'opus': 'claude-opus-5-5', 'fable': 'claude-fable-5-2',
          'flash': os.environ.get('GEM_MODEL', 'gemini-2.5-flash')}
BATCH = 120

def table():
    """The SLUG table, from the Graflect article (blog/graflect.html and its English strings)."""
    html = open(os.path.join(ROOT, 'blog', 'graflect.html'), encoding='utf-8').read()
    en = json.load(open(os.path.join(ROOT, 'localization', 'graflect.json'), encoding='utf-8')).get('en', {}) if os.path.exists(os.path.join(ROOT, 'localization', 'graflect.json')) else {}
    out = []
    for row in re.findall(r'<tr>(.*?)</tr>', html, re.S):
        cells = re.findall(r'<t[dh][^>]*?(?:data-key="([^"]*)")?[^>]*>(.*?)</t[dh]>', row, re.S)
        vals = [re.sub(r'<[^>]+>', '', en.get(k) or v).strip() for k, v in cells]
        if len(vals) >= 4 and vals[2] and vals[2] != 'SLUG': out.append(f'{vals[2]}\t{vals[1]}\t{vals[3]}')
    return '\n'.join(out)

RULES = '''- Every -ing is īngg: thīngg, yüzīngg.
- w then ī is the single symbol wī (wī, wīl, wīk); r then ä is the single symbol rä.
- a before n or m is ä: kän, män, händ.
- t before r is c, d before r is j: crai (try), jrīm (dream).
- The unstressed vowel is i before a final d, z, n, t or s (ēdid, srvisiz, gárdin), otherwise x (pīpxl).
- An unstressed "er" is just r: kárpxntr. "air" before a consonant or at the end is 4.
- Write · only between two symbols that would otherwise read as one (d·h is d then h; dh is the th in this).
- No apostrophes, capitals, spaces or Latin letters outside the table.'''

def system(hers):
    words = '\n'.join(f'{w}\t{s}' for w, s in sorted(hers.items()))
    return ('You spell English words in Graflect, the phonetic alphabet Wendy made, exactly the way she says and writes them. '
            'Graflect is written here in SLUG: each symbol below is one Graflect letter.\n\n'
            f'SLUG\tIPA\tsound\n{table()}\n\nHer habits:\n{RULES}\n\n'
            'Every word she has already spelled, as word, a tab, and her spelling. They show her accent: '
            'follow them, and spell new words the way she would.\n\n' + words)

def ask_claude(model, sys_text, words):
    import anthropic
    # The API itself, whatever ANTHROPIC_BASE_URL says (a Claude Code session sets it for its own use).
    # With no ANTHROPIC_API_KEY, a placeholder: a proxy that holds the key (a cloud session's) puts it in.
    client = anthropic.Anthropic(base_url=os.environ.get('LLM_ANTHROPIC_URL', 'https://api.anthropic.com'),
                                 api_key=os.environ.get('ANTHROPIC_API_KEY') or 'set-by-proxy')
    schema = {'type': 'object', 'additionalProperties': False, 'required': ['spellings'],
              'properties': {'spellings': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['word', 'slug'],
                                                                     'properties': {'word': {'type': 'string'}, 'slug': {'type': 'string'}}}}}}
    with client.messages.stream(
        model=model, max_tokens=64000,
        system=[{'type': 'text', 'text': sys_text, 'cache_control': {'type': 'ephemeral'}}],
        output_config={'effort': os.environ.get('LLM_EFFORT', 'high'), 'format': {'type': 'json_schema', 'schema': schema}},
        messages=[{'role': 'user', 'content': 'Spell each of these words in SLUG, the way she would. Give every word back exactly as written here.\n\n' + '\n'.join(words)}],
    ) as stream:
        r = stream.get_final_message()
    if r.stop_reason == 'refusal': return {}, {'refusal': True}
    text = next(b.text for b in r.content if b.type == 'text')
    u = r.usage
    return {x['word'].lower(): x['slug'] for x in json.loads(text)['spellings']}, \
           {'in': u.input_tokens, 'cache_read': u.cache_read_input_tokens or 0, 'cache_write': u.cache_creation_input_tokens or 0, 'out': u.output_tokens}

def ask_gemini(model, sys_text, words):
    body = {'systemInstruction': {'parts': [{'text': sys_text}]},
            'contents': [{'role': 'user', 'parts': [{'text': 'Spell each of these words in SLUG, the way she would. Give every word back exactly as written here.\n\n' + '\n'.join(words)}]}],
            'generationConfig': {'responseMimeType': 'application/json', 'responseSchema': {
                'type': 'OBJECT', 'required': ['spellings'], 'properties': {'spellings': {'type': 'ARRAY', 'items': {
                    'type': 'OBJECT', 'required': ['word', 'slug'], 'properties': {'word': {'type': 'STRING'}, 'slug': {'type': 'STRING'}}}}}}}}
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', data=json.dumps(body).encode(),
                                 headers={'content-type': 'application/json', **({'x-goog-api-key': os.environ['GEMINI_API_KEY']} if os.environ.get('GEMINI_API_KEY') else {})})   # else a proxy adds it
    for attempt in range(5):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=900)); break
        except urllib.error.HTTPError as e:   # busy, overloaded or a dropped gateway: wait and ask again
            if e.code in (429, 500, 502, 503, 504) and attempt < 4: time.sleep(60 * (attempt + 1)); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt < 4: time.sleep(60 * (attempt + 1)); continue
            raise
    cand = (d.get('candidates') or [{}])[0]
    if cand.get('finishReason') not in (None, 'STOP'): return {}, {'refusal': cand.get('finishReason')}
    text = ''.join(p.get('text', '') for p in cand.get('content', {}).get('parts', []))
    u = d.get('usageMetadata', {})
    return {x['word'].lower(): x['slug'] for x in json.loads(text)['spellings']}, {'in': u.get('promptTokenCount', 0), 'out': u.get('candidatesTokenCount', 0) + u.get('thoughtsTokenCount', 0)}

def clean(s):
    """Her SLUG letters only: anything else would read as Latin."""
    return re.sub(r'[^a-zāēīōūáéíóúäöüæõšžx4·]', '', s.lower().replace(' ', '').replace('ʃ', 'š'))

def request(hers, words):
    """The whole request as one document, for a subagent: what an API call would send."""
    return (system(hers) + '\n\n---\n\nSpell each of these words in SLUG, the way she would. Give every word back exactly as written here.\n\n'
            + '\n'.join(words) + '\n')

def spell_words(name, words, hers, article=None):
    """{word: SLUG} for these words, from the named model, learning from her words (hers: word → SLUG)."""
    if os.environ.get('LLM_EXPORT'):
        d = os.environ['LLM_EXPORT']; os.makedirs(d, exist_ok=True)
        open(os.path.join(d, f'{article}.md'), 'w', encoding='utf-8').write(request(hers, words)); return {}
    if os.environ.get('LLM_ANSWERS'):
        path = os.path.join(os.environ['LLM_ANSWERS'], name, f'{article}.json')
        got = {k.lower(): v for k, v in json.load(open(path, encoding='utf-8')).items()} if os.path.exists(path) else {}
        if not got: print(f'  no answers from {name} for {article}', file=sys.stderr)
        return {w: clean(got.get(w, '')) for w in words if clean(got.get(w, ''))}
    if name not in MODELS: sys.exit(f'unknown --llm {name}; one of {", ".join(MODELS)}')
    model, sys_text, out = MODELS[name], system(hers), {}
    cache = os.path.join(ROOT, 'runs', 'llm-cache', name); os.makedirs(cache, exist_ok=True)
    log = os.path.join(ROOT, 'runs', 'llm-cache', f'{name}-usage.jsonl')
    for i in range(0, len(words), BATCH):
        chunk = words[i:i + BATCH]
        key = hashlib.sha256(json.dumps([model, os.environ.get('LLM_EFFORT', 'high'), sys_text, chunk]).encode()).hexdigest()[:20]
        path = os.path.join(cache, key + '.json')
        if os.path.exists(path): got = json.load(open(path, encoding='utf-8'))
        else:
            if os.environ.get('LLM_FAKE'): got, usage = {w: '' for w in chunk}, {'fake': True}
            else: got, usage = (ask_gemini if name == 'flash' else ask_claude)(model, sys_text, chunk)
            json.dump(got, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
            open(log, 'a', encoding='utf-8').write(json.dumps({'model': model, 'words': len(chunk), **usage}) + '\n')
        out.update({w: clean(got.get(w, '')) for w in chunk if clean(got.get(w, ''))})
    return out
