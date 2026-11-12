#!/usr/bin/env python3
"""Regenerate yeltakom.info from archive.json + texts/*.md.

Usage:  python3 build.py [ARCHIVE_DIR] [--public]
--public leaves texts whose front matter marks them unpublished or draft off the build.
ARCHIVE_DIR defaults to ../archive (relative to this file) and must contain
archive.json and texts/*.md. Writes into the folder of this script:
data.js, index.html, about.html, press.html, texts/<slug>.html.
app.js and style.css are hand-written and not touched.
"""
import html, json, os, re, sys, unicodedata
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FLAGS = {a for a in sys.argv[1:] if a.startswith("--")}
PUBLIC = "--public" in FLAGS   # leave unpublished drafts off the built site
SRC = os.path.abspath(ARGS[0]) if ARGS else os.path.join(os.path.dirname(HERE), "archive")
E = html.escape
LANGS = {"tr": "Turkish", "de": "German", "en": "English"}
EMAIL = "address to be added"   # set this to the real contact address before launch
FONT = ""  # Arial: system font, no webfont to load
KEEP = ["no", "dates", "name", "types", "for", "with", "place", "role", "status",
        "description", "links", "shown", "section"]


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower().replace("ı", "i"))
    return re.sub(r"[^a-z0-9]+", "", "".join(c for c in s if not unicodedata.combining(c)))


# ---------------------------------------------------------------- markdown
def front_matter(raw):
    meta, body = {}, raw
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", raw, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"')
        body = m.group(2)
    return meta, body


URL_RE = r"https?://[^\s<>()\"]+[^\s<>()\".,;:!?]"


def inline(t, fnp):
    """Escape and convert inline markdown. fnp = footnote id prefix."""
    t = E(t, quote=False)
    t = re.sub(r"\\([\\`*_{}\[\]()#+\-.!>])", lambda m: "&#%d;" % ord(m.group(1)), t)
    links = []

    def keep(h):
        links.append(h)
        return "\x00%d\x00" % (len(links) - 1)
    t = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)",
               lambda m: keep('<img src="%s" alt="%s" loading="lazy">' % (m.group(2), m.group(1))), t)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)",
               lambda m: keep('<a href="%s">%s</a>' % (m.group(2), m.group(1))), t)
    t = re.sub(r"&lt;(" + URL_RE + r")&gt;", lambda m: keep('<a href="%s">%s</a>' % (m.group(1), m.group(1))), t)
    t = re.sub(URL_RE, lambda m: keep('<a href="%s">%s</a>' % (m.group(0), m.group(0))), t)
    t = re.sub(r"\[\^?(\d{1,3})\]",
               lambda m: keep('<sup class="fn"><a href="#%s-fn%s" id="%s-ref%s">%s</a></sup>'
                              % (fnp, m.group(1), fnp, m.group(1), m.group(1))), t)
    t = re.sub(r"\^(\d{1,2})(?!\d)", r"<sup>\1</sup>", t)
    t = re.sub(r"\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*", r"<strong><em>\1</em></strong>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = t.replace("**", "")  # unmatched bold marker in source
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)
    t = re.sub(r"(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])", r"<em>\1</em>", t)
    t = balance(t)
    for _ in range(3):
        t = re.sub(r"\x00(\d+)\x00", lambda m: links[int(m.group(1))], t)
    return t


def balance(t):
    """Repair crossed or unmatched <em>/<strong> produced by malformed source emphasis."""
    out, stack = [], []
    for tok in re.split(r"(</?(?:em|strong)>)", t):
        m = re.match(r"^<(/?)(em|strong)>$", tok)
        if not m:
            out.append(tok)
        elif not m.group(1):
            stack.append(m.group(2)); out.append(tok)
        elif m.group(2) in stack:
            reopen = []
            while stack[-1] != m.group(2):
                reopen.append(stack.pop()); out.append("</%s>" % reopen[-1])
            stack.pop(); out.append(tok)
            for r in reversed(reopen):
                stack.append(r); out.append("<%s>" % r)
    out += ["</%s>" % x for x in reversed(stack)]
    return re.sub(r"<(em|strong)></\1>", "", "".join(out))


