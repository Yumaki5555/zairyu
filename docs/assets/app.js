/* 数でみる在留外国人：ページの中のグラフ（円グラフ・棒グラフ・表の切り替え、日本のタイル地図、選んで見る表）
   どのグラフも、ページに書いた数（<script type="application/json">）から作る。JavaScript が動かないときは、ページの表がそのまま見える */
(function () {
  'use strict';
  var KEY = 'kazu-zairyu-chart';
  var SLOTS = 7; // 円グラフの色（多い順に7つ＋その他）

  function mode() { try { return localStorage.getItem(KEY) || 'pie'; } catch (e) { return 'pie'; } }
  function saveMode(m) { try { localStorage.setItem(KEY, m); } catch (e) { /* 保存できなくても動く */ } }
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  function pct(v, t) { return t ? (v / t * 100).toFixed(1) + '%' : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function data(box) { var s = box.querySelector('script[type="application/json"]'); return s ? JSON.parse(s.textContent) : null; }
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) { e.setAttribute(k, attrs[k]); }
    return e;
  }

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
      li.addEventListener('mouseleave', hideTip);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function drawBreakdown(box) {
    var d = box._d || (box._d = data(box));
    if (!d || !d.total) { return; }
    var m = mode();
    var body = box.querySelector('.viz-body'), table = box.querySelector('.viz-table');
    body.innerHTML = '';
    box.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'); });
    if (m === 'table') { table.hidden = false; return; }
    table.hidden = true;
    (m === 'bar' ? bar : pie)(body, d);
  }

  var boxes = Array.prototype.slice.call(document.querySelectorAll('.viz[data-viz="breakdown"]'));
  boxes.forEach(function (box) {
    var bar = document.createElement('div'); bar.className = 'modes'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'グラフの種類');
    [['pie', '円グラフ'], ['bar', '棒グラフ'], ['table', '表']].forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.m = x[0]; b.textContent = x[1];
      b.addEventListener('click', function () { saveMode(x[0]); boxes.forEach(drawBreakdown); });
      bar.appendChild(b);
    });
    box.insertBefore(bar, box.firstChild);
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

  function drawLegend(box, cs, unk) {
    var lg = box.querySelector('.map-legend'); lg.innerHTML = '';
    for (var i = 0; i <= cs.length; i++) {
      var lo = i === 0 ? 1 : cs[i - 1], hi = i < cs.length ? cs[i] : null;
      var s = document.createElement('span'); s.className = 'lg';
      s.innerHTML = '<span class="sw b' + shade(i, cs) + '"></span>' + (hi === null ? fmt(lo) + '人〜' : fmt(lo) + '〜' + fmt(hi - 1) + '人');
      lg.appendChild(s);
    }
    var z = document.createElement('span'); z.className = 'lg'; z.innerHTML = '<span class="sw b-z"></span>0人'; lg.appendChild(z);
    if (unk) { var u = document.createElement('span'); u.className = 'lg'; u.innerHTML = '<span class="sw b-n"></span>公表されていない'; lg.appendChild(u); }
  }

  function drawTiles(box, d, opt, cs) {
    var grid = box.querySelector('.tiles'); grid.innerHTML = '';
    var vals = opt.values;
    Object.keys(GRID).forEach(function (pref) {
      var v = vals[pref] || 0, b = v > 0 ? binOf(v, cs) : -1;
      var a = document.createElement(d.links && d.links[pref] ? 'a' : 'div');
      if (a.tagName === 'A') { a.href = d.links[pref]; }
      a.className = 'tile ' + (b < 0 ? 'b-z' : 'b' + shade(b, cs));
      a.style.gridColumn = (GRID[pref][0] + 1); a.style.gridRow = (GRID[pref][1] + 1);
      a.innerHTML = '<span class="tn">' + esc(pref.replace(/[都府県]$/, '')) + '</span><span class="tv">' + valText(v) + '</span>';
      var html = '<b>' + esc(pref) + '</b><br>' + esc(opt.label) + '：' + fmt(v) + '人' + (opt.total ? '（' + pct(v, opt.total) + '）' : '');
      a.setAttribute('aria-label', pref + ' ' + fmt(v) + '人');
      a.addEventListener('mousemove', function (ev) { showTip(ev, html); });
      a.addEventListener('mouseleave', hideTip);
      grid.appendChild(a);
    });
  }

  function drawShape(box, d, opt, cs, shape) {
    var holder = box.querySelector('.map-shape'); holder.innerHTML = '';
    if (!shape) { holder.innerHTML = '<p class="note">地図の形を読み込めませんでした（下の表をご覧ください）。</p>'; return; }
    var g = svg('svg', { viewBox: '0 0 ' + shape.w + ' ' + shape.h, class: 'jmap', role: 'img', 'aria-label': opt.label + 'の地図' });
    var parts = shape.prefs || shape.areas, drawn = {};
    (shape.frames || []).forEach(function (f) { // 島の集まりごとの枠（沖縄県）
      var b = f.box;
      g.appendChild(svg('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'frame', rx: 6 }));
      var t = svg('text', { x: b[0] + 8, y: b[1] + 20, class: 'frame-lb' }); t.textContent = f.label; g.appendChild(t);
    });
    Object.keys(parts).forEach(function (key) {
      var none = key.indexOf('none:') === 0, unk = !none && opt.unknown && opt.unknown.indexOf(key) >= 0, memo = d.notes && d.notes[key];
      var v = opt.values[key] || 0, bb = v > 0 ? binOf(v, cs) : -1;
      var p = svg('path', { d: parts[key], class: 'area ' + (none ? 'b-n' : unk ? 'b-u' : (bb < 0 ? 'b-z' : 'b' + shade(bb, cs))) });
      var name = none ? (key.slice(5) || '（統計のない所）') : ((d.names && d.names[key]) || key);
      var html = '<b>' + esc(name) + '</b>' + (none ? '' : memo ? '<br>' + esc(memo) : '<br>' + esc(opt.label) + '：' +
        (unk ? '公表されていない（外国人が10人以下の市町村）' : fmt(v) + '人' + (opt.total ? '（' + pct(v, opt.total) + '）' : '')));
      var el = p;
      if (!none && d.links && d.links[key]) {
        el = svg('a', { href: d.links[key] }); el.appendChild(p);
        el.setAttribute('aria-label', name + ' ' + fmt(v) + '人');
      }
      p.addEventListener('mousemove', function (ev) { p.classList.add('hl'); showTip(ev, html); });
      p.addEventListener('mouseleave', function () { p.classList.remove('hl'); hideTip(); });
      g.appendChild(el);
      drawn[key] = { path: p, html: html };
    });
    if (shape.inset) { // 左上の枠（沖縄県）：島が小さいので、枠の中のどこでもその県として押せる
      var b = shape.inset, ik = shape.inset_key, r = svg('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'inset', rx: 6 }), re = r;
      if (ik && drawn[ik]) {
        r.addEventListener('mousemove', function (ev) { drawn[ik].path.classList.add('hl'); showTip(ev, drawn[ik].html); });
        r.addEventListener('mouseleave', function () { drawn[ik].path.classList.remove('hl'); hideTip(); });
        if (d.links && d.links[ik]) { re = svg('a', { href: d.links[ik] }); re.setAttribute('aria-hidden', 'true'); re.setAttribute('tabindex', '-1'); re.appendChild(r); }
      }
      g.insertBefore(re, g.firstChild);
    }
    holder.appendChild(g);
    if (shape.note) { var n = document.createElement('p'); n.className = 'note'; n.textContent = shape.note; holder.appendChild(n); }
  }

  function drawMap(box) {
    var d = box._d || (box._d = data(box));
    var sel = box.querySelector('.map-ctl select');
    var opt = d.options[sel ? sel.selectedIndex : 0];
    var vals = opt.values, cs = cuts(Object.keys(vals).map(function (k) { return vals[k]; }));
    drawLegend(box, cs, opt.unknown && opt.unknown.length);
    var style = d.tiles ? mapStyle() : 'shape';
    box.querySelectorAll('.map-style button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === style ? 'true' : 'false'); });
    var tilesWrap = box.querySelector('.tiles-wrap'), shapeWrap = box.querySelector('.map-shape');
    if (tilesWrap) { tilesWrap.hidden = style !== 'tile'; }
    shapeWrap.hidden = style !== 'shape';
    if (style === 'tile') { drawTiles(box, d, opt, cs); return; }
    loadShape(d.shape, function (shape) { drawShape(box, d, opt, cs, shape); });
  }
  var mapBoxes = Array.prototype.slice.call(document.querySelectorAll('.viz[data-viz="map"]'));
  mapBoxes.forEach(function (box) {
    var d = data(box); box._d = d;
    var sel = box.querySelector('.map-ctl select');
    if (sel) { sel.addEventListener('change', function () { drawMap(box); }); }
    if (d.tiles) {
      var bar = document.createElement('div'); bar.className = 'modes map-style'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '地図の形');
      [['shape', '地図の形'], ['tile', '四角で並べる']].forEach(function (x) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.m = x[0]; b.textContent = x[1];
        b.addEventListener('click', function () { saveMapStyle(x[0]); mapBoxes.forEach(drawMap); });
        bar.appendChild(b);
      });
      box.insertBefore(bar, box.firstChild);
    }
    drawMap(box);
  });

  // ---- 移り変わりの折れ線（いくつかの線：国籍ごとの在留資格など）。凡例を押すと線を消す・出す。表にも切り替えられる
  function niceStep(v) {
    var k = Math.pow(10, Math.floor(Math.log10(v || 1)));
    var r = [1, 2, 2.5, 5, 10].map(function (m) { return m * k; }).filter(function (x) { return x >= v; });
    return r[0];
  }
  function drawLines(box) {
    var d = box._d, sel = box.querySelector('.lines-ctl select');
    var ds = d.sets[sel ? sel.selectedIndex : 0];
    var mode = box._mode || 'line', hidden = box._hidden || (box._hidden = {});
    box.querySelectorAll('.lines-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === mode ? 'true' : 'false'); });
    var body = box.querySelector('.lines-body'); body.innerHTML = '';
    var cls = function (i, s) { return s.other ? 'o' : String(i + 1); };
    if (mode === 'table') {
      var h = '<div class="scroll"><table class="t"><tr><th>年</th>' + ds.series.map(function (s) { return '<th class="n">' + esc(s.name) + '</th>'; }).join('') + '</tr>';
      ds.whens.forEach(function (w, j) {
        h += '<tr><td>' + esc(w) + '</td>' + ds.series.map(function (s) { return '<td class="n">' + (s.values[j] === null ? '—' : fmt(s.values[j])) + '</td>'; }).join('') + '</tr>';
      });
      body.innerHTML = h + '</table></div>';
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
    var every = n > 10 ? 2 : 1;
    ds.whens.forEach(function (w, j) {
      if ((n - 1 - j) % every) { return; } // いちばん新しい年から数えて1つおき
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
    hit.addEventListener('mousemove', function (ev) {
      var r = g.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
      var j = Math.max(0, Math.min(n - 1, Math.round((x - L) / ((W - L - R) / Math.max(1, n - 1)))));
      cross.setAttribute('x1', X(j)); cross.setAttribute('x2', X(j)); cross.setAttribute('visibility', 'visible');
      var rows = ds.series.map(function (s, i) { return [s, i]; }).filter(function (x) { return !hidden[x[0].name] && x[0].values[j] !== null; })
        .sort(function (a, b) { return b[0].values[j] - a[0].values[j]; });
      showTip(ev, '<b>' + esc(ds.whens[j]) + '年12月末</b>' + rows.map(function (x) {
        return '<br><span class="sw sw-' + cls(x[1], x[0]) + '"></span> ' + esc(x[0].name) + '：' + fmt(x[0].values[j]) + '人';
      }).join(''));
    });
    hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    g.appendChild(hit);
    body.appendChild(g);
    var lg = document.createElement('div'); lg.className = 'lines-legend';
    ds.series.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lgb' + (hidden[s.name] ? ' off' : '');
      b.setAttribute('aria-pressed', hidden[s.name] ? 'false' : 'true');
      var last = s.values[s.values.length - 1];
      b.innerHTML = '<span class="sw sw-' + cls(i, s) + '"></span>' + esc(s.name) + (last !== null ? ' <span class="sub">' + fmt(last) + '人</span>' : '');
      b.addEventListener('click', function () { hidden[s.name] = !hidden[s.name]; drawLines(box); });
      lg.appendChild(b);
    });
    body.appendChild(lg);
  }
  document.querySelectorAll('.viz[data-viz="lines"]').forEach(function (box) {
    box._d = data(box);
    var bar = document.createElement('div'); bar.className = 'modes lines-mode'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'グラフの種類');
    [['line', '折れ線'], ['table', '表']].forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.m = x[0]; b.textContent = x[1];
      b.addEventListener('click', function () { box._mode = x[0]; drawLines(box); });
      bar.appendChild(b);
    });
    box.insertBefore(bar, box.firstChild);
    var sel = box.querySelector('.lines-ctl select');
    if (sel) { sel.addEventListener('change', function () { box._hidden = {}; drawLines(box); }); }
    drawLines(box);
  });

  // ---- 選んで見る表（国籍を選んで市区町村の多い順／都道府県を選んで市区町村の多い順）
  document.querySelectorAll('.viz[data-viz="pick"]').forEach(function (box) {
    var d = data(box), sel = box.querySelector('select'), out = box.querySelector('.pick-body');
    var more = box.querySelector('.pick-more');
    var all = false;
    function draw() {
      var k = sel.value;
      var rows = d.rows.filter(function (r) { return d.filter ? (k === '' || r[d.filter] === k) : true; });
      var col = d.filter ? d.value : d.cols.indexOf(k);
      rows = rows.map(function (r) { return [r, d.filter ? r[col] : r[3][col]]; }).filter(function (x) { return x[1] > 0; });
      rows.sort(function (a, b) { return b[1] - a[1]; });
      var n = rows.length, lim = all ? n : Math.min(n, d.limit || 30);
      var max = n ? rows[0][1] : 1;
      var h = '<table class="t"><tr><th class="n">順</th><th>' + esc(d.head) + '</th><th class="n">人数</th><th class="barcol"></th><th class="n">' + esc(d.share) + '</th></tr>';
      for (var i = 0; i < lim; i++) {
        var r = rows[i][0], v = rows[i][1], base = d.filter ? r[d.base] : r[3][0];
        var nm = r[1] ? '<a href="' + esc(r[1]) + '">' + esc(r[0]) + '</a>' : esc(r[0]);
        if (d.sub) { nm += ' <span class="sub">' + esc(r[d.sub]) + '</span>'; }
        h += '<tr><td class="n">' + (i + 1) + '</td><td>' + nm + '</td><td class="n">' + fmt(v) + '</td><td class="barcol"><span class="bar" style="width:' +
          (v / max * 100).toFixed(1) + '%"></span></td><td class="n">' + pct(v, base) + '</td></tr>';
      }
      out.innerHTML = h + '</table>' + (n ? '' : '<p class="note">この条件の数はありません。</p>');
      if (more) { more.hidden = n <= (d.limit || 30); more.textContent = all ? '上位だけ見る' : '全部（' + n + '）見る'; }
    }
    sel.addEventListener('change', function () { all = false; draw(); });
    if (more) { more.addEventListener('click', function () { all = !all; draw(); }); }
    draw();
  });

  // ダッシュボード（dash.js）でも使う部品
  window.KZ = { fmt: fmt, pct: pct, esc: esc, svg: svg, showTip: showTip, hideTip: hideTip, cuts: cuts, binOf: binOf, shade: shade,
    loadShape: loadShape, BINS: BINS };
})();
