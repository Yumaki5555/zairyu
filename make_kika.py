# 法務省民事局の帰化の数（元データ/帰化/ の PDF とページ）を、1行に1つの数の表にして確かめる
# 使い方: <pymupdf・pandas の入った python> -I make_kika.py
#
#   読むもの（元データ/帰化_出どころ一覧.csv で、表題ごとにいちばん新しく落としたもの）
#     「帰化許可申請者数、帰化許可者数及び帰化不許可者数の推移」の PDF … 文字の位置で、行（年）と列（項目）を読む
#     「国籍別帰化許可者数」の PDF … 最近の3年の上位10か国と「その他」「総数」。前の年の版（download_kika.py が保存版を落とす）も読み、2019年から
#     ページの中の「過去１０年間の国籍取得者数の推移」「過去１０年間の国籍離脱者数の推移」の表
#   書き出す表（データ/帰化/）
#     帰化の推移.csv        列：年・年の書き方（表のまま）・項目・国籍・地域・人数・出どころ
#                           年は西暦。昭和27年4月28日〜昭和41年はまとめた数（年は「1952-1966」）、昭和27年4月27日以前は「-1952」
#     国籍別帰化許可者数.csv 列：年・順位・国籍・地域・人数・出どころ・保存版のURL（2019年から。前の年の分はインターネット・アーカイブの保存版の PDF）
#     国籍取得と離脱.csv    列：年・項目・人数・出どころ（帰化とは別の、届け出による国籍の取得と、国籍の離脱）
#   確かめ: データ/帰化/確かめ.csv
#     帰化許可者数の合計＝韓国・朝鮮＋中国＋その他、累計＝毎年の合計の和、国籍別の表の数＝推移の表の数
#   新しい年の PDF は download_kika.py で落としてから、これを動かし直す
import csv
import html
import os
import re
import sys

import pandas as pd
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "帰化")
LIST_CSV = os.path.join(BASE, "元データ", "帰化_出どころ一覧.csv")
OUT = os.path.join(BASE, "データ", "帰化")
ERA = {"令和": 2018, "平成": 1988, "昭和": 1925}
Z2H = str.maketrans("０１２３４５６７８９（）", "0123456789()")
COLS = [("帰化許可申請者数", "総数"), ("帰化許可者数", "総数"), ("帰化許可者数", "韓国・朝鮮"), ("帰化許可者数", "中国"),
        ("帰化許可者数", "その他"), ("帰化不許可者数", "総数")]
NUM = re.compile(r"^[0-9,]+$")


def norm(s):
    return re.sub(r"[\s　]+", "", str(s)).translate(Z2H)


def year_of(era, n):
    return ERA[era] + (1 if n == "元" else int(n))


def latest(src, word):
    rows = [r for r in src if word in r["表題"]]
    if not rows:
        sys.exit(f"「{word}」の資料がありません。先に download_kika.py を動かしてください")
    return max(rows, key=lambda r: (r["落とした日"], r["ファイル名"]))


def lines(words, tol=2.5):
    """文字の切れはし → 同じ高さのまとまり [(高さの中ほど, [切れはし])]"""
    out = []
    for w in sorted(words, key=lambda w: (w[1] + w[3]) / 2):
        y = (w[1] + w[3]) / 2
        if out and abs(out[-1][0] - y) <= tol:
            out[-1][1].append(w)
        else:
            out.append([y, [w]])
    return out


def read_trend(path):
    words = pymupdf.open(path)[0].get_text("words")
    head_y = next(w[3] for w in words if norm(w[4]) == "合計")
    labels = [w for w in words if w[1] > head_y and w[2] < 200]  # 左の「年」の列（「昭和41年」の41も数なので分ける）
    nums = [w for w in words if w[1] > head_y and NUM.match(w[4]) and w[2] >= 200]
    # 列：数は右にそろえてあるので、数の右の端で分ける（6列）
    edges = []
    for x in sorted(w[2] for w in nums):
        if not edges or x - edges[-1][-1] > 5:
            edges.append([x])
        else:
            edges[-1].append(x)
    if len(edges) != len(COLS):
        raise ValueError(f"列が {len(edges)} 個あります（{len(COLS)} 個のはず）")
    col_of = lambda w: next(i for i, e in enumerate(edges) if min(e) - 0.1 <= w[2] <= max(e) + 0.1)
    label_lines = [(y, "".join(norm(w[4]) for w in sorted(ws, key=lambda w: w[0]))) for y, ws in lines(labels)]
    rows = []
    for y, ws in lines(nums):
        # 年の書き方：数の行と同じ高さ（2行に分かれた「昭和27年（4月28日)～／昭和41年」は上下の両方）
        label = "".join(t for ly, t in label_lines if abs(ly - y) <= 6.5)
        vals = {col_of(w): int(w[4].replace(",", "")) for w in ws}
        rows.append((label, vals))
    return rows


