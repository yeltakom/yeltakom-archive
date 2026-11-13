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
WORK_PAGES = {}   # entry no -> works/<slug>.html, filled in main()
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
    # Manifold's asterisk footnotes: "[*](#ref01)" marks the spot in the text and
    # "[*](ref01)" is the note itself. Give both a real id so each jumps to the other.
    t = re.sub(r"\[([^\]]{1,3})\]\(#ref(\d{1,3})\)",
               lambda m: keep('<sup class="fn"><a href="#%s-anot%s" id="%s-amark%s">%s</a></sup>'
                              % (fnp, m.group(2), fnp, m.group(2), m.group(1))), t)
    t = re.sub(r"\[([^\]]{1,3})\]\(ref(\d{1,3})\)",
               lambda m: keep('<a class="back" id="%s-anot%s" href="#%s-amark%s">%s</a>'
                              % (fnp, m.group(2), fnp, m.group(2), m.group(1))), t)
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
SECTION_LINKS = [("All", "all"), ("Works", "works"), ("Texts", "texts"), ("Talks", "talks"),
                 ("Workshops", "workshops"), ("Networks", "networks")]
# keeps the column header exactly under the frozen bar, whatever height the bar wraps to
BAR_JS = ('<script>(function(){var b=document.getElementById("bar");function s(){'
          'document.documentElement.style.setProperty("--barh",b.offsetHeight+"px");}'
          's();window.addEventListener("resize",s);window.addEventListener("load",s);})();</script>')


def nav(root, current="", view=False, search=True):
    """The one bar: name, section filter, Press, search, and on the archive the
    List / Image switch. It is on every page and frozen at the top, so it is also
    the way back from a work or a text."""
    links = []
    for label, sec in SECTION_LINKS:
        href = root + "index.html" + ("" if sec == "all" else "#" + sec)
        links.append('<a href="%s" data-sec="%s"%s>%s</a>'
                     % (href, sec, ' aria-current="true"' if label == current else "", label))
    links.append('<a href="%spress.html"%s>Press</a>'
                 % (root, ' aria-current="true"' if current == "Press" else ""))
    form = ('<form class="sitesearch" role="search" action="%ssearch.html" method="get">'
            '<label for="sq" class="vh">Search the archive</label>'
            '<input id="sq" name="q" type="search" placeholder="Search" autocomplete="off">'
            '<button type="submit" class="vh">Search</button></form>' % root) if search else ""
    switch = ('<span class="view" role="group" aria-label="View">'
              '<button type="button" id="vlist" aria-pressed="true">List</button> / '
              '<button type="button" id="vimg" aria-pressed="false">Image</button></span>') if view else ""
    return ('<header class="bar" id="bar"><a class="mark" href="%sindex.html">Yelta K&#246;m</a>'
            '<nav aria-label="Sections">%s</nav>%s%s</header>\n%s'
            % (root, "".join(links), form, switch, BAR_JS))


def footer(root):
    return ('<footer class="site"><div>Yelta Köm<br>Berlin</div>'
            '<div>Represented by Versus Art Project, Istanbul</div>'
            '<div>Exhibition design and scenography: <a href="https://noframe.studio">Studio No Frame &#8599;</a></div>'
            '<div id="contact">Contact: %s</div>'
            '<div><a href="%sindex.html#more">About</a> &#183; <a href="%spress.html">Press</a></div></footer>'
            % (EMAIL, root, root))


def ver(name):
    """Append a short content hash so browsers never serve a stale asset."""
    import hashlib
    try:
        with open(os.path.join(HERE, name), "rb") as fh:
            return name + "?v=" + hashlib.sha1(fh.read()).hexdigest()[:8]
    except OSError:
        return name


