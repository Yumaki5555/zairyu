# 法務省の半期速報（元データ/半期速報/ の報道発表の Excel）を、1行に1つの数の表にして確かめる
# 使い方: <pandas・openpyxl の入った python> -I make_press.py
#
#   読む表（表題で探す。年によってシートの名前や並びが違うため）
#     国籍・地域別在留外国人数の推移 … 上位の国籍・地域（年により10〜20）と「その他」。過去の時点の列もある
#     在留資格別在留外国人数の推移   … 在留資格（号などの細かい区分は除き、サイトと同じまとめ方の名前だけ）
#     都道府県別在留外国人数の推移   … 47都道府県（と「未定・不詳」）
#   書き出す表: データ/半期速報/半期速報.csv
#     列：発表の時点（その発表がどの時点の発表か）・公表日・表・名前・時点（数の時点。発表には前の時点の列もある）・人数・状態・出どころ・発表のページ
#     状態：「速報」＝その発表の時点の数、「発表にのった前の時点の数」＝同じ発表の過去の列
#   確かめ: データ/半期速報/確かめ.csv
#     発表の時点ごとに、内わけの合計が総数と合うか、同じ時点の確定統計（データ/ の e-Stat の表）と同じか
#   新しい発表は download_press.py で落としてから、これを動かし直す（前の発表は上書きされない。同じ時点の発表は1つだけ）
import csv
import os
import re
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_tables import group_visas  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "半期速報")
LIST_CSV = os.path.join(BASE, "元データ", "半期速報_出どころ一覧.csv")
DATA = os.path.join(BASE, "データ")
OUT = os.path.join(DATA, "半期速報")
TABLES = {"国籍・地域": "国籍・地域別在留外国人数の推移", "在留資格": "在留資格別在留外国人数の推移", "都道府県": "都道府県別在留外国人数の推移"}
ERA = {"令和": 2018, "平成": 1988}
Z2H = str.maketrans("０１２３４５６７８９", "0123456789")
PREFS = ("北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 "
         "山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 "
         "香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県").split()
VISA_TOP = {"総数", "中長期在留者", "特別永住者"}


def norm(s):
    return re.sub(r"[\s　]+", "", str(s)) if isinstance(s, str) else ""


def when_of(label):
    """列の見出し（平成24年末・令和８年６月末 など）→ 時点（2012-12・2026-06）"""
    m = re.search(r"(令和|平成)([元0-9]+)年(?:([0-9]+)月)?末", norm(label).translate(Z2H))
    if not m:
        return None
    y = ERA[m.group(1)] + (1 if m.group(2) == "元" else int(m.group(2)))
    return f"{y}-{int(m.group(3)) if m.group(3) else 12:02d}"


def find_table(sheets, title):
    for name, d in sheets.items():
        for r in range(len(d)):
            for c in range(d.shape[1]):
                if title in norm(d.iat[r, c]):
                    return d, r
    return None, None


def read_trend(d, r0):
    """「〇〇別在留外国人数の推移」の表 → [(名前, 名前の列, {時点: 人数})]"""
    # 見出しは2〜3行に分かれていることがある（「令和3年」「6月末」）。「総数」の行の上までを列ごとにつなげて読む
    start = next((r for r in range(r0 + 1, len(d)) if any(norm(v) == "総数" for v in d.iloc[r].tolist())), None)
    if start is None:
        raise ValueError("「総数」の行が見つかりません")
    cols = {}
    for c in range(d.shape[1]):
        w = when_of("".join(norm(d.iat[r, c]) for r in range(r0 + 1, start)))
        if w:
            cols[c] = w
    if len(cols) < 2:
        raise ValueError("時点の見出しが見つかりません")
    first = min(cols)
    rows = []
    for r in range(start, len(d)):
        names = [(c, norm(d.iat[r, c])) for c in range(first) if norm(d.iat[r, c])]
        if not names:
            continue
        c, name = names[-1]
        if name.startswith(("（注", "(注", "（参考", "注")):
            if name.startswith(("（注", "(注", "注")):
                break
            continue
        vals = {}
        for col, w in cols.items():
            v = pd.to_numeric(d.iat[r, col], errors="coerce")
            if not pd.isna(v):
                vals[w] = int(v)
        if vals:
            rows.append((name, c, vals))
    return rows


def visa_names():
    """サイトと同じまとめ方の在留資格の名前（e-Stat の表から）"""
    n = pd.read_csv(os.path.join(DATA, "全国_国籍_在留資格.csv"))
    g = group_visas(n[n["在留資格"] != "総数"])
    return set(g["在留資格"].unique())