def md(body, fnp):
    out, notes = [], []
    blocks = re.split(r"\n\s*\n", body.strip("\n"))
    for b in blocks:
        lines = [l.rstrip() for l in b.strip("\n").splitlines() if l.strip()]
        if not lines:
            continue
        first = lines[0].lstrip()
        h = re.match(r"^(#{1,6})\s+(.*)$", first)
        fn = re.match(r"^\[\^?(\d{1,3})\]:?\s*(?:-\s+)?(.*)$", first)
        if h and len(lines) == 1:
            lvl = min(len(h.group(1)) + 1, 4)  # page title is h1
            txt = re.sub(r"^\*\*(.*)\*\*$", r"\1", h.group(2).strip())
            out.append("<h%d>%s</h%d>" % (lvl, inline(txt, fnp), lvl))
        elif fn:
            n = fn.group(1)
            rest = " ".join([fn.group(2)] + [l.strip() for l in lines[1:]])
            notes.append('<li id="%s-fn%s" value="%s">%s <a class="back" href="#%s-ref%s" aria-label="Back to text">&#8617;</a></li>'
                         % (fnp, n, n, inline(rest, fnp + "x"), fnp, n))
        elif all(re.match(r"^\s*[-*+]\s+", l) for l in lines):
            out.append("<ul>" + "".join("<li>%s</li>" % inline(re.sub(r"^\s*[-*+]\s+", "", l), fnp) for l in lines) + "</ul>")
        elif all(re.match(r"^\s*\d+[.)]\s+", l) for l in lines):
            out.append("<ol>" + "".join("<li>%s</li>" % inline(re.sub(r"^\s*\d+[.)]\s+", "", l), fnp) for l in lines) + "</ol>")
        elif all(l.lstrip().startswith(">") for l in lines):
            out.append("<blockquote><p>%s</p></blockquote>" % inline(" ".join(re.sub(r"^\s*>\s?", "", l) for l in lines), fnp))
        elif re.match(r"^(\*\s*){3,}$|^(-\s*){3,}$", first):
            out.append("<hr>")
        else:
            out.append("<p>%s</p>" % inline(" ".join(l.strip() for l in lines), fnp))
    if notes:
        out.append('<ol class="notes">' + "".join(notes) + "</ol>")
    return "\n".join(out)


def host(u):
    return re.sub(r"^www\.", "", re.sub(r"^https?://([^/]+).*$", r"\1", u))


# ---------------------------------------------------------------- page chrome
def nav(root, current=""):
    items = [("index.html", "Archive"), ("index.html#texts", "Texts"), ("index.html#talks", "Talks"),
             ("press.html", "Press"), ("about.html", "About")]
    li = "".join('<a href="%s%s"%s>%s</a>' % (root, h, ' aria-current="page"' if l == current else "", l)
                 for h, l in items)
    return ('<header class="site"><a class="mark" href="%sindex.html">Yelta Köm</a><nav aria-label="Main">%s</nav></header>'
            % (root, li))


def footer(root):
    return ('<footer class="site"><div><strong>Yelta Köm</strong><br>Berlin</div>'
            '<div>Represented by Versus Art Project, Istanbul</div>'
            '<div>Exhibition design and scenography: <a href="https://noframe.studio">Studio No Frame &#8599;</a></div>'
            '<div id="contact">Contact: %s</div>'
            '<div><a href="%sabout.html">About</a> &#183; <a href="%spress.html">Press</a></div></footer>'
            % (EMAIL, root, root))


def ver(name):
    """Append a short content hash so browsers never serve a stale asset."""
    import hashlib
    try:
        with open(os.path.join(HERE, name), "rb") as fh:
            return name + "?v=" + hashlib.sha1(fh.read()).hexdigest()[:8]
    except OSError:
        return name


def page(title, body, root="", current="", cls="", scripts=""):
    return ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>%s</title>\n%s\n<link rel="stylesheet" href="%s%s">\n</head>\n'
            '<body class="%s">\n<a class="skip" href="#main">Skip to content</a>\n%s\n<main id="main">\n%s\n</main>\n%s\n%s</body>\n</html>\n'
            % (E(title), FONT, root, ver("style.css"), cls, nav(root, current), body, footer(root), scripts))


