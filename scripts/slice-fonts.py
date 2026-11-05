#!/usr/bin/env python3
"""
把两款中文字体（fonts-src/MarginSans-SC.woff2、MarginSerif-SC.woff2）按 unicode-range 切片，
输出到 public/fonts/sc/，并生成 public/fonts/margin-sc.css（每片一条带 unicode-range 的 @font-face，url 相对这个 css）。
内容脚本只插一个 <link> 指向它，unicode-range 表（约 100KB）不进 content.js。
浏览器只下载页面上实际出现的字所在的那几片，而不是整份 1.7MB / 1.3MB。

切片方案沿用 Google Fonts 给 Noto Sans SC 的分片（按字频排好的 ~100 组，scripts/cjk-slices.json），
前 73 个低频组每 8 组合并，减少重复字体结构；常用字组仍独立加载，编号不变。
字体里有、但不在这些分片里的字统一放进最后一片 rest。

  pip install fonttools brotli
  python3 scripts/slice-fonts.py            # 用仓库里的 cjk-slices.json
  python3 scripts/slice-fonts.py --fetch    # 重新从 Google Fonts 拉分片定义
"""
import json, os, re, sys, urllib.request, tempfile
from concurrent.futures import ProcessPoolExecutor
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLICES = os.path.join(ROOT, 'scripts', 'cjk-slices.json')
OUT = os.path.join(ROOT, 'public', 'fonts', 'sc')
CSS = os.path.join(ROOT, 'public', 'fonts', 'margin-sc.css')
FONTS = [('sans', 'MarginSans-SC.woff2'), ('serif', 'MarginSerif-SC.woff2')]
FAMILY = {'sans': 'Margin Sans SC', 'serif': 'Margin Serif SC'}
WEIGHT = {'sans': '400 700', 'serif': '400'}

def parse_range(s):
    cps = set()
    for part in s.split(','):
        part = part.strip().upper().replace('U+', '')
        if not part: continue
        if '-' in part:
            a, b = part.split('-'); cps.update(range(int(a, 16), int(b, 16) + 1))
        elif '?' in part:
            cps.update(range(int(part.replace('?', '0'), 16), int(part.replace('?', 'F'), 16) + 1))
        else:
            cps.add(int(part, 16))
    return cps

def fmt_range(cps):
    cps = sorted(cps); out = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ','.join(out)

def fetch():
    req = urllib.request.Request('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&display=swap',
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'})
    css = urllib.request.urlopen(req).read().decode()
    ranges = re.findall(r'unicode-range:\s*([^;]+);', css)
    json.dump(ranges, open(SLICES, 'w'), indent=0)
    print('fetched', len(ranges), 'slices')

def cut(job):
    src, cps, path = job
    opt = subset.Options()
    opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.hinting = False
    opt.name_IDs = ['*']; opt.name_languages = ['*']; opt.notdef_outline = True
    opt.drop_tables += ['DSIG']
    f = TTFont(src)
    s = subset.Subsetter(opt); s.populate(unicodes=cps); s.subset(f)
    f.flavor = 'woff2'; f.save(path)

def main():
    if '--fetch' in sys.argv or not os.path.exists(SLICES): fetch()
    groups = [parse_range(r) for r in json.load(open(SLICES))]
    # 只重切其中一款：--only sans|serif（单核机器上一次切完会比较慢）
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    os.makedirs(OUT, exist_ok=True)
    ts = ['/* 由 scripts/slice-fonts.py 生成，不要手改 */']
    for key, file in FONTS:
        woff = os.path.join(ROOT, 'fonts-src', file)
        # 先解一次 woff2，避免每片都重复解压
        src = os.path.join(tempfile.gettempdir(), file.replace('.woff2', '.ttf'))
        if not os.path.exists(src) or os.path.getmtime(src) < os.path.getmtime(woff):
            t = TTFont(woff); t.flavor = None; t.save(src)
        cmap = set(TTFont(src).getBestCmap().keys())
        left = set(cmap); parts = []
        for g in groups:
            cps = g & left
            if not cps: continue
            left -= cps; parts.append(cps)
        if left: parts.append(left)
        if only and only != key:
            prev = [l for l in open(CSS, encoding='utf-8').read().split('\n') if f'"{FAMILY[key]}"' in l] if os.path.exists(CSS) else []
            if prev: ts += prev; continue
        for old in os.listdir(OUT):
            if old.startswith(key + '-'): os.remove(os.path.join(OUT, old))
        rare = min(73, len(parts))
        packed = [(f'{key}-rare-{i // 8:03d}', set().union(*parts[i:min(i + 8, rare)])) for i in range(0, rare, 8)]
        packed += [(f'{key}-{i:03d}', cps) for i, cps in enumerate(parts) if i >= rare]
        jobs = [(src, sorted(cps), os.path.join(OUT, f'{name}.woff2')) for name, cps in packed]
        with ProcessPoolExecutor(max_workers=min(4, os.cpu_count() or 1)) as ex: list(ex.map(cut, jobs))
        rows = []; total = 0
        for (_, cps, path) in jobs:
            total += os.path.getsize(path)
            rows.append('@font-face{font-family:"%s";src:url(sc/%s) format("woff2");font-weight:%s;font-style:normal;font-display:swap;unicode-range:%s}' % (FAMILY[key], os.path.basename(path), WEIGHT[key], fmt_range(cps)))
        ts += rows
        print(f'{file}: {len(cmap)} glyph codepoints → {len(jobs)} slices, {total} bytes (source {os.path.getsize(woff)})')
    open(CSS, 'w', encoding='utf-8', newline='\n').write('\n'.join(ts) + '\n')

if __name__ == '__main__':
    main()
