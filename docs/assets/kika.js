/* 数でみる在留外国人：帰化の数のページ（kika.html）の、選んで見る部分（ダッシュボード）
   数は data/kika.json（make_dash_data.py が データ/帰化/ から作る）。半期速報のページ（sokuho.js）・不法残留（fuho.js）と同じ部品・同じ見た目。
   在留外国人統計とは別の統計なので、時点の書き方（年ごと）・出典・ハッシュタグ・画像のタイトルは、ここで決めて画像（share.js）に渡す。
   申請者数は1969年から、不許可者数は1989年から。ない年は「データなし」（0人とは分ける）。
   申請・許可・不許可は、それぞれその年にあった数なので、許可者数÷申請者数を「許可される割合」としては出さない */
(function () {
  'use strict';
  var root = document.getElementById('kika');
  if (!root || !window.KZC) { return; }
  var K = window.KZ, Z = window.KZC, fmt = K.fmt, esc = K.esc, el = Z.el, signed = Z.signed;
  var D = null;
  var SRC = '法務省民事局「帰化許可申請者数等の推移」', TAG = '#帰化';
  var NOTE = 'それぞれ、その年（1月〜12月）にあった数です。その年に申請した人がその年に許可・不許可になったとは限りません。';
  var ITEMS = ['帰化許可申請者数', '帰化許可者数', '帰化不許可者数'], NATS = ['韓国・朝鮮', '中国', 'その他'];
  var NAME = { '韓国・朝鮮': '帰化許可者のうち韓国・朝鮮', '中国': '帰化許可者のうち中国', 'その他': '帰化許可者のうちその他' };
  var DEF = { y: '', pick: [], from: '', to: '', idx: '', cs: '', np: [] }; // cs：累計の数え始めの年（空＝1952年の記録の始めから）
  var S = JSON.parse(JSON.stringify(DEF));

  function readHash() { var q = new URLSearchParams(location.hash.slice(1)); Object.keys(S).forEach(function (k) { var v = q.get(k); if (v != null) { S[k] = k === 'pick' || k === 'np' ? v.split(',').filter(Boolean) : v; } }); }
  function writeHash() {
    var q = new URLSearchParams(); Object.keys(S).forEach(function (k) { var v = k === 'pick' || k === 'np' ? S[k].join(',') : S[k]; if (v) { q.set(k, v); } });
    history.replaceState(null, '', '#' + q.toString());
  }
  function set(p) { Object.keys(p).forEach(function (k) { S[k] = p[k]; }); render(); }
  function card(id, title) { var c = el('section', 'dcard'); c.id = id; c.appendChild(el('h2', null, esc(title))); return c; }
  function srcLine(extra) { return el('p', 'dsrc', esc('出典：' + SRC + (extra || '')) + ' <a href="' + esc(D.page) + '">法務省のページ</a>'); }
  function v(key, y) { var i = D.Y.indexOf(y); return i >= 0 && D.s[key] ? D.s[key][i] : null; }
  function cur(chart, title, note) { if (note) { chart.markNote = note; } return { title: title, autoTitle: title, chart: chart, meta: { nat: [], visa: [] }, src: SRC, tag: TAG }; }
  function tools(get) { var t = el('div', 'dtools'); if (window.KZX) { window.KZX.buttons(t, get); } return t; }
  function diff(a, b) { return a == null || b == null ? null : signed(a - b); }
  function rate(a, b) { return a == null || !b ? null : signed((a - b) / b * 100, 1) + '%'; }

  function controls() {
    var f = el('div', 'dfilter');
    var sel = el('select'); D.Y.slice().reverse().forEach(function (y) { var o = el('option'); o.value = y; o.textContent = y + '年'; sel.appendChild(o); });
    sel.value = S.y; sel.addEventListener('change', function () { set({ y: sel.value }); });
    var t2 = el('label', 'dctl'); t2.appendChild(el('span', 'dlab', '年（1月〜12月）')); t2.appendChild(sel); f.appendChild(t2);
    var latest = String(D.Y[D.Y.length - 1]), plain = Object.keys(DEF).every(function (k) { return k === 'y' ? S.y === latest : JSON.stringify(S[k]) === JSON.stringify(DEF[k]); });
    var acts = el('div', 'dctl dacts'), reset = el('button', 'dbtn dbtn-sub', 'リセット'); reset.type = 'button'; reset.disabled = plain;
    reset.title = plain ? '選んでいる条件はありません' : '年・比べるものなどを、はじめの状態に戻します';
    reset.addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEF)); S.y = latest; render(); });
    acts.appendChild(reset); f.appendChild(acts);
    return f;
  }
  function nowLine() { return el('p', 'dnow', '表示中：年 <b>' + esc(S.y) + '年</b>（1月〜12月の人数）'); }

  // ① その年の数（申請・許可・不許可と、許可者の国籍）
  function yearCard() {
    var y = +S.y, c = card('year', y + '年の帰化の数');
    var rows = ITEMS.concat(NATS).map(function (k) {
      var a = v(k, y), p = v(k, y - 1), t = v(k, y - 10);
      return [NAME[k] || k, a == null ? null : fmt(a), diff(a, p), rate(a, p), diff(a, t), rate(a, t)];
    });
    var tw = Z.tableEl(['', y + '年', '前の年から', '増減率', '10年前（' + (y - 10) + '年）から', '増減率'], rows, 1);
    tw.querySelectorAll('td').forEach(function (td) { if (/^\+/.test(td.textContent)) { td.classList.add('up'); } else if (/^−/.test(td.textContent)) { td.classList.add('down'); } });
    c.appendChild(tw);
    c.appendChild(el('p', 'dhelp', esc(NOTE + 'そのため、許可者数÷申請者数は「許可される割合」にはなりません。申請者数は1969年から、不許可者数は1989年からの数です（それより前は「—」）。')));
    // 色は移り変わりの線と同じ（韓国・朝鮮＝4、中国＝5、その他＝灰色）
    var ok = v('帰化許可者数', y), parts = NATS.map(function (n, k) { return { name: n, v: v(n, y), cls: n === 'その他' ? 'o' : String(ITEMS.length + k + 1) }; }).filter(function (p) { return p.v > 0; });
    c.appendChild(el('h3', null, esc(y + '年の帰化許可者の国籍')));
    c.appendChild(el('p', 'dhelp', '毎年の数の表は、国籍を「韓国・朝鮮」「中国」「その他」の3つに分けています。'));
    c.appendChild(Z.pieChart(parts, ok, y + '年の帰化許可者の国籍'));
    c.appendChild(srcLine());
    var chart = { kind: 'pie', parts: parts, total: ok, area: '全国', when: String(y), whenText: y + '年' };
    c.appendChild(tools(function () { return cur(chart, '全国｜帰化許可者の国籍別構成', '国籍は、法務省の表の「韓国・朝鮮」「中国」「その他」の3つです。'); }));
    return c;
  }

  // ② 移り変わり（比べるものと期間を選ぶ）
  function lineCard() {
    var all = ITEMS.concat(NATS), pick = S.pick.filter(function (n) { return all.indexOf(n) >= 0; });
    if (!pick.length) { pick = ITEMS.slice(); }
    var idx = S.idx === '1', Y = D.Y, from = Y.indexOf(+S.from) >= 0 ? +S.from : Y[0], to = Y.indexOf(+S.to) >= 0 ? +S.to : Y[Y.length - 1];
    if (from > to) { var tmp = from; from = to; to = tmp; }
    var sub = Y.filter(function (y) { return y >= from && y <= to; });
    var series = pick.map(function (n) {
      var vals = sub.map(function (y) { return v(n, y); });
      if (idx) { var b = null; vals.forEach(function (x) { if (b == null && x) { b = x; } }); vals = vals.map(function (x) { return x == null || !b ? null : x / b * 100; }); }
      var k = all.indexOf(n);
      return { name: NAME[n] || n, vals: vals, cls: n === 'その他' ? 'o' : String(k + 1) }; // どの選び方でも、同じものは同じ色
    });
    var c = card('trend', '帰化の数の移り変わり');
    var row = el('div', 'dctlrow');
    var ms = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel'), list = el('div', 'dmlist');
    btn.type = 'button'; btn.textContent = pick.length === 1 ? (NAME[pick[0]] || pick[0]) : (NAME[pick[0]] || pick[0]) + ' ほか' + (pick.length - 1);
    ms.appendChild(el('span', 'dlab', '比べるもの')); ms.appendChild(btn);
    var chosen = pick.slice();
    all.forEach(function (n) {
      var l = el('label', 'dmitem'), cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.indexOf(n) >= 0;
      cb.addEventListener('change', function () { if (cb.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } });
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + (NAME[n] || n))); list.appendChild(l);
    });
    var ok = el('button', 'dbtn', 'この条件で表示'); ok.type = 'button'; ok.addEventListener('click', function () { set({ pick: all.filter(function (n) { return chosen.indexOf(n) >= 0; }) }); });
    panel.appendChild(list); var bar = el('div', 'dmbar'); bar.appendChild(ok); panel.appendChild(bar); ms.appendChild(panel);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); ms.classList.toggle('open'); if (ms.classList.contains('open')) { Z.fitPanel(panel); } });
    document.addEventListener('click', function (ev) { if (!ms.contains(ev.target)) { ms.classList.remove('open'); } });
    row.appendChild(ms);
    function sel(lab, val, opts, on) { var l = el('label', 'dctl'), s = el('select'); opts.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); }); s.value = val; s.addEventListener('change', function () { on(s.value); }); l.appendChild(el('span', 'dlab', lab)); l.appendChild(s); return l; }
    row.appendChild(sel('いつから', String(from), Y.map(function (y) { return [String(y), y + '年']; }), function (x) { set({ from: x }); }));
    row.appendChild(sel('いつまで', String(to), Y.map(function (y) { return [String(y), y + '年']; }), function (x) { set({ to: x }); }));
    row.appendChild(sel('目もり', idx ? '1' : '', [['', '人数'], ['1', '指数（はじめの年＝100）']], function (x) { set({ idx: x }); }));
    c.appendChild(row);
    c.appendChild(el('p', 'dhelp', esc(NOTE + '1952年4月28日〜1966年はまとめた数しかないので、線は1967年からです（下の「毎年の数」にあります）。' + (idx ? '指数は、それぞれの線のはじめの年を100とした数です。' : ''))));
    c.appendChild(Z.lineChart(sub.map(String), series, { title: '帰化の数の移り変わり', at: sub, lab: function (i) { return sub[i] + '年'; }, index: idx }));
    c.appendChild(Z.details('グラフの数を表で見る', Z.tableEl(['年'].concat(series.map(function (s) { return s.name; })), sub.map(function (y, j) {
      return [y + '年'].concat(series.map(function (s) { var x = s.vals[j]; return x == null ? null : idx ? x.toFixed(1) : fmt(x); }));
    }), 1)));
    c.appendChild(srcLine());
    var onlyNat = pick.every(function (n) { return NATS.indexOf(n) >= 0; }), onlyItem = pick.every(function (n) { return ITEMS.indexOf(n) >= 0; });
    var title = '全国｜' + (pick.length === 1 ? (NAME[pick[0]] || pick[0]) + 'の移り変わり' : onlyNat ? '帰化許可者の国籍別の移り変わり' : onlyItem ? '帰化の申請・許可・不許可の人数の移り変わり' : '帰化の人数の移り変わり') + (idx ? '（指数）' : '');
    var chart = { kind: 'line', per: sub.map(String), labels: sub.map(function (y) { return y + '年'; }), at: sub, series: series.map(function (s) { return { name: s.name, vals: s.vals, cls: s.cls }; }),
      index: idx, area: '全国', when: String(to), from: String(from), whenText: from + '年〜' + to + '年' };
    c.appendChild(tools(function () { return cur(chart, title, onlyNat ? '国籍は、法務省の表の「韓国・朝鮮」「中国」「その他」の3つです。' : NOTE); }));
    return c;
  }

  // ③ 帰化許可者数の国籍別の累計。国籍は法務省の毎年の表の「韓国・朝鮮」「中国」「その他」の3つ（くわしい国籍は2019年からしかないので、昔からの累計は作れない）。
  //   1952年から数えるときは、1952年4月28日〜1966年をまとめた数を1966年の点に入れ、合計には国籍の内わけのない1952年4月27日以前の333人も入れる（法務省の累計と同じ）
  function cumCard() {
    var end = +S.y, pre = D.agg.filter(function (a) { return a.key === '-1952'; })[0], agg = D.agg.filter(function (a) { return a.key === '1952-1966'; })[0];
    var fromStart = !S.cs || D.Y.indexOf(+S.cs) < 0, s0 = fromStart ? D.Y[0] : Math.min(+S.cs, end);
    var years = D.Y.filter(function (y) { return y >= s0 && y <= end; }), per = (fromStart ? [D.Y[0] - 1] : []).concat(years);
    function run(key) { var acc = fromStart ? agg[key] || 0 : 0, out = fromStart ? [acc] : []; years.forEach(function (y) { acc += v(key, y) || 0; out.push(acc); }); return out; }
    var tot = run('帰化許可者数').map(function (x) { return fromStart ? x + pre['帰化許可者数'] : x; });
    var series = [{ name: '合計', vals: tot, cls: '2' }].concat(NATS.map(function (n, k) { return { name: n, vals: run(n), cls: n === 'その他' ? 'o' : String(ITEMS.length + k + 1) }; }));
    var since = fromStart ? '1952年' : s0 + '年', last = per.length - 1;
    var c = card('cum', since + 'から' + end + '年までの帰化許可者数の累計（国籍別）');
    var row = el('div', 'dctlrow'), l = el('label', 'dctl'), s = el('select');
    [['', '1952年（記録の始め）から']].concat(D.Y.filter(function (y) { return y <= end; }).map(function (y) { return [String(y), y + '年から']; })).forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
    s.value = fromStart ? '' : String(s0); s.addEventListener('change', function () { set({ cs: s.value }); });
    l.appendChild(el('span', 'dlab', '数え始め')); l.appendChild(s); row.appendChild(l);
    row.appendChild(el('p', 'dhelp', esc('数え終わりは、上で選んだ年（' + end + '年）です。')));
    c.appendChild(row);
    var sum3 = series.slice(1).reduce(function (a, x) { return a + x.vals[last]; }, 0);
    c.appendChild(el('p', 'stotal', esc(since + 'から' + end + '年までの帰化許可者数の累計') + ' <b>' + fmt(tot[last]) + '人</b>'));
    c.appendChild(el('p', 'dhelp', esc(series.slice(1).map(function (x) { return x.name + ' ' + fmt(x.vals[last]) + '人（' + (x.vals[last] / sum3 * 100).toFixed(1) + '%）'; }).join('、') +
      (fromStart ? '、国籍の内わけのない1952年4月27日以前 ' + fmt(pre['帰化許可者数']) + '人。割合は、国籍の分かる' + fmt(sum3) + '人に対する割合です。' : '。'))));
    var lab = function (i) { return fromStart && i === 0 ? '1966年まで（1952年4月28日からの合計）' : per[i] + '年まで'; };
    c.appendChild(Z.lineChart(per.map(String), series, { title: '帰化許可者数の国籍別の累計', at: per, lab: lab }));
    c.appendChild(el('p', 'dhelp', esc('国籍は、法務省の毎年の表の「韓国・朝鮮」「中国」「その他」の3つです（ネパール・ブラジルなどのくわしい国籍は2019年からしか分からないので、昔からの累計は作れません）。' +
      (fromStart ? '1952年から数えるときの最初の点（1966年）は、1952年4月28日〜1966年をまとめた数です。合計には、国籍の内わけのない1952年4月27日以前の' + fmt(pre['帰化許可者数']) + '人も入れています（法務省の累計と同じ数になります）。' : ''))));
    var parts = series.slice(1).map(function (x) { return { name: x.name, v: x.vals[last], cls: x.cls }; });
    c.appendChild(el('h3', null, esc(since + 'から' + end + '年までの累計の国籍')));
    c.appendChild(Z.pieChart(parts, sum3, since + 'から' + end + '年までの累計の国籍'));
    c.appendChild(Z.details('累計を表で見る', Z.tableEl(['年', '合計'].concat(NATS), per.map(function (y, i) { return [lab(i)].concat(series.map(function (x) { return fmt(x.vals[i]); })); }).reverse(), 1)));
    // 国ごとの合計（国籍別の上位10が分かる2019年から。数え始め〜数え終わりのうち、その年の分があるものを足す。どの年も上位10に入った国籍・地域だけ）
    var ys = Object.keys(D.top).sort().filter(function (x) { return (fromStart || +x >= s0) && +x <= end; }), three = [], all3 = 0, span3 = '';
    if (ys.length) {
      var names = [].concat.apply([], ys.map(function (x) { return D.top[x].rows.map(function (r) { return r[0]; }); })).filter(function (n, i, a) { return a.indexOf(n) === i; });
      var full = names.filter(function (n) { return ys.every(function (x) { return natVal(n, x) != null; }); }), part = names.filter(function (n) { return full.indexOf(n) < 0; });
      three = full.map(function (n) { return [n, ys.reduce(function (a2, x) { return a2 + natVal(n, x); }, 0)]; }).sort(function (a2, b2) { return b2[1] - a2[1]; });
      all3 = ys.reduce(function (a2, x) { return a2 + D.top[x].total; }, 0);
      span3 = ys[0] === ys[ys.length - 1] ? ys[0] + '年' : ys[0] + '〜' + ys[ys.length - 1] + '年の' + ys.length + '年間';
      c.appendChild(el('h3', null, esc(span3 + 'の合計（国籍・地域別）')));
      c.appendChild(el('p', 'dhelp', esc('くわしい国籍が分かるのは2019年からです。その年から数え終わりまでを足した数です（この間の帰化許可者数は合わせて' + fmt(all3) + '人）。' +
        (ys.length > 1 ? 'どの年も上位10に入った国籍・地域だけです。' + (part.length ? part.join('・') + 'は上位10に入らなかった年があり、その年の数が分からないので入れていません。' : '') : ''))));
      c.appendChild(Z.barList(three.map(function (r) { return [r[0], r[1], ys.map(function (x) { return x + '年 ' + fmt(natVal(r[0], x)); }).join('・')]; }), all3, { rank: true }));
    } else {
      c.appendChild(el('p', 'dhelp', 'くわしい国籍（ネパール・ブラジルなど）が分かるのは2019年からなので、この期間の国ごとの合計はありません。'));
    }
    c.appendChild(srcLine());
    var whenText = since + '〜' + end + '年の累計', note = '国籍は、法務省の毎年の表の「韓国・朝鮮」「中国」「その他」の3つです。';
    var chart = { kind: 'line', per: per.map(String), labels: per.map(function (y) { return y + '年まで'; }), at: per, series: series.map(function (x) { return { name: x.name, vals: x.vals, cls: x.cls }; }),
      index: false, area: '全国', when: String(end), from: String(per[0]), whenText: whenText };
    var pie = { kind: 'pie', parts: parts, total: sum3, area: '全国', when: String(end), whenText: whenText };
    var rank3 = { kind: 'rank', rows: three.slice(0, 10), f: function (x) { return fmt(x) + '人'; }, metric: '人数', area: '全国', when: String(end), what: '全国の国籍・地域', whenText: span3 + 'の合計' };
    var t = el('div', 'dtools');
    if (window.KZX) {
      window.KZX.buttons(t, function () { return cur(chart, '全国｜帰化許可者の国籍別累計の移り変わり', note + (fromStart ? '1966年の点は1952年4月28日からの合計。合計には国籍の内わけのない1952年4月27日以前の333人も入れています。' : '')); });
      var t2 = el('div', 'dtools'); window.KZX.buttons(t2, function () { return cur(pie, '全国｜帰化許可者の国籍別累計の構成', note + (fromStart ? '国籍の内わけのない1952年4月27日以前の333人は入れていません。' : '')); });
      t.appendChild(el('span', 'dhelp', '↑累計の折れ線の画像　↓累計の円グラフの画像' + (three.length ? '　↓↓国ごとの合計の画像' : ''))); c.appendChild(t); c.appendChild(t2);
      if (three.length) { var t3 = el('div', 'dtools'); window.KZX.buttons(t3, function () { return cur(rank3, '全国｜帰化許可者の国籍・地域別人数（' + span3 + 'の合計）', ys.length > 1 ? 'どの年も上位10に入った国籍・地域だけです。' : ''); }); c.appendChild(t3); }
    }
    return c;
  }

  // ④ 国籍別の上位10（2019年から。2019〜2022年は、法務省のページの前の版をインターネット・アーカイブの保存版から読んだもの）
  //   順位は人数の多い順（同じ人数は同じ順位。法務省の2019年の表と同じ数え方）。国籍・地域ごとの移り変わりは、上位10に入っていない年は「データなし」
  function rankOf(rows, v) { return 1 + rows.filter(function (q) { return q[1] > v; }).length; }
  function natVal(n, y) { var t = D.top[String(y)], r = t ? t.rows.filter(function (q) { return q[0] === n; })[0] : null; return r ? r[1] : null; }
  function topSrc() { return srcLine('（国籍別帰化許可者数。' + D.topSaved + '年は、前の版をインターネット・アーカイブに保存された当時の PDF から）'); }
  function topCard() {
    var ys = Object.keys(D.top).sort(), y = S.y, has = ys.indexOf(y) >= 0, show = has ? y : ys[ys.length - 1];
    var c = card('top', show + '年の国籍・地域別の帰化許可者数（上位10）');
    if (!has) { c.appendChild(el('p', 'dhelp', esc('国籍・地域別の上位10は、' + ys[0] + '〜' + ys[ys.length - 1] + '年の分だけあります。' + y + '年の分はないので、' + show + '年を出しています。'))); }
    var t = D.top[show], prev = D.top[String(+show - 1)];
    c.appendChild(el('p', 'stotal', show + '年の帰化許可者数 <b>' + fmt(t.total) + '人</b>'));
    c.appendChild(Z.barList(t.rows.map(function (r) { return [r[0], r[1]]; }), t.total, { rank: true }));
    var rows = t.rows.map(function (r) {
      var k = rankOf(t.rows, r[1]), p = prev ? prev.rows.filter(function (q) { return q[0] === r[0]; })[0] : null, pr = p ? rankOf(prev.rows, p[1]) : 0;
      return [k, r[0], fmt(r[1]), (r[1] / t.total * 100).toFixed(1) + '%', p ? signed(r[1] - p[1]) : null, p ? rate(r[1], p[1]) : null,
        !prev ? '—' : !p ? '前の年の上位10になし' : pr === k ? '→' : pr > k ? '↑' + (pr - k) : '↓' + (k - pr)];
    });
    rows.push(['', 'その他', fmt(t.other), (t.other / t.total * 100).toFixed(1) + '%', null, null, '']);
    var tw = Z.tableEl(['順位', '国籍・地域', '人数', '割合', '前の年から', '増減率', '順位の動き'], rows, 2);
    tw.querySelectorAll('td').forEach(function (td) { if (/^\+/.test(td.textContent) || /^↑/.test(td.textContent)) { td.classList.add('up'); } else if (/^−/.test(td.textContent) || /^↓/.test(td.textContent)) { td.classList.add('down'); } });
    c.appendChild(Z.details('前の年との比べと順位の動きを表で見る', tw));
    var head = ['順位'].concat(ys.map(function (x) { return x + '年'; }));
    c.appendChild(Z.details(ys[0] + '〜' + ys[ys.length - 1] + '年の上位10を並べて見る', Z.tableEl(head, D.top[ys[ys.length - 1]].rows.map(function (_, k) {
      return [k + 1].concat(ys.map(function (x) { var r = D.top[x].rows[k]; return r ? rankOf(D.top[x].rows, r[1]) + '位 ' + r[0] + ' ' + fmt(r[1]) + '人' : null; }));
    }), 9)));
    c.appendChild(topSrc());
    var chart = { kind: 'rank', rows: t.rows.map(function (r) { return [r[0], r[1]]; }), f: function (x) { return fmt(x) + '人'; }, metric: '人数', area: '全国', when: show, what: '全国の国籍・地域', whenText: show + '年' };
    c.appendChild(tools(function () { return cur(chart, '全国｜帰化許可者の国籍・地域別人数（上位10）'); }));
    // 国籍・地域ごとの移り変わり（比べるものを選ぶ。はじめは、いちばん新しい年の上位のうち韓国・朝鮮と中国を除く7つ：人数の桁が違うので）
    var all = [].concat.apply([], ys.slice().reverse().map(function (x) { return D.top[x].rows.map(function (r) { return r[0]; }); })).filter(function (n, i, a) { return a.indexOf(n) === i; });
    var pick = S.np.filter(function (n) { return all.indexOf(n) >= 0; });
    if (!pick.length) { pick = D.top[ys[ys.length - 1]].rows.map(function (r) { return r[0]; }).filter(function (n) { return n !== '韓国・朝鮮' && n !== '中国'; }).slice(0, 7); }
    var series = pick.map(function (n, k) { return { name: n, vals: ys.map(function (x) { return natVal(n, x); }), cls: k < 7 ? String(k + 1) : 'o' }; });
    c.appendChild(el('h3', null, esc('国籍・地域ごとの移り変わり（' + ys[0] + '〜' + ys[ys.length - 1] + '年）')));
    var row = el('div', 'dctlrow'), ms = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel'), list = el('div', 'dmlist');
    btn.type = 'button'; btn.textContent = pick.length === 1 ? pick[0] : pick[0] + ' ほか' + (pick.length - 1);
    ms.appendChild(el('span', 'dlab', '比べる国籍・地域')); ms.appendChild(btn);
    var chosen = pick.slice();
    all.forEach(function (n) {
      var l = el('label', 'dmitem'), cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.indexOf(n) >= 0;
      cb.addEventListener('change', function () { if (cb.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } });
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + n)); list.appendChild(l);
    });
    var ok = el('button', 'dbtn', 'この条件で表示（7つまで）'); ok.type = 'button'; ok.addEventListener('click', function () { set({ np: chosen.slice(0, 7) }); });
    panel.appendChild(list); var bar = el('div', 'dmbar'); bar.appendChild(ok); panel.appendChild(bar); ms.appendChild(panel);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); ms.classList.toggle('open'); if (ms.classList.contains('open')) { Z.fitPanel(panel); } });
    document.addEventListener('click', function (ev) { if (!ms.contains(ev.target)) { ms.classList.remove('open'); } });
    row.appendChild(ms); c.appendChild(row);
    c.appendChild(el('p', 'dhelp', esc('発表には上位10の国籍・地域しかのらないので、上位10に入っていない年は線が切れます（0人ではありません）。はじめは、韓国・朝鮮と中国を除いて出しています（人数の桁が違うため。「比べる国籍・地域」で足せます）。')));
    var nys = ys.map(Number);
    c.appendChild(Z.lineChart(ys, series, { title: '国籍・地域ごとの帰化許可者数の移り変わり', at: nys, lab: function (i) { return ys[i] + '年'; } }));
    c.appendChild(Z.details('グラフの数を表で見る', Z.tableEl(['年'].concat(pick), ys.map(function (x, i) { return [x + '年'].concat(series.map(function (s) { return s.vals[i] == null ? null : fmt(s.vals[i]); })); }), 1)));
    var lchart = { kind: 'line', per: ys, labels: ys.map(function (x) { return x + '年'; }), at: nys, series: series, index: false, area: '全国', when: ys[ys.length - 1], from: ys[0],
      whenText: ys[0] + '年〜' + ys[ys.length - 1] + '年' };
    c.appendChild(tools(function () { return cur(lchart, pick.length === 1 ? '全国｜' + pick[0] + 'の帰化許可者数の移り変わり' : '全国｜帰化許可者の国籍・地域別の移り変わり', '上位10に入っていない年は、数がないので線が切れています。'); }));
    return c;
  }

  // ⑤ 国籍の取得（届け出）と離脱（帰化とは別の数。最近の10年）
  function acqCard() {
    var a = D.acq, c = card('acq', '国籍の取得（届け出）と離脱の移り変わり');
    c.appendChild(el('p', 'dhelp', '帰化とは別の数です。国籍取得者数は、国籍法第3条・第17条などにもとづいて、届け出で日本の国籍を取った人の数です。国籍離脱者数は、国籍法第13条にもとづいて日本の国籍をはなれた人の数です。最近の10年分が発表されています。'));
    var series = [{ name: '国籍取得者数', vals: a['国籍取得者数'], cls: '1' }, { name: '国籍離脱者数', vals: a['国籍離脱者数'], cls: '2' }];
    c.appendChild(Z.lineChart(a.Y.map(String), series, { title: '国籍の取得と離脱の移り変わり', at: a.Y, lab: function (i) { return a.Y[i] + '年'; } }));
    c.appendChild(Z.details('グラフの数を表で見る', Z.tableEl(['年', '国籍取得者数', '国籍離脱者数'], a.Y.map(function (y, j) { return [y + '年', fmt(a['国籍取得者数'][j]), fmt(a['国籍離脱者数'][j])]; }), 1)));
    c.appendChild(srcLine());
    var chart = { kind: 'line', per: a.Y.map(String), labels: a.Y.map(function (y) { return y + '年'; }), at: a.Y, series: series, index: false, area: '全国',
      when: String(a.Y[a.Y.length - 1]), from: String(a.Y[0]), whenText: a.Y[0] + '年〜' + a.Y[a.Y.length - 1] + '年' };
    c.appendChild(tools(function () { return cur(chart, '全国｜国籍取得者数・国籍離脱者数の移り変わり', '国籍取得者数は届け出で日本の国籍を取った人（帰化とは別）、国籍離脱者数は日本の国籍をはなれた人の数です。'); }));
    return c;
  }

  // ⑥ 毎年の数（表）
  function tableCard() {
    var c = card('years', '毎年の数（表）');
    var rows = D.Y.slice().reverse().map(function (y) { return [y + '年'].concat(ITEMS.concat(NATS).map(function (k) { var x = v(k, y); return x == null ? null : fmt(x); })); });
    D.agg.slice().reverse().forEach(function (g) { rows.push([g.label].concat(ITEMS.concat(NATS).map(function (k) { return g[k] == null ? null : fmt(g[k]); }))); });
    c.appendChild(Z.details('1952年からの毎年の数を表で見る', Z.tableEl(['年', '申請者数', '許可者数', '不許可者数', 'うち韓国・朝鮮', 'うち中国', 'うちその他'], rows, 1)));
    c.appendChild(el('p', 'dhelp', '「—」は、その年の数が発表の表にない所です。'));
    c.appendChild(srcLine());
    return c;
  }

  var box = document.getElementById('kika-view'), ctl = document.getElementById('kika-ctl');
  var nowBox = el('div'); nowBox.id = 'kika-now'; ctl.insertAdjacentElement('afterend', nowBox);
  function render() {
    if (D.Y.indexOf(+S.y) < 0) { S.y = String(D.Y[D.Y.length - 1]); }
    writeHash();
    ctl.replaceChildren(controls());
    nowBox.replaceChildren(nowLine());
    var out = el('div');
    [yearCard, lineCard, cumCard, topCard, acqCard, tableCard].forEach(function (f) { try { out.appendChild(f()); } catch (e) { console.error(e); out.appendChild(Z.nodata('この部分を表示できませんでした')); } });
    box.replaceChildren(out);
  }
  fetch('data/kika.json').then(function (r) { return r.json(); }).then(function (j) { D = j; readHash(); render(); },
    function () { box.replaceChildren(Z.nodata('データを読み込めませんでした。')); });
})();
