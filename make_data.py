# 落とした在留外国人統計（元データ/）を、サイトで使う縦長の表（データ/*.csv）に読み出し、合計を確かめる
# 使い方: <pbixray・pandas・openpyxl・xlrd の入った python> -I make_data.py
#
#   書き出す表（どれも 1行＝1つの数。列の「総数」「在留資格=総数」の行も入れる）
#     全国_国籍_在留資格.csv        2012年12月末〜  第1表（国籍・地域×在留資格。住む都道府県が未定・不詳の人も入る＝国の発表の全国の数）
#     都道府県_国籍.csv             2012年12月末〜  第4表、ない時点はテーブルデータ（t1）から
#     都道府県_在留資格.csv         2012年12月末〜  第5表、ない時点は t1 から
#     都道府県_国籍_在留資格/       2016年12月末〜  t1（2020年までは12月末だけ）
#     市区町村_国籍/                2012年12月末〜  第7表など（2023年6月末までは多い国だけ＋「その他」）、2023年12月末からは t2（全部の国）
#     市区町村_在留資格/            2019年12月末〜  第7表の2など、2023年12月末からは t2
#     市区町村_国籍_在留資格/       2023年12月末〜  t2
#     検算.csv                      時点ごとに、表どうしの合計が全国の数と合うか
#   「〇〇/」の大きな表は、時点ごとのファイル（〇〇/2025-12.csv など）に分ける。GitHub の1ファイル100MB・Excel の約105万行を超えないように。
#   過去の時点のファイルは作り直しても中身が変わらないので、GitHub に上げ直すとき新しい時点の分だけが増える
#   2006〜2011年末は「登録外国人統計」（外国人登録をした人。数え方が今と違う）。全国・都道府県の国籍と在留資格、市と区の国籍（町村はない）。
#   列「統計」でどちらの統計かを分ける
#   市区町村の表の「種別」: 市区町村／区（政令市の区）／合計の行（政令市・東京の特別区の合計＝足すと二重になる）／
#                          その他（10人以下の市区町村をまとめた行。2023年12月末・2024年6月末の t2 と 2021年6月末の表）
import csv
import os
import re
import sys
from collections import defaultdict

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_tables import (GUN, PREFS, REGIONS, TOTAL, TOTAL_ROW, UNKNOWN_PREF, clean, group_visas, nat_name, pref_name, read_long,
                         read_municipal, read_powerpivot, read_rows_sheet, read_wide, visa_name)

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ")
OUT = os.path.join(BASE, "データ")
# 国籍・地域の名前をそろえる。元の表の書き方とそろえた名前は「データ/国籍・地域の名前の直し.csv」に書き出す。
# 「韓国・朝鮮」（2015年6月末まで1つ）は分けられないのでそのまま。別の国（ユーゴスラビア・セルビア・モンテネグロ・セルビア・モンテネグロ）はまとめない
RENAME_WHY = {
    "国の名前が変わった（新しい名前にそろえる）": {
        "マケドニア": "北マケドニア", "マケドニア旧ユーゴスラビア共和国": "北マケドニア", "スワジランド": "エスワティニ", "グルジア": "ジョージア"},
    "同じ国の書き方の違い（新しい表の書き方にそろえる）": {
        "（朝鮮）": "朝鮮", "カーボヴェルデ": "カーボベルデ", "ギニア・ビサウ": "ギニアビサウ",
        "セントクリストファー・ネイビス": "セントクリストファー・ネービス", "セントクリストファー・ネーヴィス": "セントクリストファー・ネービス",
        "ユーゴースラビア": "ユーゴスラビア", "ユーゴスラヴィア": "ユーゴスラビア", "南スーダン": "南スーダン共和国",
        "セルビア共和国": "セルビア", "モンテネグロ共和国": "モンテネグロ"},
    "元の表のマスで、改行の前と後が入れ替わっている（2006〜2010年末の都道府県の表）": {
        "・トバゴトリニダード": "トリニダード・トバゴ", "・バーブーダアンティグア": "アンティグア・バーブーダ",
        "・プリンシペサントメ": "サントメ・プリンシペ", "・ヘルツェゴビナボスニア": "ボスニア・ヘルツェゴビナ",
        "・モンテネグロセルビア": "セルビア・モンテネグロ", "・ネイビスセントクリストファー": "セントクリストファー・ネービス",
        "・ネーヴィスセントクリストファー": "セントクリストファー・ネービス"},
}
RENAME = {a: b for m in RENAME_WHY.values() for a, b in m.items()}
WHY = {a: why for why, m in RENAME_WHY.items() for a in m}
NAME_FIXES = defaultdict(set)  # (元の表の書き方, そろえた名前, わけ) → {(時点, 元のファイル)}
READING = [None, None]         # 今読んでいる (時点, 元のファイル)
OTHER_ROW = "その他"
SPLIT = ("都道府県_国籍_在留資格", "市区町村_国籍", "市区町村_在留資格", "市区町村_国籍_在留資格")  # 時点ごとのファイルに分ける表


