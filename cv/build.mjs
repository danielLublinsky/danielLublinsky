#!/usr/bin/env node
/*
 * CV builder — cv.json  ->  cv.html  ->  PDF (headless Chromium)
 *
 *   node cv/build.mjs                 # build HTML + PDF to mySite/daniel_lublinsky_cv.pdf
 *   node cv/build.mjs --html          # HTML only (fast, for previewing in a browser)
 *   node cv/build.mjs --watch         # rebuild on every save of cv.json / build.mjs
 *   node cv/build.mjs --out other.pdf # write the PDF somewhere else
 *
 * Content lives in cv.json. Layout and styling live in the CSS block below.
 */
import { readFileSync, writeFileSync, watch, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt  = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const DATA_FILE = resolve(HERE, opt('--data', 'cv.json'));
const HTML_FILE = resolve(HERE, 'cv.html');
const PDF_FILE  = resolve(ROOT, opt('--out', 'mySite/daniel_lublinsky_cv.pdf'));

/* ─────────────────────────── helpers ─────────────────────────── */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// inline markup allowed inside content strings: **bold**, *italic*, `code`
const rich = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
  .replace(/`(.+?)`/g, '<code>$1</code>');

const bullets = (list = []) =>
  list.length ? `<ul class="bullets">${list.map((b) => `<li>${rich(b)}</li>`).join('')}</ul>` : '';

/* ─────────────────────────── styles ─────────────────────────── */

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --accent:  #2a5cff;
  --text:    #15171c;
  --muted:   #6b7280;
  --faint:   #9aa1ad;
  --rule:    #dfe3ea;
  --page-x:  14mm;
  --page-y:  9.5mm;
}

@page { size: A4; margin: 0; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  font-family: "Segoe UI", "Inter", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 8.4pt;
  line-height: 1.4;
  color: var(--text);
  background: #fff;
}

