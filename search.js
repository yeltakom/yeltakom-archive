/* Site search. Hand-written. Reads SEARCHDOCS from searchdata.js.
   Matches on title, metadata and the full body of every text, and shows the
   matching sentence so you can see why a result is there. */
(function () {
  'use strict';
  if (typeof SEARCHDOCS === 'undefined') { return; }

  var KIND = { entry: 'Archive', text: 'Full text', press: 'Press' };

  function fold(s) {
    return String(s || '').toLowerCase()
      .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ç/g, 'c')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // fold once, up front: 300-odd documents, cheap enough and keeps typing smooth
  var DOCS = SEARCHDOCS.map(function (d) {
    return { d: d, t: fold(d.t), m: fold(d.m), b: fold(d.b) };
  });

  function score(doc, terms) {
    var n = 0;
    for (var i = 0; i < terms.length; i++) {
      var q = terms[i];
      if (doc.t.indexOf(q) > -1) { n += 10; }
      else if (doc.m.indexOf(q) > -1) { n += 4; }
      else if (doc.b.indexOf(q) > -1) { n += 2; }
      else { return 0; }            // every term must appear somewhere
    }
    if (doc.t.indexOf(terms.join(' ')) > -1) { n += 8; }
    return n;
  }

  function snippet(doc, terms) {
    var hay = doc.b, raw = doc.d.b;
    if (!raw) { return ''; }
    var at = -1;
    for (var i = 0; i < terms.length && at < 0; i++) { at = hay.indexOf(terms[i]); }
    if (at < 0) { return ''; }
    var start = Math.max(0, at - 90), end = Math.min(raw.length, at + 170);
    var cut = raw.slice(start, end).trim();
    // mark the hits inside the snippet, working on the escaped string
    var out = esc(cut);
    terms.forEach(function (q) {
      if (!q) { return; }
      var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return (start > 0 ? '&#8230; ' : '') + out + (end < raw.length ? ' &#8230;' : '');
  }

  function run(q, root) {
    var terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) { return []; }
    var hits = [];
    for (var i = 0; i < DOCS.length; i++) {
      var s = score(DOCS[i], terms);
      if (s) { hits.push({ doc: DOCS[i], s: s }); }
    }
    hits.sort(function (a, b) { return b.s - a.s || a.doc.d.t.localeCompare(b.doc.d.t); });
    return hits;
  }

  function render(hits, terms, into, count, limit) {
    if (!hits.length) {
      into.innerHTML = '';
      count.textContent = terms.length ? 'Nothing matches that.' : '';
      return;
    }
    count.textContent = hits.length + (hits.length === 1 ? ' result' : ' results');
    var html = ['<ul class="slist results">'];
    hits.slice(0, limit).forEach(function (h) {
      var d = h.doc.d;
      var sn = snippet(h.doc, terms);
      html.push('<li><a href="' + esc(d.h) + '">' +
        '<span class="y">' + esc(KIND[d.k] || '') + '</span>' +
        '<span class="n">' + esc(d.t) + (sn ? '<span class="sn">' + sn + '</span>' : '') + '</span>' +
        '<span class="k">' + esc(d.m) + '</span></a></li>');
    });
    html.push('</ul>');
    if (hits.length > limit) {
      html.push('<p class="more">Showing the first ' + limit + ' of ' + hits.length + '.</p>');
    }
    into.innerHTML = html.join('');
  }

  var input = document.getElementById('bq');
  var into = document.getElementById('sres');
  var count = document.getElementById('scount');
  if (!input || !into) { return; }

  function go() {
    var q = input.value;
    var terms = fold(q).split(/\s+/).filter(Boolean);
    render(run(q), terms, into, count, 60);
    var u = new URL(window.location.href);
    if (q) { u.searchParams.set('q', q); } else { u.searchParams.delete('q'); }
    window.history.replaceState(null, '', u);
  }

  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(go, 120);
  });

  var q0 = new URL(window.location.href).searchParams.get('q');
  if (q0) { input.value = q0; go(); }
  input.focus();
}());