def nat(v):
    s = nat_name(v)
    s = re.sub(r"^\d{2}\D*?\d{2,3}(?=\D)", "", s)  # 「02アジア02アフガニスタン」の形（2023年からの t1）
    s = re.sub(r"^\d{3}(?=\D)", "", s)  # 「001アフガニスタン」の形（2020・2021年の t1）
    s = re.sub(r"^\d+(?=\D)", "", s)  # 「08無国籍」の形（州の番号だけ付いている）
    t = s.replace("･", "・")  # 2006年末の都道府県の表の「韓国･朝鮮」（半角の中点）
    t = RENAME.get(t, t)
    if t != s:
        NAME_FIXES[(s, t, WHY.get(s.replace("･", "・"), "元の表の中点が半角（･）。全角（・）にそろえる"))].add(tuple(READING))
    return t


def kind_of(title):
    t = title
    if "テーブルデータ" in t:
        return "t2" if "市区町村別" in t else ("t1" if "ご利用方法" not in t else None)
    if "上位１００" in t or "上位100" in t:
        return None
    if "市区町村別在留資格別" in t:
        return "muni_visa"
    if ("市区町村別" in t or "市・区別" in t) and "国籍" in t:  # 「国籍（出身地）別市・区別」（登録外国人統計。町村は載っていない）
        return "muni_nat"
    if "都道府県別国籍・地域別" in t or "都道府県別国籍（出身地）別" in t:
        return "pref_nat"
    if "都道府県別在留資格" in t and ("（総数）" in t or "その" not in t):
        return "pref_visa"
    if re.search(r"-01(-1)?(m)?国籍・地域別在留資格|-01国籍（出身地）別在留資格", t):
        return "nat_visa"
    return None


def is_long(path):
    v = pd.read_excel(path, header=None, nrows=8)
    return any(clean(x) == "時点" for r in v.itertuples(index=False) for x in r)


# ---------- 表の種類ごとの読み出し（どれも DataFrame を返す） ----------

