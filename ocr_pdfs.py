# 1959〜2005年の登録外国人統計（スキャンの PDF）の文字と数字を、画像から読み取って JSON に控える
# 使い方: <rapidocr_onnxruntime・pymupdf の入った python> -I ocr_pdfs.py <ページの画像を置く作業用フォルダ> [並べて動かす数]
#   読み取りは RapidOCR（数字の表に強い。Windows の標準の読み取りは数字の並んだ所が崩れた）。
#   そのままだと画像を長い辺2000ピクセルに縮め、文字の箱も1000までしか探さないので、ページの上が抜け落ちた。
#   ここでは縮めず（max_side_len）、箱も4000まで探す（det_max_candidates）。1988年までのページは字の向きの判定ありで読んだ
#   ページは 300dpi の白黒にしてから読む。結果は 元データ/OCR結果/<年>/<ファイル名>_p<ページ>.json
#     {"file":元のPDF, "page":ページ, "w":幅, "h":高さ, "boxes":[[[左上x,y],[右上],[右下],[左下]], 文字, 確からしさ], ...]}
#   もう JSON があるページは読み直さない（止まっても続きから）
import csv
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ")
OUT = os.path.join(SRC, "OCR結果")
DPI = 300


def pages():
    with open(os.path.join(SRC, "出どころ一覧.csv"), encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r["種類"] == "年次" and r["ファイル"].endswith(".pdf")
                and "年令" not in r["表題"]]  # 1964・1969年の「国籍および男女・年令別」は年齢の表なので読まない
    import pymupdf
    for r in rows:
        path = os.path.join(SRC, r["ファイル"])
        n = pymupdf.open(path).page_count
        stem = os.path.splitext(os.path.basename(path))[0]
        for p in range(n):
            yield path, p, os.path.join(OUT, r["時点"], f"{stem}_p{p + 1:02d}.json")


_eng = None


def work(args):
    global _eng
    path, p, out, tmp = args
    if os.path.exists(out):
        return None
    import pymupdf
    from rapidocr_onnxruntime import RapidOCR
    if _eng is None:
        # use_cls=False：字の向きの判定を使わない（ページはまっすぐ。判定が「6」を逆さまの「9」と読むことがあった）
        _eng = RapidOCR(max_side_len=4500, det_max_candidates=4000, intra_op_num_threads=4, use_cls=False)
    pg = pymupdf.open(path)[p]
    pix = pg.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
    img = os.path.join(tmp, f"{os.getpid()}.png")
    pix.save(img)
    res, _ = _eng(img)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    data = {"file": os.path.relpath(path, SRC).replace("\\", "/"), "page": p + 1, "w": pix.width, "h": pix.height,
            "boxes": [[[[round(a), round(b)] for a, b in box], text, round(float(conf), 3)] for box, text, conf in (res or [])]}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    tmp = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    os.makedirs(tmp, exist_ok=True)
    todo = [(a, b, c, tmp) for a, b, c in pages() if not os.path.exists(c)]
    print("読み取るページ", len(todo), flush=True)
    done = 0
    with ProcessPoolExecutor(n) as ex:
        for r in ex.map(work, todo):
            done += 1
            if done % 10 == 0 or done == len(todo):
                print(f"{done}/{len(todo)}", flush=True)
    print("おわり", flush=True)


if __name__ == "__main__":
    main()
