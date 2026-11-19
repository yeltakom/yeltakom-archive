/* yeltakom.info picture viewer. Hand-written, no library. One implementation for the whole site.
   The home page (the contact sheet) and every work page load it.
   A picture opens full size in a <dialog>: the picture as large as the window allows, never above its
   natural width, centred on the ground; under it number and name (linked to the entry), the caption and
   the credit as the work page prints them. Controls are text: Close, and the arrows for previous and next.
   Escape closes, Left and Right move, a click on the ground closes, a swipe moves.
   Address: #p-<no>-<frame> (for example #p-2601-3). Opening pushes one history entry, Back closes.
   Moving between pictures replaces that entry, so one Back always closes the viewer.
   The sequence is the sheet as it is now (app.js offers it as window.YKSheet), or on a work page that
   page's pictures (links a.vw inside .shots). */
(function () {
  'use strict';
  var RE = /^#p-(\d{4})-(\d+)$/;
  var home = !!document.getElementById('archive') && typeof window.YKSheet === 'function';
  var dlg, img, nameA, textEl, countEl, prevB, nextB, closeB;
  var items = [], idx = -1, opener = null, pushed = false, isOpen = false;

  /* the credit line exactly as build.py prints it under a picture on the work page */
  function printed(credit, caption) {
    var bits = caption ? [caption] : [];
    if (credit) bits.push((/^(courtesy|©)/i.test(credit) ? '' : 'Photograph: ') + credit);
    return bits.join('. ');
  }
  function workItems() {
    var art = document.querySelector('.filepage'), shots = document.querySelector('.shots');
    if (!art || !shots) return [];
    var no = (art.querySelector('.entry .c-no') || {}).textContent || '', name = (art.querySelector('h1.c-name') || {}).textContent || '';
    var total = parseInt(shots.getAttribute('data-total'), 10) || 0;
    var out = [];
    Array.prototype.forEach.call(shots.querySelectorAll('figure.shot a.vw'), function (a) {
      var im = a.querySelector('img'), fc = a.parentNode.querySelector('figcaption'), n = parseInt(a.getAttribute('data-frame'), 10);
      out.push({ key: no.trim() + '-' + n, no: no.trim(), name: name.trim(), href: location.pathname.split('/').pop(), frame: n,
        total: total, src: im.src, w: parseInt(im.getAttribute('width'), 10) || 0, h: parseInt(im.getAttribute('height'), 10) || 0,
        text: fc ? fc.textContent : '', alt: im.alt, opener: a });
    });
    return out;
  }
  function find(key) { for (var i = 0; i < items.length; i++) { if (items[i].key === key) return i; } return -1; }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'vw';
    dlg.setAttribute('aria-label', 'Picture viewer');
    dlg.innerHTML = '<div class="vw-top"><span class="vw-nav">' +
      '<button type="button" class="vw-prev" aria-label="Previous picture">←</button> <span class="vw-n"></span> ' +
      '<button type="button" class="vw-next" aria-label="Next picture">→</button></span>' +
      '<button type="button" class="vw-close">Close</button></div>' +
      '<div class="vw-stage"><img alt=""></div>' +
      '<p class="vw-cap" aria-live="polite"><a class="vw-name" href="#"></a> <span class="vw-text"></span></p>';
    document.body.appendChild(dlg);
    img = dlg.querySelector('img'); nameA = dlg.querySelector('.vw-name'); textEl = dlg.querySelector('.vw-text');
    countEl = dlg.querySelector('.vw-n'); prevB = dlg.querySelector('.vw-prev'); nextB = dlg.querySelector('.vw-next');
    closeB = dlg.querySelector('.vw-close');
    closeB.addEventListener('click', close);
    prevB.addEventListener('click', function () { go(-1); });
    nextB.addEventListener('click', function () { go(1); });
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); close(); });      /* Escape */
    dlg.addEventListener('click', function (ev) {                                          /* the ground */
      if (ev.target === dlg || ev.target.className === 'vw-stage') close();
    });
    dlg.addEventListener('keydown', function (ev) {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); go(1); }
    });
    var x0 = null, y0 = 0;
    dlg.addEventListener('touchstart', function (ev) { var t = ev.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    dlg.addEventListener('touchend', function (ev) {
      if (x0 === null) return;
      var t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function show(i) {
    idx = i;
    var it = items[i];
    img.alt = it.alt || '';
    if (it.w && it.h) { img.setAttribute('width', it.w); img.setAttribute('height', it.h); } else { img.removeAttribute('width'); img.removeAttribute('height'); }
    img.style.maxWidth = it.w ? 'min(100%, ' + it.w + 'px)' : '100%';     /* never above the natural width */
    img.style.maxHeight = it.h ? 'min(100%, ' + it.h + 'px)' : '100%';
    img.src = it.src;
    nameA.textContent = it.no + ' ' + it.name;
    nameA.setAttribute('href', it.href);
    textEl.textContent = it.text != null ? it.text : printed(it.credit, it.caption);
    countEl.textContent = it.frame + ' / ' + it.total;
    prevB.disabled = i <= 0;
    nextB.disabled = i >= items.length - 1;
    [i - 1, i + 1].forEach(function (j) { if (items[j]) { var p = new Image(); p.src = items[j].src; } });
  }
  function base() { return home ? '#sheet' : location.pathname + location.search; }
  function go(d) {
    var j = idx + d;
    if (!isOpen || j < 0 || j > items.length - 1) return;
    history.replaceState(null, '', '#p-' + items[j].key);
    show(j);
  }
  function openAt(i) {
    if (!dlg) build();
    show(i);
    if (!opener && document.activeElement !== document.body) opener = document.activeElement;
    isOpen = true;
    document.documentElement.classList.add('vw-open');
    if (!dlg.open) dlg.showModal();
    closeB.focus();
  }
  function closeUI() {
    if (!isOpen) return;
    isOpen = false;
    dlg.close();
    document.documentElement.classList.remove('vw-open');
    var it = items[idx], target = opener && document.contains(opener) ? opener : null;
    if (!target && it) target = it.opener || document.querySelector('a[data-key="' + it.key + '"]');
    if (target && target.focus) target.focus();
    opener = null;
  }
  function close() {
    if (!isOpen) return;
    if (pushed) { pushed = false; history.back(); }       /* hashchange then closes the viewer */
    else { history.replaceState(null, '', base()); closeUI(); }
  }
  /* the address says which picture is open; called at load and on every hashchange */
  function sync(viaChange) {
    var m = RE.exec(location.hash);
    if (!m) { closeUI(); return; }
    var key = m[1] + '-' + m[2];
    if (isOpen) { var k = find(key); if (k > -1) show(k); return; }
    items = home ? window.YKSheet(false) : workItems();
    var i = find(key);
    if (i < 0 && home) { items = window.YKSheet(true); i = find(key); }   /* not in the filtered sheet: use every picture */
    if (i < 0) return;
    pushed = !!viaChange;
    openAt(i);
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[data-key], a.vw');
    if (a) opener = a;
  });
  window.addEventListener('hashchange', function () { sync(true); });
  sync(false);
})();
