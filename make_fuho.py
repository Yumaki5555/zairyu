# 法務省の「本邦における不法残留者数について」（元データ/不法残留/ の報道発表の Excel）を、1行に1つの数の表にして確かめる
# 使い方: <pandas・openpyxl の入った python> -I make_fuho.py
#
#   読む表（表題で探す。年によって表の番号・シートの名前・並びが違うため）
#     国籍・地域別 男女別（性別） 不法残留者数の推移 … 上位の国籍・地域と「その他」、それぞれの男女。前の時点の列もある
#     在留資格別 不法残留者数の推移                 … 在留資格（技能実習は号ごとの内わけもある）。前の時点の列もある
#     国籍・地域別 在留資格別 不法残留者数           … その発表の時点だけ
#     国籍・地域別／在留資格別 新規不法残留者数       … 2026年1月1日の発表から
#   書き出す表（データ/不法残留/）
#     推移.csv            列：発表の時点・公表日・表・国籍・地域・性別・在留資格・種別・時点・人数・状態・出どころ・発表のページ
#                         状態：「その発表の時点の数」か「発表にのった前の時点の数」
#     国籍_在留資格.csv   列：時点・国籍・地域・在留資格・種別・人数・公表日・出どころ・発表のページ
#     新規.csv            列：時点・表・名前・種別・区分・人数・公表日・出どころ・発表のページ
#                         区分：新規（前の時点のあとに新しく分かった人）・継続・減少・その時点の数・前の時点の数
#     種別：「技能実習の内わけ」の行（技能実習１号イ など）は「技能実習」の行の内わけなので、ほかと一緒に足さない
#   確かめ: データ/不法残留/確かめ.csv
#     内わけの合計が総数と合うか、表どうしで同じ数か、同じ時点の数が発表によって違わないか
#   新しい発表は download_fuho.py で落としてから、これを動かし直す
import csv
import os
import re
import sys
from collections import defaultdict

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "不法残留")
LIST_CSV = os.path.join(BASE, "元データ", "不法残留_出どころ一覧.csv")
OUT = os.path.join(BASE, "データ", "不法残留")
ERA = {"令和": 2018, "平成": 1988}
Z2H = str.maketrans("０１２３４５６７８９（）", "0123456789()")
SUB = "技能実習の内わけ"


def norm(s):
    return re.sub(r"[\s　]+", "", str(s)).translate(Z2H) if isinstance(s, str) else ""


def when_of(label):
    """見出し（令和８年（2026年）７月１日現在 など）→ 時点（2026-07-01）"""
    t = re.sub(r"\([0-9]+年?\)", "", norm(label))
    m = re.search(r"(令和|平成)([元0-9]+)年([0-9]+)月([0-9]+)日", t)
    if not m:
        return None
    y = ERA[m.group(1)] + (1 if m.group(2) == "元" else int(m.group(2)))
    return f"{y}-{int(m.group(3)):02d}-{int(m.group(4)):02d}"


def find_table(sheets, ok):
    """表題（【第〇表】…）が ok に合う表 → (シート, 表題の行)。2つ以上あれば止める"""
    hits = []
    for name, d in sheets.items():
        for r in range(len(d)):
            for c in range(d.shape[1]):
                t = norm(d.iat[r, c])
                if re.match(r"【第[0-9]+表】", t) and ok(t):
                    hits.append((d, r, t))
    if len(hits) > 1:
        raise ValueError("合う表が2つあります：" + "・".join(h[2] for h in hits))
    return hits[0] if hits else (None, None, None)


def body(d, r0, first_col):
    """表題の下の、名前と数の行 → [(行, 名前の列, 名前)]。（注 や ※ の行で終わる"""
    rows = []
    for r in range(r0 + 1, len(d)):
        names = [(c, norm(d.iat[r, c])) for c in range(first_col) if norm(d.iat[r, c])]
        if not names:
            continue
        c, name = names[-1]
        if name.startswith(("(注", "※", "注")) or re.match(r"【第[0-9]+[表図]】", name):
            break
        if any(not pd.isna(pd.to_numeric(d.iat[r, x], errors="coerce")) for x in range(first_col, d.shape[1])):
            rows.append((r, c, "総数" if name == "総計" else name))
    return rows


def headers(d, r0, r1):
    """表題の行と最初の数の行の間の見出しを、列ごとにつなげる"""
    return {c: "".join(norm(d.iat[r, c]) for r in range(r0 + 1, r1)) for c in range(d.shape[1])}


