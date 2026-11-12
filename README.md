# yeltakom.info

Hand-coded static archive site. No framework, no build step needed to view: open `index.html` directly from disk (file://) or upload the folder to any web host.

## Files

| File | Made by | What it is |
|---|---|---|
| `index.html` | build.py | Intro paragraph, filters, archive table and image view |
| `about.html` | build.py | Bio, contact, CV lists generated from the archive |
| `press.html` | build.py | Press list, newest first, linked to the works |
| `texts/<slug>.html` | build.py | One page per full text, original and English side by side |
| `data.js` | build.py | The archive as a JS constant `ARCHIVE` (works offline, no fetch) |
| `build.log` | build.py | Counts and any unmatched or skipped text files |
| `app.js` | by hand | Filtering, search, list/image toggle, expanding rows, hash routes |
| `text.js` | by hand | Language switch on text pages |
| `style.css` | by hand | All styling (signal colour and font are set at the top) |
| `build.py` | by hand | Regenerates everything marked "build.py" above |

Hash routes on the index: `#texts`, `#talks`, `#works`, `#workshops`, `#networks`, and `#e-1807` to open one entry.

## Regenerate

```
python3 build.py                      # reads ../archive/archive.json and ../archive/texts/*.md
python3 build.py /path/to/archive     # or point it at another archive folder
```

## Add an entry

1. Add an object to `entries` in `archive/archive.json` with at least `no` (4 digits, YYNN), `dates`, `name`, `types`, `section` (`work`, `text`, `talk`, `workshop`, `network`, `residency-award`). Optional: `for`, `with`, `place`, `role`, `status`, `description`, `links` (`{"label": "original" | "image" | "recording" | ..., "url": ...}`), `shown`.
2. Run `python3 build.py`. Do not edit `data.js` by hand unless you only need a quick fix; the next build overwrites it.

Images are hotlinked from their `image` link URLs. Anything in `excluded` is never shown.

## Add a text

1. Put the markdown in `archive/texts/<slug>.<lang>.md` with front matter (`title`, `lang`, `date`, `source`; add `translation: AI translation from Turkish, not reviewed by the author` on machine translations). Original and translation share the same `<slug>`.
2. The slug must equal the entry's `texts` or `slug` field (or the title must match the entry name). Unmatched files are listed in `build.log`.
3. Run `python3 build.py`. The entry gets a "Read the text" link.
