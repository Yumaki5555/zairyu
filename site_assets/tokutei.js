/* 在留資格「特定活動」のページ（tokutei.html）と「定住者」のページ（teiju.html）の動き
   ・「それぞれの中身」の一覧：名前で探す・告示で絞る（告示にある／告示にない。「その他」は両方が入るので、いつも出す）・名前と人数だけにする（特定活動だけ）
   ・ページの中のリンクで「出典と注意」（data-open のセクション）へ行くときは、たたんだ中身を開く
   JavaScript が動かないときは、一覧が全部そのまま見える（操作の欄は出さない） */
(function () {
  'use strict';
  // 字の形をそろえて比べる（全角・半角、ひらがな・カタカナ、大文字・小文字、空白）
  function norm(s) {
    return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
      .replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }

  var list = document.getElementById('tk-list'), tools = document.getElementById('tk-tools'), resetList = null;
  if (list && tools) {
    var items = Array.prototype.slice.call(list.children), qi = document.getElementById('tk-q');
    var count = document.getElementById('tk-count'), none = document.getElementById('tk-none');
    var kind = '';
    items.forEach(function (li) { li._q = norm((li.dataset.q || '') + ' ' + li.textContent); });
    function apply() {
      var q = norm(qi.value), n = 0;
      items.forEach(function (li) {
        var ok = (!kind || li.dataset.k === kind || li.dataset.k === 'mix') && (!q || li._q.indexOf(q) >= 0);
        li.hidden = !ok;
        if (ok) { n++; }
      });
      count.textContent = (kind || q) ? '合うもの ' + n + '件（全' + items.length + '件）' : '全' + items.length + '件';
      none.hidden = n > 0;
    }
    function pressGroup(attr, f) { // 切り替えボタン：押したものだけ aria-pressed="true"
      var bs = tools.querySelectorAll('button[' + attr + ']');
      bs.forEach(function (b) {
        b.addEventListener('click', function () {
          bs.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          f(b.getAttribute(attr));
        });
      });
    }
    pressGroup('data-k', function (k) { kind = k; apply(); });
    pressGroup('data-v', function (v) { list.classList.toggle('brief', v === 'brief'); });
    qi.addEventListener('input', apply);
    resetList = function () { // 絞って隠れている行へ行くとき（3分でわかるの棒を押したとき）は、全部を出す
      qi.value = ''; kind = '';
      tools.querySelectorAll('button[data-k]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === '')); });
      apply();
    };
    tools.hidden = false;
    apply();
  }

  // 「出典と注意」へ行くときは開く（目次・3分でわかるのあとの案内のリンク、アドレスの #notes）
  function openAt(id) {
    var t = id && document.getElementById(id);
    if (!t) { return; }
    if (t.hidden && resetList && t.parentElement === list) { resetList(); }
    if (t.hasAttribute('data-open')) { var d = t.querySelector('details'); if (d) { d.open = true; } }
    for (var p = t.parentElement; p; p = p.parentElement) { if (p.tagName === 'DETAILS') { p.open = true; } } // たたんだ中のものへ行くとき
  }
  function fromHash() { try { openAt(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* 読めないアドレスは何もしない */ } }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (a) { openAt(a.getAttribute('href').slice(1)); }
  });
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
