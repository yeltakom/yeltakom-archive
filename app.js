/* yeltakom.info archive: filter, list/image view, inline expanding rows. Data comes from data.js (ARCHIVE). */
(function () {
  'use strict';
  var ENTRIES = ARCHIVE.entries;
  var TYPE_ORDER = ['Installation', 'Exhibition (solo)', 'Exhibition (group)', 'Counter-mapping', 'Drawing', 'Video',
    'Artist book', 'Public art / Kunst am Bau', 'Proposal / Competition', 'Research', 'Text', 'Book / Publication',
    'Talk / Lecture', 'Panel', 'Workshop', 'Curating', 'Residency', 'Award / Grant',
    'Collective / Organisation'];
  var SECTIONS = [
    { id: 'all', label: 'All', test: function () { return true; } },
    { id: 'works', label: 'Works', test: function (e) { return e.section === 'work'; } },
    { id: 'texts', label: 'Texts', test: function (e) { return e.section === 'text'; } },
    { id: 'talks', label: 'Talks', test: function (e) { return e.section === 'talk'; } },
    { id: 'workshops', label: 'Workshops', test: function (e) { return e.section === 'workshop'; } },
    { id: 'networks', label: 'Networks', test: function (e) { return e.section === 'network'; } }
  ];
  var FEATURED = ['Installation', 'Exhibition (solo)', 'Counter-mapping', 'Public art / Kunst am Bau', 'Artist book'];
  var state = { section: 'all', types: new Set(), forv: '', q: '', view: 'list', open: new Set() };
  var $ = function (id) { return document.getElementById(id); };
  var root = $('archive');

  function has(e, t) { return (e.types || []).indexOf(t) > -1; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }
  function images(e) { return (e.links || []).filter(function (l) { return l.label === 'image'; }); }
  ENTRIES.forEach(function (e) {
    e._hay = norm([e.no, e.dates, e.name, (e.types || []).join(' '), e['for'], (e['with'] || []).join(' '), e.place, e.role,
      e.description, (e.shown || []).map(function (s) { return [s.venue, s.city, s.exhibition_title, s.curator].join(' '); }).join(' ')].join(' '));
  });

  /* ---------- controls ---------- */
  function pressBtn(label, pressed, onclick) {
    var b = el('button', { type: 'button', 'aria-pressed': String(pressed) }, esc(label));
    b.addEventListener('click', onclick);
    return b;
  }
  function buildControls() {
    var s = $('sections'); s.innerHTML = '';
    SECTIONS.forEach(function (sec) {
      s.appendChild(pressBtn(sec.label, state.section === sec.id, function () { setSection(sec.id, true); }));
    });
    var t = $('types'); t.innerHTML = '<span class="flabel">Type/s</span>';
    var counts = {};
    ENTRIES.forEach(function (e) { (e.types || []).forEach(function (x) { counts[x] = (counts[x] || 0) + 1; }); });
    var list = TYPE_ORDER.filter(function (x) { return counts[x]; })
      .concat(Object.keys(counts).filter(function (x) { return TYPE_ORDER.indexOf(x) < 0; }).sort());
    list.forEach(function (x) {
      var b = pressBtn(x, state.types.has(x), function () {
        if (state.types.has(x)) state.types.delete(x); else state.types.add(x);
        b.setAttribute('aria-pressed', String(state.types.has(x)));
        render();
      });
      b.className = 'type';
      t.appendChild(b);
    });
    // type chips stay folded away until asked for: they are a second-order filter
    var tt = $('typetoggle'), tbox = $('types');
    tt.addEventListener('click', function () {
      var open = tbox.hasAttribute('hidden');
      if (open) { tbox.removeAttribute('hidden'); } else { tbox.setAttribute('hidden', ''); }
      tt.setAttribute('aria-expanded', String(open));
    });
    $('q').addEventListener('input', function (ev) { state.q = ev.target.value; render(); });
    $('reset').addEventListener('click', function () {
      state.types.clear(); state.q = ''; $('q').value = '';
      setSection('all', true); buildTypesPressed();
    });
    $('vlist').addEventListener('click', function () { setView('list'); });
    $('vimg').addEventListener('click', function () { setView('image'); });
  }
  function buildTypesPressed() {
    document.querySelectorAll('#types button').forEach(function (b) { b.setAttribute('aria-pressed', String(state.types.has(b.textContent))); });
  }
  function setSection(id, push) {
    state.section = id;
    document.querySelectorAll('#sections button').forEach(function (b, i) { b.setAttribute('aria-pressed', String(SECTIONS[i].id === id)); });
    if (push) history.replaceState(null, '', id === 'all' ? location.pathname : '#' + id);
    render();
  }
  function setView(v) {
    state.view = v;
    $('vlist').setAttribute('aria-pressed', String(v === 'list'));
    $('vimg').setAttribute('aria-pressed', String(v === 'image'));
    render();
  }

  /* ---------- filtering ---------- */
  function filtered() {
    var sec = SECTIONS.filter(function (s) { return s.id === state.section; })[0] || SECTIONS[0];
    var words = norm(state.q).split(/\s+/).filter(Boolean);
    return ENTRIES.filter(function (e) {
      if (!sec.test(e)) return false;
      if (state.types.size && !(e.types || []).some(function (t) { return state.types.has(t); })) return false;
      return words.every(function (w) { return e._hay.indexOf(w) > -1; });
    });
  }

  /* ---------- list view ---------- */
  var COLS = '<span class="c-no">No.</span><span class="c-date">Date/s</span><span class="c-name">Name</span>' +
    '<span class="c-type">Type/s</span><span class="c-for">For</span><span class="c-with">With</span>';
  function rowHTML(e) {
    return '<span class="c-no">' + esc(e.no) + '</span><span class="c-date">' + esc(e.dates) + '</span>' +
      '<span class="c-name">' + esc(e.name) + '</span><span class="c-type">' + esc((e.types || []).join(', ')) + '</span>' +
      '<span class="c-for">' + esc(e['for'] || '') + '</span><span class="c-with">' + esc((e['with'] || []).join(', ')) + '</span>';
  }
  function renderList(list) {
    var head = el('div', { class: 'thead', 'aria-hidden': 'true' }, COLS);
    var ol = el('ol', { class: 'rows', 'aria-label': 'Archive entries, newest first' });
    list.forEach(function (e) {
      var li = el('li', { class: 'entry', id: 'e-' + e.no });
      var btn = el('button', { type: 'button', class: 'row', 'aria-expanded': 'false', 'aria-controls': 'd-' + e.no }, rowHTML(e));
      li.appendChild(btn);
      if (e.description && FEATURED.some(function (t) { return has(e, t); })) {
        li.appendChild(el('p', { class: 'oneline' }, esc(e.description)));
      }
      var det = el('div', { class: 'detail', id: 'd-' + e.no, hidden: '' });
      li.appendChild(det);
      btn.addEventListener('click', function () { toggle(e, li, btn, det); });
      if (state.open.has(e.no)) toggle(e, li, btn, det, true);
      ol.appendChild(li);
    });
    root.appendChild(head);
    root.appendChild(ol);
    if (!list.length) root.appendChild(el('p', { class: 'empty' }, 'No entries match. <button type="button" class="plain" id="clear2">Clear filters</button>'));
  }
  function toggle(e, li, btn, det, force) {
    var open = force || btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    li.classList.toggle('open', open);
    if (open) { if (!det.dataset.built) { det.innerHTML = detailHTML(e); det.dataset.built = '1'; } det.hidden = false; state.open.add(e.no); }
    else { det.hidden = true; state.open.delete(e.no); }
  }
  function detailHTML(e) {
    var h = '<div class="dgrid"><dl>';
    function row(k, v) { if (v) h += '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
    row('About', esc(e.description));
    if (e.status && e.status !== 'realised') row('Status', esc(e.status.charAt(0).toUpperCase() + e.status.slice(1)));
    row('Place', esc(e.place));
    row('Role', esc(e.role));
    if (e.shown && e.shown.length) {
      row('Shown', '<ul class="shown">' + e.shown.map(function (s) {
        var bits = [s.exhibition_title, s.venue, s.city].filter(Boolean).map(esc).join(', ');
        return '<li><span class="d">' + esc(s.dates || '') + '</span><span>' + bits + (s.curator ? ', curated by ' + esc(s.curator) : '') + '</span></li>';
      }).join('') + '</ul>');
    }
    var seen = {}, links = (e.links || []).filter(function (l) {
      if (l.label === 'image' || seen[l.url]) return false; seen[l.url] = 1; return true;
    });
    links.sort(function (a, b) { return (a.label !== 'original') - (b.label !== 'original'); });
    var multi = links.filter(function (l) { return l.label === 'original'; }).length > 1;
    var lk = links.map(function (l) {
      var lab = l.label === 'original' ? (has(e, 'Text') ? 'Original' : 'Project page') : l.label.charAt(0).toUpperCase() + l.label.slice(1);
      if (multi && l.label === 'original') lab += ', ' + l.url.replace(/^https?:\/\/(www\.)?([^\/]+).*$/, '$2');
      return '<a href="' + esc(l.url) + '">' + esc(lab) + ' &#8599;</a>';
    });
    row('Links', lk.join('<br>'));
    h += '</dl>';
    if (e.text) h += '<p class="read"><a href="' + esc(e.text) + '">Read the text</a></p>';
    if (e.page) h += '<p class="read"><a href="' + esc(e.page) + '">Open the full page</a></p>';
    h += '</div>';
    var imgs = images(e);
    if (imgs.length) {
      h += '<div class="strip">' + imgs.map(function (i, n) {
        return '<a href="' + esc(i.url) + '"><img src="' + esc(i.url) + '" alt="' + esc(e.name) + ', image ' + (n + 1) + '" loading="lazy" decoding="async"></a>';
      }).join('') + '</div>';
    }
    return h;
  }

  /* ---------- image view ---------- */
  function renderImages(list) {
    var g = el('ol', { class: 'grid', 'aria-label': 'Archive entries, image view' });
    list.forEach(function (e) {
      var im = images(e)[0];
      var li = el('li', { class: im ? 'tile pic' : 'tile type' });
      var b = el('button', { type: 'button', 'aria-label': e.no + ' ' + e.name + ', open in list' },
        (im ? '<img src="' + esc(im.url) + '" alt="" loading="lazy" decoding="async">' : '') +
        '<span class="cap"><span class="c-no">' + esc(e.no) + '</span> ' + esc(e.name) + '</span>');
      b.addEventListener('click', function () {
        state.open.add(e.no); setView('list');
        var t = $('e-' + e.no); if (t) { t.scrollIntoView({ block: 'start' }); t.querySelector('.row').focus({ preventScroll: true }); }
      });
      li.appendChild(b); g.appendChild(li);
    });
    root.appendChild(g);
  }

  function render() {
    var list = filtered();
    root.innerHTML = '';
    root.className = state.view === 'image' ? 'imageview' : 'listview';
    if (state.view === 'image') renderImages(list); else renderList(list);
    $('count').textContent = list.length + (list.length === 1 ? ' entry' : ' entries') + (list.length < ENTRIES.length ? ' of ' + ENTRIES.length : '');
    var c2 = $('clear2'); if (c2) c2.addEventListener('click', function () { $('reset').click(); });
  }

  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (/^e-\d{4}$/.test(h)) {
      state.open.add(h.slice(2)); setSection('all', false);
      var t = $(h); if (t) { t.scrollIntoView({ block: 'start' }); t.querySelector('.row').focus({ preventScroll: true }); }
      return;
    }
    var s = SECTIONS.filter(function (x) { return x.id === h; })[0];
    setSection(s ? s.id : 'all', false);
  }

  buildControls();
  fromHash();
  window.addEventListener('hashchange', fromHash);
})();
