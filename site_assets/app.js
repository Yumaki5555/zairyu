/* 数でみる在留外国人：どのページでも使う動き
   ・ヘッダー（スマホのメニュー）、上に戻るボタン、長い一覧（名前で探す・並べ替え・もっと見る）、横にずらせる表の案内
   ・ページの中のグラフ（円グラフ・棒グラフ・表の切り替え、地図、いくつかの線の折れ線、選んで見る表、移り変わりの折れ線）と「画像を保存」
   どのグラフも、ページに書いた数（<script type="application/json">）から作る。JavaScript が動かないときは、ページの表がそのまま見える */
(function () {
  'use strict';
  var KEY = 'kazu-zairyu-chart';
  var SLOTS = 7; // 円グラフの色（多い順に7つ＋その他）
  var SRC_STAT = '出入国在留管理庁「在留外国人統計（旧登録外国人統計）」';

  function mode() { try { return localStorage.getItem(KEY) || 'pie'; } catch (e) { return 'pie'; } }
  function saveMode(m) { try { localStorage.setItem(KEY, m); } catch (e) { /* 保存できなくても動く */ } }
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  function pct(v, t) { return t ? (v / t * 100).toFixed(1) + '%' : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function data(box) { var s = box.querySelector('script[type="application/json"]'); return s ? JSON.parse(s.textContent) : null; }
  function wl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月末'; }
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) { e.setAttribute(k, attrs[k]); }
    return e;
  }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function later(f, ms) { var t = null; return function () { clearTimeout(t); t = setTimeout(f, ms || 150); }; }
  var lastPtr = 'mouse'; // 最後に押した道具（タッチなら、地図は1回目のタップで数を出す）
  document.addEventListener('pointerdown', function (ev) { lastPtr = ev.pointerType || 'mouse'; }, true);

  // ---- ヘッダー：スマホでは「メニュー」ボタンで開く。ヘッダーの高さは CSS の --hdr に入れる（下の欄がヘッダーの下に止まるように）
  var hdr = document.querySelector('header.top'), mbtn = hdr && hdr.querySelector('.menu-btn');
  function setHdr() { if (hdr) { document.documentElement.style.setProperty('--hdr', hdr.offsetHeight + 'px'); } }
  setHdr(); window.addEventListener('resize', later(setHdr));
  if (mbtn) {
    var menu = function (open) {
      hdr.classList.toggle('open', open); mbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      mbtn.querySelector('.mt').textContent = open ? '閉じる' : 'メニュー';
    };
    mbtn.addEventListener('click', function () { menu(!hdr.classList.contains('open')); });
    document.addEventListener('click', function (ev) { if (hdr.classList.contains('open') && !hdr.contains(ev.target)) { menu(false); } });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && hdr.classList.contains('open')) { menu(false); mbtn.focus(); } });
    hdr.querySelectorAll('nav.menu a').forEach(function (a) { a.addEventListener('click', function () { menu(false); }); });
  }

  // ---- 上に戻る（300px より下へ動かしたら出す）
  var toTop = mk('button', 'totop', '<span aria-hidden="true">↑</span> 上に戻る');
  toTop.type = 'button'; toTop.hidden = true; toTop.setAttribute('aria-label', 'ページのいちばん上に戻る');
  document.body.appendChild(toTop);
  function onScroll() { var show = (window.scrollY || window.pageYOffset) > 300; if (toTop.hidden === show) { toTop.hidden = !show; } }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  toTop.addEventListener('click', function () {
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
    var m = document.getElementById('main'); // キーボードで使う人は、ページの最初から続けられるように
    if (m) { m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); }
  });

  // ---- 説明の吹き出し（マウスを合わせたとき・タップしたとき）
  var tip = document.createElement('div');
  tip.className = 'tip'; tip.hidden = true; tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) { x = ev.clientX - w - 14; }
    if (y + h > window.innerHeight - 8) { y = ev.clientY - h - 14; }
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('click', function (ev) { if (!ev.target.closest || !ev.target.closest('svg, .hbars, .tiles')) { hideTip(); } });

  // ---- 画像を保存（share.js は、ボタンを押したときに読み込む）
  function loadShare() {
    if (window.KZX) { return Promise.resolve(window.KZX); }
    if (!loadShare.p) {
      loadShare.p = new Promise(function (res, rej) {
        var me = document.querySelector('script[src*="assets/app.js"]'), s = document.createElement('script');
        s.src = me ? me.src.replace('app.js', 'share.js') : 'assets/share.js';
        s.onload = function () { res(window.KZX); }; s.onerror = function () { loadShare.p = null; rej(new Error('share.js')); };
        document.head.appendChild(s);
      });
    }
    return loadShare.p;
  }
  function saveButton(getCurrent) {
    var b = mk('button', 'dbtn dbtn-sub savebtn', '画像を保存'); b.type = 'button';
    b.title = 'グラフ・対象・統計時点・凡例・出典を入れた PNG 画像（Xの投稿にも使えます）';
    b.addEventListener('click', function () {
      b.disabled = true; b.textContent = '準備しています…';
      Promise.resolve(getCurrent()).then(function (cur) {
        return loadShare().then(function (X) { b.disabled = false; b.textContent = '画像を保存'; b.focus(); X.open(function () { return cur; }); });
      }).catch(function () { b.disabled = false; b.textContent = '画像を保存'; alert('画像を作る部品を読み込めませんでした。通信のよい所で、もう一度押してください。'); });
    });
    return b;
  }
  function vtools(box) { // グラフのすぐ上の操作の行（切り替え・画像を保存）
    var t = box.querySelector(':scope > .vtools');
    if (!t) { t = mk('div', 'vtools'); box.insertBefore(t, box.firstChild); }
    return t;
  }

  // ---- 内わけ（国籍・在留資格）：円グラフ・棒グラフ・表
  function topItems(d) {
    var items = d.items.slice(0, SLOTS);
    var rest = d.total - items.reduce(function (a, b) { return a + b[1]; }, 0);
    if (rest > 0) { items.push(['その他', rest, null, true]); }
    return items;
  }

  function legendRow(it, i, total, other) {
    var li = document.createElement('li');
    var name = it[2] ? '<a href="' + esc(it[2]) + '">' + esc(it[0]) + '</a>' : esc(it[0]);
    li.innerHTML = '<span class="sw ' + (other ? 'sw-o' : 'sw-' + (i + 1)) + '"></span><span class="nm">' + name +
      '</span><span class="v">' + fmt(it[1]) + '人</span><span class="p">' + pct(it[1], total) + '</span>';
    return li;
  }

  function pie(body, d) {
    var items = topItems(d), total = d.total;
    var wrap = document.createElement('div'); wrap.className = 'pie-wrap';
    var S = 220, R = 100, r = 58, c = S / 2;
    var g = svg('svg', { viewBox: '0 0 ' + S + ' ' + S, class: 'pie', role: 'img', 'aria-label': d.title || '内わけの円グラフ' });
    var a0 = -Math.PI / 2;
    var legend = document.createElement('ul'); legend.className = 'legend';
    items.forEach(function (it, i) {
      var other = !!it[3];
      var frac = it[1] / total, a1 = a0 + frac * 2 * Math.PI;
      var p;
      if (frac >= 0.9999) {
        p = svg('circle', { cx: c, cy: c, r: (R + r) / 2, fill: 'none', 'stroke-width': R - r });
        p.setAttribute('class', 'slice ring ' + (other ? 'c-o' : 'c-' + (i + 1)));
      } else {
        var large = a1 - a0 > Math.PI ? 1 : 0;
        var pt = function (rad, a) { return (c + rad * Math.cos(a)).toFixed(2) + ',' + (c + rad * Math.sin(a)).toFixed(2); };
        p = svg('path', { d: 'M' + pt(R, a0) + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + pt(R, a1) + ' L' + pt(r, a1) +
          ' A' + r + ',' + r + ' 0 ' + large + ' 0 ' + pt(r, a0) + ' Z' });
        p.setAttribute('class', 'slice ' + (other ? 'c-o' : 'c-' + (i + 1)));
      }
      var row = legendRow(it, i, total, other);
      var html = '<b>' + esc(it[0]) + '</b><br>' + fmt(it[1]) + '人（' + pct(it[1], total) + '）';
      var on = function (ev) { p.classList.add('hl'); row.classList.add('hl'); showTip(ev, html); };
      var off = function () { p.classList.remove('hl'); row.classList.remove('hl'); hideTip(); };
      p.addEventListener('mousemove', on); p.addEventListener('mouseleave', off);
      p.addEventListener('click', on);
      row.addEventListener('mouseenter', function () { p.classList.add('hl'); row.classList.add('hl'); });
      row.addEventListener('mouseleave', function () { p.classList.remove('hl'); row.classList.remove('hl'); });
      g.appendChild(p); legend.appendChild(row);
      a0 = a1;
    });
    var t1 = svg('text', { x: c, y: c - 4, class: 'pie-c1', 'text-anchor': 'middle' }); t1.textContent = '合計';
    var t2 = svg('text', { x: c, y: c + 16, class: 'pie-c2', 'text-anchor': 'middle' }); t2.textContent = fmt(total) + '人';
    g.appendChild(t1); g.appendChild(t2);
    wrap.appendChild(g); wrap.appendChild(legend);
    body.appendChild(wrap);
    body.appendChild(mk('p', 'hint', '円の色の所を押すと（マウスを合わせると）、人数と割合が出ます。8番目より少ないものは「その他」にまとめています（全部は「表」で見られます）。'));
  }

  function bar(body, d) {
    var items = d.items.slice(0, 12), total = d.total;
    var rest = total - items.reduce(function (a, b) { return a + b[1]; }, 0);
    if (rest > 0) { items = items.concat([['その他', rest, null, true]]); }
    var max = Math.max.apply(null, items.map(function (x) { return x[1]; })) || 1;
    var ul = document.createElement('ul'); ul.className = 'hbars';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var name = it[2] ? '<a href="' + esc(it[2]) + '">' + esc(it[0]) + '</a>' : esc(it[0]);
      li.innerHTML = '<span class="nm">' + name + '</span><span class="track"><span class="fill' + (it[3] ? ' o' : '') +
        '" style="width:' + (it[1] / max * 100).toFixed(1) + '%"></span></span><span class="v">' + fmt(it[1]) +
        '人</span><span class="p">' + pct(it[1], total) + '</span>';
      var html = '<b>' + esc(it[0]) + '</b><br>' + fmt(it[1]) + '人（' + pct(it[1], total) + '）';
      li.addEventListener('mousemove', function (ev) { showTip(ev, html); });
      li.addEventListener('click', function (ev) { if (!ev.target.closest('a')) { showTip(ev, html); } });
      li.addEventListener('mouseleave', hideTip);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    body.appendChild(mk('p', 'hint', '多い12と、それより少ないものをまとめた「その他」です（全部は「表」で見られます）。'));
  }

  function drawBreakdown(box) {
    var d = box._d || (box._d = data(box));
    if (!d || !d.total) { return; }
    var m = mode();
    var body = box.querySelector('.viz-body'), table = box.querySelector('.viz-table');
    body.innerHTML = '';
    box.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'); });
    if (m === 'table') { table.hidden = false; hints(); return; }
    table.hidden = true;
    (m === 'bar' ? bar : pie)(body, d);
  }

  var boxes = Array.prototype.slice.call(document.querySelectorAll('.viz[data-viz="breakdown"]'));
  boxes.forEach(function (box) {
    var d = box._d = data(box);
    var grp = mk('div', 'modes'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'グラフの種類');
    [['pie', '円グラフ'], ['bar', '棒グラフ'], ['table', '表']].forEach(function (x) {
      var b = mk('button', null, x[1]); b.type = 'button'; b.dataset.m = x[0];
      b.addEventListener('click', function () { saveMode(x[0]); boxes.forEach(drawBreakdown); });
      grp.appendChild(b);
    });
    var t = vtools(box); t.appendChild(grp);
    if (d && d.total) {
      t.appendChild(saveButton(function () {
        return { chart: { kind: 'pie', parts: topItems(d).map(function (it, i) { return { name: it[0], v: it[1], cls: it[3] ? 'o' : String(i + 1) }; }), total: d.total,
          area: d.area, when: d.when, dim: d.dim }, meta: { nat: d.nat ? [d.nat] : [], visa: [] }, src: SRC_STAT };
      }));
    }
    drawBreakdown(box);
  });

  // ---- 日本のタイル地図（都道府県ごとの数を色の濃さで）
  var GRID = { '北海道': [12, 0], '青森県': [12, 1], '秋田県': [11, 2], '岩手県': [12, 2], '山形県': [11, 3], '宮城県': [12, 3],
    '石川県': [8, 4], '富山県': [9, 4], '新潟県': [10, 4], '福島県': [11, 4],
    '福井県': [7, 5], '岐阜県': [8, 5], '長野県': [9, 5], '群馬県': [10, 5], '栃木県': [11, 5], '茨城県': [12, 5],
    '島根県': [3, 6], '鳥取県': [4, 6], '兵庫県': [5, 6], '京都府': [6, 6], '滋賀県': [7, 6], '愛知県': [8, 6], '山梨県': [9, 6],
    '埼玉県': [10, 6], '東京都': [11, 6], '千葉県': [12, 6],
    '福岡県': [1, 7], '山口県': [2, 7], '広島県': [3, 7], '岡山県': [4, 7], '大阪府': [5, 7], '奈良県': [6, 7], '三重県': [7, 7],
    '静岡県': [9, 7], '神奈川県': [10, 7],
    '長崎県': [0, 8], '佐賀県': [1, 8], '大分県': [2, 8], '愛媛県': [3, 8], '香川県': [4, 8], '和歌山県': [6, 8],
    '熊本県': [1, 9], '宮崎県': [2, 9], '高知県': [3, 9], '徳島県': [4, 9], '鹿児島県': [1, 10], '沖縄県': [0, 11] };
  var BINS = 7;

  function cuts(values) { // 色の段の区切り：1・2・5・10・20・50…のきりのよい数で、いちばん少ない所から多い所まで（多くても6つ）
    var v = values.filter(function (x) { return x > 0; });
    if (!v.length) { return []; }
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), c = [];
    for (var k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) {
      [1, 2, 5].forEach(function (m) { var x = m * Math.pow(10, k); if (x > lo && x <= hi) { c.push(x); } });
    }
    while (c.length > BINS - 1) { c = c.filter(function (_, i) { return i % 2 === 1; }); }
    return c;
  }
  function binOf(x, cs) { var b = 0; while (b < cs.length && x >= cs[b]) { b++; } return b; }
  function shade(b, cs) { return cs.length ? Math.round(b * (BINS - 1) / cs.length) : BINS - 1; } // 段が少なくても薄い色から濃い色まで使う

  // ---- 地図：本物の形（国土地理院「地球地図日本」から作った形）と、四角を並べた地図（日本全体だけ）
  var SHAPES = {};
  function loadShape(url, cb) {
    var s = SHAPES[url];
    if (s) { if (s.done) { cb(s.data); } else { s.wait.push(cb); } return; }
    s = SHAPES[url] = { wait: [cb], done: false, data: null };
    fetch(url).then(function (r) { return r.json(); }).then(function (j) { s.data = j; })
      .catch(function () { s.data = null; })
      .then(function () { s.done = true; s.wait.forEach(function (f) { f(s.data); }); });
  }
  var MAPKEY = 'kazu-zairyu-map';
  function mapStyle() { try { return localStorage.getItem(MAPKEY) || 'shape'; } catch (e) { return 'shape'; } }
  function saveMapStyle(m) { try { localStorage.setItem(MAPKEY, m); } catch (e) { /* 保存できなくても動く */ } }
  function valText(v) { return v >= 10000 ? (v / 10000).toFixed(1) + '万' : fmt(v); }

  // 色の段と凡例の字（画面の凡例と、画像の凡例で同じものを使う）
  function legendItems(cs, unk) {
    var out = [];
    for (var i = 0; i <= cs.length; i++) {
      var lo = i === 0 ? 1 : cs[i - 1], hi = i < cs.length ? cs[i] : null;
      out.push(['b' + shade(i, cs), hi === null ? fmt(lo) + '人〜' : fmt(lo) + '〜' + fmt(hi - 1) + '人']);
    }
    out.push(['b-z', '0人']);
    if (unk) { out.push(['b-n', '公表されていない']); }
    return out;
  }
  function drawLegend(box, cs, unk) {
    var lg = box.querySelector('.map-legend'); lg.innerHTML = '<span class="lgh">色の見方（濃いほど多い）：</span>';
    box._legend = legendItems(cs, unk);
    box._legend.forEach(function (it) { var s = mk('span', 'lg', '<span class="sw ' + it[0] + '"></span>' + esc(it[1])); lg.appendChild(s); });
  }
  function classOf(box, key, v, cs) {
    var d = box._d, opt = box._opt;
    if (key.indexOf('none:') === 0) { return 'b-n'; }
    if (opt.unknown && opt.unknown.indexOf(key) >= 0) { return 'b-u'; }
    return v > 0 ? 'b' + shade(binOf(v, cs), cs) : 'b-z';
  }
  function areaName(d, key) { return key.indexOf('none:') === 0 ? (key.slice(5) || '（統計のない所）') : ((d.names && d.names[key]) || key); }
  function rankOf(opt, key) { var v = opt.values[key] || 0; if (!v) { return 0; } var r = 1; Object.keys(opt.values).forEach(function (k) { if (opt.values[k] > v) { r++; } }); return r; }
  function helpText(d) {
    if (!d.links) { return ''; }
    return '<span>▶ ' + (d.level === 'muni' ? '市区町村' : '都道府県') + 'を押すと、くわしいページへ進みます（スマホでは、1回目のタップで数を出し、もう1回で進みます）。</span>';
  }
  // 選んだ所：太い線で囲み、地図の下に名前・数・ページへのリンクを出す
  function selectArea(box, key, front) {
    var d = box._d, opt = box._opt;
    box._sel = key;
    box.querySelectorAll('.sel').forEach(function (e) { e.classList.remove('sel'); });
    var p = box._paths && box._paths[key];
    if (p) { p.classList.add('sel'); if (front) { var host = p.parentNode.tagName === 'a' ? p.parentNode : p; host.parentNode.appendChild(host); } }
    var t = box._tiles && box._tiles[key]; if (t) { t.classList.add('sel'); }
    var info = box.querySelector('.map-info'), name = areaName(d, key), memo = d.notes && d.notes[key];
    var none = key.indexOf('none:') === 0, unk = opt.unknown && opt.unknown.indexOf(key) >= 0, v = opt.values[key] || 0, r = rankOf(opt, key);
    var h = '<span><b>' + esc(name) + '</b></span>';
    if (none) { h += '<span>統計のない所です</span>'; } else if (memo) { h += '<span>' + esc(memo) + '</span>'; } else {
      h += '<span>' + esc(opt.label) + '：<b>' + (unk ? '公表されていない' : fmt(v) + '人') + '</b>' + (!unk && opt.total ? '（' + pct(v, opt.total) + '）' : '') + '</span>';
      if (r && !unk) { h += '<span class="sub">多い順で' + r + '番目</span>'; }
    }
    if (!none && d.links && d.links[key]) { h += '<a class="dbtn" href="' + esc(d.links[key]) + '">' + esc(name) + 'のページを開く →</a>'; }
    info.innerHTML = h;
    var js = box.querySelector('.map-jump select'); if (js && js.value !== key) { js.value = d.links && d.links[key] ? key : ''; }
  }
  function clearSel(box) {
    box._sel = null; box.querySelectorAll('.sel').forEach(function (e) { e.classList.remove('sel'); });
    var info = box.querySelector('.map-info'); if (info) { info.innerHTML = helpText(box._d); }
  }
  function onAreaClick(box, key, ev, hasLink) { // タッチ：1回目は選ぶだけ（数を見る）、選んである所をもう1回でページへ。マウス：すぐページへ
    if (!hasLink) { selectArea(box, key, true); return; }
    if ((lastPtr === 'touch' || lastPtr === 'pen') && box._sel !== key) { ev.preventDefault(); selectArea(box, key, true); }
  }

  function drawTiles(box, d, opt, cs) {
    var grid = box.querySelector('.tiles'); grid.innerHTML = '';
    var vals = opt.values; box._tiles = {};
    Object.keys(GRID).forEach(function (pref) {
      var v = vals[pref] || 0;
      var a = document.createElement(d.links && d.links[pref] ? 'a' : 'div');
      if (a.tagName === 'A') { a.href = d.links[pref]; }
      a.className = 'tile ' + classOf(box, pref, v, cs);
      a.style.gridColumn = (GRID[pref][0] + 1); a.style.gridRow = (GRID[pref][1] + 1);
      a.innerHTML = '<span class="tn">' + esc(pref.replace(/[都府県]$/, '')) + '</span><span class="tv">' + valText(v) + '</span>';
      var html = '<b>' + esc(pref) + '</b><br>' + esc(opt.label) + '：' + fmt(v) + '人' + (opt.total ? '（' + pct(v, opt.total) + '）' : '');
      a.setAttribute('aria-label', pref + ' ' + fmt(v) + '人');
      a.addEventListener('mousemove', function (ev) { showTip(ev, html); });
      a.addEventListener('mouseleave', hideTip);
      a.addEventListener('click', function (ev) { onAreaClick(box, pref, ev, a.tagName === 'A'); });
      a.addEventListener('focus', function () { selectArea(box, pref); });
      grid.appendChild(a); box._tiles[pref] = a;
    });
  }

  function drawShape(box, d, opt, cs, shape) {
    var holder = box.querySelector('.map-shape'); holder.innerHTML = '';
    if (!shape) { holder.innerHTML = '<p class="note">地図の形を読み込めませんでした（下の表をご覧ください）。</p>'; return; }
    var g = svg('svg', { viewBox: '0 0 ' + shape.w + ' ' + shape.h, class: 'jmap', role: 'img', 'aria-label': opt.label + 'の地図' });
    var parts = shape.prefs || shape.areas, drawn = {};
    box._paths = {}; box._cls = {};
    (shape.frames || []).forEach(function (f) { // 島の集まりごとの枠（沖縄県）
      var b = f.box;
      g.appendChild(svg('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'frame', rx: 6 }));
      var t = svg('text', { x: b[0] + 8, y: b[1] + 20, class: 'frame-lb' }); t.textContent = f.label; g.appendChild(t);
    });
    Object.keys(parts).forEach(function (key) {
      var none = key.indexOf('none:') === 0, unk = !none && opt.unknown && opt.unknown.indexOf(key) >= 0, memo = d.notes && d.notes[key];
      var v = opt.values[key] || 0, cls = classOf(box, key, v, cs);
      var p = svg('path', { d: parts[key], class: 'area ' + cls });
      box._cls[key] = cls;
      var name = areaName(d, key);
      var html = '<b>' + esc(name) + '</b>' + (none ? '' : memo ? '<br>' + esc(memo) : '<br>' + esc(opt.label) + '：' +
        (unk ? '公表されていない（外国人が10人以下の市町村）' : fmt(v) + '人' + (opt.total ? '（' + pct(v, opt.total) + '）' : '')));
      var el = p, link = !none && d.links && d.links[key];
      if (link) {
        el = svg('a', { href: d.links[key] }); el.appendChild(p);
        el.setAttribute('aria-label', name + ' ' + (unk ? '公表されていない' : fmt(v) + '人'));
        el.addEventListener('focus', function () { selectArea(box, key); });
      }
      el.addEventListener('click', function (ev) { onAreaClick(box, key, ev, !!link); });
      p.addEventListener('mousemove', function (ev) { p.classList.add('hl'); showTip(ev, html); });
      p.addEventListener('mouseleave', function () { p.classList.remove('hl'); hideTip(); });
      g.appendChild(el);
      drawn[key] = { path: p, html: html };
      box._paths[key] = p;
    });
    if (shape.inset) { // 左上の枠（沖縄県）：島が小さいので、枠の中のどこでもその県として押せる
      var b = shape.inset, ik = shape.inset_key, r = svg('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'inset', rx: 6 }), re = r;
      if (ik && drawn[ik]) {
        r.addEventListener('mousemove', function (ev) { drawn[ik].path.classList.add('hl'); showTip(ev, drawn[ik].html); });
        r.addEventListener('mouseleave', function () { drawn[ik].path.classList.remove('hl'); hideTip(); });
        if (d.links && d.links[ik]) { re = svg('a', { href: d.links[ik] }); re.setAttribute('aria-hidden', 'true'); re.setAttribute('tabindex', '-1'); re.appendChild(r); }
        re.addEventListener('click', function (ev) { onAreaClick(box, ik, ev, re !== r); });
      }
      g.insertBefore(re, g.firstChild);
    }
    holder.appendChild(g);
    if (shape.note) { var n = document.createElement('p'); n.className = 'note'; n.textContent = shape.note; holder.appendChild(n); }
    if (box._sel) { selectArea(box, box._sel); }
  }

  function drawMap(box) {
    var d = box._d || (box._d = data(box));
    var sel = box.querySelector('.map-ctl select');
    var opt = box._opt = d.options[sel ? sel.selectedIndex : 0];
    var vals = opt.values, cs = box._cs = cuts(Object.keys(vals).map(function (k) { return vals[k]; }));
    drawLegend(box, cs, opt.unknown && opt.unknown.length);
    var now = box.querySelector('.map-now');
    if (now) { now.innerHTML = '地図の色：<b>' + esc(opt.label) + '</b>' + (d.when ? '（' + esc(wl(d.when)) + '）' : ''); }
    var style = d.tiles ? mapStyle() : 'shape';
    box.querySelectorAll('.map-style button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === style ? 'true' : 'false'); });
    var tilesWrap = box.querySelector('.tiles-wrap'), shapeWrap = box.querySelector('.map-shape');
    if (tilesWrap) { tilesWrap.hidden = style !== 'tile'; }
    shapeWrap.hidden = style !== 'shape';
    if (box._sel) { selectArea(box, box._sel); } else { clearSel(box); }
    if (style === 'tile') { drawTiles(box, d, opt, cs); if (box._sel) { selectArea(box, box._sel); } hints(); return; }
    loadShape(d.shape, function (shape) { drawShape(box, d, opt, cs, shape); });
  }
  function mapWho(label, d) { // 地図の選び方の名前から、画像のタイトル・説明に使う「だれの数か」
    var m = /^国籍・地域：(.+)$/.exec(label), v = /^在留資格：(.+)$/.exec(label);
    if (m) { return { nat: [m[1]], visa: [], who: m[1] + 'の人' }; }
    if (v) { return { nat: [], visa: [v[1]], who: '在留資格「' + v[1] + '」の人' }; }
    if (d.nat) { return { nat: [d.nat], visa: [], who: d.nat + 'の人' }; }
    return { nat: [], visa: [], who: '在留外国人' };
  }
  var mapBoxes = Array.prototype.slice.call(document.querySelectorAll('.viz[data-viz="map"]'));
  mapBoxes.forEach(function (box) {
    var d = data(box); box._d = d;
    var ctl = box.querySelector('.map-ctl');
    if (!ctl) { ctl = mk('div', 'map-ctl'); box.insertBefore(ctl, box.firstChild); }
    var sel = ctl.querySelector('select');
    if (sel) { sel.addEventListener('change', function () { drawMap(box); }); }
    if (d.tiles) {
      var grp = mk('div', 'modes map-style'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', '地図の見せ方');
      [['shape', '地図の形'], ['tile', '四角で並べる']].forEach(function (x) {
        var b = mk('button', null, x[1]); b.type = 'button'; b.dataset.m = x[0];
        b.addEventListener('click', function () { saveMapStyle(x[0]); mapBoxes.forEach(drawMap); });
        grp.appendChild(b);
      });
      var lab = mk('div', 'dctl'); lab.appendChild(mk('span', 'dlab', '地図の見せ方')); lab.appendChild(grp); ctl.appendChild(lab);
    }
    ctl.appendChild(saveButton(function () {
      return new Promise(function (res) {
        loadShape(d.shape, function (shape) {
          if (!shape) { res(null); return; }
          var opt = box._opt, cls = {}, parts = shape.prefs || shape.areas;
          Object.keys(parts).forEach(function (k) { cls[k] = classOf(box, k, opt.values[k] || 0, box._cs); });
          var w = mapWho(opt.label, d);
          var sorted = Object.keys(opt.values).filter(function (k) { return opt.values[k] > 0; }).sort(function (a, b) { return opt.values[b] - opt.values[a]; })
            .slice(0, 10).map(function (k) { return [areaName(d, k), opt.values[k]]; });
          res({ chart: { kind: 'map', shape: shape, cls: cls, legend: box._legend, sorted: sorted, f: function (v) { return fmt(v) + '人'; }, metric: '人数',
            when: d.when, area: d.area, level: d.level }, meta: { nat: w.nat, visa: w.visa }, src: SRC_STAT,
            autoTitle: (d.level === 'muni' ? d.area + 'の市区町村別　' : '都道府県別　') + w.who + 'の数（' + wl(d.when) + '）' });
        });
      });
    }));
    var now = mk('p', 'map-now'); ctl.insertAdjacentElement('afterend', now);
    var info = mk('div', 'map-info'); info.setAttribute('aria-live', 'polite');
    box.querySelector('.map-legend').insertAdjacentElement('afterend', info);
    if (d.links) { // 小さくて押しにくい所は、一覧から選べるように
      var keys = Object.keys(d.links), js = mk('select');
      js.appendChild(new Option('選んでください', ''));
      keys.forEach(function (k) { js.appendChild(new Option(areaName(d, k), k)); });
      var jl = mk('label', 'dctl'); jl.appendChild(mk('span', 'dlab', '地図で押しにくいときは、ここから' + (d.level === 'muni' ? '市区町村' : '都道府県') + 'を選べます')); jl.appendChild(js);
      var jw = mk('div', 'map-jump'); jw.appendChild(jl); info.insertAdjacentElement('afterend', jw);
      js.addEventListener('change', function () { if (js.value) { selectArea(box, js.value, true); } else { clearSel(box); } });
    }
    drawMap(box);
  });

  // ---- 移り変わりの折れ線（いくつかの線：国籍ごとの在留資格など）。凡例を押すと線を消す・出す。表にも切り替えられる
  function niceStep(v) {
    var k = Math.pow(10, Math.floor(Math.log10(v || 1)));
    var r = [1, 2, 2.5, 5, 10].map(function (m) { return m * k; }).filter(function (x) { return x >= v; });
    return r[0];
  }
  function lineSet(box) { var sel = box.querySelector('.lines-ctl select'); return box._d.sets[sel ? sel.selectedIndex : 0]; }
  function drawLines(box) {
    var d = box._d, ds = lineSet(box);
    var mode = box._mode || 'line', hidden = box._hidden || (box._hidden = {});
    box.querySelectorAll('.lines-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === mode ? 'true' : 'false'); });
    var body = box.querySelector('.lines-body'); body.innerHTML = '';
    var now = box.querySelector('.vnow'); if (now) { now.innerHTML = '表示中：<b>' + esc(ds.label) + '</b>（各年12月末、' + esc(ds.whens[0]) + '〜' + esc(ds.whens[ds.whens.length - 1]) + '年）'; }
    var cls = function (i, s) { return s.other ? 'o' : String(i + 1); };
    if (mode === 'table') {
      var h = '<div class="scroll"><table class="t"><tr><th>年</th>' + ds.series.map(function (s) { return '<th class="n">' + esc(s.name) + '</th>'; }).join('') + '</tr>';
      ds.whens.forEach(function (w, j) {
        h += '<tr><td>' + esc(w) + '</td>' + ds.series.map(function (s) { return '<td class="n">' + (s.values[j] === null ? '—' : fmt(s.values[j])) + '</td>'; }).join('') + '</tr>';
      });
      body.innerHTML = h + '</table></div><p class="hint">「—」はその年にはなかった在留資格です。</p>';
      hints();
      return;
    }
    var narrow = box.clientWidth < 500; // スマホでは縦に長く（文字は CSS で大きくなる）
    var W = 720, H = narrow ? 480 : 320, L = 78, R = 28, T = ds.mark ? 28 : 14, B = narrow ? 44 : 32, n = ds.whens.length;
    var vis = ds.series.filter(function (s) { return !hidden[s.name]; });
    var top = Math.max.apply(null, [1].concat(vis.map(function (s) { return Math.max.apply(null, s.values.map(function (v) { return v || 0; })); })));
    var step = niceStep(top * 1.05 / 5), nt = Math.ceil(top * 1.05 / step), ymax = step * nt;
    var X = function (j) { return L + (n > 1 ? j / (n - 1) : 0.5) * (W - L - R); };
    var Y = function (v) { return T + (1 - v / ymax) * (H - T - B); };
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart lines', role: 'img', 'aria-label': ds.label + 'の在留資格の移り変わり' });
    for (var k = 0; k <= nt; k++) {
      g.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: Y(step * k), y2: Y(step * k) }));
      var t = svg('text', { class: 'ax', x: L - 6, y: Y(step * k) + 4, 'text-anchor': 'end' });
      t.textContent = step * k >= 10000 ? (step * k / 10000) + '万' : fmt(step * k);
      g.appendChild(t);
    }
    var every = n > 10 ? (narrow ? 4 : 2) : 1;
    ds.whens.forEach(function (w, j) {
      if ((n - 1 - j) % every) { return; } // いちばん新しい年から数えて、いくつかおき
      var t = svg('text', { class: 'ax', x: X(j), y: H - 10, 'text-anchor': 'middle' }); t.textContent = w; g.appendChild(t);
    });
    if (ds.mark) { // 数え方が変わった所（2011年末と2012年末の間）
      var mx = (X(ds.mark - 1) + X(ds.mark)) / 2;
      g.appendChild(svg('line', { class: 'mark', x1: mx, x2: mx, y1: T, y2: H - B }));
      var t1 = svg('text', { class: 'ax mk', x: mx - 4, y: T - 8, 'text-anchor': 'end' }); t1.textContent = '←登録外国人統計'; g.appendChild(t1);
      var t2 = svg('text', { class: 'ax mk', x: mx + 4, y: T - 8 }); t2.textContent = '在留外国人統計→'; g.appendChild(t2);
    }
    ds.series.forEach(function (s, i) {
      if (hidden[s.name]) { return; }
      var dd = '', pen = false;
      s.values.forEach(function (v, j) {
        if (v === null) { pen = false; return; }
        dd += (pen ? 'L' : 'M') + X(j).toFixed(1) + ',' + Y(v).toFixed(1); pen = true;
      });
      g.appendChild(svg('path', { d: dd, class: 'ln s-' + cls(i, s) }));
      s.values.forEach(function (v, j) { if (v !== null) { g.appendChild(svg('circle', { cx: X(j), cy: Y(v), r: 3.5, class: 'pt s-' + cls(i, s) })); } });
    });
    var cross = svg('line', { class: 'cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' }); g.appendChild(cross);
    var hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
    var move = function (ev) {
      var r = g.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
      var j = Math.max(0, Math.min(n - 1, Math.round((x - L) / ((W - L - R) / Math.max(1, n - 1)))));
      cross.setAttribute('x1', X(j)); cross.setAttribute('x2', X(j)); cross.setAttribute('visibility', 'visible');
      var rows = ds.series.map(function (s, i) { return [s, i]; }).filter(function (x) { return !hidden[x[0].name] && x[0].values[j] !== null; })
        .sort(function (a, b) { return b[0].values[j] - a[0].values[j]; });
      showTip(ev, '<b>' + esc(ds.whens[j]) + '年12月末</b>' + rows.map(function (x) {
        return '<br><span class="sw sw-' + cls(x[1], x[0]) + '"></span> ' + esc(x[0].name) + '：' + fmt(x[0].values[j]) + '人';
      }).join(''));
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('click', move);
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    g.appendChild(hit);
    body.appendChild(g);
    body.appendChild(mk('p', 'hint', '線の上を押すと（マウスを合わせると）、その年の数が出ます。下の名前を押すと、その線を消したり出したりできます（残った線に合わせて目もりが変わります）。'));
    var lg = document.createElement('div'); lg.className = 'lines-legend';
    ds.series.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lgb' + (hidden[s.name] ? ' off' : '');
      b.setAttribute('aria-pressed', hidden[s.name] ? 'false' : 'true');
      var last = s.values[s.values.length - 1];
      b.innerHTML = '<span class="sw sw-' + cls(i, s) + '"></span>' + esc(s.name) + (last !== null ? ' <span class="sub">' + fmt(last) + '人</span>' : '');
      b.title = hidden[s.name] ? 'この線を出す' : 'この線を消す';
      b.addEventListener('click', function () { hidden[s.name] = !hidden[s.name]; drawLines(box); });
      lg.appendChild(b);
    });
    body.appendChild(lg);
  }
  document.querySelectorAll('.viz[data-viz="lines"]').forEach(function (box) {
    var d = box._d = data(box);
    var grp = mk('div', 'modes lines-mode'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'グラフの種類');
    [['line', '折れ線'], ['table', '表']].forEach(function (x) {
      var b = mk('button', null, x[1]); b.type = 'button'; b.dataset.m = x[0];
      b.addEventListener('click', function () { box._mode = x[0]; drawLines(box); });
      grp.appendChild(b);
    });
    var t = vtools(box), ctl = box.querySelector('.lines-ctl');
    if (ctl) { t.appendChild(ctl); ctl.classList.add('dctl'); }
    t.appendChild(grp);
    t.appendChild(saveButton(function () {
      var ds = lineSet(box), hidden = box._hidden || {}, cls = function (i, s) { return s.other ? 'o' : String(i + 1); };
      var series = ds.series.map(function (s, i) { return { name: s.name, vals: s.values, cls: cls(i, s) }; }).filter(function (s) { return !hidden[s.name]; });
      var per = ds.whens.map(function (y) { return y + '-12'; });
      return { chart: { kind: 'line', per: per, series: series, index: false, area: d.area, when: per[per.length - 1], from: per[0] },
        meta: { nat: ds.nat ? [ds.nat] : [], visa: [] }, src: SRC_STAT, autoTitle: d.area + 'の' + (ds.nat ? ds.nat + 'の人' : '在留外国人') + 'の在留資格の移り変わり' };
    }));
    t.insertAdjacentElement('afterend', mk('p', 'vnow'));
    var sel = box.querySelector('.lines-ctl select');
    if (sel) { sel.addEventListener('change', function () { box._hidden = {}; drawLines(box); }); }
    drawLines(box);
  });

  // ---- 移り変わりの折れ線（ページに書いたもの）：点を押す・なぞると数が出る。画像を保存
  document.querySelectorAll('.viz[data-viz="trend"]').forEach(function (box) {
    var d = data(box), g = box.querySelector('svg.chart');
    if (!d || !g) { return; }
    var dots = Array.prototype.slice.call(g.querySelectorAll('circle.dot')), on = null, vb = g.viewBox.baseVal;
    dots.forEach(function (c) { var t = c.querySelector('title'); c._t = t ? t.textContent : ''; if (t) { t.remove(); } }); // ブラウザの小さな説明と二重にならないように
    var pick = function (ev) {
      var r = g.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * vb.width, best = null, bd = 1e9;
      dots.forEach(function (c) { var dd = Math.abs(+c.getAttribute('cx') - x); if (dd < bd) { bd = dd; best = c; } });
      if (!best) { return; }
      if (on && on !== best) { on.classList.remove('on'); }
      on = best; best.classList.add('on');
      var p = best._t.split('：'); showTip(ev, '<b>' + esc(p[0]) + '</b><br>' + esc(p.slice(1).join('：')));
    };
    g.addEventListener('pointermove', pick); g.addEventListener('click', pick);
    g.addEventListener('pointerleave', function () { if (on) { on.classList.remove('on'); } hideTip(); });
    var t = vtools(box);
    t.appendChild(mk('span', 'sub', esc(d.area) + '・' + esc(wl(d.per[0])) + '〜' + esc(wl(d.per[d.per.length - 1]))));
    t.appendChild(saveButton(function () {
      return { chart: { kind: 'line', per: d.per, series: [{ name: d.area, vals: d.vals, cls: '1' }], index: false, area: d.area, when: d.per[d.per.length - 1], from: d.per[0] },
        meta: { nat: d.nat ? [d.nat] : [], visa: [] }, src: SRC_STAT };
    }));
    g.insertAdjacentElement('afterend', mk('p', 'hint', '線の上を押すと（マウスを合わせると）、その時点の数が出ます。'));
  });

  // ---- 選んで見る表（国籍を選んで市区町村の多い順／都道府県を選んで市区町村の多い順）
  document.querySelectorAll('.viz[data-viz="pick"]').forEach(function (box) {
    var d = data(box), sel = box.querySelector('select'), out = box.querySelector('.pick-body');
    var more = box.querySelector('.pick-more'), now = mk('p', 'vnow');
    out.parentNode.insertBefore(now, out);
    var all = false;
    function draw() {
      var k = sel.value;
      var rows = d.rows.filter(function (r) { return d.filter ? (k === '' || r[d.filter] === k) : true; });
      var col = d.filter ? d.value : d.cols.indexOf(k);
      rows = rows.map(function (r) { return [r, d.filter ? r[col] : r[3][col]]; }).filter(function (x) { return x[1] > 0; });
      rows.sort(function (a, b) { return b[1] - a[1]; });
      var n = rows.length, lim = all ? n : Math.min(n, d.limit || 30);
      var max = n ? rows[0][1] : 1;
      now.innerHTML = '表示中：<b>' + esc(d.filter ? (k || '全国') + 'の市区町村' : k + 'の人') + '</b>の多い順（全' + n + '件のうち ' + lim + '件）';
      var h = '<table class="t"><tr><th class="n">順位</th><th>' + esc(d.head) + '</th><th class="n">人数</th><th class="barcol"></th><th class="n">' + esc(d.share) + '</th></tr>';
      for (var i = 0; i < lim; i++) {
        var r = rows[i][0], v = rows[i][1], base = d.filter ? r[d.base] : r[3][0];
        var nm = r[1] ? '<a href="' + esc(r[1]) + '">' + esc(r[0]) + '</a>' : esc(r[0]);
        if (d.sub) { nm += ' <span class="sub">' + esc(r[d.sub]) + '</span>'; }
        h += '<tr><td class="n">' + (i + 1) + '</td><td>' + nm + '</td><td class="n">' + fmt(v) + '</td><td class="barcol"><span class="bar" style="width:' +
          (v / max * 100).toFixed(1) + '%"></span></td><td class="n">' + pct(v, base) + '</td></tr>';
      }
      out.innerHTML = h + '</table>' + (n ? '' : '<p class="tnone">この条件の数はありません。</p>');
      if (more) { more.hidden = n <= (d.limit || 30); more.textContent = all ? '最初の' + (d.limit || 30) + '件だけにする' : 'すべて表示する（全' + n + '件）'; }
      hints();
    }
    sel.addEventListener('change', function () { all = false; draw(); });
    if (more) { more.className = 'dbtn dbtn-sub pick-more'; more.addEventListener('click', function () { all = !all; draw(); if (!all) { box.scrollIntoView({ block: 'start' }); } }); }
    draw();
  });

  // ---- 長い一覧：名前で探す・並べ替え・もっと見る（行はページに全部書いてあり、隠しているだけ）。選んだ状態は、戻ってきたときのために残す
  function kana(s) { // ひらがなとカタカナ、全角と半角を区別せずに探す
    return String(s || '').normalize('NFKC').toLowerCase().replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }).replace(/\s+/g, '');
  }
  var TKEY = 'kz-tbl:' + location.pathname;
  function tstate() { try { return JSON.parse(sessionStorage.getItem(TKEY) || '{}'); } catch (e) { return {}; } }
  function tsave(id, st) { try { var a = tstate(); a[id] = st; sessionStorage.setItem(TKEY, JSON.stringify(a)); } catch (e) { /* 残せなくても動く */ } }
  document.querySelectorAll('.tbl').forEach(function (wrap, ti) {
    var table = wrap.querySelector('table'), tbody = table && table.tBodies[0];
    if (!tbody) { return; }
    var rows = Array.prototype.slice.call(tbody.rows), limit = +wrap.dataset.limit || 20, step = limit;
    var sorts = wrap.dataset.sorts ? JSON.parse(wrap.dataset.sorts) : [], namecol = +(wrap.dataset.namecol || 0);
    var id = wrap.id || 't' + ti, saved = tstate()[id] || {};
    var shown = Math.max(limit, saved.shown || limit), q = saved.q || '', si = saved.s || 0;
    if (si >= sorts.length) { si = 0; }
    rows.forEach(function (r, i) { r._i = i; r._name = kana(r.dataset.name || r.cells[namecol].textContent); });
    if (rows.length <= limit && !wrap.dataset.search && sorts.length < 2) { return; }
    var tools = mk('div', 'ttools'), qi = null, ss = null;
    if (wrap.dataset.search) {
      var ql = mk('label', 'dctl tq'); ql.appendChild(mk('span', 'dlab', esc(wrap.dataset.search)));
      qi = mk('input'); qi.type = 'search'; qi.value = q; qi.placeholder = wrap.dataset.example ? '例：' + wrap.dataset.example : '名前を入れる'; qi.setAttribute('enterkeyhint', 'search');
      ql.appendChild(qi); tools.appendChild(ql);
      qi.addEventListener('input', function () { q = qi.value; apply(); });
    }
    if (sorts.length > 1) {
      var sl = mk('label', 'dctl'); sl.appendChild(mk('span', 'dlab', '並べ方'));
      ss = mk('select'); sorts.forEach(function (s, i) { ss.appendChild(new Option(s[0], i)); }); ss.value = si;
      sl.appendChild(ss); tools.appendChild(sl);
      ss.addEventListener('change', function () { si = +ss.value; apply(); });
    }
    wrap.insertBefore(tools, wrap.firstChild);
    var foot = mk('div', 'tmore'), count = mk('span', 'tcount'); count.setAttribute('role', 'status');
    var none = mk('p', 'tnone'); none.hidden = true;
    var bMore = mk('button', 'dbtn dbtn-sub'), bAll = mk('button', 'dbtn dbtn-sub'), bLess = mk('button', 'dbtn dbtn-sub');
    [bMore, bAll, bLess].forEach(function (b) { b.type = 'button'; });
    foot.appendChild(count); foot.appendChild(bMore); foot.appendChild(bAll); foot.appendChild(bLess);
    wrap.appendChild(none); wrap.appendChild(foot);
    bMore.addEventListener('click', function () { shown += step; apply(); });
    bAll.addEventListener('click', function () { shown = rows.length; apply(); });
    bLess.addEventListener('click', function () { shown = limit; apply(); wrap.scrollIntoView({ block: 'start' }); });
    function val(r, c) { var cell = r.cells[c], v = cell && cell.dataset.v; return v == null ? (cell ? cell.textContent.trim() : '') : (v === '' ? null : +v); }
    function apply() {
      var s = sorts[si], list = rows.slice();
      if (s) {
        list.sort(function (a, b) {
          var x = val(a, s[1]), y = val(b, s[1]);
          if (x === null || y === null) { return x === y ? a._i - b._i : (x === null ? 1 : -1); } // 数のないもの（「—」）は、いつもいちばん下
          var c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ja');
          return c * s[2] || a._i - b._i;
        });
      }
      var qq = kana(q), match = qq ? list.filter(function (r) { return r._name.indexOf(qq) >= 0; }) : list;
      var lim = qq ? match.length : Math.min(shown, match.length);
      var frag = document.createDocumentFragment(); list.forEach(function (r) { frag.appendChild(r); }); tbody.appendChild(frag);
      list.forEach(function (r) { r.hidden = true; }); match.slice(0, lim).forEach(function (r) { r.hidden = false; });
      count.textContent = qq ? '「' + q.trim() + '」に合うもの ' + match.length + '件' : '全' + rows.length + '件のうち ' + lim + '件を表示中' + (s ? '（' + s[0] + '）' : '');
      none.hidden = !(qq && !match.length);
      none.textContent = '「' + q.trim() + '」に合う名前はありません。ひらがな・カタカナ・漢字を変えたり、短くしたりして試してください。';
      bMore.hidden = !!qq || lim >= match.length; bMore.textContent = 'もっと見る（あと' + Math.min(step, match.length - lim) + '件）';
      bAll.hidden = !!qq || lim >= match.length || match.length - lim <= step; bAll.textContent = 'すべて表示する（全' + match.length + '件）';
      bLess.hidden = !!qq || lim <= limit; bLess.textContent = '最初の' + limit + '件だけにする';
      tsave(id, { q: q, s: si, shown: shown });
      hints();
    }
    apply();
  });

  // ---- 地域を名前で探す（地域から探すのページ）。data：[[名前, 補足, リンク, 人数], …]
  document.querySelectorAll('.finder').forEach(function (f) {
    var list = data(f), qi = f.querySelector('input'), out = f.querySelector('.fresults'), st = f.querySelector('.fcount');
    if (!list || !qi) { return; }
    list.forEach(function (r) { r._k = kana(r[0]); });
    function run() {
      var q = kana(qi.value);
      if (!q) { out.innerHTML = ''; st.textContent = '名前の一部を入れると、合う都道府県・市区町村が出ます。'; return; }
      var hits = list.filter(function (r) { return r._k.indexOf(q) >= 0; })
        .sort(function (a, b) { return (b._k.indexOf(q) === 0) - (a._k.indexOf(q) === 0) || b[3] - a[3]; });
      st.textContent = hits.length ? hits.length + '件見つかりました' + (hits.length > 30 ? '（人数の多い30件を表示しています。もっとくわしく入れると絞れます）' : '') :
        '「' + qi.value.trim() + '」に合う名前はありません。漢字で、名前の一部を入れてください（例：「新宿」「浜松」）。';
      out.innerHTML = hits.slice(0, 30).map(function (r) {
        return '<li><a href="' + esc(r[2]) + '"><span class="fn">' + esc(r[0]) + '</span><span class="sub">' + esc(r[1]) + '　' + fmt(r[3]) + '人</span></a></li>';
      }).join('');
    }
    qi.addEventListener('input', run);
    run();
  });

  // ---- 横にずらして見る表・図には案内を出す（はみ出しているときだけ）
  function hints() {
    document.querySelectorAll('.scroll').forEach(function (s) {
      var over = s.scrollWidth > s.clientWidth + 4, prev = s.previousElementSibling;
      var h = prev && prev.classList.contains('scroll-hint') ? prev : null;
      if (over && !h) {
        h = mk('p', 'scroll-hint', '<span aria-hidden="true">↔</span> ' + (s.querySelector('table') ? '表は' : '') + '横にずらして見られます（指で左右に動かせます）');
        s.parentNode.insertBefore(h, s);
      }
      if (h) { h.hidden = !over; }
    });
  }
  var hintsLater = later(hints, 200);
  window.addEventListener('resize', hintsLater);
  document.addEventListener('toggle', hintsLater, true); // 開いた「表で見る」
  hints();

  // ダッシュボード（dash.js）でも使う部品
  window.KZ = { fmt: fmt, pct: pct, esc: esc, svg: svg, showTip: showTip, hideTip: hideTip, cuts: cuts, binOf: binOf, shade: shade,
    loadShape: loadShape, BINS: BINS, hints: hintsLater, saveButton: saveButton };
})();