def load_nat_visa(path):
    if is_long(path):
        df = read_long(path)
        if "在留目的" in df.columns:
            df = df[df["在留目的"].isin(["計", "総数", ""])]
        st = df["州"]
        # 州の小計の行は除く（無国籍は州だけの行）。2023年12月末の表はオセアニアの小計だけ国籍・地域が「オセアニア」になっている
        keep = ((df["国籍・地域"] != TOTAL) & ~df["国籍・地域"].isin(REGIONS)) | (st == "無国籍")
        tot = df[(st == TOTAL) & (df["国籍・地域"] == TOTAL)]
        out = df[keep & ~df["国籍・地域"].str.startswith("うち")].copy()
        out["国籍・地域"] = [("無国籍" if s == "無国籍" else nat(n)) for s, n in zip(out["州"], out["国籍・地域"])]
        out["在留資格"] = out["在留資格"].map(visa_name)
        published = int(tot[tot["在留資格"] == TOTAL]["人数"].sum())
        return out[["国籍・地域", "在留資格", "人数"]], published
    w = read_wide(path)
    published = int(w[(w["行"].str.replace("総数", TOTAL) == TOTAL) & (w["列"] == TOTAL)]["人数"].iloc[0]) \
        if ((w["行"] == TOTAL) & (w["列"] == TOTAL)).any() else None
    if published is None:  # 「総　　　数」→ clean で「総数」になっているはず。念のため
        published = int(w[w["行"].str.startswith("総") & (w["段"] == 0) & (w["列"] == TOTAL)]["人数"].iloc[0])
    # 州の小計・総数の行は名前で除く（2019〜2021年の表は州と国が同じ列に並ぶ）。「うち中国〔香港〕」などは内わけ（二重に数えない）
    rows = w[~w["行"].isin(REGIONS | {TOTAL}) & ~w["行"].str.startswith(("うち", "総"))]
    out = pd.DataFrame({"国籍・地域": rows["行"].map(nat), "在留資格": rows["列"].map(visa_name), "人数": rows["人数"]})
    return out, published


def load_pref(path, colname):
    """第4表（列＝国籍・地域）・第5表（列＝在留資格）"""
    w = read_wide(path)
    w["都道府県"] = w["行"].map(pref_name)
    w = w[w["都道府県"].notna()]
    w = w[~w["列"].isin(REGIONS)]
    f = nat if colname == "国籍・地域" else visa_name
    return pd.DataFrame({"都道府県": w["都道府県"], colname: w["列"].map(f), "人数": w["人数"]})


def load_t1(path):
    df = read_rows_sheet(path, ["国籍・地域", "在留資格", "都道府県"])
    df["国籍・地域"] = df["国籍・地域"].map(nat)
    df["在留資格"] = df["在留資格"].map(visa_name)
    df["都道府県"] = df["都道府県"].map(pref_name)
    return df.groupby(["都道府県", "国籍・地域", "在留資格"], as_index=False)["人数"].sum()


# 政令指定都市（2012年からの20市）。1行ずつの表で「合計の行」と区を見分けるのに使う
SEIREI = {"北海道": ["札幌市"], "宮城県": ["仙台市"], "埼玉県": ["さいたま市"], "千葉県": ["千葉市"],
          "神奈川県": ["横浜市", "川崎市", "相模原市"], "新潟県": ["新潟市"], "静岡県": ["静岡市", "浜松市"], "愛知県": ["名古屋市"],
          "京都府": ["京都市"], "大阪府": ["大阪市", "堺市"], "兵庫県": ["神戸市"], "岡山県": ["岡山市"], "広島県": ["広島市"],
          "福岡県": ["北九州市", "福岡市"], "熊本県": ["熊本市"]}


