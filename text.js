/* Text pages: on a phone a language tab chooses which version is shown.
   Desktop shows both side by side and ignores the tabs (CSS decides, at 900px).
   When the tab changes, the paragraph at the top of the screen stays at the top. */
(function () {
  var tp = document.querySelector('.tp');
  if (!tp) return;
  var btns = tp.querySelectorAll('.tp-tabs button');
  if (!btns.length) return;
  tp.classList.add('js');
  var rows = tp.querySelectorAll('.r, .col .b');
  function anchor() {
    var y = btns[0].parentNode.getBoundingClientRect().bottom;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (r.height && r.bottom > y + 4) return { el: rows[i], off: r.top - y, idx: i };
    }
    return null;
  }
  function show(n) {
    var a = anchor(), nrows = tp.querySelectorAll('.r');
    tp.setAttribute('data-show', n);
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.show === n)); });
    if (a && a.el.classList.contains('r')) {
      var y = btns[0].parentNode.getBoundingClientRect().bottom;
      window.scrollBy(0, a.el.getBoundingClientRect().top - y - a.off);
    }
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.show); }); });
})();
