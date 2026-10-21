# 国籍の名前の一覧と、読み取った字（くせのある字）からいちばん近い名前を選ぶ部品
#   一覧：1984年の第3表の見出し（画像で読んだもの）＋ 2006〜2011年・2012年からの Excel の国籍・地域の名前 ＋ 昔の名前
import csv
import os
import re
from difflib import SequenceMatcher

BASE = os.path.dirname(os.path.abspath(__file__))
OLD_NAMES = ["ソ連", "西ドイツ", "東ドイツ", "ユーゴスラビア", "チェコスロバキア", "ザイール", "ビルマ", "西サモア", "イエメン・アラブ",
             "スワジランド", "マケドニア旧ユーゴスラビア", "ボスニア・ヘルツェゴビナ", "セルビア・モンテネグロ", "ギニアビサオ",
             "コートジボアール", "ブルキナ・ファソ", "南ア共和国", "東チモール", "モルジブ", "ギリシア", "グルジア", "朝鮮", "韓国",
             "韓国・朝鮮", "中国", "台湾", "無国籍"]
REGIONS = ["アジア州", "ヨーロッパ州", "アフリカ州", "北アメリカ州", "南アメリカ州", "オセアニア州"]


def master():
    names = set(OLD_NAMES) | set(REGIONS)
    from old_specs import SPEC_03_1984
    for pg in SPEC_03_1984["pages"]:
        for side in pg:
            names |= set(side)
    p = os.path.join(BASE, "データ", "都道府県_国籍.csv")
    if os.path.exists(p):
        with open(p, encoding="utf-8-sig") as f:
            names |= {re.sub(r"^\d+", "", r["国籍・地域"]) for r in csv.DictReader(f)}  # 頭の番号は取る
    names.discard("総数")
    return sorted(names)


# 読み取りのくせをそろえる（比べる前に、どちらの字もこの形にする）
NORM = str.maketrans({"フ": "ラ", "ヲ": "ラ", "一": "ー", "―": "ー", "|": "ー", "｜": "ー", "丁": "テ", "工": "エ", "力": "カ",
                      "卜": "ト", "口": "ロ", "夕": "タ", "ニ": "ニ", "二": "ニ", "八": "ハ", "ヘ": "ヘ", "へ": "ヘ", "己": "コ",
                      "ガ": "カ", "ギ": "キ", "グ": "ク", "ゲ": "ケ", "ゴ": "コ", "ザ": "サ", "ジ": "シ", "ズ": "ス", "ゼ": "セ",
                      "ゾ": "ソ", "ダ": "タ", "ヂ": "チ", "ヅ": "ツ", "デ": "テ", "ド": "ト", "バ": "ハ", "ビ": "ヒ", "ブ": "フ",
                      "ベ": "ヘ", "ボ": "ホ", "パ": "ハ", "ピ": "ヒ", "プ": "フ", "ペ": "ヘ", "ポ": "ホ", "ヴ": "ウ", "ァ": "ア",
                      "ィ": "イ", "ゥ": "ウ", "ェ": "エ", "ォ": "オ", "ャ": "ヤ", "ュ": "ユ", "ョ": "ヨ", "ッ": "ツ", "シ": "ツ",
                      "ン": "ソ"})


def norm(s):
    s = s.replace("ノレ", "ル").replace("ノヾ", "ハ").replace("ヾ", "").replace("゛", "").replace("゜", "").replace("。", "")
    s = s.translate(NORM)
    s = s.translate(str.maketrans({"フ": "ラ"}))
    return re.sub(r"[^ァ-ヶー一-龥・]", "", s)


def best(text, names, k=3):
    """いちばん近い名前を k 個。[(似ている度合い 0〜1, 名前), …]"""
    t = norm(text)
    if not t:
        return []
    sc = sorted(((SequenceMatcher(None, t, norm(n)).ratio(), n) for n in names), reverse=True)
    return sc[:k]