def main():
    with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
        src = [r for r in csv.DictReader(f) if r["ファイル名"].endswith((".xlsx", ".xls"))]
    visas = visa_names() | VISA_TOP
    out = []
    for s in sorted(src, key=lambda r: r["時点"]):
        sheets = pd.read_excel(os.path.join(SRC, s["時点"], s["ファイル名"]), sheet_name=None, header=None)
        for kind, title in TABLES.items():
            d, r0 = find_table(sheets, title)
            if d is None:
                sys.exit(f"{s['時点']}：「{title}」の表が見つかりません")
            for name, _, vals in read_trend(d, r0):
                if kind == "在留資格" and name not in visas:
                    continue  # 号などの細かい区分
                if kind == "都道府県" and name not in PREFS + ["総数", "未定・不詳"]:
                    continue
                for w, v in vals.items():
                    out.append({"発表の時点": s["時点"], "公表日": s["公表日"], "表": kind, "名前": name, "時点": w, "人数": v,
                                "状態": "速報" if w == s["時点"] else "発表にのった前の時点の数",
                                "出どころ": s["ファイル名"], "発表のページ": s["発表のページ"]})
    df = pd.DataFrame(out)
    os.makedirs(OUT, exist_ok=True)
    df.to_csv(os.path.join(OUT, "半期速報.csv"), index=False, encoding="utf-8-sig", lineterminator="\n")

    # 確かめ：その発表の時点の数
    nat = pd.read_csv(os.path.join(DATA, "全国_国籍_在留資格.csv"))
    conf_nat = nat[nat["在留資格"] == "総数"].groupby(["時点", "国籍・地域"])["人数"].sum()
    conf_tot = nat[nat["在留資格"] == "総数"].groupby("時点")["人数"].sum()
    pn = pd.read_csv(os.path.join(DATA, "都道府県_国籍.csv"))
    conf_pref = pn[pn["国籍・地域"] == "総数"].groupby(["時点", "都道府県"])["人数"].sum()
    g = group_visas(nat[nat["在留資格"] != "総数"])
    conf_visa = g.groupby(["時点", "在留資格"])["人数"].sum()
    checks = []
    for w, part in df[df["状態"] == "速報"].groupby("発表の時点"):
        row = {"発表の時点": w, "公表日": part["公表日"].iat[0]}
        for kind in TABLES:
            t = part[part["表"] == kind].set_index("名前")["人数"]
            total = int(t.get("総数", -1))
            row[f"{kind}の数"] = len(t) - 1
            if kind == "在留資格":
                inner = int(t.get("中長期在留者", 0) + t.get("特別永住者", 0))
            else:
                inner = int(t.drop(labels=["総数"]).sum())
            row[f"{kind}：内わけの合計と総数"] = "合う" if inner == total else f"合わない（内わけ {inner:,}・総数 {total:,}）"
        row["総数"] = int(part[(part["表"] == "国籍・地域") & (part["名前"] == "総数")]["人数"].iat[0])
        if w in conf_tot.index:
            diffs = []
            if int(conf_tot[w]) != row["総数"]:
                diffs.append(f"総数（確定 {int(conf_tot[w]):,}）")
            for _, r in part.iterrows():
                if r["名前"] in ("総数", "その他", "中長期在留者"):
                    continue
                ref = {"国籍・地域": conf_nat, "都道府県": conf_pref, "在留資格": conf_visa}[r["表"]]
                key = (w, r["名前"])
                if key in ref.index and int(ref[key]) != r["人数"]:
                    diffs.append(f"{r['名前']}（速報 {r['人数']:,}・確定 {int(ref[key]):,}）")
                elif key not in ref.index and r["表"] != "在留資格":
                    diffs.append(f"{r['名前']}（確定統計にない名前）")
            row["確定統計との比べ"] = "すべて同じ" if not diffs else "ちがう所：" + "、".join(diffs)
        else:
            row["確定統計との比べ"] = "確定統計（e-Stat の表）はまだありません"
        checks.append(row)
    pd.DataFrame(checks).to_csv(os.path.join(OUT, "確かめ.csv"), index=False, encoding="utf-8-sig", lineterminator="\n")
    for c in checks:
        print(c["発表の時点"], f"総数 {c['総数']:,}", f"国籍 {c['国籍・地域の数']}・資格 {c['在留資格の数']}・都道府県 {c['都道府県の数']}",
              c["国籍・地域：内わけの合計と総数"], c["在留資格：内わけの合計と総数"], c["都道府県：内わけの合計と総数"], "／", c["確定統計との比べ"][:120])
    print(f"{len(df)} 行 → データ/半期速報/半期速報.csv")


if __name__ == "__main__":
    main()