def page(title, body, root="", current="", cls="", scripts="", view=False, search=True):
    return ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>%s</title>\n%s\n<link rel="stylesheet" href="%s%s">\n</head>\n'
            '<body class="%s">\n<a class="skip" href="#main">Skip to content</a>\n%s\n<main id="main">\n%s\n</main>\n%s\n%s</body>\n</html>\n'
            % (E(title), FONT, root, ver("style.css"), cls, nav(root, current, view, search),
               body, footer(root), scripts))


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
    search_texts = []
    for base, vers in groups.items():
        title = vers[0]["meta"].get("title", base)
        ent = by_key.get(base) or by_title.get(norm(title))
        # the archive entry carries the bilingual name, so prefer it for the page title
        if ent and ent.get("name"):
            title = ent["name"]
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
        for v in vers:
            v["body"] = strip_source_chrome(v["body"], v["meta"].get("source"))
            search_texts.append((base, title, v["lang"], v["body"]))
        write_text(base, title, vers, ent)

    # data.js
    texts_for_no = {no: b for b, no in text_pages.items() if no}
    work_slugs = {x["no"]: wslug(x) for x in entries if x["section"] == "work"}
    out = []
    for x in entries:
        y = {k: x.get(k) for k in KEEP if x.get(k) not in (None, [], "")}
        if x["no"] in texts_for_no:
            y["text"] = "texts/%s.html" % texts_for_no[x["no"]]
        if x["no"] in work_slugs:
            y["page"] = "works/%s.html" % work_slugs[x["no"]]
        out.append(y)
    names = {x["no"]: x["name"] for x in entries}
    press = sorted(data.get("press", []), key=lambda p: p.get("date") or "", reverse=True)
    press = [{k: p.get(k) for k in ("date", "outlet", "title", "language", "url", "kind", "about", "summary")} for p in press]
    for p in press:
        u = (p.get("url") or "").strip()
        if u and not re.match(r"^(https?:)?//|^mailto:", u):
            p["url"] = "https://" + u.lstrip("/")
    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("/* Generated by build.py from archive.json. Edit archive.json and rerun build.py. */\n")
        fh.write("const ARCHIVE = ")
        json.dump({"entries": out, "press": press}, fh, ensure_ascii=False, indent=0)
        fh.write(";\n")

    # one page per work, project and exhibition
    wdir = os.path.join(HERE, "works")
    os.makedirs(wdir, exist_ok=True)
    for old_file in os.listdir(wdir):
        if old_file.endswith(".html"):
            os.remove(os.path.join(wdir, old_file))
    work_pages = {}
    for x in entries:
        if x["section"] == "work":
            work_pages[x["no"]] = wslug(x)
    WORK_PAGES.clear()
    WORK_PAGES.update(work_pages)
    text_pages_by_no = {no: "texts/%s.html" % b for b, no in text_pages.items() if no}
    press_by_no = {}
    for pr in press:
        if pr.get("about"):
            press_by_no.setdefault(pr["about"], []).append(pr)
    for x in entries:
        if x["no"] in work_pages:
            write_work(x, work_pages[x["no"]], text_pages_by_no.get(x["no"]),
                       press_by_no.get(x["no"], []))

    write_index(entries, work_pages, text_pages_by_no)
    write_search(entries, press, search_texts, work_pages, text_pages_by_no)
    write_press(press, names)
    # the About page is gone: its content opens under the introduction (More)
    stale = os.path.join(HERE, "about.html")
    if os.path.exists(stale):
        os.remove(stale)

    log = ["entries: %d" % len(out), "text pages: %d" % len([1 for _ in text_pages]),
           "work pages: %d" % len(work_pages), "press: %d" % len(press),
           "search docs: %d" % (len(entries) + len(press) + len(search_texts))
           ] + ["UNMATCHED " + u for u in unmatched] + ["SKIPPED " + s for s in skipped]
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
        bits.append('<a href="%s">No. %s</a>' % (entry_href(ent["no"], "../"), ent["no"]))
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


def strip_source_chrome(body, source):
    """Drop the publisher's own footer that the collectors captured with the text:
    Manifold's "[+]()" control and its /indeks/ tag row. The .md files stay verbatim;
    this only affects what the site renders. Any other root-relative link is made
    absolute against the source host, so it still goes somewhere."""
    body = re.sub(r"(?m)^\s*\[\+\]\(\s*\)\s*$", "", body)
    body = re.sub(r"(?m)^\s*(?:\[[^\]]+\]\(/indeks/[^)]*\)\s*,?\s*)+$", "", body)
    m = re.match(r"(https?://[^/]+)", str(source or ""))
    if m:
        body = re.sub(r"\]\(/(?!/)", "](%s/" % m.group(1), body)
    return body.rstrip() + "\n"


