# データ/ の表から、ダッシュボード（site/dash.html）が読む小さな JSON（site/data/）を作る
# 使い方: <pandas の入った python> -I make_dash_data.py   （make_site.py のあとに動かす）
#
#   数は国の表のまま。ない組み合わせは null（0人とは分ける）。推測で埋めたり、別々の表から組み合わせを作ったりしない
#   時点の並び
#     P  … 全国・都道府県の時点（1959〜2005年の統計書の年と、2006年末〜の時点。1964年は「その他の国籍」の表がないので入れない）
#     MP … 市区町村の時点（2006年末〜）
#   作るファイル（必要な分だけ読み込めるように分ける）
#     meta.json            時点・都道府県・市区町村・国籍・在留資格の一覧、市区町村の表にのっている国籍（年による）、人口の基準日、
#                          国籍・地域の州と地域区分（データ/国籍・地域の区分.csv）
#     japan.json           全国の総数・国籍別（1984年〜）・在留資格別（1992年〜）・人口
#     japan-x.json         全国の 国籍×在留資格（2006年末〜）
#     prefs.json           都道府県の総数・人口
#     pref-nat.json        都道府県×国籍（1984年〜）
#     pref-visa.json       都道府県×在留資格（1992年〜）
#     px/<時点>.json       都道府県×国籍×在留資格（2016年12月末〜）
#     muni-total.json      市区町村の総数・人口（政令市は区の合計）
#     muni/<ローマ字>.json   その都道府県の市区町村×国籍・×在留資格、「公表されていない」時点
#     mx/<ローマ字>-<時点>.json  その都道府県の市区町村×国籍×在留資格（2023年12月末〜）
#     sokuho.json          法務省の半期速報（データ/半期速報/、make_press.py が作る）と、比べるための確定統計（2012年12月末〜）。
#                          速報と確定統計は別々に持ち、混ぜない。速報は発表ごとの「その時点の数」と、発表にのった前の時点の数
#   人口：総務省「住民基本台帳に基づく人口」（日本人住民と外国人住民の合計、翌年1月1日現在）を12月末の時点に合わせる
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_site as ms  # noqa: E402
from make_data import RENAME, WHY  # noqa: E402
from make_map import CITY, NEW_CODE  # noqa: E402
from read_tables import group_visas  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
BASE = ms.BASE
DATA = ms.DATA
OUT = os.path.join(ms.OUT, "data")
OLD_NAT_FROM, OLD_VISA_FROM = "1984-12", "1992-12"  # 古い表の国籍別・在留資格別を使う最初の年（在留資格は1990年の法改正のあとの区分から）
FULL_NAT_FROM = "2023-12"  # 市区町村の表に全部の国がのる最初の時点
MUNI_VISA_FROM = "2019-12"
# 古い表（2005年まで）の国籍・地域の名前は印刷どおり。ダッシュボードでは今の表の名前にそろえて1本のグラフにする
# （2006年からの表と同じ直し（make_data.py の RENAME）も使う）。どの名前も、そろえる先の名前と同じ年に両方のることはない（main で確かめる）。
# 今の1つの国に置きかえられない国（GONE）はそろえず、選ぶ欄で「今はない国」と印をつける。そろえ方の一覧は データ/古い表/国籍・地域の名前のそろえ方.csv
OLD_RENAME_WHY = {
    "国の名前が変わった（今の名前にそろえる）": {
        "ビルマ": "ミャンマー", "ザイール": "コンゴ民主共和国", "西サモア": "サモア"},
    "同じ国の書き方の違い（今の表の書き方にそろえる）": {
        "アメリカ": "米国", "イギリス": "英国", "アルゼンティン": "アルゼンチン", "アンチグア・バーブーダ": "アンティグア・バーブーダ",
        "アンティグァ・バーブーダ": "アンティグア・バーブーダ", "アンドラ公国": "アンドラ", "ウルグァイ": "ウルグアイ", "エティオピア": "エチオピア",
        "エル・サルヴァドル": "エルサルバドル", "カンボディア": "カンボジア", "カーボ・ヴェルデ": "カーボベルデ", "ギニアビサオ": "ギニアビサウ",
        "ギニア・ビサオ": "ギニアビサウ", "ギリシア": "ギリシャ", "クウェイト": "クウェート", "グァテマラ": "グアテマラ", "コスタ・リカ": "コスタリカ",
        "コンゴ": "コンゴ共和国", "コンゴー": "コンゴ共和国", "コンゴー民主共和国": "コンゴ民主共和国", "コートジボアール": "コートジボワール",
        "象牙海岸": "コートジボワール", "象牙海岸共和国": "コートジボワール", "サイプラス": "キプロス", "サウディ・アラビア": "サウジアラビア",
        "サン・マリノ": "サンマリノ", "シエラ・レオーネ": "シエラレオネ", "ジブティ": "ジブチ", "ジョルダン": "ヨルダン", "スリ・ランカ": "スリランカ",
        "スロヴァキア": "スロバキア", "スロヴェニア": "スロベニア", "セイシェル": "セーシェル", "セントクリストファー": "セントクリストファー・ネービス",
        "セント・クリストファー・ネイヴィス": "セントクリストファー・ネービス", "セント・クリストファー・ネイヴィース": "セントクリストファー・ネービス",
        "セント・ビンセント": "セントビンセント", "セント・ヴィンセント": "セントビンセント", "セント・ルシア": "セントルシア", "チェッコ": "チェコ",
        "チャード": "チャド", "テュニジア": "チュニジア", "トゥヴァル": "ツバル", "トリニダッド・トバゴ": "トリニダード・トバゴ", "トーゴー": "トーゴ",
        "ニカラグァ": "ニカラグア", "ニュー・ジーランド": "ニュージーランド", "ハイティ": "ハイチ", "バハレーン": "バーレーン",
        "パプア・ニューギニア": "パプアニューギニア", "パラウ": "パラオ", "パラグァイ": "パラグアイ", "ミャンマー連邦": "ミャンマー",
        "ブルキナ・ファソ": "ブルキナファソ", "ブルンディ": "ブルンジ", "ホンデュラス": "ホンジュラス", "ボスニア・ヘルツェゴヴィナ": "ボスニア・ヘルツェゴビナ",
        "ボリヴィア": "ボリビア", "マレイシア": "マレーシア", "マーシャル諸島": "マーシャル", "ミクロネシア連邦": "ミクロネシア", "モルジブ": "モルディブ",
        "モルディヴ": "モルディブ", "モルドヴァ": "モルドバ", "ラトヴィア": "ラトビア", "ルクセンブルグ": "ルクセンブルク", "ロシア連邦": "ロシア",
        "ヴァヌアツ": "バヌアツ", "ヴィエトナム": "ベトナム", "ヴェトナム": "ベトナム", "ヴェネズエラ": "ベネズエラ", "南アフリカ": "南アフリカ共和国",
        "ユーゴースラヴィア連邦共和国": "ユーゴスラビア連邦共和国"},
}
OLD_RENAME = {**RENAME, **{a: b for m in OLD_RENAME_WHY.values() for a, b in m.items()}}
OLD_WHY = {**WHY, **{a: why for why, m in OLD_RENAME_WHY.items() for a in m}}
GONE = {"ソ連", "東ドイツ", "西ドイツ", "チェコスロバキア", "イエメン・アラブ", "ユーゴスラビア連邦共和国"}  # 今はない国（今の1つの国に置きかえられない）