# ---------------------------------------------------------------- build
def main():
    data = json.load(open(os.path.join(SRC, "archive.json"), encoding="utf-8"))
    entries = sorted(data["entries"], key=lambda x: x["no"], reverse=True)
    excluded = {norm(x["name"]) for x in data.get("excluded", [])}
    by_key = {}
    for x in entries:
        for k in (x.get("texts"), x.get("slug")):
            if k:
                by_key.setdefault(k, x)
    by_title = {norm(x["name"]): x for x in entries}

    # group text files by base slug
    tdir = os.path.join(SRC, "texts")
    groups = OrderedDict()
    for f in sorted(os.listdir(tdir)):
        m = re.match(r"^(.+)\.([a-z]{2})\.md$", f)
        if not m:
            continue
        meta, body = front_matter(open(os.path.join(tdir, f), encoding="utf-8").read())
        groups.setdefault(m.group(1), []).append(dict(meta=meta, body=body, lang=meta.get("lang", m.group(2))))

    os.makedirs(os.path.join(HERE, "texts"), exist_ok=True)
    for old in os.listdir(os.path.join(HERE, "texts")):
        if old.endswith(".html"):
            os.remove(os.path.join(HERE, "texts", old))
    unmatched, skipped, text_pages = [], [], {}
    for base, vers in groups.items():
        title = vers[0]["meta"].get("title", base)
        ent = by_key.get(base) or by_title.get(norm(title))
        if not ent and norm(title) in excluded:
            skipped.append("%s (%s): listed in excluded, no page" % (base, title))
            continue
        if not ent:
            unmatched.append("%s (%s): no archive entry, page built without row" % (base, title))
        if PUBLIC and any("unpublish" in str(v["meta"].get("status", "")).lower()
                          or "draft" in str(v["meta"].get("status", "")).lower() for v in vers):
            skipped.append("%s (%s): unpublished draft, left off the public build" % (base, title))
            continue
        orig = [v for v in vers if not v["meta"].get("translation")] or vers[:1]
        trans = [v for v in vers if v not in orig]
        vers = orig[:1] + trans + orig[1:]
        text_pages[base] = ent["no"] if ent else None
        write_text(base, title, vers, ent)

    # data.js
    texts_for_no = {no: b for b, no in text_pages.items() if no}
    out = []
    for x in entries:
        y = {k: x.get(k) for k in KEEP if x.get(k) not in (None, [], "")}
        if x["no"] in texts_for_no:
            y["text"] = "texts/%s.html" % texts_for_no[x["no"]]
        out.append(y)
    names = {x["no"]: x["name"] for x in entries}
    press = sorted(data.get("press", []), key=lambda p: p.get("date") or "", reverse=True)
    press = [{k: p.get(k) for k in ("date", "outlet", "title", "language", "url", "kind", "about", "summary")} for p in press]
    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("/* Generated by build.py from archive.json. Edit archive.json and rerun build.py. */\n")
        fh.write("const ARCHIVE = ")
        json.dump({"entries": out, "press": press}, fh, ensure_ascii=False, indent=0)
        fh.write(";\n")

    write_index()
    write_press(press, names)
    write_about(entries)

    log = ["entries: %d" % len(out), "text pages: %d" % len([1 for _ in text_pages]),
           "press: %d" % len(press)] + ["UNMATCHED " + u for u in unmatched] + ["SKIPPED " + s for s in skipped]
    open(os.path.join(HERE, "build.log"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))


