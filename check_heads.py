# ビザの表の列の名前（old_specs.py の形）が、読み取った見出しの漢字と合っているかを確かめる
# 使い方: <python> -I check_heads.py [ファイル名の一部…]
import os
import re
import sys
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_old_data as m
from ocr_assemble import read_spread
from old_specs import FILES

sys.stdout.reconfigure(encoding="utf-8")
SIMPLE = str.maketrans("资经营会计务录码证认动绿顾劳热铁韩鲜国东", "資経営会計務録碼証認動緑顧労熱鉄韓鮮国東")


def score(head, name):
    h = re.sub(r"[\s・·\-0-9()（）統第表別别外国人登錄者者都道府県鼎在留資格]", "", head.translate(SIMPLE))
    n = re.sub(r"[\s・·\-0-9()（）]", "", name)
    if not h:
        return None
    # 見出しに名前の字がいくつ入っているか
    return sum(1 for ch in set(n) if ch in h) / max(1, len(set(n)))


only = sys.argv[1:]
for rel, (kind, group, spec) in FILES.items():
    if kind not in ("都道府県_在留資格", "都市_国籍") or (only and not any(o in rel for o in only)) or not m.ocr_jsons(rel):
        continue
    if kind == "都市_国籍":  # 都市の名前：どのページも同じ列
        bad = []
        g = spec["groups"][0]
        for pg in g["pages"][:2]:
            o = read_spread(m.ocr_jsons(rel)[pg - 1], 999, right_from_left=True)
            for si, side in enumerate(("左", "右")):
                v = o["sides"].get(side)
                names = g["cols"][si]
                if not v or len(v["cols"]) != len(names):
                    bad.append((pg, side, f"列の数 {len(v['cols']) if v else 0}／{len(names)}"))
                    continue
                for name, head in zip(names, v["heads"]):
                    sc = score(head, name)
                    if sc is not None and sc < 0.5:
                        bad.append((pg, side, name, head))
        print(rel, "見出しと合わない列", len(bad), bad[:6])
        continue
    bad = []
    for pi, j in enumerate(m.ocr_jsons(rel)[:len(spec["pages"])]):
        o = read_spread(j, len(spec["rows"]))
        for si, side in enumerate(("左", "右")):
            v = o["sides"].get(side)
            names = spec["pages"][pi][si]
            if not v or len(v["cols"]) != len(names):
                continue
            for name, head in zip(names, v["heads"]):
                sc = score(head, name)
                if sc is not None and sc < 0.5 and not name.startswith("4-1"):
                    bad.append((pi + 1, side, name, head))
    print(rel, "見出しと合わない列", len(bad), bad[:6])
