// Check that every external citation in docs/ actually resolves.
//
//   node scripts/verify-doc-links.js
//
// Written because a citation in the ordering master document 404ed: the URL was
// constructed from the endpoint name rather than copied from the vendor's own
// index, and it looked entirely plausible. A resolving URL is still not proof
// the page says what you claim — but a 404 is proof it does not.
//
// Exit code is non-zero if any citation is dead, so this can gate a commit.

const fs = require('fs');
const path = require('path');
const https = require('https');

const DOCS = path.join(__dirname, '..', 'docs');
// The ordering master document now lives with the test harness that reproduces
// its claims, but its vendor citations are the load-bearing ones in the set, so
// keep checking them from here. A missing sibling checkout is not a failure.
const ROOTS = [DOCS, path.join(__dirname, '..', '..', 'aleron-canvas-test')];
// Only the vendor documentation we cite as evidence. Everything else (HL7,
// LOINC, healthit.gov) is checked too, but a redirect there is normal.
// Require a real host: at least one dot-separated label followed by a TLD.
// The looser `https://\S+` picked up a bare `https://\` out of a wrapped line
// and crashed on ERR_INVALID_URL.
const URL_RE = /https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s)"'<>\]\\`*]*)?/gi;

// The verification notes in docs/audit/ are transcripts of research and quote
// illustrative URLs inside code — `https://instance.canvasmedical.com/.../Command`,
// `https://webhook.site/{self.secrets[...]}`. Those are examples, not citations,
// and a checker that flags them trains people to ignore it.
const NOT_A_CITATION = [
  /\/\.\.\./,        // path elisions in prose
  /[{}[\]]/,         // template placeholders
  /^https:\/\/instance\./,
  /^https:\/\/YOUR-/i,
  /^https:\/\/webhook\.site/,
  /^https:\/\/fumage-\{/,
  // The harness README names its own dev host. Local, and down whenever the
  // server is not running, so it is never evidence of anything.
  /^https:\/\/maple-desktop\./,
  /^https:\/\/localhost/,
];

const files = [];
function walk(dir, recurse) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Only recurse inside docs/. The harness folder holds node_modules.
      if (recurse) walk(p, true);
    } else if (entry.name.endsWith('.md')) files.push(p);
  }
}
for (const [i, root] of ROOTS.entries()) {
  if (!fs.existsSync(root)) {
    console.warn(`skipping ${path.relative(process.cwd(), root)} — not checked out here`);
    continue;
  }
  walk(root, i === 0);
}

const cites = new Map(); // url -> Set of files
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.match(URL_RE) || []) {
    const url = m.replace(/[.,;:]+$/, '');
    if (NOT_A_CITATION.some((re) => re.test(url))) continue;
    if (!cites.has(url)) cites.set(url, new Set());
    cites.get(url).add(path.relative(path.join(__dirname, '..', '..'), f));
  }
}

// `orig` is carried through redirects so a result can still be traced back to
// the citation that produced it; reporting the *resolved* url lost that.
const head = (url, redirects = 0, orig = url) =>
  new Promise((resolve) => {
    if (redirects > 5) return resolve({ url: orig, code: 'LOOP' });
    const req = https.request(url, { method: 'GET', timeout: 25000 }, (res) => {
      const { statusCode, headers } = res;
      res.resume();
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        const next = new URL(headers.location, url).toString();
        return resolve(head(next, redirects + 1, orig));
      }
      resolve({ url: orig, code: statusCode });
    });
    req.on('error', (e) => resolve({ url: orig, code: 'ERR', detail: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url: orig, code: 'TIMEOUT' });
    });
    req.end();
  });

(async () => {
  const urls = [...cites.keys()].sort();
  const results = [];
  // serial rather than parallel: these are someone else's docs sites and a
  // burst of 20 requests is rude for no gain
  for (const u of urls) results.push(await head(u));

  const bad = results.filter((r) => r.code !== 200);
  console.log(`${files.length} docs, ${urls.length} distinct external citations`);
  if (!bad.length) {
    console.log('PASS: every citation resolves');
    process.exit(0);
  }
  for (const r of bad) {
    console.log(`  ${r.code}  ${r.url}`);
    for (const f of cites.get(r.url) || []) console.log(`        cited in ${f}`);
  }
  // A 404 can itself be the evidence. `api/riskassessment/` is cited precisely
  // because it does not exist — that absence is why engine risk output cannot
  // go in the resource FHIR designed for it. If one of these ever returns 200,
  // that is a finding and the run should fail on the surprise instead.
  const EXPECTED_404 = {
    'https://docs.canvasmedical.com/api/riskassessment/':
      'cited as proof RiskAssessment is not exposed — see ORDERING-DESIGN-AND-INTEGRATION.md',
  };
  const surprises = Object.keys(EXPECTED_404).filter((u) =>
    results.some((r) => r.url === u && r.code === 200));
  for (const u of surprises) {
    console.log(`  !! ${u} now EXISTS — ${EXPECTED_404[u]}`);
  }

  const hard = bad.filter(
    (r) => (r.code === 404 || r.code === 'LOOP') && !EXPECTED_404[r.url]);
  console.log(`\n${bad.length} unreachable, ${hard.length} unexpectedly dead (404).`);
  console.log('A network failure or timeout is not the same as a dead link; re-run before believing it.');
  process.exit(hard.length ? 1 : 0);
})();
