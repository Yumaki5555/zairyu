/* 数でみる在留外国人：不法残留者数のページ（fuho.html）の、選んで見る部分
   数は data/fuho.json（make_dash_data.py が データ/不法残留/ から作る）。グラフの部品は dash.js、画像の保存は share.js。
   ページの順（大事なものから）：① 全国の総数と、半年前・1年前からの増減（目次）→ ② 国籍・地域別ランキング → ③ 選んだ国籍・地域のくわしい数（1か所にまとめる）→
   ④ 在留資格別ランキング → ⑤ 全国の推移（国籍・地域別・在留資格別はたたむ）→ ⑥ 新規・減少 → ⑦ くわしい数（たたむ）。⑧ 出典と注意は、ページに書いてある（make_site.py）。
   上の「時点」「国籍・地域」を変えると、ページ全体がその時点・国籍・地域に変わる。選んだ条件はアドレスの # のあと（前からの dim・w・cmp・nat などの書き方のまま）。
   在留外国人統計とは別の統計なので、時点の書き方（1月1日・7月1日）・出典・ハッシュタグ・画像のタイトルは、ここで決めて画像（share.js）に渡す。
   発表にのる国籍・地域は上位10だけで、上位の顔ぶれは発表ごとに変わる。上位に入っていない時点の数は「公表データなし」（0人とは分ける）。
   ただし、新規不法残留者の表（2026年1月1日の発表から）にのっている国籍・地域は、その表の「その時点の数」「前の時点の数」も使う（同じ統計の同じ時点の数。fillFromNew）。
   国籍・地域の「その他」は発表ごとに中身が違うので、移り変わりの線には使わない。
   色は、国籍・地域ごと・在留資格ごとに決めて、どのグラフでも同じにする（NST・VST）。分類の色は7つなので、8つ目からは同じ色の点線（棒はしま模様）で見分ける */
