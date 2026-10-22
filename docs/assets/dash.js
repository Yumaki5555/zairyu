/* 数でみる在留外国人：ダッシュボード（dash.html）
   共通の絞り込み（地域・国籍・在留資格・時点・指標）を選ぶと、地図・折れ線・円グラフ・ランキングが変わる。
   数は data/*.json（make_dash_data.py が作る）から必要な分だけ読む。
   決まり：データのない時点・組み合わせは推測で埋めない（「該当する統計データがありません」）。0人と「データなし」「公表されていない」を分ける。
   選んだ条件はページのアドレス（# のあと）に残すので、アドレスを送ると同じ画面が出る */
(function () {
  'use strict';
  var K = window.KZ, fmt = K.fmt, esc = K.esc, svg = K.svg;
  var root = document.getElementById('dash');
  // グラフの部品は半期速報のページ（sokuho.js）でも使う
  window.KZC = { el: el, nodata: nodata, lineChart: lineChart, pieChart: pieChart, barList: barList, tableEl: tableEl, details: details,
    topWithOther: topWithOther, wl: wl, signed: signed, fitPanel: function (p) { fitPanel(p); } };
  if (!root) { return; }
  var M = null, MUNI = {}, PREF_ROMA = {};
  var MAXCMP = 5, SLOTS = 7;
  var SRC = '出典：出入国在留管理庁「在留外国人統計（旧登録外国人統計）」';
  var POPSRC = '人口：総務省「住民基本台帳に基づく人口」（日本人住民と外国人住民の合計）';

  // ---------- データの読み込み（同じファイルは1回だけ）
  var cache = {}, pending = 0, loadingBox = document.getElementById('dash-loading');
  function busy(d) { pending += d; if (loadingBox) { loadingBox.hidden = pending <= 0; } }
  function load(path) {
    if (!cache[path]) {
      busy(1);
      cache[path] = fetch('data/' + path).then(function (r) {
        if (!r.ok) { throw new Error(path + ' ' + r.status); }
        return r.json();
      }).then(function (j) { busy(-1); return j; }, function (e) { busy(-1); delete cache[path]; throw e; });
    }
    return cache[path];
  }

  // ---------- 書き方
  function wl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月末'; }
  function wx(w) { var p = w.split('-'); return +p[0] + (p[1] === '06' ? 0 : 0.5); }
  function signed(v, d) { var s = d ? Math.abs(v).toFixed(d) : fmt(Math.round(Math.abs(v))); return (v > 0 ? '+' : v < 0 ? '−' : '±') + s; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function nodata(msg) { return el('p', 'dnodata', esc(msg || '該当する統計データがありません')); }
  var METRICS = {
    count: { label: '人数', f: function (v) { return fmt(Math.round(v)) + '人'; } },
    ratio: { label: '地域の人口に占める割合', f: function (v) { return v.toFixed(2) + '%'; } },
    share: { label: '構成比', f: function (v) { return v.toFixed(1) + '%'; } },
    diff1: { label: '1年間の増減（人数）', f: function (v) { return signed(v) + '人'; }, back: 1 },
    rate1: { label: '1年間の増加率', f: function (v) { return signed(v, 1) + '%'; }, back: 1, rate: true },
    diff5: { label: '5年間の増減（人数）', f: function (v) { return signed(v) + '人'; }, back: 5 },
    rate5: { label: '5年間の増加率', f: function (v) { return signed(v, 1) + '%'; }, back: 5, rate: true },
    diff10: { label: '10年間の増減（人数）', f: function (v) { return signed(v) + '人'; }, back: 10 },
    rate10: { label: '10年間の増加率', f: function (v) { return signed(v, 1) + '%'; }, back: 10, rate: true }
  };
  var HELP = {
    count: '選んだ時点に住んでいた人の数（中長期在留者と特別永住者。2011年までは外国人登録をした人）。',
    ratio: '在留外国人の数 ÷ その地域の人口（日本人と外国人の合計）。人口は翌年1月1日の住民基本台帳の数で、2013年12月末から計算できます。',
    share: '国籍・在留資格を選んだときは、その地域の外国人のうち選んだ人の割合。選んでいないときは、全国の外国人のうちその地域に住む人の割合。',
    diff1: '1年前の同じ月末からの増え方・減り方（人数）。', rate1: '1年前の同じ月末から何％増えたか（減ったときはマイナス）。',
    diff5: '5年前の同じ月末からの増減（人数）。', rate5: '5年前の同じ月末から何％増えたか。',
    diff10: '10年前の同じ月末からの増減（人数）。', rate10: '10年前の同じ月末から何％増えたか。'
  };

  // ---------- 選んだ条件（アドレスの # のあとに残す）
  var DEF = { v: 'map', pref: '', muni: '', nat: [], visa: [], when: '', metric: 'count', cmp: 'nat', areas: [], from: '', to: '', idx: '0', rt: '', rm: 'count', all: '0', mn: '0' };
  var LISTS = { nat: 1, visa: 1, areas: 1 };
  var S = {};
  function readHash() {
    var q = new URLSearchParams(location.hash.slice(1));
    Object.keys(DEF).forEach(function (k) {
      var v = q.get(k);
      S[k] = LISTS[k] ? (v ? v.split(',').filter(Boolean) : []) : (v == null ? DEF[k] : v);
    });
  }
  // 見方（v）や地域（pref・muni）が変わったときは、ブラウザの「戻る」で前の画面に戻れるように、履歴を1つ足す
  var pushNext = false, shownHash = null;
  function writeHash() {
    var q = new URLSearchParams();
    Object.keys(DEF).forEach(function (k) {
      var v = LISTS[k] ? S[k].join(',') : S[k];
      if (v !== (LISTS[k] ? '' : DEF[k]) && v !== '') { q.set(k, v); }
    });
    var h = '#' + q.toString();
    if (location.hash !== h && !(h === '#' && !location.hash)) { (pushNext ? history.pushState : history.replaceState).call(history, null, '', h === '#' ? location.pathname : h); }
    pushNext = false; shownHash = location.hash;
  }
  function isDefault() { return Object.keys(DEF).every(function (k) { return k === 'v' || (LISTS[k] ? !S[k].length : S[k] === DEF[k]); }); }
  function kana(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }).replace(/\s+/g, ''); }

  // ---------- 地域
  function area() {
    if (S.muni && MUNI[S.muni]) { return { type: 'muni', pref: MUNI[S.muni].pref, key: S.muni, name: MUNI[S.muni].pref + MUNI[S.muni].name }; }
    if (S.pref && PREF_ROMA[S.pref]) { return { type: 'pref', pref: S.pref, key: S.pref, name: S.pref }; }
    return { type: 'japan', key: '', name: '全国' };
  }
  function areaFromKey(k) {
    if (k.indexOf('m:') === 0 && MUNI[k.slice(2)]) { var m = MUNI[k.slice(2)]; return { type: 'muni', pref: m.pref, key: k.slice(2), name: m.pref + m.name }; }
    if (k.indexOf('p:') === 0 && PREF_ROMA[k.slice(2)]) { return { type: 'pref', pref: k.slice(2), key: k.slice(2), name: k.slice(2) }; }
    return { type: 'japan', key: '', name: '全国' };
  }
  function keyOfArea(a) { return a.type === 'muni' ? 'm:' + a.key : a.type === 'pref' ? 'p:' + a.pref : 'jp'; }
  function periodsOf(a) { return a.type === 'muni' ? M.MP : M.P; }
  function pageOf(a) {
    if (a.type === 'muni') { return encodeURI(MUNI[a.key].link); }
    if (a.type === 'pref') { return 'pref-' + PREF_ROMA[a.pref] + '.html'; }
    return 'index.html';
  }

  // ---------- 数の取り出し
  // 名前が変わった在留資格は今の名前にまとめる（例：2014年までの「投資・経営」→「経営・管理」）
  function rawVisas(v) { var out = [v]; Object.keys(M.renames).forEach(function (r) { if (M.renames[r] === v) { out.push(r); } }); return out; }
  // 国の表には0人の行がない。全国の表にその区分がある時点で、県の表にないときは0人。全国の表にもない時点（区分がなかった・まとめて数えていた）はデータなし
  function fillBy(a, ref) { return ref.map(function (r, i) { var v = a ? a[i] : null; return v != null ? v : (r != null ? 0 : null); }); }
  function nullsOf(n) { var o = []; for (var i = 0; i < n; i++) { o.push(null); } return o; }
  function sumAll(list, n) { // どれか1つでもデータがない時点は、合計もデータなし
    var out = [];
    for (var i = 0; i < n; i++) {
      var s = 0, ok = true;
      for (var j = 0; j < list.length; j++) { if (list[j][i] == null) { ok = false; break; } s += list[j][i]; }
      out.push(ok ? s : null);
    }
    return out;
  }
  function sumAny(list, n) { // 名前が変わった在留資格（どちらかの時点にだけある）
    var out = [];
    for (var i = 0; i < n; i++) {
      var s = 0, any = false;
      list.forEach(function (a) { if (a && a[i] != null) { s += a[i]; any = true; } });
      out.push(any ? s : null);
    }
    return out;
  }
  function visaSeries(table, v, n) { var raws = rawVisas(v).map(function (r) { return table[r]; }).filter(Boolean); return raws.length ? sumAny(raws, n) : nullsOf(n); }
  function natSeries(table, x, n) { return table[x] ? table[x].slice() : nullsOf(n); }
  function muniEntry(roma, key) { return load('muni/' + roma + '.json').then(function (f) { return f[key] || { n: {}, v: {} }; }); }
  // その時点の全国の表（japan.json：j）に、その国籍・在留資格の区分があるか。ない時点（区分がなかった・「韓国・朝鮮」のようにまとめて数えていた）は
  // 地域の数もデータなし。ある時点で地域の表にないときは0人
  function natAt(j, x, w) { var i = M.P.indexOf(w), s = j.n[x]; return i >= 0 && !!s && s[i] != null; }
  function visaAt(j, v, w) { var i = M.P.indexOf(w); return i >= 0 && rawVisas(v).some(function (r) { return !!j.v[r] && j.v[r][i] != null; }); }
  function allAt(j, nats, visas, w) { return nats.every(function (x) { return natAt(j, x, w); }) && visas.every(function (v) { return visaAt(j, v, w); }); }
  function missingAt(j, dim, names, w) { return names.filter(function (x) { return dim === 'nat' ? !visaAt(j, x, w) : !natAt(j, x, w); }); } // 絞り込み（dim の反対側）のうち、その時点の表にない名前
  function missingWhy(miss) { return 'この時点の国の表には「' + miss.join('」「') + '」の区分がありません（区分がなかったか、ほかとまとめて数えていました）'; }
  function anyAt(table, i) { return Object.keys(table || {}).some(function (k) { return table[k][i] != null; }); } // その時点の数が1つでもあるか
  // 「データなし」の理由（線を押したときと、グラフの下の一覧に出す）
  var WHY = {
    natOld: '国籍別の数は1984年からです', visaOld: '在留資格別の数は1992年からです（それより前は区分が今と違います）',
    xOld: '国籍×在留資格の数は2006年末からです', pxOld: '都道府県の国籍×在留資格の数は2016年12月末からです（2020年までは12月末だけ）',
    mxOld: '市区町村の国籍×在留資格の数は2023年12月末からです', muniVisaOld: '市区町村の在留資格別の数は2019年12月末からです',
    muniNone: 'この時点の国の表に、この市区町村はのっていません（外国人の少ない町村など）', muniTown: '2011年までの国の表は市と区だけです（町村はのっていません）',
    muniNoNat: 'この時点の国籍別の表に、この市区町村はのっていません', muniNoVisa: 'この時点の在留資格別の表に、この市区町村はのっていません（外国人の少ない町村）',
    okinawa: '1972年5月まで沖縄は日本の施政下になかったため、国の表にありません'
  };
  function natWhy(x, w) {
    if (w < M.oldNatFrom) { return WHY.natOld; }
    if ((x === '韓国' || x === '朝鮮') && w < '2015-12') { return '2015年6月末までは「韓国・朝鮮」として1つに数えていました'; }
    if (x === '韓国・朝鮮' && w >= '2015-12') { return '2015年12月末からは「韓国」と「朝鮮」に分けて数えています'; }
    return 'この時点の国の表に、この国籍・地域の行はありません';
  }
  function visaWhy(v, w) { return w < M.oldVisaFrom ? WHY.visaOld : 'この時点の国の表に、この在留資格の区分はありません（区分ができる前など）'; }
  // getSeries の結果に、データのない時点ごとの理由（why）をつける
  function explain(a, nats, visas, s) {
    var need = [load('japan.json')];
    if (a.type === 'muni') { need.push(load('muni-total.json'), muniEntry(PREF_ROMA[a.pref], a.key)); }
    return Promise.all(need).then(function (r) {
      var j = r[0], tot = a.type === 'muni' && r[1][a.key] ? r[1][a.key][1] : null, e = r[2];
      s.why = s.per.map(function (w, i) {
        if (s.val[i] != null || s.hid[i]) { return null; }
        if (a.type === 'muni' && (!tot || tot[i] == null)) { return w < '2012-12' && /[町村]$/.test(a.name) ? WHY.muniTown : WHY.muniNone; }
        if (a.type === 'pref' && a.pref === '沖縄県' && w < '1972-12') { return WHY.okinawa; }
        for (var k = 0; k < nats.length; k++) { if (!natAt(j, nats[k], w)) { return natWhy(nats[k], w); } }
        for (k = 0; k < visas.length; k++) { if (!visaAt(j, visas[k], w)) { return visaWhy(visas[k], w); } }
        if (nats.length && visas.length) { return a.type === 'japan' ? WHY.xOld : a.type === 'pref' ? WHY.pxOld : WHY.mxOld; }
        if (a.type === 'muni' && nats.length) {
          if (!anyAt(e.n, i)) { return WHY.muniNoNat; }
          var out = nats.filter(function (x) { return w < M.fullNatFrom && (M.listed[w] || []).indexOf(x) < 0; });
          if (out.length) { return 'この時点の市区町村の表は主な国籍・地域だけで、「その他」に入っています'; }
        }
        if (a.type === 'muni' && visas.length) { return w < M.muniVisaFrom ? WHY.muniVisaOld : !anyAt(e.v, i) ? WHY.muniNoVisa : null; }
        return null;
      });
      return s;
    });
  }
  function whyList(per, series) { // グラフの下の「データがない時点とその理由」：線ごとに、続く時点をまとめる
    var ul = el('ul', 'dwhy'), n = 0;
    series.forEach(function (s) {
      var run = null;
      function flush() { if (run) { var li = el('li'); li.innerHTML = '<b>' + esc(s.name) + '</b>：' + esc(wl(per[run.a]) + (run.b > run.a ? '〜' + wl(per[run.b]) : '')) + '　' + esc(run.t); ul.appendChild(li); n++; run = null; } }
      per.forEach(function (w, i) {
        var t = s.vals[i] == null ? (s.hid && s.hid[i] ? '公表されていません（外国人が10人以下の市町村）' : (s.why && s.why[i]) || 'データがありません') : null;
        if (run && t === run.t && i === run.b + 1) { run.b = i; return; }
        flush();
        if (t) { run = { a: i, b: i, t: t }; }
      });
      flush();
    });
    return n ? ul : null;
  }
  function crossAt(a, file, nats, visas, j, w) { // 国籍×在留資格の表の1時点分から、選んだ国籍×選んだ在留資格の合計
    if (!allAt(j, nats, visas, w)) { return null; }
    var rec = a.type === 'japan' ? file : a.type === 'pref' ? file[a.pref] : file[a.key];
    if (!rec) { return 0; }
    var vs = []; visas.forEach(function (v) { vs = vs.concat(rawVisas(v)); });
    var s = 0;
    nats.forEach(function (n) { var x = rec[n]; if (x) { vs.forEach(function (v) { s += x[v] || 0; }); } });
    return s;
  }
  // 地域・国籍（いくつか）・在留資格（いくつか）の移り変わり → { per, val, hid（公表されていない時点の番号） }
  function getSeries(a, nats, visas) {
    nats = nats || []; visas = visas || [];
    var per = periodsOf(a), n = per.length, hid = {};
    function res(val) { return { per: per, val: val, hid: hid }; }
    if (a.type === 'japan') {
      if (!nats.length && !visas.length) { return load('japan.json').then(function (j) { return res(j.t.slice()); }); }
      if (!visas.length) { return load('japan.json').then(function (j) { return res(sumAll(nats.map(function (x) { return natSeries(j.n, x, n); }), n)); }); }
      if (!nats.length) { return load('japan.json').then(function (j) { return res(sumAll(visas.map(function (v) { return visaSeries(j.v, v, n); }), n)); }); }
      return Promise.all([load('japan-x.json'), load('japan.json')]).then(function (r) {
        var x = r[0];
        return res(per.map(function (w) {
          var mi = M.MP.indexOf(w);
          if (mi < 0 || !allAt(r[1], nats, visas, w)) { return null; }
          var s = 0;
          nats.forEach(function (nn) { var r = x[nn]; if (r) { visas.forEach(function (v) { rawVisas(v).forEach(function (rv) { if (r[rv] && r[rv][mi] != null) { s += r[rv][mi]; } }); }); } });
          return s;
        }));
      });
    }
    if (a.type === 'pref') {
      if (!nats.length && !visas.length) { return load('prefs.json').then(function (j) { return res(j.t[a.pref].slice()); }); }
      if (!visas.length) {
        return Promise.all([load('pref-nat.json'), load('japan.json')]).then(function (r) {
          var t = r[0][a.pref] || {}; return res(sumAll(nats.map(function (x) { return fillBy(t[x], natSeries(r[1].n, x, n)); }), n));
        });
      }
      if (!nats.length) {
        return Promise.all([load('pref-visa.json'), load('japan.json')]).then(function (r) {
          var t = r[0][a.pref] || {}; return res(sumAll(visas.map(function (v) { return fillBy(visaSeries(t, v, n), visaSeries(r[1].v, v, n)); }), n));
        });
      }
      return Promise.all([load('japan.json')].concat(M.pxPeriods.map(function (w) { return load('px/' + w + '.json'); }))).then(function (files) {
        var j = files.shift();
        return res(per.map(function (w) { var k = M.pxPeriods.indexOf(w); return k < 0 ? null : crossAt(a, files[k], nats, visas, j, w); }));
      });
    }
    // 市区町村
    var roma = PREF_ROMA[a.pref];
    return Promise.all([load('muni-total.json'), muniEntry(roma, a.key), load('japan.json')]).then(function (r) {
      var tot = r[0][a.key] ? r[0][a.key][1] : per.map(function () { return null; }), e = r[1], j = r[2];
      (e.h || []).forEach(function (i) { hid[i] = 1; });
      if (!nats.length && !visas.length) { return res(tot.slice()); }
      if (nats.length && visas.length) {
        return Promise.all(M.mxPeriods.map(function (w) { return load('mx/' + roma + '-' + w + '.json'); })).then(function (files) {
          return res(per.map(function (w, i) { var k = M.mxPeriods.indexOf(w); return k < 0 || tot[i] == null || hid[i] ? null : crossAt(a, files[k], nats, visas, j, w); }));
        });
      }
      // 国籍別・在留資格別の数が1つもない時点（その表にこの市区町村がのっていない）はデータなし。0人にしない
      if (nats.length) {
        return res(sumAll(nats.map(function (x) {
          var s = e.n[x];
          return per.map(function (w, i) {
            if (tot[i] == null || hid[i] || !natAt(j, x, w) || !anyAt(e.n, i)) { return null; }
            if (w < M.fullNatFrom && (M.listed[w] || []).indexOf(x) < 0) { return null; } // その時点の表にない国籍
            return s && s[i] != null ? s[i] : 0;
          });
        }), n));
      }
      return res(sumAll(visas.map(function (v) {
        var raws = rawVisas(v).map(function (rv) { return e.v[rv]; });
        return per.map(function (w, i) {
          if (tot[i] == null || hid[i] || w < M.muniVisaFrom || !visaAt(j, v, w) || !anyAt(e.v, i)) { return null; }
          var s = 0; raws.forEach(function (x) { if (x && x[i] != null) { s += x[i]; } });
          return s;
        });
      }), n));
    });
  }
  function getPop(a) {
    if (a.type === 'japan') { return load('japan.json').then(function (j) { return j.pop; }); }
    if (a.type === 'pref') { return load('prefs.json').then(function (j) { return j.pop[a.pref]; }); }
    return load('muni-total.json').then(function (j) { return j[a.key] ? j[a.key][2] : M.MP.map(function () { return null; }); });
  }
  // ある時点の内わけ（dim：'nat' か 'visa'）。filter はもう一方の絞り込み → { items: [[名前, 人数]], total, why }
  function getBreakdown(a, dim, when, filter) {
    filter = filter || [];
    var per = periodsOf(a), i = per.indexOf(when);
    function out(obj, total) {
      var items = Object.keys(obj).map(function (k) { return [k, obj[k]]; }).filter(function (x) { return x[1] > 0; }).sort(function (x, y) { return y[1] - x[1]; });
      return { items: items, total: total == null ? items.reduce(function (s, x) { return s + x[1]; }, 0) : total };
    }
    function pick(table, from) { var o = {}; if (when < from) { return null; } Object.keys(table || {}).forEach(function (k) { var v = table[k][i]; if (v != null) { o[k] = v; } }); return o; }
    function cross(rec) { // rec：国籍 → {在留資格: 人数}
      var o = {}, fs = []; filter.forEach(function (f) { fs = fs.concat(dim === 'nat' ? rawVisas(f) : [f]); });
      Object.keys(rec || {}).forEach(function (nat) {
        Object.keys(rec[nat]).forEach(function (vis) {
          if (dim === 'nat' && fs.indexOf(vis) >= 0) { o[nat] = (o[nat] || 0) + rec[nat][vis]; }
          if (dim === 'visa' && fs.indexOf(nat) >= 0) { o[vis] = (o[vis] || 0) + rec[nat][vis]; }
        });
      });
      return o;
    }
    if (i < 0) { return Promise.resolve({ items: [], total: null, why: 'この地域にはこの時点の統計データがありません' }); }
    if (a.type === 'japan') {
      if (!filter.length) {
        return load('japan.json').then(function (j) {
          var o = pick(dim === 'nat' ? j.n : j.v, dim === 'nat' ? M.oldNatFrom : M.oldVisaFrom);
          return o ? out(o, j.t[i]) : { items: [], total: j.t[i], why: dim === 'nat' ? '国籍別の数は1984年からです' : '在留資格別の数は1992年からです（それより前は区分が今と違います）' };
        });
      }
      var mi = M.MP.indexOf(when);
      if (mi < 0) { return Promise.resolve({ items: [], total: null, why: '国籍×在留資格の数は2006年末からです' }); }
      return Promise.all([load('japan-x.json'), load('japan.json')]).then(function (r) {
        var x = r[0], miss = missingAt(r[1], dim, filter, when);
        if (miss.length) { return { items: [], total: null, why: missingWhy(miss) }; }
        var rec = {}; Object.keys(x).forEach(function (n) { rec[n] = {}; Object.keys(x[n]).forEach(function (v) { if (x[n][v][mi]) { rec[n][v] = x[n][v][mi]; } }); });
        return out(cross(rec));
      });
    }
    if (a.type === 'pref') {
      if (!filter.length) {
        return Promise.all([load(dim === 'nat' ? 'pref-nat.json' : 'pref-visa.json'), load('prefs.json')]).then(function (r) {
          var o = pick(r[0][a.pref], dim === 'nat' ? M.oldNatFrom : M.oldVisaFrom);
          return o ? out(o, r[1].t[a.pref][i]) : { items: [], total: r[1].t[a.pref][i], why: dim === 'nat' ? '国籍別の数は1984年からです' : '在留資格別の数は1992年からです' };
        });
      }
      if (M.pxPeriods.indexOf(when) < 0) { return Promise.resolve({ items: [], total: null, why: '都道府県の国籍×在留資格の数は2016年12月末からです（2020年までは12月末だけ）' }); }
      return Promise.all([load('px/' + when + '.json'), load('japan.json')]).then(function (r) {
        var miss = missingAt(r[1], dim, filter, when);
        return miss.length ? { items: [], total: null, why: missingWhy(miss) } : out(cross(r[0][a.pref]));
      });
    }
    var roma = PREF_ROMA[a.pref];
    return Promise.all([load('muni-total.json'), muniEntry(roma, a.key), load('japan.json')]).then(function (r) {
      var tot = r[0][a.key] ? r[0][a.key][1][i] : null, e = r[1];
      if (tot == null) { return { items: [], total: null, why: 'この市区町村のこの時点の数は国の表にありません' }; }
      if ((e.h || []).indexOf(i) >= 0) { return { items: [], total: tot, why: '外国人が10人以下のため、国籍・在留資格は公表されていません' }; }
      if (!filter.length) {
        if (dim === 'visa' && when < M.muniVisaFrom) { return { items: [], total: tot, why: '市区町村の在留資格別の数は2019年12月末からです' }; }
        var o = pick(dim === 'nat' ? e.n : e.v, '0000');
        if (!Object.keys(o).length) { // 総数はあるが、国籍別・在留資格別の表にこの市区町村がのっていない（0人ではない）
          return { items: [], total: tot, why: 'この時点の' + (dim === 'nat' ? '国籍' : '在留資格') + '別の表に、この市区町村はのっていません（外国人の少ない市町村は、国が表にのせていない時点があります）' };
        }
        var res = out(o, tot);
        if (dim === 'nat' && when < M.fullNatFrom) { res.partial = '2023年6月末までの市区町村の表は、主な国籍・地域と「その他」だけです'; }
        return res;
      }
      if (M.mxPeriods.indexOf(when) < 0) { return { items: [], total: null, why: '市区町村の国籍×在留資格の数は2023年12月末からです' }; }
      var miss = missingAt(r[2], dim, filter, when);
      if (miss.length) { return { items: [], total: null, why: missingWhy(miss) }; }
      return load('mx/' + roma + '-' + when + '.json').then(function (f) { return out(cross(f[a.key])); });
    });
  }
  // ある時点の国籍×在留資格の組み合わせごとの数 → { items: [[国籍, 在留資格, 人数]], total, why }
  // 名前が変わった在留資格は今の名前にまとめる。nats・visas を選んだときは、その国籍・在留資格の組み合わせだけ
  function getCombos(a, when, nats, visas) {
    var per = periodsOf(a), i = per.indexOf(when);
    function out(rec, total) { // rec：国籍 → {在留資格: 人数}
      var o = {};
      Object.keys(rec || {}).forEach(function (n) {
        if (nats.length && nats.indexOf(n) < 0) { return; }
        Object.keys(rec[n]).forEach(function (rv) {
          var v = M.renames[rv] || rv;
          if ((visas.length && visas.indexOf(v) < 0) || !rec[n][rv]) { return; }
          var k = n + '\t' + v; o[k] = (o[k] || 0) + rec[n][rv];
        });
      });
      var items = Object.keys(o).map(function (k) { var p = k.split('\t'); return [p[0], p[1], o[k]]; }).sort(function (x, y) { return y[2] - x[2]; });
      return { items: items, total: nats.length || visas.length || total == null ? items.reduce(function (s, x) { return s + x[2]; }, 0) : total };
    }
    if (i < 0) { return Promise.resolve({ items: [], why: 'この地域にはこの時点の統計データがありません' }); }
    if (a.type === 'japan') {
      var mi = M.MP.indexOf(when);
      if (mi < 0) { return Promise.resolve({ items: [], why: '国籍×在留資格の数は2006年末からです' }); }
      return Promise.all([load('japan-x.json'), load('japan.json')]).then(function (r) {
        var x = r[0], rec = {};
        Object.keys(x).forEach(function (n) { rec[n] = {}; Object.keys(x[n]).forEach(function (v) { if (x[n][v][mi]) { rec[n][v] = x[n][v][mi]; } }); });
        return out(rec, r[1].t[i]);
      });
    }
    if (a.type === 'pref') {
      if (M.pxPeriods.indexOf(when) < 0) { return Promise.resolve({ items: [], why: '都道府県の国籍×在留資格の数は2016年12月末からです（2020年までは12月末だけ）' }); }
      return Promise.all([load('px/' + when + '.json'), load('prefs.json')]).then(function (r) { return out(r[0][a.pref], r[1].t[a.pref][i]); });
    }
    var roma = PREF_ROMA[a.pref];
    return Promise.all([load('muni-total.json'), muniEntry(roma, a.key)]).then(function (r) {
      var tot = r[0][a.key] ? r[0][a.key][1][i] : null;
      if (tot == null) { return { items: [], why: 'この市区町村のこの時点の数は国の表にありません' }; }
      if ((r[1].h || []).indexOf(i) >= 0) { return { items: [], why: '外国人が10人以下のため、国籍・在留資格は公表されていません' }; }
      if (M.mxPeriods.indexOf(when) < 0) { return { items: [], why: '市区町村の国籍×在留資格の数は2023年12月末からです' }; }
      return load('mx/' + roma + '-' + when + '.json').then(function (f) { return out(f[a.key], tot); });
    });
  }
  function backIndex(per, i, years) { var w = per[i]; return per.indexOf((+w.slice(0, 4) - years) + w.slice(4)); }
  // 指標の値（s：その人の数、tot：その地域の外国人の数、pop：人口、jp：全国の数）
  function metricAt(m, s, i, ctx) {
    var v = s.val[i];
    if (v == null || s.hid[i]) { return null; }
    var md = METRICS[m];
    if (m === 'count') { return v; }
    if (m === 'ratio') { var p = ctx.pop && ctx.pop[i]; return p ? v / p * 100 : null; }
    if (m === 'share') {
      var base = ctx.filtered ? (ctx.tot && ctx.tot.val[i]) : (ctx.jp && ctx.jp.val[ctx.jp.per.indexOf(s.per[i])]);
      return base ? v / base * 100 : null;
    }
    var j = backIndex(s.per, i, md.back);
    if (j < 0 || s.val[j] == null || s.hid[j]) { return null; }
    if (md.rate) { return s.val[j] ? (v - s.val[j]) / s.val[j] * 100 : null; }
    return v - s.val[j];
  }

  // ---------- 絞り込みの部品
  function selectEl(options, value, onChange, label) {
    var s = el('select');
    options.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; if (o[2]) { op.disabled = true; } s.appendChild(op); });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    if (label) { var l = el('label', 'dctl'); l.appendChild(el('span', 'dlab', esc(label))); l.appendChild(s); return l; }
    return s;
  }
  var openPanel = null;
  function fitPanel(p) { // 開いた欄が画面の右からはみ出すときは、そのぶん左へずらす（スマホで右の列の欄を開いたとき）
    p.style.left = '';
    var r = p.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    if (r.right > vw - 8) { p.style.left = Math.round(vw - 8 - r.right) + 'px'; }
  }
  document.addEventListener('click', function (ev) { if (openPanel && !openPanel.contains(ev.target)) { openPanel.classList.remove('open'); openPanel = null; } });
  // 地域区分の選ぶ欄（州ごとにまとめる。州そのものも選べる）
  function regionSelect(tree, first) {
    var s = el('select'); s.appendChild(new Option(first, ''));
    tree.forEach(function (g) {
      var og = document.createElement('optgroup'); og.label = g[0];
      og.appendChild(new Option(g[0] + '（すべて）', g[0]));
      g[1].forEach(function (x) { if (x !== g[0]) { og.appendChild(new Option(x, x)); } });
      s.appendChild(og);
    });
    return s;
  }
  // いくつか選ぶ欄。reg（{map: 名前 → [州, 地域区分], tree}）があれば、まず地域区分で絞れて、一覧は地域区分ごとの見出しつき
  function multiPick(label, all, selected, onChange, reg) {
    var wrap = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel');
    btn.type = 'button';
    wrap.appendChild(el('span', 'dlab', esc(label)));
    btn.textContent = selected.length ? (selected.length === 1 ? selected[0] : selected[0] + ' ほか' + (selected.length - 1)) : 'すべて';
    if (selected.length) { btn.classList.add('on'); }
    btn.setAttribute('aria-haspopup', 'listbox');
    var q = el('input'); q.type = 'search'; q.placeholder = '名前で探す'; q.setAttribute('aria-label', label + 'を名前で探す');
    var list = el('div', 'dmlist'), chosen = selected.slice(), rs = null, rv = '';
    if (reg) {
      rs = regionSelect(reg.tree, '地域区分：すべて'); rs.setAttribute('aria-label', '地域区分で絞る');
      rs.addEventListener('change', function () { rv = rs.value; draw(); });
    }
    function item(n) {
      var l = el('label', 'dmitem'), c = el('input'); c.type = 'checkbox'; c.checked = chosen.indexOf(n) >= 0;
      c.addEventListener('change', function () { if (c.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } });
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + n));
      if (reg && reg.old && reg.old[n]) { l.appendChild(el('span', 'sub', '（' + esc(reg.old[n]) + '）')); }
      list.appendChild(l);
    }
    function draw() {
      list.innerHTML = '';
      var tk = kana(q.value.trim());
      var hits = all.filter(function (n) { return (!tk || kana(n).indexOf(tk) >= 0) && (!rv || (reg.map[n] || []).indexOf(rv) >= 0); });
      if (!hits.length) { list.appendChild(el('p', 'dhelp', '合うものがありません。')); return; }
      if (!reg) { hits.slice(0, 300).forEach(item); return; }
      var by = {}, stOf = {};
      hits.forEach(function (n) { var r = reg.map[n] || ['その他', 'その他']; (by[r[1]] = by[r[1]] || []).push(n); stOf[r[1]] = r[0]; });
      var order = []; reg.tree.forEach(function (g) { g[1].forEach(function (x) { order.push(x); }); });
      order.concat(['その他']).forEach(function (sub) {
        if (!by[sub]) { return; }
        list.appendChild(el('div', 'dmhead', esc(sub) + (stOf[sub] !== sub ? '（' + esc(stOf[sub]) + '）' : '') + '　' + by[sub].length));
        by[sub].forEach(item);
      });
    }
    q.addEventListener('input', draw);
    panel.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { wrap.classList.remove('open'); openPanel = null; btn.focus(); } });
    var ok = el('button', 'dbtn', 'この条件で表示'), clr = el('button', 'dbtn dbtn-sub', '選ぶのをやめる（すべて）');
    ok.type = clr.type = 'button';
    ok.addEventListener('click', function () { wrap.classList.remove('open'); openPanel = null; onChange(chosen); });
    clr.addEventListener('click', function () { wrap.classList.remove('open'); openPanel = null; onChange([]); });
    var bar = el('div', 'dmbar'); bar.appendChild(ok); bar.appendChild(clr);
    if (rs) { var rl = el('label', 'dctl dmreg'); rl.appendChild(el('span', 'dlab', 'まず地域区分で絞る（アジア・南アジアなど）')); rl.appendChild(rs); panel.appendChild(rl); }
    panel.appendChild(q); panel.appendChild(list); panel.appendChild(bar);
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (openPanel && openPanel !== wrap) { openPanel.classList.remove('open'); }
      wrap.classList.toggle('open'); openPanel = wrap.classList.contains('open') ? wrap : null;
      if (openPanel) { chosen = selected.slice(); draw(); fitPanel(panel); (rs || q).focus(); }
    });
    wrap.appendChild(btn); wrap.appendChild(panel);
    return wrap;
  }
  function natList() { return M.nats; }
  function visaList() { return M.visas.filter(function (v) { return !M.renames[v]; }); }
  function munisOf(pref) { return (M.munis[PREF_ROMA[pref]] || []).map(function (r) { return MUNI[r[0]]; }); }
  var justChanged = false;
  function setS(patch) {
    if (['v', 'pref', 'muni'].some(function (k) { return k in patch && patch[k] !== S[k]; })) { pushNext = true; }
    Object.keys(patch).forEach(function (k) { S[k] = patch[k]; });
    justChanged = true; render();
  }
  // 地域：名前で探して1つ選ぶ（全国・47都道府県・市区町村。選んだ都道府県の市区町村は、探さなくても並ぶ）
  function areaPick() {
    var a = area(), wrap = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn' + (a.type !== 'japan' ? ' on' : '')), panel = el('div', 'dmpanel');
    btn.type = 'button'; btn.textContent = a.type === 'muni' ? MUNI[a.key].pref + ' ' + MUNI[a.key].name : a.name;
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    wrap.appendChild(el('span', 'dlab', '地域'));
    btn.title = '全国・都道府県・市区町村から選びます（名前で探せます）';
    var q = el('input'); q.type = 'search'; q.placeholder = '名前で探す（例：新宿、浜松）'; q.setAttribute('aria-label', '地域を名前で探す');
    var list = el('div', 'dmlist'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '地域');
    function close() { wrap.classList.remove('open'); openPanel = null; btn.setAttribute('aria-expanded', 'false'); }
    function item(label, sub, patch, selected) {
      var b = el('button', 'dmitem'); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', selected ? 'true' : 'false');
      b.appendChild(el('span', null, esc(label))); if (sub) { b.appendChild(el('span', 'sub', esc(sub))); }
      b.addEventListener('click', function () { close(); setS(patch); });
      return b;
    }
    function kindText(m) { return m.kind === '政令市' ? '市全体' : m.kind === '区' ? '区' : ''; }
    function draw() {
      list.innerHTML = '';
      var t = kana(q.value);
      if (!t) {
        list.appendChild(item('全国', '', { pref: '', muni: '' }, a.type === 'japan'));
        if (S.pref) {
          list.appendChild(el('div', 'dmhead', esc(S.pref + 'の市区町村')));
          list.appendChild(item(S.pref + '（全体）', '', { pref: S.pref, muni: '' }, a.type === 'pref'));
          munisOf(S.pref).forEach(function (m) { list.appendChild(item(m.name, kindText(m), { pref: S.pref, muni: m.key }, S.muni === m.key)); });
        }
        list.appendChild(el('div', 'dmhead', '都道府県'));
        M.prefs.forEach(function (p) { list.appendChild(item(p[0], '', { pref: p[0], muni: '' }, a.type === 'pref' && S.pref === p[0])); });
        return;
      }
      var n = 0;
      M.prefs.forEach(function (p) { if (kana(p[0]).indexOf(t) >= 0) { n++; list.appendChild(item(p[0], '都道府県', { pref: p[0], muni: '' }, a.type === 'pref' && S.pref === p[0])); } });
      Object.keys(MUNI).some(function (k) {
        var m = MUNI[k];
        if (kana(m.name).indexOf(t) >= 0) { n++; list.appendChild(item(m.name, m.pref + (kindText(m) ? '・' + kindText(m) : ''), { pref: m.pref, muni: k }, S.muni === k)); }
        return n >= 80;
      });
      if (!n) { list.appendChild(el('p', 'dhelp', '合う名前がありません。漢字で、名前の一部を入れてください。')); }
    }
    q.addEventListener('input', draw);
    panel.appendChild(q); panel.appendChild(list);
    panel.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { close(); btn.focus(); } });
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (openPanel && openPanel !== wrap) { openPanel.classList.remove('open'); }
      wrap.classList.toggle('open'); openPanel = wrap.classList.contains('open') ? wrap : null;
      btn.setAttribute('aria-expanded', openPanel ? 'true' : 'false');
      if (openPanel) { q.value = ''; draw(); fitPanel(panel); q.focus(); }
    });
    wrap.appendChild(btn); wrap.appendChild(panel);
    return wrap;
  }

  function filterBar() {
    var f = el('div', 'dfilter');
    var a = area();
    f.appendChild(areaPick());
    var old = Array.isArray(M.natOld) ? {} : (M.natOld || {});  // 国籍・地域 → 印（「今はない国。1990年の表まで」など）
    f.appendChild(multiPick('国籍・地域', natList(), S.nat, function (v) { setS({ nat: v }); }, M.natRegion ? { map: M.natRegion, tree: M.regions, old: old } : null));
    f.appendChild(multiPick('在留資格', visaList(), S.visa, function (v) { setS({ visa: v }); }));
    var per = periodsOf(a).slice().reverse();
    f.appendChild(selectEl(per.map(function (w) { return [w, wl(w)]; }), whenOf(a), function (v) { setS({ when: v }); }, '時点'));
    var acts = el('div', 'dctl dacts');
    var reset = el('button', 'dbtn dbtn-sub', 'リセット'); reset.type = 'button';
    reset.disabled = isDefault(); reset.title = reset.disabled ? '選んでいる条件はありません' : '地域・国籍・在留資格・時点などを、はじめの状態に戻します';
    reset.addEventListener('click', function () { var v = S.v; readHashFrom(''); S.v = v; pushNext = true; justChanged = true; render(); });
    var share = el('button', 'dbtn dbtn-sub', 'URLコピー'); share.type = 'button';
    share.title = 'いまの条件の入ったこのページの URL（アドレス）をコピーします。送ると同じ画面を見てもらえます';
    share.addEventListener('click', function () {
      writeHash();
      var done = function () { share.textContent = 'コピーしました'; setTimeout(function () { share.textContent = 'URLコピー'; }, 1600); };
      if (navigator.clipboard) { navigator.clipboard.writeText(location.href).then(done, function () { prompt('この URL をコピーしてください', location.href); }); } else { prompt('この URL をコピーしてください', location.href); }
    });
    acts.appendChild(reset); acts.appendChild(share);
    f.appendChild(acts);
    return f;
  }
  // いま表示している条件（選んだ結果が画面に出たことがわかるように）。止めておく絞り込みの欄の外（すぐ下）に出して、欄を低くする
  function nowLine() {
    var a = area(), now = el('p', 'dnow');
    now.innerHTML = '表示中：地域 <b>' + esc(a.type === 'muni' ? MUNI[a.key].pref + ' ' + MUNI[a.key].name : a.name) + '</b>　国籍・地域 <b>' + esc(S.nat.length ? S.nat.join('・') : 'すべて') +
      '</b>　在留資格 <b>' + esc(S.visa.length ? S.visa.join('・') : 'すべて') + '</b>　時点 <b>' + esc(wl(whenOf(a))) + '</b>' +
      (justChanged ? '<span class="upd" role="status">✓ 表示を変えました</span>' : '');
    if (justChanged) { setTimeout(function () { var u = now.querySelector('.upd'); if (u) { u.remove(); } }, 2500); justChanged = false; }
    return now;
  }
  function readHashFrom(h) { var keep = location.hash; history.replaceState(null, '', h ? '#' + h : location.pathname); readHash(); if (h) { history.replaceState(null, '', keep); } }
  function whenOf(a) { var per = periodsOf(a); return per.indexOf(S.when) >= 0 ? S.when : per[per.length - 1]; }
  function filtersText() {
    var t = [];
    t.push('国籍・地域：' + (S.nat.length ? S.nat.join('・') : 'すべて'));
    t.push('在留資格：' + (S.visa.length ? S.visa.join('・') : 'すべて'));
    return t.join('　');
  }
  function whoText() { // 「ネパールの人」「留学の人」など
    var w = [];
    if (S.nat.length) { w.push(S.nat.join('・')); }
    if (S.visa.length) { w.push('在留資格「' + S.visa.join('・') + '」'); }
    return w.length ? w.join('・') + 'の人' : '在留外国人';
  }

  // ---------- 表の取り出し（CSV）
  var current = { title: '', head: [], rows: [] };
  function setTable(title, head, rows) { current = { title: title, head: head, rows: rows }; }
  function downloadCSV() {
    var lines = [current.head].concat(current.rows).map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); });
    lines.push(''); lines.push('"' + SRC + 'を加工して作成。' + location.href + '"');
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = (current.title || 'データ').replace(/[\\/:*?"<>|\s]+/g, '_') + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toolBar() {
    var t = el('div', 'dtools');
    var c = el('button', 'dbtn dbtn-sub', 'CSVで保存'); c.type = 'button'; c.addEventListener('click', downloadCSV);
    t.appendChild(c);
    if (window.KZX) { window.KZX.buttons(t, function () { return current; }); }
    return t;
  }
  function card(title, body, note) {
    var c = el('section', 'dcard');
    c.appendChild(el('h2', null, esc(title)));
    if (body) { c.appendChild(body); }
    if (note) { c.appendChild(el('p', 'dsrc', note)); }
    return c;
  }
  function srcNote(when, withPop) {
    return esc(SRC + '（' + wl(when) + '）' + (withPop && M.popDates[when] ? '。' + POPSRC + '（' + M.popDates[when].replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日') + '現在）' : ''));
  }

  // ---------- グラフの部品
  function scaleOf(vals) { // 色の段（増減で減った所があるときは、減った所を青、増えた所をオレンジ）
    var pos = vals.filter(function (v) { return v != null && v > 0; }), neg = vals.filter(function (v) { return v != null && v < 0; }).map(function (v) { return -v; });
    var cp = K.cuts(pos), cn = neg.length ? K.cuts(neg).slice(-2) : [];
    function cls(v) {
      if (v == null) { return 'b-n'; }
      if (v > 0) { return 'b' + K.shade(K.binOf(v, cp), cp); }
      if (v < 0) { return 'd' + Math.min(3, 1 + K.binOf(-v, cn)); }
      return 'b-z';
    }
    return { cls: cls, cp: cp, cn: cn, pos: pos, neg: neg };
  }
  function legendOf(sc, f, hasNull) {
    var lg = el('div', 'map-legend'), items = [];
    function add(c, t) { items.push([c, t]); var s = el('span', 'lg'); s.innerHTML = '<span class="sw ' + c + '"></span>' + esc(t); lg.appendChild(s); }
    if (sc.neg.length) {
      for (var k = sc.cn.length; k >= 0; k--) {
        var hi = k === sc.cn.length ? Math.max.apply(null, sc.neg) : sc.cn[k], lo = k === 0 ? 0 : sc.cn[k - 1];
        add('d' + Math.min(3, 1 + k), '減った ' + f(-lo).replace(/^±/, '') + '〜' + f(-hi));
      }
    }
    for (var i = 0; i <= sc.cp.length; i++) {
      var lo2 = i === 0 ? Math.min.apply(null, sc.pos.concat([Infinity])) : sc.cp[i - 1], hi2 = i < sc.cp.length ? sc.cp[i] : Math.max.apply(null, sc.pos.concat([0]));
      if (sc.pos.length) { add('b' + K.shade(i, sc.cp), f(lo2) + '〜' + f(hi2)); }
    }
    add('b-z', '0');
    if (hasNull) { add('b-n', 'データなし'); }
    lg._items = items;
    return lg;
  }
  function lineChart(per, series, opt) {
    opt = opt || {};
    var box = el('div', 'dline'), hidden = {};
    var xs = per.map(wx), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    function draw() {
      box.innerHTML = '';
      var narrow = box.clientWidth && box.clientWidth < 520;
      var W = 760, H = narrow ? 520 : 340, L = 78, R = 26, T = 30, B = narrow ? 46 : 34;
      var vis = series.filter(function (s) { return !hidden[s.name]; });
      var all = []; vis.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) { all.push(v); } }); });
      if (!all.length) { box.appendChild(nodata()); return; }
      var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all);
      if (opt.index) { lo = Math.min(lo, 0); }
      var span = (hi - lo) || 1, step = niceStep(span / 5), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi * 1.04 / step) * step;
      var X = function (x) { return L + (x1 > x0 ? (x - x0) / (x1 - x0) : 0.5) * (W - L - R); };
      var Y = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };
      var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart lines', role: 'img', 'aria-label': opt.title || '移り変わりの折れ線' });
      for (var v = y0; v <= y1 + 1e-9; v += step) {
        g.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
        var t = svg('text', { class: 'ax', x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' });
        t.textContent = opt.index ? String(Math.round(v)) : (Math.abs(v) >= 10000 ? (v / 10000) + '万' : fmt(v)); g.appendChild(t);
      }
      var span2 = x1 - x0, ystep = span2 > 30 ? 10 : span2 > 12 ? 5 : span2 > 6 ? 2 : 1;
      for (var yr = Math.ceil(x0 / ystep) * ystep; yr <= x1; yr += ystep) { var tx = svg('text', { class: 'ax', x: X(yr + 0.5), y: H - 12, 'text-anchor': 'middle' }); tx.textContent = yr; g.appendChild(tx); }
      var cx = wx('2012-12');
      if (x0 < cx && cx <= x1) {
        g.appendChild(svg('line', { class: 'mark', x1: X(cx - 0.25), x2: X(cx - 0.25), y1: T, y2: H - B }));
        var m1 = svg('text', { class: 'ax mk', x: X(cx - 0.25) - 4, y: T - 10, 'text-anchor': 'end' }); m1.textContent = '←登録外国人統計'; g.appendChild(m1);
        var m2 = svg('text', { class: 'ax mk', x: X(cx - 0.25) + 4, y: T - 10 }); m2.textContent = '在留外国人統計→'; g.appendChild(m2);
      }
      series.forEach(function (s, si) {
        if (hidden[s.name]) { return; }
        var d = '', pen = false;
        s.vals.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(xs[i]).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; });
        g.appendChild(svg('path', { d: d, class: 'ln s-' + s.cls + (s.dash ? ' dash' : '') }));
        s.vals.forEach(function (v, i) { if (v != null && (s.vals[i - 1] == null || s.vals[i + 1] == null || per.length < 24)) { g.appendChild(svg('circle', { cx: X(xs[i]), cy: Y(v), r: 3.5, class: 'pt s-' + s.cls })); } });
      });
      var cross = svg('line', { class: 'cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' }); g.appendChild(cross);
      var hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
      var move = function (ev) {
        var r = g.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, best = 0, bd = 1e9;
        xs.forEach(function (xx, i) { var dd = Math.abs(X(xx) - x); if (dd < bd) { bd = dd; best = i; } });
        cross.setAttribute('x1', X(xs[best])); cross.setAttribute('x2', X(xs[best])); cross.setAttribute('visibility', 'visible');
        var rows = series.filter(function (s) { return !hidden[s.name]; }).map(function (s) { return s; })
          .sort(function (a, b) { return (b.vals[best] || -1e12) - (a.vals[best] || -1e12); });
        K.showTip(ev, '<b>' + esc(wl(per[best])) + '</b>' + rows.map(function (s) {
          var v = s.vals[best];
          return '<br><span class="sw sw-' + s.cls + '"></span> ' + esc(s.name) + '：' + (v == null ? (s.hid && s.hid[best] ? '公表されていない' : 'データなし' + (s.why && s.why[best] ? '<br><span class="tipwhy">（' + esc(s.why[best]) + '）</span>' : '')) : (opt.index ? v.toFixed(1) : (opt.f ? opt.f(v) : fmt(v) + '人')));
        }).join(''));
      };
      hit.addEventListener('pointermove', move); hit.addEventListener('click', move);
      hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); K.hideTip(); });
      g.appendChild(hit);
      box.appendChild(g);
      box.appendChild(el('p', 'hint', '線の上を押すと（マウスを合わせると）、その時点の数が出ます。' + (series.length > 1 ? '下の名前を押すと、その線を消したり出したりできます。' : '') +
        K.vnote(series.map(function (s) { return s.name; }))));
      if (series.length > 1) {
        var lg = el('div', 'lines-legend');
        series.forEach(function (s) {
          var b = el('button', 'lgb' + (hidden[s.name] ? ' off' : '')); b.type = 'button';
          b.setAttribute('aria-pressed', hidden[s.name] ? 'false' : 'true');
          var last = null; for (var i = s.vals.length - 1; i >= 0; i--) { if (s.vals[i] != null) { last = s.vals[i]; break; } }
          b.innerHTML = '<span class="sw sw-' + s.cls + (s.dash ? ' swdash' : '') + '"></span>' + esc(K.vs(s.name)) + (last != null && !opt.index ? ' <span class="sub">' + (opt.f ? opt.f(last) : fmt(last) + '人') + '</span>' : '');
          b.title = hidden[s.name] ? 'この線を出す' : 'この線を消す';
          b.addEventListener('click', function () { hidden[s.name] = !hidden[s.name]; draw(); });
          lg.appendChild(b);
        });
        box.appendChild(lg);
      }
    }
    setTimeout(draw, 0);
    return box;
  }
  function niceStep(v) { var k = Math.pow(10, Math.floor(Math.log10(v || 1))); return [1, 2, 2.5, 5, 10].map(function (m) { return m * k; }).filter(function (x) { return x >= v; })[0]; }
  function topWithOther(items, total, n) {
    var top = items.slice(0, n), rest = (total == null ? items.reduce(function (s, x) { return s + x[1]; }, 0) : total) - top.reduce(function (s, x) { return s + x[1]; }, 0);
    var out = top.map(function (x, i) { return { name: x[0], v: x[1], cls: String(i + 1) }; });
    if (rest > 0) { out.push({ name: 'その他', v: rest, cls: 'o' }); }
    return out;
  }
  function pieChart(parts, total, label) {
    var wrap = el('div', 'pie-wrap'), size = 230, r = 92, w = 42, C = 2 * Math.PI * r; // 輪の外側（r + w/2 = 113）が枠（size/2）からはみ出さない大きさ
    var g = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'pie', role: 'img', 'aria-label': label || '円グラフ' });
    var acc = 0, ul = el('ul', 'legend');
    parts.forEach(function (p) {
      var frac = p.v / total, len = frac * C;
      var c = svg('circle', { cx: size / 2, cy: size / 2, r: r, class: 'slice dring', 'stroke-dasharray': Math.max(0, len - 2) + ' ' + (C - Math.max(0, len - 2)), 'stroke-dashoffset': -acc + C / 4 });
      c.style.stroke = 'var(--c' + (p.cls === 'o' ? 'o' : p.cls) + ')'; c.style.fill = 'none'; c.style.strokeWidth = w;
      var html = '<b>' + esc(p.name) + '</b><br>' + fmt(p.v) + '人（' + (frac * 100).toFixed(1) + '%）';
      c.addEventListener('mousemove', function (ev) { K.showTip(ev, html); }); c.addEventListener('mouseleave', K.hideTip);
      g.appendChild(c); acc += len;
      var li = el('li'); li.innerHTML = '<span class="sw sw-' + p.cls + '"></span><span>' + esc(K.vs(p.name)) + '</span><span class="v">' + fmt(p.v) + '人</span><span class="p">' + (frac * 100).toFixed(1) + '%</span>';
      ul.appendChild(li);
    });
    var t1 = svg('text', { x: size / 2, y: size / 2 - 6, 'text-anchor': 'middle', class: 'pie-c1' }); t1.textContent = '合計'; g.appendChild(t1);
    var t2 = svg('text', { x: size / 2, y: size / 2 + 16, 'text-anchor': 'middle', class: 'pie-c2' }); t2.textContent = fmt(total) + '人'; g.appendChild(t2);
    wrap.appendChild(g); wrap.appendChild(ul);
    return wrap;
  }
  function barList(items, total, opt) { // items：[名前, 値, 補足, リンク, クリック, 値がないときの言葉]
    opt = opt || {};
    var f = opt.f || function (v) { return fmt(v) + '人'; };
    var ul = el('ul', 'hbars dbars'), max = Math.max.apply(null, items.map(function (x) { return Math.abs(x[1] || 0); }).concat([1]));
    function vt(x) { return x[1] == null ? x[5] || 'データなし' : f(x[1]); }
    if (opt.fit) { // 名前と数の欄を、いちばん長いものの幅にそろえる（棒が広くなり、どの行も同じ長さの物差しになる）。補足は押したときの吹き出しへ
      var wide = function (s) { return s.replace(/[^\x00-\x7f]/g, 'xx').length; };
      ul.classList.add('fit');
      ul.style.setProperty('--nmw', Math.min(8, Math.max.apply(null, items.map(function (x) { return K.vs(x[0]).length; }))) + 0.5 + 'em');
      ul.style.setProperty('--vw', Math.max.apply(null, items.map(function (x) { return wide(vt(x)); })) + 0.5 + 'ch');
    }
    items.forEach(function (x, i) {
      var li = el('li'), w = Math.abs(x[1] || 0) / max * 100;
      var nm = esc(K.vs(x[0]));
      var name = x[4] ? '<button type="button" class="dlink">' + nm + '</button>' : x[3] ? '<a href="' + esc(x[3]) + '">' + nm + '</a>' : nm;
      li.innerHTML = (opt.rank ? '<span class="rk">' + (i + 1) + '</span>' : '') + '<span class="nm">' + name + (x[2] && !opt.fit ? ' <span class="sub">' + esc(x[2]) + '</span>' : '') + '</span>' +
        '<span class="track"><span class="fill' + ((x[1] || 0) < 0 ? ' neg' : '') + '" style="width:' + w.toFixed(1) + '%"></span></span><span class="v">' + esc(vt(x)) + '</span>' +
        (total ? '<span class="p">' + ((x[1] || 0) / total * 100).toFixed(1) + '%</span>' : '');
      if (opt.fit && x[2]) { li.title = x[2]; }
      if (opt.rank) { li.classList.add('ranked'); }
      if (opt.mark && x[0] === opt.mark) { li.classList.add('me'); } // 上で選んだ地域
      if (total) { li.classList.add('withp'); }
      if (x[4]) { li.querySelector('.dlink').addEventListener('click', x[4]); }
      ul.appendChild(li);
    });
    return ul;
  }
  function tableEl(head, rows, numericFrom) {
    var wrap = el('div', 'scroll'), t = el('table', 't');
    var h = '<tr>' + head.map(function (c, i) { return '<th' + (i >= numericFrom ? ' class="n"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (r) { h += '<tr>' + r.map(function (c, i) { return '<td' + (i >= numericFrom ? ' class="n"' : '') + '>' + esc(c == null ? '—' : c) + '</td>'; }).join('') + '</tr>'; });
    t.innerHTML = h; wrap.appendChild(t);
    return wrap;
  }
  function details(summary, body) { var d = el('details'); d.appendChild(el('summary', null, esc(summary))); d.appendChild(body); return d; }

  // ---------- 地図
  function drawMap(shape, values, opt) { // values：{鍵: 値}、opt：{f, names, onClick, links, scale（色の段を決める値。ないときは values）}
    var holder = el('div', 'dmap'), sc = scaleOf(opt.scale || Object.keys(values).map(function (k) { return values[k]; }));
    var g = svg('svg', { viewBox: '0 0 ' + shape.w + ' ' + shape.h, class: 'jmap', role: 'img', 'aria-label': opt.title || '地図' });
    (shape.frames || []).forEach(function (f) {
      var b = f.box;
      g.appendChild(svg('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'frame', rx: 6 }));
      var t = svg('text', { x: b[0] + 8, y: b[1] + 20, class: 'frame-lb' }); t.textContent = f.label; g.appendChild(t);
    });
    var parts = shape.prefs || shape.areas, paths = {}, clsOf = {};
    Object.keys(parts).forEach(function (key) {
      var none = key.indexOf('none:') === 0, v = none ? undefined : values[key];
      clsOf[key] = none ? 'b-n' : sc.cls(v === undefined ? null : v);
      var p = svg('path', { d: parts[key], class: 'area ' + clsOf[key] });
      var name = none ? (key.slice(5) || '（統計のない所）') : ((opt.names && opt.names[key]) || key);
      var html = '<b>' + esc(name) + '</b>' + (none ? '' : '<br>' + esc(opt.label || '') + '：' + (v == null ? (opt.why && opt.why[key]) || 'データなし' : opt.f(v)));
      p.addEventListener('mousemove', function (ev) { p.classList.add('hl'); K.showTip(ev, html); });
      p.addEventListener('mouseleave', function () { p.classList.remove('hl'); K.hideTip(); });
      if (!none && opt.onClick) { p.addEventListener('click', function () { K.hideTip(); opt.onClick(key); }); p.setAttribute('tabindex', '0'); p.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { opt.onClick(key); } }); }
      g.appendChild(p); paths[key] = p;
    });
    if (shape.inset && shape.inset_key && paths[shape.inset_key]) {
      var b = shape.inset, r = svg('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'inset', rx: 6 });
      r.addEventListener('click', function () { if (opt.onClick) { opt.onClick(shape.inset_key); } });
      g.insertBefore(r, g.firstChild);
    }
    holder.appendChild(g); // 地図には名前・数を書かない（数は横の一覧と、押したときの吹き出しで見る）
    if (shape.note) { holder.appendChild(el('p', 'note', esc(shape.note))); }
    var lg = legendOf(sc, opt.f, Object.keys(values).some(function (k) { return values[k] == null; }));
    lg.insertBefore(el('span', 'lgh', opt.scale ? '色の見方（どの時点も同じ）：' : '色の見方：'), lg.firstChild);
    holder.appendChild(lg);
    if (opt.hint) { holder.appendChild(el('p', 'hint', esc(opt.hint))); }
    holder._cls = clsOf; holder._legend = lg._items; holder._paths = paths;
    return holder;
  }
  function shortOf(m) {
    return function (v) {
      if (m === 'count') { return v >= 10000 ? (v / 10000).toFixed(1) + '万' : fmt(v); }
      if (m === 'ratio' || m === 'share') { return v.toFixed(m === 'ratio' ? 2 : 1) + '%'; }
      if (METRICS[m].rate) { return signed(v, 1) + '%'; }
      return signed(v);
    };
  }

  // 都道府県・市区町村の、選んだ指標の値をまとめて計算 → [{ key, name, a, s, v }]
  function regionValues(regs, m, when) {
    var filtered = S.nat.length > 0 || S.visa.length > 0;
    var jpP = getSeries({ type: 'japan' }, S.nat, S.visa);
    return Promise.all(regs.map(function (r) {
      return Promise.all([getSeries(r.a, S.nat, S.visa), m === 'ratio' ? getPop(r.a) : null, m === 'share' && filtered ? getSeries(r.a, [], []) : null, m === 'share' && !filtered ? jpP : null]);
    })).then(function (res) {
      return regs.map(function (r, k) {
        var s = res[k][0], i = s.per.indexOf(when), ctx = { pop: res[k][1], tot: res[k][2], jp: res[k][3], filtered: filtered };
        var v = i < 0 ? null : metricAt(m, s, i, ctx);
        var all = s.per.map(function (_, j) { return metricAt(m, s, j, ctx); }); // すべての時点の値（地図の色の段をそろえるため）
        var why = i < 0 ? 'この時点のデータはありません' : s.hid[i] ? '公表されていない（外国人が10人以下）' : null;
        return { key: r.key, name: r.name, a: r.a, s: s, v: v, all: all, why: why, link: r.link };
      });
    });
  }
  function prefRegions() { return M.prefs.map(function (p) { return { key: p[0], name: p[0], a: { type: 'pref', pref: p[0] }, link: 'pref-' + p[1] + '.html' }; }); }
  function muniRegions(pref, withWards) {
    return munisOf(pref).filter(function (m) { return withWards ? m.kind !== '政令市' : m.kind !== '区'; })
      .map(function (m) { return { key: m.key, name: m.name, a: { type: 'muni', pref: pref, key: m.key }, link: m.link }; });
  }

  // ---------- 画面：全国マップ
  var playing = null;
  var autoPlay = /(^#|&)play=1(&|$)/.test(location.hash); // 入口の「地図で見る移り変わり」から来たときは、地図を出してすぐ再生する
  function metricSelect(keys, value, onChange) {
    var l = selectEl(keys.map(function (k) { return [k, METRICS[k].label]; }), value, onChange, '地図の色で示すもの');
    var help = el('p', 'dhelp', esc(HELP[value] || ''));
    var w = el('div', 'dmetric'); w.appendChild(l); w.appendChild(help);
    return w;
  }
  function viewMap(box, alive) {
    var level = S.pref ? 'muni' : 'pref', a = area();
    var per = level === 'pref' ? M.P : M.MP, when = per.indexOf(S.when) >= 0 ? S.when : per[per.length - 1];
    var m = METRICS[S.metric] ? S.metric : 'count';
    if (m === 'ratio' && !M.popDates[when]) { /* 人口のない時点 */ }
    var regs = level === 'pref' ? prefRegions() : muniRegions(S.pref, false);
    var shapeUrl = level === 'pref' ? 'assets/map/japan.json' : 'assets/map/pref-' + PREF_ROMA[S.pref] + '.json';
    return Promise.all([regionValues(regs, m, when), new Promise(function (res) { K.loadShape(shapeUrl, res); })]).then(function (r) {
      if (!alive()) { return; }
      var vals = r[0], shape = r[1], f = METRICS[m].f;
      var out = el('div');
      var title = (level === 'pref' ? '都道府県' : S.pref + 'の市区町村') + 'ごとの' + whoText() + '（' + METRICS[m].label + '、' + wl(when) + '）';
      var body = el('div', 'dmapgrid');
      var ctrl = el('div', 'dmapctl');
      ctrl.appendChild(metricSelect(['count', 'ratio', 'share', 'diff1', 'rate1', 'diff5', 'rate5', 'diff10', 'rate10'], m, function (v) { setS({ metric: v }); }));
      // 時点のスライダーと再生
      var sl = el('div', 'dslider'), rng = el('input'), lab = el('span', 'dwhen', esc(wl(when))), play = el('button', 'dbtn', playing ? '止める' : '▶ 再生');
      rng.type = 'range'; rng.min = 0; rng.max = per.length - 1; rng.value = per.indexOf(when); rng.setAttribute('aria-label', '時点');
      rng.addEventListener('input', function () { lab.textContent = wl(per[+rng.value]); });
      rng.addEventListener('change', function () { stopPlay(); setS({ when: per[+rng.value] }); });
      play.type = 'button';
      play.addEventListener('click', function () {
        if (playing) { stopPlay(); render(); return; }
        var i = per.indexOf(when); if (i >= per.length - 1) { i = -1; }
        playing = setInterval(function () { i++; if (i >= per.length) { stopPlay(); render(); return; } S.when = per[i]; render(); }, 900);
        play.textContent = '止める';
      });
      sl.appendChild(el('span', 'dlab', '時点')); sl.appendChild(rng); sl.appendChild(lab); sl.appendChild(play);
      ctrl.appendChild(sl);
      var mapVals = {}, why = {}, names = {}, scaleVals = [];
      vals.forEach(function (x) {
        var k = level === 'pref' ? x.key : (MUNI[x.key].kind === '政令市' ? x.key : x.key);
        mapVals[k] = x.v; names[k] = x.name; if (x.why) { why[k] = x.why; }
        scaleVals = scaleVals.concat(x.all); // 色の段はすべての時点の値で決める（再生しても色の基準が変わらず、増え方が見える）
      });
      var map = drawMap(shape, mapVals, { f: f, names: names, why: why, label: METRICS[m].label, title: title, scale: scaleVals,
        hint: level === 'pref' ? '▶ 都道府県を押すと、その中の市区町村の地図になります。右の一覧（スマホでは下）の名前を押しても同じです。'
          : '▶ 市区町村を押すと、その市区町村のくわしい数（地域を詳しく）が出ます。',
        onClick: function (key) { stopPlay(); if (level === 'pref') { setS({ pref: key, muni: '' }); } else { setS({ muni: key, v: 'area' }); } } });
      if (level === 'muni' && S.muni && map._paths[S.muni]) { map._paths[S.muni].classList.add('sel'); } // いま選んでいる市区町村
      var side = el('div', 'dside');
      var sorted = vals.slice().sort(function (x, y) { return (y.v == null ? -1e15 : y.v) - (x.v == null ? -1e15 : x.v); });
      side.appendChild(el('h3', null, esc('多い順（' + METRICS[m].label + '）')));
      var ranked = barList(sorted.map(function (x) { // 単位（人）は見出しにあるので、数だけにする
        return [x.name, x.v, x.why || '', null, function () { if (level === 'pref') { setS({ pref: x.key, muni: '' }); } else { setS({ muni: x.key, v: 'area' }); } },
          x.s.hid[x.s.per.indexOf(when)] ? '非公表' : null];
      }), null, { f: function (v) { return f(v).replace(/人$/, ''); }, rank: true, fit: true });
      Array.prototype.forEach.call(ranked.children, function (li, i) { // 一覧の上にマウスを置くと、地図のその場所を囲む
        var p = map._paths[sorted[i].key]; if (!p) { return; }
        li.addEventListener('mouseenter', function () { p.classList.add('hl'); li.classList.add('hl'); });
        li.addEventListener('mouseleave', function () { p.classList.remove('hl'); li.classList.remove('hl'); });
      });
      side.appendChild(ranked);
      body.appendChild(map); body.appendChild(side);
      // いま見ている地域（全国 › 都道府県）。前の段へは、ここかブラウザの「戻る」で
      var nav = el('div', 'dpath');
      nav.appendChild(el('span', 'dlab', 'いま見ている地図：'));
      if (level === 'muni') {
        var back = el('button', null, '全国'); back.type = 'button';
        back.addEventListener('click', function () { setS({ pref: '', muni: '' }); });
        nav.appendChild(back); nav.appendChild(el('span', 'dsep', '›')); nav.appendChild(el('b', null, esc(S.pref + 'の市区町村')));
        var back2 = el('button', 'dbtn dbtn-sub', '← 日本全体の地図へ戻る'); back2.type = 'button'; back2.style.marginLeft = 'auto';
        back2.addEventListener('click', function () { setS({ pref: '', muni: '' }); });
        nav.appendChild(back2);
      } else {
        nav.appendChild(el('b', null, '全国（都道府県ごと）'));
      }
      var c = card(title, null, srcNote(when, m === 'ratio'));
      c.appendChild(ctrl); c.appendChild(nav); c.appendChild(body); c.appendChild(toolBar());
      setTable(title, ['順位', level === 'pref' ? '都道府県' : '市区町村', METRICS[m].label, '時点'], sorted.map(function (x, i) { return [i + 1, x.name, x.v == null ? '' : (m === 'count' ? x.v : x.v.toFixed(2)), wl(when)]; }));
      current.chart = { kind: 'map', shape: shape, values: mapVals, names: names, f: f, short: shortOf(m), sorted: sorted.slice(0, 10).map(function (x) { return [x.name, x.v]; }), metric: METRICS[m].label, when: when, area: level === 'pref' ? '全国' : S.pref, pop: m === 'ratio', cls: map._cls, legend: map._legend, level: level };
      out.appendChild(c);
      box.replaceChildren(out);
      if (autoPlay) { // 地図のカードが見える所まで下げてから再生
        autoPlay = false; play.click();
        var hh = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hdr'), 10) || 56) + (getComputedStyle(filterBox).position === 'sticky' ? filterBox.offsetHeight + 4 : 0); // 上に止まるヘッダーと絞り込みの欄の下
        window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - hh - 8 });
      }
    });
  }
  function stopPlay() { if (playing) { clearInterval(playing); playing = null; } }

  // ---------- 画面：年別の推移
  function topNames(a, dim, n) {
    var per = periodsOf(a);
    return getBreakdown(a, dim, per[per.length - 1], dim === 'nat' ? S.visa : S.nat).then(function (b) {
      return b.items.filter(function (x) { return x[0] !== 'その他'; }).slice(0, n).map(function (x) { return x[0]; });
    });
  }
  function viewTrend(box, alive) {
    var a = area(), cmp = S.cmp;
    var list;
    if (cmp === 'area') {
      var keys = [keyOfArea(a)].concat(S.areas.filter(function (k) { return k !== keyOfArea(a); })).slice(0, MAXCMP);
      list = Promise.resolve(keys.map(function (k) { var x = areaFromKey(k); return { name: x.name, a: x, nats: S.nat, visas: S.visa }; }));
    } else if (cmp === 'nat') {
      list = (S.nat.length ? Promise.resolve(S.nat) : topNames(a, 'nat', SLOTS)).then(function (ns) { return ns.map(function (n) { return { name: n, a: a, nats: [n], visas: S.visa }; }); });
    } else if (cmp === 'visa') {
      list = (S.visa.length ? Promise.resolve(S.visa) : topNames(a, 'visa', SLOTS)).then(function (vs) { return vs.map(function (v) { return { name: v, a: a, nats: S.nat, visas: [v] }; }); });
    } else {
      list = Promise.resolve([{ name: a.name + 'の' + whoText(), a: a, nats: S.nat, visas: S.visa }]);
    }
    return list.then(function (items) {
      return Promise.all(items.map(function (it) { return getSeries(it.a, it.nats, it.visas).then(function (s) { return explain(it.a, it.nats, it.visas, s); }); })).then(function (ss) {
        if (!alive()) { return; }
        // 時点をそろえる（市区町村と都道府県を比べるときは市区町村の時点に）
        var per = ss.reduce(function (p, s) { return s.per.length < p.length ? s.per : p; }, ss.length ? ss[0].per : M.P);
        var first = per.findIndex(function (w) { return ss.some(function (s) { var j = s.per.indexOf(w); return j >= 0 && s.val[j] != null; }); });
        var from = per.indexOf(S.from) >= 0 ? S.from : per[Math.max(0, first)], to = per.indexOf(S.to) >= 0 ? S.to : per[per.length - 1];
        var i0 = per.indexOf(from), i1 = per.indexOf(to); if (i1 < i0) { var t = i0; i0 = i1; i1 = t; }
        var sub = per.slice(i0, i1 + 1), idx = S.idx === '1';
        var series = items.map(function (it, k) {
          var s = ss[k], vals = sub.map(function (w) { var j = s.per.indexOf(w); return j < 0 ? null : s.val[j]; });
          var hid = {}, why = {}; sub.forEach(function (w, j) { var q = s.per.indexOf(w); if (q >= 0 && s.hid[q]) { hid[j] = 1; } if (q >= 0 && s.why[q]) { why[j] = s.why[q]; } });
          if (idx) { var base = null; vals.forEach(function (v) { if (base == null && v) { base = v; } }); vals = vals.map(function (v) { return v == null || !base ? null : v / base * 100; }); }
          return { name: it.name, vals: vals, hid: hid, why: why, cls: k < SLOTS ? String(k + 1) : 'o' };
        });
        var title = (cmp === 'area' ? '地域ごとの' + whoText() : a.name + 'の' + (cmp === 'nat' ? '国籍・地域ごとの' : cmp === 'visa' ? '在留資格ごとの' : '') + whoText()) + 'の移り変わり（' + wl(sub[0]) + '〜' + wl(sub[sub.length - 1]) + '）';
        var c = card(title, null, srcNote(sub[sub.length - 1]));
        var ctl = el('div', 'dctlrow');
        ctl.appendChild(selectEl([['none', '比べない（1本の線）'], ['nat', '国籍・地域を比べる'], ['visa', '在留資格を比べる'], ['area', '地域を比べる']], cmp, function (v) { setS({ cmp: v }); }, '比べるもの'));
        ctl.appendChild(selectEl(per.map(function (w) { return [w, wl(w)]; }), sub[0], function (v) { setS({ from: v }); }, 'いつから'));
        ctl.appendChild(selectEl(per.map(function (w) { return [w, wl(w)]; }), sub[sub.length - 1], function (v) { setS({ to: v }); }, 'いつまで'));
        ctl.appendChild(selectEl([['0', '人数'], ['1', '指数（はじめ＝100）']], S.idx, function (v) { setS({ idx: v }); }, '目もり'));
        c.appendChild(ctl);
        if (cmp === 'area') { c.appendChild(areaPicker()); }
        if (cmp === 'nat' && !S.nat.length) { c.appendChild(el('p', 'dhelp', 'いちばん新しい時点に多い7つの国籍・地域です。上の「国籍・地域」で選ぶと、選んだものどうしを比べられます。')); }
        if (cmp === 'visa' && !S.visa.length) { c.appendChild(el('p', 'dhelp', 'いちばん新しい時点に多い7つの在留資格です。上の「在留資格」で選ぶと、選んだものどうしを比べられます。')); }
        if (idx) { c.appendChild(el('p', 'dhelp', '指数：それぞれの線のはじめの時点の数を100としたときの大きさ。増え方の速さを比べるときに使います。')); }
        var anyData = series.some(function (s) { return s.vals.some(function (v) { return v != null; }); });
        c.appendChild(anyData ? lineChart(sub, series, { index: idx, title: title }) : nodata());
        c.appendChild(el('p', 'dhelp', 'データのない時点は線を切っています（推測で埋めていません）。2012年12月末から数え方が変わりました（2011年までは登録外国人統計）。' +
          (a.type === 'muni' || cmp === 'area' ? '市区町村の国籍別は2023年6月末までは主な国籍・地域だけです。' : '')));
        var wl2 = whyList(sub, series);
        if (wl2) { c.appendChild(details('データがない時点とその理由', wl2)); }
        var head = ['時点'].concat(series.map(function (s) { return s.name; }));
        var rows = sub.map(function (w, j) { return [wl(w)].concat(series.map(function (s) { var v = s.vals[j]; return v == null ? (s.hid[j] ? '公表されていない' : '') : (idx ? v.toFixed(1) : v); })); });
        c.appendChild(details('グラフの数を表で見る', tableEl(head, rows.map(function (r) { return r.map(function (x, i) { return i && typeof x === 'number' && !idx ? fmt(x) : x; }); }), 1)));
        setTable(title, head, rows);
        current.chart = { kind: 'line', per: sub, series: series, index: idx, area: cmp === 'area' ? '複数の地域' : a.name, when: sub[sub.length - 1], from: sub[0] };
        c.appendChild(toolBar());
        box.replaceChildren(c);
      });
    });
  }
  function areaPicker() { // 地域を比べるときの、比べる地域の選び方（5つまで）
    var w = el('div', 'dareas');
    var keys = [keyOfArea(area())].concat(S.areas.filter(function (k) { return k !== keyOfArea(area()); })).slice(0, MAXCMP);
    keys.forEach(function (k, i) {
      var x = areaFromKey(k), chip = el('span', 'dchip', esc(x.name));
      if (i > 0) { var rm = el('button', 'dchipx', '×'); rm.type = 'button'; rm.setAttribute('aria-label', x.name + 'をはずす'); rm.addEventListener('click', function () { setS({ areas: S.areas.filter(function (z) { return z !== k; }) }); }); chip.appendChild(rm); }
      w.appendChild(chip);
    });
    if (keys.length < MAXCMP) {
      var ps = selectEl([['', '比べる地域を加える…'], ['jp', '全国']].concat(M.prefs.map(function (p) { return ['p:' + p[0], p[0]]; })), '', function (v) {
        if (!v) { return; }
        if (v.indexOf('p:') === 0) { pendingPref = v.slice(2); }
        setS({ areas: S.areas.concat([v]).filter(function (z, i, arr) { return arr.indexOf(z) === i; }).slice(0, MAXCMP - 1) });
      });
      w.appendChild(ps);
      if (pendingPref) {
        var ms = selectEl([['', pendingPref + 'の市区町村を加える…']].concat(munisOf(pendingPref).map(function (m) { return ['m:' + m.key, m.name]; })), '', function (v) {
          if (v) { setS({ areas: S.areas.concat([v]).filter(function (z, i, arr) { return arr.indexOf(z) === i; }).slice(0, MAXCMP - 1) }); }
        });
        w.appendChild(ms);
      }
    }
    w.appendChild(el('span', 'dhelp', 'いま選んでいる地域のほかに、4つまで加えられます（都道府県を加えると、その中の市区町村も選べます）。'));
    return w;
  }
  var pendingPref = '';

  // ---------- 画面：在留資格の内訳・国籍の構成
  function viewBreak(dim) {
    return function (box, alive) {
      var a = area(), when = whenOf(a), filter = dim === 'visa' ? S.nat : S.visa;
      return getBreakdown(a, dim, when, filter).then(function (b) {
        if (!alive()) { return; }
        var who = dim === 'visa' ? (S.nat.length ? S.nat.join('・') + 'の人' : '在留外国人') : (S.visa.length ? '在留資格「' + S.visa.join('・') + '」の人' : '在留外国人');
        var title = a.name + 'の' + who + 'の' + (dim === 'visa' ? '在留資格' : '国籍・地域') + '（' + wl(when) + '）';
        var c = card(title, null, srcNote(when));
        if (dim === 'visa' && S.visa.length) { c.appendChild(el('p', 'dhelp', 'この画面では「在留資格」の絞り込みは使いません（すべての在留資格を並べます）。')); }
        if (dim === 'nat' && S.nat.length) { c.appendChild(el('p', 'dhelp', 'この画面では「国籍・地域」の絞り込みは使いません（すべての国籍・地域を並べます）。')); }
        if (!b.items.length) { c.appendChild(nodata(b.why)); box.replaceChildren(c); setTable(title, [], []); return; }
        var total = b.total != null ? b.total : b.items.reduce(function (s, x) { return s + x[1]; }, 0);
        c.appendChild(el('p', 'dkpi', '合計 <b>' + fmt(total) + '人</b>　<span class="sub">統計時点：' + esc(wl(when)) + '</span>'));
        if (b.partial) { c.appendChild(el('p', 'dhelp', esc(b.partial) + '。')); }
        var vn = K.vnote(b.items.map(function (x) { return x[0]; })); if (vn) { c.appendChild(el('p', 'dhelp', esc(vn))); }
        var grid = el('div', 'cols');
        var parts = topWithOther(b.items, total, SLOTS);
        var pc = el('section', 'dsub'); pc.appendChild(el('h3', null, '円グラフ（多い7つと「その他」）')); pc.appendChild(pieChart(parts, total, title));
        var bc = el('section', 'dsub'); bc.appendChild(el('h3', null, dim === 'visa' ? '在留資格ごとの人数' : '国籍・地域ごとの人数（多い20）'));
        var bars = (dim === 'visa' ? b.items : b.items.slice(0, 20)).map(function (x) { return [x[0], x[1], '', dim === 'nat' && x[0] !== 'その他' ? 'nat-' + encodeURIComponent(x[0]) + '.html' : null]; });
        bc.appendChild(barList(bars, total, { rank: true, f: fmt })); // 単位（人）は見出しにあるので、数だけにする
        grid.appendChild(pc); grid.appendChild(bc); c.appendChild(grid);
        if (dim === 'nat') { // 在留資格は上の棒グラフで全部見えるので、表は国籍だけ（棒グラフは多い20まで）
          var rows = b.items.map(function (x, i) { return [i + 1, x[0], fmt(x[1]), (x[1] / total * 100).toFixed(1) + '%']; });
          c.appendChild(details('すべての国籍・地域を見る（' + b.items.length + '）', tableEl(['順位', '国籍・地域', '人数', '構成比'], rows, 2)));
        }
        setTable(title, ['順位', dim === 'visa' ? '在留資格' : '国籍・地域', '人数', '構成比（%）', '統計時点'], b.items.map(function (x, i) { return [i + 1, x[0], x[1], (x[1] / total * 100).toFixed(2), wl(when)]; }));
        current.chart = { kind: 'pie', parts: parts, total: total, area: a.name, when: when, dim: dim, items: b.items.slice(0, 10) };
        c.appendChild(toolBar());
        var out = el('div'); out.appendChild(c);
        if (dim === 'nat') {
          return stackChart(a, alive).then(function (sc) { if (!alive()) { return; } if (sc) { out.appendChild(sc); } box.replaceChildren(out); });
        }
        box.replaceChildren(out);
      });
    };
  }
  function stackChart(a, alive) { // 国籍の構成の移り変わり（積み上げ面グラフ）
    return topNames(a, 'nat', SLOTS).then(function (top) {
      return Promise.all([getSeries(a, [], S.visa)].concat(top.map(function (n) { return getSeries(a, [n], S.visa); }))).then(function (ss) {
        if (!alive()) { return null; }
        var tot = ss[0], per = tot.per;
        var keep = per.map(function (w, i) { return tot.val[i] != null && ss.slice(1).every(function (s) { return s.val[i] != null; }); });
        var idx = per.map(function (w, i) { return i; }).filter(function (i) { return keep[i]; });
        var title = a.name + 'の' + whoText() + 'の国籍・地域の構成の移り変わり';
        var c = card(title, null, esc(SRC + '（' + (idx.length ? wl(per[idx[0]]) + '〜' + wl(per[idx[idx.length - 1]]) : '') + '）'));
        if (idx.length < 2) { c.appendChild(nodata('移り変わりを示せるだけのデータがありません（市区町村は、国籍別の数がそろうのが2023年12月末からです）')); return c; }
        var layers = top.map(function (n, k) { return { name: n, cls: String(k + 1), vals: idx.map(function (i) { return ss[k + 1].val[i]; }) }; });
        layers.push({ name: 'その他', cls: 'o', vals: idx.map(function (i, j) { return tot.val[i] - layers.reduce(function (s, l) { return s + l.vals[j]; }, 0); }) });
        var W = 760, H = 320, L = 78, R = 26, T = 14, B = 34, xs = idx.map(function (i) { return wx(per[i]); });
        var x0 = xs[0], x1 = xs[xs.length - 1], ymax = Math.max.apply(null, idx.map(function (i) { return tot.val[i]; })) * 1.04 || 1, step = niceStep(ymax / 5);
        ymax = Math.ceil(ymax / step) * step;
        var X = function (x) { return L + (x1 > x0 ? (x - x0) / (x1 - x0) : 0.5) * (W - L - R); }, Y = function (v) { return T + (1 - v / ymax) * (H - T - B); };
        var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart stack', role: 'img', 'aria-label': title });
        for (var v = 0; v <= ymax + 1e-9; v += step) { g.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) })); var t = svg('text', { class: 'ax', x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = v >= 10000 ? (v / 10000) + '万' : fmt(v); g.appendChild(t); }
        var span = x1 - x0, ys = span > 30 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1;
        for (var yr = Math.ceil(x0 / ys) * ys; yr <= x1; yr += ys) { var tx = svg('text', { class: 'ax', x: X(yr + 0.5), y: H - 12, 'text-anchor': 'middle' }); tx.textContent = yr; g.appendChild(tx); }
        var base = idx.map(function () { return 0; });
        layers.forEach(function (l) {
          var top2 = base.map(function (b, j) { return b + Math.max(0, l.vals[j]); });
          var d = 'M' + xs.map(function (x, j) { return X(x).toFixed(1) + ',' + Y(top2[j]).toFixed(1); }).join('L') + 'L' + xs.slice().reverse().map(function (x, j) { return X(x).toFixed(1) + ',' + Y(base[base.length - 1 - j]).toFixed(1); }).join('L') + 'Z';
          var p = svg('path', { d: d, class: 'area-st c-' + l.cls }); g.appendChild(p);
          base = top2;
        });
        var hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
        hit.addEventListener('mousemove', function (ev) {
          var r = g.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, best = 0, bd = 1e9;
          xs.forEach(function (xx, j) { var dd = Math.abs(X(xx) - x); if (dd < bd) { bd = dd; best = j; } });
          var tt = tot.val[idx[best]];
          K.showTip(ev, '<b>' + esc(wl(per[idx[best]])) + '</b>（合計 ' + fmt(tt) + '人）' + layers.slice().reverse().map(function (l) { return '<br><span class="sw sw-' + l.cls + '"></span> ' + esc(l.name) + '：' + fmt(l.vals[best]) + '人（' + (l.vals[best] / tt * 100).toFixed(1) + '%）'; }).join(''));
        });
        hit.addEventListener('mouseleave', K.hideTip);
        g.appendChild(hit);
        c.appendChild(g);
        var lg = el('div', 'lines-legend');
        layers.forEach(function (l) { lg.appendChild(el('span', 'lgb', '<span class="sw sw-' + l.cls + '"></span>' + esc(l.name))); });
        c.appendChild(lg);
        c.appendChild(el('p', 'dhelp', 'いちばん新しい時点に多い7つの国籍・地域と、それ以外を合わせた「その他」（総数から7つの合計を引いた数）。7つのどれかの数がない時点は入れていません。'));
        var head = ['時点', '合計'].concat(layers.map(function (l) { return l.name; }));
        c.appendChild(details('グラフの数を表で見る', tableEl(head, idx.map(function (i, j) { return [wl(per[i]), fmt(tot.val[i])].concat(layers.map(function (l) { return fmt(l.vals[j]); })); }), 1)));
        return c;
      });
    });
  }

  // ---------- 画面：ランキング
  // 何を並べるか。はじめは上で選んだ地域の中のもの（全国 → 都道府県、都道府県 → その市区町村、市区町村 → その国籍・地域）
  function autoRt(a) { return a.type === 'japan' ? 'pref' : a.type === 'pref' ? 'muni' : 'nat'; }
  function viewRank(box, alive) {
    var a = area(), rt = S.rt || autoRt(a), m = METRICS[S.rm] ? S.rm : 'count';
    var perA = rt === 'muni' || (rt !== 'pref' && a.type === 'muni') ? M.MP : M.P;
    var when = perA.indexOf(S.when) >= 0 ? S.when : perA[perA.length - 1];
    var ctl = el('div', 'dctlrow');
    // 上で選んだ地域が、並べた中の何位か（都道府県・市区町村を並べるとき）。区を選んだときは、その市
    var mine = a.type === 'japan' ? '' : rt === 'pref' ? a.pref : rt === 'muni' && a.type === 'muni' ? (MUNI[a.key].kind === '区' && MUNI[MUNI[a.key].parent] ? MUNI[MUNI[a.key].parent].name : MUNI[a.key].name) : '';
    var rtOpts = {
      pref: a.type === 'japan' ? '都道府県' : '47都道府県（' + a.pref + 'は何位か）',
      muni: a.type === 'japan' ? '市区町村（全国）' : a.pref + 'の市区町村' + (a.type === 'muni' ? '（' + mine + 'は何位か）' : ''),
      nat: a.name + 'の国籍・地域', visa: a.name + 'の在留資格', nx: a.name + 'の国籍・地域×在留資格（組み合わせ）'
    };
    var rtOrder = a.type === 'japan' ? ['pref', 'muni', 'nat', 'visa', 'nx'] : a.type === 'pref' ? ['muni', 'nat', 'visa', 'nx', 'pref'] : ['nat', 'visa', 'nx', 'muni', 'pref'];
    ctl.appendChild(selectEl(rtOrder.map(function (k) { return [k, rtOpts[k]]; }), rt, function (v) { setS({ rt: v === autoRt(area()) ? '' : v }); }, '何を並べる'));
    var mopts = rt === 'pref' || rt === 'muni' ? ['count', 'ratio', 'share', 'diff1', 'rate1', 'diff5', 'rate5', 'diff10', 'rate10'] : ['count', 'share', 'diff1', 'rate1', 'diff5', 'rate5', 'diff10', 'rate10'];
    if (mopts.indexOf(m) < 0) { m = 'count'; }
    ctl.appendChild(selectEl(mopts.map(function (k) { return [k, METRICS[k].label]; }), m, function (v) { setS({ rm: v }); }, '何で並べる'));
    if (METRICS[m].rate) { ctl.appendChild(selectEl([['0', 'すべて'], ['10', '10人以上'], ['100', '100人以上'], ['1000', '1,000人以上']], S.mn, function (v) { setS({ mn: v }); }, METRICS[m].back + '年前の人数')); }
    var p;
    if (rt === 'pref' || rt === 'muni') {
      var regs = rt === 'pref' ? prefRegions() : (S.pref ? muniRegions(S.pref, false) : [].concat.apply([], M.prefs.map(function (x) { return muniRegions(x[0], false).map(function (r) { r.name = x[0] + ' ' + r.name; return r; }); })));
      p = regionValues(regs, m, when).then(function (vals) {
        return Promise.all(vals.map(function (x) { return m === 'count' ? null : Promise.resolve(x.s.val[x.s.per.indexOf(when)]); })).then(function (counts) {
          return vals.map(function (x, k) {
            var i2 = x.s.per.indexOf(when), j2 = METRICS[m].back && i2 >= 0 ? backIndex(x.s.per, i2, METRICS[m].back) : -1;
            return { name: x.name, v: x.v, count: m === 'count' ? x.v : counts[k], base: j2 >= 0 ? x.s.val[j2] : null, why: x.why, click: function () { if (x.a.type === 'pref') { setS({ pref: x.a.pref, muni: '', v: 'area' }); } else { setS({ pref: x.a.pref, muni: x.a.key, v: 'area' }); } } };
          });
        });
      });
    } else if (rt === 'nx') {
      var mdx = METRICS[m], perx = periodsOf(a), ix = perx.indexOf(when), jx = mdx.back ? backIndex(perx, ix, mdx.back) : -1;
      p = Promise.all([getCombos(a, when, S.nat, S.visa), jx >= 0 ? getCombos(a, perx[jx], S.nat, S.visa) : null, load('japan.json')]).then(function (r) {
        var now = r[0], before = r[1], bw = jx >= 0 ? perx[jx] : null, bmap = null;
        if (!now.items.length) { return { why: now.why }; }
        if (before && !before.why) { bmap = {}; before.items.forEach(function (x) { bmap[x[0] + '\t' + x[1]] = x[2]; }); }
        return now.items.filter(function (x) { return x[0] !== 'その他' && x[1] !== 'その他'; }).map(function (x) {
          // 前の時点の表にない組み合わせは0人。ただし、その国籍・在留資格の区分が前の時点になかったときはデータなし
          var b = bmap == null ? null : bmap[x[0] + '\t' + x[1]] != null ? bmap[x[0] + '\t' + x[1]] : natAt(r[2], x[0], bw) && visaAt(r[2], x[1], bw) ? 0 : null;
          var v = m === 'share' ? x[2] / now.total * 100 : !mdx.back ? x[2] : b == null || (mdx.rate && !b) ? null : mdx.rate ? (x[2] - b) / b * 100 : x[2] - b;
          return { name: x[0] + '（' + x[1] + '）', nat: x[0], visa: x[1], v: v, count: x[2], base: b,
            click: function () { setS({ nat: [x[0]], visa: [x[1]], v: 'trend', cmp: 'none' }); } };
        });
      });
    } else {
      var dim = rt, filter = dim === 'nat' ? S.visa : S.nat, md = METRICS[m];
      var per = periodsOf(a), i = per.indexOf(when), j = md.back ? backIndex(per, i, md.back) : -1;
      p = Promise.all([getBreakdown(a, dim, when, filter), j >= 0 ? getBreakdown(a, dim, per[j], filter) : null]).then(function (r) {
        var now = r[0], before = r[1], bmap = {};
        if (before) { before.items.forEach(function (x) { bmap[x[0]] = x[1]; }); }
        if (!now.items.length) { return { why: now.why }; }
        var total = now.total != null ? now.total : now.items.reduce(function (s, x) { return s + x[1]; }, 0);
        return now.items.filter(function (x) { return x[0] !== 'その他'; }).map(function (x) {
          var v = x[1], b = bmap[x[0]];
          if (m === 'share') { v = x[1] / total * 100; } else if (md.back) { v = b == null ? null : md.rate ? (x[1] - b) / b * 100 : x[1] - b; } // 前の時点にないもの（区分がなかった等）は計算しない
          return { name: x[0], v: v, count: x[1], base: b == null ? null : b, link: dim === 'nat' ? 'nat-' + encodeURIComponent(x[0]) + '.html' : null };
        });
      });
    }
    return p.then(function (rows) {
      if (!alive()) { return; }
      var what = rt === 'pref' ? '都道府県' : rt === 'muni' ? (S.pref ? S.pref + 'の市区町村' : '市区町村') : a.name + 'の' + (rt === 'nat' ? '国籍・地域' : rt === 'visa' ? '在留資格' : '国籍・地域×在留資格');
      var title = what + 'のランキング（' + METRICS[m].label + (rt === 'pref' || rt === 'muni' || (rt === 'nx' && (S.nat.length || S.visa.length)) ? '、' + whoText() : '') + '、' + wl(when) + '）';
      var c = card(title, null, srcNote(when, m === 'ratio'));
      c.appendChild(ctl);
      var picked = rt === 'nat' ? S.visa.length : rt === 'visa' ? S.nat.length : S.nat.length || S.visa.length;
      c.appendChild(el('p', 'dhelp', esc(m === 'share' && rt !== 'pref' && rt !== 'muni' ? a.name + 'の' + (picked ? '選んだ人' : '外国人') + 'のうち、それぞれが占める割合。' : HELP[m] || '')));
      if (rt === 'nx') { c.appendChild(el('p', 'dhelp', '国籍・地域と在留資格の組み合わせごとに数えています（例：「インドネシア（技能実習）」と「インドネシア（家族滞在）」は別）。上で国籍・地域や在留資格を選ぶと、その組み合わせだけになります。名前を押すと、その組み合わせの移り変わりが出ます。')); }
      if (rows.why) { c.appendChild(nodata(rows.why)); box.replaceChildren(c); return; }
      var minBase = METRICS[m].rate ? +S.mn : 0;
      var ok = rows.filter(function (x) { return x.v != null && (!minBase || (x.base != null && x.base >= minBase)); }).sort(function (x, y) { return y.v - x.v; });
      if (minBase) { c.appendChild(el('p', 'dhelp', esc(METRICS[m].back + '年前に' + fmt(minBase) + '人以上いた所だけを並べています。'))); }
      var fromZero = METRICS[m].rate && !minBase ? rows.filter(function (x) { return x.v == null && x.base === 0; }) : []; // 前は0人で、増加率を出せないもの
      var miss = rows.filter(function (x) { return x.v == null && x.base !== 0; }); // 人数が足りずに外したものは数えない
      if (!ok.length) { c.appendChild(nodata()); box.replaceChildren(c); return; }
      var rank = ok.findIndex(function (x) { return x.name === mine; });
      if (mine) { c.appendChild(el('p', 'dmine', rank >= 0 ? esc(mine) + 'は <b>' + (rank + 1) + '位</b>（' + ok.length + 'のうち）' + (rank >= 30 && S.all !== '1' ? '。下の「すべて表示する」で見られます' : '') : esc(mine) + 'はデータがないため並べていません')); }
      var show = S.all === '1' ? ok : ok.slice(0, 30);
      c.appendChild(barList(show.map(function (x) {
        var sub = m === 'count' || x.count == null ? '' : fmt(x.count) + '人' + (METRICS[m].back && x.base != null ? '（' + METRICS[m].back + '年前 ' + fmt(x.base) + '人）' : '');
        return [x.name, x.v, sub, x.link, x.click];
      }), null, { f: METRICS[m].f, rank: true, mark: mine }));
      if (ok.length > 30) { var more = el('button', 'dbtn dbtn-sub pick-more', S.all === '1' ? '上位30件だけにする' : 'すべて表示する（全' + ok.length + '件）'); more.type = 'button'; more.addEventListener('click', function () { setS({ all: S.all === '1' ? '0' : '1' }); }); c.appendChild(more); }
      if (miss.length) { c.appendChild(el('p', 'dhelp', esc('データがないため並べていないもの：' + miss.length + '（' + miss.slice(0, 8).map(function (x) { return x.name; }).join('、') + (miss.length > 8 ? '…' : '') + '）'))); }
      if (fromZero.length) { c.appendChild(el('p', 'dhelp', esc(METRICS[m].back + '年前は0人だったため、増加率を出せないもの：' + fromZero.length + '（' + fromZero.slice(0, 8).map(function (x) { return x.name; }).join('、') + (fromZero.length > 8 ? '…' : '') + '）'))); }
      if (METRICS[m].rate) { c.appendChild(el('p', 'dhelp', '増加率は、もとの人数が少ないと大きく出ます。横の小さな数字はその時点の人数です。')); }
      var cell = function (x) { return m === 'count' ? x.v : x.v.toFixed(2); };
      if (rt === 'nx') { setTable(title, ['順位', '国籍・地域', '在留資格', METRICS[m].label, '人数', '時点'], ok.map(function (x, k) { return [k + 1, x.nat, x.visa, cell(x), x.count, wl(when)]; })); }
      else { setTable(title, ['順位', what, METRICS[m].label, '人数', '時点'], ok.map(function (x, k) { return [k + 1, x.name, cell(x), x.count, wl(when)]; })); }
      current.chart = { kind: 'rank', rows: ok.slice(0, 10).map(function (x) { return [x.name, x.v]; }), f: METRICS[m].f, metric: METRICS[m].label, when: when, area: rt === 'pref' ? '全国' : a.name, what: what, rt: rt, pop: m === 'ratio' };
      c.appendChild(toolBar());
      box.replaceChildren(c);
    });
  }

  // ---------- 画面：地域比較
  function viewCmp(box, alive) {
    var keys = [keyOfArea(area())].concat(S.areas.filter(function (k) { return k !== keyOfArea(area()); })).slice(0, MAXCMP);
    var areas = keys.map(areaFromKey);
    return Promise.all(areas.map(function (a) { return Promise.all([getSeries(a, S.nat, S.visa), getPop(a), getSeries(a, [], [])]); })).then(function (rs) {
      var per = rs.reduce(function (p, r) { return r[0].per.length < p.length ? r[0].per : p; }, rs[0][0].per);
      var when = per.indexOf(S.when) >= 0 ? S.when : per[per.length - 1];
      return Promise.all(areas.map(function (a) { return Promise.all([getBreakdown(a, 'nat', when, S.visa), getBreakdown(a, 'visa', when, S.nat)]); })).then(function (bs) {
        if (!alive()) { return; }
        var title = '地域の比較：' + whoText() + '（' + wl(when) + '）';
        var c = card(title, null, srcNote(when, true));
        c.appendChild(areaPicker());
        var head = ['地域', '人数', '地域の人口に占める割合', '5年間の増減', '5年間の増加率', '10年間の増減', '10年間の増加率'];
        var rows = areas.map(function (a, k) {
          var s = rs[k][0], i = s.per.indexOf(when), ctx = { pop: rs[k][1] };
          var f = function (mm) { var v = i < 0 ? null : metricAt(mm, s, i, ctx); return v == null ? null : METRICS[mm].f(v); };
          return [a.name, f('count'), f('ratio'), f('diff5'), f('rate5'), f('diff10'), f('rate10')];
        });
        c.appendChild(tableEl(head, rows, 1));
        var series = areas.map(function (a, k) { var s = rs[k][0]; return { name: a.name, vals: per.map(function (w) { var j = s.per.indexOf(w); return j < 0 ? null : s.val[j]; }), hid: {}, cls: String(k + 1) }; });
        var lc = el('section', 'dsub'); lc.appendChild(el('h3', null, '移り変わり')); lc.appendChild(lineChart(per, series, { title: title })); c.appendChild(lc);
        ['nat', 'visa'].forEach(function (dim, di) {
          var sec = el('section', 'dsub'); sec.appendChild(el('h3', null, (dim === 'nat' ? '国籍・地域' : '在留資格') + 'の構成（' + wl(when) + '）'));
          var score = {}; bs.forEach(function (b) { var t = b[di].total || 1; b[di].items.forEach(function (x) { if (x[0] !== 'その他') { score[x[0]] = (score[x[0]] || 0) + x[1] / t; } }); });
          var top = Object.keys(score).sort(function (x, y) { return score[y] - score[x]; }).slice(0, 6);
          sec.appendChild(stackBars(areas.map(function (a, k) { return { name: a.name, b: bs[k][di] }; }), top));
          c.appendChild(sec);
        });
        setTable(title, head, rows);
        current.chart = { kind: 'line', per: per, series: series, index: false, area: '複数の地域', when: when, from: per[0] };
        c.appendChild(toolBar());
        box.replaceChildren(c);
      });
    });
  }
  function stackBars(list, top) { // 100％の積み上げ横棒
    var w = el('div', 'dstack');
    list.forEach(function (x) {
      var row = el('div', 'dsrow'); row.appendChild(el('span', 'dsname', esc(x.name)));
      var bar = el('div', 'dsbar');
      if (!x.b.items.length) { bar.appendChild(el('span', 'dhelp', esc(x.b.why || 'データなし'))); row.appendChild(bar); w.appendChild(row); return; }
      var t = x.b.total || x.b.items.reduce(function (s, y) { return s + y[1]; }, 0), used = 0, map = {};
      x.b.items.forEach(function (y) { map[y[0]] = y[1]; });
      top.forEach(function (n, k) {
        var v = map[n] || 0; used += v;
        var seg = el('span', 'dseg sw-' + (k + 1)); seg.style.width = (v / t * 100) + '%';
        seg.title = n + '：' + fmt(v) + '人（' + (v / t * 100).toFixed(1) + '%）';
        bar.appendChild(seg);
      });
      var o = el('span', 'dseg sw-o'); o.style.width = (Math.max(0, t - used) / t * 100) + '%'; o.title = 'その他：' + fmt(Math.max(0, t - used)) + '人'; bar.appendChild(o);
      row.appendChild(bar); w.appendChild(row);
    });
    var lg = el('div', 'lines-legend');
    top.concat(['その他']).forEach(function (n, k) { lg.appendChild(el('span', 'lgb', '<span class="sw sw-' + (k < top.length ? k + 1 : 'o') + '"></span>' + esc(n))); });
    w.appendChild(lg);
    return w;
  }

  // ---------- 画面：地域を詳しく
  function viewArea(box, alive) {
    var a = area(), when = whenOf(a);
    return Promise.all([getSeries(a, S.nat, S.visa).then(function (s) { return explain(a, S.nat, S.visa, s); }), getPop(a), getBreakdown(a, 'nat', when, S.visa), getBreakdown(a, 'visa', when, S.nat)]).then(function (r) {
      if (!alive()) { return; }
      var s = r[0], i = s.per.indexOf(when), ctx = { pop: r[1] };
      var title = a.name + 'の' + whoText() + '（' + wl(when) + '）';
      var c = card(title, null, srcNote(when, true));
      var k = el('div', 'kpis');
      function kpi(lab, mm, extra) { var v = i < 0 ? null : metricAt(mm, s, i, ctx); var d = el('div', 'kpi'); d.innerHTML = '<div class="lab">' + esc(lab) + '</div><div class="big">' + (v == null ? '—' : esc(METRICS[mm].f(v))) + '</div>' + (extra ? '<div class="lab">' + esc(extra) + '</div>' : ''); k.appendChild(d); }
      kpi('人数', 'count', s.hid[i] ? '公表されていない（外国人が10人以下）' : '');
      kpi('地域の人口に占める割合', 'ratio', M.popDates[when] ? '人口は' + M.popDates[when].replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日') + '現在' : '人口の数は12月末の時点だけ（2013年から）');
      kpi('1年間の増減', 'diff1'); kpi('5年間の増減', 'diff5'); kpi('10年間の増減', 'diff10');
      c.appendChild(k);
      var lc = el('section', 'dsub'); lc.appendChild(el('h3', null, '移り変わり'));
      lc.appendChild(lineChart(s.per, [{ name: a.name, vals: s.val, hid: s.hid, why: s.why, cls: '1' }], { title: title })); c.appendChild(lc);
      var grid = el('div', 'cols');
      [['国籍・地域（多い10）', r[2]], ['在留資格（多い10）', r[3]]].forEach(function (x) {
        var sec = el('section', 'dsub'); sec.appendChild(el('h3', null, esc(x[0])));
        if (!x[1].items.length) { sec.appendChild(nodata(x[1].why)); } else { sec.appendChild(barList(x[1].items.slice(0, 10).map(function (y) { return [y[0], y[1]]; }), x[1].total || null, { rank: true })); }
        var vn = K.vnote(x[1].items.slice(0, 10).map(function (y) { return y[0]; })); if (vn) { sec.appendChild(el('p', 'dhelp', esc(vn))); }
        grid.appendChild(sec);
      });
      c.appendChild(grid);
      var links = el('p', 'dnav');
      links.innerHTML = '<a href="' + pageOf(a) + '">' + esc(a.name) + 'のページ（表とグラフ）を開く</a>';
      if (a.type === 'pref') { var mb = el('button', 'dbtn dbtn-sub', 'この都道府県の市区町村の地図'); mb.type = 'button'; mb.addEventListener('click', function () { setS({ v: 'map' }); }); links.appendChild(document.createTextNode('　')); links.appendChild(mb); }
      c.appendChild(links);
      var head = ['時点', '人数'];
      setTable(title, head, s.per.map(function (w, j) { return [wl(w), s.val[j] == null ? (s.hid[j] ? '公表されていない' : '') : s.val[j]]; }));
      current.chart = { kind: 'line', per: s.per, series: [{ name: a.name, vals: s.val, hid: s.hid, cls: '1' }], index: false, area: a.name, when: when, from: s.per[0] };
      c.appendChild(toolBar());
      box.replaceChildren(c);
    });
  }

  // ---------- 全体の流れ
  var VIEWS = { map: viewMap, trend: viewTrend, visa: viewBreak('visa'), nat: viewBreak('nat'), rank: viewRank, cmp: viewCmp, area: viewArea };
  var token = 0, filterBox = document.getElementById('dash-filter'), viewBox = document.getElementById('dash-view');
  var nowBox = el('div'); nowBox.id = 'dash-now'; filterBox.insertAdjacentElement('afterend', nowBox); // 「表示中：…」の行（止めない）
  function render() {
    var my = ++token;
    if (!VIEWS[S.v]) { S.v = 'map'; }
    if (S.v !== 'map') { stopPlay(); }
    writeHash();
    document.querySelectorAll('.dmenu [data-v]').forEach(function (b) { b.setAttribute('aria-current', b.dataset.v === S.v ? 'page' : 'false'); });
    filterBox.replaceChildren(filterBar());
    nowBox.replaceChildren(nowLine());
    var p;
    try { p = VIEWS[S.v](viewBox, function () { return my === token; }); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function () { // 出典と統計時点の行は、それぞれのカードのいちばん下（保存ボタンの上）へ
      viewBox.querySelectorAll('.dcard').forEach(function (c) {
        var src = c.querySelector(':scope > .dsrc'), tools = c.querySelector(':scope > .dtools');
        if (src) { c.insertBefore(src, tools || null); }
      });
    }).catch(function (e) {
      if (my !== token) { return; }
      console.error(e);
      viewBox.replaceChildren(nodata('データを読み込めませんでした。しばらくしてから、もう一度開いてください。'));
    });
  }
  function onNav() { if (M && location.hash !== shownHash) { stopPlay(); readHash(); render(); } } // ブラウザの「戻る」「進む」、アドレスの書きかえ
  window.addEventListener('hashchange', onNav);
  window.addEventListener('popstate', onNav);
  document.querySelectorAll('.dmenu [data-v]').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); setS({ v: b.dataset.v });
      var hh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hdr'), 10) || 56;
      window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - hh - 8, behavior: 'smooth' });
    });
  });
  load('meta.json').then(function (m) {
    M = m;
    M.prefs.forEach(function (p) { PREF_ROMA[p[0]] = p[1]; });
    M.prefs.forEach(function (p) { (M.munis[p[1]] || []).forEach(function (r) { MUNI[r[0]] = { key: r[0], name: r[1], kind: r[2], parent: r[3], link: r[4], pref: p[0] }; }); });
    readHash();
    render();
  }, function () { viewBox.replaceChildren(nodata('データを読み込めませんでした。')); });
  window.KZD = { state: function () { return S; }, wl: wl, METRICS: METRICS };
})();
