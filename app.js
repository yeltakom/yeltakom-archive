/* yeltakom.info archive. Hand-written. Data comes from data.js (ARCHIVE).
   The bar at the top is the section filter, the search and the Index / Image / Sheet / List switch.
   The home page opens on the Index: the titles of the works, large, newest first, with the picture
   of the title under the pointer beside them, then the latest texts and talks. Image is the stream:
   projects and texts as one run of pictures on the ground, captioned by kind, number and name. Sheet is the contact sheet: every picture, small,
   numbered; a click opens it in the viewer (viewer.js). List is the table.
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
  /* THE CONTACT SHEET (view "sheet", address #sheet). A sheet of the work: it shows the pictures of the
     entries that pass the section filter and the search, but only the kinds named in SHEET_KINDS. Each
     row of archive/images-manifest.csv has a kind: work (views, drawings, maps, stills), event (a talk,
     panel or workshop in progress), illustration (a picture beside a text), poster (posters, title and
     announcement graphics), cover (magazine and book covers), portrait (the artist as the subject).
     Posters, covers and portraits never appear on the sheet; they stay on their entry's own page.
     Illustrations appear only when Texts is chosen in the bar (SHEET_KINDS_BY_SECTION). The stream's rule
     STREAM_ALL does NOT apply here. Order: entry number, newest first, an entry's pictures in their
     manifest order. A frame number is the picture's place on its entry's page, so it does not change
     when a neighbour is left off the sheet. Columns per row go through a fixed scale; the first number
     of each scale is the smallest picture size. */
  var SHEET_KINDS = ['work', 'event'];
  var SHEET_KINDS_BY_SECTION = { texts: ['work', 'event', 'illustration'] };
  var SHEET_SCALE = { desk: [16, 12, 8, 6, 4], phone: [6, 4, 3, 2] };
  var PHONE_MAX = 700;      /* px; the stream's two-column breakpoint */
  var sheetCols = null;     /* the reader's choice, kept for the session in this variable */
  try { var kept = parseInt(sessionStorage.getItem('ykSheetCols'), 10); if (kept > 0) sheetCols = kept; } catch (err) { /* no storage: the variable still works */ }
  var renderToken = 0;      /* a new render cancels the chunks of the previous sheet */
  var dead = {};            /* pictures that failed to load, by key "no-frame" */
  var state = { section: 'all', q: '', view: 'index', open: new Set(), sort: { key: 'no', dir: -1 } };
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
    return (e.imgs || []).map(function (i) { return { url: i[0], credit: i[1], caption: i[2], size: i[3], kind: i[4] || 'work' }; });
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
    if (push) history.replaceState(null, '', currentHash() || location.pathname);
    render();
  }
  /* the address that describes the present view and section; a hashchange to it needs no re-render */
  function currentHash() {
    if (state.section !== 'all') return '#' + state.section;
    return state.view === 'list' ? '#list' : (state.view === 'sheet' ? '#sheet' : (state.view === 'image' ? '#image' : ''));
  }
  /* a new filter replaces the content: if the reader is already down the page, start again at its top edge */
  function toTopOfContent() {
    var top = root.getBoundingClientRect().top + window.pageYOffset - barHeight();
    if (window.pageYOffset > top) window.scrollTo(0, top);
  }
  function setView(v, push) {
    state.view = v;
    $('vlist').setAttribute('aria-pressed', String(v === 'list'));
    $('vsheet').setAttribute('aria-pressed', String(v === 'sheet'));
    $('vimg').setAttribute('aria-pressed', String(v === 'image'));
    $('vidx').setAttribute('aria-pressed', String(v === 'index'));
    // #list, #sheet and #image address those views; the section hashes (#works ...) keep their own meaning
    if (push && state.section === 'all') history.replaceState(null, '', currentHash() || location.pathname);
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
    $('vsheet').addEventListener('click', function () { setView('sheet', true); toTopOfContent(); });
    $('vimg').addEventListener('click', function () { setView('image', true); toTopOfContent(); });
    $('vidx').addEventListener('click', function () { setView('index', true); toTopOfContent(); });
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

  /* ---------- index view: the titles are the page ---------- */
  /* THE INDEX (view "index", the home page). Under All: every work, newest first, its title set large
     with its dates and first two kinds; the picture of the title under the pointer (or in keyboard
     focus) stands in a frame beside the list. Only a picture of kind work, event or illustration is
     shown there, never a poster, cover or portrait; a work without one shows the first sentence of its
     description instead. Under the works, the latest INDEX_SIDE_N texts and talks as two short lists
     (all of them when searching). Under a section chosen in the bar: that section's list alone. */
  var INDEX_PICS = ['work', 'event', 'illustration'];
  var INDEX_SIDE_N = 14;
  var SECTION_NAME = { all: 'Works', works: 'Works', texts: 'Texts', talks: 'Talks', workshops: 'Workshops', networks: 'Networks' };
  function yearOf(e) { var m = String(e.dates || '').match(/\d{4}/); return m ? +m[0] : 0; }
  function datesOf(e) { return String(e.dates || '').replace(/-/g, '–'); }
  function kindsOf(e) { return (e.types || []).filter(function (t) { return t !== 'Text'; }).slice(0, 2).join(', '); }
  function firstSentence(s) { s = String(s || ''); var m = s.match(/^(.+?[.!?])(\s|$)/); return m ? m[1] : s; }
  function indexPic(e) { var ims = images(e); for (var i = 0; i < ims.length; i++) if (INDEX_PICS.indexOf(ims[i].kind) > -1) return ims[i]; return null; }
  function indexOf(sec) {
    var test = SECTIONS[sec], words = norm(state.q).split(/\s+/).filter(Boolean);
    return ENTRIES.filter(function (e) { return test(e) && words.every(function (w) { return e._hay.indexOf(w) > -1; }); })
      .sort(function (a, b) { return yearOf(b) - yearOf(a) || (a.no < b.no ? 1 : -1); });
  }
  function indexHead(id, label, n, more) {
    return '<h2 class="ix-h" id="' + id + '"><span>' + esc(label) + ' <span class="n">' + n + '</span></span>' + (more || '') + '</h2>';
  }
  function renderIndex() {
    var sec = state.section, list = indexOf(sec === 'all' ? 'works' : sec);
    var rows = list.map(function (e, i) {
      return '<li><a class="ixr" href="' + esc(hrefOf(e)) + '" data-i="' + i + '"><span class="d">' + esc(datesOf(e)) +
        '</span><span class="t">' + esc(e.name) + '</span><span class="k">' + esc(kindsOf(e)) + '</span></a></li>';
    }).join('');
    var html = '<div class="ix-top"><section aria-labelledby="ixh">' + indexHead('ixh', SECTION_NAME[sec] || 'Works', list.length) +
      (list.length ? '<ol class="ix-list">' + rows + '</ol>' : '<p class="empty">Nothing in the archive matches that.</p>') + '</section>' +
      '<aside class="ix-look" aria-hidden="true"><figure><div class="frame" id="ixf"></div><figcaption id="ixc"></figcaption></figure></aside></div>';
    if (sec === 'all') {
      html += '<div class="ix-rest">' + [['texts', 'Texts'], ['talks', 'Talks']].map(function (s) {
        var all = indexOf(s[0]), part = state.q ? all : all.slice(0, INDEX_SIDE_N);
        return '<section aria-labelledby="ixh-' + s[0] + '">' +
          indexHead('ixh-' + s[0], s[1], all.length, all.length > part.length ? '<a href="#' + s[0] + '">All ' + s[1].toLowerCase() + '</a>' : '') +
          '<ol class="ix-side">' + part.map(function (e) {
            return '<li><a class="ixr" href="' + esc(hrefOf(e)) + '"><span class="d">' + (yearOf(e) || '') + '</span><span class="t">' + esc(e.name) + '</span></a></li>';
          }).join('') + '</ol></section>';
      }).join('') + '</div>';
    }
    root.innerHTML = html;
    var frame = $('ixf'), cap = $('ixc'), look = root.querySelector('.ix-look');
    look.style.top = (barHeight() + 16) + 'px';
    function show(e) {
      var p = indexPic(e);
      frame.innerHTML = p ? '<img src="' + esc(p.url) + '" alt="">' : '<p class="none">' + esc(firstSentence(e.description)) + '</p>';
      cap.innerHTML = '<b>' + esc(e.no + ' ' + e.name) + '</b>' + esc(datesOf(e)) + (kindsOf(e) ? ', ' + esc(kindsOf(e)) : '');
    }
    if (!list.length) { look.style.display = 'none'; return; }
    show(list.filter(indexPic)[0] || list[0]);
    function on(ev) { var a = ev.target.closest && ev.target.closest('a.ixr[data-i]'); if (a) show(list[+a.getAttribute('data-i')]); }
    var ol = root.querySelector('.ix-list');
    ol.addEventListener('mouseover', on);
    ol.addEventListener('focusin', on);
  }

  /* ---------- sheet view: every picture, small, numbered ---------- */
  /* Each cell is one link to the viewer (#p-<no>-<frame>). The label is the entry number, and
     a frame number after it when the entry has more than one picture: 2601 or 2601.3. */
  function sheetEntries() {
    var test = SECTIONS[state.section] || SECTIONS.all;
    var words = norm(state.q).split(/\s+/).filter(Boolean);
    return ENTRIES.filter(function (e) { return test(e) && words.every(function (w) { return e._hay.indexOf(w) > -1; }); })
      .sort(function (a, b) { return a.no < b.no ? 1 : -1; });
  }
  function pictureItems(list, kinds) {
    var out = [];
    list.forEach(function (e) {
      var ims = images(e);
      ims.forEach(function (i, n) {
        var key = e.no + '-' + (n + 1);
        if (dead[key] || (kinds && kinds.indexOf(i.kind) < 0)) return;
        out.push({ key: key, no: e.no, name: e.name, href: hrefOf(e), frame: n + 1, total: ims.length, src: i.url,
          w: i.size && i.size[0] || 0, h: i.size && i.size[1] || 0, credit: i.credit, caption: i.caption, alt: altOf(e, i) });
      });
    });
    return out;
  }
  /* the viewer asks for the sequence: the sheet as it is now, or (all = true) every picture */
  function sheetKinds() { return SHEET_KINDS_BY_SECTION[state.section] || SHEET_KINDS; }
  window.YKSheet = function (all) { return all ? pictureItems(ENTRIES.slice().sort(function (a, b) { return a.no < b.no ? 1 : -1; })) : pictureItems(sheetEntries(), sheetKinds()); };
  function sheetScale() { return window.innerWidth <= PHONE_MAX ? SHEET_SCALE.phone : SHEET_SCALE.desk; }
  function sheetColsNow() {
    var sc = sheetScale();
    if (sheetCols && sc.indexOf(sheetCols) > -1) return sheetCols;
    if (sheetCols) return sc.reduce(function (a, b) { return Math.abs(b - sheetCols) < Math.abs(a - sheetCols) ? b : a; });
    return sc === SHEET_SCALE.phone ? 4 : (window.innerWidth >= 1200 ? 12 : 8);
  }
  function applySheetCols() {
    var ol = root.querySelector('.sheet'), sc = sheetScale(), c = sheetColsNow(), i = sc.indexOf(c);
    if (ol) ol.style.setProperty('--cols', c);
    var m = $('szm'), p = $('szp');
    if (m) m.disabled = i <= 0;
    if (p) p.disabled = i >= sc.length - 1;
  }
  function stepSheet(d) {
    var sc = sheetScale(), i = sc.indexOf(sheetColsNow()) + d;
    if (i < 0 || i > sc.length - 1) return;
    sheetCols = sc[i];
    try { sessionStorage.setItem('ykSheetCols', String(sheetCols)); } catch (err) { /* ignore */ }
    applySheetCols();
  }
  function sheetCell(it) {
    var label = it.total > 1 ? it.no + '.' + it.frame : it.no;
    var name = it.no + ' ' + it.name + (it.total > 1 ? ', picture ' + it.frame + ' of ' + it.total : '');
    var li = el('li', null);
    li.appendChild(el('a', { href: '#p-' + it.no + '-' + it.frame, 'data-key': it.key, title: it.name, 'aria-label': name },
      '<span class="sq"><img src="' + esc(it.src) + '" alt="" width="' + (it.w || 4) + '" height="' + (it.h || 3) +
      '" loading="lazy" decoding="async"></span><span class="no">' + esc(label) + '</span>'));
    return li;
  }
  function renderSheet() {
    var items = pictureItems(sheetEntries(), sheetKinds());
    var bar = el('div', { class: 'sheetbar' },
      '<span class="size" role="group" aria-label="Picture size">' +
      '<button type="button" id="szm" aria-label="Smaller pictures">&#8722;</button> ' +
      '<button type="button" id="szp" aria-label="Larger pictures">+</button></span>');
    var ol = el('ol', { class: 'sheet', 'aria-label': 'Archive pictures, contact sheet' });
    root.appendChild(bar);
    root.appendChild(ol);
    $('szm').addEventListener('click', function () { stepSheet(-1); });
    $('szp').addEventListener('click', function () { stepSheet(1); });
    applySheetCols();
    if (!items.length) { root.appendChild(el('p', { class: 'empty' }, 'Nothing in the archive matches that.')); return; }
    var mine = renderToken, at = 0;
    (function chunk() {
      if (mine !== renderToken) return;
      var frag = document.createDocumentFragment(), end = Math.min(at + 48, items.length);
      for (; at < end; at++) frag.appendChild(sheetCell(items[at]));
      ol.appendChild(frag);
      Array.prototype.forEach.call(ol.querySelectorAll('img:not(.ok)'), function (im) { if (im.complete && im.naturalWidth) im.className = 'ok'; });
      if (at < items.length) requestAnimationFrame(chunk);
    })();
  }

  function render() {
    hideThumb();
    renderToken++;
    root.innerHTML = '';
    root.className = state.view + 'view';
    if (state.view === 'sheet') { renderSheet(); return; }
    if (state.view === 'index') { renderIndex(); return; }
    var list = filtered();
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
  // no hash: the index. #works, #texts ...: that section in the present view. #image: the stream. #list: the table.
  // #e-NNNN: the table, with that row open. #more: the biography.
  // #sheet: the contact sheet. #p-NNNN-F: that picture in the viewer (viewer.js), over the sheet.
  function fromHash(initial) {
    var h = decodeURIComponent(location.hash.slice(1));
    // a hash that only describes what is already shown (Back from the viewer, say) changes nothing
    if (!initial && ('#' + h === currentHash() || (!h && !currentHash()))) return;
    if (/^p-\d{4}-\d+$/.test(h)) { if (state.view !== 'sheet') setView('sheet'); return; }
    if (h === 'more') { setView('index'); setSection('all', false); setMore(true); toAbout(); return; }
    if (/^e-\d{4}$/.test(h)) {
      state.open.add(h.slice(2)); setView('list'); setSection('all', false); toEntry(h);
      return;
    }
    setView({ list: 'list', sheet: 'sheet', image: 'image' }[h] || (state.view !== 'index' && SECTIONS[h] ? state.view : 'index'));
    setSection(SECTIONS[h] ? h : 'all', false);
  }

  // a picture that fails to load (a dead link, a missing file) turns its stream item into the
  // no-picture form (name set large) instead of leaving a hole; strip and table pictures are dropped
  document.addEventListener('error', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'IMG') {
      if (t.id === 'thumb') { hideThumb(); return; }
      var cell = t.closest('.sheet > li');
      if (cell) { dead[cell.firstChild.getAttribute('data-key')] = 1; cell.parentNode.removeChild(cell); return; }
      var item = t.closest('.stream > li');
      if (item) { item.classList.remove('pic'); item.classList.add('noimg'); return; }
      var strip = t.closest('.strip a') || t;
      if (strip && strip.parentNode) { strip.parentNode.removeChild(strip); }
    }
  }, true);

  wireBar();
  fromHash(true);
  window.addEventListener('hashchange', function () { userMoved = true; fromHash(false); });
  window.addEventListener('resize', function () { if (state.view === 'sheet') applySheetCols(); });
  // the sheet's pictures show the tint only until they have loaded
  document.addEventListener('load', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('.sheet')) t.className = 'ok';
  }, true);
  // row heights settle when pictures in open rows load: place the reader on the row once more
  window.addEventListener('load', function () {
    var h = decodeURIComponent(location.hash.slice(1));
    if (!userMoved && /^e-\d{4}$/.test(h)) toEntry(h);
  });
})();
