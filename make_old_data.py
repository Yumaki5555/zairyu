# 1959〜2005年のスキャンの表を、読み取り結果（元データ/OCR結果）から組み立て、行と列の合計で確かめて直す
# 使い方: <python> -I make_old_data.py [ファイル名の一部…]   （渡すと、その表だけ）
#
#   1. 表の形（old_specs.py）どおりに行と列を当てはめる。読めなかったマスは 0（「-」の読み落としがほとんど）
#   2. 行の確かめ（総数＝内わけの合計）と列の確かめ（総数の行＝都道府県の合計）をする
#   3. 合わないとき、1つのマスを直せば合う所があれば直す（行と列の両方が合うものだけ）。直した所は全部記録する
#   4. 人が画像を見て直した所は 元データ/OCR直し.csv（ファイル, 行, 列, 正しい数, メモ）に書くと、それを使う
#   書き出し: データ/古い表/<表の種類>.csv と データ/古い表/確かめ.csv（表ごとの結果）・直した所.csv
import csv
import glob
import os
import re
import sys
from collections import defaultdict
from statistics import median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ocr_assemble import read_spread
from old_specs import FILES, REGION_COLS

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ")
OCR = os.path.join(SRC, "OCR結果")
OUT = os.path.join(BASE, "データ", "古い表")


def ocr_jsons(rel):
    year, name = rel.split("/")
    stem = os.path.splitext(name)[0]
    return sorted(glob.glob(os.path.join(OCR, year, f"{stem}_p*.json")))


def expand(parts, cols, total):
    out = []
    for p in parts:
        if p == "*":  # 合計の列より右の列すべて
            out += [c for c in cols if c != total and not c.startswith(total)]
        elif p.startswith("*"):
            out += [c for c in cols if c.endswith(p[1:]) and c != total and not c.startswith(total)]
        else:
            out.append(p)
    return out


TEMPLATES = {}  # 同じ形の表で、行の数が合ったページの行の位置。{(形, ページ): {年: {左右: 位置}}}（総数が「-」の行があると目印の列で行が欠けるため）
RETRY = set()  # 型がまだなくて列を当てられなかった表（ほかの表を読んだあとで、もう一度）
COL_TEMPLATES = {}  # 同じ形の表で、列の数が合った半ページの列の位置。{(形, ページ, 左右): {年: 位置}}（全部「-」の列は読み落とされて列が欠けるため）


def map_columns(cols, ref, h):
    """読めた列（右端の x）を、型の列（ref）の何番目かに当てる。型を少しずらし・伸び縮みさせて、いちばん多く重なる所で"""
    # 列はほぼ同じ間かくで並ぶので、型を1列分ずらしても同じだけ重なる。そのときは、ずれのいちばん小さいもの（ページごとの紙の位置のずれは小さい）
    best = (-1, 0.0, 1.0, 0.0)
    mid = sum(ref) / len(ref)
    for i in range(-20, 21):
        a = 1 + i * 0.005
        for c in cols[:3]:
            for r in ref[:6]:
                b = c - a * r
                ok = sum(1 for x in cols if min(abs(x - (a * y + b)) for y in ref) < h * 0.6)
                shift = -abs(a * mid + b - mid)
                if (ok, shift) > best[:2]:
                    best = (ok, shift, a, b)
    _, _, a, b = best
    pred = [a * y + b for y in ref]
    out = {}
    for j, x in enumerate(cols):
        i = min(range(len(pred)), key=lambda k: abs(pred[k] - x))
        if abs(pred[i] - x) < h * 0.6 and i not in out.values():
            out[j] = i
    return out


def _near(by_year, year):
    """年ごとの型のうち、いちばん近い年のもの（同じ年があればそれ。スキャンした年ごとに紙の位置や大きさが少し違う）"""
    if not by_year:
        return None
    return by_year[min(by_year, key=lambda y: (abs(y - year), y))]


