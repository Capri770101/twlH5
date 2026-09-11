'''把各页面复制的 local toast（toastText + toast() + .twd-toast 样式）批量替换为全局 @/utils/toast。
用法：python scripts/migrate_toast.py
'''
import re, io, os, sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src')
TARGETS = []
for sub in ('pages', 'components'):
    d = os.path.join(ROOT, sub)
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.vue'):
            p = os.path.join(d, fn)
            s = io.open(p, encoding='utf-8').read()
            if 'class="twd-toast"' in s:
                TARGETS.append(p)

def cut_block(s, start_idx, open_ch='{', close_ch='}'):
    '''从 start_idx 处的 open_ch 开始做括号配对，返回 (块结束下标+1)'''
    i = s.index(open_ch, start_idx)
    depth = 0
    while i < len(s):
        if s[i] == open_ch:
            depth += 1
        elif s[i] == close_ch:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError('unbalanced')

for p in TARGETS:
    s = io.open(p, encoding='utf-8').read()
    orig = s
    name = os.path.basename(p)

    # 1) 删除模板里的 <div v-if="toastText" class="twd-toast">...</div>（可能带 transition 包裹）
    s = re.sub(r'\n[ \t]*<transition[^>]*>\s*\n[ \t]*<div v-if="toastText" class="twd-toast">.*?</div>\s*\n[ \t]*</transition>', '', s, flags=re.S)
    s = re.sub(r'\n[ \t]*<div v-if="toastText" class="twd-toast">[^\n]*</div>', '', s)

    # 2) 删除 const toastText = ref('')
    s = re.sub(r'\n[ \t]*const toastText = ref\(\'\'\)', '', s)

    # 3) 删除 let toastTimer = null
    s = re.sub(r'\n[ \t]*let toastTimer = null', '', s)

    # 4) 删除 function toast(text) { ... } 整个函数（括号配对）
    while True:
        m = re.search(r'\n[ \t]*function toast\([^)]*\)\s*\{', s)
        if not m:
            break
        end = cut_block(s, m.start())
        s = s[:m.start()] + s[end:]

    # 5) 删除 .twd-toast { ... } 样式块
    while True:
        m = re.search(r'\n[ \t]*\.twd-toast[^{]*\{', s)
        if not m:
            break
        end = cut_block(s, m.start())
        s = s[:m.start()] + s[end:]

    if s == orig:
        print('SKIP (no change):', name)
        continue

    # 6) 注入 import（放在最后一条 import 之后）
    imports = list(re.finditer(r'^import .*?$', s, flags=re.M))
    if imports:
        last = imports[-1]
        line = "\nimport { toast } from '@/utils/toast'"
        if "utils/toast" not in s:
            s = s[:last.end()] + line + s[last.end():]
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('MIGRATED:', name)

print('total targets:', len(TARGETS))
