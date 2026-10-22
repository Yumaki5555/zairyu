# Natural Earth（日本の見方の国境の版）から、世界地図の形（site_assets/map/world.json）を作る
# 使い方: python -I make_world_map.py
#   元のデータ: 元データ/地図/natural-earth/ne_10m_admin_0_countries_jpn.geojson
#     https://github.com/nvkelso/natural-earth-vector （v5.1.2）。Natural Earth はだれでも自由に使える地図（パブリックドメイン）。
#     「_jpn」は日本の見方の国境の版（北方領土などを日本として描いたもの）
#   作るもの: world.json  {w, h, areas: {国籍・地域の名前 または "none:地図の名前": SVG の path}}
#     国籍・地域の名前（国の表の書き方）と地図の国は、地図の日本語の名前で結ぶ（合わないものは NE_NAME で手で結ぶ）。
#     結べない所（日本・グリーンランド・香港など）は "none:" を付けて、サイトでは灰色にする
#   形：太平洋を真ん中にした（日本の世界地図でふつうの）Natural Earth 図法。南極と、人の住まない小さな所は入れない。
#   形の軽くし方：画面の幅を 1000 にしたときに 0.4 より小さいずれを省く。とても小さい国（島の国など）は、形の代わりに丸で示す
import json
import math
import os
import sys

from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import transform

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "地図", "natural-earth", "ne_10m_admin_0_countries_jpn.geojson")
OUT = os.path.join(BASE, "site_assets", "map", "world.json")
DATA = os.path.join(BASE, "データ", "国籍・地域の区分.csv")
W = 1000          # 地図の幅
CENTER = 150      # 真ん中の経度（東経150度。地図の左右の端は西経30度になる）
TOL = 0.4         # 形を軽くするときに省くずれ
DOT = 2.6         # 小さな国の丸の半径
DOT_AREA = 4      # これより小さい国（面積）は丸にする
# 国の表の名前と、地図の日本語の名前が違うもの（地図の ADM0_A3_JP で結ぶ）
NE_NAME = {"中国": "CHN", "台湾": "TWN", "韓国": "KOR", "米国": "USA", "英国": "GBR", "タイ": "THA", "モンゴル": "MNG", "マリ": "MLI",
           "中央アフリカ": "CAF", "マーシャル": "MHL", "ミクロネシア": "FSM", "ソロモン": "SLB", "セントクリストファー・ネービス": "KNA",
           "セントビンセント": "VCT", "ドミニカ": "DMA", "南スーダン共和国": "SDS", "パレスチナ": "PSX", "コソボ共和国": "KOS"}
# 地図の国にしない国籍・地域（朝鮮は国籍ではなく記載。無国籍・セルビア・モンテネグロは今の地図に形がない）
NO_SHAPE = {"朝鮮", "無国籍", "セルビア・モンテネグロ"}
# 入れない所：南極と、人の住まない小さな所（基地・岩礁など）
DROP = {"ATA", "ATF", "HMD", "SGS", "BRT", "BRI", "PGA", "SCR", "CSI", "ATC", "CLP", "IOT", "UMI", "USG", "ESB", "WSB", "PCN"}


def project(lon, lat):
    """Natural Earth 図法（Šavrič ほか 2015）。経度は東経150度を0にしてから入れる"""
    lam, phi = math.radians(lon), math.radians(lat)
    p2 = phi * phi
    p4 = p2 * p2
    x = lam * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)))
    y = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    return x, y


def shifted(lon, west):
    """経度を、東経150度が真ん中になるように。西経30度より西（アメリカ側）は右の端へ"""
    return lon + 360 - CENTER if west else lon - CENTER


def polys(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g] if isinstance(g, Polygon) and not g.is_empty else []


def split_at_seam(g):
    """左右の端（西経30度）をまたぐ形（グリーンランド）は2つに切る。(形, 西側か) の一覧"""
    seam = CENTER - 180
    out = []
    for p in polys(g):
        x0, _, x1, _ = p.bounds
        if x1 <= seam:
            out.append((p, True))
        elif x0 >= seam:
            out.append((p, False))
        else:
            out += [(q, True) for q in polys(p.intersection(Polygon([(-180, -90), (seam, -90), (seam, 90), (-180, 90)])))]
            out += [(q, False) for q in polys(p.intersection(Polygon([(seam, -90), (180, -90), (180, 90), (seam, 90)])))]
    return out