def write_text(base, title, vers, ent):
    meta0 = vers[0]["meta"]
    bits = []
    date = (ent or {}).get("dates") or meta0.get("date")
    if date:
        bits.append(E(str(date)))
    if ent and ent.get("for"):
        bits.append(E(ent["for"]))
    if ent:
        bits.append('<a href="../index.html#e-%s">No. %s</a>' % (ent["no"], ent["no"]))
    links = [l for l in (ent or {}).get("links", []) if l["label"] not in ("image",)]
    links.sort(key=lambda l: l["label"] != "original")
    multi = sum(1 for l in links if l["label"] == "original") > 1
    ltxt = " &#183; ".join('<a href="%s">%s &#8599;</a>' % (E(l["url"]), E(l["label"].capitalize() + (
        ", " + host(l["url"]) if multi and l["label"] == "original" else ""))) for l in links)
    status = meta0.get("status", "")
    if status:
        stxt = "Draft, unpublished" if "draft" in status else "Unpublished text"
        ltxt = (ltxt + " &#183; " if ltxt else "") + E(stxt)
    notice = meta0.get("notice", "")
    cols, switch = [], []
    for i, v in enumerate(vers):
        lang = v["lang"]
        lname = LANGS.get(lang, lang.upper())
        tr = v["meta"].get("translation")
        if tr and "not reviewed" not in tr:
            tr += ", not reviewed by the author"
        note = '<p class="ai">%s</p>' % E(tr) if tr else '<p class="ai orig">Original, %s</p>' % lname
        if notice:
            note += '<p class="ai">%s</p>' % E(notice)
        cols.append('<article class="version" lang="%s" data-v="%d"%s>%s\n%s</article>'
                    % (lang, i, "" if i < 2 else " hidden", note, md(v["body"], "v%d" % i)))
        switch.append('<button type="button" data-show="%d" aria-pressed="%s">%s%s</button>'
                      % (i, "true" if i == 0 else "false", lname, " (AI)" if tr else ""))
    if len(vers) >= 2:
        switch.append('<button type="button" class="both" data-show="both" aria-pressed="false">Side by side</button>')
    sw = ('<div class="langswitch" role="group" aria-label="Language">%s</div>' % "".join(switch)) if len(vers) > 1 else ""
    body = ('<div class="textpage%s">\n<div class="texthead"><h1>%s</h1>\n<p class="meta">%s</p>\n%s%s</div>\n'
            '<div class="versions">\n%s\n</div>\n</div>'
            % (" multi" if len(vers) > 1 else "", E(title), " &#183; ".join(bits),
               ('<p class="meta links">%s</p>\n' % ltxt) if ltxt else "", sw, "\n".join(cols)))
    js = '<script src="../%s"></script>\n' % ver("text.js") if len(vers) > 1 else ""
    open(os.path.join(HERE, "texts", base + ".html"), "w", encoding="utf-8").write(
        page("%s · Yelta Köm" % title, body, root="../", current="Texts", cls="text", scripts=js))


def write_index():
    intro = ('<p class="intro">Yelta Köm is an artist working through spatial practices, trained as an architect and based in Berlin. '
             'His work moves between counter-mapping, critical cartography, installation and research, much of it on water and territory '
             'along the Tigris. '
             'Exhibition design and scenography: <a href="https://noframe.studio">Studio No Frame &#8599;</a>. '
             'Here is more <a href="about.html">about</a> his practice, his <a href="#texts">texts</a>, <a href="#talks">talks</a> '
             'and <a href="press.html">press</a>, and how to <a href="about.html#contact">contact</a> him, or look through the archive below, '
             'which can be filtered or seen in image view.</p>')
    body = intro + '''
<section class="controls" aria-label="Filter the archive">
  <div class="frow" id="sections" role="group" aria-label="Section"></div>
  <div class="frow" id="types" role="group" aria-label="Type/s"></div>
  <div class="frow tools">
    <label class="search"><span class="vh">Search</span><input id="q" type="search" placeholder="Search" autocomplete="off"></label>
    <label class="forsel"><span class="vh">For</span><select id="for"><option value="">For: all</option></select></label>
    <button type="button" id="reset" class="plain">Clear</button>
    <span id="count" aria-live="polite"></span>
    <span class="view" role="group" aria-label="View"><button type="button" id="vlist" aria-pressed="true">List</button> / <button type="button" id="vimg" aria-pressed="false">Image</button></span>
  </div>
</section>
<div id="archive"></div>
<noscript><p>The archive table needs JavaScript. A full list is on the <a href="about.html">About</a> page.</p></noscript>'''
    open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(
        page("Yelta Köm · Archive", body, current="Archive", cls="home",
             scripts='<script src="%s"></script>\n<script src="%s"></script>\n' % (ver("data.js"), ver("app.js"))))


