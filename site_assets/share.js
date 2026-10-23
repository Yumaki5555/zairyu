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
  // sub（時点・目もり・出典など）も、スマホで小さく見ても読めるよう濃いめの灰色
  var C = { text: '#1d2330', sub: '#3d4555', line: '#dfe3ea', grid: '#e4e3dc', bg: '#ffffff', soft: '#f3f5f8', mark: '#b7791f', accent: '#1f7a4f',
    grid2: '#e6e8ec', line2: '#eef0f3', zero: '#5b6474', // 増減の棒：目もりの線・行の区切り（薄い灰色）・0の線
    up: '#29a97f', down: '#c23a33', // 増えた・減った（style.css の --up・--down と同じ）
    s: { '1': '#2a78d6', '2': '#eb6834', '3': '#1baf7a', '4': '#eda100', '5': '#e87ba4', '6': '#008300', '7': '#6250d6', o: '#b9bdc5' },
    m: { b0: '#fde9d7', b1: '#fbcfa6', b2: '#f7ae70', b3: '#f08a3e', b4: '#d76a1f', b5: '#ac4f12', b6: '#7c360b', 'b-z': '#eef0f3', 'b-n': '#f6f7f9', 'b-u': '#f6f7f9',
      d1: '#cfe1f6', d2: '#8fb8e8', d3: '#4a86cf' } };
  var basket = []; // まとめた図（複数の図を1枚にするとき）
  // 画像の字の大きさ（2026年10月 作った人の指示。スマホの幅（約390px）に縮めて見ても、拡大しないで読める大きさ。1600×900 のときの px。ほかの大きさの画像は幅に合わせる）：
  // （指示の幅のいちばん大きい値）タイトル 54・タイトルの下（時点と単位）30・グラフの中の名前（国籍・在留資格など）36（太字）・数 36・大事な数（合計など）56（太字）・小さい字 30・目もり 26・出典と注記 24。
  // どの字も min（22）より小さくしない。入らないときは字を小さくせず、並べ方を変えるか、書く物を減らす（円グラフは少ないものを「その他」にまとめる など）。
  // グラフの中の数には単位（人）を付けず、タイトルの下に「単位：人」とまとめて書く（そのぶん名前と数を大きくする）
  var TYPE = { title: 54, sub: 30, name: 36, value: 36, big: 56, small: 30, tick: 26, note: 24, min: 22 };
  function px(key, u) { return TYPE[key] * u / 25; }
  var FLOOR = 0; // いちばん小さい字の大きさ（px）。compose で画像の大きさに合わせて決める（1600×900 で 22px）
  function atLeast(s) { return Math.max(FLOOR, s); }
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
      (ch.rows || []).map(function (r) { return r[0]; }), (ch.sorted || []).map(function (r) { return r[0]; }), ch.cols || [],
      [].concat.apply([], (ch.bars || []).map(function (b) { return b.segs.map(function (s) { return s.name; }); })));
  }
  function shortChart(ch) {
    var row = function (r) { return [vs(r[0])].concat(r.slice(1)); };
    return copy(ch, {
      parts: ch.parts && ch.parts.map(function (p) { return copy(p, { name: vs(p.name) }); }),
      series: ch.series && ch.series.map(function (s) { return copy(s, { name: vs(s.name) }); }),
      rows: ch.rows && ch.rows.map(row), sorted: ch.sorted && ch.sorted.map(row), cols: ch.cols && ch.cols.map(vs),
      // 国籍・地域ごとの主な在留資格：区分の名前を短くし（色は元の名前で決める）、棒の全体が何かを最下部の注記に書く
      bars: ch.bars && ch.bars.map(function (b) { return copy(b, { segs: b.segs.map(function (s) { return copy(s, { name: vs(s.name), full: s.name }); }) }); }),
      markNote: ch.kind === 'cross' && !ch.markNote ? CROSS_NOTE : ch.markNote });
  }
  function color(cls) { return C.s[cls] || C.s.o; }
  // 凡例の色見本。点線の線（色の数より多い分類。不法残留の国籍・地域の8つ目からなど）は、見本も点線（短い太線を2つ）にする
  function swatch(ctx, it, x, cy, s) {
    ctx.fillStyle = color(it.cls);
    if (it.dash) { ctx.fillRect(x, cy - s * 0.22, s * 0.4, s * 0.44); ctx.fillRect(x + s * 0.6, cy - s * 0.22, s * 0.4, s * 0.44); } else { ctx.fillRect(x, cy - s / 2, s, s); }
  }

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
    minPx = Math.min(atLeast(minPx || px * 0.6), px); // いちばん小さい大きさ（FLOOR より小さくしない）も、はじめの大きさより大きくはしない（行の高さからはみ出さないように）
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
    minPx = Math.min(atLeast(minPx || px * 0.7), px);
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
  // 時点の名前：ふつうは「2025年末」「2025年6月末」。在留外国人統計ではない図（不法残留の1月1日・7月1日、帰化の年ごとの数）は、
  // ページが渡す名前（ch.labels：時点ごと、ch.whenText：タイトルの下と投稿文）と横の位置（ch.at：年の目もりが整数の所）を使う
  function lab(ch, i) { return ch.labels ? ch.labels[i] : ymd(ch.per[i]); }
  function short(v) { return Math.abs(v) >= 10000 ? (v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万' : fmt(Math.round(v)); }
  function noData(ctx, x, y, w, h, u) {
    var f = fit1(ctx, 'この図のデータがありません', w, 1.8 * u, false, 1 * u);
    ctx.fillStyle = C.sub; ctx.font = font(f.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, x + w / 2, y + h / 2);
  }
  // 折れ線の凡例を下に並べる。items：[{cls, name, val}]、head：上に書く見出し（時点）。高さを返し、draw(x, y) で描く
  // 名前（太字）と数は右の凡例と同じ大きさ。幅に入るだけ列を増やして行を減らす（図を高くする）。高さか幅に入らなければ字を小さくする
  function legendBelow(ctx, items, w, maxH, u, head) {
    var hh = head ? px('tick', u) * 1.9 : 0, n = items.length, gap = 2.4 * u, p = null;
    var scMin = FLOOR / Math.min(px('name', u), px('value', u)); // 字は FLOOR より小さくしない
    for (var sc = 1; sc >= scMin - 1e-9; sc -= 0.05) {
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
        swatch(ctx, it, cx, cy, p.sw);
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
    var xs = ch.at || ch.per.map(wx), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var cxm = wx('2012-12') - 0.25, mark = !ch.at && x0 < cxm && cxm <= x1; // 数え方の変わり目は在留外国人統計の図だけ
    // 凡例の数：いちばん新しい時点の数。時点と単位は凡例の見出しにまとめて書く（その時点の数がない線だけ、数のある最後の時点を添える）
    function valText(s) {
      var i = last; while (i >= 0 && s.vals[i] == null) { i--; }
      if (i < 0) { return ''; }
      var v = s.vals[i], t = ch.index ? v.toFixed(1) : ch.f ? noUnit(ch.f(v)) : fmt(Math.round(v));
      return i === last ? t : t + '（' + lab(ch, i) + '）';
    }
    var head = lab(ch, last) + (ch.index ? 'の指数　はじめの時点＝100' : 'の数'); // 「　」の所で2行に分けられる。単位はタイトルの下
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
      if (rowW > w * 0.42 || Math.min(nf, vf) < FLOOR) { legRight = false; } else { // 名前と数が右に入らないとき（字が小さくなるときも）は下に並べる（名前を「…」で切らない）
        legW = Math.max(rowW, maxW(ctx, hl)); rowW = Math.min(rowW, legW);
        var headH = hl.length * hf * 1.3 + 0.8 * u;
        lg = { hl: hl, hf: hf, headH: headH, lh: lh, nf: nf, vf: vf, sw: sw, rowW: rowW, vals: vals, vlW: vlW, top: y + Math.max(0, (h - headH - n * lh) / 2) };
      }
    }
    if (multi && !legRight) { leg = legendBelow(ctx, series.map(function (s) { return { cls: s.cls, dash: s.dash, name: s.name, val: valText(s) }; }), w, h * 0.34, u, head.replace('　', '（') + (head.indexOf('　') >= 0 ? '）' : '')); }
    var T = y + (mark ? fa * 2 : fa * 0.6), B = y + h - fa * 2 - (leg ? leg.h + 1.4 * u : 0);
    var all = []; series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) { all.push(v); } }); });
    var nt = Math.max(2, Math.min(5, Math.floor((B - T) / (3 * u))));
    var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all), step = niceStep((hi - lo || 1) / nt);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi * 1.03 / step) * step || step;
    for (var tries = 0; tries < 20 && (B - T) * step / (y1 - y0) < fa * 1.5; tries++) { // 図が低いときは、目もりの数字が重ならないよう間を広げる
      step = niceStep(step * 1.01); y0 = Math.floor(lo / step) * step; y1 = Math.ceil(hi * 1.03 / step) * step || step;
    }
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
    var off = ch.at ? 0 : 0.5; // 在留外国人統計の図は年の数字を12月末の所に。ch.at の図は整数の所（1月1日・その年）に
    for (var yr = Math.ceil((x0 - off) / ys) * ys; yr + off <= x1 + 1e-9; yr += ys) {
      var tw = measure(ctx, String(yr)), tx = Math.min(Math.max(X(yr + off), L + tw / 2), R - tw / 2);
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
      ctx.setLineDash(s.dash ? [1.1 * u, 0.9 * u] : []); // 点線の線（s.dash）
      ctx.beginPath(); var pen = false;
      s.vals.forEach(function (v2, i) { if (v2 == null) { pen = false; return; } if (pen) { ctx.lineTo(X(xs[i]), Y(v2)); } else { ctx.moveTo(X(xs[i]), Y(v2)); pen = true; } });
      ctx.stroke(); ctx.setLineDash([]);
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
        swatch(ctx, s, lx, cy, lg.sw);
        ctx.textBaseline = 'middle';
        ctx.font = font(lg.vf); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.fillText(lg.vals[i], lx + lg.rowW, cy);
        ctx.font = font(lg.nf, true); ctx.textAlign = 'left'; ctx.fillText(clip(ctx, s.name, lg.rowW - lg.sw - 0.6 * u - lg.vlW - 1.2 * u), tx, cy);
      });
    }
    if (leg) { leg.draw(x, B + fa * 2 + 1.4 * u); }
  }

  // 円グラフ（2026年10月 作った人の指示で作り直し）：円は小さめ（横長の画像で幅の4割まで）にし、横に「色・名前・人数・割合」の一覧を大きな字で並べる。
  // 名前は左、人数と割合は右をそろえる。合計は円の真ん中だけに書く（大事な数の欄など、ほかの所には書かない）。
  // 図の場所が横に長くないとき（正方形・縦長の画像、まとめた図）は、円を上・一覧を下にする（横に並べると上下が大きく空くため）。
  // 字は FLOOR より小さくしない。それでも入らないときは、少ないものから「その他」にまとめて行を減らす
  function drawPie(ctx, ch, x, y, w, h, u) {
    var all = ch.parts.filter(function (p) { return p.v > 0; }), total = ch.total;
    if (!all.length || !total) { noData(ctx, x, y, w, h, u); return; }
    var nf0 = px('name', u), vf0 = px('value', u), lo = FLOOR / Math.min(nf0, vf0);
    function pctText(p) { return (p.v / total * 100).toFixed(1) + '%'; }
    function merge(k) { // 多い k−1 個と「その他」（もとの「その他」もここに入れる）
      if (all.length <= k) { return all; }
      var top = all.filter(function (p) { return p.cls !== 'o'; }).slice(0, k - 1), rest = total - top.reduce(function (s, p) { return s + p.v; }, 0);
      return top.concat(rest > 0 ? [{ name: 'その他', v: rest, cls: 'o' }] : []);
    }
    function list(ps, s) { // 一覧の大きさ：色の四角・名前（太字）・人数・割合
      var nf = nf0 * s, vf = vf0 * s;
      ctx.font = font(nf, true); var nw = maxW(ctx, ps.map(function (p) { return p.name; }));
      ctx.font = font(vf); var vw = maxW(ctx, ps.map(function (p) { return fmt(p.v); })), pw = maxW(ctx, ps.map(pctText));
      var sw = nf * 0.8, g1 = nf * 0.45, g2 = nf * 1.2, g3 = vf * 0.9;
      return { ps: ps, nf: nf, vf: vf, sw: sw, g1: g1, nw: nw, vx: sw + g1 + nw + g2 + vw, w: sw + g1 + nw + g2 + vw + g3 + pw, rh: nf * 1.85, h: ps.length * nf * 1.85 };
    }
    var side = w >= h * 1.45, L = null, D = 0, gap = 0, k, s, m, d;
    for (k = all.length; k >= 3 && !L; k--) {
      if (side) { // 円は左、一覧は右。字はもとの大きさから（少しなら大きく）。入らなければ字を小さく（円は幅の28%まで小さくできる）
        for (s = 1.06; s >= lo - 1e-9 && !L; s -= 0.02) {
          m = list(merge(k), s); d = Math.min(h, w * 0.4, w - m.w - 2.4 * u);
          if (m.h <= h && d >= Math.min(h, w * 0.28)) { L = m; D = d; gap = 2.4 * u; }
        }
      } else { // 円は上（図の幅の半分まで）、一覧は下。縦に余裕のある形では字を大きく（1.3倍まで）。円は幅の38%か高さの3割より小さくしない
        for (s = 1.3; s >= lo - 1e-9 && !L; s -= 0.02) {
          m = list(merge(k), s); d = Math.min(w * 0.5, h - m.h - 1.2 * u);
          if (m.w <= w && d >= Math.min(w * 0.38, h * 0.3)) { L = m; D = d; gap = 1.2 * u; }
        }
      }
    }
    if (!L) { L = list(merge(Math.min(3, all.length)), lo); D = Math.max(4 * u, side ? Math.min(h, w - L.w - 2.4 * u) : h - L.h - 1.2 * u); gap = side ? 2.4 * u : 1.2 * u; }
    var pcx, pcy, lx, ly, rh = L.rh;
    if (side) { // 円と一覧をひとまとまりにして真ん中に。一覧の行の間は、円の高さに近づくよう少し広げる
      rh = Math.min(L.nf * 2.1, D / L.ps.length);
      var spare = w - D - gap - L.w; gap += Math.min(spare * 0.3, 2.4 * u);
      var ox = x + Math.max(0, (w - D - gap - L.w) / 2);
      pcx = ox + D / 2; pcy = y + h / 2; lx = ox + D + gap; ly = y + (h - L.ps.length * rh) / 2;
    } else {
      var oy = y + Math.max(0, (h - D - gap - L.h) / 2);
      pcx = x + w / 2; pcy = oy + D / 2; lx = x + (w - L.w) / 2; ly = oy + D + gap;
    }
    var R = D / 2, ri = R * 0.6, a = -Math.PI / 2;
    L.ps.forEach(function (p) {
      var da = p.v / total * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.arc(pcx, pcy, R, a, a + da); ctx.closePath(); ctx.fillStyle = color(p.cls); ctx.fill();
      ctx.strokeStyle = C.bg; ctx.lineWidth = Math.max(2, 0.18 * u); ctx.stroke();
      a += da;
    });
    ctx.beginPath(); ctx.arc(pcx, pcy, ri, 0, 7); ctx.fillStyle = C.bg; ctx.fill();
    // 真ん中の合計：一覧の数より大きく太く、穴に入る大きさ（入らなければ、一覧の上に「合計」の行を書く）
    var tt = fmt(total), room = ri * 2 * 0.86, tf = Math.max(px('big', u), L.vf * 1.3), lf = px('sub', u);
    ctx.font = font(tf, true);
    while (tf > L.vf * 1.05 && measure(ctx, tt) > room) { tf -= 0.05 * u; ctx.font = font(tf, true); }
    if (measure(ctx, tt) <= room && (tf + lf) * 1.25 < ri * 1.8) {
      ctx.fillStyle = C.sub; ctx.font = font(lf); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('合計', pcx, pcy - tf * 0.42);
      ctx.fillStyle = C.text; ctx.font = font(tf, true); ctx.textBaseline = 'middle'; ctx.fillText(tt, pcx, pcy + lf * 0.55);
    } else {
      ctx.fillStyle = C.text; ctx.font = font(L.nf, true); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('合計 ' + tt, lx, ly - 0.2 * L.rh);
    }
    L.ps.forEach(function (p, i) {
      var cy = ly + i * rh + rh / 2;
      ctx.fillStyle = color(p.cls); ctx.fillRect(lx, cy - L.sw / 2, L.sw, L.sw);
      ctx.textBaseline = 'middle'; ctx.fillStyle = C.text;
      ctx.font = font(L.nf, true); ctx.textAlign = 'left'; ctx.fillText(p.name, lx + L.sw + L.g1, cy);
      ctx.font = font(L.vf); ctx.textAlign = 'right'; ctx.fillText(fmt(p.v), lx + L.vx, cy);
      ctx.fillStyle = C.sub; ctx.fillText(pctText(p), lx + L.w, cy);
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
    // 順位の字：ch.ranks（同じ人数は同じ順位。帰化の国籍別など）があればそれ。ch.noRank のときは書かない（足した数が一部だけで、順位を付けられないもの）
    var rkT = function (i) { return ch.noRank ? '' : String(ch.ranks ? ch.ranks[i] : i + 1); };
    function widths(f) { // 順位は小さく（FLOOR より小さくはしない）、数は名前より大きく太く（1600×900 で 名前 34px・数 41px ほど。行の高さで決まる）
      ctx.font = font(atLeast(f * 0.8)); rkW = ch.noRank ? 0 : measure(ctx, String(rows.length)); ctx.font = font(f * 1.2, true); valW = maxW(ctx, vals);
      ctx.font = font(f, true); nameAll = maxW(ctx, names); gap = 0.8 * f;
    }
    // 1行に「順位・名前・棒・数」を並べられる字の大きさを探す
    // 縦に余裕のある形（正方形・縦長）は、行の間を空けすぎないよう字を大きくする（1.3倍まで。横長 1600×900 はそのまま）
    var boost = Math.max(1, Math.min(1.3, lh * 0.54 / px('name', u)));
    for (fs = Math.min(px('name', u) * boost, lh * 0.54); fs >= FLOOR - 0.01; fs -= 0.05 * u) {
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
        ctx.textBaseline = 'middle'; ctx.font = font(atLeast(fs * 0.8));
        ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.fillText(rkT(i), x + rkW, cy);
        var nmF = fit1(ctx, r[0], one.nameW, fs, true, fs * 0.6); ctx.font = font(nmF.size, true); ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.fillText(nmF.text, x + rkW + gap, cy); // 長い名前だけ小さく
        ctx.font = font(fs * 1.2, true); ctx.textAlign = 'right'; ctx.fillText(vals[i], x + w, cy);
      } else { // 狭いとき：1段目に「順位・名前・数」、2段目に棒
        var f2 = atLeast(Math.min(px('name', u), lh * 0.4));
        widths(f2);
        while (f2 > FLOOR && rkW + gap + valW + gap + 3 * f2 > w) { f2 -= 0.05 * u; widths(f2); }
        var ty = top + lh * 0.3;
        ctx.textBaseline = 'middle'; ctx.font = font(atLeast(f2 * 0.8));
        ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.fillText(rkT(i), x + rkW, ty);
        var nmF2 = fit1(ctx, r[0], w - rkW - valW - 2 * gap, f2, true, f2 * 0.6); ctx.font = font(nmF2.size, true); ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.fillText(nmF2.text, x + rkW + gap, ty);
        ctx.font = font(f2 * 1.2, true); ctx.textAlign = 'right'; ctx.fillText(clip(ctx, vals[i], w - rkW - gap), x + w, ty);
        bw = Math.abs(r[1]) / max * (w - rkW - gap);
        ctx.fillStyle = barC(r[1]);
        ctx.fillRect(x + rkW + gap, top + lh * 0.6, Math.max(2, bw), lh * 0.24);
      }
    });
  }

  // 地図の形の外わく。遠くの小さな島（石川県の舳倉島・福岡県の沖ノ島など。画像では点にしか見えない）は描かず、本体に合わせた外わくにする（上や横に空白を作らない）。
  // 小さな島：縦横の長いほうが形の大きさの2%より小さい島。本体（大きな島と枠）の外わくから、形の大きさの3%以内にあれば残す。
  // 小さな島だけの市区町村（新潟県の粟島浦村など）は、いちばん大きい島を本体にする。枠（全国の地図の沖縄県、沖縄県の島の集まり）は外わくに入れる
  function mapBox(sh) {
    if (sh._box) { return sh._box; }
    var parts = sh.prefs || sh.areas, S = Math.max(sh.w, sh.h), rings = [], box = [Infinity, Infinity, -Infinity, -Infinity];
    function add(bx, b) { bx[0] = Math.min(bx[0], b[0]); bx[1] = Math.min(bx[1], b[1]); bx[2] = Math.max(bx[2], b[2]); bx[3] = Math.max(bx[3], b[3]); }
    Object.keys(parts).forEach(function (key) {
      var mine = (parts[key].match(/M[^M]*/g) || []).map(function (d) { // 形の字は「M x,y L x,y … Z」の輪の続き（make_map.py）
        var v = d.match(/-?\d+(?:\.\d+)?/g).map(Number), b = [Infinity, Infinity, -Infinity, -Infinity];
        for (var i = 0; i + 1 < v.length; i += 2) { add(b, [v[i], v[i + 1], v[i], v[i + 1]]); }
        return { key: key, d: d, b: b, big: Math.max(b[2] - b[0], b[3] - b[1]) >= S * 0.02, size: (b[2] - b[0]) * (b[3] - b[1]) };
      });
      if (mine.length && !mine.some(function (r) { return r.big; })) { mine.reduce(function (a, r) { return r.size > a.size ? r : a; }).big = true; }
      rings.push.apply(rings, mine);
    });
    rings.forEach(function (r) { if (r.big) { add(box, r.b); } });
    (sh.frames || []).forEach(function (f) { add(box, f.box); });
    if (sh.inset) { add(box, sh.inset); }
    var m = S * 0.03, all = box.slice(), out = {};
    rings.forEach(function (r) {
      var b = r.b;
      if (!r.big && !(b[0] >= box[0] - m && b[1] >= box[1] - m && b[2] <= box[2] + m && b[3] <= box[3] + m)) { return; } // 遠くの小さな島
      add(all, b); out[r.key] = (out[r.key] || '') + r.d;
    });
    sh._box = { x: all[0], y: all[1], w: all[2] - all[0], h: all[3] - all[1], parts: out };
    return sh._box;
  }
  // 地図（都道府県・市区町村の色分け）。2026年10月 作った人の指示：「凡例を小さくして横並びに。地図や多い順など大事なものを大きく」
  // 「右の文字は、県の横幅に依存させないで」「正方形と縦長は、順位を横並びにするなど、バランスを考えて」。
  // 色の見方は、色の四角と字を横に並べて何行かにする（色のマス目と同じ heatLegend。目もりの大きさの字）。
  // 横に長い場所：左半分に地図（その中の真ん中）、右半分に多い順（名前の1.3倍の字）とその下に色の見方。右の字の位置と大きさは、地図の形によらず同じ。
  // 縦に長い場所：下に多い順を横に5つ（順位と名前、その下に数）、その下に色の見方を横いっぱいに。地図は残りの場所の真ん中に
  function drawMapShape(ctx, ch, x, y, w, h, u) {
    var bx = mapBox(ch.shape), top = (ch.sorted || []).slice(0, 5), n = top.length, hf = px('tick', u), headH = n ? hf * 1.6 : 0, gap = 1.2 * u;
    var vals = top.map(function (r) { return r[1] == null ? '—' : noUnit(ch.f(r[1])); });
    function legendOf(lw) { return (ch.legend || []).length ? heatLegend(ctx, ch, lw, u) : { h: 0, draw: function () {} }; }
    function shape(mx, my, mw, mh) { // 地図を、(mx, my) から幅 mw・高さ mh の場所の真ん中に、入るいちばん大きい大きさで描く
      var k = Math.min(mw / bx.w, mh / bx.h);
      ctx.save(); ctx.translate(mx + (mw - bx.w * k) / 2, my + (mh - bx.h * k) / 2); ctx.scale(k, k); ctx.translate(-bx.x, -bx.y);
      ctx.lineWidth = 1 / k * Math.max(1, u * 0.08);
      (ch.shape.frames || []).forEach(function (f) { ctx.strokeStyle = C.line; ctx.strokeRect(f.box[0], f.box[1], f.box[2] - f.box[0], f.box[3] - f.box[1]); });
      var ins = ch.shape.inset;
      if (ins) { ctx.strokeStyle = C.line; ctx.strokeRect(ins[0], ins[1], ins[2] - ins[0], ins[3] - ins[1]); }
      Object.keys(bx.parts).forEach(function (key) {
        var p = new Path2D(bx.parts[key]);
        ctx.fillStyle = C.m[(ch.cls && ch.cls[key]) || 'b-n'] || C.m['b-n']; ctx.fill(p);
        ctx.strokeStyle = '#ffffff'; ctx.stroke(p);
      });
      ctx.restore();
    }
    function head(hx, hy) { ctx.fillStyle = C.sub; ctx.font = font(hf, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(ch.rankHead || '多い順', hx, hy); }
    if (w >= h * 1.15 && w >= 34 * u) { // 横に長い場所
      var pw = w / 2, rx = x + w - pw, lg = legendOf(pw), lgap = n ? 1.6 * u : 0;
      var rankW = function (f) { // 多い順（順位・名前・数）の幅。名前と数の間は字の大きさの1.2倍
        ctx.font = font(f, true);
        return maxW(ctx, top.map(function (r, i) { return (i + 1) + ' ' + r[0]; })) + 1.2 * f + maxW(ctx, vals);
      };
      // 多い順の字：名前の1.3倍。行の高さは字の1.6倍。右半分の幅か、色の見方と合わせた高さに入らなければ小さくする
      var f = px('name', u) * 1.3;
      while (f > FLOOR && (rankW(f) > pw || headH + n * f * 1.6 + lgap + lg.h > h)) { f -= 0.05 * u; }
      f = atLeast(f);
      var rh = Math.min(f * 1.6, (h - headH - lgap - lg.h) / Math.max(n, 1)), rw = Math.min(pw, rankW(f) + 3 * u); // 名前と数を離しすぎない
      var by = y + Math.max(0, (h - headH - n * rh - lgap - lg.h) / 2); // 多い順と色の見方を、まとめて上下の真ん中に
      shape(x, y, w - pw - 2 * u, h);
      if (n) {
        head(rx, by);
        top.forEach(function (r, i) {
          var cy = by + headH + i * rh + rh / 2, pre = (i + 1) + ' ';
          ctx.font = font(f, true); ctx.textBaseline = 'middle';
          var vw = measure(ctx, vals[i]), preW = measure(ctx, pre);
          ctx.fillStyle = C.sub; ctx.textAlign = 'left'; ctx.fillText(pre, rx, cy);
          ctx.fillStyle = C.text; ctx.fillText(clip(ctx, r[0], rw - preW - vw - 0.8 * u), rx + preW, cy);
          ctx.textAlign = 'right'; ctx.fillText(clip(ctx, vals[i], rw - preW), rx + rw, cy);
        });
      }
      lg.draw(rx, by + headH + n * rh + lgap);
      return;
    }
    // 縦に長い場所：多い順は同じ幅で横に5つ。1段目に順位と名前（名前の大きさ。入らなければ小さく）、2段目に数（大事な数の0.8倍）
    var cg = 1.2 * u, cw = (w - 4 * cg) / 5, nf = px('name', u), vf = px('big', u) * 0.8, lg2 = legendOf(w);
    var rankH = n ? headH + nf * 1.5 + vf * 1.3 : 0, bh = rankH + (n && lg2.h ? gap : 0) + lg2.h, by2 = y + h - bh;
    shape(x, y, w, h - bh - gap);
    if (n) {
      head(x, by2);
      top.forEach(function (r, i) {
        var cx = x + i * (cw + cg), pre = (i + 1) + ' ', ny = by2 + headH + nf * 0.7, vy = by2 + headH + nf * 1.5 + vf * 0.62;
        ctx.font = font(nf, true); var preW = measure(ctx, pre), a = fit1(ctx, r[0], cw - preW, nf, true);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.sub; ctx.font = font(nf, true); ctx.fillText(pre, cx, ny);
        ctx.fillStyle = C.text; ctx.font = font(a.size, true); ctx.fillText(a.text, cx + preW, ny);
        var b = fit1(ctx, vals[i], cw, vf, true, nf);
        ctx.font = font(b.size, true); ctx.fillText(b.text, cx, vy);
      });
    }
    lg2.draw(x, by2 + rankH + (n && lg2.h ? gap : 0));
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
  var DIFF = { name: 36, count: 32, diff: 40, rate: 32, tick: 26, rank: 26 }; // 1600×900 のときの字の大きさ（px。2026年10月 スマホで読めるように大きくした）
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
    var rh = Math.min((h - axisH) / n, f.diff * 3.2), right, nmW, barW, two, showCt = true, showRt = true;
    // 並べ方：広ければ1段（名前｜人数｜棒｜増減｜増減率）。棒が狭くなるときは、名前の下に人数を書く（2段）。
    // それでも棒が入らないせまい所（まとめた図など）は、字を小さくせず、2時点の人数 → 増減率の順に書くのをやめる
    function layout() {
      right = gap * 1.2 + dvW + (showRt ? gap + rtW : 0); nmW = Math.min(nmAll, w * 0.24);
      barW = w - rkW - gap * 0.8 - nmW - (showCt ? gap + ctW : 0) - gap * 1.4 - right; two = false;
      if (showCt && barW < w * 0.34 && rh >= (f.name * 1.2 + f.count * 1.15) * 1.05) {
        two = true; nmW = Math.min(Math.max(nmAll, ctW), w * 0.32); barW = w - rkW - gap * 0.8 - nmW - gap * 1.4 - right;
      }
    }
    layout();
    if (barW < w * 0.2) { showCt = false; layout(); }
    if (barW < w * 0.2) { showRt = false; layout(); }
    barW = Math.max(barW, w * 0.1);
    var nx = x + rkW + gap * 0.8, bx = nx + nmW + (two ? gap * 1.4 : (showCt ? gap + ctW : 0) + gap * 1.4), dx = bx + barW + gap * 1.2 + dvW, rx = x + w;
    // 目もり：0をふくむ、きりのよい数（字が重ならない間隔）。棒の長さはこの目もりでそろえる
    var vals = rows.map(function (r) { return r[1]; }).filter(function (v) { return v != null; });
    var lo = Math.min.apply(null, [0].concat(vals)), hi = Math.max.apply(null, [0].concat(vals));
    if (hi === lo) { hi = lo + 1; }
    var X = function (v) { return bx + (v - lo) / (hi - lo) * barW; };
    ctx.font = font(f.tick);
    var labW = Math.max(measure(ctx, signed(hi)), measure(ctx, signed(lo))) + 20 * k, step = niceStep((hi - lo) / 6);
    for (var tries = 0; tries < 40 && barW * step / (hi - lo) < labW; tries++) { step = niceStep(step * 1.01); }
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
        if (showCt) { ctx.font = font(f.count); ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.fillText(cts[i], nx + nmW + gap + ctW, cy); }
      }
      ctx.textBaseline = 'middle';
      if (r[1]) { ctx.fillStyle = r[1] > 0 ? C.up : C.down; var x0 = X(Math.min(0, r[1])), x1 = X(Math.max(0, r[1])); ctx.fillRect(x0, cy - bh / 2, Math.max(2 * k, x1 - x0), bh); }
      ctx.textAlign = 'right';
      if (r[1] == null) { ctx.font = font(f.rate, true); ctx.fillStyle = C.sub; } else { ctx.font = font(f.diff, true); ctx.fillStyle = C.text; }
      ctx.fillText(dvs[i], dx, cy);
      if (rts[i] && showRt) { ctx.font = font(f.rate); ctx.fillStyle = C.sub; ctx.fillText(rts[i], rx, cy); }
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
  // 字は FLOOR より小さくしない（2026年10月 作った人の指示。情報が多すぎるときは、字を小さくせずに並べ方を変える）。そのため：
  //   横長の画像で、行が多くて名前の字が入らないときは、州の切れ目で表を2つに分けて左右に並べる。凡例はいつも下にまとめる。
  //   マスの中の字（短い数・割合）は、FLOOR 以上の大きさで入るときだけ書く（入らなければ色だけ。色の見方は凡例で読む）。
  //   列の名前は、横に入らなければ、日本語（在留資格）は2行か縦書き、年は間を空けて（いちばん新しい年から2・5・10年ごと）書く。
  //   長い名前（オーストラリア・ニュージーランド）は2行にする（入らなければ「…」）
  // rows：[[名前, 州の見出しの行か, 州と同じ名前の行か]]、cols：[列の名前]、cls・text：行ごとの [色の段]・[字]（見出しの行は null）、
  // legend：[[色の段, 字]]、mark：数え方が変わる列、markNote：その説明（画像のいちばん下の注記に書く）
  function heatRows(ch, a, b) { // ch.rows の a 行目から b 行目の前までを、描く行（州の見出しの行は除く）にする
    var out = [], st = null;
    for (var j = a; j < b; j++) {
      var r = ch.rows[j];
      if (r[1]) { st = r[0]; continue; }
      out.push({ name: r[0], st: r[2] ? '' : st, first: r[2] || st !== null, top: r[2], cls: ch.cls[j], text: ch.text[j] });
      st = null;
    }
    return out;
  }
  function heatLegend(ctx, ch, w, u) { // 下に並べる凡例（見出し・色の四角と字）。幅に入るように何行かに分ける。{ h：高さ, draw(x, y) }
    var lf = px('tick', u), sw = lf, lh = lf * 1.75, lines = [[]], lx = 0;
    var toks = [{ head: '色の見方（' + metricT(ch.metric) + '）：' }].concat((ch.legend || []).map(function (l) { return { it: [l[0], noUnit(l[1])] }; })); // 単位はタイトルの下
    toks.forEach(function (t) {
      ctx.font = font(lf, !!t.head);
      var tw = t.head ? measure(ctx, t.head) + 0.4 * u : sw + 0.4 * u + measure(ctx, t.it[1]);
      if (lx + tw > w && lines[lines.length - 1].length) { lines.push([]); lx = 0; }
      lines[lines.length - 1].push({ t: t, x: lx }); lx += tw + (t.head ? 0 : 1.2 * u);
    });
    return { h: lines.length * lh, draw: function (x, y) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach(function (line, k) {
        var cy = y + k * lh + lh / 2;
        line.forEach(function (p) {
          if (p.t.head) { ctx.fillStyle = C.sub; ctx.font = font(lf, true); ctx.fillText(p.t.head, x + p.x, cy); return; }
          ctx.fillStyle = C.m[p.t.it[0]] || C.m['b-n']; ctx.fillRect(x + p.x, cy - sw / 2, sw, sw);
          ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(x + p.x, cy - sw / 2, sw, sw);
          ctx.fillStyle = C.text; ctx.font = font(lf); ctx.fillText(p.t.it[1], x + p.x + sw + 0.4 * u, cy);
        });
      });
    } };
  }
  // 表を1つ描く。o.nr：行の高さを決める行の数（2つに分けたとき、左右の行の高さをそろえる）、o.all：名前の列の幅を測る行（左右で幅をそろえる）、
  // o.noState：州の列を書かない（2つに分けて幅がせまいとき。州の切れ目の線は残す。地域区分の名前で州は分かる）。描いた表のいちばん下の y を返す
  function heatGrid(ctx, ch, rows, x, y, w, h, u, o) {
    o = o || {};
    var cols = ch.cols, nc = cols.length, nr = o.nr || rows.length, all = o.all || rows;
    // 名前の列の幅（州の列＋地域区分の列）：行の高さを見積もり、その字の大きさで測る。全体の32%まで
    var rh0 = Math.min(2.4 * u, (h - 1.8 * u) / nr), nf0 = atLeast(Math.min(px('small', u), rh0 * 0.62));
    ctx.font = font(nf0, true);
    var stW = o.noState ? 0 : maxW(ctx, all.map(function (r) { return r.st || ''; })) + 0.8 * u;
    var natural = Math.max(stW + maxW(ctx, all.filter(function (r) { return !r.top; }).map(function (r) { return r.name; })),
      maxW(ctx, all.filter(function (r) { return r.top; }).map(function (r) { return r.name; }))) + 0.8 * u;
    var nameW = Math.min(natural, w * (o.noState ? 0.42 : 0.32)), subW = nameW - stW, cellW = (w - nameW) / nc, cx0 = x + nameW;
    // 列の名前：横に入る大きさ（FLOOR まで小さくする）。入らなければ、在留資格は2行か縦書き、年は間を空けて書く
    var colF = px('tick', u), mode = 'h', every = 1, wrapped = null, maxLen = Math.max.apply(null, cols.map(function (c) { return c.length; }));
    ctx.font = font(colF, true); var cw = maxW(ctx, cols);
    if (cw > cellW * 0.92) {
      var fH = colF * cellW * 0.92 / cw;
      if (fH >= FLOOR) { colF = fH; } else if (ch.vertical) { // 日本語：まず2行に分けて横に（「の」の後、なければ2字の後で分ける。技能／実習・特別／永住者）。だめなら縦書き
        var split2 = function (c) { var k = c.indexOf('の'); return k > 0 && k < c.length - 1 ? [c.slice(0, k + 1), c.slice(k + 1)] : [c.slice(0, 2), c.slice(2)]; };
        for (var s = colF; s >= FLOOR - 0.01 && !wrapped; s -= 0.02 * u) {
          ctx.font = font(s, true);
          var ws = cols.map(function (c) { return measure(ctx, c) <= cellW * 0.94 ? [c] : split2(c); });
          if (ws.every(function (l) { return maxW(ctx, l) <= cellW * 0.94; })) { wrapped = ws; colF = s; mode = 'w'; }
        }
        if (!wrapped) { mode = 'v'; colF = Math.max(FLOOR, Math.min(px('tick', u), cellW * 0.9, (h * 0.32 - 0.6 * u) / (maxLen * 1.08))); }
      } else { // 年：字は小さくしすぎず、入るだけ間を空けて書く
        colF = FLOOR; ctx.font = font(colF, true); cw = maxW(ctx, cols);
        every = [1, 2, 5, 10, 20].filter(function (n) { return n * cellW >= cw * 1.2; })[0] || nc;
      }
    }
    var nlines = wrapped ? Math.max.apply(null, wrapped.map(function (l) { return l.length; })) : 1;
    var headH = mode === 'v' ? maxLen * colF * 1.08 + 0.6 * u : nlines * colF * 1.15 + 0.35 * colF;
    var rh = Math.min(2.4 * u, (h - headH) / nr), top = y + headH, gridH = rows.length * rh;
    var nf = atLeast(Math.min(px('small', u), rh * 0.62));
    ctx.fillStyle = C.sub; ctx.font = font(colF, true);
    cols.forEach(function (c, i) {
      var mx = cx0 + (i + 0.5) * cellW;
      if (mode === 'v') { // 縦書き：下をそろえる
        var y0 = top - 0.4 * u - c.length * colF * 1.08;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; c.split('').forEach(function (c1, j) { ctx.fillText(c1, mx, y0 + j * colF * 1.08); });
      } else if (mode === 'w') { // 折り返した名前：下をそろえる
        var ls = wrapped[i];
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ls.forEach(function (l, j) { ctx.fillText(l, mx, top - 0.3 * colF - (ls.length - 1 - j) * colF * 1.15); });
      } else if ((nc - 1 - i) % every === 0) { // 間を空けるときは、いちばん新しい列から数えて
        var tw = measure(ctx, c), tx = Math.min(Math.max(mx, x + tw / 2), x + w - tw / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(c, tx, top - 0.3 * u);
      }
    });
    // 名前：1行に入るならそのまま。入らなければ「1行に入るまで小さくする」と「行の高さに2行が入る大きさで2行にする」の、字の大きいほう。
    // どちらも FLOOR より小さくなるときは、FLOOR で2行（行の高さを少しこえてよい）、それも入らなければ「…」で切る
    function nameFit(text, mw, bold) {
      ctx.font = font(nf, bold);
      var tw0 = measure(ctx, text);
      if (tw0 <= mw) { return { lines: [text], size: nf }; }
      var s1 = nf * mw / tw0 * 0.99, s2 = Math.min(nf, rh / 2.25);
      ctx.font = font(s2, bold); var ls = wrap(ctx, text, mw);
      if (ls.length <= 2 && s2 > s1 && s2 >= FLOOR) { return { lines: ls, size: s2 }; }
      if (s1 >= FLOOR) { return { lines: [text], size: s1 }; }
      ctx.font = font(FLOOR, bold); ls = wrap(ctx, text, mw);
      if (ls.length <= 2 && FLOOR * 2.2 <= rh * 1.25) { return { lines: ls, size: FLOOR }; }
      var f = fit1(ctx, text, mw, nf, bold, FLOOR); return { lines: [f.text], size: f.size };
    }
    // マスの字の大きさ：いちばん長い字が、マスの幅と高さに入る大きさ（FLOOR より小さくなるときは書かない）
    var texts = [].concat.apply([], all.map(function (r) { return r.text; })), cf = Math.min(rh * 0.56, px('tick', u));
    ctx.font = font(cf, true); var tw1 = maxW(ctx, texts);
    if (tw1 > cellW * 0.88) { cf *= cellW * 0.88 / tw1; }
    var showText = cf >= FLOOR, pad = Math.max(1, 0.08 * u);
    rows.forEach(function (r, j) {
      var yy = top + j * rh;
      if (r.first && j > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, 0.1 * u); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
      if (r.st && !o.noState) { // 州の名前は、その州の最初の行だけ
        var g = fit1(ctx, r.st, stW - 0.6 * u, nf, true, FLOOR);
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
    return top + gridH;
  }
  function drawHeat(ctx, ch, x, y, w, h, u) {
    var all = heatRows(ch, 0, ch.rows.length), leg = heatLegend(ctx, ch, w, u), gh = h - leg.h - 0.8 * u, bottom, best = null;
    if (w >= h * 1.6 && (gh - 2 * u) / all.length < FLOOR * 1.45) {
      // 横長で行が入らない：州の切れ目（見出しの行・州と同じ名前の行の前）のうち、左右の行の数がいちばん近くなる所で2つに分ける
      ch.rows.forEach(function (r, j) {
        if (j && (r[1] || r[2])) { var n1 = heatRows(ch, 0, j).length, d = Math.abs(all.length - 2 * n1); if (!best || d < best.d) { best = { j: j, d: d }; } }
      });
    }
    if (best) {
      var A = heatRows(ch, 0, best.j), B = heatRows(ch, best.j, ch.rows.length), gap = 2.4 * u, bw = (w - gap) / 2, o = { nr: Math.max(A.length, B.length), all: all, noState: true };
      bottom = Math.max(heatGrid(ctx, ch, A, x, y, bw, gh, u, o), heatGrid(ctx, ch, B, x + bw + gap, y, bw, gh, u, o));
      ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, 0.08 * u); ctx.beginPath(); ctx.moveTo(x + bw + gap / 2, y); ctx.lineTo(x + bw + gap / 2, bottom); ctx.stroke();
    } else {
      bottom = heatGrid(ctx, ch, all, x, y, w, gh, u);
    }
    leg.draw(x, bottom + 0.8 * u);
  }
  // ---- 国籍・地域ごとの主な在留資格（積み上げ横棒。ページの「国籍・地域ごとの主な在留資格」と同じ形・同じ色）
  //   1行に1つの国籍・地域：名前・人数・棒（棒の全体＝その国籍・地域の人数＝100%）。多い在留資格3つに決まった色、それ以外は色なしの「上位3つ以外」。
  //   区分の中に「名前 割合」、入らなければ割合だけ、それも入らなければ書かない（上の凡例で色を読む）。
  //   ch.bars：[{ name, total, segs: [{ name, v }] }]（segs は多い順に3つまで）、ch.mark：目立たせる国籍・地域（その国籍・地域のページ）
  var VC = { '永住者': ['#2f6fc4', '#fff'], '技術・人文知識・国際業務': ['#23407e', '#fff'], '留学': ['#2e9e57', '#1d2330'], '技能実習': ['#f29a3d', '#1d2330'],
    '特定技能': ['#b8234a', '#fff'], '特別永住者': ['#6c3596', '#fff'], '家族滞在': ['#5cc2dc', '#1d2330'], '定住者': ['#8f741c', '#fff'],
    '日本人の配偶者等': ['#ee9cc0', '#1d2330'], '特定活動': ['#6b7480', '#fff'] }; // 地の色と字の色（style.css の .vc-〇〇 と同じ）
  var CROSS_NOTE = '棒の全体（100%）が、その国籍・地域の人数です。';
  function crossFill(ctx, s, x, y, w, h, u) { // 区分をぬって、字の色を返す。決まった色のない在留資格は、ページと同じしま模様
    var c = VC[s.full || s.name];
    if (c) { ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); return c[1]; }
    ctx.fillStyle = '#e3e6eb'; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = '#c4cad3'; ctx.lineWidth = 0.14 * u;
    for (var t = -h; t < w + h; t += 0.4 * u) { ctx.beginPath(); ctx.moveTo(x + t, y + h); ctx.lineTo(x + t + h, y); ctx.stroke(); }
    ctx.restore(); return C.text;
  }
  function segLabel(ctx, texts, x, cy, w, f, color) { // 区分の中に入る、いちばんくわしい書き方で書く（どれも入らなければ書かない）
    var pad = 0.3 * f, lo = Math.min(f, atLeast(f * 0.8));
    for (var i = 0; i < texts.length; i++) {
      for (var s = f; s >= lo - 0.01; s -= Math.max(1, f * 0.05)) {
        ctx.font = font(s, true);
        if (measure(ctx, texts[i]) <= w - 2 * pad) { ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(texts[i], x + pad, cy); return; }
      }
    }
  }
  function drawCross(ctx, ch, x, y, w, h, u, wide) {
    var bars = (ch.bars || []).filter(function (b) { return b.total > 0; });
    if (!bars.length) { noData(ctx, x, y, w, h, u); return; }
    var order = Object.keys(VC), leg = [], seen = {};
    bars.forEach(function (b) { b.segs.forEach(function (s) { var k = s.full || s.name; if (!seen[k]) { seen[k] = 1; leg.push({ t: s.name, k: k, s: s }); } }); });
    var fixed = leg.filter(function (it) { return VC[it.k]; }).sort(function (p, q) { return order.indexOf(p.k) - order.indexOf(q.k); }), other = leg.filter(function (it) { return !VC[it.k]; });
    leg = fixed.concat(other.length ? [{ t: other.map(function (it) { return it.t; }).join('・'), s: other[0].s }] : []).concat([{ t: '上位3つ以外', rest: true }]);
    // 凡例（上に。2行までに入る大きさ）
    var lf, sw, lines;
    for (lf = px('small', u); ; lf -= 0.05 * u) {
      ctx.font = font(lf); sw = lf * 0.8; lines = [[]];
      var lx = 0;
      leg.forEach(function (it) {
        var iw = sw + 0.35 * lf + measure(ctx, it.t);
        if (lx && lx + iw > w) { lines.push([]); lx = 0; }
        lines[lines.length - 1].push({ it: it, x: lx }); lx += iw + 1.1 * lf;
      });
      if (lines.length <= 2 || lf <= atLeast(px('tick', u))) { break; }
    }
    lines.forEach(function (line, j) {
      var cy = y + (j + 0.5) * lf * 1.5;
      line.forEach(function (p) {
        if (p.it.rest) { ctx.fillStyle = C.line2; ctx.fillRect(x + p.x, cy - sw / 2, sw, sw); ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, 0.06 * u); ctx.strokeRect(x + p.x, cy - sw / 2, sw, sw); }
        else { crossFill(ctx, p.it.s, x + p.x, cy - sw / 2, sw, sw, u * 0.5); }
        ctx.fillStyle = C.text; ctx.font = font(lf); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(p.it.t, x + p.x + sw + 0.35 * lf, cy);
      });
    });
    // 行：名前・人数・棒。横長の画像は1行に並べる。正方形・縦長の画像は、名前と人数の下に横いっぱいの棒（区分の名前が入りやすく、縦の空きも使える）。
    // 行が多いときは字を小さくする（目もりの大きさまで）
    var top = y + lines.length * lf * 1.5 + 0.8 * u, n = bars.length, room = (y + h - top) / n, two = !wide && room >= px('name', u) * 2.6;
    var rowH = Math.min(room, px('name', u) * (two ? 4.6 : 2.4));
    var nf = Math.max(atLeast(px('tick', u)), Math.min(px('name', u), rowH * (two ? 0.32 : 0.6))), vf = Math.max(atLeast(px('tick', u)), Math.min(px('value', u), rowH * (two ? 0.3 : 0.56)));
    var totals = bars.map(function (b) { return fmt(b.total); });
    ctx.font = font(vf); var totW = maxW(ctx, totals);
    ctx.font = font(nf, true); var nameW = two ? w - totW - u : Math.min(maxW(ctx, bars.map(function (b) { return b.name; })), w * 0.26);
    var bx = two ? x : x + nameW + 0.9 * u + totW + 1.2 * u, bw = x + w - bx, bh = two ? Math.min(rowH * 0.5, px('name', u) * 1.9) : Math.min(rowH * 0.74, nf * 1.7);
    var lab = Math.min(px('value', u), bh * 0.64), gap = Math.max(1, 0.1 * u), off = two ? (rowH - nf * 1.3 - bh) / 2 : 0;
    bars.forEach(function (b, i) {
      var ry = top + i * rowH, cy = two ? ry + off + nf * 1.3 + bh / 2 : ry + rowH / 2, ty = two ? ry + off + nf * 0.6 : cy, by = cy - bh / 2;
      if (ch.mark && b.name === ch.mark) { ctx.fillStyle = '#e6f4ec'; ctx.fillRect(x - 0.5 * u, ry + gap, w + u, rowH - 2 * gap); } // ページの行の色（style.css の --btn-soft）と同じ
      var nm = fit1(ctx, b.name, nameW, nf, true, nf * 0.7);
      ctx.fillStyle = C.text; ctx.font = font(nm.size, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nm.text, x, ty);
      ctx.font = font(vf); ctx.textAlign = 'right'; ctx.fillText(totals[i], two ? x + w : x + nameW + 0.9 * u + totW, ty);
      ctx.save(); ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(bx, by, bw, bh, 0.25 * u); } else { ctx.rect(bx, by, bw, bh); }
      ctx.clip();
      ctx.fillStyle = C.line2; ctx.fillRect(bx, by, bw, bh); // 上位3つ以外（色なし）
      var sx = bx, used = 0;
      b.segs.forEach(function (s) {
        var p = s.v / b.total * 100, sw2 = s.v / b.total * bw, ink = crossFill(ctx, s, sx, by, sw2, bh, u);
        segLabel(ctx, [s.name + ' ' + Math.round(p) + '%', Math.round(p) + '%'], sx, cy, sw2, lab, ink);
        sx += sw2; used += s.v;
        ctx.fillStyle = C.bg; ctx.fillRect(sx - gap, by, 2 * gap, bh); // 区分のあいだに細いすき間
      });
      var rest = 100 - used / b.total * 100;
      if (rest >= 0.05) { segLabel(ctx, ['上位3つ以外 ' + Math.round(rest) + '%', Math.round(rest) + '%'], sx, cy, bx + bw - sx, lab, C.sub); }
      ctx.restore();
    });
  }
  var DRAW = { line: drawLine, pie: drawPie, rank: drawRank, map: drawMapShape, diff: drawDiff, heat: drawHeat, cross: drawCross };

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
    if (ch.kind === 'cross') { return area + '｜' + (ch.bars.length === 1 ? person(ch.bars[0].name) + 'の主な在留資格' : '国籍・地域ごとの主な在留資格'); }
    return cur.title || '';
  }
  function keyNumbers(ch) {
    if (ch.keys) { return ch.keys; } // ページが決めた大事な数（帰化の累計の線：はじめと終わりの差ではなく、累計とその年の数）
    if (ch.kind === 'line' && ch.series.length === 1 && !ch.index) {
      var fl = firstLast(ch.series[0]);
      if (fl.fi < 0) { return []; }
      var out = [[lab(ch, fl.fi), fmt(fl.f) + '人'], [lab(ch, fl.li), fmt(fl.l) + '人']];
      if (fl.li > fl.fi) { out.push(['増減', diffT(fl.l - fl.f), fl.f ? '（' + rateT((fl.l - fl.f) / fl.f * 100) + '）' : '']); } // 3つ目（増減率）は、画像では数の下の行に書く
      return out;
    }
    // 円グラフ・ランキング・地図の大事な数は、投稿文だけに書く（画像では、グラフの中の数と同じになるので書かない。2026年10月 作った人の指示）
    if (ch.kind === 'pie') { return [['合計', fmt(ch.total) + '人'], ['いちばん多い', ch.parts[0].name + ' ' + (ch.parts[0].v / ch.total * 100).toFixed(1) + '%']]; }
    if (ch.kind === 'rank' && ch.rows.length) { return [[ch.noRank ? 'いちばん多い' : '1位', ch.rows[0][0]], [metricT(ch.metric), ch.f(ch.rows[0][1])]]; }
    if (ch.kind === 'map' && ch.sorted.length) { return [['いちばん多い', ch.sorted[0][0]], [metricT(ch.metric), ch.sorted[0][1] == null ? '—' : ch.f(ch.sorted[0][1])]]; }
    return [];
  }
  function period(ch) { return ch.whenText ? ch.whenText : ch.kind === 'diff' || (ch.kind === 'map' && ch.from) ? wl(ch.from) + ' → ' + wl(ch.when) : (ch.kind === 'line' || ch.kind === 'heat') && ch.from ? wl(ch.from) + '〜' + wl(ch.when) : wl(ch.when); }
  // 画像のタイトルの下に書く時点（年末は「2025年末」）。半期速報の増加人数は、比べた2つの時点
  function whenT(ch) {
    if (ch.whenText) { return ch.whenText; }
    if (ch.kind === 'diff' || (ch.kind === 'map' && ch.from)) { return ymd(ch.from) + ' → ' + ymd(ch.when); }
    if ((ch.kind === 'line' || ch.kind === 'heat') && ch.from) { return ymd(ch.from) + '〜' + ymd(ch.when); }
    var pm = /（(\d{4}年\d+月末)→(\d{4}年\d+月末)）$/.exec(ch.what || '');
    if (pm) { return [pm[1], pm[2]].map(function (s) { return s.replace(/^(\d+)年12月末$/, '$1年末'); }).join(' → '); }
    return ch.when ? ymd(ch.when) : '';
  }
  // グラフの中の数の単位（人数を描く図は「人」。割合・指数は数に％や説明が付くので書かない）
  function unitOf(ch) {
    if (ch.kind === 'line') { return ch.index ? '' : '人'; }
    if (ch.kind === 'pie' || ch.kind === 'diff' || ch.kind === 'cross') { return '人'; }
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
    var ch = cur.chart, k = keyNumbers(ch).map(function (x) { return x[0] + '：' + x[1] + (x[2] || ''); }).join('、');
    if (ch.kind === 'diff') { // 増減：今の並び順の上の3つ
      k = sortName(ch) + '：' + ch.rows.slice(0, 3).map(function (r, i) { return (i + 1) + '. ' + r[0] + ' ' + (r[1] == null ? '比較不可' : diffT(r[1]) + '（' + rateT(r[4]) + '）'); }).join('、');
    }
    if (ch.kind === 'cross') { // 国籍・地域ごとの主な在留資格：上の3つの、いちばん多い在留資格とその割合
      k = 'いちばん多い在留資格：' + ch.bars.slice(0, 3).map(function (b) { var s = b.segs[0]; return b.name + ' ' + (s ? vs(s.name) + Math.round(s.v / b.total * 100) + '%' : '—'); }).join('、');
    }
    return title + '\n' + (k ? k + '\n' : '') + '統計時点：' + period(ch) + (meta(cur).status ? '（' + meta(cur).status + '）' : '') + '\n出典：' + srcOf(meta(cur).src, firstWhen(ch)) + '\n' + (cur.tag || '#在留外国人'); // 在留外国人統計ではない図は、ページが渡すハッシュタグ（#不法残留 など）
  }

  // ---- 1枚の画像を組み立てる。opts.site：右下にサイトの名前を入れる
  // どの図も同じ形（2026年10月 作った人の指示。増減の棒にそろえた）：白い地に、上にタイトル（「地域｜…」）とその下に時点だけ。
  // 「地域：」「国籍・地域：」「統計時点：」のラベルや飾りの線は入れない。出典と注記（技人国の説明・数え方の変わり目など）は、いちばん下にまとめる。
  // 字の大きさは TYPE と px()（1600×900 のとき タイトル 54px・時点と単位 30px・名前 36px・数 36px・大事な数 56px・目もり 26px・出典と注記 24px。どれも 22px より小さくしない）。
  // 余白は小さめにして、字とグラフの場所を広くとる
  function compose(items, size, title, opts) {
    opts = opts || {};
    var vn = vnote([].concat.apply([], items.map(function (x) { return chartNames(x.chart); })));
    items = items.map(function (x) { return copy(x, { chart: shortChart(x.chart) }); });
    var W = size[1], H = size[2], cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), u = H > W ? W / 56 : W / 64, k = u / 25, pad = 40 * k;
    FLOOR = TYPE.min * k;
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
    var t = fitOne(ctx, title || autoTitle(cur), W - 2 * pad, px('title', u), true, 48 * k);
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    t.lines.forEach(function (l) { ctx.font = font(t.size, true); ctx.fillText(l, pad, y); y += t.size * 1.28; });
    // タイトルの下：時点だけ（増減の棒は並び順も。半期速報は「（速報）」）
    var sub = one && ch.kind === 'diff' ? whenT(ch) + (sortName(ch) ? '（' + sortName(ch) + '）' : '') :
      items.map(function (x) { return whenT(x.chart); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('・') + (m.status ? '（' + m.status + '）' : '');
    var units = items.map(function (x) { return unitOf(x.chart); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    if (units.length) { sub += '　単位：' + units.join('・'); } // グラフの中の数には付けない単位を、ここにまとめて書く
    if (sub) {
      var s2 = fitOne(ctx, sub, W - 2 * pad, px('sub', u), false, 26 * k);
      ctx.fillStyle = C.sub; s2.lines.forEach(function (l) { ctx.font = font(s2.size); ctx.fillText(l, pad, y); y += s2.size * 1.35; });
    }
    y += 20 * k;
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
    var foot = [fitLines(ctx, '出典：' + srcs.join('、') + (pop ? '、総務省「住民基本台帳に基づく人口」' : '') + 'を加工して作成', W - 2 * pad - siteW, nf, false, 2, 22 * k)];
    notes = notes.filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('　');
    if (notes) { foot.push(fitLines(ctx, notes, W - 2 * pad, nf, false, 3, 22 * k)); }
    var footGap = 12 * k, footH = foot.reduce(function (s, f) { return s + f.lines.length * f.size * 1.3; }, 0) + 14 * k, bottom = H - pad - footH;
    // 大事な数：1本の折れ線だけ（はじめと終わりの数・増減。グラフの中には数を書かないので）。
    // 円グラフ（合計は円の真ん中）・ランキング・地図（多い順）は、グラフの中の数と同じになるので書かない。色の付いた箱は使わず、細い灰色の線で区切る
    var keys = one && ch.kind === 'line' ? keyNumbers(ch) : [];
    var gx = pad, gy = y, gw = W - 2 * pad, gh = bottom - y, kl = px('sub', u), kv = px('big', u), kx2 = px('value', u);
    if (keys.length) {
      ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, k);
      if (W > H) { // 横長：右に縦に並べる（名前・数・増減率の行）
        var kw = Math.min(gw * 0.26, 400 * k), kx = W - pad - kw, kh = Math.min(gh / keys.length, 200 * k);
        ctx.beginPath(); ctx.moveTo(kx - 20 * k, gy); ctx.lineTo(kx - 20 * k, gy + kh * keys.length); ctx.stroke();
        keys.forEach(function (k2, i) {
          var ky = gy + i * kh + 10 * k;
          if (i) { ctx.beginPath(); ctx.moveTo(kx, ky - 10 * k); ctx.lineTo(kx + kw, ky - 10 * k); ctx.stroke(); }
          var a = fit1(ctx, k2[0], kw, kl, false);
          ctx.fillStyle = C.sub; ctx.font = font(a.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, kx, ky);
          var b = fit1(ctx, noUnit(k2[1]), kw, kv, true, kx2);
          ctx.fillStyle = C.text; ctx.font = font(b.size, true); ctx.fillText(b.text, kx, ky + a.size * 1.35);
          if (k2[2]) { var c2 = fit1(ctx, k2[2], kw, kx2, false); ctx.font = font(c2.size); ctx.fillText(c2.text, kx, ky + a.size * 1.35 + b.size * 1.2); }
        });
        gw -= kw + 44 * k;
      } else { // 正方形・縦長：上に横に並べる
        var bw = (gw - (keys.length - 1) * 32 * k) / keys.length, more = keys.some(function (k2) { return k2[2]; });
        var bh2 = kl * 1.35 + kv * 1.2 + (more ? kx2 * 1.25 : 0);
        keys.forEach(function (k2, i) {
          var bx = gx + i * (bw + 32 * k);
          if (i) { ctx.beginPath(); ctx.moveTo(bx - 16 * k, gy); ctx.lineTo(bx - 16 * k, gy + bh2); ctx.stroke(); }
          var a = fit1(ctx, k2[0], bw, kl, false);
          ctx.fillStyle = C.sub; ctx.font = font(a.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, bx, gy);
          var b = fit1(ctx, noUnit(k2[1]), bw, kv, true, kx2);
          ctx.fillStyle = C.text; ctx.font = font(b.size, true); ctx.fillText(b.text, bx, gy + kl * 1.35);
          if (k2[2]) { var c2 = fit1(ctx, k2[2], bw, kx2, false); ctx.font = font(c2.size); ctx.fillText(c2.text, bx, gy + kl * 1.35 + kv * 1.2); }
        });
        ctx.beginPath(); ctx.moveTo(gx, gy + bh2 + 12 * k); ctx.lineTo(gx + gw, gy + bh2 + 12 * k); ctx.stroke();
        gy += bh2 + 30 * k; gh -= bh2 + 30 * k;
      }
    }
    // 図（いくつかまとめるときは、横長は横に、ほかは縦に並べる）。それぞれの図の見出しは2行まで
    var n = items.length, side = W > H && n > 1, gapX = 1.8 * u, gapY = 1.4 * u;
    var cw0 = side ? (gw - (n - 1) * gapX) / n : gw, ch0 = side ? gh : (gh - (n - 1) * gapY) / n;
    items.forEach(function (it, i) {
      var cx = side ? gx + i * (cw0 + gapX) : gx, cy = side ? gy : gy + i * (ch0 + gapY), cw = cw0, chh = ch0, uu = u * (n > 1 ? 0.9 : 1);
      if (n > 1) {
        if (side && i > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(cx - gapX / 2, cy); ctx.lineTo(cx - gapX / 2, cy + chh); ctx.stroke(); }
        var ht = fitLines(ctx, autoTitle(it) + '（' + whenT(it.chart) + '）', cw, 28 * k, true, 2, 22 * k); // 画面の見出し（it.title）は時点が入っているので使わない
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
    foot.forEach(function (f) { f.lines.forEach(function (l) { ctx.font = font(f.size); ctx.fillText(l, pad, fy); fy += f.size * 1.3; }); });
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
    if (cur.chart.kind === 'heat') { sizeSel.value = 'tall'; } // 色のマス目は行が多く、横長では字が詰まるので、はじめは縦長（字を小さくしないため）
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
      basket.push({ chart: c.chart, title: c.title, autoTitle: c.autoTitle, meta: c.meta || (window.KZD ? JSON.parse(JSON.stringify({ nat: window.KZD.state().nat, visa: window.KZD.state().visa })) : null), src: c.src, status: c.status, tag: c.tag });
      b2.textContent = 'まとめに加えました（' + basket.length + '／3）';
      setTimeout(function () { b2.textContent = 'この図をまとめに加える'; }, 2000);
    });
    bar.appendChild(b1); bar.appendChild(b2);
  }
  window.KZX = { buttons: buttons, open: openDialog, compose: compose, autoTitle: autoTitle, SIZES: SIZES, postText: postText, glyphs: glyphs };
})();