def assemble(rel, spec):
    jsons = ocr_jsons(rel)
    year = int(rel.split("/")[0])
    rows = spec["rows"]
    cols, table, src, problems = [], {}, {}, []
    if len(jsons) != len(spec["pages"]):
        problems.append(f"ページの数 {len(jsons)}（形では {len(spec['pages'])}）")
    for pi, j in enumerate(jsons[:len(spec["pages"])]):
        key = (id(spec), pi)  # 型はページごと（同じ表でも1ページ目と2ページ目で行の間隔が違う）
        tmpl = {sd: _near({y: t[sd] for y, t in TEMPLATES.get(key, {}).items() if sd in t}, year) for sd in ("左", "右")}
        tm = {sd: t for sd, t in tmpl.items() if t}
        o = read_spread(j, len(rows), tm)
        rv = o["sides"].get("右")
        if "右" not in tm and rv and not rv["exact"] and o["sides"].get("左"):
            # 右ページの行の数が合わず、型もない（その年だけの形の表）：右ページの行は左ページと同じ（都道府県）なので、左ページの行の位置を型にする
            o["sides"]["右"] = read_spread(j, len(rows), tm, right_from_left=True)["sides"]["右"]
        for side, v in o["sides"].items():
            if v and v["exact"]:  # 行の数がそのまま合った半ページの行の位置を、同じ形のほかの表の型にする
                TEMPLATES.setdefault(key, {}).setdefault(year, {}).setdefault(side, v["rows"])
            elif v:
                problems.append(f"p{pi + 1}{side} 行は型で補った")
        for si, side in enumerate(("左", "右")):
            names = spec["pages"][pi][si]
            cols += names
            v = o["sides"].get(side)
            if not v:
                problems.append(f"p{pi + 1}{side} 読めない")
                continue
            if len(v["rows"]) != len(rows):
                problems.append(f"p{pi + 1}{side} 行の数 {len(v['rows'])}（形では {len(rows)}）")
            ckey = (id(spec), pi, side)
            colmap = {c: c for c in range(len(v["cols"]))}
            if len(v["cols"]) == len(names):
                COL_TEMPLATES.setdefault(ckey, {}).setdefault(year, v["cols"])
            elif ckey in COL_TEMPLATES:  # 列の数が違う：型の列の位置に当てる
                colmap = map_columns(v["cols"], _near(COL_TEMPLATES[ckey], year), 30)
                missing = [names[i] for i in range(len(names)) if i not in colmap.values()]
                problems.append(f"p{pi + 1}{side} 列の数 {len(v['cols'])}（形では {len(names)}）→型に当てた（読めなかった列: {missing}）")
            else:
                problems.append(f"p{pi + 1}{side} 列の数 {len(v['cols'])}（形では {len(names)}）見出し: {v['heads']}")
                RETRY.add(rel)
            for (r, c), (val, text, conf) in v["cells"].items():
                if r < len(rows) and c in colmap and colmap[c] < len(names):
                    table[(rows[r], names[colmap[c]])] = val
                    src[(rows[r], names[colmap[c]])] = (pi + 1, side, text, conf, v["rows"][r], v["cols"][c], v["skew"])
    filled = set()
    for r in rows:
        for c in cols:
            if (r, c) not in table:
                table[(r, c)] = 0
                filled.add((r, c))
    return rows, cols, table, src, filled, problems


def assemble_natrows(rel, spec):
    """行が国籍の表（都市別・全国の国籍×在留資格）。行の名前を読んで、その年の国籍の並びに当てはめる。
    spec["groups"]: [{"pages": [ページ…], "cols": [[左の列], [右の列]]}, …]（列の組ごとに、同じ国籍の行が何ページかに続く）"""
    from row_labels import read_labels, align
    jsons = ocr_jsons(rel)
    pdf = os.path.join(SRC, "登録外国人統計", rel)
    names = spec["names"]
    table, src, problems, cols, rows_all = {}, {}, [], [], []
    work = os.path.join(BASE, "元データ", "OCR結果_行の名前")  # 行の名前を読んだ画像と結果（Windows の読み取り）
    for gi, g in enumerate(spec["groups"]):
        found = []  # (ページ, 左の行の番号, 読んだ字, read_spread の結果)
        for pg in g["pages"]:
            o = read_spread(jsons[pg - 1], 999, right_from_left=True)
            lv = o["sides"]["左"]
            tag = f"{os.path.splitext(os.path.basename(rel))[0]}_p{pg:02d}"
            texts = read_labels(pdf, pg, lv["rows"], lv["x_min"], work, tag, skew=lv["skew"])
            for i, t in enumerate(texts):
                found.append((pg, i, t, o))
        from nat_names import master
        res = align([f[2] for f in found], names, master())
        low = [(f[0], f[2], n, round(sc, 2)) for f, (n, sc, ex) in zip(found, res) if sc < 0.5]
        extra = [n for n, sc, ex in res if ex]
        if extra:
            problems.append(f"組{gi + 1} 見出しの一覧になかった国: {extra}")
        if len(found) > len(names):
            problems.append(f"組{gi + 1} 行が多すぎる（{len(found)}、名前は{len(names)}）")
        names_g = [n for n, _, _ in res]
        gcols = []
        for side_i, side in enumerate(("左", "右")):
            gcols += g["cols"][side_i]
        cols += [c for c in gcols if c not in cols]
        # 列の型：同じ組で列の数が合ったページの列の位置（「-」ばかりの列が読めず列の数が足りないページは、これに当てる）
        ref = {}
        for pg, i, t, o in found:
            for side_i, side in enumerate(("左", "右")):
                v = o["sides"].get(side)
                if v and side not in ref and len(v["cols"]) == len(g["cols"][side_i]):
                    ref[side] = v["cols"]
        colmaps = {}
        for (pg, i, t, o), name in zip(found, names_g):
            if name is None:
                continue
            if name not in rows_all:
                rows_all.append(name)
            for side_i, side in enumerate(("左", "右")):
                v = o["sides"].get(side)
                cn = g["cols"][side_i]
                if not v:
                    continue
                if (pg, side) not in colmaps:
                    colmaps[(pg, side)] = {c: c for c in range(len(v["cols"]))}
                    if len(v["cols"]) != len(cn):
                        msg = f"p{pg}{side} 列の数 {len(v['cols'])}（形では {len(cn)}）"
                        if ref.get(side):
                            colmaps[(pg, side)] = map_columns(v["cols"], ref[side], 30)
                            msg += "→型に当てた"
                        problems.append(msg)
                cm = colmaps[(pg, side)]
                for (r, c), (val, text, conf) in v["cells"].items():
                    if r == i and c in cm and cm[c] < len(cn):
                        table[(name, cn[cm[c]])] = val
                        src[(name, cn[cm[c]])] = (pg, side, text, conf, v["rows"][r], v["cols"][c], v["skew"])
        problems.append(f"組{gi + 1} 名前の読み取りが弱い行 {len(low)}（並びの順で当てた）")
    # 行の並び：一覧の順に、一覧の外の国は読んだ位置に入れる
    rows = rows_all
    spec["names_found"] = rows
    filled = set()
    for r in rows:
        for c in cols:
            if (r, c) not in table:
                table[(r, c)] = 0
                filled.add((r, c))
    return rows, cols, table, src, filled, problems


