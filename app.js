/* yeltakom.info archive. Hand-written. Data comes from data.js (ARCHIVE).
   The bar at the top is the section filter, the search and the Image / List switch.
   The home page opens on the stream (Image): projects and texts as one run of pictures on the
   ground, captioned by kind, number and name. List is the table.
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
  /* WHAT "ALL" SHOWS IN THE STREAM, AND IN WHAT ORDER. Under All the Image view shows only these
     sections, in this order: first every project ("work": installations, videos, exhibitions, research),
     newest first, then the texts ("text"), newest first. Talks, workshops, networks and residencies join
     the stream only when their own section is chosen in the bar. The List view under All still lists
     everything in one run. To show everything in the stream, make this null. */
  var STREAM_ALL = ['work', 'text'];
  /* picture width inside its cell, by shape (width / height): portrait, square, landscape */
  var WIDTH_BY_SHAPE = { portrait: 0.62, square: 0.8, landscape: 1 };
  var FEATURED = ['Installation', 'Exhibition (solo)', 'Counter-mapping', 'Public art / Kunst am Bau', 'Artist book'];
  var COLUMNS = [['no', 'No.'], ['dates', 'Date/s'], ['name', 'Name'], ['type', 'Type/s'], ['for', 'For'], ['with', 'With']];
  var CLS = { no: 'c-no', dates: 'c-date', name: 'c-name', type: 'c-type', 'for': 'c-for', 'with': 'c-with' };
  var state = { section: 'all', q: '', view: 'image', open: new Set(), sort: { key: 'no', dir: -1 } };
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
  /* pictures of an entry: the published rows of archive/images-manifest.csv, as [file, credit, caption] */
  function images(e) {
    return (e.imgs || []).map(function (i) { return { url: i[0], credit: i[1], caption: i[2], size: i[3] }; });
  }
  function altOf(e, i) { return e.name + (i.caption ? ', ' + i.caption : ''); }
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
  function barHeight() { var b = $('bar'); return b && getComputedStyle(b).position === 'sticky' ? b.offsetHeight : 0; }   /* on a phone the bar scrolls away */
  function setSection(id, push) {
    state.section = SECTIONS[id] ? id : 'all';
    setSectionMark();
    if (push) history.replaceState(null, '', state.section === 'all' ? (state.view === 'list' ? '#list' : location.pathname) : '#' + state.section);
    render();
  }
  /* a new filter replaces the content: if the reader is already down the page, start again at its top edge */
  function toTopOfContent() {
    var top = root.getBoundingClientRect().top + window.pageYOffset - barHeight();
    if (window.pageYOffset > top) window.scrollTo(0, top);
  }
  function setView(v, push) {
    state.view = v;
    $('vlist').setAttribute('aria-pressed', String(v === 'list'));
    $('vimg').setAttribute('aria-pressed', String(v === 'image'));
    // #list addresses the table; the section hashes (#works ...) keep their own meaning
    if (push && state.section === 'all') history.replaceState(null, '', v === 'list' ? '#list' : location.pathname);
    render();
  }
  function setSectionMark() {
    secLinks.forEach(function (a) {
      if (a.getAttribute('data-sec') === state.section) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  function wireBar() {
    secLinks.forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        setSection(a.getAttribute('data-sec'), true);
        toTopOfContent();
      });
    });
    var sq = $('sq');
    if (sq) sq.addEventListener('input', function () { state.q = sq.value; render(); toTopOfContent(); });
    $('vlist').addEventListener('click', function () { setView('list', true); toTopOfContent(); });
    $('vimg').addEventListener('click', function () { setView('image', true); toTopOfContent(); });
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
    var stream = state.view === 'image' && state.section === 'all' && STREAM_ALL;
    var list = ENTRIES.filter(function (e) {
      return test(e) && (!stream || STREAM_ALL.indexOf(e.section) > -1) && words.every(function (w) { return e._hay.indexOf(w) > -1; });
    });
    var key = state.sort.key, dir = state.sort.dir;
    var sorted = list.slice().sort(function (a, b) {
      var x = a._k[key], y = b._k[key];
      if (!x && y) return 1;            // empty cells always sink to the end
      if (x && !y) return -1;
      if (x === y) return a.no < b.no ? 1 : -1;
      return (x < y ? -1 : 1) * dir;
    });
    if (!stream) return sorted;
    /* works lead the home page: keep each section's own order, put the sections in STREAM_ALL's order */
    return sorted.map(function (e, n) { return [STREAM_ALL.indexOf(e.section), n, e]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (t) { return t[2]; });
  }
  function sortBy(key) {
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key: key, dir: (key === 'no' || key === 'dates') ? -1 : 1 };
    render();
  }

  /* ---------- the picture at the cursor ---------- */
  var thumb = null, canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  function showThumb(url, alt) {
    if (!thumb) { thumb = el('img', { id: 'thumb', alt: '' }); document.body.appendChild(thumb); }
    thumb.setAttribute('alt', alt || '');
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
        btn.addEventListener('mouseenter', function (ev) { if (!li.classList.contains('open')) { showThumb(im.url, altOf(e, im)); moveThumb(ev); } });
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
    row('Date', esc(e.date_detail));
    if (e.status && e.status !== 'realised') row('Status', esc(e.status.charAt(0).toUpperCase() + e.status.slice(1)));
    row('Place', esc(e.place));
    row('Role', esc(e.role));
    if (e.shown && e.shown.length) {
      row('Shown', '<ul class="shown">' + e.shown.map(function (s) {
        var bits = [s.exhibition_title, s.venue, s.city].filter(Boolean).map(esc).join(', ');
        return '<li><span class="d">' + esc(s.dates || '') + '</span><span>' + bits + (s.curator ? ', curated by ' + esc(s.curator) : '') + '</span></li>';
      }).join('') + '</ul>');
    }
    if (e.related && e.related.length) {
      row('Related', '<ul class="shown">' + e.related.map(function (r) {
        var lab = [r.kind ? r.kind.charAt(0).toUpperCase() + r.kind.slice(1) : '', r.name].filter(Boolean).map(esc).join(', ');
        if (r.href) lab = '<a href="' + esc(r.href) + '">' + lab + '</a>';
        var rest = [r['for'], r.place].filter(Boolean).map(esc).join(', ');
        return '<li><span class="d">' + esc(r.dates || '') + '</span><span>' + lab + (rest ? ', ' + rest : '') + '</span></li>';
      }).join('') + '</ul>');
    }
    var seen = {}, links = (e.links || []).filter(function (l) {
      if (seen[l.url]) return false; seen[l.url] = 1; return true;
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
        return '<a href="' + esc(i.url) + '"><img src="' + esc(i.url) + '" alt="' + esc(altOf(e, i)) + '" loading="lazy" decoding="async"></a>';
      }).join('') + '</div>';
    }
    return h;
  }

  /* ---------- image view: the stream ---------- */
  /* Every item is one link: the work page, the text page, or the entry's row in the List view.
     The caption is the same for all: the kind (first type) in small capitals, then number and name.
     An entry without a picture sets its name large instead (the name is the picture) and the
     caption keeps the kind and the number. The first entry that has a picture opens the stream at
     full width; the rest follow newest first, in a field of columns. */
  function hrefOf(e) { return e.page || e.text || 'index.html#e-' + e.no; }
  function streamItem(e, hero) {
    var im = images(e)[0], sz = im && im.size && im.size[0] && im.size[1] ? im.size : null;
    var kind = (e.types || [])[0] || '';
    var li = el('li', { class: (hero ? 'hero ' : '') + (im ? 'pic' : 'noimg') });
    var pic = '';
    if (im) {
      var w = sz ? sz[0] : 4, h = sz ? sz[1] : 3, r = w / h;
      var k = r < 0.9 ? WIDTH_BY_SHAPE.portrait : (r <= 1.1 ? WIDTH_BY_SHAPE.square : WIDTH_BY_SHAPE.landscape);
      pic = '<img class="pic" src="' + esc(im.url) + '" alt="' + esc(altOf(e, im)) + '" width="' + w + '" height="' + h +
        '" style="--w:' + w + ';--h:' + h + ';--k:' + (hero ? 1 : k) + '" loading="lazy" decoding="async">';
    }
    var a = el('a', { href: hrefOf(e) },
      pic + '<span class="big">' + esc(e.name) + '</span>' +
      '<span class="cap">' + (kind ? '<span class="kind">' + esc(kind) + '</span>' : '') +
      '<span class="nm"><span class="c-no">' + esc(e.no) + '</span><span class="c-nm"> ' + esc(e.name) + '</span></span></span>');
    li.appendChild(a);
    return li;
  }
  function renderImages(list) {
    var g = el('ol', { class: 'stream', 'aria-label': 'Archive entries, image view' });
    var first = -1;
    list.forEach(function (e, i) { if (first < 0 && images(e).length) first = i; });
    if (first > -1) g.appendChild(streamItem(list[first], true));
    list.forEach(function (e, i) { if (i !== first) g.appendChild(streamItem(e, false)); });
    root.appendChild(g);
    if (!list.length) root.appendChild(el('p', { class: 'empty' }, 'Nothing in the archive matches that.'));
  }

  function render() {
    hideThumb();
    var list = filtered();
    root.innerHTML = '';
    root.className = state.view === 'image' ? 'imageview' : 'listview';
    if (state.view === 'image') renderImages(list); else renderList(list);
  }

  var userMoved = false;
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (t) {
    window.addEventListener(t, function () { userMoved = true; }, { passive: true });
  });
  function toEntry(h) {
    var t = $(h);
    if (t) { t.scrollIntoView({ block: 'start' }); t.querySelector('.row').focus({ preventScroll: true }); }
  }
  // #more opens the biography and scrolls to the introduction.
  function toAbout() {
    var a = document.querySelector('.about');
    if (a) window.scrollTo(0, a.getBoundingClientRect().top + window.pageYOffset - barHeight() - 8);
  }
  // no hash: the stream. #works, #texts ...: the stream of that section. #list: the table.
  // #e-NNNN: the table, with that row open. #more: the biography.
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h === 'more') { setView('image'); setSection('all', false); setMore(true); toAbout(); return; }
    if (/^e-\d{4}$/.test(h)) {
      state.open.add(h.slice(2)); setView('list'); setSection('all', false); toEntry(h);
      return;
    }
    setView(h === 'list' ? 'list' : 'image');
    setSection(SECTIONS[h] ? h : 'all', false);
  }

  // a picture that fails to load (a dead link, a missing file) turns its stream item into the
  // no-picture form (name set large) instead of leaving a hole; strip and table pictures are dropped
  document.addEventListener('error', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'IMG') {
      if (t.id === 'thumb') { hideThumb(); return; }
      var item = t.closest('.stream > li');
      if (item) { item.classList.remove('pic'); item.classList.add('noimg'); return; }
      var strip = t.closest('.strip a') || t;
      if (strip && strip.parentNode) { strip.parentNode.removeChild(strip); }
    }
  }, true);

  wireBar();
  fromHash();
  window.addEventListener('hashchange', function () { userMoved = true; fromHash(); });
  // row heights settle when pictures in open rows load: place the reader on the row once more
  window.addEventListener('load', function () {
    var h = decodeURIComponent(location.hash.slice(1));
    if (!userMoved && /^e-\d{4}$/.test(h)) toEntry(h);
  });
})();
