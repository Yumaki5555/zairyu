# 法務省（出入国在留管理庁）の「令和〇年における難民認定者数等について」（元データ/難民/ の PDF）を、1行に1つの数の表にして確かめる
# 使い方: python -I make_nanmin.py   （pymupdf・pandas を使う）
#
#   読む表（PDF の文字を位置ごとに読む。表題で探すので、年によって表の番号・ページが違ってもよい）
#     我が国における難民保護（庇護）の状況等 … 1978年からの毎年の数（申請者数・定住難民・条約難民・補完的保護対象者・その他の保護・合計）
#     国籍別の難民認定申請者数・難民認定者数・補完的保護対象者認定者数・人道配慮数のうち本国情勢等を踏まえて在留を認めた者の数
#       … 2025年の発表は2021〜2025年の5年分（申請者数は全部の国籍・地域）。2018〜2020年は2020年の発表（申請者数は上位25と「その他」）
#     在留資格別の難民認定申請者数（申請したときの在留資格）… 2016〜2020年は2020年の発表、2021〜2025年は2025年の発表
#     処理の状況（一次審査・審査請求）・人道配慮数 … 2025年の発表の別表（2010年から）
#   書き出す表（データ/難民/）
#     毎年の数.csv          列：年・年の書き方・項目・人数・出どころ・発表のページ（1978年〜。発表の表に数のない所は書かない）
#     国籍別.csv            列：年・項目・国籍・地域・人数・うち審査請求・出どころ・発表のページ
#                           国籍・地域が「その他」の行は、上位25に入らなかった国籍・地域の合計（2018〜2020年の申請者数だけ）。「総数」の行もある
#     申請時の在留資格.csv  列：年・在留資格・種別・人数・出どころ・発表のページ（種別「正規滞在の内わけ」の行は正規滞在の内数）
#     処理の状況.csv        列：年・手続き・項目・人数・うち補完的保護の申請（補完的保護対象者認定申請に係る数、内数）・出どころ・発表のページ
#   確かめ: データ/難民/確かめ.csv
#     内わけの合計が総数と合うか、表どうしで同じ数か、同じ年の数が発表によって違わないか
#   新しい発表は download_nanmin.py で落としてから、これを動かし直す
import csv
import os
import re
import sys
from collections import defaultdict

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "難民")
LIST_CSV = os.path.join(BASE, "元データ", "難民_出どころ一覧.csv")
OUT = os.path.join(BASE, "データ", "難民")
ERA = {"令和": 2018, "平成": 1988, "昭和": 1925}
Z2H = str.maketrans("０１２３４５６７８９（）－", "0123456789()-")
YEAR = re.compile(r"(令和|平成|昭和)?\s*([元0-9]+)\s*年(?!度)")
CIRCLED = "".join(chr(c) for c in list(range(0x2460, 0x2474)) + list(range(0x3251, 0x3260)) + list(range(0x32B1, 0x32C0)))
NUM = re.compile(r"^[0-9][0-9,]*$")


def norm(s):
    return re.sub(r"[\s　]+", "", s).translate(Z2H)


def to_int(s):
    return int(s.replace(",", ""))


def years_in(text, era=None):
    """「平成22年平成23年…令和元年」のような文字 → [年, …]（元号のない「２年」は前の元号のつづき）"""
    out = []
    for m in YEAR.finditer(norm(text)):
        era = m.group(1) or era
        out.append(ERA[era] + (1 if m.group(2) == "元" else int(m.group(2))))
    return out, era