def entry_href(no, root=""):
    """Best page for an entry number: its own work page if it has one, else the
    archive row. Keeps every cross-link in one place."""
    if no in WORK_PAGES:
        return "%sworks/%s.html" % (root, WORK_PAGES[no])
    return "%sindex.html#e-%s" % (root, no)


def wslug(ent):
    """Stable file name for a work page: the entry number plus a readable tail."""
    base = ent.get("slug") or ent.get("texts") or ent["name"]
    t = unicodedata.normalize("NFKD", base.lower().replace("ı", "i").replace("ğ", "g")
                              .replace("ş", "s").replace("ö", "o").replace("ü", "u").replace("ç", "c"))
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60].strip("-")
    return "%s-%s" % (ent["no"], t) if t else ent["no"]


def imgs(ent):
    """Image links for an entry, self-hosted ones first: they are faster and they
    do not depend on an old Squarespace CDN staying up. Returns (url, credit) pairs."""
    ls = [l for l in (ent.get("links") or []) if l.get("label") == "image"]
    ls = [l for l in ls if not l["url"].startswith("http")] + [l for l in ls if l["url"].startswith("http")]
    return [(l["url"], l.get("credit"), l.get("caption")) for l in ls]


def meta_line(ent):
    bits = [b for b in (ent.get("dates"), ", ".join(ent.get("types") or []), ent.get("place")) if b]
    return " &#183; ".join(E(b) for b in bits)


def href_for(ent, work_pages, text_pages_by_no, root=""):
    if ent["no"] in work_pages:
        return root + "works/%s.html" % work_pages[ent["no"]]
    if ent["no"] in text_pages_by_no:
        return root + text_pages_by_no[ent["no"]]
    return root + "index.html#e-%s" % ent["no"]


def srow(href, year, name, kicker):
    return ('<li><a href="%s"><span class="y">%s</span><span class="n">%s</span>'
            '<span class="k">%s</span></a></li>' % (E(href), E(year), E(name), kicker))


def about_block(entries):
    """What opens under the introduction when More is pressed: the rest of the
    biography in the same large type, then contact, then the CV lists, which are
    generated from the archive. This replaces the old About page."""
    def has(x, *ts):
        return any(t in x["types"] for t in ts)
    bio = ('<p>He studied architecture at Yıldız Technical University in Istanbul and in the Architecture Class of the '
           'Städelschule in Frankfurt am Main. His work combines counter-mapping, critical cartography, installation, video '
           'and research, with a long engagement with water, displacement and territory along the Tigris, including work '
           'with Arazi Assembly alongside people from villages flooded by the Ilısu Dam.</p>'
           '<p>He co-founded the collective Herkes İçin Mimarlık / Architecture for All in 2011, was associate curator of '
           'Vardiya / The Shift, the Pavilion of Türkiye at the 16th International Architecture Exhibition of La Biennale di '
           'Venezia (2018), and worked as a researcher on the ERC project Topological Atlas / Border Topologies (TU Delft and '
           'Goldsmiths) from 2019 to 2022. He chairs the board of TOP e.V., which runs TOP Project Space in Berlin.</p>'
           '<p>Since 2022 he has been a research associate at the Chair of Practices and Politics of Representation, '
           'Faculty of Architecture and Urbanism, Bauhaus-Universität Weimar, where his doctoral research follows the '
           'spatial and visual regimes of the Ilısu Dam, the flooding of Hasankeyf and displacement in the Tigris basin.</p>')
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
            lis.append('<li><span class="d">%s</span><span><a href="%s">%s</a>%s</span></li>'
                       % (E(x["dates"]), entry_href(x["no"]), E(x["name"]), (", " + extra) if extra else ""))
        secs.append('<section class="cv"><h2>%s <span class="n">%d</span></h2><ul>%s</ul></section>'
                    % (title, len(items), "".join(lis)))
    portrait = ""
    if os.path.exists(os.path.join(HERE, "img", "portrait", "yelta-kom.jpg")):
        portrait = ('<figure class="portrait"><img src="img/portrait/yelta-kom.jpg" '
                    'alt="Yelta K&#246;m" loading="lazy"></figure>')
    return (portrait + '<div class="intro more">%s</div>\n'
            '<p class="contact" id="contact-about">Contact: %s<br>Represented by Versus Art Project, Istanbul<br>'
            'Exhibition design and scenography: <a href="https://noframe.studio">Studio No Frame &#8599;</a></p>\n'
            '<div class="cvwrap">%s</div>' % (bio, EMAIL, "\n".join(secs)))


