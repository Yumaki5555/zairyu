# GitHub に公開するものだけを、別のフォルダ（GitHub の写し）にコピーする
# 使い方: python -I copy_public.py <写す先のフォルダ>
#
#   公開するもの
#     作り方のプログラム（このフォルダの *.py・*.ps1）と README.md（GitHub の最初のページの説明）
#     データ/ の表と説明（*.csv・*.md。時点ごとに分けた表のフォルダ、古い表/ も）。「試し_」で始まる試しのファイルは除く
#     site_assets/ のグラフの部品と見た目（app.js・style.css）と地図の形（map/*.json。make_map.py で国土地理院「地球地図日本」から、world.json は make_world_map.py で Natural Earth から作ったもの）、サイトのしるし（favicon.*・apple-touch-icon.png。make_favicon.py で作ったもの）
#     site/ のサイトのページ → 写す先では docs/（GitHub Pages で docs/ を公開する）。docs/.nojekyll も作る（GitHub に手を加えさせず、そのまま出す印）
#     元データ/ のうち、人が手で作った一覧と出どころ一覧だけ
#       出どころ一覧.csv（e-Stat の番号・URL・公開日。元のファイルはここから取り直せる）・出入国管理統計_出どころ一覧.csv（特定活動の新しく入国した人の表）
#       人口_出どころ一覧.csv・半期速報_出どころ一覧.csv（住民基本台帳人口と法務省の半期速報の資料の URL・公表日）
#       不法残留_出どころ一覧.csv・帰化_出どころ一覧.csv（不法残留者数の報道発表と、帰化の数の資料の URL）
#       OCR直し.csv・印刷のまま.csv・名前の直し.csv（画像で確かめて直した所・印刷のまま残した所・市区の名前の直し）
#   公開しないもの：元データ/ の e-Stat から落としたファイル（Excel・PDF）と、画像の読み取り結果、国土地理院・Natural Earth から落とした地図のデータ（大きく、取り直せるため）
#
#   写す先にあって、公開するものに入っていないファイルは消す（写す先は公開用の写しとして、このプログラムだけで作る）。
#   ただし写す先の .git（GitHub の記録）と、ここで作らないファイル（KEEP）は残す
import os
import shutil
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
HAND_MADE = ["出どころ一覧.csv", "OCR直し.csv", "印刷のまま.csv", "名前の直し.csv", "人口_出どころ一覧.csv", "半期速報_出どころ一覧.csv",
             "不法残留_出どころ一覧.csv", "帰化_出どころ一覧.csv", "難民_出どころ一覧.csv", "出入国管理統計_出どころ一覧.csv"]
KEEP = {".git", ".gitignore", "LICENSE"}  # 写す先で別に作るもの（消さない）
EMPTY = object()  # 中身のないファイルを作る印


def walk(folder, exts):
    """folder の中の、exts で終わるファイルの BASE からの相対パス（名前の順）。「試し_」で始まるものは除く"""
    out = []
    for root, dirs, files in os.walk(os.path.join(BASE, folder)):
        dirs[:] = sorted(d for d in dirs if not d.startswith(("試し_", "__")))
        out += [os.path.relpath(os.path.join(root, n), BASE) for n in sorted(files) if n.endswith(exts) and not n.startswith("試し_")]
    return out


def public_files():
    """公開するファイルの (写す元, 写す先) の一覧。写す元は BASE から、写す先は写す先のフォルダからの相対パス"""
    out = [(n, n) for n in sorted(os.listdir(BASE)) if n.endswith((".py", ".ps1")) and os.path.isfile(os.path.join(BASE, n))]
    if os.path.exists(os.path.join(BASE, "README.md")):
        out.append(("README.md", "README.md"))
    out += [(r, r) for r in walk("データ", (".csv", ".md"))]
    out += [(r, r) for r in walk("site_assets", (".js", ".css", ".json", ".svg", ".ico", ".png"))]
    out += [(r, os.path.join("docs", os.path.relpath(r, "site"))) for r in walk("site", (".html", ".js", ".css", ".json", ".svg", ".ico", ".png"))]
    out.append((EMPTY, os.path.join("docs", ".nojekyll")))
    out += [(os.path.join("元データ", n),) * 2 for n in HAND_MADE if os.path.exists(os.path.join(BASE, "元データ", n))]
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit("使い方: python -I copy_public.py <写す先のフォルダ>")
    dst = os.path.abspath(sys.argv[1])
    if os.path.commonpath([dst, BASE]) == BASE:
        sys.exit("写す先は、このフォルダの外にしてください")
    files = public_files()
    want = {os.path.normpath(b) for _, b in files}
    copied = 0
    for a, b in files:
        b = os.path.join(dst, b)
        os.makedirs(os.path.dirname(b), exist_ok=True)
        if a is EMPTY:
            if not os.path.exists(b) or os.path.getsize(b):
                open(b, "wb").close()
                copied += 1
            continue
        a = os.path.join(BASE, a)
        if not os.path.exists(b) or os.path.getsize(a) != os.path.getsize(b) or open(a, "rb").read() != open(b, "rb").read():
            shutil.copyfile(a, b)
            copied += 1
    removed = 0
    for root, dirs, names in os.walk(dst, topdown=True):
        rel_root = os.path.relpath(root, dst)
        if rel_root == ".":
            dirs[:] = [d for d in dirs if d not in KEEP]
        for n in names:
            rel = os.path.normpath(os.path.join(rel_root, n))
            if rel not in want and not (rel_root == "." and n in KEEP):
                os.remove(os.path.join(root, n))
                removed += 1
    for root, dirs, names in os.walk(dst, topdown=False):  # 空になったフォルダ
        if root != dst and not os.listdir(root) and ".git" not in root.split(os.sep):
            os.rmdir(root)
    real = [os.path.join(BASE, a) for a, _ in files if a is not EMPTY]
    size = sum(os.path.getsize(p) for p in real)
    big = [(os.path.relpath(p, BASE), os.path.getsize(p)) for p in real if os.path.getsize(p) > 50 * 2**20]
    print(f"公開するファイル {len(files)}（合わせて {size / 2**20:.0f}MB）、写した {copied}、消した {removed}")
    for r, n in big:
        print(f"  50MB をこえるファイル: {r} {n / 2**20:.0f}MB")


if __name__ == "__main__":
    main()
