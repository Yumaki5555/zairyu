/* 数でみる在留外国人：画像の保存（X投稿にも使える PNG）
   画面を写すのではなく、保存用に組み直して canvas に描く。タイトル・地域・国籍・在留資格・統計時点・グラフ・凡例・大事な数・出典を入れる。
   文字はすべて幅を測ってから置く（入らないときは、字を小さくする → 折り返す → 並べ方を変える → 最後に「…」で切る）。字どうしは重ねない。
   サイトの名前とアドレス（アドレスには作った人の名前が入る）は、はじめは入れない（2026年10月 作った人の希望）。
   画面の「サイト名を入れる」を選んだときだけ、サイトの名前（アドレスではない）を右下に入れる。
   大きさ：横長 1600×900（16:9、はじめ）、正方形 1200×1200、縦長 1080×1350。保存の前に見え方を確かめられる。
   どのページでも、グラフの「画像を保存」を押したときに読み込む（app.js）。日本語の字（Noto Sans JP）もそのときに、ページの字とは別の名前で読み込む。
   X の投稿画面を開くリンクでは画像は自動でつかないので、保存またはコピーした画像を貼ってもらう */
(function () {
  'use strict';
  var SIZES = [['wide', 1600, 900, '横長 16:9（1600×900・Xの投稿向き）'], ['square', 1200, 1200, '正方形 1:1（1200×1200）'], ['tall', 1080, 1350, '縦長 4:5（1080×1350）']];
  var FAMILY = 'KZ Noto Sans JP';
  var FONT = "'" + FAMILY + "','Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
  var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
  var SITE = '数でみる在留外国人';
  var C = { text: '#1d2330', sub: '#5b6474', line: '#dfe3ea', grid: '#e4e3dc', bg: '#ffffff', soft: '#f3f5f8', mark: '#b7791f', accent: '#1f7a4f',
    s: { '1': '#2a78d6', '2': '#eb6834', '3': '#1baf7a', '4': '#eda100', '5': '#e87ba4', '6': '#008300', '7': '#6250d6', o: '#b9bdc5' },
    m: { b0: '#fde9d7', b1: '#fbcfa6', b2: '#f7ae70', b3: '#f08a3e', b4: '#d76a1f', b5: '#ac4f12', b6: '#7c360b', 'b-z': '#eef0f3', 'b-n': '#f6f7f9', 'b-u': '#f6f7f9',
      d1: '#cfe1f6', d2: '#8fb8e8', d3: '#4a86cf' } };
  var basket = []; // まとめた図（複数の図を1枚にするとき）
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  function wl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月末'; }
  function font(px, bold) { return (bold ? '700 ' : '400 ') + Math.max(1, Math.round(px)) + 'px ' + FONT; }
  function signed(v, d) { var s = d ? Math.abs(v).toFixed(d) : fmt(Math.round(Math.abs(v))); return (v > 0 ? '+' : v < 0 ? '−' : '±') + s; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function measure(ctx, t) { return ctx.measureText(t).width; }
  function maxW(ctx, list) { return list.reduce(function (m, t) { return Math.max(m, measure(ctx, t)); }, 0); }
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
    if (measure(ctx, text) <= mw) { return text; }
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
      if (measure(ctx, text) <= mw) { return { text: text, size: size }; }
    }
    ctx.font = font(minPx, bold);
    return { text: clip(ctx, text, mw), size: minPx };
  }
  function niceStep(v) { var k = Math.pow(10, Math.floor(Math.log10(v || 1))); return [1, 2, 2.5, 5, 10].map(function (m) { return m * k; }).filter(function (x) { return x >= v; })[0]; }
  function wx(w) { var p = w.split('-'); return +p[0] + (p[1] === '06' ? 0 : 0.5); }
  function short(v) { return Math.abs(v) >= 10000 ? (v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万' : fmt(Math.round(v)); }
  function noData(ctx, x, y, w, h, u) {
    var f = fit1(ctx, 'この図のデータがありません', w, 1.8 * u, false, 1 * u);
    ctx.fillStyle = C.sub; ctx.font = font(f.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, x + w / 2, y + h / 2);
  }
  // 凡例を下に並べる（1列か2列）。items：[{cls, text}]。高さを返し、draw(x, y) で描く
  function legendBelow(ctx, items, w, maxH, u) {
    var cols = w >= 34 * u && items.length > 1 ? 2 : 1, rows = Math.ceil(items.length / cols);
    var rowH = Math.max(1.2 * u, Math.min(2.5 * u, maxH / rows)), fs = Math.min(1.5 * u, rowH * 0.62), colW = (w - (cols - 1) * 1.6 * u) / cols;
    return { h: rows * rowH, draw: function (x, y) {
      items.forEach(function (it, i) {
        var cx = x + (i % cols) * (colW + 1.6 * u), cy = y + Math.floor(i / cols) * rowH + rowH / 2, s = Math.min(1.1 * u, rowH * 0.55);
        ctx.fillStyle = color(it.cls); ctx.fillRect(cx, cy - s / 2, s, s);
        var f = fit1(ctx, it.text, colW - s - 0.8 * u, fs, false, Math.max(0.9 * u, fs * 0.75));
        ctx.fillStyle = C.text; ctx.font = font(f.size); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, cx + s + 0.6 * u, cy);
      });
    } };
  }

  // ---- 図ごとの描き方（x, y, w, h の中に描く。u は字の大きさの目安）
  function drawLine(ctx, ch, x, y, w, h, u) {
    var series = ch.series.filter(function (s) { return s.vals.some(function (v) { return v != null; }); }).slice(0, 8); // 画面と同じ線（多い7つと「その他」）
    if (!series.length) { noData(ctx, x, y, w, h, u); return; }
    var multi = series.length > 1, fa = 1.6 * u;
    var xs = ch.per.map(wx), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var cxm = wx('2012-12') - 0.25, mark = x0 < cxm && cxm <= x1;
    function lastOf(s) { for (var i = s.vals.length - 1; i >= 0; i--) { if (s.vals[i] != null) { return s.vals[i]; } } return null; }
    function valText(s) { var l = lastOf(s); return l == null ? '' : ch.index ? l.toFixed(1) : (ch.f ? ch.f(l) : fmt(Math.round(l)) + '人'); }
    // 凡例（線が2本以上）：広ければ右（名前と数が入る幅にする。図の幅の36％まで）、狭ければ下
    var legRight = multi && w >= 42 * u, legW = 0, leg = null;
    if (legRight) {
      ctx.font = font(1.6 * u, true); var nmW = maxW(ctx, series.map(function (s) { return s.name; }));
      ctx.font = font(1.6 * u); var vlW = maxW(ctx, series.map(valText));
      legW = Math.max(12 * u, Math.min(w * 0.36, 2.4 * u + nmW + 1 * u + vlW));
    }
    if (multi && !legRight) { leg = legendBelow(ctx, series.map(function (s) { return { cls: s.cls, text: s.name + '　' + valText(s) }; }), w, h * 0.34, u); }
    var T = y + (mark ? 2.4 * u : 0.9 * u), B = y + h - 2.5 * u - (leg ? leg.h + 0.6 * u : 0);
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
      ctx.font = font(1.35 * u); ctx.fillStyle = C.mark; ctx.textBaseline = 'top';
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
    if (legRight) { // 凡例：名前と最後の数。縦に余裕があれば2段（名前の下に数）、なければ1行（名前　数）
      var lx = R + 1.6 * u, lh = Math.min(3.8 * u, (B - T) / series.length), two = lh >= 3 * u;
      var nf = two ? Math.min(1.8 * u, lh * 0.44) : Math.min(1.6 * u, lh * 0.62), vf = two ? Math.min(1.5 * u, lh * 0.36) : nf;
      series.forEach(function (s, i) {
        var ly = T + i * lh, sw = Math.min(1.2 * u, nf), tx = lx + sw + 0.6 * u, room = legW - sw - 0.6 * u;
        ctx.fillStyle = color(s.cls); ctx.fillRect(lx, ly + (nf - sw) / 2, sw, sw);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        if (two) {
          var a = fit1(ctx, s.name, room, nf, true, nf * 0.75);
          ctx.fillStyle = C.text; ctx.font = font(a.size, true); ctx.fillText(a.text, tx, ly);
          var b = fit1(ctx, valText(s), room, vf, false, vf * 0.75);
          ctx.fillStyle = C.sub; ctx.font = font(b.size); ctx.fillText(b.text, tx, ly + nf * 1.2);
        } else {
          ctx.font = font(vf); var vt = valText(s), vw = measure(ctx, vt);
          ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.fillText(vt, lx + legW, ly);
          ctx.font = font(nf, true); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(clip(ctx, s.name, room - vw - 0.6 * u), tx, ly);
        }
      });
    }
    if (leg) { leg.draw(x, B + 2.5 * u + 0.6 * u); }
  }

  function drawPie(ctx, ch, x, y, w, h, u) {
    var parts = ch.parts.filter(function (p) { return p.v > 0; }), total = ch.total, n = parts.length;
    if (!n || !total) { noData(ctx, x, y, w, h, u); return; }
    function pctText(p) { return (p.v / total * 100).toFixed(1) + '%'; }
    function valText(p) { return fmt(p.v) + '人'; }
    // 凡例の1行：色・名前・人数・割合。幅を測り、入らなければ字を小さく → 人数を省く（割合は残す）
    function plan(colW, fs) {
      ctx.font = font(fs); var pw = maxW(ctx, parts.map(pctText)), vw = maxW(ctx, parts.map(valText));
      ctx.font = font(fs, true); var nw = maxW(ctx, parts.map(function (p) { return p.name; }));
      var sw = fs * 0.8, gap = fs * 0.7, room = colW - sw - gap - pw - gap, need = Math.min(nw, fs * 4.5);
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
      rowH = Math.min(4 * u, h / n);
      var need = plan(w, Math.min(2 * u, rowH * 0.5)).full;
      D = Math.max(Math.min(h * 0.94, w * 0.42, w - need - 2.4 * u), Math.min(h * 0.94, w * 0.3)); lx = x + D + 2.4 * u; colW = x + w - lx;
      pl = bestPlan(colW, Math.min(2 * u, rowH * 0.5), 1.2 * u);
      if (!pl.ok) { side = false; } else { pcx = x + D / 2; pcy = y + h / 2; ly = y + (h - n * rowH) / 2; }
    }
    if (!side) { // 円は上、凡例は下（1列か2列。人数まで入り、字が大きくなるほうにする）
      var tryCols = function (k) {
        var perCol = Math.ceil(n / k);
        // 凡例の字を読める大きさにするのを先にし、円は残りの高さで（小さくても 6.5u）
        var rH = Math.max(1.05 * u, Math.min(2.6 * u, (h - 7.7 * u) / perCol)), cW = (w - (k - 1) * 1.6 * u) / k;
        var p = bestPlan(cW, Math.min(2 * u, rH * 0.68), 0.95 * u), dd = Math.min(w * 0.8, h - perCol * rH - 1.2 * u);
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
    var tt = fmt(total) + '人', room = ri * 2 * 0.84, tf = Math.min(3 * u, R * 0.3);
    ctx.font = font(tf, true);
    while (tf > 0.9 * u && measure(ctx, tt) > room) { tf -= 0.1 * u; ctx.font = font(tf, true); }
    var lf = Math.min(1.6 * u, tf * 0.62);
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
    var lh = h / Math.max(rows.length, 5), vals = rows.map(function (r) { return ch.f(r[1]); }), names = rows.map(function (r) { return r[0]; });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1]); }).concat([1e-9]));
    var fs, rkW, valW, nameAll, gap, one = null;
    function widths(f) { ctx.font = font(f, true); rkW = measure(ctx, String(rows.length)); valW = maxW(ctx, vals); nameAll = maxW(ctx, names); gap = 0.8 * f; }
    // 1行に「順位・名前・棒・数」を並べられる字の大きさを探す
    for (fs = Math.min(2.1 * u, lh * 0.5); fs >= 1.2 * u - 0.01; fs -= 0.1 * u) {
      widths(fs);
      var nameW = Math.min(nameAll, (w - rkW - valW - 3 * gap) * 0.55), barW = w - rkW - nameW - valW - 3 * gap;
      if (nameW >= Math.min(nameAll, 5 * fs) && barW >= 3 * u) { one = { nameW: nameW, barW: barW }; break; }
    }
    rows.forEach(function (r, i) {
      var top = y + i * lh, bw;
      ctx.fillStyle = r[1] < 0 ? C.m.d3 : C.s['1'];
      if (one) {
        var cy = top + lh / 2;
        bw = Math.abs(r[1]) / max * one.barW;
        ctx.fillRect(x + rkW + gap + one.nameW + gap, top + lh * 0.24, Math.max(2, bw), lh * 0.52);
        ctx.textBaseline = 'middle'; ctx.font = font(fs, true);
        ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.fillText(String(i + 1), x + rkW, cy);
        ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.fillText(clip(ctx, r[0], one.nameW), x + rkW + gap, cy);
        ctx.textAlign = 'right'; ctx.fillText(vals[i], x + w, cy);
      } else { // 狭いとき：1段目に「順位・名前・数」、2段目に棒
        var f2 = Math.max(0.95 * u, Math.min(1.9 * u, lh * 0.4));
        widths(f2);
        while (f2 > 0.9 * u && rkW + gap + valW + gap + 3 * f2 > w) { f2 -= 0.1 * u; widths(f2); }
        var ty = top + lh * 0.3;
        ctx.textBaseline = 'middle'; ctx.font = font(f2, true);
        ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.fillText(String(i + 1), x + rkW, ty);
        ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.fillText(clip(ctx, r[0], w - rkW - valW - 2 * gap), x + rkW + gap, ty);
        ctx.textAlign = 'right'; ctx.fillText(clip(ctx, vals[i], w - rkW - gap), x + w, ty);
        bw = Math.abs(r[1]) / max * (w - rkW - gap);
        ctx.fillStyle = r[1] < 0 ? C.m.d3 : C.s['1'];
        ctx.fillRect(x + rkW + gap, top + lh * 0.6, Math.max(2, bw), lh * 0.24);
      }
    });
  }

  function drawMapShape(ctx, ch, x, y, w, h, u) {
    var sh = ch.shape, items = ch.legend || [], top = (ch.sorted || []).slice(0, 5);
    var side = w >= h * 1.15 && w >= 34 * u, mw, mh, pan;
    if (side) { var lw = Math.min(w * 0.36, 26 * u); mw = w - lw - 2 * u; mh = h; pan = { x: x + w - lw, y: y, w: lw, h: h }; }
    else { var bh = Math.min(h * 0.42, (Math.max(items.length + 1, top.length + 1)) * 2.4 * u); mw = w; mh = h - bh - 1 * u; pan = { x: x, y: y + mh + 1 * u, w: w, h: bh }; }
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
    var hf = Math.min(1.6 * u, pan.h * 0.08), lcols = side && pan.w >= 18 * u && items.length > 4 ? 2 : 1;
    var lrows = Math.ceil(items.length / lcols), rrows = top.length;
    var rows = side ? lrows + rrows : Math.max(lrows, rrows), heads = side ? 2 : 1;
    var rh = Math.max(1.1 * u, Math.min(2.7 * u, (pan.h - heads * hf * 1.6 - (side ? 1.2 * u : 0)) / Math.max(rows, 1))), fs = Math.min(1.65 * u, rh * 0.64);
    function legend(px, py, pw) {
      var a = fit1(ctx, '色の見方（' + (ch.metric || '') + '）', pw, hf, true, 0.9 * u);
      ctx.fillStyle = C.sub; ctx.font = font(a.size, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, px, py);
      var yy = py + hf * 1.6, cw = (pw - (lcols - 1) * 1.2 * u) / lcols;
      items.forEach(function (it, i) {
        var cx = px + Math.floor(i / lrows) * (cw + 1.2 * u), cy = yy + (i % lrows) * rh + rh / 2, sw = Math.min(1.5 * u, fs);
        ctx.fillStyle = C.m[it[0]] || C.m['b-n']; ctx.fillRect(cx, cy - rh * 0.32, sw, rh * 0.64); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(cx, cy - rh * 0.32, sw, rh * 0.64);
        var f = fit1(ctx, it[1], cw - sw - 0.6 * u, fs, false, fs * 0.75);
        ctx.fillStyle = C.text; ctx.font = font(f.size); ctx.textBaseline = 'middle'; ctx.fillText(f.text, cx + sw + 0.6 * u, cy);
      });
      return yy + lrows * rh;
    }
    function ranking(px, py, pw) {
      if (!top.length) { return; }
      ctx.fillStyle = C.sub; ctx.font = font(hf, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('多い順', px, py);
      var yy = py + hf * 1.6;
      top.forEach(function (r, i) {
        var cy = yy + i * rh + rh / 2, val = r[1] == null ? '—' : ch.f(r[1]), pre = (i + 1) + ' ';
        ctx.font = font(fs, true); ctx.textBaseline = 'middle';
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
  var DRAW = { line: drawLine, pie: drawPie, rank: drawRank, map: drawMapShape };

  // ---- タイトル・大事な数・投稿文
  function meta(cur) {
    var st = cur.meta || (window.KZD ? window.KZD.state() : { nat: [], visa: [] });
    return { nat: st.nat || [], visa: st.visa || [], src: cur.src || '出入国在留管理庁「在留外国人統計」', status: cur.status || '' };
  }
  function who(m) { return (m.nat.length ? m.nat.join('・') + 'の人' : '') + (m.visa.length ? (m.nat.length ? '（' : '') + '在留資格「' + m.visa.join('・') + '」' + (m.nat.length ? '）' : '') : ''); }
  function firstLast(s) {
    var f = null, l = null, fi = -1, li = -1;
    s.vals.forEach(function (v, i) { if (v != null) { if (fi < 0) { f = v; fi = i; } l = v; li = i; } });
    return { f: f, l: l, fi: fi, li: li };
  }
  function autoTitle(cur) {
    if (cur.autoTitle) { return cur.autoTitle; }
    var ch = cur.chart, m = meta(cur), w = who(m) || '在留外国人';
    if (ch.kind === 'line') {
      if (ch.series.length === 1 && !ch.index) {
        var fl = firstLast(ch.series[0]);
        if (fl.fi >= 0 && fl.li > fl.fi) {
          var yrs = Math.round(wx(ch.per[fl.li]) - wx(ch.per[fl.fi]));
          return ch.area + 'の' + w + 'は' + yrs + '年間で何人' + (fl.l >= fl.f ? '増えた' : '減った') + '？';
        }
      }
      return ch.area + '　' + (ch.series.length > 1 ? ch.series.map(function (s) { return s.name; }).slice(0, 3).join('・') + (ch.series.length > 3 ? 'など' : '') + 'の' : w + 'の') + '移り変わり';
    }
    if (ch.kind === 'pie') { return ch.area + '　' + (ch.dim === 'visa' ? (who(m) || '在留外国人') + 'の在留資格' : '在留外国人の国籍構成' + (m.visa.length ? '（' + m.visa.join('・') + '）' : '')); }
    if (ch.kind === 'rank') { return (ch.what || ch.area) + '　' + (m.nat.length || m.visa.length ? w + 'の' : '') + ch.metric + 'ランキング'; }
    if (ch.kind === 'map') { return (ch.level === 'muni' ? ch.area + 'の市区町村別' : '都道府県別') + '　' + w + 'の' + ch.metric; }
    return cur.title || '';
  }
  function keyNumbers(ch) {
    if (ch.kind === 'line' && ch.series.length === 1 && !ch.index) {
      var fl = firstLast(ch.series[0]);
      if (fl.fi < 0) { return []; }
      var out = [[wl(ch.per[fl.fi]), fmt(fl.f) + '人'], [wl(ch.per[fl.li]), fmt(fl.l) + '人']];
      if (fl.li > fl.fi) { out.push(['増減', signed(fl.l - fl.f) + '人' + (fl.f ? '（' + signed((fl.l - fl.f) / fl.f * 100, 1) + '%）' : '')]); }
      return out;
    }
    if (ch.kind === 'pie') { return [['合計', fmt(ch.total) + '人'], ['いちばん多い', ch.parts[0].name + ' ' + (ch.parts[0].v / ch.total * 100).toFixed(1) + '%']]; }
    if (ch.kind === 'rank' && ch.rows.length) { return [['1位', ch.rows[0][0]], [ch.metric, ch.f(ch.rows[0][1])]]; }
    if (ch.kind === 'map' && ch.sorted.length) { return [['いちばん多い', ch.sorted[0][0]], [ch.metric, ch.sorted[0][1] == null ? '—' : ch.f(ch.sorted[0][1])]]; }
    return [];
  }
  function period(ch) { return ch.kind === 'line' && ch.from ? wl(ch.from) + '〜' + wl(ch.when) : wl(ch.when); }
  function postText(cur, title) {
    var ch = cur.chart, k = keyNumbers(ch).map(function (x) { return x[0] + '：' + x[1]; }).join('、');
    return title + '\n' + (k ? k + '\n' : '') + '統計時点：' + period(ch) + (meta(cur).status ? '（' + meta(cur).status + '）' : '') + '\n出典：' + meta(cur).src + '\n#在留外国人';
  }

  // ---- 1枚の画像を組み立てる。opts.site：右下にサイトの名前を入れる
  function compose(items, size, title, opts) {
    opts = opts || {};
    var W = size[1], H = size[2], cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), u = H > W ? W / 56 : W / 64, pad = 2.6 * u;
    // 描いた字（あとで、その字の入った字のファイルを読み込む）と、字の置かれた四角（字が重なっていないかを確かめるため）
    var drawn = [], boxes = [], fill = ctx.fillText;
    ctx.fillText = function (t, a, b) {
      var mt = ctx.measureText(t);
      boxes.push({ t: t, x0: a - mt.actualBoundingBoxLeft, x1: a + mt.actualBoundingBoxRight, y0: b - mt.actualBoundingBoxAscent, y1: b + mt.actualBoundingBoxDescent });
      drawn.push(t); return fill.call(ctx, t, a, b);
    };
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, 0.5 * u);
    var cur = items[0], m = meta(cur), ch = cur.chart, y = pad + 0.4 * u;
    // タイトル（2行まで）
    var t = fitLines(ctx, title || autoTitle(cur), W - 2 * pad, (W > H ? 2.9 : 3.3) * u, true, 2, 2 * u);
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    t.lines.forEach(function (l) { ctx.font = font(t.size, true); ctx.fillText(l, pad, y); y += t.size * 1.28; });
    // 地域・国籍・在留資格・統計時点
    var sub = '地域：' + (items.length > 1 ? items.map(function (x) { return x.chart.area; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('・') : ch.area) +
      '　国籍・地域：' + (m.nat.length ? m.nat.join('・') : 'すべて') + '　在留資格：' + (m.visa.length ? m.visa.join('・') : 'すべて') + '　統計時点：' + period(ch) + (m.status ? '（' + m.status + '）' : '');
    var s2 = fitLines(ctx, sub, W - 2 * pad, (W > H ? 1.55 : 1.75) * u, false, 2, 1.2 * u);
    ctx.fillStyle = C.sub; s2.lines.forEach(function (l) { ctx.font = font(s2.size); ctx.fillText(l, pad, y); y += s2.size * 1.35; });
    y += 0.8 * u;
    // 出典（とサイトの名前）：下から高さを決める
    var siteW = 0;
    if (opts.site) { ctx.font = font(1.45 * u, true); siteW = measure(ctx, SITE) + 2 * u; }
    var srcText = '出典：' + m.src + 'を加工して作成' + (ch.pop ? '。人口：総務省「住民基本台帳に基づく人口」' : '');
    var fs = fitLines(ctx, srcText, W - 2 * pad - siteW, 1.45 * u, false, 2, 1.05 * u);
    var footH = fs.lines.length * fs.size * 1.35 + 1.4 * u, bottom = H - pad - footH;
    // 大事な数（横長の地図は、地図と凡例を大きくするため出さない。いちばん多い所は「多い順」にある）
    var keys = items.length === 1 && !(ch.kind === 'map' && W > H) ? keyNumbers(ch) : [];
    var gx = pad, gy = y, gw = W - 2 * pad, gh = bottom - y;
    if (keys.length) {
      if (W > H) { // 横長：右に縦に並べる
        var kw = Math.min(gw * 0.3, 19 * u), kx = W - pad - kw, kh = Math.min(gh / keys.length, 9 * u);
        keys.forEach(function (k2, i) {
          var ky = gy + i * kh, bh = kh - 0.5 * u, lf = Math.min(1.6 * u, bh * 0.22);
          ctx.fillStyle = C.soft; roundRect(ctx, kx, ky + 0.25 * u, kw, bh, 0.8 * u); ctx.fill();
          var a = fit1(ctx, k2[0], kw - 2.4 * u, lf, false, 0.9 * u);
          ctx.fillStyle = C.sub; ctx.font = font(a.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, kx + 1.2 * u, ky + 0.25 * u + 0.8 * u);
          var room = bh - 0.8 * u - a.size * 1.35 - 0.6 * u;
          var b = fitLines(ctx, k2[1], kw - 2.4 * u, Math.min(2.9 * u, room), true, 2, 1.2 * u);
          var vf = Math.min(b.size, room / (b.lines.length * 1.18));
          if (vf < b.size) { b = fitLines(ctx, k2[1], kw - 2.4 * u, vf, true, 2, Math.min(vf, 1.2 * u)); }
          ctx.fillStyle = C.text; ctx.font = font(b.size, true);
          b.lines.forEach(function (l, j) { ctx.fillText(l, kx + 1.2 * u, ky + 0.25 * u + 0.8 * u + a.size * 1.35 + j * b.size * 1.18); });
        });
        gw -= kw + 2 * u;
      } else { // 正方形・縦長：上に横に並べる
        var bw = (gw - (keys.length - 1) * u) / keys.length, bh2 = 6.6 * u;
        keys.forEach(function (k2, i) {
          var bx = gx + i * (bw + u);
          ctx.fillStyle = C.soft; roundRect(ctx, bx, gy, bw, bh2, 0.8 * u); ctx.fill();
          var a = fit1(ctx, k2[0], bw - 2 * u, 1.5 * u, false, 0.9 * u);
          ctx.fillStyle = C.sub; ctx.font = font(a.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.text, bx + u, gy + 0.9 * u);
          var b = fitLines(ctx, k2[1], bw - 2 * u, 2.6 * u, true, 1, 1.1 * u);
          if (measure(ctx, b.lines[0]) > bw - 2 * u) { b = fitLines(ctx, k2[1], bw - 2 * u, 1.5 * u, true, 2, 1 * u); }
          ctx.fillStyle = C.text; ctx.font = font(b.size, true);
          b.lines.forEach(function (l, j) { ctx.fillText(l, bx + u, gy + 2.8 * u + j * b.size * 1.15); });
        });
        gy += bh2 + 1.6 * u; gh -= bh2 + 1.6 * u;
      }
    }
    // 図（いくつかまとめるときは、横長は横に、ほかは縦に並べる）。それぞれの図の見出しは2行まで
    var n = items.length, side = W > H && n > 1, gapX = 1.8 * u, gapY = 1.4 * u;
    var cw0 = side ? (gw - (n - 1) * gapX) / n : gw, ch0 = side ? gh : (gh - (n - 1) * gapY) / n;
    items.forEach(function (it, i) {
      var cx = side ? gx + i * (cw0 + gapX) : gx, cy = side ? gy : gy + i * (ch0 + gapY), cw = cw0, chh = ch0, uu = u * (n > 1 ? 0.9 : 1);
      if (n > 1) {
        if (side && i > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(cx - gapX / 2, cy); ctx.lineTo(cx - gapX / 2, cy + chh); ctx.stroke(); }
        var ht = fitLines(ctx, it.title || autoTitle(it), cw, 1.8 * u, true, 2, 1.25 * u);
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ht.lines.forEach(function (l, j) { ctx.font = font(ht.size, true); ctx.fillText(l, cx, cy + j * ht.size * 1.25); });
        var used = ht.lines.length * ht.size * 1.25 + 0.8 * u; cy += used; chh -= used;
      }
      var fn = DRAW[it.chart.kind];
      if (fn) { ctx.save(); fn(ctx, it.chart, cx, cy, cw, chh, uu); ctx.restore(); }
    });
    // 出典（とサイトの名前）
    ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(pad, bottom + 0.6 * u); ctx.lineTo(W - pad, bottom + 0.6 * u); ctx.stroke();
    ctx.fillStyle = C.sub; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    fs.lines.forEach(function (l, j) { ctx.font = font(fs.size); ctx.fillText(l, pad, bottom + 1.2 * u + j * fs.size * 1.35); });
    if (opts.site) { ctx.font = font(1.45 * u, true); ctx.fillStyle = C.accent; ctx.textAlign = 'right'; ctx.fillText(SITE, W - pad, bottom + 1.2 * u); }
    ctx.fillText = fill;
    cv._text = drawn.join(''); cv._boxes = boxes;
    return cv;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

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
  window.KZX = { buttons: buttons, open: openDialog, compose: compose, autoTitle: autoTitle, SIZES: SIZES };
})();
