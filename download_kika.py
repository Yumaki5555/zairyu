# 法務省民事局「帰化許可申請者数等の推移」のページと、付いている PDF を落とす
# 使い方: python -I download_kika.py
#
#   ページ: https://www.moj.go.jp/MINJI/toukei_t_minj03.html
#     PDF「帰化許可申請者数、帰化許可者数及び帰化不許可者数の推移」（昭和27年から、年ごと）
#     PDF「国籍別帰化許可者数」（最近の3年の上位10か国）
#     ページの中の表「過去１０年間の国籍取得者数の推移」「過去１０年間の国籍離脱者数の推移」
#   落とす先: 元データ/帰化/ （ページは「ページ_<落とした日>.html」）
#   出どころの一覧: 元データ/帰化_出どころ一覧.csv（表題・ページの URL・ファイル名・資料の URL・大きさ・落とした日）
#   PDF は毎年、新しい番号の PDF に差しかわる。もう落とした番号の PDF は落とし直さない（前の年の PDF も残る）
#   前の年の「国籍別帰化許可者数」の PDF（2019〜2022年の上位10がのっている版）は、今のページにはもうないので、
#   インターネット・アーカイブ（web.archive.org）に保存された同じ PDF を落とす（ARCHIVED。出どころ一覧の「保存版のURL」）
import csv
import html
import os
import re
import sys
import time
import urllib.request
from datetime import date
from urllib.parse import urljoin

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "元データ", "帰化")
LIST_CSV = os.path.join(BASE, "元データ", "帰化_出どころ一覧.csv")
PAGE = "https://www.moj.go.jp/MINJI/toukei_t_minj03.html"
UA = {"User-Agent": "Mozilla/5.0"}
# 前の年の「国籍別帰化許可者数」の PDF：(法務省の資料の番号, インターネット・アーカイブの保存の日時, のっている年)
ARCHIVED = [("001343141", "20210316160356", "2019〜2020年"), ("001392230", "20230325105658", "2020〜2022年"),
            ("001414947", "20240510234210", "2021〜2023年"), ("001439500", "20250714061640", "2022〜2024年")]


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:
            if i == 3:
                raise
            print("  やり直し", e)
            time.sleep(5 * (i + 1))


def main():
    old = {}
    if os.path.exists(LIST_CSV):
        with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
            old = {r["資料のURL"]: r for r in csv.DictReader(f)}
    os.makedirs(OUT, exist_ok=True)
    today = date.today().isoformat()
    raw = get(PAGE)
    page_file = f"ページ_{today}.html"
    with open(os.path.join(OUT, page_file), "wb") as f:
        f.write(raw)
    t = raw.decode("utf-8", "replace")
    rows = list(old.values())
    rows = [r for r in rows if r["資料のURL"] != PAGE + "#" + page_file]
    rows.append({"表題": "帰化許可申請者数等の推移（ページ）", "ページのURL": PAGE, "ファイル名": page_file, "資料のURL": PAGE + "#" + page_file,
                 "大きさ": len(raw), "落とした日": today})
    found = 0
    for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', t, re.S):
        url = urljoin(PAGE, m.group(1))
        title = re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))).replace("【ＰＤＦ】", "")
        found += 1
        if url in old:
            continue
        fn = os.path.basename(url)
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(get(url))
        print(f"落としました {fn}（{title}）")
        rows.append({"表題": title, "ページのURL": PAGE, "ファイル名": fn, "資料のURL": url, "大きさ": os.path.getsize(os.path.join(OUT, fn)), "落とした日": today})
        time.sleep(1)
    if found < 2:
        sys.exit(f"ページの PDF が {found} 個しか見つかりません（ページの作りが変わったかもしれません）")
    for num, ts, years in ARCHIVED:
        url = f"https://www.moj.go.jp/content/{num}.pdf"
        if url in old:
            continue
        saved = f"https://web.archive.org/web/{ts}id_/{url}"
        fn = f"{num}.pdf"
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(get(saved))
        print(f"落としました {fn}（保存版、{years}）")
        rows.append({"表題": f"国籍別帰化許可者数（{years}。インターネット・アーカイブの保存版）", "ページのURL": PAGE, "ファイル名": fn, "資料のURL": url,
                     "大きさ": os.path.getsize(os.path.join(OUT, fn)), "落とした日": today, "保存版のURL": saved})
        time.sleep(1)
    with open(LIST_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(dict.fromkeys(k for r in rows for k in r)), restval="")
        w.writeheader()
        w.writerows(rows)
    print(f"資料 {len(rows)} → {os.path.relpath(LIST_CSV, BASE)}")


if __name__ == "__main__":
    main()