def dump(name, obj):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def arr(d, periods):
    return [None if d.get(w) is None else int(d[w]) for w in periods]


def nonempty(a):
    return any(v for v in a if v)


def sokuho(d, MP):
    """半期速報のページの数。速報：発表ごと（W）の、表（国籍・地域／在留資格／都道府県）× 名前 の数（その発表にない名前は null）。
    前：その発表にのった前の時点の数（{発表: {表: {名前: {時点: 人数}}}}）。確定：e-Stat の表の同じ名前の数（CP の時点）"""
    sp = pd.read_csv(os.path.join(DATA, "半期速報", "半期速報.csv"))
    chk = pd.read_csv(os.path.join(DATA, "半期速報", "確かめ.csv"))
    src = pd.read_csv(os.path.join(BASE, "元データ", "半期速報_出どころ一覧.csv"))
    W = sorted(sp["発表の時点"].unique())
    rel = []
    for w in W:
        c = chk[chk["発表の時点"] == w].iloc[0]
        files = src[src["時点"] == w]
        rel.append({"w": w, "pub": c["公表日"], "page": files["発表のページ"].iat[0], "title": files["表題"].iat[0],
                    "files": [[r["ファイル名"], r["資料のURL"]] for _, r in files.iterrows()], "check": c["確定統計との比べ"],
                    "sum": {k: c[f"{k}：内わけの合計と総数"] for k in ("国籍・地域", "在留資格", "都道府県")}})
    own = sp[sp["状態"] == "速報"]
    out = {}
    for kind, g in own.groupby("表"):
        names = list(dict.fromkeys(g.sort_values(["発表の時点", "人数"], ascending=[False, False])["名前"]))
        out[kind] = {n: [None] * len(W) for n in names}
        for _, r in g.iterrows():
            out[kind][r["名前"]][W.index(r["発表の時点"])] = int(r["人数"])
    before = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    for _, r in sp[sp["状態"] != "速報"].iterrows():
        before[r["発表の時点"]][r["表"]][r["名前"]][r["時点"]] = int(r["人数"])
    CP = [w for w in MP if w >= "2012-12"]
    conf = {"国籍・地域": {}, "在留資格": {}, "都道府県": {}}
    for n in out.get("国籍・地域", {}):
        if n == "総数":
            conf["国籍・地域"][n] = [d.japan.get(w) for w in CP]
        elif n in d.nat_series:
            conf["国籍・地域"][n] = [d.nat_series[n].get(w) for w in CP]
    for v in out.get("在留資格", {}):
        if v == "中長期在留者":  # 確定統計の表にこの区分の行はない（足し引きで作らない）
            continue
        if v == "総数":
            conf["在留資格"][v] = [d.japan.get(w) for w in CP]
            continue
        conf["在留資格"][v] = [sum(c for k, c in d.japan_visa[w].items() if ms.VISA_RENAME.get(k, k) == v) or None for w in CP]
    for p in out.get("都道府県", {}):
        if p in d.pref_series:
            conf["都道府県"][p] = [d.pref_series[p].get(w) for w in CP]
    conf["都道府県"]["総数"] = conf["国籍・地域"].get("総数")
    return {"W": W, "releases": rel, "sp": out, "before": before, "CP": CP, "conf": conf, "renames": ms.VISA_RENAME}


