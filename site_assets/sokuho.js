/* 数でみる在留外国人：法務省・半期速報のページ（sokuho.html）
   数は data/sokuho.json（make_dash_data.py が作る）。速報（報道発表の数）と確定統計（e-Stat の表）は別々に持ち、混ぜない。
   発表にのっている国籍・地域は上位だけ（2022年末までは上位10、2023年6月末からは上位20）なので、全体の合計と取り違えないように「総数」を別に示す */
(function () {
  'use strict';
  var root = document.getElementById('sokuho');
  if (!root || !window.KZC) { return; }
  var K = window.KZ, Z = window.KZC, fmt = K.fmt, esc = K.esc, el = Z.el, wl = Z.wl, signed = Z.signed;
  var D = null, DIMS = ['国籍・地域', '在留資格', '都道府県'], OUTER = { '総数': 1, 'その他': 1, '中長期在留者': 1 };
  var SRC = '出入国在留管理庁「在留外国人数について」（報道発表・速報）';
  var DEF = { dim: '国籍・地域', w: '', cmp: 'half', pick: [], conf: '1', from: '', to: '' };
  var S = JSON.parse(JSON.stringify(DEF));

  function readHash() { var q = new URLSearchParams(location.hash.slice(1)); Object.keys(S).forEach(function (k) { var v = q.get(k); if (v != null) { S[k] = k === 'pick' ? v.split(',').filter(Boolean) : v; } }); }
  function writeHash() {
    var q = new URLSearchParams(); Object.keys(S).forEach(function (k) { var v = k === 'pick' ? S.pick.join(',') : S[k]; if (v) { q.set(k, v); } });
    history.replaceState(null, '', '#' + q.toString());
  }
  function set(p) { Object.keys(p).forEach(function (k) { S[k] = p[k]; }); render(); }
  function pubText(r) { return r.pub.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日'); }
  function rel(w) { return D.releases[D.W.indexOf(w)]; }
  function card(title, badge) { var c = el('section', 'dcard'); c.appendChild(el('h2', null, esc(title) + ' ' + badge)); return c; }
  var SP = '<span class="sbadge sp">速報</span>', CF = '<span class="sbadge cf">確定統計</span>';
  function srcLine(w) { var r = rel(w); return el('p', 'dsrc', esc('出典：' + SRC + '「' + r.title + '」（' + pubText(r) + '公表）') + ' <a href="' + esc(r.page) + '">発表のページ</a>'); }

  // その発表の、ある名前の数（その発表の時点）。前の時点は、その時点の発表の数、なければ今の発表にのった前の時点の数
  function own(dim, name, w) { var a = D.sp[dim][name]; var i = D.W.indexOf(w); return a && i >= 0 ? a[i] : null; }
  function valueAt(dim, name, w, from) {
    var v = own(dim, name, w);
    if (v != null) { return { v: v, how: '' }; }
    var b = D.before[from] && D.before[from][dim] && D.before[from][dim][name];
    if (b && b[w] != null) { return { v: b[w], how: from + 'の発表にのった数' }; }
    return null;
  }
  function backW(w, months) { var y = +w.slice(0, 4), m = +w.slice(5); var t = y * 12 + m - months; return Math.floor((t - 1) / 12) + '-' + String((t - 1) % 12 + 1).padStart(2, '0'); }
  function listed(dim, w) { // その発表にのっている名前（多い順、総数・その他は除く）
    var i = D.W.indexOf(w);
    return Object.keys(D.sp[dim]).filter(function (n) { return !OUTER[n] && D.sp[dim][n][i] != null; }).sort(function (a, b) { return D.sp[dim][b][i] - D.sp[dim][a][i]; });
  }
  function current(chart, title, nat) { return { title: title, chart: chart, meta: { nat: nat || [], visa: [] }, src: SRC, status: '速報' }; }
  function tools(get) { var t = el('div', 'dtools'); if (window.KZX) { window.KZX.buttons(t, get); } return t; }

  function controls() {
    var f = el('div', 'dfilter');
    var tab = el('div', 'stab'); tab.setAttribute('role', 'group'); tab.setAttribute('aria-label', '表');
    DIMS.forEach(function (d) { var b = el('button', null, esc(d)); b.type = 'button'; b.setAttribute('aria-pressed', S.dim === d ? 'true' : 'false'); b.addEventListener('click', function () { set({ dim: d, pick: [] }); }); tab.appendChild(b); });
    var t1 = el('div', 'dctl dwide'); t1.appendChild(el('span', 'dlab', '表')); t1.appendChild(tab); f.appendChild(t1);
    var sel = el('select'); D.W.slice().reverse().forEach(function (w) { var o = el('option'); o.value = w; o.textContent = wl(w) + '（' + pubText(rel(w)) + '公表）'; sel.appendChild(o); });
    sel.value = S.w; sel.addEventListener('change', function () { set({ w: sel.value }); });
    var t2 = el('label', 'dctl'); t2.appendChild(el('span', 'dlab', '時点（発表）')); t2.appendChild(sel); f.appendChild(t2);
    var latest = D.W[D.W.length - 1], plain = Object.keys(DEF).every(function (k) { return k === 'w' ? S.w === latest : JSON.stringify(S[k]) === JSON.stringify(DEF[k]); });
    var acts = el('div', 'dctl dacts'), reset = el('button', 'dbtn dbtn-sub', 'リセット'); reset.type = 'button'; reset.disabled = plain;
    reset.title = plain ? '選んでいる条件はありません' : '表・時点・比べるものなどを、はじめの状態に戻します';
    reset.addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEF)); S.w = latest; render(); });
    acts.appendChild(reset); f.appendChild(acts);
    return f;
  }
  // 「表示中：…」の行は、止めておく欄の外（すぐ下）に出す（欄を低くして、下のグラフが隠れないように）
  function nowLine() { return el('p', 'dnow', '表示中：表 <b>' + esc(S.dim) + '</b>　時点 <b>' + esc(wl(S.w)) + '</b>（' + esc(pubText(rel(S.w))) + '公表の速報）'); }

  // ① ランキング
  function rankCard() {
    var w = S.w, dim = S.dim, i = D.W.indexOf(w), names = listed(dim, w), total = own(dim, '総数', w);
    var prevW = backW(w, 6), yearW = backW(w, 12);
    var prevNames = D.W.indexOf(prevW) >= 0 ? listed(dim, prevW) : [];
    var c = card(wl(w) + 'の' + dim + 'ランキング', SP);
    c.appendChild(el('p', 'stotal', '在留外国人の総数 <b>' + fmt(total) + '人</b>（' + esc(wl(w)) + '）'));
    if (dim === '国籍・地域') { c.appendChild(el('p', 'dhelp', esc('発表にのっているのは、多い' + names.length + 'の国籍・地域と「その他」です（2022年末までの発表は上位10、2023年6月末からは上位20）。下の数を足しても総数にはなりません。'))); }
    var vn = K.vnote(names); if (vn) { c.appendChild(el('p', 'dhelp', esc('グラフの' + vn))); }
    var rows = names.map(function (n, k) {
      var v = own(dim, n, w), p = valueAt(dim, n, prevW, w), y = valueAt(dim, n, yearW, w);
      var pr = prevNames.indexOf(n), move = !prevNames.length ? '—' : pr < 0 ? '前回の発表になし' : pr === k ? '→' : pr > k ? '↑' + (pr - k) : '↓' + (k - pr);
      return { n: n, v: v, k: k, p: p, y: y, move: move };
    });
    var head = ['順位', dim, '人数', '構成比', '前の半期から（' + wl(prevW) + '）', '増加率', '1年前から（' + wl(yearW) + '）', '増加率', '順位の動き'];
    var trs = rows.map(function (r) {
      function d(x) { return x ? signed(r.v - x.v) : '—'; } function rt(x) { return x && x.v ? signed((r.v - x.v) / x.v * 100, 1) + '%' : '—'; }
      return [r.k + 1, r.n, fmt(r.v), (r.v / total * 100).toFixed(1) + '%', d(r.p), rt(r.p), d(r.y), rt(r.y), dim === '国籍・地域' ? r.move : '—'];
    });
    c.appendChild(Z.barList(rows.map(function (r) { return [r.n, r.v, '', dim === '国籍・地域' ? 'nat-' + encodeURIComponent(r.n) + '.html' : null]; }), total, { rank: true }));
    var tw = Z.tableEl(head, trs, 2); tw.querySelector('table').classList.add('srank');
    tw.querySelectorAll('td').forEach(function (td) { if (/^\+/.test(td.textContent) || /^↑/.test(td.textContent)) { td.classList.add('up'); } else if (/^−/.test(td.textContent) || /^↓/.test(td.textContent)) { td.classList.add('down'); } });
    c.appendChild(Z.details('前の半期・1年前との比べと順位の動きを表で見る', tw));
    c.appendChild(el('p', 'dhelp', '前の半期・1年前の数は、その時点の発表の数です（その時点の発表にない名前は、今回の発表にのった前の時点の数を使います）。どちらもない所は「—」です。'));
    c.appendChild(srcLine(w));
    var chart = { kind: 'rank', rows: rows.slice(0, 10).map(function (r) { return [r.n, r.v]; }), f: function (v) { return fmt(v) + '人'; }, metric: '人数', when: w, area: '全国', what: '全国の' + dim };
    c.appendChild(tools(function () { return current(chart, wl(w) + 'の' + dim + 'ランキング（速報）'); }));
    return c;
  }

  // ② 半期ごとの折れ線（速報。確定統計を点線で重ねられる）
  function lineCard() {
    var dim = S.dim, latest = listed(dim, D.W[D.W.length - 1]);
    var all = Object.keys(D.sp[dim]).filter(function (n) { return !OUTER[n] || n === '総数'; });
    var pick = S.pick.filter(function (n) { return all.indexOf(n) >= 0; });
    if (!pick.length) { pick = latest.slice(0, 5); }
    var withConf = S.conf === '1';
    var per = D.W.slice();
    if (withConf) { D.CP.forEach(function (w) { if (per.indexOf(w) < 0) { per.push(w); } }); per.sort(); }
    var from = per.indexOf(S.from) >= 0 ? S.from : per[0], to = per.indexOf(S.to) >= 0 ? S.to : per[per.length - 1];
    var sub = per.filter(function (w) { return w >= from && w <= to; });
    var series = [];
    pick.forEach(function (n, k) {
      var cls = k < 7 ? String(k + 1) : 'o';
      series.push({ name: n + '（速報）', vals: sub.map(function (w) { return own(dim, n, w); }), hid: {}, cls: cls });
      if (withConf && D.conf[dim][n]) { series.push({ name: n + '（確定統計）', vals: sub.map(function (w) { var j = D.CP.indexOf(w); return j < 0 ? null : D.conf[dim][n][j]; }), hid: {}, cls: cls, dash: true }); }
    });
    var c = card(dim + 'ごとの人数の移り変わり（半期ごと）', SP + (withConf ? ' ' + CF : ''));
    var row = el('div', 'dctlrow');
    var ms = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel'), list = el('div', 'dmlist');
    btn.type = 'button'; btn.textContent = pick.length === 1 ? pick[0] : pick[0] + ' ほか' + (pick.length - 1);
    ms.appendChild(el('span', 'dlab', '比べるもの')); ms.appendChild(btn);
    var chosen = pick.slice();
    // 国籍・地域は地域区分ごとに見出しをつけて並べる（総数はいちばん上）
    var grouped = dim === '国籍・地域' && D.natRegion, order = [];
    if (grouped) { D.regions.forEach(function (g) { g[1].forEach(function (x) { order.push(x); }); }); }
    var subOf = function (n) { return grouped && D.natRegion[n] ? D.natRegion[n][1] : ''; };
    var seq = grouped ? all.slice().sort(function (a, b) { return (order.indexOf(subOf(a)) - order.indexOf(subOf(b))) || (all.indexOf(a) - all.indexOf(b)); }) : all, lastSub = '';
    seq.forEach(function (n) {
      if (subOf(n) && subOf(n) !== lastSub) { lastSub = subOf(n); list.appendChild(el('div', 'dmhead', esc(lastSub + (D.natRegion[n][0] !== lastSub ? '（' + D.natRegion[n][0] + '）' : '')))); }
      var l = el('label', 'dmitem'), cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.indexOf(n) >= 0; cb.addEventListener('change', function () { if (cb.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } }); l.appendChild(cb); l.appendChild(document.createTextNode(' ' + n)); l.dataset.n = n; list.appendChild(l);
    });
    var q = el('input'); q.type = 'search'; q.placeholder = '名前で探す'; q.setAttribute('aria-label', '比べるものを名前で探す');
    q.addEventListener('input', function () {
      var t = q.value.trim(), head = null, any = false;
      Array.prototype.forEach.call(list.children, function (c) { // 合うものがない見出しは隠す
        if (c.classList.contains('dmhead')) { if (head) { head.hidden = !any; } head = c; any = false; return; }
        c.hidden = !!t && c.dataset.n.indexOf(t) < 0; if (!c.hidden) { any = true; }
      });
      if (head) { head.hidden = !any; }
    });
    var ok = el('button', 'dbtn', 'この条件で表示（7つまで）'); ok.type = 'button'; ok.addEventListener('click', function () { set({ pick: chosen.slice(0, 7) }); });
    panel.appendChild(q); panel.appendChild(list); var bar = el('div', 'dmbar'); bar.appendChild(ok); panel.appendChild(bar); ms.appendChild(panel);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); ms.classList.toggle('open'); if (ms.classList.contains('open')) { Z.fitPanel(panel); } });
    document.addEventListener('click', function (ev) { if (!ms.contains(ev.target)) { ms.classList.remove('open'); } });
    row.appendChild(ms);
    function sel(lab, val, opts, on) { var l = el('label', 'dctl'), s = el('select'); opts.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); }); s.value = val; s.addEventListener('change', function () { on(s.value); }); l.appendChild(el('span', 'dlab', lab)); l.appendChild(s); return l; }
    row.appendChild(sel('いつから', from, per.map(function (w) { return [w, wl(w)]; }), function (v) { set({ from: v }); }));
    row.appendChild(sel('いつまで', to, per.map(function (w) { return [w, wl(w)]; }), function (v) { set({ to: v }); }));
    row.appendChild(sel('確定統計', S.conf, [['1', '点線で重ねる（2012年12月末から）'], ['0', '重ねない（速報だけ）']], function (v) { set({ conf: v, from: '', to: '' }); }));
    c.appendChild(row);
    c.appendChild(el('p', 'dhelp', '速報（実線）は、法務省の今のサイトにある発表（2020年末〜）の数です。' + (withConf ? '点線は、あとで e-Stat に出た確定統計の数です。同じ時点の速報と確定統計は、いまのところすべて同じ数でした。' : '') + '選べる国籍・地域は、発表にのったことがあるものだけです。'));
    c.appendChild(Z.lineChart(sub, series, { title: dim + 'の移り変わり' }));
    var head = ['時点'].concat(series.map(function (s) { return s.name; }));
    c.appendChild(Z.details('グラフの数を表で見る', Z.tableEl(head, sub.map(function (w, j) { return [wl(w)].concat(series.map(function (s) { return s.vals[j] == null ? null : fmt(s.vals[j]); })); }), 1)));
    c.appendChild(el('p', 'dsrc', esc('出典：' + SRC + '（各発表）' + (withConf ? '、出入国在留管理庁「在留外国人統計」（e-Stat、確定統計）' : ''))));
    var spOnly = series.filter(function (s) { return !s.dash; });
    var firstNat = dim === '国籍・地域' && pick.length === 1 && pick[0] !== '総数' ? [pick[0]] : [];
    var chartSeries = pick.length === 1 && withConf ? [{ name: pick[0], vals: sub.map(function (w) { var v = own(dim, pick[0], w); if (v == null && D.conf[dim][pick[0]]) { var j = D.CP.indexOf(w); v = j < 0 ? null : D.conf[dim][pick[0]][j]; } return v; }), cls: '1' }] : spOnly;
    var chart = { kind: 'line', per: sub, series: chartSeries, index: false, area: '全国', when: sub[sub.length - 1], from: sub[0],
      dim: dim === '国籍・地域' ? 'nat' : dim === '在留資格' ? 'visa' : 'pref' }; // 画像のタイトル（share.js）：全国｜在留外国人の国籍・地域別の移り変わり
    c.appendChild(tools(function () { return { title: dim + 'の移り変わり', chart: chart, meta: { nat: firstNat, visa: dim === '在留資格' && pick.length === 1 ? [pick[0]] : [] }, src: SRC + (withConf ? '、在留外国人統計（確定統計）' : ''), status: withConf ? '速報と確定統計' : '速報' }; }));
    return c;
  }

  // ③ 増加ランキング（人数と増加率は別々に）
  function growCard() {
    var w = S.w, dim = S.dim, months = S.cmp === 'year' ? 12 : 6, bw = backW(w, months), names = listed(dim, w);
    var c = card((S.cmp === 'year' ? '1年前' : '前の半期') + 'からの増加ランキング（' + wl(bw) + '→' + wl(w) + '）', SP);
    var tab = el('div', 'stab');
    [['half', '前の半期と比べる'], ['year', '1年前の同じ時点と比べる']].forEach(function (x) { var b = el('button', null, x[1]); b.type = 'button'; b.setAttribute('aria-pressed', S.cmp === x[0] ? 'true' : 'false'); b.addEventListener('click', function () { set({ cmp: x[0] }); }); tab.appendChild(b); });
    c.appendChild(tab);
    var rows = names.map(function (n) { var v = own(dim, n, w), b = valueAt(dim, n, bw, w); return b ? { n: n, v: v, b: b.v, d: v - b.v, r: b.v ? (v - b.v) / b.v * 100 : null } : null; }).filter(Boolean);
    if (!rows.length) { c.appendChild(Z.nodata('比べる時点の数がありません')); c.appendChild(srcLine(w)); return c; }
    var grid = el('div', 'cols');
    var byD = rows.slice().sort(function (a, b) { return b.d - a.d; }), byR = rows.filter(function (r) { return r.r != null; }).sort(function (a, b) { return b.r - a.r; });
    var s1 = el('section', 'dsub'); s1.appendChild(el('h3', null, '増加人数')); s1.appendChild(Z.barList(byD.slice(0, 10).map(function (r) { return [r.n, r.d, fmt(r.b) + '人→' + fmt(r.v) + '人']; }), null, { f: function (v) { return signed(v) + '人'; }, rank: true }));
    var s2 = el('section', 'dsub'); s2.appendChild(el('h3', null, '増加率')); s2.appendChild(Z.barList(byR.slice(0, 10).map(function (r) { return [r.n, r.r, fmt(r.b) + '人→' + fmt(r.v) + '人']; }), null, { f: function (v) { return signed(v, 1) + '%'; }, rank: true }));
    grid.appendChild(s1); grid.appendChild(s2); c.appendChild(grid);
    c.appendChild(el('p', 'dhelp', '増加人数と増加率は別のものです。増加率は、もとの人数が少ないと大きく出ます。比べているのは発表にのっている' + dim + 'だけです。'));
    c.appendChild(srcLine(w));
    var chart = { kind: 'rank', rows: byD.slice(0, 10).map(function (r) { return [r.n, r.d]; }), f: function (v) { return signed(v) + '人'; }, metric: '増加人数', when: w, area: '全国', what: '全国の' + dim + '（' + wl(bw) + '→' + wl(w) + '）' };
    var chart2 = { kind: 'rank', rows: byR.slice(0, 10).map(function (r) { return [r.n, r.r]; }), f: function (v) { return signed(v, 1) + '%'; }, metric: '増加率', when: w, area: '全国', what: '全国の' + dim + '（' + wl(bw) + '→' + wl(w) + '）' };
    var t = el('div', 'dtools');
    if (window.KZX) {
      window.KZX.buttons(t, function () { return current(chart, dim + 'の増加人数ランキング'); });
      var t2 = el('div', 'dtools'); window.KZX.buttons(t2, function () { return current(chart2, dim + 'の増加率ランキング'); });
      t.appendChild(el('span', 'dhelp', '↑増加人数の画像　↓増加率の画像')); c.appendChild(t); c.appendChild(t2);
    }
    return c;
  }

  // ④ 構成の円グラフ（その他＝総数−発表にのった数の合計）
  function pieCard() {
    var w = S.w, dim = S.dim, names = listed(dim, w), total = own(dim, '総数', w);
    var c = card(wl(w) + 'の' + dim + 'の構成', SP);
    var sum = names.reduce(function (s, n) { return s + own(dim, n, w); }, 0), rest = total - sum;
    var parts = names.slice(0, 7).map(function (n, k) { return { name: n, v: own(dim, n, w), cls: String(k + 1) }; });
    var mid = names.slice(7).reduce(function (s, n) { return s + own(dim, n, w); }, 0);
    if (dim === '国籍・地域') {
      if (mid > 0) { parts.push({ name: '8〜' + names.length + '位の合計', v: mid, cls: 'o' }); }
      if (rest > 0) { parts.push({ name: 'その他（発表にのっていない国籍・地域）', v: rest, cls: 'o' }); }
      var pub = own(dim, 'その他', w);
      c.appendChild(el('p', 'dhelp', esc('「その他」は、総数から発表にのった' + names.length + 'の国籍・地域の合計を引いた数です（' + fmt(rest) + '人。発表の「その他」は' + (pub == null ? 'ありません' : fmt(pub) + '人で、' + (pub === rest ? '同じ数です' : '違います')) + '）。')));
    } else if (dim === '在留資格') {
      var mid2 = total - parts.reduce(function (s, p) { return s + p.v; }, 0);
      if (mid2 > 0) { parts.push({ name: 'その他の在留資格', v: mid2, cls: 'o' }); }
    } else if (rest + mid > 0) { parts.push({ name: 'そのほかの都道府県', v: mid + rest, cls: 'o' }); }
    c.appendChild(Z.pieChart(parts, total, wl(w) + 'の' + dim + 'の構成'));
    c.appendChild(srcLine(w));
    var chart = { kind: 'pie', parts: parts, total: total, area: '全国', when: w, dim: dim === '国籍・地域' ? 'nat' : dim === '在留資格' ? 'visa' : 'pref' };
    c.appendChild(tools(function () { return current(chart, wl(w) + 'の' + dim + 'の構成（速報）'); }));
    return c;
  }

  // ⑤ 速報と確定統計の比べ・資料
  function checkCard() {
    var c = card('発表の一覧と、確定統計との比べ', SP + ' ' + CF);
    c.appendChild(el('p', 'dhelp', '速報は、法務省（出入国在留管理庁）が半年ごとに発表する数です。あとで e-Stat に、同じ時点のくわしい表（確定統計）が出ます。このページでは、二つを別々に記録して比べています。'));
    var rows = D.releases.slice().reverse().map(function (r) {
      return [wl(r.w), pubText(r), fmt(own('国籍・地域', '総数', r.w)), r.check, Object.keys(r.sum).map(function (k) { return k + '：' + r.sum[k]; }).join('、')];
    });
    c.appendChild(Z.tableEl(['時点', '公表日', '総数（速報）', '確定統計との比べ', '内わけの合計と総数'], rows, 2));
    var links = el('p', 'dhelp srcs'); links.innerHTML = '資料：' + D.releases.slice().reverse().map(function (r) { return '<a href="' + esc(r.page) + '">' + esc(wl(r.w)) + '</a>'; }).join('');
    c.appendChild(links);
    return c;
  }

  var box = document.getElementById('sokuho-view'), ctl = document.getElementById('sokuho-ctl');
  var nowBox = el('div'); nowBox.id = 'sokuho-now'; ctl.insertAdjacentElement('afterend', nowBox);
  function render() {
    if (D.W.indexOf(S.w) < 0) { S.w = D.W[D.W.length - 1]; }
    if (DIMS.indexOf(S.dim) < 0) { S.dim = DIMS[0]; }
    writeHash();
    ctl.replaceChildren(controls());
    nowBox.replaceChildren(nowLine());
    var out = el('div');
    [rankCard, lineCard, growCard, pieCard, checkCard].forEach(function (f) { try { out.appendChild(f()); } catch (e) { console.error(e); out.appendChild(Z.nodata('この部分を表示できませんでした')); } });
    box.replaceChildren(out);
  }
  fetch('data/sokuho.json').then(function (r) { return r.json(); }).then(function (j) { D = j; readHash(); render(); },
    function () { box.replaceChildren(Z.nodata('データを読み込めませんでした。')); });
})();
