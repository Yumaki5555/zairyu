# 見開き1ページ分の読み取り結果から、表の行と列を組み立てる
#   1. 見開きの左右は別の紙で、傾き・上下の位置・縦の伸び縮みがそれぞれ違うので、半ページずつ別に扱う
#   2. 行：その半ページの数（「-」も入れる）の縦の位置のまとまり。「総数」の行（数がたくさん並ぶ行）から下。
#      まとまりの数が表の行の数と同じならそのまま使い、違えば型（同じ形のほかのページの行の位置）を伸び縮みさせて当てる
#   3. 列：数の右端（数は右にそろえて印刷されている）が集まる所
#   4. 2つの数がつながって読まれたもの（「37988,816」）は、左の列の右端の位置で分ける
#   5. 各列の上にある字をつなげて、見出しの手がかりにする（列の名前は表ごとに人が確かめて決める）
import re
from statistics import median

from ocr_tables import char_width, cluster, load, looks_numeric, split_merged, strip_paren, to_number


def _slope(points):
    if len(points) < 3:
        return None
    mx = sum(p[0] for p in points) / len(points)
    my = sum(p[1] for p in points) / len(points)
    sxx = sum((p[0] - mx) ** 2 for p in points)
    if sxx == 0:
        return None
    return sum((p[0] - mx) * (p[1] - my) for p in points) / sxx


def _deskew(toks, h):
    """数の並ぶ行の傾きをはかり、y を傾きのない位置に直す"""
    nums = [t for t in toks if to_number(t[4]) is not None]
    yc = [(t[2] + t[3]) / 2 for t in nums]
    slopes = []
    for _, g in cluster(yc, h * 0.45):
        if len(g) >= 6:
            s = _slope([((nums[i][0] + nums[i][1]) / 2, yc[i]) for i in g])
            if s is not None and abs(s) < 0.05:
                slopes.append(s)
    k = median(slopes) if slopes else 0.0
    return [(t[0], t[1], t[2] - k * (t[0] + t[1]) / 2, t[3] - k * (t[0] + t[1]) / 2, t[4], t[5]) for t in toks], k


def _yc(t):
    return (t[2] + t[3]) / 2


def _is_num(t):
    return isinstance(to_number(strip_paren(t[4])), int)


def _is_merged(t):
    """いくつもの数がつながって読まれた字（「840,8856,1215,943」）。行の位置を決めるときは数として数える"""
    s = t[4].strip().replace(" ", "")
    return "," in s and looks_numeric(s) and to_number(strip_paren(s)) is None


def split_many(text, x0, x1, edges):
    """3つ以上の数がつながった字を、列ごとの数に分ける。edges は字の中にある列の右端（左から。最後はこの字の列）。分けられなければ None。
    分け方を全部ためし（どの数もコンマの決まりどおり：1,000から必ずコンマ、コンマの後ろは3けた）、
    それぞれの数の右端（字の幅から見積もる。コンマは0.4字）が列の右端にいちばん近いものを選ぶ"""
    s = strip_paren(text)
    ok = re.compile(r"\d{1,3}(,\d{3})*")
    n, K = len(s), len(edges)
    units = [0.4 if ch == "," else 1.0 for ch in s]
    unit = (x1 - x0) / max(1e-9, sum(units))
    xr = [x0]
    for u in units:
        xr.append(xr[-1] + u * unit)
    INF = float("inf")
    dp = [[INF] * (n + 1) for _ in range(K + 1)]
    back = [[None] * (n + 1) for _ in range(K + 1)]
    dp[0][0] = 0.0
    for k in range(1, K + 1):
        for i in range(1, n + 1):
            for j in range(max(0, i - 11), i):
                if dp[k - 1][j] < INF and ok.fullmatch(s[j:i]):
                    c = dp[k - 1][j] + abs(xr[i] - edges[k - 1])
                    if c < dp[k][i]:
                        dp[k][i], back[k][i] = c, j
    if dp[K][n] == INF:
        return None
    out, i = [], n
    for k in range(K, 0, -1):
        j = back[k][i]
        out.append(s[j:i])
        i = j
    out.reverse()
    return [(to_number(x), x) for x in out]