def muni_kinds(df, colname):
    """1行ずつの市区町村の表に 種別・郡 を付ける（政令市の合計の行・区・その他）。
    表に載っていない小さな市町村がある年（2020年12月末・2021年6月末の第7表の2）は、都道府県の合計との差を
    「その他（表にない市町村）」の行にする（どの表も、合計の行を除いて足せば都道府県・全国の数になるように）"""
    df = df.copy()
    df["都道府県"] = df["都道府県"].map(lambda x: pref_name(x) or x)
    # 全国の行と、2020年12月末・2021年6月末の「その他の合計」（表にない小さな市町村の全国の合計。都道府県ごとの差と同じ人なので除く）
    df = df[~df["都道府県"].isin([TOTAL, "その他の合計"])]
    pref_total = df[(df["市区町村"] == TOTAL) & (df["都道府県"] != UNKNOWN_PREF)]
    df = df[(df["市区町村"] != TOTAL) | (df["都道府県"] == UNKNOWN_PREF)].copy()  # 未定・不詳は「総数」の行しかない
    kinds, guns, names = [], [], []
    for p, n in zip(df["都道府県"], df["市区町村"]):
        g, k = "", "市区町村"
        cities = SEIREI.get(p, [])
        m = re.fullmatch(r"(.+?)[（(](.+)[）)]", n)  # 2020年12月末からの「札幌市（中央区）」「札幌市（総数）」「特別区（港区）」の形
        if m:
            a, b = m.group(1), m.group(2)
            if b in (TOTAL, a):  # 「堺市（堺市）」（2021年6月末）も合計
                n, k = a, TOTAL_ROW
            elif a.startswith("特別区"):
                n = b
            else:
                n, k = a + b, "区"
        if p == UNKNOWN_PREF:
            n = UNKNOWN_PREF
        elif n.startswith("その他"):
            k = OTHER_ROW
        elif n in [c + TOTAL for c in cities]:  # 2021年6月末の第7表の2は「札幌市総数」（かっこなし）。区と足すと二重になる
            n, k = n[:-len(TOTAL)], TOTAL_ROW
        elif n.startswith("特別区") or n in cities:
            k = TOTAL_ROW
        elif k == "市区町村" and any(n.startswith(c) and n != c for c in cities):
            k = "区"
        elif k == "市区町村" and n.endswith("区") and len(cities) == 1 and p != "東京都":  # 2021年6月末の京都市の区は「右京区」だけ
            n, k = cities[0] + n, "区"
        elif k == "市区町村":
            m = re.fullmatch(r"(.+?郡)(.+[町村])", n)
            if m:
                g, n = m.group(1), m.group(2)
        kinds.append(k)
        guns.append(g)
        names.append(n)
    df["種別"], df["郡"], df["市区町村"] = kinds, guns, names
    if "市区町村コード" not in df.columns:
        df["市区町村コード"] = ""
    # 都道府県の合計の行と、載っている市区町村の合計の差
    listed = df[(df["種別"] != TOTAL_ROW) & (df["都道府県"] != UNKNOWN_PREF)].groupby(["都道府県", colname])["人数"].sum()
    gap = pref_total.set_index(["都道府県", colname])["人数"].sub(listed, fill_value=0)
    gap = gap[gap != 0].reset_index()
    if len(gap):
        gap = gap.assign(市区町村="その他（表にない市町村）", 種別=OTHER_ROW, 郡="", 市区町村コード="")
        df = pd.concat([df, gap], ignore_index=True)
    return df


def load_muni(path, colname):
    """第7表（国籍）・第7表の2（在留資格）など。横に並ぶ表も1行ずつの表も"""
    f = nat if colname == "国籍・地域" else visa_name
    if is_long(path):
        df = read_long(path)
        df = muni_kinds(df, colname)
        df[colname] = df[colname].map(f)
    else:
        df = read_municipal(path)
        df = df.rename(columns={"列": colname})
        df[colname] = df[colname].map(f)
        df.loc[df["市区町村"].str.startswith("その他"), "種別"] = OTHER_ROW
    return df[["都道府県", "市区町村コード", "郡", "市区町村", "種別", colname, "人数"]]


