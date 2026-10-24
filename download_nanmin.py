# 法務省（出入国在留管理庁）の報道発表「令和〇年における難民認定者数等について」の資料を落とす
# 使い方: python -I download_nanmin.py [--list]   （--list は一覧を作るだけで落とさない）
#
#   探す所: https://www.moj.go.jp/isa/publications/press/press<年>.html（2021年の一覧から。2021年3月に出た「令和2年における…」がいちばん古い）
#   落とすもの: 発表のページに付いている PDF（本文・別表、「我が国における難民保護の状況等」（1978年からの毎年の数）など）
#   落とす先: 元データ/難民/<年>/ （年は数の年。令和７年における… → 2025）
#   出どころの一覧: 元データ/難民_出どころ一覧.csv
#     （年・表題・発表のページ・公表日・資料の名前・ファイル名・資料の URL・大きさ・落とした日）
#   もう落としたファイルは落とし直さない。同じ年の発表が2つ見つかったら止める（重ねて入れない）
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
OUT = os.path.join(BASE, "元データ", "難民")
LIST_CSV = os.path.join(BASE, "元データ", "難民_出どころ一覧.csv")
UA = {"User-Agent": "Mozilla/5.0"}
YEAR_PAGE = "https://www.moj.go.jp/isa/publications/press/press{y}.html"
FIRST = 2021
ERA = {"令和": 2018, "平成": 1988}
Z2H = str.maketrans("０１２３４５６７８９", "0123456789")


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:
            if i == 3:
                raise
            print("  やり直し", e)
            time.sleep(5 * (i + 1))


def text(s):
    return re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", s)))


def year_of(title):
    """表題から数の年（例：令和７年における難民認定者数等について → 2025）"""
    m = re.search(r"(令和|平成)\s*([元０-９0-9]+)\s*年における", title)
    if not m:
        return None
    n = m.group(2).translate(Z2H)
    return ERA[m.group(1)] + (1 if n == "元" else int(n))


def press_pages():
    out = []
    for y in range(FIRST, date.today().year + 1):
        try:
            t = get(YEAR_PAGE.format(y=y)).decode("utf-8", "replace")
        except Exception as e:
            print(f"{y}年の一覧：開けません（{e}）")
            continue
        for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', t, re.S):
            title = text(m.group(2))
            if re.search(r"年における難民認定者数等について", title):
                title = re.sub(r"^報道発表資料「(.*)」$", r"\1", title)
                dates = re.findall(r"(\d{4})年(\d{1,2})月(\d{1,2})日", re.sub(r"<[^>]+>", "", t[max(0, m.start() - 800):m.start()]))
                listed = f"{dates[-1][0]}-{int(dates[-1][1]):02d}-{int(dates[-1][2]):02d}" if dates else ""
                out.append((year_of(title), title, urljoin(YEAR_PAGE.format(y=y), m.group(1)), listed))
        time.sleep(0.5)
    return out


def attachments(page_url):
    t = get(page_url).decode("utf-8", "replace")
    found = {}
    for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', t, re.S):
        found.setdefault(urljoin(page_url, m.group(1)), re.sub(r"[（(]PDF[:：][^）)]*[）)]$", "", text(m.group(2))))
    return sorted(found.items())


def main():
    only_list = "--list" in sys.argv
    old = {}
    if os.path.exists(LIST_CSV):
        with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                old[(r["年"], r["資料のURL"])] = r
    pages = press_pages()
    seen = {}
    for y, title, url, _ in pages:
        if y is None:
            sys.exit(f"表題から年が読めません：{title}")
        if y in seen and seen[y] != url:
            sys.exit(f"同じ年 {y} の発表が2つあります：{seen[y]} と {url}")
        seen[y] = url
    rows = []
    for y, title, url, listed in sorted(set(pages)):
        folder = os.path.join(OUT, str(y))
        for furl, name in attachments(url):
            fn = os.path.basename(furl)
            path = os.path.join(folder, fn)
            prev = old.get((str(y), furl), {})
            if not only_list and not os.path.exists(path):
                os.makedirs(folder, exist_ok=True)
                with open(path, "wb") as f:
                    f.write(get(furl))
                print(f"{y}年：落としました {fn}（{name}）")
                time.sleep(1)
            size = os.path.getsize(path) if os.path.exists(path) else ""
            rows.append({"年": y, "表題": title, "発表のページ": url, "公表日": listed, "資料の名前": name, "ファイル名": fn, "資料のURL": furl,
                         "大きさ": size, "落とした日": prev.get("落とした日") or (date.today().isoformat() if size else "")})
    with open(LIST_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"発表 {len(seen)} 回分、資料 {len(rows)} → {os.path.relpath(LIST_CSV, BASE)}")


if __name__ == "__main__":
    main()
