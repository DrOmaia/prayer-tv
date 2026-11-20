#!/usr/bin/env python3
"""Turn the quran-align word timings (github.com/cpfair/quran-align, CC BY 4.0) into one small file per surah:
app/src/main/assets/web/words/<reciter folder>/<sss>.json = {"<ayah>": [[first word, word after last, start ms, end ms], ...]}
The reciter folder is the everyayah.com folder name of the recording the timings were made for.
Only the folders the app uses are written: the ones named in `words:` in the RECITERS list of app.js.
Usage: python3 tools/word-timings.py <folder with the release files (.json or .zip)>"""
import json, os, re, sys, zipfile, io

src = sys.argv[1]
web = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'assets', 'web')
out = os.path.join(web, 'words')
used = set(re.findall(r"words: '([^']+)'", open(os.path.join(web, 'app.js'), encoding='utf-8').read()))

def blobs():
    for name in sorted(os.listdir(src)):
        p = os.path.join(src, name)
        if name.endswith('.zip'):
            with zipfile.ZipFile(p) as z:
                for n in z.namelist():
                    if n.endswith('.json') and '__MACOSX' not in n and not os.path.basename(n).startswith('._'):
                        yield os.path.basename(n)[:-5], z.read(n)
        elif name.endswith('.json'):
            yield name[:-5], open(p, 'rb').read()

for reciter, raw in blobs():
    if reciter not in used:
        print('not used by the app:', reciter)
        continue
    try:
        data = json.loads(raw)
    except ValueError as e:
        print('skipped', reciter, e)
        continue
    surahs = {}
    for v in data:
        segs = [[int(a), int(b), int(c), int(d)] for a, b, c, d in (s[:4] for s in v.get('segments') or [])]
        surahs.setdefault(v['surah'], {})[str(v['ayah'])] = segs
    d = os.path.join(out, reciter)
    os.makedirs(d, exist_ok=True)
    size = 0
    for s, ayat in surahs.items():
        p = os.path.join(d, '%03d.json' % s)
        with open(p, 'w') as f:
            json.dump(ayat, f, separators=(',', ':'))
        size += os.path.getsize(p)
    print('%-40s %3d surahs %7d KB' % (reciter, len(surahs), size // 1024))
