#!/usr/bin/env python3
"""Tajweed colours for the Qur'an text: one small file per surah in app/src/main/assets/web/tajweed/<sss>.json
= {"<ayah>": [[text, rule], ...]} where rule is the name of a tajweed rule or "" (plain text).
Source: the npm package react-native-quran-tajweed (MIT), made from the text_uthmani_tajweed field of the Quran.com API.
Heavy / light letters (tafkhim / tarqiq) are left out on purpose (the owner chose the basic rules only).
Usage: npm pack react-native-quran-tajweed && tar xzf react-native-quran-tajweed-*.tgz
       python3 tools/tajweed.py package/src/data"""
import json, os, sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'src', 'main', 'assets', 'web', 'tajweed')
os.makedirs(out, exist_ok=True)
legend = json.load(open(os.path.join(src, 'index.json'), encoding='utf-8'))['legend']
skip = {'tafkhim', 'tarqiq'}
total = 0
for s in range(1, 115):
    d = json.load(open(os.path.join(src, 'surah_%03d.json' % s), encoding='utf-8'))
    res = {}
    for a in d['ayahs']:
        segs = []
        for text, rules in a['s']:
            names = [legend[r] for r in rules if legend[r] not in skip]
            rule = names[0] if names else ''
            if segs and segs[-1][1] == rule:
                segs[-1][0] += text
            else:
                segs.append([text, rule])
        res[str(a['ayah'])] = segs
    p = os.path.join(out, '%03d.json' % s)
    json.dump(res, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total += os.path.getsize(p)
print('114 surahs, %d KB' % (total // 1024))
