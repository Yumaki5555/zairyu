# 国土地理院「地球地図日本」（第2.1版 行政界、2015年1月1日時点）から、サイトの地図の形（site_assets/map/*.json）を作る
# 使い方: python -I make_map.py
#   元のデータ: 元データ/地図/gm-jpn-bnd_u_2_1/polbnda_jpn.shp（市区町村の面。政令市は市で1つ）
#     https://www.gsi.go.jp/kankyochiri/gm_jpn.html から（国土地理院コンテンツ利用規約）
#   作るもの
#     japan.json         都道府県の形（市区町村を都道府県ごとにまとめたもの）。沖縄県は左上の枠の中に移し、1.3倍にする
#     pref-<ローマ字>.json  都道府県の中の市区町村の形（市区町村のコード、政令市は名前）。東京都は伊豆諸島・小笠原を入れない
#   形の軽くし方: 点を画面の格子（地図の幅を約1000・600に分けたます目）に寄せる。となり合う市区町村は同じ点を持つので、
#   寄せたあとも境目がずれない。都道府県の形は、同じ都道府県の中で向きの逆な辺どうしを消して作る
import json
import math
import os
import struct
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "地図", "gm-jpn-bnd_u_2_1")
OUT = os.path.join(BASE, "site_assets", "map")
PREFS = ("北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 "
         "山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 "
         "香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県").split()
ROMA = ("hokkaido aomori iwate miyagi akita yamagata fukushima ibaraki tochigi gunma saitama chiba tokyo kanagawa niigata toyama "
        "ishikawa fukui yamanashi nagano gifu shizuoka aichi mie shiga kyoto osaka hyogo nara wakayama tottori shimane okayama "
        "hiroshima yamaguchi tokushima kagawa ehime kochi fukuoka saga nagasaki kumamoto oita miyazaki kagoshima okinawa").split()
# 地図のあとで市になってコードが変わった町村（地図のコード → 今のコード）
NEW_CODE = {"03305": "03216", "04423": "04216", "11445": "11246", "12402": "12239", "17344": "17212", "23304": "23238", "40305": "40231",
            "06024": "06204"}  # 06024 は飛島の近くの御積島（酒田市）。地図のデータでは名前とコードがくずれている
# 政令市（地図では市で1つ）→ サイトの政令市のページの名前
CITY = {"01100": "札幌市", "04100": "仙台市", "11100": "さいたま市", "12100": "千葉市", "14100": "横浜市", "14130": "川崎市", "14150": "相模原市",
        "15100": "新潟市", "22100": "静岡市", "22130": "浜松市", "23100": "名古屋市", "26100": "京都市", "27100": "大阪市", "27140": "堺市",
        "28100": "神戸市", "33100": "岡山市", "34100": "広島市", "40100": "北九州市", "40130": "福岡市", "43201": "熊本市"}
TERRITORY = {"01695", "01696", "01697", "01698", "01699", "01700"}  # 北方領土の6村（統計はない）


def read_dbf(path):
    f = open(path, "rb").read()
    n, hl, rl = struct.unpack("<IHH", f[4:12])
    fields, p = [], 32
    while f[p] != 0x0D:
        fields.append((f[p:p + 11].split(b"\0")[0].decode(), f[p + 16]))
        p += 32
    rows = []
    for i in range(n):
        r, o, rec = f[hl + i * rl: hl + (i + 1) * rl], 1, {}
        for name, ln in fields:
            rec[name] = r[o:o + ln].decode("utf-8", "replace").strip()
            o += ln
        rows.append(rec)
    return rows


def read_polygons(path):
    """面（シェープの型5）の、レコードごとの輪の一覧 [[(経度, 緯度), …], …]"""
    f = open(path, "rb").read()
    p, out = 100, []
    while p < len(f):
        _, ln = struct.unpack(">II", f[p:p + 8])
        rec = f[p + 8: p + 8 + ln * 2]
        p += 8 + ln * 2
        if struct.unpack("<i", rec[:4])[0] != 5:
            out.append([])
            continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44:44 + 4 * nparts])) + [npts]
        xy = struct.unpack(f"<{2 * npts}d", rec[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts])
        pts = list(zip(xy[0::2], xy[1::2]))
        out.append([pts[parts[k]:parts[k + 1]] for k in range(nparts)])
    return out


def quantize(ring, proj):
    """輪の点を画面の格子に寄せ、続けて同じ点・行って戻るだけの点を除く"""
    q = []
    for lon, lat in ring:
        pt = proj(lon, lat)
        if not q or q[-1] != pt:
            q.append(pt)
    changed = True
    while changed and len(q) > 3:  # 「a→b→a」の行って戻るだけの所
        changed = False
        k = 1
        while k < len(q) - 1:
            if q[k - 1] == q[k + 1]:
                del q[k:k + 2]
                changed = True
            else:
                k += 1
    if len(q) > 1 and q[0] == q[-1]:
        q.pop()
    return q if len(q) >= 3 else None


def dissolve(rings):
    """同じ都道府県の市区町村の輪から、内側の境目（向きの逆な辺どうし）を消し、外の輪だけにする"""
    edges = Counter()
    for r in rings:
        for a, b in zip(r, r[1:] + r[:1]):
            edges[(a, b)] += 1
    for (a, b) in list(edges):
        if edges[(a, b)] and edges.get((b, a)):
            k = min(edges[(a, b)], edges[(b, a)])
            edges[(a, b)] -= k
            edges[(b, a)] -= k
    nxt = defaultdict(list)
    for (a, b), c in edges.items():
        for _ in range(c):
            nxt[a].append(b)
    out = []
    while nxt:
        start = next(iter(nxt))
        ring, cur = [start], start
        while True:
            b = nxt[cur].pop()
            if not nxt[cur]:
                del nxt[cur]
            if b == start:
                break
            ring.append(b)
            cur = b
            if cur not in nxt:
                break
        if len(ring) >= 3:
            out.append(ring)
    return out