def load_t2(path):
    import zipfile
    names = zipfile.ZipFile(path).namelist()
    if any(n.startswith("xl/model/") for n in names):
        df = read_powerpivot(path, ["市区町村コード", "都道府県", "市区町村", "国籍・地域", "在留資格"])
    else:
        df = read_rows_sheet(path, ["市区町村コード", "都道府県", "市区町村", "国籍・地域", "在留資格"])
    df["都道府県"] = df["都道府県"].map(lambda x: pref_name(x) or clean(x))
    df["国籍・地域"] = df["国籍・地域"].map(lambda x: nat(x) if clean(x) not in ("-", "－") else "（秘匿）")
    df["在留資格"] = df["在留資格"].map(lambda x: visa_name(x) if clean(x) not in ("-", "－") else "（秘匿）")
    df["市区町村コード"] = df["市区町村コード"].map(lambda x: clean(x).zfill(5) if clean(x).isdigit() else clean(x))
    guns, names, kinds = [], [], []
    for p, n in zip(df["都道府県"], df["市区町村"].map(clean)):
        m = re.fullmatch(r"(.+?郡)(.+[町村])", n)
        g = ""
        if m:
            g, n = m.group(1), m.group(2)
        k = OTHER_ROW if n.startswith("その他") else ("区" if re.fullmatch(r".+市.+区", n) else "市区町村")
        if p == UNKNOWN_PREF or n in ("未定・不詳", ""):
            n, k = UNKNOWN_PREF if p == UNKNOWN_PREF else n, "市区町村"
        guns.append(g)
        names.append(n)
        kinds.append(k)
    df["郡"], df["市区町村"], df["種別"] = guns, names, kinds
    df = df.groupby(["都道府県", "市区町村コード", "郡", "市区町村", "種別", "国籍・地域", "在留資格"], as_index=False)["人数"].sum()
    return df


# ---------- まとめ ----------

