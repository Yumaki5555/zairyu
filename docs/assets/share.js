/* 数でみる在留外国人：X投稿用の画像（と PNG 保存）
   画面を写すのではなく、投稿用に組み直して canvas に描く。タイトル・地域・国籍・在留資格・統計時点・グラフ・大事な数・出典を入れる。
   サイトの名前とアドレス（作った人の名前が入る）は、画像にも投稿文にも入れない（2026年10月 作った人の希望）。
   大きさ：横長 1600×900（はじめ）、正方形 1200×1200、縦長 1080×1350。保存の前に見え方を確かめられる。
   X の投稿画面を開くリンクでは画像は自動でつかないので、保存またはコピーした画像を貼ってもらう */
(function () {
  'use strict';
  var SIZES = [['wide', 1600, 900, '横長 1600×900（16:9）'], ['square', 1200, 1200, '正方形 1200×1200（1:1）'], ['tall', 1080, 1350, '縦長 1080×1350（4:5）']];
  var FONT = "'Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
  var C = { text: '#1d2330', sub: '#5b6474', line: '#dfe3ea', grid: '#e4e3dc', bg: '#ffffff', soft: '#f3f5f8', mark: '#b7791f', accent: '#1f7a4f',
    s: { '1': '#2a78d6', '2': '#eb6834', '3': '#1baf7a', '4': '#eda100', '5': '#e87ba4', '6': '#008300', '7': '#6250d6', o: '#b9bdc5' },
    m: { b0: '#fde9d7', b1: '#fbcfa6', b2: '#f7ae70', b3: '#f08a3e', b4: '#d76a1f', b5: '#ac4f12', b6: '#7c360b', 'b-z': '#eef0f3', 'b-n': '#f6f7f9', 'b-u': '#f6f7f9',
      d1: '#cfe1f6', d2: '#8fb8e8', d3: '#4a86cf' } };
  var basket = []; // まとめた図（複数の図を1枚にするとき）
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  function wl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月末'; }
  function font(px, bold) { return (bold ? '700 ' : '400 ') + Math.round(px) + 'px ' + FONT; }
  function signed(v, d) { var s = d ? Math.abs(v).toFixed(d) : fmt(Math.round(Math.abs(v))); return (v > 0 ? '+' : v < 0 ? '−' : '±') + s; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }

  // 文字を幅に収める（収まらなければ小さくし、それでもだめなら折り返す）
  function fitLines(ctx, text, maxW, px, bold, maxLines, minPx) {
    var fallback = null; // 最後の行が1〜3文字だけになるときは、もう少し小さくして収まらないか試す
    for (var size = px; size >= (minPx || px * 0.6); size -= 2) {
      ctx.font = font(size, bold);
      var lines = [], line = '';
      for (var i = 0; i < text.length; i++) {
        var t = line + text[i];
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = text[i]; } else { line = t; }
      }
      if (line) { lines.push(line); }
      if (lines.length <= maxLines) {
        if (lines.length === 1 || lines[lines.length - 1].length > 3) { return { lines: lines, size: size }; }
        if (!fallback) { fallback = { lines: lines, size: size }; }
      }
    }
    if (fallback) { ctx.font = font(fallback.size, bold); return fallback; }
    ctx.font = font(minPx || px * 0.6, bold);
    return { lines: [text], size: minPx || px * 0.6 };
  }
  function clip(ctx, text, maxW) { if (ctx.measureText(text).width <= maxW) { return text; } while (text.length > 1 && ctx.measureText(text + '…').width > maxW) { text = text.slice(0, -1); } return text + '…'; }
  function niceStep(v) { var k = Math.pow(10, Math.floor(Math.log10(v || 1))); return [1, 2, 2.5, 5, 10].map(function (m) { return m * k; }).filter(function (x) { return x >= v; })[0]; }
  function wx(w) { var p = w.split('-'); return +p[0] + (p[1] === '06' ? 0 : 0.5); }
  function short(v) { return Math.abs(v) >= 10000 ? (v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1) + '万' : fmt(Math.round(v)); }

  // ---- 図ごとの描き方（x, y, w, h の中に、u は文字の大きさの目安）
  function drawLine(ctx, ch, x, y, w, h, u) {
    var series = ch.series.filter(function (s) { return s.vals.some(function (v) { return v != null; }); }).slice(0, 7);
    var multi = series.length > 1, legendW = multi ? Math.min(w * 0.34, 15 * u) : 0;
    var L = x + 5.2 * u, R = x + w - legendW - 1.5 * u, T = y + 1.6 * u, B = y + h - 3 * u;
    var xs = ch.per.map(wx), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var all = []; series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) { all.push(v); } }); });
    var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all), step = niceStep((hi - lo || 1) / 4);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi * 1.03 / step) * step;
    var X = function (v) { return L + (x1 > x0 ? (v - x0) / (x1 - x0) : 0.5) * (R - L); }, Y = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (B - T); };
    ctx.font = font(1.7 * u); ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var v = y0; v <= y1 + 1e-9; v += step) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke();
      ctx.fillText(ch.index ? String(Math.round(v)) : short(v), L - 0.6 * u, Y(v));
    }
    var span = x1 - x0, ys = span > 30 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var yr = Math.ceil(x0 / ys) * ys; yr <= x1; yr += ys) { ctx.fillText(String(yr), X(yr + 0.5), B + 0.6 * u); }
    var cx = wx('2012-12') - 0.25;
    if (x0 < cx && cx <= x1) {
      ctx.strokeStyle = C.mark; ctx.setLineDash([u * 0.5, u * 0.4]); ctx.beginPath(); ctx.moveTo(X(cx), T); ctx.lineTo(X(cx), B); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(1.4 * u); ctx.fillStyle = C.mark; ctx.textAlign = 'left'; ctx.fillText('2012年から数え方が変わった', X(cx) + 0.5 * u, T);
    }
    series.forEach(function (s) {
      ctx.strokeStyle = C.s[s.cls] || C.s.o; ctx.lineWidth = Math.max(3, 0.36 * u); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); var pen = false;
      s.vals.forEach(function (v2, i) { if (v2 == null) { pen = false; return; } if (pen) { ctx.lineTo(X(xs[i]), Y(v2)); } else { ctx.moveTo(X(xs[i]), Y(v2)); pen = true; } });
      ctx.stroke();
      for (var i = s.vals.length - 1; i >= 0; i--) { if (s.vals[i] != null) { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(X(xs[i]), Y(s.vals[i]), 0.55 * u, 0, 7); ctx.fill(); break; } }
    });
    if (multi) { // 凡例：名前と最後の数
      var ly = T, lh = Math.min(3.4 * u, (B - T) / series.length);
      series.forEach(function (s) {
        var last = null; for (var i = s.vals.length - 1; i >= 0; i--) { if (s.vals[i] != null) { last = s.vals[i]; break; } }
        ctx.fillStyle = C.s[s.cls] || C.s.o; ctx.fillRect(R + 1.8 * u, ly + lh * 0.18, 1.3 * u, 1.3 * u);
        ctx.fillStyle = C.text; ctx.font = font(Math.min(1.9 * u, lh * 0.55), true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(clip(ctx, s.name, legendW - 4 * u), R + 3.6 * u, ly + lh * 0.08);
        if (last != null) { ctx.fillStyle = C.sub; ctx.font = font(Math.min(1.6 * u, lh * 0.45)); ctx.fillText(ch.index ? last.toFixed(1) : fmt(Math.round(last)) + '人', R + 3.6 * u, ly + lh * 0.5); }
        ly += lh;
      });
    }
  }
  function drawPie(ctx, ch, x, y, w, h, u) {
    var r = Math.min(h * 0.46, w * 0.22), cx = x + r + 1 * u, cy = y + h / 2, a = -Math.PI / 2;
    ch.parts.forEach(function (p) {
      var da = p.v / ch.total * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + da); ctx.closePath(); ctx.fillStyle = C.s[p.cls] || C.s.o; ctx.fill();
      ctx.strokeStyle = C.bg; ctx.lineWidth = Math.max(2, 0.2 * u); ctx.stroke();
      a += da;
    });
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.56, 0, 7); ctx.fillStyle = C.bg; ctx.fill();
    ctx.fillStyle = C.sub; ctx.font = font(1.7 * u); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('合計', cx, cy - 0.2 * u);
    ctx.fillStyle = C.text; ctx.font = font(Math.min(3 * u, r * 0.3), true); ctx.textBaseline = 'top'; ctx.fillText(fmt(ch.total) + '人', cx, cy + 0.1 * u);
    var lx = cx + r + 3 * u, lw = x + w - lx, lh = Math.min(4 * u, h / ch.parts.length), ly = y + (h - lh * ch.parts.length) / 2;
    ch.parts.forEach(function (p) {
      ctx.fillStyle = C.s[p.cls] || C.s.o; ctx.fillRect(lx, ly + lh * 0.22, 1.4 * u, 1.4 * u);
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = font(Math.min(2 * u, lh * 0.5), true);
      ctx.fillText(clip(ctx, p.name, lw * 0.56), lx + 2.2 * u, ly + lh * 0.12);
      ctx.textAlign = 'right'; ctx.font = font(Math.min(2 * u, lh * 0.5));
      ctx.fillText(fmt(p.v) + '人', x + w - 7.5 * u, ly + lh * 0.12);
      ctx.fillStyle = C.sub; ctx.fillText((p.v / ch.total * 100).toFixed(1) + '%', x + w, ly + lh * 0.12);
      ly += lh;
    });
  }
  function drawRank(ctx, ch, x, y, w, h, u) {
    var rows = ch.rows.slice(0, 10), lh = h / Math.max(rows.length, 5), nameW = w * 0.34, valW = w * 0.2;
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1]); }).concat([1e-9]));
    rows.forEach(function (r, i) {
      var yy = y + i * lh, fs = Math.min(2.1 * u, lh * 0.5);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = C.sub; ctx.font = font(fs, true);
      ctx.fillText(String(i + 1), x + 2.6 * u, yy + lh / 2);
      ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = font(fs, true);
      ctx.fillText(clip(ctx, r[0], nameW - 4 * u), x + 3.6 * u, yy + lh / 2);
      var bw = Math.abs(r[1]) / max * (w - nameW - valW - 2 * u);
      ctx.fillStyle = r[1] < 0 ? C.m.d3 : C.s['1'];
      ctx.fillRect(x + nameW, yy + lh * 0.24, Math.max(2, bw), lh * 0.52);
      ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = font(fs, true);
      ctx.fillText(ch.f(r[1]), x + w, yy + lh / 2);
    });
  }
  function drawMapShape(ctx, ch, x, y, w, h, u) {
    var sh = ch.shape, legendW = Math.min(w * 0.36, 26 * u), mw = w - legendW - 2 * u;
    var k = Math.min(mw / sh.w, h / sh.h), ox = x + (mw - sh.w * k) / 2, oy = y + (h - sh.h * k) / 2;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
    ctx.lineWidth = 1 / k * Math.max(1, u * 0.08); ctx.strokeStyle = '#ffffff';
    (sh.frames || []).forEach(function (f) { ctx.strokeStyle = C.line; ctx.strokeRect(f.box[0], f.box[1], f.box[2] - f.box[0], f.box[3] - f.box[1]); });
    if (sh.inset) { ctx.strokeStyle = C.line; ctx.strokeRect(sh.inset[0], sh.inset[1], sh.inset[2] - sh.inset[0], sh.inset[3] - sh.inset[1]); }
    var parts = sh.prefs || sh.areas;
    Object.keys(parts).forEach(function (key) {
      var p = new Path2D(parts[key]);
      ctx.fillStyle = C.m[(ch.cls && ch.cls[key]) || 'b-n'] || C.m['b-n']; ctx.fill(p);
      ctx.strokeStyle = '#ffffff'; ctx.stroke(p);
    });
    ctx.restore();
    // 凡例と多い順
    var lx = x + w - legendW, ly = y, items = ch.legend || [], lh = Math.min(2.6 * u, h * 0.5 / Math.max(items.length, 1));
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    items.forEach(function (it) {
      ctx.fillStyle = C.m[it[0]] || C.m['b-n']; ctx.fillRect(lx, ly + lh * 0.15, 1.6 * u, lh * 0.7); ctx.strokeStyle = C.line; ctx.strokeRect(lx, ly + lh * 0.15, 1.6 * u, lh * 0.7);
      ctx.fillStyle = C.text; ctx.font = font(Math.min(1.6 * u, lh * 0.6)); ctx.fillText(clip(ctx, it[1], legendW - 2.4 * u), lx + 2.2 * u, ly + lh / 2);
      ly += lh;
    });
    ly += 1.2 * u;
    ctx.fillStyle = C.sub; ctx.font = font(1.7 * u, true); ctx.fillText('多い順', lx, ly); ly += 2.4 * u;
    var rest = (y + h - ly) / Math.min(5, ch.sorted.length || 1);
    ch.sorted.slice(0, 5).forEach(function (r, i) {
      ctx.fillStyle = C.text; ctx.font = font(Math.min(1.9 * u, rest * 0.55), true); ctx.textAlign = 'left';
      ctx.fillText((i + 1) + ' ' + clip(ctx, r[0], legendW * 0.5), lx, ly + rest / 2);
      ctx.textAlign = 'right'; ctx.fillText(r[1] == null ? '—' : ch.f(r[1]), x + w, ly + rest / 2);
      ly += rest;
    });
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

  // ---- 1枚の画像を組み立てる
  function compose(items, size, title) {
    var W = size[1], H = size[2], cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), u = W / 64, pad = 2.6 * u;
    if (H > W) { u = W / 56; }
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, 0.5 * u);
    var cur = items[0], m = meta(cur), ch = cur.chart;
    // タイトル
    var t = fitLines(ctx, title, W - 2 * pad, (W > H ? 2.9 : 3.3) * u, true, 2, 2.2 * u), y = pad + 0.4 * u;
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    t.lines.forEach(function (l) { ctx.font = font(t.size, true); ctx.fillText(l, pad, y); y += t.size * 1.28; });
    // 地域・国籍・在留資格・統計時点
    var sub = '地域：' + (items.length > 1 ? items.map(function (x) { return x.chart.area; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('・') : ch.area) +
      '　国籍・地域：' + (m.nat.length ? m.nat.join('・') : 'すべて') + '　在留資格：' + (m.visa.length ? m.visa.join('・') : 'すべて') + '　統計時点：' + period(ch) + (m.status ? '（' + m.status + '）' : '');
    var s2 = fitLines(ctx, sub, W - 2 * pad, (W > H ? 1.55 : 1.75) * u, false, 2, 1.2 * u);
    ctx.fillStyle = C.sub; s2.lines.forEach(function (l) { ctx.font = font(s2.size); ctx.fillText(l, pad, y); y += s2.size * 1.35; });
    y += 0.8 * u;
    var footH = 2.9 * u, bottom = H - pad - footH;
    // 大事な数
    var keys = items.length === 1 ? keyNumbers(ch) : [];
    var gx = pad, gy = y, gw = W - 2 * pad, gh = bottom - y;
    if (keys.length) {
      if (W > H) { // 横長：右に並べる
        var kw = Math.min(gw * 0.3, 19 * u), kx = W - pad - kw, kh = Math.min(gh / keys.length, 9 * u);
        keys.forEach(function (k2, i) {
          var ky = gy + i * kh, lf = Math.min(1.6 * u, kh * 0.22);
          ctx.fillStyle = C.soft; roundRect(ctx, kx, ky + 0.25 * u, kw, kh - 0.5 * u, 0.8 * u); ctx.fill();
          ctx.fillStyle = C.sub; ctx.font = font(lf); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(k2[0], kx + 1.2 * u, ky + kh * 0.14);
          var f2 = fitLines(ctx, k2[1], kw - 2.4 * u, Math.min(2.9 * u, kh * 0.4), true, 1, 1.2 * u);
          ctx.fillStyle = C.text; ctx.font = font(f2.size, true); ctx.fillText(f2.lines[0], kx + 1.2 * u, ky + kh * 0.14 + lf * 1.35);
        });
        gw -= kw + 2 * u;
      } else { // 正方形・縦長：上に並べる
        var bw = (gw - (keys.length - 1) * u) / keys.length, bh = 6.6 * u;
        keys.forEach(function (k2, i) {
          var bx = gx + i * (bw + u);
          ctx.fillStyle = C.soft; roundRect(ctx, bx, gy, bw, bh, 0.8 * u); ctx.fill();
          ctx.fillStyle = C.sub; ctx.font = font(1.5 * u); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(clip(ctx, k2[0], bw - 2 * u), bx + u, gy + 0.9 * u);
          var f2 = fitLines(ctx, k2[1], bw - 2 * u, 2.6 * u, true, 1, 1.4 * u);
          ctx.fillStyle = C.text; ctx.font = font(f2.size, true); ctx.fillText(f2.lines[0], bx + u, gy + 2.9 * u);
        });
        gy += bh + 1.6 * u; gh -= bh + 1.6 * u;
      }
    }
    // 図（いくつかまとめるときは、横長は横に、ほかは縦に並べる）
    var n = items.length, side = W > H && n > 1;
    items.forEach(function (it, i) {
      var cx = side ? gx + i * gw / n : gx, cy = side ? gy : gy + i * gh / n, cw = side ? gw / n - (i < n - 1 ? 1.6 * u : 0) : gw, chh = side ? gh : gh / n - (i < n - 1 ? 1.2 * u : 0);
      if (n > 1) {
        ctx.fillStyle = C.text; ctx.font = font(1.8 * u, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(clip(ctx, it.title || '', cw), cx, cy); cy += 2.8 * u; chh -= 2.8 * u;
      }
      var fn = DRAW[it.chart.kind];
      if (fn) { ctx.save(); fn(ctx, it.chart, cx, cy, cw, chh, u * (n > 1 && !side ? 0.85 : 1)); ctx.restore(); }
    });
    // 出典とサイト
    ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(pad, H - pad - footH + 0.6 * u); ctx.lineTo(W - pad, H - pad - footH + 0.6 * u); ctx.stroke();
    var src = '出典：' + m.src + 'を加工して作成' + (ch.pop ? '。人口：総務省「住民基本台帳に基づく人口」' : '');
    var fs = fitLines(ctx, src, W - 2 * pad, 1.45 * u, false, 1, 1.05 * u);
    ctx.fillStyle = C.sub; ctx.font = font(fs.size); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(fs.lines[0], pad, H - pad - footH + 1.2 * u);
    return cv;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) { return Promise.resolve(); }
    return Promise.all([document.fonts.load('700 40px "Noto Sans JP"'), document.fonts.load('400 40px "Noto Sans JP"')]).catch(function () {});
  }

  // ---- 画面（作る前に見え方を確かめる）
  function openDialog(getCurrent) {
    var cur = getCurrent();
    if (!cur || !cur.chart) { alert('この画面には、画像にできる図がありません。'); return; }
    var ov = el('div', 'xov'), box = el('div', 'xbox'); ov.appendChild(box);
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'X投稿用の画像');
    box.appendChild(el('h2', null, 'X投稿用の画像を作る'));
    var form = el('div', 'xform');
    var sizeSel = el('select'); SIZES.forEach(function (s) { var o = el('option'); o.value = s[0]; o.textContent = s[3]; sizeSel.appendChild(o); });
    var lab1 = el('label', 'dctl'); lab1.appendChild(el('span', 'dlab', '大きさ')); lab1.appendChild(sizeSel); form.appendChild(lab1);
    var useSel = el('select');
    [['one', 'この図だけ'], ['basket', 'まとめた図（' + basket.length + '）'], ['plus', 'まとめた図とこの図（' + (basket.length + 1) + '）']].forEach(function (x, i) {
      var o = el('option'); o.value = x[0]; o.textContent = x[1]; if (i > 0 && !basket.length) { o.disabled = true; } useSel.appendChild(o);
    });
    var lab2 = el('label', 'dctl'); lab2.appendChild(el('span', 'dlab', '入れる図')); lab2.appendChild(useSel); form.appendChild(lab2);
    var tIn = el('input'); tIn.type = 'text'; tIn.value = autoTitle(cur); tIn.setAttribute('aria-label', 'タイトル');
    var lab3 = el('label', 'dctl xtitle'); lab3.appendChild(el('span', 'dlab', 'タイトル（自動で作ります。書き直せます）')); lab3.appendChild(tIn); form.appendChild(lab3);
    box.appendChild(form);
    var prev = el('div', 'xprev'); box.appendChild(prev);
    var acts = el('div', 'dtools');
    var bSave = el('button', 'dbtn', 'PNGで保存'), bCopy = el('button', 'dbtn dbtn-sub', '画像をコピー'), bClose = el('button', 'dbtn dbtn-sub', '閉じる');
    [bSave, bCopy, bClose].forEach(function (b) { b.type = 'button'; acts.appendChild(b); });
    box.appendChild(acts);
    var txt = el('textarea', 'xtext'); txt.rows = 5; txt.setAttribute('aria-label', '投稿文');
    var tLab = el('label', 'dctl'); tLab.appendChild(el('span', 'dlab', '投稿文（自動で作ります。書き直せます）')); tLab.appendChild(txt); box.appendChild(tLab);
    var acts2 = el('div', 'dtools'), bText = el('button', 'dbtn dbtn-sub', '投稿文をコピー'), aX = el('a', 'dbtn', 'Xの投稿画面を開く');
    bText.type = 'button'; aX.target = '_blank'; aX.rel = 'noopener';
    acts2.appendChild(bText); acts2.appendChild(aX); box.appendChild(acts2);
    box.appendChild(el('p', 'dhelp', 'Xの投稿画面には画像は自動でつきません。先に「PNGで保存」か「画像をコピー」をして、投稿画面に画像を貼り付けてください。'));
    var msg = el('p', 'dhelp xmsg'); box.appendChild(msg);
    var canvas = null;
    function items() {
      var v = useSel.value;
      return v === 'one' ? [cur] : v === 'basket' ? basket.slice() : basket.concat([cur]);
    }
    function redraw() {
      var size = SIZES.filter(function (s) { return s[0] === sizeSel.value; })[0];
      canvas = compose(items().slice(0, 3), size, tIn.value);
      canvas.className = 'xcanvas'; prev.replaceChildren(canvas);
      var t = postText(cur, tIn.value);
      if (!txt.dataset.edited) { txt.value = t; }
      aX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt.value);
    }
    sizeSel.addEventListener('change', redraw); useSel.addEventListener('change', redraw);
    tIn.addEventListener('input', function () { redraw(); });
    txt.addEventListener('input', function () { txt.dataset.edited = '1'; aX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt.value); });
    bSave.addEventListener('click', function () {
      canvas.toBlob(function (b) {
        var a = el('a'); a.href = URL.createObjectURL(b); a.download = tIn.value.replace(/[\\/:*?"<>|？\s]+/g, '_').slice(0, 60) + '_' + sizeSel.value + '.png';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        msg.textContent = '保存しました。';
      }, 'image/png');
    });
    bCopy.addEventListener('click', function () {
      if (!navigator.clipboard || !window.ClipboardItem) { msg.textContent = 'このブラウザでは画像をコピーできません。「PNGで保存」を使ってください。'; return; }
      canvas.toBlob(function (b) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { msg.textContent = '画像をコピーしました。投稿画面に貼り付けられます。'; },
          function () { msg.textContent = '画像をコピーできませんでした。「PNGで保存」を使ってください。'; });
      }, 'image/png');
    });
    bText.addEventListener('click', function () {
      var done = function () { msg.textContent = '投稿文をコピーしました。'; };
      if (navigator.clipboard) { navigator.clipboard.writeText(txt.value).then(done, function () { txt.select(); }); } else { txt.select(); }
    });
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev) { if (ev.key === 'Escape') { close(); } }
    bClose.addEventListener('click', close);
    ov.addEventListener('click', function (ev) { if (ev.target === ov) { close(); } });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    prev.textContent = '画像を作っています…';
    fontsReady().then(redraw);
    sizeSel.focus();
  }
  function buttons(bar, getCurrent) {
    var b1 = el('button', 'dbtn', 'X投稿用の画像を作る（PNG保存も）'), b2 = el('button', 'dbtn dbtn-sub', 'この図をまとめに加える');
    b1.type = b2.type = 'button';
    b1.addEventListener('click', function () { openDialog(getCurrent); });
    b2.addEventListener('click', function () {
      var c = getCurrent(); if (!c || !c.chart) { return; }
      if (basket.length >= 3) { basket.shift(); }
      basket.push({ chart: c.chart, title: c.title, meta: c.meta || (window.KZD ? JSON.parse(JSON.stringify({ nat: window.KZD.state().nat, visa: window.KZD.state().visa })) : null), src: c.src, status: c.status });
      b2.textContent = 'まとめに加えました（' + basket.length + '）';
      setTimeout(function () { b2.textContent = 'この図をまとめに加える'; }, 1800);
    });
    bar.appendChild(b1); bar.appendChild(b2);
  }
  window.KZX = { buttons: buttons, compose: compose, autoTitle: autoTitle, SIZES: SIZES };
})();
