/* 数でみる在留外国人：難民認定などの数のページ（nanmin.html）の、選んで見る部分
   数は data/nanmin.json（make_dash_data.py が データ/難民/ から作る）。グラフの部品は dash.js、画像の保存は share.js。見た目と部品は帰化のページ（kika.js）・不法残留のページ（fuho.js）と同じ。
   ページの順（大事なものから）：① その年に難民と認定・保護した人と、1978年からの累計 → ② 国籍・地域別 → ③ 選んだ国籍・地域のくわしい数 → ④ 申請したときの在留資格
   → ⑤ 毎年の移り変わり → ⑥ 審査の進み方（一次審査・審査請求）→ ⑦ くわしい数（表。たたんで置く）。⑧ 出典と注意は、ページに書いてある（make_site.py）。
   上の「対象の年」を変えると、①〜⑦ がその年に合わせて変わる。
   在留外国人統計とは別の統計なので、時点の書き方（年ごと）・出典・ハッシュタグ・画像のタイトルは、ここで決めて画像（share.js）に渡す。
   発表の数は、範囲の違うものがある。混ぜて足したり並べたりしない：
     ・毎年の数（国の表「我が国における難民保護の状況等」）：1978年から。申請者数は1982年から、その他の保護（人道配慮）は1991年から、補完的保護は2023年12月から。
       定住難民は1978〜2005年（インドシナ難民）と2010年から（第三国定住）。合計は国の表の「合計」で、定住難民として受け入れたあと条約難民と認定された人などは重複して数えられている
     ・国籍・地域別：2018年から。申請者数の2018〜2020年は上位25か国・地域と「その他」だけ（2021年からは全部の国籍・地域がのっている）。補完的保護は2023年から
     ・申請したときの在留資格：2016年から。審査の進み方：2010年から
   ない数は「データなし」「—」・線を切る（0人とは分ける）。全部の国籍・地域がのっている年に名前がない国籍・地域は0人。
   申請・認定・処理は、それぞれその年にあった数なので、認定者数÷申請者数を「認定される割合」としては出さない（その年に申請した人がその年に審査されたとは限らない） */