def main():
    with open(os.path.join(SRC, "出どころ一覧.csv"), encoding="utf-8-sig") as f:
        # 月次（在留外国人統計 2012年12月末〜）と、Excel のある年次（登録外国人統計 2006〜2011年末。それより前は PDF だけ）
        src = [r for r in csv.DictReader(f) if r["ファイル"] and (r["種類"] == "月次" or r["ファイル"].endswith((".xls", ".xlsx")))]
    for r in src:
        if r["種類"] == "年次":
            r["時点"] = f"{r['時点']}-12"
    only = set(sys.argv[1:])  # 時点を渡すと、その時点だけ（試すとき）
    tables = defaultdict(list)   # 書き出す表の名前 → DataFrame のリスト
    check = defaultdict(dict)    # 時点 → {表の名前: 合計}
    used = defaultdict(set)      # 時点 → 読んだ表の種類
    for r in sorted(src, key=lambda r: r["時点"]):
        k = kind_of(r["表題"])
        when = r["時点"]
        if not k or (only and when not in only):
            continue
        path = os.path.join(SRC, r["ファイル"])
        print(when, k, os.path.basename(path), flush=True)
        READING[:] = [when, os.path.basename(path)]
        if k == "nat_visa":
            df, pub = load_nat_visa(path)
            check[when]["国の発表（第1表の総数）"] = pub
            check[when]["全国_国籍_在留資格"] = int(df[df["在留資格"] == TOTAL]["人数"].sum())
            tables["全国_国籍_在留資格"].append(df.assign(時点=when))
        elif k in ("pref_nat", "pref_visa"):
            col = "国籍・地域" if k == "pref_nat" else "在留資格"
            df = load_pref(path, col)
            name = "都道府県_国籍" if k == "pref_nat" else "都道府県_在留資格"
            check[when][name] = int(df[df[col] == TOTAL]["人数"].sum())
            tables[name].append(df.assign(時点=when, 出どころ=os.path.basename(path)))
        elif k == "t1":
            df = load_t1(path)
            check[when]["都道府県_国籍_在留資格（t1）"] = int(df["人数"].sum())
            tables["都道府県_国籍_在留資格"].append(df.assign(時点=when))
        elif k in ("muni_nat", "muni_visa"):
            col = "国籍・地域" if k == "muni_nat" else "在留資格"
            df = load_muni(path, col)
            name = "市区町村_国籍" if k == "muni_nat" else "市区町村_在留資格"
            check[when][name] = int(df[(df[col] == TOTAL) & (df["種別"] != TOTAL_ROW)]["人数"].sum())
            tables[name].append(df.assign(時点=when, 出どころ=os.path.basename(path)))
        elif k == "t2":
            df = load_t2(path)
            check[when]["市区町村_国籍_在留資格（t2）"] = int(df["人数"].sum())
            tables["市区町村_国籍_在留資格"].append(df.assign(時点=when))
        used[when].add(k)

    # 第4表・第5表のない時点は t1 から、第7表のない時点（2023年12月末から）は t2 から作る
    t1 = {d["時点"].iloc[0]: d for d in tables["都道府県_国籍_在留資格"]}
    for when, d in t1.items():
        for name, col in (("都道府県_国籍", "国籍・地域"), ("都道府県_在留資格", "在留資格")):
            if name in check[when]:
                continue
            g = d.groupby(["都道府県", col], as_index=False)["人数"].sum()
            tot = d.groupby("都道府県", as_index=False)["人数"].sum().assign(**{col: TOTAL})
            tables[name].append(pd.concat([tot, g]).assign(時点=when, 出どころ="t1"))
            check[when][name] = int(tot["人数"].sum())
    t2 = {d["時点"].iloc[0]: d for d in tables["市区町村_国籍_在留資格"]}
    keys = ["都道府県", "市区町村コード", "郡", "市区町村", "種別"]
    for when, d in t2.items():
        for name, col in (("市区町村_国籍", "国籍・地域"), ("市区町村_在留資格", "在留資格")):
            if name in check[when]:
                continue
            g = d.groupby(keys + [col], as_index=False)["人数"].sum()
            tot = d.groupby(keys, as_index=False)["人数"].sum().assign(**{col: TOTAL})
            tables[name].append(pd.concat([tot, g]).assign(時点=when, 出どころ="t2"))
            check[when][name] = int(tot["人数"].sum())

    # 負の人数は、読み方のまちがい（合計の行を区と数えたなど）。合計が合っても書き出さずに止める
    neg = [d[d["人数"] < 0].assign(表=name) for name, ds in tables.items() for d in ds if (d["人数"] < 0).any()]
    if neg:
        sys.exit("負の人数があります（書き出していません）:\n" + pd.concat(neg).head(20).to_string())

    os.makedirs(OUT, exist_ok=True)
    if not only:
        fixes = [{"元の表の書き方": a, "サイトの名前": b, "わけ": why, "時点": "・".join(sorted({w for w, _ in s})),
                  "元のファイル": "・".join(sorted({f for _, f in s}))} for (a, b, why), s in sorted(NAME_FIXES.items())]
        pd.DataFrame(fixes).to_csv(os.path.join(OUT, "国籍・地域の名前の直し.csv"), index=False, encoding="utf-8-sig")
        print(f"書き出し 国籍・地域の名前の直し.csv {len(fixes)}行")
    order = {
        "全国_国籍_在留資格": ["時点", "国籍・地域", "在留資格", "人数"],
        "都道府県_国籍": ["時点", "都道府県", "国籍・地域", "人数", "出どころ"],
        "都道府県_在留資格": ["時点", "都道府県", "在留資格", "人数", "出どころ"],
        "都道府県_国籍_在留資格": ["時点", "都道府県", "国籍・地域", "在留資格", "人数"],
        "市区町村_国籍": ["時点", "都道府県", "市区町村コード", "郡", "市区町村", "種別", "国籍・地域", "人数", "出どころ"],
        "市区町村_在留資格": ["時点", "都道府県", "市区町村コード", "郡", "市区町村", "種別", "在留資格", "人数", "出どころ"],
        "市区町村_国籍_在留資格": ["時点", "都道府県", "市区町村コード", "郡", "市区町村", "種別", "国籍・地域", "在留資格", "人数"],
    }
    inner = defaultdict(list)  # 時点 → ["表 合わない数", …]（内わけの確かめ）
    for name, cols in order.items():
        if not tables[name]:
            continue
        df = pd.concat(tables[name], ignore_index=True)
        df = df[df["人数"] != 0][cols] if name not in ("市区町村_国籍", "市区町村_在留資格") else df[cols]
        if "在留資格" in cols:
            # 内わけの確かめ：どの場所・国籍でも、在留資格の数の合計（細かい区分と小計はまとめて）＝総数
            keys = [c for c in cols if c not in ("在留資格", "人数", "出どころ")]
            g = group_visas(df[keys + ["在留資格", "人数"]])
            tot = g[g["在留資格"] == TOTAL].groupby(keys, dropna=False)["人数"].sum()
            part = g[g["在留資格"] != TOTAL].groupby(keys, dropna=False)["人数"].sum().reindex(tot.index, fill_value=0)
            ng = (tot != part)
            for when, n in ng.groupby(level=0).sum().items():
                if n:
                    inner[when].append(f"{name} {int(n)}")
        df.insert(1, "統計", df["時点"].map(lambda w: "登録外国人統計" if w < "2012-12" else "在留外国人統計"))
        if only:
            name = f"試し_{name}"
        elif name in SPLIT:
            folder = os.path.join(OUT, name)
            os.makedirs(folder, exist_ok=True)
            whens = sorted(df["時点"].unique())
            for when in whens:
                df[df["時点"] == when].to_csv(os.path.join(folder, f"{when}.csv"), index=False, encoding="utf-8-sig")
            for old_file in os.listdir(folder):  # もう作らない時点のファイルは消す
                if old_file.endswith(".csv") and old_file[:-4] not in whens:
                    os.remove(os.path.join(folder, old_file))
            if os.path.exists(os.path.join(OUT, f"{name}.csv")):  # 分ける前の1つのファイル
                os.remove(os.path.join(OUT, f"{name}.csv"))
            print(f"書き出し {name}/ {len(df):,}行 時点 {len(whens)}（時点ごとのファイル）")
            continue
        df.to_csv(os.path.join(OUT, f"{name}.csv"), index=False, encoding="utf-8-sig")
        print(f"書き出し {name}.csv {len(df):,}行 時点 {df['時点'].nunique()}")

    # 検算：どの表の合計も国の発表の全国の数と同じか（市区町村の表は合計の行を除いた合計）
    names = ["国の発表（第1表の総数）", "全国_国籍_在留資格", "都道府県_国籍", "都道府県_在留資格", "都道府県_国籍_在留資格（t1）",
             "市区町村_国籍", "市区町村_在留資格", "市区町村_国籍_在留資格（t2）"]
    rows, bad = [], []
    for when in sorted(check):
        c = check[when]
        pub = c.get(names[0])
        row = {"時点": when, **{n: c.get(n, "") for n in names}}
        diffs = {n: c[n] - pub for n in names[1:] if n in c and pub is not None and c[n] != pub}
        note = ""
        if when < "2012-12" and "市区町村_国籍" in diffs:  # 登録外国人統計の市区町村の表は市と区だけ（町村は載っていない）
            note = f"（市区町村_国籍 {diffs.pop('市区町村_国籍'):+,} は町村の載っていない表のため。想定どおり）"
        row["ちがい"] = "・".join(f"{n} {d:+,}" for n, d in diffs.items()) + note
        row["内わけが総数と合わない数"] = "・".join(inner.get(when, []))
        rows.append(row)
        if diffs or inner.get(when):
            bad.append(f"{when}: {row['ちがい']} {row['内わけが総数と合わない数']}")
    with open(os.path.join(OUT, "検算.csv" if not only else "試し_検算.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["時点"] + names + ["ちがい", "内わけが総数と合わない数"])
        w.writeheader()
        w.writerows(rows)
    print("検算: 全部の時点で一致" if not bad else "検算: 合わない時点\n  " + "\n  ".join(bad))


if __name__ == "__main__":
    main()
