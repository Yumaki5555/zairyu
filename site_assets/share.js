/* 数でみる在留外国人：画像の保存（X投稿にも使える PNG）
   画面を写すのではなく、保存用に組み直して canvas に描く。タイトル・地域・国籍・在留資格・統計時点・グラフ・凡例・大事な数・出典を入れる。
   文字はすべて幅を測ってから置く（入らないときは、字を小さくする → 折り返す → 並べ方を変える → 最後に「…」で切る）。字どうしは重ねない。
   サイトの名前とアドレス（アドレスには作った人の名前が入る）は、はじめは入れない（2026年10月 作った人の希望）。
   画面の「サイト名を入れる」を選んだときだけ、サイトの名前（アドレスではない）を右下に入れる。
   大きさ：横長 1600×900（16:9、はじめ）、正方形 1200×1200、縦長 1080×1350。保存の前に見え方を確かめられる。
   どのページでも、グラフの「画像を保存」を押したときに読み込む（app.js）。日本語の字（Noto Sans JP）もそのときに、ページの字とは別の名前で読み込む。
   X の投稿画面を開くリンクでは画像は自動でつかないので、保存またはコピーした画像を貼ってもらう。
   トップページの「グラフの画像を作る」（xmaker.js）も、ここの compose・autoTitle・postText・glyphs で同じ画像と投稿文を作る */
