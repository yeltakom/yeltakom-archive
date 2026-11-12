/* Language switch for text pages: original, translation, or side by side (wide screens). */
(function () {
  var page = document.querySelector('.textpage.multi');
  if (!page) return;
  var btns = page.querySelectorAll('.langswitch button');
  var vers = page.querySelectorAll('.version');
  var wide = window.matchMedia('(min-width: 900px)');
  function show(which) {
    if (which === 'both' && !wide.matches) which = '0';
    page.classList.toggle('both', which === 'both');
    vers.forEach(function (v) {
      v.hidden = which === 'both' ? Number(v.dataset.v) > 1 : v.dataset.v !== which;
    });
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.show === which)); });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.show); }); });
  show(wide.matches ? 'both' : '0');
  wide.addEventListener('change', function () { show(wide.matches ? 'both' : '0'); });
})();