def write_index(entries, work_pages, text_pages_by_no):
    intro = ('<section class="about" aria-label="About">\n<div class="intro"><p>Yelta K&#246;m is an artist working through '
             'spatial practices, trained as an architect and based in Berlin. His work moves between counter-mapping, '
             'critical cartography, installation and research, much of it on water and territory along the Tigris. '
             '<button type="button" id="more" class="plain" aria-expanded="false" aria-controls="morebox">More</button></p></div>\n'
             '<div id="morebox" hidden>\n%s\n</div>\n</section>\n' % about_block(entries))
    shell = ('<div id="archive"></div>\n'
             '<noscript><p>The archive table needs JavaScript.</p></noscript>')
    open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(
        page("Yelta Köm · Archive", intro + shell, current="All", cls="home", view=True,
             scripts='<script src="%s"></script>\n<script src="%s"></script>\n'
                     % (ver("data.js"), ver("app.js"))))


IMG_FALLBACK = ('<script>document.addEventListener("error",function(e){'
                'var t=e.target;if(t&&t.tagName==="IMG"){var f=t.closest("figure");'
                'if(f&&f.parentNode)f.parentNode.removeChild(f);}},true);</script>\n')
THEAD = ('<div class="thead" aria-hidden="true"><span class="c-no">No.</span><span class="c-date">Date/s</span>'
         '<span class="c-name">Name</span><span class="c-type">Type/s</span><span class="c-for">For</span>'
         '<span class="c-with">With</span></div>')


def write_work(ent, slug, text_href, press_for):
    """A work's page reads as its row in the archive, opened: the bar and the
    column header stay frozen on top, the row is the caption, and the pictures
    follow underneath."""
    def cap(credit, caption):
        bits = [E(caption)] if caption else []
        if credit:
            # "Courtesy X" is already a complete credit line; a name is not
            lead = "" if re.match(r"(?i)^(courtesy|©)", credit) else "Photograph: "
            bits.append(lead + E(credit))
        return ("<figcaption>%s</figcaption>" % ". ".join(bits)) if bits else ""
    # work pages live in works/, so site-relative image paths need one level up
    figs = "".join('<figure class="shot"><img src="%s" alt="%s" loading="lazy">%s</figure>'
                   % (E(u if u.startswith("http") else "../" + u), E(cp or ""), cap(c, cp))
                   for u, c, cp in imgs(ent))
    row = ('<div class="row"><span class="c-no">%s</span><span class="c-date">%s</span>'
           '<h1 class="c-name">%s</h1><span class="c-type">%s</span><span class="c-for">%s</span>'
           '<span class="c-with">%s</span></div>'
           % (E(ent["no"]), E(ent.get("dates") or ""), E(ent["name"]), E(", ".join(ent.get("types") or [])),
              E(ent.get("for") or ""), E(", ".join(ent.get("with") or []))))
    rows = []
    status = ent.get("status")
    for label, val in (("About", ent.get("description")),
                       ("Status", status.capitalize() if status and status != "realised" else None),
                       ("Place", ent.get("place")), ("Role", ent.get("role"))):
        if val:
            rows.append("<dt>%s</dt><dd>%s</dd>" % (E(label), E(val)))
    shown = ent.get("shown") or []
    if shown:
        lis = "".join('<li><span class="d">%s</span><span>%s%s</span></li>'
                      % (E(sh.get("dates") or ""),
                         E(", ".join(b for b in (sh.get("exhibition_title"), sh.get("venue"), sh.get("city")) if b)),
                         (", curated by " + E(sh["curator"])) if sh.get("curator") else "")
                      for sh in shown)
        rows.append('<dt>Shown</dt><dd><ul class="shown">%s</ul></dd>' % lis)
    other = [l for l in (ent.get("links") or []) if l.get("label") != "image"]
    if other:
        rows.append("<dt>Links</dt><dd>%s</dd>" % "<br>".join(
            '<a href="%s">%s &#8599;</a>' % (E(l["url"]), E((l.get("label") or host(l["url"])).capitalize()))
            for l in other))
    read = '<p class="read"><a href="../%s">Read the text</a></p>' % E(text_href) if text_href else ""
    pr = ""
    if press_for:
        items = "".join(
            '<li><span class="y">%s</span><span class="n">%s</span><span class="k">%s</span></li>'
            % (E((p.get("date") or "")[:10]),
               ('<a href="%s">%s &#8599;</a>' % (E(p["url"]), E(p.get("title") or p["url"])))
               if p.get("url") else E(p.get("title") or ""), E(p.get("outlet") or ""))
            for p in press_for)
        pr = '<section class="pressfor"><h2 class="rule">Press</h2><ul class="slist">%s</ul></section>' % items
    body = ('<article class="filepage listview">\n%s\n<div class="entry open">%s\n'
            '<div class="detail"><div class="dgrid"><dl>%s</dl>%s</div></div></div>\n'
            '<div class="shots">%s\n%s</div>\n</article>'
            % (THEAD, row, "".join(rows), read, figs, pr))
    open(os.path.join(HERE, "works", "%s.html" % slug), "w", encoding="utf-8").write(
        page("%s · Yelta Köm" % ent["name"], body, root="../", current="Works", cls="workpage",
             scripts=IMG_FALLBACK))


