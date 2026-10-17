# CV generator

`cv.json` → `cv.html` → `daniel_lublinsky_cv.pdf`. No dependencies — just Node and a Chromium-based
browser (both already on this machine).

## Build

```bash
node cv/build.mjs            # writes cv/cv.html and mySite/daniel_lublinsky_cv.pdf
node cv/build.mjs --watch    # rebuild on every save — leave running while editing
node cv/build.mjs --html     # HTML only, skips the PDF step (fast preview)
```

Preview the HTML in a browser (`xdg-open cv/cv.html`) — it renders exactly as it prints,
with a page-shadow added on screen only.

Options:

| flag | meaning |
|---|---|
| `--out <path>` | PDF destination, relative to the repo root. Default `mySite/daniel_lublinsky_cv.pdf` |
| `--data <file>` | content file, relative to `cv/`. Default `cv.json` — use this to keep role-specific variants |
| `--html` | skip the PDF render |
| `--watch` | rebuild on changes to `cv.json` / `build.mjs` |

`CHROME_BIN=/path/to/browser` overrides browser detection. If no browser is found the HTML
is still written, so you can print to PDF manually with Ctrl+P.

## Editing content

Everything the CV says lives in `cv.json` — never edit `cv.html`, it is overwritten on
every build.

An experience entry is either **flat**:

```json
{
  "company": "IAF Flight Test Center",
  "dates": "Dec 2023 - Oct 2026 (2 yrs 11 mos)",
  "meta": "Lead Software Engineer • Israeli Air Force",
  "bullets": ["...", "..."]
}
```

…or **nested**, when one employer covers several titles (this is how Contiki renders its
two roles on a shared timeline rail):

```json
{
  "company": "Contiki I.T",
  "dates": "Sep 2022 - present (4 yrs 2 mos)",
  "meta": "Full-time • Remote",
  "roles": [
    { "title": "Lead AI Engineer", "dates": "Aug 2025 - present", "bullets": ["..."] },
    { "title": ".NET Engineer",    "dates": "Sep 2022 - present", "bullets": ["..."] }
  ]
}
```

Both keys may coexist: `bullets` on the entry render above the nested `roles`.

`background` splits on newlines into paragraphs. Inside any text field you can use
`**bold**`, `*italic*` and `` `code` ``.

## Editing the design

The entire stylesheet is the `CSS` template literal near the top of `build.mjs`, and the
markup is the `render*` functions below it. Page geometry is the `@page` rule plus
`--page-x` / `--page-y`; the sidebar width is the first track of `.cols`.

Keep it to one page: if content overflows, nudge `body { font-size }` down a notch or
trim a bullet. `pdfinfo mySite/daniel_lublinsky_cv.pdf` reports the page count.

## Tailoring for an application

```bash
cp cv/cv.json cv/cv.backend-role.json      # edit the copy
node cv/build.mjs --data cv.backend-role.json --out ~/Desktop/daniel-cv-backend.pdf
```

That leaves `mySite/daniel_lublinsky_cv.pdf` — the copy the site links from — untouched.