def main():
    d = ms.load()
    d.areas = {p: ms.area_list(d, p) for p in ms.PREFS}
    MP = sorted(d.japan_visa)
    OP = sorted(w for w in d.old["総数"] if w < MP[0])
    P = OP + MP
    size = {}

    # ---- 古い表（1984〜2005年の国籍、1992〜2005年の在留資格）
    O = os.path.join(DATA, "古い表")
    on = pd.read_csv(os.path.join(O, "全国_国籍_在留資格.csv"), dtype={"人数": "Int64"})
    on = on[(on["在留資格"] == "総数") & (on["時点"] >= OLD_NAT_FROM) & ~on["国籍・地域"].str.endswith("州") & (on["国籍・地域"] != "総数")].copy()
    on["元の名前"] = on["国籍・地域"]
    on["国籍・地域"] = on["国籍・地域"].replace(OLD_RENAME)
    both = on[on["人数"] > 0].groupby(["国籍・地域", "時点"])["元の名前"].nunique()
    if (both > 1).any():
        print("※ 古い表で、同じ年に2つの名前が同じ国にそろう（足すと二重になるかもしれない）：" + "、".join(f"{n} {w}" for n, w in both[both > 1].index))
    fixed = on[on["元の名前"] != on["国籍・地域"]].groupby(["元の名前", "国籍・地域"])["時点"].agg(lambda s: "・".join(sorted(s)))
    pd.DataFrame([{"古い表の書き方": a, "ダッシュボードの名前": b, "わけ": OLD_WHY[a], "時点": w} for (a, b), w in fixed.items()]).to_csv(
        os.path.join(DATA, "古い表", "国籍・地域の名前のそろえ方.csv"), index=False, encoding="utf-8-sig")
    old_nat = defaultdict(dict)
    for (n, w), v in on.groupby(["国籍・地域", "時点"])["人数"].sum().items():
        old_nat[n][w] = int(v)
    op = pd.read_csv(os.path.join(O, "都道府県_国籍.csv"), dtype={"人数": "Int64"})
    op = op[(op["時点"] >= OLD_NAT_FROM) & ~op["国籍・地域"].str.endswith("州") & (op["国籍・地域"] != "総数") & op["都道府県"].isin(ms.PREFS)].copy()
    op["国籍・地域"] = op["国籍・地域"].replace(OLD_RENAME)
    old_pref_nat = defaultdict(lambda: defaultdict(dict))
    for (p, n, w), v in op.groupby(["都道府県", "国籍・地域", "時点"])["人数"].sum().items():
        old_pref_nat[p][n][w] = int(v)
    ov = pd.read_csv(os.path.join(O, "都道府県_在留資格.csv"), dtype={"人数": "Int64", "内わけ": str})
    ov = ov[(ov["国籍"] == "総数") & (ov["時点"] >= OLD_VISA_FROM) & (ov["在留資格"] != "総数")]
    old_visa = defaultdict(lambda: defaultdict(dict))  # 都道府県（"総数"＝全国）→ 在留資格 → {時点: 人数}
    for (p, v, w), c in ov.groupby(["都道府県", "在留資格", "時点"])["人数"].sum().items():
        old_visa[p][v][w] = int(c)

    # ---- 人口（住民基本台帳、翌年1月1日現在 → 12月末の時点）
    pop = pd.read_csv(os.path.join(DATA, "人口", "住民基本台帳人口.csv"), dtype={"団体コード": str})
    pop["時点"] = [f"{int(b[:4]) - 1}-12" for b in pop["基準日"]]
    pop["団体コード"] = pop["団体コード"].map(lambda c: NEW_CODE.get(c, c))
    pop_dates = {f"{int(b[:4]) - 1}-12": b for b in sorted(pop["基準日"].unique())}
    pop_jp = dict(zip(pop[pop["種別"] == "全国"]["時点"], pop[pop["種別"] == "全国"]["人口"]))
    pop_pref = defaultdict(dict)
    for _, r in pop[pop["種別"] == "都道府県"].iterrows():
        pop_pref[r["都道府県"]][r["時点"]] = int(r["人口"])
    pop_code = defaultdict(dict)
    for _, r in pop[pop["種別"] != "全国"].iterrows():
        pop_code[r["団体コード"]][r["時点"]] = int(r["人口"])
    city_code = {name: code for code, name in CITY.items()}

    # ---- 全国
    nats_latest = sorted(d.nat_series, key=lambda n: -(d.nat_series[n].get(MP[-1]) or 0))
    nat_t = {}
    for n in set(d.nat_series) | set(old_nat):
        a = arr({**old_nat.get(n, {}), **d.nat_series.get(n, {})}, P)
        if nonempty(a):
            nat_t[n] = a
    visa_t = {}
    for v in set(v for w in MP for v in d.japan_visa[w]) | set(old_visa["総数"]):
        a = arr({**old_visa["総数"].get(v, {}), **{w: d.japan_visa[w].get(v) for w in MP if v in d.japan_visa[w]}}, P)
        if nonempty(a):
            visa_t[v] = a
    size["japan.json"] = dump("japan.json", {"t": arr(d.japan, P), "n": nat_t, "v": visa_t, "pop": arr(pop_jp, P)})
    nx = defaultdict(dict)
    for n in d.nat_series:
        vs = set(v for w in MP for v in d.nat_visa.get((w, n), {}))
        for v in vs:
            a = [d.nat_visa.get((w, n), {}).get(v) if (w, n) in d.nat_visa else None for w in MP]
            if nonempty(a):
                nx[n][v] = a
    size["japan-x.json"] = dump("japan-x.json", nx)

    # ---- 都道府県
    size["prefs.json"] = dump("prefs.json", {"t": {p: arr(d.pref_series[p], P) for p in ms.PREFS},
                                             "pop": {p: arr(pop_pref[p], P) for p in ms.PREFS}})
    pn = {}
    for p in ms.PREFS:
        names = set(old_pref_nat[p]) | set(n for w in MP for n in d.pref_nat.get((w, p), {}))
        pn[p] = {}
        for n in names:
            a = arr({**old_pref_nat[p].get(n, {}), **{w: d.pref_nat[(w, p)][n] for w in MP if n in d.pref_nat.get((w, p), {})}}, P)
            if nonempty(a):
                pn[p][n] = a
    size["pref-nat.json"] = dump("pref-nat.json", pn)
    pv = {}
    for p in ms.PREFS:
        names = set(old_visa[p]) | set(v for w in MP for v in d.pref_visa.get((w, p), {}))
        pv[p] = {}
        for v in names:
            a = arr({**old_visa[p].get(v, {}), **{w: d.pref_visa[(w, p)][v] for w in MP if v in d.pref_visa.get((w, p), {})}}, P)
            if nonempty(a):
                pv[p][v] = a
    size["pref-visa.json"] = dump("pref-visa.json", pv)
    px_periods = []
    folder = os.path.join(DATA, "都道府県_国籍_在留資格")
    for f in sorted(os.listdir(folder)):
        w = f[:7]
        x = group_visas(pd.read_csv(os.path.join(folder, f)))
        x = x[(x["在留資格"] != "総数") & (x["国籍・地域"] != "総数") & x["都道府県"].isin(ms.PREFS)]
        out = defaultdict(lambda: defaultdict(dict))
        for (p, n, v), c in x.groupby(["都道府県", "国籍・地域", "在留資格"])["人数"].sum().items():
            if c:
                out[p][n][v] = int(c)
        size[f"px/{w}.json"] = dump(f"px/{w}.json", out)
        px_periods.append(w)

    # ---- 市区町村
    def keyed(df):  # 合計の行を除き、コードのない時点（2021年6月末まで）は名前でコードに結ぶ
        df = df[df["種別"] != "合計の行"].copy()
        df["key"] = [c if isinstance(c, str) else d.name2code.get((p, n)) for c, p, n in zip(df["市区町村コード"], df["都道府県"], df["市区町村"])]
        return df

    folder = os.path.join(DATA, "市区町村_国籍")
    mn = keyed(pd.concat([pd.read_csv(os.path.join(folder, f), dtype={"市区町村コード": str}) for f in sorted(os.listdir(folder))], ignore_index=True))
    listed = {}
    for w, g in mn.groupby("時点"):
        if w < FULL_NAT_FROM:
            listed[w] = sorted(set(g["国籍・地域"]) - {"総数", ms.HIDDEN})
    muni_nat = defaultdict(lambda: defaultdict(dict))  # コード → 国籍 → {時点: 人数}
    hidden = defaultdict(set)
    for (k, n, w), v in mn[mn["国籍・地域"] != "総数"].groupby(["key", "国籍・地域", "時点"])["人数"].sum().items():
        if n == ms.HIDDEN:
            hidden[k].add(w)
        else:
            muni_nat[k][n][w] = int(v)
    folder = os.path.join(DATA, "市区町村_在留資格")
    muni_visa = defaultdict(lambda: defaultdict(dict))
    for f in sorted(os.listdir(folder)):
        x = keyed(group_visas(pd.read_csv(os.path.join(folder, f), dtype={"市区町村コード": str}).drop(columns=["出どころ"])))
        for (k, v, w), c in x[x["在留資格"] != "総数"].groupby(["key", "在留資格", "時点"])["人数"].sum().items():
            if v == ms.HIDDEN:
                hidden[k].add(w)
            else:
                muni_visa[k][v][w] = int(c)

    def series_of(ref, table):
        if isinstance(ref, tuple):
            out = defaultdict(lambda: defaultdict(int))
            for c in d.city_parts[ref]:
                for n, s in table.get(c, {}).items():
                    for w, v in s.items():
                        out[n][w] += v
            return out
        return table.get(ref, {})

    munis_meta, totals = {}, {}
    for p, roma in zip(ms.PREFS, ms.ROMA):
        rows, mfile = [], {}
        for name, link, subt, ref in d.areas[p]:
            items = [(("city:" + ref[1]) if isinstance(ref, tuple) else ref, name, "政令市" if isinstance(ref, tuple) else "市区町村", "", ref, link)]
            if isinstance(ref, tuple):
                for c in sorted(d.cities[ref]):
                    items.append((c, d.munis[c]["name"], "区", "city:" + ref[1], c, f"muni-{c}.html"))
            for key, nm, kind, parent, r, lk in items:
                rows.append([key, nm, kind, parent, lk])
                t = ms.city_series(d, r) if isinstance(r, tuple) else d.muni_series.get(r, {})
                pcode = city_code.get(r[1]) if isinstance(r, tuple) else r
                totals[key] = [roma, arr(t, MP), arr(pop_code.get(pcode, {}), MP)]
                nat = series_of(r, muni_nat)
                vis = series_of(r, muni_visa)
                hid = sorted({w for c in (d.city_parts[r] if isinstance(r, tuple) else [r]) for w in hidden.get(c, ())})
                entry = {"n": {n: arr(s, MP) for n, s in nat.items() if nonempty(arr(s, MP))},
                         "v": {v: arr(s, MP) for v, s in vis.items() if nonempty(arr(s, MP))}}
                if hid:
                    entry["h"] = [MP.index(w) for w in hid]
                mfile[key] = entry
        munis_meta[roma] = rows
        size[f"muni/{roma}.json"] = dump(f"muni/{roma}.json", mfile)
    size["muni-total.json"] = dump("muni-total.json", totals)

    folder = os.path.join(DATA, "市区町村_国籍_在留資格")
    mx_periods = []
    code_pref = {k: v["pref"] for k, v in d.munis.items()}
    code_pref.update({c: key[0] for key, codes in d.city_parts.items() for c in codes})  # 前にあった区（2023年12月末の浜松市の7区）
    for f in sorted(os.listdir(folder)):
        w = f[:7]
        x = group_visas(pd.read_csv(os.path.join(folder, f), dtype={"市区町村コード": str}))
        x = x[(x["在留資格"] != "総数") & (x["国籍・地域"] != "総数") & x["市区町村コード"].isin(code_pref)]
        by = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))  # 都道府県 → 鍵 → 国籍 → {在留資格: 人数}
        for (k, n, v), c in x.groupby(["市区町村コード", "国籍・地域", "在留資格"])["人数"].sum().items():
            if c and n != ms.HIDDEN and v != ms.HIDDEN:
                by[code_pref[k]][k][n][v] = int(c)
        for key, codes in d.city_parts.items():  # 政令市＝その時点にある区の合計
            ck = "city:" + key[1]
            for c in codes:
                for n, vs in by[key[0]].get(c, {}).items():
                    for v, c2 in vs.items():
                        by[key[0]][ck][n][v] = by[key[0]][ck][n].get(v, 0) + c2
        for p, roma in zip(ms.PREFS, ms.ROMA):
            size[f"mx/{roma}-{w}.json"] = dump(f"mx/{roma}-{w}.json", by.get(p, {}))
        mx_periods.append(w)

    visas_latest = sorted(d.japan_visa[MP[-1]], key=lambda v: -d.japan_visa[MP[-1]][v])
    meta = {"P": P, "MP": MP, "stat": ["登録外国人統計" if w < "2012-12" else "在留外国人統計" for w in P],
            "prefs": [[p, r] for p, r in zip(ms.PREFS, ms.ROMA)], "munis": munis_meta,
            "nats": [n for n in nats_latest if n in nat_t] + sorted(n for n in nat_t if n not in d.nat_series),
            "visas": [v for v in visas_latest] + sorted(v for v in visa_t if v not in visas_latest),
            "listed": listed, "fullNatFrom": FULL_NAT_FROM, "muniVisaFrom": MUNI_VISA_FROM,
            "pxPeriods": px_periods, "mxPeriods": mx_periods, "popDates": pop_dates, "renames": ms.VISA_RENAME,
            "oldNatFrom": OLD_NAT_FROM, "oldVisaFrom": OLD_VISA_FROM, "built": date.today().isoformat()}
    # 国籍・地域の州と地域区分（国籍・地域を選ぶ欄を、地域区分で絞れるように）
    meta["natRegion"] = {n: list(ms.region_of(n)) for n in meta["nats"]}
    meta["natOld"] = {}  # 2005年までの古い表だけにある国籍・地域 → 選ぶ欄で名前のあとに書く印
    for n in meta["nats"]:
        if n not in d.nat_series:
            ys = [w[:4] for w, v in zip(P, nat_t[n]) if v]
            meta["natOld"][n] = f"今はない国。{ys[-1]}年の表まで" if n in GONE else (f"{ys[0]}年の表だけ" if ys[0] == ys[-1] else f"{ys[0]}〜{ys[-1]}年の表だけ")
    print("古い表だけの国籍・地域：" + "、".join(f"{n}（{t}）" for n, t in meta["natOld"].items()))
    meta["regions"] = ms.REGION_TREE
    size["meta.json"] = dump("meta.json", meta)
    sk = sokuho(d, MP)
    sk["natRegion"] = {n: list(ms.NAT_REGION[n]) for n in sk["sp"]["国籍・地域"] if n in ms.NAT_REGION}
    sk["regions"] = ms.REGION_TREE
    size["sokuho.json"] = dump("sokuho.json", sk)
    if ms.NO_REGION:
        print("地域区分の表にない国籍・地域：" + "、".join(sorted(ms.NO_REGION)))
    total = sum(size.values())
    big = sorted(size.items(), key=lambda x: -x[1])[:6]
    print(f"ファイル {len(size)}、合わせて {total / 2**20:.1f}MB。大きいもの：" + "、".join(f"{k} {v / 2**20:.2f}MB" for k, v in big))
    print(f"時点 P {P[0]}〜{P[-1]}（{len(P)}）、MP {len(MP)}、国籍 {len(meta['nats'])}、在留資格 {len(meta['visas'])}、市区町村 {sum(len(v) for v in munis_meta.values())}")


if __name__ == "__main__":
    main()