def write_search(entries, press, texts, work_pages, text_pages_by_no):
    docs = []
    for e in entries:
        docs.append({"k": "entry", "t": e["name"],
                     "h": href_for(e, work_pages, text_pages_by_no),
                     "m": " ".join(str(x) for x in [e.get("dates"), ", ".join(e.get("types") or []),
                                                    e.get("for"), ", ".join(e.get("with") or []),
                                                    e.get("place")] if x),
                     "b": e.get("description") or ""})
    for p in press:
        docs.append({"k": "press", "t": p.get("title") or "",
                     "h": p.get("url") or "press.html",
                     "m": " ".join(str(x) for x in [p.get("outlet"), p.get("date"), p.get("kind")] if x),
                     "b": p.get("summary") or ""})
    for slug, title, lang, body in texts:
        clean = re.sub(r"https?://\S+", " ", body)
        clean = re.sub(r"[#*`>\[\]()!|_-]+", " ", clean)
        docs.append({"k": "text", "t": title, "h": "texts/%s.html" % slug,
                     "m": "Full text, %s" % LANGS.get(lang, lang),
                     "b": re.sub(r"\s+", " ", clean).strip()[:24000]})
    with open(os.path.join(HERE, "searchdata.js"), "w", encoding="utf-8") as fh:
        fh.write("/* Generated by build.py. Full text index for the site search. */\n")
        fh.write("const SEARCHDOCS = ")
        json.dump(docs, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    body = ('<h1 class="pagehead">Search</h1>\n'
            '<p class="lede">Works, texts, talks, press, and the full text of every piece of writing.</p>\n'
            '<form class="bigsearch" role="search" onsubmit="return false">'
            '<label for="bq" class="vh">Search</label>'
            '<input id="bq" type="search" placeholder="Search the archive" autocomplete="off" autofocus></form>\n'
            '<p id="scount" class="lede" aria-live="polite"></p>\n<div id="sres"></div>')
    open(os.path.join(HERE, "search.html"), "w", encoding="utf-8").write(
        page("Search · Yelta Köm", body, current="", search=False,
             scripts='<script src="%s"></script>\n<script src="%s"></script>\n'
                     % (ver("searchdata.js"), ver("search.js"))))


def write_press(press, names):
    rows = []
    for p in press:
        rel = ('<a href="%s">%s %s</a>' % (entry_href(p["about"]), p["about"], E(names.get(p["about"], ""))) if p.get("about") else "")
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


if __name__ == "__main__":
    main()