def path(rings):
    return "".join("M" + "L".join(f"{x},{y}" for x, y in r) + "Z" for r in rings)


def main():
    rows = read_dbf(os.path.join(SRC, "polbnda_jpn.dbf"))
    polys = read_polygons(os.path.join(SRC, "polbnda_jpn.shp"))
    votes = defaultdict(Counter)  # 都道府県の名前（ローマ字）→ コードの頭2けたの都道府県（多いほう。コードのない区画に使う）
    for r in rows:
        if r["adm_code"][:2].isdigit():
            votes[r["nam"]][PREFS[int(r["adm_code"][:2]) - 1]] += 1
    name_pref = {n: c.most_common(1)[0][0] for n, c in votes.items()}
    recs = []  # (都道府県, 地図の区画の名前 or コード, 輪の一覧)
    for r, rings in zip(rows, polys):
        code = r["adm_code"]
        pref = PREFS[int(code[:2]) - 1] if code[:2].isdigit() else name_pref.get(r["nam"])
        if not pref or not rings:
            continue
        if code in CITY:
            area = "city:" + CITY[code]
        elif code in TERRITORY:
            area = "none:北方領土（統計はありません）"
        elif code.isdigit():
            area = NEW_CODE.get(code, code)
        else:
            area = "none:"
        recs.append((pref, area, rings))
    os.makedirs(OUT, exist_ok=True)

    # 日本全体：沖縄県は左上の空いている所（左上の角が OKI_AT）へ移し、OKI_SCALE 倍にする。東京都の小笠原（北緯28度より南）は入れない
    lat0, lon0, k = 46.0, 127.5, math.cos(math.radians(36))
    W = 1000
    span = (149.0 - lon0) * k
    sc = W / span
    OKI_SCALE, OKI_AT = 1.3, (20, 100)

    def proj(lon, lat):
        return (lon - lon0) * k * sc, (lat0 - lat) * sc
    oki = [proj(lon, lat) for p, a, rings in recs if p == "沖縄県" for ring in rings for lon, lat in ring]
    ox0, oy0 = min(x for x, _ in oki), min(y for _, y in oki)

    def place(pref, lon, lat):
        x, y = proj(lon, lat)
        if pref == "沖縄県":
            x, y = OKI_AT[0] + (x - ox0) * OKI_SCALE, OKI_AT[1] + (y - oy0) * OKI_SCALE
        return round(x), round(y)
    by_pref = defaultdict(list)
    for pref, area, rings in recs:
        for ring in rings:
            if pref == "東京都" and min(lat for _, lat in ring) < 28:
                continue
            q = quantize(ring, lambda lon, lat, p=pref: place(p, lon, lat))
            if q:
                by_pref[pref].append(q)
    shapes, pts = {}, 0
    for pref, rings in by_pref.items():
        d = dissolve(rings)
        shapes[pref] = path(d)
        pts += sum(len(r) for r in d)
    allxy = [xy for rings in by_pref.values() for r in rings for xy in r]
    H = max(y for _, y in allxy) + 4
    ox = [xy for r in by_pref["沖縄県"] for xy in r]
    box = [min(x for x, _ in ox) - 8, min(y for _, y in ox) - 8, max(x for x, _ in ox) + 8, max(y for _, y in ox) + 8]
    with open(os.path.join(OUT, "japan.json"), "w", encoding="utf-8") as f:
        json.dump({"w": W, "h": H, "inset": box, "inset_key": "沖縄県", "prefs": shapes}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"japan.json 点 {pts} 大きさ {os.path.getsize(os.path.join(OUT, 'japan.json')) // 1024}KB")

    # 都道府県ごとの市区町村
    for pi, pref in enumerate(PREFS):
        mine = [(a, rings) for p, a, rings in recs if p == pref]
        keep = []
        for a, rings in mine:
            for ring in rings:
                if pref == "東京都" and min(lat for _, lat in ring) < 35.4:  # 伊豆諸島・小笠原
                    continue
                keep.append((a, ring))
        lons = [lon for _, r in keep for lon, _ in r]
        lats = [lat for _, r in keep for _, lat in r]
        kk = math.cos(math.radians((min(lats) + max(lats)) / 2))
        w0, h0 = (max(lons) - min(lons)) * kk, max(lats) - min(lats)
        s = 600 / max(w0, h0 * 1.2)
        areas = defaultdict(list)
        for a, ring in keep:
            q = quantize(ring, lambda lon, lat: (round((lon - min(lons)) * kk * s) + 4, round((max(lats) - lat) * s) + 4))
            if q:
                areas[a].append(q)
        Wp, Hp = round(w0 * s) + 8, round(h0 * s) + 8
        out = {"w": Wp, "h": Hp, "areas": {a: path(r) for a, r in areas.items()}}
        if pref == "東京都":
            out["note"] = "伊豆諸島・小笠原諸島は地図に入れていません"
        fn = os.path.join(OUT, f"pref-{ROMA[pi]}.json")
        with open(fn, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"都道府県の地図 47、合わせて {total // 1024}KB")


if __name__ == "__main__":
    main()
