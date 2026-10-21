# 字の向きの判定ありで読んだページ（1959〜1988年）を、判定なしで読み直すために、前の結果をよけておく
# 使い方: python -I ocr_redo.py 1959 1964 …（年）  → 元データ/OCR結果_向きの判定あり/<年>/ に移す。そのあと ocr_pdfs.py を動かすと、その年が読み直される
#   向きの判定があると、数字が逆さまと判断されて「6」と「9」、「26」と「92」が入れかわることがあった（1984年の表で多数）
import os
import shutil
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "元データ", "OCR結果")
DST = os.path.join(BASE, "元データ", "OCR結果_向きの判定あり")

for year in sys.argv[1:]:
    a, b = os.path.join(SRC, year), os.path.join(DST, year)
    if not os.path.isdir(a):
        continue
    os.makedirs(b, exist_ok=True)
    n = 0
    for name in os.listdir(a):
        if name.endswith(".json"):
            shutil.move(os.path.join(a, name), os.path.join(b, name))
            n += 1
    print(year, n, "ページをよけた")
