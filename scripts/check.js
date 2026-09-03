// Standing checks for the wireframe set. `node scripts/check.js`
//
// Written after a px audit found 81 raw px declarations that months of ad-hoc
// grepping had missed, because the grep being retyped each time only looked for
// hex. A rule that is not in this file is not being enforced, however often it
// is quoted in BRIEF.md.
//
// Exit code is non-zero if anything fails, so this can gate a commit.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const files = ['index.html'];
for (const dir of ['v0', 'v1', 'v2', 'v3']) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.html')) files.push(dir + '/' + f);
}

const problems = [];
const note = (file, rule, detail) => problems.push({ file, rule, detail });

// v0 reproduces the shipped Laravel app, including its design-system
// violations. That is the point of a baseline, so it is exempt from the rules
// that describe the proposal rather than the record.
const isV0 = (f) => f.startsWith('v0/');

for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const i = src.indexOf('<style>');
  const j = src.indexOf('</style>');
  const style = i < 0 ? '' : src.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '');

  // --- raw hex in a screen's own style block -------------------------------
  for (const m of style.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
    note(rel, 'raw-hex', m[0]);
  }

  // --- raw px, minus the exemptions BRIEF.md actually grants ---------------
  // Sanctioned: media-query breakpoints and grid track floors are page
  // scaffold, not product-surface values; SVG geometry and chart annotation
  // are exempt (register O1 grants a 9.5px floor for annotation secondary to a
  // plotted mark); v0 reproduces the app verbatim.
  if (!isV0(rel)) {
    for (const line of style.split('\n')) {
      if (!/[0-9.]+px/.test(line)) continue;
      if (/@media/.test(line)) continue;
      if (/minmax\(|grid-template|flex:\s*\d/.test(line)) continue;
      if (/viewBox|stroke-width|stroke-dasharray|\bd=|fill:\s*var|font-size:\s*(9\.5|10\.5)px/.test(line)) continue;
      // SVG-only helpers carry their geometry in px by design. The token can
      // sit anywhere in the class (.pd-spark) and the rule can be a descendant
      // selector (.ax-legend svg); the earlier pattern required the token to
      // start the class and the brace to follow it directly, so it missed both
      // and three real SVG boxes were being reported as violations.
      if (/\.[a-z-]*(spark|chart|axis|plot|rs-|vm-|ax-)[a-z-]*(\s+[a-z]+)?\s*\{/.test(line)) continue;
      note(rel, 'raw-px', line.trim().slice(0, 78));
    }
  }

  // --- em dash outside the title -------------------------------------------
  for (const line of src.split('\n')) {
    if (line.includes('—') && !line.includes('<title>')) {
      note(rel, 'em-dash', line.trim().slice(0, 78));
    }
  }

  // --- audit face on a product surface (P4) --------------------------------
  if (!isV0(rel)) {
    const audits = (src.match(/var\(--audit\)/g) || []).length;
    // the rail wordmark tag is the one sanctioned survivor
    if (audits > 0) note(rel, 'audit-face', audits + ' use(s) of var(--audit)');
  }

  // --- one elevated card per screen (P8) -----------------------------------
  const tier1 = (src.match(/pmod--tier1/g) || []).length;
  if (tier1 > 1) note(rel, 'multiple-tier1', tier1 + ' elevated cards');

  // --- canonical components must not be restyled ---------------------------
  if (!isV0(rel)) {
    for (const m of style.matchAll(/^[^\n{]*\.amd-[a-z_-]+[^\n{]*\{[^}]*(font-size|color:|background)[^}]*\}/gm)) {
      note(rel, 'canonical-restyle', m[0].replace(/\s+/g, ' ').slice(0, 78));
    }
  }
}

// --- no API mechanics on the product surface --------------------------------
// v3 rendered "verificationStatus is not writable, and Canvas carries only
// confirmed, provisional and entered in error" as a labelled data axis in a
// patient's problem accordion. It read as clinical data because it sat in a row
// of clinical data, which is how implementation detail survives a review: not
// by looking like an argument, but by dressing as a field. A physician acts on
// none of it. The annotation list is exempt, because that is where the
// engineering fact is supposed to live.
const API_MECHANICS = [
  /verificationStatus/, /clinicalStatus/, /\bcategory:\s*[a-z-]+/,
  /entered[- ]in[- ]error/, /not writable/, /read and search only/,
  /over the API/, /the API (?:cannot|has no|accepts)/, /FHIR API/,
  /Custom Data Model/, /adapter call/, /service worker/,
  /<code>[a-z]+_[a-z_]+<\/code>/,
];
for (const rel of files) {
  if (isV0(rel) || rel.startsWith('v1/')) continue; // records, annotated not edited
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const a = src.indexOf('<div class="wf-stage">');
  if (a < 0) continue;
  const b = src.indexOf('<div class="wf-annotations">');
  let surface = src.slice(a, b > 0 ? b : src.length)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script>[\s\S]*?<\/script>/g, ' ');
  // anything already marked as scaffolding is reviewer chrome, not product copy
  surface = surface.replace(/<(\w+)[^>]*class="[^"]*(?:wf-scaffold|wf-note)[^"]*"[^>]*>[\s\S]*?<\/\1>/g, ' ');
  for (const re of API_MECHANICS) {
    const m = surface.match(re);
    if (m) note(rel, 'api-on-product-surface', m[0].replace(/\s+/g, ' ').slice(0, 56));
  }
}