def _signature(o):
    """ページの見出しの字（左ページ）。列の組を見分けるのに使う"""
    v = o["sides"].get("左")
    return re.sub(r"[\d\s()（）統第表別别外国人登錄者]", "", "".join(v["heads"])) if v else ""


def national_checks(cols):
    """全国の表の確かめ：総数＝在留資格の合計、在留資格＝その内わけの合計"""
    tops = [c for c in cols if c != "総数" and "（内わけ" not in c]
    return [("総数", tops)] + [(c, [x for x in cols if x.startswith(c + "（内わけ")]) for c in tops
                              if any(x.startswith(c + "（内わけ") for x in cols)]


def apply_manual(rows, cols, table, spec, fixes):
    """人が画像で確かめた直し。読み取りで見つからなかった列（「-」ばかりで列と分からなかった）や行（国の行）も足す"""
    order = {n: i for i, n in enumerate(spec.get("names", []))}
    for (r, c), v in fixes.items():
        if r not in rows:  # 国の並び（その年の国籍の一覧の順）の位置に入れる
            later = [k for k, x in enumerate(rows) if order.get(x, -1) > order.get(r, 1e9)]
            rows.insert(later[0] if later else len(rows), r)
            for c2 in cols:
                table.setdefault((r, c2), 0)
        if c not in cols:
            cols.append(c)
            for r2 in rows:
                table.setdefault((r2, c), 0)
            if spec.get("kind") == "national":
                spec["checks"] = national_checks(cols)
        table[(r, c)] = v