(function () {
  'use strict';
  var root = document.getElementById('fuho');
  if (!root || !window.KZC) { return; }
  var K = window.KZ, Z = window.KZC, fmt = K.fmt, esc = K.esc, el = Z.el, signed = Z.signed;
  var NAT = '国籍・地域', VISA = '在留資格', DIMS = [NAT, VISA];
  var D = null, SRC = '出入国在留管理庁「本邦における不法残留者数について」（報道発表）', TAG = '#不法残留';
  var VNOTE = '在留資格は、不法残留になったときにもっていた在留資格です。', NOPUB = '公表データなし';
  // w：時点（発表）。nat：くわしく見る国籍・地域（ないときは、その時点の1位）。vv：在留資格別の見方（''＝全国、n＝選んだ国籍・地域）。cmp：増減ランキングで比べる時点（half・year）。
  // dim・pick：推移で比べる表（国籍・地域／在留資格）と比べるもの。sex・idx：その男女・目もり。from・to：推移の期間
  var DEF = { dim: NAT, w: '', cmp: 'half', pick: [], sex: '', idx: '', from: '', to: '', nat: '', vv: '' };
  var S = JSON.parse(JSON.stringify(DEF));
  var OPEN = {}; // たたんだ欄・技能実習の号のうち、開いているもの（選び直して描き直しても開いたまま）
  // 色：[色の番号, 点線か]。国籍・地域は、いちばん新しい発表の多い順に7色、8つ目からは同じ色の点線（initStyles）
  var NST = { '総数': ['o', 1], 'その他': ['o'] };
  var VST = { '総数': ['o', 1], '短期滞在': ['1'], '技能実習': ['2'], '特定活動': ['3'], '留学': ['4'], '日本人の配偶者等': ['5'], '出国期間': ['6'], 'その他': ['o'],
    '技能実習1号ロ': ['6'], '技能実習2号ロ': ['7'], '技能実習3号ロ': ['1', 1], '技能実習1号イ': ['6', 1], '技能実習2号イ': ['7', 1], '技能実習3号イ': ['3', 1] };
  var EXTRA = {}; // 新規不法残留者の表から足した数（「名前|時点」）

  function readHash() { var q = new URLSearchParams(location.hash.slice(1)); Object.keys(S).forEach(function (k) { var v = q.get(k); if (v != null) { S[k] = Array.isArray(DEF[k]) ? v.split(',').filter(Boolean) : v; } }); }
  function writeHash() {
    var q = new URLSearchParams(); Object.keys(S).forEach(function (k) { var v = Array.isArray(DEF[k]) ? S[k].join(',') : S[k]; if (v) { q.set(k, v); } });
    history.replaceState(null, '', '#' + q.toString());
  }
  // 時点・国籍・地域を変えたときは全部、ほかはその欄（only：欄の id の並び）だけ描き直す（上の欄が描き直しで一瞬縮んで、見ている所がずれないように）
  function set(p, only) { Object.keys(p).forEach(function (k) { S[k] = p[k]; }); render('w' in p || 'nat' in p ? null : only); }
  function go(id) { var t = document.getElementById(id); if (t) { t.scrollIntoView({ block: 'start' }); } }
  function dl(w) { var p = w.split('-'); return p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日'; } // 2026-07-01 → 2026年7月1日
  function dx(w) { var p = w.split('-'); return +p[0] + (+p[1] - 1) / 12; } // 横の位置（年の目もりが1月1日）
  function pubText(s) { return s.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日'); }
  function rel(w) { return D.releases.filter(function (r) { return r.w === w; })[0]; }
  function val(dim, name, w) { var a = D.sp[dim][name], i = D.W.indexOf(w); return a && i >= 0 ? a[i] : null; }
  function sexVal(sx, name, w) { var a = D.sex[sx][name], i = D.W.indexOf(w); return a && i >= 0 && !EXTRA[name + '|' + w] ? a[i] : null; }
  function prevRel(w) { var i = D.R.indexOf(w); return i > 0 ? D.R[i - 1] : null; } // 半年前の発表
  // 新規・減少の表が比べている前の時点。発表ごとに違う（2026年1月1日の発表は1年前の2025年1月1日、2026年7月1日の発表は半年前）。
  // 表には時点の列がないので、総数の「前の時点の数」と同じ総数の時点を探す（見つからないときは null）
  function newPrev(w) {
    var t = D.new[w][NAT].filter(function (r) { return r[0] === '総数'; })[0][3], c = D.W.filter(function (x) { return x < w && val(NAT, '総数', x) === t; });
    return c.length ? c[c.length - 1] : null;
  }
  function span(pw, w) { var m = (+w.slice(0, 4) - +pw.slice(0, 4)) * 12 + (+w.slice(5, 7) - +pw.slice(5, 7)); return m === 6 ? '半年' : m % 12 === 0 ? m / 12 + '年' : m + 'か月'; }
  function shift(w, m) { var y = +w.slice(0, 4), mo = +w.slice(5, 7) - m; while (mo < 1) { mo += 12; y--; } return y + '-' + ('0' + mo).slice(-2) + w.slice(7); } // m か月前の日付（発表がなくても）
  function ago(w, m) { var x = shift(w, m); return D.W.indexOf(x) >= 0 ? x : null; }
  function listed(dim, w) { // その発表にのっている名前（多い順。総数・その他・技能実習の号は除く）
    return ((D.listed[w] || {})[dim] || []).slice().sort(function (a, b) { return (val(dim, b, w) || 0) - (val(dim, a, w) || 0); });
  }
  function by(dim) { return dim === NAT ? '国籍・地域別' : '在留資格別'; }
  function who(n) { return n === '総数' ? '不法残留者' : n + 'の不法残留者'; }
  function sty(dim, n) { var t = (dim === NAT ? NST : VST)[n]; return { cls: t ? t[0] : 'o', dash: !!(t && t[1]) }; }
  function natAll() { return Object.keys(NST).filter(function (n) { return n !== '総数' && n !== 'その他'; }); } // 色を決めた順（いまの多い順、そのあと上位10の外）
  function curNat() { return natAll().indexOf(S.nat) >= 0 ? S.nat : listed(NAT, S.w)[0]; }
  function mainVisas() { return D.visas.filter(function (v) { return D.subs.indexOf(v) < 0 && v !== 'その他'; }); }
  function fx(v) { return v == null ? null : fmt(v); } // 表の数（数がないときは null →「—」。fmt は null を 0 と書くので使わない）
  function pct(v, t) { return v == null || !t ? '—' : (v / t * 100).toFixed(1) + '%'; }
  function rate(v, b) { return b ? signed((v - b) / b * 100, 1) + '%' : '—'; }
  function help(t) { return el('p', 'dhelp', esc(t)); }
  function when(t) { return el('p', 'fwhen', esc(t)); } // 見出しの下の「いつ・どこ」の札
  function srcLine(w) { var r = rel(w); return el('p', 'dsrc', esc('出典：出入国在留管理庁「' + r.title + '」（報道発表、' + pubText(r.pub) + '公表）') + ' <a href="' + esc(r.page) + '">発表のページ</a>'); }
  function srcAll() { return el('p', 'dsrc', esc('出典：' + SRC + '（各発表）')); }
  // 数がないわけ（0人ではない）
  function why(dim, w) {
    if (D.W.indexOf(w) < 0) { return w < '2021' ? '2020年までは毎年1月1日の数だけが発表されています' : 'この時点の数は発表されていません'; }
    return dim === NAT ? 'この時点の上位10に入っていないため、数が発表されていません' : '';
  }
  // 画像を保存（share.js）に渡すもの。タイトルはここで決める（share.js の自動のタイトルは在留外国人統計の言い方になるため）
  function cur(chart, title, note) { if (note) { chart.markNote = note; } return { title: title, autoTitle: title, chart: chart, meta: { nat: [], visa: [] }, src: SRC, tag: TAG }; }
  function tools(get) { var t = el('div', 'dtools'); if (window.KZX) { window.KZX.buttons(t, get); } return t; }
  function upDown(tw) { tw.querySelectorAll('td').forEach(function (td) { if (/^[+↑]/.test(td.textContent)) { td.classList.add('up'); } else if (/^[−↓]/.test(td.textContent)) { td.classList.add('down'); } }); tw.querySelector('table').classList.add('srank'); return tw; }
  function lineData(per, series) { // 画像の折れ線
    return { kind: 'line', per: per, labels: per.map(dl), at: per.map(dx), series: series.map(function (s) { return { name: s.name, vals: s.vals, cls: s.cls, dash: s.dash }; }),
      index: false, area: '全国', when: per[per.length - 1], from: per[0], whenText: dl(per[0]) + '〜' + dl(per[per.length - 1]) };
  }

  // ---------- 部品
  // たたんだ欄。中身は開いたときに作る（閉じたまま作ると、グラフの幅が分からないため）
  function fold(key, summary, build) {
    var d = el('details', 'kfold'), done = false;
    d.appendChild(el('summary', null, esc(summary)));
    function fill() {
      if (done || !d.open) { return; }
      done = true;
      var b = el('div', 'kfoldin');
      try { build(b); } catch (e) { console.error(e); b.appendChild(Z.nodata('この部分を表示できませんでした')); }
      d.appendChild(b);
    }
    d.addEventListener('toggle', function () { OPEN[key] = d.open; fill(); });
    if (OPEN[key]) { d.open = true; fill(); }
    return d;
  }
  // 見方を切り替えるボタン（選んでいるものは緑・✓）
  function views(opts, v, on) {
    var p = el('div', 'dpick kviews'); p.setAttribute('role', 'group');
    opts.forEach(function (o) {
      var b = el('button', null, esc(o[1])); b.type = 'button'; b.setAttribute('aria-pressed', o[0] === v ? 'true' : 'false');
      b.addEventListener('click', function () { if (o[0] !== v) { on(o[0]); } });
      p.appendChild(b);
    });
    return p;
  }
  function sel(lab, v, opts, on) {
    var l = el('label', 'dctl'), s = el('select');
    opts.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
    s.value = v; s.addEventListener('change', function () { on(s.value); });
    l.appendChild(el('span', 'dlab', esc(lab))); l.appendChild(s); return l;
  }
  // 国籍・地域を選ぶ欄（その時点の上位10と、ほかの時点で上位10に入ったもの）
  function natSelect(lab) {
    var l = el('label', 'dctl'), s = el('select'), top = listed(NAT, S.w);
    var g1 = el('optgroup'); g1.label = dl(S.w) + 'の上位10（多い順）';
    top.forEach(function (n) { var o = el('option'); o.value = n; o.textContent = n; g1.appendChild(o); });
    s.appendChild(g1);
    var others = natAll().filter(function (n) { return top.indexOf(n) < 0; });
    if (others.length) {
      var g2 = el('optgroup'); g2.label = 'ほかの時点で上位10に入ったもの';
      others.forEach(function (n) { var o = el('option'); o.value = n; o.textContent = n; g2.appendChild(o); });
      s.appendChild(g2);
    }
    s.value = curNat(); s.addEventListener('change', function () { set({ nat: s.value }); });
    l.appendChild(el('span', 'dlab', esc(lab))); l.appendChild(s); return l;
  }
  // いくつか選ぶ欄。名前で探せる。「この条件で表示」で決める
  function multi(label, all, picked, max, onOk, name) {
    var ms = el('div', 'dctl dmulti'), btn = el('button', 'dmbtn'), panel = el('div', 'dmpanel'), list = el('div', 'dmlist'), chosen = picked.slice();
    btn.type = 'button'; btn.textContent = picked.length === 1 ? picked[0] : picked[0] + ' ほか' + (picked.length - 1);
    ms.appendChild(el('span', 'dlab', esc(label))); ms.appendChild(btn);
    all.forEach(function (n) {
      var l = el('label', 'dmitem'), cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.indexOf(n) >= 0;
      cb.addEventListener('change', function () { if (cb.checked) { chosen.push(n); } else { chosen = chosen.filter(function (x) { return x !== n; }); } });
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + name(n))); l.dataset.n = n; list.appendChild(l);
    });
    var q = el('input'); q.type = 'search'; q.placeholder = '名前で探す'; q.setAttribute('aria-label', label + 'を名前で探す');
    q.addEventListener('input', function () { var t = q.value.trim(); Array.prototype.forEach.call(list.children, function (x) { x.hidden = !!t && x.dataset.n.indexOf(t) < 0; }); });
    var ok = el('button', 'dbtn', esc('この条件で表示（' + max + 'つまで）')); ok.type = 'button';
    ok.addEventListener('click', function () { onOk(all.filter(function (n) { return chosen.indexOf(n) >= 0; }).slice(0, max)); });
    panel.appendChild(q); panel.appendChild(list); var bar = el('div', 'dmbar'); bar.appendChild(ok); panel.appendChild(bar); ms.appendChild(panel);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); ms.classList.toggle('open'); if (ms.classList.contains('open')) { Z.fitPanel(panel); } });
    return ms;
  }
  document.addEventListener('click', function (ev) { root.querySelectorAll('.dmulti.open').forEach(function (m) { if (!m.contains(ev.target)) { m.classList.remove('open'); } }); });
  // 横棒の一覧：順位・名前・棒・人数・割合を1行に（スマホでは棒を名前の下へ）。
  // items：{rk：順位, name, sub：名前の下の小さな字, v（null は公表データなし）, st：色, on：選んでいる, click：名前を押したとき, rest：「その他」, out：上位10の外, kids：内わけ（技能実習の号）}
  // opt：{total：割合の分母, color：棒をそれぞれの色にする（ないときは、選んでいるものだけ色。ほかは灰色）, key：内わけを開いたかを覚える名前}
  function rankList(items, opt) {
    var ul = el('ul', 'krank frank'), mx = Math.max.apply(null, items.map(function (x) { return x.v || 0; }).concat([1]));
    function row(x, kid) {
      var li = el('li', [x.rest ? 'rest' : '', x.out ? 'none' : '', x.on ? 'on' : '', kid ? 'kid' : ''].join(' ').trim() || null), st = x.st || { cls: 'o' };
      var fc = (opt.color || x.on) && !x.rest ? ' c' + st.cls + (st.dash ? ' dash' : '') : '';
      li.innerHTML = '<span class="rk">' + (x.rk ? x.rk + '<small>位</small>' : '') + '</span>' +
        '<span class="nm">' + (x.on ? '<span class="fon" title="選んでいる国籍・地域">✓ </span>' : '') + (x.click ? '<button type="button" class="flink">' + esc(x.name) + '</button>' : esc(x.name)) +
        (x.sub ? '<span class="sub">' + esc(x.sub) + '</span>' : '') + '</span>' +
        '<span class="track">' + (x.v == null ? '' : '<span class="fill' + fc + '" style="width:' + (x.v / mx * 100).toFixed(1) + '%"></span>') + '</span>' +
        (x.v == null ? '<span class="v fnone">' + NOPUB + '</span><span class="p"></span>' :
          '<span class="v">' + fmt(x.v) + '<small>人</small></span><span class="p">' + (opt.total ? pct(x.v, opt.total) : '') + '</span>');
      if (x.click) { li.querySelector('.flink').addEventListener('click', x.click); }
      return li;
    }
    items.forEach(function (x) {
      var li = row(x); ul.appendChild(li);
      if (!x.kids || !x.kids.length) { return; }
      var key = 'kids' + (opt.key || ''), b = el('button', 'fkids'), kl = x.kids.map(function (k) { var l = row(k, true); ul.appendChild(l); return l; });
      function show() { kl.forEach(function (l) { l.hidden = !OPEN[key]; }); b.setAttribute('aria-expanded', OPEN[key] ? 'true' : 'false'); b.textContent = OPEN[key] ? '号別の内わけを閉じる' : '号別の内わけを見る'; }
      b.type = 'button'; b.addEventListener('click', function () { OPEN[key] = !OPEN[key]; show(); }); show();
      li.querySelector('.nm').appendChild(b);
    });
    return ul;
  }
  // 在留資格の棒の行。get(在留資格)：人数。sub(在留資格)：名前の下の字（あるときは、全国の並びにそろえた一覧なので順位を書かない）。
  // 技能実習には号の内わけを付ける（号は技能実習の内数なので、ほかと足さない）
  function visaItems(names, get, sub) {
    var k = 0;
    return names.map(function (q) {
      var it = { name: q === 'その他' ? 'その他の在留資格' : q, v: get(q), st: sty(VISA, q), rest: q === 'その他', rk: q === 'その他' || sub ? null : ++k, sub: sub ? sub(q) : '' };
      if (q === '技能実習') {
        it.kids = D.subs.map(function (s) { return { name: 'うち ' + s.replace('技能実習', ''), v: get(s), st: sty(VISA, '技能実習') }; }).filter(function (x) { return x.v != null; });
      }
      return it;
    });
  }
  // 大事な数の欄。v：数の HTML（null は公表データなし）、sub：下の小さな字、cls：欄の幅など（fwide：2つ分の幅）
  function kpi(label, v, sub, cls) {
    var d = el('div', 'fbox' + (cls ? ' ' + cls : ''));
    d.appendChild(el('span', 'flab', esc(label)));
    d.appendChild(v == null ? el('b', 'fnone', NOPUB) : el('b', null, v));
    if (sub) { d.appendChild(el('span', 'fsub', esc(sub))); }
    return d;
  }
  // 増減の欄。bw：比べる時点（発表のない時点でもよい）、now：いまの数、get(時点)：その時点の数、tot：割合も書くときの、いまの総数
  function chgBox(label, bw, now, get, dim, tot) {
    var b = D.W.indexOf(bw) >= 0 ? get(bw) : null, head = label + '（' + dl(bw) + '）から', cls = tot ? 'fwide' : '';
    if (now == null) { return kpi(head, null, '', cls); }
    if (b == null) { return kpi(head, null, why(dim, bw), cls); }
    var s = '増減率 ' + rate(now, b) + '（' + fmt(b) + '人 → ' + fmt(now) + '人）';
    if (tot) { s += '\n全国に占める割合 ' + pct(b, val(NAT, '総数', bw)) + ' → ' + pct(now, tot); }
    return kpi(head, signed(now - b) + '<small>人</small>', s, cls);
  }
  // 新規・減少の流れ。r：[名前, 新規, その時点の数, 前の時点の数, 継続, 減少]
  function flow(r, pw, w) {
    var box = el('div'), g = el('div', 'fflow');
    g.appendChild(kpi('新規', fmt(r[1]) + '<small>人</small>', dl(pw) + 'のあとに新しく分かり、' + dl(w) + 'も不法残留している人'));
    g.appendChild(kpi('減少', fmt(r[5]) + '<small>人</small>', dl(pw) + 'にいた人のうち、' + dl(w) + 'までに数から外れた人'));
    g.appendChild(kpi('継続', fmt(r[4]) + '<small>人</small>', dl(pw) + 'にも' + dl(w) + 'にも不法残留している人'));
    box.appendChild(g);
    box.appendChild(el('p', 'feq', esc(dl(pw) + ' ' + fmt(r[3]) + '人') + ' − 減少 ' + fmt(r[5]) + '人 ＋ 新規 ' + fmt(r[1]) + '人 ＝ <b>' + esc(dl(w) + ' ' + fmt(r[2]) + '人') + '</b>' +
      '<span class="sub">（差し引き ' + signed(r[2] - r[3]) + '人）</span>'));
    return box;
  }

  // ---------- 上：時点と国籍・地域（画面の上に残る。変えるとページ全体が変わる）
  function controls() {
    var f = el('div', 'dfilter kctl fctl'), latest = D.R[D.R.length - 1];
    f.appendChild(sel('時点（発表）', S.w, D.R.slice().reverse().map(function (w) { return [w, dl(w)]; }), function (x) { set({ w: x }); }));
    f.appendChild(natSelect('国籍・地域'));
    f.appendChild(el('p', 'kctlhelp', '選ぶと、ページ全体がその時点・国籍・地域に変わります'));
    var acts = el('div', 'dctl dacts'); acts.appendChild(resetBtn()); f.appendChild(acts);
    return f;
  }
  // リセット（パソコンでは上の欄、スマホでは上の欄を広く使うため ① の欄に置く）
  function resetBtn() {
    var latest = D.R[D.R.length - 1], plain = Object.keys(DEF).every(function (k) { return k === 'w' ? S.w === latest : JSON.stringify(S[k]) === JSON.stringify(DEF[k]); });
    var b = el('button', 'dbtn dbtn-sub', 'リセット'); b.type = 'button'; b.disabled = plain;
    b.title = plain ? '選んでいる条件はありません' : '時点・国籍・地域・比べるものなどを、はじめの状態に戻します';
    b.addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEF)); S.w = latest; OPEN = {}; render(); });
    return b;
  }

  // ---------- ① 全国の総数と、半年前・1年前からの増減（いちばん大事な数）
  function totalSec(c) {
    var w = S.w, t = val(NAT, '総数', w), r = rel(w), get = function (x) { return val(NAT, '総数', x); };
    c.appendChild(el('h2', null, '日本に不法残留者は何人いる？'));
    c.appendChild(el('p', 'klab', esc(dl(w) + '現在の不法残留者数（全国）')));
    c.appendChild(el('p', 'kbig', fmt(t) + '<small>人</small>'));
    var g = el('div', 'fchg');
    g.appendChild(chgBox('半年前', shift(w, 6), t, get, NAT));
    g.appendChild(chgBox('1年前', shift(w, 12), t, get, NAT));
    c.appendChild(g);
    c.appendChild(help(pubText(r.pub) + 'に公表された数です。在留期間が過ぎたあとも日本から出国していない外国人の数（国が出した概数）で、在留外国人の数には入っていません。'));
    var nav = el('nav', 'ftoc'); nav.id = 'toc'; nav.setAttribute('aria-label', 'このページの内容');
    [['nat', '国籍別'], ['visa', '在留資格別'], ['trend', '推移'], ['new', '新規・減少']].forEach(function (x) { var a = el('a', null, esc(x[1])); a.href = '#' + x[0]; nav.appendChild(a); });
    c.appendChild(nav);
    c.appendChild(el('p', 'fmore', 'ほかに：<a href="#detail">' + esc(curNat()) + 'のくわしい数</a><a href="#more">くわしい数と過去の発表</a><a href="#notes">出典と注意</a>'));
    var rs = el('p', 'fmreset'); rs.appendChild(resetBtn()); rs.firstChild.textContent = '選んだ条件をリセット'; c.appendChild(rs);
  }

  // ---------- ② 国籍・地域別ランキング（その時点の上位10とその他）
  function natSec(c) {
    var w = S.w, names = listed(NAT, w), total = val(NAT, '総数', w), other = val(NAT, 'その他', w), n = curNat();
    c.appendChild(el('h2', null, 'どの国籍・地域の人が多い？'));
    c.appendChild(when(dl(w) + '現在・全国'));
    c.appendChild(help('国の発表にのっている、人数の多い10の国籍・地域と、それ以外をまとめた「その他」です。名前を押すと、その国籍・地域のくわしい数が下に出ます。'));
    var items = names.map(function (x, k) { return { rk: k + 1, name: x, v: val(NAT, x, w), st: sty(NAT, x), on: x === n, click: pickNat(x) }; });
    items.push({ name: 'その他', sub: '上位10以外の国籍・地域の合計', v: other, rest: true });
    if (names.indexOf(n) < 0) {
      var nv = val(NAT, n, w);
      items.push({ name: n, sub: '上位10の外' + (nv == null ? '' : EXTRA[n + '|' + w] ? '（新規不法残留者の表にのっている数。「その他」の内数）' : ''), v: nv, st: sty(NAT, n), on: true, out: true, click: pickNat(n) });
    }
    c.appendChild(rankList(items, { total: total }));
    c.appendChild(help('割合は、全国の不法残留者数（' + fmt(total) + '人）に対する割合です。'));
    var chart = { kind: 'rank', rows: names.map(function (x) { return [x, val(NAT, x, w)]; }), f: function (v) { return fmt(v) + '人'; }, metric: '人数', area: '全国', when: w, what: '全国の国籍・地域', whenText: dl(w) + '現在' };
    c.appendChild(tools(function () { return cur(chart, '全国｜不法残留者の国籍・地域別人数（上位10）', 'ほかの国籍・地域（その他）は合わせて' + fmt(other) + '人。'); }));
    c.appendChild(fold('natpie', '構成を円グラフで見る', function (b) {
      var used = {}, parts = [], mid = 0, midR = [];
      names.forEach(function (x, k) { var st = sty(NAT, x), v = val(NAT, x, w); if (parts.length < 7 && !st.dash && !used[st.cls]) { used[st.cls] = 1; parts.push({ name: x, v: v, cls: st.cls }); } else { mid += v; midR.push(k + 1); } });
      if (mid > 0) { parts.push({ name: midR.length === midR[midR.length - 1] - midR[0] + 1 ? midR[0] + '〜' + midR[midR.length - 1] + '位の合計' : 'ほかの上位10の合計', v: mid, cls: 'o' }); }
      if (other > 0) { parts.push({ name: 'その他（上位10の外）', v: other, cls: 'o' }); }
      b.appendChild(Z.pieChart(parts, total, dl(w) + '現在の国籍・地域別の構成'));
      var pie = { kind: 'pie', parts: parts, total: total, area: '全国', when: w, whenText: dl(w) + '現在' };
      b.appendChild(tools(function () { return cur(pie, '全国｜不法残留者の国籍・地域別構成', ''); }));
    }));
    c.appendChild(fold('nattbl', '表で見る（半年前・1年前からの増減、順位の動き）', function (b) {
      var pw = ago(w, 6), yw = ago(w, 12), pr = prevRel(w), prevNames = pr ? listed(NAT, pr) : [];
      var rows = names.map(function (x, k) {
        var v = val(NAT, x, w), p = pw ? val(NAT, x, pw) : null, y = yw ? val(NAT, x, yw) : null, q = prevNames.indexOf(x);
        return [k + 1, x, fmt(v), pct(v, total), p == null ? null : signed(v - p), p == null ? null : rate(v, p), y == null ? null : signed(v - y), y == null ? null : rate(v, y),
          !prevNames.length ? null : q < 0 ? '前回は上位10の外' : q === k ? '→' : q > k ? '↑' + (q - k) : '↓' + (k - q)];
      });
      rows.push(['', 'その他（上位10の外）', fmt(other), pct(other, total), null, null, null, null, null]);
      var tp = pw ? val(NAT, '総数', pw) : null, ty = yw ? val(NAT, '総数', yw) : null;
      rows.push(['', '総数', fmt(total), '100.0%', tp == null ? null : signed(total - tp), tp == null ? null : rate(total, tp), ty == null ? null : signed(total - ty), ty == null ? null : rate(total, ty), null]);
      b.appendChild(upDown(Z.tableEl(['順位', '国籍・地域', '人数', '割合', '半年前から（' + dl(shift(w, 6)) + '）', '増減率', '1年前から（' + dl(shift(w, 12)) + '）', '増減率', '順位の動き'], rows, 2)));
      b.appendChild(help('「—」は数が発表されていない所です（0人ではありません）。2020年までは1月1日の数だけなので、2021年1月1日の「半年前」と2021年7月1日の「1年前」はありません。前の時点の上位10に入っていなかった国籍・地域も「—」です。「その他」は発表ごとに中身が違うので、比べていません。'));
    }));
    c.appendChild(fold('grow' + NAT, '増減ランキング（半年前・1年前と比べて、どの国籍・地域が増えた・減った？）', function (b) { growBlock(b, NAT); }));
    c.appendChild(srcLine(w));
  }
  function pickNat(x) { return function () { set({ nat: x }); go('detail'); }; }

  // ---------- ③ 選んだ国籍・地域のくわしい数（1か所にまとめる）
  function detailSec(c) {
    var w = S.w, n = curNat(), st = sty(NAT, n), total = val(NAT, '総数', w), v = val(NAT, n, w), rk = listed(NAT, w).indexOf(n);
    var get = function (x) { return val(NAT, n, x); };
    c.appendChild(el('h2', 'fnath', '<span class="sw sw-' + st.cls + (st.dash ? ' swdash' : '') + '"></span>' + esc(n) + 'の不法残留者'));
    c.appendChild(when(dl(w) + '現在・' + n));
    var row = el('div', 'dctlrow'); row.appendChild(natSelect('ほかの国籍・地域を選ぶ')); c.appendChild(row);
    var g = el('div', 'fkpis'), m = sexVal('男', n, w), f = sexVal('女', n, w);
    g.appendChild(kpi('人数', v == null ? null : fmt(v) + '<small>人</small>', v == null ? why(NAT, w) : rk >= 0 ? '全国で' + (rk + 1) + '位' : '上位10の外（新規不法残留者の表にのっている数）'));
    g.appendChild(kpi('全国に占める割合', v == null ? null : pct(v, total), '全国の不法残留者 ' + fmt(total) + '人のうち'));
    g.appendChild(kpi('男女別', m == null ? null : '男 ' + fmt(m) + '<small>人</small><br>女 ' + fmt(f) + '<small>人</small>', m == null ? '男女別の数は、その時点の上位10の国籍・地域だけが発表されています' : '男 ' + pct(m, m + f) + '・女 ' + pct(f, m + f), 'fsex'));
    g.appendChild(chgBox('半年前', shift(w, 6), v, get, NAT, total));
    g.appendChild(chgBox('1年前', shift(w, 12), v, get, NAT, total));
    c.appendChild(g);

    // 不法残留になったときの在留資格
    var x = (D.cross[w] || {})[n], nt = x ? x['総数'] : null;
    c.appendChild(el('h3', null, esc('不法残留になったときの在留資格（' + dl(w) + '現在）')));
    if (!x) { c.appendChild(Z.nodata(NOPUB + '：在留資格別の数は、その時点の上位10の国籍・地域だけが発表されています')); } else {
      var vs = listed(VISA, w).concat(['その他']);
      c.appendChild(rankList(visaItems(vs, function (q) { return x[q]; }, function (q) { return '全国では ' + pct(val(VISA, q, w), total); }), { total: nt, color: true, key: 'detail' }));
      c.appendChild(help('割合は、' + n + 'の不法残留者（' + fmt(nt) + '人）に対する割合です。「全国では」は、全国の不法残留者に対する割合です（比べるため）。並びは、どの国籍・地域でも全国の多い順にそろえています。' + VNOTE));
      var parts = vs.filter(function (q) { return x[q] > 0; }).map(function (q) { return { name: q === 'その他' ? 'その他の在留資格' : q, v: x[q], cls: sty(VISA, q).cls }; });
      var pie = { kind: 'pie', parts: parts, total: nt, area: '全国', when: w, whenText: dl(w) + '現在' };
      c.appendChild(tools(function () { return cur(pie, '全国｜' + who(n) + 'の在留資格別構成', VNOTE); }));
    }

    // 人数の移り変わり
    var W = D.W, vals = W.map(get), s1 = [{ name: n, vals: vals, cls: st.cls, dash: st.dash }], gap = vals.some(function (q) { return q == null; });
    var ex = W.filter(function (q) { return EXTRA[n + '|' + q]; });
    c.appendChild(el('h3', null, esc(n + 'の人数の移り変わり（' + dl(W[0]) + '〜' + dl(W[W.length - 1]) + '）')));
    c.appendChild(Z.lineChart(W, s1, { title: n + 'の不法残留者数の移り変わり', at: W.map(dx), lab: function (i) { return dl(W[i]); } }));
    c.appendChild(help('2020年までは毎年1月1日、2021年からは1月1日と7月1日の数です。' + (gap ? '線が切れている所は、上位10に入らず数が発表されていない時点です（0人ではありません）。' : '') +
      (ex.length ? ex.map(dl).join('・') + 'の数は、上位10の外ですが、新規不法残留者の表にのっている数です。' : '')));
    var lc = lineData(W, s1);
    c.appendChild(tools(function () { return cur(lc, '全国｜' + n + 'の不法残留者数の移り変わり', gap ? '線が切れている所は、上位10に入らず数が発表されていない時点です。' : ''); }));
    c.appendChild(fold('dsex', n + 'の男女別の移り変わり', function (b) {
      var ss = [['男', '1'], ['女', '5']].map(function (q) { return { name: n + '（' + q[0] + '）', vals: W.map(function (x2) { return sexVal(q[0], n, x2); }), cls: q[1] }; });
      b.appendChild(Z.lineChart(W, ss, { title: n + 'の男女別の不法残留者数の移り変わり', at: W.map(dx), lab: function (i) { return dl(W[i]); } }));
      var c2 = lineData(W, ss);
      b.appendChild(tools(function () { return cur(c2, '全国｜' + n + 'の不法残留者数の移り変わり（男女別）', ''); }));
    }));
    c.appendChild(fold('dvisa', n + 'の在留資格別の移り変わり（' + dl(D.R[0]) + '〜）', function (b) {
      var R = D.R, vs2 = listed(VISA, R[R.length - 1]).concat(['その他']);
      var ss = vs2.map(function (q) { var s2 = sty(VISA, q); return { name: q === 'その他' ? 'その他の在留資格' : q, vals: R.map(function (x2) { var y = (D.cross[x2] || {})[n]; return y ? y[q] : null; }), cls: s2.cls, dash: s2.dash }; });
      b.appendChild(help(VNOTE + '国籍・地域ごとの在留資格の数は、' + dl(R[0]) + 'の発表からで、その時点の上位10に入っているときだけ発表されています（ない時点は線が切れます）。'));
      b.appendChild(Z.lineChart(R, ss, { title: n + 'の在留資格別の不法残留者数の移り変わり', at: R.map(dx), lab: function (i) { return dl(R[i]); } }));
      var c3 = lineData(R, ss);
      b.appendChild(tools(function () { return cur(c3, '全国｜' + who(n) + 'の在留資格別の移り変わり', VNOTE); }));
      b.appendChild(Z.details('グラフの元の数を表で見る', Z.tableEl(['時点'].concat(ss.map(function (s2) { return s2.name; })), R.slice().reverse().map(function (x2) {
        var j = R.indexOf(x2); return [dl(x2)].concat(ss.map(function (s2) { return s2.vals[j] == null ? null : fmt(s2.vals[j]); }));
      }), 1)));
    }));
    c.appendChild(fold('dtbl', n + 'の人数・男女・割合を表で見る（' + dl(W[0]) + '〜）', function (b) {
      b.appendChild(Z.tableEl(['時点', '人数', '全国に占める割合', '男', '女'], W.slice().reverse().map(function (x2) {
        var q = get(x2); return [dl(x2), q == null ? null : fmt(q) + (EXTRA[n + '|' + x2] ? '※' : ''), q == null ? null : pct(q, val(NAT, '総数', x2)), fx(sexVal('男', n, x2)), fx(sexVal('女', n, x2))];
      }), 1));
      b.appendChild(help('「—」は数が発表されていない所です（0人ではありません）。' + (ex.length ? '※は、上位10の外で、新規不法残留者の表にのっている数です（男女別はありません）。' : '')));
    }));

    // 新規・減少
    var nw = D.new[w], pw = nw ? newPrev(w) : null, r = nw ? nw[NAT].filter(function (q) { return q[0] === n; })[0] : null;
    c.appendChild(el('h3', null, esc(n + 'の新規・減少' + (pw ? '（' + dl(pw) + ' → ' + dl(w) + '、' + span(pw, w) + '間）' : ''))));
    if (!nw) { c.appendChild(Z.nodata('新規・減少の数は、' + Object.keys(D.new).sort().map(function (q) { return dl(q) + '現在'; }).join('・') + 'の発表にだけあります（上の「時点」で選べます）')); }
    else if (!r) { c.appendChild(Z.nodata(NOPUB + '：この発表の新規・減少の表には、新規の人の多い10の国籍・地域だけがのっています（' + n + 'は入っていません）')); }
    else if (!pw) { c.appendChild(Z.nodata('比べている前の時点が分かりません')); }
    else { c.appendChild(flow(r, pw, w)); c.appendChild(help('新規・減少の意味は、下の「新規・減少」の欄にあります。')); }
    c.appendChild(srcLine(w));
  }

  // ---------- ④ 在留資格別ランキング（全国と、選んだ国籍・地域を切り替え）
  function visaSec(c) {
    var w = S.w, n = curNat(), byNat = S.vv === 'n', total = val(VISA, '総数', w), x = (D.cross[w] || {})[n];
    c.appendChild(el('h2', null, 'どの在留資格で不法残留になった？'));
    c.appendChild(when(dl(w) + '現在・' + (byNat ? n : '全国')));
    c.appendChild(el('div', 'kbox', '<b>不法残留になったときにもっていた在留資格</b>です（いまの在留資格ではありません）。「留学」には、昔の在留資格「就学」（2010年7月より前）だった人も入ります。'));
    c.appendChild(views([['', '全国'], ['n', n + 'だけ']], byNat ? 'n' : '', function (q) { set({ vv: q }, ['visa']); }));
    var get = byNat ? function (q) { return x ? x[q] : null; } : function (q) { return val(VISA, q, w); }, t = byNat ? (x ? x['総数'] : null) : total;
    if (byNat && !x) { c.appendChild(Z.nodata(NOPUB + '：' + dl(w) + 'の発表では、在留資格別の数は上位10の国籍・地域だけです（' + n + 'は入っていません）')); c.appendChild(srcLine(w)); return; }
    var vs = mainVisas().sort(function (a, b) { return (get(b) || 0) - (get(a) || 0); }), all = vs.concat(['その他']);
    c.appendChild(rankList(visaItems(all, get), { total: t, color: true, key: byNat ? 'vn' : 'v' }));
    c.appendChild(help('割合は、' + (byNat ? n + 'の不法残留者（' + fmt(t) + '人）' : '全国の不法残留者数（' + fmt(t) + '人）') + 'に対する割合です。「その他」は、ここに名前の出ていない在留資格を合わせた数です。' +
      '技能実習の「号別の内わけを見る」を押すと、1号・2号・3号（イ・ロ）の数が出ます（技能実習の内数です）。'));
    var title = byNat ? '全国｜' + who(n) + 'の在留資格別人数' : '全国｜不法残留者の在留資格別人数';
    var chart = { kind: 'rank', rows: vs.map(function (q) { return [q, get(q)]; }), f: function (v) { return fmt(v) + '人'; }, metric: '人数', area: '全国', when: w, what: (byNat ? n : '全国') + 'の在留資格', whenText: dl(w) + '現在' };
    c.appendChild(tools(function () { return cur(chart, title, VNOTE + 'その他の在留資格は' + fmt(get('その他')) + '人。'); }));
    c.appendChild(fold('visapie', '構成を円グラフで見る', function (b) {
      var parts = all.filter(function (q) { return get(q) > 0; }).map(function (q) { return { name: q === 'その他' ? 'その他の在留資格' : q, v: get(q), cls: sty(VISA, q).cls }; });
      b.appendChild(Z.pieChart(parts, t, dl(w) + '現在の在留資格別の構成'));
      var pie = { kind: 'pie', parts: parts, total: t, area: '全国', when: w, whenText: dl(w) + '現在' };
      b.appendChild(tools(function () { return cur(pie, byNat ? '全国｜' + who(n) + 'の在留資格別構成' : '全国｜不法残留者の在留資格別構成', VNOTE); }));
    }));
    c.appendChild(fold('visatbl', '全国の表で見る（半年前・1年前からの増減、技能実習の号）', function (b) {
      var pw = ago(w, 6), yw = ago(w, 12), rows = [];
      mainVisas().concat(['その他']).forEach(function (q) {
        [q].concat(q === '技能実習' ? D.subs : []).forEach(function (s) {
          var v = val(VISA, s, w), p = pw ? val(VISA, s, pw) : null, y = yw ? val(VISA, s, yw) : null;
          if (v == null) { return; }
          rows.push([s === q ? s : 'うち ' + s, fmt(v), pct(v, total), p == null ? null : signed(v - p), p == null ? null : rate(v, p), y == null ? null : signed(v - y), y == null ? null : rate(v, y)]);
        });
      });
      var tp = pw ? val(VISA, '総数', pw) : null, ty = yw ? val(VISA, '総数', yw) : null;
      rows.push(['総数', fmt(total), '100.0%', tp == null ? null : signed(total - tp), tp == null ? null : rate(total, tp), ty == null ? null : signed(total - ty), ty == null ? null : rate(total, ty)]);
      b.appendChild(upDown(Z.tableEl(['在留資格', '人数', '割合', '半年前から（' + dl(shift(w, 6)) + '）', '増減率', '1年前から（' + dl(shift(w, 12)) + '）', '増減率'], rows, 1)));
      b.appendChild(help('「うち」の行は技能実習の内数です（ほかの行と足しません）。「—」は数が発表されていない所です。'));
    }));
    c.appendChild(fold('grow' + VISA, '増減ランキング（半年前・1年前と比べて、どの在留資格が増えた・減った？）', function (b) { growBlock(b, VISA); }));
    c.appendChild(fold('cross', '国籍・地域 × 在留資格の表（' + dl(w) + '現在）', function (b) {
      var xx = D.cross[w], nats = Object.keys(xx).filter(function (a) { return a !== '総数' && a !== 'その他'; }).concat(['その他', '総数']), cols = mainVisas().concat(['その他']);
      b.appendChild(Z.tableEl(['国籍・地域', '総数'].concat(cols.map(function (q) { return q === 'その他' ? 'その他の在留資格' : q; })), nats.map(function (a) {
        return [a === 'その他' ? 'その他（上位10の外）' : a, fx(xx[a]['総数'])].concat(cols.map(function (q) { return fx(xx[a][q]); }));
      }), 1));
      b.appendChild(help(VNOTE + '技能実習の号ごとの数は、技能実習の欄の「号別の内わけを見る」や、GitHub の表（データ/不法残留/国籍_在留資格.csv）にあります。'));
    }));
    c.appendChild(srcLine(w));
  }

  // 増減ランキング（人数と増減率は別々に）
  function growBlock(b, dim) {
    var w = S.w, cmp = S.cmp === 'year' ? 'year' : 'half', bw = ago(w, cmp === 'year' ? 12 : 6), names = listed(dim, w);
    b.appendChild(views([['half', '半年前と比べる'], ['year', '1年前と比べる']], cmp, function (q) { set({ cmp: q }, ['nat', 'visa']); }));
    var rows = bw ? names.map(function (n) { var v = val(dim, n, w), p = val(dim, n, bw); return p == null ? null : { n: n, v: v, b: p, d: v - p, r: p ? (v - p) / p * 100 : null }; }).filter(Boolean) : [];
    if (!rows.length) { b.appendChild(Z.nodata('比べる時点（' + dl(shift(w, cmp === 'year' ? 12 : 6)) + '）の数がありません（2020年までは1月1日の数だけです）')); return; }
    var span = dl(bw) + ' → ' + dl(w);
    b.appendChild(when(span));
    var grid = el('div', 'cols');
    var byD = rows.slice().sort(function (a, c2) { return c2.d - a.d; }), byR = rows.filter(function (r) { return r.r != null; }).sort(function (a, c2) { return c2.r - a.r; });
    var s1 = el('section', 'dsub'); s1.appendChild(el('h3', null, '増減の人数')); s1.appendChild(Z.barList(byD.map(function (r) { return [r.n, r.d, fmt(r.b) + '人→' + fmt(r.v) + '人']; }), null, { f: function (v) { return signed(v) + '人'; }, rank: true }));
    var s2 = el('section', 'dsub'); s2.appendChild(el('h3', null, '増減率')); s2.appendChild(Z.barList(byR.map(function (r) { return [r.n, r.r, fmt(r.b) + '人→' + fmt(r.v) + '人']; }), null, { f: function (v) { return signed(v, 1) + '%'; }, rank: true }));
    var chart = { kind: 'rank', rows: byD.slice(0, 10).map(function (r) { return [r.n, r.d]; }), f: function (v) { return signed(v) + '人'; }, metric: '増減の人数', area: '全国', when: w, what: '全国の' + dim, whenText: span };
    var chart2 = { kind: 'rank', rows: byR.slice(0, 10).map(function (r) { return [r.n, r.r]; }), f: function (v) { return signed(v, 1) + '%'; }, metric: '増減率', area: '全国', when: w, what: '全国の' + dim, whenText: span };
    var note = dim === VISA ? VNOTE : '';
    // 画像を保存するボタンは、どちらの画像か分かるように、それぞれのランキングのすぐ下に置く
    s1.appendChild(tools(function () { return cur(chart, '全国｜不法残留者の' + by(dim) + '増減', note); }));
    s2.appendChild(tools(function () { return cur(chart2, '全国｜不法残留者の' + by(dim) + '増減率', note); }));
    grid.appendChild(s1); grid.appendChild(s2); b.appendChild(grid);
    b.appendChild(help('増減の人数と増減率は別のものです。増減率は、もとの人数が少ないと大きく出ます。比べているのは、' + dl(w) + 'の発表で名前の出ている' + dim + 'のうち、' + dl(bw) + 'の数があるものだけです。'));
  }

  // ---------- ⑤ 全国の推移（国籍・地域別、在留資格別はたたむ）
  function trendSec(c) {
    var per = D.W, from = per.indexOf(S.from) >= 0 ? S.from : per[0], to = per.indexOf(S.to) >= 0 ? S.to : per[per.length - 1];
    if (from > to) { var tmp = from; from = to; to = tmp; }
    var sub = per.filter(function (w) { return w >= from && w <= to; }), lab = function (i) { return dl(sub[i]); };
    c.appendChild(el('h2', null, '増えている？減っている？'));
    c.appendChild(when(dl(from) + '〜' + dl(to) + '・全国'));
    var row = el('div', 'dctlrow'), po = per.map(function (w) { return [w, dl(w)]; });
    row.appendChild(sel('いつから', from, po, function (x) { set({ from: x }, ['trend']); }));
    row.appendChild(sel('いつまで', to, po, function (x) { set({ to: x }, ['trend']); }));
    c.appendChild(row);
    var s0 = [{ name: '不法残留者数', vals: sub.map(function (w) { return val(NAT, '総数', w); }), cls: '1' }];
    c.appendChild(Z.lineChart(sub, s0, { title: '不法残留者数の移り変わり', at: sub.map(dx), lab: lab }));
    c.appendChild(help('2020年までは毎年1月1日の数だけです（発表の表にある時点）。2021年からは1月1日と7月1日の年2回です。横の位置は実際の日付どおりで、発表されていない時点を埋めてはいません。' +
      'それより前の数は、発表の資料ではグラフの絵だけで表がないため入れていません（発表のグラフは1990年からで、いちばん多いのは1993年5月1日の298,646人）。'));
    var c0 = lineData(sub, s0);
    c.appendChild(tools(function () { return cur(c0, '全国｜不法残留者数の移り変わり', ''); }));
    c.appendChild(fold('ttbl', 'グラフの元の数を表で見る', function (b) {
      b.appendChild(Z.tableEl(['時点', '不法残留者数', '男', '女'], sub.slice().reverse().map(function (w) { return [dl(w), fx(val(NAT, '総数', w)), fx(sexVal('男', '総数', w)), fx(sexVal('女', '総数', w))]; }), 1));
    }));
    c.appendChild(fold('cmp', '国籍・地域別、在留資格別の推移を比べる', function (b) { cmpBlock(b, sub); }));
    c.appendChild(fold('series', '国籍・地域別、在留資格別の数の表（' + dl(per[0]) + '〜）', function (b) {
      var nats = natAll();
      b.appendChild(el('h3', null, '国籍・地域別'));
      b.appendChild(Z.tableEl(['時点', '総数'].concat(nats, ['その他']), per.slice().reverse().map(function (w) {
        return [dl(w), fmt(val(NAT, '総数', w))].concat(nats.map(function (n) { var q = val(NAT, n, w); return q == null ? null : fmt(q) + (EXTRA[n + '|' + w] ? '※' : ''); }), [val(NAT, 'その他', w) == null ? null : fmt(val(NAT, 'その他', w))]);
      }), 1));
      b.appendChild(help('「—」は、その時点の上位10に入らず数が発表されていない所です（0人ではありません）。※は、上位10の外で、新規不法残留者の表にのっている数です。「その他」は発表ごとに中身（どの国籍・地域が入るか）が違い、2020年までは発表の表にありません。'));
      b.appendChild(el('h3', null, '在留資格別'));
      var vs = mainVisas().concat(['その他'], D.subs);
      b.appendChild(Z.tableEl(['時点', '総数'].concat(vs.map(function (q) { return D.subs.indexOf(q) >= 0 ? 'うち' + q : q; })), per.slice().reverse().map(function (w) {
        return [dl(w), fx(val(VISA, '総数', w))].concat(vs.map(function (q) { return fx(val(VISA, q, w)); }));
      }), 1));
      b.appendChild(help(VNOTE + '「うち」の列は技能実習の内数です。'));
    }));
    c.appendChild(srcAll());
  }
  // 国籍・地域別・在留資格別の推移を比べる（比べるものを選ぶ。国籍・地域は男女も）
  function cmpBlock(b, sub) {
    var dim = S.dim, latest = D.R[D.R.length - 1], top = listed(NAT, latest);
    b.appendChild(views([[NAT, '国籍・地域別'], [VISA, '在留資格別']], dim, function (q) { set({ dim: q, pick: [] }, ['trend']); }));
    var all = dim === NAT ? ['総数'].concat(natAll()) : ['総数'].concat(listed(VISA, latest), ['その他'], D.subs).filter(function (q) { return D.sp[VISA][q]; });
    var pick = S.pick.filter(function (q) { return all.indexOf(q) >= 0; });
    if (!pick.length) { // はじめは、いまの多い5つ（選んでいる国籍・地域が入っていなければ、5つ目と入れかえる）。在留資格は、号を除いた全部
      if (dim === NAT) { pick = top.slice(0, 5); if (pick.indexOf(curNat()) < 0) { pick[4] = curNat(); } } else { pick = listed(VISA, latest).concat(['その他']); }
    }
    var sx = dim === NAT && (S.sex === '男' || S.sex === '女') ? S.sex : '', idx = S.idx === '1';
    var name = function (q) { return q === '総数' ? '総数（不法残留者数）' : dim === VISA && q === 'その他' ? 'その他の在留資格' : D.subs.indexOf(q) >= 0 ? 'うち' + q : q; };
    var series = pick.map(function (q) {
      var vals = sub.map(function (w) { return sx ? sexVal(sx, q, w) : val(dim, q, w); }), st = sty(dim, q);
      if (idx) { var b0 = null; vals.forEach(function (v) { if (b0 == null && v) { b0 = v; } }); vals = vals.map(function (v) { return v == null || !b0 ? null : v / b0 * 100; }); }
      return { name: name(q) + (sx ? '（' + sx + '）' : ''), vals: vals, cls: st.cls, dash: st.dash };
    });
    var row = el('div', 'dctlrow');
    row.appendChild(multi('比べるもの', all, pick, 7, function (q) { set({ pick: q }, ['trend']); }, function (q) { return name(q) + (dim === NAT && q !== '総数' && top.indexOf(q) < 0 ? '（いまは上位10の外）' : ''); }));
    if (dim === NAT) { row.appendChild(sel('男女', sx, [['', '男女の合計'], ['男', '男'], ['女', '女']], function (q) { set({ sex: q }, ['trend']); })); }
    row.appendChild(sel('目もり', idx ? '1' : '', [['', '人数'], ['1', '指数（はじめの時点＝100）']], function (q) { set({ idx: q }, ['trend']); }));
    b.appendChild(row);
    b.appendChild(help((dim === NAT ? '発表には上位10の国籍・地域しかのらないので、上位に入っていなかった時点は線が切れます（0人ではありません）。色は国籍・地域ごとに決めていて、ページのどのグラフでも同じです（8つ目からは同じ色の点線）。' :
      VNOTE + '「うち」の付くものは技能実習の内数です。') + '期間は上の「いつから」「いつまで」で選べます。' + (idx ? '指数は、それぞれの線のはじめの時点を100とした数です（増え方・減り方を比べるため）。' : '')));
    b.appendChild(Z.lineChart(sub, series, { title: by(dim) + 'の移り変わり', at: sub.map(dx), lab: function (i) { return dl(sub[i]); }, index: idx }));
    var title = (pick.length === 1 ? '全国｜' + (pick[0] === '総数' ? '不法残留者数' : who(pick[0])) + 'の移り変わり' : '全国｜不法残留者の' + by(dim) + 'の移り変わり') + (sx ? '（' + sx + '）' : '') + (idx ? '（指数）' : '');
    var chart = lineData(sub, series); chart.index = idx;
    b.appendChild(tools(function () { return cur(chart, title, dim === VISA ? VNOTE : ''); }));
    b.appendChild(Z.details('グラフの元の数を表で見る', Z.tableEl(['時点'].concat(series.map(function (s) { return s.name; })), sub.slice().reverse().map(function (w) {
      var j = sub.indexOf(w); return [dl(w)].concat(series.map(function (s) { var v = s.vals[j]; return v == null ? null : idx ? v.toFixed(1) : fmt(v); }));
    }), 1)));
  }

  // ---------- ⑥ 新規・減少（2026年1月1日の発表から）
  function newSec(c) {
    var w = S.w, nw = D.new[w], ws = Object.keys(D.new).sort(), n = curNat();
    c.appendChild(el('h2', null, '新しく分かった人・数から外れた人（新規・減少）'));
    if (!nw) {
      c.appendChild(when(dl(w) + '現在・全国'));
      c.appendChild(Z.nodata('新規・減少の数は、' + ws.map(function (x) { return dl(x) + '現在'; }).join('・') + 'の発表から出ています（' + dl(w) + '現在の発表にはありません）'));
      var p = el('div', 'dpick kviews');
      ws.slice().reverse().forEach(function (x) { var bt = el('button', null, esc(dl(x) + '現在の新規・減少を見る')); bt.type = 'button'; bt.addEventListener('click', function () { set({ w: x }); go('new'); }); p.appendChild(bt); });
      c.appendChild(p); return;
    }
    var pw = newPrev(w), t = nw[NAT].filter(function (r) { return r[0] === '総数'; })[0];
    if (!pw) { c.appendChild(Z.nodata('比べている前の時点が分かりません')); return; }
    var sp = span(pw, w);
    c.appendChild(when(dl(pw) + ' → ' + dl(w) + '（' + sp + '間）・全国'));
    if (sp !== '半年') { c.appendChild(el('div', 'kbox', esc(dl(w) + '現在の発表の新規・減少は、半年前ではなく' + sp + '前（' + dl(pw) + '）と比べた数です（国の発表の表のとおり）。比べる前の時点は発表ごとに違います。'))); }
    c.appendChild(flow(t, pw, w));
    var ul = el('ul', 'fdefs');
    ul.innerHTML = '<li><b>新規</b>：' + esc(dl(pw)) + 'のあと（その' + sp + 'の間）に新しく分かり、基準日の' + esc(dl(w)) + 'にも不法残留している人です（国の発表のことばで「新規不法残留者」）。</li>' +
      '<li><b>減少</b>：' + esc(dl(pw)) + 'に不法残留していた人のうち、' + esc(dl(w)) + 'までに数から外れた人です。<b>送還された人だけではありません</b>。出国命令で出国した人や、在留特別許可を受けた人なども入ります。</li>' +
      '<li><b>継続</b>：' + esc(dl(pw)) + 'にも' + esc(dl(w)) + 'にも不法残留している人です。</li>';
    c.appendChild(ul);
    c.appendChild(el('div', 'kbox', '新規・減少は、総数の増減とは別の数です。総数の増減（' + esc(dl(pw) + ' → ' + dl(w)) + '：<b>' + signed(t[2] - t[3]) + '人</b>）は、新規から減少を引いた数（' + fmt(t[1]) + '人 − ' + fmt(t[5]) + '人）と同じになります。' +
      '新規が' + fmt(t[1]) + '人いても、それより多くの人が数から外れれば、総数は減ります。'));
    c.appendChild(fold('newnat', '国籍・地域別の新規・減少', function (b) { newBlock(b, NAT, nw, pw, w, n); }));
    c.appendChild(fold('newvisa', '在留資格別の新規・減少', function (b) { newBlock(b, VISA, nw, pw, w, n); }));
    c.appendChild(srcLine(w));
  }
  function newBlock(b, dim, nw, pw, w, n) {
    var rows = nw[dim], t = rows[0], named = rows.filter(function (r) { return r[0] !== '総数' && r[0] !== 'その他' && D.subs.indexOf(r[0]) < 0; });
    b.appendChild(help('新規の人の多い順に、国の発表にのっているものです（上の' + (dim === NAT ? '国籍・地域' : '在留資格') + '別ランキングの上位10とは顔ぶれが違うので、「その他」の中身も違います）。' +
      (dim === VISA ? VNOTE + '「出国期間」は、在留資格を取り消されたあと、出国のために認められた期間のことです。' : '')));
    b.appendChild(el('h3', null, esc('新規の人数（' + dl(pw) + 'のあと〜' + dl(w) + '、' + span(pw, w) + '間）')));
    var items = named.map(function (r, k) {
      var it = { rk: k + 1, name: r[0], v: r[1], sub: dl(w) + 'の' + fmt(r[2]) + '人のうち', st: sty(dim, r[0]), on: dim === NAT && r[0] === n };
      if (dim === VISA && r[0] === '技能実習') { it.kids = rows.filter(function (q) { return D.subs.indexOf(q[0]) >= 0; }).map(function (q) { return { name: 'うち ' + q[0].replace('技能実習', ''), v: q[1], st: sty(VISA, '技能実習') }; }); }
      return it;
    });
    items.push({ name: dim === NAT ? 'その他' : 'その他の在留資格', sub: '名前の出ていないものの合計', v: rows.filter(function (r) { return r[0] === 'その他'; })[0][1], rest: true });
    b.appendChild(rankList(items, { total: t[1], color: dim === VISA, key: 'new' }));
    b.appendChild(help('割合は、新規の人の合計（' + fmt(t[1]) + '人）に対する割合です。'));
    var chart = { kind: 'rank', rows: named.slice(0, 10).map(function (r) { return [r[0], r[1]]; }), f: function (v) { return fmt(v) + '人'; }, metric: '人数', area: '全国', when: w, what: '全国の' + dim, whenText: dl(pw) + 'のあと〜' + dl(w) };
    b.appendChild(tools(function () { return cur(chart, '全国｜新規不法残留者の' + by(dim) + '人数', dim === VISA ? VNOTE : ''); }));
    b.appendChild(Z.details('新規・継続・減少を表で見る', Z.tableEl([dim, '新規', dl(w) + 'の数', 'そのうち新規の割合', dl(pw) + 'の数', '継続', '減少'],
      rows.map(function (r) { return [(D.subs.indexOf(r[0]) >= 0 ? 'うち ' : '') + r[0], fmt(r[1]), fmt(r[2]), r[2] ? pct(r[1], r[2]) : '—', fmt(r[3]), fmt(r[4]), fmt(r[5])]; }), 1)));
  }

  // ---------- ⑦ くわしい数（たたんで置く）
  function moreSec(c) {
    var w = S.w, total = val(NAT, '総数', w);
    c.appendChild(el('h2', null, 'くわしい数と過去の発表'));
    c.appendChild(help('男女別の数、技能実習の号ごとの数、取り込んだ発表の一覧です。見出しを押すと開きます。'));
    c.appendChild(fold('sex', '男女別の数（' + dl(w) + '現在）', function (b) {
      var nats = listed(NAT, w), m0 = sexVal('男', '総数', w), f0 = sexVal('女', '総数', w);
      b.appendChild(Z.tableEl(['国籍・地域', '男', '女', '計', '男の割合', '女の割合'], nats.map(function (n) {
        var m = sexVal('男', n, w), f = sexVal('女', n, w); return [n, fx(m), fx(f), fx(val(NAT, n, w)), pct(m, m + f), pct(f, m + f)];
      }).concat([['総数', fx(m0), fx(f0), fx(total), pct(m0, total), pct(f0, total)]]), 1));
      b.appendChild(help('男女別の数は、その時点の上位10の国籍・地域と総数だけが発表されています。'));
      var W = D.W, ss = [['男', '1'], ['女', '5']].map(function (q) { return { name: q[0], vals: W.map(function (x) { return sexVal(q[0], '総数', x); }), cls: q[1] }; });
      b.appendChild(el('h3', null, esc('全国の男女別の移り変わり（' + dl(W[0]) + '〜）')));
      b.appendChild(Z.lineChart(W, ss, { title: '男女別の不法残留者数の移り変わり', at: W.map(dx), lab: function (i) { return dl(W[i]); } }));
      var c2 = lineData(W, ss);
      b.appendChild(tools(function () { return cur(c2, '全国｜不法残留者数の移り変わり（男女別）', ''); }));
    }));
    c.appendChild(fold('gino', '技能実習の号ごとの数（' + dl(D.W[0]) + '〜）', function (b) {
      b.appendChild(help(VNOTE + '技能実習1号は1年目、2号は2〜3年目、3号は4〜5年目の在留資格です。「イ」は企業単独型、「ロ」は団体監理型です。号ごとの数は技能実習の内数です。'));
      b.appendChild(Z.tableEl(['時点', '技能実習'].concat(D.subs.map(function (s) { return s.replace('技能実習', ''); })), D.W.slice().reverse().map(function (x) {
        return [dl(x), fx(val(VISA, '技能実習', x))].concat(D.subs.map(function (s) { return fx(val(VISA, s, x)); }));
      }), 1));
      b.appendChild(help('「—」は、発表の表にない所です（2017年1月1日の発表には3号がありません）。'));
    }));
    c.appendChild(fold('list', '取り込んだ発表（過去の公表資料）', function (b) {
      b.appendChild(help('法務省（出入国在留管理庁）の今のサイトにある発表（2021年1月1日現在〜）です。2017〜2020年の数は、2021年1月1日現在の発表の表にある過去の数です。取り込むときに、内わけの合計が総数と合うか、表どうしで同じ数か、同じ時点の数が発表によって違わないかを確かめています。'));
      b.appendChild(Z.tableEl(['時点', '公表日', '不法残留者数', '確かめ'], D.releases.slice().reverse().map(function (r) {
        return [dl(r.w) + '現在', pubText(r.pub), fmt(val(NAT, '総数', r.w)), r.bad ? r.bad + '件合わない' : r.checks + '件すべて合う'];
      }), 2));
      var links = el('p', 'dhelp srcs'); links.innerHTML = '資料：' + D.releases.slice().reverse().map(function (r) { return '<a href="' + esc(r.page) + '">' + esc(dl(r.w)) + '</a>'; }).join('');
      b.appendChild(links);
    }));
  }

  // ---------- 数の準備
  // 新規不法残留者の表にある「その時点の数」「前の時点の数」で、上位10の外の時点の数を足す（同じ統計の同じ時点の数。どちらにもあるときは同じ数か確かめる）
  function fillFromNew() {
    Object.keys(D.new).forEach(function (w) {
      var pw = newPrev(w);
      D.new[w][NAT].forEach(function (r) {
        var a = D.sp[NAT][r[0]];
        if (!a || r[0] === '総数' || r[0] === 'その他') { return; }
        [[w, r[2]], [pw, r[3]]].forEach(function (q) {
          var i = D.W.indexOf(q[0]);
          if (i < 0) { return; }
          if (a[i] == null) { a[i] = q[1]; EXTRA[r[0] + '|' + q[0]] = true; } else if (a[i] !== q[1]) { console.warn('不法残留：新規の表と数が違います', r[0], q[0], a[i], q[1]); }
        });
      });
    });
  }
  function initStyles() {
    var first = listed(NAT, D.R[D.R.length - 1]);
    var last = function (n) { var a = D.sp[NAT][n], i = a.length - 1; while (i >= 0 && a[i] == null) { i--; } return [i, i >= 0 ? a[i] : 0]; };
    var rest = Object.keys(D.sp[NAT]).filter(function (n) { return n !== '総数' && n !== 'その他' && first.indexOf(n) < 0; })
      .sort(function (a, b) { var p = last(a), q = last(b); return q[0] - p[0] || q[1] - p[1]; });
    first.concat(rest).forEach(function (n, i) { NST[n] = i < 7 ? [String(i + 1)] : i < 14 ? [String(i - 6), 1] : ['o']; });
  }

  var box = document.getElementById('fuho-view'), ctl = document.getElementById('fuho-ctl');
  var SECS = [['total', totalSec, 'khero'], ['nat', natSec], ['detail', detailSec, 'fdetail'], ['visa', visaSec], ['trend', trendSec], ['new', newSec], ['more', moreSec]], NODE = {};
  function upLink() { return el('p', 'kup', '<a href="#toc">↑ 上に戻る（目次）</a>'); }
  function render(only) {
    if (D.R.indexOf(S.w) < 0) { S.w = D.R[D.R.length - 1]; }
    if (DIMS.indexOf(S.dim) < 0) { S.dim = DIMS[0]; }
    if (S.nat && natAll().indexOf(S.nat) < 0) { S.nat = ''; } // 前の書き方の「総数」「その他」など
    writeHash();
    ctl.replaceChildren(controls());
    if (!NODE.total) {
      var out = el('div');
      SECS.forEach(function (s) { var c = el('section', 'dcard ksec' + (s[2] ? ' ' + s[2] : '')); c.id = s[0]; NODE[s[0]] = c; out.appendChild(c); });
      box.replaceChildren(out);
    }
    SECS.forEach(function (s) {
      if (only && only.indexOf(s[0]) < 0) { return; }
      var c = NODE[s[0]]; c.replaceChildren();
      try { s[1](c); } catch (e) { console.error(e); c.appendChild(Z.nodata('この部分を表示できませんでした')); }
      if (s[0] !== 'total') { c.appendChild(upLink()); }
    });
  }
  // 目次・「上に戻る」のリンクは、アドレスの # を変えずに動く（# のあとに選んだ条件が入っているので）
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a || !a.closest('.jump, .kup, #fuho')) { return; }
    var t = document.getElementById(a.getAttribute('href').slice(1));
    if (!t) { return; }
    ev.preventDefault(); t.scrollIntoView({ block: 'start' });
  });
  // 「fuho.html#nat」のように欄を指して来たとき（前の欄の名前も、いまの欄へ）
  var OLD = { rank: 'nat', grow: 'nat', pie: 'nat', cross: 'detail', list: 'more' }, sec = /^#(total|nat|detail|visa|trend|new|more|notes|rank|grow|pie|cross|list)$/.exec(location.hash);
  fetch('data/fuho.json').then(function (r) { return r.json(); }).then(function (j) {
    D = j; fillFromNew(); initStyles();
    if (!sec) { readHash(); }
    if (S.pick.length || S.sex || S.idx || S.dim === VISA) { OPEN.cmp = true; } // 送られたアドレスで選んであれば、たたんだ欄を開いておく
    if (S.cmp === 'year') { OPEN['grow' + NAT] = true; }
    render();
    if (sec) { setTimeout(function () { go(OLD[sec[1]] || sec[1]); }, 50); }
  }, function () { box.replaceChildren(Z.nodata('データを読み込めませんでした。')); });
})();