// --- Canvas resources named on a screen must exist, and be writable --------
// v2/emr.html listed "Lab Order Authorization" in a column headed "Canvas
// resource" and named it as a thing Aleron writes. No such resource exists,
// and the real one, ServiceRequest, is read and search only. Prose cannot be
// checked, but an invented resource name and a read-only resource in a write
// sentence both can be. Capabilities from docs.canvasmedical.com/api.
const CANVAS_CREATABLE = new Set([
  'AllergyIntolerance', 'Appointment', 'Claim', 'Communication', 'Condition',
  'Consent', 'Coverage', 'CoverageEligibilityRequest', 'DetectedIssue',
  'DocumentReference', 'Group', 'Immunization', 'Media', 'MedicationStatement',
  'Observation', 'Patient', 'PaymentNotice', 'Practitioner',
  'QuestionnaireResponse', 'Task',
]);
const CANVAS_READ_ONLY = new Set([
  'Allergen', 'CarePlan', 'CareTeam', 'CoverageEligibilityResponse', 'Device',
  'DiagnosticReport', 'Encounter', 'Goal', 'Location', 'Medication',
  'MedicationDispense', 'MedicationRequest', 'Organization', 'Procedure',
  'Provenance', 'Questionnaire', 'RelatedPerson', 'Schedule', 'ServiceRequest',
  'Slot', 'Specimen',
]);
// Names the set has invented before, or is likely to.
const NOT_A_RESOURCE = ['Lab Order Authorization', 'LabOrderAuthorization', 'OrderAuthorization'];

for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const body = src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<script>[\s\S]*?<\/script>/g, ' ');
  // the annotation list is allowed to name a bad resource: that is where the
  // finding gets recorded
  const surface = body.slice(0, body.indexOf('wf-annotations') >= 0 ? body.indexOf('wf-annotations') : body.length);
  const text = surface.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  for (const bad of NOT_A_RESOURCE) {
    if (text.includes(bad)) note(rel, 'canvas-invented-resource', bad);
  }
  // A read-only resource inside a sentence that claims a write. Denials are
  // exempt: "ServiceRequest is read only" and "Canvas has no create for it"
  // are the correct things to say, and were being reported as the very error
  // they describe. Found by tripping it while writing an accurate sentence.
  const DENIAL = /\b(no|not|never|cannot|can.t|without|refuses?|lacks?)\b/i;
  for (const m of text.matchAll(/\b(writes?|written|wrote|creates?|created|pushes|pushed|mirrored)\b[^.]{0,80}?\b([A-Z][A-Za-z]{4,})\b/g)) {
    if (!CANVAS_READ_ONLY.has(m[2])) continue;
    const lead = text.slice(Math.max(0, m.index - 44), m.index);
    if (DENIAL.test(lead)) continue;
    note(rel, 'canvas-write-to-read-only', m[2] + ' in: ' + m[0].trim().slice(0, 58));
  }
  // an "update" claim on a resource Canvas can create but never update
  for (const m of text.matchAll(/\b(updates?|updated|amends?|amended|edits?|edited)\b[^.]{0,60}?\b(DocumentReference|Observation)\b/g)) {
    note(rel, 'canvas-update-unsupported', m[0].trim().slice(0, 66));
  }
  void CANVAS_CREATABLE;
}

