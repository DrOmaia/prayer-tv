#!/usr/bin/env python3
"""The English meaning of each word of the Qur'an (shown under the word in the player, button «English»):
app/src/main/assets/web/wbw/<sss>.json = {"v": [[meaning of word 1, word 2, ...] for each verse], "alt": {"<ayah>": [...]}}
"alt" holds a second list for the few verses where the app's own text divides the words differently
(e.g. «بَعۡدَ مَا» as two words, «مَالِيَ» as one); the page uses the list whose length matches the words it shows.
Source: the word-by-word translation of Quran.com, via the npm package @kmaslesa/holy-quran-word-by-word-full-data (ISC).
Usage: npm pack @kmaslesa/holy-quran-word-by-word-full-data && tar xzf kmaslesa-*.tgz
       python3 tools/wbw.py package/data.json"""
import json, os, sys, collections

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'src', 'main', 'assets', 'web', 'wbw')
os.makedirs(out, exist_ok=True)
wb = collections.OrderedDict()
for page in json.load(open(sys.argv[1], encoding='utf-8')):
    for a in page['ayahs']:
        for w in a.get('words') or []:
            if not w or w.get('char_type_name') != 'word':
                continue
            wb.setdefault(w['parentAyahVerseKey'], []).append(' '.join(((w.get('translation') or {}).get('text') or '').split()))

def split(k, i, a, b):  # one meaning over two words of the app's text
    g = wb[k]; return g[:i] + [a, b] + g[i + 1:]
def merge(k, i, t=None):  # two meanings under one word of the app's text
    g = wb[k]; return g[:i] + [t or (g[i] + ' ' + g[i + 1])] + g[i + 2:]

ALT = {
    '2:181': split('2:181', 2, 'after', 'what'),
    '8:6': split('8:6', 3, 'after', 'what'),
    '13:37': split('13:37', 7, 'after', 'what'),
    '15:7': merge('15:7', 0),
    '27:20': merge('27:20', 3, 'Why'),
    '36:22': merge('36:22', 0),
    '37:130': wb['37:130'] + [''],
    '37:164': merge('37:164', 0),
    '41:47': merge('41:47', 24),
}
total = 0
for s in range(1, 115):
    v, alt, a = [], {}, 1
    while '%d:%d' % (s, a) in wb:
        k = '%d:%d' % (s, a)
        v.append(wb[k])
        if k in ALT:
            alt[str(a)] = ALT[k]
        a += 1
    d = {'v': v}
    if alt:
        d['alt'] = alt
    p = os.path.join(out, '%03d.json' % s)
    json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total += os.path.getsize(p)
print('%d verses, %d KB' % (len(wb), total // 1024))