def label_year(label):
    """表の年の書き方 → 西暦（まとめた期間は「1952-1966」の形）"""
    if label.startswith("累"):
        return "累計"
    ys = [year_of(e, n) for e, n in re.findall(r"(令和|平成|昭和)([元0-9]+)年", label)]
    if "以前" in label and len(ys) == 1:
        return f"-{ys[0]}"
    if "～" in label and len(ys) == 2:
        return f"{ys[0]}-{ys[1]}"
    if len(ys) == 1:
        return str(ys[0])
    raise ValueError(f"年が読めません：{label}")


def read_by_nat(path):
    """「国籍別帰化許可者数」の PDF → [{年, 順位, 国籍・地域, 人数}]。版によって形が違う（順位の列が左に1つの版と、年ごとに1つある版。
    年ごとの版では、同じ人数は同じ順位）ので、行ごとに左から読む：名前の字のすぐあとの数＝人数、名前の前にある数＝順位。
    人数は、左の年の列から順に、見出しの年に当てる"""
    words = pymupdf.open(path)[0].get_text("words")
    heads = sorted((w[0], int(m.group(1))) for w in words if (m := re.match(r"^\((\d{4})\)$", norm(w[4]))))
    if len(heads) < 2:
        raise ValueError("年の見出しが見つかりません")
    years = [y for _, y in heads]
    head_y = max(w[3] for w in words if re.match(r"^\(\d{4}\)$", norm(w[4])))
    body = [w for w in words if w[1] > head_y]
    names = [w for w in body if not NUM.match(w[4])]
    out = []
    for y, ws in lines([w for w in body if NUM.match(w[4])]):
        # この行の名前の字（2行に分かれた「バングラデ／シュ」「アメリカ／合衆国」も。行の高さは50ほどあるので上下18まで）
        near = [v for v in names if abs((v[1] + v[3]) / 2 - y) <= 18]
        rank, x_end, k = "", None, 0
        for w in sorted(ws, key=lambda w: w[0]):
            seg = [v for v in near if (x_end is None or v[0] >= x_end - 0.5) and v[2] <= w[0] + 0.5]
            x_end = w[2]
            if not seg:  # 名前の前の数は順位（次の人数に付く。順位の列が1つの版では、その行のどの年にも付く）
                rank = int(w[4])
                continue
            name = "".join(norm(v[4]) for v in sorted(seg, key=lambda v: (round(v[1]), v[0])))
            if k >= len(years):
                raise ValueError(f"年の列より多い数があります（{name}）")
            out.append({"年": years[k], "順位": "" if name in ("その他", "総数") else rank, "国籍・地域": name, "人数": int(w[4].replace(",", ""))})
            k += 1
        if k != len(years):
            raise ValueError(f"人数が {k} 個しかない行があります（{len(years)} 個のはず）")
    return out


def read_page_tables(path):
    t = open(path, encoding="utf-8").read()
    out = []
    for title, item in (("国籍取得者数の推移", "国籍取得者数"), ("国籍離脱者数の推移", "国籍離脱者数")):
        i = t.find(title)
        if i < 0:
            raise ValueError(f"ページに「{title}」の表がありません")
        tab = t[i:t.find("</table>", i)]
        heads = [norm(html.unescape(re.sub(r"<[^>]+>", "", h))) for h in re.findall(r"<th[^>]*>(.*?)</th>", tab, re.S)]
        cells = [norm(html.unescape(re.sub(r"<[^>]+>", "", c))) for c in re.findall(r"<td[^>]*>(.*?)</td>", tab, re.S)]
        if len(heads) != len(cells):
            raise ValueError(f"「{title}」の見出しと数の数が合いません")
        for h, c in zip(heads, cells):
            m = re.match(r"(令和|平成)([元0-9]+)年$", h)
            out.append({"年": year_of(m.group(1), m.group(2)), "項目": item, "人数": int(c.replace(",", ""))})
    return out


def check(rows, what, a, b):
    rows.append({"確かめたこと": what, "左": a, "右": b, "結果": "合う" if a == b else "合わない"})