def words(page):
    """(左, 上, 右, 下, 文字) の並び"""
    return [(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words")]


def lines(ws, tol=4.0):
    """下の端が近い文字をまとめて行にする → [(下の端, [文字…（左から）])]"""
    out = []
    for w in sorted(ws, key=lambda w: w[3]):
        if out and w[3] - out[-1][0] <= tol:
            out[-1][1].append(w)
        else:
            out.append([w[3], [w]])
    return [(y, sorted(ws_, key=lambda w: w[0])) for y, ws_ in out]


def titles(ws):
    """表題（図表１－３：… ／ 表２：…）→ [(左, 上, 右, 下, 表題)]。表題が空白で切れているときは、同じ行の右の文字をつなぐ（次の表題の前まで）"""
    starts = [w for w in ws if re.match(r"^(図表|表)[0-9]+(-[0-9]+)?[:：]", norm(w[4]))]
    out = []
    for t in starts:
        nxt = min([u[0] for u in starts if u is not t and abs(u[3] - t[3]) < 3 and u[0] > t[0]] + [1e9])
        same = sorted([u for u in ws if abs(u[3] - t[3]) < 3 and t[0] <= u[0] < nxt], key=lambda u: u[0])
        out.append((t[0], t[1], max(u[2] for u in same), t[3], "".join(u[4] for u in same)))
    return out


def region(ws, title_re):
    """title_re に合う表題から、その下の次の表題までの文字 → (表題の文字, [文字…])。なければ None"""
    ts = titles(ws)
    hit = [t for t in ts if re.search(title_re, norm(t[4]))]
    if not hit:
        return None
    t = hit[0]
    below = [u[1] for u in ts if u[1] > t[1] + 5 and (u[0] < t[0] + 300 and u[2] > t[0])]  # 同じ列の、下の表題
    end = min(below) if below else 1e9
    return t, [w for w in ws if t[3] < w[3] < end and w[1] < end]


def year_header(ws, last=False):
    """年の見出しの行（いちばん上の、年が2つ以上ある行。last のときはいちばん下）→ (行の下の端, [(年, 左, 右)])
    （1つの文字に年が続けて書かれているときは、文字数で幅を分ける）"""
    found = (None, [])
    for y, ln in lines(ws, 3):
        if norm(ln[0][4]).startswith("(注") or norm(ln[0][4]).startswith("図表") or norm(ln[0][4]).startswith("表"):
            continue
        cells, era = [], None
        for w in ln:
            ys, era = years_in(w[4], era)
            if not ys:
                continue
            parts = [m.group(0) for m in YEAR.finditer(norm(w[4]))]
            total, x = sum(len(p) for p in parts), w[0]
            for yy, p in zip(ys, parts):
                width = (w[2] - w[0]) * len(p) / total
                cells.append((yy, x, x + width))
                x += width
        if len(cells) >= 2:
            found = (y, cells)
            if not last:
                return found
    return found


def checker(rows, src):
    def check(what, a, b):
        rows.append({"出どころ": src, "確かめたこと": what, "左": a, "右": b, "結果": "合う" if a == b else "合わない"})
    return check


# ---------- 我が国における難民保護（庇護）の状況等（1978年から）
HOGO_COLS = {  # 見出しのことば → 項目（左から。補完的保護の列は2023年の発表から）
    "申請": "難民認定申請者数", "補完申請": "補完的保護対象者認定申請者数", "定住": "定住難民", "条約": "条約難民", "条約うち": "条約難民のうち審査請求で認定",
    "補完": "補完的保護対象者", "補完うち": "補完的保護対象者のうち審査請求で認定", "その他": "その他の保護", "合計": "合計", "シリア": "（参考）シリア人留学生の受入れ"}


def read_hogo(path):
    """→ {年: {項目: 人数}}、年の書き方、[列の名前]。合計の行（いちばん下）で列の右の端を決め、数の右の端がいちばん近い列に入れる"""
    ws = words(pymupdf.open(path)[0])
    hb = "".join(norm(w[4]) for w in ws if w[3] < 90)
    base = ["申請"] + (["補完申請"] if "象者認定申請" in hb else []) + ["定住", "条約"] + \
        (["補完"] if "補完的保護対象者" in hb.replace("補完的保護対象者認定申請", "") else []) + ["その他", "合計"]
    lab = [(w[3], norm(w[4])) for w in ws if w[0] < 140 and re.match(r"^((昭和|平成|令和)?[元0-9]+年|合計)$", norm(w[4]))]
    total_y = [y for y, t in lab if t == "合計"][0]
    # 合計の行：数と、カッコの中の数（その前の列の「うち審査請求」）。右の（参考）シリア人留学生の表は入れない
    tot = sorted([w for w in ws if abs(w[3] - total_y) < 3 and 130 < w[0] <= 495 and re.match(r"^[(（]?[0-9,]*[)）]?$", norm(w[4]))])
    nums, cols, inside = [w for w in tot if re.search(r"[0-9]", w[4])], [], False
    for w in tot:
        s = norm(w[4])
        if s.startswith("("):
            inside = True
        if re.search(r"[0-9]", s):
            cols.append(cols[-1] + "うち" if inside else base[len([c for c in cols if not c.endswith("うち")])])
        if s.endswith(")"):
            inside = False
    if len([c for c in cols if not c.endswith("うち")]) != len(base):
        sys.exit(f"{path}：合計の行の数の数が列の数（{len(base)}）と合いません")
    right = [w[2] for w in nums]
    data, label, era = {}, {}, None
    for y, t in sorted(lab):
        if t == "合計":
            key = "合計"
        else:
            ys, era = years_in(t, era)
            key = ys[0]
            label[key] = era + re.sub(r"^(昭和|平成|令和)", "", t)  # 元号を付けた書き方（平成2年 など）
        row = {}
        nums = [w for w in ws if abs(w[3] - y) <= 3.5 and re.match(r"^\(?[0-9][0-9,]*\)?$", norm(w[4])) and 130 < w[0] <= 495]  # 「（ 15」のようにカッコと数が1つの文字のこともある
        for w in nums:
            k = min(range(len(right)), key=lambda i: abs(right[i] - w[2]))
            if abs(right[k] - w[2]) > 9 or cols[k] in row:
                sys.exit(f"{path}：{t} の {w[4]} の列が決まりません")
            row[cols[k]] = to_int(norm(w[4]).strip("()"))
        data[key] = row
    # （参考）シリア人留学生の受入れ（年度。右の小さな表。上から順に元号がつづく）
    era = None
    for y, ln in lines([w for w in ws if w[0] > 495 and w[3] > 440], 3):
        t = norm("".join(w[4] for w in ln))
        m = re.match(r"^((平成|令和)?[元0-9]+)年度([0-9,]+)$", t)
        if m and (m.group(2) or era):
            ys, era = years_in(m.group(1) + "年", era)
            data[("シリア", ys[0])] = {"シリア": to_int(m.group(3))}
    return data, label, cols


def hogo(rows, checks):
    """いちばん新しい発表の表を使い、前の発表の表とも同じか確かめる"""
    files = sorted((y, f) for y, f, name in SOURCES if re.search(r"難民(庇護|保護)の状況等", name))
    newest = files[-1]
    data, label, cols = read_hogo(os.path.join(SRC, str(newest[0]), newest[1]))
    years = sorted(k for k in data if isinstance(k, int))
    check = checker(checks, newest[1])
    # 確かめ：列の合計＝合計の行、定住難民＋条約難民＋補完的保護＋その他の保護＝合計（毎年）
    for c in cols:
        if c in ("条約うち", "補完うち"):
            continue
        s = sum(data[y].get(c, 0) for y in years)
        check(f"{HOGO_COLS[c]}：毎年の合計＝合計の行", s, data["合計"].get(c))
    bad = [y for y in years if sum(data[y].get(c, 0) for c in ("定住", "条約", "補完", "その他")) != data[y]["合計"]]
    check("定住難民＋条約難民＋補完的保護対象者＋その他の保護＝合計（合わない年：" + ("・".join(map(str, bad)) or "なし") + "）", len(bad), 0)
    syr = {k[1]: v["シリア"] for k, v in data.items() if isinstance(k, tuple)}
    for y in years:
        for c in cols:
            if c in data[y] and c != "シリア":
                rows.append({"年": y, "年の書き方": label[y], "項目": HOGO_COLS[c], "人数": data[y][c], "出どころ": newest[1], "発表のページ": PAGE[newest[0]]})
    for y, v in sorted(syr.items()):
        rows.append({"年": y, "年の書き方": f"{y}年度", "項目": HOGO_COLS["シリア"], "人数": v, "出どころ": newest[1], "発表のページ": PAGE[newest[0]]})
    # 前の発表の表と同じか
    for py, f in files[:-1]:
        d2, _, c2 = read_hogo(os.path.join(SRC, str(py), f))
        diff = [f"{y}年の{HOGO_COLS[c]}（{d2[y].get(c)}→{data[y].get(c)}）" for y in d2 if isinstance(y, int) for c in c2 if d2[y].get(c) != data.get(y, {}).get(c)]
        checks.append({"出どころ": f, "確かめたこと": f"{py}年の発表の表と、いちばん新しい発表の表で同じ年の数が同じ（違う所：{'、'.join(diff) or 'なし'}）",
                       "左": len(diff), "右": 0, "結果": "合う" if not diff else "発表によって違う"})
    return data, years


# ---------- 国籍別の表（年ごとの区画が横に並ぶ）
NAT_TABLES = {  # 項目 → 表題の形
    "難民認定申請者数": r"国籍別(・年別)?難民認定申請者数",
    "難民認定者数": r"国籍別(・年別)?難民認定者数",
    "補完的保護対象者認定者数": r"国籍別(・年別)?補完的保護対象者認定者数",
    "人道配慮（本国情勢等）": r"(国籍別・年別人道配慮数のうち本国情勢等|人道配慮者?数のうち本国情勢等を踏まえて在留を認めた者の数)",
}
ROW = re.compile(r"^(?P<name>.+?)(?P<n>[0-9][0-9,]*)(\((?P<k>[0-9,]*)\))?$")


def read_nat(path, title_re):
    """→ {年: [(国籍・地域, 人数, うち審査請求 or None)]}（表に出てくる順。「総数」の行も入れる）。表が何ページかにわたるときはつなげる"""
    out = {}
    for page in pymupdf.open(path):
        ws = words(page)
        r = region(ws, title_re)
        if not r:
            continue
        t, ws = r
        hy, cells = year_header(ws)
        if not cells:
            continue
        cut = min([w[0] for w in ws if re.search(r"前年比|対前年", norm(w[4]))] + [1e9])
        cells = [c for c in cells if c[1] < cut]
        mids = [(cells[i][2] + cells[i + 1][1]) / 2 for i in range(len(cells) - 1)]
        bounds = [-1] + mids + [cut - 1]
        body = [w for w in ws if w[1] > hy + 1 and w[0] < cut - 1 and not re.match(r"^[（(]?人[）)]?$", norm(w[4]))]
        for i, c in enumerate(cells):
            mine = [w for w in body if bounds[i] <= (w[0] + w[2]) / 2 < bounds[i + 1]]
            rows = out.setdefault(c[0], [])
            if any(r[0] == "総数" for r in rows):
                continue
            for y, ln in lines(mine):
                txt = norm("".join(w[4] for w in ln))
                if txt.startswith("(注"):
                    break
                txt = re.sub(r"^\(?[0-9]+\)", "", txt)  # 順位 (1) など
                txt = re.sub(rf"^[{CIRCLED}―—\-–]+", "", txt)  # 順位 ①、「― その他」
                if not txt:
                    continue
                m = ROW.match(txt)
                if not m:
                    sys.exit(f"{os.path.basename(path)} {page.number + 1}ページ {c[0]}年：読めない行「{txt}」")
                k = m.group("k")
                rows.append((m.group("name"), to_int(m.group("n")), to_int(k) if k else None))
                if m.group("name") == "総数":
                    break
    return out


def nat(rows, checks):
    """国籍別：2021年からは2025年の発表（など、いちばん新しい発表）、それより前はその年を入れたいちばん新しい発表。ほかの発表とも同じか確かめる"""
    mains = sorted((y, f) for y, f, name in SOURCES if re.search(r"における難民認定者数等について(（別表）)?$", name))
    got = defaultdict(dict)  # 項目 → 年 → (発表の年, ファイル, 行)
    seen = defaultdict(list)  # (項目, 年) → [(発表の年, ファイル, 行)]
    for py, f in mains:
        for item, tre in NAT_TABLES.items():
            d = read_nat(os.path.join(SRC, str(py), f), tre)
            for y, rs in d.items():
                if rs:
                    seen[(item, y)].append((py, f, rs))
    for (item, y), vs in sorted(seen.items()):
        # 使う版：国籍・地域の数（行）がいちばん多い版（全部の国籍・地域がのっているもの）、同じなら新しい発表
        use = max(vs, key=lambda v: (len(v[2]), v[0]))
        py, f, rs = use
        check = checker(checks, f)
        tot = [r for r in rs if r[0] == "総数"]
        body = [r for r in rs if r[0] != "総数"]
        if len(tot) != 1:
            sys.exit(f"{f} {item} {y}年：総数の行がありません")
        check(f"{y}年 {item}：国籍・地域の合計＝総数", sum(r[1] for r in body), tot[0][1])
        if any(r[2] is not None for r in rs):
            check(f"{y}年 {item}：うち審査請求の合計＝総数のうち審査請求", sum(r[2] or 0 for r in body), tot[0][2] or 0)
        nm = [r[0] for r in body]
        if len(set(nm)) != len(nm):
            sys.exit(f"{f} {item} {y}年：同じ国籍・地域が2回出てきます")
        order = [r[1] for r in body if r[0] != "その他"]
        check(f"{y}年 {item}：人数の多い順に並んでいる", order, sorted(order, reverse=True))
        for name, n, k in rs:
            rows.append({"年": y, "項目": item, "国籍・地域": name, "人数": n, "うち審査請求": "" if k is None else k, "出どころ": f, "発表のページ": PAGE[py]})
        got[item][y] = {r[0]: r for r in rs}
        # ほかの発表と同じか（ほかの版にのっている国籍・地域だけ比べる）
        for py2, f2, rs2 in vs:
            if f2 == f:
                continue
            diff = [f"{r[0]}（{r[1]}→{got[item][y].get(r[0], (0, None))[1]}）" for r in rs2
                    if r[0] != "その他" and got[item][y].get(r[0], (0, None))[1] != r[1]]
            checks.append({"出どころ": f2, "確かめたこと": f"{y}年 {item}：{py2}年の発表の表と、使った表（{py}年の発表）で同じ数（違う所：{'、'.join(diff) or 'なし'}）",
                           "左": len(diff), "右": 0, "結果": "合う" if not diff else "発表によって違う"})
    return got


# ---------- 年が横に並ぶ表（在留資格別・処理の状況・人道配慮数）
def read_cols(path, title_re, labels, page_no=None):
    """年が横に並ぶ表（グラフの下の表も。年の見出しはいちばん下の行を使う）→ {行の名前: {年: 人数}}、うち（カッコの数）{行の名前: {年: 人数}}。
    labels：上から順の行の名前（[(見出しの形, 名前)]）。数の行を上から順に名前と組み合わせ、いちばん近い見出しが形に合うか確かめる。
    数の年は、数の真ん中がいちばん近い年の見出しにする"""
    pages = [pymupdf.open(path)[page_no - 1]] if page_no else pymupdf.open(path)
    for page in pages:
        ws = words(page)
        r = region(ws, title_re)
        if not r:
            continue
        t, ws = r
        hy, cells = year_header(ws, last=True)
        cut = min([w[0] for w in ws if re.search(r"前年比|対前年", norm(w[4]))] + [1e9])
        cells = [c for c in cells if c[1] < cut]
        left = min(c[1] for c in cells) - 4
        note = min([w[1] for w in ws if norm(w[4]).startswith("(注") and len(norm(w[4])) > 4] + [page.rect.height * 0.94])  # 注とページ番号（ページのいちばん下）より上だけ
        body = [w for w in ws if hy < w[1] < note and w[0] < cut - 1]
        nums = [w for w in body if w[0] >= left and re.match(r"^\(?[0-9][0-9,]*\)?$|^[-－–]$", norm(w[4]))]
        # 見出し：数の列より左の文字。縦に1字ずつ書いた「在」「留」「資」「格」（まとめの見出し）は入れない（「正」「規」・「総」「数」は同じ行でつなぐ）
        heads = [w for w in body if w[2] <= left + 6 and not NUM.match(norm(w[4])) and norm(w[4]) not in ("在", "留", "資", "格")]
        rows = [ln for y, ln in lines(nums, 3)]
        hl = []
        for y, ln in lines(heads, 3):
            txt = norm("".join(w[4] for w in ln))
            if hl and txt.startswith("("):
                hl[-1] = (hl[-1][0], hl[-1][1] + txt, (hl[-1][2] + y) / 2)
            else:
                hl.append((y, txt, y))
        if len(rows) != len(labels):
            sys.exit(f"{os.path.basename(path)} {title_re}：数の行が {len(rows)} 行（{len(labels)} 行のはず）")
        out, sub = {}, {}
        for (pat, name), ln in zip(labels, rows):
            yc = sum(w[3] for w in ln) / len(ln)
            near = min(hl, key=lambda h: abs(h[2] - yc)) if hl else None
            if pat and (not near or not re.search(pat, near[1]) or abs(near[2] - yc) > 14):
                sys.exit(f"{os.path.basename(path)} {title_re}：{name} の行の見出しが「{near[1] if near else ''}」です")
            for w in ln:
                s = norm(w[4])
                mid = lambda a, b: (a + b) / 2
                k = min(range(len(cells)), key=lambda i: abs(mid(cells[i][1], cells[i][2]) - mid(w[0], w[2])))
                if abs(mid(cells[k][1], cells[k][2]) - mid(w[0], w[2])) > 25:
                    sys.exit(f"{os.path.basename(path)} {title_re}：{name} の {s} の年が決まりません")
                if re.match(r"^[-－–]$", s):
                    continue
                if s.startswith("("):
                    sub.setdefault(name, {})[cells[k][0]] = to_int(s.strip("()"))
                else:
                    if cells[k][0] in out.get(name, {}):
                        sys.exit(f"{os.path.basename(path)} {title_re}：{name} の {cells[k][0]}年に数が2つあります")
                    out.setdefault(name, {})[cells[k][0]] = to_int(s)
        return out, sub
    return None, None


VISA_2020 = [("正規", "正規滞在"), ("短期滞在", "短期滞在"), ("技能実習", "技能実習"), ("留学", "留学"), ("出国準備", "特定活動（出国準備期間）"),
             ("難民認定申請中", "特定活動（難民認定申請中）"), ("その他", "その他"), ("非正規", "不法滞在"), ("総数", "総数")]
VISA_2025 = [("正規滞在", "正規滞在"), ("短期滞在", "短期滞在"), ("出国準備", "特定活動（出国準備期間）"), ("技能実習", "技能実習"), ("留学", "留学"),
             ("難民認定等申請者用", "特定活動（難民認定等申請者用）"), ("万博", "特定活動（大阪・関西万博従事者）"), ("公用", "公用"), ("その他", "その他"),
             ("不法滞在", "不法滞在"), ("総数", "総数")]


PROC = [  # 処理の状況の表：(表題の形, 手続き, 行)。2025年の発表の別表（2010年から）
    (r"年別難民認定申請の処理状況の推移", "難民認定申請（一次審査）", [("申請者数", "申請者数"), ("処理数", "処理数"), ("未処理数", "未処理数")]),
    (r"処分内容別・年別難民認定申請の処理数", "難民認定申請（一次審査）", [("認定", "認定"), ("不認定", "不認定"), ("取下げ", "取下げ等")]),
    (r"年別審査請求の処理状況の推移", "審査請求", [("審査請求数", "審査請求数"), ("処理数", "処理数"), ("未処理数", "未処理数")]),
    (r"処分内容別・年別審査請求の処理数", "審査請求", [("処理数", "処理数"), ("理由あり", "理由あり"), ("難民", "理由あり（難民）"), ("補完", "理由あり（補完的保護対象者）"),
                                                ("理由なし", "理由なし"), ("取下げ", "取下げ等"), ("未処理数", "未処理数")]),
    (r"(年別人道配慮数(?!のうち)|人道配慮数の推移)", "人道配慮", [("人道配慮数", "人道配慮数"), ("うち本国", "うち本国情勢等")]),
]


def visa(rows, checks, data):
    """申請したときの在留資格：2016〜2020年は2020年の発表、2021年からは2025年の発表（など、いちばん新しい発表）"""
    for lab, keep in ((VISA_2020, lambda y: y <= 2020), (VISA_2025, lambda y: y >= 2021)):
        files = [(py, f) for py, f, name in SOURCES if re.search(r"における難民認定者数等について(（別表）)?$", name)]
        for py, f in sorted(files, reverse=True):
            got, _ = read_cols(os.path.join(SRC, str(py), f), r"在留資格別(・年別)?難民認定申請者数", lab) if len(lab) == len(VISA_2025) or py == 2020 else (None, None)
            if got and all(n in got for _, n in lab):
                break
        else:
            sys.exit("申請したときの在留資格の表が見つかりません")
        check = checker(checks, f)
        subs = [n for _, n in lab if n not in ("正規滞在", "不法滞在", "総数")]
        for y in sorted(got["総数"]):
            if not keep(y):
                continue
            check(f"{y}年 申請したときの在留資格：正規滞在の内わけの合計＝正規滞在", sum(got[n].get(y, 0) for n in subs), got["正規滞在"][y])
            check(f"{y}年 申請したときの在留資格：正規滞在＋不法滞在＝総数", got["正規滞在"][y] + got["不法滞在"][y], got["総数"][y])
            checker(checks, "（表どうし）")(f"{y}年 申請したときの在留資格の総数＝毎年の数の表の難民認定申請者数", got["総数"][y], data[y].get("申請"))
            for _, n in lab:
                if y in got[n]:
                    rows.append({"年": y, "在留資格": n, "種別": "正規滞在の内わけ" if n in subs else "", "人数": got[n][y], "出どころ": f, "発表のページ": PAGE[py]})


def proc(rows, checks, data):
    py, f = max((py, f) for py, f, name in SOURCES if re.search(r"における難民認定者数等について(（別表）)?$", name))
    out = defaultdict(dict)  # (手続き, 項目) → {年: 人数}
    for tre, kind, lab in PROC:
        got, sub = read_cols(os.path.join(SRC, str(py), f), tre, lab)
        if kind == "人道配慮":  # 2021年からは2025年の発表、2018〜2020年は2020年の発表
            old, _ = read_cols(os.path.join(SRC, "2020", [g for y, g, name in SOURCES if y == 2020 and "難民認定者数等" in name][0]), tre, lab)
            for n, v in old.items():
                for y, x in v.items():
                    if y not in got[n]:
                        out[(kind, n, "2020")][y] = x
        for n, v in got.items():
            for y, x in v.items():
                if (kind, n) in out and y in out[(kind, n)] and out[(kind, n)][y] != x:
                    sys.exit(f"{kind} {n} {y}年：表によって数が違います")
                out[(kind, n)][y] = x
        for n, v in sub.items():
            for y, x in v.items():
                out[(kind, n, "うち")][y] = x
    check = checker(checks, f)
    one, rv = "難民認定申請（一次審査）", "審査請求"
    for y in sorted(out[(one, "処理数")]):
        check(f"{y}年 一次審査：認定＋不認定＋取下げ等＝処理数", out[(one, "認定")][y] + out[(one, "不認定")][y] + out[(one, "取下げ等")][y], out[(one, "処理数")][y])
        check(f"{y}年 審査請求：理由あり＋理由なし＋取下げ等＝処理数", out[(rv, "理由あり")][y] + out[(rv, "理由なし")][y] + out[(rv, "取下げ等")][y], out[(rv, "処理数")][y])
        check(f"{y}年 審査請求：理由あり（難民）＋理由あり（補完的保護対象者）＝理由あり",
              out[(rv, "理由あり（難民）")][y] + out[(rv, "理由あり（補完的保護対象者）")].get(y, 0), out[(rv, "理由あり")][y])
        c2 = checker(checks, "（表どうし）")
        c2(f"{y}年 一次審査の申請者数＝毎年の数の表の難民認定申請者数", out[(one, "申請者数")][y], data[y].get("申請"))
        c2(f"{y}年 一次審査の認定＋審査請求の理由あり（難民）＝毎年の数の表の条約難民", out[(one, "認定")][y] + out[(rv, "理由あり（難民）")][y], data[y].get("条約"))
        c2(f"{y}年 審査請求の理由あり（難民）＝毎年の数の表の条約難民のうち審査請求で認定", out[(rv, "理由あり（難民）")][y], data[y].get("条約うち", 0))
    hum = {**out.get(("人道配慮", "人道配慮数", "2020"), {}), **out[("人道配慮", "人道配慮数")]}
    for y in sorted(hum):
        checker(checks, "（表どうし）")(f"{y}年 人道配慮数＝毎年の数の表のその他の保護", hum[y], data[y].get("その他"))
    old_f = [g for y, g, name in SOURCES if y == 2020 and "難民認定者数等" in name][0]
    for key in sorted(out, key=lambda k: (k[0], k[1])):
        if len(key) == 3 and key[2] == "うち":
            continue
        kind, n = key[0], key[1]
        src, page = (old_f, PAGE[2020]) if len(key) == 3 else (f, PAGE[py])
        for y, x in sorted(out[key].items()):
            k = out.get((kind, n, "うち"), {}).get(y)
            rows.append({"年": y, "手続き": kind, "項目": n, "人数": x, "うち補完的保護の申請": "" if k is None else k, "出どころ": src, "発表のページ": page})


SOURCES, PAGE = [], {}


def main():
    with open(LIST_CSV, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            SOURCES.append((int(r["年"]), r["ファイル名"], r["資料の名前"]))
            PAGE[int(r["年"])] = r["発表のページ"]
    os.makedirs(OUT, exist_ok=True)
    checks = []
    year_rows, nat_rows = [], []
    data, years = hogo(year_rows, checks)
    got = nat(nat_rows, checks)
    for k in ("難民認定者数", "補完的保護対象者認定者数"):
        col = {"難民認定者数": "条約", "補完的保護対象者認定者数": "補完"}[k]
        for y, rs in got[k].items():
            checker(checks, "（表どうし）")(f"{y}年 {k}：国籍別の表の総数＝毎年の数の表", rs["総数"][1], data[y].get(col))
    for y, rs in got["難民認定申請者数"].items():
        checker(checks, "（表どうし）")(f"{y}年 難民認定申請者数：国籍別の表の総数＝毎年の数の表", rs["総数"][1], data[y].get("申請"))
    visa_rows, proc_rows = [], []
    visa(visa_rows, checks, data)
    proc(proc_rows, checks, data)
    proc_rows.sort(key=lambda r: (["難民認定申請（一次審査）", "審査請求", "人道配慮"].index(r["手続き"]), r["年"]))
    for name, rows in (("毎年の数.csv", year_rows), ("国籍別.csv", nat_rows), ("申請時の在留資格.csv", visa_rows), ("処理の状況.csv", proc_rows), ("確かめ.csv", checks)):
        with open(os.path.join(OUT, name), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    bad = [c for c in checks if c["結果"] != "合う"]
    print(f"確かめ {len(checks)} 件：合わない・違う {len(bad)} 件 → {os.path.relpath(OUT, BASE)}")
    for c in bad:
        print("  ", c["結果"], c["出どころ"], c["確かめたこと"], c["左"], c["右"])


if __name__ == "__main__":
    main()