def num(v):
    v = pd.to_numeric(v, errors="coerce")
    return None if pd.isna(v) else int(v)


def first_data_row(d, r0):
    for r in range(r0 + 1, len(d)):
        row = d.iloc[r].tolist()
        if any(norm(v) in ("総数", "総計") for v in row) and any(num(v) is not None for v in row):
            return r  # 見出しの「総数」ではなく、数の入った「総数」の行
    raise ValueError("「総数」の行が見つかりません")


def read_trend(d, r0):
    """「〇〇別 不法残留者数の推移」→ [(名前, 性別, {時点: 人数})]。男・女の行は、すぐ上の国籍・地域の内わけ"""
    start = first_data_row(d, r0)
    head = headers(d, r0, start)
    cols = {c: when_of(h) for c, h in head.items() if when_of(h) and "増減" not in h and "構成比" not in h}
    if len(cols) < 2:
        raise ValueError("時点の見出しが見つかりません")
    out, owner = [], None
    for r, _, name in body(d, r0, min(cols)):
        vals = {w: num(d.iat[r, c]) for c, w in cols.items() if num(d.iat[r, c]) is not None}
        if name in ("男", "女"):
            out.append((owner, name, vals))
        else:
            owner = name
            out.append((name, "総数", vals))
    return out


def read_cross(d, r0):
    """「国籍・地域別 在留資格別 不法残留者数」→ [(国籍・地域, 在留資格, 人数)]"""
    start = first_data_row(d, r0)
    head = headers(d, r0, start)
    total_col = next(c for c, h in head.items() if h.endswith("総数") or h == "総数")
    visas = {}
    for c in range(total_col, d.shape[1]):
        # 列の名前は、いちばん下の見出し（上の行の「在留資格」は、まとめの見出し）
        names = [norm(d.iat[r, c]) for r in range(r0 + 1, start) if norm(d.iat[r, c])]
        if names:
            visas[c] = "総数" if names[-1] == "総数" else names[-1]
    return [(name, v, num(d.iat[r, c])) for r, _, name in body(d, r0, total_col) for c, v in visas.items() if num(d.iat[r, c]) is not None]


def read_new(d, r0, when):
    """「〇〇別 新規不法残留者数」→ [(名前, 区分, 人数)]"""
    start = first_data_row(d, r0)
    head = headers(d, r0, start)
    kinds = {}
    for c, h in head.items():
        if not h or "割合" in h:
            continue  # 新規の割合は、新規÷その時点の数（計算できるので入れない）
        for key in ("新規", "継続", "減少"):
            if f"【{key}】" in h:
                kinds[c] = key
                break
        else:
            w = when_of(h)
            if w:
                kinds[c] = "その時点の数" if w == when else "前の時点の数"
    if sorted(kinds.values()) != sorted(["新規", "継続", "減少", "その時点の数", "前の時点の数"]):
        raise ValueError(f"新規の表の列が読めません：{kinds}")
    return [(name, k, num(d.iat[r, c])) for r, _, name in body(d, r0, min(kinds)) for c, k in kinds.items() if num(d.iat[r, c]) is not None]


def kind_of(visa):
    return SUB if re.match(r"技能実習[0-9]号", visa) else ""


def check(rows, what, a, b, when):
    rows.append({"発表の時点": when, "確かめたこと": what, "左": a, "右": b, "結果": "合う" if a == b else "合わない"})


