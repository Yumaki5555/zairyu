# 読み取った文字の箱（元データ/OCR結果/*.json）を、表の行と列に組み直すための部品
#   ・数字の読み方（「1,234」「-」＝0、読み違えやすい字の直し）… to_number
#   ・見開きのページを左右に分け、数字を行（縦の位置）と列（右端の位置）にまとめる … grid
#   ・行の左にある字（都道府県の名前）を行ごとにつなげる … row_labels
import json
import re
from statistics import median

DASHES = set("-ー一―‐−–—－_~～")
FIX = str.maketrans({"O": "0", "o": "0", "D": "0", "l": "1", "I": "1", "|": "1", "!": "1", "i": "1", "S": "5", "s": "5",
                     "B": "8", "Z": "2", "z": "2", "b": "6", "g": "9", "q": "9", "，": ",", ".": ",", "、": ",", "'": ",",
                     "`": ","})


def to_number(t):
    """読み取った文字を数に。「-」などは 0、数でなければ None。かっこ付き「(5)」は ('paren', 5)"""
    s = t.strip().replace(" ", "")
    if s and all(c in DASHES for c in s):
        return 0
    m = re.fullmatch(r"[(（]([\d,]+)[)）]", s)
    if m:
        return ("paren", int(m.group(1).replace(",", "")))
    s2 = s.translate(FIX)
    if re.fullmatch(r"\d{1,3}(,\d{3})*|\d+", s2):
        return int(s2.replace(",", ""))
    return None


def load(path):
    """JSON を読み、箱を (左, 右, 上, 下, 文字, 確からしさ) のリストに"""
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    toks = []
    for box, text, conf in d["boxes"]:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        # 「1,366 261,948」のように2つの数が1つの箱になったときは、空白で分けて幅を割り振る
        parts = text.split()
        if len(parts) > 1 and all(to_number(p) is not None for p in parts):
            x0, x1 = min(xs), max(xs)
            n = sum(len(p) for p in parts)
            cur = x0
            for p in parts:
                w = (x1 - x0) * len(p) / n
                toks.append((cur, cur + w, min(ys), max(ys), p, conf))
                cur += w
            continue
        toks.append((min(xs), max(xs), min(ys), max(ys), text, conf))
    return d, toks


def cluster(values, gap):
    """並べた値を、間が gap より開いた所で分ける。各まとまりの (中心, 要素の番号のリスト)"""
    order = sorted(range(len(values)), key=lambda i: values[i])
    groups, cur = [], []
    for i in order:
        if cur and values[i] - values[cur[-1]] > gap:
            groups.append(cur)
            cur = []
        cur.append(i)
    if cur:
        groups.append(cur)
    return [(median(values[i] for i in g), g) for g in groups]


def grid(toks, x0, x1, y0, y1, row_gap=None, col_gap=None):
    """x0〜x1・y0〜y1 の範囲の数を、行と列にまとめる。
    戻り値: rows（行の中心の y のリスト）, cols（列の右端の x のリスト）, cells {(行, 列): (数, 文字, 確からしさ)}, extra（同じマスに2つ以上来たもの）"""
    nums = [t for t in toks if x0 <= (t[0] + t[1]) / 2 < x1 and y0 <= (t[2] + t[3]) / 2 < y1 and to_number(t[4]) is not None]
    if not nums:
        return [], [], {}, []
    hs = [t[3] - t[2] for t in nums]
    h = median(hs)
    yc = [(t[2] + t[3]) / 2 for t in nums]
    xr = [t[1] for t in nums]
    rgroups = cluster(yc, row_gap or h * 0.55)
    cgroups = cluster(xr, col_gap or h * 1.0)
    rows = [c for c, _ in rgroups]
    cols = [c for c, _ in cgroups]
    rid = {i: r for r, (_, g) in enumerate(rgroups) for i in g}
    cid = {i: c for c, (_, g) in enumerate(cgroups) for i in g}
    cells, extra = {}, []
    for i, t in enumerate(nums):
        k = (rid[i], cid[i])
        v = (to_number(t[4]), t[4], t[5])
        if k in cells:
            extra.append((k, v))
        else:
            cells[k] = v
    return rows, cols, cells, extra


def row_labels(toks, x0, x1, rows, tol):
    """x0〜x1 にある字を、近い行（rows の y）ごとに左から順につなげる"""
    out = {i: [] for i in range(len(rows))}
    for t in toks:
        xc, yc = (t[0] + t[1]) / 2, (t[2] + t[3]) / 2
        if not (x0 <= xc < x1) or to_number(t[4]) is not None:
            continue
        i = min(range(len(rows)), key=lambda r: abs(rows[r] - yc)) if rows else None
        if i is not None and abs(rows[i] - yc) <= tol:
            out[i].append((t[0], t[4]))
    return {i: "".join(s for _, s in sorted(v)) for i, v in out.items()}


def looks_numeric(t):
    """数字・コンマ・かっこだけでできた字（2つの数がつながった「37988,816」なども）"""
    s2 = t.strip().replace(" ", "").translate(FIX)
    return bool(s2) and bool(re.fullmatch(r"[\d,()（）]+", s2)) and any(c.isdigit() for c in s2)


def char_width(toks):
    """そのページの数字1字の幅（コンマは0.4字）。つながった数を分ける位置を決めるのに使う"""
    ws = []
    for t in toks:
        s = t[4].strip()
        if re.fullmatch(r"\d{1,3}(,\d{3})*", s) and len(s) >= 3:
            n = sum(c.isdigit() for c in s) + 0.4 * s.count(",")
            ws.append((t[1] - t[0]) / n)
    return median(ws) if ws else None


def split_merged(text, x0, x1, edge, cw=None):
    """つながって読まれた2つの数を、左の列の右端 edge のあたりで分ける。分けられなければ None。
    戻り値: ((左の数, 左の字), (右の数, 右の字))"""
    s = text.strip().replace(" ", "")
    m = re.match(r"^[(（][\d,]+[)）]", s)  # 「(82)507,634」の頭のかっこは数ではない（注の印）
    if m:
        x0 += (x1 - x0) * len(m.group(0)) / len(s)
        s = s[len(m.group(0)):]
    n = len(s)
    best = None
    for i in range(1, n):
        a, b = s[:i], s[i:]
        va, vb = to_number(a), to_number(b)
        if not isinstance(va, int) or not isinstance(vb, int) or b[0] in ",.":
            continue
        # 左の数の右端：1字の幅がわかれば左端からの字数で（印刷では2つの数の間にすきまがあり、字の割合では合わない）
        xs = x0 + cw * (sum(c.isdigit() for c in a) + 0.4 * a.count(",")) if cw else x0 + (x1 - x0) * i / n
        d = abs(xs - edge)
        if best is None or d < best[0]:
            best = (d, (va, a), (vb, b))
    return None if best is None else (best[1], best[2])


def strip_paren(text):
    """「(82)507,634」→「507,634」"""
    return re.sub(r"^[(（][\d,]+[)）]", "", text.strip().replace(" ", ""))