def assemble_national(rel, spec):
    """国籍別在留資格別（全国）の表。列の組が何ページかずつ繰り返す（組1の行の塊1、組2の行の塊1、…、組1の行の塊2、…）。
    列の名前：各組の最初のページの「総数」の行の数が、同じ年の都道府県×在留資格の表の総数の行（全国の在留資格別の数）と同じ列に、
              その在留資格の名前を付ける。合わない列は、すぐ前の在留資格の内わけ（在留目的。足すと前の列になる）
    行の名前：行の名前を読んで、その年の国籍の並び（都道府県×国籍の表の見出し）に当てる。国籍別の総数が同じかも手がかりにする"""
    from difflib import SequenceMatcher
    from row_labels import read_labels, align
    from nat_names import master
    jsons = ocr_jsons(rel)
    pdf = os.path.join(SRC, "登録外国人統計", rel)
    problems = []
    vrows, vcols, vtab, *_ = assemble(spec["visa_from"], FILES[spec["visa_from"]][2])
    visa_tot = {c: vtab[("総数", c)] for c in vcols if c != "総数"}
    reads = [read_spread(j, 999, right_from_left=True) for j in jsons]
    sigs = [_signature(o) for o in reads]
    K = 1
    for k in range(1, 6):
        # k ページおきに見出しが似ているか。見出しの読めなかったページ（最後の「-」ばかりのページなど）は比べない。
        # 見出しの読み取りが短いページもあるので、3分の2以上が似ていればよい
        sims = [SequenceMatcher(None, sigs[i], sigs[i + k]).ratio() for i in range(len(sigs) - k)
                if len(sigs[i]) >= 5 and len(sigs[i + k]) >= 5]
        if sims and sum(x > 0.6 for x in sims) >= len(sims) * 2 / 3:
            K = k
            break
    # 組2・組3のページは左の列に「-」が多く、数の少ない列も数の列として見る（行の名前の所と間違えないように）
    for i in range(len(reads)):
        if i % K:
            reads[i] = read_spread(jsons[i], 999, right_from_left=True, label_frac=0.15)
    # 2つ目の塊からの組2・組3のページ：「-」ばかりの列が続くと境が分からないので、同じ組の最初のページの境を、列のずれの分だけ動かして使う
    for i in range(K, len(reads)):
        g = i % K
        ref, v = reads[g]["sides"].get("左"), reads[i]["sides"].get("左")
        if g and ref and ref["x_min"] is not None and ref["cols"]:
            d = []
            for sd in ("左", "右"):  # ずれは、読めた列と最初のページの列の位置の差（左で読めなければ右で）
                a, b2 = reads[g]["sides"].get(sd), reads[i]["sides"].get(sd)
                if not d and a and b2 and a["cols"] and b2["cols"]:
                    d = [x for x in (min((c - r for r in a["cols"]), key=abs) for c in b2["cols"]) if abs(x) < 60]
            reads[i] = read_spread(jsons[i], 999, right_from_left=True, x_min_left=ref["x_min"] + (median(d) if d else 0))
    group_cols = []
    order, last = list(visa_tot), -1  # 在留資格の列は、都道府県×在留資格の表と同じ順に並ぶ
    for g in range(K):
        o = reads[g]
        names = []
        for side in ("左", "右"):
            v = o["sides"].get(side)
            if not v:
                continue
            for c in range(len(v["cols"])):
                val = v["cells"].get((0, c), (None,))[0]
                used = [x for x, _ in names]
                hit = [n for n, t in visa_tot.items() if t == val and n not in used]
                # 同じ人数の在留資格が2つあるとき（2000年の法律・会計業務と医療が95人）は、前に決めた列より後ろの最初のもの
                later = [n for n in hit if order.index(n) > last]
                if g == 0 and side == "左" and c == 0:
                    names.append(("総数", "総数"))
                elif len(hit) == 1 or later:
                    n = hit[0] if len(hit) == 1 else later[0]
                    names.append((n, "資格"))
                    last = order.index(n)
                else:
                    names.append((None, val))
        out, parent, k = [], None, 0
        for n, kind in names:
            if n:
                out.append(n)
                parent, k = n, 0
            else:
                k += 1
                out.append(f"{parent}（内わけ{k}）" if parent else f"不明{len(out)}")
        group_cols.append(out)
    nat_tot = {}
    if spec.get("nat_from") and ocr_jsons(spec["nat_from"]):
        nrows, ncols, ntab, *_ = assemble(spec["nat_from"], FILES[spec["nat_from"]][2])
        nat_tot = {c: ntab[("総数", c)] for c in ncols}
    names_list = spec["names"]
    work = os.path.join(BASE, "元データ", "OCR結果_行の名前")
    blocks = []
    for b in range(0, len(reads), K):
        o = reads[b]
        lv = o["sides"]["左"]
        tag = f"{os.path.splitext(os.path.basename(rel))[0]}_p{b + 1:02d}"
        texts = read_labels(pdf, b + 1, lv["rows"], lv["x_min"], work, tag, skew=lv["skew"])
        totals = [lv["cells"].get((i, 0), (None,))[0] for i in range(len(lv["rows"]))]
        blocks.append((texts, totals))
    flat_t = [t for texts, _ in blocks for t in texts]
    flat_v = [v for _, tots in blocks for v in tots]
    hint = []
    for t, v in zip(flat_t, flat_v):
        same = [n for n, x in nat_tot.items() if x == v and v is not None and n in names_list]
        hint.append(same[0] if len(same) == 1 else t)
    res = align(hint, names_list, master())
    row_names = [n for n, _, _ in res]
    weak = sum(1 for _, sc, _ in res if sc < 0.5)
    problems.append(f"列の組 {K}、名前の読み取りが弱い行 {weak}")
    table, src, rows, cols = {}, {}, [], []
    for g in range(K):
        cols += [c for c in group_cols[g] if c not in cols]
    pos = 0
    for bi, b in enumerate(range(0, len(reads), K)):
        n_here = len(blocks[bi][0])
        names_here = row_names[pos:pos + n_here]
        pos += n_here
        for g in range(K):
            if b + g >= len(reads):
                break
            o = reads[b + g]
            gc = group_cols[g]
            row_name = {i: n for i, n in enumerate(names_here)}
            if g > 0 and o["sides"].get("左"):
                # 同じ塊のページは同じ組み方なので、組1のページの行の位置を型にして読み直す（組2・組3のページは「-」だけの行が抜けたり、
                # 見出しの数を行と間違えたりして、行の数が同じでもずれていることがある）
                first = reads[b]["sides"]
                tmpl = {sd: first[sd]["rows"] for sd in ("左", "右") if first.get(sd) and len(first[sd]["rows"]) == n_here}
                if len(o["sides"]["左"]["rows"]) != n_here:
                    problems.append(f"p{b + g + 1} 行の数 {len(o['sides']['左']['rows'])}（組1は {n_here}）→組1のページの行の位置に当てた")
                o = read_spread(jsons[b + g], n_here, template=tmpl, relaxed=True,
                                x_min_left=(o["sides"]["左"] or {}).get("x_min"))
            nleft = len(o["sides"]["左"]["cols"]) if o["sides"].get("左") else 0
            for side in ("左", "右"):
                v = o["sides"].get(side)
                if not v:
                    continue
                ref = reads[g]["sides"].get(side)  # 同じ組の最初のページ（列の名前を決めたページ）
                base = 0 if side == "左" else (len(reads[g]["sides"]["左"]["cols"]) if reads[g]["sides"].get("左") else nleft)
                colmap = {c: c for c in range(len(v["cols"]))}
                if ref and ref["cols"] and v["cols"] and len(v["cols"]) != len(ref["cols"]):  # 列の数が違う：最初のページの列の位置に当てる
                    colmap = map_columns(v["cols"], ref["cols"], 30)
                    problems.append(f"p{b + g + 1}{side} 列の数 {len(v['cols'])}（組の最初のページは {len(ref['cols'])}）→型に当てた")
                for (r, c), (val, text, conf) in v["cells"].items():
                    if row_name.get(r) and c in colmap and base + colmap[c] < len(gc):
                        table[(row_name[r], gc[base + colmap[c]])] = val
                        src[(row_name[r], gc[base + colmap[c]])] = (b + g + 1, side, text, conf, v["rows"][r], v["cols"][c], v["skew"])
        for n in names_here:
            if n and n not in rows:
                rows.append(n)
    spec["names_found"] = rows
    spec["checks"] = national_checks(cols)
    filled = set()
    for r in rows:
        for c in cols:
            if (r, c) not in table:
                table[(r, c)] = 0
                filled.add((r, c))
    return rows, cols, table, src, filled, problems


