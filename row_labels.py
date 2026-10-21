# 行の名前が横書きのカタカナ（国籍）の表で、行ごとの名前を読み、決まった並びの名前の一覧に当てはめる
#   1. 見開きの左ページの、行の名前の所（数より左）を行ごとに切り出し、白いすき間をあけて縦に重ねた画像を作る
#   2. Windows の日本語の読み取り（ocr_windows.ps1）で読む（1ページで1回）
#   3. 読んだ名前の列を、その年の国籍の並び（都道府県×国籍の表の見出しの順）に、順番を保って当てはめる（抜けている国は飛ばす）
import json
import os
import re
import subprocess

import pymupdf
from PIL import Image

from nat_names import norm
from difflib import SequenceMatcher

PS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_windows.ps1")


def read_labels(pdf_path, page, rows, x_max, workdir, tag, dpi=300, x_from=0, skew=0.0):
    """rows（行の y。300dpi の画像の座標）ごとに、x_from〜x_max の所を読んだ字のリスト。
    rows は傾きを直した位置（y − 傾き×x）なので、画像から切り出すときは傾きの分を戻す"""
    pg = pymupdf.open(pdf_path)[page - 1]
    pix = pg.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    gaps = sorted(b - a for a, b in zip(rows, rows[1:])) or [40]
    half = max(14, int(gaps[len(gaps) // 4] * 0.45))
    dy = skew * (x_from + x_max) / 2
    strips = [_pack(img.crop((int(x_from), int(r + dy - half), int(x_max), int(r + dy + half)))) for r in rows]
    space = half * 2
    H = sum(s.height for s in strips) + space * (len(strips) + 1)
    W = max(s.width for s in strips) + space * 2  # 左右にも余白（左の端にくっついた最初の字は読み落とされやすい）
    canvas = Image.new("L", (W, H), 255)
    ys, y = [], space
    for s in strips:
        canvas.paste(s, (space, y))
        ys.append(y + s.height / 2)
        y += s.height + space
    os.makedirs(workdir, exist_ok=True)
    png = os.path.join(workdir, f"{tag}.png")
    js = os.path.join(workdir, f"{tag}.json")
    canvas.save(png)
    if os.path.exists(js):
        os.remove(js)
    lst = os.path.join(workdir, f"{tag}.txt")
    with open(lst, "w", encoding="utf-8") as f:
        f.write(f"{png}\t{js}\n")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS, lst], capture_output=True)
    out = [""] * len(rows)
    if os.path.exists(js):
        with open(js, encoding="utf-8") as f:
            d = json.load(f)
        for line in d["lines"]:
            for w in line["words"]:
                yc = w["y"] + w["h"] / 2
                i = min(range(len(ys)), key=lambda k: abs(ys[k] - yc))
                if abs(ys[i] - yc) < space:
                    out[i] += w["t"]
    return out


def _pack(strip):
    """行の名前は字の間を大きく空けて印刷されている（「ビ　　ル　　マ」）。字のかたまりを取り出し、間を詰めて並べ直す"""
    W, H = strip.size
    px = strip.load()
    col = [sum(px[x, y] < 150 for y in range(H)) for x in range(W)]
    segs, start, gap = [], None, 0
    for x, v in enumerate(col):
        if v:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= 5:
                segs.append((start, x - gap + 1))
                start, gap = None, 0
    if start is not None:
        segs.append((start, W))
    # 表の縦の罫線（細くて上から下まで黒い）は名前の字ではないので除く（「区|」が「民」「第」と読まれる）
    segs = [(a, b) for a, b in segs if b - a >= 2 and not (b - a <= 8 and max(col[a:b]) >= H * 0.97)]
    # 右の端（数の列との境）の細い縦の線も罫線（切れ切れで上から下まで届かないことがある）
    while segs and segs[-1][1] - segs[-1][0] <= 8 and max(col[segs[-1][0]:segs[-1][1]]) >= H * 0.45:
        segs.pop()
    if not segs:
        return strip
    sp = max(4, H // 6)
    out = Image.new("L", (sum(b - a for a, b in segs) + sp * (len(segs) + 1), H), 255)
    x = sp
    for a, b in segs:
        out.paste(strip.crop((a, 0, b, H)), (x, 0))
        x += b - a + sp
    return out


# 同じ国の別の書き方（行の名前の読み取りと見出しの一覧で書き方が違う）
ALIASES = {"米国": ["アメリカ", "アメリカ合衆国"], "英国": ["イギリス"], "アメリカ": ["米国"], "イギリス": ["英国"],
           "北アメリカ州": ["北米"], "南アメリカ州": ["南米"]}


def sim(a, b):
    a = re.sub(r"^[\d\s]+", "", a)  # 行の名前の頭に付いたページの番号など
    if any(norm(a) == norm(x) for x in ALIASES.get(b, [])):
        return 1.0
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def align(texts, names, extra=None):
    """読んだ名前の列 texts を、並びの一覧 names に順番を保って当てはめる（names の抜けは飛ばしてよい）。
    一覧にない国が表にあることがある（1984年の都市別の表のサンマリノ）。extra（国籍の名前の総覧）でよく似た名前が見つかる行は、
    一覧の名前に無理に当てず、その名前の行として足す。戻り値: 行ごとの (名前, 似ている度合い, 一覧の外か)"""
    R, C = len(texts), len(names)
    NEG = -1e9
    S = [[sim(t, n) for n in names] for t in texts]
    E = [0.0] * R
    En = [None] * R
    if extra:
        others = [n for n in extra if n not in names]
        for i, t in enumerate(texts):
            if norm(t):
                sc, n = max(((sim(t, o), o) for o in others), default=(0, None))
                if sc >= 0.75:
                    E[i], En[i] = sc - 0.3, n
    dp = [[NEG] * (C + 1) for _ in range(R + 1)]
    back = [[None] * (C + 1) for _ in range(R + 1)]
    for j in range(C + 1):
        dp[0][j] = 0.0
    for i in range(1, R + 1):
        for j in range(0, C + 1):
            best, how = NEG, None
            if j > 0 and dp[i][j - 1] > best:
                best, how = dp[i][j - 1], "skip"
            if j > 0 and dp[i - 1][j - 1] > NEG and dp[i - 1][j - 1] + S[i - 1][j - 1] >= best:
                best, how = dp[i - 1][j - 1] + S[i - 1][j - 1], "take"
            if En[i - 1] and dp[i - 1][j] > NEG and dp[i - 1][j] + E[i - 1] > best:
                best, how = dp[i - 1][j] + E[i - 1], "extra"
            if R > C and dp[i - 1][j] > NEG and dp[i - 1][j] + 0.1 > best:  # 行が名前より多い：余分な行（注の数など）は捨ててよい
                best, how = dp[i - 1][j] + 0.1, "drop"
            dp[i][j], back[i][j] = best, how
    if dp[R][C] <= NEG:
        return [(None, 0.0, False)] * R
    out = [None] * R
    i, j = R, C
    while i > 0:
        how = back[i][j]
        if how == "take":
            out[i - 1] = (names[j - 1], S[i - 1][j - 1], False)
            i, j = i - 1, j - 1
        elif how == "extra":
            out[i - 1] = (En[i - 1], E[i - 1] + 0.3, True)
            i -= 1
        elif how == "skip":
            j -= 1
        elif how == "drop":
            out[i - 1] = (None, 0.0, False)
            i -= 1
        else:
            break
    return [o or (None, 0.0, False) for o in out]
