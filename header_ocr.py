# 縦書きの見出し（都道府県×国籍の表の国籍の名前）を読む
#   RapidOCR（中国語の字の部品）はカタカナが読めないので、見出しのマスを1字ずつに切り分け、横に並べ直した画像を作って、
#   Windows の日本語の読み取り（ocr_windows.ps1）で読む。縦書きの「ー」（縦の棒）は横にしてから並べる
# 使い方（部品として）: headers(PDF, ページ, 読み取り結果の JSON, 行の数) → {"左": [列ごとの字], "右": [...]}
import json
import os
import subprocess
import tempfile
from statistics import median

import pymupdf
from PIL import Image

from ocr_assemble import read_spread

PS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_windows.ps1")
DPI = 300


def _segments(profile, min_gap, min_len):
    """1次元の黒さの並びから、字のある区間（黒い所が続く所）を取り出す"""
    out, start, gap = [], None, 0
    for i, v in enumerate(profile):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if i - gap - start + 1 >= min_len:
                    out.append((start, i - gap + 1))
                start, gap = None, 0
    if start is not None and len(profile) - start >= min_len:
        out.append((start, len(profile)))
    return out


def _cell_word(img):
    """見出しのマス1つ（縦書き・罫線は消してある）を、字を横に並べた画像にする"""
    W, H = img.size
    px = img.load()
    dark = [[px[x, y] < 150 for x in range(W)] for y in range(H)]
    rowsum = [sum(r) for r in dark]
    segs = _segments([v > 0 for v in rowsum], min_gap=2, min_len=3)
    if not segs:
        return None
    # 字の高さの目安：マスの幅の6割くらい。それより高いまとまりは、詰まった字が続いたものとして等分する
    ch_h = max(8, min(W * 0.62, median([b - a for a, b in segs if b - a > 6] or [W * 0.6])))
    parts = []
    for a, b in segs:
        n = max(1, round((b - a) / ch_h)) if (b - a) > ch_h * 1.6 else 1
        step = (b - a) / n
        parts += [(int(a + i * step), int(a + (i + 1) * step)) for i in range(n)]
    chars = []
    for y0, y1 in parts:
        xs = [x for x in range(W) if any(dark[y][x] for y in range(y0, y1))]
        if not xs:
            continue
        x0, x1 = min(xs), max(xs) + 1
        ch = img.crop((x0, y0, x1, y1))
        if (y1 - y0) > (x1 - x0) * 2.2 and (y1 - y0) > 10:  # 縦の棒＝縦書きの「ー」：横にする
            ch = ch.rotate(90, expand=True)
        chars.append(ch)
    if not chars:
        return None
    size = max(max(c.height for c in chars), max(c.width for c in chars))
    pad = size // 4
    out = Image.new("L", (len(chars) * (size + pad) + pad * 2, size + pad * 2), 255)
    x = pad
    for c in chars:
        out.paste(c, (x + (size - c.width) // 2, pad + (size - c.height) // 2))
        x += size + pad
    return out.resize((out.width * 2, out.height * 2))


def _band_cells(band):
    """見出しの帯（半ページ分）から、横の罫線を消し、縦の罫線でマスに分ける。戻り値: [(左, 右), …]（帯の中の x）"""
    W, H = band.size
    px = band.load()
    for y in range(H):  # 横の罫線（横に長く黒い行）を白に
        if sum(px[x, y] < 150 for x in range(W)) > W * 0.5:
            for x in range(W):
                px[x, y] = 255
    colsum = [sum(px[x, y] < 150 for y in range(H)) for x in range(W)]
    rules = [x for x in range(W) if colsum[x] > H * 0.45]
    groups, cur = [], []
    for x in rules:
        if cur and x - cur[-1] > 3:
            groups.append(cur)
            cur = []
        cur.append(x)
    if cur:
        groups.append(cur)
    edges = [(g[0], g[-1]) for g in groups]
    cells = [(a[1] + 4, b[0] - 4) for a, b in zip(edges, edges[1:]) if b[0] - a[1] > 30]
    return cells


def headers(pdf_path, page, json_path, n_rows, top_frac=0.07, workdir=None):
    o = read_spread(json_path, n_rows)
    pg = pymupdf.open(pdf_path)[page - 1]
    pix = pg.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    workdir = workdir or tempfile.mkdtemp()
    jobs, where = [], []
    for side in ("左", "右"):
        v = o["sides"][side]
        if not v:
            continue
        cols, rows = v["cols"], v["rows"]
        y_bot = int(rows[0] - (rows[1] - rows[0]) * 0.9) if len(rows) > 1 else int(rows[0] - 40)
        y_top = int(pix.height * top_frac)
        x_off = 0 if side == "左" else pix.width // 2
        band = img.crop((x_off, y_top, x_off + pix.width // 2, y_bot))
        cells = _band_cells(band)
        for i, c in enumerate(cols):
            # この列の数の右端を含むマス（数は右の罫線の少し左にそろう）
            cx = c - x_off - 6
            hit = [cl for cl in cells if cl[0] - 20 <= cx <= cl[1] + 20]
            if not hit:
                where.append((side, i, None))
                continue
            a, b = min(hit, key=lambda cl: abs(cl[1] - cx))
            word = _cell_word(band.crop((a, 0, b, band.height)))
            if word is None:
                where.append((side, i, None))
                continue
            p = os.path.join(workdir, f"{side}_{i:02d}.png")
            word.save(p)
            jobs.append((p, p[:-4] + ".json"))
            where.append((side, i, p[:-4] + ".json"))
    lst = os.path.join(workdir, "list.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for a, b in jobs:
            if os.path.exists(b):
                os.remove(b)
            f.write(f"{a}\t{b}\n")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS, lst], capture_output=True)
    out = {"左": [], "右": []}
    for side, i, j in where:
        text = ""
        if j and os.path.exists(j):
            with open(j, encoding="utf-8") as f:
                d = json.load(f)
            text = "".join(w["t"] for l in d["lines"] for w in l["words"])
        out[side].append(text)
    return out