TOTAL_ROW = "合計の行"  # 政令市・特別区の行（その区の行の合計）
PREF_RE = re.compile(r"^(北海道|東京都|京都府|大阪府|[^都道府県]{2,3}県)")


def _pref_prefix(text, pref):
    """行の名前の頭が都道府県の名前とどれだけ似ているか（読み取りの字が少し違っても）。戻り値 (似ている度合い, 名前の字数)"""
    from difflib import SequenceMatcher
    best, k_best = 0.0, 0
    for k in range(1, min(len(text) - 1, len(pref) + 1) + 1):
        sc = SequenceMatcher(None, text[:k], pref).ratio()
        if sc > best + 1e-9:
            best, k_best = sc, k
    return best, k_best


def _clean_city(w, r):
    """市・区の名前：Windows の読み取り w（日本の字の形で読める）を使い、頭や終わりの読み違い（記号、罫線）を、RapidOCR の読み取り r で補う。
    名前は必ず「市」か「区」で終わる"""
    w = re.sub(r"^[^一-龥々〆ヶヵぁ-んァ-ヴ]+", "", w)
    if not w:
        return r
    if w[-1] not in "市区" and r and r[-1] in "市区":
        w = (w[:-1] if len(w) >= len(r) else w) + r[-1]
    return w


