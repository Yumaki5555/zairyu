# e-Stat の「在留外国人統計（旧登録外国人統計）」から、サイトに使う表を全部落とす（いちばん古い 1959年から）
# 使い方: python -I download_estat.py [--list]   （--list は一覧を作るだけで落とさない）
#
#   月次（2012年12月末〜。6月末と12月末）… 在留外国人統計。年齢・性別だけの表を除いて全部
#   年次（1959〜2011年）                 … 登録外国人統計。国籍・在留資格・都道府県・市区の表だけ
#                                          （年齢・職業・本籍・続柄・上陸などの表は除く）。2005年以前は PDF しかない
#   落とす先: 元データ/在留外国人統計/<YYYY-MM>/ と 元データ/登録外国人統計/<YYYY>/
#   出どころの一覧: 元データ/出どころ一覧.csv（時点・表題・e-Stat の番号・URL・公開日・ファイル名・大きさ・落とした日）
#   もう落としたファイルは落とし直さない（新しい時点が出たら、もう一度動かせばその分だけ増える）
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
OUT = os.path.join(BASE, "元データ")
UA = {"User-Agent": "Mozilla/5.0"}
LIST = "https://www.e-stat.go.jp/stat-search/files?toukei=00250012&tstat=000001018034&tclass1={c}&layout=datalist&cycle={cy}"
PAGE = ("https://www.e-stat.go.jp/stat-search/files?layout=dataset&cycle={cy}&toukei=00250012&tstat=000001018034"
        "&tclass1={c}&tclass2val=0&year={y}&month={m}&page={p}")
DL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId={id}&fileKind={k}"
MONTHLY = ("000001060399", 1)   # 在留外国人統計（月次）
ANNUAL = ("000001060436", 7)    # 登録外国人統計（年次）

# 年次の表のうち使うもの・使わないもの（表題で選ぶ）
ANNUAL_USE = re.compile(r"在留資格|国籍.*別|市・区別|特定都市別|上位１００自治体")
ANNUAL_SKIP = re.compile(r"年齢|職業|本籍|続柄|上陸|出生|登録原票|登録証明書|切替|居住地変更")


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:  # e-Stat はときどき止まるので、少し待ってやり直す
            if i == 3:
                raise
            print("  やり直し", e)
            time.sleep(5 * (i + 1))


def periods(cls, cycle):
    t = get(LIST.format(c=cls, cy=cycle)).decode("utf-8")
    return sorted(set(re.findall(r"year=(\d+)&(?:amp;)?month=(\d+)", t)))


def files_of(cls, cycle, y, m):
    out, seen = [], set()
    for p in range(1, 20):
        t = get(PAGE.format(cy=cycle, c=cls, y=y, m=m, p=p)).decode("utf-8")
        new = 0
        for it in re.findall(r"<article.*?</article>", t, re.S):
            ids = re.findall(r"stat_infid=(\d+)", it)
            if not ids or ids[0] in seen:
                continue
            seen.add(ids[0])
            new += 1
            s = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", it))).replace("\xa0", " ")
            s = re.sub(r"政府統計名解説.*", "", s)
            s = re.sub(r"^.*?公開（更新）日\s+", "", s).strip()
            pub = s[:10]
            title = re.sub(r"^(EXCEL|PDF|CSV|DB|閲覧用|正誤情報|【★新規掲載】|\s)+", "", s[10:]).strip()
            title = re.sub(r"\s+", "", title)  # e-Stat の検索用の空白（「市区 町村 別」）を取る
            kinds = sorted(set(re.findall(r"fileKind=(\d)", it)))
            out.append({"id": ids[0], "pub": pub, "title": title, "kinds": kinds})
        if new == 0:
            break
        time.sleep(0.5)
    return out


def wanted(kind, title):
    if kind == "月次":
        return "テーブルデータ" in title or "年齢" not in title
    return bool(ANNUAL_USE.search(title)) and not ANNUAL_SKIP.search(title)


def main():
    only_list = "--list" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    log_path = os.path.join(OUT, "出どころ一覧.csv")
    done = {}
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8-sig") as f:
            done = {r["statInfId"]: r for r in csv.DictReader(f)}
    rows = dict(done)
    for kind, (cls, cycle), folder in (("年次", ANNUAL, "登録外国人統計"), ("月次", MONTHLY, "在留外国人統計")):
        for y, m in periods(cls, cycle):
            when = y[:4] if kind == "年次" else f"{y[:4]}-{'06' if m == '12040606' else '12'}"
            items = [f for f in files_of(cls, cycle, y, m) if wanted(kind, f["title"])]
            print(f"{kind} {when}: 使う表 {len(items)}", flush=True)
            for f in items:
                if f["id"] in done and done[f["id"]]["ファイル"] and os.path.exists(os.path.join(OUT, done[f["id"]]["ファイル"])):
                    continue
                k = "0" if "0" in f["kinds"] else (f["kinds"][0] if f["kinds"] else "0")  # Excel があれば Excel、なければ PDF
                url = DL.format(id=f["id"], k=k)
                row = {"種類": kind, "時点": when, "表題": f["title"], "statInfId": f["id"], "公開日": f["pub"],
                       "URL": url, "ファイル": "", "大きさ": "", "落とした日": ""}
                if not only_list:
                    req = urllib.request.Request(url, headers=UA)
                    with urllib.request.urlopen(req, timeout=300) as r:
                        cd = r.headers.get("Content-Disposition", "")
                        data = r.read()
                    name = urllib.parse.unquote(re.search(r"filename\*=UTF-8''([^;]+)", cd).group(1)) if "filename*" in cd \
                        else f"{f['id']}.bin"
                    name = re.sub(r'[\\/:*?"<>|]', "_", name)
                    d = os.path.join(OUT, folder, when)
                    os.makedirs(d, exist_ok=True)
                    path = os.path.join(d, name)
                    if os.path.exists(path):  # 同じ時点に同じ名前のファイルがあるとき（テーブルデータ.xlsx など）は番号を付ける
                        path = os.path.join(d, f"{f['id']}_{name}")
                    with open(path, "wb") as fh:
                        fh.write(data)
                    row.update({"ファイル": os.path.relpath(path, OUT).replace("\\", "/"), "大きさ": len(data),
                                "落とした日": date.today().isoformat()})
                    print(f"  {row['ファイル']} {len(data):,}", flush=True)
                    time.sleep(1)
                rows[f["id"]] = row
            with open(log_path, "w", encoding="utf-8-sig", newline="") as fh:  # 1時点ごとに書く（途中で止まっても続きから）
                w = csv.DictWriter(fh, fieldnames=["種類", "時点", "表題", "statInfId", "公開日", "URL", "ファイル", "大きさ", "落とした日"])
                w.writeheader()
                for r in sorted(rows.values(), key=lambda r: (r["種類"] != "年次", r["時点"], r["表題"])):
                    w.writerow(r)
    print("一覧", log_path, len(rows), "件")


if __name__ == "__main__":
    main()
