# e-Stat の在留外国人統計「テーブルデータ」（Excel の Power Pivot）の中身を読み出して pickle に保存する
# 使い方: <venv の python> estat_pp.py <xlsx> <出力pkl> [列名...]
# pbixray は表の名前が R で始まると .tbl.xml を読み飛ばす（正規表現の書き違い）ので、ここで直してから使う
import sys, re
sys.stdout.reconfigure(encoding="utf-8")
from pbixray.meta import xml_source
from pbixray.meta.xml_source import XmlMetadataSource


def _fixed(self):
    self._load_xml_collection(
        re.compile(r'^(?!H\$|R\$)([^$]*?)\.(\d+)\.tbl\.xml$'),
        lambda s: xml_source.XMObjectDocument.from_xml_string(s).root_object,
        self._tbl_objects, 'table',
    )


XmlMetadataSource._extract_tbl_metadata = _fixed
from pbixray import PBIXRay

src, out = sys.argv[1], sys.argv[2]
cols = sys.argv[3:] or None
m = PBIXRay(src)
t = list(m.tables)[0]
print("table", t)
df = m.get_table(t, columns=cols, strings_as_categorical=True)
print(len(df), list(df.columns))
print(df.head(5).to_string())
df.to_pickle(out)