def _city_fix():
    """市・区の名前の読み違いを人が確かめて直す表（元データ/名前の直し.csv）。(都道府県, 読み取り) → 正しい名前"""
    fix = {}
    path = os.path.join(SRC, "名前の直し.csv")
    if os.path.exists(path):
        with open(path, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                fix[(r["都道府県"], r["読み取り"])] = r["正しい名前"]
    return fix


def assemble_cityrows(rel, spec):
    """国籍別市・区別（2000〜2005年）：見開きの左右がそれぞれ別の表。行＝市・区、列＝総数と主な国籍。
    都道府県の名前は、その都道府県の最初の行の、市・区の名前より左に書いてある（字の位置で見分ける。都道府県は決まった順に出てくる）。
    市・区の名前は、Windows の日本語の読み取りで読み直す（RapidOCR は中国の字の形で読むため）"""
    from row_labels import read_labels
    from old_specs import PREFS
    jsons = ocr_jsons(rel)
    pdf = os.path.join(SRC, "登録外国人統計", rel)
    work = os.path.join(BASE, "元データ", "OCR結果_行の名前")
    cols = spec["cols"]
    table, src, problems, rows = {}, {}, [], []
    spec["kinds"] = {}
    pi_pref, pref, parent = -1, None, None
    fix = _city_fix()
    for pi, j in enumerate(jsons):
        o = read_spread(j, 999, both_labels=True)
        for side in ("左", "右"):
            v = o["sides"].get(side)
            if not v or v["x_min"] is None:
                continue
            if len(v["cols"]) != len(cols):
                problems.append(f"p{pi + 1}{side} 列の数 {len(v['cols'])}（形では {len(cols)}）")
            h = v["h"]
            x_from = max(0 if side == "左" else o["w"] / 2, v["x_min"] - 16 * h)
            tag = f"{os.path.splitext(os.path.basename(rel))[0]}_p{pi + 1:02d}{'L' if side == '左' else 'R'}"
            texts = read_labels(pdf, pi + 1, v["rows"], v["x_min"] - h * 0.2, work, tag, x_from=x_from, skew=v["skew"])
            for i, (lab0, lx) in enumerate(zip(v["labels"], v["label_x"])):
                lab = _clean_city(re.sub(r"[\s　]", "", texts[i]), re.sub(r"[\s　]", "", lab0))
                if not lab:
                    continue
                # 都道府県の名前のある行：名前の書き出しが、市・区の名前よりずっと左（数の列から12字分くらい左）
                # ページの始めでは、前のページの続きの都道府県の名前がもう一度書いてある。今の都道府県と次の3つから、似ているものを選ぶ
                if lx and lx[0][0] < v["x_min"] - 11.3 * h:
                    cands = range(max(pi_pref, 0), min(len(PREFS), pi_pref + 4))
                    sc, k, pj = max((*_pref_prefix(lab, PREFS[q]), -q) for q in cands)
                    pj = -pj
                    if sc < 0.5:
                        pj, k = (max(pi_pref, 0) if i == 0 else min(pi_pref + 1, len(PREFS) - 1)), 0
                    if pj != pi_pref:
                        pi_pref, pref, parent = pj, PREFS[pj], None
                    lab = lab[k:]
                else:
                    # 字の位置で分からなくても（都道府県の名前を RapidOCR が読み落とした）、日本語の読み取りが次の都道府県の名前で始まれば、そこから
                    for q in range(pi_pref + 1, min(len(PREFS), pi_pref + 3)):
                        if lab.startswith(PREFS[q]) and len(lab) > len(PREFS[q]):
                            pi_pref, pref, parent = q, PREFS[q], None
                            lab = lab[len(PREFS[q]):]
                            break
                if pref is None:
                    problems.append(f"p{pi + 1}{side}{i} 都道府県より前の行「{lab}」")
                    continue
                if (pref, lab) in fix:
                    lab = fix[(pref, lab)]
                if lab.endswith("区") and parent:
                    special = "特別区" in parent
                    name, kind = (lab if special else parent + lab), ("市区町村" if special else "区")
                else:
                    name, kind = lab, "市区町村"
                    parent = lab if (lab.endswith("市") or "特別区" in lab) else None
                key = f"{pref}:{name}"
                if key in rows:
                    key = f"{key}（{pi + 1}{side}{i}）"
                rows.append(key)
                spec["kinds"][key] = kind
                for (r, c), (val, text, conf) in v["cells"].items():
                    if r == i and c < len(cols):
                        table[(key, cols[c])] = val
                        src[(key, cols[c])] = (pi + 1, side, text, conf, v["rows"][r], v["cols"][c], v["skew"])
    if pi_pref != len(PREFS) - 1:
        problems.append(f"都道府県の数 {pi_pref + 1}")
    # 政令市・特別区の行は、すぐ後の区の行の合計（合計の行）
    for k, r in enumerate(rows):
        nxt = rows[k + 1] if k + 1 < len(rows) else ""
        if spec["kinds"][r] == "市区町村" and (spec["kinds"].get(nxt) == "区" or ("特別区" in r and nxt)):
            spec["kinds"][r] = TOTAL_ROW
    filled = set()
    for r in rows:
        for c in cols:
            if (r, c) not in table:
                table[(r, c)] = 0
                filled.add((r, c))
    return rows, cols, table, src, filled, problems


def checks(rows, cols, table, spec):
    """合わない確かめのリスト: ("行", 行, 合計の列, 足す列, 差) / ("列", 列, 足す行, 差)。差＝合計−足した数"""
    errs = []
    for r in rows:
        for tot, parts in spec["checks"]:
            comp = expand(parts, cols, tot)
            d = table[(r, tot)] - sum(table[(r, c)] for c in comp)
            if d:
                errs.append(("行", r, tot, comp, d))
    if spec.get("kind") == "cityrows":
        # 列の確かめ：政令市（合計の行）＝その区の行の合計
        kinds = spec.get("kinds", {})
        for k, r in enumerate(rows):
            if kinds.get(r) != TOTAL_ROW:
                continue
            wards = []
            for r2 in rows[k + 1:]:
                if kinds.get(r2) == "区" or ("特別区" in r and kinds.get(r2) == "市区町村" and r2.split(":")[1].endswith("区")):
                    wards.append(r2)
                else:
                    break
            for c in cols:
                d = table[(r, c)] - sum(table[(w, c)] for w in wards)
                if d and wards:
                    errs.append(("列", c, wards, d, r))
        return errs
    if spec.get("kind") in ("natrows", "national"):
        # 列の確かめ：州の行＝その州の国の行の合計、総数の行＝州の行の合計（＋無国籍）
        groups, cur = [], None
        for n in spec.get("names_found", spec["names"])[1:]:
            if n in REGION_COLS:
                cur = [n, []]
                groups.append(cur)
            elif cur and n != "無国籍":
                cur[1].append(n)
        tot_parts = [g[0] for g in groups if g[0] in rows] + (["無国籍"] if "無国籍" in rows else [])
        for c in cols:
            for reg, mem in groups:
                if reg not in rows:
                    continue
                body = [m for m in mem if m in rows]
                d = table[(reg, c)] - sum(table[(m, c)] for m in body)
                if d:
                    errs.append(("列", c, body, d, reg))
            if "総数" in rows:
                d = table[("総数", c)] - sum(table[(r, c)] for r in tot_parts)
                if d:
                    errs.append(("列", c, tot_parts, d, "総数"))
        return errs
    body = [r for r in rows if r != spec["total_row"] and not any(o.startswith(r + ":") for o in rows)]
    for c in cols:
        d = table[(spec["total_row"], c)] - sum(table[(r, c)] for r in body)
        if d:
            errs.append(("列", c, body, d, spec["total_row"]))
    return errs


def auto_fix(rows, cols, table, spec, src, filled, log, rel, locked=()):
    """1つのマスを直して、合わない確かめが減るものを選んで直す（減らなくなるまで）。locked（人が画像で確かめたマス）は変えない"""
    locked = set(locked)
    # 先に：確からしさの低い「1」（「-」を「1」と読んだことが多い。1988年の国籍の表）を全部0にしてみて、合わない確かめが減るならそのまま
    weak = [k for k, v in src.items() if k in table and table[k] == 1 and v[2] == "1" and v[3] < 0.75 and k not in locked]
    if weak:
        n0 = len(checks(rows, cols, table, spec))
        for k in weak:
            table[k] = 0
        if len(checks(rows, cols, table, spec)) < n0:
            for k in weak:
                log.append([rel, k[0], k[1], 1, 0, f"読み取り「1」p{src[k][0]}{src[k][1]}（確からしさ {src[k][3]:.2f}）",
                            "確からしさの低い「1」を「-」として、合計から自動で直した"])
        else:
            for k in weak:
                table[k] = 1
    for _ in range(200):
        errs = checks(rows, cols, table, spec)
        if not errs:
            return []
        cands = {}
        for e in errs:
            if e[0] == "行":
                _, r, tot, comp, d = e
                for c in comp:
                    cands[(r, c)] = table[(r, c)] + d
                cands.setdefault((r, tot), table[(r, tot)] - d)
            else:
                _, c, body, d, trow = e
                for r in body:
                    cands.setdefault((r, c), table[(r, c)] + d)
                cands.setdefault((trow, c), table[(trow, c)] - d)
        best = None
        n0 = len(errs)
        for k, nv in cands.items():
            if nv < 0 or k in locked:
                continue
            old = table[k]
            table[k] = nv
            n = len(checks(rows, cols, table, spec))
            table[k] = old
            # 行と列の両方が直る（2つ以上減る）ものだけ。同じなら、読めなかったマス・確からしさの低いマスを先に
            if n <= n0 - 2:
                conf = src.get(k, (0, "", "", 0.0))[3] if k not in filled else -1
                key = (n, conf)
                if best is None or key < best[0]:
                    best = (key, k, nv)
        if not best:
            # いくつかのマスをまとめて直す候補を集め、順にためす（need：合わない確かめがいくつ減れば直すか）
            moves = []
            rows_e = [e for e in errs if e[0] == "行"]
            cols_e = [e for e in errs if e[0] == "列"]
            # 2つのマスの読み違い：1つの行の差が、2つの列の差の合計と同じ（またはその逆）なら、その2つのマスを直す
            for _, r, tot, comp, d in rows_e:
                for i in range(len(cols_e)):
                    for j in range(i + 1, len(cols_e)):
                        c1, d1, c2, d2 = cols_e[i][1], cols_e[i][3], cols_e[j][1], cols_e[j][3]
                        if c1 in comp and c2 in comp and d1 + d2 == d and r in cols_e[i][2] and r in cols_e[j][2]:
                            moves.append(([((r, c1), table[(r, c1)] + d1), ((r, c2), table[(r, c2)] + d2)], 3, "2つのマス"))
            for _, c, body, d, _t in cols_e:
                for i in range(len(rows_e)):
                    for j in range(i + 1, len(rows_e)):
                        r1, d1, r2, d2 = rows_e[i][1], rows_e[i][4], rows_e[j][1], rows_e[j][4]
                        if r1 in body and r2 in body and d1 + d2 == d and c in rows_e[i][3] and c in rows_e[j][3]:
                            moves.append(([((r1, c), table[(r1, c)] + d1), ((r2, c), table[(r2, c)] + d2)], 3, "2つのマス"))
            # 左の列の数とつながって1つの数に読まれたもの（「1」と「1,046」→「11,046」。1959年の表）：分けるとその行の合計がちょうど合うなら分ける
            for _, r, tot, comp, d in rows_e:
                seq = [c for c in cols if c in comp]  # ページの上で並ぶ順
                for c_prev, c in zip(seq, seq[1:]):
                    k = (r, c)
                    text = src.get(k, ("", "", ""))[2]
                    if table[(r, c_prev)] != 0 or "分けた" in text or k in filled or not re.fullmatch(r"[\d,]+", text):
                        continue
                    s_ = text.replace(",", "")
                    for i in range(1, min(4, len(s_))):
                        x, y = s_[:i], s_[i:]
                        if (y[0] != "0" or len(y) == 1) and int(x) + int(y) - table[k] == d:
                            moves.append(([((r, c_prev), int(x)), (k, int(y))], 1, "つながった数を分けた"))
            # 読めなかったマスがいくつも並ぶ行（小さな「1」が読み落とされやすい）：1つの行の差が、その行の読めなかったマスの列の差の合計と同じなら、全部を直す
            for _, r, tot, comp, d in rows_e:
                hit = [(c, dc) for _, c, body, dc, _t in cols_e if c in comp and r in body and (r, c) in filled]
                if len(hit) >= 2 and sum(dc for _, dc in hit) == d and len({c for c, _ in hit}) == len(hit):
                    moves.append(([((r, c), table[(r, c)] + dc) for c, dc in hit], len(hit) + 1, f"{len(hit)}つのマス"))
            done = False
            for pair, need, what in moves:
                if any(nv < 0 or k in locked for k, nv in pair):
                    continue
                olds = {k: table[k] for k, _ in pair}
                for k, nv in pair:
                    table[k] = nv
                if len(checks(rows, cols, table, spec)) > n0 - need:
                    for k, v in olds.items():
                        table[k] = v
                    continue
                for k, nv in pair:
                    how = "読めなかったマス" if k in filled else f"読み取り「{src[k][2]}」p{src[k][0]}{src[k][1]}"
                    log.append([rel, k[0], k[1], olds[k], nv, how, f"合計から自動で直した（{what}）"])
                done = True
                break
            if not done:
                return errs
            continue
        _, k, nv = best
        how = "読めなかったマス" if k in filled else f"読み取り「{src[k][2]}」p{src[k][0]}{src[k][1]}"
        log.append([rel, k[0], k[1], table[k], nv, how, "合計から自動で直した"])
        table[k] = nv
    return checks(rows, cols, table, spec)


def main():
    only = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    manual = defaultdict(dict)
    mpath = os.path.join(SRC, "OCR直し.csv")
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                manual[r["ファイル"]][(r["行"], r["列"])] = int(r["正しい数"])
    # 画像で確かめて、元の表そのものが合っていなかった所（数は印刷のまま残し、確かめの結果では「印刷のまま」として分ける）
    as_printed = defaultdict(set)
    ppath = os.path.join(SRC, "印刷のまま.csv")
    if os.path.exists(ppath):
        with open(ppath, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                as_printed[r["ファイル"]].add((r["種類"], r["行または列"], r["合計の列または行"], int(r["差"])))
    out_rows = defaultdict(list)
    report, log = [], []
    targets = [rel for rel in FILES if not only or any(o in rel for o in only)]
    for rel in targets:  # 1回目：型（行と列の位置）を集める
        if ocr_jsons(rel) and FILES[rel][2].get("kind") not in ("natrows", "cityrows", "national"):
            assemble(rel, FILES[rel][2])
    for rel, (kind, group, spec) in FILES.items():
        if rel not in targets:
            continue
        if not ocr_jsons(rel):
            report.append([rel, kind, group, "まだ読み取っていない", "", ""])
            continue
        rows, cols, table, src, filled, problems = {"natrows": assemble_natrows, "cityrows": assemble_cityrows,
                                                    "national": assemble_national}.get(
            spec.get("kind"), assemble)(rel, spec)
        for k, v in manual[rel].items():
            log.append([rel, k[0], k[1], table.get(k), v, "人が画像で確かめた", ""])
        apply_manual(rows, cols, table, spec, manual[rel])
        n_first = len(checks(rows, cols, table, spec))
        left = auto_fix(rows, cols, table, spec, src, filled, log, rel, locked=manual[rel])

        def key(e):
            return (e[0], e[1], e[2] if e[0] == "行" else e[4], e[4] if e[0] == "行" else e[3])
        printed = [e for e in left if key(e) in as_printed[rel]]
        left = [e for e in left if key(e) not in as_printed[rel]]
        state = ("合う" if not printed else "合う（元の表のずれは印刷のまま）") if not left else "合わない所あり"
        report.append([rel, kind, group, state, f"はじめ{n_first}→残り{len(left)}" + (f"（印刷のまま{len(printed)}）" if printed else ""),
                       " / ".join(problems)])
        print(f"{rel} {group}: {state}（合わない確かめ はじめ{n_first}→残り{len(left)}）" + (f" {problems}" if problems else ""))
        for e in left[:12]:
            print("   ", e[0], e[1], (e[2] if e[0] == "行" else e[4]), "差", e[4] if e[0] == "行" else e[3])
        year = rel.split("/")[0]
        for r in rows:
            pref, _, sub = r.partition(":")
            g = spec.get("kinds", {}).get(r, group) if spec.get("kind") == "cityrows" else group
            for c in cols:
                out_rows[kind].append([f"{year}-12", "登録外国人統計", pref, sub, g, c, table[(r, c)], rel])
    heads = {"都道府県_在留資格": ["時点", "統計", "都道府県", "内わけ", "国籍", "在留資格", "人数", "元のPDF"],
             "都道府県_国籍": ["時点", "統計", "都道府県", "内わけ", "（空き）", "国籍・地域", "人数", "元のPDF"],
             "都市_国籍": ["時点", "統計", "国籍・地域", "（空き）", "（空き）", "都市", "人数", "元のPDF"],
             "市区_国籍": ["時点", "統計", "都道府県", "市・区", "種別", "国籍・地域", "人数", "元のPDF"],
             "全国_国籍_在留資格": ["時点", "統計", "国籍・地域", "（空き）", "（空き）", "在留資格", "人数", "元のPDF"]}
    for kind, rows in out_rows.items():
        name = f"試し_{kind}" if only else kind
        with open(os.path.join(OUT, f"{name}.csv"), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(heads[kind])
            w.writerows(rows)
    with open(os.path.join(OUT, "試し_確かめ.csv" if only else "確かめ.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["元のPDF", "表の種類", "国籍", "結果", "合わない確かめの数", "形の問題"])
        w.writerows(report)
    with open(os.path.join(OUT, "試し_直した所.csv" if only else "直した所.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["元のPDF", "行", "列", "読み取った数", "直した数", "どこ", "どうやって"])
        w.writerows(log)


if __name__ == "__main__":
    main()
