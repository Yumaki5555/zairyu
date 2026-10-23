/* 数でみる在留外国人：帰化の数のページ（kika.html）の、選んで見る部分
   数は data/kika.json（make_dash_data.py が データ/帰化/ から作る）。グラフの部品は dash.js、画像の保存は share.js。
   ページの順（大事なものから）：① これまでの累計 → ② 国籍別 → ③ 毎年の推移 → ④ くわしい数（申請・不許可、国籍の取得と離脱、表。たたんで置く）。
   ⑤ 出典と注意は、ページに書いてある（make_site.py）。上の「対象の年」を変えると、①〜④ がその年に合わせて変わる。
   在留外国人統計とは別の統計なので、時点の書き方（年ごと）・出典・ハッシュタグ・画像のタイトルは、ここで決めて画像（share.js）に渡す。
   発表の数は、範囲の違う3つがある。混ぜて足したり並べたりしない：
     ・毎年の合計：帰化許可者数は1952年から（1952年4月27日以前は合計だけ、1952年4月28日〜1966年はまとめた数、1967年から毎年）。申請者数は1969年から、不許可者数は1989年から
     ・国籍の3区分（韓国・朝鮮／中国／その他）：1952年4月28日から。1952年4月27日以前の333人は区分がないので、どの国籍にも入れない
     ・くわしい国籍：2019年から、毎年の上位10か国・地域だけ（2019〜2022年は、法務省のページの前の版をインターネット・アーカイブの保存版から読んだもの）。
       上位10に入らなかった年の数は分からない（0人ではない）。いくつかの年を足すときは「掲載分」と書き、順位は付けない
   ない数は「データなし」・線を切る（0人とは分ける）。申請・許可・不許可は、それぞれその年にあった数なので、許可者数÷申請者数を「許可される割合」としては出さない */