(function () {
  'use strict';
  var root = document.getElementById('nanmin');
  if (!root || !window.KZC) { return; }
  var K = window.KZ, Z = window.KZC, fmt = K.fmt, esc = K.esc, el = Z.el, signed = Z.signed;
  var D = null, SRC = '', TAG = '#難民', NOPUB = 'データなし';
  // ② の見方：国籍・地域別の表の項目
  var ITEMS = { a: '難民認定申請者数', r: '難民認定者数', c: '補完的保護対象者認定者数', h: '人道配慮（本国情勢等）' };
  var WHO = { a: '難民認定を申請した人', r: '難民と認定された人', c: '補完的保護対象者と認定された人', h: '人道配慮で在留を認められた人（本国情勢等）' };
  var SHORT = { a: '申請', r: '難民認定', c: '補完的保護', h: '人道配慮（本国情勢等）' };
  var CLS_N = { a: '5', r: '1', c: '2', h: '3' };
  // 保護の4つの区分（国の表の列, ページの名前, 色, 画像の短い名前）。色はどのグラフでも同じ。画像は字を小さくしないよう短い名前にする
  var PROT = [['条約難民', '難民と認定（条約難民）', '1', '難民と認定'], ['補完的保護対象者', '補完的保護対象者と認定', '2', '補完的保護'],
    ['その他の保護', '人道的な配慮で在留を許可（その他の保護）', '3', '人道配慮'], ['定住難民', '定住難民として受入れ（インドシナ難民・第三国定住）', '4', '定住難民']];
  var PROT_NOTE = '人道配慮は国の表の「その他の保護」、定住難民はインドシナ難民・第三国定住。';
  var OVERLAP = '合計は国の表の「合計」です。定住難民として受け入れたあと条約難民と認定された人や、一次審査で人道配慮となったあと審査請求で難民と認定された人などは、重複して数えられています。';
  var NOT_RATE = 'それぞれ、その年（1月〜12月）にあった数です。その年に申請した人が、その年に審査されたとは限りません。';
  // y：対象の年、nv：② の項目（a 申請・r 難民認定・c 補完的保護・h 人道配慮）、np：② の期間（''＝その年、c＝累計）、nat：③ の国籍・地域、
  // from・to：⑤ の期間、tv：⑤ の見方（''＝申請、p＝認定・保護）
  var DEF = { y: '', nv: 'a', np: '', nat: '', from: '', to: '', tv: '' };
  var S = JSON.parse(JSON.stringify(DEF));
  var OPEN = {}; // たたんだ欄・「もっと見る」のうち開いているもの（選び直して描き直しても開いたまま）

  function readHash() { var q = new URLSearchParams(location.hash.slice(1)); Object.keys(S).forEach(function (k) { var v = q.get(k); if (v != null) { S[k] = v; } }); }
  function writeHash() {
    var q = new URLSearchParams(); Object.keys(S).forEach(function (k) { if (S[k] && S[k] !== DEF[k]) { q.set(k, S[k]); } });
    history.replaceState(null, '', '#' + q.toString());
  }
  // 年を変えたときは全部、ほかはその欄（only：欄の id の並び）だけ描き直す
  function set(p, only) { Object.keys(p).forEach(function (k) { S[k] = p[k]; }); render('y' in p ? null : only); }
  function srcLine(extra) {
    var r = D.releases[D.releases.length - 1];
    return el('p', 'dsrc', esc('出典：' + SRC + (extra || '')) + ' <a href="' + esc(r.page) + '">いちばん新しい発表のページ</a>');
  }
  function v(key, y) { var i = D.Y.indexOf(+y); return i >= 0 && D.s[key] ? D.s[key][i] : null; }
  function natT(k, y) { return (D.nat[ITEMS[k]] || {})[String(y)]; }
  function natYears(k) { return Object.keys(D.nat[ITEMS[k]] || {}).sort(); }
  function full(t) { return t && t.other == null; } // 全部の国籍・地域がのっている年（のっていない国籍・地域は0人）
  // 国籍・地域の数。null は分からない（その年の表がない、または上位25の外）。全部のっている年に名前がなければ0人
  function natVal(k, n, y) {
    var t = natT(k, y); if (!t) { return null; }
    var r = t.rows.filter(function (q) { return q[0] === n; })[0];
    return r ? r[1] : full(t) ? 0 : null;
  }
  function natRow(k, n, y) { var t = natT(k, y); return t ? t.rows.filter(function (q) { return q[0] === n; })[0] : null; }
  function rankOf(rows, x) { return 1 + rows.filter(function (q) { return q[1] > x; }).length; } // 同じ人数は同じ順位
  function cur(chart, title, note) { if (note) { chart.markNote = note; } return { title: title, autoTitle: title, chart: chart, meta: { nat: [], visa: [] }, src: SRC, tag: TAG }; }
  function tools(get) { var t = el('div', 'dtools'); if (window.KZX) { window.KZX.buttons(t, get); } return t; }
  function rate(a, b) { return a == null || !b ? '' : '（' + signed((a - b) / b * 100, 1) + '%）'; }
  function chg(a, b) { return a == null || b == null ? '' : '前の年から ' + signed(a - b) + '人' + rate(a, b); }
  function help(text) { return el('p', 'dhelp', esc(text)); }
  function pct(x, tot) { return tot ? (x / tot * 100).toFixed(1) + '%' : ''; }
  function yl(y) { var l = D.label[String(y)]; return y + '年' + (l ? '（' + l + '）' : ''); }

  // たたんだ欄。中身は開いたときに作る（閉じたまま作ると、グラフの幅が分からないため）
  function fold(key, summary, build) {
    var d = el('details', 'kfold'), done = false;
    d.appendChild(el('summary', null, esc(summary)));
    function fill() {
      if (done || !d.open) { return; }
      done = true;
      var b = el('div', 'kfoldin');
      try { build(b); } catch (e) { console.error(e); b.appendChild(Z.nodata('この部分を表示できませんでした')); }
      d.appendChild(b);
    }
    d.addEventListener('toggle', function () { OPEN[key] = d.open; fill(); });
    if (OPEN[key]) { d.open = true; fill(); }
    return d;
  }
  // 見方を切り替えるボタン（選んでいるものは緑・✓）
  function views(opts, val, on) {
    var p = el('div', 'dpick kviews'); p.setAttribute('role', 'group');
    opts.forEach(function (o) {
      var b = el('button', null, esc(o[1])); b.type = 'button'; b.setAttribute('aria-pressed', o[0] === val ? 'true' : 'false');
      b.addEventListener('click', function () { if (o[0] !== val) { on(o[0]); } });
      p.appendChild(b);
    });
    return p;
  }
  function sel(lab, val, opts, on) {
    var l = el('label', 'dctl'), s = el('select');
    opts.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
    s.value = val; s.addEventListener('change', function () { on(s.value); });
    l.appendChild(el('span', 'dlab', esc(lab))); l.appendChild(s); return l;
  }
  // 横棒の一覧：順位・名前・棒・人数・割合を1行に（スマホでは棒を名前の下へ）。
  // items：{rk：順位, name, sub：名前の下の小さな字, v（null はデータなし）, cls：棒の色, on：選んでいる, click：名前を押したとき, rest：「その他」など国籍の分からない分}
  // total：割合の分母、more：はじめに出す行の数（ほかは「もっと見る」で出す。key：開いたかを覚える名前）
  function rankList(items, total, more, key) {
    var ul = el('ul', 'krank frank'), mx = Math.max.apply(null, items.map(function (x) { return x.v || 0; }).concat([1])), rows = [];
    items.forEach(function (x) {
      var li = el('li', [x.rest ? 'rest' : '', x.on ? 'on' : ''].join(' ').trim() || null);
      li.innerHTML = '<span class="rk">' + (x.rk ? x.rk + '<small>位</small>' : '') + '</span>' +
        '<span class="nm">' + (x.on ? '<span class="fon" title="選んでいる国籍・地域">✓ </span>' : '') + (x.click ? '<button type="button" class="flink">' + esc(x.name) + '</button>' : esc(x.name)) +
        (x.sub ? '<span class="sub">' + esc(x.sub) + '</span>' : '') + '</span>' +
        '<span class="track">' + (x.v == null ? '' : '<span class="fill' + (x.cls && !x.rest ? ' c' + x.cls : '') + '" style="width:' + (x.v / mx * 100).toFixed(1) + '%"></span>') + '</span>' +
        (x.v == null ? '<span class="v fnone">' + NOPUB + '</span><span class="p"></span>' :
          '<span class="v">' + fmt(x.v) + '<small>人</small></span><span class="p">' + (total ? pct(x.v, total) : '') + '</span>');
      if (x.click) { li.querySelector('.flink').addEventListener('click', x.click); }
      ul.appendChild(li); rows.push(li);
    });
    if (!more || items.length <= more + 3) { return ul; }
    var wrap = el('div'), b = el('button', 'fkids');
    function show() { rows.forEach(function (li, i) { li.hidden = i >= more && !OPEN[key]; }); b.setAttribute('aria-expanded', OPEN[key] ? 'true' : 'false'); b.textContent = OPEN[key] ? '上の' + more + 'つだけにする' : 'もっと見る（あと' + (items.length - more) + '）'; }
    b.type = 'button'; b.addEventListener('click', function () { OPEN[key] = !OPEN[key]; show(); }); show();
    wrap.appendChild(ul); wrap.appendChild(b);
    return wrap;
  }
  function box(label, val, sub, cls) {
    var d = el('div', 'fbox' + (cls ? ' ' + cls : ''));
    d.appendChild(el('span', 'flab', esc(label)));
    d.appendChild(val == null ? el('b', 'fnone', NOPUB) : el('b', null, fmt(val) + '<small>人</small>'));
    if (sub) { d.appendChild(el('span', 'fsub', esc(sub))); }
    return d;
  }
  function upDown(tw) { tw.querySelectorAll('td').forEach(function (td) { if (/^[+↑]/.test(td.textContent)) { td.classList.add('up'); } else if (/^[−↓]/.test(td.textContent)) { td.classList.add('down'); } }); return tw; }
  function lineData(per, series, title, whenText) {
    return { kind: 'line', per: per.map(String), labels: per.map(function (x) { return x + '年'; }), at: per, series: series, index: false, area: '全国',
      when: String(per[per.length - 1]), from: String(per[0]), whenText: whenText || per[0] + '年〜' + per[per.length - 1] + '年（毎年1月〜12月）', title: title };
  }
  function lines(per, series, title) { return Z.lineChart(per.map(String), series, { title: title, at: per, lab: function (i) { return per[i] + '年'; } }); }
  // 全部の国籍・地域の名前（③ の選ぶ欄）：いちばん新しい年の申請者数の多い順、そのあとにほかの表だけにある名前
  function allNats() {
    var out = [], add = function (n) { if (out.indexOf(n) < 0) { out.push(n); } };
    var ys = natYears('a').slice().reverse();
    ys.forEach(function (y) { natT('a', y).rows.forEach(function (r) { add(r[0]); }); });
    ['r', 'c', 'h'].forEach(function (k) { natYears(k).slice().reverse().forEach(function (y) { natT(k, y).rows.forEach(function (r) { add(r[0]); }); }); });
    return out;
  }

  // ---------- 上：対象の年（変えると ①〜⑦ がその年に合わせて変わる）
  function controls() {
    var f = el('div', 'dfilter kctl'), latest = String(D.Y[D.Y.length - 1]);
    f.appendChild(sel('対象の年（1月〜12月）', S.y, D.Y.slice().reverse().map(function (y) { return [String(y), y + '年']; }), function (x) { set({ y: x }); }));
    f.appendChild(el('p', 'kctlhelp', 'この年の数と、この年までの累計を出します'));
    var plain = Object.keys(DEF).every(function (k) { return k === 'y' ? S.y === latest : S[k] === DEF[k]; });
    var acts = el('div', 'dctl dacts'), reset = el('button', 'dbtn dbtn-sub', 'リセット'); reset.type = 'button'; reset.disabled = plain;
    reset.title = plain ? '選んでいる条件はありません' : '年・見方・国籍・地域などを、はじめの状態に戻します';
    reset.addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEF)); S.y = latest; render(); });
    acts.appendChild(reset); f.appendChild(acts);
    return f;
  }

  // ---------- ① その年に認定・保護した人（いちばん大事な数）と、1978年からの累計
  function totalSec(c) {
    var y = +S.y, r = v('条約難民', y), rk = v('条約難民のうち審査請求で認定', y), ap = v('難民認定申請者数', y), tot = v('合計', y);
    c.appendChild(el('h2', null, '日本では、何人が難民と認定・保護された？'));
    c.appendChild(el('p', 'klab', esc(yl(y) + 'に難民と認定された人（条約難民）')));
    c.appendChild(el('p', 'kbig', r == null ? NOPUB : fmt(r) + '<small>人</small>'));
    if (r != null) {
      c.appendChild(help((rk ? 'うち' + fmt(rk) + '人は、一次審査で認定されず、審査請求（不服の申立て）で認定された人です。' : '') +
        '入管法（出入国管理及び難民認定法）にもとづいて、難民条約の難民に当たると認められた人の数です。'));
    }
    var yr = el('div', 'kyear'), pr = v('条約難民', y - 1);
    yr.innerHTML = '<span class="klab">' + y + '年の難民認定申請者数</span><b>' + (ap == null ? NOPUB : fmt(ap) + '<small>人</small>') + '</b><span class="kch">' +
      (ap == null ? '（申請者数は1982年からです）' : esc(chg(ap, v('難民認定申請者数', y - 1)))) + '</span>';
    c.appendChild(yr);
    if (r != null && pr != null) { c.appendChild(help('難民と認定された人は、' + chg(r, pr) + 'です。' + NOT_RATE)); }
    // その年の保護の内わけ（4つの区分）
    c.appendChild(el('h3', null, esc(y + '年に認定・保護した人の内わけ')));
    var g = el('div', 'nkpis');
    g.appendChild(box('難民と認定（条約難民）', r, ''));
    g.appendChild(box('補完的保護対象者と認定', v('補完的保護対象者', y), y < 2023 ? '補完的保護の制度は2023年12月から' : ''));
    g.appendChild(box('人道的な配慮で在留を許可', v('その他の保護', y), y < 1991 ? 'この数は1991年からです' : '国の表の「その他の保護」'));
    g.appendChild(box('定住難民として受入れ', v('定住難民', y), v('定住難民', y) == null ? '2006〜2009年は受入れの数がありません' : y <= 2005 ? 'インドシナ難民' : '第三国定住'));
    c.appendChild(g);
    var parts = PROT.map(function (p) { return { name: p[1], v: v(p[0], y), cls: p[2], short: p[3] }; }).filter(function (p) { return p.v != null; });
    if (tot != null) {
      c.appendChild(el('p', 'stotal', y + '年の合計 <b>' + fmt(tot) + '人</b>'));
      c.appendChild(rankList(parts, tot));
      c.appendChild(help(OVERLAP + '割合は、合計（' + fmt(tot) + '人）に対する割合です。補完的保護対象者は、難民条約の難民には当たらないものの、難民と同じように守る必要がある人（紛争から逃れてきた人など）で、2023年12月に始まった制度です。'));
      var rankY = { kind: 'rank', rows: parts.map(function (p) { return [p.short, p.v]; }), noRank: true, f: function (x) { return fmt(x) + '人'; }, metric: '人数', area: '全国', when: String(y),
        what: '保護の区分', whenText: y + '年（1月〜12月）', keys: [[y + '年の合計', fmt(tot) + '人']] };
      c.appendChild(tools(function () { return cur(rankY, '全国｜' + y + '年に難民と認定・保護した人の内わけ', PROT_NOTE + OVERLAP); }));
    }
    // 1978年からの累計
    var per = D.Y.filter(function (x) { return x <= y; }), sum = function (key) { return per.reduce(function (a, x) { return a + (v(key, x) || 0); }, 0); };
    var all = sum('合計'), cp = PROT.map(function (p) { return { name: p[1], v: sum(p[0]), cls: p[2], short: p[3] }; }).filter(function (p) { return p.v > 0; });
    c.appendChild(el('h3', null, esc(D.Y[0] + '年〜' + y + '年の累計')));
    c.appendChild(el('p', 'stotal', D.Y[0] + '年〜' + y + '年の合計 <b>' + fmt(all) + '人</b>'));
    c.appendChild(rankList(cp, all));
    c.appendChild(el('p', 'kwarn', '毎年の数を足し合わせた数です。いま日本に住んでいる人の数ではありません。' + OVERLAP));
    var rankC = { kind: 'rank', rows: cp.map(function (p) { return [p.short, p.v]; }), noRank: true, f: function (x) { return fmt(x) + '人'; }, metric: '人数', area: '全国', when: String(y),
      what: '保護の区分', whenText: D.Y[0] + '年〜' + y + '年の累計', keys: [[D.Y[0] + '年〜' + y + '年の合計', fmt(all) + '人']] };
    c.appendChild(tools(function () { return cur(rankC, '全国｜難民と認定・保護した人の累計（' + D.Y[0] + '年〜）', '毎年の数の合計。いま日本に住む人の数ではありません。' + PROT_NOTE + OVERLAP); }));
    c.appendChild(srcLine());
  }

  // ---------- ② 国籍・地域別
  function natSec(c) {
    var y = +S.y, k = ITEMS[S.nv] ? S.nv : 'a', ys = natYears(k), y0 = +ys[0];
    c.appendChild(el('h2', null, 'どの国籍・地域の人が申請・認定された？'));
    c.appendChild(views([['a', '難民認定を申請した人'], ['r', '難民と認定された人'], ['c', '補完的保護対象者'], ['h', '人道配慮（本国情勢等）']], k,
      function (x) { set({ nv: x }, ['nat']); }));
    if (y < y0) {
      c.appendChild(Z.nodata(WHO[k] + 'の国籍・地域別の数は' + y0 + '年からです。上の「対象の年」で' + y0 + '年より後を選んでください。'));
      c.appendChild(srcLine()); return;
    }
    var np = S.np === 'c' && y > y0 ? 'c' : '';
    c.appendChild(views([['', y + '年'], ['c', y0 + '〜' + y + '年の累計']].slice(0, y > y0 ? 2 : 1), np, function (x) { set({ np: x }, ['nat']); }));
    if (np === 'c') { natCum(c, k, y, ys); } else { natYear(c, k, y); }
  }
  function pickNat(n) { return function () { set({ nat: n }, ['nat', 'pick']); var t = document.getElementById('pick'); if (t) { t.scrollIntoView({ block: 'start' }); } }; }
  function natYear(c, k, y) {
    var t = natT(k, y), prev = natT(k, y - 1);
    c.appendChild(el('h3', null, esc(y + '年に' + WHO[k] + 'の国籍・地域')));
    c.appendChild(el('p', 'stotal', esc(y + '年の' + SHORT[k] + 'の数') + ' <b>' + fmt(t.tot) + '人</b>' + (full(t) ? '（' + t.rows.length + 'の国籍・地域）' : '')));
    var items = t.rows.map(function (r) {
      return { rk: rankOf(t.rows, r[1]), name: r[0], sub: r[2] ? 'うち審査請求で認定 ' + fmt(r[2]) + '人' : '', v: r[1], cls: CLS_N[k], on: r[0] === S.nat, click: pickNat(r[0]) };
    });
    if (t.other != null) { items.push({ name: 'その他', sub: '上位25以外の国籍・地域の合計', v: t.other, rest: true }); }
    c.appendChild(rankList(items, t.tot, 15, 'more-' + k + y));
    c.appendChild(help('割合は、' + y + '年の' + SHORT[k] + 'の数（' + fmt(t.tot) + '人）に対する割合です。国籍・地域の名前を押すと、下の「選んだ国籍・地域のくわしい数」に出ます。' +
      (t.other != null ? y + '年は上位25か国・地域だけが発表されていて、ほかは「その他」にまとめられています。' : '') +
      (k === 'h' ? '人道配慮で在留を認められた人のうち、本国の情勢などをふまえて認められた人の数です（日本人と結婚しているなどの事情で認められた人は入っていません）。' : '') +
      (k === 'c' ? '補完的保護の制度は2023年12月からです。' : '')));
    var top = t.rows.slice(0, 10);
    var chart = { kind: 'rank', rows: top.map(function (r) { return [r[0], r[1]]; }), ranks: top.map(function (r) { return rankOf(t.rows, r[1]); }), f: function (x) { return fmt(x) + '人'; },
      metric: '人数', area: '全国', when: String(y), what: '全国の国籍・地域', whenText: y + '年（1月〜12月）' };
    c.appendChild(tools(function () {
      return cur(chart, '全国｜' + y + '年の' + { a: '難民認定申請者', r: '難民認定者', c: '補完的保護対象者', h: '人道配慮（本国情勢等）で在留を認められた人' }[k] + 'の国籍・地域別人数' +
        (t.rows.length > 10 ? '（上位10）' : ''), t.rows.length > 10 ? 'ほかの国籍・地域を合わせて' + fmt(t.tot) + '人。' : '');
    }));
    c.appendChild(fold('cmp' + k, y + '年の表（前の年との比べ）', function (b) {
      var rows = t.rows.map(function (r) {
        var p = prev ? natVal(k, r[0], y - 1) : null;
        return [rankOf(t.rows, r[1]) + '位', r[0], fmt(r[1]), pct(r[1], t.tot), p == null ? (prev ? '前の年は上位25の外' : null) : signed(r[1] - p)];
      });
      if (t.other != null) { rows.push(['', 'その他（上位25以外）', fmt(t.other), pct(t.other, t.tot), null]); }
      rows.push(['', '総数', fmt(t.tot), '100.0%', prev ? signed(t.tot - prev.tot) : null]);
      b.appendChild(upDown(Z.tableEl(['順位', '国籍・地域', '人数', '割合', '前の年から'], rows, 2)));
      b.appendChild(help(prev ? '前の年に名前のない国籍・地域は、前の年が全部の国籍・地域をのせた表なら0人として比べています。' : '前の年（' + (y - 1) + '年）の国籍・地域別の数はないので、比べられません。'));
    }));
    c.appendChild(srcLine());
  }
  // 選んだ年までの累計。申請者数の2018〜2020年は上位25だけなので、のっていない年のある国籍・地域に※を付け、順位は付けない
  function natCum(c, k, y, ys) {
    ys = ys.filter(function (x) { return +x <= y; });
    var span = ys[0] + '〜' + ys[ys.length - 1] + '年', names = [];
    ys.forEach(function (x) { natT(k, x).rows.forEach(function (r) { if (names.indexOf(r[0]) < 0) { names.push(r[0]); } }); });
    var unknown = function (n) { return ys.filter(function (x) { return natVal(k, n, x) == null; }); };
    var mark = function (n) { return unknown(n).length ? n + '※' : n; };
    var tots = names.map(function (n) { return [n, ys.reduce(function (a, x) { return a + (natVal(k, n, x) || 0); }, 0)]; }).sort(function (a, b) { return b[1] - a[1]; });
    var all = ys.reduce(function (a, x) { return a + natT(k, x).tot; }, 0), rest = ys.reduce(function (a, x) { return a + (natT(k, x).other || 0); }, 0);
    var anyMark = tots.some(function (r) { return unknown(r[0]).length; }), part = ys.filter(function (x) { return !full(natT(k, x)); });
    c.appendChild(el('h3', null, esc(span + 'の' + WHO[k] + 'の国籍・地域（累計' + (part.length ? '・掲載分' : '') + '）')));
    if (part.length) {
      c.appendChild(el('div', 'kbox', '<b>' + part.join('・') + '年は、上位25か国・地域だけが発表されています。</b>その年に上位25に入らなかった国籍・地域の人数は分からないので、足していません。' +
        (anyMark ? '<b>※</b>の国籍・地域は人数の分からない年があり、実際の累計はこれより多くなります。' : '') + '順位は付けていません。'));
    }
    c.appendChild(el('p', 'stotal', esc(span + 'の' + SHORT[k] + 'の数の合計') + ' <b>' + fmt(all) + '人</b>'));
    var items = tots.map(function (r) {
      var u = unknown(r[0]);
      return { rk: part.length ? null : rankOf(tots, r[1]), name: mark(r[0]), sub: u.length ? u.join('・') + '年の数は分からない' : '', v: r[1], cls: CLS_N[k], on: r[0] === S.nat, click: pickNat(r[0]) };
    });
    if (rest) { items.push({ name: '上位25以外', sub: part.join('・') + '年の「その他」の合計（国籍・地域は分からない）', v: rest, rest: true }); }
    c.appendChild(rankList(items, all, 15, 'morec-' + k + y));
    c.appendChild(help('毎年の数を足し合わせた数です（何年かにわたって申請した人などは、その年ごとに数えられています）。割合は、' + span + 'の合計（' + fmt(all) + '人）に対する割合です。'));
    var top = tots.slice(0, 10);
    var chart = { kind: 'rank', rows: top.map(function (r) { return [mark(r[0]), r[1]]; }), noRank: !!part.length, ranks: part.length ? null : top.map(function (r) { return rankOf(tots, r[1]); }),
      f: function (x) { return fmt(x) + '人'; }, metric: '人数', area: '全国', when: String(y), what: '全国の国籍・地域', whenText: span + 'の累計' };
    c.appendChild(tools(function () {
      return cur(chart, '全国｜' + { a: '難民認定申請者', r: '難民認定者', c: '補完的保護対象者', h: '人道配慮（本国情勢等）で在留を認められた人' }[k] + 'の国籍・地域別の累計（' + span + '）',
        '毎年の数の合計。' + (part.length ? part.join('・') + '年は上位25だけの掲載分。※は分からない年があり、実際はもっと多い。' : ''));
    }));
    c.appendChild(srcLine());
  }

  // ---------- ③ 選んだ国籍・地域のくわしい数
  function pickSec(c) {
    var y = +S.y, names = allNats(), n = names.indexOf(S.nat) >= 0 ? S.nat : null;
    if (!n) { var t = natT('a', y) || natT('a', natYears('a').slice(-1)[0]); n = t.rows[0][0]; }
    c.classList.add('fdetail');
    c.appendChild(el('h2', null, '選んだ国籍・地域のくわしい数'));
    var row = el('div', 'dctlrow');
    row.appendChild(sel('国籍・地域', n, names.map(function (x) { return [x, x]; }), function (x) { set({ nat: x }, ['nat', 'pick']); }));
    c.appendChild(row);
    c.appendChild(help('上の一覧で国籍・地域の名前を押しても選べます。並びは、いちばん新しい年の申請者数の多い順です。'));
    var ys = natYears('a').map(Number), Ks = ['a', 'r', 'c', 'h'];
    c.appendChild(el('h3', null, esc(n + '（' + y + '年）')));
    if (y < ys[0]) {
      c.appendChild(Z.nodata('国籍・地域別の数は' + ys[0] + '年からです。上の「対象の年」で' + ys[0] + '年より後を選んでください。'));
    } else {
      var g = el('div', 'nkpis');
      Ks.forEach(function (k) {
        var t = natT(k, y), x = natVal(k, n, y), r = natRow(k, n, y), p = natVal(k, n, y - 1);
        var sub = !t ? (k === 'c' ? '補完的保護の制度は2023年12月から' : 'この年の国籍別の数はありません') : x == null ? '上位25の外（数は分からない）' :
          (r ? rankOf(t.rows, r[1]) + '位' + (r[2] ? '・うち審査請求で認定 ' + r[2] + '人' : '') : '') + (p != null ? (r ? '\n' : '') + chg(x, p) : '');
        g.appendChild(box(WHO[k].replace('（本国情勢等）', ''), t ? x : null, sub));
      });
      c.appendChild(g);
    }
    var per = ys, series = Ks.map(function (k) { return { name: SHORT[k], vals: per.map(function (x) { return natT(k, x) ? natVal(k, n, x) : null; }), cls: CLS_N[k] }; });
    c.appendChild(el('h3', null, esc(n + 'の移り変わり（' + per[0] + '〜' + per[per.length - 1] + '年）')));
    c.appendChild(lines(per, series, n + 'の難民認定申請・認定などの数の移り変わり'));
    c.appendChild(help('「申請」は難民認定を申請した人、「難民認定」は難民と認定された人、「補完的保護」は補完的保護対象者と認定された人（2023年から）、「人道配慮（本国情勢等）」は本国の情勢などをふまえて在留を認められた人です。' +
      '数の分からない年（申請者数で上位25の外だった年など）は線が切れています。' + NOT_RATE));
    var chart = lineData(per, series, n + 'の難民認定申請・認定などの数');
    c.appendChild(tools(function () { return cur(chart, '全国｜' + n + 'の難民認定申請・認定などの数の移り変わり', '数の分からない年は線が切れています。' + NOT_RATE); }));
    c.appendChild(Z.details('表で見る', Z.tableEl(['年'].concat(Ks.map(function (k) { return SHORT[k]; })), per.slice().reverse().map(function (x) {
      return [x + '年'].concat(Ks.map(function (k) { var q = natT(k, x) ? natVal(k, n, x) : null, r = natRow(k, n, x); return q == null ? null : fmt(q) + (r && r[2] ? '（うち審査請求 ' + r[2] + '）' : ''); }));
    }), 1)));
    c.appendChild(help('「—」は数の分からない所です（表がない年、上位25の外の年）。全部の国籍・地域がのっている年に名前がないときは0人です。'));
    c.appendChild(srcLine());
  }

  // ---------- ④ 申請したときの在留資格
  function visaSec(c) {
    var y = +S.y, rows = D.visa[String(y)], ys = Object.keys(D.visa).sort();
    c.appendChild(el('h2', null, '申請したとき、どんな在留資格だった？'));
    if (!rows) {
      c.appendChild(Z.nodata('申請したときの在留資格の数は' + ys[0] + '年からです。上の「対象の年」で' + ys[0] + '年より後を選んでください。'));
      c.appendChild(srcLine()); return;
    }
    var get = function (n) { var r = rows.filter(function (q) { return q[0] === n; })[0]; return r ? r[1] : null; };
    var tot = get('総数'), ok = get('正規滞在'), ng = get('不法滞在');
    c.appendChild(el('p', 'stotal', y + '年の難民認定申請者数 <b>' + fmt(tot) + '人</b><span class="sub">（申請したとき在留資格をもっていた人 ' + fmt(ok) + '人・もっていなかった人 ' + fmt(ng) + '人）</span>'));
    var subs = rows.filter(function (q) { return q[2]; }).sort(function (a, b) { return a[0] === 'その他' ? 1 : b[0] === 'その他' ? -1 : b[1] - a[1]; });
    var items = subs.map(function (q, i) { return { name: q[0] === 'その他' ? 'その他の在留資格' : q[0], v: q[1], cls: String(i % 7 + 1), rest: q[0] === 'その他' }; });
    items.push({ name: '在留資格なし（不法滞在）', sub: '国の表のことば' + (y <= 2020 ? '（' + y + '年の表では「非正規」）' : ''), v: ng, cls: 'o' });
    c.appendChild(rankList(items, tot));
    c.appendChild(help('割合は、' + y + '年の難民認定申請者数（' + fmt(tot) + '人）に対する割合です。「短期滞在」は観光・商用・親族訪問などの短い滞在です。' +
      '「特定活動（出国準備期間）」は、在留期間が終わったあと、出国の準備のために認められた期間の在留資格です。' +
      '「特定活動（難民認定等申請者用）」（2020年までの表では「特定活動（難民認定申請中）」）は、前に難民認定などを申請した人が、その手続きの間にもつ在留資格です。' +
      '「その他の在留資格」は、ここに名前のない在留資格を合わせた数です（2021年からは、空港などで認められる特例上陸許可なども入ります）。'));
    var pie = { kind: 'pie', parts: items.map(function (x) { return { name: x.name.replace('（不法滞在）', ''), v: x.v, cls: x.cls }; }).filter(function (p) { return p.v > 0; }), total: tot,
      area: '全国', when: String(y), whenText: y + '年（1月〜12月）' };
    c.appendChild(tools(function () { return cur(pie, '全国｜' + y + '年の難民認定申請者の、申請したときの在留資格', '「在留資格なし」は国の表の「不法滞在」。'); }));
    c.appendChild(fold('visatrend', '在留資格ごとの移り変わり（' + ys[0] + '〜' + ys[ys.length - 1] + '年）', function (b) {
      var per = ys.map(Number), names = ['短期滞在', '技能実習', '留学', '特定活動（出国準備期間）', '不法滞在'];
      var series = names.map(function (n, i) { return { name: n === '不法滞在' ? '在留資格なし（不法滞在）' : n, vals: per.map(function (x) { var r = D.visa[String(x)].filter(function (q) { return q[0] === n; })[0]; return r ? r[1] : null; }), cls: i < 4 ? String(i + 1) : 'o' }; });
      b.appendChild(lines(per, series, '申請したときの在留資格ごとの難民認定申請者数'));
      b.appendChild(help('どの年の表にもある在留資格だけを線にしています。ほかの在留資格は下の表で見られます。'));
      var chart = lineData(per, series, '申請したときの在留資格ごとの難民認定申請者数');
      b.appendChild(tools(function () { return cur(chart, '全国｜難民認定申請者の、申請したときの在留資格の移り変わり', '「在留資格なし」は国の表の「不法滞在」。'); }));
      var all = []; per.forEach(function (x) { D.visa[String(x)].forEach(function (q) { if (all.indexOf(q[0]) < 0) { all.push(q[0]); } }); });
      b.appendChild(Z.details('表で見る', Z.tableEl(['在留資格'].concat(per.map(function (x) { return x + '年'; })), all.map(function (n) {
        return [n].concat(per.map(function (x) { var r = D.visa[String(x)].filter(function (q) { return q[0] === n; })[0]; return r ? fmt(r[1]) : null; }));
      }), 1)));
      b.appendChild(help('「—」は、その年の表にその在留資格の行がない所です（名前が変わったものや、その年に分けて数えていないもの）。'));
    }));
    c.appendChild(srcLine());
  }

  // ---------- ⑤ 毎年の移り変わり
  function trendSec(c) {
    var Y = D.Y, y = +S.y, from = Y.indexOf(+S.from) >= 0 ? +S.from : Y[0], to = Y.indexOf(+S.to) >= 0 ? +S.to : y;
    if (from > to) { var tmp = from; from = to; to = tmp; }
    var per = Y.filter(function (x) { return x >= from && x <= to; }), p = S.tv === 'p';
    c.appendChild(el('h2', null, '増えている？減っている？'));
    var row = el('div', 'dctlrow'), yo = Y.map(function (x) { return [String(x), x + '年']; });
    row.appendChild(sel('いつから', String(from), yo, function (x) { set({ from: x }, ['trend']); }));
    row.appendChild(sel('いつまで', String(to), yo, function (x) { set({ to: x }, ['trend']); }));
    c.appendChild(row);
    c.appendChild(views([['', '申請した人'], ['p', '認定・保護した人']], p ? 'p' : '', function (x) { set({ tv: x }, ['trend']); }));
    var series = p ? PROT.map(function (q) { return { name: q[3], vals: per.map(function (x) { return v(q[0], x); }), cls: q[2] }; }) :
      [{ name: '難民認定申請者数', vals: per.map(function (x) { return v('難民認定申請者数', x); }), cls: '5' },
        { name: '補完的保護対象者認定申請者数', vals: per.map(function (x) { return v('補完的保護対象者認定申請者数', x); }), cls: '2' }].filter(function (s) { return s.vals.some(function (x) { return x != null; }); });
    var title = p ? '難民と認定・保護した人の数の移り変わり' : '難民認定などの申請者数の移り変わり';
    c.appendChild(lines(per, series, title));
    var note = p ? '「難民と認定」は条約難民、「補完的保護」は2023年12月からの制度で補完的保護対象者と認定された人、「人道配慮」は人道的な配慮で在留を認められた人（国の表の「その他の保護」。1991年から）、' +
      '「定住難民」はインドシナ難民（1978〜2005年）と第三国定住（2010年から）で受け入れた人です。数のない年は線が切れています。' :
      '難民認定の申請者数は1982年から、補完的保護対象者の認定の申請者数は2023年（12月の制度開始）からです。前にも申請したことのある人（複数回の申請）も、申請した年の数に入っています。';
    c.appendChild(help(note + '期間は「いつから」「いつまで」で選べます。'));
    var chart = lineData(per, series, title);
    c.appendChild(tools(function () { return cur(chart, '全国｜' + title, note); }));
    c.appendChild(srcLine());
  }

  // ---------- ⑥ 審査の進み方（一次審査・審査請求）
  function procSec(c) {
    var y = +S.y, P = D.proc.PY, i = P.indexOf(y);
    c.appendChild(el('h2', null, '申請は、どう審査されている？'));
    c.appendChild(help('難民認定の申請は、まず出入国在留管理庁が審査します（一次審査）。認定されなかった人は、不服を申し立てることができます（審査請求。2016年3月までは「異議申立て」）。'));
    if (i < 0) {
      c.appendChild(Z.nodata('審査の数は' + P[0] + '年からです。上の「対象の年」で' + P[0] + '年より後を選んでください。'));
      c.appendChild(srcLine()); return;
    }
    var o = function (n) { return (D.proc.one[n] || [])[i]; }, r = function (n) { return (D.proc.rev[n] || [])[i]; }, rs = function (n) { return ((D.proc.revSub || {})[n] || [])[i]; };
    c.appendChild(el('h3', null, esc('一次審査（' + y + '年）')));
    var g = el('div', 'nkpis n3');
    g.appendChild(box('申請した人', o('申請者数'), ''));
    g.appendChild(box('審査を終えた人（処理数）', o('処理数'), 'その年より前に申請した人も入ります'));
    g.appendChild(box('年末に審査中の人（未処理数）', o('未処理数'), ''));
    c.appendChild(g);
    var pt = o('処理数'), parts = [['認定', '難民と認定', '1'], ['不認定', '認定しない', '6'], ['取下げ等', '申請の取下げなど', 'o']];
    c.appendChild(el('p', 'stotal', '審査を終えた人の内わけ（' + fmt(pt) + '人）'));
    c.appendChild(rankList(parts.map(function (q) { return { name: q[1], v: o(q[0]), cls: q[2] }; }), pt));
    c.appendChild(help('割合は、その年に審査を終えた人（' + fmt(pt) + '人）に対する割合です。' + (y >= 2023 ? '国の表の注のとおり、2023年からの「認定しない」には、難民とは認定しなかったものの補完的保護対象者と認定した人が入っています。' : '') +
      '「認定しない」とされた人の中には、人道的な配慮で在留を認められた人も入っています。'));
    var pie = { kind: 'pie', parts: parts.map(function (q) { return { name: q[1], v: o(q[0]), cls: q[2] }; }).filter(function (p) { return p.v > 0; }), total: pt, area: '全国', when: String(y), whenText: y + '年（1月〜12月）' };
    c.appendChild(tools(function () { return cur(pie, '全国｜' + y + '年の難民認定申請の一次審査の結果', 'その年に審査を終えた人の内わけ。' + (y >= 2023 ? '「認定しない」には補完的保護対象者と認定した人を含む。' : '')); }));
    c.appendChild(el('h3', null, esc('審査請求（' + y + '年）')));
    var g2 = el('div', 'nkpis n3');
    g2.appendChild(box('審査請求をした人', r('審査請求数'), ''));
    g2.appendChild(box('審査を終えた人（処理数）', r('処理数'), ''));
    g2.appendChild(box('年末に審査中の人（未処理数）', r('未処理数'), ''));
    c.appendChild(g2);
    var rt = r('処理数'), rp = [['理由あり（難民）', '理由あり（難民と認定）', '1'], ['理由あり（補完的保護対象者）', '理由あり（補完的保護対象者と認定）', '2'], ['理由なし', '理由なし', '6'], ['取下げ等', '取下げなど', 'o']];
    var ritems = rp.map(function (q) { return { name: q[1], v: r(q[0]), cls: q[2] }; }).filter(function (x) { return x.v != null; });
    c.appendChild(el('p', 'stotal', '審査を終えた人の内わけ（' + fmt(rt) + '人）'));
    c.appendChild(rankList(ritems, rt));
    var sub = rs('処理数');
    c.appendChild(help('「理由あり」は、申立てが認められた人です。' + (sub ? 'このうち' + fmt(sub) + '人は、補完的保護対象者の認定の申請に関する審査請求です。' : '') + NOT_RATE));
    c.appendChild(fold('proctrend', '審査の数の移り変わり（' + P[0] + '〜' + P[P.length - 1] + '年）', function (b) {
      var per = P;
      var s1 = [['申請者数', '申請した人', '5'], ['処理数', '審査を終えた人', '1'], ['未処理数', '年末に審査中の人', 'o']].map(function (q) { return { name: q[1], vals: D.proc.one[q[0]], cls: q[2] }; });
      b.appendChild(el('h3', null, '一次審査'));
      b.appendChild(lines(per, s1, '難民認定申請の一次審査の数の移り変わり'));
      var c1 = lineData(per, s1, '一次審査の数');
      b.appendChild(tools(function () { return cur(c1, '全国｜難民認定申請の一次審査の数の移り変わり', '「年末に審査中の人」は国の表の未処理数（年末の数）。'); }));
      var s2 = [['審査請求数', '審査請求をした人', '5'], ['処理数', '審査を終えた人', '1'], ['未処理数', '年末に審査中の人', 'o']].map(function (q) { return { name: q[1], vals: D.proc.rev[q[0]], cls: q[2] }; });
      b.appendChild(el('h3', null, '審査請求'));
      b.appendChild(lines(per, s2, '審査請求の数の移り変わり'));
      var c2 = lineData(per, s2, '審査請求の数');
      b.appendChild(tools(function () { return cur(c2, '全国｜難民認定の審査請求の数の移り変わり', '「年末に審査中の人」は国の表の未処理数（年末の数）。'); }));
      b.appendChild(Z.details('表で見る', Z.tableEl(['年', '申請者数', '処理数', 'うち認定', 'うち不認定', 'うち取下げ等', '未処理数', '審査請求数', '処理数', 'うち理由あり', 'うち理由なし', 'うち取下げ等', '未処理数'],
        per.map(function (x, j) {
          return [x + '年'].concat(['申請者数', '処理数', '認定', '不認定', '取下げ等', '未処理数'].map(function (n) { return fmt(D.proc.one[n][j]); }))
            .concat(['審査請求数', '処理数', '理由あり', '理由なし', '取下げ等', '未処理数'].map(function (n) { return fmt(D.proc.rev[n][j]); }));
        }).reverse(), 1)));
    }));
    c.appendChild(srcLine());
  }

  // ---------- ⑦ くわしい数（たたんで置く）
  function moreSec(c) {
    var Y = D.Y;
    c.appendChild(el('h2', null, 'くわしい数'));
    c.appendChild(help('毎年の数の表、国籍・地域別の表、人道配慮の数、取り込んだ発表です。見出しを押すと開きます。'));
    c.appendChild(fold('years', '毎年の数の表（' + Y[0] + '年〜' + Y[Y.length - 1] + '年）', function (b) {
      var f = function (x) { return x == null ? null : fmt(x); };
      b.appendChild(Z.tableEl(['年', '難民認定申請者数', '補完的保護の申請者数', '定住難民', '条約難民', 'うち審査請求で認定', '補完的保護対象者', 'その他の保護', '合計'],
        Y.slice().reverse().map(function (x) {
          return [x + '年（' + (D.label[String(x)] || '') + '）'].concat(['難民認定申請者数', '補完的保護対象者認定申請者数', '定住難民', '条約難民', '条約難民のうち審査請求で認定', '補完的保護対象者', 'その他の保護', '合計'].map(function (k) { return f(v(k, x)); }));
        }), 1));
      b.appendChild(help('「—」は、国の表に数のない所です（0人ではありません）。' + OVERLAP));
    }));
    c.appendChild(fold('nattable', '国籍・地域別の表（' + SHORT[ITEMS[S.nv] ? S.nv : 'a'] + '）', function (b) {
      var k = ITEMS[S.nv] ? S.nv : 'a', ys = natYears(k), names = [];
      ys.slice().reverse().forEach(function (x) { natT(k, x).rows.forEach(function (r) { if (names.indexOf(r[0]) < 0) { names.push(r[0]); } }); });
      var rows = names.map(function (n) { return [n].concat(ys.map(function (x) { var q = natVal(k, n, x); return q == null ? null : fmt(q); })); });
      if (ys.some(function (x) { return natT(k, x).other != null; })) { rows.push(['その他（上位25以外）'].concat(ys.map(function (x) { var o = natT(k, x).other; return o == null ? null : fmt(o); }))); }
      rows.push(['総数'].concat(ys.map(function (x) { return fmt(natT(k, x).tot); })));
      b.appendChild(help('上の「どの国籍・地域の人が申請・認定された？」で選んでいる項目の表です。'));
      b.appendChild(Z.tableEl(['国籍・地域'].concat(ys.map(function (x) { return x + '年'; })), rows, 1));
      b.appendChild(help('「—」は数の分からない所です（上位25の外の年）。全部の国籍・地域がのっている年に名前がないときは0人です。'));
    }));
    c.appendChild(fold('hum', '人道配慮の数と、うち本国の情勢などをふまえたもの（' + D.hum.Y[0] + '年〜）', function (b) {
      var H = D.hum;
      b.appendChild(Z.tableEl(['年', '人道配慮の数', 'うち本国の情勢などをふまえて'], H.Y.slice().reverse().map(function (x) { var j = H.Y.indexOf(x); return [x + '年', fmt(H['人道配慮数'][j]), fmt(H['うち本国情勢等'][j])]; }), 1));
      b.appendChild(help('人道配慮の数は、難民とは認定しなかったものの、人道的な配慮を理由に在留を認めた人の数です（毎年の数の表の「その他の保護」と同じ）。そのうち、本国の情勢などをふまえて認めた人の数です（ほかは、日本人と結婚しているなどの事情で認めた人）。'));
    }));
    c.appendChild(fold('syr', '（参考）シリア人留学生の受入れ（年度）', function (b) {
      var ks = Object.keys(D.syr).sort();
      b.appendChild(Z.tableEl(['年度', '人数'], ks.slice().reverse().map(function (x) { return [x + '年度', fmt(D.syr[x])]; }), 1));
      b.appendChild(help('国の表の参考の数です。シリアの危機で学ぶ機会をなくした若い人を、留学生として受け入れたものです（2017年度から）。難民の数（毎年の数の表）には入っていません。'));
    }));
    c.appendChild(fold('list', '取り込んだ発表（' + D.releases.length + '回分）', function (b) {
      var ul = el('ul', 'fdefs');
      D.releases.slice().reverse().forEach(function (r) {
        ul.appendChild(el('li', null, '<a href="' + esc(r.page) + '">' + esc(r.title) + '</a>（公表 ' + esc(r.pub.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')) + '）'));
      });
      b.appendChild(ul);
      b.appendChild(help('どの発表のどの表から読んだかは、GitHub の表（データ/難民/）の「出どころ」の列にあります。読み取った数は、内わけの合計・表どうし・発表どうしで ' + fmt(D.checks) + '件を確かめています（合わないもの ' + D.bad + '件）。'));
    }));
  }

  var box_ = document.getElementById('nanmin-view'), ctl = document.getElementById('nanmin-ctl');
  var SECS = [['total', totalSec, 'khero'], ['nat', natSec], ['pick', pickSec], ['visa', visaSec], ['trend', trendSec], ['proc', procSec], ['more', moreSec]], NODE = {};
  function upLink() { return el('p', 'kup', '<a href="#toc">↑ 上に戻る（目次）</a>'); }
  function render(only) {
    if (D.Y.indexOf(+S.y) < 0) { S.y = String(D.Y[D.Y.length - 1]); }
    writeHash();
    ctl.replaceChildren(controls());
    if (!NODE.total) {
      var out = el('div');
      SECS.forEach(function (s) { var c = el('section', 'dcard ksec' + (s[2] ? ' ' + s[2] : '')); c.id = s[0]; NODE[s[0]] = c; out.appendChild(c); });
      box_.replaceChildren(out);
    }
    SECS.forEach(function (s) {
      if (only && only.indexOf(s[0]) < 0) { return; }
      var c = NODE[s[0]]; c.replaceChildren(); c.className = 'dcard ksec' + (s[2] ? ' ' + s[2] : '');
      try { s[1](c); } catch (e) { console.error(e); c.appendChild(Z.nodata('この部分を表示できませんでした')); }
      c.appendChild(upLink());
    });
  }
  // 目次・「上に戻る」のリンクは、アドレスの # を変えずに動く（# のあとに選んだ条件が入っているので）
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a || !a.closest('.jump, .kup, #nanmin')) { return; }
    var t = document.getElementById(a.getAttribute('href').slice(1));
    if (!t) { return; }
    ev.preventDefault(); t.scrollIntoView({ block: 'start' });
  });
  var go = /^#(total|nat|pick|visa|trend|proc|more|notes)$/.exec(location.hash); // 「nanmin.html#nat」のように欄を指して来たとき
  fetch('data/nanmin.json').then(function (r) { return r.json(); }).then(function (j) {
    D = j;
    var last = D.releases[D.releases.length - 1];
    SRC = '出入国在留管理庁「' + last.title + '」など（報道発表）';
    if (!go) { readHash(); }
    render();
    if (go) { setTimeout(function () { var t = document.getElementById(go[1]); if (t) { t.scrollIntoView({ block: 'start' }); } }, 50); }
  }, function () { box_.replaceChildren(Z.nodata('データを読み込めませんでした。')); });
})();