def main():
    with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
        src = list(csv.DictReader(f))
    s_trend, s_page = latest(src, "帰化許可申請者数、帰化許可者数"), latest(src, "（ページ）")
    checks = []

    trend = []
    total = None
    for label, vals in read_trend(os.path.join(SRC, s_trend["ファイル名"])):
        y = label_year(label)
        if y == "累計":
            total = vals
            continue
        for i, v in vals.items():
            item, nat = COLS[i]
            trend.append({"年": y, "年の書き方": label, "項目": item, "国籍・地域": nat, "人数": v, "出どころ": s_trend["資料のURL"]})
    t = pd.DataFrame(trend)
    per = t[t["項目"] == "帰化許可者数"].pivot_table(index="年", columns="国籍・地域", values="人数", aggfunc="sum")
    split = per.dropna(subset=["韓国・朝鮮"])
    bad = [y for y, r in split.iterrows() if r["総数"] != r["韓国・朝鮮"] + r["中国"] + r["その他"]]
    check(checks, f"帰化許可者数：どの年も 合計＝韓国・朝鮮＋中国＋その他（{len(split)}行。合わない年：{'・'.join(bad) or 'なし'}）", len(bad), 0)
    if total is None or list(total) != [1]:
        sys.exit("累計の行が読めません")
    check(checks, "帰化許可者数：累計＝毎年の合計の和（昭和27年4月27日以前を含む）", int(per["総数"].sum()), total[1])
    years = sorted(int(y) for y in t["年"] if y.isdigit())
    check(checks, f"1年ごとの行が抜けずに並んでいる（{years[0]}〜{years[-1]}年）", len(set(years)), years[-1] - years[0] + 1)

    # 国籍別：今のページの PDF と、前の年の版（インターネット・アーカイブの保存版）。同じ年が2つ以上の版にあれば、新しい版の数を使い、違いを確かめに書く
    versions = []
    for s in (r for r in src if "国籍別帰化許可者数" in r["表題"]):
        rows = read_by_nat(os.path.join(SRC, s["ファイル名"]))
        versions.append((max(r["年"] for r in rows), s, rows))
    versions.sort(key=lambda v: v[0])
    chosen = {}
    for _, s, rows in versions:
        for y in sorted({r["年"] for r in rows}):
            chosen[y] = (s, [r for r in rows if r["年"] == y])
    for y in sorted(chosen):
        use = {r["国籍・地域"]: r["人数"] for r in chosen[y][1]}
        for _, s, rows in versions:
            other = {r["国籍・地域"]: r["人数"] for r in rows if r["年"] == y}
            if s is not chosen[y][0] and other and other != use:
                diff = "、".join(f"{n} {other.get(n, 'なし')}→{use.get(n, 'なし')}" for n in sorted(set(use) | set(other)) if other.get(n) != use.get(n))
                checks.append({"確かめたこと": f"国籍別 {y}年：版によって違う数（{s['ファイル名']} → 使った版 {chosen[y][0]['ファイル名']}：{diff}）",
                               "左": "", "右": "", "結果": "版によって違う（新しい版を使う）"})
    nat = [{**r, "出どころ": s["資料のURL"], "保存版のURL": s.get("保存版のURL") or ""} for y in sorted(chosen) for s, rows in [chosen[y]] for r in rows]
    n = pd.DataFrame(nat)
    for y, g in n.groupby("年"):
        tot = g[g["国籍・地域"] == "総数"]["人数"].sum()
        check(checks, f"国籍別 {y}年：上位10か国＋その他＝総数", int(g[g["国籍・地域"] != "総数"]["人数"].sum()), int(tot))
        check(checks, f"国籍別 {y}年：上位は10か国", int(g["順位"].astype(str).str.isdigit().sum()), 10)
        for name in ("総数", "韓国・朝鮮", "中国"):
            a = g[g["国籍・地域"] == name]["人数"].sum()
            b = per.loc[str(y), name] if str(y) in per.index else None
            check(checks, f"国籍別 {y}年 {name}＝推移の表の帰化許可者数", int(a), None if b is None else int(b))

    page = read_page_tables(os.path.join(SRC, s_page["ファイル名"]))
    for r in page:
        r["出どころ"] = s_page["ページのURL"]

    os.makedirs(OUT, exist_ok=True)
    for name, rows in (("帰化の推移.csv", trend), ("国籍別帰化許可者数.csv", nat), ("国籍取得と離脱.csv", page), ("確かめ.csv", checks)):
        pd.DataFrame(rows).to_csv(os.path.join(OUT, name), index=False, encoding="utf-8-sig")
    bad = [c for c in checks if c["結果"] == "合わない"]
    for c in checks:
        if c["結果"].startswith("版によって"):
            print("  ", c["確かめたこと"])
    print(f"帰化の推移 {len(trend)} 行（{years[0]}〜{years[-1]}年）、国籍別 {len(nat)} 行、国籍取得と離脱 {len(page)} 行")
    print(f"確かめ {len(checks)} 件：合わない {len(bad)} 件 → {os.path.relpath(OUT, BASE)}")
    for c in bad:
        print("  合わない：", c["確かめたこと"], c["左"], c["右"])


if __name__ == "__main__":
    main()