def main():
    with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
        src = [r for r in csv.DictReader(f) if r["ファイル名"].endswith((".xlsx", ".xls"))]
    trend, cross, new, checks = [], [], [], []
    for s in sorted(src, key=lambda r: r["時点"]):
        when = s["時点"]
        sheets = pd.read_excel(os.path.join(SRC, when, s["ファイル名"]), sheet_name=None, header=None)
        meta = {"公表日": s["公表日"], "出どころ": s["ファイル名"], "発表のページ": s["発表のページ"]}

        # 国籍・地域別 男女別 の推移
        d, r0, title = find_table(sheets, lambda t: "国籍・地域別" in t and ("男女別" in t or "性別" in t) and "推移" in t)
        if d is None:
            sys.exit(f"{when}：国籍・地域別の推移の表が見つかりません")
        nat = read_trend(d, r0)
        if when not in nat[0][2]:
            sys.exit(f"{when}：国籍・地域別の推移の表に、その発表の時点の列がありません")
        for name, sex, vals in nat:
            for w, v in vals.items():
                trend.append({"発表の時点": when, "公表日": s["公表日"], "表": "国籍・地域別", "国籍・地域": name, "性別": sex, "在留資格": "総数", "種別": "",
                              "時点": w, "人数": v, "状態": "その発表の時点の数" if w == when else "発表にのった前の時点の数",
                              "出どころ": s["ファイル名"], "発表のページ": s["発表のページ"]})
        # 確かめ：国籍・地域の合計＝総数、男＋女＝総数（どの時点の列も）
        tot = {(n, x): v for n, x, v in nat}
        for w in nat[0][2]:
            parts = sum(v.get(w, 0) for n, x, v in nat if x == "総数" and n != "総数")
            check(checks, f"国籍・地域別の推移 {w}：国籍・地域の合計＝総数", parts, tot[("総数", "総数")].get(w), when)
            bad = [n for n, x, v in nat if x == "総数" and v.get(w) != tot.get((n, "男"), {}).get(w, 0) + tot.get((n, "女"), {}).get(w, 0)]
            check(checks, f"国籍・地域別の推移 {w}：男＋女＝総数（合わない国籍・地域：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)

        # 在留資格別 の推移
        d, r0, title = find_table(sheets, lambda t: "在留資格別" in t and "推移" in t and "国籍" not in t and "新規" not in t)
        if d is None:
            sys.exit(f"{when}：在留資格別の推移の表が見つかりません")
        vis = [(re.sub(r"\(注[0-9]+\)$", "", n), x, v) for n, x, v in read_trend(d, r0)]
        for name, _, vals in vis:
            for w, v in vals.items():
                trend.append({"発表の時点": when, "公表日": s["公表日"], "表": "在留資格別", "国籍・地域": "総数", "性別": "総数", "在留資格": name,
                              "種別": kind_of(name), "時点": w, "人数": v, "状態": "その発表の時点の数" if w == when else "発表にのった前の時点の数",
                              "出どころ": s["ファイル名"], "発表のページ": s["発表のページ"]})
        vt = {n: v for n, _, v in vis}
        for w in vis[0][2]:
            parts = sum(v.get(w, 0) for n, _, v in vis if n != "総数" and not kind_of(n))
            check(checks, f"在留資格別の推移 {w}：在留資格の合計＝総数", parts, vt["総数"].get(w), when)
            subs = sum(v.get(w, 0) for n, _, v in vis if kind_of(n))
            check(checks, f"在留資格別の推移 {w}：技能実習の号の合計＝技能実習", subs, vt["技能実習"].get(w), when)
        for w in set(vt["総数"]) & set(tot[("総数", "総数")]):
            check(checks, f"{w}：在留資格別の推移の総数＝国籍・地域別の推移の総数", vt["総数"][w], tot[("総数", "総数")][w], when)

        # 国籍・地域別 在留資格別（その発表の時点）
        d, r0, title = find_table(sheets, lambda t: "国籍・地域別" in t and "在留資格別" in t and "推移" not in t and "新規" not in t)
        if d is None:
            sys.exit(f"{when}：国籍・地域別 在留資格別の表が見つかりません")
        if when_of(title) != when:
            sys.exit(f"{when}：国籍・地域別 在留資格別の表の時点が違います（{title}）")
        cr = read_cross(d, r0)
        for name, v, n in cr:
            cross.append({"時点": when, "国籍・地域": name, "在留資格": v, "種別": kind_of(v), "人数": n, **meta})
        cell = {(a, b): n for a, b, n in cr}
        names = list(dict.fromkeys(a for a, _, _ in cr))
        visas = list(dict.fromkeys(b for _, b, _ in cr))
        bad = [a for a in names if sum(cell[(a, b)] for b in visas if b != "総数" and not kind_of(b)) != cell[(a, "総数")]]
        check(checks, f"国籍・地域別 在留資格別：どの国籍・地域も在留資格の合計＝総数（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)
        bad = [a for a in names if sum(cell[(a, b)] for b in visas if kind_of(b)) != cell[(a, "技能実習")]]
        check(checks, f"国籍・地域別 在留資格別：どの国籍・地域も技能実習の号の合計＝技能実習（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)
        bad = [b for b in visas if sum(cell[(a, b)] for a in names if a != "総数") != cell[("総数", b)]]
        check(checks, f"国籍・地域別 在留資格別：どの在留資格も国籍・地域の合計＝総数（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)
        bad = [a for a in names if cell[(a, "総数")] != tot.get((a, "総数"), {}).get(when)]
        check(checks, f"国籍・地域別 在留資格別の各国籍・地域の総数＝国籍・地域別の推移の数（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)
        bad = [b for b in visas if cell[("総数", b)] != vt.get(b, {}).get(when)]
        check(checks, f"国籍・地域別 在留資格別の各在留資格の総数＝在留資格別の推移の数（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)

        # 新規不法残留者数（ある発表だけ）
        for label, ok in (("国籍・地域別", lambda t: "新規" in t and "国籍・地域別" in t),
                          ("在留資格別", lambda t: "新規" in t and "在留資格別" in t and "国籍" not in t)):
            d, r0, title = find_table(sheets, ok)
            if d is None:
                continue
            nw = read_new(d, r0, when)
            for name, k, n in nw:
                name = re.sub(r"\(注[0-9]+\)$", "", name)
                new.append({"時点": when, "表": label, "名前": name, "種別": kind_of(name) if label == "在留資格別" else "", "区分": k, "人数": n, **meta})
            g = defaultdict(dict)
            for name, k, n in nw:
                g[name][k] = n
            bad = [a for a, x in g.items() if x["新規"] + x["継続"] != x["その時点の数"] or x["継続"] + x["減少"] != x["前の時点の数"]]
            check(checks, f"新規（{label}）：新規＋継続＝その時点の数、継続＋減少＝前の時点の数（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)
            parts = [a for a in g if a != "総数" and not kind_of(a)]
            check(checks, f"新規（{label}）：新規の内わけの合計＝総数", sum(g[a]["新規"] for a in parts), g["総数"]["新規"], when)
            ref = tot if label == "国籍・地域別" else {(n, "総数"): v for n, v in vt.items()}
            # 「その他」は、新規の表と推移の表で上位に出す国籍・在留資格が違うので、中身が違う（比べない）
            bad = [a for a, x in g.items() if a != "その他" and (a, "総数") in ref and (ref[(a, "総数")].get(when) != x["その時点の数"])]
            check(checks, f"新規（{label}）：その時点の数＝推移の表の数（合わない：{'・'.join(bad) or 'なし'}）", len(bad), 0, when)

    # 同じ時点の数が、発表によって違わないか（あとの発表で直されたか）
    # 「その他」は比べない：発表ごとに上位に出す国籍・地域が入れ替わるので、「その他」に入る国が発表によって違う
    by = defaultdict(dict)
    for t in trend:
        if "その他" not in (t["国籍・地域"], t["在留資格"]):
            by[(t["表"], t["国籍・地域"], t["性別"], t["在留資格"], t["時点"])][t["発表の時点"]] = t["人数"]
    diffs = []
    for key, v in sorted(by.items()):
        if len(set(v.values())) > 1:
            diffs.append(key)
            checks.append({"発表の時点": "（発表どうし）", "確かめたこと": f"{key[4]} の {key[0]} {key[1] if key[0] == '国籍・地域別' else key[3]} {key[2] if key[2] != '総数' else ''}：発表によって数が違う",
                           "左": " / ".join(f"{k}の発表 {n:,}" for k, n in sorted(v.items())), "右": "", "結果": "違う"})
    if not diffs:
        checks.append({"発表の時点": "（発表どうし）", "確かめたこと": "同じ時点の数は、どの発表でも同じ", "左": "", "右": "", "結果": "合う"})

    os.makedirs(OUT, exist_ok=True)
    for name, rows in (("推移.csv", trend), ("国籍_在留資格.csv", cross), ("新規.csv", new), ("確かめ.csv", checks)):
        pd.DataFrame(rows).to_csv(os.path.join(OUT, name), index=False, encoding="utf-8-sig")
    bad = [c for c in checks if c["結果"] == "合わない"]
    print(f"発表 {len(src)} 回分：推移 {len(trend)} 行、国籍×在留資格 {len(cross)} 行、新規 {len(new)} 行")
    print(f"確かめ {len(checks)} 件：合わない {len(bad)} 件、発表によって数が違う {len(diffs)} 件 → {os.path.relpath(OUT, BASE)}")
    for c in bad:
        print("  合わない：", c["発表の時点"], c["確かめたこと"], c["左"], c["右"])


if __name__ == "__main__":
    main()