.page { width: 210mm; min-height: 297mm; padding: var(--page-y) var(--page-x); margin: 0 auto; background: #fff; }

/* ── header ── */
.contact-bar {
  display: flex; flex-wrap: wrap; gap: 0 1.5rem; justify-content: space-between;
  font-size: 7.6pt; color: var(--muted); letter-spacing: .012em;
  padding-bottom: .55rem; border-bottom: 1px solid var(--rule);
}
.contact-bar span { white-space: nowrap; }

.identity { margin: .9rem 0 .8rem; }
.name { font-size: 23.5pt; font-weight: 700; letter-spacing: -.018em; line-height: 1.05; }
.job-title {
  margin-top: .3rem; font-size: 8.4pt; font-weight: 600;
  text-transform: uppercase; letter-spacing: .26em; color: var(--accent);
}

/* ── two-column body ── */
.cols { display: grid; grid-template-columns: 54mm 1fr; gap: 0 10mm; align-items: start; }

.section-label {
  font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .2em;
  color: var(--text); padding-bottom: .3rem; margin-bottom: .75rem;
  border-bottom: 2px solid var(--accent);
}
.block + .block { margin-top: .9rem; }

/* ── skills (left rail) ── */
.skill-group + .skill-group { margin-top: .7rem; }
.skill-group-name { font-size: 8.4pt; font-weight: 700; color: var(--accent); margin-bottom: .18rem; }
.skill-list { list-style: none; font-size: 8.5pt; color: #3b4047; }
.skill-list li { line-height: 1.45; }

/* ── experience ── */
.exp { break-inside: avoid; }
.exp + .exp { margin-top: .78rem; padding-top: .78rem; border-top: 1px solid var(--rule); }
.exp-line1 { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
.exp-company { font-size: 9.8pt; font-weight: 700; }
.exp-dates { font-size: 7.8pt; color: var(--muted); white-space: nowrap; }
.exp-meta { font-size: 8.2pt; color: var(--muted); margin-top: .08rem; }

/* nested roles under one employer */
.roles { margin-top: .5rem; padding-left: .85rem; }
.role { position: relative; }
.role + .role { margin-top: .5rem; }
.role::before {
  content: ''; position: absolute; left: -.85rem; top: 3.8pt;
  width: 4.6pt; height: 4.6pt; border-radius: 50%; box-sizing: border-box;
  background: #fff; border: 1.3pt solid var(--accent);
}
/* hairline connector, drawn dot-to-dot so it stops at the last role */
.role::after {
  content: ''; position: absolute;
  left: calc(-.85rem + 2.07pt); width: .45pt;
  top: 8.4pt; bottom: calc(-.6rem - 3.8pt);
  background: rgba(42,92,255,.3);
}
.role:last-child::after { display: none; }
.role-line { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
.role-title { font-size: 8.9pt; font-weight: 650; }
.role-dates { font-size: 7.6pt; color: var(--faint); white-space: nowrap; }

.bullets { list-style: none; margin-top: .3rem; }
.bullets li { position: relative; padding-left: .72rem; margin-bottom: .1rem; color: #3b4047; }
.bullets li::before { content: '•'; position: absolute; left: 0; color: var(--accent); }

/* ── projects ── */
.project { break-inside: avoid; }
.project + .project { margin-top: .5rem; }
.project-name { font-size: 9pt; font-weight: 700; }
.project-desc { color: #3b4047; margin-top: .12rem; }
.project-link { font-size: 7.4pt; color: var(--accent); overflow-wrap: anywhere; margin-top: .15rem; display: block; }

/* ── education + volunteering (same compact sidebar shape) ── */
.edu, .vol { break-inside: avoid; }
.edu + .edu { margin-top: .62rem; }
.edu-school { font-size: 8.4pt; font-weight: 700; }
.vol-role { font-size: 9pt; font-weight: 700; }
.vol-tag { font-size: 7.8pt; font-weight: 500; color: var(--text); }
.project + .vol, .vol + .vol { margin-top: .5rem; }
.edu-degree { font-size: 8.2pt; color: #3b4047; margin-top: .02rem; }
.vol-org { color: #3b4047; margin-top: .02rem; }
.edu-dates, .vol-field { font-size: 7.4pt; color: var(--faint); margin-top: .06rem; }
.edu-note { font-size: 7.8pt; color: #5b6271; margin-top: .14rem; }
.vol-note { color: #3b4047; margin-top: .12rem; }

/* ── full-width bands below the two columns ── */
.band { margin-top: .75rem; padding-top: .6rem; border-top: 1px solid var(--rule); break-inside: avoid; }

/* ── background ── */
.background { }
.background p { color: #3b4047; margin-top: .35rem; }
.background p:first-of-type { margin-top: .4rem; }

code { font-family: "JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace; font-size: .92em; }

/* on-screen preview only — never affects the PDF */
@media screen {
  body { background: #eef0f4; padding: 24px 0; }
  .page { box-shadow: 0 6px 28px rgba(0,0,0,.14); border-radius: 2px; }
}
`;

/* ─────────────────────────── render ─────────────────────────── */

function renderSkills(skills = []) {
  if (!skills.length) return '';
  return `<div class="block">
    <div class="section-label">Skills</div>
    ${skills.map((g) => `<div class="skill-group">
      <div class="skill-group-name">${rich(g.group)}</div>
      <ul class="skill-list">${(g.items || []).map((i) => `<li>${rich(i)}</li>`).join('')}</ul>
    </div>`).join('')}
  </div>`;
}

function renderExperience(experience = []) {
  if (!experience.length) return '';
  return `<div class="block">
    <div class="section-label">Experience</div>
    ${experience.map((e) => `<div class="exp">
      <div class="exp-line1">
        <div class="exp-company">${rich(e.company)}</div>
        <div class="exp-dates">${rich(e.dates)}</div>
      </div>
      ${e.meta ? `<div class="exp-meta">${rich(e.meta)}</div>` : ''}
      ${bullets(e.bullets)}
      ${(e.roles || []).length ? `<div class="roles">${e.roles.map((r) => `<div class="role">
        <div class="role-line">
          <div class="role-title">${rich(r.title)}</div>
          <div class="role-dates">${rich(r.dates)}</div>
        </div>
        ${bullets(r.bullets)}
      </div>`).join('')}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

function renderProjects(projects = []) {
  return projects.map((p) => `<div class="project">
    <div class="project-name">${rich(p.name)}</div>
    <div class="project-desc">${rich(p.description)}</div>
    ${p.link ? `<a class="project-link" href="${esc(p.link)}">${esc(String(p.link).replace(/^https?:\/\//, ''))}</a>` : ''}
  </div>`).join('');
}

function renderProjectsBand(cv) {
  const body = renderProjects(cv.projects || []) + renderVolunteering(cv.volunteering || []);
  if (!body) return '';
  return `<div class="band">
    <div class="section-label">Projects &amp; Volunteering</div>
    ${body}
  </div>`;
}

function renderEducation(education = []) {
  if (!education.length) return '';
  return `<div class="block">
    <div class="section-label">Education</div>
    ${education.map((e) => `<div class="edu">
      <div class="edu-school">${rich(e.school)}</div>
      ${e.degree ? `<div class="edu-degree">${rich(e.degree)}</div>` : ''}
      ${e.dates ? `<div class="edu-dates">${rich(e.dates)}</div>` : ''}
      ${e.note ? `<div class="edu-note">${rich(e.note)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

function renderVolunteering(volunteering = []) {
  if (!volunteering.length) return '';
  return volunteering.map((v) => `<div class="vol">
      <div class="vol-role">${rich(v.role)}${v.tag ? ` <span class="vol-tag">(${rich(v.tag)})</span>` : ''}</div>
      ${v.org ? `<div class="vol-org">${rich(v.org)}</div>` : ''}
      ${(v.field || v.length) ? `<div class="vol-field">${[v.field, v.length].filter(Boolean).map(rich).join(' &bull; ')}</div>` : ''}
      ${v.note ? `<div class="vol-note">${rich(v.note)}</div>` : ''}
    </div>`).join('');
}

function renderHTML(cv) {
  const c = cv.contact || {};
  const contactBits = [c.location, c.phone, c.email, c.github, c.linkedin].filter(Boolean);
  const bgParagraphs = String(cv.background || '').split('\n').filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(cv.name)} — CV</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

  <div class="contact-bar">${contactBits.map((b) => `<span>${esc(b)}</span>`).join('')}</div>

  <div class="identity">
    <div class="name">${esc(cv.name)}</div>
    <div class="job-title">${esc(cv.title)}</div>
  </div>

  <div class="cols">
    <aside>
      ${renderSkills(cv.skills)}
      ${renderEducation(cv.education)}
    </aside>
    <main>${renderExperience(cv.experience)}</main>
  </div>

  ${renderProjectsBand(cv)}

  ${bgParagraphs.length ? `<div class="band background">
    <div class="section-label">Background</div>
    ${bgParagraphs.map((p) => `<p>${rich(p)}</p>`).join('')}
  </div>` : ''}

</div>
</body>
</html>`;
}

/* ─────────────────────────── chromium ─────────────────────────── */

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN, 'chromium', 'chromium-browser', 'google-chrome-stable',
  'google-chrome', 'brave', 'microsoft-edge',
].filter(Boolean);

function findChrome() {
  for (const bin of CHROME_CANDIDATES) {
    const r = spawnSync('/bin/sh', ['-c', `command -v "$1"`, 'sh', bin], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split('\n')[0];
  }
  return null;
}

function toPDF() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('✗ No Chromium/Chrome found. Install one, or set CHROME_BIN=/path/to/browser.');
    console.error('  The HTML is still written — you can print it to PDF from any browser (Ctrl+P).');
    return false;
  }
  const r = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF_FILE}`,
    `file://${HTML_FILE}`,
  ], { encoding: 'utf8' });

  if (r.status !== 0 || !existsSync(PDF_FILE)) {
    console.error('✗ Chromium failed to render the PDF:');
    console.error((r.stderr || r.stdout || '(no output)').trim().split('\n').slice(-8).join('\n'));
    return false;
  }
  return true;
}

/* ─────────────────────────── main ─────────────────────────── */

function build() {
  const cv = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  writeFileSync(HTML_FILE, renderHTML(cv));
  console.log(`✓ ${HTML_FILE.replace(ROOT + '/', '')}`);
  if (flag('--html')) return;
  if (toPDF()) console.log(`✓ ${PDF_FILE.replace(ROOT + '/', '')}`);
}

build();

if (flag('--watch')) {
  console.log('watching cv.json and build.mjs — Ctrl+C to stop');
  let pending = null;
  for (const f of [DATA_FILE, fileURLToPath(import.meta.url)]) {
    watch(f, () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        try { build(); } catch (e) { console.error('✗ ' + e.message); }
      }, 120);
    });
  }
}
