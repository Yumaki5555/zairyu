# サイトのしるし（ファビコン：ブラウザのタブ・ブックマーク・スマホのホーム画面に出る小さな絵）を作る
# 使い方: <Pillow の入った python> -I make_favicon.py
#
#   作るもの（site_assets/ に置く。make_site.py が site/assets/ に写し、どのページからも読む）
#     favicon.svg           いまのブラウザ用（どの大きさでもくっきり）
#     favicon.ico           古いブラウザ用（16・32・48 ピクセル）
#     apple-touch-icon.png  iPhone・Android のホーム画面用（180 ピクセル。角は端末が丸めるので四角のまま）
#   絵：オリーブの角の丸い四角に、白い棒3本（統計のしるし）。棒は高さをそろえず、増える・減るの向きを感じさせない形にする（数はそのまま示すサイトのため）。
#   16 ピクセルでも棒が見えるよう、棒は太め（1本 3 ピクセル分）で、細い線や字は入れない。
#   色はサイトの色（オリーブ。style.css の --btn）。予算のサイトの緑とは分ける
import os
import sys

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "site_assets")
OLIVE, WHITE = "#667a17", "#ffffff"
BARS = ((10, 32, 22, 52), (26, 12, 38, 52), (42, 24, 54, 52))  # 64×64 のます目での白い棒（左・上・右・下）。低い・高い・中くらい。32 ピクセルでちょうどます目に合う
BARS16 = ((8, 32, 20, 52), (24, 12, 36, 52), (40, 24, 52, 52))  # 16 ピクセル用：棒 3・すき間 1 ピクセルでます目に合わせ、ぼやけないようにする（左右の余白は 2 と 3）


def svg():
    bars = "".join(f'<rect x="{l}" y="{t}" width="{r - l}" height="{b - t}" rx="2"/>' for l, t, r, b in BARS)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{OLIVE}"/>'
            f'<g fill="{WHITE}">{bars}</g></svg>\n')


def png(px, round_corner=True):
    """px ピクセルの絵。大きく描いてから縮める（ふちをなめらかにする）。16 ピクセルは棒の角を丸めない（ふちがにじむため）"""
    k = 8
    s = px * k / 64
    im = Image.new("RGBA", (px * k, px * k), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    g.rounded_rectangle((0, 0, px * k - 1, px * k - 1), radius=14 * s if round_corner else 0, fill=OLIVE)
    for l, t, r, b in (BARS16 if px <= 16 else BARS):
        g.rounded_rectangle((l * s, t * s, r * s - 1, b * s - 1), radius=0 if px <= 16 else 2 * s, fill=WHITE)
    return im.resize((px, px), Image.BOX)  # 平均で縮める（LANCZOS だと棒の横に薄い影の列が出る）


def main():
    with open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg())
    # 大きさごとに描く（48 を縮めると 16 の棒がぼやけるため）
    png(48).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[png(16), png(32)])
    png(180, round_corner=False).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True)
    print("site_assets/ に favicon.svg・favicon.ico・apple-touch-icon.png を作りました")


if __name__ == "__main__":
    main()
