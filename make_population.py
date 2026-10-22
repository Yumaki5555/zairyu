# 落とした住民基本台帳人口（元データ/人口/）を、1行に1つの数の表（データ/人口/住民基本台帳人口.csv）にする
# 使い方: <pandas・xlrd・openpyxl の入った python> -I make_population.py
#
#   人口は日本人住民と外国人住民の合計（【総計】の表の「人口 計」）。各年1月1日現在
#   行：全国・都道府県・市区町村（政令市は市の行と区の行の両方。郡・東京都の「島しょ」の合計の行は入れない）
#   名前の後ろの「（再編後）」など（2024年の浜松市の区）は取る
#   列：基準日・団体コード（5けた＝全国地方公共団体コードの検査数字を除いたもの。在留外国人統計の市区町村コードと同じ）・都道府県・市区町村・種別・人口・出どころ
#   確かめ：都道府県の人口の合計が全国と合うか、市区町村（区を除く）の合計が都道府県と合うか
import csv
import glob
import os
import re
import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "人口")
OUT = os.path.join(BASE, "データ", "人口")
# 政令市（市の行のコード）。ほかの「3けためが1」のコードはその区（東京都の特別区は市区町村として扱う）
DESIGNATED = {"01100", "04100", "11100", "12100", "14100", "14130", "14150", "15100", "22100", "22130", "23100", "26100",
              "27100", "27140", "28100", "33100", "34100", "40100", "40130", "43100"}


def read_year(path):
    d = pd.read_excel(path, sheet_name=0, header=None, dtype=str)
    rows = []
    for _, r in d.iterrows():
        code, pref, name = (str(r[0]).strip(), str(r[1]).strip(), str(r[2]).strip())
        if pref == "合計":
            kind, code5, pref, name = "全国", "00000", "全国", ""
        elif re.fullmatch(r"\d{6}", code):
            code5 = code[:5]
            name = "" if name in ("nan", "-") else name
            if code5[2:] == "000":
                kind, name = "都道府県", ""
            elif re.search(r"郡$", name) or name == "島しょ":
                continue  # 郡・島しょの合計の行
            else:
                name = re.sub(r"^.+?郡(?=.)", "", re.sub(r"（[^）]*）$", "", name))  # 「八重山郡竹富町」→「竹富町」
                if code5 in DESIGNATED:
                    kind = "政令市"
                elif code5[2] == "1" and pref != "東京都":
                    kind = "区"
                else:
                    kind = "市区町村"
        else:
            continue
        pop = pd.to_numeric(str(r[5]).replace(",", ""), errors="coerce")
        if pd.isna(pop):
            continue
        rows.append({"団体コード": code5, "都道府県": pref, "市区町村": name, "種別": kind, "人口": int(pop)})
    return rows


def main():
    with open(os.path.join(BASE, "元データ", "人口_出どころ一覧.csv"), encoding="utf-8-sig", newline="") as f:
        src = list(csv.DictReader(f))
    out = []
    for s in src:
        path = os.path.join(SRC, s["年"], s["ファイル名"])
        rows = read_year(path)
        for r in rows:
            out.append({"基準日": s["基準日"], **r, "出どころ": s["ファイル名"]})
        nat = sum(r["人口"] for r in rows if r["種別"] == "全国")
        prefs = sum(r["人口"] for r in rows if r["種別"] == "都道府県")
        munis = sum(r["人口"] for r in rows if r["種別"] in ("市区町村", "政令市"))
        ok = "合う" if nat == prefs == munis else f"合わない（全国 {nat:,}・都道府県 {prefs:,}・市区町村 {munis:,}）"
        print(f"{s['基準日']} 全国 {nat:,}人 都道府県 {sum(r['種別'] == '都道府県' for r in rows)} 市区町村 {sum(r['種別'] in ('市区町村', '政令市') for r in rows)} 区 {sum(r['種別'] == '区' for r in rows)} 合計の確かめ：{ok}")
    os.makedirs(OUT, exist_ok=True)
    pd.DataFrame(out).to_csv(os.path.join(OUT, "住民基本台帳人口.csv"), index=False, encoding="utf-8-sig", lineterminator="\n")
    print(f"{len(out)} 行 → データ/人口/住民基本台帳人口.csv")


if __name__ == "__main__":
    main()