// --- the version switcher agrees with the file it is on ---------------------
// A switcher that marks the wrong pill still renders, still passes every other
// rule here, and reads as a broken control: v3/care-plan.html marked v2 current
// and linked v3 to itself, so the one pill you could click did nothing and the
// highlight sat on a version you were not looking at.
for (const rel of files) {
  const dir = rel.includes('/') ? rel.split('/')[0] : null;
  if (!dir || rel.endsWith('_flow.html')) continue;
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const i = src.indexOf('<span class="wf-switch">');
  if (i < 0) continue;
  const block = src.slice(i, src.indexOf('</nav>', i));

  const cur = block.match(/<span aria-current="page"[^>]*>\s*(v\d)\s*<\/span>/);
  if (!cur) note(rel, 'switcher-no-current', 'no pill marked aria-current');
  else if (cur[1] !== dir) note(rel, 'switcher-wrong-current', 'marks ' + cur[1] + ', file is in ' + dir);

  for (const m of block.matchAll(/href="([^"]+)"/g)) {
    const target = path.posix.normalize(path.posix.join(dir, m[1]));
    if (target === rel) note(rel, 'switcher-self-link', m[1]);
  }
}

// --- internal links, checked with exact case --------------------------------
// GitHub Pages serves from Linux and is case sensitive; this repo is authored
// on Windows, where fs.existsSync is not. A link whose case does not match its
// file therefore passed here and 404ed once published, which no amount of local
// clicking would surface. So this reads the real directory entries and compares
// names exactly, and reports a case mismatch as its own kind: it is a different
// bug from a link that points at nothing.
const realNames = new Map();
const entries = (dir) => {
  if (!realNames.has(dir)) {
    let set = new Set();
    try { set = new Set(fs.readdirSync(dir)); } catch (e) { /* missing dir */ }
    realNames.set(dir, set);
  }
  return realNames.get(dir);
};

let linkCount = 0;
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of src.matchAll(/(?:href|src)="(?!https?:|#|mailto:|data:)([^"]+)"/g)) {
    linkCount++;
    const target = path.normalize(path.join(ROOT, path.dirname(rel), m[1].split('#')[0].split('?')[0]));
    const names = entries(path.dirname(target));
    const name = path.basename(target);
    if (names.has(name)) continue;
    const twin = [...names].find((n) => n.toLowerCase() === name.toLowerCase());
    if (twin) note(rel, 'link-case-mismatch', m[1] + ' -> on disk it is ' + twin);
    else note(rel, 'broken-link', m[1]);
  }
}

// --- GitHub Pages traps are standing rules, because Pages is the target -----
// Pages ran the legacy Jekyll build here, and Jekyll drops any path whose name
// starts with an underscore. All four flow maps are _flow.html, so all four
// returned 404 on the published site while every screen linking to them
// returned 200. Verified live against the URL before the fix.
if (!fs.existsSync(path.join(ROOT, '.nojekyll'))) {
  const underscored = files.filter((f) => path.basename(f).startsWith('_'));
  note('.nojekyll', 'pages-jekyll-would-drop-files',
    'missing, and ' + underscored.length + ' file(s) start with an underscore');
}

// --- the shared stylesheet parses -------------------------------------------
const chrome = fs.readFileSync(path.join(ROOT, 'physician-chrome.css'), 'utf8');
const stripped = chrome.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
let depth = 0;
for (const ch of stripped) { if (ch === '{') depth++; if (ch === '}') depth--; }
if (depth !== 0) note('physician-chrome.css', 'unbalanced-braces', String(depth));
if (/\*\/|\/\*/.test(stripped)) note('physician-chrome.css', 'stray-comment-marker', '');

// --- report -----------------------------------------------------------------
const byRule = {};
for (const p of problems) (byRule[p.rule] = byRule[p.rule] || []).push(p);

console.log(files.length + ' screens, ' + linkCount + ' internal links');
if (!problems.length) {
  console.log('PASS: no violations');
  process.exit(0);
}
for (const [rule, list] of Object.entries(byRule).sort((a, b) => b[1].length - a[1].length)) {
  console.log('\n' + rule + ' (' + list.length + ')');
  for (const p of list.slice(0, 10)) console.log('  ' + p.file + '  ' + p.detail);
  if (list.length > 10) console.log('  ... and ' + (list.length - 10) + ' more');
}
console.log('\nFAIL: ' + problems.length + ' violation(s)');
process.exit(1);
