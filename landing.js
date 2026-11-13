/* yeltakom.info, the opening of the home page. Hand-written.
   One running block of large type, as one long sentence made of the archive: titles, dates and
   places on solid colour fields, quotations from the texts set small inside the lines, and
   photographs standing in the line like words. Every piece is a link to its record. The
   selection and the order change with every visit; index.html?seed=123 repeats one of them.
   The composition is in English only: quotations come from texts the artist wrote in English
   (see MIX_LANGS in make_landing_data.py) and a name written "Turkish / English" shows its
   English half (LANDING.titles).
   Loaded with defer after landingdata.js; fills <section id="mix"> and then shows it. If either
   file is missing the section stays hidden and the page begins with the introduction.
   Data: ARCHIVE (data.js) and LANDING (landingdata.js). */
(function () {
  'use strict';
  function build() {
  var root = document.getElementById('mix');
  if (!root || typeof ARCHIVE === 'undefined' || typeof LANDING === 'undefined' || !LANDING.quotes) return false;
  root.innerHTML = '';

  /* ---------- seeded random ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var param = null;
  try { param = new URLSearchParams(location.search).get('seed'); } catch (x) { /* old browser: random */ }
  var seed = param !== null && param !== '' ? (/^-?\d+$/.test(param) ? parseInt(param, 10) >>> 0 : hash(param))
    : ((Math.random() * 4294967296) >>> 0);
  var a = seed;
  function rnd() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function shuffle(arr) { var r = arr.slice(); for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; } return r; }
  function pickOne(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hrefOf(e) { return e.page || e.text || ('index.html#e-' + e.no); }

  /* ---------- the pools, all from the archive ---------- */
  var ENT = ARCHIVE.entries;
  var byNo = {}; ENT.forEach(function (e) { byNo[e.no] = e; });
  /* the name as the composition shows it: the English half of "Turkish / English", else the name as it is */
  var EN = LANDING.titles || {};
  function nameOf(e) { return EN[e.no] || e.name; }

  /* a title short enough to be set large: the whole of it, else its first part */
  function shortTitle(name) {
    var n = String(name || '').trim();
    if (n.length <= 28) return n;
    var parts = n.split(/:\s+/);
    for (var i = 0; i < parts.length; i++) if (parts[i].length >= 4 && parts[i].length <= 28) return parts[i];
    return null;
  }
  var SKIP = {}; (LANDING.notitle || []).forEach(function (n) { SKIP[n] = 1; });
  var titles = ENT.filter(function (e) { return !SKIP[e.no] && shortTitle(nameOf(e)); });

  /* the published images of the archive (assets/images/..., from the manifest), at most three per record, ten in all */
  function imgsOf(e) { return (e.imgs || []).filter(function (i) { return LANDING.sizes && LANDING.sizes[i[0]]; }); }
  var picEntries = shuffle(ENT.filter(function (e) { return imgsOf(e).length; }));
  var pics = [];
  picEntries.forEach(function (e) {   /* one picture per record, the second and third only if the first round is short */
    shuffle(imgsOf(e)).slice(0, 3).forEach(function (i, k) { pics.push({ e: e, url: i[0], wh: LANDING.sizes[i[0]], k: k }); });
  });
  pics.sort(function (x, y) { return x.k - y.k; });   /* stable: the first picture of each record comes first */
  pics = pics.slice(0, 10);

  var qEn = shuffle(LANDING.quotes.filter(function (q) { return q.lang !== 'tr'; }));
  var qTr = shuffle(LANDING.quotes.filter(function (q) { return q.lang === 'tr'; }));
  var usedQ = {};
  function nextQuote() {
    var pool = (rnd() < 0.34 && qTr.length) ? qTr : (qEn.length ? qEn : qTr);
    while (pool.length) {
      var q = pool.pop();
      if (usedQ[q.href]) continue;
      usedQ[q.href] = 1; return q;
    }
    return null;
  }

  /* ---------- the colour fields (defined once, in landing.css) ---------- */
  var BAG = ['f1', 'f2', 'f3', 'f4', 'f1', 'f2', 'f3', 'f4', 'fs', 'fw'];  /* fs ultramarine, fw plain white */
  var bag = [], lastField = '';
  function field() {
    if (!bag.length) { bag = shuffle(BAG); if (bag[bag.length - 1] === lastField) bag.unshift(bag.pop()); }
    var f = bag.pop();
    if (f === lastField) { bag.unshift(f); f = bag.pop(); }
    lastField = f; return f;
  }

  /* ---------- the pieces ---------- */
  var usedT = {};
  function nextTitle() {
    var e, k = 0;
    do { e = pickOne(titles); k++; } while (usedT[e.no] && k < 60);
    usedT[e.no] = 1; return e;
  }
  function titlePiece(e, cls) {
    return '<a class="p t ' + field() + (cls ? ' ' + cls : '') + '" href="' + esc(hrefOf(e)) + '">' + esc(shortTitle(nameOf(e))) + '</a>';
  }
  function datePiece(e) {
    return '<a class="p d ' + (rnd() < 0.7 ? 'fs' : field()) + '" href="' + esc(hrefOf(e)) + '">' + esc(e.dates) + '</a>';
  }
  function placePiece(e) {
    return '<a class="p l ' + field() + '" href="' + esc(hrefOf(e)) + '">' + esc(e.place) + '</a>';
  }
  function quotePiece(q) {
    var e = byNo[q.no]; var f = field(); if (f === 'fw') f = 'f' + (1 + Math.floor(rnd() * 4));
    var va = pickOne(['vt', 'vm', 'vb']);
    return '<a class="p q ' + f + ' ' + va + '" lang="' + esc(q.lang) + '" href="' + esc(q.href) + '">' + esc(q.text) +
      (e ? '<span class="vh"> (' + esc(nameOf(e)) + ')</span>' : '') + '</a>';
  }
  var nImg = 0;
  function picPiece(p) {
    var s = pickOne(['s1', 's2', 's2', 's3', 's3']);
    var va = pickOne(['vt', 'vm', 'vb']);
    var w = p.wh[0], h = p.wh[1];
    return '<a class="p i ' + s + ' ' + va + '" href="' + esc(hrefOf(p.e)) + '" style="aspect-ratio:' + w + '/' + h + '">' +
      '<img src="' + esc(p.url) + '" width="' + w + '" height="' + h + '" alt="' + esc(nameOf(p.e)) + '"' + (nImg++ < 4 ? '' : ' loading="lazy"') + ' decoding="async"></a>';
  }

  /* one step of the sentence: a cluster of pieces, usually one record (date, title, place),
     or a picture, or a quotation. Rules keep the rhythm: no two quotations in a row, no
     more than two pictures in a row. */
  var prev = '', run = 0, sinceImg = 0, sinceQuote = 0;
  function nextCluster(first) {
    var r = rnd(), kind;
    if (first) kind = 'title';
    else if (sinceImg >= 3) kind = 'image';
    else if (sinceQuote >= 4) kind = 'quote';
    else if (r < 0.52) kind = 'title';
    else if (r < 0.82) kind = 'image';
    else kind = 'quote';
    if (kind === 'quote' && prev === 'quote') kind = 'title';
    if (kind === 'image' && prev === 'image' && run >= 2) kind = 'title';
    if (kind === 'image' && !pics.length) kind = 'title';
    var out = '';
    if (kind === 'image') out = picPiece(pics.pop());
    else if (kind === 'quote') { var q = nextQuote(); if (q) out = quotePiece(q); else kind = 'title'; }
    if (kind === 'title') {
      var e = nextTitle();
      if (!first && rnd() < 0.7) out += datePiece(e) + ' ';
      out += titlePiece(e, first ? 'lead' : '');
      if (e.place && rnd() < 0.6) out += ' ' + placePiece(e);
    }
    sinceImg = kind === 'image' ? 0 : sinceImg + 1; sinceQuote = kind === 'quote' ? 0 : sinceQuote + 1;
    run = (kind === prev) ? run + 1 : 1; prev = kind;
    return out;
  }

  /* ---------- build: add steps until the block fills about one screen and a half ---------- */
  function barH() { var b = document.getElementById('bar'); return b ? b.offsetHeight : 0; }
  var flow = document.createElement('div'); flow.className = 'flow';
  root.appendChild(flow);

  var target = Math.max(520, (window.innerHeight - barH()) * 1.12);
  var html = '', guard = 0;
  do {
    html += nextCluster(guard === 0) + ' ';
    flow.innerHTML = html;
    guard++;
  } while (root.offsetHeight < target && guard < 80);

  return true;
  }
  var box = document.getElementById('mix');
  if (box) {
    box.removeAttribute('hidden');   /* shown first: the height is measured while the block is filled */
    if (build()) document.dispatchEvent(new Event('ykmix'));   /* app.js places the table again if the address asked for it */
    else box.setAttribute('hidden', '');
  }
})();
