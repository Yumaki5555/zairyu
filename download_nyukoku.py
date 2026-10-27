# e-Stat の「出入国管理統計」から、1年間に新しく入国した外国人の入国目的（特定活動の告示の号ごとなど）の表を落とす
# 使い方: python -I download_nyukoku.py [--list]   （--list は一覧を作るだけで落とさない）
#
#   落とす表: 「国籍・地域別 入国目的別 新規入国外国人（短期滞在・特定活動等）」（年に1回。FIRST 年から。見出しに特定活動告示の号が書かれている）
#   落とす先: 元データ/出入国管理統計/<年>/<表の番号>.xlsx（例：2025/25-00-07.xlsx）
#   出どころの一覧: 元データ/出入国管理統計_出どころ一覧.csv（年・表題・e-Stat の番号・URL・公開日・ファイル名・大きさ・落とした日）
#   もう落としたファイルは落とし直さない（新しい年が出たら、もう一度動かせばその分だけ増える）
import csv
import html
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "元データ", "出入国管理統計")
LIST_CSV = os.path.join(BASE, "元データ", "出入国管理統計_出どころ一覧.csv")
UA = {"User-Agent": "Mozilla/5.0"}
SEARCH = ("https://www.e-stat.go.jp/stat-search/files?page={p}&query=" + urllib.parse.quote("入国目的別")
          + "&layout=dataset&toukei=00250011&metadata=1&data=1")
DL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId={id}&fileKind={k}"
TITLE = "国籍・地域別入国目的別新規入国外国人（短期滞在・特定活動等）"
FIRST = 2024  # 見出しに告示の号が書かれるようになった年


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:  # e-Stat はときどき止まるので、少し待ってやり直す
            if i == 3:
                raise
            print("  やり直し", e)
            time.sleep(5 * (i + 1))


def tables():
    """e-Stat の検索から、入国目的別の表を (年, 表の番号, 表題, statInfId, 公開日, fileKind) で返す"""
    out, seen = [], set()
    for p in range(1, 20):
        t = get(SEARCH.format(p=p)).decode("utf-8")
        new = 0
        for it in re.findall(r"<article.*?</article>", t, re.S):
            ids = re.findall(r"stat_infid=(\d+)", it)
            if not ids or ids[0] in seen:
                continue
            seen.add(ids[0])
            new += 1
            s = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", it)).replace("\xa0", " "))
            m = re.search(r"調査年月 (\d{4})年 公開（更新）日 (\d{4}-\d\d-\d\d) .*? (\d\d-00-\d\d) (.+?) (?:政府統計名解説|ファイル)", s)
            if not m or re.sub(r"\s+", "", m.group(4)) != TITLE or int(m.group(1)) < FIRST:
                continue
            kinds = sorted(set(re.findall(r"fileKind=(\d)", it)))
            out.append((int(m.group(1)), m.group(3), TITLE, ids[0], m.group(2), "0" if "0" in kinds else kinds[0]))
        if new == 0:
            break
        time.sleep(0.5)
    return sorted(out)


def main():
    only_list = "--list" in sys.argv
    old = {}
    if os.path.exists(LIST_CSV):
        with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
            old = {r["statInfId"]: r for r in csv.DictReader(f)}
    rows = []
    for y, no, title, sid, pub, k in tables():
        fn = f"{y}/{no}.xlsx"
        path = os.path.join(OUT, fn)
        if not only_list and not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            data = get(DL.format(id=sid, k=k))
            if not data.startswith(b"PK"):
                sys.exit(f"{y}年の表が Excel（xlsx）ではありません：{DL.format(id=sid, k=k)}")
            with open(path, "wb") as f:
                f.write(data)
            print(f"{y}年：落としました {fn}")
            time.sleep(1)
        size = os.path.getsize(path) if os.path.exists(path) else ""
        rows.append({"年": y, "表題": f"{no} {title}", "statInfId": sid, "URL": DL.format(id=sid, k=k), "公開日": pub, "ファイル": fn,
                     "大きさ": size, "落とした日": old.get(sid, {}).get("落とした日") or (date.today().isoformat() if size else "")})
    if not rows:
        sys.exit("e-Stat で表が見つかりません（表題が変わっていないか見てください）")
    with open(LIST_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} 年分 → {os.path.relpath(LIST_CSV, BASE)}")


if __name__ == "__main__":
    main()
