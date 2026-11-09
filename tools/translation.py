#!/usr/bin/env python3
"""English meaning of the Qur'an under each verse (Qur'an player, button «English»): one file per surah,
app/src/main/assets/web/en/<sss>.json = ["verse 1", "verse 2", ...].
Source: Saheeh International (Umm Muhammad), via the npm package quran-json (dist/quran_en.json, from tanzil.net).
Usage: npm pack quran-json && tar xzf quran-json-*.tgz && python3 tools/translation.py package/dist/quran_en.json"""
import json, os, sys

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'src', 'main', 'assets', 'web', 'en')
os.makedirs(out, exist_ok=True)
total = 0
for ch in json.load(open(sys.argv[1], encoding='utf-8')):
    p = os.path.join(out, '%03d.json' % ch['id'])
    json.dump([v['translation'] for v in ch['verses']], open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total += os.path.getsize(p)
print('%d KB' % (total // 1024))