(function () {
  'use strict';
  var SIZES = [['wide', 1600, 900, '横長 16:9（1600×900・Xの投稿向き）'], ['square', 1200, 1200, '正方形 1:1（1200×1200）'], ['tall', 1080, 1350, '縦長 4:5（1080×1350）']];
  var FAMILY = 'KZ Noto Sans JP';
  var FONT = "'" + FAMILY + "','Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
  var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
  var SITE = '数でみる在留外国人';
  var C = { text: '#1d2330', sub: '#5b6474', line: '#dfe3ea', grid: '#e4e3dc', bg: '#ffffff', soft: '#f3f5f8', mark: '#b7791f', accent: '#1f7a4f',
    grid2: '#e6e8ec', line2: '#eef0f3', zero: '#5b6474', // 増減の棒：目もりの線・行の区切り（薄い灰色）・0の線
    up: '#29a97f', down: '#c23a33', // 増えた・減った（style.css の --up・--down と同じ）
    s: { '1': '#2a78d6', '2': '#eb6834', '3': '#1baf7a', '4': '#eda100', '5': '#e87ba4', '6': '#008300', '7': '#6250d6', o: '#b9bdc5' },
    m: { b0: '#fde9d7', b1: '#fbcfa6', b2: '#f7ae70', b3: '#f08a3e', b4: '#d76a1f', b5: '#ac4f12', b6: '#7c360b', 'b-z': '#eef0f3', 'b-n': '#f6f7f9', 'b-u': '#f6f7f9',
      d1: '#cfe1f6', d2: '#8fb8e8', d3: '#4a86cf' } };
  var basket = []; // まとめた図（複数の図を1枚にするとき）
  // 画像の字の大きさ（2026年10月 作った人の指示。1600×900 のときの px。ほかの大きさの画像は幅に合わせる）：
  // タイトル 44・タイトルの下（時点と単位）26・グラフの中の名前（国籍・在留資格など）32（太字）・数 30・大事な数 38（太字）・小さい字 26・目もり 22・出典と注記 18。
  // グラフの中の数には単位（人）を付けず、タイトルの下に「単位：人」とまとめて書く（そのぶん名前と数を大きくする）
  var TYPE = { title: 44, sub: 26, name: 32, value: 30, big: 38, small: 26, tick: 22, note: 18 };
  function px(key, u) { return TYPE[key] * u / 25; }
  function noUnit(s) { return String(s).replace(/([0-9０-９])人/g, '$1'); } // 数の後ろの「人」を外す（「日本人の配偶者等」などの名前は変えない）
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  function wl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月末'; }
  function font(px, bold) { return (bold ? '700 ' : '400 ') + Math.max(1, Math.round(px)) + 'px ' + FONT; }
  function signed(v, d) { var s = d ? Math.abs(v).toFixed(d) : fmt(Math.round(Math.abs(v))); return (v > 0 ? '+' : v < 0 ? '−' : '±') + s; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function measure(ctx, t) { return ctx.measureText(t).width; }
  function maxW(ctx, list) { return list.reduce(function (m, t) { return Math.max(m, measure(ctx, t)); }, 0); }
  // グラフの名前は画面（app.js）と同じように短くする（技術・人文知識・国際業務 → 技人国）。短くしたときは、出典の行に説明を入れる
  var vs = window.KZ && window.KZ.vs || String, vnote = window.KZ && window.KZ.vnote || function () { return ''; };
  function copy(o, patch) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); Object.keys(patch).forEach(function (k) { c[k] = patch[k]; }); return c; }
  function chartNames(ch) {
    return [].concat((ch.parts || []).map(function (p) { return p.name; }), (ch.series || []).map(function (s) { return s.name; }),
      (ch.rows || []).map(function (r) { return r[0]; }), (ch.sorted || []).map(function (r) { return r[0]; }), ch.cols || []);
  }
  function shortChart(ch) {
    var row = function (r) { return [vs(r[0])].concat(r.slice(1)); };
    return copy(ch, {
      parts: ch.parts && ch.parts.map(function (p) { return copy(p, { name: vs(p.name) }); }),
      series: ch.series && ch.series.map(function (s) { return copy(s, { name: vs(s.name) }); }),
      rows: ch.rows && ch.rows.map(row), sorted: ch.sorted && ch.sorted.map(row), cols: ch.cols && ch.cols.map(vs) });
  }
  function color(cls) { return C.s[cls] || C.s.o; }

  // ---- 文字を幅に収める
  // 数（4,281,026 や 22.5%）は途中で切らない。行のはじめに来ない字（、。）など）は前の字といっしょに次の行へ
  var NOSTART = '、。，．）」』】〕・：；？！ー…%％';
  function tokens(text) { return text.match(/[0-9０-９+＋−-]?[0-9０-９][0-9０-９,，.．]*[%％]?|[A-Za-z]+|[\s\S]/g) || []; }
  function wrap(ctx, text, mw) { // 「　」（全角の空き）で区切った所があれば、そこで折り返す（「統計時／点」のように、ことばの途中で切らない）
    if (text.indexOf('　') < 1) { return wrapChars(ctx, text, mw); }
    var out = [], line = '';
    text.split('　').forEach(function (s) {
      var t = line ? line + '　' + s : s;
      if (measure(ctx, t) <= mw) { line = t; return; }
      if (line) { out.push(line); }
      if (measure(ctx, s) <= mw) { line = s; return; }
      var ws = wrapChars(ctx, s, mw); out = out.concat(ws.slice(0, -1)); line = ws[ws.length - 1] || '';
    });
    if (line) { out.push(line); }
    return out;
  }
  function wrapChars(ctx, text, mw) {
    var out = [], line = '';
    tokens(text).forEach(function (t) {
      var parts = measure(ctx, t) > mw ? t.split('') : [t]; // 1つで幅をこえる数は、字ごとに分ける
      parts.forEach(function (p) {
        if (line && measure(ctx, line + p) > mw) {
          if (NOSTART.indexOf(p) >= 0 && line.length > 1) { out.push(line.slice(0, -1)); line = line.slice(-1) + p; } else { out.push(line); line = /^[\s　]$/.test(p) ? '' : p; }
        } else { line += p; }
      });
    });
    if (line) { out.push(line); }
    return out;
  }
  function clip(ctx, text, mw) { // 今の字の大きさで、幅に入らなければ末尾を「…」にする
    if (measure(ctx, text) <= mw + 0.5) { return text; } // 0.5 は、幅の足し引きの計算の誤差（ちょうど入る名前を切らない）
    while (text.length && measure(ctx, text + '…') > mw) { text = text.slice(0, -1); }
    return text.length ? text + '…' : '';
  }
  // 何行かに収める：大きい字から小さくしていき、maxLines 行に入る大きさにする（最後の行が1〜3字だけになるときは、もう少し小さくしてみる）
  function fitLines(ctx, text, mw, px, bold, maxLines, minPx) {
    minPx = Math.min(minPx || px * 0.6, px); // いちばん小さい大きさも、はじめの大きさより大きくはしない（行の高さからはみ出さないように）
    var fallback = null, step = Math.max(1, px * 0.04);
    for (var size = px; size >= minPx - 0.01; size -= step) {
      ctx.font = font(size, bold);
      var lines = wrap(ctx, text, mw);
      if (lines.length <= maxLines) {
        if (lines.length === 1 || lines[lines.length - 1].length > 3) { return { lines: lines, size: size }; }
        if (!fallback) { fallback = { lines: lines, size: size }; }
      }
    }
    if (fallback) { ctx.font = font(fallback.size, bold); return fallback; }
    ctx.font = font(minPx, bold);
    var ls = wrap(ctx, text, mw);
    if (ls.length > maxLines) { ls = ls.slice(0, maxLines - 1).concat([clip(ctx, ls.slice(maxLines - 1).join(''), mw)]); }
    return { lines: ls, size: minPx };
  }
  // 1行に収める（小さくしても入らなければ「…」）
  function fit1(ctx, text, mw, px, bold, minPx) {
    minPx = Math.min(minPx || px * 0.7, px);
    for (var size = px; size >= minPx - 0.01; size -= Math.max(1, px * 0.05)) {
      ctx.font = font(size, bold);
      if (measure(ctx, text) <= mw + 0.5) { return { text: text, size: size }; }
    }
    ctx.font = font(minPx, bold);
    return { text: clip(ctx, text, mw), size: minPx };
  }
  // 1行に収める。いちばん小さくしても入らないときだけ2行にする（「…」で切らない。タイトルを長く書き直したときなど）
  function fitOne(ctx, text, mw, px, bold, minPx) {
    var f = fit1(ctx, text, mw, px, bold, minPx);
    return f.text === text ? { lines: [text], size: f.size } : fitLines(ctx, text, mw, minPx, bold, 2, minPx * 0.8);
  }
  function niceStep(v) { var k = Math.pow(10, Math.floor(Math.log10(v || 1))); return [1, 2, 2.5, 5, 10].map(function (m) { return m * k; }).filter(function (x) { return x >= v; })[0]; }
  function wx(w) { var p = w.split('-'); return +p[0] + (p[1] === '06' ? 0 : 0.5); }
  function short(v) { return Math.abs(v) >= 10000 ? (v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万' : fmt(Math.round(v)); }
  function noData(ctx, x, y, w, h, u) {
    var f = fit1(ctx, 'この図のデータがありません', w, 1.8 * u, false, 1 * u);
    ctx.fillStyle = C.sub; ctx.font = font(f.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, x + w / 2, y + h / 2);
  }
  // 折れ線の凡例を下に並べる。items：[{cls, name, val}]、head：上に書く見出し（時点）。高さを返し、draw(x, y) で描く
  // 名前（太字）と数は右の凡例と同じ大きさ。幅に入るだけ列を増やして行を減らす（図を高くする）。高さか幅に入らなければ字を小さくする
  function legendBelow(ctx, items, w, maxH, u, head) {
    var hh = head ? px('tick', u) * 1.9 : 0, n = items.length, gap = 2.4 * u, p = null;
    for (var sc = 1; sc >= 0.6 - 1e-9; sc -= 0.05) {
      var nf = px('name', u) * sc, vf = px('value', u) * sc, sw = nf * 0.8;
      ctx.font = font(nf, true); var nmW = maxW(ctx, items.map(function (it) { return it.name; }));
      ctx.font = font(vf); var vlW = maxW(ctx, items.map(function (it) { return it.val; }));
      var cellW = sw + 0.6 * u + nmW + 1.2 * u + vlW, cols = Math.max(1, Math.min(n, Math.floor((w + gap) / (cellW + gap))));
      var perCol = Math.ceil(n / cols); cols = Math.ceil(n / perCol); // 列の長さをそろえる（5つは 4＋1 でなく 2＋2＋1）
      p = { nf: nf, vf: vf, sw: sw, rowH: nf * 1.75, cellW: Math.min(cellW, w), vlW: vlW, cols: cols, perCol: perCol };
      if (cellW <= w && hh + perCol * p.rowH <= maxH) { break; }
    }
    // 列の間は、余った幅を少し広げる（広げすぎない）
    var g = p.cols > 1 ? Math.min(4 * u, (w - p.cols * p.cellW) / (p.cols - 1)) : 0;
    return { h: hh + p.perCol * p.rowH, draw: function (x, y) {
      if (head) {
        var f0 = fit1(ctx, head, w, px('tick', u), false, 0.7 * u);
        ctx.fillStyle = C.sub; ctx.font = font(f0.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(f0.text, x, y); y += hh;
      }
      items.forEach(function (it, i) { // 多い順に、左の列の上から下へ
        var cx = x + Math.floor(i / p.perCol) * (p.cellW + g), cy = y + (i % p.perCol) * p.rowH + p.rowH / 2;
        ctx.fillStyle = color(it.cls); ctx.fillRect(cx, cy - p.sw / 2, p.sw, p.sw);
        ctx.textBaseline = 'middle'; ctx.fillStyle = C.text;
        ctx.font = font(p.vf); ctx.textAlign = 'right'; ctx.fillText(it.val, cx + p.cellW, cy);
        ctx.font = font(p.nf, true); ctx.textAlign = 'left'; ctx.fillText(clip(ctx, it.name, p.cellW - p.sw - 0.6 * u - p.vlW - 1.2 * u), cx + p.sw + 0.6 * u, cy);
      });
    } };
  }

  // ---- 図ごとの描き方（x, y, w, h の中に描く。u は字の大きさの目安）
  function drawLine(ctx, ch, x, y, w, h, u, wide) {
    var series = ch.series.filter(function (s) { return s.vals.some(function (v) { return v != null; }); }).slice(0, 8); // 画面と同じ線（多い7つと「その他」）
    if (!series.length) { noData(ctx, x, y, w, h, u); return; }
    var multi = series.length > 1, fa = px('tick', u), last = ch.per.length - 1;
    var xs = ch.per.map(wx), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var cxm = wx('2012-12') - 0.25, mark = x0 < cxm && cxm <= x1;
    // 凡例の数：いちばん新しい時点の数。時点と単位は凡例の見出しにまとめて書く（その時点の数がない線だけ、数のある最後の時点を添える）
    function valText(s) {
      var i = last; while (i >= 0 && s.vals[i] == null) { i--; }
      if (i < 0) { return ''; }
      var v = s.vals[i], t = ch.index ? v.toFixed(1) : ch.f ? noUnit(ch.f(v)) : fmt(Math.round(v));
      return i === last ? t : t + '（' + ymd(ch.per[i]) + '）';
    }
    var head = ymd(ch.per[last]) + (ch.index ? 'の指数　はじめの時点＝100' : 'の数'); // 「　」の所で2行に分けられる。単位はタイトルの下
    // 凡例（線が2本以上）：横長の画像で図が広ければ右、ほかは下。右のときは、名前と数がちょうど入る幅にする（すき間を空けない。図の幅の4割まで）
    // 正方形・縦長の画像は、いつも下にしてグラフの横幅を広くとる（2026年10月 作った人の指示）
    var legRight = multi && wide && w >= 42 * u, legW = 0, leg = null, lg = null;
    if (legRight) {
      var hf = px('tick', u), n = series.length, vals = series.map(valText);
      var lh = Math.min(px('name', u) * 2.1, (h - 2 * hf * 1.3 - 0.8 * u) / n), nf = Math.min(px('name', u), lh * 0.62), vf = Math.min(px('value', u), lh * 0.6), sw = nf * 0.8;
      ctx.font = font(nf, true); var nmW = maxW(ctx, series.map(function (s) { return s.name; }));
      ctx.font = font(vf); var vlW = maxW(ctx, vals);
      var rowW = sw + 0.6 * u + nmW + 1.2 * u + vlW;
      ctx.font = font(hf); var hl = measure(ctx, head) <= rowW ? [head] : head.split('　');
      if (rowW > w * 0.42) { legRight = false; } else { // 名前と数が右に入らないときは下に並べる（名前を「…」で切らない）
        legW = Math.max(rowW, maxW(ctx, hl)); rowW = Math.min(rowW, legW);
        var headH = hl.length * hf * 1.3 + 0.8 * u;
        lg = { hl: hl, hf: hf, headH: headH, lh: lh, nf: nf, vf: vf, sw: sw, rowW: rowW, vals: vals, vlW: vlW, top: y + Math.max(0, (h - headH - n * lh) / 2) };
      }
    }
    if (multi && !legRight) { leg = legendBelow(ctx, series.map(function (s) { return { cls: s.cls, name: s.name, val: valText(s) }; }), w, h * 0.34, u, head.replace('　', '（') + (head.indexOf('　') >= 0 ? '）' : '')); }
    var T = y + (mark ? fa * 2 : fa * 0.6), B = y + h - fa * 2 - (leg ? leg.h + 1.4 * u : 0);
    var all = []; series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) { all.push(v); } }); });
    var nt = Math.max(2, Math.min(5, Math.floor((B - T) / (3 * u))));
    var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all), step = niceStep((hi - lo || 1) / nt);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi * 1.03 / step) * step || step;
    ctx.font = font(fa);
    var ticks = []; for (var v = y0; v <= y1 + 1e-9; v += step) { ticks.push([v, ch.index ? String(Math.round(v)) : short(v)]); }
    var L = x + maxW(ctx, ticks.map(function (t) { return t[1]; })) + 0.8 * u, R = x + w - (legRight ? legW + 1.6 * u : 0.4 * u);
    var X = function (q) { return L + (x1 > x0 ? (q - x0) / (x1 - x0) : 0.5) * (R - L); }, Y = function (q) { return T + (1 - (q - y0) / (y1 - y0)) * (B - T); };
    ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ticks.forEach(function (t) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(L, Y(t[0])); ctx.lineTo(R, Y(t[0])); ctx.stroke();
      ctx.fillText(t[1], L - 0.5 * u, Y(t[0]));
    });
    // 年の目もり：字が重ならない間かくを選ぶ
    var yw = measure(ctx, '2000') + 1.4 * u, room = Math.max(1, Math.floor((R - L) / yw)), span = x1 - x0, ys = 1;
    [1, 2, 5, 10, 20, 25, 50].some(function (s) { ys = s; return Math.floor(span / s) + 1 <= room; });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var yr = Math.ceil((x0 - 0.5) / ys) * ys; yr + 0.5 <= x1 + 1e-9; yr += ys) {
      var tw = measure(ctx, String(yr)), tx = Math.min(Math.max(X(yr + 0.5), L + tw / 2), R - tw / 2);
      ctx.fillText(String(yr), tx, B + 0.6 * u);
    }
    if (mark) { // 数え方が変わった所。字は図の上の余白に、入る向き・長さで
      var mx = X(cxm);
      ctx.strokeStyle = C.mark; ctx.lineWidth = Math.max(1, u * 0.1); ctx.setLineDash([u * 0.5, u * 0.4]); ctx.beginPath(); ctx.moveTo(mx, T); ctx.lineTo(mx, B); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(fa); ctx.fillStyle = C.mark; ctx.textBaseline = 'top';
      [['2012年から数え方が変わった→', 'left'], ['←2011年まで 登録外国人統計', 'right'], ['数え方の変更→', 'left'], ['←数え方の変更', 'right']].some(function (o) {
        var room2 = o[1] === 'left' ? R - mx - 0.4 * u : mx - 0.4 * u - x;
        if (measure(ctx, o[0]) > room2) { return false; }
        ctx.textAlign = o[1]; ctx.fillText(o[0], o[1] === 'left' ? mx + 0.4 * u : mx - 0.4 * u, y + 0.2 * u); return true;
      });
    }
    series.forEach(function (s) {
      ctx.strokeStyle = color(s.cls); ctx.lineWidth = Math.max(3, 0.34 * u); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); var pen = false;
      s.vals.forEach(function (v2, i) { if (v2 == null) { pen = false; return; } if (pen) { ctx.lineTo(X(xs[i]), Y(v2)); } else { ctx.moveTo(X(xs[i]), Y(v2)); pen = true; } });
      ctx.stroke();
      s.vals.forEach(function (v2, i) { // 前後がない点（線にならない点）と最後の点は丸で示す
        if (v2 == null) { return; }
        var alone = s.vals[i - 1] == null && s.vals[i + 1] == null, last = i === s.vals.length - 1 || s.vals.slice(i + 1).every(function (q) { return q == null; });
        if (alone || last) { ctx.fillStyle = color(s.cls); ctx.beginPath(); ctx.arc(X(xs[i]), Y(v2), 0.55 * u, 0, 7); ctx.fill(); }
      });
    });
    if (lg) { // 凡例：見出し（時点と単位）の下に「色・名前・数」を1行ずつ。数は右をそろえる
      var lx = R + 1.6 * u, ly = lg.top;
      ctx.fillStyle = C.sub; ctx.font = font(lg.hf); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lg.hl.forEach(function (l, j) { ctx.fillText(clip(ctx, l, legW), lx, ly + j * lg.hf * 1.3); });
      ly += lg.headH;
      series.forEach(function (s, i) {
        var cy = ly + i * lg.lh + lg.lh / 2, tx = lx + lg.sw + 0.6 * u;
        ctx.fillStyle = color(s.cls); ctx.fillRect(lx, cy - lg.sw / 2, lg.sw, lg.sw);
        ctx.textBaseline = 'middle';
        ctx.font = font(lg.vf); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.fillText(lg.vals[i], lx + lg.rowW, cy);
        ctx.font = font(lg.nf, true); ctx.textAlign = 'left'; ctx.fillText(clip(ctx, s.name, lg.rowW - lg.sw - 0.6 * u - lg.vlW - 1.2 * u), tx, cy);
      });
    }
    if (leg) { leg.draw(x, B + fa * 2 + 1.4 * u); }
  }

  function drawPie(ctx, ch, x, y, w, h, u) {
    var parts = ch.parts.filter(function (p) { return p.v > 0; }), total = ch.total, n = parts.length;
    if (!n || !total) { noData(ctx, x, y, w, h, u); return; }
    function pctText(p) { return (p.v / total * 100).toFixed(1) + '%'; }
    function valText(p) { return fmt(p.v); }
    // 凡例の1行：色・名前・人数・割合。幅を測り、入らなければ字を小さく → 人数を省く（割合は残す）
    function plan(colW, fs) {
      ctx.font = font(fs); var pw = maxW(ctx, parts.map(pctText)), vw = maxW(ctx, parts.map(valText));
      ctx.font = font(fs, true); var nw = maxW(ctx, parts.map(function (p) { return p.name; }));
      var sw = fs * 0.8, gap = fs * 0.7, room = colW - sw - gap - pw - gap, need = nw; // 名前は「…」で切らない（入らなければ字を小さくする）
      var withVal = room - vw - gap >= need;
      if (withVal) { room -= vw + gap; }
      return { fs: fs, pw: pw, sw: sw, gap: gap, room: room, withVal: withVal, ok: room >= need, full: sw + gap + nw + gap + vw + gap + pw };
    }
    function bestPlan(colW, from, to) { var p = plan(colW, from); for (var fs = from - 0.1 * u; !p.ok && fs >= to - 0.01; fs -= 0.1 * u) { p = plan(colW, fs); } return p; }
    function row(p, rx, ry, colW, rowH, pl) {
      var cy = ry + rowH / 2;
      ctx.fillStyle = color(p.cls); ctx.fillRect(rx, cy - pl.sw / 2, pl.sw, pl.sw);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = font(pl.fs, true);
      ctx.fillText(clip(ctx, p.name, pl.room), rx + pl.sw + pl.gap, cy);
      ctx.textAlign = 'right'; ctx.font = font(pl.fs); ctx.fillStyle = C.sub; ctx.fillText(pctText(p), rx + colW, cy);
      if (pl.withVal) { ctx.fillStyle = C.text; ctx.fillText(valText(p), rx + colW - pl.pw - pl.gap, cy); }
    }
    var side = w >= h * 1.2, D, pl, rowH, colW, cols = 1, lx, ly, pcx, pcy;
    if (side) { // 円は左、凡例は右。名前が全部入るように、円の大きさを決める（小さくても幅の3割）
      rowH = Math.min(px('name', u) * 2.5, h / n);
      var need = plan(w, Math.min(px('name', u), rowH * 0.5)).full;
      D = Math.max(Math.min(h * 0.94, w * 0.5, w - need - 2.4 * u), Math.min(h * 0.94, w * 0.3)); lx = x + D + 2.4 * u; colW = x + w - lx;
      pl = bestPlan(colW, Math.min(px('name', u), rowH * 0.5), px('tick', u));
      if (!pl.ok) { side = false; } else { pcx = x + D / 2; pcy = y + h / 2; ly = y + (h - n * rowH) / 2; }
    }
    if (!side) { // 円は上、凡例は下（1列か2列。人数まで入り、字が大きくなるほうにする）
      var tryCols = function (k) {
        var perCol = Math.ceil(n / k);
        // 凡例の字を読める大きさにするのを先にし、円は残りの高さで（小さくても 6.5u）
        var rH = Math.max(px('tick', u) * 1.3, Math.min(px('name', u) * 2, (h - 7.7 * u) / perCol)), cW = (w - (k - 1) * 1.6 * u) / k;
        var p = bestPlan(cW, Math.min(px('name', u), rH * 0.68), px('tick', u) * 0.9), dd = Math.min(w * 0.8, h - perCol * rH - 1.2 * u);
        return { cols: k, rowH: rH, colW: cW, pl: p, D: dd, score: (p.ok ? 2 : 0) + (p.withVal ? 2 : 0) + p.fs / u + (dd >= 10 * u ? 1 : 0) };
      };
      var best = tryCols(1);
      if (w >= 34 * u && n > 3) { var t2 = tryCols(2); if (t2.score > best.score) { best = t2; } }
      cols = best.cols; rowH = best.rowH; colW = best.colW; pl = best.pl; D = best.D;
      pcx = x + w / 2; pcy = y + D / 2; lx = cols === 1 ? x + Math.max(0, (w - Math.min(w, pl.full + 2 * u)) / 2) : x; ly = y + D + 1.2 * u;
      if (cols === 1) { colW = Math.min(w, pl.full + 2 * u); pl = plan(colW, pl.fs); } // 1列のときは、真ん中に寄せる（名前と数が離れすぎないように）
    }
    var R = D / 2, ri = R * 0.56, a = -Math.PI / 2;
    parts.forEach(function (p) {
      var da = p.v / total * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.arc(pcx, pcy, R, a, a + da); ctx.closePath(); ctx.fillStyle = color(p.cls); ctx.fill();
      ctx.strokeStyle = C.bg; ctx.lineWidth = Math.max(2, 0.18 * u); ctx.stroke();
      a += da;
    });
    ctx.beginPath(); ctx.arc(pcx, pcy, ri, 0, 7); ctx.fillStyle = C.bg; ctx.fill();
    // 真ん中の合計：穴に入る大きさにする（入らなければ書かない。合計は大事な数の欄にもある）
    var tt = fmt(total), room = ri * 2 * 0.84, tf = Math.min(px('big', u) * 1.2, R * 0.3);
    ctx.font = font(tf, true);
    while (tf > 0.9 * u && measure(ctx, tt) > room) { tf -= 0.1 * u; ctx.font = font(tf, true); }
    var lf = Math.min(px('tick', u), tf * 0.62);
    if (measure(ctx, tt) <= room && tf + lf * 1.2 < ri * 1.6) {
      ctx.fillStyle = C.sub; ctx.font = font(lf); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('合計', pcx, pcy - 0.1 * u);
      ctx.fillStyle = C.text; ctx.font = font(tf, true); ctx.textBaseline = 'top'; ctx.fillText(tt, pcx, pcy + 0.1 * u);
    }
    parts.forEach(function (p, i) {
      var c = side ? 0 : Math.floor(i / Math.ceil(n / cols)), r = side ? i : i % Math.ceil(n / cols);
      row(p, lx + c * (colW + 1.6 * u), ly + r * rowH, colW, rowH, pl);
    });
  }

  function drawRank(ctx, ch, x, y, w, h, u) {
    var rows = ch.rows.slice(0, 10);
    if (!rows.length) { noData(ctx, x, y, w, h, u); return; }
    var lh = h / Math.max(rows.length, 5), vals = rows.map(function (r) { return noUnit(ch.f(r[1])); }), names = rows.map(function (r) { return r[0]; });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1]); }).concat([1e-9]));
    var fs, rkW, valW, nameAll, gap, one = null;
    // 増減・増加の数を並べるときは、増減の棒と同じ色（増加＝緑・減少＝赤）。人数は青
    var sgn = rows.some(function (r) { return r[1] < 0; }) || /増/.test(ch.metric || ''), barC = function (v) { return sgn ? (v < 0 ? C.down : C.up) : C.s['1']; };
    function widths(f) { // 順位は小さく、数は名前より大きく太く（1600×900 で 名前 24px・数 29px）
      ctx.font = font(f * 0.8); rkW = measure(ctx, String(rows.length)); ctx.font = font(f * 1.2, true); valW = maxW(ctx, vals);
      ctx.font = font(f, true); nameAll = maxW(ctx, names); gap = 0.8 * f;
    }
    // 1行に「順位・名前・棒・数」を並べられる字の大きさを探す
    for (fs = Math.min(px('name', u), lh * 0.5); fs >= px('tick', u) - 0.01; fs -= 0.05 * u) {
      widths(fs);
      var nameW = Math.min(nameAll, (w - rkW - valW - 3 * gap) * 0.55), barW = w - rkW - nameW - valW - 3 * gap;
      if (nameW >= Math.min(nameAll, 5 * fs) && barW >= 3 * u) { one = { nameW: nameW, barW: barW }; break; }
    }
    rows.forEach(function (r, i) {
      var top = y + i * lh, bw;
      ctx.fillStyle = barC(r[1]);
      if (one) {
        var cy = top + lh / 2;
        bw = Math.abs(r[1]) / max * one.barW;
        ctx.fillRect(x + rkW + gap + one.nameW + gap, top + lh * 0.24, Math.max(2, bw), lh * 0.52);
        ctx.textBaseline = 'middle'; ctx.font = font(fs * 0.8);
        ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.fillText(String(i + 1), x + rkW, cy);
        var nmF = fit1(ctx, r[0], one.nameW, fs, true, fs * 0.6); ctx.font = font(nmF.size, true); ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.fillText(nmF.text, x + rkW + gap, cy); // 長い名前だけ小さく
        ctx.font = font(fs * 1.2, true); ctx.textAlign = 'right'; ctx.fillText(vals[i], x + w, cy);
      } else { // 狭いとき：1段目に「順位・名前・数」、2段目に棒
        var f2 = Math.max(px('tick', u) * 0.9, Math.min(px('name', u), lh * 0.4));
        widths(f2);
        while (f2 > px('tick', u) * 0.8 && rkW + gap + valW + gap + 3 * f2 > w) { f2 -= 0.05 * u; widths(f2); }
        var ty = top + lh * 0.3;
        ctx.textBaseline = 'middle'; ctx.font = font(f2 * 0.8);
        ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.fillText(String(i + 1), x + rkW, ty);
        var nmF2 = fit1(ctx, r[0], w - rkW - valW - 2 * gap, f2, true, f2 * 0.6); ctx.font = font(nmF2.size, true); ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.fillText(nmF2.text, x + rkW + gap, ty);
        ctx.font = font(f2 * 1.2, true); ctx.textAlign = 'right'; ctx.fillText(clip(ctx, vals[i], w - rkW - gap), x + w, ty);
        bw = Math.abs(r[1]) / max * (w - rkW - gap);
        ctx.fillStyle = barC(r[1]);
        ctx.fillRect(x + rkW + gap, top + lh * 0.6, Math.max(2, bw), lh * 0.24);
      }
    });
  }

  function drawMapShape(ctx, ch, x, y, w, h, u) {
    var sh = ch.shape, items = ch.legend || [], top = (ch.sorted || []).slice(0, 5);
    var side = w >= h * 1.15 && w >= 34 * u, mw, mh, pan;
    if (side) { var lw = Math.min(w * 0.36, 26 * u); mw = w - lw - 2 * u; mh = h; pan = { x: x + w - lw, y: y, w: lw, h: h }; }
    else { var bh = Math.min(h * 0.42, (Math.max(items.length + 1, top.length + 1)) * px('name', u) * 1.9); mw = w; mh = h - bh - 1 * u; pan = { x: x, y: y + mh + 1 * u, w: w, h: bh }; }
    var k = Math.min(mw / sh.w, mh / sh.h), ox = x + (mw - sh.w * k) / 2, oy = y + (mh - sh.h * k) / 2;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
    ctx.lineWidth = 1 / k * Math.max(1, u * 0.08);
    (sh.frames || []).forEach(function (f) { ctx.strokeStyle = C.line; ctx.strokeRect(f.box[0], f.box[1], f.box[2] - f.box[0], f.box[3] - f.box[1]); });
    if (sh.inset) { ctx.strokeStyle = C.line; ctx.strokeRect(sh.inset[0], sh.inset[1], sh.inset[2] - sh.inset[0], sh.inset[3] - sh.inset[1]); }
    var parts = sh.prefs || sh.areas;
    Object.keys(parts).forEach(function (key) {
      var p = new Path2D(parts[key]);
      ctx.fillStyle = C.m[(ch.cls && ch.cls[key]) || 'b-n'] || C.m['b-n']; ctx.fill(p);
      ctx.strokeStyle = '#ffffff'; ctx.stroke(p);
    });
    ctx.restore();
    // 凡例（色の見方）と多い順。行の高さは、2つ合わせて入る高さにそろえる（凡例は幅があれば2列）
    var hf = Math.min(px('tick', u), pan.h * 0.08), lcols = side && pan.w >= 18 * u && items.length > 4 ? 2 : 1;
    if (lcols === 2) { // 2列で色の見方の字が入らないときは1列に（「…」で切らない）
      ctx.font = font(px('small', u)); if (maxW(ctx, items.map(function (it) { return noUnit(it[1]); })) + 2.4 * u > (pan.w - 1.2 * u) / 2) { lcols = 1; }
    }
    var lrows = Math.ceil(items.length / lcols), rrows = top.length;
    var rows = side ? lrows + rrows : Math.max(lrows, rrows), heads = side ? 2 : 1;
    var rh = Math.max(px('tick', u) * 1.25, Math.min(px('name', u) * 1.9, (pan.h - heads * hf * 1.6 - (side ? 1.2 * u : 0)) / Math.max(rows, 1)));
    var fs = Math.min(px('small', u), rh * 0.64), fr = Math.min(px('name', u), rh * 0.7); // 色の見方は小さい字、多い順は名前の大きさ
    function legend(px, py, pw) {
      var a = fit1(ctx, '色の見方（' + metricT(ch.metric) + '）', pw, hf, true, 0.7 * u);
      ctx.fillStyle = C.sub; ctx.font = font(a.size, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, px, py);
      var yy = py + hf * 1.6, cw = (pw - (lcols - 1) * 1.2 * u) / lcols;
      items.forEach(function (it, i) {
        var cx = px + Math.floor(i / lrows) * (cw + 1.2 * u), cy = yy + (i % lrows) * rh + rh / 2, sw = Math.min(1.5 * u, fs);
        ctx.fillStyle = C.m[it[0]] || C.m['b-n']; ctx.fillRect(cx, cy - rh * 0.32, sw, rh * 0.64); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(cx, cy - rh * 0.32, sw, rh * 0.64);
        var f = fit1(ctx, noUnit(it[1]), cw - sw - 0.6 * u, fs, false, fs * 0.75);
        ctx.fillStyle = C.text; ctx.font = font(f.size); ctx.textBaseline = 'middle'; ctx.fillText(f.text, cx + sw + 0.6 * u, cy);
      });
      return yy + lrows * rh;
    }
    function ranking(px, py, pw) {
      if (!top.length) { return; }
      ctx.fillStyle = C.sub; ctx.font = font(hf, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(ch.rankHead || '多い順', px, py);
      var yy = py + hf * 1.6;
      top.forEach(function (r, i) {
        var cy = yy + i * rh + rh / 2, val = r[1] == null ? '—' : noUnit(ch.f(r[1])), pre = (i + 1) + ' ';
        ctx.font = font(fr, true); ctx.textBaseline = 'middle';
        var vw = measure(ctx, val), preW = measure(ctx, pre);
        ctx.fillStyle = C.sub; ctx.textAlign = 'left'; ctx.fillText(pre, px, cy);
        ctx.fillStyle = C.text; ctx.fillText(clip(ctx, r[0], pw - preW - vw - 0.8 * u), px + preW, cy);
        ctx.textAlign = 'right'; ctx.fillText(clip(ctx, val, pw - preW), px + pw, cy);
      });
    }
    if (side) {
      var end = legend(pan.x, pan.y, pan.w);
      ranking(pan.x, end + 1.2 * u, pan.w);
    } else {
      var half = (pan.w - 2 * u) / 2;
      legend(pan.x, pan.y, half);
      ranking(pan.x + half + 2 * u, pan.y, half);
    }
  }
  // ---- 増減の棒（トップページの「10年前からの増減」と「グラフの画像を作る」の増減。2026年10月 作った人の指示で作り直し）
  // 見た瞬間に「何人増えた・減った」が分かるように：左に名前と2時点の人数、中央に0を基準にした棒（増加＝緑で右、減少＝赤で左）、
  // 右に増減の人数（大きく太く）と増減率。棒の長さはどの行も同じ目もりで、下に人数の目もりを書く。説明の文は入れない（色・目もり・数で分かる）。
  // 字の大きさ（1600×900 の画像のとき。ほかの大きさの画像は幅に合わせる）：名前 24px 太字・2時点の人数 23px・増減 29px 太字・増減率 22px・目もり 19px。
  // 字は小さくしすぎず、入らないときは表示する行を減らす。名前・人数・増減の列の幅は、いちばん長い字に合わせて決める（数を切らない）。
  // 前の時点の数がないもの（r[1] が null）は「比較不可」：増減も増減率も出さない（0人とはしない）。前が0人なら増減は出し、増減率は「—」。増減が0なら「0人」
  // rows：[[名前, 増減 or null, 今の数, 前の数 or null, 増減率 or null]]（ch.sort の並び順。先頭から描く）
  function ymd(w) { return w.slice(0, 4) + '年' + (w.slice(5) === '12' ? '末' : +w.slice(5) + '月末'); } // 2025年末・2025年6月末
  function diffT(v) { return v === 0 ? '0人' : signed(v) + '人'; }
  function rateT(r) { return r == null ? '—' : (Math.abs(r) < 0.05 ? '' : r > 0 ? '+' : '−') + Math.abs(r).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
  function sortName(ch) { return { now: ymd(ch.when) + 'の人数順', up: '増加人数順', down: '減少人数順', rate: '増減率順' }[ch.sort] || ch.sortName || ''; }
  var DIFF = { name: 32, count: 28, diff: 38, rate: 26, tick: 22, rank: 22 }; // 1600×900 のときの字の大きさ（px）
  function diffRows(ch, h, u) { // 字を小さくしないで入る行の数（多くても10）
    var k = u / 25, rowMin = DIFF.diff * 1.4 * k; // 1段の行（名前は2行まで）が入る高さ
    return Math.max(1, Math.min(10, ch.limit || 10, ch.rows.length, Math.floor((h - DIFF.tick * 2 * k) / rowMin)));
  }
  function drawDiff(ctx, ch, x, y, w, h, u) {
    if (!ch.rows.length) { noData(ctx, x, y, w, h, u); return; }
    var k = u / 25, n = diffRows(ch, h, u), rows = ch.rows.slice(0, n);
    // 縦に余裕のある形（正方形・縦長）は、空きを残さないよう字と行を大きくする（1.3倍まで。横長 1600×900 はそのまま）
    var boost = Math.max(1, Math.min(1.3, (h - DIFF.tick * 2 * k) / n / (DIFF.diff * k * 2.3))), f = {};
    Object.keys(DIFF).forEach(function (key) { f[key] = DIFF[key] * k * boost; });
    var gap = 16 * k, axisH = f.tick * 2;
    var rank = function (r, i) { return ch.sort !== 'now' && (ch.sort === 'rate' ? r[4] == null : r[1] == null) ? '—' : String(i + 1); }; // 比べられないものは順位なし
    var cts = rows.map(function (r) { return (r[3] == null ? '—' : fmt(r[3])) + ' → ' + fmt(r[2]); });
    var dvs = rows.map(function (r) { return r[1] == null ? '比較不可' : noUnit(diffT(r[1])); }), rts = rows.map(function (r) { return r[1] == null ? '' : rateT(r[4]); });
    // 列の幅（いちばん長い字に合わせる）
    ctx.font = font(f.rank); var rkW = maxW(ctx, rows.map(rank));
    ctx.font = font(f.count); var ctW = maxW(ctx, cts);
    ctx.font = font(f.diff, true); var dvW = maxW(ctx, dvs.filter(function (t) { return t !== '比較不可'; }));
    ctx.font = font(f.rate, true); dvW = Math.max(dvW, rows.some(function (r) { return r[1] == null; }) ? measure(ctx, '比較不可') : 0);
    ctx.font = font(f.rate); var rtW = maxW(ctx, rts.concat(['—']));
    ctx.font = font(f.name, true); var nmAll = maxW(ctx, rows.map(function (r) { return r[0]; }));
    var right = gap * 1.2 + dvW + gap + rtW, rh = Math.min((h - axisH) / n, f.diff * 3.2);
    // 並べ方：広ければ1段（名前｜人数｜棒｜増減｜増減率）。棒が狭くなるときは、名前の下に人数を書く（2段）
    var nmW = Math.min(nmAll, w * 0.24), barW = w - rkW - gap * 0.8 - nmW - gap - ctW - gap * 1.4 - right, two = false;
    if (barW < w * 0.34 && rh >= (f.name * 1.2 + f.count * 1.15) * 1.05) {
      two = true; nmW = Math.min(Math.max(nmAll, ctW), w * 0.32); barW = w - rkW - gap * 0.8 - nmW - gap * 1.4 - right;
    }
    var nx = x + rkW + gap * 0.8, bx = nx + nmW + (two ? gap * 1.4 : gap + ctW + gap * 1.4), dx = bx + barW + gap * 1.2 + dvW, rx = x + w;
    // 目もり：0をふくむ、きりのよい数（字が重ならない間隔）。棒の長さはこの目もりでそろえる
    var vals = rows.map(function (r) { return r[1]; }).filter(function (v) { return v != null; });
    var lo = Math.min.apply(null, [0].concat(vals)), hi = Math.max.apply(null, [0].concat(vals));
    if (hi === lo) { hi = lo + 1; }
    var X = function (v) { return bx + (v - lo) / (hi - lo) * barW; };
    ctx.font = font(f.tick);
    var labW = Math.max(measure(ctx, signed(hi)), measure(ctx, signed(lo))) + 20 * k, step = niceStep((hi - lo) / 6);
    while (barW * step / (hi - lo) < labW) { step = niceStep(step * 1.01); }
    var ticks = []; for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) { ticks.push(Math.round(t)); }
    var top = y, bottom = y + n * rh;
    ctx.lineWidth = Math.max(1, k);
    ticks.forEach(function (t2) { if (t2) { ctx.strokeStyle = C.grid2; ctx.beginPath(); ctx.moveTo(X(t2), top); ctx.lineTo(X(t2), bottom); ctx.stroke(); } });
    rows.forEach(function (r, i) {
      var ry = top + i * rh, cy = ry + rh / 2, bh = Math.min(rh * 0.46, 30 * k * boost);
      if (i < n - 1) { ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(x, ry + rh); ctx.lineTo(x + w, ry + rh); ctx.stroke(); }
      ctx.textBaseline = 'middle';
      ctx.font = font(f.rank); ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.fillText(rank(r, i), x + rkW, cy);
      ctx.textAlign = 'left'; ctx.fillStyle = C.text;
      if (two) { // 2段：名前（上）と2時点の人数（下）
        var a = fit1(ctx, r[0], nmW, f.name, true, f.name * 0.55), lh = a.size * 1.2 + f.count * 1.15, ty = cy - lh / 2;
        ctx.font = font(a.size, true); ctx.textBaseline = 'top'; ctx.fillText(a.text, nx, ty);
        ctx.font = font(f.count); ctx.fillStyle = C.sub; ctx.fillText(cts[i], nx, ty + a.size * 1.2);
      } else { // 1段：名前は2行まで（「・」などで折り返す）、人数は右にそろえる
        var nm = fitLines(ctx, r[0], nmW, f.name, true, rh >= f.name * 2.3 ? 2 : 1, f.name * 0.6); // 長い名前だけ小さく（切らない）
        ctx.font = font(nm.size, true);
        nm.lines.forEach(function (l, j) { ctx.fillText(l, nx, cy + (j - (nm.lines.length - 1) / 2) * nm.size * 1.15); });
        ctx.font = font(f.count); ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.fillText(cts[i], nx + nmW + gap + ctW, cy);
      }
      ctx.textBaseline = 'middle';
      if (r[1]) { ctx.fillStyle = r[1] > 0 ? C.up : C.down; var x0 = X(Math.min(0, r[1])), x1 = X(Math.max(0, r[1])); ctx.fillRect(x0, cy - bh / 2, Math.max(2 * k, x1 - x0), bh); }
      ctx.textAlign = 'right';
      if (r[1] == null) { ctx.font = font(f.rate, true); ctx.fillStyle = C.sub; } else { ctx.font = font(f.diff, true); ctx.fillStyle = C.text; }
      ctx.fillText(dvs[i], dx, cy);
      if (rts[i]) { ctx.font = font(f.rate); ctx.fillStyle = C.sub; ctx.fillText(rts[i], rx, cy); }
    });
    // 0の線と目もりの数
    ctx.fillStyle = C.zero; ctx.fillRect(X(0) - k, top - 4 * k, 2 * k, bottom - top + 8 * k);
    ctx.font = font(f.tick); ctx.fillStyle = C.sub; ctx.textBaseline = 'top';
    ticks.forEach(function (t2) {
      var tx = X(t2), s = t2 === 0 ? '0' : signed(t2), tw = measure(ctx, s);
      ctx.textAlign = tx - tw / 2 < x ? 'left' : tx + tw / 2 > x + w ? 'right' : 'center';
      ctx.fillText(s, tx, bottom + 8 * k);
    });
  }
  // 色のマス目（ヒートマップ。国籍から探す）：行＝地域区分、列＝年または在留資格。色は地図と同じオレンジの濃さ。
  // 州は、画面では見出しの行だが、画像では行の高さを使わないよう、左の細い列にその州の最初の行だけ書き、州の間に線を引く。
  // 凡例は、横長の画像では右に縦に並べ（縦の高さをマスに使う）、ほかは下に並べる。
  // マスの中の字（短い数・割合）は、入る大きさのときだけ書く。列の名前は横に入らなければ、日本語は縦書き・数は90度回して書く。
  // 長い名前（オーストラリア・ニュージーランド）は、小さくするか2行にする
  // rows：[[名前, 州の見出しの行か, 州と同じ名前の行か]]、cols：[列の名前]、cls・text：行ごとの [色の段]・[字]（見出しの行は null）、
  // legend：[[色の段, 字]]、mark：数え方が変わる列、markNote：その説明
  function drawHeat(ctx, ch, x, y, w, h, u) {
    var rows = [], st = null, cols = ch.cols, nc = cols.length, items = (ch.legend || []).map(function (l) { return [l[0], noUnit(l[1])]; }), nr; // 単位はタイトルの下
    ch.rows.forEach(function (r, j) {
      if (r[1]) { st = r[0]; return; }
      rows.push({ name: r[0], st: r[2] ? '' : st, first: r[2] || st !== null, top: r[2], cls: ch.cls[j], text: ch.text[j] });
      st = null;
    });
    nr = rows.length;
    // 凡例の置き場所と大きさ
    var side = w >= h * 1.6, head = '色の見方（' + ch.metric + '）', lf = px('tick', u), sw = px('tick', u), gw = w, gh = h, leg;
    if (side) {
      ctx.font = font(lf);
      var lgW = Math.min(w * 0.24, maxW(ctx, items.map(function (it) { return it[1]; })) + sw + 1.2 * u);
      var hd = fitLines(ctx, head, lgW, lf, true, 3, 0.7 * u), nt = null; // 数え方の変わり目の説明（markNote）は、画像のいちばん下の注記に書く
      gw = w - lgW - 2 * u;
      leg = { x: x + w - lgW, w: lgW, hd: hd, nt: nt };
    } else {
      var lines = [[]], lx = 0;
      ctx.font = font(lf, true); lx = measure(ctx, head + '：') + 0.4 * u;
      ctx.font = font(lf);
      items.forEach(function (it) {
        var iw = sw + 0.4 * u + measure(ctx, it[1]);
        if (lx + iw > w && lines[lines.length - 1].length) { lines.push([]); lx = 0; }
        lines[lines.length - 1].push({ it: it, x: lx }); lx += iw + 1.2 * u;
      });
      var nf1 = null;
      leg = { lines: lines, nt: nf1 };
      gh = h - (lines.length * 1.9 * lf + (nf1 ? nf1.lines.length * nf1.size * 1.3 + 0.3 * u : 0) + 0.8 * u);
    }
    // 名前の列の幅（州の列＋地域区分の列）：まず列の名前を横に書くとして行の高さを見積もり、その字の大きさで測る。全体の32%まで
    var rh0 = Math.min(2.4 * u, (gh - 1.8 * u) / nr), nf0 = Math.min(px('small', u), rh0 * 0.62);
    ctx.font = font(nf0, true);
    var stW = maxW(ctx, rows.map(function (r) { return r.st || ''; })) + 0.8 * u;
    var natural = Math.max(stW + maxW(ctx, rows.filter(function (r) { return !r.top; }).map(function (r) { return r.name; })),
      maxW(ctx, rows.filter(function (r) { return r.top; }).map(function (r) { return r.name; }))) + 0.8 * u;
    var nameW = Math.min(natural, gw * 0.32), subW = nameW - stW, cellW = (gw - nameW) / nc, cx0 = x + nameW;
    // 列の名前：横に入る大きさ（0.55u まで小さくする）。入らなければ縦書き（日本語）か90度回す（数）。高さは図の4分の1まで
    var colF = px('tick', u), mode = 'h', maxLen = Math.max.apply(null, cols.map(function (c) { return c.length; }));
    ctx.font = font(colF, true); var cw = maxW(ctx, cols);
    if (cw > cellW * 0.92) { colF *= cellW * 0.92 / cw; }
    var wrapped = null;
    if (colF < 0.55 * u && ch.vertical) { // 日本語（在留資格）は、まず2行に分けて横に書く（縦書きより高さを取らない）。「の」の後、なければ2字の後で分ける（技能／実習・特別／永住者）
      var split2 = function (c) { var k = c.indexOf('の'); return k > 0 && k < c.length - 1 ? [c.slice(0, k + 1), c.slice(k + 1)] : [c.slice(0, 2), c.slice(2)]; };
      for (var s = Math.min(nf0 * 1.1, u, cellW * 0.5); s >= 0.48 * u && !wrapped; s -= 0.02 * u) {
        ctx.font = font(s, true);
        var ws = cols.map(function (c) { return measure(ctx, c) <= cellW * 0.94 ? [c] : split2(c); });
        if (ws.every(function (l) { return maxW(ctx, l) <= cellW * 0.94; })) { wrapped = ws; colF = s; mode = 'w'; }
      }
    }
    if (!wrapped && colF < 0.55 * u) {
      colF = Math.min(1.1 * u, cellW * 0.7);
      if (ch.vertical) { mode = 'v'; colF = Math.min(colF, (gh * 0.25 - 0.6 * u) / (maxLen * 1.08)); }
      else { mode = 'r'; ctx.font = font(colF, true); cw = maxW(ctx, cols); colF = Math.min(colF, colF * (gh * 0.25 - 0.8 * u) / cw); }
    }
    ctx.font = font(colF, true); cw = maxW(ctx, cols);
    var nlines = wrapped ? Math.max.apply(null, wrapped.map(function (l) { return l.length; })) : 1;
    var headH = mode === 'v' ? maxLen * colF * 1.08 + 0.6 * u : mode === 'r' ? cw + 0.8 * u : nlines * colF * 1.15 + 0.35 * colF;
    var rh = Math.min(2.4 * u, (gh - headH) / nr), top = y + headH, gridH = nr * rh;
    var nf = Math.min(px('small', u), rh * 0.62), nmin = Math.max(0.55 * u, Math.min(0.85 * u, rh * 0.5));
    ctx.fillStyle = C.sub; ctx.font = font(colF, true);
    cols.forEach(function (c, i) {
      var mx = cx0 + (i + 0.5) * cellW;
      if (mode === 'v') { // 縦書き：下をそろえる
        var y0 = top - 0.4 * u - c.length * colF * 1.08;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; c.split('').forEach(function (c1, j) { ctx.fillText(c1, mx, y0 + j * colF * 1.08); });
      } else if (mode === 'r') { ctx.save(); ctx.translate(mx, top - 0.4 * u); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(c, 0, 0); ctx.restore(); }
      else if (mode === 'w') { // 折り返した名前：下をそろえる
        var ls = wrapped[i];
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ls.forEach(function (l, j) { ctx.fillText(l, mx, top - 0.3 * colF - (ls.length - 1 - j) * colF * 1.15); });
      } else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(c, mx, top - 0.3 * u); }
    });
    // 名前：1行に入るならそのまま。入らなければ「1行に入るまで小さくする」と「行の高さに2行が入る大きさで2行にする」の、字の大きいほう。
    // どちらも小さすぎるときは「…」で切る
    function nameFit(text, mw, bold) {
      ctx.font = font(nf, bold);
      var tw0 = measure(ctx, text);
      if (tw0 <= mw) { return { lines: [text], size: nf }; }
      var s1 = nf * mw / tw0 * 0.99, s2 = Math.min(nf, rh / 2.25);
      ctx.font = font(s2, bold); var ls = wrap(ctx, text, mw);
      if (ls.length <= 2 && s2 > s1 && s2 >= 0.4 * u) { return { lines: ls, size: s2 }; }
      if (s1 >= 0.4 * u) { return { lines: [text], size: s1 }; }
      var f = fit1(ctx, text, mw, nf, bold, nmin); return { lines: [f.text], size: f.size };
    }
    // マスの字の大きさ：いちばん長い字が、マスの幅と高さに入る大きさ（小さすぎるときは書かない）
    var texts = [].concat.apply([], rows.map(function (r) { return r.text; })), cf = Math.min(rh * 0.56, px('tick', u));
    ctx.font = font(cf, true); var tw = maxW(ctx, texts);
    if (tw > cellW * 0.88) { cf *= cellW * 0.88 / tw; }
    var showText = cf >= 0.42 * u, pad = Math.max(1, 0.08 * u);
    rows.forEach(function (r, j) {
      var yy = top + j * rh;
      if (r.first && j > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, 0.1 * u); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + gw, yy); ctx.stroke(); }
      if (r.st) { // 州の名前は、その州の最初の行だけ
        var g = fit1(ctx, r.st, stW - 0.6 * u, nf, true, nmin);
        ctx.fillStyle = C.sub; ctx.font = font(g.size, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(g.text, x, yy + rh / 2);
      }
      var lx2 = r.top ? x : x + stW, nm = nameFit(r.name, (r.top ? nameW : subW) - 0.6 * u, r.top); // 州と同じ名前の行（南アメリカ・無国籍）は州の列から太字で
      ctx.fillStyle = C.text; ctx.font = font(nm.size, r.top); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      nm.lines.forEach(function (l, k) { ctx.fillText(l, lx2, yy + rh / 2 + (k - (nm.lines.length - 1) / 2) * nm.size * 1.1); });
      r.cls.forEach(function (c, i) {
        var bx = cx0 + i * cellW;
        ctx.fillStyle = C.m[c] || C.m['b-n']; ctx.fillRect(bx + pad, yy + pad, cellW - 2 * pad, rh - 2 * pad);
        if (showText && r.text[i]) {
          ctx.fillStyle = c === 'b5' || c === 'b6' ? '#ffffff' : c === 'b-z' ? C.sub : C.text;
          ctx.font = font(cf, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.text[i], bx + cellW / 2, yy + rh / 2);
        }
      });
    });
    if (ch.mark != null) { // 数え方が変わる所（点線）
      var mx = cx0 + ch.mark * cellW;
      ctx.save(); ctx.strokeStyle = C.text; ctx.lineWidth = Math.max(1.5, 0.12 * u); ctx.setLineDash([0.5 * u, 0.35 * u]);
      ctx.beginPath(); ctx.moveTo(mx, top - 0.2 * u); ctx.lineTo(mx, top + gridH); ctx.stroke(); ctx.restore();
    }
    // 凡例
    function swatch(c, sx, cy) {
      ctx.fillStyle = C.m[c] || C.m['b-n']; ctx.fillRect(sx, cy - sw / 2, sw, sw);
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(sx, cy - sw / 2, sw, sw);
    }
    ctx.textAlign = 'left';
    if (side) {
      var ly = y;
      ctx.fillStyle = C.sub; ctx.font = font(leg.hd.size, true); ctx.textBaseline = 'top';
      leg.hd.lines.forEach(function (l) { ctx.fillText(l, leg.x, ly); ly += leg.hd.size * 1.3; });
      ly += 0.5 * u;
      var ih = Math.min(lf * 2.2, (h - (ly - y) - (leg.nt ? leg.nt.lines.length * leg.nt.size * 1.35 + 1.2 * u : 0)) / items.length);
      items.forEach(function (it, i) {
        var cy = ly + (i + 0.5) * ih, f = fit1(ctx, it[1], leg.w - sw - 0.6 * u, lf, false, 0.85 * u);
        swatch(it[0], leg.x, cy);
        ctx.fillStyle = C.text; ctx.font = font(f.size); ctx.textBaseline = 'middle'; ctx.fillText(f.text, leg.x + sw + 0.6 * u, cy);
      });
      if (leg.nt) {
        ly += items.length * ih + 1 * u; ctx.fillStyle = C.sub; ctx.font = font(leg.nt.size); ctx.textBaseline = 'top';
        leg.nt.lines.forEach(function (l) { ctx.fillText(l, leg.x, ly); ly += leg.nt.size * 1.35; });
      }
      return;
    }
    var by = top + gridH + 0.9 * u;
    ctx.textBaseline = 'middle';
    leg.lines.forEach(function (line, k) {
      var cy = by + k * 1.9 * lf + 0.8 * lf;
      if (k === 0) { ctx.fillStyle = C.sub; ctx.font = font(lf, true); ctx.fillText(head + '：', x, cy); }
      line.forEach(function (p) { swatch(p.it[0], x + p.x, cy); ctx.fillStyle = C.text; ctx.font = font(lf); ctx.fillText(p.it[1], x + p.x + sw + 0.4 * u, cy); });
    });
    if (leg.nt) {
      var ny = by + leg.lines.length * 1.9 * lf + 0.1 * u; ctx.fillStyle = C.sub; ctx.font = font(leg.nt.size); ctx.textBaseline = 'top';
      leg.nt.lines.forEach(function (l) { ctx.fillText(l, x, ny); ny += leg.nt.size * 1.3; });
    }
  }
  var DRAW = { line: drawLine, pie: drawPie, rank: drawRank, map: drawMapShape, diff: drawDiff, heat: drawHeat };

  // ---- タイトル・大事な数・投稿文
  function meta(cur) {
    var st = cur.meta || (window.KZD ? window.KZD.state() : { nat: [], visa: [] });
    return { nat: st.nat || [], visa: st.visa || [], src: cur.src || '出入国在留管理庁「在留外国人統計」', status: cur.status || '' };
  }
  // タイトルで使う短い呼び方（例：フィリピン人・在留資格「留学」）。「朝鮮」は国籍を表すものではない記載、「無国籍」は国籍がないので「〜人」にしない。
  // 「〜共和国」「〜連邦」も「〜の人」
  function person(x) { return x === '朝鮮' ? '朝鮮籍の人' : x === '無国籍' ? '無国籍の人' : /(共和国|連邦)$/.test(x) ? x + 'の人' : x + '人'; }
  function whoT(m) {
    if (!m.nat.length && !m.visa.length) { return '在留外国人'; }
    var v = '在留資格「' + m.visa.join('・') + '」';
    return m.nat.length ? m.nat.map(person).join('・') + (m.visa.length ? '（' + v + '）' : '') : v;
  }
  function metricT(s) { return String(s || '人数').replace('地域の人口に占める割合', '人口に占める割合'); }
  function firstLast(s) {
    var f = null, l = null, fi = -1, li = -1;
    s.vals.forEach(function (v, i) { if (v != null) { if (fi < 0) { f = v; fi = i; } l = v; li = i; } });
    return { f: f, l: l, fi: fi, li: li };
  }
  // タイトル：「地域｜だれの・何ごとの・何」（例：全国｜在留外国人の国籍・地域別構成、新潟県上越市｜フィリピン人の在留資格別増減）。時点は下の行に書く
  function autoTitle(cur) {
    if (cur.autoTitle) { return cur.autoTitle; }
    var ch = cur.chart, m = meta(cur), w = ch.who || whoT(m), area = ch.area || '全国';
    if (ch.kind === 'line') {
      var idx = ch.index ? '（指数）' : '';
      if (ch.series.length === 1) { return area + '｜' + w + 'の移り変わり' + idx; }
      // 線が何本か：何ごとに分けた線かを書く。選んだものどうしを比べるときは「〜別」を付けない。分け方が分からないときは線の名前を並べる
      var by = { nat: m.nat.length ? '' : '国籍・地域別の', visa: m.visa.length ? '' : '在留資格別の', area: '地域別の', pref: '都道府県別の', nx: '国籍・地域×在留資格別の' }[ch.dim];
      if (by != null) { return (ch.dim === 'area' ? '' : area + '｜') + w + 'の' + by + '移り変わり' + idx; }
      return area + '｜' + ch.series.map(function (s) { return s.name; }).slice(0, 3).join('・') + (ch.series.length > 3 ? 'など' : '') + 'の移り変わり' + idx;
    }
    if (ch.kind === 'pie') {
      if (ch.dim === 'visa') { return area + '｜' + (m.nat.length ? m.nat.map(person).join('・') : '在留外国人') + 'の在留資格別構成'; }
      if (ch.dim === 'pref') { return area + '｜在留外国人の都道府県別構成'; }
      return area + '｜' + (m.visa.length ? '在留資格「' + m.visa.join('・') + '」' : '在留外国人') + 'の国籍・地域別構成';
    }
    if (ch.kind === 'rank') { // what：「都道府県」「千葉県の市区町村」「全国の国籍・地域」「全国の国籍・地域（2025年12月末→2026年6月末）」など
      var wm = /^(.+?)の((?:市区町村|都道府県|国籍・地域|在留資格).*)$/.exec(ch.what || ''), place = wm ? wm[1] : area;
      return place + '｜' + w + 'の' + (wm ? wm[2] : ch.what || '').replace(/（[^）]*）$/, '') + '別' + metricT(ch.metric) + 'ランキング';
    }
    if (ch.kind === 'map') {
      var by2 = ch.level === 'muni' ? '市区町村別' : ch.level === 'world' ? '国籍・地域別' : '都道府県別';
      return (ch.level === 'muni' ? area : '全国') + '｜' + w + 'の' + by2 + (ch.from ? '増減' : metricT(ch.metric));
    }
    if (ch.kind === 'diff') { return area + '｜' + w + 'の' + ch.what + '別増減'; }
    return cur.title || '';
  }
  function keyNumbers(ch) {
    if (ch.kind === 'line' && ch.series.length === 1 && !ch.index) {
      var fl = firstLast(ch.series[0]);
      if (fl.fi < 0) { return []; }
      var out = [[ymd(ch.per[fl.fi]), fmt(fl.f) + '人'], [ymd(ch.per[fl.li]), fmt(fl.l) + '人']];
      if (fl.li > fl.fi) { out.push(['増減', diffT(fl.l - fl.f) + (fl.f ? '（' + rateT((fl.l - fl.f) / fl.f * 100) + '）' : '')]); }
      return out;
    }
    if (ch.kind === 'pie') { return [['合計', fmt(ch.total) + '人'], ['いちばん多い', ch.parts[0].name + ' ' + (ch.parts[0].v / ch.total * 100).toFixed(1) + '%']]; }
    if (ch.kind === 'rank' && ch.rows.length) { return [['1位', ch.rows[0][0]], [metricT(ch.metric), ch.f(ch.rows[0][1])]]; }
    if (ch.kind === 'map' && ch.sorted.length) { return [['いちばん多い', ch.sorted[0][0]], [metricT(ch.metric), ch.sorted[0][1] == null ? '—' : ch.f(ch.sorted[0][1])]]; }
    return [];
  }
  function period(ch) { return ch.kind === 'diff' || (ch.kind === 'map' && ch.from) ? wl(ch.from) + ' → ' + wl(ch.when) : (ch.kind === 'line' || ch.kind === 'heat') && ch.from ? wl(ch.from) + '〜' + wl(ch.when) : wl(ch.when); }
  // 画像のタイトルの下に書く時点（年末は「2025年末」）。半期速報の増加人数は、比べた2つの時点
  function whenT(ch) {
    if (ch.kind === 'diff' || (ch.kind === 'map' && ch.from)) { return ymd(ch.from) + ' → ' + ymd(ch.when); }
    if ((ch.kind === 'line' || ch.kind === 'heat') && ch.from) { return ymd(ch.from) + '〜' + ymd(ch.when); }
    var pm = /（(\d{4}年\d+月末)→(\d{4}年\d+月末)）$/.exec(ch.what || '');
    if (pm) { return [pm[1], pm[2]].map(function (s) { return s.replace(/^(\d+)年12月末$/, '$1年末'); }).join(' → '); }
    return ch.when ? ymd(ch.when) : '';
  }
  // グラフの中の数の単位（人数を描く図は「人」。割合・指数は数に％や説明が付くので書かない）
  function unitOf(ch) {
    if (ch.kind === 'line') { return ch.index ? '' : '人'; }
    if (ch.kind === 'pie' || ch.kind === 'diff') { return '人'; }
    if (ch.kind === 'heat') { return ch.metric === '人数' ? '人' : ''; }
    var t = ch.kind === 'rank' ? ch.rows.map(function (r) { return ch.f(r[1]); }).join('') :
      ch.kind === 'map' ? (ch.sorted || []).map(function (r) { return r[1] == null ? '' : ch.f(r[1]); }).join('') + (ch.legend || []).map(function (l) { return l[1]; }).join('') : '';
    return /[0-9]人/.test(t) ? '人' : '';
  }
  function firstWhen(ch) { return ch.from || (ch.per && ch.per[0]) || ch.when || ''; }
  // 出典：2012年12月末からだけの図は「在留外国人統計」、それより前をふくむ図は「在留外国人統計（旧登録外国人統計）」（半期速報などは、そのまま）
  function srcOf(src, from) {
    var base = src.replace('（旧登録外国人統計）', '');
    if (base.indexOf('出入国在留管理庁「在留外国人統計」') !== 0) { return src; }
    return from && from < '2012-12' ? base.replace('「在留外国人統計」', '「在留外国人統計（旧登録外国人統計）」') : base;
  }
  function postText(cur, title) {
    var ch = cur.chart, k = keyNumbers(ch).map(function (x) { return x[0] + '：' + x[1]; }).join('、');
    if (ch.kind === 'diff') { // 増減：今の並び順の上の3つ
      k = sortName(ch) + '：' + ch.rows.slice(0, 3).map(function (r, i) { return (i + 1) + '. ' + r[0] + ' ' + (r[1] == null ? '比較不可' : diffT(r[1]) + '（' + rateT(r[4]) + '）'); }).join('、');
    }
    return title + '\n' + (k ? k + '\n' : '') + '統計時点：' + period(ch) + (meta(cur).status ? '（' + meta(cur).status + '）' : '') + '\n出典：' + srcOf(meta(cur).src, firstWhen(ch)) + '\n#在留外国人';
  }

  // ---- 1枚の画像を組み立てる。opts.site：右下にサイトの名前を入れる
  // どの図も同じ形（2026年10月 作った人の指示。増減の棒にそろえた）：白い地に、上にタイトル（「地域｜…」）とその下に時点だけ。
  // 「地域：」「国籍・地域：」「統計時点：」のラベルや飾りの線は入れない。出典と注記（技人国の説明・数え方の変わり目など）は、いちばん下にまとめる。
  // 字の大きさは px()（1600×900 のとき タイトル 44px・時点 24px・名前 24px・数 23px・大事な数 34px・目もり 19px・出典と注記 18px）
  function compose(items, size, title, opts) {
    opts = opts || {};
    var vn = vnote([].concat.apply([], items.map(function (x) { return chartNames(x.chart); })));
    items = items.map(function (x) { return copy(x, { chart: shortChart(x.chart) }); });
    var W = size[1], H = size[2], cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), u = H > W ? W / 56 : W / 64, k = u / 25, pad = 44 * k;
    // 描いた字（あとで、その字の入った字のファイルを読み込む）と、字の置かれた四角（字が重なっていないかを確かめるため）
    var drawn = [], boxes = [], fill = ctx.fillText;
    ctx.fillText = function (t, a, b) {
      var mt = ctx.measureText(t);
      boxes.push({ t: t, x0: a - mt.actualBoundingBoxLeft, x1: a + mt.actualBoundingBoxRight, y0: b - mt.actualBoundingBoxAscent, y1: b + mt.actualBoundingBoxDescent });
      drawn.push(t); return fill.call(ctx, t, a, b);
    };
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var cur = items[0], m = meta(cur), ch = cur.chart, y = pad, one = items.length === 1;
    // タイトル（1行。入らなければ小さくし、それでも入らなければ2行）
    var t = fitOne(ctx, title || autoTitle(cur), W - 2 * pad, px('title', u), true, 36 * k);
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    t.lines.forEach(function (l) { ctx.font = font(t.size, true); ctx.fillText(l, pad, y); y += t.size * 1.28; });
    // タイトルの下：時点だけ（増減の棒は並び順も。半期速報は「（速報）」）
    var sub = one && ch.kind === 'diff' ? whenT(ch) + (sortName(ch) ? '（' + sortName(ch) + '）' : '') :
      items.map(function (x) { return whenT(x.chart); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('・') + (m.status ? '（' + m.status + '）' : '');
    var units = items.map(function (x) { return unitOf(x.chart); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    if (units.length) { sub += '　単位：' + units.join('・'); } // グラフの中の数には付けない単位を、ここにまとめて書く
    if (sub) {
      var s2 = fitOne(ctx, sub, W - 2 * pad, px('sub', u), false, 22 * k);
      ctx.fillStyle = C.sub; s2.lines.forEach(function (l) { ctx.font = font(s2.size); ctx.fillText(l, pad, y); y += s2.size * 1.35; });
    }
    y += 22 * k;
    // 出典と注記：いちばん下にまとめる（サイトの名前は、選んだときだけ右下）
    var siteW = 0, nf = px('note', u);
    if (opts.site) { ctx.font = font(nf, true); siteW = measure(ctx, SITE) + 2 * u; }
    var from = items.map(function (x) { return firstWhen(x.chart); }).sort()[0], pop = items.some(function (x) { return x.chart.pop; });
    var srcs = items.map(function (x) { return srcOf(meta(x).src, from); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var notes = [vn].concat(items.map(function (x) { return x.chart.markNote || ''; }));
    if (one && ch.kind === 'diff') { // 増減の棒：比較不可の意味と、何件のうち何件を描いたか
      var shown = diffRows(ch, H - y - pad - 3 * nf * 1.35 - 18 * k, u), cnt = ch.count || ch.rows.length;
      ch.limit = shown; // 注記の「何件のうち何件」と、描く行の数をそろえる
      notes.push(ch.rows.slice(0, shown).some(function (r) { return r[1] == null; }) ? '比較不可は' + ymd(ch.from) + 'の数がないものです。' : '');
      notes.push(cnt > shown ? '全' + fmt(cnt) + '件のうち' + shown + '件を表示しています。' : '');
    }
    var foot = [fitLines(ctx, '出典：' + srcs.join('、') + (pop ? '、総務省「住民基本台帳に基づく人口」' : '') + 'を加工して作成', W - 2 * pad - siteW, nf, false, 2, 17 * k)];
    notes = notes.filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('　');
    if (notes) { foot.push(fitLines(ctx, notes, W - 2 * pad, nf, false, 3, 16 * k)); }
    var footGap = 14 * k, footH = foot.reduce(function (s, f) { return s + f.lines.length * f.size * 1.35; }, 0) + 18 * k, bottom = H - pad - footH;
    // 大事な数（横長の地図は、地図と凡例を大きくするため出さない。いちばん多い所は「多い順」にある）。色の付いた箱は使わず、細い灰色の線で区切る
    var keys = one && !(ch.kind === 'map' && W > H) ? keyNumbers(ch) : [];
    var gx = pad, gy = y, gw = W - 2 * pad, gh = bottom - y, kl = px('tick', u), kv = 42 * k;
    if (keys.length) {
      ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, k);
      if (W > H) { // 横長：右に縦に並べる
        var kw = Math.min(gw * 0.26, 400 * k), kx = W - pad - kw, kh = Math.min(gh / keys.length, 150 * k);
        ctx.beginPath(); ctx.moveTo(kx - 20 * k, gy); ctx.lineTo(kx - 20 * k, gy + kh * keys.length); ctx.stroke();
        keys.forEach(function (k2, i) {
          var ky = gy + i * kh + 10 * k;
          if (i) { ctx.beginPath(); ctx.moveTo(kx, ky - 10 * k); ctx.lineTo(kx + kw, ky - 10 * k); ctx.stroke(); }
          var a = fit1(ctx, k2[0], kw, kl, false, 15 * k);
          ctx.fillStyle = C.sub; ctx.font = font(a.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, kx, ky);
          var room = kh - 20 * k - a.size * 1.4, b = fitLines(ctx, noUnit(k2[1]), kw, Math.min(kv, room / 1.2), true, 2, Math.min(22 * k, room / 2.4));
          ctx.fillStyle = C.text; ctx.font = font(b.size, true);
          b.lines.forEach(function (l, j) { ctx.fillText(l, kx, ky + a.size * 1.4 + j * b.size * 1.18); });
        });
        gw -= kw + 44 * k;
      } else { // 正方形・縦長：上に横に並べる
        var bw = (gw - (keys.length - 1) * 32 * k) / keys.length, bh2 = kl * 1.4 + kv * 1.25;
        keys.forEach(function (k2, i) {
          var bx = gx + i * (bw + 32 * k);
          if (i) { ctx.beginPath(); ctx.moveTo(bx - 16 * k, gy); ctx.lineTo(bx - 16 * k, gy + bh2); ctx.stroke(); }
          var a = fit1(ctx, k2[0], bw, kl, false, 15 * k);
          ctx.fillStyle = C.sub; ctx.font = font(a.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, bx, gy);
          var b = fit1(ctx, noUnit(k2[1]), bw, kv, true, 20 * k);
          ctx.fillStyle = C.text; ctx.font = font(b.size, true); ctx.fillText(b.text, bx, gy + kl * 1.4);
        });
        ctx.beginPath(); ctx.moveTo(gx, gy + bh2 + 14 * k); ctx.lineTo(gx + gw, gy + bh2 + 14 * k); ctx.stroke();
        gy += bh2 + 34 * k; gh -= bh2 + 34 * k;
      }
    }
    // 図（いくつかまとめるときは、横長は横に、ほかは縦に並べる）。それぞれの図の見出しは2行まで
    var n = items.length, side = W > H && n > 1, gapX = 1.8 * u, gapY = 1.4 * u;
    var cw0 = side ? (gw - (n - 1) * gapX) / n : gw, ch0 = side ? gh : (gh - (n - 1) * gapY) / n;
    items.forEach(function (it, i) {
      var cx = side ? gx + i * (cw0 + gapX) : gx, cy = side ? gy : gy + i * (ch0 + gapY), cw = cw0, chh = ch0, uu = u * (n > 1 ? 0.9 : 1);
      if (n > 1) {
        if (side && i > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(cx - gapX / 2, cy); ctx.lineTo(cx - gapX / 2, cy + chh); ctx.stroke(); }
        var ht = fitLines(ctx, autoTitle(it) + '（' + whenT(it.chart) + '）', cw, 26 * k, true, 2, 19 * k); // 画面の見出し（it.title）は時点が入っているので使わない
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ht.lines.forEach(function (l, j) { ctx.font = font(ht.size, true); ctx.fillText(l, cx, cy + j * ht.size * 1.25); });
        var used = ht.lines.length * ht.size * 1.25 + 0.8 * u; cy += used; chh -= used;
      }
      var fn = DRAW[it.chart.kind];
      if (fn) { ctx.save(); fn(ctx, it.chart, cx, cy, cw, chh, uu, W > H); ctx.restore(); } // 最後は「横長の画像か」（折れ線の凡例の置き場所）
    });
    // 出典と注記（とサイトの名前）
    var ly = bottom + footGap / 2;
    ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(pad, ly); ctx.lineTo(W - pad, ly); ctx.stroke();
    ctx.fillStyle = C.sub; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    var fy = bottom + footGap;
    foot.forEach(function (f) { f.lines.forEach(function (l) { ctx.font = font(f.size); ctx.fillText(l, pad, fy); fy += f.size * 1.35; }); });
    if (opts.site) { ctx.font = font(nf, true); ctx.fillStyle = C.accent; ctx.textAlign = 'right'; ctx.fillText(SITE, W - pad, bottom + footGap); }
    ctx.fillText = fill;
    cv._text = drawn.join(''); cv._boxes = boxes;
    return cv;
  }

  // ---- 日本語の字：Google Fonts の Noto Sans JP を、ページの字とは別の名前で読み込む（ページの見た目は変えない）
  var faceCss = null, known = {};
  function fontFaces() {
    if (!faceCss) {
      faceCss = fetch(FONT_CSS).then(function (r) { if (!r.ok) { throw new Error('font'); } return r.text(); }).then(function (css) {
        var st = document.createElement('style'); st.textContent = css.replace(/font-family:\s*['"]Noto Sans JP['"]/g, "font-family: '" + FAMILY + "'");
        document.head.appendChild(st);
      }).catch(function () { /* 読み込めなくても、ほかの字で描く */ });
    }
    return faceCss;
  }
  function glyphs(text) { // その字の入った字のファイルを読み込む（読み込めた・読み込めなかったにかかわらず、終わったら次へ）
    var need = Array.from(new Set(text)).filter(function (c) { return !known[c] && c.trim(); });
    if (!need.length || !document.fonts || !document.fonts.load) { return Promise.resolve(false); }
    need.forEach(function (c) { known[c] = 1; });
    var t = need.join('');
    return fontFaces().then(function () {
      return Promise.race([Promise.all([document.fonts.load("400 40px '" + FAMILY + "'", t), document.fonts.load("700 40px '" + FAMILY + "'", t)]),
        new Promise(function (res) { setTimeout(res, 6000); })]);
    }).then(function () { return true; }, function () { return false; });
  }

  // ---- 画面（作る前に見え方を確かめる）
  function openDialog(getCurrent) {
    var cur = getCurrent();
    if (!cur || !cur.chart) { alert('この画面には、画像にできる図がありません。'); return; }
    var opener = document.activeElement;
    var ov = el('div', 'xov'), box = el('div', 'xbox'); ov.appendChild(box);
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'xbox-h');
    var head = el('div', 'xhead'); head.appendChild(el('h2', null, '画像を保存')); head.lastChild.id = 'xbox-h';
    var bX = el('button', 'xclose', '<span aria-hidden="true">×</span> 閉じる'); bX.type = 'button'; head.appendChild(bX); box.appendChild(head);
    box.appendChild(el('p', 'dhelp', 'グラフ・対象・統計時点・凡例・出典を入れた PNG 画像を作ります。Xなどへの投稿にも使えます。'));
    var form = el('div', 'xform');
    var sizeSel = el('select'); SIZES.forEach(function (s) { var o = el('option'); o.value = s[0]; o.textContent = s[3]; sizeSel.appendChild(o); });
    var lab1 = el('label', 'dctl'); lab1.appendChild(el('span', 'dlab', '画像の形')); lab1.appendChild(sizeSel); form.appendChild(lab1);
    var useSel = el('select');
    [['one', 'この図だけ'], ['basket', 'まとめた図（' + basket.length + '）'], ['plus', 'まとめた図とこの図（' + Math.min(3, basket.length + 1) + '）']].forEach(function (x, i) {
      var o = el('option'); o.value = x[0]; o.textContent = x[1]; if (i > 0 && !basket.length) { o.disabled = true; } useSel.appendChild(o);
    });
    var lab2 = el('label', 'dctl'); lab2.appendChild(el('span', 'dlab', '入れる図')); lab2.appendChild(useSel);
    if (basket.length) { form.appendChild(lab2); }
    var siteCb = el('input'); siteCb.type = 'checkbox';
    var lab4 = el('label', 'dcheck'); lab4.appendChild(siteCb); lab4.appendChild(document.createTextNode(' サイト名を入れる（右下。アドレスは入れません）')); form.appendChild(lab4);
    var tIn = el('input'); tIn.type = 'text'; tIn.value = autoTitle(cur);
    var lab3 = el('label', 'dctl xtitle'); lab3.appendChild(el('span', 'dlab', 'タイトル（自動で作ります。書き直せます）')); lab3.appendChild(tIn); form.appendChild(lab3);
    box.appendChild(form);
    var prev = el('div', 'xprev'); box.appendChild(prev);
    var acts = el('div', 'dtools');
    var bSave = el('button', 'dbtn', 'PNGで保存'), bCopy = el('button', 'dbtn dbtn-sub', '画像をコピー'), bShare = el('button', 'dbtn dbtn-sub', '共有・写真に保存'), bClose = el('button', 'dbtn dbtn-sub', '閉じる');
    [bSave, bCopy, bShare, bClose].forEach(function (b) { b.type = 'button'; acts.appendChild(b); });
    bShare.hidden = !(navigator.canShare && window.File && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    box.appendChild(acts);
    var msg = el('p', 'dhelp xmsg'); msg.setAttribute('role', 'status'); box.appendChild(msg);
    var txt = el('textarea', 'xtext'); txt.rows = 5;
    var tLab = el('label', 'dctl'); tLab.appendChild(el('span', 'dlab', '投稿文（自動で作ります。書き直せます）')); tLab.appendChild(txt); box.appendChild(tLab);
    var acts2 = el('div', 'dtools'), bText = el('button', 'dbtn dbtn-sub', '投稿文をコピー'), aX = el('a', 'dbtn dbtn-sub', 'Xの投稿画面を開く');
    bText.type = 'button'; aX.target = '_blank'; aX.rel = 'noopener';
    acts2.appendChild(bText); acts2.appendChild(aX); box.appendChild(acts2);
    box.appendChild(el('p', 'dhelp', 'Xの投稿画面には画像は自動でつきません。先に「PNGで保存」か「画像をコピー」をして、投稿画面に画像を貼り付けてください。'));
    var canvas = null, busy = Promise.resolve();
    function items() { var v = useSel.value; return (v === 'one' ? [cur] : v === 'basket' ? basket.slice() : basket.concat([cur])).slice(-3); }
    function draw() {
      var size = SIZES.filter(function (s) { return s[0] === sizeSel.value; })[0];
      canvas = compose(items(), size, tIn.value, { site: siteCb.checked });
      canvas.className = 'xcanvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '画像の見本：' + tIn.value);
      prev.replaceChildren(canvas);
      if (!txt.dataset.edited) { txt.value = postText(cur, tIn.value); }
      aX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt.value);
      return canvas._text;
    }
    function redraw() { // まず手元の字で描き、足りない字を読み込んだら描き直す
      var text = draw();
      busy = glyphs(text).then(function (got) { if (got && ov.isConnected) { draw(); } });
      return busy;
    }
    sizeSel.addEventListener('change', redraw); useSel.addEventListener('change', redraw); siteCb.addEventListener('change', redraw);
    tIn.addEventListener('input', redraw);
    txt.addEventListener('input', function () { txt.dataset.edited = '1'; aX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt.value); });
    function fileName() { return tIn.value.replace(/[\\/:*?"<>|？\s]+/g, '_').slice(0, 60) + '_' + sizeSel.value + '.png'; }
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
    bShare.addEventListener('click', function () { // スマホ：共有の画面から「画像を保存」で写真に入れられる
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
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('xopen'); if (opener && opener.focus) { opener.focus(); } }
    function onKey(ev) {
      if (ev.key === 'Escape') { close(); return; }
      if (ev.key === 'Tab') { // 画面の中だけを順に移る
        var f = Array.prototype.filter.call(box.querySelectorAll('button, select, input, textarea, a[href]'), function (e) { return !e.disabled && !e.hidden && e.offsetParent; });
        if (!f.length) { return; }
        if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
      }
    }
    bClose.addEventListener('click', close); bX.addEventListener('click', close);
    ov.addEventListener('click', function (ev) { if (ev.target === ov) { close(); } });
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('xopen');
    document.body.appendChild(ov);
    prev.textContent = '画像を作っています…';
    redraw();
    sizeSel.focus();
  }
  function buttons(bar, getCurrent) {
    var b1 = el('button', 'dbtn', '画像を保存'), b2 = el('button', 'dbtn dbtn-sub', 'この図をまとめに加える');
    b1.type = b2.type = 'button';
    b2.title = '3つまでの図を1枚の画像にまとめられます（「画像を保存」の「入れる図」で選びます）';
    b1.addEventListener('click', function () { openDialog(getCurrent); });
    b2.addEventListener('click', function () {
      var c = getCurrent(); if (!c || !c.chart) { return; }
      if (basket.length >= 3) { basket.shift(); }
      basket.push({ chart: c.chart, title: c.title, autoTitle: c.autoTitle, meta: c.meta || (window.KZD ? JSON.parse(JSON.stringify({ nat: window.KZD.state().nat, visa: window.KZD.state().visa })) : null), src: c.src, status: c.status });
      b2.textContent = 'まとめに加えました（' + basket.length + '／3）';
      setTimeout(function () { b2.textContent = 'この図をまとめに加える'; }, 2000);
    });
    bar.appendChild(b1); bar.appendChild(b2);
  }
  window.KZX = { buttons: buttons, open: openDialog, compose: compose, autoTitle: autoTitle, SIZES: SIZES, postText: postText, glyphs: glyphs };
})();
