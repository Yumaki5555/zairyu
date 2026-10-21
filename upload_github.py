# 公開用の写し（Dropbox の外）を作り直して、GitHub（Yumaki5555/zairyu）に上げる
# 使い方: python -I upload_github.py            … 写して、変わった所があれば1回の記録（コミット）にまとめて上げる
#         python -I upload_github.py --dry-run  … 写して、変わったファイルの数だけ出す（上げない）
#
#   写し: <ホームのフォルダ>/github/zairyu（copy_public.py で作る。サイトは docs/ に入り、GitHub Pages で公開される）
#   先に GitHub の最新に合わせてから写す。記録の名前・メールは写しの git の設定（Yumaki5555、GitHub のメールを隠す代わりのアドレス）
#   新しい時点のデータが出たときは make_data.py → make_site.py のあとにこれを動かす
import os
import subprocess
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(os.path.expanduser("~"), "github", "zairyu")
SITE_URL = "https://yumaki5555.github.io/zairyu/"


def git(*args):
    r = subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit(f"git {' '.join(args)} がうまくいきませんでした:\n{r.stdout}{r.stderr}")
    return r.stdout


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.isdir(os.path.join(REPO, ".git")):
        sys.exit(f"写しのフォルダ {REPO} に git の記録がありません")
    if git("ls-remote", "--heads", "origin", "main").strip():
        git("pull", "--ff-only", "origin", "main")
    subprocess.run([sys.executable, "-I", os.path.join(BASE, "copy_public.py"), REPO], check=True)
    git("add", "-A")
    changed = [l for l in git("status", "--porcelain").splitlines() if l.strip()]
    if not changed:
        print("変わった所はありません（上げませんでした）")
        return
    print(f"変わったファイル {len(changed)}")
    if dry:
        git("reset", "-q")
        print("--dry-run なので上げませんでした")
        return
    git("commit", "-q", "-m", f"ページとデータを更新（{datetime.now():%Y-%m-%d %H:%M}）")
    git("push", "-q", "origin", "main")
    print(f"上げました。数分で {SITE_URL} に出ます")


if __name__ == "__main__":
    main()
