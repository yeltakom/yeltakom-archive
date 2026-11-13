/* yeltakom.info archive. Hand-written. Data comes from data.js (ARCHIVE).
   The bar at the top is the section filter, the search and the view switch.
   The table sorts on its column headings, rows open in place, and a row that has
   a picture shows it at the cursor. */
(function () {
  'use strict';
  var ENTRIES = ARCHIVE.entries;
  var SECTIONS = {
    all: function () { return true; },
    works: function (e) { return e.section === 'work'; },
    texts: function (e) { return e.section === 'text'; },
    talks: function (e) { return e.section === 'talk'; },
    workshops: function (e) { return e.section === 'workshop'; },
    networks: function (e) { return e.section === 'network'; }
  };
  var FEATURED = ['Installation', 'Exhibition (solo)', 'Counter-mapping', 'Public art / Kunst am Bau', 'Artist book'];
  var COLUMNS = [['no', 'No.'], ['dates', 'Date/s'], ['name', 'Name'], ['type', 'Type/s'], ['for', 'For'], ['with', 'With']];
  var CLS = { no: 'c-no', dates: 'c-date', name: 'c-name', type: 'c-type', 'for': 'c-for', 'with': 'c-with' };
  var state = { section: 'all', q: '', view: 'list', open: new Set(), sort: { key: 'no', dir: -1 } };
  var $ = function (id) { return document.getElementById(id); };
  var root = $('archive');
  var secLinks = document.querySelectorAll('header.bar a[data-sec]');

  function has(e, t) { return (e.types || []).indexOf(t) > -1; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }
  /* pictures of an entry, the ones served from this site first */
  function images(e) {
    var all = (e.links || []).filter(function (l) { return l.label === 'image'; });
    return all.filter(function (l) { return !/^https?:/.test(l.url); })
      .concat(all.filter(function (l) { return /^https?:/.test(l.url); }));
  }
  ENTRIES.forEach(function (e) {
    e._hay = norm([e.no, e.dates, e.name, (e.types || []).join(' '), e['for'], (e['with'] || []).join(' '), e.place, e.role,
      e.description, (e.shown || []).map(function (s) { return [s.venue, s.city, s.exhibition_title, s.curator].join(' '); }).join(' ')].join(' '));
    e._k = {
      no: e.no,
      dates: (String(e.dates || '').match(/\d{4}/) || [''])[0] + e.no,
      name: norm(e.name).replace(/^[^a-z0-9]+/, ''),
      type: norm((e.types || [])[0]),
      'for': norm(e['for']),
      'with': norm((e['with'] || [])[0])
    };
  });

  /* ---------- the bar ---------- */
  function barHeight() { var b = $('bar'); return b ? b.offsetHeight : 0; }
  function setSection(id, push) {
    state.section = SECTIONS[id] ? id : 'all';
    secLinks.forEach(function (a) {
      if (a.getAttribute('data-sec') === state.section) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    if (push) history.replaceState(null, '', state.section === 'all' ? location.pathname : '#' + state.section);
    render();
  }
  function setView(v) {
    state.view = v;
    $('vlist').setAttribute('aria-pressed', String(v === 'list'));
    $('vimg').setAttribute('aria-pressed', String(v === 'image'));
    render();
  }
  function wireBar() {
    secLinks.forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        setSection(a.getAttribute('data-sec'), true);
        // if the table top has scrolled under the bar, bring it back
        if (root.getBoundingClientRect().top < barHeight()) {
          window.scrollTo(0, root.getBoundingClientRect().top + window.pageYOffset - barHeight());
        }
      });
    });
    var sq = $('sq');
    if (sq) sq.addEventListener('input', function () { state.q = sq.value; render(); });
    $('vlist').addEventListener('click', function () { setView('list'); });
    $('vimg').addEventListener('click', function () { setView('image'); });
  }

  /* ---------- More: the biography opens under the introduction ---------- */
  var moreBtn = $('more'), moreBox = $('morebox');
  function setMore(open) {
    if (!moreBtn || !moreBox) return;
    if (open) moreBox.removeAttribute('hidden'); else moreBox.setAttribute('hidden', '');
    moreBtn.setAttribute('aria-expanded', String(open));
    moreBtn.textContent = open ? 'Less' : 'More';
  }
  if (moreBtn) moreBtn.addEventListener('click', function () { setMore(moreBox.hasAttribute('hidden')); });

  /* ---------- filtering and sorting ---------- */
  function filtered() {
    var test = SECTIONS[state.section] || SECTIONS.all;
    var words = norm(state.q).split(/\s+/).filter(Boolean);
    var list = ENTRIES.filter(function (e) {
      return test(e) && words.every(function (w) { return e._hay.indexOf(w) > -1; });
    });
    var key = state.sort.key, dir = state.sort.dir;
    return list.slice().sort(function (a, b) {
      var x = a._k[key], y = b._k[key];
      if (!x && y) return 1;            // empty cells always sink to the end
      if (x && !y) return -1;
      if (x === y) return a.no < b.no ? 1 : -1;
      return (x < y ? -1 : 1) * dir;
    });
  }
  function sortBy(key) {
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key: key, dir: (key === 'no' || key === 'dates') ? -1 : 1 };
    render();
  }

  /* ---------- the picture at the cursor ---------- */
  var thumb = null, canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  function showThumb(url) {
    if (!thumb) { thumb = el('img', { id: 'thumb', alt: '' }); document.body.appendChild(thumb); }
    if (thumb.getAttribute('src') !== url) thumb.setAttribute('src', url);
    thumb.style.display = 'block';
  }
  function moveThumb(ev) {
    if (!thumb) return;
    var w = thumb.offsetWidth || 240, h = thumb.offsetHeight || 180;
    var x = ev.clientX + 18, y = ev.clientY + 18;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 18;
    if (y + h > window.innerHeight - 8) y = Math.max(8, ev.clientY - h - 18);
    thumb.style.left = x + 'px'; thumb.style.top = y + 'px';
  }
  function hideThumb() { if (thumb) thumb.style.display = 'none'; }

  /* ---------- list view ---------- */
  function rowHTML(e) {
    return '<span class="c-no">' + esc(e.no) + '</span><span class="c-date">' + esc(e.dates) + '</span>' +
      '<span class="c-name">' + esc(e.name) + '</span><span class="c-type">' + esc((e.types || []).join(', ')) + '</span>' +
      '<span class="c-for">' + esc(e['for'] || '') + '</span><span class="c-with">' + esc((e['with'] || []).join(', ')) + '</span>';
  }
  function renderList(list) {
    var head = el('div', { class: 'thead', role: 'group', 'aria-label': 'Sort the archive' });
    COLUMNS.forEach(function (c) {
      var b = el('button', { type: 'button', class: CLS[c[0]], title: 'Sort by ' + c[1] }, esc(c[1]));
      if (state.sort.key === c[0]) b.setAttribute('data-dir', state.sort.dir > 0 ? 'asc' : 'desc');
      b.addEventListener('click', function () { sortBy(c[0]); });
      head.appendChild(b);
    });
    var ol = el('ol', { class: 'rows', 'aria-label': 'Archive entries' });
    list.forEach(function (e) {
      var li = el('li', { class: 'entry', id: 'e-' + e.no });
      var btn = el('button', { type: 'button', class: 'row', 'aria-expanded': 'false', 'aria-controls': 'd-' + e.no }, rowHTML(e));
      li.appendChild(btn);
      if (e.description && FEATURED.some(function (t) { return has(e, t); })) {
        li.appendChild(el('p', { class: 'oneline' }, esc(e.description)));
      }
      var det = el('div', { class: 'detail', id: 'd-' + e.no, hidden: '' });
      li.appendChild(det);
      btn.addEventListener('click', function () { hideThumb(); toggle(e, li, btn, det); });
      var im = canHover ? images(e)[0] : null;
      if (im) {
        btn.addEventListener('mouseenter', function (ev) { if (!li.classList.contains('open')) { showThumb(im.url); moveThumb(ev); } });
        btn.addEventListener('mousemove', moveThumb);
        btn.addEventListener('mouseleave', hideThumb);
      }
      if (state.open.has(e.no)) toggle(e, li, btn, det, true);
      ol.appendChild(li);
    });
    root.appendChild(head);
    root.appendChild(ol);
    if (!list.length) root.appendChild(el('p', { class: 'empty' }, 'Nothing in the archive matches that.'));
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
    hideThumb();
    var list = filtered();
    root.innerHTML = '';
    root.className = state.view === 'image' ? 'imageview' : 'listview';
    if (state.view === 'image') renderImages(list); else renderList(list);
  }

  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h === 'more') { setSection('all', false); setMore(true); window.scrollTo(0, 0); return; }
    if (/^e-\d{4}$/.test(h)) {
      state.open.add(h.slice(2)); setSection('all', false);
      var t = $(h); if (t) { t.scrollIntoView({ block: 'start' }); t.querySelector('.row').focus({ preventScroll: true }); }
      return;
    }
    setSection(SECTIONS[h] ? h : 'all', false);
  }

  // many images are hotlinked from institutions, so a dead one is normal over time:
  // drop it rather than leave a broken-image icon behind
  document.addEventListener('error', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'IMG') {
      if (t.id === 'thumb') { hideThumb(); return; }
      var tile = t.closest('.tile') || t.closest('.strip a') || t;
      if (tile && tile.parentNode) { tile.parentNode.removeChild(tile); }
    }
  }, true);

  wireBar();
  fromHash();
  window.addEventListener('hashchange', fromHash);
})();
