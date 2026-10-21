# 合計の合わない所を人が画像で確かめるために、表のマスの周りを切り出す
# 使い方: <python> -I review_crop.py <元のPDF（元データ/登録外国人統計/ の下）> <ページ> <左|右> <列の名前,…> <行の名前,…> <出力の画像>
#   列の名前・行の名前は old_specs.py の形の名前。その範囲（前後1つずつ広げて）を 300dpi で切り出し、読み取った数も表示する
import os
import sys

import pymupdf
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_old_data as m
from ocr_assemble import read_spread
from old_specs import FILES

sys.stdout.reconfigure(encoding="utf-8")


def main():
    rel, page, side, colnames, rownames, out = sys.argv[1:7]
    page = int(page)
    kind, group, spec = FILES[rel]
    names = spec["pages"][page - 1][0 if side == "左" else 1]
    rows = spec["rows"]
    jsons = m.ocr_jsons(rel)
    # 型を集めるため、同じ形の表を先に読んでおく
    for r2, (_, _, sp2) in FILES.items():
        if sp2 is spec and m.ocr_jsons(r2):
            m.assemble(r2, sp2)
    o = read_spread(jsons[page - 1], len(rows), m.TEMPLATES.get((id(spec), page - 1)))
    v = o["sides"][side]
    ci = [names.index(c) for c in colnames.split(",")]
    ri = [rows.index(r) for r in rownames.split(",")]
    c0, c1 = max(min(ci) - 1, 0), min(max(ci) + 1, len(v["cols"]) - 1)
    r0, r1 = max(min(ri) - 1, 0), min(max(ri) + 1, len(v["rows"]) - 1)
    x_left = v["cols"][c0] - (v["cols"][c0 + 1] - v["cols"][c0] if c0 + 1 < len(v["cols"]) else 150) - 20
    x_right = v["cols"][c1] + 20
    if side == "右":
        x_left += o["w"] / 2 if x_left < o["w"] / 2 else 0
    y_top, y_bot = v["rows"][r0] - 30, v["rows"][r1] + 30
    pdf = pymupdf.open(os.path.join(m.SRC, "登録外国人統計", rel))
    pg = pdf[page - 1]
    pix = pg.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    # 行の名前も見えるよう、左はしの名前の所もつける
    lab = img.crop((0, int(y_top), 420, int(y_bot))) if side == "左" else None
    body = img.crop((int(x_left), int(y_top), int(x_right), int(y_bot)))
    W = body.width + (lab.width if lab else 0)
    canvas = Image.new("L", (W, body.height), 255)
    if lab:
        canvas.paste(lab, (0, 0))
    canvas.paste(body, (lab.width if lab else 0, 0))
    canvas.save(out)
    print("列:", [names[c] for c in range(c0, c1 + 1)])
    print("行:", rows[r0:r1 + 1])
    for r in range(r0, r1 + 1):
        print(rows[r], [v["cells"].get((r, c), (None, "（なし）"))[1] for c in range(c0, c1 + 1)])


if __name__ == "__main__":
    main()
