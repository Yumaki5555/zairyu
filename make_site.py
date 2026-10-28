# データ/ の表から、サイト「数でみる在留外国人」のページ（site/）を作る
# 使い方: <pandas の入った python> -I make_site.py
#
#   作るページ（どのページも、ヘッダーのメニュー・いまいる所・上に戻るボタンは同じ。見せる順は「見出し→対象と時点→主要な数→グラフ・地図→ランキング→表→出典」）
#     index.html            日本全体（いちばん上にグラフの画像を作る（X投稿用。site_assets/xmaker.js）、「何を調べますか？」の入口・主要な数・移り変わり・日本の地図・国籍・在留資格・都道府県の一覧）
#     area-index.html       地域から探す（名前で探す・日本地図・地方ごと・都道府県の一覧・政令市）
#     nat-index.html        国籍から探す（地域区分ごとの色のマス目と世界地図・地域区分ごとの人数・国籍・地域の一覧。名前で探す・並べ替え）
#     visa-index.html       在留資格から探す（資格ごとの人数と割合・一覧・移り変わり）
#     about.html            このサイトについて（目的・データ・数え方の注意・出典）
#     pref-<ローマ字>.html  47都道府県（市区町村の地図つき）
#     muni-<コード>.html    市区町村と政令市の区（全国地方公共団体コードの5けた）
#     city-<名前>.html      政令市（区の合計）
#     nat-<国籍>.html       国籍・地域ごと（在留資格とその移り変わり・都道府県の地図・市区町村）
#   グラフの部品（円グラフ・棒グラフ・表の切り替え、地図、いくつかの線の折れ線、選んで見る表）は site_assets/app.js、見た目は site_assets/style.css
#     sokuho.html           法務省・半期速報（報道発表の数。確定統計とは分けて示す。数は site/data/sokuho.json）
#     fuho.html・kika.html・nanmin.html  不法残留者数・帰化の数・難民の認定と保護の数（在留外国人統計とは別の統計。数は データ/不法残留/・データ/帰化/・データ/難民/）。
#                           選んで見る部分（半期速報と同じ形のダッシュボード）は site_assets/fuho.js・kika.js・nanmin.js が site/data/fuho.json・kika.json・nanmin.json（make_dash_data.py）から作る。
#                           JavaScript が動かないときのために、いちばん新しい数のグラフと表をページに書いておく（noscript）
#     dash.html             ダッシュボード（絞り込み・地図・推移・内訳・ランキング・比較。数は make_dash_data.py が作る site/data/*.json）
#   地図の形は site_assets/map/*.json（make_map.py で国土地理院「地球地図日本」から、world.json は make_world_map.py で Natural Earth から作る）。site/assets/ に写す
#   （ページに書いた数から JavaScript でグラフを作る。JavaScript が動かなくても表は見える）。
#   数はそのまま示し、良い・悪いの言葉は使わない。数え方のちがい（2011年までは登録外国人統計）はグラフと注意書きで示す
import csv
import html
import json
import math
import os
import re
import shutil
import sys
from collections import defaultdict
from datetime import date
from urllib.parse import quote

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_tables import group_visas  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "データ")
OUT = os.path.join(BASE, "site")
SITE_NAME = "数でみる在留外国人"
REPO_URL = "https://github.com/Yumaki5555/zairyu"  # ページ・表・作り方を公開している所
LATEST, YEAR_AGO, TEN_AGO = "2025-12", "2024-12", "2015-12"
PREFS = ("北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 "
         "山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 "
         "香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県").split()
ROMA = ("hokkaido aomori iwate miyagi akita yamagata fukushima ibaraki tochigi gunma saitama chiba tokyo kanagawa niigata toyama "
        "ishikawa fukui yamanashi nagano gifu shizuoka aichi mie shiga kyoto osaka hyogo nara wakayama tottori shimane okayama "
        "hiroshima yamaguchi tokushima kagawa ehime kochi fukuoka saga nagasaki kumamoto oita miyazaki kagoshima okinawa").split()
PREF_FILE = {p: f"pref-{r}.html" for p, r in zip(PREFS, ROMA)}
HIDDEN = "（秘匿）"
HIDDEN_LABEL = "公表されていない（10人以下の市町村）"
# 地図にあって今の表にない町村（外国人のいない町村は2017年12月末から表にのらない。古い表にはコードがないので、名前とコードを手で結ぶ）
MAP_ONLY = {"02343": ("青森県", "西目屋村")}
# 国の表の名前が今の名前と違う市町村（範囲は同じ）。コードのない2021年6月末までの表を、名前で今のコードに結ぶために使う（表の名前はそのまま）。
# 合併して範囲が変わった市町村（鳩ケ谷市・前原市・岩舟町・大口市など）は、今の市の数に入れると変わるので入れない
OLD_NAME = {  # (都道府県, 国の表の名前) → 今の名前
    ("富山県", "南礪市"): "南砺市", ("富山県", "礪波市"): "砺波市", ("長崎県", "諌早市"): "諫早市", ("宮城県", "塩竃市"): "塩竈市",
    ("福岡県", "須惠町"): "須恵町", ("高知県", "梼原町"): "檮原町",  # 字の違い
    ("兵庫県", "篠山市"): "丹波篠山市",  # 2019年5月に名前が変わった
    ("千葉県", "大網白里町"): "大網白里市", ("岩手県", "滝沢村"): "滝沢市", ("宮城県", "富谷町"): "富谷市", ("福岡県", "那珂川町"): "那珂川市",  # 市になった
    ("東京都", "八丈島八丈町"): "八丈町", ("東京都", "三宅島三宅村"): "三宅村"}  # 島の名前が前に付いている（2012年12月末〜2021年6月末の表）
# 範囲は同じでコードが変わった区（浜松市天竜区：2024年1月の区の再編で 22137 → 22140）。前のコードの数も今のコードに入れる
SAME_AREA = {"22137": "22140"}


def load_regions():
    """国籍・地域 → (州, 地域区分)（データ/国籍・地域の区分.csv）。州は国の表のとおり、地域区分はその中をこのサイトで分けたもの。
    あわせて [[州, [地域区分, …]], …]（表の順）も返す"""
    out, tree = {}, {}
    with open(os.path.join(DATA, "国籍・地域の区分.csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            out[r["国籍・地域"]] = (r["州"], r["地域区分"])
            subs = tree.setdefault(r["州"], [])
            if r["地域区分"] not in subs:
                subs.append(r["地域区分"])
    return out, [[k, v] for k, v in tree.items()]


NAT_REGION, REGION_TREE = load_regions()
SUB_ORDER = [s for _, subs in REGION_TREE for s in subs]
NO_REGION = set()  # 区分の表にない国籍・地域（あれば最後に知らせる）
WORLD_WARN = []  # 世界地図に形のない国籍・地域（make_world_map.py で結べなかったもの。あれば最後に知らせる）


def region_of(n):
    if n not in NAT_REGION:
        NO_REGION.add(n)
    return NAT_REGION.get(n, ("その他", "その他"))


def select_html(labels, groups=None, values=None):
    """選ぶ欄の <option>。groups（選択肢ごとのまとまりの名前）があれば <optgroup> でまとめる（国籍・地域は地域区分の順。その中は多い順のまま）。
    value は values（なければ、もとの番号）。はじめに選ばれているのは、もとの1つ目"""
    groups = groups or [None] * len(labels)
    values = values if values is not None else [str(i) for i in range(len(labels))]

    def gkey(g):
        sub = (g or "").split("：")[-1]
        return (0, 0) if g is None else ((1, SUB_ORDER.index(sub)) if sub in SUB_ORDER else (2, 0))
    out = ""
    for g in sorted(dict.fromkeys(groups), key=gkey):
        opts = "".join(f'<option value="{esc(values[i])}"{" selected" if i == 0 else ""}>{esc(labels[i])}</option>'
                       for i in range(len(labels)) if groups[i] == g)
        out += f'<optgroup label="{esc(g)}">{opts}</optgroup>' if g else opts
    return out


# ---------------------------------------------------------------- 書き方の部品
def num(n):
    return f"{int(n):,}"


def esc(s):
    return html.escape(str(s))


def href(fname):
    return quote(fname)


def nat_file(n):
    return f"nat-{n}.html"


def when_label(w):
    y, m = w.split("-")
    return f"{y}年{int(m)}月末"


def when_x(w):
    y, m = w.split("-")
    return int(y) + (0.5 if m == "06" else 1.0) - 0.5


def jdump(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def signed(d):
    return ("+" if d > 0 else ("−" if d < 0 else "±")) + num(abs(d))


def man(n):
    return f"{n / 10000:g}万" if n >= 10000 else num(n)


def nice_step(v):
    for k in range(0, 9):
        for step in (1, 2, 2.5, 5):
            if step * 10 ** k >= v:
                return step * 10 ** k
    return v


def line_chart(series, title, area, nat=None, change_at="2012-12"):
    """移り変わりの折れ線（SVG）。数え方が変わる時点（2012年12月末）で線の色を分け、縦の線で示す。
    点を押すと数が出る・画像を保存は app.js（数は JSON にも書く）"""
    pts = [(when_x(w), v, w) for w, v in series.items()]
    if len(pts) < 2:
        return "<p class='note'>移り変わりを示せるほどの数がありません。</p>"
    data = {"area": area, "per": list(series), "vals": [int(v) for v in series.values()]}
    if nat:
        data["nat"] = nat
    W, H, L, R, T, B = 720, 300, 64, 16, 20, 36
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    top = max(p[1] for p in pts) * 1.05 or 1
    ystep = nice_step(top / 5)
    nt = int(-(-top // ystep))
    ymax = ystep * nt

    def X(x):
        return L + (x - x0) / (x1 - x0) * (W - L - R)

    def Y(y):
        return T + (1 - y / ymax) * (H - T - B)
    g = [f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="{esc(title)}">']
    for k in range(nt + 1):
        y = ystep * k
        g.append(f'<line class="grid" x1="{L}" x2="{W - R}" y1="{Y(y):.1f}" y2="{Y(y):.1f}"/>'
                 f'<text class="ax" x="{L - 6}" y="{Y(y) + 4:.1f}" text-anchor="end">{man(int(y))}</text>')
    span = x1 - x0
    step = 10 if span > 30 else (5 if span > 12 else (2 if span > 6 else 1))
    first = int(-(-x0 // step) * step)
    for yr in range(first, int(x1) + 1, step):
        g.append(f'<text class="ax" x="{X(yr):.1f}" y="{H - 12}" text-anchor="middle">{yr}</text>')
    cx = when_x(change_at)
    if x0 < cx <= x1:
        g.append(f'<line class="mark" x1="{X(cx):.1f}" x2="{X(cx):.1f}" y1="{T}" y2="{H - B}"/>'
                 f'<text class="ax mk" x="{X(cx) - 4:.1f}" y="{T - 6}" text-anchor="end">←登録外国人統計</text>'
                 f'<text class="ax mk" x="{X(cx) + 4:.1f}" y="{T - 6}">在留外国人統計→</text>')
    for cls, part in (("old", [p for p in pts if p[2] < change_at]), ("new", [p for p in pts if p[2] >= change_at])):
        if len(part) > 1:
            d = " ".join(f"{'M' if i == 0 else 'L'}{X(x):.1f},{Y(y):.1f}" for i, (x, y, _) in enumerate(part))
            g.append(f'<path class="line {cls}" d="{d}"/>')
        for x, y, w in part:
            g.append(f'<circle class="dot {cls}" cx="{X(x):.1f}" cy="{Y(y):.1f}" r="4"><title>{when_label(w)}：{num(y)}人</title></circle>')
    g.append("</svg>")
    rows = "".join(f"<tr><td>{when_label(w)}</td><td class='n'>{num(v)}</td></tr>" for w, v in series.items())
    legend = ("<p class='note'>灰色の線は登録外国人統計（2011年まで）、青い線は在留外国人統計（2012年12月末から）。数え方が違うので、つなげて見るときは注意してください。</p>"
              if any(p[2] < change_at for p in pts) else "")
    return (f'<div class="viz" data-viz="trend">' + "".join(g) + f'<script type="application/json">{jdump(data)}</script></div>' + legend +
            "<details><summary>グラフの元の数を表で見る</summary><div class='scroll'><table class='t'><tr><th>時点</th>"
            f"<th class='n'>人数</th></tr>{rows}</table></div></details>")


def breakdown(title, items, total, head, area, dim, nat=None):
    """内わけ（国籍・在留資格）のグラフ。円グラフ・棒グラフ・表をボタンで切り替え（app.js）。表はページにも書いておく
    area・dim（'nat' か 'visa'）・nat は、画像を保存するときの説明に使う"""
    items = [(n, int(v), l) for n, v, l in items if v > 0]
    if not items or not total:
        return "<p class='note'>数がありません。</p>"
    rows = "".join(f"<tr><td>{f'<a href={chr(34)}{esc(l)}{chr(34)}>{esc(n)}</a>' if l else esc(n)}</td><td class='n'>{num(v)}</td>"
                   f"<td class='n'>{v / total * 100:.1f}%</td></tr>" for n, v, l in items)
    data = {"title": title, "total": int(total), "items": [[n, v, l] for n, v, l in items], "area": area, "when": LATEST, "dim": dim}
    if nat:
        data["nat"] = nat
    return (f'<div class="viz" data-viz="breakdown"><div class="viz-body"></div>'
            f'<div class="viz-table tbl" data-limit="20"><div class="scroll"><table class="t"><thead><tr><th>{esc(head)}</th><th class="n">人数</th><th class="n">割合</th></tr></thead>'
            f'<tbody>{rows}</tbody></table></div></div><script type="application/json">{jdump(data)}</script></div>')


def option_groups(options):
    """地図の選び方のまとまり：「国籍・地域：〇〇」は地域区分ごと、「在留資格：〇〇」は1つに"""
    out = []
    for o in options:
        n = o[0]
        out.append("国籍・地域：" + region_of(n[len("国籍・地域："):])[1] if n.startswith("国籍・地域：") else ("在留資格" if n.startswith("在留資格：") else None))
    return out


def shape_map(options, links, shape, area, level, names=None, notes=None, tiles=False, label="地図に色で示す数", note="", nat=None, groups=None):
    """地図（数をオレンジの濃さで）。形は国土地理院「地球地図日本」から作ったもの（make_map.py）。世界地図は Natural Earth から（make_world_map.py）。
    options: [(名前, {場所: 数}, 公表されていない場所の一覧), …]。2つ以上なら選べる。tiles=True なら「四角で並べる」地図にも切り替えられる（日本全体）。
    area・level（'pref'＝都道府県ごと、'muni'＝市区町村ごと、'world'＝国籍・地域ごと）は、地図の下の案内と画像の説明に使う。
    groups：{場所: まとまりの名前}。地図で押しにくいときに選ぶ欄を、まとまりごとに分ける"""
    opts = []
    for n, vals, unknown in options:
        o = {"label": n, "values": {k: int(v) for k, v in vals.items()}, "total": int(sum(vals.values()))}
        if unknown:
            o["unknown"] = sorted(unknown)
        opts.append(o)
    sel = ""
    if len(opts) > 1:
        sel = (f'<div class="map-ctl"><label class="dctl"><span class="dlab">{esc(label)}</span><select>' +
               select_html([o["label"] for o in opts], option_groups(options)) + "</select></label></div>")
    nm = names or {}
    rows = "".join(f"<tr><td>{esc(nm.get(k, k))}</td><td class='n'>{num(v)}</td></tr>"
                   for k, v in sorted(opts[0]["values"].items(), key=lambda x: -x[1]))
    data = {"options": opts, "links": links, "shape": shape, "area": area, "level": level, "when": LATEST}
    if names:
        data["names"] = names
    if notes:
        data["notes"] = notes  # 数の代わりに書くこと（国の表にない町村）
    if tiles:
        data["tiles"] = True
    if nat:
        data["nat"] = nat
    if groups:
        data["groups"] = groups
    tw = ('<div class="tiles-wrap" hidden><div class="scroll"><div class="tiles" aria-label="日本の都道府県の地図（四角で並べたもの）"></div></div></div>'
          if tiles else "")
    return (f'<div class="viz" data-viz="map">{sel}<div class="map-shape"></div>{tw}<div class="map-legend"></div>'
            f'<noscript><div class="scroll"><table class="t">{rows}</table></div></noscript>'
            f'<script type="application/json">{jdump(data)}</script></div><p class="note">{note}</p>')


def japan_map(options, label="地図に色で示す数", nat=None):
    return shape_map([(n, v, None) for n, v in options], PREF_FILE, "assets/map/japan.json", "全国", "pref", tiles=True, label=label, nat=nat,
                     note="沖縄県は左上の枠の中に移し、1.3倍の大きさにしています（小笠原諸島は入れていません）。"
                          "「四角で並べる」にすると、都道府県を同じ大きさの四角でおおよその位置に並べた地図になります（小さい都道府県も押しやすくなります）。")


# 在留資格の移り変わりの線：名前が変わった・まとめられた在留資格は今の名前にそろえる
VISA_RENAME = {"投資・経営": "経営・管理", "技術": "技術・人文知識・国際業務", "人文知識・国際業務": "技術・人文知識・国際業務", "就学": "留学"}
OTHER = "その他"
VISA_LINES_NOTE = ("各年12月末の数。いちばん新しい年に多い在留資格7つと、それ以外を合わせた「その他」の線です。線の名前を押すと、その線を消したり出したりできます"
                   "（残った線に合わせて目もりが変わります）。2015年4月より前の「投資・経営」は「経営・管理」に、「技術」と「人文知識・国際業務」は"
                   "「技術・人文知識・国際業務」に、2010年7月より前の「就学」は「留学」にまとめて示しています。"
                   "点線より左（2011年まで）は登録外国人統計で、数え方が違います（短い期間の滞在の人なども入ります）。")


def visa_set(d, label, getter, top_n=7, nat=None):
    """在留資格の移り変わり（各年12月末）の線の数。getter(時点) → {在留資格: 人数}（数のない時点は None）。
    いちばん新しい年に多い在留資格 top_n 個（円グラフと同じ順・同じ色になる）と「その他」。nat：国籍・地域ひとつの線のとき、その名前"""
    per = {}
    for w in d.visa_years:
        c = getter(w)
        if c:
            m = defaultdict(int)
            for v, k in c.items():
                m[VISA_RENAME.get(v, v)] += k
            per[w] = m
    if len(per) < 2:
        return None
    years = [w for w in d.visa_years if min(per) <= w <= max(per)]
    last = per[max(per)]
    top = [v for v, k in sorted(last.items(), key=lambda x: -x[1]) if v != OTHER and k > 0][:top_n]
    series = [{"name": v, "values": [per[w].get(v, 0) if w in per and v in d.visa_exists[w] else None for w in years]} for v in top]
    rest = [sum(k for v, k in per[w].items() if v not in top) if w in per else None for w in years]
    if any(rest):
        series.append({"name": OTHER, "values": rest, "other": True})
    out = {"label": label, "whens": [w[:4] for w in years], "series": series}
    if nat:
        out["nat"] = nat
    if "2012-12" in years and years.index("2012-12") > 0:
        out["mark"] = years.index("2012-12")
    return out


def visa_lines(sets, area, label="国籍・地域を選ぶ"):
    """在留資格の移り変わりの折れ線（いくつかの線。凡例で消す・出す、表に切り替え：app.js）。sets が2つ以上なら選べる"""
    sets = [s for s in sets if s]
    if not sets:
        return "<p class='note'>移り変わりを示せるほどの数がありません。</p>"
    sel = ""
    if len(sets) > 1:
        sel = (f'<div class="lines-ctl"><label class="dctl"><span class="dlab">{esc(label)}</span><select>' +
               select_html([s["label"] for s in sets], [region_of(s["nat"])[1] if s.get("nat") else None for s in sets]) + "</select></label></div>")
    s0 = sets[0]
    head = "".join(f"<th class='n'>{esc(s['name'])}</th>" for s in s0["series"])
    rows = "".join(f"<tr><td>{w}</td>" + "".join(f"<td class='n'>{'—' if s['values'][j] is None else num(s['values'][j])}</td>" for s in s0["series"]) + "</tr>"
                   for j, w in enumerate(s0["whens"]))
    return (f'<div class="viz" data-viz="lines">{sel}<div class="lines-body"></div>'
            f'<noscript><div class="scroll"><table class="t"><tr><th>年</th>{head}</tr>{rows}</table></div></noscript>'
            f'<script type="application/json">{jdump({"sets": sets, "area": area})}</script></div><p class="note">{VISA_LINES_NOTE}</p>')


def pick_by_nat(cols, rows, head="市区町村"):
    """国籍を選んで、市区町村の多い順。rows: [(名前, リンク, 補足, [総数, 国籍1の数, …]), …]"""
    sel = select_html(cols[1:], [region_of(c)[1] for c in cols[1:]], cols[1:])
    data = {"cols": cols, "rows": [list(r) for r in rows], "head": head, "share": "その中の割合", "limit": 30}
    return (f'<div class="viz" data-viz="pick"><div class="pick-ctl"><label class="dctl"><span class="dlab">国籍・地域を選ぶ</span><select>{sel}</select></label></div>'
            f'<div class="pick-body scroll"></div><button type="button" class="pick-more" hidden></button>'
            f'<script type="application/json">{jdump(data)}</script></div>'
            '<p class="note">「その中の割合」は、その市区町村に住む外国人のうち、選んだ国籍・地域の人の割合。</p>')


def pick_by_pref(rows):
    """都道府県を選んで、市区町村の多い順（国籍のページ）。rows: [名前, リンク, 都道府県, その国籍の数, その市区町村の外国人の数]"""
    prefs = sorted({r[2] for r in rows}, key=PREFS.index)
    sel = '<option value="">全国</option>' + "".join(f"<option>{esc(p)}</option>" for p in prefs)
    data = {"rows": rows, "filter": 2, "value": 3, "base": 4, "sub": 2, "head": "市区町村", "share": "その中の割合", "limit": 30}
    return (f'<div class="viz" data-viz="pick"><div class="pick-ctl"><label class="dctl"><span class="dlab">都道府県を選ぶ</span><select>{sel}</select></label></div>'
            f'<div class="pick-body scroll"></div><button type="button" class="pick-more" hidden></button>'
            f'<script type="application/json">{jdump(data)}</script></div>'
            '<p class="note">「その中の割合」は、その市区町村に住む外国人のうち、この国籍・地域の人の割合。</p>')


# 在留資格ごとの決まった色（国籍・地域ごとの主な在留資格の積み上げ横棒。どのページ・どの国籍・地域でも同じ色）。色は style.css の .vc-〇〇。
# ここにない在留資格（技能・教育など。上位3つに入ることは少ない）は、まとめて しま模様（.vc-x）。どれも名前と数を必ず書く（色だけに頼らない）
VISA_COLOR = {"永住者": "ei", "技術・人文知識・国際業務": "gj", "留学": "ry", "技能実習": "jk", "特定技能": "tg", "特別永住者": "tb",
              "家族滞在": "kz", "定住者": "tj", "日本人の配偶者等": "nh", "特定活動": "tk"}
GRAPH_NAME = {"技術・人文知識・国際業務": "技人国"}  # グラフの中の短い名前（app.js の SHORT と同じ）。棒の下の内わけ・凡例・吹き出しは元の名前


def wbr(s):
    """長い名前（技術・人文知識・国際業務など）は「・」の所で折り返す（style.css の word-break: keep-all と組にする）"""
    return esc(s).replace("・", "・<wbr>")


def xm_link(pref="", muni="", nats=()):
    """トップページの「グラフの画像を作る」を、国籍ごとの主な在留資格・この地域・この国籍・地域を選んだ状態で開くリンク（xmaker.js の preset）"""
    q = [("xm", "cross"), ("pref", pref), ("muni", muni), ("nat", ",".join(nats))]
    return "index.html?" + "&".join(f"{k}={quote(v)}" for k, v in q if v) + "#xmaker"


def cross_table(nat_items, xd, n=8, area="全国", mark=None, xm=None):
    """国籍・地域ごとの主な在留資格：上位の国籍・地域それぞれの、多い在留資格3つの割合を積み上げ横棒で（棒の全体＝その国籍・地域の人数＝100%。
    3つ以外は色を付けず「上位3つ以外」）。区分の中の名前と割合は、入る幅のときだけ（style.css）。棒の下に人数と割合を必ず書く。元の表は「表で見る」。
    画像を保存（share.js の cross）と、国籍・地域を選んで画像を作る入口（xm：トップページの「グラフの画像を作る」へのリンク）は app.js が付ける。
    mark：目立たせる国籍・地域（その国籍・地域のページ）。在留資格の「その他」は名前のある在留資格ではないので、上位3つに入れない（画像づくりと同じ）"""
    rows, trs, used, other, bars = "", "", [], [], []
    for name, tot, link in nat_items[:n]:
        vs = sorted(((v, c) for v, c in xd.get(name, {}).items() if v != "その他" and c), key=lambda x: -x[1])[:3]
        bars.append({"name": name, "total": tot, "segs": [{"name": v, "v": c} for v, c in vs]})
        segs, items, aria = "", "", []
        for v, c in vs:
            k, short, p = VISA_COLOR.get(v, "x"), GRAPH_NAME.get(v, v), c / tot * 100
            used += [k] if k not in used else []
            other += [v] if k == "x" and v not in other else []
            segs += (f'<span class="xs vc-{k} nl{min(len(short), 8)}" style="width:{p:.3f}%" title="{esc(name)}：{esc(v)} {num(c)}人（{p:.0f}%）">'
                     f'<span class="xl"><span class="xn">{esc(short)}</span> {p:.0f}%</span></span>')
            items += f'<li><span class="xsw vc-{k}"></span><span class="xv">{wbr(v)}</span><span class="xc">{num(c)}人（{p:.0f}%）</span></li>'
        rest = 100 - sum(c for _, c in vs) / tot * 100
        if rest >= 0.05:
            segs += f'<span class="xs xr nl6" style="width:{rest:.3f}%" title="{esc(name)}：上位3つ以外の在留資格（{rest:.0f}%）"><span class="xl">上位3つ以外 {rest:.0f}%</span></span>'
        nm = f'<a href="{esc(link)}">{esc(name)}</a>' if link else esc(name)
        rows += (f'<li class="xrow{" xme" if name == mark else ""}"><div class="xhd"><span class="xnm">{nm}</span><span class="xtot">{num(tot)}人</span></div>'
                 f'<div class="xbar" aria-hidden="true">{segs}</div><ul class="xdet">{items}</ul></li>')
        trs += f"<tr><td>{nm}</td><td class='n'>{num(tot)}</td><td>{'、'.join(f'{esc(v)} {num(c)}人（{c / tot * 100:.0f}%）' for v, c in vs)}</td></tr>"
    names = {k: v for v, k in VISA_COLOR.items()}
    legend = "".join(f'<li><span class="xsw vc-{k}"></span><span>{wbr(names[k])}{"<wbr>（グラフでは" + GRAPH_NAME[names[k]] + "）" if names[k] in GRAPH_NAME else ""}</span></li>'
                     for k in VISA_COLOR.values() if k in used)
    if other:
        legend += f'<li><span class="xsw vc-x"></span><span>そのほかの在留資格<wbr>（{wbr("・".join(other))}。しま模様）</span></li>'
    legend += '<li><span class="xsw xr"></span><span>上位3つ以外の在留資格<wbr>（色なし）</span></li>'
    data = {"bars": bars, "area": area, "when": LATEST, "mark": mark, "xm": xm}
    return (f'<div class="xwrap viz" data-viz="cross"><p class="xintro">各国籍・地域の中で、人数の多い在留資格上位3つの割合を示しています。棒の全体（100%）が、その国籍・地域の人数です。'
            f'在留資格の色は、どの国籍・地域でも同じです。</p><ul class="xlegend" aria-label="色の見方">{legend}</ul><ol class="xlist">{rows}</ol>'
            "<details><summary>表で見る</summary><div class='scroll'><table class='t'><tr><th>国籍・地域</th><th class='n'>人数</th>"
            f"<th>多い在留資格（その国籍・地域の中の割合）</th></tr>{trs}</table></div></details>"
            f'<script type="application/json">{jdump(data)}</script></div>')


CSS_VER = "33"

# どのページも同じメニュー（順番・場所・見た目をそろえる）。(鍵, ページ, 名前)。いま開いているページは色で示す
# ページの代わりに中の項目の並びがあるものは、まとめの見出し（押すと下に開く。開け閉めは app.js、見た目は style.css の .msub）
NAV_OTHER = (("kika", "kika.html", "帰化"), ("fuho", "fuho.html", "不法残留"), ("nanmin", "nanmin.html", "難民"))  # 在留外国人統計とは別の統計
# 制度や在留資格をくわしく説明するページ：(鍵, ページ, 名前, 短い説明)。トップの「もっと知る」の入口にも使う
NAV_MORE = (("tokutei", "tokutei.html", "特定活動", "どんな人が対象？人数や種類は？"), ("teiju", "teiju.html", "定住者", "どんな人が対象？「その他」の中身は？"),
            ("seido", "nanmin-seido.html", "難民申請とくらし", "申請の流れ・仕事・生活支援は？"))
NAV = (("japan", "index.html", "日本全体"), ("dash", "dash.html", "ダッシュボード"), ("area", "area-index.html", "地域から探す"),
       ("nat", "nat-index.html", "国籍から探す"), ("sokuho", "sokuho.html", "半期速報"), ("other", NAV_OTHER, "ほかの統計"),
       ("more", NAV_MORE, "もっと知る"), ("about", "about.html", "このサイトについて"))
CUR = ' aria-current="page"'


def nav_html(active):
    """ヘッダーのメニュー。「ほかの統計」「もっと知る」は見出しのボタンと、その下に開く項目（開け閉めは app.js。JavaScript が動かないときは、マウスを合わせる・選ぶと開く）。
    項目に短い説明があるもの（もっと知る）は、名前の下に説明を書く"""
    out = ""
    for k, h, t in NAV:
        if isinstance(h, tuple):
            on = any(it[0] == active for it in h)
            items = "".join(f'<a href="{it[1]}"{CUR if it[0] == active else ""}>' +
                            (f'<span class="mi"><span>{it[2]}</span><small>{it[3]}</small></span>' if len(it) > 3 else it[2]) + "</a>" for it in h)
            out += (f'<div class="msub msub-{k}{" cur" if on else ""}"><button type="button" class="msub-btn" aria-expanded="false" aria-controls="msub-{k}">{t}</button>'
                    f'<div class="msub-list" id="msub-{k}" role="group" aria-label="{t}">{items}</div></div>')
        else:
            out += f'<a href="{h}"{CUR if k == active else ""}>{t}</a>'
    return out


def page(title, crumbs, body, desc, css=(), js=(), active=None, src=None):
    """ページの外がわ（ヘッダー・メニュー・いまいる所・下の出典）。active：メニューのうち、このページが入るもの（NAV の鍵）。
    src：在留外国人統計ではない数のページ（不法残留・帰化・難民）の、下に書く出典の文"""
    foot = (f"出典：{src}。数は国の発表のまま示しています。良い・悪いの判断はしていません。" if src else
            "出典：出入国在留管理庁「在留外国人統計（旧登録外国人統計）」（政府統計の総合窓口 e-Stat）を加工して作成。地図：国土地理院「地球地図日本」・Natural Earth（世界地図）を加工して作成。\n"
            f'数は国の発表のまま示しています。良い・悪いの判断はしていません。データは{when_label(LATEST)}まで（それより新しい数は<a href="sokuho.html">半期速報</a>）。')
    nav = nav_html(active)
    fnav = "".join(f'<a href="{it[1]}">{it[2]}</a>' for k, h, t in NAV for it in (h if isinstance(h, tuple) else ((k, h, t),)))  # 下のメニューは「ほかの統計」「もっと知る」の中も並べる
    crumb = ""
    if len(crumbs) > 1:  # トップページでは出さない
        crumb = ('<nav class="crumb" aria-label="いまいる所"><ol>' +
                 "".join(f'<li><a href="{h}">{esc(t)}</a></li>' if h else f'<li aria-current="page">{esc(t)}</li>' for t, h in crumbs) + "</ol></nav>")
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}｜{esc(SITE_NAME)}</title><meta name="description" content="{esc(desc)}">
<link rel="icon" href="assets/favicon.ico?v={CSS_VER}" sizes="32x32"><link rel="icon" href="assets/favicon.svg?v={CSS_VER}" type="image/svg+xml"><link rel="apple-touch-icon" href="assets/apple-touch-icon.png?v={CSS_VER}">
<script>document.documentElement.className+=' js'</script>
<link rel="stylesheet" href="assets/style.css?v={CSS_VER}">{"".join(f'<link rel="stylesheet" href="assets/{c}?v={CSS_VER}">' for c in css)}</head><body>
<a class="skip" href="#main">本文へ移動</a>
<header class="top"><div class="in"><a class="home" href="index.html">{esc(SITE_NAME)}</a>
<button type="button" class="menu-btn" aria-expanded="false" aria-controls="site-menu"><span class="menu-ic" aria-hidden="true"></span><span class="mt">メニュー</span></button>
<nav class="menu" id="site-menu" aria-label="サイトのメニュー">{nav}</nav></div></header>
{crumb}
<main id="main">{body}</main>
<footer><p class="fname">{esc(SITE_NAME)}</p><nav aria-label="サイトのメニュー（ページの下）">{fnav}</nav>
<p>{foot}ページを作った日 {date.today():%Y年%m月%d日}。</p></footer>
<script src="assets/app.js?v={CSS_VER}" defer></script>{"".join(f'<script src="assets/{j}?v={CSS_VER}" defer></script>' for j in js)}
</body></html>
"""


NOTES = """<section class="card note" id="notes"><h2>出典・数を見るときの注意</h2><ul>
<li>出典：出入国在留管理庁「在留外国人統計（旧登録外国人統計）」（政府統計の総合窓口 e-Stat）を加工して作成。</li>
<li><b>2011年までと2012年からで数え方が違います。</b>2011年までは「外国人登録をした人」（登録外国人統計）、2012年12月末からは「中長期在留者と特別永住者」（在留外国人統計）です。</li>
<li>国籍・地域の名前は国の表のとおりです。ただし、2005年までの古い表で書き方が違うもの（「ヴェトナム」など）や名前が変わった国（「ビルマ」など）は、今の名前にそろえています。「韓国・朝鮮」は2015年6月末まで1つにまとめて数えられています。</li>
<li>在留資格の「技能実習」「特定技能」「高度専門職」は、号ごとの細かい区分をまとめて示しています。</li>
<li>使っているデータや数え方のくわしい説明は<a href="about.html">このサイトについて</a>にあります。</li>
</ul></section>"""


def pct_signed(d, before):
    return f"{'+' if d > 0 else ('−' if d < 0 else '±')}{abs(d) / before * 100:.1f}%"


def years_before(w, n):
    """2026-06 の n 年前 → 2016-06"""
    return f"{int(w[:4]) - n}{w[4:]}"


def kpis(now, s, rank_text, who="在留外国人", at=LATEST, mark=""):
    """主要な数：いまの人数・1年前から・10年前から（増減の人数と割合）。at：いまの時点、mark：時点のあとに付ける字（「（速報）」）"""
    def tile(since, when):
        b = s.get(when)
        if not b:
            return (f'<div class="kpi"><div class="lab">{since}（{when_label(when)}）から</div><div class="mid">—</div>'
                    f'<div class="lab">{since}の数はありません</div></div>')
        d = now - b
        return (f'<div class="kpi"><div class="lab">{since}（{when_label(when)}）から</div><div class="mid">{signed(d)}人</div>'
                f'<div class="lab">増減の割合 {pct_signed(d, b)}（{num(b)}人から）</div></div>')
    return (f'<div class="kpis"><div class="kpi"><div class="lab">{when_label(at)}の{esc(who)}{mark}</div><div class="big">{num(now)}人</div>'
            f'<div class="lab">{rank_text}</div></div>{tile("1年前", years_before(at, 1))}{tile("10年前", years_before(at, 10))}</div>')


def meta_line(target, extra=""):
    """ページの見出しのすぐ下：対象と集計時点"""
    return (f'<p class="meta"><span>対象：<b>{esc(target)}</b></span><span>集計時点：<b>{when_label(LATEST)}</b>（確定した統計）</span>{extra}</p>')


def jump(items, nid=""):
    """このページの内容（ページの中を移動するリンク）。items：[(id, 名前)]、nid：この目次の id（「上に戻る」のリンク先）"""
    attr = f' id="{nid}"' if nid else ""
    return (f'<nav class="jump"{attr} aria-label="このページの内容"><span class="jl">このページの内容：</span>' +
            "".join(f'<a href="#{i}">{esc(t)}</a>' for i, t in items) + "</nav>")


def related(links, title="次に見る"):
    """ほかのページへの案内。links：[(リンク, 名前, 説明)]。行き先がわかる名前にする（「くわしくはこちら」は使わない）"""
    lis = "".join(f'<li><a href="{h}"><span>{esc(t)}<span class="rs">{esc(sub)}</span></span></a></li>' for h, t, sub in links)
    return f'<section class="card related" id="next"><h2>{esc(title)}</h2><ul>{lis}</ul></section>'


def dash_link(**kw):
    """ダッシュボードの、条件を選んだ画面へのリンク"""
    return "dash.html#" + "&".join(f"{k}={quote(str(v))}" for k, v in kw.items() if v)


def tbl(head, rows, sorts=(), search="", example="", limit=20, tid="", namecol=1, groups=None):
    """長い一覧の表（名前で探す・並べ替え・もっと見る・地域区分で絞るは app.js。行は全部ページに書く）。
    head：[(見出し, 数の列か)]、rows：[(名前, [(セルの HTML, 並べ替えに使う数 or None), …], まとまり)]（まとまりは「州|地域区分」。なくてもよい）、
    sorts：[(並べ方の名前, 列, 1＝少ない順 / -1＝多い順)]、groups：絞るときの選び方 [[州, [地域区分, …]], …]"""
    th = "".join(f'<th scope="col"{" class=" + chr(34) + "n" + chr(34) if n else ""}>{esc(h)}</th>' for h, n in head)
    trs = ""
    for name, cells, *grp in rows:
        tds = ""
        for (h, v), (_, n) in zip(cells, head):
            attrs = (' class="n"' if n else "") + ("" if v is None else f' data-v="{v}"')
            tds += f"<td{attrs}>{h}</td>"
        trs += f'<tr data-name="{esc(name)}"{f" data-group={chr(34)}{esc(grp[0])}{chr(34)}" if grp else ""}>{tds}</tr>'
    attrs = f' id="{tid}"' if tid else ""
    attrs += f' data-limit="{limit}" data-namecol="{namecol}"'
    if sorts:
        attrs += f' data-sorts="{esc(json.dumps(sorts, ensure_ascii=False))}"'
    if search:
        attrs += f' data-search="{esc(search)}" data-example="{esc(example)}"'
    if groups:
        attrs += f' data-groups="{esc(json.dumps(groups, ensure_ascii=False))}"'
    return f'<div class="tbl"{attrs}><div class="scroll"><table class="t"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div></div>'


def diff_cells(now, before):
    """増減（人）と増減の割合のセル。前の数がなければ「—」（並べ替えではいちばん下）"""
    if not before:
        return [("—", ""), ("—", "")]
    d = now - before
    return [(signed(d), d), (pct_signed(d, before), f"{d / before * 100:.3f}")]


# 一覧の並べ方（列の番号は、それぞれの表の列）
def sorts_for(count, diff1, rate1, name, diff10=None):
    s = [("人数の多い順", count, -1), ("人数の少ない順", count, 1), ("1年間の増加数の多い順", diff1, -1), ("1年間の増加率の高い順", rate1, -1)]
    if diff10 is not None:
        s.append(("10年間の増加数の多い順", diff10, -1))
    s.append(("名前の順", name, 1))
    return s


ICONS = {  # 入口のしるし（線だけの簡単な絵）
    "japan": '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    "area": '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    "nat": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/>',
    "visa": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-1.4 1.8-2 3-2s2.2.6 3 2"/><path d="M14.5 10h4M14.5 13.5h4"/>',
    "play": '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
}


def icon(k):
    return (f'<span class="ei" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round">{ICONS[k]}</svg></span>')


ENTRIES = f"""<div class="entries">
<a href="#japan">{icon("japan")}<b>日本全体</b><span class="ed">全国の人数と移り変わり</span></a>
<a href="area-index.html">{icon("area")}<b>地域から探す</b><span class="ed">都道府県・市区町村</span></a>
<a href="nat-index.html">{icon("nat")}<b>国籍から探す</b><span class="ed">国籍別の人数・在留資格</span></a>
<a href="visa-index.html">{icon("visa")}<b>在留資格から探す</b><span class="ed">資格別の人数と割合</span></a>
<a class="wide" href="dash.html#when=1959-12&amp;play=1">{icon("play")}<span class="et"><b>地図で見る移り変わり</b><span class="ed">1959年から今まで、都道府県ごとの人数の変わり方を地図の色で再生します</span></span></a>
</div>"""


def more_entries():
    """トップの「何を調べますか？」の下の、制度をくわしく説明するページへの入口（メニューの「もっと知る」と同じ3つ。広い画面は横並び、狭い画面は折り返す）"""
    lis = "".join(f'<li><a href="{h}"><b>{t}</b><span>{sub}</span></a></li>' for _, h, t, sub in NAV_MORE)
    return f'<div class="morein"><h3 id="more-h">もっと知る<span>制度や在留資格のくわしい説明</span></h3><ul aria-labelledby="more-h">{lis}</ul></div>'


# ---------------------------------------------------------------- 数をまとめる
class D:
    pass


def load():
    d = D()
    nat = pd.read_csv(os.path.join(DATA, "全国_国籍_在留資格.csv"))
    tot = nat[nat["在留資格"] == "総数"]
    d.nat_series = defaultdict(dict)  # 国籍 → {時点: 人数}（全国）
    for (n, w), v in tot.groupby(["国籍・地域", "時点"])["人数"].sum().items():
        d.nat_series[n][w] = int(v)
    d.japan = {w: int(v) for w, v in tot.groupby("時点")["人数"].sum().items()}
    g = group_visas(nat[nat["在留資格"] != "総数"])
    d.nat_visa = defaultdict(dict)  # (時点, 国籍) → {在留資格: 人数}
    for (w, n, v), c in g.groupby(["時点", "国籍・地域", "在留資格"])["人数"].sum().items():
        d.nat_visa[(w, n)][v] = int(c)
    d.japan_visa = defaultdict(dict)  # 時点 → {在留資格: 人数}
    for (w, v), c in g.groupby(["時点", "在留資格"])["人数"].sum().items():
        d.japan_visa[w][v] = int(c)
    d.visa_years = sorted(w for w in d.japan_visa if w.endswith("-12"))  # 在留資格の移り変わりの線は各年12月末
    d.visa_exists = {w: {VISA_RENAME.get(v, v) for v in d.japan_visa[w]} for w in d.visa_years}  # その年にあった在留資格
    # 古い表（1959〜2005年）の総数。1964年は「その他の国籍」の表がないので入れない
    old = pd.read_csv(os.path.join(DATA, "古い表", "都道府県_在留資格.csv"), dtype={"内わけ": str})
    old = old[(old["在留資格"] == "総数") & (old["時点"] != "1964-12")]
    d.old = defaultdict(dict)  # 都道府県（"総数"＝全国）→ {時点: 人数}
    for (p, w), g2 in old.groupby(["都道府県", "時点"]):
        t = g2[g2["国籍"] == "総数"]
        d.old[p][w] = int(t["人数"].sum() if len(t) else g2["人数"].sum())
    d.japan = {**d.old["総数"], **d.japan}
    # 都道府県
    pn = pd.read_csv(os.path.join(DATA, "都道府県_国籍.csv"))
    d.pref_series = defaultdict(dict)
    for (p, w), v in pn[pn["国籍・地域"] == "総数"].groupby(["都道府県", "時点"])["人数"].sum().items():
        d.pref_series[p][w] = int(v)
    for p in PREFS:
        d.pref_series[p] = dict(sorted({**d.old[p], **d.pref_series[p]}.items()))
    d.pref_nat = defaultdict(dict)  # (時点, 都道府県) → {国籍: 人数}
    for (w, p, n), v in pn[pn["国籍・地域"] != "総数"].groupby(["時点", "都道府県", "国籍・地域"])["人数"].sum().items():
        d.pref_nat[(w, p)][n] = int(v)
    pv = group_visas(pd.read_csv(os.path.join(DATA, "都道府県_在留資格.csv")).drop(columns=["出どころ"]))
    d.pref_visa = defaultdict(dict)
    for (w, p, v), c in pv[pv["在留資格"] != "総数"].groupby(["時点", "都道府県", "在留資格"])["人数"].sum().items():
        d.pref_visa[(w, p)][v] = int(c)
    px = group_visas(pd.read_csv(os.path.join(DATA, "都道府県_国籍_在留資格", f"{LATEST}.csv")))
    d.pref_x = defaultdict(lambda: defaultdict(dict))  # 都道府県 → 国籍 → {在留資格: 人数}
    for (p, n, v), c in px[(px["在留資格"] != "総数") & (px["国籍・地域"] != "総数")].groupby(["都道府県", "国籍・地域", "在留資格"])["人数"].sum().items():
        d.pref_x[p][n][v] = int(c)
    # 市区町村
    folder = os.path.join(DATA, "市区町村_国籍")
    mn = pd.concat([pd.read_csv(os.path.join(folder, f), dtype={"市区町村コード": str}) for f in sorted(os.listdir(folder))], ignore_index=True)
    cur = mn[(mn["時点"] == LATEST) & (mn["国籍・地域"] == "総数") & (mn["都道府県"].isin(PREFS))]  # 「未定・不詳」（住む所が決まっていない人）は除く
    d.munis = {}  # コード → {名前, 都道府県, 郡, 種別}
    for _, r in cur.iterrows():
        d.munis[r["市区町村コード"]] = {"name": r["市区町村"], "pref": r["都道府県"], "gun": r["郡"] if isinstance(r["郡"], str) else "",
                                   "kind": r["種別"]}
    name2code = {}
    for _, r in mn[mn["市区町村コード"].notna()][["都道府県", "市区町村", "市区町村コード"]].drop_duplicates().iterrows():
        name2code.setdefault((r["都道府県"], r["市区町村"]), r["市区町村コード"])
    for code, m in d.munis.items():
        name2code[(m["pref"], m["name"])] = code
    for code, key in MAP_ONLY.items():
        name2code.setdefault(key, code)
    d.name2code = name2code  # (都道府県, 名前) → コード（コードのない古い時点の表を、名前でコードに結ぶ）
    d.code_name = {c: n for (p, n), c in name2code.items()}  # コード → 名前（古い時点の名前も）
    tots = mn[mn["国籍・地域"] == "総数"].copy()
    for (p, old), new in OLD_NAME.items():  # 前の名前でも今のコードに結ぶ。同じ時点に両方の名前があると二重になるので止める
        both = set(tots[(tots["都道府県"] == p) & (tots["市区町村"] == old)]["時点"]) & set(tots[(tots["都道府県"] == p) & (tots["市区町村"] == new)]["時点"])
        if both:
            sys.exit(f"{p}の「{old}」と「{new}」が同じ時点（{sorted(both)}）の表にあります。足すと二重になります")
        name2code[(p, old)] = name2code[(p, new)]

    def key_of(c, p, n):  # 表の1行 → 市区町村の鍵（今のコード）
        return SAME_AREA.get(c, c) if isinstance(c, str) else name2code.get((p, n))
    d.key_of = key_of
    tots["key"] = [key_of(c, p, n) for c, p, n in zip(tots["市区町村コード"], tots["都道府県"], tots["市区町村"])]
    d.muni_series = defaultdict(dict)
    d.city_total_rows = defaultdict(dict)  # (都道府県, 政令市) → {時点: 人数}（古い時点の「合計の行」）
    for (key, kind, p, name, w), v in tots.groupby(["key", "種別", "都道府県", "市区町村", "時点"], dropna=False)["人数"].sum().items():
        if kind == "合計の行":
            d.city_total_rows[(p, name)][w] = int(v)
        elif isinstance(key, str):
            d.muni_series[key][w] = int(v)
    d.muni_nat = defaultdict(dict)  # (時点, コード) → {国籍: 人数}
    sub = mn[(mn["時点"].isin([LATEST, YEAR_AGO])) & (mn["国籍・地域"] != "総数")]
    sub = sub.assign(key=[key_of(c, p, n) for c, p, n in zip(sub["市区町村コード"], sub["都道府県"], sub["市区町村"])])
    for (w, k, n), v in sub.groupby(["時点", "key", "国籍・地域"])["人数"].sum().items():
        d.muni_nat[(w, k)][n] = int(v)
    mv = group_visas(pd.read_csv(os.path.join(DATA, "市区町村_在留資格", f"{LATEST}.csv"), dtype={"市区町村コード": str}).drop(columns=["出どころ"]))
    d.muni_visa = defaultdict(dict)
    for (k, v), c in mv[mv["在留資格"] != "総数"].groupby(["市区町村コード", "在留資格"])["人数"].sum().items():
        d.muni_visa[k][v] = int(c)
    mx = group_visas(pd.read_csv(os.path.join(DATA, "市区町村_国籍_在留資格", f"{LATEST}.csv"), dtype={"市区町村コード": str}))
    d.muni_x = defaultdict(lambda: defaultdict(dict))
    for (k, n, v), c in mx[(mx["在留資格"] != "総数") & (mx["国籍・地域"] != "総数")].groupby(["市区町村コード", "国籍・地域", "在留資格"])["人数"].sum().items():
        d.muni_x[k][n][v] = int(c)
    # 政令市（区の合計）
    d.cities = defaultdict(list)  # (都道府県, 政令市) → [区のコード]
    for code, m in d.munis.items():
        if m["kind"] == "区":
            mt = re.match(r"(.+?市)(.+区)$", m["name"])
            if mt:
                d.cities[(m["pref"], mt.group(1))].append(code)
    # 政令市を足し合わせるときのコード：今の区・前にあった区（浜松市は2024年1月に7区 → 3区）・政令市になる前の市。
    # どの時点でも、そのときにあったものだけに数があるので、全部足せばその時点の市の数になる
    d.city_parts = {}
    named = set(name2code.items())  # 名前とコードの組。同じ名前で前と今のコードがある区（浜松市天竜区：前 22137・今 22140）は両方
    named |= {((p, n), c) for p, n, c in mn[mn["市区町村コード"].notna()][["都道府県", "市区町村", "市区町村コード"]].drop_duplicates().itertuples(index=False)}
    for key, codes in d.cities.items():
        parts = set(codes)
        for (p, n), c in named:
            mt = re.match(r"(.+?市)(.+区)$", n)
            if (p == key[0] and mt and mt.group(1) == key[1]) or (p, n) == key:
                parts.add(c)
        d.city_parts[key] = sorted(parts)
    return d


def ward_sum(d, codes, getter):
    out = defaultdict(int)
    for c in codes:
        for k, v in getter(c).items():
            out[k] += v
    return dict(out)


CITY_ZERO = []  # 国の表の政令市の合計が0人で、区には人がいる時点（区の合計を使う）→ [(政令市, 時点, 区の合計)]


def city_series(d, key):
    """政令市の数。国の表の「合計の行」があればその数（区の合計と少し違っても表のまま）、なければその時点の区の合計。
    合計の行が0人なのに区に人がいる時点（2016年6月末の熊本市）は、表の書きもらしとみて区の合計を使い、CITY_ZERO に残す"""
    s = dict(d.city_total_rows.get(key, {}))
    parts = ward_sum(d, d.city_parts[key], lambda c: d.muni_series.get(c, {}))
    for w, v in parts.items():
        if w not in s:
            s[w] = v
        elif s[w] == 0 and v:
            s[w] = v
            if (key[1], w, v) not in CITY_ZERO:
                CITY_ZERO.append((key[1], w, v))
    return dict(sorted(s.items()))


def area_name(n):
    return HIDDEN_LABEL if n == HIDDEN else n


def nat_items(counts):
    return [(area_name(n), v, None if n == HIDDEN else href(nat_file(n))) for n, v in sorted(counts.items(), key=lambda x: -x[1])]


def visa_items(counts):
    return [(area_name(v), c, None) for v, c in sorted(counts.items(), key=lambda x: -x[1])]


# 10年前（2015年12月末）からの増減を見るときに注意がいるもの（制度・区分が変わった、新しくできた）。名前に「※」を付け、カードの下に書く
TEN_NOTE = {
    "特定技能": "2019年4月にできた在留資格です。10年前にはないので「比較不可」とし、増減は出していません。",
    "介護": "2017年9月にできた在留資格です。10年前にはないので「比較不可」とし、増減は出していません。",
    "高度専門職": "2015年4月にできた在留資格です。10年前の数は、できてから8か月後の数です。",
    "技術・人文知識・国際業務": "2015年4月に「技術」と「人文知識・国際業務」が1つになってできた在留資格です（10年前の数も、1つになった後の数です）。",
    "経営・管理": "2015年4月に「投資・経営」から名前が変わり、対象も広がった在留資格です（10年前の数は、変わった後の数です）。",
    "技能実習": "2017年11月に3号ができました（1号〜3号をまとめて示しています）。",
    "特定活動": "法務大臣が一人ひとりに活動を指定する在留資格で、この10年の間にも対象となる活動が加えられています。",
    "韓国": "「韓国」と「朝鮮」は、2015年12月末から分けて数えられています（それより前は「韓国・朝鮮」）。10年前の数は、分けた後の数です。",
    "朝鮮": "「韓国」と「朝鮮」は、2015年12月末から分けて数えられています（それより前は「韓国・朝鮮」）。10年前の数は、分けた後の数です。",
}
TEN_RATE_NOTE = "増減率は、10年前の人数が少ないと大きく出ます。10年前の人数とあわせて見てください。"


def ten_card(dim, what, rows, link):
    """10年前からの増減のカード（国籍・地域／在留資格）。rows：[(名前, リンク, 今の数, 10年前の数 or None)]（今の数の多い順）。
    10年前の数がない（10年前の表にない）ものは「比較不可」とし、0人としては扱わない。10年前が0人なら、増減は出し、増減率は出さない（計算できない）。
    増減の横棒・並べ替え・もっと見る・画像を保存は app.js。JavaScript が動かないときは、多い15の表"""
    data = {"dim": dim, "what": what, "area": "全国", "from": TEN_AGO, "when": LATEST, "limit": 15,
            "rows": [[n, l, int(c), None if b is None else int(b)] for n, l, c, b in rows], "notes": [n for n, *_ in rows if n in TEN_NOTE]}
    trs = ""
    for n, l, c, b in rows[:15]:
        nm = f'<a href="{esc(l)}">{esc(n)}</a>' if l else esc(n)
        diff = "比較不可" if b is None else ("0" if c == b else signed(c - b))  # 増減が0なら「0」（±を付けない。画面・画像と同じ）
        rate = pct_signed(c - b, b) if b else "—"
        trs += (f"<tr><td>{nm}</td><td class='n'>{num(c)}</td><td class='n'>{'—' if b is None else num(b)}</td>"
                f"<td class='n'>{diff}</td><td class='n'>{rate}</td></tr>")
    table = (f"<div class='scroll'><table class='t'><tr><th>{esc(what)}</th><th class='n'>{when_label(LATEST)}</th><th class='n'>{when_label(TEN_AGO)}</th>"
             f"<th class='n'>増減</th><th class='n'>増減率</th></tr>{trs}</table></div>")
    same = {}  # 同じ注意は1つにまとめる（韓国・朝鮮）
    for n in data["notes"]:
        same.setdefault(TEN_NOTE[n], []).append(n)
    notes = [f"<li>※ <b>{esc('・'.join(ns))}</b>：{esc(t)}</li>" for t, ns in same.items()]
    none = [n for n, _, _, b in rows if b is None and n not in TEN_NOTE]
    if none:
        notes.append(f"<li>「比較不可」の{esc(what)}（{esc('、'.join(none))}）は、10年前の国の表にのっていないため、増減は出していません（0人とはしていません）。</li>")
    notes.append(f"<li>{TEN_RATE_NOTE}</li>")
    return (f'<section class="card ten-card" id="ten-{dim}"><h2>10年前からの増減：{esc(what)}</h2>'
            f'<p class="cardmeta"><span>対象：全国の{len(rows)}の{esc(what)}</span><span>期間：{when_label(TEN_AGO)} → {when_label(LATEST)}（10年間）</span></p>'
            f'<div class="viz" data-viz="ten"><noscript>{table}</noscript><script type="application/json">{jdump(data)}</script></div>'
            f'<ul class="note ten-notes">{"".join(notes)}</ul><p class="note">{link}</p></section>')


# ---------------------------------------------------------------- ページ
# トップページのいちばん上：グラフの画像を作る（X投稿用）。中身（選ぶボタン・画像）は xmaker.js が作る
# （数の取り出し方はダッシュボードの dash.js、画像は share.js と同じ）。2026年10月 作った人の希望「X用の機能をトップページの最初に」。
# はじめは閉じた帯だけ（押すと開く。下の数がすぐ見えるように。2026年10月 作った人の希望）。開いたときに xmaker.js がデータを読み込む
def xmaker():
    sk = pd.read_csv(os.path.join(DATA, "半期速報", "半期速報.csv"))
    sw = sk["発表の時点"].max()  # いちばん新しい速報の時点（確定統計より新しいときだけ、帯に書く）
    sp = f"{when_label(sw)}の速報も使えます。" if sw > LATEST else ""
    return f"""<details class="card xm" id="xmaker"><summary><h2 id="xm-h">グラフの画像を作る<span class="xm-x">（X投稿用）</span></h2>
<span class="xm-sub">国籍・在留資格・地域のグラフを選んで、Xに投稿できる画像にします。{sp}</span><span class="xm-tog" aria-hidden="true"></span></summary>
<div class="xm-in"><p class="xm-lead">①〜③を選ぶと、右（スマホでは下）にX投稿用の画像ができます。そのまま保存・コピーして投稿できます。</p>
<div class="xm-body"><p class="dhelp">読み込み中…</p></div>
<noscript><p class="note">この部分は JavaScript を使います。JavaScript が動かないときは、下の表で数をご覧ください。</p></noscript></div></details>"""


def japan_head(d, s):
    """トップの「日本全体の在留外国人」（見出しの下の行と主要な数）。確定統計より新しい半期速報があれば、その総数（速報）を使う。
    次の速報・確定統計を取り込めば、いちばん新しい方に自動で変わる（2026年10月 作った人の希望「トップページは常に最新の数に。日本全体は速報値を使い、明記する」）。
    1年前・10年前の数は確定統計（同じ時点の速報と確定統計は同じ数。データ/半期速報/確かめ.csv）。返す：(HTML, 時点, 人数, 速報か)"""
    sk = pd.read_csv(os.path.join(DATA, "半期速報", "半期速報.csv"))
    sk = sk[(sk["表"] == "国籍・地域") & (sk["名前"] == "総数") & (sk["状態"] == "速報")].sort_values("時点").iloc[-1]
    if sk["時点"] <= LATEST:
        return (meta_line("日本全体", '<span>もっと新しい数（速報）：<a href="sokuho.html">半期速報</a></span>') + kpis(s[LATEST], s, "日本全体"),
                LATEST, s[LATEST], False)
    sw, sv = sk["時点"], int(sk["人数"])
    html = (f'<p class="meta"><span>対象：<b>日本全体</b></span><span>集計時点：<b>{when_label(sw)}</b>（速報）</span>'
            f'<span>出どころ：出入国在留管理庁の<a href="sokuho.html">半期速報</a>（{ymd_text(sk["公表日"])}公表）</span></p>'
            + kpis(sv, s, "日本全体", at=sw, mark="（速報）")
            + f'<p class="note">※ 速報は、確定した統計（e-Stat）より先に出入国在留管理庁が発表する数です。1年前・10年前の数は確定した統計の数です。'
            f'このあとのグラフと表は、国籍×在留資格や市区町村まで分かる確定した統計（{when_label(LATEST)}）の数です。</p>')
    return html, sw, sv, True


def top_page(d):
    s = dict(sorted(d.japan.items()))
    now = s[LATEST]
    jhead, jw, jnow, jsp = japan_head(d, s)
    counts = {n: ser[LATEST] for n, ser in d.nat_series.items() if ser.get(LATEST)}
    ni = nat_items(counts)
    visas = d.japan_visa[LATEST]
    vi = visa_items(visas)
    ten = d.japan_visa[TEN_AGO]
    pref_tot = {p: d.pref_series[p][LATEST] for p in PREFS}
    options = [("在留外国人の数（全体）", pref_tot)]
    for n, _, _ in ni[:20]:
        options.append((f"国籍・地域：{n}", {p: d.pref_nat[(LATEST, p)].get(n, 0) for p in PREFS}))
    for v, _, _ in vi[:12]:
        options.append((f"在留資格：{v}", {p: d.pref_visa[(LATEST, p)].get(v, 0) for p in PREFS}))
    ten_nat = ten_card("nat", "国籍・地域", [(n, l, c, d.nat_series[n].get(TEN_AGO)) for n, c, l in ni],
                       '<a href="nat-index.html">すべての国籍・地域の一覧（国籍から探す）へ</a>')
    ten_visa = ten_card("visa", "在留資格", [(v, dash_link(v="area", visa=v), c, ten.get(v)) for v, c, _ in vi],
                        '<a href="visa-index.html">すべての在留資格の一覧（在留資格から探す）へ</a>')
    xd = {n: d.nat_visa[(LATEST, n)] for n, _, _ in ni[:10]}
    sets = [visa_set(d, "全部の国籍・地域", lambda w: d.japan_visa.get(w))]
    sets += [visa_set(d, n, lambda w, n=n: d.nat_visa.get((w, n)), nat=n) for n, _, _ in ni[:20]]
    body = f"""<h1>日本に住む外国人の数</h1>
<p class="lead">出入国在留管理庁が発表している在留外国人の数を、国籍・在留資格・都道府県・市区町村ごとに見られるサイトです。</p>
{xmaker()}
<section class="ask" aria-labelledby="ask-h"><h2 id="ask-h">何を調べますか？</h2>{ENTRIES}{more_entries()}</section>
<section id="japan" aria-labelledby="japan-h"><h2 id="japan-h" style="margin-top:22px">日本全体の在留外国人</h2>
{jhead}</section>
{jump([("cross", "国籍ごとの在留資格"), ("trend", "移り変わり"), ("map", "都道府県の地図"), ("nat", "国籍・地域"), ("visa", "在留資格"), ("prefs", "都道府県の一覧"), ("ten", "10年間の増減"), ("dash", "ダッシュボード")])}
<section class="card" id="cross"><h2>国籍・地域ごとの主な在留資格</h2><p class="cardmeta">対象：全国の人数の多い10の国籍・地域　集計時点：{when_label(LATEST)}</p>{cross_table(ni, xd, 10, xm=xm_link())}</section>
<section class="card" id="trend"><h2>在留外国人の数の移り変わり（1959年〜{LATEST[:4]}年）</h2>{line_chart(s, "在留外国人の数の移り変わり", "全国")}</section>
<section class="card" id="map"><h2>都道府県ごとの数（日本の地図）</h2><p class="cardmeta">対象：全国の47都道府県　集計時点：{when_label(LATEST)}</p>{japan_map(options)}</section>
<div class="cols">
<section class="card" id="nat"><h2>国籍・地域の内わけ</h2><p class="cardmeta">対象：全国　集計時点：{when_label(LATEST)}</p>{breakdown("国籍・地域の内わけ", ni, now, "国籍・地域", "全国", "nat")}
<p class="note"><a href="nat-index.html">すべての国籍・地域の一覧（国籍から探す）へ</a></p></section>
<section class="card" id="visa"><h2>在留資格の内わけ</h2><p class="cardmeta">対象：全国　集計時点：{when_label(LATEST)}</p>{breakdown("在留資格の内わけ", vi, now, "在留資格", "全国", "visa")}
<p class="note"><a href="visa-index.html">すべての在留資格の一覧（在留資格から探す）へ</a></p></section>
</div>
<section class="card" id="visa-trend"><h2>在留資格の移り変わり（国籍・地域を選べます）</h2>{visa_lines(sets, "全国")}</section>
{pref_table(d)}
<div class="cols ten-cols" id="ten">
{ten_nat}
{ten_visa}
</div>
<section class="card" id="dash"><h2>条件を選んで、もっと詳しく調べる（ダッシュボード）</h2>{DASH_MENU}</section>
{NOTES}"""
    return page("日本全体", [("日本全体", None)], body, f"{when_label(jw)}の在留外国人は{num(jnow)}人{'（速報）' if jsp else ''}。国籍・在留資格・都道府県・市区町村ごとの数と移り変わり。",
                js=("share.js", "dash.js", "xmaker.js"), active="japan")


def pref_table(d, title="都道府県の一覧", limit=10):
    """47都道府県の一覧（名前で探す・並べ替え・もっと見る）。トップページと「地域から探す」で使う"""
    rows = []
    rank = {p: i for i, p in enumerate(sorted(PREFS, key=lambda x: -d.pref_series[x][LATEST]), 1)}
    for p in sorted(PREFS, key=lambda x: rank[x]):
        v, b, b10 = d.pref_series[p][LATEST], d.pref_series[p].get(YEAR_AGO), d.pref_series[p].get(TEN_AGO)
        first = max(d.pref_nat[(LATEST, p)].items(), key=lambda x: x[1])[0]
        top_area = max(d.areas[p], key=lambda a: total_of(d, a[3]))
        rows.append((p, [(str(rank[p]), rank[p]), (f"<a href='{PREF_FILE[p]}'>{p}</a>", None), (num(v), v)] + diff_cells(v, b) +
                     [diff_cells(v, b10)[0], (f"<a href='{href(nat_file(first))}'>{esc(first)}</a>", None),
                      (f"<a href='{href(top_area[1])}'>{esc(top_area[0])}</a>", None)]))
    head = [("順位", True), ("都道府県", False), ("人数", True), ("1年前から", True), ("増減の割合", True), ("10年前から", True),
            ("いちばん多い国籍・地域", False), ("外国人のいちばん多い市区町村", False)]
    return (f'<section class="card" id="prefs"><h2>{esc(title)}</h2><p class="cardmeta">集計時点：{when_label(LATEST)}。順位は人数の多い順。'
            '都道府県の名前を押すと、その都道府県のページ（市区町村の地図と一覧）へ進みます。</p>'
            + tbl(head, rows, sorts_for(2, 3, 4, 1, 5), "都道府県の名前で探す", "東京", limit, "pref-list") + "</section>")


def region_link(key, label=None):
    """地域区分（または州）で絞った国籍・地域の一覧へのリンク"""
    return f'<a href="nat-index.html#r={quote(key)}" data-filter="{esc(key)}">{esc(label or key)}</a>'


def region_table(d, ranked):
    """州・地域区分ごとの人数（国籍・地域の数を足したもの）。名前を押すと、下の一覧をその区分だけにする"""
    now = sum(v for _, v in ranked)
    agg = defaultdict(lambda: [0, 0, 0, []])  # 鍵 → [人数, 1年前, 国・地域の数, [多い名前]]
    for n, v in ranked:
        st, sub = region_of(n)
        b = d.nat_series[n].get(YEAR_AGO, 0)
        for k in (st, st + "|" + sub):
            a = agg[k]
            a[0] += v; a[1] += b; a[2] += 1
            if len(a[3]) < 3:
                a[3].append(n)
    rows = ""
    for st, subs in REGION_TREE:
        if st not in agg:
            continue
        for k, lab, cls in [(st, st, "rst")] + [(st + "|" + s, s, "rsub") for s in subs if s != st]:
            if k not in agg:
                continue
            v, b, c, top = agg[k]
            key = k.split("|")[-1]
            rows += (f"<tr class='{cls}'><td>{region_link(key, lab)}</td><td class='n'>{num(v)}</td><td class='n'>{v / now * 100:.1f}%</td>"
                     f"<td class='n'>{signed(v - b) if b else '—'}</td><td class='n'>{c}</td><td>{'・'.join(esc(x) for x in top)}</td></tr>")
    return ("<div class='scroll'><table class='t regtab'><thead><tr><th>州・地域区分</th><th class='n'>人数</th><th class='n'>割合</th><th class='n'>1年前から</th>"
            f"<th class='n'>国・地域の数</th><th>人数の多い国・地域</th></tr></thead><tbody>{rows}</tbody></table></div>")


# ---------------------------------------------------------------- 色のマス目（ヒートマップ）
# 色は地図と同じオレンジの濃さ7段（style.css の .b0〜.b6、0は .b-z）。マスの中にも数を書く（色だけに頼らない）
def bin_cuts(values):
    """色の段の区切り（app.js の cuts と同じ）：1・2・5・10…のきりのよい数で、いちばん少ない所から多い所まで（多くても6つ）"""
    v = [x for x in values if x > 0]
    if not v:
        return []
    lo, hi = min(v), max(v)
    c = [m * 10 ** k for k in range(math.floor(math.log10(lo)), math.ceil(math.log10(hi)) + 1) for m in (1, 2, 5) if lo < m * 10 ** k <= hi]
    while len(c) > 6:
        c = c[1::2]
    return c


def bin_class(v, cs):
    """数 → 色の段（app.js の binOf・shade と同じ。段が少なくても薄い色から濃い色まで使う）"""
    if not v:
        return "b-z"
    b = sum(1 for c in cs if v >= c)
    return f"b{int(b * 6 / len(cs) + 0.5) if cs else 6}"


def short_man(v):
    """マスの中の短い数（1,603,883 → 160万、28,437 → 2.8万）"""
    return f"{v / 10000:.0f}万" if v >= 100000 else f"{v / 10000:.1f}万" if v >= 10000 else num(v)


def short_pct(p):
    return "0" if p == 0 else "<0.1%" if p < 0.05 else f"{p:.0f}%" if p >= 9.95 else f"{p:.1f}%"


def heat_grid(rows, cols, cells, legend, chart, note, col_head="", vertical=False, mark=None, extra=None):
    """色のマス目の表（ページに書く）と、画像を保存するときの数（JSON）。
    rows: heat_rows() の行、cells: 行ごとの [(色の段, マスの字, 押したときの説明)]（見出しの行は None）。
    extra: (列の名前, [行ごとの字]) 名前のすぐ右に色を付けない列を足す。vertical：列の名前を縦書きに。mark：数え方が変わる列の番号"""
    def th(i, c):
        cls = " ".join(x for x, on in (("vh", vertical), ("brk", i == mark)) if on)
        return f"<th{f' class={chr(39)}{cls}{chr(39)}' if cls else ''} scope='col'><span>{esc(GRAPH_NAME.get(c, c))}</span></th>"
    head = (f"<th class='rl' scope='col'>{esc(col_head)}</th>" + (f"<th class='ex' scope='col'>{esc(extra[0])}</th>" if extra else "") +
            "".join(th(i, c) for i, c in enumerate(cols)))
    body = ""
    for j, (r, cs) in enumerate(zip(rows, cells)):
        label, group, top = r[0], r[2], r[4]
        if group:
            body += f"<tr class='hst'><th colspan='{len(cols) + 1 + bool(extra)}' scope='colgroup'><span>{label}</span></th></tr>"
            continue
        if top and j:  # 見出しのない州（南アメリカ・無国籍）の前は少し空ける
            body += f"<tr class='hgap' aria-hidden='true'><td colspan='{len(cols) + 1 + bool(extra)}'></td></tr>"
        ex = f"<td class='ex'>{extra[1][j]}</td>" if extra else ""
        body += (f"<tr{' class=top' if top else ''}><th class='rl' scope='row'>{label}</th>{ex}" +
                 "".join(f"<td class='{c}{' brk' if i == mark else ''}' title='{esc(t)}'>{esc(s)}</td>" for i, (c, s, t) in enumerate(cs)) + "</tr>")
    lg = "".join(f"<span class='lg'><span class='sw {c}'></span>{esc(t)}</span>" for c, t in legend)
    return (f'<div class="viz" data-viz="heat"><div class="scroll"><table class="heat"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'
            f'<div class="map-legend"><span class="lgh">色の見方（濃いほど多い）：</span>{lg}</div>'
            f'<script type="application/json">{jdump(chart)}</script></div><p class="note">{note}</p>')


def heat_rows():
    """マス目の行：州ごとに見出しの行、その下に地域区分（州と同じ名前の地域区分だけのとき（南アメリカ・無国籍）は、見出しを付けずに太字の行）。
    (名前のHTML, 名前, 見出しか, 地域区分, 州と同じか)"""
    out = []
    for st, subs in REGION_TREE:
        if subs != [st]:
            out.append((esc(st), st, True, None, False))
        out += [(region_link(s).replace(f">{esc(s)}<", f">{wbr(s)}<"), s, False, s, subs == [st]) for s in subs]
    return out


def world_map_names():
    """世界地図の形（make_world_map.py）にある国籍・地域と、灰色の所の名前"""
    with open(os.path.join(BASE, "site_assets", "map", "world.json"), encoding="utf-8") as f:
        keys = list(json.load(f)["areas"])
    return {k for k in keys if not k.startswith("none:")}, [k for k in keys if k.startswith("none:")]


def region_heat(d, ranked):
    """地域区分ごとの人数を色で見る：世界地図（はじめ）・在留資格の割合・年ごとの人数（あとの2つは色のマス目）。上のボタンで切り替え（app.js）。
    JavaScript が動かないときは3つとも縦に並ぶ"""
    rows = heat_rows()
    # 1. 年ごとの人数（各年12月末。国籍・地域ごとの数がそろう2006年末から）
    years = sorted({w for s in d.nat_series.values() for w in s if w.endswith("-12")})
    by = defaultdict(lambda: defaultdict(int))
    for n, s in d.nat_series.items():
        sub = region_of(n)[1]
        for w in years:
            by[sub][w] += s.get(w, 0)
    cs = bin_cuts([by[r[3]][w] for r in rows if not r[2] for w in years])
    lg = [(f"b{int(i * 6 / len(cs) + 0.5)}", (f"{num(cs[i - 1] if i else 1)}人〜" if i == len(cs) else f"{num(cs[i - 1] if i else 1)}〜{num(cs[i] - 1)}人"))
          for i in range(len(cs) + 1)]
    if any(not by[r[3]][w] for r in rows if not r[2] for w in years):
        lg.append(("b-z", "0人"))
    cells = [None if r[2] else [(bin_class(by[r[3]][w], cs), short_man(by[r[3]][w]), f"{r[1]}：{when_label(w)}：{num(by[r[3]][w])}人") for w in years]
             for r in rows]
    mark = years.index("2012-12") if "2012-12" in years else None
    chart1 = {"kind": "heat", "rows": [[r[1], r[2], r[4]] for r in rows], "cols": [w[:4] for w in years], "cls": [c and [x[0] for x in c] for c in cells],
              "text": [c and [x[1] for x in c] for c in cells], "legend": lg, "metric": "人数", "from": years[0], "when": years[-1], "mark": mark,
              "area": "全国", "markNote": "点線より左（2011年まで）は登録外国人統計で、数え方が違います"}
    year_grid = heat_grid(rows, [w[:4] for w in years], cells, lg, {"chart": chart1, "title": "全国｜在留外国人の地域区分別人数の移り変わり"},
                          f"各年12月末の人数（{years[0][:4]}〜{years[-1][:4]}年）。マスの中の数は、1万人より多い所は「万」で短くしています。"
                          "点線より左（2011年まで）は登録外国人統計で、数え方が違います（短い期間の滞在の人なども入ります）。"
                          "地域区分は今の国の区分で分けています。マスを押すと（マウスを合わせると）、正確な人数が出ます。", "各年12月末", mark=mark)
    # 2. 在留資格の割合（その地域区分の人のうち、その在留資格の人の割合。多い在留資格12と「その他」）
    xv = defaultdict(lambda: defaultdict(int))
    for n, _ in ranked:
        for v, c in d.nat_visa.get((LATEST, n), {}).items():
            xv[region_of(n)[1]][v] += c
    tot = defaultdict(int)
    for m in xv.values():
        for v, c in m.items():
            tot[v] += c
    visas = [v for v, _ in sorted(tot.items(), key=lambda x: -x[1]) if v != OTHER][:12]
    vcols = visas + [OTHER]

    def share(sub):
        t = sum(xv[sub].values())
        got = {v: xv[sub].get(v, 0) for v in visas}
        got[OTHER] = t - sum(got.values())
        return t, got
    pcuts = [1, 5, 10, 20, 30, 50]
    plg = [("b0", "1%未満")] + [(f"b{i}", f"{a}〜{b}%") for i, (a, b) in enumerate(zip(pcuts, pcuts[1:]), 1)] + [("b6", "50%以上"), ("b-z", "0人")]
    cells2, totals = [], []
    for r in rows:
        if r[2]:
            cells2.append(None)
            totals.append("")
            continue
        t, got = share(r[3])
        totals.append(num(t))
        cells2.append([(bin_class(got[v] / t * 100, pcuts) if got[v] else "b-z", short_pct(got[v] / t * 100) if got[v] else "0",
                        f"{r[1]}の人のうち {v}：{num(got[v])}人（{got[v] / t * 100:.1f}%）") for v in vcols])
    chart2 = {"kind": "heat", "rows": [[r[1], r[2], r[4]] for r in rows], "cols": vcols, "cls": [c and [x[0] for x in c] for c in cells2],
              "text": [c and [x[1] for x in c] for c in cells2], "legend": plg, "metric": "その地域区分の人のうちの割合", "when": LATEST, "area": "全国", "vertical": True}
    visa_grid = heat_grid(rows, vcols, cells2, plg, {"chart": chart2, "title": "全国｜在留外国人の地域区分別在留資格の割合"},
                          f"{when_label(LATEST)}。その地域区分の国籍・地域の人のうち、それぞれの在留資格の人の割合です（横に足すと100%）。"
                          "全国で人数の多い在留資格12と、それ以外を合わせた「その他」です。「技人国」は「技術・人文知識・国際業務」のことです。"
                          "人数の少ない地域区分は、少しの人数で割合が大きく変わります。", "地域区分", vertical=True, extra=("人数", totals))
    # 3. 世界地図（国籍・地域ごとの人数。在留資格を選べる）
    placed, grey = world_map_names()
    for n, _ in ranked:
        if n not in placed and n not in ("朝鮮", "無国籍", "セルビア・モンテネグロ"):
            WORLD_WARN.append(n)
    vals = dict(ranked)
    opts = [("在留外国人の数", vals, None)] + [(f"在留資格：{v}", {n: d.nat_visa.get((LATEST, n), {}).get(v, 0) for n, _ in ranked if d.nat_visa.get((LATEST, n), {}).get(v)}, None)
                                            for v, _ in sorted(tot.items(), key=lambda x: -x[1]) if v != OTHER]
    order = sorted(vals, key=lambda n: (SUB_ORDER.index(region_of(n)[1]) if region_of(n)[1] in SUB_ORDER else 99, -vals[n]))
    links = {n: href(nat_file(n)) for n in order if n in placed}
    notes = {k: "国の表に、この地域だけの数はありません" for k in grey}
    notes["none:日本"] = "この地図は、日本に住む外国人の国籍・地域ごとの数です"
    notes["none:朝鮮民主主義人民共和国"] = "国の表の「朝鮮」は、この国の国籍を表すものではないため、色を付けていません（地図の下の注意をご覧ください）"
    no_map = "・".join(f"「{n}」（{num(vals[n])}人）" for n in ("朝鮮", "無国籍", "セルビア・モンテネグロ") if n in vals)
    world = shape_map(opts, links, "assets/map/world.json", "全国", "world", notes=notes, groups={n: region_of(n)[1] for n in links},
                      note="国籍・地域ごとの人数を、国の形の色の濃さで示しています。地図の形は Natural Earth（日本の見方の国境の版）をもとにしたもので、"
                           "太平洋を真ん中にしています（南極は入れていません）。小さな国は丸で示しています。灰色は、国の表にその地域だけの数がない所です"
                           "（香港の人は、国の表では「中国」と「英国」に分かれて入っています）。"
                           f"地図にないもの：{no_map}。国の表の「朝鮮」は、朝鮮半島から来た人とその子孫などで国籍が確かめられていない人の記載で、"
                           "国籍を表すものではないため、地図には色を付けていません。")
    # 並びは世界地図（はじめに見せる）→ 在留資格の割合 → 年ごとの人数（マスが多く細かいので最後。2026年10月 作った人の希望）
    panes = [("world", "世界地図", f"国籍・地域ごとの人数の世界地図（{when_label(LATEST)}）", world),
             ("visa", "在留資格の割合", f"地域区分ごとの在留資格の割合（{when_label(LATEST)}）", visa_grid),
             ("year", "年ごとの人数", f"地域区分ごとの人数の移り変わり（{years[0][:4]}〜{years[-1][:4]}年）", year_grid)]
    return ('<div class="heatsw">' + "".join(f'<div class="heatpane" data-k="{k}" data-label="{esc(b)}"><h3>{esc(h)}</h3>{body}</div>' for k, b, h, body in panes) +
            "</div>")


def nat_index_page(d):
    rows = []
    ranked = sorted(((n, s[LATEST]) for n, s in d.nat_series.items() if s.get(LATEST)), key=lambda x: -x[1])
    for i, (n, v) in enumerate(ranked, 1):
        b, b10 = d.nat_series[n].get(YEAR_AGO), d.nat_series[n].get(TEN_AGO)
        firsts = sorted(((p, d.pref_nat[(LATEST, p)].get(n, 0)) for p in PREFS), key=lambda x: -x[1])
        fp = firsts[0][0] if firsts[0][1] else ""
        vs = d.nat_visa.get((LATEST, n), {})
        fv = max(vs.items(), key=lambda x: x[1])[0] if vs else ""
        st, sub = region_of(n)
        # 地域区分は上の「地域区分で絞る」で選べるので、列には出さない（行の data-group で絞る）。表が横にはみ出さないように見出しも短く
        rows.append((n, [(str(i), i), (f"<a href='{href(nat_file(n))}' class=wr>{wbr(n)}</a>", None), (num(v), v)] +
                     diff_cells(v, b) + [diff_cells(v, b10)[0], (f"<a href='{PREF_FILE[fp]}'>{esc(fp)}</a>" if fp else "", None), (f"<span class=wr>{wbr(fv)}</span>", None)], f"{st}|{sub}"))
    head = [("順位", True), ("国籍・地域", False), ("人数", True), ("1年前から", True), ("増減の割合", True), ("10年前から", True),
            ("最多の都道府県", False), ("最多の在留資格", False)]
    sorts = sorts_for(2, 3, 4, 1, 5)
    body = f"""<h1>国籍から探す</h1>
{meta_line(f"日本に住む外国人（{len(ranked)}の国籍・地域）")}
<p class="lead">国籍・地域の名前を押すと、その国籍・地域の人の在留資格や、住んでいる都道府県・市区町村が見られます。アジア・アフリカなどの地域区分で絞ることもできます。</p>
{jump([("cross", "国籍ごとの在留資格"), ("heat", "色で見る（世界地図・在留資格・年ごと）"), ("regions", "地域区分ごとの人数"), ("list", "国籍・地域の一覧")])}
<section class="card" id="cross"><h2>国籍・地域ごとの主な在留資格</h2><p class="cardmeta">対象：全国の人数の多い10の国籍・地域　集計時点：{when_label(LATEST)}</p>{cross_table([(n, v, href(nat_file(n))) for n, v in ranked], {n: d.nat_visa.get((LATEST, n), {}) for n, _ in ranked[:10]}, 10, xm=xm_link())}</section>
<section class="card" id="heat"><h2>地域区分ごとの人数を色で見る</h2>
<p class="cardmeta">色が濃いほど人数（割合）が多いことを表します。上のボタンで「世界地図」「在留資格の割合」「年ごとの人数」を切り替えられます。地域区分の名前を押すと、下の一覧がその区分の国・地域だけになります。</p>
{region_heat(d, ranked)}</section>
<section class="card" id="regions"><h2>地域区分ごとの人数</h2>
<p class="cardmeta">集計時点：{when_label(LATEST)}。国籍・地域の人数を、州・地域区分ごとに足したもの。区分の名前を押すと、下の一覧がその区分の国・地域だけになります。</p>
{region_table(d, ranked)}
<p class="note">州は国の表（在留外国人統計）のとおりです。国の表では、中央アジア（ウズベキスタンなど）とコーカサス（ジョージアなど）の国は「ヨーロッパ」、トルコは「アジア」、メキシコや中米・カリブ海の国は「北アメリカ」に入っています。
地域区分は、その州の中を国連の統計の地域分類（M49）をもとにこのサイトで分けたものです（イランは西アジア（中東）に入れています）。</p></section>
<section class="card" id="list"><h2>国籍・地域の一覧</h2>
<p class="cardmeta">順位は人数の多い順。増加率は、もとの人数が少ないと大きく出ます。「—」は前の数がないもの（並べ替えではいちばん下）。</p>
{tbl(head, rows, sorts, "国籍・地域の名前で探す", "ネパール", 20, "nat-list", groups=REGION_TREE)}</section>
{related([("visa-index.html", "在留資格から探す", "永住者・留学・技能実習など、資格ごとの人数と割合"),
          ("area-index.html", "地域から探す", "都道府県・市区町村ごとの国籍の内わけ"),
          (dash_link(v="trend", cmp="nat"), "国籍ごとの移り変わりを比べる", "ダッシュボードで、いくつかの国籍・地域の線を重ねて比べる"),
          (dash_link(v="rank", rt="nx"), "国籍×在留資格の組み合わせランキング", "「ベトナム（技能実習）」のように、国籍・地域と在留資格の組み合わせごとに並べる")])}
{NOTES}"""
    return page("国籍から探す", [("日本全体", "index.html"), ("国籍から探す", None)], body, "在留外国人の国籍・地域の一覧と人数。名前で探せます。", active="nat")


def nat_page(d, n, rank):
    s = d.nat_series[n]
    now = s[LATEST]
    visas = d.nat_visa[(LATEST, n)]
    vi = visa_items(visas)
    pv = {p: d.pref_nat[(LATEST, p)].get(n, 0) for p in PREFS}
    prows = []
    for i, p in enumerate(sorted(PREFS, key=lambda x: -pv[x]), 1):
        if not pv[p]:
            continue
        pt = d.pref_series[p][LATEST]
        prows.append((p, [(str(i), i), (f"<a href='{PREF_FILE[p]}'>{p}</a>", None), (num(pv[p]), pv[p]), (f"{pv[p] / now * 100:.1f}%", f"{pv[p] / now * 100:.3f}"),
                          (f"{pv[p] / pt * 100:.1f}%", f"{pv[p] / pt * 100:.3f}")]))
    phead = [("順位", True), ("都道府県", False), ("人数", True), (f"全国の{n}の人のうち", True), ("その都道府県の外国人のうち", True)]
    psorts = [("人数の多い順", 2, -1), ("人数の少ない順", 2, 1), ("その都道府県の外国人のうちの割合の高い順", 4, -1), ("名前の順", 1, 1)]
    mrows = []  # 市区町村（政令市は区の合計で1つ。都道府県のページの一覧と同じ）
    for p in PREFS:
        for name, link, subt, ref in d.areas[p]:
            c = counts_of(d, ref).get(n, 0)
            if c:
                mrows.append([name, href(link), p, c, total_of(d, ref)])
    hidden_note = ("（外国人が10人以下の市町村は国籍が公表されていないので、市区町村の合計は全国の数より少なくなります）")
    first_pref = max(PREFS, key=lambda p: pv[p])
    st, sub = region_of(n)
    # 国籍・地域ごとの主な在留資格：この国籍・地域と、全国で人数の多いほかの7つ（人数の多い順。この国籍・地域の行は色で目立たせる）
    ranked = sorted(((x, ser[LATEST]) for x, ser in d.nat_series.items() if ser.get(LATEST)), key=lambda t: -t[1])
    others = [x for x, _ in ranked if x != n][:7]
    xn = [t for t in ranked if t[0] == n or t[0] in others]
    xitems = [(x, c, None if x == n else href(nat_file(x))) for x, c in xn]
    body = f"""<h1>{esc(n)}の人</h1>
{meta_line(f"日本に住む、国籍・地域が「{n}」の人（全国）", f'<span>地域区分：{region_link(sub)}{"" if sub == st else "（" + esc(st) + "）"}</span>')}
{kpis(now, s, f"国籍・地域のうち {rank}番目に多い", f"{n}の人")}
{jump([("cross", "主な在留資格をくらべる"), ("trend", "移り変わり"), ("visa", "在留資格"), ("visa-trend", "在留資格の移り変わり"), ("prefs", "住んでいる都道府県"), ("munis", "住んでいる市区町村")])}
<section class="card" id="cross"><h2>{esc(n)}の人の主な在留資格（ほかの国籍・地域とくらべる）</h2><p class="cardmeta">対象：全国の{esc(n)}の人と、人数の多いほかの7つの国籍・地域　集計時点：{when_label(LATEST)}</p>
{cross_table(xitems, {x: d.nat_visa.get((LATEST, x), {}) for x, _ in xn}, len(xitems), mark=n, xm=xm_link(nats=[x for x, _ in xn]))}</section>
<section class="card" id="trend"><h2>{esc(n)}の人の数の移り変わり</h2>{line_chart(dict(sorted(s.items())), f"{n}の人の数の移り変わり", "全国", n)}
{"<p class='note'>2015年6月末までは「韓国・朝鮮」として1つに数えられていたため、この国籍・地域だけの数はそれより前にはありません。</p>" if n in ("韓国", "朝鮮") else ""}</section>
<section class="card" id="visa"><h2>{esc(n)}の人の在留資格</h2><p class="cardmeta">対象：全国の{esc(n)}の人　集計時点：{when_label(LATEST)}</p>{breakdown(f"{n}の人の在留資格", vi, now, "在留資格", "全国", "visa", n)}</section>
<section class="card" id="visa-trend"><h2>{esc(n)}の人の在留資格の移り変わり</h2>{visa_lines([visa_set(d, n, lambda w: d.nat_visa.get((w, n)), nat=n)], "全国")}</section>
<section class="card" id="prefs"><h2>{esc(n)}の人が住んでいる都道府県</h2><p class="cardmeta">対象：全国の{esc(n)}の人　集計時点：{when_label(LATEST)}</p>{japan_map([(f"{n}の人の数", pv)], nat=n)}
<h3>都道府県の一覧</h3>{tbl(phead, prows, psorts, "", "", 10, "nat-prefs")}</section>
<section class="card" id="munis"><h2>{esc(n)}の人が住んでいる市区町村</h2><p class="cardmeta">集計時点：{when_label(LATEST)}　都道府県を選ぶと、その中の市区町村だけになります。</p>{pick_by_pref(mrows)}<p class="note">{hidden_note}</p></section>
{related([(PREF_FILE[first_pref], f"{first_pref}のページ", f"{n}の人がいちばん多く住む都道府県。市区町村の地図と国籍の内わけ"),
          (dash_link(v="map", nat=n), f"{n}の人の数を地図で年ごとに見る", "ダッシュボードの全国マップ。時点を動かせます"),
          (dash_link(v="trend", cmp="visa", nat=n), f"{n}の人の在留資格ごとの移り変わり", "ダッシュボードで線を重ねて比べる"),
          (f"nat-index.html#r={quote(sub)}", f"{sub}のほかの国籍・地域", "国籍から探す（地域区分で絞った一覧）")])}
{NOTES}"""
    return page(n, [("日本全体", "index.html"), ("国籍から探す", "nat-index.html"), (sub, f"nat-index.html#r={quote(sub)}"), (n, None)], body,
                f"日本に住む{n}の人は{when_label(LATEST)}に{num(now)}人。在留資格・都道府県・市区町村ごとの数。", active="nat")


def area_list(d, pref):
    """都道府県の中の市区町村（政令市は区の合計で1つ）。[(名前, リンク, 補足, コード or 政令市の鍵)]"""
    out = []
    seen = set()
    for code, m in d.munis.items():
        if m["pref"] != pref:
            continue
        if m["kind"] == "区":
            mt = re.match(r"(.+?市)(.+区)$", m["name"])
            key = (pref, mt.group(1)) if mt else None
            if key and key not in seen:
                seen.add(key)
                out.append((key[1], f"city-{key[1]}.html", "政令市", key))
            continue
        out.append((m["name"], f"muni-{code}.html", m["gun"], code))
    return out


def counts_of(d, ref, when=LATEST):
    if isinstance(ref, tuple):
        return ward_sum(d, d.cities[ref], lambda c: d.muni_nat[(when, c)])
    return d.muni_nat[(when, ref)]


def total_of(d, ref, when=LATEST):
    if isinstance(ref, tuple):
        return city_series(d, ref).get(when, 0)
    return d.muni_series[ref].get(when, 0)


def area_visa(d, ref):
    if isinstance(ref, tuple):
        return ward_sum(d, d.cities[ref], lambda c: d.muni_visa.get(c, {}))
    return d.muni_visa.get(ref, {})


MAP_WARN = []


def map_absent(d, pref, roma, mkeys):
    """地図の区画とサイトの市区町村が合っているか（合併などで変わったときに気づけるように）。
    地図にあって今の表にない市町村（外国人のいない町村は2017年12月末から表にのらない）は {鍵: (名前, 書くこと)} で返す"""
    with open(os.path.join(BASE, "site_assets", "map", f"pref-{roma}.json"), encoding="utf-8") as f:
        shape = set(k for k in json.load(f)["areas"] if not k.startswith("none:"))
    for k in sorted(set(mkeys) - shape):
        if pref == "東京都" and k >= "13360":  # 伊豆諸島・小笠原（地図に入れていない）
            continue
        MAP_WARN.append(f"{pref}：地図に形がない {mkeys[k][0]}（{k}）")
    out = {}
    for k in sorted(shape - set(mkeys)):
        if k not in d.code_name:
            MAP_WARN.append(f"{pref}：数のない地図の区画 {k}")
            continue
        s = sorted(d.muni_series.get(k, {}).items())
        out[k] = (d.code_name[k], "国の表にのっていません" + (f"（{when_label(s[-1][0])}は{num(s[-1][1])}人）" if s else ""))
    return out, shape


def pref_page(d, pref):
    s = d.pref_series[pref]
    now = s[LATEST]
    rank = sorted(PREFS, key=lambda p: -d.pref_series[p][LATEST]).index(pref) + 1
    ni = nat_items(d.pref_nat[(LATEST, pref)])
    vi = visa_items(d.pref_visa[(LATEST, pref)])
    areas = area_list(d, pref)
    rows = []
    for i, (name, link, subt, ref) in enumerate(sorted(areas, key=lambda a: -total_of(d, a[3])), 1):
        v, b = total_of(d, ref), total_of(d, ref, YEAR_AGO)
        cs = counts_of(d, ref)
        first = max(cs.items(), key=lambda x: x[1])[0] if cs else ""
        fn = f"<a href='{href(nat_file(first))}'>{esc(first)}</a>" if first and first != HIDDEN else esc(area_name(first)) if first else ""
        rows.append((name, [(str(i), i), (f"<a href='{href(link)}'>{esc(name)}</a> <span class='sub'>{esc(subt)}</span>", None), (num(v), v)] +
                     diff_cells(v, b) + [(fn, None)]))
    mhead = [("順位", True), ("市区町村", False), ("人数", True), ("1年前から", True), ("増減の割合", True), ("いちばん多い国籍・地域", False)]
    top_nats = [n for n, _, _ in ni if n != HIDDEN_LABEL][:15]
    prow = []
    for name, link, subt, ref in areas:
        cs = counts_of(d, ref)
        prow.append((name, href(link), subt, [total_of(d, ref)] + [cs.get(n, 0) for n in top_nats]))
    # 市区町村の地図：区画の鍵は市区町村のコード、政令市は "city:名前"（make_map.py と同じ）
    mkeys = {("city:" + ref[1] if isinstance(ref, tuple) else ref): (name, link, ref) for name, link, subt, ref in areas}
    roma = ROMA[PREFS.index(pref)]
    absent, on_map = map_absent(d, pref, roma, mkeys)
    unknown = [k for k, (_, _, ref) in mkeys.items() if k in on_map and (HIDDEN in counts_of(d, ref) or HIDDEN in area_visa(d, ref))]
    mopts = [("在留外国人の数（全体）", {k: total_of(d, ref) for k, (_, _, ref) in mkeys.items()}, None)]
    for n in top_nats[:10]:
        mopts.append((f"国籍・地域：{n}", {k: counts_of(d, ref).get(n, 0) for k, (_, _, ref) in mkeys.items()}, unknown))
    for v in [v for v, _, _ in vi if v != HIDDEN_LABEL][:8]:
        mopts.append((f"在留資格：{v}", {k: area_visa(d, ref).get(v, 0) for k, (_, _, ref) in mkeys.items()}, unknown))
    mmap = shape_map(mopts, {k: href(link) for k, (_, link, _) in mkeys.items()}, f"assets/map/pref-{roma}.json", pref, "muni",
                     names={**{k: name for k, (name, _, _) in mkeys.items()}, **{k: a[0] for k, a in absent.items()}},
                     notes={k: a[1] for k, a in absent.items()},
                     note="政令市は市全体で1つの色です（区ごとの数は、その市のページ）。"
                          + ("点線の所は、外国人が10人以下で国籍・在留資格が公表されていない町村です（国籍・在留資格を選んだとき）。" if unknown else ""))
    first_nat = top_nats[0] if top_nats else ""
    body = f"""<h1>{pref}に住む外国人の数</h1>
{meta_line(pref)}
{kpis(now, s, f"47都道府県のうち {rank}番目に多い")}
{jump([("trend", "移り変わり"), ("nat", "国籍・地域"), ("visa", "在留資格"), ("cross", "国籍ごとの在留資格"), ("map", "市区町村の地図"), ("munis", "市区町村の一覧"), ("by-nat", "国籍・地域から見た市区町村")])}
<section class="card" id="trend"><h2>{pref}の在留外国人の数の移り変わり</h2>{line_chart(s, f"{pref}の在留外国人の数の移り変わり", pref)}</section>
<div class="cols">
<section class="card" id="nat"><h2>国籍・地域の内わけ</h2><p class="cardmeta">対象：{pref}　集計時点：{when_label(LATEST)}</p>{breakdown(f"{pref}の国籍・地域の内わけ", ni, now, "国籍・地域", pref, "nat")}</section>
<section class="card" id="visa"><h2>在留資格の内わけ</h2><p class="cardmeta">対象：{pref}　集計時点：{when_label(LATEST)}</p>{breakdown(f"{pref}の在留資格の内わけ", vi, now, "在留資格", pref, "visa")}</section>
</div>
<section class="card" id="cross"><h2>国籍・地域ごとの主な在留資格</h2><p class="cardmeta">対象：{pref}の人数の多い8の国籍・地域　集計時点：{when_label(LATEST)}</p>{cross_table(ni, d.pref_x[pref], 8, pref, xm=xm_link(pref))}</section>
<section class="card" id="map"><h2>{pref}の市区町村ごとの数（地図）</h2><p class="cardmeta">対象：{pref}の市区町村　集計時点：{when_label(LATEST)}</p>{mmap}</section>
<section class="card" id="munis"><h2>{pref}の市区町村の一覧</h2><p class="cardmeta">集計時点：{when_label(LATEST)}。順位は人数の多い順。名前を押すと、その市区町村のページへ進みます。</p>
{tbl(mhead, rows, sorts_for(2, 3, 4, 1), "市区町村の名前で探す", "", 20, "muni-list")}</section>
<section class="card" id="by-nat"><h2>国籍・地域から見た市区町村</h2><p class="cardmeta">集計時点：{when_label(LATEST)}　国籍・地域を選ぶと、その人の多い市区町村の順になります。</p>{pick_by_nat(["総数"] + top_nats, prow)}</section>
{related([(dash_link(v="area", pref=pref), f"{pref}をダッシュボードで詳しく見る", "人口に占める割合・5年・10年の増減・移り変わり"),
          (dash_link(v="rank", rt="muni", pref=pref, rm="rate5"), f"{pref}の市区町村を増え方で並べる", "ダッシュボードのランキング（5年間の増加率など）"),
          (href(nat_file(first_nat)) if first_nat else "nat-index.html", f"{first_nat}の人のページ" if first_nat else "国籍から探す", f"{pref}でいちばん多い国籍・地域" if first_nat else "国籍・地域の一覧"),
          ("area-index.html", "ほかの都道府県・市区町村を探す", "地域から探す（名前で探す・日本地図）")])}
{NOTES}"""
    return page(pref, [("日本全体", "index.html"), ("地域から探す", "area-index.html"), (pref, None)], body,
                f"{pref}の在留外国人は{when_label(LATEST)}に{num(now)}人。国籍・在留資格・市区町村ごとの数。", active="area")


def muni_body(d, title, pref, s, ni, vi, xd, rank_text, extra="", links=(), key=""):
    now = s.get(LATEST, 0)
    hidden = any(n == HIDDEN_LABEL for n, _, _ in ni)
    parts = [("trend", "移り変わり"), ("nat", "国籍・地域"), ("visa", "在留資格")] + ([] if hidden else [("cross", "国籍ごとの在留資格")]) + \
        ([("wards", "区の一覧")] if extra else []) + [("next", "次に見る")]
    return f"""<h1>{esc(title)}に住む外国人の数</h1>
{meta_line(title)}
{kpis(now, s, rank_text)}
{jump(parts)}
<section class="card" id="trend"><h2>{esc(title)}の在留外国人の数の移り変わり</h2>{line_chart(s, f"{title}の在留外国人の数の移り変わり", title)}
<p class="note">町村の数は2012年12月末からです（それより前の統計は市と区だけ）。市町村の合併や名前の変更があると、前の数はつながりません。</p></section>
{"<section class='card note'><p>外国人が10人以下の市町村は、国籍・在留資格が公表されていません（数は国の表のとおり「公表されていない」としています）。</p></section>" if hidden else ""}
<div class="cols">
<section class="card" id="nat"><h2>国籍・地域の内わけ</h2><p class="cardmeta">対象：{esc(title)}　集計時点：{when_label(LATEST)}</p>{breakdown(f"{title}の国籍・地域の内わけ", ni, now, "国籍・地域", title, "nat")}</section>
<section class="card" id="visa"><h2>在留資格の内わけ</h2><p class="cardmeta">対象：{esc(title)}　集計時点：{when_label(LATEST)}</p>{breakdown(f"{title}の在留資格の内わけ", vi, now, "在留資格", title, "visa")}</section>
</div>
{"" if hidden else f"<section class='card' id='cross'><h2>国籍・地域ごとの主な在留資格</h2><p class='cardmeta'>対象：{esc(title)}の人数の多い6の国籍・地域　集計時点：{when_label(LATEST)}</p>{cross_table(ni, xd, 6, title, xm=xm_link(pref, key))}</section>"}
{extra}{related(links)}{NOTES}"""


def muni_links(d, pref, title, key, ni, city=None):
    """市区町村のページの「次に見る」"""
    first = next((n for n, _, l in ni if l), "")
    out = []
    if city:
        out.append((href(f"city-{city}.html"), f"{city}（市全体）のページ", "区の合計の数と、区の一覧"))
    out += [(PREF_FILE[pref] + "#munis", f"{pref}のほかの市区町村", f"{pref}の市区町村の一覧（並べ替え・名前で探す）"),
            (dash_link(v="trend", cmp="nat", pref=pref, muni=key), f"{title}の国籍ごとの移り変わり", "ダッシュボードで線を重ねて比べる"),
            (dash_link(v="area", pref=pref, muni=key), f"{title}をダッシュボードで詳しく見る", "人口に占める割合・5年・10年の増減")]
    if first:
        out.append((href(nat_file(first)), f"{first}の人のページ", f"{title}でいちばん多い国籍・地域（全国の数・在留資格）"))
    return out


def muni_page(d, code, rank_in):
    m = d.munis[code]
    pref, name = m["pref"], m["name"]
    s = dict(sorted(d.muni_series[code].items()))
    ni = nat_items(d.muni_nat[(LATEST, code)])
    vi = visa_items(d.muni_visa.get(code, {}))
    crumbs = [("日本全体", "index.html"), ("地域から探す", "area-index.html"), (pref, PREF_FILE[pref])]
    city = None
    if m["kind"] == "区":
        mt = re.match(r"(.+?市)(.+区)$", name)
        city = mt.group(1)
        crumbs.append((city, href(f"city-{city}.html")))
    crumbs.append((name, None))
    title = f"{pref}{name}"
    body = muni_body(d, title, pref, s, ni, vi, d.muni_x.get(code, {}), rank_in, links=muni_links(d, pref, title, code, ni, city), key=code)
    return page(title, crumbs, body, f"{title}の在留外国人は{when_label(LATEST)}に{num(s.get(LATEST, 0))}人。国籍・在留資格ごとの数。", active="area")


def city_page(d, key, rank_in):
    pref, city = key
    s = city_series(d, key)
    codes = d.cities[key]
    ni = nat_items(ward_sum(d, codes, lambda c: d.muni_nat[(LATEST, c)]))
    vi = visa_items(ward_sum(d, codes, lambda c: d.muni_visa.get(c, {})))
    xd = defaultdict(lambda: defaultdict(int))
    for c in codes:
        for n, vs in d.muni_x.get(c, {}).items():
            for v, k in vs.items():
                xd[n][v] += k
    rows = []
    for i, c in enumerate(sorted(codes, key=lambda c: -d.muni_series[c].get(LATEST, 0)), 1):
        v, b = d.muni_series[c].get(LATEST, 0), d.muni_series[c].get(YEAR_AGO, 0)
        ward = d.munis[c]['name'][len(city):]
        rows.append((ward, [(str(i), i), (f"<a href='muni-{c}.html'>{esc(ward)}</a>", None), (num(v), v)] + diff_cells(v, b)))
    head = [("順位", True), ("区", False), ("人数", True), ("1年前から", True), ("増減の割合", True)]
    extra = (f"<section class='card' id='wards'><h2>{esc(city)}の区の一覧</h2><p class='cardmeta'>集計時点：{when_label(LATEST)}。区の名前を押すと、その区のページへ進みます。</p>"
             + tbl(head, rows, sorts_for(2, 3, 4, 1), "", "", 30, "ward-list") + "</section>")
    body = muni_body(d, f"{pref}{city}", pref, s, ni, vi, xd, rank_in, extra, muni_links(d, pref, f"{pref}{city}", "city:" + city, ni), key="city:" + city)
    return page(f"{pref}{city}", [("日本全体", "index.html"), ("地域から探す", "area-index.html"), (pref, PREF_FILE[pref]), (city, None)], body,
                f"{pref}{city}の在留外国人は{when_label(LATEST)}に{num(s.get(LATEST, 0))}人。国籍・在留資格・区ごとの数。", active="area")


DASH_MENU = """<nav class="bigmenu" aria-label="ダッシュボード">
<a href="dash.html#v=map"><b>全国マップ</b><span>都道府県・市区町村ごとの人数や割合を地図の色で</span></a>
<a href="dash.html#v=trend"><b>年別の推移</b><span>1959年からの移り変わり。国籍・在留資格・地域を重ねて比べる</span></a>
<a href="dash.html#v=visa"><b>在留資格の内訳</b><span>地域と国籍を選んで、在留資格の円グラフと横棒</span></a>
<a href="dash.html#v=area"><b>地域を詳しく</b><span>市区町村まで選んで、人数・割合・増減をまとめて</span></a>
</nav>
<p class="note">ほかに、<a href="dash.html#v=nat">国籍の構成</a>・<a href="dash.html#v=rank">ランキング</a>（<a href="dash.html#v=rank&amp;rt=nx">国籍×在留資格の組み合わせ</a>も）・<a href="dash.html#v=cmp">地域の比較</a>もあります。</p>"""


def dash_page():
    menu = "".join(f'<a href="#v={k}" data-v="{k}">{t}</a>' for k, t in (
        ("map", "全国マップ"), ("trend", "年別の推移"), ("visa", "在留資格の内訳"), ("nat", "国籍の構成"),
        ("rank", "ランキング"), ("cmp", "地域比較"), ("area", "地域を詳しく"))) + '<a class="dext" href="sokuho.html">法務省・半期速報</a>' 
    body = f"""<h1>ダッシュボード</h1>
<p class="dintro">地域・国籍・在留資格・時点を選ぶと、地図・グラフ・ランキングが変わります。選んだ条件はこのページのアドレスに残るので、アドレスを送れば同じ画面を見てもらえます。</p>
<div id="dash"><nav class="dmenu" aria-label="見方">{menu}</nav>
<div id="dash-filter"></div><div id="dash-loading" hidden>読み込み中…</div><div id="dash-view"><p class="dhelp">読み込み中…</p></div></div>
<noscript><p class="note">このページは JavaScript を使います。JavaScript が動かないときは、<a href="index.html">日本全体</a>や都道府県・国籍のページの表をご覧ください。</p></noscript>
{NOTES}"""
    return page("ダッシュボード", [("日本全体", "index.html"), ("ダッシュボード", None)], body,
                "在留外国人の数を、地域・国籍・在留資格・時点を選んで地図・グラフ・ランキングで見るダッシュボード。", css=("dash.css",), js=("share.js", "dash.js"),
                active="dash")


def sokuho_page():
    body = f"""<h1>法務省・半期速報</h1>
<p class="dintro">出入国在留管理庁が毎年6月末と12月末の数を発表する「在留外国人数について」（報道発表）の数です。
国籍・地域は発表にのっている上位だけ（2022年末までは上位10、2023年6月末からは上位20）で、市区町村の数はありません。
あとで e-Stat に出る確定統計とは別に記録し、<span class="sbadge sp">速報</span><span class="sbadge cf">確定統計</span>の印で分けて示します。</p>
<div id="sokuho"><div id="sokuho-ctl"></div><div id="sokuho-view"><p class="dhelp">読み込み中…</p></div></div>
<noscript><p class="note">このページは JavaScript を使います。数は GitHub の データ/半期速報/半期速報.csv でも見られます。</p></noscript>
<section class="card note"><h2>このページの数について</h2><ul>
<li>法務省の今のサイトにある発表（令和2年末〜）を取り込んでいます。それより前の発表は今のサイトにないため、入れていません。</li>
<li>発表ごとに、資料の URL と公表日を記録しています。同じ時点の発表は1つだけ取り込み、前の発表の数を上書きしません。</li>
<li>取り込むときに、内わけの合計が総数と合うか、同じ時点の確定統計（e-Stat）と同じかを確かめています。</li>
<li>市区町村ごとの数や、国籍×在留資格のくわしい数は<a href="dash.html">ダッシュボード</a>（確定統計）で見られます。</li>
</ul></section>"""
    return page("法務省・半期速報", [("日本全体", "index.html"), ("法務省・半期速報", None)], body,
                "法務省（出入国在留管理庁）の半期速報「在留外国人数について」の国籍・在留資格・都道府県別の数と移り変わり。",
                css=("dash.css",), js=("share.js", "dash.js", "sokuho.js"), active="sokuho")


# ---------------------------------------------------------------- 不法残留・帰化（在留外国人統計とは別の統計）
# 数は データ/不法残留/（make_fuho.py が法務省の報道発表の Excel から作る）と データ/帰化/（make_kika.py が法務省民事局の PDF から作る）。
# グラフも表もページに書く（JavaScript がなくても見える）。点にマウスを合わせると数が出る（SVG の title）。元の数は「表で見る」
# 画像を保存（share.js）は、図の数・タイトル・出典（FUHO_ORG など。画像では後ろに「を加工して作成」が付く）・ハッシュタグをページの JSON から読む（app.js の data-viz="static"）
FUHO_ORG = "出入国在留管理庁「本邦における不法残留者数について」（報道発表）"
KIKA_ORG = "法務省民事局「帰化許可申請者数等の推移」"
FUHO_SRC, KIKA_SRC = FUHO_ORG + "を加工して作成", KIKA_ORG + "を加工して作成"
FUHO_SAVE, KIKA_SAVE = {"src": FUHO_ORG, "tag": "#不法残留"}, {"src": KIKA_ORG, "tag": "#帰化"}
# 難民：毎年の報道発表「令和〇年における難民認定者数等について」（データ/難民/、make_nanmin.py が PDF から作る）。出典の名前は、いちばん新しい発表の表題（nanmin_page で決める）


def save_box(inner, save, chart):
    """図に「画像を保存」を付ける（app.js が JSON を読んでボタンを足す）。save：{"title", "src", "tag", "note"（画像のいちばん下の注記。なくてもよい）}、
    chart：share.js の図の数"""
    save = dict(save)
    if save.get("note"):
        chart["markNote"] = save.pop("note")
    return f'<div class="viz" data-viz="static">{inner}<script type="application/json">{jdump({**save, "chart": chart})}</script></div>'


def day_label(w):
    """2026-07-01 → 2026年7月1日"""
    y, m, d = w.split("-")
    return f"{y}年{int(m)}月{int(d)}日"


def day_x(w):
    y, m, _ = w.split("-")
    return int(y) + (int(m) - 1) / 12


def static_lines(series, title, ticks, head="時点", save=None):
    """いくつかの線の折れ線（ページに書く SVG）。series：[{"name", "cls"（色 1〜7・o）, "pts": [(x, 人数, 時点の名前)]}]、ticks：[(x, 目もりの字)]。
    線が2つ以上なら、線の名前と最後の数を下に書く（色だけに頼らない）。
    パソコン用（横長）とスマホ用（縦長・目もりは間引く。目もりの字は style.css でスマホのとき大きくなる）の2つを書き、画面の幅で切り替える（style.css の .slw・.sln）"""
    xs = [p[0] for s in series for p in s["pts"]]
    x0, x1 = min(xs), max(xs)
    top = max(p[1] for s in series for p in s["pts"]) * 1.05 or 1
    ystep = nice_step(top / 5)
    nt = int(-(-top // ystep))
    ymax = ystep * nt

    def svg_of(W, H, L, R, T, B, gap, dot):
        def X(x):
            return L + (x - x0) / ((x1 - x0) or 1) * (W - L - R)

        def Y(y):
            return T + (1 - y / ymax) * (H - T - B)
        every = max(1, -(-len(ticks) * gap // (W - L - R)))  # 目もりの字が重ならないように間引く（いちばん新しい側を残す）
        g = [f'<svg class="chart lines" viewBox="0 0 {W} {H}" role="img" aria-label="{esc(title)}">']
        for k in range(nt + 1):
            g.append(f'<line class="grid" x1="{L}" x2="{W - R}" y1="{Y(ystep * k):.1f}" y2="{Y(ystep * k):.1f}"/>'
                     f'<text class="ax" x="{L - 6}" y="{Y(ystep * k) + 4:.1f}" text-anchor="end">{man(int(ystep * k))}</text>')
        g += [f'<text class="ax" x="{X(x):.1f}" y="{H - 10}" text-anchor="middle">{esc(lab)}</text>'
              for i, (x, lab) in enumerate(ticks) if (len(ticks) - 1 - i) % every == 0]
        for s in series:
            d = " ".join(f"{'M' if i == 0 else 'L'}{X(x):.1f},{Y(v):.1f}" for i, (x, v, _) in enumerate(s["pts"]))
            g.append(f'<path class="ln s-{s["cls"]}" d="{d}"/>')
            r = dot if len(s["pts"]) <= 30 else dot * 0.7  # 点の多い線（毎年の数など）は小さい点
            g += [f'<circle class="pt s-{s["cls"]}" cx="{X(x):.1f}" cy="{Y(v):.1f}" r="{r:g}"><title>{esc(s["name"])}（{esc(w)}）：{num(v)}人</title></circle>'
                  for x, v, w in s["pts"]]
        return "".join(g) + "</svg>"
    chart = (f'<div class="slw">{svg_of(720, 320, 64, 20, 14, 34, 60, 3.5)}</div>'
             f'<div class="sln">{svg_of(480, 400, 104, 28, 16, 44, 80, 5)}</div>')
    if save:  # 画像を保存：時点の名前（2026年7月1日・2025年）と横の位置（年の目もりが整数の所）は share.js の labels・at
        pos = sorted({w: x for s in series for x, _, w in s["pts"]}.items(), key=lambda a: a[1])
        per = [w for w, _ in pos]
        chart = save_box(chart, save, {
            "kind": "line", "per": per, "labels": per, "at": [x for _, x in pos], "index": False, "area": "全国", "when": per[-1], "from": per[0],
            "whenText": f"{per[0]}〜{per[-1]}",
            "series": [{"name": s["name"], "cls": s["cls"], "vals": [None if m.get(w) is None else int(m[w]) for w in per]}
                       for s, m in zip(series, [{w: v for _, v, w in s["pts"]} for s in series])]})
    legend = ""
    if len(series) > 1:
        legend = ('<ul class="legend" style="max-width:420px">' + "".join(f'<li><span class="sw sw-{s["cls"]}"></span><span>{esc(s["name"])}</span>'
                                                  f'<span class="v">{num(s["pts"][-1][1])}人</span></li>' for s in series) + "</ul>"
                  f'<p class="hint">名前の横の数は、いちばん新しい時点（{esc(series[0]["pts"][-1][2])}）の数です。</p>')
    order = sorted({w: x for s in series for x, _, w in s["pts"]}.items(), key=lambda a: a[1])
    vals = [{w: v for _, v, w in s["pts"]} for s in series]
    th = "".join(f"<th class='n'>{esc(s['name'])}</th>" for s in series)
    rows = "".join(f"<tr><td>{esc(w)}</td>" + "".join(f"<td class='n'>{num(m[w]) if w in m else '—'}</td>" for m in vals) + "</tr>" for w, _ in order)
    return (chart + legend + '<p class="hint">点にマウスを合わせると、その時点の数が出ます。</p>'
            f"<details><summary>グラフの元の数を表で見る</summary><div class='scroll'><table class='t'><tr><th>{esc(head)}</th>{th}</tr>{rows}</table></div></details>")


def static_hbars(items, total, save=None, image="rank", when=""):
    """横棒（ページに書く）。items：[(名前, 人数, まとめた行か)]。割合は total に対する割合。
    save があれば「画像を保存」：image="rank" は多い順のランキング（まとめた行「その他」は入れない）、"pie" は円グラフ（「その他」も入れる）。when：時点の名前"""
    mx = max(v for _, v, _ in items) or 1
    out = '<ul class="hbars">' + "".join(
        f'<li><span class="nm">{esc(n)}</span><span class="track"><span class="fill{" o" if o else ""}" style="width:{v / mx * 100:.1f}%"></span></span>'
        f'<span class="v">{num(v)}人</span><span class="p">{v / total * 100:.1f}%</span></li>' for n, v, o in items) + "</ul>"
    if not save:
        return out
    if image == "rank":
        chart = {"kind": "rank", "rows": [[n, v] for n, v, o in items if not o][:10], "metric": "人数", "area": "全国", "what": "全国の国籍・地域", "whenText": when}
    else:
        chart = {"kind": "pie", "parts": [{"name": n, "v": v, "cls": "o" if o else str(i + 1)} for i, (n, v, o) in enumerate(items)], "total": int(total),
                 "area": "全国", "whenText": when}
    return save_box(out, save, chart)


def diff_text(now, before):
    if before is None:
        return "—"
    return f"{signed(now - before)}（{pct_signed(now - before, before)}）" if before else signed(now - before)


def ymd_text(s):
    """2026-10-16 → 2026年10月16日"""
    return day_label(s) if isinstance(s, str) and s.count("-") == 2 else ""


def fuho_page():
    folder = os.path.join(DATA, "不法残留")
    t = pd.read_csv(os.path.join(folder, "推移.csv")).sort_values(["発表の時点", "時点"])
    t["種別"] = t["種別"].fillna("")
    cross = pd.read_csv(os.path.join(folder, "国籍_在留資格.csv"))
    new = pd.read_csv(os.path.join(folder, "新規.csv"))
    new["種別"] = new["種別"].fillna("")
    last = t["発表の時点"].max()
    lt = t[t["発表の時点"] == last]  # いちばん新しい発表（その時点と、前の4時点の列）

    def series(kind, key, sex="総数"):
        """同じ時点の数は、どの発表でも同じ（make_fuho.py で確かめた。国籍・地域の「その他」は発表ごとに中身が違うので、ここでは使わない）"""
        col = "国籍・地域" if kind == "国籍・地域別" else "在留資格"
        r = t[(t["表"] == kind) & (t[col] == key) & (t["性別"] == sex)]
        return dict(sorted(r.groupby("時点")["人数"].last().items()))

    def latest(kind, key, sex="総数", when=last):
        """いちばん新しい発表の数（「その他」も、その発表の中ではそろっている）"""
        col = "国籍・地域" if kind == "国籍・地域別" else "在留資格"
        r = lt[(lt["表"] == kind) & (lt[col] == key) & (lt["性別"] == sex) & (lt["時点"] == when)]
        return int(r["人数"].iloc[0]) if len(r) else None

    total = series("国籍・地域別", "総数")
    whens = list(total)
    prev = whens[-2]
    ago = f"{int(last[:4]) - 1}{last[4:]}"
    now = total[last]
    pub = lt.iloc[0]

    def tile(label, w):
        b = total.get(w)
        if b is None:
            return ""
        return (f'<div class="kpi"><div class="lab">{label}（{day_label(w)}）から</div><div class="mid">{signed(now - b)}人</div>'
                f'<div class="lab">増減の割合 {pct_signed(now - b, b)}（{num(b)}人から）</div></div>')
    kpi = (f'<div class="kpis"><div class="kpi"><div class="lab">{day_label(last)}現在の不法残留者数</div><div class="big">{num(now)}人</div>'
           f'<div class="lab">男 {num(latest("国籍・地域別", "総数", "男"))}人・女 {num(latest("国籍・地域別", "総数", "女"))}人</div></div>'
           f'{tile("半年前", prev)}{tile("1年前", ago)}</div>')
    years = range(int(whens[0][:4]), int(last[:4]) + 1)
    ticks = [(y, str(y)) for y in years]
    chart_total = static_lines([{"name": "不法残留者数", "cls": "1", "pts": [(day_x(w), v, day_label(w)) for w, v in total.items()]}],
                               "不法残留者数の移り変わり", ticks, save={**FUHO_SAVE, "title": "全国｜不法残留者数の移り変わり"})

    # 国籍・地域（いちばん新しい発表の上位10と「その他」）
    nr = cross[(cross["時点"] == last) & (cross["在留資格"] == "総数") & (cross["国籍・地域"] != "総数")]
    nats = list(nr["国籍・地域"])  # 発表の順（人数の多い順。「その他」は最後）
    nat_now = dict(zip(nr["国籍・地域"], nr["人数"]))
    nat_bars = static_hbars([(n, int(nat_now[n]), n == "その他") for n in nats], now, when=f"{day_label(last)}現在",
                            save={**FUHO_SAVE, "title": "全国｜不法残留者の国籍・地域別人数（上位10）", "note": "国の発表に名前の出ている上位10か国・地域です。"})
    nat_trs = "".join(
        f"<tr><td>{esc(n)}</td><td class='n'>{num(nat_now[n])}</td><td class='n'>{nat_now[n] / now * 100:.1f}%</td>"
        f"<td class='n'>{diff_text(nat_now[n], latest('国籍・地域別', n, when=prev))}</td>"
        f"<td class='n'>{num(latest('国籍・地域別', n, '男'))}</td><td class='n'>{num(latest('国籍・地域別', n, '女'))}</td></tr>" for n in nats)
    nat_table = (f"<div class='scroll'><table class='t'><thead><tr><th>国籍・地域</th><th class='n'>人数</th><th class='n'>割合</th>"
                 f"<th class='n'>半年前から</th><th class='n'>男</th><th class='n'>女</th></tr></thead><tbody>{nat_trs}"
                 f"<tr><td><b>総数</b></td><td class='n'><b>{num(now)}</b></td><td class='n'>100.0%</td><td class='n'>{diff_text(now, total[prev])}</td>"
                 f"<td class='n'>{num(latest('国籍・地域別', '総数', '男'))}</td><td class='n'>{num(latest('国籍・地域別', '総数', '女'))}</td></tr></tbody></table></div>")
    top_nats = [n for n in nats if n != "その他"][:7]
    chart_nat = static_lines([{"name": n, "cls": str(i + 1), "pts": [(day_x(w), v, day_label(w)) for w, v in series("国籍・地域別", n).items()]}
                              for i, n in enumerate(top_nats)], "国籍・地域別の不法残留者数の移り変わり", ticks,
                             save={**FUHO_SAVE, "title": "全国｜不法残留者の国籍・地域別の移り変わり（上位7）"})

    # 在留資格（不法残留になったときの在留資格）
    vr = lt[(lt["表"] == "在留資格別") & (lt["時点"] == last) & (lt["在留資格"] != "総数")]
    visas = [v for v, k in zip(vr["在留資格"], vr["種別"]) if not k]
    vnow = dict(zip(vr["在留資格"], vr["人数"]))
    visa_note = "在留資格は、不法残留になったときにもっていた在留資格です。"
    visa_bars = static_hbars([(v, int(vnow[v]), v == "その他") for v in visas], now, image="pie", when=f"{day_label(last)}現在",
                             save={**FUHO_SAVE, "title": "全国｜不法残留者の在留資格別構成", "note": visa_note})
    visa_trs = ""
    for v, k in zip(vr["在留資格"], vr["種別"]):
        name = f"<span class='sub'>うち {esc(v)}</span>" if k else esc(v)
        visa_trs += (f"<tr><td>{name}</td><td class='n'>{num(vnow[v])}</td><td class='n'>{vnow[v] / now * 100:.1f}%</td>"
                     f"<td class='n'>{diff_text(vnow[v], latest('在留資格別', v, when=prev))}</td></tr>")
    visa_table = (f"<div class='scroll'><table class='t'><thead><tr><th>在留資格</th><th class='n'>人数</th><th class='n'>割合</th><th class='n'>半年前から</th></tr></thead>"
                  f"<tbody>{visa_trs}<tr><td><b>総数</b></td><td class='n'><b>{num(now)}</b></td><td class='n'>100.0%</td>"
                  f"<td class='n'>{diff_text(now, total[prev])}</td></tr></tbody></table></div>")
    chart_visa = static_lines([{"name": v, "cls": "o" if v == "その他" else str(i + 1), "pts": [(day_x(w), x, day_label(w)) for w, x in series("在留資格別", v).items()]}
                               for i, v in enumerate(visas)], "在留資格別の不法残留者数の移り変わり", ticks,
                              save={**FUHO_SAVE, "title": "全国｜不法残留者の在留資格別の移り変わり", "note": visa_note})

    # 国籍・地域 × 在留資格
    cx = cross[cross["時点"] == last]
    cell = {(a, b): int(n) for a, b, n in zip(cx["国籍・地域"], cx["在留資格"], cx["人数"])}
    cols = ["総数"] + visas
    cross_trs = "".join(f"<tr><td>{'<b>総数</b>' if a == '総数' else esc(a)}</td>" +
                        "".join(f"<td class='n'>{num(cell[(a, b)])}</td>" for b in cols) + "</tr>" for a in nats + ["総数"])
    cross_table = (f"<div class='scroll'><table class='t'><thead><tr><th>国籍・地域</th>" + "".join(f"<th class='n'>{esc(b)}</th>" for b in cols) +
                   f"</tr></thead><tbody>{cross_trs}</tbody></table></div>")

    # 新規不法残留者数（2026年1月1日の発表から）
    def new_block(w):
        r = new[new["時点"] == w]
        out = ""
        for kind, head in (("国籍・地域別", "国籍・地域"), ("在留資格別", "在留資格")):
            q = r[r["表"] == kind]
            p = {(a, k): int(n) for a, k, n in zip(q["名前"], q["区分"], q["人数"])}
            sub = dict(zip(q["名前"], q["種別"]))
            names = list(dict.fromkeys(q["名前"]))
            names = [a for a in names if a != "総数"] + ["総数"]
            label = lambda a: "<b>総数</b>" if a == "総数" else (f"<span class='sub'>うち {esc(a)}</span>" if sub.get(a) else esc(a))
            share = lambda a: f"{p[(a, '新規')] / p[(a, 'その時点の数')] * 100:.1f}%" if p[(a, "その時点の数")] else "—"
            trs = "".join(f"<tr><td>{label(a)}</td><td class='n'>{num(p[(a, '新規')])}</td><td class='n'>{num(p[(a, 'その時点の数')])}</td>"
                          f"<td class='n'>{share(a)}</td><td class='n'>{num(p[(a, '前の時点の数')])}</td><td class='n'>{num(p[(a, '減少')])}</td></tr>" for a in names)
            out += (f"<h3>{head}別</h3><div class='scroll'><table class='t'><thead><tr><th>{head}</th><th class='n'>新規</th>"
                    f"<th class='n'>{day_label(w)}の数</th><th class='n'>そのうち新規の割合</th><th class='n'>前の時点の数</th><th class='n'>減少</th></tr></thead>"
                    f"<tbody>{trs}</tbody></table></div>")
        return out
    new_whens = sorted(new["時点"].unique())
    n_total = new[(new["時点"] == last) & (new["表"] == "国籍・地域別") & (new["名前"] == "総数")].set_index("区分")["人数"]
    new_sec = ""
    if last in new_whens:
        # 新規の表が比べている前の時点は発表ごとに違う（2026年1月1日の発表は1年前、2026年7月1日の発表は半年前）。表に時点の列はないので、総数が同じ時点を探す
        before = max(w for w in whens if w < last and total[w] == n_total["前の時点の数"])
        new_sec = f"""<section class="card" id="new"><h2>新しく分かった不法残留者（新規）</h2>
<p>{day_label(before)}のあとに新しく分かり、{day_label(last)}も不法残留している人（国の発表では「新規不法残留者」）は <b>{num(n_total["新規"])}人</b>で、
{day_label(last)}の不法残留者数の{n_total["新規"] / n_total["その時点の数"] * 100:.1f}%です。
{day_label(before)}にいた{num(n_total["前の時点の数"])}人のうち、{num(n_total["減少"])}人は数から外れています（国の発表では「減少」。送還された人・出国命令で出国した人・在留特別許可を受けた人など）。</p>
<p class="note">国籍・地域と在留資格は、新規の人の多い順に国の発表に出ているものです（上の表の上位10とは顔ぶれが違うので、「その他」の中身も違います）。
「出国期間」は、在留資格を取り消されたあと、出国のために認められた期間のことです。</p>
{new_block(last)}
{"".join(f"<details><summary>{day_label(w)}の発表の新規を見る</summary>{new_block(w)}</details>" for w in new_whens if w != last)}
<p class="note">新規の数は、{day_label(new_whens[0])}の発表から出ています。</p></section>"""

    pubs = t.drop_duplicates("発表の時点")[["発表の時点", "公表日", "発表のページ"]].sort_values("発表の時点", ascending=False).values.tolist()
    pub_list = "".join(f'<li><a href="{esc(u)}">{day_label(w)}現在</a>（公表 {ymd_text(p)}）</li>' for w, p, u in pubs)
    # 見せる順（大事なものから）：① 全国の総数と増減 → ② 国籍・地域別 → ③ 選んだ国籍・地域のくわしい数 → ④ 在留資格別 → ⑤ 推移 → ⑥ 新規・減少 → ⑦ くわしい数 → ⑧ 出典と注意（たたむ）。
    # ①〜⑦ は fuho.js が選んだ時点・国籍・地域に合わせて作る。JavaScript が動かないときは、同じ順でいちばん新しい発表の数を noscript に書いておく（目次のリンク先の id も同じ）
    up = '<p class="kup"><a href="#toc">↑ 上に戻る（目次）</a></p>'
    body = f"""<h1>不法残留者数</h1>
<p class="lead">在留期間が過ぎたあとも日本から出国していない外国人の数です（国の発表のことばで「不法残留者」）。出入国在留管理庁が毎年1月1日と7月1日の数を発表しています。
<a href="index.html">在留外国人の数</a>（在留外国人統計）とは別の統計で、在留外国人の数には入っていません。</p>
<p class="meta"><span>対象：<b>日本全体</b></span><span>時点：<b>{day_label(last)}現在</b>（{ymd_text(pub["公表日"])}公表の発表。移り変わりは{day_label(whens[0])}から）</span></p>
<p class="dintro">すぐ下の欄で「時点」と「国籍・地域」を選ぶと、ページ全体が切り替わります。選んだ条件はこのページのアドレスに残るので、アドレスを送れば同じ画面を見てもらえます。どの図も「画像を保存」で X投稿用の画像にできます。</p>
<div id="fuho"><div id="fuho-ctl"></div><div id="fuho-view"><p class="dhelp">読み込み中…</p></div></div>
<noscript><p class="note">選んで見る部分は JavaScript を使います。下は、いちばん新しい発表の数です。</p>
{jump([("total", "全国の総数"), ("nat", "国籍別"), ("visa", "在留資格別"), ("trend", "推移"), ("new", "新規・減少"), ("list", "取り込んだ発表"), ("notes", "出典と注意")], nid="toc")}
<section class="card" id="total"><h2>日本に不法残留者は何人いる？</h2>
{kpi}{up}</section>
<section class="card" id="nat"><h2>どの国籍・地域の人が多い？（{day_label(last)}現在）</h2>
<p class="note">国の発表に名前の出ている上位10か国・地域と、それ以外をまとめた「その他」です。割合は不法残留者数（{num(now)}人）に対する割合です。</p>
{nat_bars}
{nat_table}{up}</section>
<section class="card" id="visa"><h2>どの在留資格で不法残留になった？（{day_label(last)}現在）</h2>
<p class="note">在留資格は、不法残留になったときにもっていた在留資格です。「留学」には、昔の在留資格「就学」（2010年7月より前）だった人も入ります。
「その他」は、ここに名前の出ていない在留資格を合わせた数です。</p>
{visa_bars}
{visa_table}
<h3>国籍・地域 × 在留資格</h3>
<p class="note">技能実習の号ごとの内わけは、GitHub の表（データ/不法残留/国籍_在留資格.csv）にあります。</p>
{cross_table}{up}</section>
<section class="card" id="trend"><h2>増えている？減っている？</h2>
{chart_total}
<p class="note">{whens[0][:4]}〜2020年は、毎年1月1日の数です（発表の表にある時点）。2021年からは1月1日と7月1日の年2回です。
それより前の数は、発表の資料ではグラフの絵だけで表がないため、ここには入れていません（発表のグラフは1990年からで、いちばん多いのは1993年5月1日の298,646人）。</p>
<h3>上位7か国・地域の移り変わり</h3>
{chart_nat}
<h3>在留資格別の移り変わり</h3>
{chart_visa}{up}</section>
{new_sec}
<section class="card" id="list"><h2>取り込んだ発表</h2><ul>{pub_list}</ul>{up}</section></noscript>
<section class="card" id="notes"><h2>出典と、数を見るときの注意</h2>
<details class="kfold"><summary>出典と注意を開く</summary><ul class="note">
<li>出典：{FUHO_SRC}。</li>
<li>不法残留者は、入管法第24条の不法残留の規定に当たる人です。国が出入国の記録と退去強制の手続きの情報などから出した<b>概数</b>です。</li>
<li>時点は1月1日と7月1日です（2020年までは1月1日だけ）。在留外国人統計（6月末・12月末）とは時点も数え方も違うので、そのまま足したり割ったりできません。</li>
<li>国籍・地域は、発表ごとの上位10か国・地域だけです。上位の顔ぶれは発表ごとに変わるので、「その他」に入っている国は発表によって違います。上位10に入っていない時点の数は「公表データなし」「—」で、0人ではありません。</li>
<li>ただし、新規不法残留者の表（{day_label(new_whens[0]) if new_whens else ""}現在の発表から）は、新規の人の多い国籍・地域ごとに「その時点の数」「前の時点の数」ものせています。上位10に入っていない時点でも、この表にのっている数は使っています（同じ統計の同じ時点の数です。表では※を付けています）。</li>
<li>在留資格は、不法残留になったときにもっていた在留資格です。技能実習の号（1号・2号・3号、イ・ロ）の数は技能実習の内数です。</li>
<li>「新規」は、前の時点のあと（その半期など）に新しく分かり、基準日にも不法残留している人です。「減少」は、前の時点にいた人のうち基準日までに数から外れた人で、送還された人だけではありません（出国命令で出国した人、在留特別許可を受けた人なども入ります）。新規・減少は、総数の増減とは別の数です。比べる前の時点は発表ごとに違います（2026年1月1日現在の発表は1年前の2025年1月1日、2026年7月1日現在の発表は半年前の2026年1月1日。発表の表のとおり）。</li>
<li>同じ時点の数は、どの発表でも同じでした（あとから直された数はありません）。取り込むときに、内わけの合計が総数と合うかも確かめています。</li>
<li>グラフの色は、国籍・地域ごと・在留資格ごとに決めていて、ページのどのグラフでも同じです。色は7つなので、8つ目からの国籍・地域は同じ色の点線（棒はしま模様）で分けています。</li>
<li>表（1行に1つの数の CSV）は GitHub の「データ/不法残留/」にあります：<a href="{REPO_URL}">{REPO_URL}</a></li>
</ul></details>{up}</section>
{related([("kika.html", "帰化", "帰化の申請・許可の数"), ("nanmin.html", "難民の認定と保護の数", "難民認定の申請・認定などの数"), ("sokuho.html", "半期速報", "在留外国人の新しい数"), ("visa-index.html", "在留資格から探す", "在留外国人の在留資格別の人数"),
          ("about.html", "このサイトについて", "使っているデータと注意")])}"""
    return page("不法残留者数", [("日本全体", "index.html"), ("不法残留者数", None)], body,
                "出入国在留管理庁が発表している不法残留者数の移り変わりと、国籍・地域別・在留資格別の数。", css=("dash.css",), js=("share.js", "dash.js", "fuho.js"),
                active="fuho", src=FUHO_SRC)


def kika_page():
    folder = os.path.join(DATA, "帰化")
    t = pd.read_csv(os.path.join(folder, "帰化の推移.csv"), dtype={"年": str})
    byn = pd.read_csv(os.path.join(folder, "国籍別帰化許可者数.csv"), dtype={"順位": str})
    nat = pd.read_csv(os.path.join(folder, "国籍取得と離脱.csv"))
    yearly = t[t["年"].str.isdigit()]
    s = defaultdict(dict)  # (項目, 国籍・地域) → {年: 人数}
    for y, item, n, v in zip(yearly["年"], yearly["項目"], yearly["国籍・地域"], yearly["人数"]):
        s[(item, n)][int(y)] = int(v)
    ok, ap, ng = s[("帰化許可者数", "総数")], s[("帰化許可申請者数", "総数")], s[("帰化不許可者数", "総数")]
    last = max(ok)
    total_all = int(t[(t["項目"] == "帰化許可者数") & (t["国籍・地域"] == "総数")]["人数"].sum())
    first = min(ok)
    tot_row = lambda key: int(t[(t["年"] == key) & (t["項目"] == "帰化許可者数") & (t["国籍・地域"] == "総数")]["人数"].iloc[0])
    pre, agg = tot_row("-1952"), tot_row("1952-1966")  # 1952年4月27日以前（合計だけ）、1952年4月28日〜1966年（まとめた数）
    ticks = [(y, str(y)) for y in range((first + 9) // 10 * 10, last + 1, 10)]
    pts = lambda m: [(y, v, f"{y}年") for y, v in sorted(m.items())]
    chart_main = static_lines([{"name": "帰化許可申請者数", "cls": "1", "pts": pts(ap)}, {"name": "帰化許可者数", "cls": "2", "pts": pts(ok)},
                               {"name": "帰化不許可者数", "cls": "3", "pts": pts(ng)}], "帰化の申請・許可・不許可の数の移り変わり", ticks, head="年",
                              save={**KIKA_SAVE, "title": "全国｜帰化の申請・許可・不許可の人数の移り変わり",
                                    "note": "それぞれ、その年（1月〜12月）にあった数です。その年に申請した人がその年に許可・不許可になったとは限りません。"})
    chart_nat = static_lines([{"name": n, "cls": c, "pts": pts(s[("帰化許可者数", n)])} for n, c in (("韓国・朝鮮", "1"), ("中国", "2"), ("その他", "o"))],
                             "国籍別の帰化許可者数の移り変わり", ticks, head="年",
                             save={**KIKA_SAVE, "title": "全国｜帰化許可者の国籍別の移り変わり", "note": "国籍は、法務省の表の「韓国・朝鮮」「中国」「その他」の3つです。"})

    # 毎年の表（新しい年から）。1952年4月28日〜1966年はまとめた数、1952年4月27日以前は合計だけ
    cols = [("帰化許可申請者数", "総数"), ("帰化許可者数", "総数"), ("帰化許可者数", "韓国・朝鮮"), ("帰化許可者数", "中国"), ("帰化許可者数", "その他"), ("帰化不許可者数", "総数")]
    cell = {(y, i, n): int(v) for y, i, n, v in zip(t["年"], t["項目"], t["国籍・地域"], t["人数"])}
    era = {"令和": 2018, "平成": 1988, "昭和": 1925}
    # まとめた期間の行の名前は、表の書き方（昭和27年(4月28日)～昭和41年）を西暦に（1952年4月28日～1966年）
    seireki = lambda s: re.sub(r"\((\d+月\d+日)\)", r"\1", re.sub(r"(令和|平成|昭和)(\d+)年", lambda m: f"{era[m.group(1)] + int(m.group(2))}年", s))
    labels = {y: seireki(s) for y, s in zip(t["年"], t["年の書き方"])}
    order = sorted([y for y in labels if y.isdigit()], key=int, reverse=True) + [y for y in labels if not y.isdigit()]
    trs = "".join(f"<tr><td>{esc(y + '年' if y.isdigit() else labels[y])}</td>" +
                  "".join(f"<td class='n'>{num(cell[(y, i, n)]) if (y, i, n) in cell else '—'}</td>" for i, n in cols) + "</tr>" for y in order)
    year_table = ("<div class='scroll'><table class='t'><thead><tr><th>年</th><th class='n'>申請者数</th><th class='n'>許可者数</th>"
                  "<th class='n'>うち韓国・朝鮮</th><th class='n'>うち中国</th><th class='n'>うちその他</th><th class='n'>不許可者数</th></tr></thead>"
                  f"<tbody>{trs}</tbody></table></div>")

    # 国籍別（2019年からの上位10。2019〜2022年は前の版の保存版から）。同じ人数は同じ順位（2019年は8位が2つ）なので、表は上から何番目かで並べる
    ys = sorted(byn["年"].unique())
    ranked = {int(y): [(r, n, int(v)) for r, n, v in zip(g["順位"].fillna(""), g["国籍・地域"], g["人数"]) if r] for y, g in byn.groupby("年")}
    rest = {(int(y), n): int(v) for y, r, n, v in zip(byn["年"], byn["順位"].fillna(""), byn["国籍・地域"], byn["人数"]) if not r}
    rank_trs = "".join("<tr>" + "".join(f"<td class='n'>{ranked[y][k][0]}</td><td>{esc(ranked[y][k][1])}</td><td class='n'>{num(ranked[y][k][2])}</td>"
                                        if k < len(ranked[y]) else "<td></td><td></td><td></td>" for y in ys) + "</tr>"
                       for k in range(max(len(v) for v in ranked.values())))
    rank_trs += "".join(f"<tr>" + "".join(f"<td></td><td>{n}</td><td class='n'>{num(rest[(y, n)])}</td>" for y in ys) + "</tr>" for n in ("その他", "総数"))
    rank_table = ("<div class='scroll'><table class='t'><thead><tr>" + "".join(f"<th colspan='3'>{y}年</th>" for y in ys) +
                  f"</tr></thead><tbody>{rank_trs}</tbody></table></div>")
    ly = ys[-1]
    rank_bars = static_hbars([(n, v, False) for _, n, v in ranked[ly]] + [("その他", rest[(ly, "その他")], True)], rest[(ly, "総数")], when=f"{ly}年",
                             save={**KIKA_SAVE, "title": "全国｜帰化許可者の国籍・地域別人数（上位10）"})

    # 国籍の取得（届け出）と離脱
    nt = nat.pivot_table(index="年", columns="項目", values="人数", aggfunc="first")
    nat_trs = "".join(f"<tr><td>{y}年</td><td class='n'>{num(r['国籍取得者数'])}</td><td class='n'>{num(r['国籍離脱者数'])}</td></tr>" for y, r in nt.sort_index(ascending=False).iterrows())
    nat_table = ("<div class='scroll'><table class='t'><thead><tr><th>年</th><th class='n'>国籍取得者数</th><th class='n'>国籍離脱者数</th></tr></thead>"
                 f"<tbody>{nat_trs}</tbody></table></div>")

    # 見せる順（大事なものから）：① これまでの累計 → ② 国籍別 → ③ 毎年の推移 → ④ くわしい数（たたむ）→ ⑤ 出典と注意（たたむ）。
    # ①〜④ は kika.js が対象の年に合わせて作る。JavaScript が動かないときは、同じ順で{last}年までの数を noscript に書いておく（目次のリンク先の id も同じ）
    chart_ok = static_lines([{"name": "帰化許可者数", "cls": "2", "pts": pts(ok)}], "帰化許可者数の移り変わり", ticks, head="年",
                            save={**KIKA_SAVE, "title": "全国｜帰化許可者数の移り変わり", "note": "その年（1月〜12月）に帰化を許可された人数です。"})
    up = '<p class="kup"><a href="#toc">↑ 上に戻る（目次）</a></p>'
    body = f"""<h1>帰化の数</h1>
<p class="lead">帰化は、外国の国籍の人が法務大臣の許可を受けて日本の国籍を取ることです。法務省民事局が発表している、毎年（1月〜12月）の帰化の人数をまとめました。
帰化して日本の国籍になった人は、<a href="index.html">在留外国人の数</a>には入りません。</p>
<p class="meta"><span>対象：<b>日本全体</b></span><span>期間：<b>1952年〜{last}年</b>（毎年1月〜12月の人数。{first - 1}年まではまとめた数）</span></p>
{jump([("total", "① これまでの累計"), ("nat", "② 国籍別"), ("trend", "③ 毎年の推移"), ("more", "④ くわしい数"), ("notes", "⑤ 出典と注意")], nid="toc")}
<p class="dintro">「対象の年」を変えると、その年までの累計と、その年の数に変わります。選んだ条件はこのページのアドレスに残るので、アドレスを送れば同じ画面を見てもらえます。どの図も「画像を保存」で X投稿用の画像にできます。</p>
<div id="kika"><div id="kika-ctl"></div><div id="kika-view"><p class="dhelp">読み込み中…</p></div></div>
<noscript><p class="note">選んで見る部分は JavaScript を使います。下は、{last}年までの発表の数をまとめたものです。</p>
<section class="card" id="total"><h2>日本では、これまで何人が帰化した？</h2>
<p>1952年〜{last}年に帰化を許可された人の累計：<b class="kbig">{num(total_all)}人</b></p>
<p class="note">1952年4月27日以前の{num(pre)}人を含みます。{last}年の帰化許可者数は{num(ok[last])}人（前の年から {signed(ok[last] - ok[last - 1])}人）。
過去に帰化を許可された人数を足し合わせた数で、いま生きている人や、いま日本に住んでいる人の数ではありません。</p>{up}</section>
<section class="card" id="nat"><h2>どの国籍の人が帰化した？</h2>
<h3>{ly}年の上位10か国・地域</h3>
<p class="note">割合は、{ly}年の帰化許可者数（{num(rest[(ly, "総数")])}人）に対する割合です。発表は上位10か国・地域だけで、ほかは「その他」にまとめられています。</p>
{rank_bars}
<h3>{ys[0]}年からの上位10か国・地域</h3>
{rank_table}
<h3>韓国・朝鮮、中国、その他の移り変わり</h3>
<p class="note">毎年の数の表は、国籍を「韓国・朝鮮」「中国」「その他」の3つに分けています。それより細かい国籍の数（上位10）は、{ys[0]}年からの分だけです（{ys[0]}〜2022年は、法務省のページの前の版をインターネット・アーカイブの保存版から読んだもの）。</p>
{chart_nat}{up}</section>
<section class="card" id="trend"><h2>毎年、何人が帰化している？</h2>
{chart_ok}
<p class="note">1952年4月28日〜{first - 1}年はまとめた数（{num(agg)}人）だけなので、グラフには入れていません。</p>{up}</section>
<section class="card" id="more"><h2>くわしい数</h2>
<h3>申請・許可・不許可の数の移り変わり</h3>
{chart_main}
<p class="note">申請者数は{min(ap)}年から、不許可者数は{min(ng)}年からの数です。それぞれその年にあった数で、その年に申請した人がその年に許可・不許可になったとは限らないので、許可者数÷申請者数は「許可される割合」にはなりません。</p>
<h3>毎年の数</h3>
<p class="note">「—」は、その年の数がない（発表の表にない）所です。</p>
{year_table}
<h3>国籍の取得（届け出）と離脱</h3>
<p class="note">帰化とは別の数です。国籍取得者数は、国籍法第3条・第17条などにもとづいて、届け出で日本の国籍を取った人の数です。
国籍離脱者数は、国籍法第13条にもとづいて日本の国籍をはなれた人の数です。最近の10年分が発表されています。</p>
{nat_table}{up}</section></noscript>
<section class="card" id="notes"><h2>出典と、数を見るときの注意</h2>
<details class="kfold"><summary>出典と注意を開く</summary><ul class="note">
<li>出典：{KIKA_SRC}（<a href="https://www.moj.go.jp/MINJI/toukei_t_minj03.html">https://www.moj.go.jp/MINJI/toukei_t_minj03.html</a>）。</li>
<li>どれも暦年（1月〜12月）の人数です。</li>
<li>発表の数は、範囲が3つあります。このページでは混ぜずに示しています。
<b>毎年の合計</b>：帰化許可者数は1952年から（1952年4月27日以前は合計だけ、1952年4月28日〜{first - 1}年はまとめた数、{first}年から毎年）。申請者数は{min(ap)}年から、不許可者数は{min(ng)}年から。
<b>国籍の3区分</b>（韓国・朝鮮／中国／その他）：1952年4月28日から。1952年4月27日以前の{num(pre)}人は区分がないので、どの国籍にも入れていません。
<b>くわしい国籍</b>：{ys[0]}年から、毎年の上位10か国・地域だけ。</li>
<li>累計（{num(total_all)}人など）は、過去に帰化を許可された人数を足し合わせた数です。いま生きている人や、いま日本に住んでいる人の数ではありません。</li>
<li>くわしい国籍をいくつかの年で足した数は、各年の上位10にのった人数だけを足した「掲載分」です。上位10に入らなかった年の人数は分からないので足していません（0人として扱ってはいません）。そのため順位は付けていません。</li>
<li>2010年の帰化許可者数は、法務省の注記のとおり、官報の正誤（中国2人）を反映した数です。</li>
<li>国籍別の上位10の{ys[0]}〜2022年は、法務省のページに前にのっていた PDF を、インターネット・アーカイブ（web.archive.org）に保存された版から読んだものです。
同じ年が2つ以上の版にあるときは、新しい版の数を使っています（2023年の「その他」は、前の版では956人、新しい版では892人。新しい版は、上位10と足すと総数と合います）。</li>
<li>取り込むときに、どの年も 許可者数の合計＝韓国・朝鮮＋中国＋その他 になっているか、累計が毎年の数の和と同じか、国籍別の表と毎年の表が同じ数かを確かめています。</li>
<li>表（1行に1つの数の CSV）は GitHub の「データ/帰化/」にあります：<a href="{REPO_URL}">{REPO_URL}</a></li>
</ul></details>{up}</section>
{related([("fuho.html", "不法残留者数", "在留期間が過ぎたあとも出国していない人の数"), ("nanmin.html", "難民の認定と保護の数", "難民認定の申請・認定などの数"), ("nat-index.html", "国籍から探す", "在留外国人の国籍・地域別の人数"),
          ("about.html", "このサイトについて", "使っているデータと注意")])}"""
    return page("帰化の数", [("日本全体", "index.html"), ("帰化の数", None)], body,
                f"1952年〜{last}年に帰化を許可された人は合わせて{num(total_all)}人（法務省民事局の発表）。国籍別の帰化許可者数と、毎年の移り変わり。", css=("dash.css",), js=("share.js", "dash.js", "kika.js"),
                active="kika", src=KIKA_SRC)


def nanmin_page():
    """難民認定などの数（在留外国人統計とは別の統計）。選んで見る部分は nanmin.js が data/nanmin.json から作る。
    JavaScript が動かないときは、いちばん新しい年の数と、1978年からの毎年の数を noscript に書いておく（目次のリンク先の id は nanmin.js の欄と同じ）"""
    folder = os.path.join(DATA, "難民")
    t = pd.read_csv(os.path.join(folder, "毎年の数.csv"))
    nt = pd.read_csv(os.path.join(folder, "国籍別.csv"))
    rel = pd.read_csv(os.path.join(BASE, "元データ", "難民_出どころ一覧.csv"))
    syr_key = "（参考）シリア人留学生の受入れ"
    t = t[t["項目"] != syr_key]
    s = defaultdict(dict)  # 項目 → {年: 人数}
    for y, item, v in zip(t["年"], t["項目"], t["人数"]):
        s[item][int(y)] = int(v)
    label = dict(zip(t["年"].astype(int), t["年の書き方"]))
    years = sorted(label)
    last, first = years[-1], years[0]
    newest = rel[rel["年"] == rel["年"].max()].iloc[0]
    org = f"出入国在留管理庁「{newest['表題']}」など（報道発表）"
    src = org + "を加工して作成"
    save = {"src": org, "tag": "#難民"}
    g = lambda item, y: s[item].get(y)
    cell = lambda item, y: num(g(item, y)) if g(item, y) is not None else "—"
    prot = [("条約難民", "難民と認定（条約難民）", "1"), ("補完的保護対象者", "補完的保護対象者と認定", "2"), ("その他の保護", "人道的な配慮で在留を許可（その他の保護）", "3"),
            ("定住難民", "定住難民として受入れ（インドシナ難民・第三国定住）", "4")]
    tot = g("合計", last)
    cum = sum(s["合計"].values())
    # 国籍・地域別（いちばん新しい年）
    def nat_rows(item, y):
        q = nt[(nt["項目"] == item) & (nt["年"] == y)]
        return [(n, int(v), None if pd.isna(k) else int(k)) for n, v, k in zip(q["国籍・地域"], q["人数"], q["うち審査請求"])]
    ap = [r for r in nat_rows("難民認定申請者数", last) if r[0] != "総数"]
    ok = [r for r in nat_rows("難民認定者数", last) if r[0] != "総数"]
    ap_bars = static_hbars([(n, v, False) for n, v, _ in ap[:15]], g("難民認定申請者数", last), when=f"{last}年",
                           save={**save, "title": f"全国｜{last}年の難民認定申請者の国籍・地域別人数（上位15）"})
    ok_trs = "".join(f"<tr><td>{esc(n)}</td><td class='n'>{num(v)}</td><td class='n'>{num(k) if k is not None else '—'}</td></tr>" for n, v, k in ok)
    ok_table = (f"<div class='scroll'><table class='t'><thead><tr><th>国籍・地域</th><th class='n'>難民と認定された人</th><th class='n'>うち審査請求で認定</th></tr></thead>"
                f"<tbody>{ok_trs}<tr><td><b>総数</b></td><td class='n'><b>{cell('条約難民', last)}</b></td><td class='n'>{cell('条約難民のうち審査請求で認定', last)}</td></tr></tbody></table></div>")
    ticks = [(y, str(y)) for y in range((first + 9) // 10 * 10, last + 1, 10)]
    pts = lambda item: [(y, v, f"{y}年") for y, v in sorted(s[item].items())]
    chart_ap = static_lines([{"name": "難民認定申請者数", "cls": "5", "pts": pts("難民認定申請者数")}], "難民認定申請者数の移り変わり", ticks, head="年",
                            save={**save, "title": "全国｜難民認定申請者数の移り変わり"})
    chart_pr = static_lines([{"name": k, "cls": c, "pts": pts(k)} for k, _, c in prot], "難民と認定・保護した人の数の移り変わり", ticks, head="年",
                            save={**save, "title": "全国｜難民と認定・保護した人の数の移り変わり"})
    cols = ["難民認定申請者数", "補完的保護対象者認定申請者数", "定住難民", "条約難民", "条約難民のうち審査請求で認定", "補完的保護対象者", "その他の保護", "合計"]
    year_trs = "".join(f"<tr><td>{y}年（{esc(label[y])}）</td>" + "".join(f"<td class='n'>{cell(c, y)}</td>" for c in cols) + "</tr>" for y in reversed(years))
    year_table = ("<div class='scroll'><table class='t'><thead><tr><th>年</th><th class='n'>難民認定申請者数</th><th class='n'>補完的保護の申請者数</th><th class='n'>定住難民</th>"
                  "<th class='n'>条約難民</th><th class='n'>うち審査請求で認定</th><th class='n'>補完的保護対象者</th><th class='n'>その他の保護</th><th class='n'>合計</th></tr></thead>"
                  f"<tbody>{year_trs}</tbody></table></div>")
    pubs = rel.drop_duplicates("年").sort_values("年", ascending=False)
    pub_list = "".join(f'<li><a href="{esc(u)}">{esc(ti)}</a>（公表 {ymd_text(p)}）</li>' for ti, u, p in zip(pubs["表題"], pubs["発表のページ"], pubs["公表日"]))
    chk = pd.read_csv(os.path.join(folder, "確かめ.csv"))
    overlap = "合計は国の表の「合計」です。定住難民として受け入れたあと条約難民と認定された人や、一次審査で人道配慮となったあと審査請求で難民と認定された人などは、重複して数えられています。"
    up = '<p class="kup"><a href="#toc">↑ 上に戻る（目次）</a></p>'
    body = f"""<h1>難民の認定と保護の数</h1>
<p class="lead">日本で難民と認定された人、難民に近い立場として保護された人、難民の認定を申請した人などの数です。出入国在留管理庁が毎年、前の年（1月〜12月）の数を発表しています。
<a href="index.html">在留外国人の数</a>（在留外国人統計）とは別の統計です。
申請の流れや、手続き中に働けるか・住民票や健康保険・税金・家族などの決まりは<a href="nanmin-seido.html">難民の申請と、手続き中のくらし</a>にまとめています。</p>
<p class="meta"><span>対象：<b>日本全体</b></span><span>期間：<b>{first}年〜{last}年</b>（毎年1月〜12月の人数。{ymd_text(newest["公表日"])}公表の発表まで）</span></p>
{jump([("total", "① その年の数と累計"), ("nat", "② 国籍・地域別"), ("pick", "③ 選んだ国籍・地域"), ("visa", "④ 申請したときの在留資格"), ("trend", "⑤ 移り変わり"),
       ("proc", "⑥ 審査の進み方"), ("more", "⑦ くわしい数"), ("notes", "⑧ 出典と注意")], nid="toc")}
<p class="dintro">「対象の年」を変えると、その年の数と、その年までの累計に変わります。選んだ条件はこのページのアドレスに残るので、アドレスを送れば同じ画面を見てもらえます。どの図も「画像を保存」で X投稿用の画像にできます。</p>
<div id="nanmin"><div id="nanmin-ctl"></div><div id="nanmin-view"><p class="dhelp">読み込み中…</p></div></div>
<noscript><p class="note">選んで見る部分は JavaScript を使います。下は、{last}年までの発表の数をまとめたものです。</p>
<section class="card" id="total"><h2>日本では、何人が難民と認定・保護された？</h2>
<p>{last}年に難民と認定された人（条約難民）：<b class="kbig">{cell("条約難民", last)}人</b>（うち審査請求で認定 {cell("条約難民のうち審査請求で認定", last)}人）</p>
<p>{last}年の難民認定申請者数：<b>{cell("難民認定申請者数", last)}人</b></p>
<div class='scroll'><table class='t'><thead><tr><th>{last}年に認定・保護した人</th><th class='n'>人数</th></tr></thead><tbody>
{"".join(f"<tr><td>{esc(n)}</td><td class='n'>{cell(k, last)}</td></tr>" for k, n, _ in prot)}<tr><td><b>合計</b></td><td class='n'><b>{num(tot)}</b></td></tr></tbody></table></div>
<p class="note">{overlap}{first}年〜{last}年の合計は{num(cum)}人です（毎年の数を足し合わせた数で、いま日本に住んでいる人の数ではありません）。</p>{up}</section>
<section class="card" id="nat"><h2>どの国籍・地域の人が申請・認定された？</h2>
<h3>{last}年に難民認定を申請した人（上位15）</h3>
{ap_bars}
<h3>{last}年に難民と認定された人</h3>
{ok_table}{up}</section>
<section class="card" id="trend"><h2>増えている？減っている？</h2>
<h3>難民認定申請者数</h3>
{chart_ap}
<h3>難民と認定・保護した人</h3>
{chart_pr}{up}</section>
<section class="card" id="more"><h2>毎年の数</h2>
<p class="note">「—」は、国の表に数のない所です（0人ではありません）。</p>
{year_table}
<h3>取り込んだ発表</h3><ul>{pub_list}</ul>{up}</section></noscript>
<section class="card" id="notes"><h2>出典と、数を見るときの注意</h2>
<details class="kfold"><summary>出典と注意を開く</summary><ul class="note">
<li>出典：{src}。毎年の数は「我が国における難民保護の状況等」の表（いちばん新しい発表のもの）、国籍・地域別・申請したときの在留資格・審査の数は、本文と別表の表から読みました。</li>
<li>どれも暦年（1月〜12月）の人数です（シリア人留学生の受入れだけ年度）。</li>
<li><b>条約難民</b>：入管法にもとづいて、難民条約の難民（人種・宗教・国籍・特定の社会的集団の構成員であること・政治的意見を理由に、迫害を受けるおそれがある人）に当たると認定された人。
一次審査で認定されず、審査請求（2016年3月までは異議申立て）で認定された人も入ります（その人数は「うち審査請求で認定」）。</li>
<li><b>補完的保護対象者</b>：難民条約の5つの理由には当たらないものの、難民と同じように迫害を受けるおそれがあるとして認定された人（紛争から逃れてきた人など）。2023年12月1日に始まった制度です。</li>
<li><b>その他の保護（人道配慮）</b>：難民や補完的保護対象者とは認定しなかったものの、人道的な配慮を理由に在留を認めた人（1991年から）。本国の情勢などをふまえたものと、日本人と結婚しているなど日本での事情をふまえたものがあります。
国の表のとおり、難民認定などの手続きの結果が出る前に、本国の情勢をふまえて在留を先に認めたミャンマーの人などが入っています。</li>
<li><b>定住難民</b>：政府の決定（閣議了解）にもとづいて受け入れた難民。1978〜2005年はインドシナ難民（ベトナム・ラオス・カンボジアから周辺の地域へ逃れた人と、呼び寄せた家族）、2010年からは第三国定住難民（国の表の注では、タイまたはマレーシアから受け入れたミャンマーの難民）です。</li>
<li>{overlap}そのため、区分の数を足した数と合計は、国の表のとおり同じですが、人の数としては重複があります。</li>
<li>国籍・地域別の数は{min(nt["年"])}年からです。難民認定申請者数の{min(nt["年"])}〜2020年は、発表が上位25か国・地域と「その他」だけなので、上位25の外の国籍・地域の数は分かりません（0人ではありません）。2021年からは全部の国籍・地域がのっているので、のっていない国籍・地域は0人です。</li>
<li>申請者数・認定者数・処理数は、それぞれその年にあった数です。その年に申請した人がその年に審査されたとは限らないので、このページでは認定者数÷申請者数を「認定される割合」としては出していません。
審査の進み方の割合は、その年に審査を終えた人（処理数）の内わけです。</li>
<li>申請者数には、前にも申請したことのある人（複数回の申請）も入っています。</li>
<li>取り込むときに、内わけの合計が総数と合うか、表どうし（毎年の数の表・国籍別の表・審査の表）で同じ数か、同じ年の数が発表によって違わないかを確かめています（{len(chk)}件。合わないもの {int((chk["結果"] != "合う").sum())}件）。</li>
<li>表（1行に1つの数の CSV）は GitHub の「データ/難民/」にあります：<a href="{REPO_URL}">{REPO_URL}</a></li>
</ul></details>{up}</section>
{related([("nanmin-seido.html", "難民の申請と、手続き中のくらし", "申請の流れ、手続き中に働けるか・住民票・健康保険・税金・家族などの決まり"),
          ("tokutei.html", "在留資格「特定活動」とは", "難民認定の手続き中の人や、本国の情勢による在留も入る在留資格"),
          ("teiju.html", "在留資格「定住者」とは", "難民と認定された人や第三国定住難民などが入る在留資格"), ("fuho.html","不法残留者数", "在留期間が過ぎたあとも出国していない人の数"),
          ("kika.html", "帰化の数", "日本の国籍を取った人の数"), ("about.html", "このサイトについて", "使っているデータと注意")])}"""
    return page("難民の認定と保護の数", [("日本全体", "index.html"), ("難民の認定と保護の数", None)], body,
                f"{last}年に日本で難民と認定された人は{cell('条約難民', last)}人、難民認定の申請者は{cell('難民認定申請者数', last)}人（出入国在留管理庁の発表）。国籍・地域別の数と、{first}年からの移り変わり。",
                css=("dash.css",), js=("share.js", "dash.js", "nanmin.js"), active="nanmin", src=src)


# ---------------------------------------------------------------- 在留資格「特定活動」の説明
# 数は データ/特定活動/（make_tokutei.py が e-Stat の表から作る在留目的別の数）と、データ/半期速報/ の特定活動の速報。
# 説明の文は、入管法・特定活動告示・出入国在留管理庁のページから（どこから取ったかは TK_EVENTS と、ページの下の出典にのせる）
ISA = "https://www.moj.go.jp/isa/"
TK_ORG = "出入国在留管理庁「在留外国人統計（旧登録外国人統計）」"
TK_SAVE = {"src": TK_ORG, "tag": "#特定活動"}
TK_KOKUJI = ISA + "policies/bill/nyukan_hourei_h02.html"
NYUKANHO = "https://laws.e-gov.go.jp/law/326CO0000000319"
# 在留目的のまとまり：(ページの名前, 国の表の名前（2023年12月末からの表）, 告示の号, 説明)。本人と配偶者・子などは1つにまとめる
TK_GROUPS = [
    ("本国の情勢による在留（本国情勢等）", ("本国情勢等",), "告示にない",
     "本国の情勢を理由に、日本での在留を望む人に認めるもの。国籍を見ると、ほとんどがミャンマーの人です。"
     "出入国在留管理庁は2021年5月から、ミャンマーの情勢不安を理由に日本での在留を望む人に、緊急避難措置として在留と就労を認めています（原則「特定活動（1年・就労可）」）。"),
    ("特定技能1号への移行準備", ("特定技能１号移行準備",), "告示にない",
     "在留資格「特定技能1号」に変えたいが、書類をそろえるなどの準備に時間がかかる人が、働く予定の受入れ機関で働きながら準備するためのもの（6か月・就労可）。"
     "この期間は、特定技能1号の通算の在留期間（上限5年）に数えられます。"),
    ("ワーキング・ホリデー", ("ワーキング・ホリデー",), "5号・5号の2",
     "日本と取り決めを結んだ国・地域の若い人が、日本の文化や暮らしを知るために休暇を過ごす活動と、旅行の費用を補うために必要な範囲で働く活動（風俗営業の仕事はできません）。"),
    ("難民認定などの手続中", ("難民認定等手続中", "難民認定手続中"), "告示にない",
     "難民の認定などを申請して、結果を待っている人。申請からの期間や申請の内容によって、働けるかどうかや在留期間が変わります。"
     "2024年6月末から、国の表の名前が「難民認定手続中」から「難民認定等手続中」になりました。"
     "申請の内容などによっては在留期間が「3月」（働けない）になり、その人たちは中長期在留者ではないため、この数に入りません。"),
    ("その他", ("その他",), "—",
     "国の表で、ほかのどの在留目的にも入らない特定活動です（内わけは発表されていません。ハラール牛肉の生産など、どんな活動が入るかは下の「「その他」には何が入っている？」に）。"
     "国の表は2023年12月末と2024年12月末に在留目的を細かく分けるようになり、それまで「その他」に入っていたものの一部が別の名前で数えられるようになりました。"),
    ("インターンシップ", ("インターンシップ",), "9号",
     "外国の大学の学生が、学業の一部として、日本の会社などから報酬を受けて働くもの（1年以内で、通算して修業年限の半分以内）。"),
    ("高度専門職の外国人の親", ("高度専門職親",), "34号",
     "在留資格「高度専門職」の外国人（世帯年収800万円以上）と一緒に住み、その7歳未満の子を育てたり、妊娠中の配偶者などの世話をしたりする親。"),
    ("EPAの看護師・介護福祉士など", ("ＥＰＡ対象者本人", "ＥＰＡ対象者配偶者・子"), "16〜24号・27〜31号",
     "インドネシア・フィリピン・ベトナムとの経済連携協定（EPA）などにもとづいて来る、看護師・介護福祉士と、その資格を取るための研修などをする候補者。配偶者・子もふくみます。"
     "告示にあるのは候補者と、資格を取った人の家族です。国家試験に受かったあとの看護師・介護福祉士本人は、特定活動告示ではなく、国ごとの法務省の「指針」で決まっていて、"
     "国の表でこの区分と「その他」のどちらに数えられているかは示されていません。"),
    ("日本の大学などを出た留学生の就職活動", ("本邦の大学等卒業後の就職活動",), "告示にない",
     "日本の大学などを卒業した留学生が、卒業したあとも日本で就職活動を続けるためのもの。"),
    ("スキーインストラクター", ("スキーインストラクター",), "50号",
     "日本の会社などとの契約で、スキーを教える人。冬の仕事なので、6月末より12月末に多くなります。"),
    ("日本の大学などを出た人の就職（本邦大学等卒業者）", ("本邦大学等卒業者本人", "本邦大学等卒業者配偶者・子"), "46号・47号",
     "日本の大学・大学院などを卒業し、高い日本語の力（日本語能力試験N1など）がある人が、日本語を使う仕事をふくむ幅広い仕事に、常勤の職員として就くもの（2019年5月から）。配偶者・子もふくみます。"),
    ("未来創造人材（J-Find）", ("未来創造人材本人", "未来創造人材配偶者・子"), "51号・52号",
     "世界大学ランキングの上位100位に入る大学（3つのランキングのうち2つ以上で）を卒業して5年以内の人が、最長2年、就職活動や起業の準備をするもの（2023年4月から）。配偶者・子もふくみます。"),
    ("家事使用人", ("家事使用人",), "1号〜2号の4",
     "外交官や国際機関の職員、在留資格「高度専門職」の外国人などに雇われて、その家の家事をする人（18歳以上）。"),
    ("医療滞在", ("医療滞在本人", "医療滞在同伴者"), "25号・26号",
     "日本の病院などに入院して治療を受ける人と、その身の回りの世話をする人（同伴者）。"),
    ("観光・保養の長期滞在", ("観光等を目的とする長期滞在者本人", "観光等を目的とする長期滞在者配偶者"), "40号・41号",
     "決められた国・地域の18歳以上の人で、本人と配偶者の預貯金が合わせて3,000万円以上ある人などが、1年以内、観光や保養のために滞在するもの。同行する配偶者もふくみます。"),
    ("アマチュアスポーツ選手", ("アマチュアスポーツ選手本人", "アマチュアスポーツ選手配偶者・子"), "6号・7号",
     "オリンピックや世界選手権などに出たことがある人が、日本の会社などに雇われて（月25万円以上）、アマチュアのスポーツ選手として活動するもの。配偶者・子もふくみます。"),
    ("日系4世", ("日系４世",), "43号",
     "18〜35歳の日系四世が、支援する人（サポーター）の支援を受けながら、日本の文化や暮らしを学ぶためのもの（2018年から。通算で最長5年。年間の受入れ枠は4,000人）。"),
    ("自動車運送業の準備", ("自動車運送業準備",), "55号",
     "トラック・タクシー・バスの運転手として「特定技能1号」になる前に、日本の運転免許を取ったり、研修を受けたりするもの（トラックは6か月、タクシー・バスは1年。更新はできません）。"),
    ("外国人起業家", ("外国人起業家本人", "外国人起業家配偶者・子"), "44号・45号",
     "経済産業省が認めた計画にもとづき、自治体などの支援を受けて、日本で起業の準備をするもの。配偶者・子もふくみます。"),
    ("高度専門職の外国人の配偶者の就労", ("高度専門職就労配偶者",), "33号・33号の2",
     "在留資格「高度専門職」の外国人と一緒に住む配偶者が、日本人と同じくらいの報酬を受けて、決められた種類の仕事をするもの。"),
    ("特定技能2号への移行準備", ("特定技能２号移行準備",), "告示にない",
     "在留資格「特定技能2号」に変える準備のためのもの（国の表で分けて数えているのは2025年12月末から）。"),
    ("特定研究・特定情報処理", ("特定研究等及び情報処理本人", "特定研究等及び情報処理配偶者・子", "特定研究等及び情報処理親"), "36〜39号",
     "法務大臣が指定した機関で、研究や情報処理の仕事をする人と、その配偶者・子・親。"),
]
# 告示にない活動のうち、国の表で別の名前で数えられていないもの：(鍵（ページの中のリンク先 #out-鍵）, 名前, 説明, [(出典の名前, URL)])
# 国の表の「利用上の注意」（令和6年6月末から）のとおり、表に欄のない特定活動は「その他」に入る。在留期間が3月以下の人は表に入らない
TK_OUTSIDE = [
    ("halal", "ハラール牛肉の生産", "イスラム教の決まり（ハラール）に合った牛肉を作るため、ハラール認証の機関から「と畜などの知識と技能があるイスラム教徒」として推薦された外国人が、"
     "認定を受けた施設で、と畜をふくむ牛肉の生産の仕事をするもの。イスラム教の国などへの牛肉の輸出のため、国が在留資格の要件をゆるめたものです。"
     "2014年7月に農林水産省が「外国人を受け入れて行うハラール牛肉生産に係る基本的事項」を官報で示し、受け入れる施設は事業の計画をつくって地方農政局の認定を受けます。"
     "認定された施設の数や、働く人の数は、国の資料に見当たりません。",
     [("農林水産省「「ハラール」に係る取組状況」", "https://www.maff.go.jp/j/kokusai/kokkyo/food_value_chain/pdf/list2_1.pdf"),
      ("農林水産省「国内ハラール認証取得企業のハラール食品輸出取組事例」（平成27年度の委託調査、34ページ）",
       "https://www.maff.go.jp/j/shokusan/export/torikumi_zirei/attach/pdf/index-25.pdf"),
      ("働く人の条件：ワンツーコール行政書士事務所の解説", "https://visa-consultation.jp/specified-activities/halal.html")]),
    ("shoku", "日本料理・製菓を学びながら働く（日本の食文化海外普及人材育成事業）",
     "日本の調理や製菓の専門学校などを卒業した留学生が、農林水産省の認定を受けて、日本の飲食店やホテルなどで働きながら技術を学ぶもの（最長5年）。"
     "もとは「日本料理海外普及人材育成事業」という名前で、日本料理の調理師だけが対象でした。",
     [("農林水産省", "https://www.maff.go.jp/j/shokusan/gaisyoku/ikusei/"),
      ("内閣府 国家戦略特区ワーキンググループの資料（2019年1月）", "https://www.chisou.go.jp/tiiki/kokusentoc_wg/h30/shouchou/20190121_shiryou_s_2_1.pdf")]),
    ("dousei", "同性婚の相手", "外国人どうしで、本国で正式に成立した同性婚の相手。在留資格の「配偶者」には入りませんが、法務省の通知（2013年10月18日、法務省管在第5357号）で、"
     "原則「特定活動」で在留を認めています。認めた件数は、2013年10月から2020年末までに93件です（国会での政府の答弁）。"
     "日本人の同性の相手はこの通知の対象外ですが、裁判のあと、2023年3月にその裁判の原告に「特定活動」が許可されました。",
     [("東京地方裁判所の判決（2022年9月30日）", "https://www.courts.go.jp/assets/hanrei/hanrei-pdf-91710.pdf"),
      ("参議院法務委員会（2021年3月22日）", "https://kokkai.ndl.go.jp/txt/120415206X00320210322/59"),
      ("東京高等裁判所の判決（2023年11月2日）", "https://www.courts.go.jp/assets/hanrei/hanrei-pdf-92578.pdf")]),
    ("ssw1-family", "特定技能1号の人の家族", "在留資格「特定技能1号」の人は、原則として家族を連れて来られません。ただ、人道上の配慮が特に必要な場合に、"
     "たとえば日本で生まれた1号どうしの子や、「留学」から1号に変わる人のすでに日本にいる配偶者・子に、「特定活動」が認められることがあります。",
     [("出入国在留管理庁「特定技能制度に関するQ&A」（Q9）", ISA + "policies/ssw/faq.html")]),
    ("kaigo", "介護福祉士の登録を待つ間の介護の仕事","介護福祉士の養成施設を卒業した留学生や、国家試験に受かった留学生が、4月から介護施設などで働くとき、"
     "介護福祉士の登録証が届くまでの間、介護の仕事をするためのもの。登録のあとは在留資格「介護」に変えます。",
     [("出入国在留管理庁（養成施設を卒業した人）", ISA + "applications/resources/nyuukokukanri07_00119.html"),
      ("出入国在留管理庁（国家試験に受かった人）", ISA + "applications/resources/nyuukokukanri07_00056.html")]),
    ("naitei", "就職先が決まり、働き始めるまで待つ","大学や専門学校の在学中や卒業後に就職先が内定した留学生などが、採用の日まで日本にいるためのもの。",
     [("出入国在留管理庁", ISA + "applications/status/designatedactivities15.html")]),
    ("kigyo", "日本の大学などを出た留学生の起業","日本の大学などを卒業した留学生が、卒業したあとも日本で起業の準備をするためのもの。"
     "2020年11月からは、文部科学省の事業に選ばれた大学などを卒業した人向けのしくみも加わりました。"
     "経済産業省の事業にもとづく「外国人起業家」（告示44号）とは別のものです。",
     [("出入国在留管理庁", ISA + "applications/status/designatedactivities13.html"),
      ("出入国在留管理庁（2020年11月から）", ISA + "applications/status/designatedactvities13_2.html")]),
    ("daigakuin", "大学院に入るまで待つ","日本の大学を卒業した留学生などが、大学院に入学するまで日本にいるためのもの。",
     [("出入国在留管理庁", ISA + "applications/status/designatedactivities52.html")]),
    ("oya", "年をとった親の呼び寄せ","告示で親を呼べるのは、高度専門職の人などの親（34号・39号）だけです。"
     "それ以外の外国人が本国の年をとった親を呼ぶことについて、法務大臣は国会で「極めて例外的な扱い」と答え、人数は出していません。",
     [("衆議院予算委員会第三分科会（2024年2月28日）", "https://kokkai.ndl.go.jp/txt/121305268X00220240228/45")]),
]
# 出国準備の特定活動の在留期間（入国・在留審査要領。情報公開・個人情報保護審査会の答申に引用）
TK_DEPART = "https://www.soumu.go.jp/main_content/000664850.pdf"
TK_OUTSIDE_LIST = "https://visa-consultation.jp/specified-activities/"
# 新しく入国した人の表：出入国在留管理庁「出入国管理統計」の表（データ/特定活動/新規入国_入国目的.csv、make_tokutei.py が作る）
TK_ENTRY_ORG = "出入国在留管理庁「出入国管理統計」"
TK_ENTRY_TABLE = "国籍・地域別 入国目的別 新規入国外国人（短期滞在・特定活動等）"
TK_ENTRY_NOTE = {2025: "2025年は、4月〜10月に開かれた大阪・関西万博の関係者（告示13号・14号）が多く入っていると考えられます（内わけは発表されていません）。"}

# ---- 3分でわかる（ページのいちばん上の5つの図。字は大きく、色は緑・青・オレンジ。くわしい説明は下の各セクションへリンクする）
# 「その他」に入りうる活動の例を3つのまとまりに：(記号, 見出し, 色, 絵, [(TK_OUTSIDE の鍵, 短い名前, ひとこと)])。ひとことは下の説明を短くしたもの
TK_SP_OTHER = [
    ("A", "仕事に関係する活動", "g", "work", [
        ("halal", "ハラール牛肉の生産", "イスラム教の決まりに合った牛肉を作るため、推薦を受けたイスラム教徒が、認定を受けた施設でと畜などの仕事をする"),
        ("shoku", "日本料理・製菓を学びながら働く", "日本の調理・製菓の専門学校などを出た留学生が、農林水産省の認定を受けて、飲食店などで働きながら技術を学ぶ"),
        ("kaigo", "介護福祉士の登録を待つ間の就労", "介護福祉士の養成施設を出た留学生などが、登録証が届くまでの間、介護の仕事をする")]),
    ("B", "家族に関係する活動", "b", "family", [
        ("dousei", "同性婚の相手", "外国人どうしで、本国で正式に成立した同性婚の相手（2013年の法務省の通知から）"),
        ("ssw1-family", "特定技能1号の人の家族への例外的な許可", "1号の人は原則として家族を連れて来られないが、人道上の配慮が特に必要な場合に認められることがある"),
        ("oya", "高齢の親の呼び寄せ", "告示にない形で本国の年をとった親を呼ぶこと。法務大臣は国会で「極めて例外的な扱い」と答えている")]),
    ("C", "進学・就職・起業に関係する活動", "o", "study", [
        ("naitei", "就職先が決まって働き始めるまでの待機", "就職先が内定した留学生などが、採用の日まで日本にいる"),
        ("kigyo", "卒業した留学生の起業準備", "日本の大学などを出た留学生が、卒業したあとも日本で起業の準備をする"),
        ("daigakuin", "大学院に入学するまでの待機", "日本の大学を出た留学生などが、大学院に入るまで日本にいる")]),
]
# STEP 5 で、増えた区分に付けるひとこと（TK_GROUPS の名前 → 文）。ないものは、多い国籍だけを書く
TK_SP_WHO = {"本国の情勢による在留（本国情勢等）": "本国の情勢を理由に、日本での在留を望む人",
             "特定技能1号への移行準備": "特定技能1号に変える準備をしながら、働く予定の所で働く人",
             "難民認定などの手続中": "難民の認定などを申請して、結果を待っている人",
             "ワーキング・ホリデー": "日本と取り決めを結んだ国・地域の若い人",
             "インターンシップ": "外国の大学の学生が、学業の一部として日本で働く"}
# 小さな絵（SVG）。色は style.css の .sp-* が決める（暗い画面でも見えるように、色を直接書かない）
SP_ICON = {
    "clock": '<circle class="f" cx="32" cy="37" r="21"/><circle class="w" cx="32" cy="37" r="15"/><path class="h" d="M32 37V27M32 37l7 5"/><rect class="f" x="26" y="8" width="12" height="6" rx="2"/>',
    "search": '<rect class="f" x="7" y="36" width="8" height="20"/><rect class="f" x="19" y="26" width="8" height="30"/><rect class="f" x="31" y="40" width="8" height="16"/>'
              '<circle class="w h" cx="42" cy="22" r="12"/><path class="h hb" d="M51 31l8 9"/>',
    "work": '<rect class="f" x="8" y="18" width="40" height="28" rx="4"/><path class="h" d="M20 18v-6h16v6"/><path class="hw" d="M8 30h40"/>',
    "family": '<circle class="f" cx="19" cy="15" r="7"/><path class="f" d="M6 48c0-11 6-18 13-18s13 7 13 18z"/><circle class="f" cx="39" cy="24" r="6"/><path class="f" d="M28 48c0-9 5-15 11-15s11 6 11 15z"/>',
    "study": '<path class="f" d="M4 20l24-10 24 10-24 10z"/><path class="f" d="M14 25v11c0 4 7 8 14 8s14-4 14-8V25l-14 6z"/><path class="h" d="M48 22v13"/>',
    "doc": '<path class="f" d="M12 4h22l12 12v36H12z"/><path class="hw" d="M19 24h20M19 32h20M19 40h13"/>',  # 告示（前もって決めた文書）
    "one": '<circle class="f" cx="21" cy="15" r="9"/><path class="f" d="M5 50c0-12 7-20 16-20s16 8 16 20z"/><circle class="w h" cx="40" cy="36" r="9"/><path class="h hb" d="M46 43l6 7"/>',  # 一人ひとりの審査
}


def sp_icon(name, cls=""):
    return f'<svg class="sp-ic {cls}" viewBox="0 0 56 56" aria-hidden="true" focusable="false">{SP_ICON[name]}</svg>'


def sp_person(cls, mark):
    """3分でわかる STEP 1 の人の絵：人（服の色 cls：g・b・o）と、右下に活動のしるし（mark：work・study・stay。定住者のページは cal＝期限あり・inf＝期限なし）"""
    sym = {"work": '<rect x="63" y="47" width="20" height="13" rx="2"/><path class="ln" d="M69 47v-3h8v3"/>',
           "study": '<path d="M62 46c4-2 8-2 11 1v13c-3-3-7-3-11-1z"/><path d="M84 46c-4-2-8-2-11 1v13c3-3 7-3 11-1z"/>',
           "stay": '<path d="M61 53a12 12 0 0 1 24 0z"/><path class="ln" d="M73 53v6a3 3 0 0 1-6 0"/>',
           "cal": '<rect x="62" y="44" width="22" height="18" rx="2"/><path class="ln" d="M67 40v6M79 40v6"/><path class="lb" d="M62 50h22M67 55h3M72 55h3M77 55h3M67 59h3M72 59h3"/>',
           "inf": '<path class="ln" d="M64 52c0-5 7-5 9 0s9 5 9 0-7-5-9 0-9 5-9 0z"/>',
           "tree": '<circle cx="73" cy="44" r="3.5"/><circle cx="66" cy="60" r="3.5"/><circle cx="80" cy="60" r="3.5"/><path class="ln" d="M73 47v5M66 57v-5h14v5"/>',  # 家系（日系）
           "ring": '<circle class="ln" cx="68.5" cy="53" r="6"/><circle class="ln" cx="77.5" cy="53" r="6"/>',  # 結婚
           "kid": '<circle cx="73" cy="44.5" r="4.5"/><path d="M65 62c0-7 3.5-11 8-11s8 4 8 11z"/>',  # 子ども
           "plane": '<path d="M61 53l24-10-8 20-5-7z"/><path class="lb" d="M72 56l13-13"/>',  # 外国から来る
           "home": '<path d="M62 53l11-10 11 10v9h-8v-6h-6v6h-8z"/>',  # 家族と暮らす
           "shield": '<path d="M73 42l9 4v6c0 6-4 9.5-9 11.5-5-2-9-5.5-9-11.5v-6z"/>',  # 保護
           "heart": '<path d="M73 62c-7-4.5-10-8.5-10-12.5a5 5 0 0 1 10-1.5 5 5 0 0 1 10 1.5c0 4-3 8-10 12.5z"/>'}[mark]  # 人道上の配慮
    return (f'<svg class="sp-man {cls}" viewBox="0 0 96 72" aria-hidden="true" focusable="false"><circle class="sk" cx="34" cy="20" r="12"/>'
            '<path class="hr" d="M22 19a12 12 0 0 1 24 0c-6-5-17-5-24 0z"/><path class="sh" d="M12 70c0-14 10-24 22-24s22 10 22 24z"/>'
            f'<circle class="bd" cx="73" cy="52" r="18"/><g class="mk">{sym}</g></svg>')


def kokuji_short(s):
    """告示の号を短く書く：「20号・21号・22号」→「20〜22号」（3つ以上続く号だけ）"""
    out, run = [], []

    def flush():
        out.extend([f"{run[0]}〜{run[-1]}号"] if len(run) >= 3 else [f"{n}号" for n in run])
        run.clear()
    for t in s.split("・"):
        m = re.fullmatch(r"(\d+)号", t)
        if not (m and run and int(m.group(1)) == run[-1] + 1):
            flush()
        if m:
            run.append(int(m.group(1)))
        else:
            out.append(t)
    flush()
    return "・".join(out)


# 目的ごとの移り変わりの線：(名前, 国の表の名前に当てはまるか, 色)。名前が変わったものは1本につなぐ
TK_LINES = [("本国情勢等", lambda p: p == "本国情勢等", "1"), ("特定技能1号への移行準備", lambda p: p == "特定技能１号移行準備", "2"),
            ("ワーキング・ホリデー", lambda p: p == "ワーキング・ホリデー", "3"), ("難民認定などの手続中", lambda p: p.startswith("難民認定"), "4"),
            ("インターンシップ", lambda p: p == "インターンシップ", "7"), ("EPAの看護師・介護福祉士など", lambda p: p.startswith("ＥＰＡ"), "6")]  # このページはピンク（5）を使わない
# 主な出来事：(いつ, 何があったか, [(出典の名前, URL)])
TK_EVENTS = [
    ("1989年12月", "入管法の改正（平成元年法律第79号、12月15日公布）。在留資格を全面的に見直し、「特定活動」（法務大臣が個々の外国人について特に指定する活動）ができる",
     [("衆議院「制定法律」", "https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/houritsu/11619891215079.htm")]),
    ("1990年5月", "特定活動の中身を前もって決めた告示（法務省告示第131号、5月24日）", [("出入国在留管理庁", TK_KOKUJI)]),
    ("1990年6月", "改正した入管法が動き出す（在留資格の整備）", [("出入国在留管理庁「外国人労働者に関する制度概要」", ISA + "content/001335263.pdf")]),
    ("1993年", "技能実習制度ができる。1年の研修のあとの技能実習（1年）は「特定活動（技能実習）」で在留（1997年からは最長2年）",
     [("出入国在留管理庁「技能実習制度及び特定技能制度の現状について」", ISA + "content/001385692.pdf")]),
    ("2010年3月", "難民認定の申請から6か月たった人は、希望すれば一律に働けるようにする（特定活動・就労可）", [("法務省入国管理局の資料", ISA + "content/930003743.pdf")]),
    ("2010年7月", "在留資格「技能実習」ができ、技能実習生は「特定活動」から「技能実習」に移る",
     [("出入国在留管理庁「技能実習制度及び特定技能制度の現状について」", ISA + "content/001385692.pdf")]),
    ("2012年5月", "高度人材ポイント制が始まり、高度人材と認められた人に「特定活動」。2015年4月に在留資格「高度専門職」ができ、それに代わる",
     [("法務省「高度人材のための新しい在留資格の創設について」", "https://www.moj.go.jp/KANBOU/KOHOSHI/no48/1.html")]),
    ("2018年1月", "難民認定制度の運用を見直し、申請の内容によって働くことや在留を制限する", [("法務省入国管理局の資料", ISA + "content/930003743.pdf")]),
    ("2018年", "日系四世の受入れ制度（告示43号）", [("出入国在留管理庁「日系四世の方への手引き」", ISA + "content/001409109.pdf")]),
    ("2019年5月", "日本の大学などを卒業した人の就職（告示46号）", [("出入国在留管理庁のガイドライン", ISA + "applications/resources/nyuukokukanri07_00038.html")]),
    ("2020年", "新型コロナウイルス感染症で帰国が難しい人に「特定活動」などを認める特例（新しく認めるのは、在留期限が2022年11月1日までの人まで）",
     [("出入国在留管理庁（2022年5月31日）", ISA + "content/001373821.pdf")]),
    ("2021年5月", "ミャンマーの情勢不安を理由に日本での在留を望む人への緊急避難措置（原則「特定活動（1年・就労可）」）",
     [("出入国在留管理庁", ISA + "applications/resources/10_00036.html")]),
    ("2022年3月", "避難を目的としてウクライナから「短期滞在」で入国した人が、就労できる「特定活動（1年）」への変更を申請できるようにする",
     [("出入国在留管理庁", ISA + "support/fresc/01_00252.html")]),
    ("2023年4月", "未来創造人材（J-Find、告示51号・52号）", [("出入国在留管理庁", ISA + "applications/status/designatedactivities51.html")]),
    ("2024年3月", "デジタルノマド（告示53号・54号）。2023年度のうちに始めると法務大臣が表明していたもの",
     [("出入国在留管理庁", ISA + "applications/status/designatedactivities10_00001.html"), ("法務大臣の記者会見", "https://www.moj.go.jp/hisho/kouhou/hisho08_00483.html")]),
    ("2024年10月", "ミャンマーの人への緊急避難措置で、技能実習を終えずに「特定活動」に変える場合の扱いを変える",
     [("出入国在留管理庁", ISA + "applications/resources/10_00036.html")]),
    ("2026年4月", "いちばん新しい告示の改正（法務省告示第31号、4月8日）。告示は58号まで（削除された号をのぞく）", [("出入国在留管理庁", TK_KOKUJI)]),
]


def tokutei_sanpun(lw, now, year, groups, ch, gid, sw, sv, top_nat, notes_url):
    """ページのいちばん上の「3分でわかる」（5つのステップの図）。数はどれも tokutei_page が国の表から計算して渡す。
    groups：[(名前, 人数, 告示の号, 説明, 国の表の名前)]（多い順）、ch：[(名前, 1年前, いま, 増減)]、gid：名前 → 下の説明の id、
    sw・sv：速報の時点と人数、top_nat(国の表の名前)：(いちばん多い国籍・地域, 割合%)"""
    yw, swl = when_label(YEAR_AGO), when_label(sw)

    def step(n, title, ans, fig, point, more="", cls=""):
        return (f'<article class="sp-s{cls}" id="sanpun-{n}" aria-labelledby="sanpun-{n}-h"><div class="sp-hd"><span class="sp-no" aria-hidden="true">STEP<b>{n}</b></span>'
                f'<h3 id="sanpun-{n}-h"><span class="nvh">STEP {n}　</span>{title}</h3></div><p class="sp-ans">{ans}</p>{fig}'
                f'<div class="sp-pt"><b>ここがポイント</b><p>{point}</p></div>{more}</article>')

    def more(href, text):
        return f'<p class="sp-more"><a href="#{href}">{text} →</a></p>'

    # STEP 1：同じ在留資格で、活動は人によって違う
    people = [("g", "work", "働く", "特定技能1号への移行準備、インターンシップ、家事使用人"),
              ("b", "study", "学ぶ・準備する", "卒業後の就職活動、日本の運転免許を取る準備、起業の準備"),
              ("o", "stay", "特別な事情で滞在する", "本国の情勢で帰れない、難民認定の申請中、病院での治療")]
    fig1 = ('<ul class="sp-people">' + "".join(
        f'<li class="{c}">{sp_person(c, m)}<span class="sp-tag">在留資格：特定活動</span><b>{t}</b><span class="ex">例：{ex}</span></li>' for c, m, t, ex in people)
        + '</ul><p class="sp-say">同じ在留資格でも、<em>活動内容は人によって違う</em></p>')
    s1 = step(1, "特定活動って何？", "法務大臣が<em>一人ひとり</em>について、日本でしてよい活動を決めて（指定して）認める在留資格です。", fig1,
              "名前が似ている「特定技能」は、別の在留資格です。特定技能は、人手が足りない決まった分野（介護・外食業など）で、技能のある人が働くための在留資格です。",
              more("what", "「どんな資格？」を詳しく見る"))

    # STEP 2：在留目的別の人数（多い5つ＋「その他」、残りはまとめて1行）
    top = groups[:5] + [g for g in groups[5:] if g[0] == "その他"]
    rest = [g for g in groups if g not in top]
    mx = top[0][1]

    def row(name, v, href, cls="", tag=""):
        return (f'<li{cls}><a href="#{href}"><span class="sp-bh"><span class="sp-bn">{esc(name)}{tag}</span>'
                f'<span class="sp-bv"><b>{num(v)}</b>人<i>{v / now * 100:.1f}%</i></span></span>'
                f'<span class="sp-bt"><span style="width:{v / mx * 100:.1f}%"></span></span></a></li>')
    rows = "".join(row(n, v, "sanpun-4", ' class="o"', '<span class="sp-tg">STEP 4で説明</span>') if n == "その他" else row(n, v, gid[n]) for n, v, _, _, _ in top)
    if rest:
        rv = sum(g[1] for g in rest)
        rows += (f'<li class="rest"><a href="#who"><span class="sp-bh"><span class="sp-bn">残りの{len(rest)}区分の合計<small>（{esc(rest[0][0])}など）</small></span>'
                 f'<span class="sp-bv"><b>{num(rv)}</b>人<i>{rv / now * 100:.1f}%</i></span></span><span class="sp-bt"><span style="width:{rv / mx * 100:.1f}%"></span></span></a></li>')
    head = re.sub(r"^.*（(.+)）$", r"\1", top[0][0])  # 「本国の情勢による在留（本国情勢等）」→「本国情勢等」
    n5 = sum(g[1] for g in groups[:5])
    fig2 = (f'<p class="sp-tot">特定活動の全体<b>{num(now)}</b>人<span>（{lw}）</span></p>'
            f'<p class="sp-cap">上位5区分の人数と、全体に対する割合</p><ol class="sp-bars">{rows}</ol>'
            '<p class="sp-cap">行を押すと、その区分の説明に移ります。本人と配偶者・子などは1つにまとめています。</p>')
    oth = next(g for g in groups if g[0] == "その他")
    s2 = step(2, "どんな人がいるの？", f"いちばん多いのは「{esc(head)}」。<em>上位5区分で全体の{n5 / now * 100:.1f}%</em>です。", fig2,
              f"「その他」（{num(oth[1])}人）は{[g[0] for g in groups].index('その他') + 1}番目に多い区分です。中に何が入っているかは、STEP 4 で説明します。",
              more("who", f"全{len(groups)}区分の人数と説明を見る"))

    # STEP 3：告示にある・ない／働けるかは指定書しだい
    fig3 = ('<div class="sp-two">'
            '<div class="sp-card g"><h4><span class="n" aria-hidden="true">①</span>告示にある活動</h4>'
            '<p>法務省が、あらかじめ活動の種類を「告示」（国が決まりを広く知らせる文書）で決めています。いまは58号まであります。</p>'
            '<p class="ex"><b>例</b>ワーキング・ホリデー、家事使用人、インターンシップ</p>'
            '<p class="sm">外国から新しく「特定活動」で来られるのは、こちらだけです。</p></div>'
            '<div class="sp-card b"><h4><span class="n" aria-hidden="true">②</span>告示にない活動</h4>'
            '<p>一人ひとりの事情を見て、法務大臣が活動を指定します。主に、すでに日本にいる人が対象です。</p>'
            '<p class="ex"><b>例</b>難民認定の申請中、本国の情勢による在留（本国情勢等）、卒業後の就職活動</p>'
            '<p class="sm">認められるかどうかは、一人ひとりの審査しだいです。</p></div></div>'
            '<p class="sp-both">①も②も、どちらも正式な在留資格「特定活動」です</p>'
            '<h4 class="sp-sub">働ける？働けない？</h4>'
            '<p>「特定活動」という名前だけでは分かりません。在留カードと、パスポートに付く「指定書」で確かめます。</p>'
            '<div class="sp-docs"><figure class="sp-rc"><div class="rc-p"><div class="rc-h">在留カード<small>（イメージ）</small></div>'
            '<div class="rc-row"><span>在留資格</span><b>特定活動</b></div>'
            '<div class="rc-row hi"><span>就労制限の有無</span><b>指定書により指定された就労活動のみ可</b></div></div>'
            '<figcaption>カードだけでは、どんな仕事ができるか分からない</figcaption></figure>'
            '<span class="sp-arw" aria-hidden="true">→</span>'
            '<figure class="sp-sd"><div class="sd-p"><div class="sd-h">指定書<small>（イメージ）</small></div><p class="sd-l">この人が日本でしてよい活動</p>'
            '<div class="sd-lines" aria-hidden="true"><i></i><i></i><i></i></div></div>'
            '<figcaption>働けるか・どこで働けるかは、ここに書かれる</figcaption></figure></div>'
            '<ul class="sp-work">'
            '<li class="ok"><b><span aria-hidden="true">○</span> 働ける（決められた範囲で）</b>例：特定技能1号への移行準備（働く予定の所で）、ワーキング・ホリデー（旅行の費用を補う範囲で）</li>'
            '<li class="mid"><b><span aria-hidden="true">△</span> 条件で変わる</b>例：難民認定などの手続中（申請からの期間や、申請の内容による）</li>'
            '<li class="ng"><b><span aria-hidden="true">×</span> 原則、働けない</b>例：医療滞在、観光・保養の長期滞在（指定された活動に仕事が入っていない）</li></ul>')
    s3 = step(3, "誰が決める？働けるの？", "活動は、<em>告示で前もって決めたもの</em>と、<em>一人ひとりの事情で決めるもの</em>の2種類です。", fig3,
              "働けるか・どこで働けるかは、一人ひとりの指定書しだいです。在留カードの「就労制限の有無」の欄と、指定書を確かめます。",
              more("what", "告示・指定書・在留期間を詳しく見る"))

    # STEP 4：「その他」（いちばん大事なステップ。省かない）
    ob = next(b for n, b, _, _ in ch if n == "その他")
    new = [n for n, b, _, _ in ch if b is None]
    n_ex = sum(len(g[4]) for g in TK_SP_OTHER)
    keys = {o[0] for o in TK_OUTSIDE}
    if any(k not in keys for g in TK_SP_OTHER for k, _, _ in g[4]):
        sys.exit("3分でわかる（TK_SP_OTHER）に、TK_OUTSIDE にない鍵があります")
    grps = "".join(
        f'<section class="sp-grp {c}"><h4>{sp_icon(ic, c)}<span class="gl" aria-hidden="true">{a}</span>{t}</h4><ul>'
        + "".join(f'<li><a href="#out-{k}"><b>{esc(n)}</b><span>{esc(x)}</span><span class="go">くわしい条件と出典 ↓</span></a></li>' for k, n, x in items)
        + "</ul></section>" for a, t, c, ic, items in TK_SP_OTHER)
    fig4 = (f'<div class="sp-kpis"><div><span>「その他」の人数（{lw}）</span><b>{num(oth[1])}<small>人</small></b></div>'
            f'<div><span>特定活動全体の</span><b>{oth[1] / now * 100:.1f}<small>%</small></b></div>'
            f'<div><span>1年前（{yw} {num(ob)}人）から</span><b>{signed(oth[1] - ob)}<small>人</small></b></div></div>'
            '<p class="sp-say">「その他」＝何も決まっていない人、<em>ではありません</em></p>'
            '<p>国の統計表に、独立した欄（区分）がない特定活動の人を、まとめて数えた欄です。「その他」の人も、ほかの人と同じように、一人ひとり活動が指定されています。</p>'
            '<h4 class="sp-sub">統計の「その他」と「告示にない活動」は、同じではありません</h4>'
            '<div class="sp-mx" role="table" aria-label="告示にあるか・国の表に欄があるかで分けた図">'
            '<div role="row" class="mx-r"><span class="mx-c0" role="columnheader"></span><span class="mx-ch" role="columnheader">国の表に<br>欄がある</span>'
            '<span class="mx-ch o" role="columnheader">国の表に欄がない<br>→ 統計の「その他」</span></div>'
            '<div role="row" class="mx-r"><span class="mx-rh g" role="rowheader">① 告示にある活動</span><span class="mx-c" role="cell">ワーキング・ホリデー、家事使用人 など</span>'
            '<span class="mx-c o" role="cell">大阪・関西万博の関係者（告示13号・14号）など</span></div>'
            '<div role="row" class="mx-r"><span class="mx-rh b" role="rowheader">② 告示にない活動</span><span class="mx-c" role="cell">本国情勢等、難民認定などの手続中 など</span>'
            f'<span class="mx-c o" role="cell">ハラール牛肉の生産、同性婚の相手 など（下の{n_ex}つの例）</span></div></div>'
            '<p class="sp-cap">オレンジの列が、統計の「その他」です。告示にある活動でも、国の表に欄がなければ「その他」に入ります。'
            f'告示にない活動でも、欄があるもの（本国情勢等など）は別に数えられます（国の表の<a href="{notes_url}">利用上の注意</a>から）。</p>'
            f'<h4 class="sp-sub">「その他」に入りうる活動の例（{n_ex}つ）</h4><div class="sp-grps">{grps}</div>'
            '<div class="sp-warn"><b class="wl">注意</b><ul>'
            f'<li><b>国は「その他」{num(oth[1])}人の内わけを発表していません。</b>上の{n_ex}つは「その他」に入りうる活動の例で、それぞれ何人いるかは分かりません。</li>'
            '<li>どれも、法務大臣が一人ひとりの事情を見て認めるものです。条件に当てはまればだれでも認められる、というものではありません。</li>'
            '<li>統計の「その他」と「告示にない活動」は同じ意味ではありません（上の図）。</li>'
            + (f'<li>{"・".join("「" + esc(n) + "」" for n in new)}は{lw}の表から分けて数えるようになった区分です。1年前の「その他」に入っていたかもしれません（国は示していません）。</li>' if new else "")
            + '</ul></div>')
    s4 = step(4, "「その他」って何が入っている？", f"国の表に<em>欄がない</em>特定活動の集まりです。{lw}は{num(oth[1])}人で、全体の{oth[1] / now * 100:.1f}%。", fig4,
              "「その他」は、国の表で分けて数えていない活動の人をまとめた欄です。何人がどの活動なのかは、国が発表していないので分かりません。",
              '<p class="sp-cta"><a class="sp-btn" href="#other">「その他」の具体例を詳しく見る ↓</a></p>', cls=" o")

    # STEP 5：増えているか（確定2つと速報1つの棒。区分ごとの増え方は確定した統計で）
    vals = [(yw, year, ""), (lw, now, ""), (swl, sv, " q")]
    top_v = max(v for _, v, _ in vals)
    cols = "".join(f'<div><span class="v">{num(v)}<small>人</small></span><span class="bar{q}" style="height:{v / top_v * 100:.1f}%"></span></div>' for _, v, q in vals)
    labs = "".join(f"<span>{esc(w)}{'<small>速報</small>' if q else ''}</span>" for w, _, q in vals)
    inc = sorted([c for c in ch if c[3] and c[3] > 0], key=lambda c: -c[3])[:3]

    def who(name):
        names = next(g[4] for g in groups if g[0] == name)
        nat, share = top_nat(names)
        return TK_SP_WHO.get(name, "") + (f"<small>いちばん多い国籍・地域：{esc(nat)}（{share:.1f}%）</small>" if nat else "")
    incs = "".join(f'<li><span class="nm">{esc(n)}</span><b>{signed(dd)}<small>人</small></b><span class="ds">{who(n)}</span></li>' for n, _, _, dd in inc)
    fig5 = (f'<p class="sp-up">1年で<b>{signed(now - year)}</b>人（{pct_signed(now - year, year)}）</p>'
            f'<div class="sp-col" role="img" aria-label="特定活動の人数：{yw} {num(year)}人、{lw} {num(now)}人、{swl}（速報） {num(sv)}人">{cols}</div>'
            f'<div class="sp-colx" aria-hidden="true">{labs}</div>'
            f'<p class="sp-cap">斜めの線の棒は、法務省の速報（{swl}）です。速報の数は、あとで出る確定した統計と少し違うことがあります。</p>'
            f'<h4 class="sp-sub">1年で増えた主な区分（{yw}→{lw}）</h4><ul class="sp-inc">{incs}</ul>'
            '<ul class="sp-notes">'
            f'<li>{swl}の速報には、在留目的ごとの数がありません。区分ごとの増え方は、確定した統計（{yw}と{lw}）で比べています。</li>'
            '<li>もっと長い移り変わりには、統計の数え方や区分の変わり目があるため、増えた・減った理由を一つに決めることはできません。</li></ul>')
    s5 = step(5, "特定活動は増えているの？", f"{yw}から{lw}の1年で、{(now - year) / year * 100:.1f}%増えました。<em>増えた理由は、区分ごとに違います。</em>", fig5,
              "「外国人が増えた」とひとまとめにはできません。<b>事情の違う人たち</b>（本国の情勢・仕事の準備・難民の申請など）が、それぞれ増えています。",
              more("history", "1990年からの移り変わりを見る"))

    nexts = [("now", "人数と推移", "いまの人数・1年の増減・1990年からの移り変わり"), ("who", "在留目的別の詳しい内訳", f"全{len(groups)}区分の人数と説明（名前で探せます）"),
             ("other", "「その他」の具体例", f"{n_ex}つの例と、それぞれの出典"), ("entry", "外国から新しく来た人", "告示の号ごとの1年間の人数"),
             ("nat", "国籍・地域別", "どの国籍・地域の人が多い？"), ("events", "制度の歴史", "法律・告示の主な変わり目（1989年から）"),
             ("notes", "出典・公的資料", "統計表・法令・国の資料と、数を見るときの注意")]
    nav = ('<div class="sp-next related" id="sanpun-next"><h3>もっと詳しく調べてみる</h3><p class="sp-cap">このページの下の、くわしい説明に移ります。</p><ul>'
           + "".join(f'<li><a href="#{h}"><span>{t}<span class="rs">{s}</span></span></a></li>' for h, t, s in nexts) + "</ul></div>")
    steps = "".join(f'<a href="#sanpun-{i}"{c}><b>{i}</b>{t}</a>' for i, (t, c) in
                    enumerate((("何？", ""), ("どんな人？", ""), ("働ける？", ""), ("「その他」とは", ' class="o"'), ("増えてる？", "")), 1))
    return (f'<section class="sp" id="sanpun" aria-labelledby="sanpun-h"><div class="sp-band"><span class="sp-k">3分でわかる</span>'
            f'<h2 id="sanpun-h">特定活動を、5つのステップで</h2><p>数は{TK_ORG}（確定した統計）で、主に{lw}の数です。STEP 5 の{swl}だけ法務省の速報です。</p></div>'
            f'<nav class="sp-steps" aria-label="5つのステップ">{steps}</nav>{s1}{s2}{s3}{s4}{s5}{nav}</section>')


def tokutei_page(d):
    folder = os.path.join(DATA, "特定活動")
    tp = pd.read_csv(os.path.join(folder, "在留目的別.csv"))
    tn = pd.read_csv(os.path.join(folder, "国籍_在留目的.csv"))
    P = defaultdict(dict)  # 時点 → {在留目的: 人数}
    for w, p, v in zip(tp["時点"], tp["在留目的"], tp["人数"]):
        P[w][p] = int(v)
    T = {w: m["総数"] for w, m in sorted(P.items())}  # 特定活動の人数（全国）
    now, year = T[LATEST], T[YEAR_AGO]
    first_w = "2012-12"  # 在留外国人統計のはじめ
    peak_w = max((w for w in T if w >= first_w and w < LATEST), key=lambda w: T[w])  # それまでのいちばん多い時点（2021年12月末）
    low_w = min((w for w in T if w > peak_w), key=lambda w: T[w])  # そのあといちばん少なくなった時点（2023年6月末）
    sk = pd.read_csv(os.path.join(DATA, "半期速報", "半期速報.csv"))
    sk = sk[(sk["表"] == "在留資格") & (sk["名前"] == "特定活動") & (sk["状態"] == "速報")].sort_values("時点").iloc[-1]
    sw, sv = sk["時点"], int(sk["人数"])

    def gsum(w, names):  # まとまりの人数。その時点の表にどの名前もなければ None（0人とは分ける）
        have = [P[w][n] for n in names if n in P[w]]
        return sum(have) if have else None
    groups = [(name, gsum(LATEST, names), kj, text, names) for name, names, kj, text in TK_GROUPS]
    groups = sorted([g for g in groups if g[1]], key=lambda g: -g[1])
    gid = {name: f"tkp-{i}" for i, (name, _, _, _) in enumerate(TK_GROUPS)}  # 「それぞれの中身」の行の id（3分でわかるの棒から飛ぶ）
    if sum(g[1] for g in groups) != now:
        sys.exit("特定活動の在留目的のまとまり（TK_GROUPS）の合計が総数と合いません。国の表に新しい在留目的がないか見てください")
    lw = when_label(LATEST)

    # ① いま何人
    kp = (f'<div class="kpis"><div class="kpi"><div class="lab">{lw}（確定した統計）</div><div class="big">{num(now)}人</div>'
          f'<div class="lab">在留外国人の{now / d.japan[LATEST] * 100:.1f}%</div></div>'
          f'<div class="kpi"><div class="lab">1年前（{when_label(YEAR_AGO)}）から</div><div class="mid">{signed(now - year)}人</div>'
          f'<div class="lab">増減の割合 {pct_signed(now - year, year)}（{num(year)}人から）</div></div>'
          f'<div class="kpi"><div class="lab">{when_label(sw)}（速報）</div><div class="mid">{num(sv)}人</div>'
          f'<div class="lab">法務省の<a href="sokuho.html">半期速報</a>（{ymd_text(sk["公表日"])}公表）</div></div></div>')
    # 1年間の増減（2024年12月末と2025年12月末は同じ形の表なので、まとまりごとに比べられる）
    ch = []
    for name, v, _, _, names in groups:
        b = gsum(YEAR_AGO, names)
        ch.append((name, b, v, None if b is None else v - b))
    ch.sort(key=lambda c: -(c[3] if c[3] is not None else c[2]))
    ch_rows = "".join(f"<tr><td>{esc(n)}</td><td class='n'>{'—' if b is None else num(b)}</td><td class='n'>{num(a)}</td>"
                      f"<td class='n'>{'（表になし）' if dd is None else signed(dd)}</td></tr>" for n, b, a, dd in ch)
    ch_table = (f"<details class='kfold'><summary>在留目的ごとの増減の表を開く（{len(ch)}区分）</summary><div class='kfoldin'><div class='scroll'><table class='t'><thead><tr><th>在留目的</th>"
                f"<th class='n'>{when_label(YEAR_AGO)}</th><th class='n'>{lw}</th><th class='n'>増減</th></tr></thead><tbody>{ch_rows}"
                f"<tr class='hl'><td>合計</td><td class='n'>{num(year)}</td><td class='n'>{num(now)}</td><td class='n'>{signed(now - year)}</td></tr></tbody></table></div></div></details>")
    ch_up = "・".join(f"{esc(n)}（{signed(dd)}人）" for n, _, _, dd in ch[:3] if dd and dd > 0)  # 表を開かなくても分かるように、増えた多い3つ

    # ③ 移り変わり（1990年12月末から）
    ticks = [(y + 0.5, f"{y}年") for y in range(1990, int(LATEST[:4]) + 1, 5)]
    chart_total = static_lines([{"name": "特定活動", "cls": "1", "pts": [(when_x(w), v, when_label(w)) for w, v in T.items()]}],
                               "在留資格「特定活動」の人数の移り変わり", ticks,
                               save={**TK_SAVE, "title": "全国｜在留資格「特定活動」の人数の移り変わり",
                                     "note": "2011年までは登録外国人統計、2012年からは在留外国人統計（数え方が違います）。1993〜2010年は技能実習生をふくみます。"})
    since = [w for w in T if w >= "2012-12"]
    lines = []
    for name, ok, cls in TK_LINES:
        pts = [(when_x(w), sum(v for p, v in P[w].items() if ok(p)), when_label(w)) for w in since if any(ok(p) for p in P[w])]
        lines.append({"name": name, "cls": cls, "pts": pts})
    chart_purpose = static_lines(lines, "主な在留目的ごとの人数の移り変わり", [(y + 0.5, f"{y}年") for y in range(2013, int(LATEST[:4]) + 1, 2)],
                                 save={**TK_SAVE, "title": "全国｜特定活動の主な在留目的別の移り変わり",
                                       "note": "線がとちゅうから始まるものは、国の表がそのときから分けて数えるようになったもの（それより前は「その他」などに入っています）。"})
    other = {w: P[w].get("その他") for w in ("2019-12", "2021-12", "2023-06")}

    # ④ 在留目的別（いちばん新しい時点）
    bars = static_hbars([(n, v, n == "その他") for n, v, _, _, _ in groups], now, when=lw,
                        save={**TK_SAVE, "title": "全国｜在留資格「特定活動」の在留目的別の人数"})
    nl = tn[tn["時点"] == LATEST]
    by = defaultdict(lambda: defaultdict(int))  # 在留目的 → 国籍 → 人数
    for n, p, v in zip(nl["国籍・地域"], nl["在留目的"], nl["人数"]):
        by[p][n] += int(v)

    def top_nats(names, k=3):
        s = defaultdict(int)
        for p in names:
            for n, v in by[p].items():
                s[n] += v
        return "、".join(f"{esc(n)} {num(v)}人" for n, v in sorted(s.items(), key=lambda a: -a[1])[:k] if v)
    def top_nat(names):  # いちばん多い国籍・地域と、その割合（3分でわかるの STEP 5）
        s = defaultdict(int)
        for p in names:
            for n, v in by[p].items():
                s[n] += v
        n, v = max(s.items(), key=lambda a: a[1], default=("", 0))
        return (n, v / sum(s.values()) * 100) if v else ("", 0)

    def facts(kj, names):
        out = [] if kj == "—" else ["告示にない活動" if kj == "告示にない" else f"特定活動告示 {kj}"]
        nats = top_nats(names)
        return "　".join(out + ([f"多い国籍・地域：{nats}"] if nats else []))
    # 一覧の行：名前で探す（data-q に国の表の名前も）・告示で絞る（data-k：in＝告示にある、out＝告示にない、mix＝「その他」で両方が入る）
    kinds = {"in": ("告示にある", "in"), "out": ("告示にない", "out"), "mix": ("両方が入る", "mix")}

    def kind(kj):
        return "mix" if kj == "—" else ("out" if kj == "告示にない" else "in")
    items = "".join(f'<li id="{gid[n]}" data-k="{kind(kj)}" data-q="{esc(" ".join(names))}"><div class="tkh"><span class="tkn"><b>{esc(n)}</b>'
                    f'<span class="tk-kb {kinds[kind(kj)][1]}">{kinds[kind(kj)][0]}</span></span><span class="v">{num(v)}人</span></div>'
                    f'<p>{esc(text)}</p><p class="note">{facts(kj, names)}</p></li>' for n, v, kj, text, names in groups)
    nomad = {p: P[LATEST].get(p, 0) for p in ("デジタルノマド本人", "デジタルノマド配偶者・子")}
    grouped = {p for _, names, _, _ in TK_GROUPS for p in names}
    zero = [p for p, v in P[LATEST].items() if v == 0 and p not in grouped]
    outside = "".join(f'<li id="out-{k}"><div class="tkh"><b>{esc(n)}</b></div><p>{esc(text)}</p><p class="note">出典：'
                      + "・".join(f'<a href="{u}">{esc(s)}</a>' for s, u in src) + "</p></li>" for k, n, text, src in TK_OUTSIDE)
    srcs = pd.read_csv(os.path.join(BASE, "元データ", "出どころ一覧.csv"))  # 国の表の「利用上の注意」（いちばん新しい時点）
    notes_url = srcs[(srcs["時点"] == LATEST) & srcs["表題"].str.contains("利用上の注意")]["URL"].iloc[0]

    # ⑤ 外国から新しく来た人（出入国管理統計。1年間の数）
    ne = pd.read_csv(os.path.join(folder, "新規入国_入国目的.csv"), keep_default_na=False)
    E = {int(y): {p: (no, int(v)) for p, no, v in zip(g["入国目的"], g["告示の号"], g["人数"])} for y, g in ne.groupby("年")}
    ey0, ey = sorted(E)[-2:]
    shown = str.maketrans("ＥＰＡ０１２３４５６７８９", "EPA0123456789")
    order = sorted((p for p in E[ey] if p not in ("総数", "その他")), key=lambda p: -E[ey][p][1]) + ["その他"]
    e_rows = "".join(f"<tr><td>{esc(p.translate(shown))}"
                     + (f"<br><span class='note'>告示 {esc(kokuji_short(E[ey][p][0]))}</span>" if E[ey][p][0] else "")
                     + f"</td><td class='n'>{num(E[ey0][p][1]) if p in E[ey0] else '—'}</td><td class='n'>{num(E[ey][p][1])}</td></tr>" for p in order)
    e_table = (f"<div class='scroll'><table class='t'><thead><tr><th>入国目的</th><th class='n'>{ey0}年</th><th class='n'>{ey}年</th></tr></thead>"
               f"<tbody>{e_rows}<tr class='hl'><td>合計</td><td class='n'>{num(E[ey0]['総数'][1])}</td><td class='n'>{num(E[ey]['総数'][1])}</td></tr></tbody></table></div>")
    e_top = order[0]
    e_oth = (E[ey0]["その他"][1], E[ey]["その他"][1])

    # ⑥ 国籍・地域
    nv = {n: m["特定活動"] for (w, n), m in d.nat_visa.items() if w == LATEST and m.get("特定活動")}
    nat_top = sorted(nv.items(), key=lambda a: -a[1])
    nat_bars = static_hbars([(n, v, False) for n, v in nat_top[:10]] + [("その他", sum(v for _, v in nat_top[10:]), True)], now, when=lw,
                            save={**TK_SAVE, "title": "全国｜在留資格「特定活動」の国籍・地域別人数"})
    mm = "ミャンマー"
    mm_now, mm_then = nv.get(mm, 0), d.nat_visa.get(("2020-12", mm), {}).get("特定活動", 0)
    mm_home = by["本国情勢等"].get(mm, 0)

    ev = "".join(f"<tr><td>{esc(t)}</td><td>{esc(x)}<br><span class='note'>出典：" +
                 "・".join(f'<a href="{u}">{esc(s)}</a>' for s, u in src) + "</span></td></tr>" for t, x, src in TK_EVENTS)
    up = '<p class="kup"><a href="#toc">↑ 上に戻る（目次）</a></p>'
    sanpun = tokutei_sanpun(lw, now, year, groups, ch, gid, sw, sv, top_nat, notes_url)
    body = f"""<h1>在留資格「特定活動」とは</h1>
<nav class="gates" aria-label="このページの読み方">
<a class="gate gate-g" href="#sanpun">{sp_icon("clock", "g")}<span class="gt"><small>はじめての人に</small><b>3分でわかる</b><span class="gd">5つの図で、制度の全体をつかむ</span></span><span class="ga" aria-hidden="true">↓</span></a>
<a class="gate gate-b" href="#detail">{sp_icon("search", "b")}<span class="gt"><small>調べたい人に</small><b>詳しく調べる</b><span class="gd">人数・種類・国籍・歴史・資料</span></span><span class="ga" aria-hidden="true">↓</span></a>
</nav>
{sanpun}
<div class="sp-band sp-band-b" id="detail"><span class="sp-k">詳しく調べる</span><h2>人数・種類・国籍・歴史・資料</h2></div>
<p class="lead">「特定活動」は、ほかの在留資格に当てはまらない活動を、法務大臣が一人ひとりについて決めて（指定して）認める在留資格です。
ワーキング・ホリデー、外交官などの家事使用人、経済連携協定（EPA）の看護師・介護福祉士の候補者、難民認定を申請している人など、中身はさまざまです。
このページでは、どんな資格か・いつできたか・どんな人が何人いるかを、法務省（出入国在留管理庁）の資料と統計からまとめました。</p>
<p class="meta"><span>対象：<b>日本全体</b></span><span>集計時点：<b>{lw}</b>（確定した統計）</span><span>速報：<b>{when_label(sw)}</b></span></p>
{jump([("now", "① いま何人？"), ("what", "② どんな資格？"), ("history", "③ いつできた？移り変わり"), ("who", "④ どんな人が？（目的別）"),
       ("other", "④の中の「その他」には何が？"), ("entry", "⑤ 新しく来た人"), ("nat", "⑥ 国籍・地域"), ("events", "⑦ 主な出来事"), ("notes", "⑧ 出典と注意"),
       ("sanpun", "↑ 3分でわかる")], nid="toc")}
<section class="card" id="now"><h2>いま何人？</h2>
{kp}
<p>在留資格「特定活動」の人は、{lw}に{num(now)}人でした。2012年からの在留外国人統計で比べると、{when_label(first_w)}（{num(T[first_w])}人）の約{now / T[first_w]:.1f}倍、
{when_label(peak_w)}（{num(T[peak_w])}人）のあといちばん少なくなった{when_label(low_w)}（{num(T[low_w])}人）の約{now / T[low_w]:.1f}倍です。
{when_label(sw)}の速報では{num(sv)}人です。</p>
<h3>1年間（{when_label(YEAR_AGO)}→{lw}）で、どの目的が増えた？</h3>
<p>増えたのは、主に{ch_up}です。</p>
<p class="note">国の表の在留目的ごとに比べたものです（本人と配偶者・子などはまとめています）。「—」はその時点の表にない区分です。</p>
{ch_table}{up}</section>
<section class="card" id="what"><h2>どんな資格？</h2>
<p>在留資格は、外国人が日本でどんな活動をして暮らせるかを決めたものです（例：留学、永住者、技能実習）。
「特定活動」は、入管法（出入国管理及び難民認定法）で「<b>法務大臣が個々の外国人について特に指定する活動</b>」とされています。
決まった枠に入らない活動のための、いわば「その他」の受け皿のような在留資格です。</p>
<ul>
<li><b>何をしてよいかは一人ひとり違います。</b>許可のときに、その人ができる活動を書いた「指定書」がパスポートに付けられます。働けるかどうか、どこで働けるかも指定書しだいです。
在留カードの「就労制限の有無」の欄には「指定書により指定された就労活動のみ可」と書かれます。</li>
<li><b>在留期間</b>は、5年・3年・1年・6月・3月、または法務大臣が一人ひとりに決める期間（5年まで）です。</li>
<li><b>2つの種類があります。</b>
<br>① <b>告示で前もって決めた活動</b>：法務省の告示（「特定活動告示」）に、ワーキング・ホリデーや家事使用人などの活動が号ごとに書かれています（{TK_EVENTS[-1][0]}の改正で58号まで。削除された号もあります）。
外国から新しく「特定活動」で日本に来られるのは、この告示にある活動だけです（入管法第7条第1項第2号）。
<br>② <b>告示にない活動</b>：すでに日本にいる人が、事情に応じてほかの在留資格から変えるときなどに認められるものです。
難民認定の申請中、本国の情勢で帰れない（ミャンマーなど）、卒業後の就職活動、特定技能1号への移行準備などがあります。</li>
<li>デジタルノマド（告示53号・54号）など、在留カードが出ない（中長期在留者ではない）特定活動もあります。その人たちは在留外国人の数に入りません。</li>
</ul>{up}</section>
<section class="card" id="history"><h2>いつできた？どう移り変わった？</h2>
<p>「特定活動」は、<b>1989年12月</b>に公布された入管法の改正（平成元年法律第79号）で、在留資格が全面的に見直されたときにできました。
<b>1990年（平成2年）6月</b>から使われています。中身を前もって決めた告示は1990年5月24日の法務省告示第131号で、そのあと何度も改正され、活動の種類が増えてきました。</p>
<h3>特定活動の人数（1990年12月末〜{lw}）</h3>
{chart_total}
<ul class="note">
<li><b>1993年〜2010年は、技能実習生が入っています。</b>研修のあとの技能実習は「特定活動（技能実習）」でした。2010年7月に在留資格「技能実習」ができて移ったため、
2009年末の{num(T["2009-12"])}人から2011年末の{num(T["2011-12"])}人に減りました。</li>
<li>2011年までは登録外国人統計、2012年からは在留外国人統計で、数え方が違います。1991年と1993年は元の統計書がないため、数がありません。</li>
<li>2020年〜2022年は、国の表の「その他」が増え（{num(other["2019-12"])}人（2019年末）→{num(other["2021-12"])}人（2021年末））、そのあと減りました（{num(other["2023-06"])}人（2023年6月末））。
この時期、出入国在留管理庁は、新型コロナウイルス感染症で帰国が難しい人に「特定活動」などを認める特例をとっていました。「その他」の内わけは発表されていないので、理由ごとの人数は分かりません。</li>
</ul>
<h3>主な在留目的ごとの移り変わり（2012年12月末〜{lw}）</h3>
<p class="note">{lw}に多い在留目的と、長く数えられているものです（「その他」は、中身の範囲が時点によって変わるので入れていません）。
線がとちゅうから始まるものは、国の表がそのときから分けて数えるようになったものです。それより前の数が0人だったわけではありません。</p>
{chart_purpose}{up}</section>
<section class="card" id="who"><h2>どんな人が？（在留目的別、{lw}）</h2>
<p class="note">国の統計表「国籍・地域別 在留目的別 在留外国人（特定活動・日本人の配偶者等・定住者）」の在留目的ごとの人数です。本人と配偶者・子などは1つにまとめています。割合は特定活動の合計（{num(now)}人）に対する割合です。</p>
{bars}
<h3 id="who-list">それぞれの中身</h3>
<p class="note">「特定活動告示 〇号」は、告示のどの号にあたるかです。「告示にない活動」は、告示で前もって決めていない活動です。多い国籍・地域は{lw}の数です。</p>
<div class="tk-tools" id="tk-tools" hidden>
<label class="dctl tq"><span class="dlab">名前で探す</span><input type="search" id="tk-q" placeholder="例：ワーキング、ミャンマー" enterkeyhint="search" autocomplete="off"></label>
<div class="dctl"><span class="dlab" id="tk-kl">告示で絞る</span><div class="modes" role="group" aria-labelledby="tk-kl">
<button type="button" data-k="" aria-pressed="true">すべて</button><button type="button" data-k="in" aria-pressed="false">告示にある</button><button type="button" data-k="out" aria-pressed="false">告示にない</button></div></div>
<div class="dctl"><span class="dlab" id="tk-vl">見せ方</span><div class="modes" role="group" aria-labelledby="tk-vl">
<button type="button" data-v="full" aria-pressed="true">説明つき</button><button type="button" data-v="brief" aria-pressed="false">名前と人数だけ</button></div></div>
<a class="dbtn dbtn-sub" href="#other">「その他」の解説へ ↓</a>
</div>
<p class="tcount" id="tk-count" role="status"></p>
<ul class="tkl" id="tk-list">{items}</ul>
<p class="tnone" id="tk-none" hidden>合うものがありません。言葉を変えるか、「すべて」を選んでください。</p>
<p class="note">「両方が入る」の「その他」は、告示にある活動と告示にない活動の両方が入るため、どちらで絞っても出しています。</p>
<p class="note">このほか、デジタルノマド（告示53号・54号。外国の会社に雇われている人などが、インターネットを使って外国の仕事をしながら、1年のうち6か月まで日本に滞在するもの。年収1,000万円以上など）が
本人{num(nomad["デジタルノマド本人"])}人・配偶者や子{num(nomad["デジタルノマド配偶者・子"])}人いますが、在留カードが出ない（中長期在留者ではない）ため、上の合計には入っていません（国の表のとおり）。
{"国の表には「" + "」「".join(zero) + "」の区分もあります（" + lw + "は0人）。" if zero else ""}
告示には、大阪・関西万博（13号・14号）や、2027年の国際園芸博覧会（56号・57号）、2026年のアジア競技大会（58号）の関係者の活動もあります。</p>
<h3 id="other">「その他」には何が入っている？</h3>
<p>国の表の「その他」（{lw}に{num(P[LATEST]["その他"])}人）には、国の表に欄のない特定活動が入ります。
国の表の<a href="{notes_url}">利用上の注意</a>に、2024年6月末から「表にない告示の活動と、告示にない活動は『その他』に入れる」と書かれています。
国は「その他」の内わけを発表していないので、それぞれの人数は分かりません。たとえば、次のような<b>告示にない活動</b>（法務大臣が一人ひとりの事情を見て認めるもの）があります。</p>
<ul class="tkl">{outside}</ul>
<p class="note">このほか、告示の活動のうち国の表で分けていないもの（大阪・関西万博の関係者（13号・14号）など）も「その他」に入ります。</p>
<p class="note"><b>数に出てこない特定活動もあります。</b>在留期間が3か月以下の人は中長期在留者ではないため、在留外国人統計に入りません。
たとえば、在留の許可が出ないと分かった人が日本を出る準備をするための「特定活動」は、原則30日以下（長くても3か月まで）です（<a href="{TK_DEPART}">情報公開・個人情報保護審査会の答申（2020年1月21日）に引用された入管の審査要領</a>）。</p>
<p class="note">告示にない活動は、決まった一覧も、審査のくわしい基準（入管の内部の「在留審査要領」）も、国から公開されていません。
行政書士の解説には、ほかに妊娠・出産のための滞在なども挙げられていますが、国の公開資料では確かめられませんでした（例：<a href="{TK_OUTSIDE_LIST}">ワンツーコール行政書士事務所の一覧</a>）。</p>{up}</section>
<section class="card" id="entry"><h2>外国から新しく来た人は？（{ey}年の1年間）</h2>
<p>{ey}年の1年間に、外国から新しく「特定活動」で日本に来た人は{num(E[ey]["総数"][1])}人でした（{ey0}年は{num(E[ey0]["総数"][1])}人）。
いちばん多いのは{esc(e_top)}の{num(E[ey][e_top][1])}人です。</p>
<p>入管法で、外国から新しく「特定活動」で来られるのは<b>告示にある活動だけ</b>です。そのため、この表は特定活動告示の号ごとに分かれていて、
難民認定の申請中や本国の情勢による在留など、告示にない活動はありません（そうした人は、日本に来たあとにほかの在留資格から変えています）。</p>
<p class="note">{TK_ENTRY_ORG}の表「{TK_ENTRY_TABLE}」の数です。上の「いま日本にいる人」の数（在留外国人統計）とは数え方が違います（1年間に来た人の数で、そのあと帰った人も入ります）。
デジタルノマド（53号・54号）も、この合計に入っています。名前の下の「告示 〇号」は、特定活動告示のどの号にあたるかです。</p>
{e_table}
<p class="note">「その他」（{ey}年{num(e_oth[1])}人、{ey0}年{num(e_oth[0])}人）は、表で分けていない告示の活動です。{TK_ENTRY_NOTE.get(ey, "")}</p>{up}</section>
<section class="card" id="nat"><h2>どの国籍・地域の人が多い？</h2>
<p class="note">割合は、{lw}の特定活動の合計（{num(now)}人）に対する割合です。</p>
{nat_bars}
<p>いちばん多いミャンマーの人（{num(mm_now)}人）は、2020年12月末には{num(mm_then)}人でした。{lw}のミャンマーの人のうち{num(mm_home)}人（{mm_home / mm_now * 100:.0f}%）が「本国情勢等」です。</p>
<p>国籍・地域ごとの数や移り変わりは、ダッシュボードでも見られます：<a href="{dash_link(v='nat', visa='特定活動')}">国籍・地域別</a>・<a href="{dash_link(v='map', visa='特定活動')}">都道府県の地図</a>・<a href="{dash_link(v='trend', cmp='none', visa='特定活動')}">移り変わり</a></p>{up}</section>
<section class="card" id="events"><h2>主な出来事</h2>
<p class="note">特定活動の数や中身にかかわる、法律・告示・取扱いの主な変わり目です。どれも法務省・出入国在留管理庁などの資料からまとめました。</p>
<div class="scroll"><table class="t"><thead><tr><th>いつ</th><th>出来事</th></tr></thead><tbody>{ev}</tbody></table></div>{up}</section>
<section class="card" id="notes" data-open><h2>出典と、数を見るときの注意</h2>
<details class="kfold"><summary>出典と注意を開く</summary><ul class="note">
<li>人数：{TK_ORG}（政府統計の総合窓口 e-Stat）。1990〜2005年末は統計書の「特定活動」、2006〜2011年末は都道府県・国籍ごとの表、2012年12月末からは「国籍・地域別 在留資格（在留目的）別 在留外国人」、
2023年12月末からは「国籍・地域別 在留目的別 在留外国人（特定活動・日本人の配偶者等・定住者）」の表です。速報は出入国在留管理庁の報道発表「在留外国人数について」です。</li>
<li>新しく来た人の数：{TK_ENTRY_ORG}（e-Stat）の「{TK_ENTRY_TABLE}」（年に1回、1年間の数。{ey0}年から）。見出しに告示の号が書かれている表です。</li>
<li>在留目的の名前は時点によって変わります（例：「難民認定手続中」→「難民認定等手続中」、「アマスポーツ選手本人」→「アマチュアスポーツ選手本人」）。
「本国情勢等」は2024年12月末から、「特定技能1号移行準備」「本邦の大学等卒業後の就職活動」「未来創造人材」などは2023年12月末から分けて数えられています。それより前は「その他」などに入っています。</li>
<li>2012年12月末〜2022年6月末の表では、「ＥＰＡ対象者」「アマスポーツ選手」などが「本人」と「家族」に分かれています。このページでは国の表から両方を読んでいます。</li>
<li>1990〜2005年末の統計書の内わけは「ワーキング・ホリデー」と「その他」の2つだけです。</li>
<li>デジタルノマドの人は、国の表の注のとおり、特定活動の合計に入っていません（外数）。</li>
<li>説明の文は、入管法（<a href="{NYUKANHO}">e-Gov 法令検索</a>）、特定活動告示（<a href="{TK_KOKUJI}">出入国在留管理庁</a>、最近改正 令和8年4月8日法務省告示第31号）、
告示の号と略称の一覧（<a href="{ISA}content/001389017.pdf">出入国在留管理庁、2025年5月現在</a>）、在留資格「特定活動」のページ（<a href="{ISA}applications/status/designatedactivities.html">出入国在留管理庁</a>）と、「主な出来事」の出典から。
指定書と在留カードについては、出入国在留管理庁「<a href="{ISA}applications/faq/newimmiact_4_point.html">「在留カード」はどういうカード？</a>」から。</li>
<li>いちばん上の「3分でわかる」は、このページの数と説明を短くまとめたものです。在留カードと指定書の絵は、しくみを説明するためのイメージで、本物の書き方とは違います（「就労制限の有無」の欄の言葉は上の出入国在留管理庁のページのとおり）。
「特定技能」の説明は、出入国在留管理庁「<a href="{ISA}content/001335263.pdf">外国人労働者に関する制度概要</a>」から。</li>
<li>「その他」に入る告示にない活動の説明は、それぞれに書いた出典（出入国在留管理庁・農林水産省のページや資料、内閣府の会議に出された資料、裁判所の判決、国会の会議録）から。
ハラール牛肉の生産で働く人の条件は、国の公開のページが見つからなかったため、行政書士の解説によります。</li>
<li>国の表に欄のない特定活動が「その他」に入ることは、在留外国人統計の<a href="{notes_url}">利用上の注意</a>から。在留期間が3月以下の人が入らないことは、入管法（中長期在留者の決まり、第19条の3）から。</li>
<li>EPA の看護師・介護福祉士の指針：法務省告示（インドネシア <a href="{ISA}content/001449083.pdf">平成20年第278号</a>・フィリピン <a href="{ISA}content/001449090.pdf">平成20年第506号</a>・ベトナム <a href="{ISA}content/001449097.pdf">平成24年第411号</a>）。</li>
<li>取り込むときに、どの時点も 在留目的の合計＝特定活動の合計、特定活動の合計＝在留資格の表の特定活動の数、国籍ごとの合計＝全国の数 になっているかを確かめています。
新しく来た人の表も、入国目的の合計＝特定活動の合計 になっているかを確かめています（make_tokutei.py）。</li>
<li>表（1行に1つの数の CSV）は GitHub の「データ/特定活動/」にあります：<a href="{REPO_URL}">{REPO_URL}</a></li>
</ul></details>{up}</section>
{related([("visa-index.html", "在留資格から探す", "ほかの在留資格の人数と割合"), ("sokuho.html", "法務省・半期速報", "確定統計より新しい在留資格別の数"),
          ("teiju.html", "在留資格「定住者」とは", "日系3世・難民と認定された人など。国の表の「その他」の中身も"),
          ("nanmin.html", "難民の認定と保護の数", "難民認定の申請・認定、人道配慮などの数"),
          ("nanmin-seido.html", "難民の申請と、手続き中のくらし", "手続き中の「特定活動」で働けるか、住民票・健康保険・税金などの決まり"),
          ("fuho.html", "不法残留者数", "在留期間が過ぎたあとも出国していない人の数"), ("about.html", "このサイトについて", "使っているデータと注意")])}"""
    return page("在留資格「特定活動」とは", [("日本全体", "index.html"), ("在留資格から探す", "visa-index.html"), ("特定活動とは", None)], body,
                f"在留資格「特定活動」を3分でわかる5つの図と、対象・できた年（1990年）・在留目的ごとの人数・「その他」の中身。{lw}は{num(now)}人。",
                css=("dash.css",), js=("tokutei.js",), active="tokutei")


# ---------------------------------------------------------------- 在留資格「定住者」の説明
# 数は データ/定住者/（make_teiju.py が e-Stat の表から作る在留目的別の数。2023年12月末から）と、データ/難民/ の認定の数。
# 説明の文は、入管法・定住者告示・出入国在留管理庁のページ・国会の会議録から（どこから取ったかは TJ_KOKUJI_OTHER・TJ_OUTSIDE・TJ_EVENTS と、ページの下の出典にのせる）
TJ_SAVE = {"src": TK_ORG, "tag": "#定住者"}
TJ_KOKUJI = ISA + "content/001368764.pdf"  # 定住者告示（平成2年法務省告示第132号）
TJ_PAGE = ISA + "applications/status/longtermresident.html"
TJ_CASES = ISA + "applications/resources/nyuukokukanri07_00057.html"  # 「定住者」への変更が認められた例・認められなかった例
NANMIN_PRESS = ISA + "publications/press/07_00058.html"
KOKKAI = "https://kokkai.ndl.go.jp/txt/"
# 国の表の区分：(ページの名前, 国の表の名前, 告示の号, 説明)。国の表の4つの区分は、2023年12月末の表と新しく入国した人の表の見出しの告示の号のとおり
TJ_GROUPS = [
    ("日系3世", "日系３世", "3号・4号",
     "祖父母が日本人の日系人（日系3世）で、素行が善良な人。日本人の子として生まれた日系2世は在留資格「日本人の配偶者等」、日系4世は「特定活動」（告示43号）の対象です。"),
    ("日系人や定住者の夫・妻", "配偶者", "5号",
     "日系2世（「日本人の配偶者等」で日本人の子として生まれた人）・日系3世・在留期間が1年以上の定住者の、夫や妻。"
     "日本人や永住者の夫・妻は、在留資格「日本人の配偶者等」「永住者の配偶者等」で、ここには入りません。"),
    ("未成年で未婚の実子", "未成年未婚の実子", "6号",
     "日本人・永住者・特別永住者・在留期間が1年以上の定住者や、日本人などと結婚している外国人に養われて暮らす、未成年で結婚していない実の子（日本人と結婚した外国人の、前の結婚のときの子など）。"
     "この「未成年」は、2022年4月から18歳未満になりました（それより前は20歳未満）。"
     "18歳未満かどうかは、この区分で新しく入国するときの条件です。すでに定住者として住んでいる人が18歳になっても、それだけで在留資格がなくなることはありません"
     "（在留資格は決められた在留期間の終わりまで続き、入管法の在留資格の取消しの理由に年齢はありません。国も、すでに「定住者」を持ち再入国許可で出国している人には影響がないと説明しています）。"
     "そのあと在留期間の更新が認められるかは、ほかの更新と同じく一人ひとりの審査で決まります（入管法第21条）。"),
    ("その他", "その他", "—",
     "上の3つに入らない定住者です。告示にあるもの（第三国定住難民・6歳未満の養子・中国残留邦人とその家族）と、告示にないもの（難民と認定された人、日本人などと離婚したあとも日本に住む人など）が入ります。"
     "内わけは発表されていません（くわしくは下の「「その他」には何が入っている？」に）。"),
]
# 告示にあるが国の表で分けていないもの（「その他」に入る）：(名前, 告示の号, 説明)
TJ_KOKUJI_OTHER = [
    ("第三国定住難民", "1号", "アジアの21の国に一時的にいる難民のうち、国連難民高等弁務官事務所（UNHCR）が保護が必要と認めて日本に推薦した人と、その家族。"),
    ("6歳未満の養子", "7号", "日本人・永住者・特別永住者・在留期間が1年以上の定住者に養われて暮らす、6歳未満の養子。"),
    ("中国残留邦人とその家族", "8号", "1945年8月9日以後の混乱などで日本に引き揚げられず、中国に住み続けた日本人（中国残留邦人）とその子や、日本に永住帰国した中国残留邦人と一緒に暮らすために来る配偶者・子など。"),
]
# 告示にない定住者（国の表では「その他」）：(鍵, 名前, 説明, [(出典の名前, URL)])。説明の中の {cr}・{cp}・{hum}・{hy} は難民の認定の数（データ/難民/）。
# 鍵は「その他」の説明の行の id（tjo-鍵。3分でわかるの STEP 4 から飛ぶ）
TJ_OUTSIDE = [
    ("nanmin", "難民・補完的保護対象者と認定された人",
     "難民と認定された人と、補完的保護対象者（難民条約の5つの理由には当たらないものの、迫害を受けるおそれがあるとして認定された人。2023年12月から）には、"
     "入管法で、決められた罪を犯した人などをのぞき「定住者」を許可することになっています（第61条の2の2・第61条の2の3）。"
     "{hy}年までに認定された人は、難民（条約難民）が{cr}人（1982年から）、補完的保護対象者が{cp}人（2023年から）です（認定した人の数で、いま定住者として住んでいる人の数ではありません）。",
     [("入管法（e-Gov 法令検索）", NYUKANHO), ("出入国在留管理庁「令和7年における難民認定者数等について」", NANMIN_PRESS)]),
    ("jindo", "難民とは認められなかったが、人道上の配慮で在留を認められた人",
     "難民とは認定されなかったものの、人道上の配慮で在留を認められた人には、「定住者」か「特定活動」が許可されます（2013年11月27日の国会での政府の答弁）。"
     "人道上の配慮で在留を認めた人（その他の保護）は、{hy}年に{hum}人です（「定住者」と「特定活動」の内わけは発表されていません）。",
     [("衆議院外務委員会（2013年11月27日）", KOKKAI + "118503968X00720131127/103"), ("出入国在留管理庁「令和7年における難民認定者数等について」", NANMIN_PRESS)]),
    ("rikon", "日本人・永住者などと離婚した人、配偶者が亡くなった人",
     "日本人・永住者・特別永住者の配偶者として住んでいた外国人が、離婚したあとや、配偶者が亡くなったあとも日本に住み続けるとき、在留資格を「定住者」に変えることが認められる場合があります。"
     "法務省入国管理局（いまの出入国在留管理庁）は、認められた例と認められなかった例を公表しています（2012年7月。2017年3月改訂）。"
     "国会では、生計を立てる資産や技能があるか、日本人や永住者との間の子を日本で育てているかなどを総合的に考えて判断し、子がいなくても日本にかなり定着していれば認めている、と答弁されています（2009年6月30日）。",
     [("出入国在留管理庁（認められた例・認められなかった例）", TJ_CASES), ("参議院法務委員会（2009年6月30日）", KOKKAI + "117115206X01320090630/291")]),
    ("kosodate", "日本人の子を育てている外国人の親",
     "日本人と結婚していない外国人が、日本人との間に生まれた子（日本人の実子）を育てている場合など、人道的な配慮が必要と認められるときに、事情を考えて「定住者」が認められる場合があります（2018年12月6日の国会での政府の答弁）。",
     [("参議院法務委員会（2018年12月6日）", KOKKAI + "119715206X00820181206/272")]),
    ("dv", "配偶者からの暴力（DV）の被害を受けた人",
     "法務省入国管理局は2008年7月に「DV事案に関する措置要領」をつくりました。2009年5月末までに被害を申し立てた外国人40人のうち、在留資格を変えたのは9人で、"
     "7人が「定住者」、2人が「特定活動」でした（2009年6月30日の国会での政府の答弁）。",
     [("参議院法務委員会（2009年6月30日）", KOKKAI + "117115206X01320090630/295")]),
]
TJ_OUTSIDE_LIST = "https://visa-consultation.jp/"
# 主な出来事：(いつ, 何があったか, [(出典の名前, URL)])
TJ_EVENTS = [
    ("1989年12月", "入管法の改正（平成元年法律第79号、12月15日公布）。在留資格を全面的に見直し、「定住者」（法務大臣が特別な理由を考えて、一定の在留期間を決めて住むことを認める人）ができる",
     [("衆議院「制定法律」", "https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/houritsu/11619891215079.htm")]),
    ("1990年6月", "改正した入管法と、定住者の地位を前もって決めた告示（平成2年法務省告示第132号）が動き出す",
     [("出入国在留管理庁「外国人労働者に関する制度概要」", ISA + "content/001335263.pdf"), ("定住者告示", TJ_KOKUJI)]),
    ("2005年5月", "難民と認定された人に「定住者」を許可するしくみができる（2004年の入管法の改正、平成16年法律第73号）",
     [("衆議院「制定法律」", "https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/15920040602073.htm")]),
    ("2008年7月", "法務省入国管理局が「DV事案に関する措置要領」をつくる", [("参議院法務委員会（2009年6月30日）", KOKKAI + "117115206X01320090630/295")]),
    ("2009年4月", "厚生労働省の「日系人離職者に対する帰国支援事業」。支援金を受けて帰国した人は、当分の間（原則3年をめど）、日系人などの身分による在留資格では入国できないこととされた",
     [("衆議院法務委員会（2009年6月19日）", KOKKAI + "117105206X01120090619/74")]),
    ("2010年", "第三国定住による難民の受入れが始まる", [("出入国在留管理庁「令和7年における難民認定者数等について」", NANMIN_PRESS)]),
    ("2012年7月", "「日本人の配偶者等」「永住者の配偶者等」から「定住者」への変更が認められた例・認められなかった例を公表（2017年3月改訂）", [("出入国在留管理庁", TJ_CASES)]),
    ("2021年10月", "いちばん新しい定住者告示の改正（法務省告示第220号、10月28日）", [("定住者告示", TJ_KOKUJI)]),
    ("2022年4月", "成年の年齢の引下げで、告示6号の「未成年」が20歳未満から18歳未満になる。18歳以上の人は、この区分で新しく入国できなくなった"
                  "（すでに「定住者」を持ち再入国許可で出国している人には影響がないと国は説明）", [("出入国在留管理庁「定住者」", TJ_PAGE)]),
    ("2023年12月", "補完的保護の制度が始まり、補完的保護対象者と認定された人にも「定住者」を許可する（2023年の入管法の改正、令和5年法律第56号）",
     [("衆議院「制定法律」", "https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/21120230616056.htm"), ("入管法（e-Gov 法令検索）", NYUKANHO)]),
]

# ---- 3分でわかる（定住者のページのいちばん上の5つの図。見た目は特定活動の「3分でわかる」と同じ .sp-*、定住者だけの図は style.css の .tj-*）
# STEP 2・4 の告示にある人：(告示の号, 名前, ひとこと（1文。くわしい条件や例外は詳しい側に）, 国の表の区分, 人の絵の印, STEP 2 に出すか)。
# 国の表の区分が「その他」の人は、下の TJ_KOKUJI_OTHER の説明（id tjk-号の数）へ飛ぶ。STEP 4 には「その他」の人の名前だけを出す
TJ_SP_IN = [("3号・4号", "日系3世", "祖父母が日本人の、日系の人です。", "日系３世", "tree", True),
            ("5号", "日系人や定住者の夫・妻", "日系人や定住者と結婚している人です。", "配偶者", "ring", True),
            ("6号", "日本人・永住者などの子", "日本人・永住者などに養われる、未成年で未婚の実の子です。", "未成年未婚の実子", "kid", True),
            ("1号", "第三国定住難民", "国連が日本に推薦した、外国にいる難民とその家族です。", "その他", "plane", True),
            ("8号", "中国残留邦人とその家族", "戦後の混乱で中国に残った日本人などと、その家族です。", "その他", "home", False),
            ("7号", "6歳未満の養子", "日本人・永住者・定住者などに養われる、6歳未満の養子です。", "その他", "kid", False)]
# STEP 2・4 の告示にない人の例：(TJ_OUTSIDE の鍵, 短い名前, ひとこと（1文）, 人の絵の印)。ひとことは下の説明を短くしたもの
TJ_SP_OUT = [("nanmin", "難民と認定された人", "国が難民と認めた人や、それに準じて保護が必要と認めた人です。", "shield"),
             ("rikon", "離婚・死別のあとも日本で暮らす人", "日本人や永住者などの配偶者だった人です。", "stay"),
             ("kosodate", "日本人の子を育てている親", "日本人との間の子を、日本で育てている外国人の親などです。", "kid"),
             ("jindo", "人道上の配慮で認められた人", "人道上の配慮で在留を認められた人や、DVの被害を受けた人などです。", "heart")]
TJ_SP_SUB = {"配偶者": "日系人や定住者の夫・妻"}  # STEP 3 の区分の名前の下に書くひとこと
TJ_Z2H = str.maketrans("０１２３４５６７８９", "0123456789")


def teiju_sanpun(lw, now, first_w, P, gid, sw, sv):
    """定住者のページのいちばん上の「3分でわかる」（5つのステップの図と、3つのまとめ）。数はどれも teiju_page が国の表から計算して渡す。
    P：時点 → {国の表の区分: 人数}（「総数」は定住者の合計）、gid：国の表の区分 → 下の「それぞれの中身」の行の id、sw・sv：速報の時点と人数。
    くわしい条件・例外・推測の話は詳しい側（#other など）に書き、ここでは図・数・短い文にする"""
    fw, swl = when_label(first_w), when_label(sw)

    def pc(v, tot=now):
        return f"{v / tot * 100:.1f}%"

    def kid(kj):  # 「7号」→ 下の説明の行の id
        return "tjk-" + re.sub(r"\D", "", kj)
    if {kj for kj, _, _, k, _, _ in TJ_SP_IN if k == "その他"} != {kj for _, kj, _ in TJ_KOKUJI_OTHER}:
        sys.exit("3分でわかる（TJ_SP_IN）の「その他」の告示の号が、TJ_KOKUJI_OTHER と合いません")
    if any(k not in {o[0] for o in TJ_OUTSIDE} for k, _, _, _ in TJ_SP_OUT):
        sys.exit("3分でわかる（TJ_SP_OUT）に、TJ_OUTSIDE にない鍵があります")

    def step(n, title, ans, fig, point, more_href, more_text, cls="", pcls=""):
        """1つのステップ。下に「前へ・詳しく見る・次へ」（STEP 5 の次は、まとめ）"""
        pv = (f'<a class="pv" href="#sanpun-{n - 1}"><span aria-hidden="true">←</span> 前のSTEP</a>' if n > 1
              else '<a class="pv" href="#sanpun"><span aria-hidden="true">↑</span> はじめに</a>')
        nx = (f'<a class="nx" href="#sanpun-{n + 1}">次のSTEP <span aria-hidden="true">→</span></a>' if n < 5
              else '<a class="nx" href="#sanpun-sum">まとめ <span aria-hidden="true">→</span></a>')
        return (f'<article class="sp-s{cls}" id="sanpun-{n}" aria-labelledby="sanpun-{n}-h"><div class="sp-hd"><span class="sp-no" aria-hidden="true">STEP<b>{n}</b></span>'
                f'<h3 id="sanpun-{n}-h"><span class="nvh">STEP {n}　</span>{title}</h3></div><p class="sp-ans">{ans}</p>{fig}'
                f'<div class="sp-pt{pcls}"><b>ここがポイント</b><p>{point}</p></div>'
                f'<nav class="tj-pn" aria-label="STEP {n} から移る">{pv}<a class="dt" href="#{more_href}">{more_text} <span aria-hidden="true">↓</span></a>{nx}</nav></article>')

    # STEP 1：定住者と永住者のちがい（在留期間・更新・働くこと）
    cmp_rows = [("在留期間", ("期限あり", "5年・3年・1年・6月など"), ("期限なし", "在留期間の決まりがない"), "d"),
                ("更新", ("必要", "期限までに申請して、審査を受ける"), ("不要", "在留カードの有効期間の更新は7年ごと（16歳以上）"), "d"),
                ("働くこと", ("制限なし", "在留資格による仕事の種類・時間の制限がない"), ("制限なし", "在留資格による仕事の種類・時間の制限がない"), "s")]

    def cell(c, big, small):
        return f'<span role="cell" class="{c}"><b>{big}</b><small>{small}</small></span>'
    fig1 = ('<p class="tj-def">法務大臣が、一人ひとりの事情（特別な理由）を考えて、期間を決めて日本に住むことを認める在留資格です（入管法）。</p>'
            '<div class="tj-cmp" role="table" aria-label="定住者と永住者のちがい"><div role="row" class="r h"><span role="columnheader" class="c0"><span class="nvh">項目</span></span>'
            f'<span role="columnheader" class="g">{sp_person("g", "cal")}<b>定住者</b></span><span role="columnheader" class="b">{sp_person("b", "inf")}<b>永住者</b></span></div>'
            + "".join(f'<div role="row" class="r {k}"><span role="rowheader" class="c0">{h}</span>{cell("g", *a)}{cell("b", *b)}</div>' for h, a, b, k in cmp_rows)
            + '</div><p class="sp-say">違いは、<em>期限と更新</em>があるかどうか</p>')
    s1 = step(1, "定住者って何？", "日本で暮らすことを、<em>特別な理由から</em>認められた人です。", fig1,
              "定住者は、期限が来る前に更新を申請し、認められれば住み続けられます。",
              "what", "制度を詳しく見る")

    # STEP 2：どんな人がいるか（告示にある人・ない人を、人の絵と1文で。くわしい条件や例外は書かない）
    def people(c, items):
        return "".join(f'<li><a href="#{h}">{sp_person(c, m)}<span class="tx"><b>{esc(n)}</b><span>{esc(x)}</span></span></a></li>' for h, n, x, m in items)
    in2 = [(kid(kj) if k == "その他" else gid[k], n, x, m) for kj, n, x, k, m, show in TJ_SP_IN if show]
    out2 = [(f"tjo-{k}", n, x, m) for k, n, x, m in TJ_SP_OUT]
    fig2 = ('<div class="sp-two tj-two">'
            '<div class="sp-card g"><h4><span class="n" aria-hidden="true">①</span> 告示にある人</h4>'
            '<p class="lb">国が前もって決めた人（「定住者告示」という決まり）</p>'
            f'<ul class="tj-ppl">{people("g", in2)}</ul></div>'
            '<div class="sp-card b"><h4><span class="n" aria-hidden="true">②</span> 告示にない人</h4>'
            '<p class="lb">一人ひとりの事情を見て、国が決める人</p>'
            f'<ul class="tj-ppl">{people("b", out2)}</ul>'
            '<p class="sm tj-caution">例に当てはまっても、必ず認められるわけではありません。</p></div></div>'
            '<p class="sp-both">①も②も、どちらも正式な在留資格「定住者」です</p>'
            '<p class="sp-cap">名前を押すと、詳しい説明に移ります。</p>')
    s2 = step(2, "どんな人が対象？", "定住者になる人は、<em>告示にある人</em>と<em>告示にない人</em>の2つに分かれます。", fig2,
              "外国から新しく「定住者」として来られるのは、原則として①の人だけです。②の人は、日本にいる間に審査を受けて定住者になります。",
              "what", "告示と制度を詳しく見る")

    # STEP 3：4つの区分（100%の積み上げ棒。棒の長さ＝割合。区分を押すと説明へ）
    segs = [{"k": k, "name": k.translate(TJ_Z2H), "kj": kj, "v": P[LATEST][k], "href": "#sanpun-4" if k == "その他" else f"#{gid[k]}",
             "cls": "so" if k == "その他" else f"s{i + 1}"} for i, (_, k, kj, _) in enumerate(TJ_GROUPS)]
    big = max(segs, key=lambda s: s["v"])
    b_left = sum(s["v"] for s in segs[:segs.index(big)]) / now * 100  # いちばん多い区分の左はし（%）。棒の上に「いちばん多い」の枠を付ける
    b_w = big["v"] / now * 100
    brace = (f'<div class="tj-brace" aria-hidden="true"><span class="{"rt" if b_left + b_w / 2 > 50 else "lt"}" style="left:{b_left:.3f}%;width:{b_w:.3f}%">'
             '<b>いちばん多い</b></span></div>')
    bar = "".join(f'<a class="{s["cls"]}{" nar" if s["v"] / now < 0.15 else ""}" href="{s["href"]}" tabindex="-1" style="width:{s["v"] / now * 100:.3f}%">'
                  f'<span class="nm">{esc(s["name"])}</span><span class="pc">{pc(s["v"])}</span></a>' for s in segs)

    def sub(s):
        t = "告示にある人・ない人の両方" if s["kj"] == "—" else f"告示{s['kj']}"
        return f"{TJ_SP_SUB[s['k']]}（{t}）" if s["k"] in TJ_SP_SUB else t
    leg = "".join(f'<li class="{s["cls"]}"><a href="{s["href"]}"><i class="sw" aria-hidden="true"></i><span class="nm">{esc(s["name"])}'
                  + ('<span class="sp-tg">いちばん多い</span>' if s is big else "")
                  + f'<small>{esc(sub(s))}</small></span><span class="v"><b>{num(s["v"])}</b>人<em>{pc(s["v"])}</em></span></a></li>' for s in segs)
    fig3 = (f'<p class="sp-tot">定住者の合計<b>{num(now)}</b>人<span>（{lw}・確定した統計）</span></p>'
            f'{brace}<div class="tj-stack" aria-hidden="true">{bar}</div>'
            f'<ol class="tj-leg">{leg}</ol>'
            '<p class="sp-cap">棒の長さは割合と同じです。区分を押すと、その説明に移ります（「その他」は次の STEP 4 へ）。</p>'
            f'<p class="gsrc">時点：{lw}（確定した統計）／割合の分母：定住者の合計 {num(now)}人／出典：{TK_ORG}の「国籍・地域別 在留目的別 在留外国人」の表</p>'
            f'<div class="tj-sk"><b>{swl}の速報</b><span>定住者の合計は<b>{num(sv)}</b>人です。速報には区分ごとの数がないので、上の図（{lw}）には入れていません。</span></div>')
    s3 = step(3, "何人いて、どんな内訳？",
              f"{lw}は<em>{num(now)}人</em>。国の表の4つの区分で、<em>いちばん多いのは「{esc(big['name'])}」</em>（{pc(big['v'])}）です。", fig3,
              "「その他」は、日系3世・配偶者・未成年未婚の実子のどれにも入らない人をまとめた欄です。その中身は、次の STEP 4 で説明します。",
              "who", "4つの区分の人数と説明を詳しく見る")

    # STEP 4：統計の区分としての「その他」（STEP 2 の人の説明はくり返さない。内わけの数は国が出していないので、推定の数は書かない。
    # くわしい制度の説明・例外・推測の話は、詳しい側の「その他」の説明（#other）に）
    oth, oth0 = P[LATEST]["その他"], P[first_w]["その他"]
    rank = sorted((s["v"] for s in segs), reverse=True).index(oth) + 1
    most = "いちばん多い" if rank == 1 else f"{rank}番目に多い"
    chips_a = "".join(f'<a href="#{kid(kj)}">{esc(n)}</a>' for kj, n, _, k, _, _ in TJ_SP_IN if k == "その他")
    chips_b = "".join(f'<a href="#tjo-{k}">{esc(n)}</a>' for k, n, _, _ in TJ_SP_OUT)
    fig4 = ('<p class="tj-lab"><span class="tj-tag f">国の統計でわかること</span></p>'
            f'<div class="sp-kpis"><div><span>「その他」の人数（{lw}）</span><b>{num(oth)}<small>人</small></b></div>'
            f'<div><span>定住者全体の</span><b>{oth / now * 100:.1f}<small>%</small></b></div>'
            f'<div><span>国の表の4つの区分で</span><b class="tj-w">{most}</b></div></div>'
            '<p class="sp-say">「その他」は人の種類ではなく、<em>統計の区分</em>の名前です</p>'
            '<p class="tj-lab"><span class="tj-tag s">制度上「その他」に入る人の例</span></p>'
            f'<div class="tj-bucket"><p class="bh">「その他」{num(oth)}人の中には</p><div class="bin">'
            f'<div class="g"><b>告示にある人</b><span class="ch">{chips_a}</span><span class="q">人数：公表なし</span></div>'
            f'<div class="b"><b>告示にない人</b><span class="ch">{chips_b}</span><span class="q">人数：公表なし</span></div></div></div>'
            '<p class="sp-cap">箱の大きさは人数を表していません。名前を押すと、詳しい説明に移ります。</p>')
    s4 = step(4, "最大の「その他」は誰？" if rank == 1 else "「その他」には誰がいる？",
              "国の表で、ほかの3つの区分に入らない人を<em>まとめた区分</em>です。", fig4,
              "「その他」に誰が何人含まれるか、詳しい内訳は公表されていません。",
              "other", "「その他」の詳しい説明を見る", cls=" o", pcls=" tj-key")

    # STEP 5：増減（確定した2つの時点。ほかの3区分は合計で）
    others = [g[1] for g in TJ_GROUPS if g[1] != "その他"]
    d_all, d_oth = now - P[first_w]["総数"], oth - oth0
    d_rest = sum(P[LATEST][k] - P[first_w][k] for k in others)
    if d_oth + d_rest != d_all:
        sys.exit("定住者の区分ごとの増減の合計が、全体の増減と合いません")
    yrs = int(LATEST[:4]) - int(first_w[:4])
    rows5 = [("定住者全体", d_all, "t"), ("「その他」", d_oth, "o"), ("ほかの3区分の合計", d_rest, "x")]
    pos, neg = max([0] + [v for _, v, _ in rows5]), max([0] + [-v for _, v, _ in rows5])
    span = (pos + neg) or 1
    z = neg / span * 100  # 0の線の位置（左から何%）。棒の長さは増減の人数に比例する

    def drow(n, v, c):
        w = abs(v) / span * 100
        return (f'<div class="r {c}"><span class="nm">{esc(n)}</span><span class="tr"><span class="bar" style="left:{(z - w) if v < 0 else z:.2f}%;width:{w:.2f}%"></span></span>'
                f'<span class="v">{signed(v)}<small>人</small></span></div>')
    brk = "、".join(f"{esc(k.translate(TJ_Z2H))} {signed(P[LATEST][k] - P[first_w][k])}人" for k in others)
    over = d_oth > d_all
    fig5 = (f'<p class="tj-per">{fw} → {lw}（{yrs}年間の増減。確定した統計）</p>'
            f'<div class="tj-eq"><div class="o"><span>「その他」</span><b>{signed(d_oth)}<small>人</small></b></div><span class="op" aria-hidden="true">＋</span>'
            f'<div class="x"><span>ほかの3区分の合計</span><b>{signed(d_rest)}<small>人</small></b></div><span class="op" aria-hidden="true">＝</span>'
            f'<div class="t"><span>定住者全体</span><b>{signed(d_all)}<small>人</small></b></div></div>'
            f'<div class="tj-div" role="img" aria-label="{fw}から{lw}の増減：定住者全体 {signed(d_all)}人、「その他」 {signed(d_oth)}人、ほかの3区分の合計 {signed(d_rest)}人" style="--z:{z:.2f}%">'
            + "".join(drow(*r) for r in rows5)
            + '<div class="r ax" aria-hidden="true"><span></span><span class="tr"><span class="zl">0</span></span><span></span></div></div>'
            '<p class="sp-cap">0の線より右は増えた人数、左は減った人数です（棒の長さは人数に比例）。</p>'
            f'<p class="sp-cap">ほかの3区分の内わけ：{brk}</p>'
            f'<p class="gsrc">時点：{fw}と{lw}（確定した統計）／単位：人（{yrs}年間の増減）／出典：{TK_ORG}の「国籍・地域別 在留目的別 在留外国人」の表。'
            f'{swl}の速報（{num(sv)}人）は合計だけなので、ここでは比べていません</p>')
    s5 = step(5, "定住者はどう変わった？",
              f"{fw}から{lw}の{yrs}年間で、定住者全体は<em>{signed(d_all)}人</em>。"
              + (f"<em>「その他」の増加（{signed(d_oth)}人）が、全体の増加を上回りました。</em>" if over else f"そのうち「その他」は<em>{signed(d_oth)}人</em>でした。"), fig5,
              (f"ほかの3区分は、合わせて減りました（{signed(d_rest)}人）。" if d_rest < 0 else f"ほかの3区分は、合わせて{signed(d_rest)}人でした。")
              + "ただし、増えた理由や、増えたのがどんな人かは、国の統計からは分かりません。",
              "history", "1990年からの人数の推移を見る")

    # まとめ：覚えておきたい3つのこと（絵つきのカード）。③の小さな棒も、幅＝割合
    x0, mini = 0.0, ""
    for s in segs:
        w = s["v"] / now * 100
        mini += f'<rect class="{s["cls"]}" x="{x0:.3f}" y="12" width="{w:.3f}" height="22"/>'
        x0 += w
    mini = (f'<svg class="tj-mini" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true" focusable="false">{mini}'
            f'<path class="br" d="M{b_left + 1:.2f} 9V3H{b_left + b_w - 1:.2f}V9"/></svg>')
    sums = [("g", sp_person("g", "cal"), "定住者は永住者とは違う", "在留期間があり、更新が必要です。ただし、働くことに在留資格上の制限はありません。"),
            ("b", sp_icon("family", "b"), "定住者になる理由はさまざま", "日系人や家族の関係、人道上の事情など、対象となる背景は一つではありません。"),
            ("o", mini, f"{'最大' if rank == 1 else f'{rank}番目'}の区分は「その他」",
             f"{lw}で{num(oth)}人、全体の{pc(oth)}。ただし、詳しい内訳は公表されていません。")]
    summary = ('<section class="tj-sum" id="sanpun-sum" aria-labelledby="sanpun-sum-h"><span class="sp-k">3分でわかるまとめ</span>'
               '<h3 id="sanpun-sum-h">定住者について、覚えておきたい3つのこと</h3><ol class="tj-sum3">'
               + "".join(f'<li class="{c}"><span class="ic">{ic}</span><span class="tx"><b><span class="no">{"①②③"[i]}</span>{t}</b><span>{x}</span></span></li>'
                         for i, (c, ic, t, x) in enumerate(sums)) + "</ol></section>")

    nexts = [("now", "現在の人数と速報", "確定した統計と速報の数・区分ごとの移り変わり"), ("what", "制度と告示", "どんな資格？告示の号と国の表の区分"),
             ("history", "人数の推移", "1990年からの移り変わり"), ("who", "国の4区分", "区分ごとの人数・説明・多い国籍"),
             ("other", "「その他」の詳しい説明", "告示にある人・ない人の例と出典"), ("entry", "新しく入国した人", "1年間に外国から来た人の区分ごとの数"),
             ("nat", "国籍・地域別", "どの国籍・地域の人が多い？"), ("events", "主な出来事", "法律・告示・取扱いの変わり目（1989年から）"),
             ("notes", "出典と注意", "統計表・法令・国の資料と、数を見るときの注意")]
    nav = ('<div class="sp-next related" id="sanpun-next"><h3>さらに詳しく調べる</h3><p class="sp-cap">このページの下の、詳しい統計・制度・資料に移ります。</p><ul>'
           + "".join(f'<li><a href="#{h}"><span>{t}<span class="rs">{s}</span></span></a></li>' for h, t, s in nexts) + "</ul></div>")
    steps = ("".join(f'<a href="#sanpun-{i}"{c}><b>{i}</b>{t}</a>' for i, (t, c) in
                     enumerate((("定住者って何？", ""), ("どんな人？", ""), ("何人？", ""), ("「その他」とは", ' class="o"'), ("どう変わった？", "")), 1))
             + '<a href="#sanpun-sum"><b aria-hidden="true">✓</b>まとめ</a>')
    return (f'<section class="sp" id="sanpun" aria-labelledby="sanpun-h"><div class="sp-band"><span class="sp-k">3分でわかる</span>'
            f'<h2 id="sanpun-h">定住者を、5つのステップで</h2><p>数は{TK_ORG}（確定した統計）の{lw}の数です。{swl}の速報は、合計の数だけを分けて書いています。</p></div>'
            f'<nav class="sp-steps" aria-label="5つのステップとまとめ">{steps}</nav>{s1}{s2}{s3}{s4}{s5}{summary}{nav}</section>')


def teiju_page(d):
    folder = os.path.join(DATA, "定住者")
    tp = pd.read_csv(os.path.join(folder, "在留目的別.csv"))
    tn = pd.read_csv(os.path.join(folder, "国籍_在留目的.csv"))
    te = pd.read_csv(os.path.join(folder, "新規入国_在留目的.csv"), keep_default_na=False)
    P = defaultdict(dict)  # 時点 → {在留目的: 人数}（2023年12月末から）
    for w, p, v in zip(tp["時点"], tp["在留目的"], tp["人数"]):
        P[w][p] = int(v)
    T = {w: m["定住者"] for w, m in sorted(d.japan_visa.items()) if m.get("定住者")}  # 定住者の人数（全国、2006年末から）
    old = pd.read_csv(os.path.join(DATA, "古い表", "全国_国籍_在留資格.csv"))
    old = old[(old["国籍・地域"] == "総数") & (old["在留資格"] == "定住者")]
    T = {**{w: int(v) for w, v in zip(old["時点"], old["人数"])}, **T}  # 1990〜2005年末は統計書
    if any(P[w]["総数"] != T[w] for w in P):
        sys.exit("定住者の在留目的の表の総数が、在留資格の表の定住者の数と合いません（make_teiju.py の確かめを見てください）")
    now, year = T[LATEST], T[YEAR_AGO]
    first_w, since_w = min(P), min(T)
    peak_w = max(T, key=lambda w: T[w])
    low_w = min((w for w in T if w > peak_w), key=lambda w: T[w])
    sk = pd.read_csv(os.path.join(DATA, "半期速報", "半期速報.csv"))
    sk = sk[(sk["表"] == "在留資格") & (sk["名前"] == "定住者") & (sk["状態"] == "速報")].sort_values("時点").iloc[-1]
    sw, sv = sk["時点"], int(sk["人数"])
    if sum(P[LATEST][g[1]] for g in TJ_GROUPS) != now:
        sys.exit("定住者の在留目的のまとまり（TJ_GROUPS）の合計が総数と合いません。国の表に新しい在留目的がないか見てください")
    lw = when_label(LATEST)
    oth = P[LATEST]["その他"]
    # 難民の認定の数（データ/難民/、make_nanmin.py）
    nm = pd.read_csv(os.path.join(DATA, "難民", "毎年の数.csv"))
    nsum = lambda item, y0=0: int(nm[(nm["項目"] == item) & (nm["年"] >= y0)]["人数"].sum())
    hy = int(nm["年"].max())
    nums = {"cr": num(nsum("条約難民")), "cp": num(nsum("補完的保護対象者")), "hum": num(nsum("その他の保護", hy)), "hy": hy}
    resettle = nsum("定住難民", 2010)  # 2010年からは第三国定住（1978〜2005年はインドシナ難民）
    nnat = pd.read_csv(os.path.join(DATA, "難民", "国籍別.csv"))
    ua_cp = int(nnat[(nnat["項目"] == "補完的保護対象者認定者数") & (nnat["国籍・地域"] == "ウクライナ")]["人数"].sum())

    # ① いま何人
    kp = (f'<div class="kpis"><div class="kpi"><div class="lab">{lw}（確定した統計）</div><div class="big">{num(now)}人</div>'
          f'<div class="lab">在留外国人の{now / d.japan[LATEST] * 100:.1f}%</div></div>'
          f'<div class="kpi"><div class="lab">1年前（{when_label(YEAR_AGO)}）から</div><div class="mid">{signed(now - year)}人</div>'
          f'<div class="lab">増減の割合 {pct_signed(now - year, year)}（{num(year)}人から）</div></div>'
          f'<div class="kpi"><div class="lab">{when_label(sw)}（速報）</div><div class="mid">{num(sv)}人</div>'
          f'<div class="lab">法務省の<a href="sokuho.html">半期速報</a>（{ymd_text(sk["公表日"])}公表）。合計だけで、区分ごとの数はありません</div></div></div>')
    kinds = (f'<div class="tj-kind"><div><b>確定した統計（{lw}）</b><span>定住者の合計と、4つの区分ごとの数・国籍ごとの数があります。'
             f'このページの区分と国籍の数は、すべてこちらです。</span></div>'
             f'<div class="q"><b>速報（{when_label(sw)}）</b><span>法務省の半期速報で、定住者の合計の数だけです。区分ごとの数はないので、確定した統計の区分の数とは混ぜません。</span></div></div>')
    ws = sorted(P)
    gid = {k: f"tjp-{i}" for i, (_, k, _, _) in enumerate(TJ_GROUPS)}  # 「それぞれの中身」の行の id（3分でわかるの棒から飛ぶ）
    lines4 = static_lines([{"name": k.translate(TJ_Z2H), "cls": c, "pts": [(when_x(w), P[w][k], when_label(w)) for w in ws]}
                           for (_, k, _, _), c in zip(TJ_GROUPS, ("1", "3", "7", "2"))],
                          "在留資格「定住者」の国の表の区分ごとの人数", [(when_x(w), f"{w[:4]}年") for w in ws if w.endswith("-12")],  # 目もりは12月末（ほかのグラフと同じ）
                          save={**TJ_SAVE, "title": "全国｜在留資格「定住者」の区分ごとの人数"})
    src2 = f"{TK_ORG}の「国籍・地域別 在留目的別 在留外国人」の表"  # 区分ごとの数の出典（グラフの下に書く）
    p_rows = "".join(f"<tr><td>{esc(n)}<br><span class='note'>{'告示 ' + kj if kj != '—' else '告示にない人などもふくむ'}</span></td>"
                     + "".join(f"<td class='n'>{num(P[w][k])}</td>" for w in ws) + f"<td class='n'>{signed(P[LATEST][k] - P[first_w][k])}</td></tr>"
                     for n, k, kj, _ in TJ_GROUPS)
    p_table = ("<div class='scroll'><table class='t'><thead><tr><th>国の表の区分</th>" + "".join(f"<th class='n'>{when_label(w)}</th>" for w in ws)
               + f"<th class='n'>{when_label(first_w)}からの増減</th></tr></thead><tbody>{p_rows}<tr class='hl'><td>合計</td>"
               + "".join(f"<td class='n'>{num(P[w]['総数'])}</td>" for w in ws) + f"<td class='n'>{signed(now - P[first_w]['総数'])}</td></tr></tbody></table></div>")

    # ③ 移り変わり（1990年12月末から）
    ticks = [(y + 0.5, f"{y}年") for y in range(1990, int(LATEST[:4]) + 1, 5)]
    chart_total = static_lines([{"name": "定住者", "cls": "1", "pts": [(when_x(w), v, when_label(w)) for w, v in T.items()]}],
                               "在留資格「定住者」の人数の移り変わり", ticks,
                               save={**TJ_SAVE, "title": "全国｜在留資格「定住者」の人数の移り変わり",
                                     "note": "2011年までは登録外国人統計、2012年からは在留外国人統計（数え方が違います）。"})

    # ④ 区分ごと（いちばん新しい時点）
    bars = static_hbars([(n, P[LATEST][k], k == "その他") for n, k, _, _ in TJ_GROUPS], now, image="pie", when=lw,
                        save={**TJ_SAVE, "title": "全国｜在留資格「定住者」の内わけ（国の表の区分）"})
    nl = tn[tn["時点"] == LATEST]
    by = defaultdict(lambda: defaultdict(int))  # 在留目的 → 国籍 → 人数
    for n, p, v in zip(nl["国籍・地域"], nl["在留目的"], nl["人数"]):
        by[p][n] += int(v)

    def top_nats(k, n=3):
        return "、".join(f"{esc(a)} {num(v)}人" for a, v in sorted(by[k].items(), key=lambda a: -a[1])[:n])
    items = "".join(f'<li id="{gid[k]}"><div class="tkh"><b>{esc(n)}</b><span class="v">{num(P[LATEST][k])}人</span></div><p>{esc(text)}</p>'
                    f'<p class="note">{"定住者告示 " + kj + "　" if kj != "—" else ""}多い国籍・地域：{top_nats(k)}</p></li>' for n, k, kj, text in TJ_GROUPS)
    kokuji_items = "".join(f'<li id="tjk-{re.sub(r"[^0-9]", "", kj)}"><div class="tkh"><b>{esc(n)}</b></div><p>{esc(text)}</p><p class="note">定住者告示 {kj}</p></li>'
                           for n, kj, text in TJ_KOKUJI_OTHER)
    outside = "".join(f'<li id="tjo-{key}"><div class="tkh"><b>{esc(n)}</b></div><p>{esc(text.format(**nums))}</p><p class="note">出典：'
                      + "・".join(f'<a href="{u}">{esc(s)}</a>' for s, u in src) + "</p></li>" for key, n, text, src in TJ_OUTSIDE)
    srcs = pd.read_csv(os.path.join(BASE, "元データ", "出どころ一覧.csv"))  # 国の表の「利用上の注意」（いちばん新しい時点）
    notes_url = srcs[(srcs["時点"] == LATEST) & srcs["表題"].str.contains("利用上の注意")]["URL"].iloc[0]

    # ⑤ 外国から新しく来た人（出入国管理統計。1年間の数）
    E = {int(y): {p: (no, int(v)) for p, no, v in zip(g["在留目的"], g["告示の号"], g["人数"])} for y, g in te[te["国籍・地域"] == "総数"].groupby("年")}
    ey0, ey = sorted(E)[-2:]
    e_rows = "".join(f"<tr><td>{esc(n)}" + (f"<br><span class='note'>告示 {esc(E[ey][k][0])}</span>" if E[ey][k][0] else "")
                     + f"</td><td class='n'>{num(E[ey0][k][1])}</td><td class='n'>{num(E[ey][k][1])}</td></tr>" for n, k, _, _ in TJ_GROUPS)
    e_table = (f"<div class='scroll'><table class='t'><thead><tr><th>国の表の区分</th><th class='n'>{ey0}年</th><th class='n'>{ey}年</th></tr></thead>"
               f"<tbody>{e_rows}<tr class='hl'><td>合計</td><td class='n'>{num(E[ey0]['総数'][1])}</td><td class='n'>{num(E[ey]['総数'][1])}</td></tr></tbody></table></div>")
    eo = te[(te["在留目的"] == "その他") & (te["国籍・地域"] != "総数")]
    eo_top = {int(y): g.sort_values("人数").iloc[-1] for y, g in eo.groupby("年")}

    # ⑥ 国籍・地域
    nv = {n: m["定住者"] for (w, n), m in d.nat_visa.items() if w == LATEST and m.get("定住者")}
    nat_top = sorted(nv.items(), key=lambda a: -a[1])
    nat_bars = static_hbars([(n, v, False) for n, v in nat_top[:10]] + [("その他", sum(v for _, v in nat_top[10:]), True)], now, when=lw,
                            save={**TJ_SAVE, "title": "全国｜在留資格「定住者」の国籍・地域別人数"})
    nf = tn[tn["時点"] == first_w]
    first_oth = {n: int(v) for n, p, v in zip(nf["国籍・地域"], nf["在留目的"], nf["人数"]) if p == "その他"}
    keys = [k for _, k, _, _ in TJ_GROUPS]
    x_rows = "".join(f"<tr><td>{esc(n)}</td><td class='n'>{num(v)}</td>" + "".join(f"<td class='n'>{num(by[k].get(n, 0))}</td>" for k in keys)
                     + f"<td class='n'>{by['その他'].get(n, 0) / v * 100:.0f}%</td><td class='n'>{signed(by['その他'].get(n, 0) - first_oth.get(n, 0))}</td></tr>"
                     for n, v in nat_top[:15])
    x_table = ("<div class='scroll'><table class='t'><thead><tr><th>国籍・地域</th><th class='n'>定住者</th>"
               + "".join(f"<th class='n'>{esc(n)}</th>" for n, _, _, _ in TJ_GROUPS)
               + f"<th class='n'>その他の割合</th><th class='n'>その他の増減（{when_label(first_w)}から）</th></tr></thead><tbody>{x_rows}</tbody></table></div>")
    oth_up = sorted(((by["その他"].get(n, 0) - first_oth.get(n, 0), n) for n in set(by["その他"]) | set(first_oth)), reverse=True)[:4]
    ua = "ウクライナ"

    ev = "".join(f"<tr><td>{esc(t)}</td><td>{esc(x)}<br><span class='note'>出典：" +
                 "・".join(f'<a href="{u}">{esc(s)}</a>' for s, u in src) + "</span></td></tr>" for t, x, src in TJ_EVENTS)
    def up(n=None):
        """セクションの下：3分でわかるの同じ話のステップへ戻る・目次へ戻る"""
        back = f'<a href="#sanpun-{n}">← 3分でわかる STEP {n}</a>' if n else '<a href="#sanpun">← 3分でわかる</a>'
        return f'<p class="kup kup2">{back}<a href="#toc">↑ 上に戻る（目次）</a></p>'

    def gsrc(when, denom, src):
        """グラフの下に書く、時点・割合の分母・出典"""
        return f'<p class="gsrc">時点：{when}' + (f"／割合の分母：{denom}" if denom else "") + f"／出典：{src}</p>"
    sanpun = teiju_sanpun(lw, now, first_w, P, gid, sw, sv)
    fw = when_label(first_w)
    yrs = f"{int(LATEST[:4]) - int(first_w[:4])}年間"
    body = f"""<h1>在留資格「定住者」とは</h1>
<nav class="gates" aria-label="このページの読み方">
<a class="gate gate-g" href="#sanpun">{sp_icon("clock", "g")}<span class="gt"><small>はじめての人に</small><b>3分でわかる</b><span class="gd">5つの図で、定住者の全体をつかむ</span></span><span class="ga" aria-hidden="true">↓</span></a>
<a class="gate gate-b" href="#detail">{sp_icon("search", "b")}<span class="gt"><small>調べたい人に</small><b>詳しく調べる</b><span class="gd">人数・制度・内訳・国籍・歴史・資料</span></span><span class="ga" aria-hidden="true">↓</span></a>
</nav>
{sanpun}
<div class="sp-band sp-band-b" id="detail"><span class="sp-k">詳しく調べる</span><h2>人数・制度・内訳・国籍・歴史・資料</h2></div>
<p class="lead">「定住者」は、法務大臣が特別な理由を考えて、一定の在留期間を決めて日本に住むことを認める在留資格です。
日系3世、日系人などの夫や妻、日本人などと結婚した外国人の連れ子、難民と認定された人、日本人と離婚したあとも日本で子を育てる人など、中身はさまざまです。
このページでは、どんな資格か・いつできたか・どんな人が何人いるか（国の表の「その他」の中身も）を、法務省（出入国在留管理庁）の資料と統計からまとめました。</p>
<p class="meta"><span>対象：<b>日本全体</b></span><span>集計時点：<b>{lw}</b>（確定した統計）</span><span>速報：<b>{when_label(sw)}</b>（合計だけ）</span></p>
{jump([("now", "① 現在の人数と速報"), ("what", "② 制度と告示"), ("history", "③ 人数の推移"), ("who", "④ 国の4区分"),
       ("other", "⑤ 「その他」の詳しい説明"), ("entry", "⑥ 新しく入国した人"), ("nat", "⑦ 国籍・地域別"), ("events", "⑧ 主な出来事"), ("notes", "⑨ 出典と注意"),
       ("sanpun", "↑ 3分でわかる")], nid="toc")}
<section class="card" id="now"><h2>現在の人数と速報</h2>
{kp}
{kinds}
<p>在留資格「定住者」の人は、{lw}に{num(now)}人でした。国の表は定住者を4つの区分に分けていて、いちばん多いのは<b>「その他」の{num(oth)}人（{oth / now * 100:.1f}%）</b>です。
{when_label(sw)}の速報では{num(sv)}人です（合計の数だけ）。</p>
<h3>国の表の区分ごとの移り変わり（{fw}〜{lw}）</h3>
<p class="note">定住者を区分に分けた数は、{fw}の表から出ています。{fw}からの{yrs}で、定住者全体は{signed(now - P[first_w]["総数"])}人、
「その他」は{signed(oth - P[first_w]["その他"])}人でした。</p>
{lines4}
{gsrc(f"{fw}〜{lw}（6月末・12月末の半年ごと。目もりの「〇〇年」は12月末。確定した統計）", "", src2)}
<details class="kfold"><summary>区分ごとの人数の表を開く（{len(ws)}つの時点）</summary><div class="kfoldin">{p_table}</div></details>{up(3)}</section>
<section class="card" id="what"><h2>制度と告示（どんな資格？）</h2>
<p>在留資格は、外国人が日本でどんな活動をして暮らせるかを決めたものです（例：留学、永住者、技能実習）。
「定住者」は、入管法（出入国管理及び難民認定法）で「<b>法務大臣が特別な理由を考慮し一定の在留期間を指定して居住を認める者</b>」とされています。
入管法の在留資格は、日本でする活動で決まるもの（入管法の別表第一。技術・人文知識・国際業務、留学、技能実習、特定活動など）と、
身分や立場で決まるもの（別表第二。永住者・日本人の配偶者等・永住者の配偶者等・定住者の4つ）に分かれていて、定住者は身分や立場で決まるほうです。</p>
<ul>
<li><b>働くことに制限はありません。</b>入管法第19条の制限（在留資格で決められた活動のほかに、収入や報酬を得る活動をしてはいけない）は、別表第一の在留資格の人にかかるもので、別表第二の定住者にはかかりません。
別表第一の人の制限の中身は、在留資格ごとに違います（仕事の在留資格は、その在留資格の活動の範囲だけ。留学・家族滞在などは原則として働けず、許可（資格外活動許可）を受けた範囲だけ。特定活動は、一人ひとりの指定しだい）。</li>
<li><b>在留期間</b>は、5年・3年・1年・6月、または法務大臣が一人ひとりに決める期間（5年まで）です。期限が来る前に更新を申請し、認められれば住み続けられます（入管法第21条）。</li>
<li><b>永住者との違い</b>：永住者には在留期間の期限がなく、在留期間の更新はいりません（16歳以上の人は、在留カードの有効期間の更新が7年ごとにあります）。
定住者は、在留期間ごとに更新の審査を受けます。どちらも、働くことに入管法の制限はありません。</li>
<li><b>2つの種類があります。</b>
<br>① <b>告示で前もって決めた人</b>：法務省の告示（「定住者告示」、平成2年法務省告示第132号）に、日系3世や第三国定住難民などが号ごとに書かれています（1号〜8号。2号は削除されています）。
外国から新しく「定住者」で日本に来られるのは、原則としてこの告示にある人だけです（入管法第7条第1項第2号）。
<br>② <b>告示にない人</b>：すでに日本にいる人が、ほかの在留資格から変えるときなどに、法務大臣が一人ひとりの事情を見て認めるものです。
難民と認定された人や、日本人と離婚したあとも日本に住む人などがあります。</li>
</ul>
<h3>定住者告示の号と、国の表の区分</h3>
<div class="scroll"><table class="t"><thead><tr><th>告示</th><th>どんな人？</th><th>国の表の区分</th></tr></thead><tbody>
<tr><td>1号</td><td>第三国定住難民（アジアの国に一時的にいる難民のうち、国連難民高等弁務官事務所が日本に推薦した人と、その家族）</td><td>その他</td></tr>
<tr><td>3号・4号</td><td>日系3世（素行が善良な人）</td><td>日系３世</td></tr>
<tr><td>5号</td><td>日系2世・日系3世・在留期間1年以上の定住者の夫や妻</td><td>配偶者</td></tr>
<tr><td>6号</td><td>日本人・永住者・定住者などに養われる、未成年（18歳未満）で未婚の実子</td><td>未成年未婚の実子</td></tr>
<tr><td>7号</td><td>日本人・永住者・定住者などに養われる、6歳未満の養子</td><td>その他</td></tr>
<tr><td>8号</td><td>中国残留邦人とその家族</td><td>その他</td></tr>
<tr><td>告示にない</td><td>難民と認定された人、日本人などと離婚したあとも日本に住む人など</td><td>その他</td></tr>
</tbody></table></div>
<p class="note">国の表の区分と告示の号の関係は、{fw}の表と、新しく入国した人の表の見出しに書かれているものです。表にない告示の号と告示にない人が「その他」に入ることは、国の表の<a href="{notes_url}">利用上の注意</a>に書かれています。
告示6号の「18歳未満」は、この区分で新しく入国するときの条件です。すでに定住者として住んでいる人が18歳になっても、それだけで在留資格はなくなりません（くわしくは<a href="#{gid["未成年未婚の実子"]}">④の「未成年で未婚の実子」</a>）。</p>{up(2)}</section>
<section class="card" id="history"><h2>人数の推移（いつできた？）</h2>
<p>「定住者」は、<b>1989年12月</b>に公布された入管法の改正（平成元年法律第79号）で、在留資格が全面的に見直されたときにできました。
<b>1990年（平成2年）6月</b>から、前もって決めた告示とあわせて使われています。</p>
<h3>定住者の人数（{when_label(since_w)}〜{lw}）</h3>
{chart_total}
{gsrc(f"{when_label(since_w)}〜{lw}（確定した統計。1991年・1993年はなし）", "", f"{TK_ORG}（1990〜2005年末は統計書、2011年末までは登録外国人統計）")}
<p>{when_label(since_w)}は{num(T[since_w])}人でした。いちばん多かったのは{when_label(peak_w)}の{num(T[peak_w])}人で、そのあと減って{when_label(low_w)}に{num(T[low_w])}人になり、
そこからまた増えています（{lw}は{num(now)}人）。2009年には、仕事を失った日系人の帰国を国が支援する事業がありました（下の「主な出来事」）。</p>
<ul class="note">
<li>2011年までは登録外国人統計、2012年からは在留外国人統計で、数え方が違います。1991年と1993年は元の統計書がないため、数がありません。</li>
<li>区分ごとの数は{fw}からしかないため、それより前にどの区分が増えた・減ったかは分かりません。</li>
</ul>{up(5)}</section>
<section class="card" id="who"><h2>国の4区分（どんな人が？　{lw}）</h2>
<p class="note">国の統計表「国籍・地域別 在留目的別 在留外国人（特定活動・日本人の配偶者等・定住者）」の、定住者の4つの区分の人数です。割合は定住者の合計（{num(now)}人）に対する割合です。</p>
{bars}
{gsrc(f"{lw}（確定した統計）", f"定住者の合計 {num(now)}人", src2)}
<h3>それぞれの中身</h3>
<p class="note">「定住者告示 〇号」は、告示のどの号にあたるかです。多い国籍・地域は{lw}の数です。</p>
<ul class="tkl">{items}</ul>{up(3)}</section>
<section class="card" id="other"><h2>「その他」には何が入っている？</h2>
<p class="tj-lg">ここでは、書いてあることの確かさを3つに分けています。<span><span class="tj-tag f">統計で確認</span>国の統計で確かめられる事実</span>
<span><span class="tj-tag s">制度上の例</span>法律・告示・国の資料にある、「その他」に入りうる人の例</span><span><span class="tj-tag u">分からない</span>国が発表しておらず、分からないこと</span></p>
<h3><span class="tj-tag f">統計で確認</span>国の表で分かること</h3>
<p>国の表の「その他」（{lw}に{num(oth)}人、定住者の{oth / now * 100:.1f}%）は、定住者のうち<b>いちばん多い区分</b>です。{fw}（{num(P[first_w]["その他"])}人）からは{signed(oth - P[first_w]["その他"])}人でした。
国の表の<a href="{notes_url}">利用上の注意</a>に、2024年6月末から「表にない定住者の告示と、告示にない定住者は『その他』に入れる」と書かれています。
つまり「その他」には、告示にある人と告示にない人の両方が入ります。<b>全員が難民や、告示にない人というわけではありません。</b></p>
<h3><span class="tj-tag s">制度上の例</span>告示にあるが、国の表で分けていないもの</h3>
<ul class="tkl">{kokuji_items}</ul>
<p class="note">第三国定住で受け入れた難民は、2010年から{hy}年までに{num(resettle)}人です（<a href="nanmin.html">難民の認定と保護の数</a>の「定住難民」。いま定住者として住んでいる人の数ではありません）。</p>
<h3><span class="tj-tag s">制度上の例</span>告示にないもの（法務大臣が一人ひとりの事情を見て認めるもの）</h3>
<p>たとえば、次のような人がいます。どれも一人ひとりの審査で決まり、例に当てはまる人がみな認められるわけではありません。</p>
<ul class="tkl">{outside}</ul>
<p class="note">告示にない定住者は、決まった一覧も、審査のくわしい基準（入管の内部の「在留審査要領」）も、国から公開されていません。
行政書士の解説には、ほかに特別養子の縁組を解消した人や、頼れる家族のいない未成年の子なども挙げられていますが、国の公開資料では確かめられませんでした（例：<a href="{TJ_OUTSIDE_LIST}">ワンツーコール行政書士事務所</a>のページの左の一覧）。
制度上、告示にない人は外国から新しく「定住者」として入国できない（入管法第7条第1項第2号）ので、告示にない定住者は、日本にいる間にほかの在留資格から変えるなどして「定住者」になった人です。</p>
<h3><span class="tj-tag u">分からない</span>国が発表していないこと</h3>
<ul>
<li>「その他」の内わけ（上の例のそれぞれが何人いるか、どんな割合か）。</li>
<li>「その他」が増えた理由と、増えたのがどの人か。</li>
<li>上に書いた難民の認定などの数は、その年に認定・受入れをした人の数で、いま「その他」として住んでいる人の数ではありません。これらの数を足したり引いたりして、「その他」の中身を推定することはできません（このサイトでは推定の数を作っていません）。</li>
</ul>{up(4)}</section>
<section class="card" id="entry"><h2>新しく入国した人（{ey}年の1年間）</h2>
<p>{ey}年の1年間に、外国から新しく「定住者」で日本に来た人は{num(E[ey]["総数"][1])}人でした（{ey0}年は{num(E[ey0]["総数"][1])}人）。
入管法で、外国から新しく「定住者」で来られるのは<b>原則として告示にある人だけ</b>なので、入国した人の「その他」には、制度上、表で分けていない告示の人（第三国定住難民・6歳未満の養子・中国残留邦人とその家族）などが入ります。</p>
{e_table}
<p>新しく来た「その他」の人は、{ey}年に{num(E[ey]["その他"][1])}人（{ey0}年は{num(E[ey0]["その他"][1])}人）でした。
新しく来た「その他」の人のうちいちばん多い国籍・地域は、{ey}年は{esc(eo_top[ey]["国籍・地域"])}（{num(eo_top[ey]["人数"])}人）、{ey0}年は{esc(eo_top[ey0]["国籍・地域"])}（{num(eo_top[ey0]["人数"])}人）です。どの告示の人かは、表からは分かりません。</p>
<div class="tj-diff"><b>新しく入国した人の数と、いま住んでいる人の数は、別の統計です</b><ul>
<li><b>新しく入国した人</b>（出入国管理統計）：1年間に、外国から「定住者」として入国した人の数です。そのあと帰国した人も入ります。</li>
<li><b>いま住んでいる人</b>（在留外国人統計）：ある日（6月末・12月末）に日本に住んでいる人の数です。日本に来たあとに、ほかの在留資格から「定住者」に変えた人も入ります。</li>
<li>このため、1年間に入国した人の数から、いま住んでいる定住者（「その他」もふくむ）の中身を決めることはできません。</li></ul></div>
<p class="note">{TK_ENTRY_ORG}の表「{TK_ENTRY_TABLE}」の数です。名前の下の「告示 〇号」は、表の見出しに書かれた定住者告示の号です。</p>{up(2)}</section>
<section class="card" id="nat"><h2>国籍・地域別</h2>
<p class="note">どの国籍・地域の人が多いかです。割合は、{lw}の定住者の合計（{num(now)}人）に対する割合です。</p>
{nat_bars}
{gsrc(f"{lw}（確定した統計）", f"定住者の合計 {num(now)}人", f"{TK_ORG}の国籍・地域別 在留資格別の表")}
<h3>国籍・地域ごとの区分（定住者の多い15の国籍・地域、{lw}）</h3>
<p>{fw}から{lw}までに「その他」がいちばん増えたのは、{"、".join(f"{esc(n)}（{signed(dv)}人）" for dv, n in oth_up)}です。
{ua}の人の「その他」は{num(first_oth.get(ua, 0))}人から{num(by["その他"].get(ua, 0))}人になりました。
参考に、補完的保護対象者と認定された{ua}の人は、{hy}年までに{num(ua_cp)}人です（<a href="nanmin.html">難民の認定と保護の数</a>。認定した人の数で、いま定住者として住んでいる人の数ではありません）。
どの国籍・地域についても、「その他」の人がどんな事情で定住者になったかは、国の表からは分かりません。</p>
<details class="kfold"><summary>国籍・地域ごとの区分の表を開く（{len(nat_top[:15])}の国籍・地域）</summary><div class="kfoldin">
<p class="note">「その他の割合」は、その国籍・地域の定住者の中の「その他」の割合です。いちばん右は、「その他」の人数の{fw}から{lw}までの増減です。</p>
{x_table}</div></details>
<p>国籍・地域ごとの数や移り変わりは、ダッシュボードでも見られます：<a href="{dash_link(v='nat', visa='定住者')}">国籍・地域別</a>・<a href="{dash_link(v='map', visa='定住者')}">都道府県の地図</a>・<a href="{dash_link(v='trend', cmp='none', visa='定住者')}">移り変わり</a></p>{up()}</section>
<section class="card" id="events"><h2>主な出来事</h2>
<p class="note">定住者の数や中身にかかわる、法律・告示・取扱いの主な変わり目です。どれも法務省・出入国在留管理庁の資料や国会の会議録からまとめました。</p>
<div class="scroll"><table class="t"><thead><tr><th>いつ</th><th>出来事</th></tr></thead><tbody>{ev}</tbody></table></div>{up()}</section>
<section class="card" id="notes" data-open><h2>出典と、数を見るときの注意</h2>
<details class="kfold"><summary>出典と注意を開く</summary><ul class="note">
<li>人数：{TK_ORG}（政府統計の総合窓口 e-Stat）。1990〜2005年末は統計書の「定住者」、2006〜2011年末は都道府県・国籍ごとの表、2012年12月末からは在留資格別の表です。
区分ごとの数は、{fw}からの「国籍・地域別 在留目的別 在留外国人（特定活動・日本人の配偶者等・定住者）」の表です。速報は出入国在留管理庁の報道発表「在留外国人数について」です。</li>
<li>確定した統計と速報：区分ごとの数・国籍ごとの数は、どれも確定した統計（{lw}まで）です。速報（{when_label(sw)}）は定住者の合計の数だけで、区分ごとの数はありません。このページでは、速報の合計と、確定した統計の区分の数を混ぜていません。</li>
<li>新しく来た人の数：{TK_ENTRY_ORG}（e-Stat）の「{TK_ENTRY_TABLE}」（年に1回、1年間の数。{ey0}年から）。見出しに定住者告示の号が書かれている表です。いま住んでいる人の数（在留外国人統計）とは別の統計です。</li>
<li>国の表の区分の名前は、{fw}の表では「日系３世（告示３・４号）」のように告示の号つき、2024年6月末からは号のない名前です。中身は同じものとして並べています（{fw}の表から、定住者は同じ4つの区分です）。</li>
<li>難民の認定・補完的保護・人道上の配慮・第三国定住の数：出入国在留管理庁の報道発表「令和〇年における難民認定者数等について」（<a href="nanmin.html">難民の認定と保護の数</a>と同じ表）。どれもその年に認定・受入れをした人の数で、いま定住者として住んでいる人の数ではありません。</li>
<li>説明の文は、入管法（<a href="{NYUKANHO}">e-Gov 法令検索</a>）、定住者告示（<a href="{TJ_KOKUJI}">出入国在留管理庁、最近の改正 令和3年10月28日法務省告示第220号</a>）、
在留資格「定住者」のページ（<a href="{TJ_PAGE}">出入国在留管理庁</a>）と、「「その他」には何が入っている？」「主な出来事」に書いた出典（出入国在留管理庁の資料、国会の会議録）から。</li>
<li>働くことの制限は入管法第19条（別表第一の在留資格の人にかかる）、在留期間の更新は第21条、在留資格の取消しの理由は第22条の4、在留カードの有効期間は第19条の5から。
告示6号の「18歳未満」と、すでに「定住者」を持ち再入国許可で出国している人への影響がないことは、在留資格「定住者」のページ（<a href="{TJ_PAGE}">出入国在留管理庁</a>）から。</li>
<li>表にない告示の号と告示にない定住者が「その他」に入ることは、在留外国人統計の<a href="{notes_url}">利用上の注意</a>から。</li>
<li>取り込むときに、どの時点も 区分の合計＝定住者の合計、定住者の合計＝在留資格の表の定住者の数、国籍ごとの合計＝全国の数 になっているかを確かめています。
新しく来た人の表も、区分の合計＝定住者の合計、国籍ごとの合計＝全国の数 になっているかを確かめています（make_teiju.py）。</li>
<li>表（1行に1つの数の CSV）は GitHub の「データ/定住者/」にあります：<a href="{REPO_URL}">{REPO_URL}</a></li>
</ul></details>{up()}</section>
{related([("visa-index.html", "在留資格から探す", "ほかの在留資格の人数と割合"), ("tokutei.html", "在留資格「特定活動」とは", "中身がさまざまな「特定活動」の対象・できた年・目的ごとの人数"),
          ("nanmin.html", "難民の認定と保護の数", "難民認定の申請・認定、補完的保護、人道配慮、第三国定住の数"),
          ("sokuho.html", "法務省・半期速報", "確定統計より新しい在留資格別の数"), ("about.html", "このサイトについて", "使っているデータと注意")])}"""
    return page("在留資格「定住者」とは", [("日本全体", "index.html"), ("在留資格から探す", "visa-index.html"), ("定住者とは", None)], body,
                f"在留資格「定住者」を3分でわかる5つの図と、対象・できた年（1990年）・国の表の区分ごとの人数と「その他」の中身。{lw}は{num(now)}人。",
                css=("dash.css",), js=("tokutei.js",), active="teiju")


# ---------------------------------------------------------------- 難民の申請と、手続き中のくらし（決まりの説明）
# 文は国（出入国在留管理庁・法務省・厚生労働省・文部科学省・国税庁・内閣官房）の資料、法令（e-Gov）、国会の答弁書から（2026年10月に確かめた）。
# 国の資料で確かめられなかった所は「？」や「国の資料では確かめられませんでした」と書く。数のうち 毎年の数・申請時の在留資格 は データ/難民/ から、
# ほかの数（処理期間・仮滞在など）は NS_YEAR 年の報道発表の本文から。新しい発表が出たら、文と数を見直す（main で知らせる）
NS_WHEN = "2026年10月"
NS_YEAR = 2025  # 文の数のもとにした報道発表の年（令和7年における難民認定者数等について）
NS_SRC = {
    "proc": ("出入国在留管理庁「難民認定手続・補完的保護対象者認定手続」", ISA + "refugee/procedures/16-6.html"),
    "guide": ("出入国在留管理庁「難民等認定手続案内【第6版】」（2024年12月）", ISA + "content/001443352.pdf"),
    "press": ("出入国在留管理庁「令和7年における難民認定者数等について」（2026年3月27日）", ISA + "publications/press/07_00058.html"),
    "annex": ("同・別表", ISA + "content/001459863.pdf"),
    "law": ("入管法（出入国管理及び難民認定法）", NYUKANHO),
    "rule": ("入管法施行規則", "https://laws.e-gov.go.jp/law/356M50000010054"),
    "sosho": ("行政事件訴訟法", "https://laws.e-gov.go.jp/law/337AC0000000139"),
    "furiwake": ("法務省「就労制限の対象となる難民認定申請者について」", ISA + "content/930002330.pdf"),
    "m2018": ("法務省「難民認定制度の適正化のための更なる運用の見直しについて」（2018年1月12日）", ISA + "refugee/resources/nyuukokukanri03_00555.html"),
    "kondan": ("出入国在留管理政策懇談会 第3回の資料（2025年3月26日）", ISA + "content/001436451.pdf"),
    "shuro": ("法務省「難民認定申請をすれば日本で就労できるというものではありません」（2019年3月）", ISA + "content/930002306.pdf"),
    "zero": ("「国民の安全・安心のための不法滞在者ゼロプラン」（2025年5月23日）", ISA + "policies/others/05_001390.html"),
    "zero2": ("「不法滞在者ゼロプラン～強力推進パッケージ～」の解説（2026年8月）", ISA + "content/001469155.pdf"),
    "ginou": ("出入国在留管理庁「「技能実習」から「特定活動（難民認定等申請者用）」への変更の取扱い」（2026年7月）", ISA + "content/001466474.pdf"),
    "fee": ("出入国在留管理庁「在留手続の手数料の改定」", ISA + "01_00644.html"),
    "feep": ("手数料のポスター", ISA + "content/001469198.pdf"),
    "feecut": ("手数料の減額のガイドライン", ISA + "content/001469270.pdf"),
    "karihomen": ("出入国在留管理庁「仮放免制度について」", ISA + "08_00050.html"),
    "qa": ("出入国在留管理庁「退去強制手続と出国命令制度Q&A」", ISA + "deportation/guide/tetuduki_taikyo_qa.html"),
    "kanri": ("出入国在留管理庁「監理措置制度について」", ISA + "08_00045.html"),
    "unyo": ("出入国在留管理庁「令和5年改正入管法の運用状況」", ISA + "content/001435885.pdf"),
    "zaitoku": ("出入国在留管理庁「在留特別許可申請」", ISA + "deportation/procedures/08_00044.html"),
    "ihan": ("出入国在留管理庁「令和7年における入管法違反事件について」", ISA + "publications/press/13_00011.html"),
    "kaisei": ("出入国在留管理庁「令和5年改正入管法について」", ISA + "01_00457.html"),
    "juki": ("住民基本台帳法", "https://laws.e-gov.go.jp/law/342AC0000000081"),
    "kaigiroku": ("衆議院 法務委員会の会議録（2023年4月18日）", "https://www.shugiin.go.jp/internet/itdb_kaigiroku.nsf/html/kaigiroku/000421120230418010.htm"),
    "kokuho": ("国民健康保険法", "https://laws.e-gov.go.jp/law/333AC0000000192"),
    "k237": ("厚生労働省告示第237号", "https://www.mhlw.go.jp/web/t_doc?dataId=84aa6148&dataType=0&pageNo=1"),
    "t0204": ("政府の答弁書（2025年2月4日、内閣参質二一七第七号）", "https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/217/touh/t217007.htm"),
    "nenkin": ("国民年金法", "https://laws.e-gov.go.jp/law/334AC0000000141"),
    "seiho": ("厚生省の通知「生活に困窮する外国人に対する生活保護の措置について」（1954年5月8日）", "https://www.mhlw.go.jp/web/t_doc?dataId=00ta1609&dataType=1&pageNo=1"),
    "seiho2": ("厚生労働省「生活保護における外国人の取扱いについて」", "https://www.mhlw.go.jp/content/001684937.pdf"),
    "mext": ("文部科学省「外国人の子等の就学に関する手続について」", "https://www.mext.go.jp/a_menu/shotou/shugaku/detail/1422256.htm"),
    "mext12": ("文部科学省の通知（2012年7月5日）", "https://www.mext.go.jp/a_menu/shotou/clarinet/004/1323374.htm"),
    "mext24": ("文部科学省の通知（2024年6月24日、監理措置）", "https://www.mext.go.jp/a_menu/shotou/clarinet/004/1415154_00011.htm"),
    "t0509": ("政府の答弁書（2025年5月9日、内閣衆質二一七第一六二号）", "https://www.shugiin.go.jp/internet/itdb_shitsumon.nsf/html/shitsumon/b217162.htm"),
    "t0628": ("政府の答弁書（2024年6月28日、内閣参質二一三第一八四号）", "https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/213/touh/t213184.htm"),
    "t0517": ("政府の答弁書（2024年5月17日、内閣参質二一三第一二五号）", "https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/213/touh/t213125.htm"),
    "nta2875": ("国税庁 No.2875「居住者と非居住者の区分」", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2875.htm"),
    "ntag": ("国税庁 外国人の源泉徴収のリーフレット", "https://www.nta.go.jp/publication/pamph/gensen/0022011-083.pdf"),
    "nta6101": ("国税庁 No.6101「消費税の基本的なしくみ」", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6101.htm"),
    "chiho": ("地方税法", "https://laws.e-gov.go.jp/law/325AC0000000226"),
    "koshin": ("出入国在留管理庁「在留資格の変更、在留期間の更新許可のガイドライン」（最終改正 2026年6月）", ISA + "applications/resources/nyuukokukanri07_00058.html"),
    "rei": ("出入国在留管理庁 申請書の記載例・注意事項（初回申請用）", ISA + "content/001419566.pdf"),
    "tebiki": ("出入国在留管理庁「難民該当性判断の手引」（2023年3月）", ISA + "content/001393172.pdf"),
    "m2015": ("法務省「難民認定制度の運用の見直しの概要」（2015年9月）", ISA + "content/930003120.pdf"),
    "shutoku": ("出入国在留管理庁「在留資格の取得」", ISA + "applications/procedures/syutoku_00001.html"),
    "kaiken": ("法務大臣の臨時記者会見（2023年8月4日）", "https://www.moj.go.jp/hisho/kouhou/hisho08_00435.html"),
    "kodomo": ("出入国在留管理庁「本邦で出生した子どもの在留特別許可に関する対応方針について（結果公表）」（2024年9月27日）", ISA + "08_00052.html"),
    "kodomop": ("同・資料", ISA + "content/001425345.pdf"),
    "zaitokugl": ("出入国在留管理庁「在留特別許可に係るガイドライン」", ISA + "deportation/resources/08_00035.html"),
    "shien": ("出入国在留管理庁「条約難民・補完的保護対象者・第三国定住難民への支援について」", ISA + "support/fresc/12_00122.html"),
    "teijuk": ("定住者告示", TJ_KOKUJI),
    "daisan": ("閣議了解「第三国定住による難民の受入れの実施について」（2019年6月28日一部変更）", "https://www.cas.go.jp/jp/seisaku/nanmin/pdf/r010628_ryoukai.pdf"),
    "seido": ("出入国在留管理庁「難民認定制度」", ISA + "refugee/procedures/nanmin_00001.html"),
    "hokan": ("出入国在留管理庁「補完的保護対象者認定制度」", ISA + "refugee/procedures/07_00037.html"),
    "ryoko": ("出入国在留管理庁「難民旅行証明書交付申請」", ISA + "refugee/procedures/16-7.html"),
    "eiju": ("出入国在留管理庁「永住許可に関するガイドライン」（2026年2月24日改訂）", ISA + "applications/resources/nyukan_nyukan50.html"),
    "eiju27": ("同（2026年10月1日改定。2027年4月1日以降の申請に使う）", ISA + "10_00279.html"),
    "myanmar": ("出入国在留管理庁「本国情勢を踏まえた在留ミャンマー人への緊急避難措置」", ISA + "applications/resources/10_00036.html"),
    "hogo": ("出入国在留管理庁「我が国の難民等の保護状況」（2026年3月27日）", ISA + "content/001459865.pdf"),
    "keikaku": ("法務省「第2次出入国在留管理基本計画」（2026年7月）", ISA + "content/001472391.pdf"),
    "cas": ("内閣官房「難民対策について」", "https://www.cas.go.jp/jp/seisaku/nanmin/"),
    "hakusho": ("法務省入国管理局『出入国管理（平成18年版）』", ISA + "content/930002498.pdf"),
}
# 決まりの移り変わり：(いつ, 出来事, 出典の鍵)
NS_EVENTS = [
    ("1978年4月", "ベトナム難民の定住を認める（インドシナ難民の受入れ。2005年までに11,319人）", ("cas", "kondan")),
    ("1981年10月", "難民条約に入る", ("hakusho",)),
    ("1982年1月", "難民認定の制度が始まる（法律の名前が「出入国管理及び難民認定法」になる）", ("hakusho", "kondan")),
    ("2005年5月", "仮滞在と難民審査参与員の制度ができる", ("hakusho",)),
    ("2010年3月", "申請から6か月たった人は、希望すれば一律に働けるようにする（4月とする資料もある）", ("m2018", "kondan")),
    ("2010年9月", "第三国定住の受入れが始まる（タイの難民キャンプにいたミャンマーの難民）", ("kondan",)),
    ("2015年9月", "運用を見直し、申請の振り分けを始める", ("m2015",)),
    ("2016年4月", "不服の申し立てが「異議申立て」から「審査請求」になる", ("guide",)),
    ("2018年1月", "運用をさらに見直す（いまの A〜D の振り分けと、在留制限・就労制限）", ("m2018", "furiwake")),
    ("2021年5月", "ミャンマーの人への緊急避難措置（原則「特定活動・1年・働ける」）", ("myanmar",)),
    ("2022年3月", "ウクライナから避難した人の受入れを始める", ("kondan",)),
    ("2023年6月", "改正入管法が成立する", ("kaisei",)),
    ("2023年8月", "日本で生まれた子どもへの在留特別許可の方針（今回限り）", ("kaiken",)),
    ("2023年12月", "補完的保護の制度が始まる", ("hokan",)),
    ("2024年6月", "改正入管法の本体が始まる（送還停止効の例外・監理措置・在留特別許可の申請）", ("kaisei",)),
    ("2025年4月", "申請者への保護費の担当が、外務省から出入国在留管理庁へ移る", ("t0509",)),
    ("2025年5月", "「不法滞在者ゼロプラン」（B案件の型分けと在留制限、審査を早める）", ("zero",)),
    ("2026年5月", "「不法滞在者ゼロプラン～強力推進パッケージ～」（B案件にする主張の型をさらに増やす）", ("zero2",)),
    ("2026年7月", "「第2次出入国在留管理基本計画」で、再申請の制限など「現行の難民認定制度の更なる見直しを検討」とする", ("keikaku",)),
    ("2026年7月", "技能実習の途中で「特定活動」に変えるときの条件を厳しくする（7月27日から）", ("ginou",)),
    ("2026年10月", "在留資格の変更・更新の手数料が、在留期間ごとの額になる", ("fee",)),
]


def ns_src(*keys):
    """出典の一行（カードの下に書く）"""
    return '<p class="note nsrc">出典：' + "・".join(f'<a href="{esc(NS_SRC[k][1])}">{esc(NS_SRC[k][0])}</a>' for k in keys) + "</p>"


# 3分でわかる（難民）の小さな絵。形と色の付け方は SP_ICON と同じ（.sp-ic の f・h・w・hw）。人の国籍や見た目を表す絵は使わない
NR_ICON = {
    "shield": '<path class="f" d="M28 5l19 7v13c0 13-8 21-19 26C17 46 9 38 9 25V12z"/><path class="hw" d="M19 28l6 6 12-13"/>',  # 守られる・認められる
    "house": '<path class="f" d="M7 27L28 9l21 18v21H7z"/><rect class="w" x="23" y="33" width="10" height="15"/>',  # 日本にいられる・住まい
    "yen": '<circle class="f" cx="28" cy="28" r="21"/><path class="hw" d="M20 15l8 12 8-12M28 27v15M20 30h16M20 36h16"/>',  # 生活費
    "med": '<rect class="f" x="7" y="9" width="42" height="38" rx="7"/><rect class="w" x="24" y="16" width="8" height="24"/><rect class="w" x="16" y="24" width="24" height="8"/>',  # 医療・健康保険
    "net": '<path class="f" d="M5 29a23 19 0 0 1 46 0z"/><path class="h" d="M28 29v15a5 5 0 0 1-10 0"/>',  # 暮らしを支える別の制度（生活保護）
    "redo": '<path class="h" d="M45 30a17 17 0 1 1-6-13"/><path class="f" d="M47 6v16H31z"/>',  # もう一度審査を求める
    "heart": '<path class="f" d="M28 49C13 40 7 31 7 23a10.5 10.5 0 0 1 21-3 10.5 10.5 0 0 1 21 3c0 8-6 17-21 26z"/>',  # 人道上の配慮
}


def nr_icon(name, cls=""):
    return f'<svg class="sp-ic {cls}" viewBox="0 0 56 56" aria-hidden="true" focusable="false">{NR_ICON.get(name) or SP_ICON[name]}</svg>'


def nanmin_sanpun(y, ap, reg, irr, rec, cp, hum):
    """難民のページのいちばん上の「3分でわかる」（5つのステップの図とまとめ）。形は定住者・特定活動のページと同じ（.sp-*・.tj-pn・.tj-sum）。
    数は nanmin_seido_page が データ/難民/ から渡す（ap 申請者、reg・irr 申請したとき在留資格があった・なかった、rec・cp・hum 認定・補完的保護・人道配慮）。
    ほかの数（処理期間など）は下の詳しい側と同じ発表の数。色の意味はページ全体で、緑＝認められる・できる、青＝手続き中・条件による、橙＝制限・注意"""
    pc = lambda a, b: f"{a / b * 100:.1f}%"

    def step(n, title, ans, fig, point, more_href, more_text, pcls=""):
        pv = (f'<a class="pv" href="#sanpun-{n - 1}"><span aria-hidden="true">←</span> 前のSTEP</a>' if n > 1
              else '<a class="pv" href="#sanpun"><span aria-hidden="true">↑</span> はじめに</a>')
        nx = (f'<a class="nx" href="#sanpun-{n + 1}">次のSTEP <span aria-hidden="true">→</span></a>' if n < 5
              else '<a class="nx" href="#sanpun-sum">まとめ <span aria-hidden="true">→</span></a>')
        return (f'<article class="sp-s" id="sanpun-{n}" aria-labelledby="sanpun-{n}-h"><div class="sp-hd"><span class="sp-no" aria-hidden="true">STEP<b>{n}</b></span>'
                f'<h3 id="sanpun-{n}-h"><span class="nvh">STEP {n}　</span>{title}</h3></div><p class="sp-ans">{ans}</p>{fig}'
                f'<div class="sp-pt{pcls}"><b>ここがポイント</b><p>{point}</p></div>'
                f'<nav class="tj-pn" aria-label="STEP {n} から移る">{pv}<a class="dt" href="#{more_href}">{more_text} <span aria-hidden="true">↓</span></a>{nx}</nav></article>')

    # STEP 1：申請 → 審査（難民と補完的保護の両方）→ 結果
    fig1 = (f'<p class="nr-kpi">{nr_icon("doc", "b")}<span><small>{y}年に難民認定を申請した人</small><b>{num(ap)}<small>人</small></b></span></p>'
            '<div class="nr-flow" role="list" aria-label="申請から結果までの流れ">'
            f'<div class="nr-box" role="listitem">{nr_icon("doc", "b")}<b class="t">申請</b><p>地方の出入国在留管理局に出す（手数料なし）</p></div>'
            '<span class="nr-arw" aria-hidden="true">→</span>'
            f'<div class="nr-box" role="listitem">{nr_icon("one", "b")}<b class="t">審査</b><p>面接などで、2つを同時に調べる</p>'
            '<div class="nr-chk"><span>難民に当たる？</span><span>補完的保護対象者に当たる？</span></div></div>'
            '<span class="nr-arw" aria-hidden="true">→</span>'
            '<div class="nr-res" role="listitem"><b class="t">結果</b>'
            f'<div class="g">{nr_icon("shield", "")}<span><b>認められた</b>在留資格が決まる（STEP 5）</span></div>'
            f'<div class="o">{nr_icon("redo", "o")}<span><b>認められなかった</b>不服を申し立てられる（審査請求）</span></div></div></div>'
            '<dl class="nr-def"><div><dt>難民</dt><dd>人種・宗教・国籍・特定の社会的集団・政治的意見の<b>5つの理由</b>で、迫害を受けるおそれがある人</dd></div>'
            '<div><dt>補完的保護対象者</dt><dd>5つの理由には当たらないが、<b>同じように迫害のおそれ</b>がある人（紛争から逃れてきた人など。2023年12月から）</dd></div></dl>')
    s1 = step(1, "難民の申請って何？", "国に帰ると迫害を受けるおそれがあることを、国（法務大臣）に<em>認めてもらうための手続き</em>です。", fig1,
              "申請しただけでは、難民として認定されたことにはなりません。", "flow", "申請から結果までを詳しく見る")

    # STEP 2：申請したとき在留資格があったか・なかったかで2つに分かれる（どちらも「条件によって」。自動ではない）
    fig2 = ('<div class="nr-tree"><div class="nr-root">難民の認定を申請</div><div class="nr-br">'
            f'<div class="nr-col"><p class="nr-q">在留資格が<b>ある</b><span>{y}年 {num(reg)}人（{pc(reg, ap)}）</span></p><span class="nr-dn" aria-hidden="true">↓</span>'
            '<div class="nr-to"><b>条件によって<br>「特定活動」への変更が認められる</b><span>B・C案件などは認められない（STEP 3）</span></div></div>'
            f'<div class="nr-col"><p class="nr-q">在留資格が<b>ない</b><span>{y}年 {num(irr)}人（{pc(irr, ap)}）</span></p><span class="nr-dn" aria-hidden="true">↓</span>'
            '<div class="nr-to"><b>条件によって<br>「仮滞在」などが適用される</b>'
            '<ul class="nr-mini"><li><b>仮滞在</b>手続きの間、日本にいることを一時的に認める</li>'
            '<li><b>仮放免</b>収容を一時的にとく（健康上・人道上の理由など）</li>'
            '<li><b>監理措置</b>収容せず、監理人のもとで暮らす（2024年6月から）</li></ul></div></div></div></div>'
            '<p class="nr-auto"><span class="mk" aria-hidden="true">！</span><b>申請しただけでは、在留資格は自動的には与えられません</b></p>'
            '<div class="nr-note"><b class="wl">送還</b><dl><div><dt>原則</dt><dd>手続き中は、国外への送還が止まる</dd></div>'
            '<div><dt>例外</dt><dd>2024年6月から、3回目以降の申請者（「相当の理由がある資料」を出した人を除く）・3年以上の実刑を受けた人・テロリストなどは、手続き中でも送還されることがある</dd></div></dl></div>')
    s2 = step(2, "申請中、日本にいられる？", "日本にいられるかは、<em>申請したときに在留資格があるか</em>と、その後の条件で決まります。", fig2,
              "どちらの道も、認められるかどうかは審査や条件しだいです。", "status", "手続き中の立場を詳しく見る")

    # STEP 3：働けるか（結果を先に大きく）。在留資格がある人が、難民申請者用の「特定活動」に変える場合の扱い
    kinds = [("g", "○", "A", "働ける", "「特定活動（6か月・就労可）」が許可されれば", "難民の可能性が高い、または本国の情勢などで人道上の配慮が要りそうな申請", "初めて・2回目以降とも"),
             ("o", "×", "B", "原則、特定活動への変更不可", "", "難民条約の迫害に明らかに当たらない事情を主張している申請", "初めての申請"),
             ("o", "×", "C", "原則、特定活動への変更不可", "", "正当な理由なく、前と同じ主張をくり返している申請", "2回目以降の申請"),
             ("o", "×", "D1", "働けない", "「特定活動（3か月・就労不可）」", "本来の活動（技能実習・留学など）をやめた後や、出国の準備中に申請", "初めての申請"),
             ("b", "△", "D2", "最初の6か月は働けない", "その後は、更新で「就労可」が許可されれば働ける", "A〜C・D1 以外（観光などの「短期滞在」から申請した人もここ）", "初めての申請")]
    rows = "".join(f'<li class="{c}"><span class="lt">{k}</span><span class="rs"><b><i class="mk" aria-hidden="true">{m}</i>{r}</b>{f"<small>{rs}</small>" if rs else ""}</span>'
                   f'<span class="wh"><span class="tg">{tg}</span>{w}</span></li>' for c, m, k, r, rs, w, tg in kinds)
    fig3 = ('<div class="nr-for"><b>この図は</b><span>在留資格がある人が、難民申請者用の<em>「特定活動」に変える</em>ときの扱いです（2018年1月から）。</span></div>'
            f'<ol class="nr-cmp" aria-label="振り分けと、働けるか">{rows}</ol>'
            '<div class="nr-d2" aria-label="D2の流れ"><span class="a"><b>申請〜6か月</b>働けない<small>「特定活動（3か月）」を2回</small></span><span class="ar" aria-hidden="true">→</span>'
            '<span class="z"><b>6か月を過ぎたあと</b>更新で「就労可」が許可されれば働ける<small>「特定活動（6か月・就労可）」</small></span></div>'
            '<ul class="nr-ex"><li><b>2回目以降の申請</b>C案件でなくても、原則として変更不可（A案件に当たる人を除く）</li>'
            '<li><b>申請前からの在留資格のままの間</b>その在留資格で認められた範囲で働ける（この図とは別）</li>'
            '<li><b>在留資格がない人</b>仮滞在・仮放免・監理措置は、原則として働けない</li>'
            '<li><b>技能実習の途中で申請</b>2026年7月27日から、特定活動への変更の条件を見直し（<a href="#ginou">詳しい説明</a>）</li></ul>')
    s3 = step(3, "仕事はできる？", "働けるかは、<em>振り分け（A〜D）</em>で大きく変わります。", fig3,
              "6か月たてば自動的に働けるわけではなく、在留期間の更新などで「就労可」が許可される必要があります。", "furiwake", "振り分けの表を詳しく見る")

    # STEP 4：生活の支え（4つのカード。見出しの文を大きく）と、国の保護費 ≠ 生活保護 の比べる図
    cards = [("b", "yen", "① 国の保護費", "困窮状況などを審査して支給を判断", "生活費・住居費・医療費など"),
             ("b", "med", "② 健康保険", "在留資格や在留期間などで加入条件が異なる", "国民健康保険は、住民票のある人のうち、会社の健康保険などに入っていない人が入る（生活保護を受けている世帯などは除く）。仮放免・監理措置の人は入れない"),
             ("o", "net", "③ 生活保護", "国の保護費とは別制度。対象者には条件がある", "仮放免の人は対象外。手続き中の人が対象かは、国の資料に書かれていない"),
             ("g", "study", "④ 子どもの学校", "公立小中学校で教育を受けられる", "希望すれば無償。在留カードがなくても受け入れるよう、国が求めている")]
    fig4 = ('<ul class="nr-cards">' + "".join(f'<li class="{c}">{nr_icon(ic, c)}<span class="tx"><span class="nm">{t}</span><b>{bg}</b><span class="ds">{ds}</span></span></li>'
                                             for c, ic, t, bg, ds in cards) + "</ul>"
            '<div class="nr-vs" role="table" aria-label="国の保護費と生活保護のちがい"><div class="hd" role="row"><span role="columnheader"><span class="nvh">項目</span></span>'
            '<span role="columnheader" class="b">① 国の保護費</span><span role="columnheader" class="ne" aria-label="とは違う">≠</span><span role="columnheader" class="o">③ 生活保護</span></div>'
            '<div role="row"><span role="rowheader">だれのため</span><span role="cell" class="b">生活にとても困っている、難民の申請者</span><span class="ne" aria-hidden="true"></span>'
            '<span role="cell" class="o">日本国民（外国人は、永住者・定住者・認定された難民など）</span></div>'
            '<div role="row"><span role="rowheader">制度のもと</span><span role="cell" class="b">国の会議の決定（2004年）。担当は出入国在留管理庁</span><span class="ne" aria-hidden="true"></span>'
            '<span role="cell" class="o">生活保護法（外国人には、行政の措置として準用）</span></div></div>'
            '<p class="nr-tax"><b>税金・保険料</b>国籍ではなく、住所・収入・入っている制度で決まります。</p>')
    s4 = step(4, "生活費や医療費はどうなる？", "生活の支えは、<em>制度ごとに対象や決まり方が違います</em>。", fig4,
              "「国の保護費」と「生活保護」は別の制度で、片方を受けられても、もう片方を受けられるとは限りません。", "table", "できること早見表を見る")

    # STEP 5：結果の4つの行き先（人数は国の発表のまま。申請者数とは割らない）
    outs = [("g", "shield", "① 難民と認定", rec, "原則「定住者」。難民旅行証明書がもらえる"),
            ("g", "shield", "② 補完的保護対象者と認定", cp, "原則「定住者」"),
            ("g", "heart", "③ 人道的な配慮で在留を認める", hum, "「定住者」か「特定活動」"),
            ("o", "redo", "④ 認められなかった", None, "審査請求（7日以内）や裁判ができる。在留資格がなければ、退去強制などの手続きに")]
    fig5 = ('<ul class="nr-outs">' + "".join(f'<li class="{c}">{nr_icon(ic, c)}<b class="t">{t}</b>'
                                            + (f'<span class="v"><b>{num(v)}</b>人</span>' if v is not None else '<span class="v nv">在留資格の有無で<br>その後が変わる</span>')
                                            + f'<span class="ds">{ds}</span></li>' for c, ic, t, v, ds in outs) + "</ul>"
            f'<p class="nr-sum3"><span>①〜③の合計（{y}年）</span><b>{num(rec + cp + hum)}<small>人</small></b></p>'
            f'<div class="nr-two"><p class="nr-clock">{nr_icon("clock", "b")}<span>{y}年の一次審査の平均は<b>約22.5か月</b></span></p>'
            f'<p class="nr-div"><b>割り算しないで</b>申請者（{num(ap)}人）と①〜③（{num(rec + cp + hum)}人）は同じ人の集まりではないので、割って「認定率」にはできません。</p></div>')
    s5 = step(5, "結果が出たらどうなる？", "結果によって、<em>在留資格やその後の手続き</em>が変わります。", fig5,
              "①〜③の人数には、審査請求（不服の申し立て）のあとで認められた人もふくみます。", "after", "結果が出たあとを詳しく見る")

    sums = [("b", "doc", "申請しただけでは認定されない", "審査で、難民か補完的保護対象者に当たるかが判断されます。"),
            ("b", "house", "日本にいられるか、働けるかは条件による", "申請したときの在留資格と、振り分けで変わります。"),
            ("b", "yen", "生活の支えは制度ごとに違う", "国の保護費・健康保険・生活保護は、対象も審査も別です。"),
            ("g", "shield", "結果でその後が変わる", "認定などで在留資格が決まり、認められなければ別の手続きに進みます。")]
    summary = ('<section class="tj-sum" id="sanpun-sum" aria-labelledby="sanpun-sum-h"><span class="sp-k">3分でわかるまとめ</span>'
               '<h3 id="sanpun-sum-h">難民の申請について、覚えておきたい4つのこと</h3><ol class="tj-sum3 nr-sum4">'
               + "".join(f'<li class="{c}"><span class="ic">{nr_icon(ic, c)}</span><span class="tx"><b><span class="no">{"①②③④"[i]}</span>{t}</b><span>{x}</span></span></li>'
                         for i, (c, ic, t, x) in enumerate(sums)) + "</ol></section>")
    nexts = [("flow", "① 全体の流れ", "申請から結果まで、どう進む？"), ("status", "② 手続き中の立場", "振り分け・仮滞在・仮放免・監理措置・送還の決まり"),
             ("table", "③ できること早見表", "立場ごとに、働く・住民票・保険・学校など"), ("hogo", "④ 生活費の支え", "国の保護費のしくみと数"),
             ("tax", "⑤ 税金と保険料", "所得税・住民税・消費税・保険料と、最近の見直し"), ("family", "⑥ 家族", "申請・日本で生まれた子ども・認定のあとの家族"),
             ("after", "⑦ 結果が出たあと", "認定・補完的保護・人道配慮・認められなかったとき"), ("wait", "⑧ かかる期間", "一次審査と審査請求の平均の期間"),
             ("gov", "⑨ 国の説明と国会の注文", "国の発表にある説明と、附帯決議"), ("events", "⑩ 決まりの移り変わり", "1978年からの年表"),
             ("notes", "⑪ 出典と注意", "使った資料と、国の資料で確かめられなかったこと")]
    nav = ('<div class="sp-next related" id="sanpun-next"><h3>さらに詳しく調べる</h3><p class="sp-cap">このページの下の、11の詳しい説明に移ります。</p><ul>'
           + "".join(f'<li><a href="#{h}"><span>{t}<span class="rs">{s}</span></span></a></li>' for h, t, s in nexts) + "</ul></div>")
    steps = ("".join(f'<a href="#sanpun-{i}"><b>{i}</b>{t}</a>' for i, t in
                     enumerate(("申請って何？", "日本にいられる？", "仕事はできる？", "生活費や医療費は？", "結果が出たら？"), 1))
             + '<a href="#sanpun-sum"><b aria-hidden="true">✓</b>まとめ</a>')
    legend = ('<p class="nr-legend" aria-label="色の意味"><span class="g"><i></i>認められる・できる</span><span class="b"><i></i>手続き中・条件による</span>'
              '<span class="o"><i></i>制限・注意</span></p>')
    return (f'<section class="sp" id="sanpun" aria-labelledby="sanpun-h"><div class="sp-band"><span class="sp-k">3分でわかる</span>'
            f'<h2 id="sanpun-h">難民の申請と手続き中のくらしを、5つのステップで</h2><p>数は出入国在留管理庁の{y}年の発表、決まりは{NS_WHEN}時点です。</p>{legend}</div>'
            f'<nav class="sp-steps" aria-label="5つのステップとまとめ">{steps}</nav>{s1}{s2}{s3}{s4}{s5}{summary}{nav}</section>')


def nanmin_seido_page():
    """難民の申請と、手続き中のくらし（決まりの説明）。いちばん上に「3分でわかる」（nanmin_sanpun）、その下に11の詳しい説明。
    早見表はパソコンでは表、スマホでは立場ごとのカード（style.css の .nmx）"""
    folder = os.path.join(DATA, "難民")
    t = pd.read_csv(os.path.join(folder, "毎年の数.csv"))
    st = pd.read_csv(os.path.join(folder, "申請時の在留資格.csv"))
    y = NS_YEAR
    g = lambda item: int(t[(t["年"] == y) & (t["項目"] == item)]["人数"].iloc[0])
    sv = lambda visa: int(st[(st["年"] == y) & (st["在留資格"] == visa)]["人数"].iloc[0])
    ap, reg, short, irr = g("難民認定申請者数"), sv("正規滞在"), sv("短期滞在"), sv("不法滞在")
    if reg + irr != ap:
        sys.exit("難民のしくみのページ：申請時の在留資格（正規滞在＋不法滞在）が申請者数と合いません")
    rec, cp, hum = g("条約難民"), g("補完的保護対象者"), g("その他の保護")
    pc = lambda a, b: f"{a / b * 100:.1f}%"
    def up(n=None):
        """欄の下：3分でわかるの同じ話のステップへ戻る・目次へ戻る（定住者のページと同じ形）"""
        back = f'<a href="#sanpun-{n}">← 3分でわかる STEP {n}</a>' if n else '<a href="#sanpun">← 3分でわかる</a>'
        return f'<p class="kup kup2">{back}<a href="#toc">↑ 上に戻る（目次）</a></p>'
    # できること・できないことの早見表：(立場, どんな人, [(しるし, 短い説明)])。しるしは ○ △ × ？ －
    cols = ["働く", "在留カード・住民票", "国民健康保険", "国民年金", "生活保護", "国の保護費（④）", "子どもの公立学校", "動ける範囲"]
    school = ("○", "希望すれば入れる")
    rows = [
        ("特定活動・6か月（働ける）", "A案件の人、D2で申請から6か月を過ぎた人",
         [("○", "働ける"), ("○", "ある"), ("○", "入る"), ("○", "20〜59歳は入る"), ("？", ""), ("△", "申し込んで審査"), school, ("○", "決まりなし")]),
        ("特定活動・3か月（働けない）", "D1の人、D2で申請から6か月までの人",
         [("×", "働けない"), ("×", "ない（法律の決まりから）"), ("△", "3か月を超える滞在が認められれば入れる"), ("？", ""), ("？", ""), ("△", "申し込んで審査"), school, ("○", "決まりなし")]),
        ("仮滞在", "在留資格のない申請者のうち、許可された人",
         [("△", "原則働けない。許可されれば働ける"), ("○", "住民票はある"), ("○", "入る"), ("○", "20〜59歳は入る（法律の決まりから）"), ("？", ""), ("△", "申し込んで審査"), school, ("△", "原則その都道府県の中")]),
        ("仮放免", "収容を一時的にとかれた人",
         [("×", "働けない"), ("×", "ない"), ("×", "入れない"), ("？", ""), ("×", "対象にならない"), ("△", "申し込んで審査"), school, ("△", "原則その都道府県の中（外へは許可を受ける）")]),
        ("監理措置", "監理人のもとで暮らす人",
         [("△", "退去強制令書が出る前だけ、許可されれば働ける"), ("×", "ない"), ("×", "入れない"), ("？", ""), ("？", ""), ("△", "申し込んで審査"), school, ("△", "原則その都道府県の中")]),
        ("認定されたあと（定住者）", "難民・補完的保護対象者と認定された人",
         [("○", "制限なし"), ("○", "ある"), ("○", "入る"), ("○", "20〜59歳は入る"), ("○", "対象（権利ではなく行政の措置）"), ("－", "対象外（代わりに定住支援）"), school, ("○", "決まりなし")]),
    ]
    mk_word = {"○": "できる・ある", "△": "条件つき", "×": "できない・ない", "？": "国の資料に書かれていない", "－": "当てはまらない"}

    def cell(c, m, s):  # しるしは読み上げでは言葉にする（説明がないときは言葉だけ見せる）
        said = f'<span class="nvh">{esc(mk_word[m])}。</span>{esc(s)}' if s else esc(mk_word[m])
        return f'<td data-label="{esc(c)}"><div><span class="mk" aria-hidden="true">{m}</span>{said}</div></td>'
    mx = ('<div class="scroll"><table class="t nmx"><thead><tr><th scope="col">立場</th>' + "".join(f'<th scope="col">{esc(c)}</th>' for c in cols) +
          "</tr></thead><tbody>" +
          "".join(f'<tr><th scope="row">{esc(r)}<small>{esc(who)}</small></th>' + "".join(cell(c, m, s) for c, (m, s) in zip(cols, cs)) + "</tr>"
                  for r, who, cs in rows) + "</tbody></table></div>")
    # 初めて申請した人の振り分け（2018年1月15日から）。スマホでは早見表と同じく行ごとのカード
    fw_cols = ["どんな申請か", "在留資格と期間", "働けるか"]
    fw_rows = [
        ("振り分けの間", ["最長2か月", "在留期間2か月以下", "働けない"]),
        ("A案件", ["難民（補完的保護対象者）の可能性が高い。または本国の情勢などで人道上の配慮が要りそう", "すぐに「特定活動・6か月」", "働ける"]),
        ("B案件", ["難民条約の迫害に明らかに当たらない事情を主張している", "在留資格の変更を認めない（在留制限）", "－"]),
        ("C案件", ["2回目以降の申請で、正当な理由なく前と同じ主張をくり返している", "在留制限", "－"]),
        ("D1", ["D案件（A〜C 以外）のうち、本来の活動をやめた後（失踪した技能実習生・退学した留学生など）や、出国の準備期間中に申請した人", "「特定活動・3か月」", "働けない"]),
        ("D2", ["D案件のうち D1 以外（観光などの「短期滞在」から申請した人もここ）", "申請から6か月までは「特定活動・3か月」を2回、6か月を過ぎたら「特定活動・6か月」",
                "6か月までは働けない。そのあとは、在留期間の更新などで「特定活動・6か月（就労可）」が許可されれば働ける"]),
    ]
    fw = ('<div class="scroll"><table class="t nmx"><thead><tr><th scope="col">振り分け</th>' + "".join(f'<th scope="col">{c}</th>' for c in fw_cols) +
          "</tr></thead><tbody>" + "".join(f'<tr><th scope="row">{esc(r)}</th>' + "".join(f'<td data-label="{c}"><div>{esc(v)}</div></td>' for c, v in zip(fw_cols, vs)) +
                                           "</tr>" for r, vs in fw_rows) + "</tbody></table></div>")
    # 審査にかかる平均の期間（別表の図表2-9・3-11）
    wait1 = [(2018, 13.2), (2019, 17.0), (2020, 25.4), (2021, 32.2), (2022, 33.3), (2023, 26.6), (2024, 22.3), (2025, 22.5)]
    wait2 = [(2021, 20.9), (2022, 13.3), (2023, 9.9), (2024, 12.6), (2025, 13.4)]
    wmax = max(v for _, v in wait1)

    def bars(items, label):
        return (f'<ul class="nbar" aria-label="{esc(label)}">' +
                "".join(f'<li><span>{yy}年</span><span class="tr"><span class="fill" style="width:{v / wmax * 100:.1f}%"></span></span><span class="v">{v:.1f}か月</span></li>'
                        for yy, v in items) + "</ul>")
    ev = "".join(f"<tr><td>{esc(w)}</td><td>{esc(x)}<br><span class='note'>出典：" + "・".join(f'<a href="{esc(NS_SRC[k][1])}">{esc(NS_SRC[k][0])}</a>' for k in ks) +
                 "</span></td></tr>" for w, x, ks in NS_EVENTS)
    sanpun = nanmin_sanpun(y, ap, reg, irr, rec, cp, hum)
    body = f"""<h1>難民の申請と、手続き中のくらし</h1>
<nav class="gates" aria-label="このページの読み方">
<a class="gate gate-g" href="#sanpun">{sp_icon("clock", "g")}<span class="gt"><small>はじめての人に</small><b>3分でわかる</b><span class="gd">5つの図で、申請・在留・仕事・生活・結果をつかむ</span></span><span class="ga" aria-hidden="true">↓</span></a>
<a class="gate gate-b" href="#detail">{sp_icon("search", "b")}<span class="gt"><small>調べたい人に</small><b>詳しく調べる</b><span class="gd">11の詳しい説明・数・出典</span></span><span class="ga" aria-hidden="true">↓</span></a>
</nav>
{sanpun}
<div class="sp-band sp-band-b" id="detail"><span class="sp-k">詳しく調べる</span><h2>決まり・数・出典を11の項目で</h2></div>
<p class="lead">日本で難民の認定を申請すると、結果が出るまでの間、どんな立場で暮らすのでしょうか。働けるか、住民票や健康保険はあるか、税金は、家族は——を、
国の資料と法律からまとめました。申請や認定の人数は<a href="nanmin.html">難民の認定と保護の数</a>にあります。</p>
<p class="meta"><span>対象：<b>日本の決まり</b></span><span>時点：<b>{NS_WHEN}</b>（このときに国の資料で確かめた内容）</span><span>数：<b>{y}年</b>の国の発表</span></p>
<p class="note">ここに書いたのは、ふつうの取りあつかいです。一人ひとりの事情で変わることがあります。決まりはよく変わるので（2024年6月・2025年5月・2026年7月にも変わりました）、
いまの決まりは出入国在留管理庁などのページで確かめてください。</p>
{jump([("flow", "① 全体の流れ"), ("status", "② 手続き中の立場"), ("table", "③ できること早見表"), ("hogo", "④ 生活費の支え"), ("tax", "⑤ 税金と保険料"),
       ("family", "⑥ 家族"), ("after", "⑦ 結果が出たあと"), ("wait", "⑧ かかる期間"), ("gov", "⑨ 国の説明と国会の注文"), ("events", "⑩ 移り変わり"),
       ("notes", "⑪ 出典と注意"), ("sanpun", "↑ 3分でわかる")], nid="toc")}
<section class="card" id="flow"><h2>申請から結果まで、どう進む？</h2>
<ol class="nflow">
<li><b class="nt">日本に入る</b><p>観光などの在留資格で入ってから申請する人が多くいます。{y}年の申請者{num(ap)}人のうち、申請したときに在留資格があった人は{num(reg)}人（{pc(reg, ap)}）で、
そのうち「短期滞在」（観光など）が{num(short)}人でした。</p></li>
<li><b class="nt">申請する</b><p>住んでいる所を受け持つ地方の出入国在留管理局に、本人が行くのが原則です（16歳未満や病気のときは家族が代わりに出せます）。手数料はかかりません。
申請できる時期に決まりはありません。難民に当たるかと、補完的保護対象者に当たるかの両方を審査します。{y}年は申請の9割以上（約92.45%）が東京出入国在留管理局でした。</p></li>
<li><b class="nt">振り分け（最長2か月）</b><p>申請書の中身で A〜D の4つに分けます。これで、手続き中に働けるか・日本にいられるかが決まります（<a href="#status">②</a>）。</p></li>
<li><b class="nt">一次審査</b><p>難民調査官（入国審査官の中から選ばれる）が、出身国の情報を集め、通訳を通して面接（インタビュー）をします。
難民であることを証明するのは、基本的に申請者本人です。国の目安の期間（標準処理期間）は6か月ですが、{y}年の平均は約22.5か月でした（<a href="#wait">⑧</a>）。</p></li>
<li><b class="nt">結果</b><div class="nfork"><div><b>認められた</b><br>難民認定証明書が渡され、在留資格は原則「定住者」になります（<a href="#after">⑦</a>）。</div>
<div><b>認められなかった</b><br>理由を書いた書面で知らされます。</div></div></li>
<li><b class="nt">審査請求（不服の申し立て）</b><p>通知を受けた日から<b>7日以内</b>に出します。難民審査参与員（法律や国際情勢にくわしい人。3人で1つの班）が審理し、
法務大臣はその意見を必ず聴いて決めます。{y}年の平均は約13.4か月で、法務大臣が参与員の多数意見と違う判断をした例はありませんでした。</p></li>
<li><b class="nt">裁判</b><p>取り消しを求める裁判は、結果を知った日から6か月以内に起こせます（行政事件訴訟法の決まり）。</p></li>
<li><b class="nt">最終的に認められなかったとき</b><p>在留資格がなければ、出国するか、退去強制（国の決まりに反して日本にいる人を国外へ出させる手続き）の対象になります（<a href="#after">⑦</a>）。</p></li>
</ol>
{ns_src("proc", "guide", "press", "law", "sosho")}{up(1)}</section>
<section class="card" id="status"><h2>手続き中は、どんな立場？</h2>
<p>申請したときに在留資格（日本にいるための資格）があったかどうかで、道が分かれます。</p>
<div class="npath"><div><b>在留資格があった人</b><br><span class="nbig">{num(reg)}人</span>（{y}年の申請者の{pc(reg, ap)}）<br>→ 在留資格「特定活動」で結果を待つ</div>
<div><b>在留資格がなかった人</b><br><span class="nbig">{num(irr)}人</span>（{pc(irr, ap)}）<br>→ 仮滞在・仮放免・監理措置など</div></div>
<h3 id="furiwake">在留資格があった人（観光・留学・技能実習など）</h3>
<p>審査を待つ間は、在留資格を<b>「特定活動（難民認定等申請者用）」</b>に変えるよう申請できます。認められるか、働けるか、在留期間は、振り分けで決まります。
次の表は、<b>初めて申請した人</b>の扱いです（2018年1月15日から）。</p>
{fw}
<ul>
<li><b>在留制限</b>になると、いまの在留期間が切れたあとは、出国の手続き（退去強制をふくむ）の対象になります。</li>
<li><b>2回目以降の申請</b>は、原則として在留制限です。ただし A案件に当たる人は、初めての申請と同じように扱います。
{y}年の申請者のうち、前にも申請したことがある人は1,305人（約11.6%）で、いちばん多い人は7回目でした。</li>
<li><b>2025年5月から</b>、国は「不法滞在者ゼロプラン」で、B案件に当たる主張を型（パターン）に分けて在留制限をしています。B案件の割合は、2024年の約0.6%（80人）から、2025年は約14.3%（1,615人）になりました。</li>
<li id="ginou"><b>2026年7月27日から</b>、技能実習の途中で申請した人が「特定活動」に変えられる条件が厳しくなりました。これまでは実習を続けるのが難しければ変更を認めていましたが、
これからは、監理団体などが復職や実習先の変更を手伝ったのに実習を続けられなかった場合に認めます。国は「難民認定等申請自体の取扱いを見直すものではない」としています。</li>
<li><b>2026年10月1日から</b>、在留資格の変更・更新の手数料が在留期間ごとの額になりました（窓口の場合、3か月以下は1万円、3か月を超え6か月以下は1万8千円。前は一律6千円）。
生活に困っていて国の保護費（<a href="#hogo">④</a>）を受けている申請者などは、1万円に減らせる場合があります（B案件・C案件に振り分けられた人などは除く）。</li>
</ul>
<p class="note">振り分けごとの在留期間（6か月・3か月・2か月以下）は、2018年の国の資料にあるものです。2025年3月の国の会議の資料も同じ説明で、変わったという発表は見つかりませんでしたが、
「{NS_WHEN}のいまも同じ」とはっきり書いた国の資料も見つかりませんでした。</p>
{ns_src("furiwake", "m2018", "kondan", "shuro", "press", "zero", "ginou", "fee", "feep", "feecut")}
<p class="kup kup2"><a href="#sanpun-3">← 3分でわかる STEP 3</a></p>
<h3>在留資格がなかった人（在留期間が過ぎた人・正規でない入り方をした人）</h3>
<ul class="tkl">
<li><div class="tkh"><b>仮滞在</b></div><p>手続きの間、日本にいることを一時的に認めるものです。申請すると、条件に合えば許可され（別の申請は要りません）、退去強制の手続きが止まります。
上陸してから6か月を過ぎて申請した、迫害のおそれのある所から直接来たのではない、逃げるおそれがある、などのときは許可されません。
期間は原則6か月（更新できます）。住む所を指定され、動ける範囲は原則その都道府県の中です。原則として働けませんが、生活に必要な範囲で許可されれば働けます。
{y}年は1,379人を審査して73人を許可し、許可しなかった主な理由は「上陸から6か月を過ぎて申請」（1,001人）でした。</p></li>
<li><div class="tkh"><b>収容</b></div><p>入管の施設に入ることです。退去強制の手続きのための収容は30日以内（やむを得なければ、さらに30日まで）です。
国外へ出させる命令書（退去強制令書）が出たあとの収容は、3か月ごとに続ける必要があるかを見直します。</p></li>
<li><div class="tkh"><b>仮放免</b></div><p>収容を一時的にとくことです。2024年6月10日からは、病気など健康上・人道上の理由がある場合の制度になりました。
期間は3か月を超えない範囲で、延長できます。住む所を指定され、動ける範囲は原則その都道府県の中です（外へ出るには許可を受けます）。<b>働けません。</b>保証金は要りません。
逃げたり、正当な理由なく呼び出しに応じなかったりすると、1年以下の拘禁刑か20万円以下の罰金になります。</p></li>
<li><div class="tkh"><b>監理措置</b></div><p>2024年6月10日に始まった制度で、収容しないで「監理人」（親族・知人・支援者・弁護士など。2024年は9割以上が親族・知人）の見守りのもとで手続きを進めます。
必要なときは保証金（300万円以下）が条件になり、3か月を超えない間隔で窓口に出向いて暮らしの様子などを届け出ます。
働けるのは、退去強制令書が出る前で、生活に必要と認められ、監理人が同意し、入管が指定する勤め先と雇用契約を結ぶ場合だけです（{y}年の許可は4件）。令書が出たあとは働けません。</p></li>
<li><div class="tkh"><b>在留特別許可の申請</b></div><p>2024年6月10日から、退去強制の手続きの中で「日本にいることを特別に認めてほしい」と申請できるようになりました（手数料なし）。
難民の手続きとは別の手続きです。{y}年に許可されたのは1,026件でした（難民の申請者だけの数ではありません）。</p></li>
</ul>
{ns_src("law", "rule", "karihomen", "qa", "kanri", "unyo", "zaitoku", "ihan", "press")}
<h3>送還が止まる決まりと、その例外</h3>
<p>在留資格のない人が申請すると、結果が決まるまで（審査請求の期限が過ぎるか、審査請求の結論が出るまで）、国外への送還が止まります。これを「送還停止効」といいます。
2024年6月10日から、次の人は手続き中でも送還できるようになりました。</p>
<ol><li><b>3回目以降の申請者</b>（前の2回とも結論が出た人）。ただし、難民などと認めるべき「相当の理由がある資料」を出せば、送還は止まります。</li>
<li>無期または3年以上の実刑を受けた人</li><li>テロリストなど</li></ol>
<p>この例外を使って送還した人は、{y}年の1年間で59人（うち3回目以降の申請者52人）でした。</p>
{ns_src("law", "kaisei", "ihan")}{up(2)}</section>
<section class="card" id="table"><h2>できること・できないこと早見表</h2>
<p class="note">○ できる・ある　△ 条件つき　× できない・ない　？ 国の資料に書かれていない　－ 当てはまらない</p>
{mx}
<ul class="note">
<li><b>在留カード・住民票</b>：住民票の対象になる外国人は、在留期間が3か月を超える人（中長期在留者）や、仮滞在の人などに限られます。
在留期間3か月以下の人と、仮放免・監理措置の人は入りません（政府も国会で、仮放免の人などについて「住民票もない」と答えています）。</li>
<li><b>国民健康保険</b>：住民票のある外国人のうち、会社の健康保険などに入っていない人が入ります（生活保護を受けている世帯の人などは入りません）。在留期間3か月以下の「特定活動」でも、3か月を超えて滞在すると資料で認められれば入れる、という国の告示があります。
仮放免・監理措置の人は対象になりません（政府の答弁書）。会社に勤める人は、会社の健康保険に入ります（国籍の条件はありません）。</li>
<li><b>国民年金</b>：日本に住所がある20〜59歳の人が入ります（国籍の条件はありません）。住民票のない人が実際に入れるかは、国の資料に書かれていません。</li>
<li><b>生活保護</b>：法律の対象は日本国民です。外国人には「当分の間」、行政の措置として同じように保護しています（1954年の通知）。対象は永住者・定住者・日本人の配偶者など、特別永住者、
認定された難民などです。仮放免の人は対象になりません（政府の答弁書）。手続き中の「特定活動」・仮滞在・監理措置の人が対象になるかは、国の資料に書かれていません。</li>
<li><b>国の保護費</b>：申請中の人のための制度です（<a href="#hogo">④</a>）。立場によって違いがあるかは、国の資料に書かれていません。</li>
<li><b>子どもの公立学校</b>：外国人の親には子を学校に通わせる義務はありませんが、希望すれば公立の小中学校に日本人と同じく無償で受け入れます。
在留カードがなくても、別の書類で住んでいる所を確かめるなど柔軟に対応するよう、国が求めています。仮放免・監理措置の家庭にも、就学の案内をするよう求めています。</li>
</ul>
{ns_src("juki", "law", "kaigiroku", "kokuho", "k237", "t0204", "nenkin", "seiho", "seiho2", "mext", "mext12", "mext24")}{up(4)}</section>
<section class="card" id="hogo"><h2>生活費の支えはある？（国の保護費）</h2>
<p>国は、生活にとても困っている申請者（審査請求中の人もふくむ）に、<b>生活費・住居費・医療費</b>を出しています（2004年の国の会議の決定にもとづく制度）。
仕事は公益財団法人アジア福祉教育財団 難民事業本部（RHQ）に任せています。担当は<b>2025年度から出入国在留管理庁</b>です（それまで難民の申請者の分は外務省）。</p>
<ul>
<li>申し込むと、住まいもふくめた暮らしの状況を調べて、出すかどうかを総合的に判断します。自分で当面の住まいを用意できない人には、緊急の宿泊施設を用意します。</li>
<li>2023年度は、申し込んだ人が663人、受けた人が658人でした。出した額は約2億2,400万円（生活費 約1億4,600万円・住居費 約5,600万円・医療費 約2,200万円）です。
申し込んでから「始めてよい」という知らせまで平均約61日、受けていた期間は平均約13か月でした。</li>
<li>2024年度に、光熱水費に当たる分を住居費から生活費へ移しました（補完的保護の申請者の基準とそろえるため）。</li>
<li>2025年度の契約の額は、保護費が約4億100万円、緊急の宿泊施設が約5,000万円です（難民と補完的保護の申請者の合計）。</li>
</ul>
<p class="note">1日あたりの生活費や住居費の上限などの額は、国の資料では確かめられませんでした。</p>
{ns_src("t0509", "t0628", "t0517")}{up(4)}</section>
<section class="card" id="tax"><h2>税金と保険料は？</h2>
<p>税金は、国籍や在留資格ではなく、<b>日本に住んでいるか</b>と<b>収入があるか</b>で決まります。</p>
<ul>
<li><b>所得税</b>：日本に住所がある人、または1年以上続けて住んでいる人は「居住者」で、日本人と同じように計算します（国籍では決まりません）。
給料からは天引き（源泉徴収）され、居住者は年末調整があります。居住者でない人（非居住者）は、一律20.42%が天引きされます。</li>
<li><b>住民税</b>：その年の1月1日に住所がある市区町村で、前の年の収入にかかります。住民票がなくても、その市区町村に住所があれば課税できるという決まりがあります（地方税法第294条第3項）。
住民票のない人に実際にどう課税しているかは、国の資料では確かめられませんでした。</li>
<li><b>消費税</b>：買い物をすれば、立場に関係なくだれでも負担します（10%、食料品などは8%）。</li>
<li><b>国民健康保険料・国民年金保険料</b>：入っている人が払います。入れない立場の人（仮放免・監理措置など）には、払う決まりがありません。</li>
<li><b>働けない立場の人</b>：働くことが認められていないので、ふつうは給料にかかる税金は生じません。</li>
</ul>
<h3>外国人全体にかかわる最近の見直し</h3>
<p>難民の申請者だけの話ではありませんが、在留の手続きと税金・保険料を結びつける見直しが進んでいます。</p>
<ul>
<li>2026年6月：在留資格の変更・更新のガイドラインに、国民健康保険料などの高額・長期の未納で悪質なものは不利に扱うこと、関係機関からの情報をもとに判断することがあることを書き加えました。</li>
<li>2027年4月1日から：在留期間の更新などのときに、税金と社会保険料の納付状況の書類を出すことになります（「特定活動」「定住者」もふくみます）。
難民の申請者の「特定活動」の更新で実際にどう使うかは、国の資料では確かめられませんでした。</li>
</ul>
{ns_src("nta2875", "ntag", "chiho", "nta6101", "kokuho", "nenkin", "koshin", "rule")}{up(4)}</section>
<section class="card" id="family"><h2>家族はどうなる？</h2>
<h3>申請は一人ひとり</h3>
<ul>
<li>申請は本人ごとです（16歳未満の子は、親などが代わりに出せます）。申請書には、家族構成（両親・きょうだい・配偶者・子）と、申請の理由のために家族に何か起きたかを書く欄があります。</li>
<li>審査では、家族が迫害を受けるおそれがあるとき、「その家族であること」を理由に本人にもおそれが生じることがある、と国の手引に書かれています。</li>
<li>保護者のいない子どもの申請は早く処理し、必要なら医師や弁護士などの面接への立ち会いを試しに認めています。</li>
<li>家族の一人が認定されたら、ほかの家族も認定されるという決まりは、国の資料に見当たりませんでした。</li>
</ul>
<h3>手続き中に日本で生まれた子ども</h3>
<ul>
<li>日本で生まれた外国人の子は、生まれてから60日までは在留資格がなくても日本にいられます。それより長くいるには、生まれてから<b>30日以内</b>に在留資格の取得を申請します（手数料なし）。
申請しないで60日を過ぎると、退去強制の対象になります。</li>
<li>親が在留資格をもたないとき（仮放免など）や、親が手続き中の「特定活動」のとき、子にどの在留資格が出るかを説明した国の資料は見つかりませんでした。</li>
</ul>
<h3>日本で生まれた子どもへの在留特別許可（2023年8月の方針、今回限り）</h3>
<ul>
<li>対象：在留資格がなく国外へ出させる命令を受けた子のうち、2024年6月10日までに日本で生まれ、小・中・高校で教育を受けた子と、その家族（基本は両親）。</li>
<li>親に、不法入国、偽装結婚、薬物、1年を超える実刑、複数の前科などがあるときは対象外です。</li>
<li>結果（2024年9月27日公表）：対象の201人のうち、許可171人（111世帯）、不許可21人、自分で帰国9人でした。111世帯のうち、全員が許可されたのは73世帯です。
許可された子の在留資格は、留学138人・特定活動22人・定住者9人・家族滞在2人でした。</li>
<li>国は、同じような措置を追加で行うことはないとしています。</li>
</ul>
<h3>在留特別許可のガイドライン（2024年6月10日から）</h3>
<p>「日本で家族と暮らすという子の利益」を有利な事情として考えると書いています。一方で、不法にいた期間が長いことは不利な事情として考えます。</p>
<h3>認定されたあとの家族</h3>
<ul>
<li>日本語教育などの定住支援プログラムは、認定された人の家族も、希望すれば受けられます。</li>
<li>外国にいる配偶者・子を日本に呼ぶとき、どの在留資格になるかを説明した国の資料は見つかりませんでした（「定住者」の配偶者・子を認める告示の決まりはあります）。</li>
<li>第三国定住（外国の難民キャンプなどから政府が受け入れる難民）の家族は、国連難民高等弁務官事務所（UNHCR）の推薦などの条件で呼び寄せられます（2020年4月から、すべての第三国定住難民が対象）。</li>
</ul>
{ns_src("proc", "rei", "tebiki", "m2015", "law", "shutoku", "kaiken", "kodomo", "kodomop", "zaitokugl", "shien", "teijuk", "daisan")}{up()}</section>
<section class="card" id="after"><h2>結果が出たあとは？</h2>
<p>{y}年に、難民認定の制度で日本にいることを認められた人は{num(rec + cp + hum)}人でした（難民と認定{num(rec)}人・補完的保護対象者と認定{num(cp)}人・人道配慮{num(hum)}人）。</p>
<ul class="tkl">
<li><div class="tkh"><b>難民と認定された人</b></div><p>在留資格は原則「定住者」で、働くことに制限はありません。在留資格がなかった人でも、一定の場合を除いて許可されます。
「難民旅行証明書」（パスポートの代わり）がもらえ、有効期間中は何度でも出国・再入国できます（手数料4,800円）。
永住の条件がゆるくなり、ふつうは「原則10年住んでいること」のところ「認定から5年以上続けて住んでいること」でよく、「自分で暮らしていける収入」の条件を満たさなくても許可されることがあります。
日本語教育や生活ガイダンスなどの定住支援プログラムも受けられます（2025年度から出入国在留管理庁が担当）。実際に何年の在留期間が付くかは、国の資料では確かめられませんでした。</p></li>
<li><div class="tkh"><b>補完的保護対象者と認定された人</b></div><p>原則「定住者」です。難民旅行証明書はもらえませんが、再入国の許可は受けられます。永住の条件は、難民と同じようにゆるくなります。</p></li>
<li><div class="tkh"><b>人道配慮で日本にいることを認められた人</b></div><p>「定住者」か「特定活動」になります。アフガニスタン・ウクライナ・シリア・スーダン・ミャンマーの5か国は、本国の情勢を理由に「特定活動」で在留を認める扱いで、
{y}年末で34,749人です（難民の手続きを経ていない人もふくむ。うちミャンマー33,688人）。</p></li>
<li><div class="tkh"><b>認められなかった人</b></div><p>在留資格があれば、その期間が終わるまでは日本にいられます（在留制限の人は更新されません）。在留資格がなければ、送還が止まる期間が終わったあと、退去強制の対象になります。
自分の費用で早く出国した場合などは、ふたたび日本に入れない期間が5年から1年に短くなることがあります。
{y}年に申請を取り下げた人などのうち、約71.7%は出国し、約13.8%は在留資格のないまま日本にいました（2026年2月1日時点）。</p></li>
</ul>
<p class="note">参考：2026年10月1日に改定された永住のガイドライン（2027年4月1日以降の申請に使う）は、ふつうの「10年」を数えるとき、手続き中の「特定活動」の期間は数えないとしています。</p>
{ns_src("law", "seido", "hokan", "ryoko", "eiju", "eiju27", "shien", "myanmar", "kaisei", "press")}{up(5)}</section>
<section class="card" id="wait"><h2>結果が出るまで、どれくらいかかる？</h2>
<h3>一次審査の平均（申請の日から結果の日まで）</h3>
{bars(wait1, "一次審査の平均処理期間")}
<h3>審査請求の平均</h3>
{bars(wait2, "審査請求の平均処理期間")}
<ul>
<li>{y}年の一次審査を振り分けごとに見ると、A案件が約17.0か月、B案件が約4.3か月、C案件が約26.8か月、D案件が約21.7か月でした。</li>
<li>{y}年12月末で、まだ結果の出ていない申請は15,969人でした（いちばん多かった5月末の20,141人から約20.7%減りました）。</li>
<li>国は、2026年中に新しく受け付けた申請を平均6か月以内で処理し、2030年までに平均処理期間を6か月にすることを目指しています。</li>
</ul>
{ns_src("press", "annex", "zero")}{up(5)}</section>
<section class="card" id="gov"><h2>国の説明と、国会の注文</h2>
<p class="note">国が発表した資料や計画に書かれている説明と、国会が法律に付けた注文（附帯決議）を、そのまま紹介します。このサイトの判断ではありません。</p>
<h3>国（出入国在留管理庁など）の説明</h3>
<ul>
<li>{y}年に申請者が減ったことを、不法滞在者ゼロプランによって「誤用・濫用的な難民認定申請が抑制されたため」と説明しています。</li>
<li>申請を取り下げた人には「誤用・濫用的な申請が多く含まれていると考えられます」としています。</li>
<li>国は「保護率」という数を出しています。一次審査で保護した人（認定と人道配慮）が、取り下げなどを除いた処理数にしめる割合で、{y}年は約12.0%、取り下げの多い上位5か国を除くと約28.8%です。</li>
<li>ほかの国と、認定者の数や認定率で単純に比べるのは適当でない、と書いています。</li>
<li>2026年7月の「第2次出入国在留管理基本計画」では、再申請の制限など、難民認定制度のさらなる見直しを検討するとしています。</li>
</ul>
<h3>国会（参議院）の附帯決議</h3>
<ul>
<li>2023年の改正入管法に付けた注文で、送還停止効の例外の決まりを、施行から5年以内をめどに見直すことを検討するよう求めています。</li>
<li>子どもの利益や、家族がいっしょに暮らすことに十分配慮するよう求めています。</li>
</ul>
{ns_src("press", "hogo", "keikaku", "kondan")}{up()}</section>
<section class="card" id="events"><h2>決まりの移り変わり</h2>
<details class="kfold"><summary>年表を開く（1978年〜{NS_WHEN}）</summary>
<div class="scroll"><table class="t"><thead><tr><th>いつ</th><th>出来事</th></tr></thead><tbody>{ev}</tbody></table></div></details>{up()}</section>
<section class="card" id="notes"><h2>出典と注意</h2>
<details class="kfold"><summary>出典と注意を開く</summary><ul class="note">
<li>このページの文は、国（出入国在留管理庁・法務省・厚生労働省・文部科学省・国税庁・内閣官房）の資料、法令（e-Gov 法令検索）、国会の会議録と政府の答弁書から、{NS_WHEN}にまとめました。
どこから取ったかは、それぞれの欄の下と年表に書いています。支援団体や報道の資料は使っていません。</li>
<li>数は、{y}年の数の発表（{esc(NS_SRC["press"][0])}）などからです。申請者数・認定者数などは<a href="nanmin.html">難民の認定と保護の数</a>と同じ表です。</li>
<li>国の資料では確かめられなかったこと：振り分けごとの在留期間がいまも2018年と同じか／在留期間3か月の人の住民票の実際の扱い／住民票のない人の国民年金と住民税の実際の扱い／
手続き中の「特定活動」・仮滞在・監理措置の人の生活保護／保護費の1日あたりの額／家族の一人が認定されたときのほかの家族の扱い／日本で生まれた子の在留資格／外国にいる家族を呼ぶときの在留資格／
認定された人の在留期間の年数。</li>
<li>国の資料どうしで書き方が違う所：申請から6か月で働けるようにした時期（2010年3月とする資料と4月とする資料）、仮滞在の条件の書き方（ページと法律で書き方が違う）、
難民旅行証明書の有効期間（法律は1年以上5年以内、案内は5年）。</li>
<li>このページは決まりの説明です。一人ひとりの手続きの相談には使えません。</li>
</ul></details>{up()}</section>
{related([("nanmin.html", "難民の認定と保護の数", "難民認定の申請・認定、補完的保護、人道配慮の数"),
          ("tokutei.html", "在留資格「特定活動」とは", "難民認定の手続き中の人や、本国の情勢による在留も入る在留資格"),
          ("teiju.html", "在留資格「定住者」とは", "難民と認定された人などが入る在留資格"),
          ("fuho.html", "不法残留者数", "在留期間が過ぎたあとも出国していない人の数"), ("about.html", "このサイトについて", "使っているデータと注意")])}"""
    return page("難民の申請と、手続き中のくらし", [("日本全体", "index.html"), ("難民の認定と保護の数", "nanmin.html"), ("難民の申請と手続き中のくらし", None)], body,
                f"難民の認定を申請した人は、結果が出るまでどんな立場で暮らす？働けるか・住民票・健康保険・税金・家族・かかる期間を、国の資料からまとめました（{NS_WHEN}時点）。",
                css=("dash.css",), active="seido")


REGIONS =[("北海道・東北", PREFS[0:7]), ("関東", PREFS[7:14]), ("中部", PREFS[14:23]), ("近畿", PREFS[23:30]), ("中国", PREFS[30:35]),
           ("四国", PREFS[35:39]), ("九州・沖縄", PREFS[39:47])]


def area_index_page(d):
    """地域から探す：名前で探す・日本地図・地方ごとの都道府県・都道府県の一覧・政令市"""
    found = [[p, "都道府県", PREF_FILE[p], d.pref_series[p][LATEST]] for p in PREFS]
    for p in PREFS:
        for name, link, subt, ref in d.areas[p]:
            found.append([name, f"{p}　{'政令市' if isinstance(ref, tuple) else subt}".strip(), href(link), total_of(d, ref)])
            if isinstance(ref, tuple):
                for c in d.cities[ref]:
                    found.append([d.munis[c]["name"], f"{p}　区", f"muni-{c}.html", d.muni_series[c].get(LATEST, 0)])
    regions = "".join(f'<section><h3>{r}<span class="n">{num(sum(d.pref_series[p][LATEST] for p in ps))}人</span></h3><ul class="picks">' + "".join(
        f'<li><a href="{PREF_FILE[p]}"><b>{p}</b><span class="n">{num(d.pref_series[p][LATEST])}人</span></a></li>' for p in ps) + "</ul></section>"
        for r, ps in REGIONS)
    cities = sorted(d.cities, key=lambda k: -city_series(d, k).get(LATEST, 0))
    city_links = "".join(f'<li><a href="{href(f"city-{c}.html")}"><b>{c}<small>{p}</small></b><span class="n">{num(city_series(d, (p, c)).get(LATEST, 0))}人</span></a></li>'
                         for p, c in cities)
    pref_tot = {p: d.pref_series[p][LATEST] for p in PREFS}
    body = f"""<h1>地域から探す</h1>
{meta_line("47都道府県と、その中の市区町村（政令市の区も）")}
<p class="lead">都道府県・市区町村ごとに、住んでいる外国人の数・国籍・在留資格・移り変わりが見られます。</p>
<section class="card finder" id="find"><h2>名前で探す</h2>
<label class="dctl"><span class="dlab">都道府県・市区町村の名前（漢字で入れてください。例：新宿、浜松、大泉）</span><input type="search" placeholder="例：新宿" enterkeyhint="search" autocomplete="off"></label>
<p class="dhelp fcount" role="status"></p><ul class="fresults"></ul>
<script type="application/json">{jdump(found)}</script>
<noscript><p class="note">名前で探すには JavaScript を使います。下の地図や一覧から選んでください。</p></noscript></section>
<section class="card" id="map"><h2>日本地図から選ぶ</h2><p class="cardmeta">色は在留外国人の数（{when_label(LATEST)}）</p>{japan_map([("在留外国人の数（全体）", pref_tot)])}</section>
<section class="card" id="regions"><h2>地方から選ぶ</h2><p class="cardmeta">数は在留外国人の数（{when_label(LATEST)}）</p><div class="regions">{regions}</div></section>
{pref_table(d, "都道府県の一覧（並べ替えられます）")}
<section class="card" id="cities"><h2>政令市（区のある市）</h2><p class="cardmeta">市全体の数（{when_label(LATEST)}、多い順）。市のページから、区ごとの数も見られます。</p>
<ul class="picks wide">{city_links}</ul></section>
{related([(dash_link(v="rank", rt="muni"), "全国の市区町村のランキング", "ダッシュボードで、人数・人口に占める割合・増加率などで並べる"),
          (dash_link(v="cmp"), "地域どうしを比べる", "ダッシュボードの地域比較（5地域まで）"),
          ("nat-index.html", "国籍から探す", "国籍・地域ごとの人数と、住んでいる地域")])}
{NOTES}"""
    return page("地域から探す", [("日本全体", "index.html"), ("地域から探す", None)], body,
                "都道府県・市区町村ごとの在留外国人の数。名前で探す・日本地図・地方から選べます。", active="area")


ABOUT_PAGE = {"特定活動": "tokutei.html", "定住者": "teiju.html"}  # 説明のページがある在留資格


def visa_index_page(d):
    """在留資格から探す：資格ごとの人数と割合（全国）。くわしい見方はダッシュボードへ"""
    now = d.japan[LATEST]
    visas = d.japan_visa[LATEST]
    vi = visa_items(visas)
    year, ten = d.japan_visa[YEAR_AGO], d.japan_visa[TEN_AGO]
    rows = []
    for i, (v, c, _) in enumerate(vi, 1):
        links = (f"<a href='{dash_link(v='map', visa=v)}'>地図</a>・<a href='{dash_link(v='nat', visa=v)}'>国籍</a>・"
                 f"<a href='{dash_link(v='trend', cmp='none', visa=v)}'>移り変わり</a>")
        about = f"<br><span class='sub'><a href='{ABOUT_PAGE[v]}'>どんな資格？（説明のページ）</a></span>" if v in ABOUT_PAGE else ""  # 中身がさまざまな資格は説明のページへ
        rows.append((v, [(str(i), i), (f"<a href='{dash_link(v='area', visa=v)}'>{esc(v)}</a>{about}", None), (num(c), c), (f"{c / now * 100:.1f}%", f"{c / now * 100:.3f}")] +
                     diff_cells(c, year.get(v)) + [diff_cells(c, ten.get(v))[0], (links, None)]))
    head = [("順位", True), ("在留資格", False), ("人数", True), ("割合", True), ("1年前から", True), ("増減の割合", True), ("10年前から", True), ("ダッシュボードで見る", False)]
    sorts = [("人数の多い順", 2, -1), ("人数の少ない順", 2, 1), ("1年間の増加数の多い順", 4, -1), ("1年間の増加率の高い順", 5, -1),
             ("10年間の増加数の多い順", 6, -1), ("名前の順", 1, 1)]
    body = f"""<h1>在留資格から探す</h1>
{meta_line(f"日本に住む外国人（全国、{len(vi)}の在留資格）")}
<p class="lead">在留資格は、外国人が日本でどんな活動をして暮らすかを決める資格です（例：永住者、留学、技能実習）。資格の名前を押すと、ダッシュボードでその資格の人の地域・国籍・移り変わりが見られます。</p>
<p class="lead">「特定活動」は、ワーキング・ホリデーや難民認定の申請中など、中身がさまざまな在留資格です。対象・できた年・目的ごとの人数は<a href="tokutei.html">在留資格「特定活動」とは</a>で説明しています。
「定住者」（日系3世、難民と認定された人など）は<a href="teiju.html">在留資格「定住者」とは</a>で説明しています。</p>
{jump([("pie", "人数と割合"), ("list", "在留資格の一覧"), ("visa-trend", "移り変わり")])}
<section class="card" id="pie"><h2>在留資格ごとの人数と割合</h2><p class="cardmeta">対象：全国　集計時点：{when_label(LATEST)}</p>{breakdown("在留資格の内わけ", vi, now, "在留資格", "全国", "visa")}</section>
<section class="card" id="list"><h2>在留資格の一覧</h2><p class="cardmeta">順位は人数の多い順。「—」は前の時点にはなかった在留資格（特定技能は2019年から）。増加率は、もとの人数が少ないと大きく出ます。</p>
{tbl(head, rows, sorts, "在留資格の名前で探す", "留学", 40, "visa-list")}</section>
<section class="card" id="visa-trend"><h2>在留資格の移り変わり（国籍・地域を選べます）</h2>{visa_lines([visa_set(d, "全部の国籍・地域", lambda w: d.japan_visa.get(w))] + [visa_set(d, n, lambda w, n=n: d.nat_visa.get((w, n)), nat=n) for n, _, _ in nat_items({n: s[LATEST] for n, s in d.nat_series.items() if s.get(LATEST)})[:20]], "全国")}</section>
{related([("tokutei.html", "在留資格「特定活動」とは", "中身がさまざまな「特定活動」の対象・できた年・目的ごとの人数"),
          ("teiju.html", "在留資格「定住者」とは", "日系3世・難民と認定された人などの「定住者」の対象・できた年・区分ごとの人数と「その他」の中身"),
          (dash_link(v="visa"),"地域・国籍を選んで在留資格を見る", "ダッシュボードの在留資格の内訳（都道府県・市区町村も）"),
          (dash_link(v="rank", rt="visa", rm="rate5"), "在留資格を増え方で並べる", "ダッシュボードのランキング（5年間の増加率など）"),
          (dash_link(v="rank", rt="nx"), "国籍×在留資格の組み合わせランキング", "「ベトナム（技能実習）」のように、国籍・地域と在留資格の組み合わせごとに並べる"),
          ("nat-index.html", "国籍から探す", "国籍・地域ごとの人数と、多い在留資格")])}
<section class="card note"><h2>在留資格のまとめ方</h2><ul>
<li>「技能実習」「特定技能」「高度専門職」は、号ごとの細かい区分（1号・2号など）をまとめています。</li>
<li>「特定活動」は、ワーキング・ホリデーや難民認定の申請中など、中身がさまざまな在留資格です。対象・できた年・目的ごとの人数は<a href="tokutei.html">在留資格「特定活動」とは</a>にまとめています。</li>
<li>「定住者」は、日系3世や難民と認定された人など、法務大臣が特別な理由を考えて住むことを認める在留資格です。対象・できた年・区分ごとの人数は<a href="teiju.html">在留資格「定住者」とは</a>にまとめています。</li>
<li>移り変わりの線では、名前が変わった在留資格を今の名前にそろえています（2015年4月より前の「投資・経営」は「経営・管理」、「技術」と「人文知識・国際業務」は「技術・人文知識・国際業務」、2010年7月より前の「就学」は「留学」）。</li>
<li>グラフ（円グラフ・棒グラフ・線の名前と、保存する画像）では、名前の長い「技術・人文知識・国際業務」を「技人国（ぎじんこく）」と短くしています。表では元の名前のままです。</li>
</ul></section>
{NOTES}"""
    return page("在留資格から探す", [("日本全体", "index.html"), ("在留資格から探す", None)], body,
                "在留資格（永住者・留学・技能実習など）ごとの在留外国人の数と割合、増え方。", active="japan")


def about_page(d):
    UNKNOWN_GAP = d.japan[LATEST] - sum(d.pref_series[p][LATEST] for p in PREFS)  # 住む所が未定・不詳の人（日本全体の数にだけ入る）
    CITY_ZERO_NOTE ="".join(f"{when_label(w)}の{c}は、国の表の市の合計が0人になっていますが、区の合計（{num(v)}人）を使っています。" for c, w, v in CITY_ZERO)
    body = f"""<h1>このサイトについて</h1>
<section class="card"><h2>目的</h2><p>日本に住む外国人について考えるときの材料として、国（出入国在留管理庁）が発表している数を、国籍・在留資格・都道府県・市区町村ごとに見やすくしたサイトです。
数はそのまま示し、良い・悪いの判断や、ある考えに導くような言い方はしていません。</p></section>
<section class="card"><h2>使っているデータ</h2><ul>
<li>出入国在留管理庁「在留外国人統計」（2012年12月末〜{when_label(LATEST)}）。2013年からは6月末と12月末の年2回</li>
<li>同「登録外国人統計」（1959〜2011年末。2011年までの数え方）。1959〜2005年は紙の統計書のスキャンしかないため、画像から数字を読み取りました。
数は印刷どおりです。表の中の合計と照らし合わせ、合わない所は画像で確かめています。元の統計書の中で合計が合っていない所（印刷のずれ）は、合わせるために数を変えず、印刷のまま残しています。
読み取れなかったマスの一部は、表の合計から求めた数です（どのマスかは GitHub の表の「直した所」にあります）</li>
<li>どちらも政府統計の総合窓口（e-Stat）で公開されているものです</li>
<li>外国人の割合の分母：総務省「住民基本台帳に基づく人口、人口動態及び世帯数調査」（日本人住民と外国人住民の合計、各年1月1日現在。2014年から）。12月末の在留外国人の数を、翌年1月1日の人口で割っています</li>
<li><a href="sokuho.html">半期速報</a>：出入国在留管理庁の報道発表「〇年〇月末現在における在留外国人数について」（令和2年末から）。確定統計とは別に示しています</li>
<li><a href="fuho.html">不法残留者数</a>：出入国在留管理庁の報道発表「本邦における不法残留者数について」（2021年1月1日現在の発表から）。在留外国人統計とは別の統計です</li>
<li><a href="kika.html">帰化の数</a>：法務省民事局「帰化許可申請者数等の推移」（1952年から）。在留外国人統計とは別の統計です</li>
<li><a href="nanmin.html">難民の認定と保護の数</a>：出入国在留管理庁の報道発表「令和〇年における難民認定者数等について」（2020年の数の発表から。毎年の数は1978年から）。在留外国人統計とは別の統計です</li>
<li><a href="tokutei.html">在留資格「特定活動」とは</a>：在留外国人統計の「特定活動」の在留目的ごとの数（2012年12月末から）、出入国在留管理庁「出入国管理統計」の新しく入国した人の入国目的ごとの数（2024年から）と、入管法・特定活動告示・出入国在留管理庁などの資料からまとめた説明</li>
<li><a href="teiju.html">在留資格「定住者」とは</a>：在留外国人統計の「定住者」の区分（日系３世・配偶者・未成年未婚の実子・その他）ごとの数（2023年12月末から）、出入国管理統計の新しく入国した人の区分ごとの数（2024年から）と、入管法・定住者告示・出入国在留管理庁の資料・国会の会議録からまとめた説明</li></ul></section>
<section class="card note"><h2>数を見るときの注意</h2><ul>
<li><b>2011年までと2012年からで数え方が違います。</b>2011年までは「外国人登録をした人」（短い期間の滞在の人なども入る）、2012年12月末からは「中長期在留者と特別永住者」です。つなげて増え方を見るときは注意してください。</li>
<li>市区町村ごとの数は、2023年6月末までは主な国籍だけ、2023年12月末からは全部の国籍が公表されています。</li>
<li>外国人が10人以下の市町村は、国の表で次のように扱われています。2019年12月末〜2023年6月末は、在留資格別の表にのっていません（非表示）。
2023年12月末・2024年6月末は、全国で1つの「その他」にまとめられていて、市町村ごとの数がありません。2024年12月末からは、人数は出ますが国籍・在留資格が公表されていません（このサイトでは「公表されていない」と示します）。</li>
<li><b>「0人」と「データなし」は分けています。</b>国の表にその区分がない時点（「韓国」と「朝鮮」を分けずに数えていた2015年6月末まで、など）や、国の表にその市区町村がのっていない時点（外国人が10人以下の市町村など）は「データなし」とし、0人にはしていません。ダッシュボードでは、線を押すと理由が出ます。</li>
<li>日本全体の数と、都道府県の数の合計は少し違います。住む所が「未定・不詳」の人は、日本全体の数にだけ入っているためです（{when_label(LATEST)}は{num(UNKNOWN_GAP)}人）。</li>
<li>政令指定都市の数は、国の表の市の合計です。市の合計がない時点は、その時点にあった区の合計です（浜松市は2024年1月に7つの区が3つの区になりました。2023年12月末は前の7つの区の合計です）。政令指定都市になる前の年は、その市の数です。{CITY_ZERO_NOTE}</li>
<li>市町村の名前が変わった所（篠山市→丹波篠山市、滝沢村→滝沢市など）や、国の表で字が違う所（諌早市→諫早市、八丈島八丈町→八丈町など）は、今の市町村の数としてつなげています。浜松市天竜区は2024年1月に番号が変わりましたが、区の範囲は同じなのでつなげています。ほかの市町村と合併して範囲が変わった所（鳩ケ谷市など）はつなげていません。</li>
<li>在留資格の「技能実習」「特定技能」「高度専門職」は、号ごとの細かい区分をまとめて示しています。</li>
<li>国籍・地域の名前は国の表のとおりです。ただし、2005年までの古い表で書き方が違うもの（「ヴェトナム」など）や名前が変わった国（「ビルマ」など）は、今の名前にそろえています。「韓国・朝鮮」は2015年6月末まで1つにまとめて数えられています。
2006〜2018年の表でも、同じ国の書き方の違い（「カーボヴェルデ」など）、名前が変わった国（「グルジア」→「ジョージア」）、元の表のマスで文字の順が入れ替わっていたもの（「・トバゴトリニダード」）、中点が半角のもの（「韓国･朝鮮」）は、今の名前にそろえています（一覧は GitHub の「データ/国籍・地域の名前の直し.csv」）。</li>
<li>地図の形は、国土地理院「地球地図日本」（2015年1月1日時点の市区町村の境界）を加工して作ったものです。その後に町や村から市になってコードが変わった所は、今のコードに合わせています。日本全体の地図では、沖縄県を左上の枠の中に移して1.3倍の大きさにし、小笠原諸島は入れていません。東京都の地図には伊豆諸島・小笠原諸島を入れていません。</li>
<li>「国籍から探す」の世界地図の形は、Natural Earth（日本の見方の国境の版）を加工して作ったものです。太平洋を真ん中にし、南極は入れていません。小さな国は丸で示しています。
国の表の「朝鮮」は国籍を表すものではないため、地図には色を付けていません。香港の人は、国の表では「中国」と「英国」に分かれて入っているため、香港だけの色は付けていません。</li>
<li>日本全体の地図の「四角で並べる」は、都道府県を同じ大きさの四角で、おおよその位置に並べたものです（面積や形は表していません）。</li>
<li>在留資格の移り変わりの線では、名前が変わった在留資格を今の名前にそろえています（2015年4月より前の「投資・経営」は「経営・管理」、「技術」と「人文知識・国際業務」は「技術・人文知識・国際業務」、2010年7月より前の「就学」は「留学」）。</li>
<li>グラフ（円グラフ・棒グラフ・線の名前と、保存する画像）では、名前の長い「技術・人文知識・国際業務」を「技人国（ぎじんこく）」と短くしています。表では元の名前のままです。</li></ul></section>
<section class="card"><h2>表と作り方</h2><p>このサイトのページ、元にした表（1行に1つの数が入った CSV）、作り方のプログラムは、GitHub で公開しています：
<a href="{REPO_URL}">{REPO_URL}</a>。表は自由に取り出して使えます（使うときは下の出典を書いてください）。</p></section>
<section class="card"><h2>出典の書き方</h2><p>出入国在留管理庁「在留外国人統計（旧登録外国人統計）」（政府統計の総合窓口 e-Stat）を加工して作成</p><p>地図：国土地理院「地球地図日本」（<a href="https://www.gsi.go.jp/kankyochiri/gm_jpn.html">https://www.gsi.go.jp/kankyochiri/gm_jpn.html</a>）を加工して作成（国土地理院コンテンツ利用規約による）</p>
<p>世界地図：Natural Earth（<a href="https://www.naturalearthdata.com/">https://www.naturalearthdata.com/</a>）を加工して作成</p></section>"""
    return page("このサイトについて", [("日本全体", "index.html"), ("このサイトについて", None)], body, "このサイトの目的・使っているデータ・数を見るときの注意。",
                active="about")


def main():
    d = load()
    d.areas = {p: area_list(d, p) for p in PREFS}
    if os.path.isdir(OUT):
        for f in os.listdir(OUT):
            if f.endswith(".html"):
                os.remove(os.path.join(OUT, f))
    os.makedirs(os.path.join(OUT, "assets"), exist_ok=True)
    for f in ("app.js", "style.css", "dash.js", "dash.css", "share.js", "sokuho.js", "fuho.js", "kika.js", "nanmin.js", "xmaker.js", "tokutei.js", "favicon.svg", "favicon.ico", "apple-touch-icon.png"):  # しるしは make_favicon.py で作る
        shutil.copyfile(os.path.join(BASE, "site_assets", f), os.path.join(OUT, "assets", f))
    src, dst = os.path.join(BASE, "site_assets", "map"), os.path.join(OUT, "assets", "map")  # 地図の形
    os.makedirs(dst, exist_ok=True)
    for f in set(os.listdir(dst)) - set(os.listdir(src)):
        os.remove(os.path.join(dst, f))
    for f in os.listdir(src):
        shutil.copyfile(os.path.join(src, f), os.path.join(dst, f))
    for key in d.cities:  # 政令市の数を先に作り、国の表の合計が0人だった時点（CITY_ZERO）を「このサイトについて」に書く
        city_series(d, key)
    pages = {"index.html": top_page(d), "nat-index.html": nat_index_page(d), "area-index.html": area_index_page(d), "visa-index.html": visa_index_page(d),
             "about.html": about_page(d), "dash.html": dash_page(), "sokuho.html": sokuho_page(), "fuho.html": fuho_page(), "kika.html": kika_page(),
             "tokutei.html": tokutei_page(d), "teiju.html": teiju_page(d), "nanmin.html": nanmin_page(), "nanmin-seido.html": nanmin_seido_page()}
    ny = int(pd.read_csv(os.path.join(DATA, "難民", "毎年の数.csv"))["年"].max())
    if ny > NS_YEAR:  # 難民のしくみのページの文は NS_YEAR 年の発表に合わせて書いている
        print(f"難民のしくみのページ（nanmin-seido.html）：{ny}年の数の発表があります。文と数（NS_YEAR）を見直してください")
    for p in PREFS:
        pages[PREF_FILE[p]] = pref_page(d, p)
    for p in PREFS:  # 市区町村：都道府県の中の順位（政令市は区の合計で1つ）
        areas = sorted(area_list(d, p), key=lambda a: -total_of(d, a[3]))
        n = len(areas)
        for i, (name, link, subt, ref) in enumerate(areas, 1):
            text = f"{p}の{n}の市区町村のうち {i}番目に多い"
            if isinstance(ref, tuple):
                pages[link] = city_page(d, ref, text)
                wards = sorted(d.cities[ref], key=lambda c: -d.muni_series[c].get(LATEST, 0))
                for j, c in enumerate(wards, 1):
                    pages[f"muni-{c}.html"] = muni_page(d, c, f"{ref[1]}の{len(wards)}の区のうち {j}番目に多い")
            else:
                pages[link] = muni_page(d, ref, text)
    ranked = sorted((n for n, s in d.nat_series.items() if s.get(LATEST)), key=lambda n: -d.nat_series[n][LATEST])
    for i, n in enumerate(ranked, 1):
        pages[nat_file(n)] = nat_page(d, n, i)
    size = 0
    for name, text in pages.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(text)
        size += len(text.encode("utf-8"))
    print(f"ページ {len(pages)}（合わせて {size / 2**20:.1f}MB）")
    print("地図と市区町村：" + ("すべて合っています" if not MAP_WARN else f"合わない所 {len(MAP_WARN)}"))
    for w in MAP_WARN:
        print("  " + w)
    if NO_REGION:  # 新しい国籍・地域の名前が出たら、データ/国籍・地域の区分.csv に足す
        print("地域区分の表にない国籍・地域：" + "、".join(sorted(NO_REGION)))
    if WORLD_WARN:  # 新しい国籍・地域の名前が出たら、make_world_map.py の NE_NAME で地図の国と結ぶ
        print("世界地図に形のない国籍・地域：" + "、".join(WORLD_WARN))


if __name__ == "__main__":
    main()
