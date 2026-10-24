#!/usr/bin/env python3
"""Copy AGENTS.md (the single source of the AI instructions) into the file each AI tool reads automatically."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'AGENTS.md'
NOTE = '<!-- Copy of AGENTS.md made by tools/sync-ai.py. Edit AGENTS.md, then run: python3 tools/sync-ai.py -->\n\n'
TARGETS = {
    'CLAUDE.md': '',
    'GEMINI.md': '',
    '.github/copilot-instructions.md': '',
    '.windsurfrules': '',
    '.cursor/rules/prayer-tv.mdc': '---\ndescription: Rules for changing the prayer-times app\nalwaysApply: true\n---\n',
}

text = SRC.read_text(encoding='utf-8')
for name, head in TARGETS.items():
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(head + NOTE + text, encoding='utf-8')
    print('wrote', name)