def half_rows(part, h, n_rows, template=None, x_min=None, relaxed=False):
    """半ページの行の位置。数（「-」も）の縦のまとまりのうち、総数の行から n_rows 行。
    まとまりの数が合わなければ、型を伸び縮みさせて当て、近いまとまりに寄せる。戻り値: (行の位置, そのまま使えたか)"""
    ys = sorted(_yc(t) for t in part if (_is_num(t) or _is_merged(t)) and (x_min is None or t[0] >= x_min))
    if not ys:
        return [], False
    toks_y = sorted((_yc(t), t) for t in part if (_is_num(t) or _is_merged(t)) and (x_min is None or t[0] >= x_min))
    cl = cluster([y for y, _ in toks_y], h * 0.45)
    cnt = [len(g) for _, g in cl]
    most = max(cnt)

    def multi(g):  # 2けた以上の数の割合（見出しの「4-1-4」がばらばらに読まれた1けたの数の行を総数の行と間違えない）
        return sum(1 for i in g if sum(ch.isdigit() for ch in toks_y[i][1][4]) >= 2) / len(g)
    # 総数の行：数がたくさん並び、2けた以上の数が3分の1より多い最初の行（1986年の国籍の表の右ページの総数の行は1けたの数が多い）
    # 行の数が決まっていない表（国籍が行）では、数が2つの行も最初の行になれる（「-」が読めず、人数の少ない国の行は数が2つだけのことがある）
    first_dense = next(i for i, n in enumerate(cnt) if n >= (2 if n_rows >= 999 or (relaxed and template) else max(2, most * 0.4)))
    if n_rows >= 999 and x_min is not None:
        # どの国の行にも総数（いちばん左の、数の多い列）はある：総数の列に数のある最初の行から（ほかの列が「-」ばかりで読めなくても）
        rights = cluster([t[1] for _, t in toks_y], h * 0.9)
        mx = max(len(g) for _, g in rights)
        fc = min(c for c, g in rights if len(g) >= mx * 0.5)
        first_col = next((i for i, (_, g) in enumerate(cl) if any(abs(toks_y[k][1][1] - fc) < h * 0.9 for k in g)),
                         first_dense)
        first_dense = min(first_dense, first_col)
    if relaxed or n_rows >= 999:  # 行の数が決まっていない表（国籍が行）：2ページ目からは人数の少ない国から始まるので、2けたの条件は使わない
        start = first_dense
    else:
        def vsum(g):  # まとまりの数の合計
            return sum(v for v in (to_number(strip_paren(toks_y[k][1][4])) for k in g) if isinstance(v, int))

        def is_total(i):
            # 総数の行は下の行の合計なので、すぐ下の10行のどの行よりも合計が大きい（見出しの「4-1-4」などの数は小さい）
            below = [vsum(g) for _, g in cl[i + 1:i + 11]]
            return vsum(cl[i][1]) >= max(below, default=0)
        start = next((i for i, (n, (_, g)) in enumerate(zip(cnt, cl))
                      if n >= max(2, most * 0.4) and multi(g) >= 0.34 and is_total(i)),
                     next((i for i, (n, (_, g)) in enumerate(zip(cnt, cl)) if n >= max(2, most * 0.4) and multi(g) >= 0.5),
                          first_dense))
    cs = [c for c, _ in cl[start:]]
    # 下の注（行の間よりずっと離れた所）は除く。型があるときは、型の高さより下を除く（「-」だけの行が続けて読めないと、行の間が大きく空くため）
    if relaxed and template and len(template) == n_rows and len(template) > 1:
        cs = [c for c in cs if c <= cs[0] + (template[-1] - template[0]) * 1.2]
    elif len(cs) > 2:
        gaps = sorted(b - a for a, b in zip(cs, cs[1:]))
        g0 = gaps[len(gaps) // 3]
        i = 1
        while i < len(cs):
            if cs[i] - cs[i - 1] > g0 * 6:
                if n_rows >= 999 and i <= 2 and len(cs) - i >= 10:
                    # 上の1〜2つは見出しの数（「4-1-4」など。1986年の全国の表）：そこを除いて続ける
                    cs, i = cs[i:], 1
                    continue
                cs = cs[:i]
                break
            i += 1
    dens = {c: n for c, n in zip([c for c, _ in cl], cnt)}
    # 1つの行が上と下の2つのまとまりに分かれた所（行の間の半分より近い）は、1つにまとめる
    if n_rows < 999 and len(cs) > n_rows > 2:
        gm = median(b - a for a, b in zip(cs, cs[1:]))
        while len(cs) > n_rows:
            i = min(range(len(cs) - 1), key=lambda q: cs[q + 1] - cs[q])
            if cs[i + 1] - cs[i] >= gm * 0.55:
                break
            na, nb = dens.get(cs[i], 1), dens.get(cs[i + 1], 1)
            c = (cs[i] * na + cs[i + 1] * nb) / (na + nb)
            dens[c] = na + nb
            cs = cs[:i] + [c] + cs[i + 2:]
    if len(cs) == n_rows:
        return cs, True
    if not template or len(template) != n_rows:
        if len(cs) > n_rows:  # 型がない：続いた n_rows 個のうち、数がいちばん多く並ぶ所
            i = max(range(len(cs) - n_rows + 1), key=lambda i: sum(dens.get(c, 0) for c in cs[i:i + n_rows]))
            return cs[i:i + n_rows], False
        return cs, False
    return _fit_affine(cs, template, h), False


def _fit_affine(cs, T, h):
    """型の行の位置 T を、見つかった数の行のまとまり cs に当てる（伸び縮み a とずらし b）。
    cs の最初の数個・最後の数個と、T の最初の数個・最後の数個の組み合わせを全部ためし、いちばん多くのまとまりが重なるもの。
    見出しの数を拾ったとき（cs が多い）にも、「-」だけの行が抜けたとき（cs が少ない）にも合う。最後に近いまとまりに寄せる"""
    best = None
    k = 4
    for i in range(min(k, len(cs))):
        for j in range(max(i + 1, len(cs) - k), len(cs)):
            for ti in range(min(k, len(T))):
                for tj in range(max(ti + 1, len(T) - k), len(T)):
                    a = (cs[j] - cs[i]) / (T[tj] - T[ti])
                    if not 0.8 < a < 1.25:
                        continue
                    b = cs[i] - a * T[ti]
                    pred = [a * t + b for t in T]
                    hit = [min(abs(c - p) for p in pred) for c in cs]
                    # 型の行にも、近いまとまりがあるか（行の並びが規則正しいと、型を5行分ずらしても同じくらい重なるため、両方から数える）
                    back = [min(abs(c - p) for c in cs) for p in pred]
                    score = (sum(1 for d in hit if d < h * 0.3) + sum(1 for d in back if d < h * 0.3),
                             -sum(min(d, h) for d in hit))
                    if best is None or score > best[0]:
                        best = (score, pred)
    pred = best[1] if best else list(T)
    out, used = list(pred), set()
    for i, p in enumerate(pred):
        j = min(range(len(cs)), key=lambda q: abs(cs[q] - p))
        if abs(cs[j] - p) < h * 0.5 and j not in used:
            out[i] = cs[j]
            used.add(j)
    return out


def _columns(nums, h, min_count):
    xr = [t[1] for t in nums]
    return [c for c, g in cluster(xr, h * 0.9) if len(g) >= min_count]


def read_spread(path, n_rows, template=None, split=None, right_from_left=False, both_labels=False, relaxed=False,
                label_frac=0.5, x_min_left=None):
    """見開き1ページを読む。n_rows は表の行の数、template は同じ形の表の行の位置（{"左": [...], "右": [...]}）。戻り値:
      sides … {"左"/"右": {"rows": 行の位置, "exact": 行の数がそのまま合ったか, "cols": 列の右端,
                            "cells": {(行, 列): (数, 字, 確からしさ)}, "heads": 列ごとの見出しの字, "lost": 行・列に合わなかった字,
                            "merged": 分けた字, "labels": 行の名前（左ページ）}}"""
    d, toks = load(path)
    W = d["w"]
    mid = split or (W / 2 if W >= d["h"] else W)  # たて長の画像は見開きでなく1ページだけ（2005年の市・区別の最後のページ）
    hs = [t[3] - t[2] for t in toks if to_number(t[4]) is not None]
    h = median(hs) if hs else 30
    out = {"w": W, "h": d["h"], "sides": {}}
    for side, (x0, x1) in (("左", (0, mid)), ("右", (mid, W))):
        part, k = _deskew([t for t in toks if x0 <= (t[0] + t[1]) / 2 < x1], h)
        nums_all = [t for t in part if _is_num(t)]
        x_min = None
        if (side == "左" or both_labels) and nums_all:  # both_labels：左右のページがそれぞれ行の名前を持つ表（市・区別）
            # 行の名前の所にある数（かっこの数など）を除くため、数が多く並ぶ列のいちばん左より右だけを見る
            cols0 = [(c, len(g)) for c, g in cluster([t[1] for t in nums_all], h * 0.9)]
            most = max(n for _, n in cols0)
            first = min(c for c, n in cols0 if n >= most * 0.5)
            if label_frac < 0.5:
                # 全国の表の2・3組目のページは、いちばん左の列に「-」が多く、数の少ない列になる。ふつうの列の間かくですぐ左にあり、
                # 2けた以上の数がある列なら、数の列として足す（行の名前のカタカナ「フ」「ア」が「7」と読まれたものは足さない）
                dense = sorted(c for c, n in cols0 if n >= most * 0.5)
                sp = median(b - a for a, b in zip(dense, dense[1:])) if len(dense) > 1 else h * 6
                for c, n in sorted(cols0, reverse=True):
                    if c >= first:
                        continue
                    toks_c = [t for t in nums_all if abs(t[1] - c) < h * 0.9]
                    if (first - c > sp * 1.6 or n < max(3, most * label_frac)
                            or not any(sum(ch.isdigit() for ch in t[4]) >= 2 for t in toks_c)):
                        break
                    first = c
            x_min = min(t[0] for t in nums_all if abs(t[1] - first) < h * 0.9) - h * 0.3
        if side == "左" and x_min_left is not None:  # 行の名前と数の境を、同じ組み方のページから決めて渡されたとき
            x_min = x_min_left
        if side == "右" and right_from_left and out["sides"].get("左"):
            # 行の数が決まっていない表（国籍が行）：右ページの行は、左ページの行を型にして当てる
            lr = out["sides"]["左"]["rows"]
            rows, exact = half_rows(part, h, len(lr), lr, x_min, relaxed=True)
        else:
            rows, exact = half_rows(part, h, n_rows, (template or {}).get(side), x_min, relaxed=both_labels or relaxed)
        if not rows:
            out["sides"][side] = None
            continue
        sp = sorted(b - a for a, b in zip(rows, rows[1:])) or [h]
        tol = min(sp[len(sp) // 4] * 0.5, h * 0.7)
        top, bottom = rows[0] - tol, rows[-1] + tol

        body = [t for t in part if top <= _yc(t) <= bottom and (x_min is None or t[0] >= x_min)
                and (looks_numeric(t[4]) or to_number(t[4]) == 0)]
        good = [t for t in body if _is_num(t)]
        cols = _columns(good, h, 2)
        cw = char_width(good)
        cells, lost, merged = {}, [], []

        def put(r, c, v, text, conf):
            if (r, c) in cells:  # 同じマスに2つ：確からしい方を残す
                if conf > cells[(r, c)][2]:
                    lost.append(cells[(r, c)])
                    cells[(r, c)] = (v, text, conf)
                else:
                    lost.append((v, text, conf))
                return
            cells[(r, c)] = (v, text, conf)

        for t in body:
            r = min(range(len(rows)), key=lambda i: abs(rows[i] - _yc(t)))
            if abs(rows[r] - _yc(t)) > tol or not cols:
                lost.append(t)
                continue
            c = min(range(len(cols)), key=lambda i: abs(cols[i] - t[1]))
            if abs(cols[c] - t[1]) > h * 0.9:
                lost.append(t)
                continue
            # 左の列の右端をまたいでいる字は、2つの数がつながったもの。ただし幅の広い数（「11,046」）も左にはみ出すので、
            # 1つの数として読めないか「.」を含むときだけ分ける
            whole = to_number(strip_paren(t[4]))
            # 3つ以上の数がつながったもの（字の中に列の右端が2つ以上ある）
            inside = [i for i in range(c) if cols[i] > t[0] + (cw or h * 0.6) * 0.5]
            if len(inside) >= 2 and not isinstance(whole, int):
                many = split_many(t[4], t[0], t[1], [cols[i] for i in inside] + [cols[c]])
                if many:
                    for i, (va, ta) in zip(inside + [c], many):
                        put(r, i, va, ta + "（分けた）", t[5] * 0.9)
                    merged.append((r, c, t[4]))
                    continue
            if c > 0 and t[0] < cols[c - 1] - h * 0.15 and (not isinstance(whole, int) or "." in t[4]):
                sp2 = split_merged(t[4], t[0], t[1], cols[c - 1], cw)
                if sp2:
                    (va, ta), (vb, tb) = sp2
                    put(r, c - 1, va, ta + "（分けた）", t[5] * 0.9)
                    put(r, c, vb, tb + "（分けた）", t[5] * 0.9)
                    merged.append((r, c, t[4]))
                    continue
            if not isinstance(whole, int):
                lost.append(t)
                continue
            put(r, c, whole, t[4], t[5])
        # 見出し：列の範囲（前の列の右端〜この列の右端）で、データより上にある字
        heads = []
        for i, c in enumerate(cols):
            xa = cols[i - 1] + h * 0.2 if i else c - h * 4
            hs_ = sorted(((t[2], t[0]), t[4]) for t in part if xa < (t[0] + t[1]) / 2 <= c + h * 0.5 and t[3] < top)
            heads.append(" ".join(s for _, s in hs_))
        labels, label_x = [], []
        if (side == "左" or both_labels) and x_min is not None:
            for r in rows:
                chars = sorted((t[0], t[1], t[4]) for t in part if t[1] < x_min and abs(_yc(t) - r) < tol and not _is_num(t))
                labels.append("".join(ch for _, _, ch in chars))
                label_x.append([(a, b) for a, b, _ in chars])
        out["sides"][side] = {"rows": rows, "exact": exact, "cols": cols, "cells": cells, "heads": heads, "lost": lost,
                              "merged": merged, "labels": labels, "label_x": label_x, "skew": k, "x_min": x_min, "h": h}
    return out