def write_press(press, names):
    rows = []
    for p in press:
        rel = ('<a href="index.html#e-%s">%s %s</a>' % (p["about"], p["about"], E(names.get(p["about"], ""))) if p.get("about") else "")
        t = ('<a href="%s">%s &#8599;</a>' % (E(p["url"]), E(p["title"] or p["url"]))) if p.get("url") else E(p.get("title") or "")
        rows.append('<tr><td class="num">%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>'
                    % (E(p.get("date") or "n.d."), E(p.get("outlet") or ""), t, E(p.get("language") or ""),
                       E((p.get("kind") or "").capitalize()), rel))
    body = ('<h1 class="pagehead">Press</h1>\n<p class="lede">Articles, reviews, listings, news and interviews about Yelta Köm and his work, newest first. '
            'Each item links to the archive entry it relates to.</p>\n'
            '<table class="press"><thead><tr><th scope="col">Date</th><th scope="col">Outlet</th><th scope="col">Title</th>'
            '<th scope="col">Lang.</th><th scope="col">Kind</th><th scope="col">Work</th></tr></thead>\n<tbody>\n%s\n</tbody></table>'
            % "\n".join(rows))
    open(os.path.join(HERE, "press.html"), "w", encoding="utf-8").write(page("Press · Yelta Köm", body, current="Press"))


def write_about(entries):
    def has(x, *ts):
        return any(t in x["types"] for t in ts)
    bio = ('<p>Yelta Köm is an artist working through spatial practices, trained as an architect at Yıldız Technical University in Istanbul '
           'and in the Architecture Class of the Städelschule in Frankfurt am Main, and based in Berlin. His work combines counter-mapping, '
           'critical cartography, installation, video and research, with a long engagement with water, displacement and territory along the Tigris, '
           'including work with Arazi Assembly alongside people from villages flooded by the Ilısu Dam.</p>'
           '<p>He co-founded the collective Herkes İçin Mimarlık / Architecture for All in 2011, was associate curator of Vardiya / The Shift, '
           'the Pavilion of Türkiye at the 16th International Architecture Exhibition of La Biennale di Venezia (2018), and worked as a researcher '
           'on the ERC project Topological Atlas / Border Topologies (TU Delft and Goldsmiths) from 2019 to 2022. He chairs the board of TOP e.V., '
           'which runs TOP Project Space in Berlin.</p>')
    groups = [
        ("Exhibitions", lambda x: has(x, "Exhibition (solo)", "Exhibition (group)")),
        ("Works", lambda x: x["section"] == "work" and not has(x, "Exhibition (solo)", "Exhibition (group)")),
        ("Texts and publications", lambda x: has(x, "Text", "Book / Publication", "Artist book")),
        ("Talks", lambda x: x["section"] == "talk"),
        ("Workshops", lambda x: x["section"] == "workshop"),
        ("Residencies and awards", lambda x: x["section"] == "residency-award"),
        ("Networks", lambda x: x["section"] == "network"),
    ]
    secs = []
    for title, f in groups:
        items = [x for x in entries if f(x)]
        lis = []
        for x in items:
            extra = ", ".join(E(v) for v in (x.get("for"), x.get("place")) if v)
            lis.append('<li><span class="d">%s</span><span><a href="index.html#e-%s">%s</a>%s</span></li>'
                       % (E(x["dates"]), x["no"], E(x["name"]), (", " + extra) if extra else ""))
        secs.append('<section class="cv"><h2>%s <span class="n">%d</span></h2><ul>%s</ul></section>' % (title, len(items), "".join(lis)))
    body = ('<h1 class="pagehead">About</h1>\n<div class="bio">%s\n<p class="contact" id="contact-about">Contact: %s<br>'
            'Represented by Versus Art Project, Istanbul<br>Exhibition design and scenography: <a href="https://noframe.studio">Studio No Frame &#8599;</a></p></div>\n'
            '<div class="cvwrap">%s</div>' % (bio, EMAIL, "\n".join(secs)))
    open(os.path.join(HERE, "about.html"), "w", encoding="utf-8").write(page("About · Yelta Köm", body, current="About"))


if __name__ == "__main__":
    main()
