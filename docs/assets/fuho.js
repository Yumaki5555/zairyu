/* 数でみる在留外国人：不法残留者数のページ（fuho.html）の、選んで見る部分（ダッシュボード）
   数は data/fuho.json（make_dash_data.py が データ/不法残留/ から作る）。半期速報のページ（sokuho.js）と同じ部品（dash.js の KZC）・同じ見た目。
   在留外国人統計とは別の統計なので、時点の書き方（1月1日・7月1日）・出典・ハッシュタグ・画像のタイトルは、ここで決めて画像（share.js）に渡す。
   発表にのる国籍・地域は上位10だけで、上位の顔ぶれは発表ごとに変わる。上位に入っていない時点の数は「データなし」（0人とは分ける）。
   国籍・地域の「その他」は発表ごとに中身が違うので、移り変わりの線には使わない */
(function () {
  'use strict';
  var root = document.getElementById('fuho');
  if (!root || !window.KZC) { return; }
  var K = window.KZ, Z = window.KZC, fmt = K.fmt, esc = K.esc, el = Z.el, signed = Z.signed;
  var D = null, DIMS = ['国籍・地域', '在留資格'];
  var SRC = '出入国在留管理庁「本邦における不法残留者数について」（報道発表）', TAG = '#不法残留';
  var VNOTE = '在留資格は、不法残留になったときにもっていた在留資格です。';
  var DEF = { dim: '国籍・地域', w: '', cmp: 'half', pick: [], sex: '', idx: '', from: '', to: '', nat: '' };
  var S = JSON.parse(JSON.stringify(DEF));

  function readHash() { var q = new URLSearchParams(location.hash.slice(1)); Object.keys(S).forEach(function (k) { var v = q.get(k); if (v != null) { S[k] = k === 'pick' ? v.split(',').filter(Boolean) : v; } }); }
  function writeHash() {
    var q = new URLSearchParams(); Object.keys(S).forEach(function (k) { var v = k === 'pick' ? S.pick.join(',') : S[k]; if (v) { q.set(k, v); } });
    history.replaceState(null, '', '#' + q.toString());
  }
  function set(p) { Object.keys(p).forEach(function (k) { S[k] = p[k]; }); render(); }
  function dl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日'; } // 2026-07-01 → 2026年7月1日
  function dx(w) { var p = w.split('-'); return +p[0] + (+p[1] - 1) / 12; } // 横の位置（年の目もりが1月1日）
  function pubText(s) { return s.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日'); }
  function rel(w) { return D.releases.filter(function (r) { return r.w === w; })[0]; }
  function card(id, title) { var c = el('section', 'dcard'); c.id = id; c.appendChild(el('h2', null, esc(title))); return c; }
  function srcLine(w) { var r = rel(w); return el('p', 'dsrc', esc('出典：出入国在留管理庁「' + r.title + '」（報道発表、' + pubText(r.pub) + '公表）') + ' <a href="' + esc(r.page) + '">発表のページ</a>'); }
  function srcAll() { return el('p', 'dsrc', esc('出典：' + SRC + '（各発表）')); }
  function val(dim, name, w) { var a = D.sp[dim][name], i = D.W.indexOf(w); return a && i >= 0 ? a[i] : null; }
  function sexVal(sx, name, w) { var a = D.sex[sx][name], i = D.W.indexOf(w); return a && i >= 0 ? a[i] : null; }
  function prevRel(w) { var i = D.R.indexOf(w); return i > 0 ? D.R[i - 1] : null; } // 半年前の発表
  function yearAgo(w) { var y = (+w.slice(0, 4) - 1) + w.slice(4); return D.W.indexOf(y) >= 0 ? y : null; }
  function listed(dim, w) { // その発表にのっている名前（多い順。総数・その他・技能実習の号は除く）
    return ((D.listed[w] || {})[dim] || []).slice().sort(function (a, b) { return (val(dim, b, w) || 0) - (val(dim, a, w) || 0); });
  }
  function by(dim) { return dim === '国籍・地域' ? '国籍・地域別' : '在留資格別'; }
  function who(n) { return n === '総数' ? '不法残留者' : n + 'の不法残留者'; }
  // 画像を保存（share.js）に渡すもの。タイトルはここで決める（share.js の自動のタイトルは在留外国人統計の言い方になるため）
  function cur(chart, title, note) { if (note) { chart.markNote = note; } return { title: title, autoTitle: title, chart: chart, meta: { nat: [], visa: [] }, src: SRC, tag: TAG }; }
  function tools(get) { var t = el('div', 'dtools'); if (window.KZX) { window.KZX.buttons(t, get); } return t; }
  function rate(v, b) { return b ? signed((v - b) / b * 100, 1) + '%' : '—'; }

  function controls() {
    var f = el('div', 'dfilter');
    var tab = el('div', 'stab'); tab.setAttribute('role', 'group'); tab.setAttribute('aria-label', '表');
    DIMS.forEach(function (d) { var b = el('button', null, esc(d)); b.type = 'button'; b.setAttribute('aria-pressed', S.dim === d ? 'true' : 'false'); b.addEventListener('click', function () { set({ dim: d, pick: [] }); }); tab.appendChild(b); });
    var t1 = el('div', 'dctl dwide'); t1.appendChild(el('span', 'dlab', '表')); t1.appendChild(tab); f.appendChild(t1);
    var sel = el('select'); D.R.slice().reverse().forEach(function (w) { var o = el('option'); o.value = w; o.textContent = dl(w) + '現在（' + pubText(rel(w).pub) + '公表）'; sel.appendChild(o); });
    sel.value = S.w; sel.addEventListener('change', function () { set({ w: sel.value }); });
    var t2 = el('label', 'dctl'); t2.appendChild(el('span', 'dlab', '時点（発表）')); t2.appendChild(sel); f.appendChild(t2);
    var latest = D.R[D.R.length - 1], plain = Object.keys(DEF).every(function (k) { return k === 'w' ? S.w === latest : JSON.stringify(S[k]) === JSON.stringify(DEF[k]); });
    var acts = el('div', 'dctl dacts'), reset = el('button', 'dbtn dbtn-sub', 'リセット'); reset.type = 'button'; reset.disabled = plain;
    reset.title = plain ? '選んでいる条件はありません' : '表・時点・比べるものなどを、はじめの状態に戻します';
    reset.addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEF)); S.w = latest; render(); });
    acts.appendChild(reset); f.appendChild(acts);
    return f;
  }
  function nowLine() { return el('p', 'dnow', '表示中：表 <b>' + esc(S.dim) + '</b>　時点 <b>' + esc(dl(S.w)) + '現在</b>（' + esc(pubText(rel(S.w).pub)) + '公表）'); }

  // ① ランキング（その発表の時点）
  function rankCard() {
    var w = S.w, dim = S.dim, names = listed(dim, w), total = val(dim, '総数', w), pw = prevRel(w), yw = yearAgo(w);
    var prevNames = pw ? listed(dim, pw) : [];
    var c = card('rank', dl(w) + '現在の' + by(dim) + 'ランキング');
    c.appendChild(el('p', 'stotal', '不法残留者の総数 <b>' + fmt(total) + '人</b>（' + esc(dl(w)) + '現在）'));
    var other = val(dim, 'その他', w);
    c.appendChild(el('p', 'dhelp', esc(dim === '国籍・地域' ?
      '発表に名前が出ているのは、多い' + names.length + 'の国籍・地域だけです（ほかは「その他」' + fmt(other) + '人）。' :
      VNOTE + '「その他」（' + fmt(other) + '人）は、ここに名前の出ていない在留資格を合わせた数です。')));
    var rows = names.map(function (n, k) {
      var pr = prevNames.indexOf(n);
      return { n: n, v: val(dim, n, w), k: k, p: pw ? val(dim, n, pw) : null, y: yw ? val(dim, n, yw) : null,
        move: !prevNames.length ? '—' : pr < 0 ? '前回の発表の上位になし' : pr === k ? '→' : pr > k ? '↑' + (pr - k) : '↓' + (k - pr) };
    });
    c.appendChild(Z.barList(rows.map(function (r) { return [r.n, r.v]; }), total, { rank: true }));
    var head = ['順位', dim, '人数', '構成比', '半年前から（' + (pw ? dl(pw) : '発表なし') + '）', '増加率', '1年前から（' + (yw ? dl(yw) : '数なし') + '）', '増加率', '順位の動き'];
    if (dim === '国籍・地域') { head = head.concat(['男', '女']); }
    var trs = [];
    rows.forEach(function (r) {
      var row = [r.k + 1, r.n, fmt(r.v), (r.v / total * 100).toFixed(1) + '%', r.p == null ? null : signed(r.v - r.p), r.p == null ? null : rate(r.v, r.p),
        r.y == null ? null : signed(r.v - r.y), r.y == null ? null : rate(r.v, r.y), dim === '国籍・地域' ? r.move : '—'];
      if (dim === '国籍・地域') { row.push(fmt(sexVal('男', r.n, w)), fmt(sexVal('女', r.n, w))); }
      trs.push(row);
      if (r.n === '技能実習') { // 号ごとの内わけ（ほかと一緒に足さない）
        D.subs.forEach(function (s) { var v = val(dim, s, w), p = pw ? val(dim, s, pw) : null, y = yw ? val(dim, s, yw) : null; if (v != null) { trs.push(['', 'うち ' + s, fmt(v), (v / total * 100).toFixed(1) + '%', p == null ? null : signed(v - p), p == null ? null : rate(v, p), y == null ? null : signed(v - y), y == null ? null : rate(v, y), '']); } });
      }
    });
    var tw = Z.tableEl(head, trs, 2); tw.querySelector('table').classList.add('srank');
    tw.querySelectorAll('td').forEach(function (td) { if (/^\+/.test(td.textContent) || /^↑/.test(td.textContent)) { td.classList.add('up'); } else if (/^−/.test(td.textContent) || /^↓/.test(td.textContent)) { td.classList.add('down'); } });
    c.appendChild(Z.details('半年前・1年前との比べと順位の動き' + (dim === '国籍・地域' ? '・男女' : '・技能実習の号') + 'を表で見る', tw));
    c.appendChild(el('p', 'dhelp', '2020年までは1月1日の数だけなので、2021年1月1日の「半年前」と2021年7月1日の「1年前」はありません（「—」）。前の発表の上位10に入っていなかった国籍・地域も「—」です。'));
    c.appendChild(srcLine(w));
    var chart = { kind: 'rank', rows: rows.slice(0, 10).map(function (r) { return [r.n, r.v]; }), f: function (v) { return fmt(v) + '人'; }, metric: '人数', area: '全国', when: w, what: '全国の' + dim, whenText: dl(w) + '現在' };
    c.appendChild(tools(function () { return cur(chart, '全国｜不法残留者の' + by(dim) + '人数', dim === '在留資格' ? VNOTE : ''); }));
    return c;
  }

  // ② 移り変わり（比べるものを選ぶ。国籍・地域は男女も）
  function lineCard() {
    var dim = S.dim, latest = listed(dim, D.R[D.R.length - 1]);
    var all = Object.keys(D.sp[dim]).filter(function (n) { return n !== 'その他' || dim === '在留資格'; });
    all.sort(function (a, b) { return (a === '総数' ? -1 : b === '総数' ? 1 : 0) || ((latest.indexOf(a) < 0) - (latest.indexOf(b) < 0)) || (latest.indexOf(a) - latest.indexOf(b)); });
    var pick = S.pick.filter(function (n) { return all.indexOf(n) >= 0; });
    if (!pick.length) { pick = latest.slice(0, 5); }
    var sx = dim === '国籍・地域' && (S.sex === '男' || S.sex === '女') ? S.sex : '', idx = S.idx === '1';
    var per = D.W, from = per.indexOf(S.from) >= 0 ? S.from : per[0], to = per.indexOf(S.to) >= 0 ? S.to : per[per.length - 1];
    if (from > to) { var tmp = from; from = to; to = tmp; }
    var sub = per.filter(function (w) { return w >= from && w <= to; });
    var series = pick.map(function (n, k) {
      var vals = sub.map(function (w) { return sx ? sexVal(sx, n, w) : val(dim, n, w); });
      if (idx) { var b = null; vals.forEach(function (v) { if (b == null && v) { b = v; } }); vals = vals.map(function (v) { return v == null || !b ? null : v / b * 100; }); }
      return { name: (n === '総数' ? '総数（不法残留者数）' : n) + (sx ? '（' + sx + '）' : ''), vals: vals, cls: k < 7 ? String(k + 1) : 'o' };
    });
    var c = card('trend', by(dim) + 'の移り変わり');
    var row = el('div', 'dctlrow');
    // 比べるもの（7つまで）：名前で探して選ぶ
    var ms = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel'), list = el('div', 'dmlist');
    btn.type = 'button'; btn.textContent = pick.length === 1 ? pick[0] : pick[0] + ' ほか' + (pick.length - 1);
    ms.appendChild(el('span', 'dlab', '比べるもの')); ms.appendChild(btn);
    var chosen = pick.slice();
    all.forEach(function (n) {
      var l = el('label', 'dmitem'), cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.indexOf(n) >= 0;
      cb.addEventListener('change', function () { if (cb.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } });
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + n + (latest.indexOf(n) < 0 && n !== '総数' ? '（いまは上位10の外）' : ''))); l.dataset.n = n; list.appendChild(l);
    });
    var q = el('input'); q.type = 'search'; q.placeholder = '名前で探す'; q.setAttribute('aria-label', '比べるものを名前で探す');
    q.addEventListener('input', function () { var t = q.value.trim(); Array.prototype.forEach.call(list.children, function (x) { x.hidden = !!t && x.dataset.n.indexOf(t) < 0; }); });
    var ok = el('button', 'dbtn', 'この条件で表示（7つまで）'); ok.type = 'button'; ok.addEventListener('click', function () { set({ pick: chosen.slice(0, 7) }); });
    panel.appendChild(q); panel.appendChild(list); var bar = el('div', 'dmbar'); bar.appendChild(ok); panel.appendChild(bar); ms.appendChild(panel);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); ms.classList.toggle('open'); if (ms.classList.contains('open')) { Z.fitPanel(panel); } });
    document.addEventListener('click', function (ev) { if (!ms.contains(ev.target)) { ms.classList.remove('open'); } });
    row.appendChild(ms);
    function sel(lab, v, opts, on) { var l = el('label', 'dctl'), s = el('select'); opts.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); }); s.value = v; s.addEventListener('change', function () { on(s.value); }); l.appendChild(el('span', 'dlab', lab)); l.appendChild(s); return l; }
    row.appendChild(sel('いつから', from, per.map(function (w) { return [w, dl(w)]; }), function (v) { set({ from: v }); }));
    row.appendChild(sel('いつまで', to, per.map(function (w) { return [w, dl(w)]; }), function (v) { set({ to: v }); }));
    if (dim === '国籍・地域') { row.appendChild(sel('男女', sx, [['', '男女の合計'], ['男', '男'], ['女', '女']], function (v) { set({ sex: v }); })); }
    row.appendChild(sel('目もり', idx ? '1' : '', [['', '人数'], ['1', '指数（はじめの時点＝100）']], function (v) { set({ idx: v }); }));
    c.appendChild(row);
    c.appendChild(el('p', 'dhelp', esc('2020年までは毎年1月1日の数だけです（発表の表にある時点）。2021年からは1月1日と7月1日の年2回です。' +
      (dim === '国籍・地域' ? '発表には上位10の国籍・地域しかのらないので、上位に入っていなかった時点は線が切れます（0人ではありません）。' : VNOTE) +
      (idx ? '指数は、それぞれの線のはじめの時点を100とした数です（増え方・減り方を比べるため）。' : ''))));
    c.appendChild(Z.lineChart(sub, series, { title: by(dim) + 'の移り変わり', at: sub.map(dx), lab: function (i) { return dl(sub[i]); }, index: idx }));
    var head = ['時点'].concat(series.map(function (s) { return s.name; }));
    c.appendChild(Z.details('グラフの数を表で見る', Z.tableEl(head, sub.map(function (w, j) { return [dl(w)].concat(series.map(function (s) { var v = s.vals[j]; return v == null ? null : idx ? v.toFixed(1) : fmt(v); })); }), 1)));
    c.appendChild(srcAll());
    var title = (pick.length === 1 ? '全国｜' + (pick[0] === '総数' ? '不法残留者数' : who(pick[0])) + 'の移り変わり' : '全国｜不法残留者の' + by(dim) + 'の移り変わり') + (sx ? '（' + sx + '）' : '') + (idx ? '（指数）' : '');
    var chart = { kind: 'line', per: sub, labels: sub.map(dl), at: sub.map(dx), series: series.map(function (s) { return { name: s.name, vals: s.vals, cls: s.cls }; }),
      index: idx, area: '全国', when: sub[sub.length - 1], from: sub[0], whenText: dl(sub[0]) + '〜' + dl(sub[sub.length - 1]) };
    c.appendChild(tools(function () { return cur(chart, title, dim === '在留資格' ? VNOTE : ''); }));
    return c;
  }

  // ③ 増加ランキング（人数と増加率は別々に）
  function growCard() {
    var w = S.w, dim = S.dim, bw = S.cmp === 'year' ? yearAgo(w) : prevRel(w), names = listed(dim, w);
    var c = card('grow', (S.cmp === 'year' ? '1年前' : '半年前') + 'からの増減ランキング' + (bw ? '（' + dl(bw) + '→' + dl(w) + '）' : ''));
    var tab = el('div', 'stab');
    [['half', '半年前（前の発表）と比べる'], ['year', '1年前の同じ時点と比べる']].forEach(function (x) { var b = el('button', null, x[1]); b.type = 'button'; b.setAttribute('aria-pressed', S.cmp === x[0] ? 'true' : 'false'); b.addEventListener('click', function () { set({ cmp: x[0] }); }); tab.appendChild(b); });
    c.appendChild(tab);
    var rows = bw ? names.map(function (n) { var v = val(dim, n, w), b = val(dim, n, bw); return b == null ? null : { n: n, v: v, b: b, d: v - b, r: b ? (v - b) / b * 100 : null }; }).filter(Boolean) : [];
    if (!rows.length) { c.appendChild(Z.nodata('比べる時点の数がありません（2020年までは1月1日の数だけです）')); c.appendChild(srcLine(w)); return c; }
    var grid = el('div', 'cols');
    var byD = rows.slice().sort(function (a, b) { return b.d - a.d; }), byR = rows.filter(function (r) { return r.r != null; }).sort(function (a, b) { return b.r - a.r; });
    var s1 = el('section', 'dsub'); s1.appendChild(el('h3', null, '増減の人数')); s1.appendChild(Z.barList(byD.map(function (r) { return [r.n, r.d, fmt(r.b) + '人→' + fmt(r.v) + '人']; }), null, { f: function (v) { return signed(v) + '人'; }, rank: true }));
    var s2 = el('section', 'dsub'); s2.appendChild(el('h3', null, '増減率')); s2.appendChild(Z.barList(byR.map(function (r) { return [r.n, r.r, fmt(r.b) + '人→' + fmt(r.v) + '人']; }), null, { f: function (v) { return signed(v, 1) + '%'; }, rank: true }));
    grid.appendChild(s1); grid.appendChild(s2); c.appendChild(grid);
    c.appendChild(el('p', 'dhelp', esc('増減の人数と増減率は別のものです。増減率は、もとの人数が少ないと大きく出ます。比べているのは、' + dl(w) + 'の発表で名前の出ている' + dim + 'のうち、' + dl(bw) + 'の数があるものだけです。')));
    c.appendChild(srcLine(w));
    var span = dl(bw) + ' → ' + dl(w);
    var chart = { kind: 'rank', rows: byD.slice(0, 10).map(function (r) { return [r.n, r.d]; }), f: function (v) { return signed(v) + '人'; }, metric: '増減の人数', area: '全国', when: w, what: '全国の' + dim, whenText: span };
    var chart2 = { kind: 'rank', rows: byR.slice(0, 10).map(function (r) { return [r.n, r.r]; }), f: function (v) { return signed(v, 1) + '%'; }, metric: '増減率', area: '全国', when: w, what: '全国の' + dim, whenText: span };
    var note = dim === '在留資格' ? VNOTE : '';
    var t = el('div', 'dtools');
    if (window.KZX) {
      window.KZX.buttons(t, function () { return cur(chart, '全国｜不法残留者の' + by(dim) + '増減', note); });
      var t2 = el('div', 'dtools'); window.KZX.buttons(t2, function () { return cur(chart2, '全国｜不法残留者の' + by(dim) + '増減率', note); });
      t.appendChild(el('span', 'dhelp', '↑増減の人数の画像　↓増減率の画像')); c.appendChild(t); c.appendChild(t2);
    }
    return c;
  }

  // ④ 構成の円グラフ（国籍・地域：上位7・8〜10位の合計・その他）
  function pieCard() {
    var w = S.w, dim = S.dim, names = listed(dim, w), total = val(dim, '総数', w);
    var c = card('pie', dl(w) + '現在の' + by(dim) + 'の構成');
    var parts = names.slice(0, 7).map(function (n, k) { return { name: n, v: val(dim, n, w), cls: String(k + 1) }; });
    var mid = names.slice(7).reduce(function (s, n) { return s + val(dim, n, w); }, 0), rest = total - names.reduce(function (s, n) { return s + val(dim, n, w); }, 0);
    if (mid > 0) { parts.push({ name: '8〜' + names.length + '位の合計', v: mid, cls: 'o' }); }
    if (rest > 0) { parts.push({ name: dim === '国籍・地域' ? 'その他（上位10の外の国籍・地域）' : 'その他の在留資格', v: rest, cls: 'o' }); }
    if (dim === '在留資格') { c.appendChild(el('p', 'dhelp', esc(VNOTE))); }
    c.appendChild(Z.pieChart(parts, total, dl(w) + '現在の' + by(dim) + 'の構成'));
    c.appendChild(srcLine(w));
    var chart = { kind: 'pie', parts: parts, total: total, area: '全国', when: w, whenText: dl(w) + '現在' };
    c.appendChild(tools(function () { return cur(chart, '全国｜不法残留者の' + by(dim) + '構成', dim === '在留資格' ? VNOTE : ''); }));
    return c;
  }

  // ⑤ 国籍・地域ごとの在留資格（その発表の時点）
  function crossCard() {
    var w = S.w, x = D.cross[w], nats = Object.keys(x), visas = D.visas.filter(function (v) { return D.subs.indexOf(v) < 0; });
    var n = nats.indexOf(S.nat) >= 0 ? S.nat : '総数';
    var c = card('cross', dl(w) + '現在の国籍・地域ごとの在留資格');
    var row = el('div', 'dctlrow'), l = el('label', 'dctl'), s = el('select');
    nats.forEach(function (a) { var o = el('option'); o.value = a; o.textContent = a === 'その他' ? 'その他（上位10の外の国籍・地域）' : a; s.appendChild(o); });
    s.value = n; s.addEventListener('change', function () { set({ nat: s.value }); });
    l.appendChild(el('span', 'dlab', '国籍・地域')); l.appendChild(s); row.appendChild(l); c.appendChild(row);
    c.appendChild(el('p', 'dhelp', esc(VNOTE)));
    var k = 0, parts = visas.filter(function (v) { return x[n][v] > 0; }).map(function (v) { return { name: v === 'その他' ? 'その他の在留資格' : v, v: x[n][v], cls: v === 'その他' ? 'o' : String(++k) }; });
    c.appendChild(Z.pieChart(parts, x[n]['総数'], (n === '総数' ? '' : n + 'の') + '在留資格の構成'));
    var head = ['国籍・地域', '総数'].concat(visas);
    c.appendChild(Z.details('国籍・地域 × 在留資格を表で見る', Z.tableEl(head, nats.filter(function (a) { return a !== '総数'; }).concat(['総数']).map(function (a) {
      return [a].concat([fmt(x[a]['総数'])], visas.map(function (v) { return fmt(x[a][v]); }));
    }), 1)));
    c.appendChild(srcLine(w));
    var chart = { kind: 'pie', parts: parts, total: x[n]['総数'], area: '全国', when: w, whenText: dl(w) + '現在' };
    c.appendChild(tools(function () { return cur(chart, '全国｜' + who(n === 'その他' ? '上位10の外の国籍・地域' : n) + 'の在留資格別構成', VNOTE); }));
    return c;
  }

  // ⑥ 新規不法残留者数（2026年1月1日の発表から）
  function newCard() {
    var w = S.w, dim = S.dim, nw = D.new[w], ws = Object.keys(D.new).sort();
    var c = card('new', dl(w) + '現在の新規不法残留者数');
    if (!nw) { c.appendChild(Z.nodata('新規の数は、' + ws.map(dl).join('・') + 'の発表にだけあります。上の「時点（発表）」で選んでください')); return c; }
    var rows = nw[dim], t = rows.filter(function (r) { return r[0] === '総数'; })[0], pw = prevRel(w);
    c.appendChild(el('p', 'stotal', esc(dl(pw)) + 'のあとに新しく分かり、' + esc(dl(w)) + 'も不法残留している人 <b>' + fmt(t[1]) + '人</b>（' + esc(dl(w)) + 'の不法残留者数の' + (t[1] / t[2] * 100).toFixed(1) + '%）'));
    c.appendChild(el('p', 'dhelp', esc(dl(pw) + 'にいた' + fmt(t[3]) + '人のうち、' + fmt(t[5]) + '人は数から外れています（国の発表では「減少」。送還された人・出国命令で出国した人・在留特別許可を受けた人など）。' +
      '名前の出ている' + dim + 'は、新規の人の多い順に発表にのっているものです（上のランキングの上位10とは顔ぶれが違います）。' + (dim === '在留資格' ? '「出国期間」は、在留資格を取り消されたあと、出国のために認められた期間のことです。' : ''))));
    var named = rows.filter(function (r) { return r[0] !== '総数' && r[0] !== 'その他' && D.subs.indexOf(r[0]) < 0; });
    c.appendChild(Z.barList(named.map(function (r) { return [r[0], r[1], fmt(r[2]) + '人のうち']; }), t[1], { rank: true }));
    c.appendChild(Z.details('新規・継続・減少を表で見る', Z.tableEl([dim, '新規', dl(w) + 'の数', 'そのうち新規の割合', dl(pw) + 'の数', '継続', '減少'],
      rows.map(function (r) { return [(D.subs.indexOf(r[0]) >= 0 ? 'うち ' : '') + r[0], fmt(r[1]), fmt(r[2]), r[2] ? (r[1] / r[2] * 100).toFixed(1) + '%' : '—', fmt(r[3]), fmt(r[4]), fmt(r[5])]; }), 1)));
    c.appendChild(srcLine(w));
    var chart = { kind: 'rank', rows: named.slice(0, 10).map(function (r) { return [r[0], r[1]]; }), f: function (v) { return fmt(v) + '人'; }, metric: '人数', area: '全国', when: w, what: '全国の' + dim, whenText: dl(pw) + 'のあと〜' + dl(w) };
    c.appendChild(tools(function () { return cur(chart, '全国｜新規不法残留者の' + by(dim) + '人数', dim === '在留資格' ? VNOTE : ''); }));
    return c;
  }

  // ⑦ 取り込んだ発表
  function listCard() {
    var c = card('list', '取り込んだ発表');
    c.appendChild(el('p', 'dhelp', '法務省（出入国在留管理庁）の今のサイトにある発表（2021年1月1日現在〜）です。取り込むときに、内わけの合計が総数と合うか、表どうしで同じ数か、同じ時点の数が発表によって違わないかを確かめています。'));
    c.appendChild(Z.tableEl(['時点', '公表日', '不法残留者数', '確かめ'], D.releases.slice().reverse().map(function (r) {
      return [dl(r.w) + '現在', pubText(r.pub), fmt(val('国籍・地域', '総数', r.w)), r.bad ? r.bad + '件合わない' : r.checks + '件すべて合う'];
    }), 2));
    var links = el('p', 'dhelp srcs'); links.innerHTML = '資料：' + D.releases.slice().reverse().map(function (r) { return '<a href="' + esc(r.page) + '">' + esc(dl(r.w)) + '</a>'; }).join('');
    c.appendChild(links);
    return c;
  }

  var box = document.getElementById('fuho-view'), ctl = document.getElementById('fuho-ctl');
  var nowBox = el('div'); nowBox.id = 'fuho-now'; ctl.insertAdjacentElement('afterend', nowBox);
  function render() {
    if (D.R.indexOf(S.w) < 0) { S.w = D.R[D.R.length - 1]; }
    if (DIMS.indexOf(S.dim) < 0) { S.dim = DIMS[0]; }
    writeHash();
    ctl.replaceChildren(controls());
    nowBox.replaceChildren(nowLine());
    var out = el('div');
    [rankCard, lineCard, growCard, pieCard, crossCard, newCard, listCard].forEach(function (f) { try { out.appendChild(f()); } catch (e) { console.error(e); out.appendChild(Z.nodata('この部分を表示できませんでした')); } });
    box.replaceChildren(out);
  }
  fetch('data/fuho.json').then(function (r) { return r.json(); }).then(function (j) { D = j; readHash(); render(); },
    function () { box.replaceChildren(Z.nodata('データを読み込めませんでした。')); });
})();
