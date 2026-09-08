// Re-verify the Canvas capability snapshot against a live instance.
//
//   node scripts/verify-canvas.js [instance]
//
// The API ground truth in docs/ was originally built by reading
// docs.canvasmedical.com, which is a description of Canvas in general rather
// than of the instance we integrate with. 142 planned changes now depend on
// that matrix, so it is pinned to a snapshot of the real thing and this script
// re-checks it. The CapabilityStatement is served unauthenticated, so this
// needs no credentials.
//
// Exit code is non-zero if the instance has drifted from the snapshot, so this
// can gate a release.

const fs = require('fs');
const path = require('path');
const https = require('https');

const INSTANCE = process.argv[2] || 'aleronmd-dev';
const URL = `https://fumage-${INSTANCE}.canvasmedical.com/metadata`;
const SNAP = path.join(__dirname, '..', 'docs', 'canvas-capability-snapshot.json');

const get = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error('timed out'));
      });
  });

// Absences that carry design weight. Each one is a finding in the audit, so a
// resource quietly appearing is as interesting as one disappearing: it would
// reopen a decision. RiskAssessment is the resource this data actually wants.
const LOAD_BEARING_ABSENCES = [
  'RiskAssessment',
  'FamilyMemberHistory',
  'AuditEvent',
  'Subscription',
];

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const live = JSON.parse(await get(URL));
  const resources = {};
  const searchParams = {};
  const operations = [];
  for (const r of live.rest[0].resource) {
    resources[r.type] = [...new Set((r.interaction || []).map((i) => i.code))].sort();
    if (r.searchParam) searchParams[r.type] = r.searchParam.map((s) => s.name).sort();
    for (const op of r.operation || []) operations.push(`${r.type}/$${op.name}`);
  }

  const problems = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  for (const [type, ops] of Object.entries(snap.resources)) {
    if (!resources[type]) problems.push(`${type}: gone from the instance`);
    else if (!eq(ops, resources[type])) {
      problems.push(`${type}: was [${ops}] now [${resources[type]}]`);
    }
  }
  for (const type of Object.keys(resources)) {
    if (!snap.resources[type]) problems.push(`${type}: NEW on the instance`);
  }
  for (const name of LOAD_BEARING_ABSENCES) {
    if (resources[name]) {
      problems.push(`${name} now EXISTS — this reopens a design decision, see docs/API-IMPLEMENTATION-AUDIT.md`);
    }
  }
  for (const [type, params] of Object.entries(snap.search_params || {})) {
    if (searchParams[type] && !eq(params, searchParams[type])) {
      problems.push(`${type} searchParams: was [${params}] now [${searchParams[type]}]`);
    }
  }
  if (!eq(snap.operations.sort(), operations.sort())) {
    problems.push(`operations: was [${snap.operations}] now [${operations}]`);
  }
  if (snap.fhirVersion !== live.fhirVersion) {
    problems.push(`fhirVersion: was ${snap.fhirVersion} now ${live.fhirVersion}`);
  }

  console.log(`${INSTANCE}: ${Object.keys(resources).length} resources, FHIR ${live.fhirVersion}`);
  console.log(`snapshot taken ${snap.capability_statement_date}, instance reports ${live.date}`);
  if (!problems.length) {
    console.log('PASS: instance matches the pinned snapshot');
    process.exit(0);
  }
  for (const p of problems) console.log('  ' + p);
  console.log(`\nFAIL: ${problems.length} drift(s). Update docs/canvas-capability-snapshot.json`);
  console.log('and check whether any of them changes a decision in Part 5 of the audit.');
  process.exit(1);
})().catch((e) => {
  console.error('could not verify: ' + e.message);
  process.exit(2);
});