def path_of(poly):
    out = ""
    for ring in [poly.exterior] + list(poly.interiors):
        pts = list(ring.coords)[:-1]
        if len(pts) < 3:
            continue
        out += "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
    return out


def dot(x, y):
    return f"M{x - DOT:.1f},{y:.1f}a{DOT},{DOT} 0 1,0 {2 * DOT},0a{DOT},{DOT} 0 1,0 {-2 * DOT},0Z"


def main():
    with open(DATA, encoding="utf-8-sig") as f:
        names = [line.split(",")[0] for line in f.read().splitlines()[1:] if line]
    feats = json.load(open(SRC, encoding="utf-8"))["features"]
    by_code = {f["properties"]["ADM0_A3_JP"]: f for f in feats}
    by_ja = {f["properties"]["NAME_JA"]: f["properties"]["ADM0_A3_JP"] for f in feats}
    code_of = {}  # 地図の国 → 国籍・地域の名前（名前が合うものの先のもの。手で結んだものは、それを優先）
    for n in names:
        if by_ja.get(n) and n not in NO_SHAPE:
            code_of.setdefault(by_ja[n], n)
    code_of.update({c: n for n, c in NE_NAME.items()})
    # 形を経度・緯度から図法へ。y は上が北（あとで上下を返す）
    raw = {}
    for f in feats:
        p = f["properties"]
        c = p["ADM0_A3_JP"]
        if c in DROP:
            continue
        parts = []
        for poly, west in split_at_seam(shape(f["geometry"])):
            parts.append(transform(lambda xs, ys, w=west: tuple(zip(*[project(shifted(x, w), y) for x, y in zip(xs, ys)])), poly))
        lx, ly = project(shifted(p["LABEL_X"], p["LABEL_X"] < CENTER - 180), p["LABEL_Y"])
        raw[c] = (parts, (lx, ly))
    allx = [v for parts, _ in raw.values() for q in parts for v in (q.bounds[0], q.bounds[2])]
    ally = [v for parts, _ in raw.values() for q in parts for v in (q.bounds[1], q.bounds[3])]
    pad = 4
    k = (W - 2 * pad) / (max(allx) - min(allx))
    H = round((max(ally) - min(ally)) * k + 2 * pad)
    x0, y1 = min(allx), max(ally)

    def px(xs, ys):
        return tuple(pad + (x - x0) * k for x in xs), tuple(pad + (y1 - y) * k for y in ys)
    areas, small, gone = {}, [], []
    for c, (parts, (lx, ly)) in raw.items():
        nat = code_of.get(c)
        p = by_code[c]["properties"]
        key = nat or "none:" + p["NAME_JA"]
        shp = [transform(px, q).simplify(TOL, preserve_topology=True) for q in parts]
        shp = [q for q in shp if not q.is_empty]
        total = sum(q.area for q in shp)
        if nat and total < DOT_AREA:  # とても小さい国は丸で
            cx, cy = px([lx], [ly])
            areas[key] = dot(cx[0], cy[0])
            small.append(nat)
            continue
        keep = [q for q in shp if q.area >= (0.3 if nat else 1.0)]
        if nat and not keep:
            keep = [max(shp, key=lambda q: q.area)]
        d = "".join(path_of(pp) for q in keep for pp in polys(q))
        if d:
            areas[key] = d
        else:
            gone.append(p["NAME_JA"])
    # 小さな丸は、ほかの形の上に重ねて描く（あとに描いたものが上）
    order = sorted(areas, key=lambda k2: (k2 in small, k2))
    out = {"w": W, "h": H, "areas": {k2: areas[k2] for k2 in order}}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    placed = {k2 for k2 in areas if not k2.startswith("none:")}
    print(f"world.json：{W}×{H}、{os.path.getsize(OUT) / 1024:.0f}KB。国籍・地域 {len(placed)}（そのうち丸 {len(small)}）、灰色の所 {len(areas) - len(placed)}")
    print("丸で示す国：" + "、".join(small))
    print("灰色の所：" + "、".join(k2[5:] for k2 in areas if k2.startswith("none:")))
    print(f"小さくて消えた灰色の所：{len(gone)}（香港・マカオ・島の地域など）")


if __name__ == "__main__":
    main()
