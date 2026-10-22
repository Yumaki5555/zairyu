# 法務省（出入国在留管理庁）の報道発表「〇年〇月末現在における在留外国人数について」（半期速報）の資料を落とす
# 使い方: python -I download_press.py [--list]   （--list は一覧を作るだけで落とさない）
#
#   探す所: https://www.moj.go.jp/isa/publications/press/press<年>.html（令和3年＝2021年から。それより前の発表は今のサイトにない）
#   落とすもの: 発表のページに付いている Excel と PDF
#   落とす先: 元データ/半期速報/<時点>/ 。出どころの一覧: 元データ/半期速報_出どころ一覧.csv
#     （時点・表題・発表のページの URL・公表日・ファイル名・資料の URL・大きさ・落とした日）
#   もう落としたファイルは落とし直さない。同じ時点の発表が2つ見つかったら止める（重ねて入れない）
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
OUT = os.path.join(BASE, "元データ", "半期速報")
LIST_CSV = os.path.join(BASE, "元データ", "半期速報_出どころ一覧.csv")
UA = {"User-Agent": "Mozilla/5.0"}
YEAR_PAGE = "https://www.moj.go.jp/isa/publications/press/press{y}.html"
FIRST = 2021
ERA = {"令和": 2018, "平成": 1988}


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:
            if i == 3:
                raise
            print("  やり直し", e)
            time.sleep(5 * (i + 1))


def jp_year(era, n):
    return ERA[era] + (1 if n in ("元", "") else int(n.translate(str.maketrans("０１２３４５６７８９", "0123456789"))))


def when_of(title):
    """表題から時点（例：令和７年６月末 → 2025-06、令和６年末 → 2024-12）"""
    m = re.search(r"(令和|平成)\s*([元０-９0-9]+)\s*年\s*(?:([０-９0-9]+)\s*月)?\s*末", title)
    if not m:
        return None
    y = jp_year(m.group(1), m.group(2))
    mo = int(m.group(3).translate(str.maketrans("０１２３４５６７８９", "0123456789"))) if m.group(3) else 12
    return f"{y}-{mo:02d}"


def press_pages():
    out = []
    for y in range(FIRST, date.today().year + 1):
        try:
            t = get(YEAR_PAGE.format(y=y)).decode("utf-8", "replace")
        except Exception as e:
            print(f"{y}年の一覧：開けません（{e}）")
            continue
        for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', t, re.S):
            title = re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", m.group(2))))
            if "在留外国人数について" in title:
                dates = re.findall(r"(\d{4})年(\d{1,2})月(\d{1,2})日", re.sub(r"<[^>]+>", "", t[max(0, m.start() - 800):m.start()]))
                listed = f"{dates[-1][0]}-{int(dates[-1][1]):02d}-{int(dates[-1][2]):02d}" if dates else ""
                out.append((when_of(title), title, urljoin(YEAR_PAGE.format(y=y), m.group(1)), listed))
        time.sleep(0.5)
    return out


def attachments(page_url):
    t = get(page_url).decode("utf-8", "replace")
    files = sorted(set(urljoin(page_url, h) for h in re.findall(r'href="([^"]+\.(?:xlsx|xls|pdf))"', t)))
    text = html.unescape(re.sub(r"<[^>]+>", " ", t))
    m = re.search(r"(令和|平成)\s*([元０-９0-9]+)\s*年\s*([０-９0-9]+)\s*月\s*([０-９0-9]+)\s*日", text)
    pub = ""
    if m:
        tr = str.maketrans("０１２３４５６７８９", "0123456789")
        pub = f"{jp_year(m.group(1), m.group(2))}-{int(m.group(3).translate(tr)):02d}-{int(m.group(4).translate(tr)):02d}"
    return files, pub


def main():
    only_list = "--list" in sys.argv
    old = {}
    if os.path.exists(LIST_CSV):
        with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                old[(r["時点"], r["資料のURL"])] = r
    pages = press_pages()
    seen = {}
    for when, title, url, _ in pages:
        if when in seen and seen[when] != url:
            sys.exit(f"同じ時点 {when} の発表が2つあります：{seen[when]} と {url}")
        seen[when] = url
    rows = []
    for when, title, url, listed in sorted(set(pages)):
        files, pub = attachments(url)
        pub = listed or pub  # 公表日：年ごとの一覧の日付（なければ発表のページの中の日付）
        folder = os.path.join(OUT, when)
        for furl in files:
            fn = os.path.basename(furl)
            path = os.path.join(folder, fn)
            prev = old.get((when, furl), {})
            if not only_list and not os.path.exists(path):
                os.makedirs(folder, exist_ok=True)
                with open(path, "wb") as f:
                    f.write(get(furl))
                print(f"{when}：落としました {fn}")
                time.sleep(1)
            size = os.path.getsize(path) if os.path.exists(path) else ""
            rows.append({"時点": when, "表題": title, "発表のページ": url, "公表日": pub, "ファイル名": fn, "資料のURL": furl,
                         "大きさ": size, "落とした日": prev.get("落とした日") or (date.today().isoformat() if size else "")})
    with open(LIST_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"発表 {len(seen)} 回分、資料 {len(rows)} → {os.path.relpath(LIST_CSV, BASE)}")


if __name__ == "__main__":
    main()