(function () {
  'use strict';
  var root = document.getElementById('kika');
  if (!root || !window.KZC) { return; }
  var K = window.KZ, Z = window.KZC, fmt = K.fmt, esc = K.esc, el = Z.el, signed = Z.signed;
  var D = null, PRE = null, AGG = null; // PRE：1952年4月27日以前（合計だけ）、AGG：1952年4月28日〜1966年（まとめた数）
  var SRC = '法務省民事局「帰化許可申請者数等の推移」', TAG = '#帰化';
  var NOTE = 'それぞれ、その年（1月〜12月）にあった数です。その年に申請した人がその年に許可・不許可になったとは限りません。';
  var ITEMS = ['帰化許可申請者数', '帰化許可者数', '帰化不許可者数'], NATS = ['韓国・朝鮮', '中国', 'その他'];
  var CLS = { '韓国・朝鮮': '4', '中国': '5', 'その他': 'o' }; // 3区分の色（どのグラフでも同じ）
  var N3 = '国籍は、法務省の毎年の表の「韓国・朝鮮」「中国」「その他」の3つです。';
  var NO10 = '上位10に入らなかった年は、数が発表されていないので線が切れます（0人ではありません）。';
  // y：対象の年、nv：② の見方（''＝その年、c3＝1952年からの累計（3区分）、c10＝2019年からの累計（掲載分））、from・to：③ の期間、
  // tv：③ の国籍別の推移（''＝3区分、d＝くわしい国籍）、np・cp：くわしい国籍の線で比べるもの（③ の推移・② の累計）
  var DEF = { y: '', nv: '', from: '', to: '', tv: '', np: [], cp: [] };
  var S = JSON.parse(JSON.stringify(DEF));
  var OPEN = {}; // たたんだ欄のうち開いているもの（選び直して描き直しても開いたまま）

  function readHash() { var q = new URLSearchParams(location.hash.slice(1)); Object.keys(S).forEach(function (k) { var v = q.get(k); if (v != null) { S[k] = Array.isArray(DEF[k]) ? v.split(',').filter(Boolean) : v; } }); }
  function writeHash() {
    var q = new URLSearchParams(); Object.keys(S).forEach(function (k) { var v = Array.isArray(DEF[k]) ? S[k].join(',') : S[k]; if (v) { q.set(k, v); } });
    history.replaceState(null, '', '#' + q.toString());
  }
  // 年を変えたときは全部、ほかはその欄（only：欄の id の並び）だけ描き直す（上の欄が描き直しで一瞬縮んで、見ている所がずれないように）
  function set(p, only) { Object.keys(p).forEach(function (k) { S[k] = p[k]; }); render('y' in p ? null : only); }
  function srcLine(extra) { return el('p', 'dsrc', esc('出典：' + SRC + (extra || '')) + ' <a href="' + esc(D.page) + '">法務省のページ</a>'); }
  function topSrc() { return srcLine('（国籍別帰化許可者数。' + D.topSaved + '年は、前の版をインターネット・アーカイブに保存された当時の PDF から）'); }
  function v(key, y) { var i = D.Y.indexOf(+y); return i >= 0 && D.s[key] ? D.s[key][i] : null; }
  function natVal(n, y) { var t = D.top[String(y)], r = t ? t.rows.filter(function (q) { return q[0] === n; })[0] : null; return r ? r[1] : null; }
  function rankOf(rows, x) { return 1 + rows.filter(function (q) { return q[1] > x; }).length; } // 同じ人数は同じ順位（法務省の2019年の表と同じ数え方）
  function topYears() { return Object.keys(D.top).sort(); }
  function cur(chart, title, note) { if (note) { chart.markNote = note; } return { title: title, autoTitle: title, chart: chart, meta: { nat: [], visa: [] }, src: SRC, tag: TAG }; }
  function tools(get) { var t = el('div', 'dtools'); if (window.KZX) { window.KZX.buttons(t, get); } return t; }
  function rate(a, b) { return a == null || !b ? '' : '（' + signed((a - b) / b * 100, 1) + '%）'; }
  function help(text) { return el('p', 'dhelp', esc(text)); }
  // 累計（1952年から end 年まで）。合計は 1952年4月27日以前＋1952年4月28日〜1966年＋毎年。3区分は 1952年4月27日以前を入れない（区分がないので）
  function cumTotal(end) { return D.Y.reduce(function (a, y) { return y <= end ? a + v('帰化許可者数', y) : a; }, PRE['帰化許可者数'] + AGG['帰化許可者数']); }
  function cum3(n, end) { return D.Y.reduce(function (a, y) { return y <= end ? a + v(n, y) : a; }, AGG[n]); }
  // 累計の線の時点：1966年（1952年からのまとめた数）、1967年〜end年
  function cumPer(end) { return [D.Y[0] - 1].concat(D.Y.filter(function (y) { return y <= end; })); }
  function cumLab(per) { return function (i) { return i ? per[i] + '年まで' : per[0] + '年まで（1952年からの合計）'; }; }

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
  // いくつか選ぶ欄（国籍・地域）。「この条件で表示」で決める
  function multi(label, all, picked, max, onOk, name) {
    name = name || function (n) { return n; };
    var ms = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel'), list = el('div', 'dmlist'), chosen = picked.slice();
    btn.type = 'button'; btn.textContent = picked.length === 1 ? name(picked[0]) : name(picked[0]) + ' ほか' + (picked.length - 1);
    ms.appendChild(el('span', 'dlab', esc(label))); ms.appendChild(btn);
    all.forEach(function (n) {
      var l = el('label', 'dmitem'), cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.indexOf(n) >= 0;
      cb.addEventListener('change', function () { if (cb.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } });
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + name(n))); list.appendChild(l);
    });
    var ok = el('button', 'dbtn', esc('この条件で表示（' + max + 'つまで）')); ok.type = 'button';
    ok.addEventListener('click', function () { onOk(all.filter(function (n) { return chosen.indexOf(n) >= 0; }).slice(0, max)); });
    panel.appendChild(list); var bar = el('div', 'dmbar'); bar.appendChild(ok); panel.appendChild(bar); ms.appendChild(panel);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); ms.classList.toggle('open'); if (ms.classList.contains('open')) { Z.fitPanel(panel); } });
    return ms;
  }
  document.addEventListener('click', function (ev) { root.querySelectorAll('.dmulti.open').forEach(function (m) { if (!m.contains(ev.target)) { m.classList.remove('open'); } }); });
  // 国籍の横棒：順位・名前・棒・人数・割合を1行に（スマホでは棒を名前の下へ）。
  // items：{rk：順位（なければ書かない）, name, sub：名前の下の小さな字, v, cls：棒の色（3区分）, rest：「その他」など国籍の分からない分（灰色）, none：区分のない分（点線）}
  function rankBars(items, total) {
    var ul = el('ul', 'krank'), mx = Math.max.apply(null, items.map(function (x) { return x.v; }).concat([1]));
    items.forEach(function (x) {
      var li = el('li', x.rest ? 'rest' : x.none ? 'none' : null);
      li.innerHTML = '<span class="rk">' + (x.rk ? x.rk + '<small>位</small>' : '') + '</span>' +
        '<span class="nm">' + esc(x.name) + (x.sub ? '<span class="sub">' + esc(x.sub) + '</span>' : '') + '</span>' +
        '<span class="track"><span class="fill' + (x.cls ? ' c' + x.cls : '') + '" style="width:' + (x.v / mx * 100).toFixed(1) + '%"></span></span>' +
        '<span class="v">' + fmt(x.v) + '<small>人</small></span><span class="p">' + (x.v / total * 100).toFixed(1) + '%</span>';
      ul.appendChild(li);
    });
    return ul;
  }
  function upDown(tw) { tw.querySelectorAll('td').forEach(function (td) { if (/^[+↑]/.test(td.textContent)) { td.classList.add('up'); } else if (/^[−↓]/.test(td.textContent)) { td.classList.add('down'); } }); return tw; }

  // ---------- 上：対象の年（変えると ①〜④ がその年に合わせて変わる）
  function controls() {
    var f = el('div', 'dfilter kctl'), latest = String(D.Y[D.Y.length - 1]);
    f.appendChild(sel('対象の年（1月〜12月）', S.y, D.Y.slice().reverse().map(function (y) { return [String(y), y + '年']; }), function (x) { set({ y: x }); }));
    f.appendChild(el('p', 'kctlhelp', 'この年までの累計と、この年の数を出します'));
    var plain = Object.keys(DEF).every(function (k) { return k === 'y' ? S.y === latest : JSON.stringify(S[k]) === JSON.stringify(DEF[k]); });
    var acts = el('div', 'dctl dacts'), reset = el('button', 'dbtn dbtn-sub', 'リセット'); reset.type = 'button'; reset.disabled = plain;
    reset.title = plain ? '選んでいる条件はありません' : '年・見方・期間などを、はじめの状態に戻します';
    reset.addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEF)); S.y = latest; render(); });
    acts.appendChild(reset); f.appendChild(acts);
    return f;
  }

  // ---------- ① これまでの累計（いちばん大事な数）
  function totalSec(c) {
    var y = +S.y, ok = v('帰化許可者数', y), prev = v('帰化許可者数', y - 1), tot = cumTotal(y), p0 = PRE['帰化許可者数'];
    c.appendChild(el('h2', null, '日本では、これまで何人が帰化した？'));
    c.appendChild(el('p', 'klab', esc('1952年〜' + y + '年に帰化を許可された人の累計')));
    c.appendChild(el('p', 'kbig', fmt(tot) + '<small>人</small>'));
    c.appendChild(help('1952年4月27日以前の' + fmt(p0) + '人を含みます（法務省の累計と同じ数え方）。'));
    var yr = el('div', 'kyear');
    yr.innerHTML = '<span class="klab">' + y + '年の帰化許可者数</span><b>' + fmt(ok) + '<small>人</small></b><span class="kch">' +
      (prev == null ? '（前の年だけの数はありません。1952年4月28日〜' + (y - 1) + '年はまとめた数です）' : '前の年から <b>' + signed(ok - prev) + '人</b>' + rate(ok, prev)) + '</span>';
    c.appendChild(yr);
    c.appendChild(el('p', 'kwarn', '過去に帰化を許可された人数を、毎年足し合わせた数です。いま生きている人や、いま日本に住んでいる人の数ではありません。'));
    // 累計の増え方（1本の線）
    var per = cumPer(y), lab = cumLab(per), acc = 0;
    var vals = per.map(function (x, i) { acc += i ? v('帰化許可者数', x) : p0 + AGG['帰化許可者数']; return acc; });
    c.appendChild(el('h3', null, '累計の増え方'));
    c.appendChild(Z.lineChart(per.map(String), [{ name: '帰化許可者数の累計', vals: vals, cls: '1' }], { title: '帰化許可者数の累計の移り変わり', at: per, lab: lab }));
    c.appendChild(help('いちばん左の点（' + per[0] + '年）は、1952年4月27日以前と、1952年4月28日〜' + per[0] + '年のまとめた数を足したものです（その間の毎年の数は発表されていません）。'));
    var chart = { kind: 'line', per: per.map(String), labels: per.map(function (x, i) { return lab(i); }), at: per, series: [{ name: '帰化許可者数の累計', vals: vals, cls: '1' }],
      index: false, area: '全国', when: String(y), from: String(per[0]), whenText: '1952年〜' + y + '年の累計',
      keys: [['1952年〜' + y + '年の累計', fmt(tot) + '人'], [y + '年の帰化許可者数', fmt(ok) + '人', prev == null ? '' : '（前の年から' + signed(ok - prev) + '人）']] };
    c.appendChild(tools(function () {
      return cur(chart, '全国｜帰化許可者数の累計', '1952年4月27日以前の' + fmt(p0) + '人を含む。' + per[0] + '年の点は1952年からのまとめた数。過去に許可された人数の合計で、いま日本に住む人の数ではありません。');
    }));
    c.appendChild(srcLine());
  }

  // ---------- ② 国籍別
  function natSec(c) {
    var y = +S.y, ys = topYears(), y0 = +ys[0], has10 = y >= y0, nv = S.nv === 'c3' ? 'c3' : S.nv === 'c10' && has10 ? 'c10' : '';
    c.appendChild(el('h2', null, 'どの国籍の人が帰化した？'));
    c.appendChild(el('p', 'dhelp', '発表されている国籍の数は2種類です。<b>3区分</b>（韓国・朝鮮／中国／その他）は1952年から毎年、<b>くわしい国籍</b>（毎年の上位10か国・地域）は' + y0 + '年からです。'));
    var opts = [['', y + '年の国籍' + (has10 ? '（上位10）' : '（3区分）')], ['c3', '1952〜' + y + '年の累計（3区分）']];
    if (has10) { opts.push(['c10', y0 + '〜' + y + '年の累計（上位10の掲載分）']); }
    c.appendChild(views(opts, nv, function (x) { set({ nv: x }, ['nat']); }));
    if (nv === 'c3') { natCum3(c, y); } else if (nv === 'c10') { natCum10(c, y); } else if (has10) { natYear10(c, y); } else { natYear3(c, y, y0); }
  }
  // その年の上位10（2019年から）
  function natYear10(c, y) {
    var t = D.top[String(y)], prev = D.top[String(y - 1)];
    c.appendChild(el('h3', null, esc(y + '年の帰化許可者の国籍・地域（上位10）')));
    c.appendChild(el('p', 'stotal', y + '年の帰化許可者数 <b>' + fmt(t.total) + '人</b>'));
    c.appendChild(rankBars(t.rows.map(function (r) { return { rk: rankOf(t.rows, r[1]), name: r[0], v: r[1] }; })
      .concat([{ name: 'その他', sub: '上位10以外の国籍・地域の合計', v: t.other, rest: true }]), t.total));
    c.appendChild(help('割合は、' + y + '年の帰化許可者数（' + fmt(t.total) + '人）に対する割合です。発表は上位10か国・地域だけで、ほかは「その他」にまとめられています。'));
    var chart = { kind: 'rank', rows: t.rows.map(function (r) { return [r[0], r[1]]; }), ranks: t.rows.map(function (r) { return rankOf(t.rows, r[1]); }), f: function (x) { return fmt(x) + '人'; },
      metric: '人数', area: '全国', when: String(y), what: '全国の国籍・地域', whenText: y + '年（1月〜12月）' };
    c.appendChild(tools(function () {
      return cur(chart, '全国｜帰化許可者の国籍・地域別人数（上位10）', '上位10か国・地域。ほかの国籍・地域（その他）は合わせて' + fmt(t.other) + '人。' +
        (y <= +D.topSaved.slice(-4) ? y + '年は法務省のページの前の版（インターネット・アーカイブの保存版）から。' : ''));
    }));
    c.appendChild(fold('cmp', y + '年の表（前の年との比べ・順位の動き）', function (b) {
      var rows = t.rows.map(function (r) {
        var k = rankOf(t.rows, r[1]), p = prev ? prev.rows.filter(function (q) { return q[0] === r[0]; })[0] : null, pr = p ? rankOf(prev.rows, p[1]) : 0;
        return [k + '位', r[0], fmt(r[1]), p ? signed(r[1] - p[1]) : null, !prev ? null : !p ? '前年は10位外' : pr === k ? '→' : pr > k ? '↑' + (pr - k) : '↓' + (k - pr)];
      });
      rows.push(['', 'その他（上位10以外）', fmt(t.other), null, null]);
      b.appendChild(upDown(Z.tableEl(['順位', '国籍・地域', '人数', '前の年から', '順位の動き'], rows, 2)));
      b.appendChild(help(prev ? '「前年は10位外」は、前の年の上位10に入っていない（前の年の数が発表されていない）ものです。「その他」は年ごとに中身が違うので、比べていません。' :
        '前の年（' + (y - 1) + '年）の国籍・地域別の数はないので、比べられません。'));
    }));
    c.appendChild(topSrc());
  }
  // その年の3区分（2018年まで。くわしい国籍の発表はない）
  function natYear3(c, y, y0) {
    var ok = v('帰化許可者数', y), parts = NATS.map(function (n) { return { name: n, v: v(n, y), cls: CLS[n] }; });
    c.appendChild(el('h3', null, esc(y + '年の帰化許可者の国籍（3区分）')));
    c.appendChild(el('p', 'stotal', y + '年の帰化許可者数 <b>' + fmt(ok) + '人</b>'));
    c.appendChild(rankBars(parts.map(function (p) { return { name: p.name, sub: p.name === 'その他' ? '韓国・朝鮮と中国のほかの国籍' : '', v: p.v, cls: p.cls }; }), ok));
    c.appendChild(help((y0 - 1) + '年までは、国籍が「韓国・朝鮮」「中国」「その他」の3つの区分でだけ発表されています（くわしい国籍は' + y0 + '年から）。割合は、' + y + '年の帰化許可者数に対する割合です。'));
    var chart = { kind: 'pie', parts: parts.filter(function (p) { return p.v > 0; }), total: ok, area: '全国', when: String(y), whenText: y + '年（1月〜12月）' };
    c.appendChild(tools(function () { return cur(chart, '全国｜帰化許可者の国籍別構成', N3); }));
    c.appendChild(srcLine());
  }
  // 1952年から選んだ年までの累計（3区分）。1952年4月27日以前の333人は区分がないので、別の行にする（どの国籍にも入れない）
  function natCum3(c, y) {
    var tot = cumTotal(y), p0 = PRE['帰化許可者数'], parts = NATS.map(function (n) { return { name: n, v: cum3(n, y), cls: CLS[n] }; });
    var sum3 = parts.reduce(function (a, p) { return a + p.v; }, 0);
    c.appendChild(el('h3', null, esc('1952〜' + y + '年の帰化許可者の累計（3区分）')));
    c.appendChild(el('p', 'stotal', '1952年〜' + y + '年の累計 <b>' + fmt(tot) + '人</b>'));
    c.appendChild(rankBars(parts.map(function (p) { return { name: p.name, sub: p.name === 'その他' ? '韓国・朝鮮と中国のほかの国籍' : '', v: p.v, cls: p.cls }; })
      .concat([{ name: '区分なし', sub: '1952年4月27日以前（国籍の区分が発表されていない）', v: p0, none: true }]), tot));
    c.appendChild(help('割合は、累計（' + fmt(tot) + '人）に対する割合です。1952年4月27日以前の' + fmt(p0) + '人は、発表の表に国籍の区分がないので、どの国籍にも入れていません。' +
      'ネパール・ブラジルなどのくわしい国籍は' + topYears()[0] + '年からしか発表されていないので、1952年からの累計は3つの区分でだけ出せます。'));
    var whenText = '1952年〜' + y + '年の累計', pie = { kind: 'pie', parts: parts, total: sum3, area: '全国', when: String(y), whenText: whenText };
    c.appendChild(tools(function () { return cur(pie, '全国｜帰化許可者の国籍別累計の構成', N3 + '国籍の区分のない1952年4月27日以前の' + fmt(p0) + '人は入れていません（累計は' + fmt(tot) + '人）。'); }));
    c.appendChild(fold('c3line', '累計の増え方を国籍別に見る（折れ線）', function (b) {
      var per = cumPer(y), lab = cumLab(per);
      var series = NATS.map(function (n) { var acc = 0; return { name: n, vals: per.map(function (x, i) { acc += i ? v(n, x) : AGG[n]; return acc; }), cls: CLS[n] }; });
      b.appendChild(Z.lineChart(per.map(String), series, { title: '帰化許可者数の国籍別の累計', at: per, lab: lab }));
      b.appendChild(help('いちばん左の点（' + per[0] + '年）は、1952年4月28日〜' + per[0] + '年のまとめた数です。区分のない1952年4月27日以前の' + fmt(p0) + '人は入れていません。'));
      var chart = { kind: 'line', per: per.map(String), labels: per.map(function (x, i) { return lab(i); }), at: per, series: series, index: false, area: '全国', when: String(y), from: String(per[0]), whenText: whenText };
      b.appendChild(tools(function () { return cur(chart, '全国｜帰化許可者の国籍別累計の移り変わり', N3 + per[0] + '年の点は1952年4月28日からのまとめた数。区分のない1952年4月27日以前の' + fmt(p0) + '人は入れていません。'); }));
      b.appendChild(Z.details('累計を表で見る', Z.tableEl(['年', '韓国・朝鮮', '中国', 'その他'], per.map(function (x, i) { return [lab(i)].concat(series.map(function (s) { return fmt(s.vals[i]); })); }).reverse(), 1)));
    }));
    c.appendChild(srcLine());
  }
  // 2019年から選んだ年までの、くわしい国籍の累計（各年の上位10にのった人数だけを足した「掲載分」）。順位は付けない
  function natCum10(c, y) {
    var ys = topYears().filter(function (x) { return +x <= y; }), span = ys.length === 1 ? ys[0] + '年' : ys[0] + '〜' + ys[ys.length - 1] + '年';
    var names = [].concat.apply([], ys.map(function (x) { return D.top[x].rows.map(function (r) { return r[0]; }); })).filter(function (n, i, a) { return a.indexOf(n) === i; });
    var known = function (n) { return ys.filter(function (x) { return natVal(n, x) != null; }); };
    var mark = function (n) { return known(n).length < ys.length ? n + '※' : n; };
    var tots = names.map(function (n) { return [n, known(n).reduce(function (a, x) { return a + natVal(n, x); }, 0)]; }).sort(function (a, b) { return b[1] - a[1]; });
    var all = ys.reduce(function (a, x) { return a + D.top[x].total; }, 0), rest = ys.reduce(function (a, x) { return a + D.top[x].other; }, 0);
    var listed = tots.reduce(function (a, r) { return a + r[1]; }, 0), anyMark = tots.some(function (r) { return known(r[0]).length < ys.length; });
    c.appendChild(el('h3', null, esc(span + 'の国籍・地域別の累計（上位10の掲載分）')));
    c.appendChild(el('div', 'kbox', '<b>各年の上位10にのった人数だけを足した数（掲載分）です。</b>法務省の発表は、毎年の上位10か国・地域だけです。' +
      '上位10に入らなかった年の人数は分からないので、足していません。' + (anyMark ? '<b>※</b>の国籍・地域は上位10に入らなかった年があり、実際の累計はこれより多くなります。' : '') +
      '足した数なので順位は付けていません。'));
    c.appendChild(el('p', 'stotal', esc(span + 'の帰化許可者数') + ' <b>' + fmt(all) + '人</b><span class="sub">（国籍・地域の分かる掲載分 ' + fmt(listed) + '人＋上位10以外 ' + fmt(rest) + '人）</span>'));
    c.appendChild(rankBars(tots.map(function (r) { var k = known(r[0]); return { name: mark(r[0]), sub: k.length < ys.length ? k.length + '年分（' + k.join('・') + '年）' : '', v: r[1] }; })
      .concat([{ name: '上位10以外', sub: '各年の「その他」の合計（国籍・地域は分からない）', v: rest, rest: true }]), all));
    c.appendChild(help('割合は、' + span + 'の帰化許可者数（' + fmt(all) + '人）に対する割合です。'));
    var whenText = span + 'の累計（各年の上位10の掲載分）', NOTE3 = '各年の上位10にのった人数だけを足した数（掲載分）。' + (anyMark ? '※は上位10に入らなかった年があり、実際はもっと多い。' : '') +
      '上位10以外の計' + fmt(rest) + '人は国籍が分からないので入れていません。';
    var rank = { kind: 'rank', rows: tots.slice(0, 10).map(function (r) { return [mark(r[0]), r[1]]; }), noRank: true, f: function (x) { return fmt(x) + '人'; }, metric: '人数', area: '全国', when: String(y),
      what: '全国の国籍・地域', whenText: whenText };
    c.appendChild(tools(function () { return cur(rank, '全国｜帰化許可者の国籍・地域別累計（掲載分）', NOTE3); }));
    if (ys.length > 1) {
      c.appendChild(fold('c10line', '累計の増え方を国籍・地域別に見る（折れ線）', function (b) {
        var pick = S.cp.filter(function (n) { return names.indexOf(n) >= 0; });
        if (!pick.length) { pick = tots.map(function (r) { return r[0]; }).filter(function (n) { return n !== '韓国・朝鮮' && n !== '中国'; }).slice(0, 7); }
        var series = pick.map(function (n, k) {
          var acc = 0;
          return { name: mark(n), vals: ys.map(function (x) { var q = natVal(n, x); if (q == null) { return null; } acc += q; return acc; }), cls: k < 7 ? String(k + 1) : 'o' };
        });
        var row = el('div', 'dctlrow'); row.appendChild(multi('比べる国籍・地域', tots.map(function (r) { return r[0]; }), pick, 7, function (x) { set({ cp: x }, ['nat']); }, mark)); b.appendChild(row);
        b.appendChild(help('はじめは、韓国・朝鮮と中国を除いて出しています（人数の桁が違うため。「比べる国籍・地域」で足せます）。' + NO10));
        var nys = ys.map(Number);
        b.appendChild(Z.lineChart(ys, series, { title: '国籍・地域ごとの帰化許可者数の累計（掲載分）', at: nys, lab: function (i) { return ys[i] + '年まで'; } }));
        var chart = { kind: 'line', per: ys, labels: ys.map(function (x) { return x + '年まで'; }), at: nys, series: series, index: false, area: '全国', when: ys[ys.length - 1], from: ys[0], whenText: whenText };
        b.appendChild(tools(function () { return cur(chart, pick.length === 1 ? '全国｜' + pick[0] + 'の帰化許可者数の累計（掲載分）' : '全国｜帰化許可者の国籍・地域別累計の移り変わり（掲載分）', NOTE3 + '上位10に入らなかった年は線が切れています。'); }));
        b.appendChild(Z.details('累計の移り変わりを表で見る', Z.tableEl(['年'].concat(series.map(function (s) { return s.name; })), ys.map(function (x, k) {
          return [x + '年まで'].concat(series.map(function (s) { return s.vals[k] == null ? null : fmt(s.vals[k]); }));
        }), 1)));
      }));
    }
    c.appendChild(topSrc());
  }

  // ---------- ③ 毎年の推移
  function trendSec(c) {
    var Y = D.Y, y = +S.y, from = Y.indexOf(+S.from) >= 0 ? +S.from : Y[0], to = Y.indexOf(+S.to) >= 0 ? +S.to : y;
    if (from > to) { var tmp = from; from = to; to = tmp; }
    var sub = Y.filter(function (x) { return x >= from && x <= to; }), whenText = from + '年〜' + to + '年（毎年1月〜12月）';
    c.appendChild(el('h2', null, '毎年、何人が帰化している？'));
    var row = el('div', 'dctlrow'), yo = Y.map(function (x) { return [String(x), x + '年']; });
    row.appendChild(sel('いつから', String(from), yo, function (x) { set({ from: x }, ['trend']); }));
    row.appendChild(sel('いつまで', String(to), yo, function (x) { set({ to: x }, ['trend']); }));
    c.appendChild(row);
    var series = [{ name: '帰化許可者数', vals: sub.map(function (x) { return v('帰化許可者数', x); }), cls: '2' }];
    c.appendChild(Z.lineChart(sub.map(String), series, { title: '帰化許可者数の移り変わり', at: sub, lab: function (i) { return sub[i] + '年'; } }));
    c.appendChild(help('その年（1月〜12月）に帰化を許可された人数です。1952年4月28日〜' + (Y[0] - 1) + '年は' + (Y[0] - 1952) + '年分をまとめた数（' + fmt(AGG['帰化許可者数']) + '人）しかないので、線は' + Y[0] + '年からです。'));
    var chart = { kind: 'line', per: sub.map(String), labels: sub.map(function (x) { return x + '年'; }), at: sub, series: series, index: false, area: '全国', when: String(to), from: String(from), whenText: whenText };
    c.appendChild(tools(function () { return cur(chart, '全国｜帰化許可者数の移り変わり', 'その年（1月〜12月）に帰化を許可された人数です。'); }));
    c.appendChild(fold('nattrend', '国籍別の推移を見る', function (b) {
      var ys = topYears(), d = S.tv === 'd';
      b.appendChild(views([['', '3区分（' + Y[0] + '年から）'], ['d', 'くわしい国籍（' + ys[0] + '年から）']], d ? 'd' : '', function (x) { set({ tv: x }, ['trend']); }));
      if (!d) {
        var s3 = NATS.map(function (n) { return { name: n, vals: sub.map(function (x) { return v(n, x); }), cls: CLS[n] }; });
        b.appendChild(help(N3 + '期間は上の「いつから」「いつまで」で選べます。'));
        b.appendChild(Z.lineChart(sub.map(String), s3, { title: '国籍別の帰化許可者数の移り変わり', at: sub, lab: function (i) { return sub[i] + '年'; } }));
        var c3 = { kind: 'line', per: sub.map(String), labels: sub.map(function (x) { return x + '年'; }), at: sub, series: s3, index: false, area: '全国', when: String(to), from: String(from), whenText: whenText };
        b.appendChild(tools(function () { return cur(c3, '全国｜帰化許可者の国籍別の移り変わり', N3); }));
        return;
      }
      var yd = ys.filter(function (x) { return +x >= from && +x <= to; });
      if (yd.length < 2) { b.appendChild(Z.nodata('くわしい国籍は' + ys[0] + '年からです。上の期間に' + ys[0] + '年より後を2年以上入れてください。')); return; }
      var all = [].concat.apply([], ys.slice().reverse().map(function (x) { return D.top[x].rows.map(function (r) { return r[0]; }); })).filter(function (n, i, a) { return a.indexOf(n) === i; });
      var pick = S.np.filter(function (n) { return all.indexOf(n) >= 0; });
      if (!pick.length) { pick = D.top[yd[yd.length - 1]].rows.map(function (r) { return r[0]; }).filter(function (n) { return n !== '韓国・朝鮮' && n !== '中国'; }).slice(0, 7); }
      var sd = pick.map(function (n, k) { return { name: n, vals: yd.map(function (x) { return natVal(n, x); }), cls: k < 7 ? String(k + 1) : 'o' }; });
      var r2 = el('div', 'dctlrow'); r2.appendChild(multi('比べる国籍・地域', all, pick, 7, function (x) { set({ np: x }, ['trend']); })); b.appendChild(r2);
      b.appendChild(help('毎年の上位10か国・地域の数です。' + NO10 + 'はじめは、韓国・朝鮮と中国を除いて出しています（人数の桁が違うため。「比べる国籍・地域」で足せます）。'));
      var nys = yd.map(Number);
      b.appendChild(Z.lineChart(yd, sd, { title: '国籍・地域ごとの帰化許可者数の移り変わり', at: nys, lab: function (i) { return yd[i] + '年'; } }));
      var cd = { kind: 'line', per: yd, labels: yd.map(function (x) { return x + '年'; }), at: nys, series: sd, index: false, area: '全国', when: yd[yd.length - 1], from: yd[0], whenText: yd[0] + '年〜' + yd[yd.length - 1] + '年（毎年1月〜12月）' };
      b.appendChild(tools(function () { return cur(cd, pick.length === 1 ? '全国｜' + pick[0] + 'の帰化許可者数の移り変わり' : '全国｜帰化許可者の国籍・地域別の移り変わり', NO10); }));
      b.appendChild(Z.details('グラフの数を表で見る', Z.tableEl(['年'].concat(pick), yd.map(function (x, i) { return [x + '年'].concat(sd.map(function (s) { return s.vals[i] == null ? null : fmt(s.vals[i]); })); }), 1)));
    }));
    c.appendChild(srcLine());
  }

  // ---------- ④ くわしい数（たたんで置く）
  function moreSec(c) {
    var y = +S.y, Y = D.Y, latest = Y[Y.length - 1];
    c.appendChild(el('h2', null, 'くわしい数'));
    c.appendChild(help('申請・不許可の数、届け出による国籍の取得と離脱、毎年の表です。見出しを押すと開きます。'));
    c.appendChild(fold('apply', '申請・許可・不許可の数（' + y + '年と移り変わり）', function (b) {
      var short = { '帰化許可申請者数': '申請者数', '帰化許可者数': '許可者数', '帰化不許可者数': '不許可者数' };
      var rows = ITEMS.map(function (k) { // 増減と増減率は2行に（スマホで横にずらさずに入るよう）
        var a = v(k, y), p = v(k, y - 1), t = v(k, y - 10);
        return [short[k], a == null ? null : fmt(a), a == null || p == null ? null : signed(a - p) + '\n' + rate(a, p), a == null || t == null ? null : signed(a - t) + '\n' + rate(a, t)];
      });
      var tw = upDown(Z.tableEl(['', y + '年', '前の年から', '10年前から'], rows, 1)); tw.classList.add('kwrap'); b.appendChild(tw);
      b.appendChild(help('10年前は' + (y - 10) + '年です。'));
      b.appendChild(help(NOTE + 'そのため、許可者数÷申請者数は「許可される割合」にはなりません。申請者数は1969年から、不許可者数は1989年からの数です（それより前は「—」、線もありません）。'));
      var sub = Y.filter(function (x) { return x <= y; });
      var series = ITEMS.map(function (k, i) { return { name: k, vals: sub.map(function (x) { return v(k, x); }), cls: String(i + 1) }; });
      b.appendChild(el('h3', null, esc('申請・許可・不許可の移り変わり（' + sub[0] + '〜' + y + '年）')));
      b.appendChild(Z.lineChart(sub.map(String), series, { title: '帰化の申請・許可・不許可の数の移り変わり', at: sub, lab: function (i) { return sub[i] + '年'; } }));
      var chart = { kind: 'line', per: sub.map(String), labels: sub.map(function (x) { return x + '年'; }), at: sub, series: series, index: false, area: '全国', when: String(y), from: String(sub[0]),
        whenText: sub[0] + '年〜' + y + '年（毎年1月〜12月）' };
      b.appendChild(tools(function () { return cur(chart, '全国｜帰化の申請・許可・不許可の人数の移り変わり', NOTE + '申請者数は1969年から、不許可者数は1989年から。'); }));
    }));
    c.appendChild(fold('acq', '国籍の取得（届け出）と離脱の数（帰化とは別）', function (b) {
      var a = D.acq;
      b.appendChild(help('帰化とは別の数です。国籍取得者数は、国籍法第3条・第17条などにもとづいて、届け出で日本の国籍を取った人の数です。国籍離脱者数は、国籍法第13条にもとづいて日本の国籍をはなれた人の数です。最近の10年分が発表されています。'));
      var series = [{ name: '国籍取得者数', vals: a['国籍取得者数'], cls: '1' }, { name: '国籍離脱者数', vals: a['国籍離脱者数'], cls: '2' }];
      b.appendChild(Z.lineChart(a.Y.map(String), series, { title: '国籍の取得と離脱の移り変わり', at: a.Y, lab: function (i) { return a.Y[i] + '年'; } }));
      var chart = { kind: 'line', per: a.Y.map(String), labels: a.Y.map(function (x) { return x + '年'; }), at: a.Y, series: series, index: false, area: '全国',
        when: String(a.Y[a.Y.length - 1]), from: String(a.Y[0]), whenText: a.Y[0] + '年〜' + a.Y[a.Y.length - 1] + '年（毎年1月〜12月）' };
      b.appendChild(tools(function () { return cur(chart, '全国｜国籍取得者数・国籍離脱者数の移り変わり', '国籍取得者数は届け出で日本の国籍を取った人（帰化とは別）、国籍離脱者数は日本の国籍をはなれた人の数です。'); }));
      b.appendChild(Z.details('表で見る', Z.tableEl(['年', '国籍取得者数', '国籍離脱者数'], a.Y.slice().reverse().map(function (x) { var j = a.Y.indexOf(x); return [x + '年', fmt(a['国籍取得者数'][j]), fmt(a['国籍離脱者数'][j])]; }), 1)));
    }));
    c.appendChild(fold('years', '毎年の数の表（1952年〜' + latest + '年）', function (b) {
      var f = function (x) { return x == null ? null : fmt(x); }, newest = Y.slice().reverse(), aggs = D.agg.slice().reverse();
      b.appendChild(el('h3', null, '申請・許可・不許可'));
      b.appendChild(Z.tableEl(['年', '申請者数', '許可者数', '不許可者数'], newest.map(function (x) { return [x + '年'].concat(ITEMS.map(function (k) { return f(v(k, x)); })); })
        .concat(aggs.map(function (g) { return [g.label].concat(ITEMS.map(function (k) { return f(g[k]); })); })), 1));
      b.appendChild(el('h3', null, '帰化許可者の国籍（3区分）'));
      b.appendChild(Z.tableEl(['年', '許可者数', '韓国・朝鮮', '中国', 'その他'], newest.map(function (x) { return [x + '年', f(v('帰化許可者数', x))].concat(NATS.map(function (n) { return f(v(n, x)); })); })
        .concat(aggs.map(function (g) { return [g.label, f(g['帰化許可者数'])].concat(NATS.map(function (n) { return f(g[n]); })); })), 1));
      b.appendChild(help('「—」は、発表の表に数がない所です（0人ではありません）。1952年4月27日以前は合計だけで、国籍の区分はありません。'));
    }));
    c.appendChild(fold('tops', '国籍・地域別の上位10の表（' + topYears()[0] + '〜' + topYears().slice(-1)[0] + '年）', function (b) {
      var ys = topYears(), names = [].concat.apply([], ys.slice().reverse().map(function (x) { return D.top[x].rows.map(function (r) { return r[0]; }); })).filter(function (n, i, a) { return a.indexOf(n) === i; });
      var rows = names.map(function (n) { return [n].concat(ys.map(function (x) { var q = natVal(n, x); return q == null ? null : fmt(q); })); });
      rows.push(['その他（上位10以外）'].concat(ys.map(function (x) { return fmt(D.top[x].other); })));
      rows.push(['帰化許可者数'].concat(ys.map(function (x) { return fmt(D.top[x].total); })));
      b.appendChild(Z.tableEl(['国籍・地域'].concat(ys.map(function (x) { return x + '年'; })), rows, 1));
      b.appendChild(help('「—」は、その年の上位10に入っていない（数が発表されていない）所です。0人ではありません。「その他」は年ごとに中身（どの国籍・地域が入るか）が違います。'));
      b.appendChild(topSrc());
    }));
  }

  var box = document.getElementById('kika-view'), ctl = document.getElementById('kika-ctl');
  var SECS = [['total', totalSec, 'khero'], ['nat', natSec], ['trend', trendSec], ['more', moreSec]], NODE = {};
  function upLink() { return el('p', 'kup', '<a href="#toc">↑ 上に戻る（目次）</a>'); }
  function render(only) {
    if (D.Y.indexOf(+S.y) < 0) { S.y = String(D.Y[D.Y.length - 1]); }
    writeHash();
    ctl.replaceChildren(controls());
    if (!NODE.total) {
      var out = el('div');
      SECS.forEach(function (s) { var c = el('section', 'dcard ksec' + (s[2] ? ' ' + s[2] : '')); c.id = s[0]; NODE[s[0]] = c; out.appendChild(c); });
      box.replaceChildren(out);
    }
    SECS.forEach(function (s) {
      if (only && only.indexOf(s[0]) < 0) { return; }
      var c = NODE[s[0]]; c.replaceChildren();
      try { s[1](c); } catch (e) { console.error(e); c.appendChild(Z.nodata('この部分を表示できませんでした')); }
      c.appendChild(upLink());
    });
  }
  // 目次・「上に戻る」のリンクは、アドレスの # を変えずに動く（# のあとに選んだ条件が入っているので）
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a || !a.closest('.jump, .kup, #kika')) { return; }
    var t = document.getElementById(a.getAttribute('href').slice(1));
    if (!t) { return; }
    ev.preventDefault(); t.scrollIntoView({ block: 'start' });
  });
  var go = /^#(total|nat|trend|more|notes)$/.exec(location.hash); // 「kika.html#nat」のように欄を指して来たとき
  fetch('data/kika.json').then(function (r) { return r.json(); }).then(function (j) {
    D = j; PRE = D.agg.filter(function (a) { return a.key === '-1952'; })[0]; AGG = D.agg.filter(function (a) { return a.key === '1952-1966'; })[0];
    if (!go) { readHash(); }
    if (S.tv || S.np.length) { OPEN.nattrend = true; } // 送られたアドレスで選んであれば、たたんだ欄を開いておく
    if (S.cp.length) { OPEN.c10line = true; }
    render();
    if (go) { setTimeout(function () { var t = document.getElementById(go[1]); if (t) { t.scrollIntoView({ block: 'start' }); } }, 50); }
  }, function () { box.replaceChildren(Z.nodata('データを読み込めませんでした。')); });
})();
