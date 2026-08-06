#!/usr/bin/env node
// Generates mySite/stats.json at build time.
// The token stays in CI — the deployed page only ever sees the JSON output.
// Requires GITHUB_TOKEN env var with `repo` scope (private repos + private contributions).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.GITHUB_TOKEN;
const LOGIN = 'danielLublinsky';
const OUT = fileURLToPath(new URL('../../mySite/stats.json', import.meta.url));

// Markup / prose / build-glue languages excluded from the "Languages" chart.
const EXCLUDED_LANGS = new Set(['HTML', 'CSS', 'SCSS', 'TeX', 'Makefile', 'CMake', 'Dockerfile', 'Batchfile', 'Rich Text Format', 'Visual Basic .NET', 'C#']);
const TOP_LANGS = 7;

if (!TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

async function gql(query) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL errors: ' + JSON.stringify(json.errors));
  return json.data;
}

/* ── Main query: profile, repos (incl. private), per-repo language bytes, trailing-year calendar ── */
const main = await gql(`{
  user(login: "${LOGIN}") {
    createdAt
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, first: 100) {
      totalCount
      nodes {
        isPrivate
        isFork
        stargazerCount
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date color } }
      }
    }
  }
}`);

const user = main.user;
const repos = user.repositories.nodes;

/* ── Lifetime commit/issue totals: one aliased contributionsCollection per year since joining ── */
const joinYear = new Date(user.createdAt).getUTCFullYear();
const nowYear = new Date().getUTCFullYear();
const yearFields = [];
for (let y = joinYear; y <= nowYear; y++) {
  const from = y === joinYear ? user.createdAt : `${y}-01-01T00:00:00Z`;
  const to = y === nowYear ? new Date().toISOString() : `${y}-12-31T23:59:59Z`;
  yearFields.push(`y${y}: user(login: "${LOGIN}") {
    contributionsCollection(from: "${from}", to: "${to}") {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      restrictedContributionsCount
    }
  }`);
}
const years = await gql(`{ ${yearFields.join('\n')} }`);

let commits = 0, issues = 0, pullRequests = 0;
for (const y of Object.values(years)) {
  const cc = y.contributionsCollection;
  // restrictedContributionsCount is 0 when the token can see everything (repo scope, own account);
  // added defensively so a narrower token still yields a sane total.
  commits += cc.totalCommitContributions + cc.restrictedContributionsCount;
  issues += cc.totalIssueContributions;
  pullRequests += cc.totalPullRequestContributions;
}

/* ── Byte-weighted language totals across all owned non-fork repos ── */
const langBytes = {};
for (const r of repos) {
  if (r.isFork) continue;
  for (const e of r.languages.edges) {
    if (EXCLUDED_LANGS.has(e.node.name)) continue;
    langBytes[e.node.name] = (langBytes[e.node.name] || 0) + e.size;
  }
}
const langTotal = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
const languages = Object.entries(langBytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_LANGS)
  .map(([name, bytes]) => ({ name, bytes, pct: Math.round((bytes / langTotal) * 1000) / 10 }));

const stats = {
  generatedAt: new Date().toISOString(),
  joinDate: user.createdAt,
  followers: user.followers.totalCount,
  repos: {
    total: user.repositories.totalCount,
    private: repos.filter(r => r.isPrivate).length,
  },
  stars: repos.reduce((s, r) => s + r.stargazerCount, 0),
  commits,
  issues,
  pullRequests,
  calendar: {
    total: user.contributionsCollection.contributionCalendar.totalContributions,
    weeks: user.contributionsCollection.contributionCalendar.weeks,
  },
  languages,
};

writeFileSync(OUT, JSON.stringify(stats));
console.log(`Wrote ${OUT}`);
console.log(`  repos: ${stats.repos.total} (${stats.repos.private} private) | stars: ${stats.stars} | commits: ${commits} | issues: ${issues} | PRs: ${pullRequests}`);
console.log(`  languages: ${languages.map(l => `${l.name} ${l.pct}%`).join(', ')}`);
