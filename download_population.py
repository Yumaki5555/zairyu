# 外国人の割合の分母にする人口：総務省「住民基本台帳に基づく人口、人口動態及び世帯数調査」の
# 「【総計】市区町村別人口、人口動態及び世帯数」（日本人住民と外国人住民の合計。各年1月1日現在）を e-Stat から落とす
# 使い方: python -I download_population.py [--list]   （--list は一覧を作るだけで落とさない）
#
#   落とす年: 2014年〜（外国人住民が入り、基準日が1月1日になった年から。2013年は3月31日現在なので使わない）
#   落とす先: 元データ/人口/<年>/ 。出どころの一覧: 元データ/人口_出どころ一覧.csv（年・基準日・表題・e-Stat の番号・URL・公開日・ファイル名・大きさ・落とした日）
#   もう落としたファイルは落とし直さない（新しい年が出たら、もう一度動かせばその分だけ増える）
import csv
import html
import os
import re
import sys
import time
import urllib.request
from datetime import date

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "元データ", "人口")
LIST_CSV = os.path.join(BASE, "元データ", "人口_出どころ一覧.csv")
UA = {"User-Agent": "Mozilla/5.0"}
TOUKEI, TSTAT, TCLASS = "00200241", "000001039591", "000001039601"  # 住民基本台帳に基づく人口…調査 / 年次
PAGE = ("https://www.e-stat.go.jp/stat-search/files?page=1&layout=dataset&cycle=7&toukei={t}&tstat={s}&tclass1={c}"
        "&tclass2val=0&year={y}0&month=0")
DL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId={id}&fileKind={k}"
TITLE = "【総計】市区町村別人口、人口動態及び世帯数"
FIRST = 2014


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:  # e-Stat はときどき止まるので、少し待ってやり直す
            if i == 3:
                raise
            print("  やり直し", e)
            time.sleep(5 * (i + 1))


def find(year):
    """その年の「【総計】市区町村別人口…」の (e-Stat の番号, 公開日, 表題)。ないときは None"""
    t = get(PAGE.format(t=TOUKEI, s=TSTAT, c=TCLASS, y=year)).decode("utf-8")
    for it in re.findall(r"<article.*?</article>", t, re.S):
        ids = re.findall(r"stat_infid=(\d+)", it)
        s = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", it))).replace("\xa0", " ")
        s = re.sub(r"政府統計名解説.*", "", s)
        if ids and TITLE in s.replace(" ", ""):
            pub = re.search(r"公開（更新）日\s+(\d{4}-\d{2}-\d{2})", s)
            return ids[0], pub.group(1) if pub else "", TITLE
    return None


def main():
    only_list = "--list" in sys.argv
    old = {}
    if os.path.exists(LIST_CSV):
        with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
            old = {r["年"]: r for r in csv.DictReader(f)}
    rows = []
    for year in range(FIRST, date.today().year + 1):
        hit = find(year)
        if not hit:
            print(f"{year}年：表がまだありません")
            continue
        sid, pub, title = hit
        url = DL.format(id=sid, k=0)
        folder = os.path.join(OUT, str(year))
        prev = old.get(str(year), {})
        fn = prev.get("ファイル名", "")
        if not only_list and not (fn and os.path.exists(os.path.join(folder, fn))):
            os.makedirs(folder, exist_ok=True)
            req = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180)
            cd = req.headers.get("Content-Disposition", "")
            m = re.search(r"filename\*=UTF-8''([^;]+)", cd) or re.search(r'filename="?([^";]+)', cd)
            fn = urllib.request.unquote(m.group(1)) if m else f"{sid}.xlsx"
            fn = os.path.basename(fn)
            with open(os.path.join(folder, fn), "wb") as f:
                f.write(req.read())
            print(f"{year}年：落としました {fn}")
            time.sleep(1)
        size = os.path.getsize(os.path.join(folder, fn)) if fn and os.path.exists(os.path.join(folder, fn)) else ""
        rows.append({"年": year, "基準日": f"{year}-01-01", "表題": title, "e-Statの番号": sid, "URL": url, "公開日": pub,
                     "ファイル名": fn, "大きさ": size, "落とした日": prev.get("落とした日") or (date.today().isoformat() if size else "")})
    os.makedirs(os.path.dirname(LIST_CSV), exist_ok=True)
    with open(LIST_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"一覧 {len(rows)}年分 → {os.path.relpath(LIST_CSV, BASE)}")


if __name__ == "__main__":
    main()
