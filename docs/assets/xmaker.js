/* 数でみる在留外国人：トップページの「グラフの画像を作る（X投稿用）」（2026年10月 作った人の希望で、ページのいちばん上に）
   ① 何のグラフ（国籍・地域／在留資格／地域／国籍×在留資格）② どこの・だれの（地域・国籍・在留資格）③ いつ（開始・終了）を選ぶと、
   X投稿用の画像（share.js の compose）をその場で作り直して見せる。数の取り出し方はダッシュボード（dash.js）と同じものを使う。
   決まり：データのない時点・組み合わせは推測で埋めない（「該当する統計データがありません」と理由を出す）。
   選べる時点は、選んだものの数がある時点だけにする（例：市区町村の国籍×在留資格は2023年12月末から）。
   画像の見た目・タイトル・投稿文は、ほかのページの「画像を保存」と同じ（share.js）。サイト名とアドレスは、はじめは入れない */
(function () {
  'use strict';
  var K = window.KZ, D = window.KZDATA, X = window.KZX;
  var root = document.getElementById('xmaker');
  if (!root || !K || !D || !X) { return; }
  var esc = K.esc, M = null;
  var TOP = 5; // 折れ線の本数（多い順）
  var KINDS = [['nat', '国籍・地域', '国籍・地域ごとの人数'], ['visa', '在留資格', '在留資格ごとの人数'],
    ['area', '地域', '都道府県・市区町村ごとの人数（地図）'], ['nx', '国籍×在留資格', '「ベトナム（技能実習）」のような組み合わせ']];
  var FORMS = {
    one: { nat: [['pie', '円グラフ'], ['bar', '棒（多い順）']], visa: [['pie', '円グラフ'], ['bar', '棒（多い順）']],
      area: [['map', '地図'], ['bar', '棒（多い順）']], nx: [['bar', '棒（多い順）']] },
    span: { nat: [['line', '折れ線（多い5つ）'], ['diff', '増減（棒）']], visa: [['line', '折れ線（多い5つ）'], ['diff', '増減（棒）']],
      area: [['map', '増減の地図'], ['diff', '増減（棒）'], ['line', '折れ線（地域の合計）']], nx: [['line', '折れ線（多い5組）'], ['diff', '増減（棒）']] }
  };
  var SIZES = [['wide', '横長 16:9'], ['square', '正方形'], ['tall', '縦長 4:5']];
  var S = { kind: 'nat', pref: '', muni: '', nat: '', visa: '', from: '', to: '', form: '', sort: 'now', size: 'wide' };
  // 増減の棒の並び順（はじめは終了の時点の人数が多い順）。トップページの「10年前からの増減」と同じ4つ
  var SORTS = [['now', ''], ['up', '増加人数順'], ['down', '減少人数順'], ['rate', '増減率順']];

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function wl(w) { return D.wl(w); }
  function months(w) { return +w.slice(0, 4) * 12 + +w.slice(5, 7); }
  function ymd(w) { return w.slice(0, 4) + '年' + (w.slice(5) === '12' ? '末' : +w.slice(5) + '月末'); } // 2025年末・2025年6月末
  function spanText(from, to) { var m = months(to) - months(from), y = Math.floor(m / 12), r = m % 12; return (y ? y + '年' : '') + (r ? r + 'か月' : '') + '間'; }

  // ---------- 選んだもの
  function nats() { return S.kind !== 'nat' && S.nat ? [S.nat] : []; } // 国籍で分けるときは、国籍のしぼりこみは使わない
  function visas() { return S.kind !== 'visa' && S.visa ? [S.visa] : []; }
  function areaObj() { // 地域で分ける（地図）ときは、都道府県まで（都道府県を選ぶと、その市区町村の地図）
    if (S.kind !== 'area' && S.muni) { var m = D.muni(S.muni); if (m) { return { type: 'muni', pref: m.pref, key: m.key, name: m.pref + m.name }; } }
    if (S.pref) { return { type: 'pref', pref: S.pref, key: S.pref, name: S.pref }; }
    return { type: 'japan', key: '', name: '全国' };
  }
  function lv() { return S.kind === 'area' ? (S.pref ? 'muni' : 'pref') : areaObj().type; } // どの細かさの表を使うか
  function cross() { return S.kind === 'nx' || (S.kind === 'nat' && visas().length) || (S.kind === 'visa' && nats().length) || (nats().length && visas().length); }
  function periods() { // 選んだものの数がある時点
    var l = lv();
    if (cross()) { return l === 'japan' ? M.MP : l === 'pref' ? M.pxPeriods : M.mxPeriods; }
    var lo = '';
    if (S.kind === 'nat' || nats().length) { lo = M.oldNatFrom; }
    if (S.kind === 'visa' || visas().length) { var v = l === 'muni' ? M.muniVisaFrom : M.oldVisaFrom; if (v > lo) { lo = v; } }
    return (l === 'muni' ? M.MP : M.P).filter(function (w) { return w >= lo; });
  }
  function forms() { return FORMS[S.from ? 'span' : 'one'][S.kind]; }
  function clamp() {
    var per = periods();
    if (per.indexOf(S.to) < 0) { S.to = per[per.length - 1]; }
    if (S.from && (per.indexOf(S.from) < 0 || S.from >= S.to)) { S.from = ''; }
    if (!forms().some(function (f) { return f[0] === S.form; })) { S.form = forms()[0][0]; }
  }
  function who() {
    var n = nats(), v = visas();
    if (!n.length && !v.length) { return '在留外国人'; }
    return n.length ? n[0] + 'の人' + (v.length ? '（在留資格「' + v[0] + '」）' : '') : '在留資格「' + v[0] + '」の人';
  }
  // 増減の棒のタイトル（例：新潟県上越市｜フィリピン人の在留資格別増減）で使う、短い呼び方。
  // 「朝鮮」は国籍を表すものではない記載、「無国籍」は国籍がないので「〜人」にしない。「〜共和国」「〜連邦」も「〜の人」
  function person(x) { return x === '朝鮮' ? '朝鮮籍の人' : x === '無国籍' ? '無国籍の人' : /(共和国|連邦)$/.test(x) ? x + 'の人' : x + '人'; }
  function whoT() {
    var n = nats(), v = visas();
    if (!n.length && !v.length) { return '在留外国人'; }
    return n.length ? person(n[0]) + (v.length ? '（在留資格「' + v[0] + '」）' : '') : '在留資格「' + v[0] + '」';
  }

  // ---------- 図の中身（share.js の chart）をつくる → { chart, meta, autoTitle, note } か { why }
  function cut(s, from, to) { // 移り変わりのうち、開始〜終了の分
    var i0 = s.per.indexOf(from), i1 = s.per.indexOf(to), hid = {};
    for (var i = i0; i <= i1; i++) { if (s.hid[i]) { hid[i - i0] = 1; } }
    return { per: s.per.slice(i0, i1 + 1), vals: s.val.slice(i0, i1 + 1).map(function (v, j) { return hid[j] ? null : v; }), hid: hid };
  }
  function lineOf(a, list, from, to) { // list：[{ name, nats, visas }] → 折れ線
    return Promise.all(list.map(function (it) { return D.getSeries(a, it.nats, it.visas); })).then(function (ss) {
      var per = null;
      var series = list.map(function (it, k) { var c = cut(ss[k], from, to); per = c.per; return { name: it.name, vals: c.vals, hid: c.hid, cls: String(k + 1) }; });
      return { per: per, series: series };
    });
  }
  function beforeOf(a, list, from) { // list：[{ nats, visas }] → 開始の時点の数。0人とデータなし（null）を分ける（ダッシュボードの移り変わりと同じ取り出し方）
    return Promise.all(list.map(function (it) { return D.getSeries(a, it.nats, it.visas); })).then(function (ss) {
      return ss.map(function (s) { var i = s.per.indexOf(from); return i < 0 || s.hid[i] ? null : s.val[i]; });
    });
  }
  function diffChart(rows, what, area, from, to) { // rows：[[名前, 今, 前 or null]] → 増減の棒（S.sort の並び順。比べられないものはいつもいちばん下）
    var key = { now: function (r) { return r[2]; }, up: function (r) { return r[1]; }, down: function (r) { return r[1] == null ? null : -r[1]; }, rate: function (r) { return r[4]; } }[S.sort];
    var out = rows.filter(function (r) { return r[1] != null; }).map(function (r) {
      var d = r[2] == null ? null : r[1] - r[2];
      return [r[0], d, r[1], r[2], r[2] ? d / r[2] * 100 : null];
    }).sort(function (p, q) {
      var x = key(p), y = key(q);
      if (x === null || y === null) { return x === y ? q[2] - p[2] : (x === null ? 1 : -1); }
      return y - x || q[2] - p[2];
    });
    return { kind: 'diff', rows: out, what: what, area: area, who: whoT(), from: from, when: to, sort: S.sort, count: out.length };
  }
  function build() {
    var a = areaObj(), from = S.from, to = S.to, form = S.form, n = nats(), v = visas();
    var meta = { nat: n, visa: v };
    if (S.kind === 'nat' || S.kind === 'visa') {
      var dim = S.kind, filter = dim === 'nat' ? v : n, dimName = dim === 'nat' ? '国籍・地域' : '在留資格';
      return D.getBreakdown(a, dim, to, filter).then(function (b) {
        if (!b.items.length) { return { why: b.why }; }
        var items = b.items.filter(function (x) { return x[0] !== 'その他'; });
        var total = b.total != null ? b.total : b.items.reduce(function (s, x) { return s + x[1]; }, 0);
        if (!from && form === 'pie') {
          return { chart: { kind: 'pie', parts: D.topWithOther(b.items, total, 7), total: total, area: a.name, when: to, dim: dim, items: b.items.slice(0, 10) }, meta: meta, note: b.partial };
        }
        if (!from) {
          return { chart: { kind: 'rank', rows: items.slice(0, 10).map(function (x) { return [x[0], x[1]]; }), f: D.METRICS.count.f, metric: '人数', when: to, area: a.name, what: a.name + 'の' + dimName, rt: dim },
            meta: meta, autoTitle: a.name + '　' + dimName + '別の' + who() + '（多い順）', note: b.partial };
        }
        if (form === 'diff') {
          return beforeOf(a, items.map(function (x) { return { nats: dim === 'nat' ? [x[0]] : n, visas: dim === 'visa' ? [x[0]] : v }; }), from).then(function (bs) {
            return { chart: diffChart(items.map(function (x, i) { return [x[0], x[1], bs[i]]; }), dimName, a.name, from, to), meta: meta, note: b.partial };
          });
        }
        var list = items.slice(0, TOP).map(function (x) { return { name: x[0], nats: dim === 'nat' ? [x[0]] : n, visas: dim === 'visa' ? [x[0]] : v }; });
        return lineOf(a, list, from, to).then(function (l) {
          return { chart: { kind: 'line', per: l.per, series: l.series, index: false, area: a.name, when: to, from: from, dim: dim }, meta: meta,
            note: '終了の時点に多い' + TOP + 'つの移り変わりです。' + (b.partial ? b.partial + '。' : '') };
        });
      });
    }
    if (S.kind === 'nx') {
      return D.getCombos(a, to, n, v).then(function (c) {
        if (!c.items.length) { return { why: c.why || '該当する統計データがありません' }; }
        var items = c.items.filter(function (x) { return x[0] !== 'その他' && x[1] !== 'その他'; });
        var nm = function (x) { return x[0] + '（' + x[1] + '）'; };
        var what = a.name + 'の国籍・地域×在留資格', head = a.name + '　' + (n.length || v.length ? who() + '　' : '') + '国籍・地域×在留資格';
        if (!from) {
          return { chart: { kind: 'rank', rows: items.slice(0, 10).map(function (x) { return [nm(x), x[2]]; }), f: D.METRICS.count.f, metric: '人数', when: to, area: a.name, what: what, rt: 'nx' },
            meta: meta, autoTitle: head + 'の人数（多い順）' };
        }
        if (form === 'diff') {
          return beforeOf(a, items.map(function (x) { return { nats: [x[0]], visas: [x[1]] }; }), from).then(function (bs) {
            return { chart: diffChart(items.map(function (x, i) { return [nm(x), x[2], bs[i]]; }), '国籍・地域×在留資格', a.name, from, to), meta: meta };
          });
        }
        return lineOf(a, items.slice(0, TOP).map(function (x) { return { name: nm(x), nats: [x[0]], visas: [x[1]] }; }), from, to).then(function (l) {
          return { chart: { kind: 'line', per: l.per, series: l.series, index: false, area: a.name, when: to, from: from, dim: 'nx' }, meta: meta,
            autoTitle: head + '（多い' + TOP + '組）の移り変わり', note: '終了の時点に多い' + TOP + '組の移り変わりです。' };
        });
      });
    }
    // 地域（地図）
    var l = lv(), place = l === 'pref' ? '都道府県' : S.pref + 'の市区町村';
    if (from && form === 'line') {
      return lineOf(a, [{ name: a.name, nats: n, visas: v }], from, to).then(function (r) {
        return { chart: { kind: 'line', per: r.per, series: r.series, index: false, area: a.name, when: to, from: from }, meta: meta };
      });
    }
    var regs = l === 'pref' ? D.prefRegions() : D.muniRegions(S.pref, false);
    return D.regionValues(regs, 'count', to, n, v).then(function (vals) {
      var rows = vals.map(function (x) {
        var i = x.s.per.indexOf(to), j = from ? x.s.per.indexOf(from) : -1;
        return { key: x.key, name: x.name, now: i >= 0 && !x.s.hid[i] ? x.s.val[i] : null, before: j >= 0 && !x.s.hid[j] ? x.s.val[j] : null };
      });
      if (!rows.some(function (r) { return r.now != null; })) { return { why: vals[0] && vals[0].why || '該当する統計データがありません' }; }
      if (form === 'bar') {
        return { chart: { kind: 'rank', rows: rows.filter(function (r) { return r.now != null; }).sort(function (p, q) { return q.now - p.now; }).slice(0, 10).map(function (r) { return [r.name, r.now]; }),
          f: D.METRICS.count.f, metric: '人数', when: to, area: l === 'pref' ? '全国' : S.pref, what: place, rt: l }, meta: meta, autoTitle: place + '別の' + who() + '（多い順）' };
      }
      if (form === 'diff') {
        return { chart: diffChart(rows.map(function (r) { return [r.name, r.now, r.before]; }), l === 'pref' ? '都道府県' : '市区町村', l === 'pref' ? '全国' : S.pref, from, to), meta: meta };
      }
      var roma = (M.prefs.filter(function (p) { return p[0] === S.pref; })[0] || [])[1];
      return new Promise(function (res) { K.loadShape(l === 'pref' ? 'assets/map/japan.json' : 'assets/map/pref-' + roma + '.json', res); }).then(function (shape) {
        var values = {}, names = {};
        rows.forEach(function (r) { values[r.key] = from ? (r.now != null && r.before != null ? r.now - r.before : null) : r.now; names[r.key] = r.name; });
        var f = from ? function (x) { return D.signed(x) + '人'; } : D.METRICS.count.f;
        var map = D.drawMap(shape, values, { f: f, names: names });
        var sorted = rows.filter(function (r) { return values[r.key] != null; }).sort(function (p, q) { return values[q.key] - values[p.key]; }).slice(0, 10).map(function (r) { return [r.name, values[r.key]]; });
        return { chart: { kind: 'map', shape: shape, values: values, names: names, f: f, short: D.shortOf(from ? 'diff1' : 'count'), sorted: sorted, metric: from ? '増減の人数' : '人数',
          when: to, from: from || undefined, area: l === 'pref' ? '全国' : S.pref, pop: false, cls: map._cls, legend: map._legend, level: l, rankHead: from ? '増えた順' : '多い順' },
          meta: meta, autoTitle: from ? place + '別の' + who() + 'の' + spanText(from, to) + 'の増減' : null };
      });
    });
  }

  // ---------- 画面の部品
  var ctl = el('div', 'xm-ctl'), out = el('div', 'xm-out');
  var prev = el('div', 'xm-prev'); prev.setAttribute('aria-live', 'polite');
  var noteP = el('p', 'xm-help xm-note');
  var sizeRow = el('div', 'xm-row');
  var tIn = el('input'); tIn.type = 'text';
  var tLab = el('label', 'dctl xm-title'); tLab.appendChild(el('span', 'dlab', 'タイトル（自動で作ります。書き直せます）')); tLab.appendChild(tIn);
  var siteCb = el('input'); siteCb.type = 'checkbox';
  var siteLab = el('label', 'dcheck'); siteLab.appendChild(siteCb); siteLab.appendChild(document.createTextNode(' サイト名を入れる（右下。アドレスは入れません）'));
  var acts = el('div', 'dtools xm-acts');
  var bSave = el('button', 'dbtn', 'PNGで保存'), bCopy = el('button', 'dbtn dbtn-sub', '画像をコピー'), bShare = el('button', 'dbtn dbtn-sub', '共有・写真に保存');
  [bSave, bCopy, bShare].forEach(function (b) { b.type = 'button'; acts.appendChild(b); });
  bShare.hidden = !(navigator.canShare && window.File && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var msg = el('p', 'dhelp xm-msg'); msg.setAttribute('role', 'status');
  var txt = el('textarea', 'xtext'); txt.rows = 4;
  var pLab = el('label', 'dctl'); pLab.appendChild(el('span', 'dlab', '投稿文（自動で作ります。書き直せます）')); pLab.appendChild(txt);
  var acts2 = el('div', 'dtools xm-acts'), bText = el('button', 'dbtn dbtn-sub', '投稿文をコピー'), aX = el('a', 'dbtn dbtn-sub', 'Xの投稿画面を開く');
  bText.type = 'button'; aX.target = '_blank'; aX.rel = 'noopener'; acts2.appendChild(bText); acts2.appendChild(aX);
  var xNote = el('p', 'xm-help', 'Xの投稿画面には画像は自動でつきません。先に「PNGで保存」か「画像をコピー」をして、投稿画面に画像を貼り付けてください。');
  var more = el('p', 'xm-more'), moreA = el('a', null, 'もっと細かく選ぶ・数を表で見る（ダッシュボード）→'); more.appendChild(moreA);
  [prev, noteP, sizeRow, tLab, siteLab, acts, msg, pLab, acts2, xNote, more].forEach(function (x) { out.appendChild(x); });
  var grid = el('div', 'xm-grid'); grid.appendChild(ctl); grid.appendChild(out);
  root.querySelector('.xm-body').replaceChildren(grid);

  function pickRow(key, label, opts, value, onPick, wide) { // ボタンを並べる（選んでいるものは色と「✓」）
    var g = el('div', 'xm-pick' + (wide ? ' xm-kinds' : '')); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    opts.forEach(function (o) {
      var b = el('button', null, '<b>' + esc(o[1]) + '</b>' + (o[2] ? '<small>' + esc(o[2]) + '</small>' : '')); b.type = 'button';
      b.dataset.k = key + ':' + o[0]; b.setAttribute('aria-pressed', o[0] === value ? 'true' : 'false');
      b.addEventListener('click', function () { if (b.getAttribute('aria-pressed') !== 'true') { onPick(o[0]); } }); // 画像の形は並びを作り直さないので、いまの印で見る
      g.appendChild(b);
    });
    return g;
  }
  function selRow(key, label, groups, value, onPick) { // groups：[[見出し or '', [[値, 名前]]]]
    var s = el('select'); s.dataset.k = key;
    groups.forEach(function (g) {
      var host = s;
      if (g[0]) { host = el('optgroup'); host.label = g[0]; s.appendChild(host); }
      g[1].forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; host.appendChild(op); });
    });
    s.value = value;
    s.addEventListener('change', function () { onPick(s.value); });
    var l = el('label', 'dctl'); l.appendChild(el('span', 'dlab', esc(label))); l.appendChild(s);
    return l;
  }
  function step(no, title, sub) {
    var f = el('fieldset', 'xm-step'), lg = el('legend', null, '<span class="xm-no">' + no + '</span>' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : ''));
    f.appendChild(lg); return f;
  }
  function set(patch) { Object.keys(patch).forEach(function (k) { S[k] = patch[k]; }); clamp(); render(); }

  function natGroups() { // 地域区分（州）ごと。今はない国の古い名前は入れない
    var by = {}, order = M.regions.map(function (r) { return r[0]; });
    D.natList().forEach(function (x) { if (M.natOld[x]) { return; } var r = (M.natRegion[x] || ['その他'])[0]; (by[r] = by[r] || []).push([x, x]); });
    return [['', [['', 'すべて']]]].concat(order.concat(['その他']).filter(function (r) { return by[r]; }).map(function (r) { return [r, by[r]]; }));
  }
  function controls() {
    var f1 = step(1, '何のグラフ？');
    f1.appendChild(pickRow('kind', '何のグラフ', KINDS, S.kind, function (k) { set({ kind: k, form: '' }); }, true));
    var f2 = step(2, 'どこの・だれの', '（えらばなくてもよい）'), g2 = el('div', 'xm-sels');
    g2.appendChild(selRow('pref', S.kind === 'area' ? '地図の範囲' : '地域', [['', [['', S.kind === 'area' ? '全国（都道府県ごと）' : '全国']]], ['都道府県', M.prefs.map(function (p) { return [p[0], p[0] + (S.kind === 'area' ? '（市区町村ごと）' : '')]; })]],
      S.pref, function (x) { set({ pref: x, muni: '' }); }));
    if (S.kind !== 'area' && S.pref) {
      g2.appendChild(selRow('muni', '市区町村', [['', [['', S.pref + 'の全体']]], ['', D.munisOf(S.pref).map(function (m) { return [m.key, (m.kind === '区' ? '　' : '') + m.name]; })]],
        S.muni, function (x) { set({ muni: x }); }));
    }
    if (S.kind !== 'nat') { g2.appendChild(selRow('nat', '国籍・地域', natGroups(), S.nat, function (x) { set({ nat: x }); })); }
    if (S.kind !== 'visa') { g2.appendChild(selRow('visa', '在留資格', [['', [['', 'すべて']]], ['', D.visaList().map(function (x) { return [x, x]; })]], S.visa, function (x) { set({ visa: x }); })); }
    f2.appendChild(g2);
    var per = periods(), opts = per.map(function (w) { return [w, wl(w)]; });
    var f3 = step(3, 'いつ？'), g3 = el('div', 'xm-sels');
    g3.appendChild(selRow('from', '開始', [['', [['', 'なし（1時点）']]], ['', opts.slice(0, -1)]], S.from, function (x) {
      set(x && x >= S.to ? { from: x, to: per[per.length - 1] } : { from: x }); // 終了より後を選んだときは、終了をいちばん新しい時点に
    }));
    g3.appendChild(selRow('to', S.from ? '終了' : '時点', [['', opts]], S.to, function (x) { set({ to: x }); })); // 開始より前を選んだときは、1時点だけに（clamp）
    f3.appendChild(g3);
    f3.appendChild(el('p', 'xm-help', esc(S.from ? wl(S.from) + 'から' + wl(S.to) + 'まで（' + spanText(S.from, S.to) + '）の移り変わり・増減です。' :
      '開始をえらぶと、開始から終了までの移り変わり・増減になります。') + '<br>選べるのは数がある時点だけです（' + esc(wl(per[0])) + 'から）。'));
    var nodes = [f1, f2, f3];
    if (forms().length > 1) {
      var f4 = step(4, 'グラフの形'); f4.appendChild(pickRow('form', 'グラフの形', forms(), S.form, function (x) { set({ form: x }); })); nodes.push(f4);
      if (S.form === 'diff') { // 増減の棒の並び順（画像にも、この並び順で入る）
        f4.appendChild(el('span', 'dlab xm-sortlab', '並び順'));
        f4.appendChild(pickRow('sort', '並び順', SORTS.map(function (o) { return [o[0], o[1] || ymd(S.to) + 'の人数順']; }), S.sort, function (x) { set({ sort: x }); }));
      }
    }
    var focusKey = document.activeElement && ctl.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    ctl.replaceChildren.apply(ctl, nodes);
    if (focusKey) { var back = ctl.querySelector('[data-k="' + focusKey + '"]'); if (back) { back.focus(); } } // 選びなおしても、押した所から続けて操作できる
    sizeRow.replaceChildren(el('span', 'dlab', '画像の形'), pickRow('size', '画像の形', SIZES, S.size, function (x) { S.size = x; draw(); sizeRow.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.k === 'size:' + x ? 'true' : 'false'); }); }));
  }
  function dashLink() {
    var q = new URLSearchParams();
    if (S.pref) { q.set('pref', S.pref); }
    if (S.kind !== 'area' && S.muni) { q.set('muni', S.muni); }
    if (nats().length) { q.set('nat', nats()[0]); }
    if (visas().length) { q.set('visa', visas()[0]); }
    if ((S.kind === 'nat' || S.kind === 'visa') && S.from) { q.set('v', 'trend'); q.set('cmp', S.kind); q.set('from', S.from); q.set('to', S.to); }
    else if (S.kind === 'nat' || S.kind === 'visa') { q.set('v', S.kind); q.set('when', S.to); }
    else if (S.kind === 'area') { q.set('v', 'map'); q.set('when', S.to); }
    else { q.set('v', 'rank'); q.set('rt', 'nx'); q.set('when', S.to); }
    return 'dash.html#' + q.toString();
  }

  // ---------- 画像
  var cur = null, canvas = null, busy = Promise.resolve(), token = 0;
  function sizeOf() { return X.SIZES.filter(function (s) { return s[0] === S.size; })[0]; }
  function draw() {
    if (!cur) { return; }
    canvas = X.compose([cur], sizeOf(), tIn.value, { site: siteCb.checked });
    canvas.className = 'xcanvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '画像の見本：' + tIn.value);
    prev.replaceChildren(canvas);
    if (!txt.dataset.edited) { txt.value = X.postText(cur, tIn.value); }
    aX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt.value);
    var text = canvas._text;
    busy = X.glyphs(text).then(function (got) { if (got) { draw(); } }); // まず手元の字で描き、足りない字を読み込んだら描き直す
  }
  function enable(on) { [bSave, bCopy, bShare, bText].forEach(function (b) { b.disabled = !on; }); aX.classList.toggle('xm-off', !on); }
  function render() {
    var my = ++token;
    controls();
    moreA.href = dashLink();
    prev.replaceChildren(el('span', 'xm-wait', '画像を作っています…'));
    noteP.textContent = ''; msg.textContent = ''; enable(false);
    build().then(function (r) {
      if (my !== token) { return; }
      if (r.why) {
        cur = null; canvas = null;
        prev.replaceChildren(el('p', 'dnodata', esc('該当する統計データがありません。' + r.why)));
        tIn.value = ''; txt.value = ''; return;
      }
      cur = { chart: r.chart, meta: r.meta, autoTitle: r.autoTitle };
      tIn.value = X.autoTitle(cur); delete txt.dataset.edited;
      noteP.textContent = r.note || '';
      enable(true); draw();
    }).catch(function (e) {
      if (my !== token) { return; }
      console.error(e);
      prev.replaceChildren(el('p', 'dnodata', 'データを読み込めませんでした。しばらくしてから、もう一度選んでください。'));
    });
  }
  tIn.addEventListener('input', draw);
  siteCb.addEventListener('change', draw);
  txt.addEventListener('input', function () { txt.dataset.edited = '1'; aX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt.value); });
  function fileName() { return tIn.value.replace(/[\\/:*?"<>|？\s]+/g, '_').slice(0, 60) + '_' + S.size + '.png'; }
  function withBlob(cb) { busy.then(function () { canvas.toBlob(cb, 'image/png'); }); }
  bSave.addEventListener('click', function () {
    withBlob(function (b) {
      var a = el('a'); a.href = URL.createObjectURL(b); a.download = fileName();
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      msg.textContent = '保存しました（' + a.download + '）。見つからないときは、ブラウザの「ダウンロード」を見てください。';
    });
  });
  bCopy.addEventListener('click', function () {
    if (!navigator.clipboard || !window.ClipboardItem) { msg.textContent = 'このブラウザでは画像をコピーできません。「PNGで保存」を使ってください。'; return; }
    withBlob(function (b) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { msg.textContent = '画像をコピーしました。投稿画面に貼り付けられます。'; },
        function () { msg.textContent = '画像をコピーできませんでした。「PNGで保存」を使ってください。'; });
    });
  });
  bShare.addEventListener('click', function () {
    withBlob(function (b) {
      var f = new File([b], fileName(), { type: 'image/png' });
      if (!navigator.canShare({ files: [f] })) { msg.textContent = 'このブラウザでは共有できません。「PNGで保存」を使ってください。'; return; }
      navigator.share({ files: [f], title: tIn.value }).then(function () { msg.textContent = '共有の画面を開きました。'; }, function () { /* やめたとき */ });
    });
  });
  bText.addEventListener('click', function () {
    var done = function () { msg.textContent = '投稿文をコピーしました。'; };
    if (navigator.clipboard) { navigator.clipboard.writeText(txt.value).then(done, function () { txt.select(); }); } else { txt.select(); }
  });

  D.ready().then(function (m) { M = m; clamp(); render(); }, function () { prev.replaceChildren(el('p', 'dnodata', 'データを読み込めませんでした。')); });
})();
